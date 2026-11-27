-- ============================================================================
-- Migration: 003_truth_or_dare_memory.sql
-- Purpose: Rolling 10-game AI context memory per user (unlimited plays,
--          prevents repeating prompts across the last 10 games).
-- Idempotent: Safe to re-run in the Supabase SQL Editor.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.truth_or_dare_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('partner', 'friends')),
  prompts jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tod_memory_user_created
  ON public.truth_or_dare_memory (user_id, created_at DESC);

ALTER TABLE public.truth_or_dare_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own game memory" ON public.truth_or_dare_memory;
CREATE POLICY "Users can view own game memory"
  ON public.truth_or_dare_memory
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all game memory" ON public.truth_or_dare_memory;
CREATE POLICY "Admins can view all game memory"
  ON public.truth_or_dare_memory
  FOR SELECT
  USING (public.is_admin());

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT ON public.truth_or_dare_memory TO authenticated;
GRANT ALL ON public.truth_or_dare_memory TO service_role;
