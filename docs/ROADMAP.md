# Roadmap

## Shipped (on `main`)

### PR 1 · UX foundation
- Top-bar role dropdown (replaces the first-visit modal). Default
  "Production Designer" (= `artdirector`) or last-used.
- Cmd-K / Ctrl-K / `/` command palette — deterministic fuzzy launcher
  across all cards + filters + roles + DP/film/tool links + 6 verbs.
  Smart rule-based query: `"dp warm bedroom"` → bedroom card tuned for DP
  + warm.
- Slide-in detail panel with sticky header (title, copy-link, pin, close)
  + dismissable Tuned-for chips.
- Hash-based History API routing (back/forward, reload restores).
- URL state codec (`Codec`, base64url(JSON), v=1).
- Copy-link button + Cmd-L.
- Final keyboard map: Cmd-K / `/`, Esc, Cmd-Enter, Cmd-D, Cmd-S, Cmd-L,
  Cmd-Shift-K, Cmd-`,`, j/k grid nav, 1–6 tabs, R, F.
- Dark `#0E0E0F` default + DM Serif Display + DM Mono + single amber accent
  + hairline borders + no drop shadows. Density toggle retired.
- All existing localStorage preserved + schema migration guard.
- FOUC fix: theme applied in `<head>` before first paint.

### PR 2 · Inline embeds (client side)
- Inline Are.na search grid in every card panel (CORS, no key).
- Unsplash + Pexels grids — render when `REFROOM_WORKER_BASE` is set.
- OG card component — wired, will activate when Tier-3 article URLs are
  curated.
- `lite-youtube`-style facade infrastructure — wired but inert until
  curated video IDs exist.
- Tier 4 link-out chips at the bottom of each panel (existing detail-blocks).

### PR 3 · Sharing
- Save / Open / Fork pinned sets.
- Two backends: short server-stored IDs via Worker KV, **or** self-
  contained URL-encoded `#set=…` links (no server).
- 90-day TTL by default; 1-year once an edit passcode is set or the set
  is edited.

### Cloudflare Worker scaffold
- `worker/index.js` — proxy + OG + KV-backed `/set`.
- `worker/wrangler.toml` — KV binding + vars.
- `worker/README.md` — deploy walkthrough.
- `worker/.gitignore` — keeps `.dev.vars` out of git.

### Multi-agent context layer
- `AGENTS.md` (canonical), `CLAUDE.md`, `.cursorrules`.
- `docs/` (this folder).
- `tests/` (smoke + logic tests, runnable with plain Node).

### Post-context-layer additions on `main`
A separate work stream landed these in parallel (owner-initiated):
- **Search-first home mode** — centered query bar, app behind it; `home-mode`
  set inline on `<body>` to prevent app-shell flash. Editorial chrome:
  corner labels, italic serif headline, hairline search underline, numbered
  result list. `.hint` kbd strip hidden in home-mode.
- **Higgsfield-generated hero background** (`assets/home-hero.png`) with
  dimmed overlay + SVG-noise grain.
- **Sidebar nav tree replaced with a filter panel.**
- **AI Reference Brain button** (`.ai-btn` → `openAI()`) — opt-in scene-
  query / script-analysis modal backed by deepseek-v4-pro via the Worker.
  Distinct from the deterministic Cmd-K palette (see `DECISIONS.md` D-001).
- Media-chip count badges removed (they were misleading).

---

## Pending (user action)

1. **Deploy the Worker** to Cloudflare:
   - Create the KV namespace and paste id into `wrangler.toml`.
   - `wrangler secret put UNSPLASH_KEY`, `wrangler secret put PEXELS_KEY`.
   - `wrangler deploy`.
   - Set `window.REFROOM_WORKER_BASE` in `index.html` to the deployed URL,
     commit, push.
2. **Visual QA** on real devices — iOS Safari, Chrome Android, desktop
   Chrome/Safari/Firefox. The body font is DM Mono (monospace), so watch
   for tight or overflowing text in dense areas (sidebar tabs, card
   blurbs, filter pills).
3. **Lock `ALLOW_ORIGIN`** in `wrangler.toml` to the production domain
   before going live (currently `"*"` for testing).

---

## Curation gaps (data, not code)

These features are wired but inert until curated data is added.

- **YouTube facade** — `CURATED_YT` map keyed by anchor → array of video
  IDs. The facade renderer `window.refRoomYouTube(container, id)` exists.
  Add a map declaration in the refresh IIFE and wire it into
  `injectEmbeds()`.
- **Vimeo facade** — same shape, plus an oEmbed thumbnail fetch:
  `https://vimeo.com/api/oembed.json?url=…`.
- **Coolors palette iframes** — `CURATED_COOLORS` map: anchor → palette
  URL like `https://coolors.co/ffffff-000000-…`.
- **OG previews** — currently the Tier-3 sources are search URLs, which
  have no useful OG data. Curate **specific article URLs** per card or
  per group, then call the Worker's `/og?url=` and render `<a class="og-card">`.
- **Are.na "Community channels" seeds** — add a `COMMUNITY_CHANNELS` map
  with real channel slugs (e.g. `indian-cinema-references`,
  `monsoon-mood`, …) and render them via `/v2/channels/:slug/contents`.
- **TMDb integration** for film cards — endpoint stub belongs in the
  Worker if added.
- **Pinterest official widget** — the brief calls for lazy `pinit.js` on
  card open with a board id. Needs curated `data-pin-do="embedBoard"`
  per card.

When you add any of the above:
- Keep the rendering behind a feature check (`if (CURATED_YT[anchor])`)
  so cards without curation stay clean.
- Add an attribution / link-out alongside per the platform's guidelines.

---

## Explicitly NOT in scope

Per the brief and the owner. Do not build any of these unless you have
explicit go-ahead — and even then, raise it in an issue first.

- **PR 4 (live collab)** — PartyKit / cursor sharing / live edits. Brief
  says "don't build until asked."
- **Accounts / auth / signup.** Sharing is anonymous; passcode = edit
  token only.
- **AI / LLM / semantic search.** Owner has explicitly opted out. See
  `docs/DECISIONS.md` D-001.
- **Instagram embeds.** Meta has gutted the embed API.
- **IMDb internal `/videoembed/`.** Not licensed.
- **Hotlinking** Film-Grab / Shot.Cafe / Frameset images. Link-out only.
- **Density toggle UI** (existed pre-refactor; retired — see D-008).
- **Tutorial / onboarding modals.** Discoverable defaults instead.
- **Additional theme variants** beyond dark + light/paper.
- **Build pipelines** (Webpack, Vite, Parcel, etc.). Vanilla JS only.

---

## Known issues / things worth noting

- **Mobile DM Mono fit** — DM Mono is wider than the system sans this app
  previously used. Card blurbs and filter pill labels may wrap differently.
  Needs manual QA on devices.
- **Subtle warm cast in dark mode** — some `html[data-theme="dark"] .x`
  overlays use `rgba(255,245,220,…)` (cream-tinted) instead of pure white.
  At low opacity this is barely perceptible on `#0E0E0F`; left intentionally
  unfixed to avoid editing ~15 separate rules.
- **`history.pushState` on close** — closing a panel pushes the base URL,
  so pressing Back after close reopens the panel. Intentional (browser
  back/forward works through the panel state) but could surprise.
- **Are.na unauthenticated rate limits** — we don't use a token. Heavy
  traffic could rate-limit. Acceptable for the current scale; revisit if
  the app gets popular.

---

## Versioning rules

- **`refhub_schema_v`** — bump on any breaking localStorage change. Handle
  the upgrade in the migration block at the top of the 2026-refresh IIFE.
  Never wipe user data.
- **`v=1` in `Codec.encode()`** — bump if you change the codec or the
  state shape. Decode old versions for backward compat with shared links.
- **`data-anchor` slugs** — once shipped, never rename. They're URL slugs,
  localStorage namespaces (`notes_{anchor}`), and pin/recent identifiers.
