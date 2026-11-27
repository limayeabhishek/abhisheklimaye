import { applyCors, VercelRequest, VercelResponse } from './_lib/auth';

export default function handler(req: VercelRequest, res: VercelResponse) {
  applyCors(req, res, 'GET,OPTIONS');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Only GET requests are allowed.' });
    return;
  }

  res.status(200).json({ serverNow: Date.now() });
}
