-- ============================================================
-- The Bee's Knees — Supabase Database Setup
-- Run this entire file in Supabase → SQL Editor
-- Safe to re-run — uses IF NOT EXISTS and DROP POLICY IF EXISTS
-- ============================================================

-- ── 1. waggle_votes ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS waggle_votes (
  place_id     TEXT        NOT NULL,
  place_name   TEXT        NOT NULL,
  voter_hash   TEXT        NOT NULL,
  search_query TEXT,
  area_lat     FLOAT,
  area_lng     FLOAT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (place_id, voter_hash)
);

-- Index for fast vote counts by place (critical at scale)
CREATE INDEX IF NOT EXISTS idx_waggle_votes_place_id ON waggle_votes(place_id);

-- RLS: public read (vote counts visible to all), server writes via service key
ALTER TABLE waggle_votes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read waggle_votes" ON waggle_votes;
CREATE POLICY "Anyone can read waggle_votes"
  ON waggle_votes FOR SELECT USING (true);

-- ── 2. user_votes ─────────────────────────────────────────────
-- Per-user vote history shown on profile page
CREATE TABLE IF NOT EXISTS user_votes (
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  place_id   TEXT        NOT NULL,
  place_name TEXT        NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, place_id)
);

CREATE INDEX IF NOT EXISTS idx_user_votes_user_id ON user_votes(user_id);

ALTER TABLE user_votes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own votes" ON user_votes;
CREATE POLICY "Users can read own votes"
  ON user_votes FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own votes" ON user_votes;
CREATE POLICY "Users can insert own votes"
  ON user_votes FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own votes" ON user_votes;
CREATE POLICY "Users can delete own votes"
  ON user_votes FOR DELETE USING (auth.uid() = user_id);

-- ── 3. profiles ───────────────────────────────────────────────
-- Saved city + Buzzy Bee high score per user
CREATE TABLE IF NOT EXISTS profiles (
  id           UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  city         TEXT,
  flappy_best  INTEGER     DEFAULT 0,
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users can upsert own profile" ON profiles;
CREATE POLICY "Users can upsert own profile"
  ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);

-- ── Done ──────────────────────────────────────────────────────
-- Verify in Supabase → Table Editor:
-- waggle_votes, user_votes, profiles should all appear with RLS enabled.
