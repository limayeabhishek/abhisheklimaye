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
      <div className="header-brand">
        <NavLink to="/" onClick={closeMenu} className="brand-name">ABHISHEK LIMAYE</NavLink>
        <span className="brand-sep">|</span>
        <NavLink to="/ultron" onClick={closeMenu} className="brand-autron">A-Ultron</NavLink>
      </div>

      <div className={`menu-toggle ${menuOpen ? 'active' : ''}`} onClick={toggleMenu} aria-label="Toggle Navigation">
        <div className="bar"></div>
        <div className="bar"></div>
        <div className="bar"></div>
      </div>

      <nav className={`header-nav ${menuOpen ? 'active' : ''}`}>
        <NavLink to="/about" onClick={closeMenu}>About</NavLink>
        <NavLink to="/projects" onClick={closeMenu}>Projects</NavLink>
        <NavLink to="/toolkit" onClick={closeMenu}>Toolkit</NavLink>
        <NavLink to="/thoughts" onClick={closeMenu}>My Thoughts</NavLink>
        <NavLink to="/contact" onClick={closeMenu}>Contact</NavLink>
      </nav>
    </header>
  );
};

export default Header;
