// ============================================================
// The Bee's Knees 🐝 — Backend Server
// Usage: node server.js
// Requires: npm install express cors
// Node 18+ has native fetch built-in (no node-fetch needed)
// ============================================================

const express = require("express");
const cors    = require("cors");

const app  = express();
const PORT = process.env.PORT || 3000;

// ── API Keys (override via env vars if you rotate them) ──────
const GOOGLE_API_KEY     = process.env.GOOGLE_API_KEY     || "AIzaSyBodEo-Lbzg2al-4_nmLTXBFSW4VrS4nfI";
const FOURSQUARE_API_KEY = process.env.FOURSQUARE_API_KEY || "GKBKSLTO13YCILAF3ZTKQ2P0V3QCPAJQDOSJSVXUAK4W3IW5";

app.use(cors());
app.use(express.json());

// ── Serve frontend files ──────────────────────────────────────
const path = require("path");
app.use(express.static(path.join(__dirname)));

// ── Health check ─────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "🐝 The Bee's Knees server is buzzing!" });
});

// ── Root + catch-all → index.html ────────────────────────────
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/about", (_req, res) => {
  res.sendFile(path.join(__dirname, "about.html"));
});

// ── Main endpoint ─────────────────────────────────────────────
// GET /google-places?lat=XX&lng=YY&query=pizza&radius=3000
app.get("/google-places", async (req, res) => {
  const { lat, lng, query, radius = 3000 } = req.query;

  if (!lat || !lng || !query) {
    return res.status(400).json({ error: "Missing required params: lat, lng, query" });
  }

  try {
    // Run both API calls in parallel — if one fails we still use the other
    const [googleResult, fsqResult] = await Promise.allSettled([
      fetchGooglePlaces({ lat, lng, query, radius }),
      fetchFoursquarePlaces({ lat, lng, query, radius }),
    ]);

    const google = googleResult.status === "fulfilled" ? googleResult.value : [];
    const fsq    = fsqResult.status    === "fulfilled" ? fsqResult.value    : [];

    if (googleResult.status === "rejected") console.warn("Google failed:", googleResult.reason.message);
    if (fsqResult.status    === "rejected") console.warn("FSQ failed:",    fsqResult.reason.message);

    console.log(`📊 Google: ${google.length} results, Foursquare: ${fsq.length} results`);

    if (google.length === 0 && fsq.length === 0) {
      return res.json({ results: [], sources: { google: 0, foursquare: 0 } });
    }

    const merged = mergePlaces(google, fsq);
    const ranked = rankAndLimit(merged, lat, lng);

    // Fetch opening hours for top 5 in parallel (Place Details API)
    const withHours = await Promise.all(
      ranked.map(async (place) => {
        if (!place.place_id || place.source === "foursquare") return place;
        try {
          const hours = await fetchOpeningHours(place.place_id);
          return { ...place, ...hours };
        } catch {
          return place;
        }
      })
    );

    res.json({
      results: withHours,
      sources: { google: google.length, foursquare: fsq.length },
    });

  } catch (err) {
    console.error("Error:", err.message);
    res.status(500).json({ error: "Failed to fetch places. " + err.message });
  }
});

// ── Google Places Nearby Search ───────────────────────────────
async function fetchGooglePlaces({ lat, lng, query, radius }) {
  const url = new URL("https://maps.googleapis.com/maps/api/place/nearbysearch/json");
  url.searchParams.set("location", `${lat},${lng}`);
  url.searchParams.set("radius", radius);
  url.searchParams.set("keyword", query);
  url.searchParams.set("key", GOOGLE_API_KEY);

  const res  = await fetch(url.toString());
  const data = await res.json();

  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    throw new Error(`Google: ${data.status} — ${data.error_message || ""}`);
  }

  return (data.results || []).map((p) => ({
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
  url.searchParams.set("fields", "fsq_id,name,geocodes,rating,stats,location,link,categories,hours_popular,price");

  const res  = await fetch(url.toString(), {
    headers: {
      Authorization: FOURSQUARE_API_KEY,
      Accept:        "application/json",
    },
  });
  const data = await res.json();

  if (!res.ok) throw new Error(`Foursquare: ${data.message || res.status}`);

  return (data.results || []).map((p) => ({
    source:          "foursquare",
    name:            p.name,
    normalised_name: normaliseName(p.name),
    // FSQ ratings are 0–10, normalise to 0–5 to match Google's scale
    rating:          p.rating != null ? +(p.rating / 2).toFixed(1) : null,
    review_count:    p.stats?.total_ratings ?? 0,
    lat:             p.geocodes?.main?.latitude,
    lng:             p.geocodes?.main?.longitude,
    place_id:        p.fsq_id,
    maps_url:        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                       p.name + " " + (p.location?.formatted_address || "")
                     )}`,
    vicinity:        p.location?.formatted_address || "",
    description:     buildFoursquareDescription(p),
  }));
}

// ── Description builders ─────────────────────────────────────
function buildGoogleDescription(p) {
  const types = (p.types || [])
    .filter(t => !["point_of_interest","establishment","food","premise"].includes(t))
    .map(t => t.replace(/_/g, " "))
    .slice(0, 2);

  const parts = [];
  if (types.length)       parts.push(capitaliseWords(types.join(" · ")));
  if (p.vicinity)         parts.push(p.vicinity.split(",")[0]);
  if (p.business_status === "TEMPORARILY_CLOSED") parts.push("⚠️ Temporarily closed");
  return parts.join(" — ") || null;
}

function buildFoursquareDescription(p) {
  const parts = [];
  const cat = p.categories?.[0]?.name;
  if (cat) parts.push(cat);

  const addr = p.location?.formatted_address;
  if (addr) parts.push(addr.split(",")[0]);

  if (p.price) {
    const priceStr = ["", "£", "££", "£££", "££££"][p.price] || "";
    if (priceStr) parts.push(priceStr);
  }
  return parts.join(" — ") || null;
}

function capitaliseWords(str) {
  return str.replace(/\b\w/g, c => c.toUpperCase());
}

// ── Merge Google + Foursquare results ─────────────────────────
// Match by normalised name; if matched → average the ratings
function mergePlaces(googlePlaces, fsqPlaces) {
  const merged = [];
  const usedFsq = new Set();

  for (const g of googlePlaces) {
    const matchIdx = fsqPlaces.findIndex(
      (f, i) => !usedFsq.has(i) && isSimilar(g.normalised_name, f.normalised_name)
    );

    if (matchIdx !== -1) {
      const match = fsqPlaces[matchIdx];
      usedFsq.add(matchIdx);

      let combinedRating;
      if (g.rating != null && match.rating != null) {
        combinedRating = +((g.rating + match.rating) / 2).toFixed(2);
      } else {
        combinedRating = g.rating ?? match.rating;
      }

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

  // Append any Foursquare-only results not matched above
  fsqPlaces.forEach((f, i) => {
    if (!usedFsq.has(i)) merged.push({ ...f, sources: ["foursquare"] });
  });

  return merged;
}

// ── Name similarity ───────────────────────────────────────────
function isSimilar(a, b) {
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  // Token overlap — at least 2 meaningful words in common
  const tokA   = a.split(/\s+/);
  const tokB   = b.split(/\s+/);
  const shared = tokA.filter(t => t.length > 2 && tokB.includes(t));
  return shared.length >= Math.min(2, Math.min(tokA.length, tokB.length));
}

// Lowercase, strip punctuation
function normaliseName(name) {
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
}

// ── Hive Score™ ──────────────────────────────────────────────
// The official ranking algorithm of The Bee's Knees 🐝
//
//   Hive Score = (rating ^ 2.5) × log10(min(reviews,1000) + 10) × confidence
//
//   confidence = 1 - (1 / log10(reviews + 10))
//
// - rating^2.5        amplifies quality gaps (4.5★ beats 4.4★ meaningfully)
// - log10 capped      review count matters but plateaus at 1,000
// - confidence        penalises low review counts — a 4.9★ with 6 reviews
//                     scores ~9/100, not ~36/100 like before
// - 5% bonus          if verified by both Google and Foursquare
const HIVE_SCORE_MAX = Math.pow(5.0, 2.5)
  * Math.log10(1010)
  * (1 - (1 / Math.log10(1010)))
  * 1.05; // ~129.xx

function confidence(reviews) {
  return 1 - (1 / Math.log10(reviews + 10));
}

function hiveScore(rating, reviews, dualSource) {
  const base  = Math.pow(rating, 2.5)
              * Math.log10(Math.min(reviews, 1000) + 10)
              * confidence(reviews);
  const bonus = dualSource ? 1.05 : 1.0;
  return Math.min(Math.round((base * bonus / HIVE_SCORE_MAX) * 100 * 10) / 10, 100);
}

function rankAndLimit(places, userLat, userLng) {
  const scored = places
    .filter((p) => p.rating !== null && p.rating > 0 && p.lat && p.lng)
    .map((p) => {
      const reviews = p.review_count || 0;
      const dual    = p.sources?.length > 1;
      return {
        ...p,
        distance_km: haversineKm(userLat, userLng, p.lat, p.lng),
        hive_score:  hiveScore(p.rating, reviews, dual),
      };
    })
    .sort((a, b) => b.hive_score - a.hive_score);

  console.log(`🐝 Ranked ${scored.length} places, returning top ${Math.min(scored.length, 5)}`);
  return scored.slice(0, 5);
}

// ── Google Place Details — opening hours ─────────────────────
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

  const now        = new Date();
  const dayIndex   = now.getDay(); // 0=Sun … 6=Sat
  const todayText  = oh.weekday_text?.[dayIndex === 0 ? 6 : dayIndex - 1] || null;
  const isOpenNow  = oh.open_now ?? null;

  // Extract closing time from today's text e.g. "Monday: 12:00 – 22:00"
  let closingTime = null;
  if (todayText) {
    const match = todayText.match(/[–\-]\s*(\d{1,2}:\d{2})/);
    if (match) closingTime = match[1];
  }

  return {
    is_open_now:   isOpenNow,
    closing_time:  closingTime,
    today_hours:   todayText,
    business_status: bs || null,
  };
}

// ── Haversine distance (km) ───────────────────────────────────
function haversineKm(lat1, lng1, lat2, lng2) {
  const R    = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a    =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return +(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(1);
}

function toRad(deg) { return (deg * Math.PI) / 180; }

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🐝 Bee's Knees server running → http://localhost:${PORT}`);
  console.log(`   Google key : ${GOOGLE_API_KEY.slice(0, 10)}…`);
  console.log(`   FSQ key    : ${FOURSQUARE_API_KEY.slice(0, 10)}…\n`);
});
