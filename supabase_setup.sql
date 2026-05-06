-- ============================================================
-- The Bee's Knees — Supabase Database Setup
-- Run this entire file in Supabase → SQL Editor
-- ============================================================

-- ── 1. waggle_votes ──────────────────────────────────────────
-- Stores anonymous community votes (voter identity is hashed)
-- Written by the SERVER using the service key (bypasses RLS)
-- Read publicly so vote counts appear for all users
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

-- RLS: anyone can read vote counts, only server (service key) can write
ALTER TABLE waggle_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read waggle_votes" ON waggle_votes;
CREATE POLICY "Anyone can read waggle_votes"
  ON waggle_votes FOR SELECT
  USING (true);

-- No INSERT/UPDATE policy needed for anon/authenticated users
-- Server uses service key which bypasses RLS entirely

-- ── 2. user_votes ─────────────────────────────────────────────
-- Stores per-user vote history (shown on profile page)
-- Only the owner can read or write their own votes
CREATE TABLE IF NOT EXISTS user_votes (
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  place_id   TEXT        NOT NULL,
  place_name TEXT        NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, place_id)
);

ALTER TABLE user_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own votes" ON user_votes;
CREATE POLICY "Users can read own votes"
  ON user_votes FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own votes" ON user_votes;
CREATE POLICY "Users can insert own votes"
  ON user_votes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own votes" ON user_votes;
CREATE POLICY "Users can delete own votes"
  ON user_votes FOR DELETE
  USING (auth.uid() = user_id);

-- ── 3. profiles ───────────────────────────────────────────────
-- Stores saved city and Buzzy Bee high score per user
CREATE TABLE IF NOT EXISTS profiles (
  id           UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  city         TEXT,
  flappy_best  INTEGER     DEFAULT 0,
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can upsert own profile" ON profiles;
CREATE POLICY "Users can upsert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can delete own profile" ON profiles;
CREATE POLICY "Users can delete own profile"
  ON profiles FOR DELETE
  USING (auth.uid() = id);

-- ── Done ──────────────────────────────────────────────────────
-- After running this, verify in Supabase → Table Editor:
-- waggle_votes, user_votes, profiles should all appear.
