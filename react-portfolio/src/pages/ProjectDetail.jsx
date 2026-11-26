import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { PROJECTS_ITEMS } from '../data/portfolioData';

const ProjectDetail = () => {
  const { slug } = useParams();
  const project = PROJECTS_ITEMS.find((p) => p.slug === slug);

  if (!project) {
    return (
      <div className="post-container">
        <Link to="/#projects" className="back-link">
          &larr; Back to Projects
        </Link>
        <div className="thought-item">
          <h3>Project Not Found</h3>
          <p className="excerpt">The requested project entry could not be located.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="post-container">
      <Link to="/#projects" className="back-link">
        &larr; Back to Projects
      </Link>

      <div className="post-header">
        <h1>{project.title}</h1>
        <a
          href={project.githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="github-btn"
        >
          View on GitHub
        </a>
      </div>

      <hr className="post-divider" />

      <article className="post-content">
        {project.overview.map((paragraph, idx) => (
          <p key={idx}>{paragraph}</p>
        ))}

        {project.sections?.map((sec, sIdx) => (
          <React.Fragment key={sIdx}>
            <h2>{sec.heading}</h2>
            <ul>
              {sec.bullets.map((bullet, bIdx) => (
                <li key={bIdx}>{bullet}</li>
              ))}
            </ul>
          </React.Fragment>
        ))}

        {project.tags && (
          <div className="project-tech-tags" style={{ marginTop: '2rem' }}>
            {project.tags.map((tag, tIdx) => (
              <span key={tIdx} className="tech-tag">
                {tag}
              </span>
            ))}
          </div>
        )}
      </article>
    </div>
  );
};

export default ProjectDetail;
