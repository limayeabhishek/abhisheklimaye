import { createClient } from '@supabase/supabase-js';
import type { IncomingMessage, ServerResponse } from 'http';

interface VercelRequest extends IncomingMessage {
  body?: unknown;
  query?: Record<string, string | string[]>;
}

interface VercelResponse extends ServerResponse {
  status: (statusCode: number) => VercelResponse;
  json: (body: unknown) => VercelResponse;
}

function getAccessToken(req: VercelRequest): string | null {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }

  const cookieHeader = req.headers.cookie;
  if (typeof cookieHeader === 'string') {
    const cookies = cookieHeader.split(';').map((c) => c.trim());
    for (const cookie of cookies) {
      if (cookie.startsWith('sb-access-token=')) {
        return decodeURIComponent(cookie.slice('sb-access-token='.length));
      }
      const match = cookie.match(/^sb-[a-z0-9-]+-auth-token=(.+)$/i);
      if (match) {
        try {
          const raw = decodeURIComponent(match[1]);
          const parsed = JSON.parse(raw.startsWith('base64-') ? Buffer.from(raw.slice(7), 'base64').toString('utf8') : raw);
          if (Array.isArray(parsed) && typeof parsed[0] === 'string') return parsed[0];
          if (parsed && typeof parsed.access_token === 'string') return parsed.access_token;
        } catch {
          // Ignore malformed cookie
        }
      }
    }
  }

  return null;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getAllowedOrigin(originHeader: string | undefined): string | null {
  if (!originHeader) return null;
  if (originHeader === 'https://abhisheklimaye.vercel.app') return originHeader;
  if (/^https?:\/\/localhost(:\d+)?$/i.test(originHeader)) return originHeader;
  if (/^https?:\/\/127\.0\.0\.1(:\d+)?$/i.test(originHeader)) return originHeader;
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const allowedOrigin = getAllowedOrigin(
    typeof req.headers.origin === 'string' ? req.headers.origin : undefined
  );
  if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Only POST requests are allowed.' });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    res.status(500).json({
      error: 'SERVER_CONFIG_ERROR',
      message: 'Supabase server environment variables are not configured.'
    });
    return;
  }

  const token = getAccessToken(req);
  if (!token) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing authentication token.' });
    return;
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !userData?.user) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid or expired session token.' });
    return;
  }

  const callerId = userData.user.id;
  const { data: callerProfile, error: callerError } = await supabaseAdmin
    .from('profiles')
    .select('id, role, status')
    .eq('id', callerId)
    .single();

  if (callerError || !callerProfile || callerProfile.role !== 'admin' || callerProfile.status !== 'active') {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Active administrator privileges required.' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }

  const payload = (body || {}) as { userId?: unknown; action?: unknown };
  const userId = typeof payload.userId === 'string' ? payload.userId.trim() : '';
  const action = payload.action === 'disable' || payload.action === 'enable' ? payload.action : null;

  if (!userId || !UUID_REGEX.test(userId) || !action) {
    res.status(400).json({ error: 'INVALID_PAYLOAD', message: 'Valid userId UUID and action (disable | enable) are required.' });
    return;
  }

  if (userId === callerId && action === 'disable') {
    res.status(400).json({ error: 'SELF_DISABLE_FORBIDDEN', message: 'Administrators cannot disable their own account.' });
    return;
  }

  const nextStatus = action === 'disable' ? 'disabled' : 'active';

  const { data: updatedProfile, error: updateError } = await supabaseAdmin
    .from('profiles')
    .update({ status: nextStatus })
    .eq('id', userId)
    .select('id, email, display_name, role, status, created_at')
    .single();

  if (updateError || !updatedProfile) {
    res.status(400).json({
      error: 'UPDATE_FAILED',
      message: updateError?.message || 'Unable to update user status.'
    });
    return;
  }

  if (action === 'disable') {
    try {
      await supabaseAdmin.auth.admin.signOut(userId, 'global');
    } catch {
      try {
        await (supabaseAdmin.auth.admin as unknown as { signOut: (id: string) => Promise<unknown> }).signOut(userId);
      } catch (signOutErr) {
        console.error('Admin signOut warning:', signOutErr);
      }
    }
  }

  res.status(200).json({ success: true, profile: updatedProfile });
}
