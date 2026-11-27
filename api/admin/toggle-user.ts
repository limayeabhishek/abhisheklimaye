import {
  applyCors,
  authenticateActiveUser,
  parseJsonBody,
  VercelRequest,
  VercelResponse,
} from '../_lib/auth';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applyCors(req, res, 'POST,OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Only POST requests are allowed.' });
    return;
  }

  const auth = await authenticateActiveUser(req, res, { requireAdmin: true });
  if (!auth) return;

  const { supabaseAdmin, userId: callerId } = auth;
  const payload = parseJsonBody(req);
  const userId = typeof payload.userId === 'string' ? payload.userId.trim() : '';
  const action =
    payload.action === 'disable' || payload.action === 'enable' || payload.action === 'reset-quota'
      ? payload.action
      : null;

  if (!userId || !UUID_REGEX.test(userId) || !action) {
    res.status(400).json({
      error: 'INVALID_PAYLOAD',
      message: 'Valid userId UUID and action (disable | enable | reset-quota) are required.',
    });
    return;
  }

  if (action === 'reset-quota') {
    const { data: existingQuota } = await supabaseAdmin
      .from('truth_or_dare_sessions')
      .select('max_games')
      .eq('user_id', userId)
      .maybeSingle();

    const maxGames = existingQuota?.max_games ?? 10;
    const { data: quotaRow, error: quotaErr } = await supabaseAdmin
      .from('truth_or_dare_sessions')
      .upsert(
        {
          user_id: userId,
          games_played: 0,
          max_games: maxGames,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )
      .select('user_id, games_played, max_games, updated_at')
      .single();

    if (quotaErr || !quotaRow) {
      res.status(400).json({
        error: 'QUOTA_RESET_FAILED',
        message: quotaErr?.message || 'Unable to reset user game quota.',
      });
      return;
    }

    res.status(200).json({ success: true, quota: quotaRow });
    return;
  }

  if (userId === callerId && action === 'disable') {
    res.status(400).json({
      error: 'SELF_DISABLE_FORBIDDEN',
      message: 'Administrators cannot disable their own account.',
    });
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
      message: updateError?.message || 'Unable to update user status.',
    });
    return;
  }

  if (action === 'disable') {
    try {
      await supabaseAdmin.auth.admin.signOut(userId, 'global');
    } catch {
      try {
        await (supabaseAdmin.auth.admin as unknown as { signOut: (id: string) => Promise<unknown> }).signOut(
          userId
        );
      } catch (signOutErr) {
        console.error('Admin signOut warning:', signOutErr);
      }
    }
  }

  res.status(200).json({ success: true, profile: updatedProfile });
}
