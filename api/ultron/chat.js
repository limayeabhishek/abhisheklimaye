const { queryGemini } = require('../../server/services/ultronService');

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
  // Set CORS headers
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
    // Handle both parsed body and stringified body
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (_) {}
    }
    body = body || {};

    const { message, history } = body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({
        error: 'INVALID_INPUT',
        message: 'Message content cannot be empty.'
      });
    }

    if (message.length > 2000) {
      return res.status(400).json({
        error: 'INPUT_TOO_LONG',
        message: 'Message exceeds maximum allowable length of 2000 characters.'
      });
    }

    const response = await queryGemini(message, history || []);
    return res.status(200).json(response);
  } catch (err) {
    console.error('A-Ultron serverless error:', err.message || err);
    const statusCode = err.status || 500;
    return res.status(statusCode).json({
      error: err.code || 'ULTRON_ERROR',
      message: err.message || 'An error occurred while communicating with A-Ultron.'
    });
  }
};
