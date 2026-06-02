/**
 * smoke.js — runs the full client script in a stubbed DOM to confirm it
 * loads top-to-bottom without throwing.
 *
 * What this catches:
 *   - syntax errors anywhere in the script
 *   - top-level runtime errors (null derefs, undefined globals, broken
 *     wrapper chains)
 *   - missing inline-handler globals
 *
 * What this does NOT catch:
 *   - CSS regressions (open the app in a browser for that)
 *   - logic bugs that only show up with real DOM + interaction
 *
 * Usage:  node tests/smoke.js
 * Exit 0 on pass; non-zero on fail.
 *
 * No dependencies. Pure Node (vm + fs). Works on Node 18+.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const htmlPath = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

// Extract the body-end <script>...</script> (the inline scripts in <head>
// are one-liners that don't match the bare-line opening/closing pattern).
const lines = html.split('\n');
let start = -1, end = -1;
for (let i = 0; i < lines.length; i++) {
  const t = lines[i].trim();
  if (t === '<script>') { start = i + 1; end = -1; }
  if (t === '</script>') { end = i; }
}
if (start < 0 || end < 0 || end <= start) {
  console.error('FAIL: could not find <script>...</script> block in index.html');
  process.exit(2);
}
const src = lines.slice(start, end).join('\n');

// ---------- minimal DOM/window stub ----------
function el() {
  return {
    classList: { add() {}, remove() {}, toggle() { return false; }, contains() { return false; } },
    dataset: {},
    style: {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    appendChild(c) { return c; }, insertBefore(c) { return c; },
    removeChild() {}, replaceWith() {}, remove() {},
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
    querySelector() { return el(); }, querySelectorAll() { return []; },
    closest() { return null; }, insertAdjacentHTML() {},
    getBoundingClientRect() { return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }; },
    scrollTo() {}, scrollIntoView() {}, focus() {}, select() {}, click() {},
    parentNode: null, nextSibling: null, offsetParent: {},
    textContent: '', value: '', innerHTML: '', outerHTML: '', href: '#', id: '',
  };
}

const doc = {
  documentElement: el(), body: el(), head: el(),
  readyState: 'complete',
  getElementById() { return el(); },
  querySelector() { return el(); },
  querySelectorAll() { return []; },
  createElement() { return el(); },
  addEventListener() {},
  get activeElement() { return { tagName: 'BODY' }; },
};

const win = {
  addEventListener() {}, removeEventListener() {},
  history: { pushState() {}, replaceState() {} },
  location: { hash: '', origin: 'http://test', pathname: '/' },
  navigator: { clipboard: { writeText: () => Promise.resolve() } },
  CSS: { escape: s => s },
  confirm: () => false,
  open() {},
  matchMedia: () => ({ matches: false, addEventListener() {} }),
  setTimeout, clearTimeout,
  getComputedStyle: () => ({}),
};

const store = new Map();
const localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
};

const ctx = {
  document: doc,
  window: win,
  navigator: win.navigator,
  history: win.history,
  location: win.location,
  confirm: win.confirm,
  localStorage,
  setTimeout, clearTimeout, setInterval, clearInterval,
  console, JSON, Math, Date,
  Object, Array, Set, Map, WeakMap, WeakSet,
  String, Number, Boolean, RegExp, Promise, Symbol,
  parseInt, parseFloat, isNaN, isFinite,
  encodeURIComponent, decodeURIComponent, escape, unescape,
  btoa, atob, URLSearchParams,
  fetch: () => Promise.reject(new Error('no-net')),
  Error, TypeError, RangeError, SyntaxError,
};
win.document = doc;
win.localStorage = localStorage;
vm.createContext(ctx);

try {
  vm.runInContext(src, ctx, { filename: 'index.html:<script>' });
  console.log('SMOKE OK — script loaded in stubbed DOM without throwing');
  process.exit(0);
} catch (e) {
  console.error('SMOKE FAIL:');
  console.error(e && e.stack ? e.stack : e);
  process.exit(1);
}
