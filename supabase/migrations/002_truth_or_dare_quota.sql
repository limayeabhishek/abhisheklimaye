-- ============================================================================
-- Migration: 002_truth_or_dare_quota.sql
-- Purpose: Per-user Truth or Dare game quota tracking (10 games per user),
--          RLS policies preventing client-side tampering, and atomic increment RPC.
-- Idempotent: Safe to re-run in the Supabase SQL Editor.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.truth_or_dare_sessions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  games_played integer NOT NULL DEFAULT 0 CHECK (games_played >= 0),
  max_games integer NOT NULL DEFAULT 10 CHECK (max_games > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.truth_or_dare_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own game quota" ON public.truth_or_dare_sessions;
CREATE POLICY "Users can view own game quota"
  ON public.truth_or_dare_sessions
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all game quotas" ON public.truth_or_dare_sessions;
CREATE POLICY "Admins can view all game quotas"
  ON public.truth_or_dare_sessions
  FOR SELECT
  USING (public.is_admin());

-- Atomic quota increment helper (executed exclusively by server via service_role)
CREATE OR REPLACE FUNCTION public.increment_truth_or_dare_quota(p_user_id uuid)
RETURNS TABLE (games_played integer, max_games integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.truth_or_dare_sessions (user_id, games_played, max_games, updated_at)
  VALUES (p_user_id, 0, 10, now())
  ON CONFLICT (user_id) DO NOTHING;

  RETURN QUERY
  UPDATE public.truth_or_dare_sessions AS t
  SET games_played = t.games_played + 1,
      updated_at = now()
  WHERE t.user_id = p_user_id
    AND t.games_played < t.max_games
  RETURNING t.games_played, t.max_games;
END;
$$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT ON public.truth_or_dare_sessions TO authenticated;
GRANT ALL ON public.truth_or_dare_sessions TO service_role;
REVOKE ALL ON FUNCTION public.increment_truth_or_dare_quota(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_truth_or_dare_quota(uuid) TO service_role;
