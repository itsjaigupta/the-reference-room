# AGENTS.md — The Reference Room

> **If you are an AI agent, IDE assistant, or new contributor: read this file
> first.** It is the canonical project context. Every tool-specific file
> (`CLAUDE.md`, `.cursorrules`, etc.) defers to this one.

This project is designed to be picked up by **any** code-capable AI or human in
**any** IDE without losing context. The architecture is deliberately boring
(one HTML file, vanilla JS, one optional Cloudflare Worker) so the docs can
carry the nuance.

---

## TL;DR

- **What**: A single-page visual reference launcher for Indian film / ad /
  fashion production at `currentmethod.in`. ~146 scene/activity cards plus
  cinematographer / film / tool shelves. Click a card → slide-in panel with
  inline Are.na image grid + tuned link-outs to 15+ reference sites.
- **Stack**: One static `index.html` (vanilla JS, no build) + an optional
  Cloudflare Worker in `worker/` (image proxy + OG scrape + KV-backed
  shareable sets). No backend otherwise. localStorage for personal state.
- **Status**: PR 1 (UX foundation) + PR 2 (client embeds) + PR 3 (sharing)
  shipped; Worker scaffolded, ready to deploy. See `docs/ROADMAP.md`.
- **First thing to do in a fresh session**: open this file, then
  `docs/ARCHITECTURE.md`, then `node tests/smoke.js` to confirm the script
  still loads cleanly.

---

## Owner preference — ask with the picker UI, don't assume

Standing instruction from the owner: when you have a question, or you're
proposing a solution, plan, or a choice between approaches, **ask with a
clickable multiple-choice picker instead of assuming.** Offer concrete,
enumerated options.

- **Claude Code**: use the **AskUserQuestion** tool (the clickable
  questionnaire). Other assistants / IDEs: present clearly numbered options and
  wait for a pick before acting.
- Applies even to seemingly small forks — a quick pick beats a wrong
  assumption the owner has to unwind.
- Truly trivial, reversible defaults don't each need a prompt; **when in
  doubt, ask.**

---

## How to run it

### Just the app (Are.na embeds work, no API keys needed)

```bash
npx serve .         # from repo root → open the printed URL
```

Do **not** open `index.html` via `file://` — browsers block its network calls.

### Full stack (adds Unsplash/Pexels grids + KV-backed sharing)

```bash
cd worker
# create .dev.vars (gitignored) with:
#   UNSPLASH_KEY=...
#   PEXELS_KEY=...
npx wrangler dev    # → http://localhost:8787
```

Then in `index.html` head, **temporarily** set:

```html
<script>window.REFROOM_WORKER_BASE = "http://localhost:8787";</script>
```

Don't commit that line. Serve the app with `npx serve .` in another terminal.

### Deploy the Worker

See `worker/README.md`. After deploy, set `REFROOM_WORKER_BASE` to the
production URL and commit.

---

## Sanity tests (run these after any change)

```bash
node tests/smoke.js       # full script loads in stubbed DOM without throwing
node tests/logic.test.js  # unit tests for codec, fuzzy match, smart query
node --check worker/index.js   # Worker syntax check
```

If `smoke.js` or `logic.test.js` fails, **do not commit** until it's fixed.

---

## Repo layout

```
index.html              — the entire app (CSS + body markup + JS in one file)
worker/                 — Cloudflare Worker (optional but recommended)
  index.js              — Worker code (ES module)
  wrangler.toml         — Worker config (KV binding, vars)
  README.md             — deploy walkthrough
  .gitignore            — keeps .dev.vars out of git
tests/                  — runnable sanity tests
  smoke.js              — DOM-stub load test
  logic.test.js         — pure-logic unit tests
  README.md             — how to run
docs/
  ARCHITECTURE.md       — file map, structure, schemas, invariants
  DECISIONS.md          — why we made the calls we made
  ROADMAP.md            — done / pending / out of scope
  REFACTOR_BRIEF.md     — the original product brief (source intent)
chats/, project/        — historical design artifacts (pre-refactor)
AGENTS.md               — you are here
CLAUDE.md, .cursorrules — tool-specific pointers to AGENTS.md
README.md               — human-facing project intro
```

---

## Hard rules — never break these

1. **Keep search deterministic — the Cmd-K palette and the image-grid
   embeds (Are.na / Unsplash / Pexels) must never use AI / LLM /
   semantic search.** The owner explicitly opted out of *AI search
   features*. The palette is plain fuzzy match + rule-based
   keyword→filter map. The image grids are keyword API search. **Do
   not** add embeddings, model calls, or "smart suggestions" to either.
   - There **is** an opt-in **AI Reference Brain** button (scene-query /
     script-analysis) on `main`, separate from search. That's the
     owner's call. Don't expand AI into other features (filters,
     auto-tagging, recommendations) without explicit owner approval.
2. **Single HTML file.** No build pipeline. Vanilla JS. Alpine.js or htmx are
   acceptable only if reactivity becomes painful. **No React / Vue / Svelte.**
3. **Preserve all localStorage keys** on any change. Schema is in
   `docs/ARCHITECTURE.md`. If you must migrate, bump `refhub_schema_v` and
   handle the upgrade in JS — never wipe user data.
4. **API keys never in client HTML.** Only in the Worker (`.dev.vars` locally
   / `wrangler secret` in production). `.dev.vars` is gitignored — keep it
   that way.
5. **Mobile-first, on-set 4G reliability.** Heavy assets, blocking external
   scripts, and slow loads are bugs. Inline what you can; lazy-load embeds.
6. **Don't add**: accounts/auth, real-time collab, Instagram embeds, tutorial
   modals, density toggles, more theme variants. See `docs/ROADMAP.md` →
   "Explicitly out of scope".

---

## Visual conventions

- **Palette**: dark `#0E0E0F` base by default; one accent in the tungsten amber
  range `#C8841C` → `#E5A042`. **No other accents.** Light theme is a paper
  variant (secondary).
- **Type**: DM Serif Display for titles + section headers; DM Mono for
  everything else. No third typeface.
- **Lines, not shadows**: 1px hairline borders at 12–16% white opacity. **No
  drop shadows.**
- **Grid**: 8px; section spacing 24–32px.
- **Cards**: 3:4 or 4:5 thumbnails; typographic placeholder when no hero
  image (current state — none of the cards have hero images yet).
- **Text**: body at 92% white opacity on dark.

---

## Where to make changes — by specialty

The whole app is in one file, but each kind of work has a clear region.

### Visual designer / CSS / theme
- **Tokens**: `index.html` → `:root { … }` (light) and
  `html[data-theme="dark"] { … }` (dark, the default).
- **Component styles**: read top-down — sidebar, topbar, cards, panel, modals.
- **The 2026 refresh overrides**: search for the comment block
  `2026 REFRESH — dark / DM / amber aesthetic` near the end of the
  `<style>` tag. All new components (command palette, role dropdown, panel
  header, embeds, share modal, toast) live here.
- **Don't** touch JS unless adding new selectors used by JS.

### Content writer / card copywriter / curator
- **Card names + blurbs**: static HTML in the body of `index.html`. Each card
  is a `<button class="card" data-anchor="…">` with a `.card-name` and
  `.card-blurb`. Find the matching detail by `data-anchor`.
- **Filter labels** + **role labels**: `FILTER_DIMS` and `ROLES` constants in
  the JS (search for `const FILTER_DIMS=` and `const ROLES=`).
- **Keep `data-anchor` values stable** — they're URL slugs and localStorage
  keys. Renaming a card name is fine; renaming its anchor breaks shared links.
- **For curated seed data** (community Are.na channels, YouTube reference
  IDs, OG article URLs for Tier-3 sources): see `docs/ROADMAP.md` →
  "Curation gaps".

### Code / UX / feature work
- **New UX behavior**: append to the JS in `index.html`. Follow the IIFE
  pattern used by the 2026-refresh block. Wrap `window.openCard`/
  `window.closePanel`/`window.setRole` etc. rather than monkeypatching by
  bare name — the script's function declarations create both lexical and
  `window.*` bindings that diverge when wrapped.
- **Filter dimensions / options**: `FILTER_DIMS` and `FILTER_ORDER`.
- **Roles**: `ROLES`, `ROLE_ORDER`, `ROLE_ALIAS`, `ROLE_TOKENS`.
- **URL routing**: `cardHash()`, `routeFromHash()`, `applyTuningFromParams()`.
- **Codec**: `b64u`/`ub64u`/`Codec`. **Isolated for an easy swap to
  `lz-string`** if you can vendor it offline (CDNs are blocked in some
  sandboxes). See `docs/DECISIONS.md`.

### Worker / backend
- Everything lives in `worker/index.js` (ES module, `export default { fetch }`).
- Routes: `/unsplash`, `/unsplash/track`, `/pexels`, `/og`, `POST /set`,
  `GET /set/:id`, `PUT /set/:id`.
- CORS is wide-open during dev (`ALLOW_ORIGIN = "*"` in `wrangler.toml`) —
  lock it down before going live.
- Secrets via `wrangler secret put`. Never check in API keys.

---

## Workflow for changes

1. **Pull `main`** before starting. Read the relevant file in `docs/`.
2. **Baseline** the tests: `node tests/smoke.js && node tests/logic.test.js`.
3. Make focused, atomic changes.
4. **Re-run the tests**, plus a manual browser pass — JS-only checks can't
   catch CSS regressions. Open a card, switch filters, toggle a role, copy
   a link, reload, verify state restores. On mobile, swipe-down dismiss.
5. **Commit** with a clear "why" message (the diff says "what"). One logical
   change per commit.
6. **Push.** Don't accumulate uncommitted work — that's what loses context.

---

## Multi-agent etiquette

The owner uses different AIs for different tasks (design, code, writing,
research). To avoid stepping on each other:

- **Always `git pull` before starting.** Always `git push` before stopping.
- **Stay in your lane** unless you've read the cross-domain doc:
  - Design agent: limit to CSS + static markup. Read JS only to learn what
    classes/IDs exist.
  - Code agent: read `docs/DECISIONS.md` before touching routing, the codec,
    the palette, or the share flow.
  - Writer/curator: copy and content lives in static HTML and the JS
    constants (`FILTER_DIMS`, `ROLES`). Don't touch routing/state code.
  - Worker/ops agent: touch `worker/` freely; don't change the client
    contract (endpoint shapes) without updating `index.html`.
- **Run the sanity tests** before pushing. If they fail, fix or revert.
- **One concern per commit.** A design pass should not also contain a
  routing fix. Keeps the history reviewable.
- **When in doubt, leave a TODO** with your initials and the date instead of
  guessing. A clear TODO is better than a wrong fix.

---

## Deeper context

- `docs/ARCHITECTURE.md` — file structure, JS layout, localStorage schema,
  URL routing schema, Worker endpoints, "how to add a new card".
- `docs/DECISIONS.md` — every non-obvious choice and why.
- `docs/ROADMAP.md` — what's done, what's pending, what's explicitly NOT
  being built, curation gaps.
- `docs/REFACTOR_BRIEF.md` — the original product brief.
- `worker/README.md` — Worker deploy walkthrough.
- `chats/chat1.md` — design transcripts from the original Claude Design
  handoff (pre-refactor; historical).
- `project/` — earlier design prototypes (pre-refactor; historical).

---

## When you're truly stuck

If the docs don't answer your question and the code doesn't either, **leave
a clearly-marked TODO and a commit explaining what you tried.** The next
agent (or human) will pick it up. That's the whole point of this setup.
