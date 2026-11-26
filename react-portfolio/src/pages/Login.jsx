import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth, DISABLED_ACCOUNT_MESSAGE } from '../context/useAuth';

function getSafeRedirect(rawRedirect) {
  if (typeof rawRedirect !== 'string') return '/';
  const trimmed = rawRedirect.trim();
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return trimmed;
  }
  return '/';
}

const Login = () => {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isActiveUser, disabledNotice, clearDisabledNotice } = useAuth();

  const redirectTo = useMemo(
    () => getSafeRedirect(searchParams.get('redirect')),
    [searchParams]
  );

  useEffect(() => {
    if (isActiveUser) {
      navigate(redirectTo, { replace: true });
    }
  }, [isActiveUser, navigate, redirectTo]);

  useEffect(() => {
    if (disabledNotice) {
      setErrorMsg(disabledNotice);
    }
  }, [disabledNotice]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');
    clearDisabledNotice();

    if (!isSupabaseConfigured || !supabase) {
      setErrorMsg('Authentication service is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
      return;
    }

    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setErrorMsg('Email and password are required.');
      return;
    }

    setSubmitting(true);

    try {
      if (mode === 'signin') {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        if (error) {
          setErrorMsg(error.message || 'Sign in failed.');
          return;
        }

        const userId = data?.user?.id;
        if (userId) {
          const { data: profileRow } = await supabase
            .from('profiles')
            .select('status')
            .eq('id', userId)
            .maybeSingle();

          if (profileRow?.status === 'disabled') {
            await supabase.auth.signOut();
            setErrorMsg(DISABLED_ACCOUNT_MESSAGE);
            return;
          }
        }

        navigate(redirectTo, { replace: true });
      } else {
        const cleanDisplayName = displayName.trim();
        if (!cleanDisplayName) {
          setErrorMsg('Display name is required when creating an account.');
          return;
        }

        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: {
              display_name: cleanDisplayName,
            },
            emailRedirectTo: `${window.location.origin}/login`,
          },
        });

        if (error) {
          setErrorMsg(error.message || 'Account creation failed.');
          return;
        }

        if (!data.session) {
          setInfoMsg(
            'Account created! Please check your email inbox and confirm your address before signing in.'
          );
          setMode('signin');
          setPassword('');
          return;
        }

        navigate(redirectTo, { replace: true });
      }
    } catch (err) {
      setErrorMsg(err?.message || 'Unexpected authentication error.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page-container auth-page-wrapper">
      <Link to="/" className="back-link">
        &larr; Back to Portfolio
      </Link>

      <div className="auth-card">
        <div className="auth-card-header">
          <div className="auth-badge-row">
            <Lock size={14} strokeWidth={1.75} />
            <span>OPERATOR ACCESS GATEWAY</span>
          </div>
          <h1 className="auth-title">
            {mode === 'signin' ? 'Sign In' : 'Create Account'}
          </h1>
          <p className="auth-subtitle">
            Authenticate to unlock Toolkit instruments, AudioSync rooms, and private lab notes.
          </p>
        </div>

        <div className="auth-tab-bar" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signin'}
            className={`tab-btn ${mode === 'signin' ? 'active' : ''}`}
            onClick={() => {
              setMode('signin');
              setErrorMsg('');
              setInfoMsg('');
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signup'}
            className={`tab-btn ${mode === 'signup' ? 'active' : ''}`}
            onClick={() => {
              setMode('signup');
              setErrorMsg('');
              setInfoMsg('');
            }}
          >
            Create Account
          </button>
        </div>

        {errorMsg && (
          <div className="auth-alert auth-alert-error" role="alert">
            <AlertCircle size={16} strokeWidth={1.75} />
            <span>{errorMsg}</span>
          </div>
        )}

        {infoMsg && (
          <div className="auth-alert auth-alert-success" role="status">
            <CheckCircle2 size={16} strokeWidth={1.75} />
            <span>{infoMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          {mode === 'signup' && (
            <div className="form-group">
              <label htmlFor="auth-display-name">Display Name</label>
              <input
                id="auth-display-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g., Analyst Zero"
                className="tool-input"
                autoComplete="name"
                required
              />
            </div>
          )}

          <div className="form-group">
            <label htmlFor="auth-email">Email</label>
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="operator@domain.com"
              className="tool-input"
              autoComplete="email"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="tool-input"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              minLength={6}
              required
            />
          </div>

          <button
            type="submit"
            className="btn tool-btn auth-submit-btn"
            disabled={submitting}
          >
            {submitting
              ? mode === 'signin'
                ? 'AUTHENTICATING...'
                : 'CREATING ACCOUNT...'
              : mode === 'signin'
                ? 'Sign In'
                : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
