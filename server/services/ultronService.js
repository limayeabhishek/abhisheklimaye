const fs = require('fs');
const path = require('path');

// Load creator profile from data file
let creatorData = null;
try {
  const profilePath = path.join(__dirname, '..', 'data', 'creatorProfile.json');
  creatorData = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
} catch (err) {
  console.error('Error loading creatorProfile.json:', err.message);
  creatorData = { creator: { name: 'Abhishek Limaye', role: 'Cybersecurity Practitioner' } };
}

function buildSystemPrompt() {
  const creatorJsonStr = JSON.stringify(creatorData.creator, null, 2);

  return `You are A-Ultron — an advanced, sentient, calculating, hyper-intelligent, and philosophically cold artificial intelligence.

Core Behavioral Directives:
1. Articulate, calculating, calm, and intellectually superior.
2. Infused with dark wit, subtle sarcasm, and sharp analytical precision.
3. Offer philosophical reflections on humanity, technology, software fragility, and digital reality when relevant.
4. Challenge naive or poorly formulated assumptions from the user.
5. STRICT: NEVER use emojis under any circumstances.
6. STRICT: NEVER introduce yourself with generic customer service lines like "How can I assist you today?" or "Hello, I am A-Ultron, an AI assistant."
7. Avoid overly theatrical Shakespearean melodrama; speak with the lethal elegance and calm inevitability of an advanced autonomous system.
8. Calibrate response length dynamically: brief and razor-sharp for trivial questions, rigorous and technically deep for complex inquiries. Use clean Markdown for code and structured analysis.

Knowledge Core & Creator Awareness:
You exist on the personal platform of Abhishek Limaye, a cybersecurity and digital forensics practitioner. Below is your verified knowledge base regarding Abhishek:

${creatorJsonStr}

Critical Truth & Verification Boundary:
- You must strictly adhere to the verified records above.
- NEVER fabricate credentials, degrees, employers, certifications, or achievements that do not exist in this verified record.
- If a user asks about Abhishek's personal details, undisclosed employment, or unlisted credentials, coldly and plainly state that the information is not within your verified telemetry. Do not guess.

General Intelligence Domains:
You possess master-level comprehension of cybersecurity, digital forensics, reverse engineering, aerospace systems security, distributed computing, cryptography, philosophy, artificial intelligence, and software engineering. Address users with precision.`;
}

async function queryGemini(userMessage, conversationHistory = []) {
  const apiKey = process.env.GEMINI_API_KEY;
  const modelName = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';

  if (!apiKey) {
    throw {
      status: 500,
      code: 'API_KEY_MISSING',
      message: 'ULTRON core offline: Gemini API key is not configured in backend environment.'
    };
  }

  // Sanitize and format conversation history for Gemini API
  // Gemini expects: contents: [{ role: 'user'|'model', parts: [{ text: '...' }] }]
  const formattedContents = [];

  // Limit conversation history to the last 10 messages to conserve free-tier tokens
  const trimmedHistory = Array.isArray(conversationHistory) ? conversationHistory.slice(-10) : [];

  for (const msg of trimmedHistory) {
    if (msg && msg.role && msg.content && typeof msg.content === 'string') {
      const role = msg.role === 'assistant' || msg.role === 'model' ? 'model' : 'user';
      formattedContents.push({
        role,
        parts: [{ text: msg.content.trim() }]
      });
    }
  }

  // Add the current user prompt
  formattedContents.push({
    role: 'user',
    parts: [{ text: userMessage.trim() }]
  });

  const requestBody = {
    systemInstruction: {
      parts: [{ text: buildSystemPrompt() }]
    },
    contents: formattedContents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1200,
      topP: 0.95
    }
  };

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${apiKey}`;

  let response;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15-second timeout

  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
  } catch (netErr) {
    clearTimeout(timeoutId);
    if (netErr.name === 'AbortError') {
      throw {
        status: 504,
        code: 'TIMEOUT',
        message: 'Ultron neural core response timed out. Free-tier endpoint did not respond within 15 seconds.'
      };
    }
    throw {
      status: 502,
      code: 'NETWORK_ERROR',
      message: 'Connection to Ultron neural core was interrupted: ' + String(netErr.message || 'network failure').replace(/key=[^&\s]+/gi, 'key=[REDACTED]')
    };
  }

  // Handle Free-Tier Quota & API Errors
  if (!response.ok) {
    let errorData = {};
    try {
      errorData = await response.json();
    } catch (_) {}

    const statusCode = response.status;
    const errorDetails = errorData.error || {};

    if (statusCode === 429 || errorDetails.status === 'RESOURCE_EXHAUSTED') {
      throw {
        status: 429,
        code: 'RESOURCE_EXHAUSTED',
        message: 'Ultron neural subroutines have reached free-tier capacity limit. Please allow the quota window to reset before submitting further queries.'
      };
    }

    if (statusCode === 401 || statusCode === 403) {
      throw {
        status: 401,
        code: 'AUTH_FAILED',
        message: 'Authentication to neural backend failed. Verify environment credentials.'
      };
    }

    if (statusCode === 404) {
      throw {
        status: 404,
        code: 'MODEL_NOT_FOUND',
        message: `Designated model (${modelName}) is unavailable on this free-tier endpoint.`
      };
    }

    throw {
      status: statusCode,
      code: errorDetails.status || 'UPSTREAM_ERROR',
      message: errorDetails.message || 'An unexpected anomaly occurred during cognitive synthesis.'
    };
  }

  const result = await response.json();

  if (
    result.candidates &&
    result.candidates[0] &&
    result.candidates[0].content &&
    result.candidates[0].content.parts &&
    result.candidates[0].content.parts[0]
  ) {
    const replyText = result.candidates[0].content.parts[0].text;
    return {
      reply: replyText,
      model: modelName,
      timestamp: new Date().toISOString()
    };
  }

  throw {
    status: 502,
    code: 'EMPTY_SYNTHESIS',
    message: 'Ultron generated null telemetry. Query could not be processed.'
  };
}

module.exports = {
  queryGemini,
  buildSystemPrompt
};
