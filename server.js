// ============================================================
// The Bee's Knees 🐝 — Backend Server
// ============================================================

const express          = require("express");
const cors             = require("cors");
const path             = require("path");
const fs               = require("fs");
const crypto           = require("crypto");
const { createClient } = require("@supabase/supabase-js");
const rateLimit        = require("express-rate-limit");

const app  = express();
const PORT = process.env.PORT || 3000;

// ── API Keys (from environment variables only — never hardcode) ─
const GOOGLE_API_KEY     = process.env.GOOGLE_API_KEY;
const FOURSQUARE_API_KEY = process.env.FOURSQUARE_API_KEY;

if (!GOOGLE_API_KEY)     console.error("❌ Missing GOOGLE_API_KEY");
if (!FOURSQUARE_API_KEY) console.error("❌ Missing FOURSQUARE_API_KEY");

// ── Supabase client (server-side, uses service key) ──────────
const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const supabase = (SUPABASE_URL && SUPABASE_SERVICE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;
if (supabase) {
  console.log("🐝 Supabase ready — waggle votes enabled");
} else {
  console.warn("⚠️  Missing SUPABASE_URL or SUPABASE_SERVICE_KEY — votes disabled");
}

// ── In-memory search cache (30 min TTL, max 500 entries) ──────
const searchCache  = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000;
function getCacheKey(lat, lng, query, radius) {
  return (+(+lat).toFixed(3)) + ":" + (+(+lng).toFixed(3)) + ":" + query.toLowerCase().trim() + ":" + radius;
}
function getCache(key) {
  const e = searchCache.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > CACHE_TTL_MS) { searchCache.delete(key); return null; }
  return e.data;
}
function setCache(key, data) {
  if (searchCache.size >= 500) {
    const oldest = [...searchCache.entries()].sort((a,b) => a[1].ts - b[1].ts)[0][0];
    searchCache.delete(oldest);
  }
  searchCache.set(key, { data, ts: Date.now() });
}

// ── CORS, body limit, rate limiters ──────────────────────────
// CORS — allow your domains plus any Render preview URLs
// origin is undefined for same-origin requests and server-to-server calls
const allowedOrigins = [
  "https://beesknees.best",
  "https://www.beesknees.best",
  "http://beesknees.best",
  "http://www.beesknees.best",
  "https://beesknees.onrender.com",
  "http://localhost:3000",
  "http://localhost:8080",
];
app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (server-side, curl, health checks)
    if (!origin) return cb(null, true);
    // Allow any *.onrender.com URL (preview deployments)
    if (origin.endsWith(".onrender.com")) return cb(null, true);
    // Allow listed origins
    if (allowedOrigins.includes(origin)) return cb(null, true);
    console.warn(`CORS blocked origin: ${origin}`);
    cb(new Error("Not allowed by CORS"));
  },
}));
app.use(express.json({ limit: "50kb" }));

const searchLimiter  = rateLimit({ windowMs: 60000, max: 30,  message: { error: "Too many searches — please wait a moment." } });
const voteLimiter    = rateLimit({ windowMs: 60000, max: 20,  message: { error: "Too many votes — please slow down." } });
const geocodeLimiter = rateLimit({ windowMs: 60000, max: 60,  message: { error: "Too many location requests — please wait." } });

// ── Serve static files (ads.js, etc.) ────────────────────────
const HTML_DIR = __dirname;
app.use(express.static(HTML_DIR, { index: false }));
console.log(`📁 Serving static files from: ${HTML_DIR}`);
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

app.get("/profile", (_req, res) => {
  const p = path.join(HTML_DIR, "profile.html");
  fs.existsSync(p) ? res.sendFile(p) : res.status(404).send("profile.html not found");
});

// ── Health check ──────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "🐝 The Bee's Knees server is buzzing!" });
});

// ── Waggle Vote: POST /vote ───────────────────────────────────
app.post("/vote", voteLimiter, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: "Votes not available — database not connected" });
  const { place_id, place_name, voter_id, search_query, area_lat, area_lng } = req.body;
  if (!place_id || !voter_id) return res.status(400).json({ error: "Missing place_id or voter_id" });

  const voter_hash = crypto.createHash("sha256").update(String(voter_id)).digest("hex");

  try {
    const { error: insertErr } = await supabase
      .from("waggle_votes")
      .upsert({
        place_id:     String(place_id).slice(0, 200),
        place_name:   String(place_name || "Unknown").slice(0, 200),
        voter_hash,
        search_query: search_query ? String(search_query).slice(0, 100) : null,
        area_lat:     area_lat ? +area_lat : null,
        area_lng:     area_lng ? +area_lng : null,
      }, { onConflict: "place_id,voter_hash", ignoreDuplicates: true });

    if (insertErr) throw new Error(insertErr.message);

    const { count, error: countErr } = await supabase
      .from("waggle_votes")
      .select("*", { count: "exact", head: true })
      .eq("place_id", place_id);

    if (countErr) throw new Error(countErr.message);
    res.json({ success: true, total: count || 0 });
  } catch (e) {
    res.status(500).json({ error: "Vote failed — please try again." });
  }
});

// ── Waggle Votes: GET /votes?place_ids=id1,id2 ───────────────
app.get("/votes", async (req, res) => {
  if (!supabase) return res.json({ votes: {} });
  const ids = (req.query.place_ids || "").split(",").filter(Boolean).slice(0, 20);
  if (!ids.length) return res.json({ votes: {} });

  try {
    const { data, error } = await supabase
      .from("waggle_votes")
      .select("place_id")
      .in("place_id", ids);

    if (error) throw new Error(error.message);
    const votes = {};
    ids.forEach(id => { votes[id] = 0; });
    (data || []).forEach(row => { votes[row.place_id] = (votes[row.place_id] || 0) + 1; });
    res.json({ votes });
  } catch (e) {
    res.status(500).json({ error: "Could not fetch votes." });
  }
});

// ── Geocode endpoint ─────────────────────────────────────────
// GET /geocode?address=Belfast
// Proxies Google Geocoding API server-side so referrer restrictions don't block it
app.get("/geocode", geocodeLimiter, async (req, res) => {
  const { address } = req.query;
  if (!address) return res.status(400).json({ error: "Missing address param" });

  // Cache geocode results — addresses don't move, saves 1-2 API calls per lookup
  const geoKey    = "geo:" + address.toLowerCase().trim();
  const geoCached = getCache(geoKey);
  if (geoCached) {
    console.log(`⚡ Geocode cache hit: ${address}`);
    return res.json(geoCached);
  }

  const isEircode = /^[A-Z]\d{2}\s*[A-Z0-9]{4}$/i.test(address.trim());
  const region    = isEircode ? "ie" : "gb";

  try {
    const url  = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&region=${region}&key=${GOOGLE_API_KEY}`;
    const resp = await fetch(url);
    const data = await resp.json();

    if (data.status === "OK" && data.results.length) {
      const { lat, lng } = data.results[0].geometry.location;
      const geoResult    = { lat, lng, formatted: data.results[0].formatted_address };
      setCache(geoKey, geoResult);
      return res.json(geoResult);
    }

    console.warn(`Geocode status for "${address}": ${data.status} ${data.error_message || ""}`);
    if (data.status === "REQUEST_DENIED" || data.status === "INVALID_REQUEST") {
      return res.status(503).json({ error: "Search is temporarily unavailable — please try again in a moment." });
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
app.get("/google-places", searchLimiter, async (req, res) => {
  const { lat, lng, query, radius = 3000 } = req.query;

  if (!lat || !lng || !query) {
    return res.status(400).json({ error: "Missing required params: lat, lng, query" });
  }

  // Sanitise query input
  const safeQuery = String(query).slice(0, 100).trim();
  if (!safeQuery) return res.status(400).json({ error: "Invalid query" });

  // ── Cache check — return instantly if we have a recent result ──
  const cacheKey = getCacheKey(lat, lng, safeQuery, radius);
  const cached   = getCache(cacheKey);
  if (cached) {
    console.log(`⚡ Cache hit: ${safeQuery} @ ${(+lat).toFixed(2)},${(+lng).toFixed(2)}`);
    return res.json({ ...cached, cached: true });
  }

  try {
    console.log(`🔍 Searching: "${safeQuery}" @ ${(+lat).toFixed(3)},${(+lng).toFixed(3)} r=${radius}`);

    const [googleResult, fsqResult] = await Promise.allSettled([
      fetchGooglePlaces({ lat, lng, query: safeQuery, radius }),
      fetchFoursquarePlaces({ lat, lng, query: safeQuery, radius }),
    ]);

    const google = googleResult.status === "fulfilled" ? googleResult.value : [];
    const fsq    = fsqResult.status    === "fulfilled" ? fsqResult.value    : [];

    if (googleResult.status === "rejected") console.warn("⚠️  Google failed:", googleResult.reason.message);
    if (fsqResult.status    === "rejected") console.warn("⚠️  FSQ failed:",    fsqResult.reason.message);

    console.log(`📊 Google: ${google.length} · Foursquare: ${fsq.length}`);

    if (!google.length && !fsq.length) {
      return res.json({ results: [], sources: { google: 0, foursquare: 0 } });
    }

    console.log("🔀 Merging results...");
    const merged  = mergePlaces(google, fsq);

    console.log(`🗳️  Fetching vote counts for ${merged.length} places...`);
    const voteMap = await fetchVoteCounts(merged.map(p => p.place_id).filter(Boolean));

    console.log("🏆 Ranking...");
    const ranked  = rankAndLimit(merged, lat, lng, voteMap);

    console.log("⏰ Fetching opening hours...");
    const withHours = await Promise.all(
      ranked.map(async (place) => {
        if (!place.place_id || place.source === "foursquare") return place;
        try {
          const hours = await fetchOpeningHours(place.place_id);
          return { ...place, ...hours };
        } catch (e) {
          console.warn(`  Hours fetch failed for ${place.name}:`, e.message);
          return place;
        }
      })
    );

    const responseData = { results: withHours, sources: { google: google.length, foursquare: fsq.length } };
    setCache(cacheKey, responseData);
    console.log(`✅ Done — returning ${withHours.length} results (cached, size: ${searchCache.size})`);

    res.json(responseData);

  } catch (err) {
    console.error("❌ Search handler threw:", err.message);
    console.error(err.stack);
    res.status(500).json({ error: "Failed to fetch places. Please try again." });
  }
});

// ── Google Places Nearby Search ───────────────────────────────
const FETCH_TIMEOUT_MS = 8000;
function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function fetchGooglePlaces({ lat, lng, query, radius }) {
  const url = new URL("https://maps.googleapis.com/maps/api/place/nearbysearch/json");
  url.searchParams.set("location", `${lat},${lng}`);
  url.searchParams.set("radius",   radius);
  url.searchParams.set("keyword",  query);
  url.searchParams.set("key",      GOOGLE_API_KEY);

  const res  = await fetchWithTimeout(url.toString());
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
    maps_url:        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name)}&query_place_id=${p.place_id}`,
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

  const res  = await fetchWithTimeout(url.toString(), {
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
  const wagglePts  = Math.min(waggleVotes * 3, 30); // each vote +3pts, max +30 (30%)
  return Math.min(Math.round((score + wagglePts) * 10) / 10, 100);
}

// ── Fetch vote counts for all place_ids before ranking ────────
async function fetchVoteCounts(placeIds) {
  const voteMap = {};
  if (!supabase || !placeIds.length) return voteMap;
  try {
    const { data, error } = await supabase
      .from("waggle_votes").select("place_id").in("place_id", placeIds);
    if (error) throw new Error(error.message);
    (data || []).forEach(row => { voteMap[row.place_id] = (voteMap[row.place_id] || 0) + 1; });
    const total = Object.values(voteMap).reduce((a, b) => a + b, 0);
    if (total > 0) console.log(`🗳️  ${total} community votes applied to ranking`);
  } catch (e) { console.warn("fetchVoteCounts (non-critical):", e.message); }
  return voteMap;
}

// ── Rank and return top 5 ─────────────────────────────────────
function rankAndLimit(places, userLat, userLng, voteMap = {}) {
  const scored = places
    .filter(p => p.rating !== null && p.rating > 0 && p.lat && p.lng)
    .map(p => {
      const waggleVotes = voteMap[p.place_id] || 0;
      return {
        ...p,
        waggle_votes: waggleVotes,
        maps_url:     p.maps_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((p.name || "") + " " + (p.vicinity || ""))}`,
        distance_km:  haversineKm(userLat, userLng, p.lat, p.lng),
        hive_score:   hiveScore(p.rating, p.review_count || 0, p.sources?.length > 1, waggleVotes),
      };
    })
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

  const res  = await fetchWithTimeout(url.toString());
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

// ── Scheduled weekly snapshot ────────────────────────────────
async function weeklySnapshot() {
  if (!supabase) return;
  try {
    const { data, error } = await supabase.from("waggle_votes").select("place_name");
    if (error || !data) return;
    const tally = {};
    data.forEach(r => { tally[r.place_name] = (tally[r.place_name] || 0) + 1; });
    const top = Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 10);
    console.log("\n🐝 Weekly Hive Snapshot — Top Voted Places:");
    top.forEach(([name, votes], i) => console.log(`  ${i+1}. ${name} — ${votes} votes`));
    console.log(`  Snapshot: ${new Date().toISOString()}\n`);
  } catch (e) { console.warn("Snapshot failed:", e.message); }
}
setInterval(weeklySnapshot, 7 * 24 * 60 * 60 * 1000);

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
