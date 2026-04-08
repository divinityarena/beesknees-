// ============================================================
// The Bee's Knees 🐝 — Backend Server
// ============================================================

const express  = require("express");
const cors     = require("cors");
const path     = require("path");
const fs       = require("fs");
const crypto   = require("crypto");
const { Pool } = require("pg");

const app  = express();
const PORT = process.env.PORT || 3000;

// ── API Keys (from environment variables only — never hardcode) ─
const GOOGLE_API_KEY     = process.env.GOOGLE_API_KEY;
const FOURSQUARE_API_KEY = process.env.FOURSQUARE_API_KEY;

if (!GOOGLE_API_KEY)     console.error("❌ Missing GOOGLE_API_KEY");
if (!FOURSQUARE_API_KEY) console.error("❌ Missing FOURSQUARE_API_KEY");

// ── PostgreSQL — Waggle Votes ─────────────────────────────────
const pool = process.env.DATABASE_URL ? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
}) : null;

async function initDB() {
  if (!pool) return console.log("⚠️  No DATABASE_URL — waggle votes disabled");
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS waggle_votes (
        place_id    TEXT NOT NULL,
        place_name  TEXT NOT NULL,
        voter_hash  TEXT NOT NULL,
        created_at  TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (place_id, voter_hash)
      );
    `);
    console.log("🐝 Waggle votes DB ready");
  } catch (e) {
    console.error("DB init error:", e.message);
  }
}
initDB();

app.use(cors());
app.use(express.json());

// ── Serve HTML files ──────────────────────────────────────────
const HTML_DIR = __dirname;
console.log(`📁 Serving HTML from: ${HTML_DIR}`);
console.log(`📁 Files: ${fs.readdirSync(HTML_DIR).join(", ")}`);

app.get("/", (_req, res) => {
  const p = path.join(HTML_DIR, "index.html");
  fs.existsSync(p) ? res.sendFile(p) : res.status(404).send("index.html not found");
});

app.get("/about", (_req, res) => {
  const p = path.join(HTML_DIR, "about.html");
  fs.existsSync(p) ? res.sendFile(p) : res.status(404).send("about.html not found");
});

app.get("/about.html", (_req, res) => {
  const p = path.join(HTML_DIR, "about.html");
  fs.existsSync(p) ? res.sendFile(p) : res.status(404).send("about.html not found");
});

// ── Debug endpoint (temporary) ───────────────────────────────
app.get("/debug-key", (_req, res) => {
  const key = process.env.GOOGLE_API_KEY || "NOT SET";
  res.json({
    key_prefix:  key.slice(0, 12) + "...",
    key_length:  key.length,
    fsq_prefix:  (process.env.FOURSQUARE_API_KEY || "NOT SET").slice(0, 8) + "...",
  });
});

// ── Health check ──────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "🐝 The Bee's Knees server is buzzing!" });
});

// ── Waggle Vote: POST /vote ───────────────────────────────────
app.post("/vote", async (req, res) => {
  if (!pool) return res.status(503).json({ error: "Votes not available — no database connected" });
  const { place_id, place_name, voter_id } = req.body;
  if (!place_id || !voter_id) return res.status(400).json({ error: "Missing place_id or voter_id" });

  const voter_hash = crypto.createHash("sha256").update(voter_id).digest("hex");

  try {
    await pool.query(
      `INSERT INTO waggle_votes (place_id, place_name, voter_hash)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [place_id, place_name || "Unknown", voter_hash]
    );
    const { rows } = await pool.query(
      `SELECT COUNT(*) as total FROM waggle_votes WHERE place_id = $1`,
      [place_id]
    );
    res.json({ success: true, total: parseInt(rows[0].total) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Waggle Votes: GET /votes?place_ids=id1,id2 ───────────────
app.get("/votes", async (req, res) => {
  if (!pool) return res.json({ votes: {} });
  const ids = (req.query.place_ids || "").split(",").filter(Boolean);
  if (!ids.length) return res.json({ votes: {} });

  try {
    const { rows } = await pool.query(
      `SELECT place_id, COUNT(*) as total
       FROM waggle_votes WHERE place_id = ANY($1)
       GROUP BY place_id`,
      [ids]
    );
    const votes = {};
    rows.forEach(r => { votes[r.place_id] = parseInt(r.total); });
    res.json({ votes });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Geocode endpoint ─────────────────────────────────────────
// GET /geocode?address=Belfast
// Proxies Google Geocoding API server-side so referrer restrictions don't block it
app.get("/geocode", async (req, res) => {
  const { address } = req.query;
  if (!address) return res.status(400).json({ error: "Missing address param" });

  const isEircode = /^[A-Z]\d{2}\s*[A-Z0-9]{4}$/i.test(address.trim());
  const region    = isEircode ? "ie" : "gb";

  try {
    const url  = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&region=${region}&key=${GOOGLE_API_KEY}`;
    const resp = await fetch(url);
    const data = await resp.json();

    if (data.status === "OK" && data.results.length) {
      const { lat, lng } = data.results[0].geometry.location;
      return res.json({ lat, lng, formatted: data.results[0].formatted_address });
    }

    // Fallback without region bias
    const url2  = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_API_KEY}`;
    const resp2 = await fetch(url2);
    const data2 = await resp2.json();

    if (data2.status === "OK" && data2.results.length) {
      const { lat, lng } = data2.results[0].geometry.location;
      return res.json({ lat, lng, formatted: data2.results[0].formatted_address });
    }

    res.status(404).json({ error: `Could not find "${address}". Try your full postcode or town name.` });

  } catch (e) {
    res.status(500).json({ error: "Geocoding failed: " + e.message });
  }
});

// ── Main Search Endpoint ──────────────────────────────────────
// GET /google-places?lat=XX&lng=YY&query=pizza&radius=3000
app.get("/google-places", async (req, res) => {
  const { lat, lng, query, radius = 3000 } = req.query;

  if (!lat || !lng || !query) {
    return res.status(400).json({ error: "Missing required params: lat, lng, query" });
  }

  try {
    const [googleResult, fsqResult] = await Promise.allSettled([
      fetchGooglePlaces({ lat, lng, query, radius }),
      fetchFoursquarePlaces({ lat, lng, query, radius }),
    ]);

    const google = googleResult.status === "fulfilled" ? googleResult.value : [];
    const fsq    = fsqResult.status    === "fulfilled" ? fsqResult.value    : [];

    if (googleResult.status === "rejected") console.warn("Google failed:", googleResult.reason.message);
    if (fsqResult.status    === "rejected") console.warn("FSQ failed:",    fsqResult.reason.message);

    console.log(`📊 Google: ${google.length} · Foursquare: ${fsq.length}`);

    if (!google.length && !fsq.length) {
      return res.json({ results: [], sources: { google: 0, foursquare: 0 } });
    }

    const merged   = mergePlaces(google, fsq);
    const ranked   = rankAndLimit(merged, lat, lng);

    // Fetch opening hours for top results in parallel
    const withHours = await Promise.all(
      ranked.map(async (place) => {
        if (!place.place_id || place.source === "foursquare") return place;
        try {
          const hours = await fetchOpeningHours(place.place_id);
          return { ...place, ...hours };
        } catch { return place; }
      })
    );

    res.json({ results: withHours, sources: { google: google.length, foursquare: fsq.length } });

  } catch (err) {
    console.error("Error:", err.message);
    res.status(500).json({ error: "Failed to fetch places. " + err.message });
  }
});

// ── Google Places Nearby Search ───────────────────────────────
async function fetchGooglePlaces({ lat, lng, query, radius }) {
  const url = new URL("https://maps.googleapis.com/maps/api/place/nearbysearch/json");
  url.searchParams.set("location", `${lat},${lng}`);
  url.searchParams.set("radius",   radius);
  url.searchParams.set("keyword",  query);
  url.searchParams.set("key",      GOOGLE_API_KEY);

  const res  = await fetch(url.toString());
  const data = await res.json();

  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    throw new Error(`Google API: ${data.status} — ${data.error_message || ""}`);
  }

  return (data.results || []).map(p => ({
    source:          "google",
    name:            p.name,
    normalised_name: normaliseName(p.name),
    rating:          p.rating             ?? null,
    review_count:    p.user_ratings_total ?? 0,
    lat:             p.geometry?.location?.lat,
    lng:             p.geometry?.location?.lng,
    place_id:        p.place_id,
    maps_url:        `https://www.google.com/maps/place/?q=place_id:${p.place_id}`,
    vicinity:        p.vicinity || "",
    description:     buildGoogleDescription(p),
  }));
}

// ── Foursquare Places Search ──────────────────────────────────
async function fetchFoursquarePlaces({ lat, lng, query, radius }) {
  const url = new URL("https://api.foursquare.com/v3/places/search");
  url.searchParams.set("ll",     `${lat},${lng}`);
  url.searchParams.set("radius", radius);
  url.searchParams.set("query",  query);
  url.searchParams.set("limit",  "50");
  url.searchParams.set("fields", "fsq_id,name,geocodes,rating,stats,location,categories,price");

  const res  = await fetch(url.toString(), {
    headers: { Authorization: FOURSQUARE_API_KEY, Accept: "application/json" },
  });
  const data = await res.json();

  if (!res.ok) throw new Error(`Foursquare API: ${data.message || res.status}`);

  return (data.results || []).map(p => ({
    source:          "foursquare",
    name:            p.name,
    normalised_name: normaliseName(p.name),
    rating:          p.rating != null ? +(p.rating / 2).toFixed(1) : null,
    review_count:    p.stats?.total_ratings ?? 0,
    lat:             p.geocodes?.main?.latitude,
    lng:             p.geocodes?.main?.longitude,
    place_id:        p.fsq_id,
    maps_url:        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name + " " + (p.location?.formatted_address || ""))}`,
    vicinity:        p.location?.formatted_address || "",
    description:     buildFoursquareDescription(p),
  }));
}

// ── Description Builders ──────────────────────────────────────
function buildGoogleDescription(p) {
  const types = (p.types || [])
    .filter(t => !["point_of_interest","establishment","food","premise"].includes(t))
    .map(t => t.replace(/_/g, " "))
    .slice(0, 2);
  const parts = [];
  if (types.length) parts.push(capitaliseWords(types.join(" · ")));
  if (p.vicinity)   parts.push(p.vicinity.split(",")[0]);
  if (p.business_status === "TEMPORARILY_CLOSED") parts.push("⚠️ Temporarily closed");
  return parts.join(" — ") || null;
}

function buildFoursquareDescription(p) {
  const parts = [];
  const cat   = p.categories?.[0]?.name;
  if (cat) parts.push(cat);
  const addr  = p.location?.formatted_address;
  if (addr) parts.push(addr.split(",")[0]);
  if (p.price) {
    const priceStr = ["","£","££","£££","££££"][p.price] || "";
    if (priceStr) parts.push(priceStr);
  }
  return parts.join(" — ") || null;
}

function capitaliseWords(str) {
  return str.replace(/\b\w/g, c => c.toUpperCase());
}

// ── Merge Google + Foursquare ─────────────────────────────────
function mergePlaces(googlePlaces, fsqPlaces) {
  const merged  = [];
  const usedFsq = new Set();

  for (const g of googlePlaces) {
    const matchIdx = fsqPlaces.findIndex(
      (f, i) => !usedFsq.has(i) && isSimilar(g.normalised_name, f.normalised_name)
    );
    if (matchIdx !== -1) {
      const match = fsqPlaces[matchIdx];
      usedFsq.add(matchIdx);
      const combinedRating = (g.rating != null && match.rating != null)
        ? +((g.rating + match.rating) / 2).toFixed(2)
        : g.rating ?? match.rating;
      merged.push({
        ...g,
        rating:       combinedRating,
        review_count: g.review_count + match.review_count,
        sources:      ["google", "foursquare"],
        description:  g.description || match.description || null,
      });
    } else {
      merged.push({ ...g, sources: ["google"] });
    }
  }
  fsqPlaces.forEach((f, i) => {
    if (!usedFsq.has(i)) merged.push({ ...f, sources: ["foursquare"] });
  });
  return merged;
}

function isSimilar(a, b) {
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  const tokA = a.split(/\s+/), tokB = b.split(/\s+/);
  const shared = tokA.filter(t => t.length > 2 && tokB.includes(t));
  return shared.length >= Math.min(2, Math.min(tokA.length, tokB.length));
}

function normaliseName(name) {
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
}

// ── Hive Score™ ───────────────────────────────────────────────
// rating^3.0  — quality gaps are amplified (4.5★ meaningfully beats 4.4★)
// cap at 500  — review count plateaus sooner, hidden gems surface faster
// confidence  — penalises very low review counts
// waggle boost — up to +5 points from user votes
const HIVE_SCORE_MAX = Math.pow(5.0, 3.0)
  * Math.log10(510)
  * (1 - (1 / Math.log10(510)))
  * 1.05;

function confidence(reviews) {
  return 1 - (1 / Math.log10(reviews + 10));
}

function hiveScore(rating, reviews, dualSource, waggleVotes = 0) {
  const base       = Math.pow(rating, 3.0)
                   * Math.log10(Math.min(reviews, 500) + 10)
                   * confidence(reviews);
  const bonus      = dualSource ? 1.05 : 1.0;
  const score      = (base * bonus / HIVE_SCORE_MAX) * 100;
  const wagglePts  = Math.min(waggleVotes / 10, 5);
  return Math.min(Math.round((score + wagglePts) * 10) / 10, 100);
}

// ── Rank and return top 5 ─────────────────────────────────────
function rankAndLimit(places, userLat, userLng) {
  const scored = places
    .filter(p => p.rating !== null && p.rating > 0 && p.lat && p.lng)
    .map(p => ({
      ...p,
      maps_url:    p.maps_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((p.name || "") + " " + (p.vicinity || ""))}`,
      distance_km: haversineKm(userLat, userLng, p.lat, p.lng),
      hive_score:  hiveScore(p.rating, p.review_count || 0, p.sources?.length > 1),
    }))
    .sort((a, b) => b.hive_score - a.hive_score);

  console.log(`🐝 Ranked ${scored.length} places → returning top ${Math.min(scored.length, 5)}`);
  return scored.slice(0, 5);
}

// ── Opening Hours (Google Place Details) ─────────────────────
async function fetchOpeningHours(placeId) {
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields",   "opening_hours,business_status");
  url.searchParams.set("key",      GOOGLE_API_KEY);

  const res  = await fetch(url.toString());
  const data = await res.json();
  if (data.status !== "OK") return {};

  const oh = data.result?.opening_hours;
  const bs = data.result?.business_status;
  if (!oh) return { business_status: bs || null };

  const dayIndex  = new Date().getDay();
  const todayText = oh.weekday_text?.[dayIndex === 0 ? 6 : dayIndex - 1] || null;
  const isOpenNow = oh.open_now ?? null;
  let closingTime = null;
  if (todayText) {
    const match = todayText.match(/[–-]\s*(\d{1,2}:\d{2})/);
    if (match) closingTime = match[1];
  }
  return { is_open_now: isOpenNow, closing_time: closingTime, today_hours: todayText, business_status: bs || null };
}

// ── Haversine Distance ────────────────────────────────────────
function haversineKm(lat1, lng1, lat2, lng2) {
  const R    = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a    = Math.sin(dLat/2)**2
             + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return +(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(1);
}

function toRad(deg) { return deg * Math.PI / 180; }

// ── Keep-alive ping ──────────────────────────────────────────
// Pings own /health endpoint every 14 minutes to prevent
// Render free tier from spinning down
const RENDER_URL = process.env.RENDER_EXTERNAL_URL;

function keepAlive() {
  if (!RENDER_URL) return; // only runs in production on Render
  fetch(`${RENDER_URL}/health`)
    .then(() => console.log("🐝 Keep-alive ping sent"))
    .catch(e => console.warn("Keep-alive failed:", e.message));
}

setInterval(keepAlive, 14 * 60 * 1000); // every 14 minutes

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🐝 Bee's Knees server running → http://localhost:${PORT}\n`);
  // Send first ping after 1 minute to let server warm up
  setTimeout(keepAlive, 60 * 1000);
});
