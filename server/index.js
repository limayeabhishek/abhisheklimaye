require('dotenv').config();

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const sgMail = require('@sendgrid/mail');

const { queryGemini } = require('./services/ultronService');
const { runInvestigation } = require('./services/osint');

const app = express();
const port = process.env.PORT || 3001;

// Setup SendGrid if configured
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

// Global Middleware
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// General Rate Limiting: 100 requests per 15 minutes per IP
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'TOO_MANY_REQUESTS', message: 'Too many requests from this IP, please try again later.' }
});
app.use(globalLimiter);

// Specific Rate Limiter for ULTRON AI (protect free-tier RPM quota)
const ultronLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 15, // max 15 requests/min per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'RESOURCE_EXHAUSTED', message: 'Ultron query limit reached. Please wait a moment before sending another message.' }
});

// Specific Rate Limiter for OSINT (respect public registries)
const osintLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20, // max 20 investigations/min per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'RATE_LIMITED', message: 'OSINT investigation rate limit reached. Please allow network requests to settle.' }
});

// --- Health / Status Endpoint ---
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ONLINE',
    service: 'Abhishek Limaye Portfolio Backend',
    timestamp: new Date().toISOString(),
    features: {
      ultron: {
        active: !!process.env.GEMINI_API_KEY,
        model: process.env.GEMINI_MODEL || 'gemini-3.8-flash'
      },
      osint: {
        active: true,
        hibpConfigured: !!process.env.HIBP_API_KEY
      },
      sendgrid: {
        active: !!process.env.SENDGRID_API_KEY
      }
    }
  });
});

// --- ULTRON AI Chat Endpoint ---
app.post('/api/ultron/chat', ultronLimiter, async (req, res) => {
  try {
    const { message, history } = req.body;

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
    res.json(response);
  } catch (err) {
    console.error('Ultron execution error:', err.message || err);
    const statusCode = err.status || 500;
    res.status(statusCode).json({
      error: err.code || 'ULTRON_ERROR',
      message: err.message || 'An error occurred while communicating with the Ultron core.'
    });
  }
});

// --- Professional OSINT Investigation Endpoint ---
app.post('/api/osint/investigate', osintLimiter, async (req, res) => {
  try {
    const { target, type } = req.body;

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
    res.json(report);
  } catch (err) {
    console.error('OSINT execution error:', err.message);
    res.status(400).json({
      error: 'INVESTIGATION_FAILED',
      message: err.message || 'OSINT investigation could not be completed.'
    });
  }
});

// --- Existing Toolkit Endpoints (Preserved for backward compatibility) ---
app.post('/api/identity-search', (req, res) => {
  const { name, keywords } = req.body;
  if (!name || !keywords) {
    return res.status(400).json({ error: 'Name and keywords are required.' });
  }

  const sanitizedName = name.toLowerCase().replace(/\s/g, '');
  const encodedName = encodeURIComponent(name);
  const encodedKeywords = encodeURIComponent(keywords);

  const mockResults = [
    {
      title: `LinkedIn Profile: ${name}`,
      url: `https://www.linkedin.com/in/${sanitizedName}`,
      snippet: `Professional details for ${name} based on keywords like "${keywords}".`,
    },
    {
      title: `GitHub Profile: ${name.split(' ')[0]}`,
      url: `https://github.com/${sanitizedName}`,
      snippet: `Open-source projects and contributions from ${name} related to "${keywords}".`,
    },
    {
      title: `Academic Publication: "${keywords}" by ${name}`,
      url: `https://scholar.google.com/scholar?q=${encodedName}+${encodedKeywords}`,
      snippet: `A simulated academic paper or research mentioning ${name} and "${keywords}".`,
    }
  ];

  setTimeout(() => {
    res.json({
      query: { name, keywords },
      results: mockResults,
      message: 'Simulated demonstration search.',
    });
  }, 600);
});

app.post('/api/artifact-scan', (req, res) => {
  const { hash } = req.body;
  if (!hash) {
    return res.status(400).json({ error: 'Hash value is required.' });
  }

  let status = 'Clean';
  let detectionRate = '0/70';
  let details = 'No threats detected by verified hashes.';

  if (hash.startsWith('e3b0c442') || hash.startsWith('d41d8cd9')) {
    status = 'Clean';
    detectionRate = '0/70';
    details = 'Hash matches a verified clean baseline file.';
  }

  setTimeout(() => {
    res.json({
      hash,
      status,
      detectionRate,
      details,
      message: 'Demonstration artifact scan.',
    });
  }, 600);
});

// --- Existing Contact Form Endpoint (Preserved) ---
app.post('/api/contact', async (req, res) => {
  const { name, email, phoneNumber, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ msg: 'Please enter all required fields: Name, Email, and Message.' });
  }

  if (!process.env.SENDGRID_API_KEY) {
    return res.status(200).json({ msg: 'Message received. (SendGrid not configured in this environment).' });
  }

  const msg = {
    to: process.env.EMAIL_TO,
    from: process.env.EMAIL_FROM,
    subject: `New Contact Form Message from ${name}`,
    html: `
      <p>New message from portfolio contact form:</p>
      <ul>
        <li><strong>Name:</strong> ${name}</li>
        <li><strong>Email:</strong> ${email}</li>
        <li><strong>Phone:</strong> ${phoneNumber || 'N/A'}</li>
      </ul>
      <p><strong>Message:</strong></p>
      <p>${message}</p>
    `,
    replyTo: email,
  };

  res.status(200).json({ msg: 'Your message has been received. Thank you!' });

  try {
    await sgMail.send(msg);
  } catch (error) {
    console.error('SendGrid Error:', error.message);
  }
});

app.post('/api/test-sendgrid', async (req, res) => {
  if (!process.env.SENDGRID_API_KEY) {
    return res.status(400).json({ msg: 'SENDGRID_API_KEY is not configured.' });
  }

  try {
    await sgMail.send({
      to: process.env.EMAIL_TO,
      from: process.env.EMAIL_FROM,
      subject: 'SendGrid Test from Portfolio App',
      text: 'Test message from portfolio backend.',
    });
    res.status(200).json({ msg: `Test email sent to ${process.env.EMAIL_TO}` });
  } catch (error) {
    res.status(500).json({ msg: 'SendGrid test failed: ' + error.message });
  }
});

app.listen(port, () => {
  console.log(`Backend server listening at http://localhost:${port}`);
  console.log(`Ultron AI: Model configured as ${process.env.GEMINI_MODEL || 'gemini-3.8-flash'}`);
});

process.on('uncaughtException', (err, origin) => {
  console.error('Caught exception:', err);
});
