import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';

const Header = () => {
  const [menuOpen, setMenuOpen] = useState(false);

  const toggleMenu = () => {
    setMenuOpen(!menuOpen);
  };

  const closeMenu = () => {
    setMenuOpen(false);
  };

  return (
    <header className="header">
      <div className="header-name">
        <NavLink to="/" onClick={closeMenu}>ABHISHEK DEVENDRA LIMAYE</NavLink>
      </div>
      <div className={`menu-toggle ${menuOpen ? 'active' : ''}`} onClick={toggleMenu}>
        <div className="bar"></div>
        <div className="bar"></div>
        <div className="bar"></div>
      </div>
      <nav className={`header-nav ${menuOpen ? 'active' : ''}`}>
        <NavLink to="/about" onClick={closeMenu}>About</NavLink>
        <NavLink to="/toolkit" onClick={closeMenu}>Toolkit</NavLink>
        <NavLink to="/thoughts" onClick={closeMenu}>My Thoughts</NavLink>
        <NavLink to="/contact" onClick={closeMenu}>Contact</NavLink>
        <NavLink to="/sendgrid-test" onClick={closeMenu}>Test</NavLink>
      </nav>
    </header>
  );
};

export default Header;
