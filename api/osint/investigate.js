const { runInvestigation } = require('../../server/services/osint');

function getAllowedOrigin(origin) {
  if (!origin || typeof origin !== 'string') return null;
  if (
    origin === 'https://abhisheklimaye.vercel.app' ||
    origin === 'https://limayeabhishek.github.io' ||
    /^https?:\/\/localhost(:\d+)?$/i.test(origin) ||
    /^https?:\/\/127\.0\.0\.1(:\d+)?$/i.test(origin)
  ) {
    return origin;
  }
  return null;
}

module.exports = async function handler(req, res) {
  const allowedOrigin = getAllowedOrigin(req.headers && req.headers.origin);
  if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Only POST requests allowed.' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (_) {}
    }
    body = body || {};

    const { target, type } = body;

    if (!target || typeof target !== 'string' || !target.trim()) {
      return res.status(400).json({
        error: 'INVALID_TARGET',
        message: 'Target identifier is required.'
      });
    }

    if (target.length > 256) {
      return res.status(400).json({
        error: 'TARGET_TOO_LONG',
        message: 'Target string exceeds maximum allowable length.'
      });
    }

    const report = await runInvestigation(target, type);
    return res.status(200).json(report);
  } catch (err) {
    console.error('OSINT serverless error:', err.message || err);
    return res.status(400).json({
      error: 'INVESTIGATION_FAILED',
      message: err.message || 'OSINT investigation could not be completed.'
    });
  }
};
