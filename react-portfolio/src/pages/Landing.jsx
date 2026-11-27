import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { supabase } from '../lib/supabase';
import {
  TOOLKIT_ITEMS,
  GAMEZONE_ITEMS,
  PROJECTS_ITEMS,
  FALLBACK_PUBLIC_THOUGHT,
  LOCKED_PRIVATE_THOUGHT_PREVIEW,
} from '../data/portfolioData';

const formatThoughtDate = (dateStr) => {
  if (!dateStr) return '';
  const parsed = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateStr;
  return parsed.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

const Landing = () => {
  const { isActiveUser, disabledNotice, clearDisabledNotice } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [thoughts, setThoughts] = useState([
    FALLBACK_PUBLIC_THOUGHT,
    LOCKED_PRIVATE_THOUGHT_PREVIEW,
  ]);

  useEffect(() => {
    if (location.hash) {
      const targetId = location.hash.slice(1);
      const timer = setTimeout(() => {
        const el = document.getElementById(targetId);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [location.hash]);

  useEffect(() => {
    let cancelled = false;
    const loadThoughts = async () => {
      if (!supabase) return;
      try {
        const { data, error } = await supabase
          .from('thoughts')
          .select('id, slug, title, excerpt, published_at, is_private')
          .order('published_at', { ascending: false });

        if (cancelled || error || !Array.isArray(data) || data.length === 0) {
          return;
        }

        const hasPrivate = data.some((item) => item.is_private);
        const list = hasPrivate
          ? data
          : [...data, LOCKED_PRIVATE_THOUGHT_PREVIEW];
        setThoughts(list);
      } catch (err) {
        console.error('Unable to load thoughts:', err);
      }
    };

    loadThoughts();
    return () => {
      cancelled = true;
    };
  }, [isActiveUser]);

  const handleToolkitClick = (e, route) => {
    if (!isActiveUser) {
      e.preventDefault();
      navigate(`/login?redirect=${encodeURIComponent(route)}`);
    }
  };

  const handlePrivateThoughtClick = (e) => {
    if (!isActiveUser) {
      e.preventDefault();
      navigate(`/login?redirect=${encodeURIComponent('/#thoughts')}`);
    }
  };

  return (
    <div className="home-wrapper">
      {disabledNotice && (
        <div className="global-notice-banner" role="alert">
          <span>{disabledNotice}</span>
          <button
            type="button"
            className="global-notice-close"
            onClick={clearDisabledNotice}
            aria-label="Dismiss notice"
          >
            &times;
          </button>
        </div>
      )}

      <section className="landing">
        <img src="/profile.png" alt="Profile Photo" className="profile-photo" />
        <h1>Abhishek Limaye</h1>
        <p className="slogan">Cybersecurity and Digital Forensics Practitioner.</p>
        <div className="button-container">
          <Link
            to="/ultron"
            className="btn"
            style={{ borderColor: '#ff1a1a', color: '#ff3344' }}
          >
            Query A-Ultron
          </Link>
          <a
            href="#contact"
            className="btn"
            onClick={(e) => {
              e.preventDefault();
              document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' });
            }}
          >
            Contact Me
          </a>
          <a
            href="/Abhishek%20Limaye.pdf"
            download="Abhishek Limaye.pdf"
            className="btn"
            id="resume-btn"
          >
            Resume
          </a>
        </div>
      </section>

      <section id="about" className="content-section">
        <h2>About</h2>
        <p>
          A dedicated and analytical cybersecurity and digital forensics practitioner with a passion for uncovering and mitigating digital threats. My expertise lies in investigating complex security incidents, analyzing digital evidence, and developing robust defense strategies. I am committed to maintaining the integrity and security of digital environments through meticulous forensic analysis and proactive threat intelligence.
        </p>
      </section>

      <section id="toolkit" className="content-section">
        <h2>Toolkit Box</h2>
        <div className="projects-grid">
          {TOOLKIT_ITEMS.map((tool) => (
            <Link
              key={tool.id}
              to={isActiveUser ? tool.route : `/login?redirect=${encodeURIComponent(tool.route)}`}
              onClick={(e) => handleToolkitClick(e, tool.route)}
              className={`project-card-link ${!isActiveUser ? 'is-locked' : ''}`}
            >
              <div className={`tool-card ${!isActiveUser ? 'locked-card' : ''}`}>
                <h3>{tool.title}</h3>
                <p>{tool.description}</p>
                {!isActiveUser && (
                  <div className="lock-overlay" aria-label="Login to Unlock">
                    <span className="lock-badge">
                      <Lock size={14} strokeWidth={2} />
                      <span>Login to Unlock</span>
                    </span>
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section id="gamezone" className="content-section">
        <h2>Gamezone</h2>
        <div className="projects-grid">
          {GAMEZONE_ITEMS.map((item) => (
            <Link
              key={item.id}
              to={isActiveUser ? item.route : `/login?redirect=${encodeURIComponent(item.route)}`}
              onClick={(e) => handleToolkitClick(e, item.route)}
              className={`project-card-link ${!isActiveUser ? 'is-locked' : ''}`}
            >
              <div className={`tool-card ${!isActiveUser ? 'locked-card' : ''}`}>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                {!isActiveUser && (
                  <div className="lock-overlay" aria-label="Login to Unlock">
                    <span className="lock-badge">
                      <Lock size={14} strokeWidth={2} />
                      <span>Login to Unlock</span>
                    </span>
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section id="projects" className="content-section">
        <h2>Projects</h2>
        <div className="projects-grid">
          {PROJECTS_ITEMS.map((project) => (
            <Link
              key={project.slug}
              to={`/projects/${project.slug}`}
              className="project-card-link"
            >
              <div className="project-card">
                <h3>{project.title}</h3>
                <p>{project.shortDesc}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section id="thoughts" className="content-section">
        <h2>My Thoughts</h2>
        <div className="thoughts-grid">
          {thoughts.map((thought) => {
            const locked = Boolean(thought.is_private && !isActiveUser);
            return (
              <Link
                key={thought.slug}
                to={
                  locked
                    ? `/login?redirect=${encodeURIComponent('/#thoughts')}`
                    : `/thoughts/${thought.slug}`
                }
                onClick={locked ? handlePrivateThoughtClick : undefined}
                className={`thought-card-link ${locked ? 'is-locked' : ''}`}
              >
                <div className={`thought-item ${locked ? 'locked-card' : ''}`}>
                  <div className="thought-item-header">
                    <h3>{thought.title}</h3>
                    {thought.is_private && (
                      <span className="members-only-pill">Members Only</span>
                    )}
                  </div>
                  <p className="thought-date">{formatThoughtDate(thought.published_at)}</p>
                  <p className="excerpt">{thought.excerpt}</p>
                  {locked && (
                    <div className="lock-overlay" aria-label="Members Only — Login to Unlock">
                      <span className="lock-badge">
                        <Lock size={14} strokeWidth={2} />
                        <span>Members Only &mdash; Login to Read</span>
                      </span>
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section id="contact" className="content-section">
        <h2>Contact</h2>
        <ul className="contact-links">
          <li>
            <a href="mailto:abhishek.d.limaye@gmail.com">abhishek.d.limaye@gmail.com</a>
          </li>
          <li>
            <a href="https://github.com/limayeabhishek" target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
          </li>
          <li>
            <a
              href="https://www.linkedin.com/in/abhishekdlimaye/"
              target="_blank"
              rel="noopener noreferrer"
            >
              LinkedIn
            </a>
          </li>
        </ul>
      </section>
    </div>
  );
};

export default Landing;
