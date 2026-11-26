import React from 'react';
import { Link } from 'react-router-dom';
import { TOOLKIT_ITEMS } from '../data/portfolioData';

const Toolkit = () => {
  return (
    <div className="page-container">
      <Link to="/" className="back-link">
        &larr; Back to Portfolio
      </Link>
      <h2 className="page-title">Forensic &amp; Security Toolkit</h2>

      <div className="projects-grid">
        {TOOLKIT_ITEMS.map((tool) => (
          <Link key={tool.id} to={tool.route} className="project-card-link">
            <div className="tool-card">
              <h3>{tool.title}</h3>
              <p>{tool.description}</p>
            </div>
          </Link>
        ))}

        <Link to="/ultron" className="project-card-link">
          <div className="tool-card" style={{ borderColor: '#ff2a2a' }}>
            <h3 style={{ color: '#ff4455' }}>A-Ultron</h3>
            <p>
              Calculating, cold, and philosophical autonomous cognitive core powered by Gemini Flash.
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
};

export default Toolkit;
