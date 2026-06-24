-- Add nominated column to waggle_votes
-- Run in Supabase → SQL Editor before deploying

ALTER TABLE waggle_votes
  ADD COLUMN IF NOT EXISTS nominated BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_waggle_votes_nominated
  ON waggle_votes(nominated) WHERE nominated = true;
