import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Flame, Users, Heart, RotateCcw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/useAuth';

function getIntensityMeta(progressRatio, mode) {
  if (progressRatio >= 0.75) {
    return {
      label: mode === 'partner' ? 'LEVEL 4 // MAXIMUM HEAT' : 'LEVEL 4 // PEAK UNHINGED CHAOS',
      tier: 'tier-4',
    };
  }
  if (progressRatio >= 0.5) {
    return {
      label: mode === 'partner' ? 'LEVEL 3 // HIGH INTENSITY' : 'LEVEL 3 // HIGH CHAOS',
      tier: 'tier-3',
    };
  }
  if (progressRatio >= 0.25) {
    return {
      label: mode === 'partner' ? 'LEVEL 2 // ESCALATING' : 'LEVEL 2 // GETTING WILD',
      tier: 'tier-2',
    };
  }
  return {
    label: mode === 'partner' ? 'LEVEL 1 // PLAYFUL WARMUP' : 'LEVEL 1 // SOCIAL WARMUP',
    tier: 'tier-1',
  };
}

const TruthOrDare = () => {
  const { session, user } = useAuth();

  // Quota state
  const [gamesPlayed, setGamesPlayed] = useState(0);
  const [maxGames, setMaxGames] = useState(10);
  const [quotaLoading, setQuotaLoading] = useState(true);

  // Session & deck state
  const [selectedMode, setSelectedMode] = useState(null); // 'partner' | 'friends'
  const [generating, setGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [deck, setDeck] = useState(null); // { truths: string[], dares: string[] }

  // Gameplay state
  const [truthIndex, setTruthIndex] = useState(0);
  const [dareIndex, setDareIndex] = useState(0);
  const [activeCard, setActiveCard] = useState(null); // { type: 'TRUTH' | 'DARE', text: string, turn: number }

  useEffect(() => {
    let cancelled = false;

    const loadQuota = async () => {
      if (!supabase || !user?.id) {
        setQuotaLoading(false);
        return;
      }
      try {
        const { data, error } = await supabase
          .from('truth_or_dare_sessions')
          .select('games_played, max_games')
          .eq('user_id', user.id)
          .maybeSingle();

        if (!cancelled && !error && data) {
          setGamesPlayed(data.games_played ?? 0);
          setMaxGames(data.max_games ?? 10);
        }
      } catch (err) {
        console.error('Failed to load game quota:', err);
      } finally {
        if (!cancelled) setQuotaLoading(false);
      }
    };

    loadQuota();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const remainingGames = Math.max(0, maxGames - gamesPlayed);

  const handleStartMode = async (mode) => {
    if (generating || remainingGames <= 0) return;
    if (!session?.access_token) {
      setErrorMsg('Active session required. Please sign in again.');
      return;
    }

    setErrorMsg('');
    setGenerating(true);

    try {
      const response = await fetch('/api/truth-or-dare', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ mode }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (typeof data.gamesPlayed === 'number') setGamesPlayed(data.gamesPlayed);
        if (typeof data.maxGames === 'number') setMaxGames(data.maxGames);
        setErrorMsg(data.message || 'Unable to start Truth or Dare session.');
        return;
      }

      setSelectedMode(mode);
      setDeck({
        truths: Array.isArray(data.truths) ? data.truths : [],
        dares: Array.isArray(data.dares) ? data.dares : [],
      });
      setTruthIndex(0);
      setDareIndex(0);
      setActiveCard(null);

      if (typeof data.gamesPlayed === 'number') setGamesPlayed(data.gamesPlayed);
      if (typeof data.maxGames === 'number') setMaxGames(data.maxGames);
    } catch (err) {
      setErrorMsg(err?.message || 'Network error while generating prompt deck.');
    } finally {
      setGenerating(false);
    }
  };

  const totalCards = useMemo(() => {
    if (!deck) return 0;
    return deck.truths.length + deck.dares.length;
  }, [deck]);

  const turnsTaken = truthIndex + dareIndex;
  const truthsLeft = deck ? deck.truths.length - truthIndex : 0;
  const daresLeft = deck ? deck.dares.length - dareIndex : 0;
  const isDeckFinished = Boolean(deck && truthsLeft === 0 && daresLeft === 0 && !activeCard);

  const progressRatio = totalCards > 0 ? Math.min(1, turnsTaken / totalCards) : 0;
  const intensity = getIntensityMeta(progressRatio, selectedMode);

  const handleDrawCard = (choice) => {
    if (!deck) return;
    if (choice === 'TRUTH' && truthIndex < deck.truths.length) {
      const nextTurn = turnsTaken + 1;
      setActiveCard({
        type: 'TRUTH',
        text: deck.truths[truthIndex],
        turn: nextTurn,
      });
      setTruthIndex((prev) => prev + 1);
    } else if (choice === 'DARE' && dareIndex < deck.dares.length) {
      const nextTurn = turnsTaken + 1;
      setActiveCard({
        type: 'DARE',
        text: deck.dares[dareIndex],
        turn: nextTurn,
      });
      setDareIndex((prev) => prev + 1);
    }
  };

  const handleNextTurn = () => {
    setActiveCard(null);
  };

  const handleResetToLobby = () => {
    setDeck(null);
    setSelectedMode(null);
    setTruthIndex(0);
    setDareIndex(0);
    setActiveCard(null);
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
            <Flame size={14} strokeWidth={1.75} />
            <span>ESCALATED AI PARTY DECK</span>
          </div>
          <h1 className="osint-main-title">Truth or Dare</h1>
        </div>

        <div className="tod-quota-pill">
          {quotaLoading
            ? 'Checking Quota...'
            : `Games Remaining: ${remainingGames} / ${maxGames}`}
        </div>
      </div>

      {errorMsg && (
        <div className="auth-alert auth-alert-error" role="alert">
          <AlertCircle size={16} strokeWidth={1.75} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* SCREEN 1: MODE SELECTION */}
      {!deck && (
        <div className="tod-lobby">
          <h2 className="tod-lobby-heading">Who are we playing with today?</h2>

          {!quotaLoading && remainingGames <= 0 && (
            <div className="auth-alert auth-alert-error" role="status">
              <AlertCircle size={16} strokeWidth={1.75} />
              <span>
                You have reached the 10-game limit ({gamesPlayed} / {maxGames} games played). Contact the administrator to reset your quota.
              </span>
            </div>
          )}

          {generating ? (
            <div className="tod-loading-card">
              <div className="osint-loading-spinner" />
              <div className="osint-loading-text">
                GENERATING ESCALATED DECK // STAND BY...
              </div>
              <div className="osint-loading-subtext">
                Batching the entire progressive deck in one single call so turns stay instant.
              </div>
            </div>
          ) : (
            <div className="tod-mode-grid">
              <button
                type="button"
                className="tod-mode-card"
                disabled={quotaLoading || remainingGames <= 0}
                onClick={() => handleStartMode('partner')}
              >
                <div className="tod-mode-top">
                  <span className="tod-mode-title">
                    <Heart size={18} strokeWidth={1.75} />
                    <span>Partner</span>
                  </span>
                  <span className="tod-mode-tag tod-tag-nsfw">NSFW / SPICY</span>
                </div>
                <p className="tod-mode-desc">
                  Bold, flirtatious, and intimate prompts tailored for consenting couples. Progressively escalates from playful warmup to maximum heat.
                </p>
                <div className="tod-mode-meta">20 Truths + 20 Dares &bull; 40 Cards</div>
              </button>

              <button
                type="button"
                className="tod-mode-card"
                disabled={quotaLoading || remainingGames <= 0}
                onClick={() => handleStartMode('friends')}
              >
                <div className="tod-mode-top">
                  <span className="tod-mode-title">
                    <Users size={18} strokeWidth={1.75} />
                    <span>Friends</span>
                  </span>
                  <span className="tod-mode-tag tod-tag-crazy">FULL CRAZY</span>
                </div>
                <p className="tod-mode-desc">
                  Unhinged, hilarious, high-chaos social truths and harmless group dares built for up to 5 friends. Escalates from warmup to peak chaos.
                </p>
                <div className="tod-mode-meta">50 Truths + 50 Dares &bull; 100 Cards</div>
              </button>
            </div>
          )}
        </div>
      )}

      {/* SCREEN 2: ACTIVE GAMEPLAY */}
      {deck && (
        <div className="tod-arena">
          {/* Top Linear Progress Bar */}
          <div className="tod-progress-header">
            <div className="tod-progress-meta">
              <span className="tod-turn-label">
                Turn {turnsTaken} / {totalCards}
              </span>
              <span className={`tod-intensity-label ${intensity.tier}`}>
                {intensity.label}
              </span>
            </div>
            <div className="tod-progress-track">
              <div
                className={`tod-progress-fill ${intensity.tier}`}
                style={{ width: `${Math.round(progressRatio * 100)}%` }}
              />
            </div>
          </div>

          {/* Central Prompt Display Card */}
          <div className="tod-prompt-card">
            {isDeckFinished ? (
              <div className="tod-complete-state">
                <div className="tod-card-type-badge">DECK COMPLETE</div>
                <p className="tod-prompt-text">
                  All {totalCards} escalated prompts in {selectedMode === 'partner' ? 'Partner' : 'Friends'} mode have been played.
                </p>
                <div className="tod-complete-actions">
                  {remainingGames > 0 && (
                    <button
                      type="button"
                      className="btn"
                      onClick={handleResetToLobby}
                    >
                      <RotateCcw size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                      Play Again ({remainingGames} left)
                    </button>
                  )}
                  <Link to="/#gamezone" className="btn">
                    Back to Gamezone
                  </Link>
                </div>
              </div>
            ) : activeCard ? (
              <div className="tod-active-prompt">
                <div className="tod-card-header-row">
                  <span
                    className={`tod-card-type-badge ${
                      activeCard.type === 'DARE' ? 'badge-dare' : 'badge-truth'
                    }`}
                  >
                    {activeCard.type} &bull; TURN {activeCard.turn}
                  </span>
                  <span className="tod-remaining-counts">
                    Remaining: {truthsLeft}T / {daresLeft}D
                  </span>
                </div>
                <p className="tod-prompt-text">{activeCard.text}</p>
                <button
                  type="button"
                  className="btn-tool tod-next-btn"
                  onClick={handleNextTurn}
                >
                  Next Turn &rarr;
                </button>
              </div>
            ) : (
              <div className="tod-awaiting-choice">
                <div className="tod-card-type-badge">
                  {selectedMode === 'partner' ? 'PARTNER MODE' : 'FRIENDS MODE'}
                </div>
                <p className="tod-prompt-text">
                  Choose <strong>TRUTH</strong> or <strong>DARE</strong> below to draw Turn {turnsTaken + 1}.
                </p>
                <div className="tod-remaining-counts">
                  Remaining in Deck: {truthsLeft} Truths &bull; {daresLeft} Dares
                </div>
              </div>
            )}
          </div>

          {/* Primary TRUTH / DARE Action Buttons */}
          {!isDeckFinished && (
            <div className="tod-action-buttons">
              <button
                type="button"
                className="tod-choice-btn tod-truth-btn"
                disabled={Boolean(activeCard) || truthsLeft === 0}
                onClick={() => handleDrawCard('TRUTH')}
              >
                TRUTH ({truthsLeft})
              </button>
              <button
                type="button"
                className="tod-choice-btn tod-dare-btn"
                disabled={Boolean(activeCard) || daresLeft === 0}
                onClick={() => handleDrawCard('DARE')}
              >
                DARE ({daresLeft})
              </button>
            </div>
          )}

          <div className="tod-footer-row">
            <button
              type="button"
              className="ultron-action-btn"
              onClick={handleResetToLobby}
            >
              End Current Game
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TruthOrDare;
