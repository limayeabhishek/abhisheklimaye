import React from 'react';
import { Link } from 'react-router-dom';
import { GAMEZONE_ITEMS } from '../data/portfolioData';

const Gamezone = () => {
  return (
    <div className="page-container">
      <Link to="/" className="back-link">
        &larr; Back to Portfolio
      </Link>
      <h2 className="page-title">Gamezone</h2>

      <div className="projects-grid">
        {GAMEZONE_ITEMS.map((item) => (
          <Link key={item.id} to={item.route} className="project-card-link">
            <div className="tool-card">
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default Gamezone;
