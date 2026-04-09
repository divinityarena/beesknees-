// ============================================================
// The Bee's Knees 🐝 — Database Backup Script
// Usage: node backup.js
// Requires: DATABASE_URL environment variable
// Saves a timestamped JSON backup of all waggle votes
// Run manually or schedule with a cron job
// ============================================================

const { Pool } = require("pg");
const fs       = require("fs");
const path     = require("path");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function backup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename  = `beesknees-backup-${timestamp}.json`;
  const filepath  = path.join(__dirname, filename);

  console.log(`🐝 Starting backup at ${new Date().toISOString()}`);

  try {
    // Backup waggle votes
    const votes = await pool.query(
      `SELECT place_id, place_name, COUNT(*) as vote_count,
              MIN(created_at) as first_vote,
              MAX(created_at) as last_vote
       FROM waggle_votes
       GROUP BY place_id, place_name
       ORDER BY vote_count DESC`
    );

    // Full raw votes (anonymised — no voter hashes)
    const raw = await pool.query(
      `SELECT place_id, place_name, created_at
       FROM waggle_votes
       ORDER BY created_at DESC`
    );

    const backup = {
      exported_at:   new Date().toISOString(),
      total_votes:   raw.rows.length,
      unique_places: votes.rows.length,
      summary:       votes.rows,
      raw_votes:     raw.rows,
    };

    fs.writeFileSync(filepath, JSON.stringify(backup, null, 2));

    console.log(`✅ Backup saved: ${filename}`);
    console.log(`   Total votes:   ${backup.total_votes}`);
    console.log(`   Unique places: ${backup.unique_places}`);
    console.log(`\n🏆 Top 10 most agreed places:`);
    votes.rows.slice(0, 10).forEach((r, i) => {
      console.log(`   ${i + 1}. ${r.place_name} — ${r.vote_count} votes`);
    });

  } catch (err) {
    console.error("❌ Backup failed:", err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

backup();
