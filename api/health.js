module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  return res.status(200).json({
    status: 'ONLINE',
    service: 'Abhishek Limaye Portfolio Vercel Functions',
    timestamp: new Date().toISOString(),
    features: {
      ultron: {
        active: !!process.env.GEMINI_API_KEY,
        model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite'
      },
      osint: {
        active: true,
        hibpConfigured: !!process.env.HIBP_API_KEY
      }
    }
  });
};
