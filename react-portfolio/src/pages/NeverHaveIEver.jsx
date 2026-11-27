import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  Sparkles,
  Briefcase,
  GraduationCap,
  Heart,
  Baby,
  RotateCcw,
  SkipForward,
} from 'lucide-react';
import { useAuth } from '../context/useAuth';

const GENRE_OPTIONS = [
  {
    id: 'childhood',
    title: 'Childhood',
    tag: 'SCHOOL & FAMILY',
    icon: Baby,
    description:
      'School mischief and growing-up secrets — getting scolded for fighting a kid, hiding report cards, or lying to parents about a relationship.',
  },
  {
    id: 'adults',
    title: 'Adults',
    tag: 'WORK & LIFE',
    icon: Briefcase,
    description:
      'Real-world confessions — lying in the office for leave, lying to your partner about where you were, ghosting plans, and adulting shortcuts.',
  },
  {
    id: 'college',
    title: 'College & Friends',
    tag: 'CAMPUS CHAOS',
    icon: GraduationCap,
    description:
      'Bunking classes, last-minute copying, chaotic hostel nights, 2 AM texts, and unhinged friend-group lore.',
  },
  {
    id: 'relationships',
    title: 'Relationships',
    tag: 'DATING & CRUSHES',
    icon: Heart,
    description:
      'Crushes, exes, sneaky DMs, jealousy moments, and bold relationship confessions.',
  },
];

const NeverHaveIEver = () => {
  const { session } = useAuth();

  const [selectedGenre, setSelectedGenre] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [questions, setQuestions] = useState(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [haveCount, setHaveCount] = useState(0);
  const [neverCount, setNeverCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);

  const handleStartGenre = async (genreObj) => {
    if (generating) return;
    if (!session?.access_token) {
      setErrorMsg('Active session required. Please sign in again.');
      return;
    }

    setErrorMsg('');
    setGenerating(true);

    try {
      const response = await fetch('/api/never-have-i-ever', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ genre: genreObj.id }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorMsg(data.message || 'Unable to generate questions. Please try again.');
        return;
      }

      const list = Array.isArray(data.questions) ? data.questions : [];
      if (list.length === 0) {
        setErrorMsg('No questions were returned. Please try again.');
        return;
      }

      setSelectedGenre(genreObj);
      setQuestions(list);
      setCurrentIndex(0);
      setAnsweredCount(0);
      setHaveCount(0);
      setNeverCount(0);
      setSkippedCount(0);
    } catch (err) {
      setErrorMsg(err?.message || 'Network error while generating questions.');
    } finally {
      setGenerating(false);
    }
  };

  const totalQuestions = questions ? questions.length : 0;
  const isFinished = Boolean(questions && currentIndex >= totalQuestions);
  const progressRatio = totalQuestions > 0 ? Math.min(1, answeredCount / totalQuestions) : 0;

  const handleAnswer = (choice) => {
    if (!questions || isFinished) return;
    if (choice === 'HAVE') setHaveCount((c) => c + 1);
    else setNeverCount((c) => c + 1);
    setAnsweredCount((c) => c + 1);
    setCurrentIndex((idx) => idx + 1);
  };

  const handleSkip = () => {
    if (!questions || isFinished) return;
    // Skip advances past the question without incrementing answered progress
    setSkippedCount((c) => c + 1);
    setCurrentIndex((idx) => idx + 1);
  };

  const handleResetToGenres = () => {
    setQuestions(null);
    setSelectedGenre(null);
    setCurrentIndex(0);
    setAnsweredCount(0);
    setHaveCount(0);
    setNeverCount(0);
    setSkippedCount(0);
    setErrorMsg('');
  };

  return (
    <div className="page-container tod-page">
      <Link to="/#gamezone" className="back-link">
        &larr; Back to Gamezone
      </Link>

      <div className="tod-top-header">
        <div>
          <div className="osint-badge-line">
            <Sparkles size={14} strokeWidth={1.75} />
            <span>10-QUESTION GENRE ROUND</span>
          </div>
          <h1 className="osint-main-title">Never Have I Ever</h1>
        </div>
      </div>

      {errorMsg && (
        <div className="auth-alert auth-alert-error" role="alert">
          <AlertCircle size={16} strokeWidth={1.75} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* SCREEN 1: GENRE SELECTION */}
      {!questions && (
        <div className="tod-lobby">
          <h2 className="tod-lobby-heading">Pick a genre before we start</h2>

          {generating ? (
            <div className="tod-loading-card">
              <div className="osint-loading-spinner" />
              <div className="osint-loading-text">
                GENERATING 10 GENRE QUESTIONS // STAND BY...
              </div>
              <div className="osint-loading-subtext">
                Crafting fresh prompts tailored to your selected genre.
              </div>
            </div>
          ) : (
            <div className="tod-mode-grid">
              {GENRE_OPTIONS.map((genre) => {
                const Icon = genre.icon;
                return (
                  <button
                    key={genre.id}
                    type="button"
                    className="tod-mode-card"
                    onClick={() => handleStartGenre(genre)}
                  >
                    <div className="tod-mode-top">
                      <span className="tod-mode-title">
                        <Icon size={18} strokeWidth={1.75} />
                        <span>{genre.title}</span>
                      </span>
                      <span className="tod-mode-tag">{genre.tag}</span>
                    </div>
                    <p className="tod-mode-desc">{genre.description}</p>
                    <div className="tod-mode-meta">10 Questions</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SCREEN 2: 10-QUESTION GAMEPLAY */}
      {questions && (
        <div className="tod-arena">
          <div className="tod-progress-header">
            <div className="tod-progress-meta">
              <span className="tod-turn-label">
                Answered {answeredCount} / {totalQuestions}
              </span>
              <span className="tod-intensity-label tier-1">
                GENRE: {selectedGenre?.title?.toUpperCase()}
              </span>
            </div>
            <div className="tod-progress-track">
              <div
                className="tod-progress-fill"
                style={{ width: `${Math.round(progressRatio * 100)}%` }}
              />
            </div>
          </div>

          <div className="tod-prompt-card">
            {isFinished ? (
              <div className="tod-complete-state">
                <div className="tod-card-type-badge">ROUND COMPLETE</div>
                <p className="tod-prompt-text">
                  Finished {selectedGenre?.title} mode! You answered <strong>I Have</strong> {haveCount} time(s),{' '}
                  <strong>Never</strong> {neverCount} time(s)
                  {skippedCount > 0 ? `, and skipped ${skippedCount}` : ''}.
                </p>
                <div className="tod-complete-actions">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => handleStartGenre(selectedGenre)}
                  >
                    <RotateCcw size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                    Play Same Genre Again
                  </button>
                  <button type="button" className="btn" onClick={handleResetToGenres}>
                    Change Genre
                  </button>
                  <Link to="/#gamezone" className="btn">
                    Back to Gamezone
                  </Link>
                </div>
              </div>
            ) : (
              <div className="tod-active-prompt">
                <div className="tod-card-header-row">
                  <span className="tod-card-type-badge badge-truth">
                    QUESTION {currentIndex + 1} OF {totalQuestions}
                  </span>
                  <span className="tod-remaining-counts">
                    I Have: {haveCount} &bull; Never: {neverCount}
                  </span>
                </div>
                <p className="tod-prompt-text">{questions[currentIndex]}</p>
              </div>
            )}
          </div>

          {!isFinished && (
            <>
              <div className="tod-action-buttons">
                <button
                  type="button"
                  className="tod-choice-btn tod-dare-btn"
                  onClick={() => handleAnswer('HAVE')}
                >
                  I HAVE
                </button>
                <button
                  type="button"
                  className="tod-choice-btn tod-truth-btn"
                  onClick={() => handleAnswer('NEVER')}
                >
                  NEVER
                </button>
              </div>

              <div className="tod-footer-row" style={{ justifyContent: 'space-between' }}>
                <button type="button" className="ultron-action-btn" onClick={handleSkip}>
                  <SkipForward size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                  Skip Question
                </button>
                <button type="button" className="ultron-action-btn" onClick={handleResetToGenres}>
                  Change Genre
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default NeverHaveIEver;
