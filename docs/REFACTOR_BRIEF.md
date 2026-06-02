# Refactor brief (source intent)

The product spec that drove the 2026 refactor. Reproduced here so future
agents have the original intent, not just the resulting code. Where the
implementation deliberately deviates from this brief, see
`docs/DECISIONS.md`.

---

## What the app is

Single-HTML visual reference launcher at `currentmethod.in` for Indian
film / ad / fashion production. ~208 cards across **Sets & Locations,
Activities & Occasions, Cinematographers, Films, Tools, Checklists**.
User picks role + filters → opens a card → card fires deep-linked searches
to 15+ external platforms. All state in localStorage. No backend.

(In practice the implementation has ~146 openable cards in Sets +
Activities, plus DP/film/tool shelves of external link tiles. The 208
figure includes everything across all shelves.)

---

## Goals (priority order)

1. **Cut clicks to reference.** Current flow is land → role modal →
   filters → card → chip → new tab. Target: land → 1 keystroke →
   reference visible inline.
2. **Hybrid embeds.** Preview references *inside* the card panel where
   the platform allows it. Link-out only when it doesn't.
3. **Shareable + collab.** Every card view has a shareable URL. Pinned
   sets are server-stored and sendable to a director via link.

---

## Hard constraints

- Keep single-HTML-file structure if possible. Vanilla JS preferred.
  Alpine.js or htmx OK if reactivity gets painful. **No React/Vue/Svelte
  build pipeline.**
- No login, no signup, no accounts in v1. Anonymous create + optional
  passcode for edit.
- No real-time collab in v1. Async share only (User A sends link, User B
  opens, optionally forks).
- All third-party API keys (Unsplash, Pexels) live behind a Cloudflare
  Worker proxy. Never in client HTML.
- Mobile-first. Assume on-set 4G and one-handed phone use.
- Preserve all existing localStorage data on upgrade (pins, recents,
  notes, checklist ticks, role, filters).

---

## Aesthetic

- Dark base `#0E0E0F` (not pure black). White text at 92% opacity.
- Amber accent in tungsten range (`#C8841C` to `#E5A042`). One accent
  color only.
- **DM Serif Display** for card titles + section headers. **DM Mono** for
  everything else. No third typeface.
- 1px hairline borders at 12–16% white opacity. No drop shadows.
- 8px grid. 24–32px section spacing.
- Card thumbnails 3:4 or 4:5. Typographic placeholder for cards without
  hero image.
- No density toggle. Pick one comfortable density and commit.

---

## Embed strategy — tiered by platform

### Tier 1: Inline render (full preview)
- **YouTube** — `lite-youtube-embed` facade. URL must be
  `youtube-nocookie.com/embed/{id}`, never `/watch?v=`. Handle iframe-
  load-failed with "Open on YouTube ↗" fallback.
- **Vimeo** — fetch oEmbed from `https://vimeo.com/api/oembed.json?url=…`.
  Render `thumbnail_url` as facade. Load iframe only on click.
- **Are.na** — `api.are.na/v3` JSON. Pull channel contents, render as CSS
  grid. ETag-cached. CORS-friendly, call from browser.
- **Unsplash** — fetch via API with `Authorization` header. Hotlink
  `photo.urls.regular`. REQUIRED: ping `photo.links.download_location` on
  use, show attribution with UTM (`?utm_source=reference-room&utm_medium=referral`).
  API call goes through Cloudflare Worker proxy.
- **Pexels** — fetch via API. Hotlink images. Attribution required
  ("Photo by X on Pexels"). Worker proxy.
- **Coolors** — native iframe export works. Embed directly.

### Tier 2: Official widget (lazy-loaded)
- **Pinterest** — official `pinit.js` widget. Inject script only on panel
  open. `data-pin-do="embedBoard"` or `embedPin`. Board must be public.
  Build link-out + OG fallback (widget is in maintenance mode).

### Tier 3: OG card preview (server-scraped via Cloudflare Worker)
- **Dezeen, ArchDaily, Cosmos.so, Movies in Color, Shot.Cafe, Film-Grab,
  Frameset, Adobe Color, IMDb**
- Worker route: `GET /og?url=…` returns `{title, image, description,
  siteName}`. Cache 24h.
- Render as horizontal card: thumbnail left, title + site name +
  description right. Clicking opens source in new tab.

### Tier 4: Link-out only
- Anything not in Tiers 1–3.

### Render order in card panel
1. Are.na grid (cheapest, no iframes)
2. Unsplash + Pexels grids
3. YouTube + Vimeo facades
4. Pinterest widget
5. Coolors iframe
6. OG cards
7. Link-out chips at the bottom

### Embed rules
- Every video embed is a facade by default. Real iframe loads on click only.
- Every `<img>` has `loading="lazy"`.
- IntersectionObserver defers below-fold embed init.
- Max 2 video embeds per card visible without scroll.
- All iframe failures show "Open on [platform] ↗" fallback.

---

## URL schema (brief's original spec)

- `/` — home, palette open by default
- `/card/:slug` — canonical card view
- `/card/:slug?role=dp&color=warm&mood=intimate` — tuned card (shareable)
- `/set/:id` — server-stored pinned set
- `/set/:id?card=:slug` — pinned set opened on a specific card
- `/set/:id?edit=:token` — edit mode for pinned set owner
- `#s={lzcompressed}` — fallback full-app-state

State encoding: `lz-string.compressToEncodedURIComponent(JSON.stringify(state))`.
Include `v=1` schema version field. State stays under 1KB compressed for
typical filter sets.

> **Implementation note**: We adopted hash-based routing (`#/card/:slug?…`)
> for single-file static reliability — see `docs/DECISIONS.md` D-003 —
> and substituted a base64url codec for `lz-string` because it couldn't be
> vendored offline — see D-004.

Every panel open updates URL via `history.pushState`. Back button closes
panel. Copy-link button in panel header copies current URL.

---

## Sharing architecture

### Cloudflare Worker + KV (free tier)
- Bind a KV namespace `SETS`.
- Endpoints:
  - `POST /set` — body `{title, cards, ownerEditToken?}`. Returns
    `{id, editToken}`. ID is 8-char nanoid.
  - `GET /set/:id` — returns full record. No auth.
  - `PUT /set/:id` — body `{title?, cards?}`. Requires `X-Edit-Token` header.
  - `GET /og?url=…` — server-side OG scrape. Cache 24h.
- Records expire after 90 days unless `editToken` was set (claimed sets
  persist 1 year).
- Schema: `{id, title, cards: [{slug, filters, note}], createdAt,
  expiresAt, editToken?}`

### UI surface
- Cmd-S → "Save as pinned set" → name input → POST → show shareable link
  + copy button + optional "Set edit passcode."
- Cmd-K → "Open set…" → paste link or ID → loads `/set/:id`.
- Set view shows all cards as a grid. "Add to this set" button if
  `edit=:token` matches.
- "Fork this set" button always visible → creates new set with same cards
  under user's control.

---

## UI refactor

### Remove
- First-visit role-pick modal. Role becomes a top-bar dropdown defaulting
  to "Production Designer" or last-used. Settable from Cmd-K.
- Density toggle.
- Any "tutorial" overlay.

### Add: Cmd-K command palette (primary navigation)
- Opens from anywhere with `Cmd-K` / `Ctrl-K` / `/`.
- Searches across: all 208 cards, filter values, role values, 6 nav verbs
  (Share, Pin, New set, Reset filters, Toggle theme, Help).
- Recents + pinned shown above search results.
- Fuzzy match, not strict substring.
- Each result shows its shortcut on the right (DM Mono, dim).
- Enter on a card result opens slide-in panel with current role+filters
  applied.
- Free-text query like "dp warm bedroom" should resolve to top hit =
  bedroom card tuned for DP + warm.

### Add: Slide-in detail panel
- Desktop: right-side panel, 40–50vw, dimmer behind, grid still visible.
- Mobile: full-screen, swipe-down to dismiss.
- URL updates via `history.pushState` on open. Back button closes.
- Panel header: Card title (DM Serif) · "Tuned for" chip row (dismissable
  chips for active role + filters) · Copy-link button · Pin button (star)
  · Close button.

### Existing card detail content
Keep the existing structure (Open Top 5, media-type chips, prop clusters,
full link list, notes textarea) BUT:
- Replace the "16 deep-linked search URLs" raw list with the tiered embed
  render order above.
- Notes textarea stays in localStorage per card.
- Prop clusters keep their multi-platform launch but each cluster also
  gets a "Preview" expand that fetches Are.na + Unsplash + Pexels grids
  inline.

### Keyboard shortcuts (final set)
- `/` or `Cmd-K` — palette
- `Esc` — close panel/palette
- `Cmd-Enter` — open first match
- `Cmd-D` — pin/unpin current card
- `Cmd-S` — save current state as pinned set
- `Cmd-L` — copy link to current view
- `Cmd-Shift-K` — reset filters
- `Cmd-,` — toggle theme
- `j` / `k` — navigate card grid
- `1-6` — switch tabs
- `R` — change role (opens palette pre-scoped)
- `F` — open filters

---

## Staged execution

The brief specified 4 separate PRs, not bundled:

- **PR 1: UX foundation** — role dropdown, Cmd-K palette, slide-in panel
  with History API routing, lz-string URL state, copy-link, localStorage
  migration.
- **PR 2: Embed upgrade** — lite-youtube, Vimeo oEmbed, Pinterest pinit.js,
  Are.na API renderer, Worker for Unsplash/Pexels/OG, Coolors iframe, OG
  cards, render order.
- **PR 3: Sharing** — Worker + KV, POST/GET/PUT /set, UI for save/open/
  fork, /set/:id routing, edit-token passcode, 90-day/1-year expiry.
- **PR 4: (don't build unless asked)** — live collab via PartyKit per-set
  room.

In execution, the owner asked to bundle PR 1 + 2 client-side + PR 3
client-side + Worker scaffold into one pass. The Worker is shipped in
`worker/` ready to deploy; image proxies and KV sharing activate once it's
live.

---

## Indian-context additions
- Add Behance India search URLs to chips (`behance.net/search/projects/{query}`
  with India tuning).
- Curated Are.na channel slugs for Indian cinema reference as a "Community
  channels" section per relevant card.
- Festival cards (Diwali, Haldi, Mehendi, Sangeet, Taash Party, etc.) get
  curated Are.na + Pinterest seed channels baked into their `primary_refs`.
- **TMDb (not IMDb)** for any poster/film metadata needs. TMDb has a real
  API; IMDb doesn't license third-party embeds.

---

## Don'ts (from the brief)

- Don't build accounts/auth.
- Don't add real-time collab.
- Don't embed Instagram (Meta has gutted the embed API).
- Don't hotlink Film-Grab, Shot.Cafe, Frameset images — link-out only.
- Don't use IMDb's internal `/videoembed/` — not licensed.
- Don't put API keys in client HTML.
- Don't replace localStorage with anything else for personal state.
- Don't ship without testing iframe-load-failure fallbacks.
- Don't add a tutorial modal.
- Don't add density/theme toggles users didn't ask for.

---

## Definition of done (per PR)

- **PR 1**: keyboard-only user can land → Cmd-K → "aangan" → enter → see
  panel → copy link → reload → same view restored. Mobile equivalent works.
- **PR 2**: opening any card panel shows at least 1 inline-rendered preview
  (Are.na, Pinterest, YouTube facade, or Unsplash grid) before any link-
  out chips. Facade YouTube embed weighs <50KB until click.
- **PR 3**: User A creates pinned set with 5 cards → copies link → User B
  opens link on phone in incognito → sees all 5 cards → can fork to own
  set. Edit-token flow tested.
- **PR 4**: don't build until asked.

---

## Post-brief addition: "no AI search features"

After the refactor shipped, the owner clarified: **no AI / LLM / semantic-
search features anywhere.** The deterministic palette and keyword image
search were verified as acceptable. This is now a hard rule — see
`docs/DECISIONS.md` D-001.
