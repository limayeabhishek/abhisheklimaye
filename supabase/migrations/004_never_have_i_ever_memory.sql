-- ============================================================================
-- Migration: 004_never_have_i_ever_memory.sql
-- Purpose: Extend truth_or_dare_memory.mode check constraint to also track
--          rolling 10-game context memory for Never Have I Ever genres
--          without deleting any existing data.
-- Idempotent: Safe to re-run in the Supabase SQL Editor.
-- ============================================================================

ALTER TABLE public.truth_or_dare_memory
  DROP CONSTRAINT IF EXISTS truth_or_dare_memory_mode_check;

ALTER TABLE public.truth_or_dare_memory
  ADD CONSTRAINT truth_or_dare_memory_mode_check
  CHECK (
    mode IN (
      'partner',
      'friends',
      'nhie_childhood',
      'nhie_adults',
      'nhie_college',
      'nhie_relationships'
    )
  );
