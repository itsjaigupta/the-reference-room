# Architecture

A complete map of the codebase so any agent can find what to touch without
re-reading the whole `index.html`.

---

## File map

```
index.html              — the entire app, ~13,000+ lines
assets/home-hero.png    — search-first home background (Higgsfield-generated)
.assetsignore           — assets that should not ship to clients
worker/index.js         — Cloudflare Worker, ES module
worker/wrangler.toml    — Worker config: KV binding, vars, secrets (not in file)
tests/smoke.js          — runs the full script in a stubbed DOM
tests/logic.test.js     — pure-logic unit tests
docs/                   — this folder
chats/chat1.md          — historical design transcript
project/                — historical design prototypes + research PDFs
```

### Two modes
The app has two visual modes toggled by `body.home-mode`:
- **Home mode**: search-first landing — centered query bar over the
  hero image, editorial corner labels, hidden sidebar/topbar/.hint.
  Set inline on `<body>` to avoid app-shell flash on load.
- **App mode**: the full launcher (topbar + filter panel + card grid +
  panel). Removing `home-mode` from `<body>` reveals the app shell.

---

## `index.html` — three regions

### 1. CSS  (~lines 10–1750)

- **Design tokens**: two blocks at the top.
  - `:root { … }` — the **light/paper** variant (secondary theme).
  - `html[data-theme="dark"] { … }` — the **default** (dark `#0E0E0F`, white
    text @ 92%, amber accent, hairline borders, shadows reduced to hairlines).
- **Component CSS**: top-down by section — sidebar, search, tabs, scroll,
  groups, footer, topbar, filter bar, filter popover, cards, panel, modals,
  responsive blocks.
- **2026 REFRESH override block**: search for the comment
  `2026 REFRESH — dark / DM / amber aesthetic + new UX surfaces`. Everything
  added during the refactor lives here: typography overrides, top-bar
  actions, command palette, role dropdown, panel header, embeds, share
  modal, toast, mobile compaction. **Put new component CSS here.**

### 2. Body  (~lines 1800–11400)

- `<div class="app">` — grid `sidebar | main`.
- `<aside class="sidebar">` — brand, role chip, search, 6 tabs, scrollable
  pinned/recent/groups, foot.
- `<main class="main">` — topbar (h1 + meta + new topbar-actions: ⌘K + role
  dropdown), mobile search strip, filter bar (11 dimensions), filter
  popover, content shelves.
- **Cards** — static `<button class="card" data-anchor="…" data-search="…">`
  inside `.card-grid` inside `.set-group` inside `.shelf[data-shelf="…"]`.
- **Panel** — `<aside class="panel">` containing `panel-handle`, the legacy
  floating `.panel-close` (hidden, kept for compat), the new `.panel-top`
  sticky header (title + copy + pin + close), and `.panel-inner` holding
  every `<div class="detail" data-anchor="…">` block (one per card).
- **Overlays** — command palette (`#cmdk` + `#cmdk-bg`), share modal
  (`#share` + `#share-bg`), toast (`#toast`), legacy role modal (`#role-modal`
  + `#role-bg`, kept but no longer auto-opened).

### 3. JS  (~lines 11400–end)

Two layers in one `<script>` tag:

- **Legacy v3 layer** (top): theme, density, tab switching, openCard /
  closePanel, pins, recents, group collapse, search filter, notes /
  checklist persistence, original keyboard handlers, role state, filter
  state, prop clusters, media chips, query augmentation, the v3 panel-open
  patch.
- **2026 REFRESH IIFE** (bottom, after the swipe-to-close IIFE): URL codec,
  smart-query parser, fuzzy match, command palette, role dropdown, History-
  API routing, copy-link, dismissable tuned chips, inline embed injection
  (Are.na + Worker-backed Unsplash/Pexels/OG), set sharing, consolidated
  keyboard map. Wraps `window.openCard`, `window.closePanel`, `window.setRole`,
  `window.setFilter`, `window.clearFilters`, `window.openRoleSheet`.

**Key gotcha**: function declarations in the legacy layer create both a
lexical binding *and* a `window.*` property. Wrapping `window.openCard` does
**not** redirect bare `openCard()` calls. The refresh layer therefore calls
wrapped functions via `window.openCard`, `window.setFilter` etc. when it
needs the wrapped behaviour.

---

## localStorage schema

| Key | Type | Purpose | Default |
|-----|------|---------|---------|
| `refhub_pinned` | JSON array | Pinned card anchors | `[]` |
| `refhub_recent` | JSON array | Recently opened anchors (max 5) | `[]` |
| `refhub_theme` | string | `'dark'` \| `'light'` | `'dark'` |
| `refhub_density` | string | Preserved but unused (toggle retired) | n/a |
| `refhub_group_{id}` | `'c'` \| `'o'` | Sidebar group collapsed/open | open |
| `refhub_role` | string | Role key (`artdirector`, `cinematographer`, …) | `'artdirector'` |
| `refhub_role_seen` | `'1'` | Prevents legacy first-visit modal | `'1'` |
| `refhub_filters_v3` | JSON object | `{dim: value}` for active filters | `{}` |
| `refhub_schema_v` | string | Schema version | `'1'` |
| `notes_{anchor}` | string | Per-card notes textarea content | unset |
| `check_{key}` | `'1'` | Ticked checklist items | unset |

**Migration rules**:
- Never destructively wipe user data.
- If adding fields, bump `refhub_schema_v` and handle old → new in the
  migration block at the top of the refresh IIFE.
- `refhub_density` is kept around even though the toggle was removed —
  removing the key would lose user choice if the toggle ever returns.

---

## URL routing

Hash-based (works on any static host with no rewrites). Schema:

| Pattern | Meaning |
|---------|---------|
| `/` | Home grid |
| `#/card/:slug` | Open card |
| `#/card/:slug?role=pd&color=warm&mood=intimate&…` | Open card with tuned filters |
| `#s={base64url(JSON)}` | Full-state fallback (filters + role, no card) |
| `#/set/:id` | Server-stored shared set (requires Worker) |
| `#set={base64url(JSON)}` | Self-contained shared set (no server needed) |

- `history.pushState` is used for back/forward and reload survival.
- The state codec is **base64url(JSON)** — substitute for `lz-string` (which
  couldn't be vendored offline). The interface is isolated in `Codec` —
  swap to `lz-string` later if you want, but **bump the URL prefix** so old
  links still decode.
- Role names use short aliases in URLs (`pd`, `dp`, `ad`, …). Mapping in
  `ROLE_ALIAS` / `ALIAS_ROLE`.
- Filter dim names are used verbatim (`color=warm`, `mood=intimate`, …).

---

## Worker endpoints (`worker/index.js`)

| Method + Route | Purpose | Auth |
|---|---|---|
| `GET /unsplash?q=` | Unsplash search → `{results:[…]}` | Worker secret |
| `GET /unsplash/track?loc=` | Pings `download_location` (Unsplash guideline) | Worker secret |
| `GET /pexels?q=` | Pexels search → `{results:[…]}` | Worker secret |
| `GET /arena?q=` | Are.na search proxy (bot-block bypass) | none |
| `GET /pinterest/oembed?url=` | Pinterest oEmbed proxy | none |
| `GET /og?url=` | OpenGraph scrape, edge-cached 24h | none |
| `POST /ai/query` | AI Reference Brain — scene query (opt-in feature) | Worker secret |
| `POST /ai/script` | AI Reference Brain — script analysis (opt-in feature) | Worker secret |
| `POST /set` | Create shared set, returns `{id, editToken}` | none |
| `GET /set/:id` | Read shared set (editToken stripped) | none |
| `PUT /set/:id` | Edit shared set | `X-Edit-Token` header |
| `GET /health` | Health check | none |

> `/ai/query` and `/ai/script` power the opt-in **AI Reference Brain** button
> (`.ai-btn` → `openAI()` in `index.html`). They are **not** wired into the
> Cmd-K palette or image grids, which remain deterministic. See
> `docs/DECISIONS.md` D-001.

CORS is wide open (`ALLOW_ORIGIN: "*"`) for development — lock it to the
real origin before going live.

Set sharing: records expire after **90 days** by default, **1 year** if an
edit passcode was set or the set was edited.

---

## Adding a new card

1. Pick a `data-anchor` slug — lowercase, underscores, **must be unique**
   and **stable forever** (it's a URL slug and a localStorage key namespace).
2. Add the card markup inside the right `.set-group` in the right
   `.shelf[data-shelf="sets"]` or `[data-shelf="acts"]`:
   ```html
   <button class="card" data-anchor="my_slug" data-search="my slug search keywords">
     <div class="card-body">
       <div class="card-icon"><svg …></svg></div>
       <div class="card-name">My Card Name</div>
       <div class="card-blurb">Short description.</div>
     </div>
     <button class="card-pin" data-anchor="my_slug" title="Pin"
             onclick="event.stopPropagation();togglePin(this,'my_slug')">
       <svg …><polygon points="…"/></svg>
     </button>
   </button>
   ```
3. Add a matching `<div class="detail" data-anchor="my_slug">` inside
   `#panel-inner` — copy an existing detail block and update the icon,
   title, blurb, links, and the `notes_{anchor}` textarea key.
4. Add an entry in the sidebar navigation under the right group's
   `<div class="sb-groupbody">`:
   ```html
   <a href="#my_slug" class="sb-cat" data-anchor="my_slug">My Card Name</a>
   ```
5. Update the group's `<span class="sb-count">N</span>` count.
6. Bump the shelf's title count (search `titles = {` in JS — only affects
   "84 categories" topbar meta).
7. **If the card has its own prop clusters**, add to `CLUSTERS_BY_ANCHOR` in
   JS. Otherwise it inherits its group default in `CLUSTERS_BY_GROUP`.
8. Run `node tests/smoke.js` (still loads) and `node tests/logic.test.js`
   (still passes). Open the app and click the card.

---

## Key invariants

- **`data-anchor` is permanent.** Renaming breaks shared links and orphans
  user notes.
- **`refhub_*` localStorage keys are permanent.** Add new keys; never repurpose.
- **No third typeface.** Two fonts: DM Serif Display, DM Mono.
- **One accent.** Tungsten amber.
- **Hairlines, not shadows.** Elevation tokens are remapped to ring borders.
- **The 2026-refresh IIFE is the last thing in the script.** New top-level
  state and wrappers belong inside it.
- **All third-party API keys live in the Worker.** Never in `index.html`.
