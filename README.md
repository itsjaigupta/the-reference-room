# The Reference Room

A single-page visual reference launcher for Indian film / ad / fashion
production. Live at **currentmethod.in**.

- ~146 scene & activity cards, plus cinematographer / film / tool / checklist
  shelves
- Click a card → slide-in panel with an inline Are.na image grid + tuned
  link-outs to 15+ reference sites (Pinterest, Film-Grab, Shot.Cafe, Are.na,
  Cosmos, Dezeen, ArchDaily, Adobe Color, Coolors, Unsplash, Pexels,
  YouTube, …)
- Role-aware queries (DP / Director / Production Designer / Stylist / etc.)
  + 11-dimension filter system (color, time of day, mood, weather, occasion,
  character, era, region, class, medium, lens)
- Command palette (Cmd-K / Ctrl-K / `/`) — deterministic fuzzy launcher
- Shareable URLs for every view; "Save as pinned set" → a link to send a
  director
- Dark `#0E0E0F` base, DM Serif Display + DM Mono, single amber accent

**Stack**: one static `index.html` (vanilla JS, no build step) + an optional
Cloudflare Worker (`worker/`) for image proxies and KV-backed shared sets.
localStorage for personal state. That's it.

---

## Quick start

### Run the app (Are.na embeds work, no API keys needed)

```bash
npx serve .         # from repo root → open the printed URL
```

Don't open `index.html` as a `file://` — browsers block its network calls.

### Add Unsplash + Pexels grids + KV-backed sharing

```bash
cd worker
# create .dev.vars with UNSPLASH_KEY=... and PEXELS_KEY=... (gitignored)
npx wrangler dev    # → http://localhost:8787
```

Then in `index.html` `<head>`, temporarily set
`window.REFROOM_WORKER_BASE = "http://localhost:8787"` (don't commit), and
serve the app with `npx serve .` in another terminal.

### Deploy

See [`worker/README.md`](./worker/README.md) for the Cloudflare Worker deploy
walkthrough. After deploying, set `REFROOM_WORKER_BASE` to the production
URL and commit.

---

## For AI agents / IDEs / new contributors

**This repo is designed to be picked up by any code-capable AI in any IDE
without losing context.** Read these first:

- [`AGENTS.md`](./AGENTS.md) — canonical agent guide (cross-tool)
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — file layout, structure,
  localStorage schema, URL routing, Worker endpoints
- [`docs/DECISIONS.md`](./docs/DECISIONS.md) — why we made each non-obvious call
- [`docs/ROADMAP.md`](./docs/ROADMAP.md) — done, pending, NOT in scope
- [`docs/REFACTOR_BRIEF.md`](./docs/REFACTOR_BRIEF.md) — the original product
  brief (source intent)

Tool-specific files (`CLAUDE.md`, `.cursorrules`) defer to `AGENTS.md`.

**Sanity check before committing** any change to `index.html` or
`worker/index.js`:

```bash
node tests/smoke.js          # full script loads in a stubbed DOM
node tests/logic.test.js     # codec / fuzzy / smart-query unit tests
```

See [`tests/README.md`](./tests/README.md) for more.

---

## Hard rules

Lifted from `AGENTS.md` because they're easy to miss:

1. **No AI / LLM / semantic-search features.** The owner has explicitly
   opted out. The palette is deterministic; keyword image search only.
2. **Single HTML file, vanilla JS.** No build pipeline. Alpine.js or htmx
   only if reactivity genuinely needed. **No React/Vue/Svelte.**
3. **Preserve all localStorage** on every change. Schema is in
   `docs/ARCHITECTURE.md`.
4. **API keys never in client HTML.** Worker secrets only.
5. **Mobile-first**, on-set 4G reliability.

---

## Repo layout

```
index.html              — the entire app
worker/                 — Cloudflare Worker (image proxy + OG + KV shared sets)
tests/                  — runnable sanity tests (no dependencies)
docs/                   — architecture, decisions, roadmap, original brief
chats/                  — historical design transcripts (pre-refactor)
project/                — earlier design prototypes (pre-refactor)
AGENTS.md               — canonical agent guide
CLAUDE.md, .cursorrules — tool pointers to AGENTS.md
README.md               — you are here
```

---

## License & credits

Created at currentmethod.in. Original Claude Design handoff in `chats/` and
`project/` (pre-refactor) preserved for historical context.

Visual references inside the app come from Are.na, Unsplash, and Pexels via
their public APIs — each with attribution and link-outs per their guidelines.
