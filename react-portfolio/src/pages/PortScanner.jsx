import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';

const COMMON_PORTS = [
  { port: 21, service: 'FTP', banner: 'vsFTPd 3.0.3', defaultOpen: false },
  { port: 22, service: 'SSH', banner: 'OpenSSH 9.6p1 Ubuntu', defaultOpen: true },
  { port: 25, service: 'SMTP', banner: 'Postfix smtpd', defaultOpen: false },
  { port: 53, service: 'DNS', banner: 'ISC BIND 9.18', defaultOpen: true },
  { port: 80, service: 'HTTP', banner: 'nginx/1.24.0', defaultOpen: true },
  { port: 110, service: 'POP3', banner: 'Dovecot pop3d', defaultOpen: false },
  { port: 143, service: 'IMAP', banner: 'Dovecot imapd', defaultOpen: false },
  { port: 443, service: 'HTTPS', banner: 'TLSv1.3 / ALPN h2', defaultOpen: true },
  { port: 445, service: 'SMB', banner: 'Samba 4.19', defaultOpen: false },
  { port: 3306, service: 'MySQL', banner: 'MySQL 8.0.36', defaultOpen: false },
  { port: 5432, service: 'PostgreSQL', banner: 'PostgreSQL 16.2', defaultOpen: false },
  { port: 6379, service: 'Redis', banner: 'Redis 7.2', defaultOpen: false },
  { port: 8080, service: 'HTTP-Alt', banner: 'Jetty / Proxy', defaultOpen: true },
];

function deterministicHash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

const PortScanner = () => {
  const [target, setTarget] = useState('scanme.lab.local');
  const [profile, setProfile] = useState('common');
  const [scanning, setScanning] = useState(false);
  const [logs, setLogs] = useState([]);
  const timersRef = useRef([]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  const runSimulatedScan = (e) => {
    e.preventDefault();
    const cleanTarget = target.trim();
    if (!cleanTarget || scanning) return;

    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];

    setScanning(true);
    const seed = deterministicHash(cleanTarget);
    const portsToScan =
      profile === 'web'
        ? COMMON_PORTS.filter((p) => [80, 443, 8080, 22, 53].includes(p.port))
        : COMMON_PORTS;

    const initialLines = [
      {
        text: `[INIT] Starting simulated TCP SYN probe against ${cleanTarget} (${profile.toUpperCase()} profile)`,
        type: 'info',
      },
      {
        text: `[INFO] Note: Browser sandbox cannot transmit raw TCP SYN packets; generating deterministic baseline telemetry.`,
        type: 'muted',
      },
    ];
    setLogs(initialLines);

    portsToScan.forEach((entry, idx) => {
      const timer = setTimeout(() => {
        const isOpen =
          entry.defaultOpen || (seed + entry.port) % 5 === 0;
        const latencyMs = 8 + ((seed + entry.port * 7) % 45);
        setLogs((prev) => [
          ...prev,
          {
            text: isOpen
              ? `[OPEN]     ${String(entry.port).padEnd(5, ' ')}/tcp   ${entry.service.padEnd(11, ' ')} (${latencyMs}ms)  banner="${entry.banner}"`
              : `[FILTERED] ${String(entry.port).padEnd(5, ' ')}/tcp   ${entry.service.padEnd(11, ' ')} no-response`,
            type: isOpen ? 'open' : 'closed',
          },
        ]);

        if (idx === portsToScan.length - 1) {
          const finishTimer = setTimeout(() => {
            setLogs((prev) => [
              ...prev,
              {
                text: `[DONE] Simulated baseline completed for ${cleanTarget} (${portsToScan.length} ports evaluated).`,
                type: 'info',
              },
            ]);
            setScanning(false);
          }, 180);
          timersRef.current.push(finishTimer);
        }
      }, (idx + 1) * 140);

      timersRef.current.push(timer);
    });
  };

  return (
    <div className="page-container">
      <Link to="/#toolkit" className="back-link">
        &larr; Back to Toolkit
      </Link>

      <div className="tool-container-card">
        <div className="tool-header">
          <h1>Port Scanner Simulator</h1>
          <p>
            Educational TCP service exposure &amp; baseline perimeter reconnaissance simulator.
          </p>
        </div>

        <hr className="post-divider" />

        <form onSubmit={runSimulatedScan} className="scanner-form">
          <div className="scanner-grid">
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="scanner-target">Target Host / IP</label>
              <input
                id="scanner-target"
                type="text"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="e.g., 192.168.1.10 or lab.internal"
                className="tool-input"
                disabled={scanning}
                required
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="scanner-profile">Probe Profile</label>
              <select
                id="scanner-profile"
                value={profile}
                onChange={(e) => setProfile(e.target.value)}
                className="osint-select"
                disabled={scanning}
              >
                <option value="common">Top Forensic &amp; Service Ports (13)</option>
                <option value="web">Web Perimeter (5)</option>
              </select>
            </div>
          </div>

          <button type="submit" className="btn-tool" disabled={scanning || !target.trim()}>
            {scanning ? 'PROBING PORTS...' : 'Run Baseline Scan'}
          </button>
        </form>

        <div className="scan-terminal" aria-live="polite">
          {logs.length === 0 ? (
            <div className="scan-line muted">
              Ready. Specify a target hostname or lab IP and click &ldquo;Run Baseline Scan&rdquo;.
            </div>
          ) : (
            logs.map((line, i) => (
              <div key={i} className={`scan-line ${line.type}`}>
                {line.text}
              </div>
            ))
          )}
        </div>

        <p className="privacy-note">
          Educational Simulator: Browsers restrict raw socket access; no external packets are transmitted to third-party hosts.
        </p>
      </div>
    </div>
  );
};

export default PortScanner;
