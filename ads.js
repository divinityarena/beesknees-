// ============================================================
// The Bee's Knees 🐝 — Ad Configuration
// ============================================================
// HOW TO MANAGE ADS
// -----------------
// TIER 1 — city banner: shows for ANY search in that city
// TIER 2 — category ad: shows only when city + category match
//          Tier 2 always overrides Tier 1 when both apply.
//
// Images live in Supabase Storage → ads bucket.
// Upload via: Supabase → Storage → ads → upload file
// URL format: https://hwpcowjejebhapgqhnpl.supabase.co/storage/v1/object/public/ads/[path]
//
// To add a new ad:  copy an entry, fill in fields, set active: true
// To pause an ad:   set active: false
// To add a city:    add Tier 1 entry here + add city to BUZZ_SPOTS in index.html
// ============================================================

// ── Image base URL ───────────────────────────────────────────
// Images are served via our own /img/ proxy on Render to avoid
// Supabase Storage CORS restrictions on cross-origin img requests.
// To add a new image: upload to Supabase Storage ads/ads/[path]
// then reference it here as /img/[path]
const STORAGE = "/img";

const AD_CONFIG = [

  // ── TIER 1: City banners ──────────────────────────────────
  // These show for ANY search in the city.
  // Premium placement — £49/month suggested price.

  {
    id:        "belfast-city",
    tier:      1,
    city:      "belfast",
    active:    true,
    eyebrow:   "🐝 The Local Buzz · Belfast",
    headline:  "There's only seven types of rain in Belfast…",
    desc:      "Monday, Tuesday, Wednesday… You know the drill. But between the showers, Belfast is buzzing — and the Cathedral Quarter is the beating heart of it. Let the hive find your perfect spot tonight.",
    ctaLabel:  "🍺 Best pubs near me",
    ctaQuery:  "pub bar",
    ctaUrl:    null,
    linkLabel: "Visit Belfast →",
    linkUrl:   "https://visitbelfast.com",
    img:       `${STORAGE}/cities/belfast-city.webp`,
  },

  {
    id:        "dublin-city",
    tier:      1,
    city:      "dublin",
    active:    true,
    eyebrow:   "🐝 The Local Buzz · Dublin",
    headline:  "Where the craic is mighty",
    desc:      "Ha'penny Bridge to Temple Bar — the Liffey never sleeps. Georgian grandeur, cobbled laneways, and the best pint you've ever pulled up a stool for.",
    ctaLabel:  "🍺 Best pubs near me",
    ctaQuery:  "pub bar",
    ctaUrl:    null,
    linkLabel: "Visit Dublin →",
    linkUrl:   "https://visitdublin.com",
    img:       `${STORAGE}/cities/dublin-city.webp`,
  },

  {
    id:        "kildare-city",
    tier:      1,
    city:      "kildare",
    active:    true,
    eyebrow:   "🐝 The Local Buzz · Kildare Town",
    headline:  "The Curragh under golden skies",
    desc:      "Round Tower, St Brigid's Cathedral, and the finest horse country in Ireland on your doorstep. Whether you're after a great meal or a proper local, the hive knows where to send you.",
    ctaLabel:  "🍽️ Best restaurants near me",
    ctaQuery:  "restaurant dining",
    ctaUrl:    null,
    linkLabel: "Visit Kildare →",
    linkUrl:   "https://kildare.ie",
    img:       `${STORAGE}/cities/kildare-city.webp`,
  },


  // ── TIER 2: Venue / category ads ─────────────────────────
  // These override the city banner for a specific search.
  // Standard placement — £9.99/month suggested price.
  // Uncomment an example below to activate.

  // ── Belfast ──────────────────────────────────────────────

  // {
  //   id:         "belfast-pub-dirty-onion",
  //   tier:       2,
  //   city:       "belfast",
  //   categories: ["pub bar"],
  //   active:     false,
  //   eyebrow:    "🐝 Featured · Belfast",
  //   headline:   "The Dirty Onion — Cathedral Quarter",
  //   desc:       "Award-winning craft ales, live trad music, and a courtyard that feels like nowhere else in Belfast.",
  //   ctaLabel:   "🗺️ Get directions",
  //   ctaQuery:   null,
  //   ctaUrl:     "https://www.thedirtyonion.com",
  //   linkLabel:  "View menu →",
  //   linkUrl:    "https://www.thedirtyonion.com/menus",
  //   img:        `${STORAGE}/belfast/pub-dirty-onion.webp`,
  // },

  // {
  //   id:         "belfast-restaurant-ox",
  //   tier:       2,
  //   city:       "belfast",
  //   categories: ["restaurant dining"],
  //   active:     false,
  //   eyebrow:    "🐝 Featured · Belfast",
  //   headline:   "OX — Belfast's Michelin Star",
  //   desc:       "Oxford Street's finest. Seasonal menus, natural wines, and cooking that earns its star every single service.",
  //   ctaLabel:   "🍽️ Book a table",
  //   ctaQuery:   null,
  //   ctaUrl:     "https://www.oxbelfast.com",
  //   linkLabel:  "View menu →",
  //   linkUrl:    "https://www.oxbelfast.com/menus",
  //   img:        `${STORAGE}/belfast/restaurant-ox.webp`,
  // },

  // {
  //   id:         "belfast-hotel-merchant",
  //   tier:       2,
  //   city:       "belfast",
  //   categories: ["hotel accommodation"],
  //   active:     false,
  //   eyebrow:    "🐝 Featured · Belfast",
  //   headline:   "The Merchant Hotel",
  //   desc:       "Belfast's most celebrated five-star hotel. Victorian grandeur in the heart of the Cathedral Quarter.",
  //   ctaLabel:   "🏨 Check availability",
  //   ctaQuery:   null,
  //   ctaUrl:     "https://www.themerchanthotel.com",
  //   linkLabel:  "View rooms →",
  //   linkUrl:    "https://www.themerchanthotel.com/rooms",
  //   img:        `${STORAGE}/belfast/hotel-merchant.webp`,
  // },


  // ── Dublin ───────────────────────────────────────────────

  // {
  //   id:         "dublin-pub-mulligan",
  //   tier:       2,
  //   city:       "dublin",
  //   categories: ["pub bar"],
  //   active:     false,
  //   eyebrow:    "🐝 Featured · Dublin",
  //   headline:   "Mulligan's — Since 1782",
  //   desc:       "Dublin's most storied pub. Perfectly poured Guinness on Poolbeg Street. No frills, no tourists — just the real thing.",
  //   ctaLabel:   "🗺️ Get directions",
  //   ctaQuery:   null,
  //   ctaUrl:     "https://mulligans.ie",
  //   linkLabel:  "Find us →",
  //   linkUrl:    "https://mulligans.ie",
  //   img:        `${STORAGE}/dublin/pub-mulligans.webp`,
  // },

  // {
  //   id:         "dublin-restaurant-bunsen",
  //   tier:       2,
  //   city:       "dublin",
  //   categories: ["restaurant dining", "takeaway food"],
  //   active:     false,
  //   eyebrow:    "🐝 Featured · Dublin",
  //   headline:   "Bunsen — Proper Burgers",
  //   desc:       "Simple menu, exceptional burgers. Quietly making Dublin's best burgers since 2013.",
  //   ctaLabel:   "🍔 Find nearest Bunsen",
  //   ctaQuery:   "restaurant dining",
  //   ctaUrl:     null,
  //   linkLabel:  "See menu →",
  //   linkUrl:    "https://bunsen.ie",
  //   img:        `${STORAGE}/dublin/restaurant-bunsen.webp`,
  // },

  // {
  //   id:         "dublin-hotel-fitzwilliam",
  //   tier:       2,
  //   city:       "dublin",
  //   categories: ["hotel accommodation"],
  //   active:     false,
  //   eyebrow:    "🐝 Featured · Dublin",
  //   headline:   "The Fitzwilliam Hotel",
  //   desc:       "Contemporary luxury on St Stephen's Green. The perfect Dublin base for weekend stays and city escapes.",
  //   ctaLabel:   "🏨 Check availability",
  //   ctaQuery:   null,
  //   ctaUrl:     "https://www.fitzwilliamhoteldublin.com",
  //   linkLabel:  "View rooms →",
  //   linkUrl:    "https://www.fitzwilliamhoteldublin.com/rooms",
  //   img:        `${STORAGE}/dublin/hotel-fitzwilliam.webp`,
  // },

];

// ── Ad Engine — do not edit below this line ───────────────
window.AD_CONFIG = AD_CONFIG;

window.findMatchingAd = function(cityName, searchQuery) {
  const city  = (cityName  || "").toLowerCase().trim();
  const query = (searchQuery || "").toLowerCase().trim();
  const tier2 = AD_CONFIG.find(ad =>
    ad.active && ad.tier === 2 && ad.city === city &&
    Array.isArray(ad.categories) &&
    ad.categories.some(cat => query.includes(cat) || cat.includes(query))
  );
  if (tier2) return tier2;
  return AD_CONFIG.find(ad => ad.active && ad.tier === 1 && ad.city === city) || null;
};

window.renderAd = function(ad) {
  const panel = document.getElementById("local-buzz");
  if (!panel || !ad) return;
  try {
    const dismissed = JSON.parse(localStorage.getItem("bk_ad_dismiss_" + ad.id) || "{}");
    if (dismissed.until && Date.now() < dismissed.until) return;
  } catch(e) {}
  const img = panel.querySelector(".buzz-img-wrap img");
  if (img) {
    img.alt = ad.headline;
    img.onerror = () => console.warn("🐝 Ad image failed to load:", ad.img);
    img.onload  = () => console.log("🐝 Ad image loaded:", ad.id);
    // Clear src first, then set on next tick to ensure browser processes it fresh
    img.src = "";
    setTimeout(() => { img.src = ad.img; }, 0);
  }
  const eyebrow  = panel.querySelector(".buzz-eyebrow");
  const headline = panel.querySelector(".buzz-headline");
  if (eyebrow)  eyebrow.textContent  = ad.eyebrow;
  if (headline) headline.textContent = ad.headline;
  const desc = panel.querySelector(".buzz-desc");
  if (desc) desc.textContent = ad.desc;
  const cta = panel.querySelector(".buzz-cta:not(.secondary)");
  if (cta) {
    cta.textContent   = ad.ctaLabel;
    cta.dataset.query = ad.ctaQuery || "";
    cta.dataset.adUrl = ad.ctaUrl   || "";
    cta.dataset.adId  = ad.id;
  }
  const link = panel.querySelector(".buzz-cta.secondary");
  if (link) { link.textContent = ad.linkLabel; link.href = ad.linkUrl; }
  panel.dataset.adId = ad.id;
  panel.classList.add("visible");
};

window.dismissAd = function(adId) {
  const panel = document.getElementById("local-buzz");
  if (panel) {
    panel.style.opacity    = "0";
    panel.style.transform  = "scale(0.97)";
    panel.style.transition = "opacity 0.25s, transform 0.25s";
    setTimeout(() => { panel.classList.remove("visible"); panel.style.cssText = ""; }, 280);
  }
  if (adId) {
    try {
      localStorage.setItem("bk_ad_dismiss_" + adId,
        JSON.stringify({ until: Date.now() + 24 * 60 * 60 * 1000 }));
    } catch(e) {}
  }
};
