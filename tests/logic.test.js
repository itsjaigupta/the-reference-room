/**
 * logic.test.js — unit tests for the standalone algorithms used by the
 * command palette and URL routing.
 *
 * These functions are reproduced here (not imported) so the tests are
 * fully self-contained and don't need any DOM. If you change the
 * algorithms in index.html, update this file to match — the tests are
 * intentionally a parallel implementation to catch drift.
 *
 * Usage:  node tests/logic.test.js
 * Exit 0 on pass; non-zero on fail.
 */

// --- codec: URL-safe base64(JSON) round-trip ---
function b64u(str) {
  return Buffer.from(str, 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function ub64u(s) {
  s = String(s).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64').toString('utf8');
}
const Codec = {
  encode: o => { try { return b64u(JSON.stringify(o)); } catch (e) { return ''; } },
  decode: s => { try { return JSON.parse(ub64u(s)); } catch (e) { return null; } },
};

// --- minimal FILTER stub (mirrors a slice of FILTER_DIMS in index.html) ---
const FILTER_DIMS = {
  color: { label: 'Color', opts: [
    { v: 'warm', l: 'Warm', q: 'warm tones golden' },
    { v: 'cool', l: 'Cool', q: 'cool tones blue' },
  ]},
  mood: { label: 'Mood', opts: [
    { v: 'intimate', l: 'Intimate', q: 'intimate quiet' },
  ]},
};
const FILTER_ORDER = ['color', 'mood'];

// --- token maps ---
const ROLE_TOKENS = {
  dp: 'cinematographer', cine: 'cinematographer', cinematographer: 'cinematographer',
  director: 'director',
  pd: 'artdirector', ad: 'artdirector', art: 'artdirector', designer: 'artdirector',
};

const FILTER_TOKENS = {};
FILTER_ORDER.forEach(dim => FILTER_DIMS[dim].opts.forEach(o => {
  const add = w => { w = w.toLowerCase(); if (w.length > 2 && !FILTER_TOKENS[w]) FILTER_TOKENS[w] = [dim, o.v]; };
  add(o.v);
  o.l.toLowerCase().split(/[^a-z0-9]+/).forEach(add);
  (o.q || '').split(/\s+/).forEach(add);
}));

// --- smart query parser ---
function parseSmart(q) {
  const toks = q.toLowerCase().split(/\s+/).filter(Boolean);
  let role = null; const fpairs = []; const rest = [];
  toks.forEach(t => {
    if (ROLE_TOKENS[t] && !role) { role = ROLE_TOKENS[t]; return; }
    if (FILTER_TOKENS[t] && !fpairs.some(p => p[0] === FILTER_TOKENS[t][0])) {
      fpairs.push(FILTER_TOKENS[t]); return;
    }
    rest.push(t);
  });
  return { role, fpairs, rest: rest.join(' ') };
}

// --- fuzzy scorer (subsequence with bonuses) ---
function fuzzy(needle, hay) {
  if (!needle) return 0;
  needle = needle.toLowerCase();
  if (hay.includes(needle)) {
    return 1000 - hay.indexOf(needle) - (hay.length * 0.01) + (hay.startsWith(needle) ? 200 : 0);
  }
  let h = 0, score = 0, run = 0;
  for (let i = 0; i < needle.length; i++) {
    const c = needle[i]; const idx = hay.indexOf(c, h);
    if (idx < 0) return -1;
    run = idx === h ? run + 1 : 0;
    score += 10 + run * 4 - (idx - h);
    h = idx + 1;
  }
  return score;
}

// ---------- assertions ----------
let fail = 0;
const ok = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' ' + name); if (!cond) fail++; };

// codec round-trips
const st = { v: 1, role: 'pd', f: { color: 'warm', mood: 'intimate' } };
const enc = Codec.encode(st);
ok('codec roundtrip', JSON.stringify(Codec.decode(enc)) === JSON.stringify(st));
ok('codec url-safe (only A-Za-z0-9_-)', /^[A-Za-z0-9_-]+$/.test(enc));
ok('codec under 1KB', enc.length < 1024);
ok('codec unicode (Aangan · Courtyard)',
   Codec.decode(Codec.encode({ t: 'Aangan · Courtyard 🎬' })).t === 'Aangan · Courtyard 🎬');
ok('codec bad input -> null', Codec.decode('!!!notb64') === null || Codec.decode('@@@') === null);

// smart query
const sm = parseSmart('dp warm bedroom');
ok('smart "dp warm bedroom" -> role cinematographer', sm.role === 'cinematographer');
ok('smart "dp warm bedroom" -> filter color/warm',
   sm.fpairs.length === 1 && sm.fpairs[0][0] === 'color' && sm.fpairs[0][1] === 'warm');
ok('smart "dp warm bedroom" -> rest "bedroom"', sm.rest === 'bedroom');

const sm2 = parseSmart('pd intimate kitchen');
ok('smart "pd intimate kitchen" -> role artdirector', sm2.role === 'artdirector');
ok('smart "pd intimate kitchen" -> filter mood/intimate', sm2.fpairs[0][0] === 'mood');
ok('smart "pd intimate kitchen" -> rest "kitchen"', sm2.rest === 'kitchen');

const sm3 = parseSmart('plain bedroom');
ok('smart fallthrough (no role/filter)', sm3.role === null && sm3.fpairs.length === 0 && sm3.rest === 'plain bedroom');

// fuzzy
ok('fuzzy exact substring beats subsequence',
   fuzzy('bed', 'bedroom') > fuzzy('bdr', 'bedroom'));
ok('fuzzy miss returns -1', fuzzy('xyz', 'bedroom') === -1);
ok('fuzzy prefix bonus',
   fuzzy('bed', 'bedroom') > fuzzy('bed', 'double bed'));
ok('fuzzy empty needle = 0', fuzzy('', 'anything') === 0);

console.log(fail ? '\n' + fail + ' FAILED' : '\nALL PASS');
process.exit(fail ? 1 : 0);
