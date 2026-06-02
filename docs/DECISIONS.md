# Decisions

Why we made the non-obvious calls. If you're tempted to undo one of these,
read the rationale first and bring receipts.

---

## D-001 · Keep search deterministic — no AI in palette or image grids

**Decision**: The Cmd-K command palette is plain fuzzy text matching plus a
rule-based keyword → filter / role map. The inline image grids (Are.na /
Unsplash / Pexels) are keyword API search. There are **no** embeddings, no
model calls, no semantic search, no LLM-powered "smart suggestions" in
either of those surfaces.

**Why**: The owner explicitly opted out of *AI search features*. A
deterministic palette is faster, predictable, and never embarrasses the
user on stage. Keyword image search has decades of attribution and
licensing precedent; semantic substitution opens both rabbit holes.

**What's NOT this rule**: The owner later shipped a separate, opt-in
**AI Reference Brain** button on `main` for scene-query / script-analysis
use. That's a deliberate, owner-installed feature distinct from search.
It does not change the rule above — the **palette and image grids
remain deterministic**.

**If you're tempted to expand AI elsewhere**: Don't extend AI into
filters, auto-tagging, recommendations, or any search-shaped feature
without **explicit owner approval**. File an issue or ask first.

---

## D-002 · Single HTML file, vanilla JS, no build

**Decision**: The whole app is one `index.html`. Vanilla JS. No bundler.

**Why**: It's a reference launcher used on-set on phones over 4G. One file
loads atomically, caches simply, and never has a "your build broke at
22:00 the night before the shoot" failure mode. Onboarding a new
contributor is `git clone` and `npx serve .` — no node_modules, no setup.

**Trade-off**: We accept some duplication (e.g. the long CSS override
block, repeated SVG glyphs) in exchange for zero build complexity.

**If you need reactivity**: Alpine.js or htmx as inline `<script src>`
includes are acceptable. **No React/Vue/Svelte/build-step frameworks.**

---

## D-003 · Hash-based routing instead of pretty paths

**Decision**: Routes are `#/card/:slug?role=&color=…` and `#s=`/`#set=`,
not real paths.

**Why**: Pretty paths (`/card/:slug`) require server-side rewrites to
`index.html` — that's coupling. A single static HTML file with hash routes
works on **any** static host (GitHub Pages, Cloudflare Pages with no
config, S3, plain Nginx, even `file://` if needed). Reload always survives.

**Trade-off**: The URLs are slightly uglier with the `#`. Acceptable.

**The brief asked for `/card/:slug`**: The Worker (or any deploying host
with rewrites) can serve `index.html` for `/card/*` and `/set/*` and the
routing code already accepts both shapes on load. If you ever ship that,
update `cardHash()` to emit pretty paths — but keep `#`-fallback parsing
for users on existing hash links.

---

## D-004 · base64url(JSON) instead of `lz-string` for URL state

**Decision**: The state codec is JSON → base64url, isolated in `Codec`.

**Why**: The brief specified `lz-string`, but in our sandboxed build
environment all CDNs were blocked, so it couldn't be vendored. Typical
filter state is < 300 bytes raw, so base64url keeps it well under 1KB
without compression.

**The interface is one swap away**: `Codec.encode` / `Codec.decode` are
isolated. If you can vendor `lz-string` (drop the min source inline),
swap them. **But bump the URL prefix** (e.g. `#s1=` for the new codec, keep
`#s=` decoding the old) so existing links still work.

---

## D-005 · Are.na is the working inline embed; YouTube/Vimeo/Coolors stay link-outs

**Decision**: Every card panel shows an inline Are.na image grid (search-
based, no API key, CORS-friendly). YouTube / Vimeo / Coolors facades are
wired but not rendered, because they need specific video IDs / palette
URLs that the app doesn't have.

**Why**: The app is a *search launcher*, not a curated content store. The
brief assumed curated YouTube IDs and Vimeo URLs per card, which don't
exist. Fabricating them risks dead embeds, which look broken. Are.na's
search API is CORS-friendly and returns image blocks for any query — it's
the only platform that gives a real inline preview from a keyword.

**Path forward** (`docs/ROADMAP.md` → Curation gaps): seed `CURATED_YT`,
`CURATED_VIMEO`, `CURATED_COOLORS` maps with real IDs per anchor as the
curation work happens. The facade renderer (`window.refRoomYouTube`) is
ready.

---

## D-006 · Unsplash / Pexels / OG behind a Cloudflare Worker

**Decision**: All API-keyed image services and the OG scrape go through
`worker/`. The app degrades gracefully when no Worker is configured (the
Are.na grid still shows; sharing falls back to URL-encoded links).

**Why**:
- API keys must stay server-side.
- OG scrape is server-required (CORS blocks browser fetches of arbitrary
  pages).
- Sharing wants short, editable IDs — KV is the right primitive.

The Worker is **optional**: the client checks `window.REFROOM_WORKER_BASE`
and falls back cleanly. This lets the app run with zero infra for anyone
who clones it.

---

## D-007 · Default theme is dark; light is a paper variant

**Decision**: Dark `#0E0E0F` is the default. `html[data-theme="light"]`
gives a cream paper variant. The toggle stays (in shortcuts + sidebar
foot), but dark is the hero look.

**Why**: The aesthetic spec is dark-base with amber accent; that's the
brand. Light is preserved as a usability fallback but isn't the design
target.

**FOUC fix**: A tiny inline `<script>` in `<head>` sets `data-theme`
before first paint to avoid a flash of light theme on load.

---

## D-008 · Density toggle retired; force comfortable

**Decision**: The density toggle button is hidden via CSS. On init,
`setDensity('comfortable')` is forced regardless of stored value.

**Why**: The brief said "pick one comfortable density and commit." We
preserve the stored key (in case someone wants the toggle back) but the
UI doesn't expose it.

---

## D-009 · Role modal removed; top-bar dropdown replaces it; default = Production Designer

**Decision**: No first-visit role modal. Top-bar role dropdown defaults
to `artdirector` (displayed as "Production Designer") or last-used. Role
is also settable from the command palette (R key, role chip, mobile
button → palette pre-scoped to roles).

**Why**: The brief explicitly removed the modal. Users were skipping it
anyway. The dropdown is always-available and discoverable.

---

## D-010 · Tuned-for chips are dismissable

**Decision**: The "Tuned for" chip row inside the panel shows role +
active filter pills. Each pill can be clicked to clear that one filter
(or reset role to `any`).

**Why**: Easier than reopening the filter popover to clear a single
dimension. It also makes the active state explicit and editable.

---

## D-011 · Set sharing has two backends: server (KV) and self-contained URL

**Decision**: `Save as set` produces either a short `/#/set/:id` link
(when the Worker is configured — server-stored, editable) or a long
`#set=…` URL-encoded link (when there's no server).

**Why**: The brief specified server-stored sets, but the app must remain
useful with zero infra. The URL-encoded fallback gives the full async-
share + fork flow without a backend. Sets up to ~60 cards fit comfortably
in a URL.

---

## D-012 · Multi-agent context layer (this docs structure)

**Decision**: `AGENTS.md` is canonical. `CLAUDE.md` and `.cursorrules`
defer to it. `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/ROADMAP.md`,
and `docs/REFACTOR_BRIEF.md` carry the full nuance.

**Why**: The owner uses different AIs for different tasks. Context must
survive switching tools, ending and resuming subscriptions, and onboarding
human collaborators. Tests in `tests/` give any agent a sanity gate that
doesn't require trust.
