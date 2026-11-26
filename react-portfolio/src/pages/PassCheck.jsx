import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';

function analyzePassword(pwd) {
  if (!pwd) {
    return {
      score: 0,
      label: 'Awaiting Input',
      cls: '',
      entropyBits: 0,
      crackTime: '—',
      checks: {
        length12: false,
        upper: false,
        lower: false,
        digit: false,
        symbol: false,
      },
    };
  }

  const hasLower = /[a-z]/.test(pwd);
  const hasUpper = /[A-Z]/.test(pwd);
  const hasDigit = /\d/.test(pwd);
  const hasSymbol = /[^a-zA-Z0-9]/.test(pwd);

  let poolSize = 0;
  if (hasLower) poolSize += 26;
  if (hasUpper) poolSize += 26;
  if (hasDigit) poolSize += 10;
  if (hasSymbol) poolSize += 32;

  const entropyBits = poolSize > 0 ? Math.round(pwd.length * Math.log2(poolSize)) : 0;

  let score = 0;
  if (pwd.length >= 8) score += 20;
  if (pwd.length >= 12) score += 20;
  if (pwd.length >= 16) score += 15;
  if (hasLower) score += 10;
  if (hasUpper) score += 10;
  if (hasDigit) score += 10;
  if (hasSymbol) score += 15;
  score = Math.min(100, score);

  let label = 'Weak';
  let cls = 'weak';
  if (score >= 85) {
    label = 'Strong';
    cls = 'strong';
  } else if (score >= 65) {
    label = 'Good';
    cls = 'good';
  } else if (score >= 40) {
    label = 'Fair';
    cls = 'fair';
  }

  // Offline GPU cluster guess rate ~ 1e10 guesses/sec
  const seconds = Math.pow(2, entropyBits) / 1e10;
  let crackTime = 'Instant';
  if (seconds >= 31536000000) crackTime = 'Centuries+';
  else if (seconds >= 31536000) crackTime = `${Math.round(seconds / 31536000)} year(s)`;
  else if (seconds >= 86400) crackTime = `${Math.round(seconds / 86400)} day(s)`;
  else if (seconds >= 3600) crackTime = `${Math.round(seconds / 3600)} hour(s)`;
  else if (seconds >= 60) crackTime = `${Math.round(seconds / 60)} minute(s)`;
  else if (seconds >= 1) crackTime = `${Math.round(seconds)} second(s)`;

  return {
    score,
    label,
    cls,
    entropyBits,
    crackTime,
    checks: {
      length12: pwd.length >= 12,
      upper: hasUpper,
      lower: hasLower,
      digit: hasDigit,
      symbol: hasSymbol,
    },
  };
}

const PassCheck = () => {
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);

  const analysis = useMemo(() => analyzePassword(password), [password]);

  return (
    <div className="page-container">
      <Link to="/#toolkit" className="back-link">
        &larr; Back to Toolkit
      </Link>

      <div className="tool-container-card">
        <div className="tool-header">
          <h1>PassCheck</h1>
          <p>Evaluate password entropy, character diversity, and offline crack resistance locally.</p>
        </div>

        <hr className="post-divider" />

        <div className="form-group">
          <label htmlFor="passcheck-input">Test Password</label>
          <div className="passcheck-input-row">
            <input
              id="passcheck-input"
              type={visible ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password to evaluate locally..."
              className="tool-input"
              autoComplete="off"
            />
            <button
              type="button"
              className="copy-btn passcheck-toggle-btn"
              onClick={() => setVisible((v) => !v)}
              aria-label={visible ? 'Hide password' : 'Show password'}
            >
              {visible ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div className="strength-meter">
          <div
            className={`strength-bar ${analysis.cls}`}
            style={{ width: `${analysis.score}%` }}
          />
        </div>

        <div className="passcheck-summary">
          <div>
            <strong>Rating:</strong> {analysis.label} ({analysis.score}/100)
          </div>
          <div>
            <strong>Estimated Entropy:</strong> {analysis.entropyBits} bits
          </div>
          <div>
            <strong>Offline Brute-Force Estimate (10B/s):</strong> {analysis.crackTime}
          </div>
        </div>

        <ul className="passcheck-checklist">
          <li className={analysis.checks.length12 ? 'ok' : ''}>
            {analysis.checks.length12 ? '[PASS]' : '[MISS]'} Minimum 12 characters
          </li>
          <li className={analysis.checks.upper ? 'ok' : ''}>
            {analysis.checks.upper ? '[PASS]' : '[MISS]'} Uppercase letters (A-Z)
          </li>
          <li className={analysis.checks.lower ? 'ok' : ''}>
            {analysis.checks.lower ? '[PASS]' : '[MISS]'} Lowercase letters (a-z)
          </li>
          <li className={analysis.checks.digit ? 'ok' : ''}>
            {analysis.checks.digit ? '[PASS]' : '[MISS]'} Numeric digits (0-9)
          </li>
          <li className={analysis.checks.symbol ? 'ok' : ''}>
            {analysis.checks.symbol ? '[PASS]' : '[MISS]'} Special symbols (!@#$...)
          </li>
        </ul>

        <p className="privacy-note">
          100% Client-Side: Your input is evaluated strictly in browser memory and is never logged or transmitted.
        </p>
      </div>
    </div>
  );
};

export default PassCheck;
