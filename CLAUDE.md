# CLAUDE.md

This project follows a **tool-agnostic agent guide**. Read [`AGENTS.md`](./AGENTS.md)
first — it is the canonical context for every contributor (Claude, other AIs,
humans).

## Quick orientation for Claude Code

- The whole app is one static `index.html` (vanilla JS, no build).
- Optional Cloudflare Worker in `worker/` (image proxy + KV-backed shared sets).
- Run `node tests/smoke.js` and `node tests/logic.test.js` after any change
  to verify the script still loads and the pure logic still passes.
- Manual browser verification is required for visual / CSS work — JS tests
  can't catch layout regressions.

## Hard rules (do not violate)

1. **No AI / LLM / semantic-search features anywhere.** Owner has explicitly
   opted out. Palette is deterministic fuzzy matching only.
2. **Single HTML file, vanilla JS.** No build, no React/Vue/Svelte.
3. **Preserve all localStorage** (see `docs/ARCHITECTURE.md` for the schema).
4. **API keys never in client HTML** — Worker secrets only.
5. **Mobile-first**, on-set 4G reliability.

See `AGENTS.md` for the full rules, conventions, where-to-make-changes guide,
and multi-agent workflow.

## When working

- Pull `main` before starting; push before stopping.
- Don't pile up uncommitted edits — commit small, push often.
- The deeper docs live in `docs/`. Read the relevant one before changing
  routing, the codec, the palette, the share flow, or visual tokens.
