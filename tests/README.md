# Tests

Plain Node, no dependencies. Works on Node 18+.

Run **all three checks** before committing any change to `index.html` or
`worker/index.js`:

```bash
node tests/smoke.js                                       # full script loads in a stubbed DOM
node tests/logic.test.js                                  # pure-logic unit tests
cp worker/index.js /tmp/w.mjs && node --check /tmp/w.mjs  # Worker syntax check
```

Or chained:

```bash
node tests/smoke.js && node tests/logic.test.js \
  && cp worker/index.js /tmp/w.mjs && node --check /tmp/w.mjs \
  && echo "ALL CHECKS OK"
```

(Wire into a pre-commit hook if you want — the project intentionally has no
package.json, so use a shell alias or your IDE's pre-commit feature.)

---

## What each test does

### `smoke.js`
Extracts the body-end `<script>…</script>` block from `index.html` and
runs it through Node's `vm.runInContext` against a minimal DOM stub.
Catches:
- syntax errors anywhere in the script
- top-level runtime errors (null derefs, undefined globals)
- broken wrapper chains (e.g. forgetting to expose a `window.*` handler
  that inline `onclick`s rely on)

Does **not** catch CSS regressions or interaction bugs. Run a browser
verification for those.

### `logic.test.js`
Unit tests for three pure algorithms reproduced from `index.html`:
- the URL state codec (`Codec.encode` / `Codec.decode`)
- the fuzzy scorer used by the command palette
- the smart-query parser (`"dp warm bedroom"` → role + filters + rest)

The tests redeclare the algorithms locally (Buffer-based base64 instead
of `btoa`/`unescape`) — the two are equivalent for UTF-8 input. If you
change one of the algorithms in `index.html`, update this file too.

### Worker syntax
`worker/index.js` is an ES module (`export default { fetch }`). Because
the file extension is `.js`, `node --check worker/index.js` will reject
`export`. The clean check is to copy it to a `.mjs` first (shown above).

---

## Adding new tests

Keep them dependency-free Node scripts that exit with `0` on pass, non-
zero on fail. No test runners, no `npm install`. The constraint is that
any agent in any environment can run them.
