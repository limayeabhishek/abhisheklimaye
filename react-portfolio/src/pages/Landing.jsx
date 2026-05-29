import React from 'react';
import { Link } from 'react-router-dom';

const ProfileImage = () => (
  <svg className="profile-image" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="50" r="48" fill="none" stroke="#FFFFFF" strokeWidth="2" />
  </svg>
);

const Landing = () => {
  return (
    <div className="landing-container">
      <ProfileImage />
      <h1 className="landing-name">Abhishek Limaye</h1>
      <p className="landing-slogan">Digital Forensics & Cybersecurity | Evidence-Driven Security</p>
      <div className="landing-buttons">
        <Link to="/contact" className="btn">
          Contact Me
        </Link>
        <a href="/resume.pdf" className="btn" download="Abhishek_Limaye_Resume.pdf">
          Resume
        </a>
      </div>
    </div>
  );
};

export default Landing;