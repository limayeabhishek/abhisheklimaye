import React, { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';

const Header = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const { isActiveUser, isAdmin, profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const toggleMenu = () => setMenuOpen((prev) => !prev);
  const closeMenu = () => setMenuOpen(false);

  const handleSectionClick = (e, sectionId) => {
    closeMenu();
    if (location.pathname === '/') {
      e.preventDefault();
      const target = document.getElementById(sectionId);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  const handleLogout = async () => {
    closeMenu();
    await signOut();
    navigate('/');
  };

  return (
    <header className="header">
      <div className="header-brand">
        <NavLink to="/" onClick={closeMenu} className="brand-name">
          ABHISHEK LIMAYE
        </NavLink>
        <span className="brand-sep">|</span>
        <NavLink to="/ultron" onClick={closeMenu} className="brand-autron">
          A-Ultron
        </NavLink>
      </div>

      <div
        className={`menu-toggle ${menuOpen ? 'active' : ''}`}
        onClick={toggleMenu}
        aria-label="Toggle Navigation"
      >
        <div className="bar"></div>
        <div className="bar"></div>
        <div className="bar"></div>
      </div>

      <nav className={`header-nav ${menuOpen ? 'active' : ''}`}>
        <NavLink to="/#about" onClick={(e) => handleSectionClick(e, 'about')}>
          About
        </NavLink>
        <NavLink to="/#toolkit" onClick={(e) => handleSectionClick(e, 'toolkit')}>
          Toolkit
        </NavLink>
        <NavLink to="/#gamezone" onClick={(e) => handleSectionClick(e, 'gamezone')}>
          Gamezone
        </NavLink>
        <NavLink to="/#projects" onClick={(e) => handleSectionClick(e, 'projects')}>
          Projects
        </NavLink>
        <NavLink to="/#thoughts" onClick={(e) => handleSectionClick(e, 'thoughts')}>
          My Thoughts
        </NavLink>
        <NavLink to="/#contact" onClick={(e) => handleSectionClick(e, 'contact')}>
          Contact
        </NavLink>

        <span className="nav-auth-divider" aria-hidden="true">|</span>

        {!isActiveUser ? (
          <NavLink to="/login" onClick={closeMenu} className="nav-auth-link">
            Login
          </NavLink>
        ) : (
          <div className="nav-auth-controls">
            {isAdmin ? (
              <NavLink to="/admin" onClick={closeMenu} className="nav-auth-link">
                Admin
              </NavLink>
            ) : (
              <span className="nav-user-badge" title={profile?.email || ''}>
                {profile?.display_name || 'Operator'}
              </span>
            )}
            <button type="button" onClick={handleLogout} className="nav-logout-btn">
              Logout
            </button>
          </div>
        )}
      </nav>
    </header>
  );
};

export default Header;
