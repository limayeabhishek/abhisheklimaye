import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { supabase } from '../lib/supabase';
import {
  FALLBACK_PUBLIC_THOUGHT,
  LOCKED_PRIVATE_THOUGHT_PREVIEW,
} from '../data/portfolioData';

const Thoughts = () => {
  const { isActiveUser } = useAuth();
  const navigate = useNavigate();
  const [thoughts, setThoughts] = useState([
    FALLBACK_PUBLIC_THOUGHT,
    LOCKED_PRIVATE_THOUGHT_PREVIEW,
  ]);

  useEffect(() => {
    let cancelled = false;
    const loadThoughts = async () => {
      if (!supabase) return;
      try {
        const { data, error } = await supabase
          .from('thoughts')
          .select('id, slug, title, excerpt, published_at, is_private')
          .order('published_at', { ascending: false });

        if (!cancelled && !error && Array.isArray(data) && data.length > 0) {
          const hasPrivate = data.some((t) => t.is_private);
          setThoughts(hasPrivate ? data : [...data, LOCKED_PRIVATE_THOUGHT_PREVIEW]);
        }
      } catch (err) {
        console.error('Error loading thoughts:', err);
      }
    };
    loadThoughts();
    return () => {
      cancelled = true;
    };
  }, [isActiveUser]);

  return (
    <div className="page-container">
      <Link to="/" className="back-link">
        &larr; Back to Portfolio
      </Link>
      <h2 className="page-title">My Thoughts</h2>

      <div className="thoughts-grid">
        {thoughts.map((thought) => {
          const locked = Boolean(thought.is_private && !isActiveUser);
          return (
            <Link
              key={thought.slug}
              to={
                locked
                  ? `/login?redirect=${encodeURIComponent(`/thoughts/${thought.slug}`)}`
                  : `/thoughts/${thought.slug}`
              }
              onClick={(e) => {
                if (locked) {
                  e.preventDefault();
                  navigate(`/login?redirect=${encodeURIComponent(`/thoughts/${thought.slug}`)}`);
                }
              }}
              className={`thought-card-link ${locked ? 'is-locked' : ''}`}
            >
              <div className={`thought-item ${locked ? 'locked-card' : ''}`}>
                <div className="thought-item-header">
                  <h3>{thought.title}</h3>
                  {thought.is_private && (
                    <span className="members-only-pill">Members Only</span>
                  )}
                </div>
                <p className="thought-date">
                  {thought.published_at
                    ? new Date(`${thought.published_at}T00:00:00`).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })
                    : ''}
                </p>
                <p className="excerpt">{thought.excerpt}</p>
                {locked && (
                  <div className="lock-overlay">
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
    </div>
  );
};

export default Thoughts;
