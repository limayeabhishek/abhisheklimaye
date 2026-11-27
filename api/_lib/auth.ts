import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { IncomingMessage, ServerResponse } from 'http';

export interface VercelRequest extends IncomingMessage {
  body?: unknown;
  query?: Record<string, string | string[]>;
}

export interface VercelResponse extends ServerResponse {
  status: (statusCode: number) => VercelResponse;
  json: (body: unknown) => VercelResponse;
}

export interface UserProfileRow {
  id: string;
  email: string;
  display_name: string | null;
  role: 'user' | 'admin';
  status: 'active' | 'disabled';
}

export function getAllowedOrigin(originHeader: string | undefined): string | null {
  if (!originHeader) return null;
  if (originHeader === 'https://abhisheklimaye.vercel.app') return originHeader;
  if (/^https?:\/\/localhost(:\d+)?$/i.test(originHeader)) return originHeader;
  if (/^https?:\/\/127\.0\.0\.1(:\d+)?$/i.test(originHeader)) return originHeader;
  return null;
}

export function applyCors(req: VercelRequest, res: VercelResponse, methods = 'POST,OPTIONS') {
  const allowedOrigin = getAllowedOrigin(
    typeof req.headers.origin === 'string' ? req.headers.origin : undefined
  );
  if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
}

export function getAccessToken(req: VercelRequest): string | null {
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
          const parsed = JSON.parse(
            raw.startsWith('base64-') ? Buffer.from(raw.slice(7), 'base64').toString('utf8') : raw
          );
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

export function parseJsonBody(req: VercelRequest): Record<string, unknown> {
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  if (!body || typeof body !== 'object') return {};
  return body as Record<string, unknown>;
}

export async function authenticateActiveUser(
  req: VercelRequest,
  res: VercelResponse,
  options: { requireAdmin?: boolean } = {}
): Promise<{ supabaseAdmin: SupabaseClient; userId: string; profile: UserProfileRow } | null> {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    res.status(500).json({
      error: 'SERVER_CONFIG_ERROR',
      message: 'Supabase server environment variables are not configured.',
    });
    return null;
  }

  const token = getAccessToken(req);
  if (!token) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing authentication token.' });
    return null;
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !userData?.user) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid or expired session token.' });
    return null;
  }

  const userId = userData.user.id;
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, email, display_name, role, status')
    .eq('id', userId)
    .single();

  if (profileError || !profile || profile.status !== 'active') {
    res.status(403).json({
      error: 'FORBIDDEN',
      message: 'Active operator account required.',
    });
    return null;
  }

  if (options.requireAdmin && profile.role !== 'admin') {
    res.status(403).json({
      error: 'FORBIDDEN',
      message: 'Active administrator privileges required.',
    });
    return null;
  }

  return {
    supabaseAdmin,
    userId,
    profile: profile as UserProfileRow,
  };
}
