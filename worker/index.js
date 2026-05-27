/**
 * The Reference Room — Cloudflare Worker
 * -------------------------------------------------------------
 * Three jobs, all behind one Worker so no API keys ever touch the
 * client HTML:
 *   1. Image proxies   GET /unsplash?q=   GET /pexels?q=
 *      + GET /unsplash/track?loc=...  (fulfils Unsplash's "trigger
 *        download on use" requirement; keys stay server-side)
 *   2. OG scrape       GET /og?url=...    (24h edge-cached)
 *   3. Shared sets     POST /set  ·  GET /set/:id  ·  PUT /set/:id
 *      (KV-backed; 90-day TTL, or 1 year once an edit passcode is set)
 *   4. AI endpoints    POST /ai/query  POST /ai/script
 *      (DeepSeek-V3 via OpenAI-compatible API; key stays server-side)
 *
 * Bindings (see wrangler.toml):
 *   KV  SETS            — namespace for shared sets
 *   var ALLOW_ORIGIN    — e.g. "https://currentmethod.in" ("*" in dev)
 *   secret UNSPLASH_KEY — Unsplash Access Key  (wrangler secret put)
 *   secret PEXELS_KEY   — Pexels API key       (wrangler secret put)
 *   secret DEEPSEEK_KEY — DeepSeek API key (wrangler secret put)
 */

const NANO_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"; // no look-alikes
const DAY = 86400;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const origin = env.ALLOW_ORIGIN || "*";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    try {
      if (path === "/unsplash") return await unsplash(url, env, origin);
      if (path === "/unsplash/track") return await unsplashTrack(url, env, origin);
      if (path === "/pexels") return await pexels(url, env, origin);
      if (path === "/arena") return await arena(url, env, origin);
      if (path === "/pinterest/oembed") return await pinterestOembed(url, env, origin, ctx);
      if (path === "/ai/query" && request.method === "POST") return await aiQuery(request, env, origin);
      if (path === "/ai/script" && request.method === "POST") return await aiScript(request, env, origin);
      if (path === "/og") return await ogScrape(url, env, origin, ctx);
      if (path === "/set") return await createSet(request, env, origin);

      const setMatch = path.match(/^\/set\/([A-Za-z0-9_-]+)$/);
      if (setMatch) {
        if (request.method === "GET") return await getSet(setMatch[1], env, origin);
        if (request.method === "PUT") return await updateSet(setMatch[1], request, env, origin);
      }

      if (path === "/" || path === "/health") {
        return json({ ok: true, service: "the-reference-room-worker" }, 200, origin);
      }
      return json({ error: "not_found" }, 404, origin);
    } catch (err) {
      return json({ error: "worker_error", detail: String(err && err.message || err) }, 500, origin);
    }
  },
};

/* ----------------------------- helpers ----------------------------- */
function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,X-Edit-Token",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}
function json(obj, status, origin, extra) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({ "Content-Type": "application/json; charset=utf-8" }, corsHeaders(origin), extra || {}),
  });
}
function nano(n = 8) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  let s = "";
  for (let i = 0; i < n; i++) s += NANO_ALPHABET[a[i] % NANO_ALPHABET.length];
  return s;
}
function esc(s) { return String(s || "").trim(); }

/* ----------------------------- Unsplash ---------------------------- */
async function unsplash(url, env, origin) {
  const q = esc(url.searchParams.get("q"));
  if (!q) return json({ error: "missing_q" }, 400, origin);
  if (!env.UNSPLASH_KEY) return json({ error: "unsplash_not_configured" }, 501, origin);
  const api = "https://api.unsplash.com/search/photos?per_page=12&content_filter=high&query=" + encodeURIComponent(q);
  const r = await fetch(api, { headers: { Authorization: "Client-ID " + env.UNSPLASH_KEY, "Accept-Version": "v1" } });
  if (!r.ok) return json({ error: "unsplash_upstream", status: r.status }, 502, origin);
  const data = await r.json();
  const results = (data.results || []).map((p) => ({
    id: p.id,
    thumb: p.urls && p.urls.small,
    full: p.urls && p.urls.regular,
    link: (p.links && p.links.html) + "?utm_source=reference-room&utm_medium=referral",
    credit: p.user && p.user.name,
    creditUrl: p.user && p.user.links && p.user.links.html + "?utm_source=reference-room&utm_medium=referral",
    downloadLocation: p.links && p.links.download_location,
  }));
  // 1h browser cache is fine for search results
  return json({ results }, 200, origin, { "Cache-Control": "public, max-age=3600" });
}

// Unsplash API guideline: ping download_location whenever an image is used/displayed.
async function unsplashTrack(url, env, origin) {
  const loc = url.searchParams.get("loc");
  if (!loc || !env.UNSPLASH_KEY) return new Response(null, { status: 204, headers: corsHeaders(origin) });
  // only allow unsplash endpoints
  if (!/^https:\/\/api\.unsplash\.com\//.test(loc)) return new Response(null, { status: 204, headers: corsHeaders(origin) });
  try { await fetch(loc, { headers: { Authorization: "Client-ID " + env.UNSPLASH_KEY } }); } catch (e) {}
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

/* ------------------------------ Pexels ----------------------------- */
async function pexels(url, env, origin) {
  const q = esc(url.searchParams.get("q"));
  if (!q) return json({ error: "missing_q" }, 400, origin);
  if (!env.PEXELS_KEY) return json({ error: "pexels_not_configured" }, 501, origin);
  const api = "https://api.pexels.com/v1/search?per_page=12&query=" + encodeURIComponent(q);
  const r = await fetch(api, { headers: { Authorization: env.PEXELS_KEY } });
  if (!r.ok) return json({ error: "pexels_upstream", status: r.status }, 502, origin);
  const data = await r.json();
  const results = (data.photos || []).map((p) => ({
    id: p.id,
    thumb: p.src && p.src.medium,
    full: p.src && p.src.large,
    link: p.url,
    credit: p.photographer,
    creditUrl: p.photographer_url,
  }));
  return json({ results }, 200, origin, { "Cache-Control": "public, max-age=3600" });
}

/* ------------------------------ Are.na ----------------------------- */
// api.are.na has been moved behind a Cloudflare bot challenge, so direct
// browser fetches now 403. Proxy server-side with a browser-like UA and an
// optional ARENA_TOKEN. Returns normalized {results:[{id,thumb,full,link}]}.
async function arena(url, env, origin) {
  const q = esc(url.searchParams.get("q"));
  if (!q) return json({ error: "missing_q" }, 400, origin);
  const api = "https://api.are.na/v2/search/blocks?per=12&q=" + encodeURIComponent(q);
  const headers = {
    "User-Agent": "Mozilla/5.0 (compatible; ReferenceRoomBot/1.0; +https://currentmethod.in)",
    "Accept": "application/json",
  };
  if (env.ARENA_TOKEN) headers["Authorization"] = "Bearer " + env.ARENA_TOKEN;
  let r;
  try { r = await fetch(api, { headers, cf: { cacheTtl: 3600 } }); }
  catch (e) { return json({ error: "arena_fetch_failed" }, 502, origin); }
  if (!r.ok) return json({ error: "arena_upstream", status: r.status }, 502, origin);
  let data;
  try { data = await r.json(); } catch (e) { return json({ error: "arena_bad_json" }, 502, origin); }
  const blocks = (data.blocks || data.results || []).filter((b) => b && b.image && (b.image.thumb || b.image.display));
  const results = blocks.slice(0, 12).map((b) => ({
    id: b.id,
    thumb: (b.image.thumb || b.image.display || {}).url,
    full: (b.image.display || b.image.original || b.image.thumb || {}).url,
    link: "https://www.are.na/block/" + b.id,
    title: b.title || "",
  }));
  return json({ results }, 200, origin, { "Cache-Control": "public, max-age=3600" });
}

/* ---------------------------- Pinterest ---------------------------- */
// Public oEmbed (no auth). Used to hydrate curated pin URLs into thumbnails
// so the client can render a grid that links back to Pinterest. 24h edge cache.
// Pinterest has no public search API — use site search URLs as link-outs.
async function pinterestOembed(url, env, origin, ctx) {
  const target = url.searchParams.get("url");
  if (!target || !/^https?:\/\/([a-z]+\.)?pinterest\.[a-z.]+\//i.test(target)) {
    return json({ error: "bad_url" }, 400, origin);
  }
  const cache = caches.default;
  const cacheKey = new Request("https://pinterest-oembed-cache/" + encodeURIComponent(target), { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) {
    const body = await cached.json();
    return json(body, 200, origin, { "Cache-Control": "public, max-age=86400", "X-Cache": "HIT" });
  }
  const api = "https://www.pinterest.com/oembed.json?url=" + encodeURIComponent(target);
  let r;
  try {
    r = await fetch(api, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ReferenceRoomBot/1.0; +https://currentmethod.in)", "Accept": "application/json" },
      cf: { cacheTtl: DAY },
    });
  } catch (e) {
    return json({ error: "pinterest_fetch_failed" }, 502, origin);
  }
  if (!r.ok) return json({ error: "pinterest_upstream", status: r.status }, 502, origin);
  let data;
  try { data = await r.json(); } catch (e) { return json({ error: "pinterest_bad_json" }, 502, origin); }
  // Pinterest's oEmbed returns a 236x thumbnail. Their CDN serves the same
  // image at /474x/ and /736x/ — swap in 474x for a sharper grid cell.
  const rawThumb = data.thumbnail_url || "";
  const upThumb = rawThumb.replace(/\/236x\//, "/474x/");
  const result = {
    url: target,
    thumb: upThumb || rawThumb,
    thumbSmall: rawThumb,
    width: data.thumbnail_width || 0,
    height: data.thumbnail_height || 0,
    title: data.title || "",
    author: data.author_name || "",
    authorUrl: data.author_url || "",
  };
  const resp = json(result, 200, origin, { "Cache-Control": "public, max-age=86400", "X-Cache": "MISS" });
  ctx.waitUntil(cache.put(cacheKey, new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=86400" } })));
  return resp;
}

/* ------------------------------- OG -------------------------------- */
async function ogScrape(url, env, origin, ctx) {
  const target = url.searchParams.get("url");
  if (!target || !/^https?:\/\//i.test(target)) return json({ error: "bad_url" }, 400, origin);

  const cache = caches.default;
  const cacheKey = new Request("https://og-cache/" + encodeURIComponent(target), { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) {
    const body = await cached.json();
    return json(body, 200, origin, { "Cache-Control": "public, max-age=86400", "X-Cache": "HIT" });
  }

  let html = "";
  try {
    const r = await fetch(target, { headers: { "User-Agent": "Mozilla/5.0 (compatible; ReferenceRoomBot/1.0; +https://currentmethod.in)" }, cf: { cacheTtl: DAY } });
    if (!r.ok) return json({ error: "og_upstream", status: r.status }, 502, origin);
    html = (await r.text()).slice(0, 250000); // cap
  } catch (e) {
    return json({ error: "og_fetch_failed" }, 502, origin);
  }

  const meta = (prop) => {
    const re = new RegExp('<meta[^>]+(?:property|name)=["\']' + prop + '["\'][^>]*content=["\']([^"\']*)["\']', "i");
    const re2 = new RegExp('<meta[^>]+content=["\']([^"\']*)["\'][^>]+(?:property|name)=["\']' + prop + '["\']', "i");
    const m = html.match(re) || html.match(re2);
    return m ? decodeEntities(m[1]) : "";
  };
  const titleTag = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || "";
  const result = {
    title: meta("og:title") || decodeEntities(titleTag) || "",
    image: meta("og:image") || meta("twitter:image") || "",
    description: meta("og:description") || meta("description") || "",
    siteName: meta("og:site_name") || new URL(target).hostname.replace(/^www\./, ""),
    url: target,
  };

  const resp = json(result, 200, origin, { "Cache-Control": "public, max-age=86400", "X-Cache": "MISS" });
  ctx.waitUntil(cache.put(cacheKey, new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=86400" } })));
  return resp;
}
function decodeEntities(s) {
  return String(s || "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/gi, "'").replace(/&nbsp;/g, " ");
}

/* ------------------------------ Sets ------------------------------- */
function sanitizeCards(cards) {
  if (!Array.isArray(cards)) return [];
  return cards.slice(0, 60).map((c) => {
    const out = { slug: String(c.slug || "").slice(0, 80) };
    if (c.filters && typeof c.filters === "object") out.filters = c.filters;
    if (c.note) out.note = String(c.note).slice(0, 2000);
    return out;
  }).filter((c) => c.slug);
}

async function createSet(request, env, origin) {
  if (request.method !== "POST") return json({ error: "method" }, 405, origin);
  if (!env.SETS) return json({ error: "kv_not_configured" }, 501, origin);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "bad_json" }, 400, origin); }

  const cards = sanitizeCards(body.cards);
  if (!cards.length) return json({ error: "empty_set" }, 400, origin);

  const id = nano(8);
  const claimed = !!body.ownerEditToken;
  const editToken = claimed ? String(body.ownerEditToken).slice(0, 64) : nano(24);
  const now = Date.now();
  const ttlDays = claimed ? 365 : 90;
  const rec = {
    id,
    title: String(body.title || "Untitled set").slice(0, 140),
    cards,
    createdAt: now,
    expiresAt: now + ttlDays * DAY * 1000,
    editToken,
  };
  await env.SETS.put("set:" + id, JSON.stringify(rec), { expirationTtl: ttlDays * DAY });
  return json({ id, editToken, expiresAt: rec.expiresAt }, 201, origin);
}

async function getSet(id, env, origin) {
  if (!env.SETS) return json({ error: "kv_not_configured" }, 501, origin);
  const raw = await env.SETS.get("set:" + id);
  if (!raw) return json({ error: "not_found" }, 404, origin);
  const rec = JSON.parse(raw);
  // never expose the edit token on read
  const { editToken, ...pub } = rec;
  return json(pub, 200, origin, { "Cache-Control": "public, max-age=60" });
}

async function updateSet(id, request, env, origin) {
  if (!env.SETS) return json({ error: "kv_not_configured" }, 501, origin);
  const raw = await env.SETS.get("set:" + id);
  if (!raw) return json({ error: "not_found" }, 404, origin);
  const rec = JSON.parse(raw);
  const token = request.headers.get("X-Edit-Token") || "";
  if (!token || token !== rec.editToken) return json({ error: "forbidden" }, 403, origin);

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "bad_json" }, 400, origin); }
  if (typeof body.title === "string") rec.title = body.title.slice(0, 140);
  if (Array.isArray(body.cards)) rec.cards = sanitizeCards(body.cards);

  // a set that gets edited is "claimed" → extend to 1 year
  const now = Date.now();
  rec.expiresAt = now + 365 * DAY * 1000;
  await env.SETS.put("set:" + id, JSON.stringify(rec), { expirationTtl: 365 * DAY });
  const { editToken, ...pub } = rec;
  return json(pub, 200, origin);
}

/* ========================= AI endpoints (DeepSeek-V3) ========================= */
async function aiQuery(request, env, origin) {
  if (!env.DEEPSEEK_KEY) return json({ error: "ai_not_configured" }, 503, origin);
  let body;
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400, origin); }
  const desc = (body.description || "").slice(0, 800).trim();
  if (!desc) return json({ error: "empty_description" }, 400, origin);

  const system = `You are a visual reference assistant for Indian film and advertising production.
The user describes a scene or visual style. Generate exactly 4 targeted Pinterest search queries that would find excellent visual references for a film or ad shoot.

Output ONLY valid JSON: {"queries": ["query1", "query2", "query3", "query4"]}

Rules:
- Each query: 4-8 words, evocative, specific to the scene described
- Variety: one for overall scene/set design, one for lighting/mood, one for props/details, one for color palette
- No generic filler like "photo" "image" "Pinterest" "reference"
- Indian context when relevant (mention city, region, cultural specifics)
- Be cinematic and production-focused`;

  return await callDeepSeekJSON(env.DEEPSEEK_KEY, system, desc, origin);
}

async function aiScript(request, env, origin) {
  if (!env.DEEPSEEK_KEY) return json({ error: "ai_not_configured" }, 503, origin);
  let body;
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400, origin); }
  const scene = (body.scene || "").slice(0, 3000).trim();
  if (!scene) return json({ error: "empty_scene" }, 400, origin);

  const CARDS = `bedroom,bathroom,kitchen,living,dining,kids,boys,girls,bridal,dressing,study,home_office,entrance,garage,laundry,aangan,balcony,terrace,garden,office,creative_office,cafe,restaurant,bar,hotel,hospital,school,airport,street,market,temple,church,mosque,cinema,salon,gym,police,bank,courthouse,wedding,beach,mountain,desert,rain,village,dhaba,mall,slums,petrol,railway,heritage_city,lower_class,middle_class,upper_class,90s_home,cyc_white,cyc_family_meeting,cyc_lawyer,cyc_tattoo,cyc_negotiation,cyc_heist,cyc_yoga,cyc_retail,act_diwali,act_holi,act_christmas,act_eid,act_birthday_kid,act_birthday_adult,act_road_trip,act_cooking_together,act_dinner_party,act_wedding,act_haldi_mehendi`;

  // Build a name map for common slugs
  const NAME = {bedroom:"Bedroom",bathroom:"Bathroom",kitchen:"Kitchen",living:"Living Room",dining:"Dining Room",kids:"Kids Room",boys:"Boys Room",girls:"Girls Room",bridal:"Bridal Room",dressing:"Dressing Area",study:"Study Area",home_office:"Home Office",entrance:"Entrance / Foyer",garage:"Garage",laundry:"Laundry",aangan:"Aangan / Courtyard",balcony:"Balcony",terrace:"Terrace / Rooftop",garden:"Home Garden",office:"Office",creative_office:"Creative Office",cafe:"Café",restaurant:"Restaurant",bar:"Bar",hotel:"Hotel",hospital:"Hospital",school:"School",airport:"Airport",street:"Street",market:"Market",temple:"Temple",church:"Church",mosque:"Mosque",cinema:"Cinema",salon:"Salon",gym:"Gym",police:"Police Station",bank:"Bank",courthouse:"Courthouse",wedding:"Wedding",beach:"Beach",mountain:"Mountain",desert:"Desert",rain:"Rain / Monsoon",village:"Village",dhaba:"Dhaba",mall:"Mall",slums:"Slums",petrol:"Petrol Station",railway:"Railway Station",heritage_city:"Heritage City",lower_class:"Lower Class Home",middle_class:"Middle Class Home",upper_class:"Upper Class Home","90s_home":"90s Home",cyc_white:"Cyclorama · White",cyc_family_meeting:"Cyc · Family Meeting",cyc_lawyer:"Cyc · Lawyer's Office",cyc_tattoo:"Cyc · Tattoo Parlour",cyc_negotiation:"Cyc · Hostage / Negotiation",cyc_heist:"Cyc · Heist / Burglary",cyc_yoga:"Cyc · Yoga Couple",cyc_retail:"Cyc · Retail / Furniture Store",act_diwali:"Diwali",act_holi:"Holi",act_christmas:"Christmas",act_eid:"Eid",act_birthday_kid:"Kids Birthday",act_birthday_adult:"Adult Birthday",act_road_trip:"Road Trip",act_cooking_together:"Cooking Together",act_dinner_party:"Dinner Party",act_wedding:"Wedding Activity",act_haldi_mehendi:"Haldi / Mehendi"};

  const system = `You are a visual reference assistant for Indian film production.
Given a script scene excerpt, identify what visual references are needed and map them to the reference card system.

Available card slugs: ${CARDS}

Output ONLY valid JSON:
{
  "cards": [{"slug":"bedroom","name":"Bedroom","reason":"Character wakes up in opening shot"}],
  "queries": [{"label":"Bedroom mood","query":"moody bedroom night scene warm tungsten"}]
}

Rules:
- Match 1-5 most relevant cards from the slug list
- Generate 2-6 Pinterest queries, specific to scene mood, era, style, culture
- reason: max 8 words explaining why this card fits
- Use Indian regional/cultural specifics in queries when relevant
- If the scene is a cyclorama/studio setup, prefer cyc_ cards`;

  const result = await callDeepSeekJSON(env.DEEPSEEK_KEY, system, scene, origin);
  // Enrich card names from our local map
  if (result && result.cards) {
    result.cards = result.cards.map(c => ({
      ...c,
      name: c.name || NAME[c.slug] || c.slug
    }));
  }
  return result; // already a Response from callDeepSeekJSON
}

async function callDeepSeekJSON(key, systemPrompt, userMessage, origin) {
  try {
    const r = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${key}`
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage }
        ],
        temperature: 0.7,
        max_tokens: 700,
        response_format: { type: "json_object" }
      })
    });
    if (!r.ok) {
      const errText = await r.text();
      return json({ error: "deepseek_upstream", status: r.status, detail: errText.slice(0, 300) }, 502, origin);
    }
    const data = await r.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return json({ error: "empty_response" }, 502, origin);
    const parsed = JSON.parse(content);
    return json(parsed, 200, origin);
  } catch (e) {
    return json({ error: "ai_error", detail: String(e?.message || e) }, 500, origin);
  }
}
