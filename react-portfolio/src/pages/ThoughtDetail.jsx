import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/useAuth';
import {
  FALLBACK_PUBLIC_THOUGHT,
  LOCKED_PRIVATE_THOUGHT_PREVIEW,
} from '../data/portfolioData';

function renderEssayContent(content) {
  if (!content) return null;
  const blocks = content.trim().split(/\n\n+/);

  return blocks.map((block, idx) => {
    const trimmed = block.trim();
    if (trimmed.startsWith('## ')) {
      return <h2 key={idx}>{trimmed.replace(/^##\s+/, '')}</h2>;
    }

    const lines = trimmed.split('\n');
    const isBulletList = lines.every((l) => l.trim().startsWith('- '));
    if (isBulletList) {
      return (
        <ul key={idx}>
          {lines.map((l, lIdx) => (
            <li key={lIdx}>{renderInlineBold(l.trim().slice(2))}</li>
          ))}
        </ul>
      );
    }

    const isOrderedList = lines.every((l) => /^\d+\.\s+/.test(l.trim()));
    if (isOrderedList) {
      return (
        <ol key={idx} className="thought-ordered-list">
          {lines.map((l, lIdx) => (
            <li key={lIdx}>{renderInlineBold(l.trim().replace(/^\d+\.\s+/, ''))}</li>
          ))}
        </ol>
      );
    }

    if (lines.length > 1 && lines.some((l) => l.trim().startsWith('- '))) {
      const lead = [];
      const bullets = [];
      lines.forEach((l) => {
        if (l.trim().startsWith('- ')) bullets.push(l.trim().slice(2));
        else lead.push(l.trim());
      });
      return (
        <React.Fragment key={idx}>
          {lead.length > 0 && <p>{renderInlineBold(lead.join(' '))}</p>}
          {bullets.length > 0 && (
            <ul>
              {bullets.map((b, bIdx) => (
                <li key={bIdx}>{renderInlineBold(b)}</li>
              ))}
            </ul>
          )}
        </React.Fragment>
      );
    }

    return <p key={idx}>{renderInlineBold(trimmed)}</p>;
  });
}

function renderInlineBold(text) {
  const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={idx}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={idx} className="ultron-inline-code">
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

const ThoughtDetail = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { isActiveUser, loading: authLoading } = useAuth();
  const [thought, setThought] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadThought = async () => {
      if (authLoading) return;

      if (slug === LOCKED_PRIVATE_THOUGHT_PREVIEW.slug && !isActiveUser) {
        navigate(`/login?redirect=${encodeURIComponent(`/thoughts/${slug}`)}`, {
          replace: true,
        });
        return;
      }

      if (supabase) {
        try {
          const { data, error } = await supabase
            .from('thoughts')
            .select('id, slug, title, excerpt, content, published_at, is_private')
            .eq('slug', slug)
            .maybeSingle();

          if (!cancelled && !error && data) {
            if (data.is_private && !isActiveUser) {
              navigate(`/login?redirect=${encodeURIComponent(`/thoughts/${slug}`)}`, {
                replace: true,
              });
              return;
            }
            setThought(data);
            setLoading(false);
            return;
          }
        } catch (err) {
          console.error('Error fetching thought:', err);
        }
      }

      if (!cancelled) {
        if (slug === FALLBACK_PUBLIC_THOUGHT.slug) {
          setThought(FALLBACK_PUBLIC_THOUGHT);
        } else if (slug === LOCKED_PRIVATE_THOUGHT_PREVIEW.slug && !isActiveUser) {
          navigate(`/login?redirect=${encodeURIComponent(`/thoughts/${slug}`)}`, {
            replace: true,
          });
          return;
        } else {
          setNotFound(true);
        }
        setLoading(false);
      }
    };

    loadThought();
    return () => {
      cancelled = true;
    };
  }, [slug, isActiveUser, authLoading, navigate]);

  if (loading || authLoading) {
    return (
      <div className="page-container">
        <div className="auth-loading-box">LOADING ENTRY...</div>
      </div>
    );
  }

  if (notFound || !thought) {
    return (
      <div className="post-container">
        <Link to="/#thoughts" className="back-link">
          &larr; Back to Thoughts
        </Link>
        <div className="thought-item">
          <h3>Entry Unavailable</h3>
          <p className="excerpt">
            This essay either does not exist or requires an active operator account to unlock.
          </p>
          {!isActiveUser && (
            <Link
              to={`/login?redirect=${encodeURIComponent(`/thoughts/${slug}`)}`}
              className="btn"
              style={{ marginTop: '1rem' }}
            >
              <Lock size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
              Login to Unlock
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="post-container">
      <Link to="/#thoughts" className="back-link">
        &larr; Back to Thoughts
      </Link>

      <div className="post-header">
        <div>
          <h1>{thought.title}</h1>
          {thought.published_at && (
            <p className="thought-date" style={{ marginTop: '0.5rem' }}>
              {new Date(`${thought.published_at}T00:00:00`).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
              {thought.is_private ? ' • Members Only' : ''}
            </p>
          )}
        </div>
        {thought.slug === FALLBACK_PUBLIC_THOUGHT.slug && (
          <a
            href={FALLBACK_PUBLIC_THOUGHT.linkedinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="linkedin-btn"
          >
            Read on LinkedIn
          </a>
        )}
      </div>

      <hr className="post-divider" />

      <article className="post-content">{renderEssayContent(thought.content)}</article>
    </div>
  );
};

export default ThoughtDetail;
