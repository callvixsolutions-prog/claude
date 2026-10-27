/**
 * Round 11 regression checks.
 *
 * Each of these exists because round 11 fixed the thing it tests by hand, and a
 * hand fix on a site with no build step and no template engine comes back the
 * first time a page is copied from an older one. Every test below was run once
 * against a deliberately broken tree and seen to fail before it was trusted.
 *
 * The campaign pages (/pest-control-answering-service/ and its /schedule/ page) and
 * preview/ are outside every rule here; scripts/lp-answering.test.mjs covers them.
 *
 * Run with `npm test`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const EXCLUDED_DIRS = new Set(['pest-control-answering-service', 'docs', 'preview', '.git', 'node_modules', 'scripts', 'assets', 'css', 'js', '.github', '.claude']);

function htmlFiles(dir = ROOT, out = []) {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    const rel = relative(ROOT, abs);
    if (EXCLUDED_DIRS.has(rel.split('/')[0])) continue;
    if (statSync(abs).isDirectory()) htmlFiles(abs, out);
    else if (entry.endsWith('.html')) out.push(rel);
  }
  return out.sort();
}
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const pages = htmlFiles().map((f) => [f, read(f)]);
const FROZEN = JSON.parse(read('scripts/round11-frozen.json'));

/* ---------------------------------------------------------------- text views */
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘',
  rdquo: '”', ldquo: '“', hellip: '…', times: '×', middot: '·', rarr: '→', larr: '←', copy: '©', trade: '™', reg: '®' };
function decode(s) {
  return s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => (n in ENTITIES ? ENTITIES[n] : m));
}
const squash = (s) => s.replace(/\s+/g, ' ').trim();
/* Typography only: the markup uses curly quotes (&rsquo;) where the JSON-LD has
   straight ones, and that is the one difference "verbatim" forgives. */
const plainQuotes = (s) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
/* Inline elements are removed without leaving a space, so "<a>FieldRoutes</a>,"
   reads "FieldRoutes," as it does on screen; every other tag is a word break. */
const INLINE = /<\/?(?:a|strong|em|b|i|span|sup|sub|small|code|time|abbr|cite|u|mark)\b[^>]*>/gi;
/** What a visitor can read: the body, without scripts, styles, comments or tags. */
function visibleText(html) {
  const body = html.slice(html.indexOf('<body'));
  return squash(decode(body.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(INLINE, '').replace(/<[^>]+>/g, ' ')));
}
function jsonLdBlocks(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
}
/** Everything a machine reads that a visitor does not: JSON-LD and the meta/OG/Twitter content attributes. */
function machineText(html) {
  const meta = [...html.matchAll(/<meta\s+(?:name|property)="[^"]*"\s+content="([^"]*)"/g)].map((m) => m[1]);
  const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [, ''])[1];
  return squash(decode([title, ...meta, ...jsonLdBlocks(html)].join(' \n ')));
}
/** Every string value in a parsed JSON-LD document. */
function stringsIn(node, out = []) {
  if (typeof node === 'string') out.push(node);
  else if (Array.isArray(node)) node.forEach((n) => stringsIn(n, out));
  else if (node && typeof node === 'object') Object.values(node).forEach((n) => stringsIn(n, out));
  return out;
}

/* ------------------------------------------------------------- 1. anchors */
test('every same-page #fragment has a matching id, and every skip link resolves', () => {
  /* The homepage linked to #pricing for a round with no id="pricing" on the
     page, and /tools/ shipped a skip link to #main on a <main> with no id. */
  const broken = [];
  for (const [file, html] of pages) {
    const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    for (const m of html.matchAll(/<a\b[^>]*\shref="#([^"]*)"[^>]*>/g)) {
      if (m[1] === '') continue;                       /* href="#" is a different defect, not a fragment */
      if (!ids.has(m[1])) broken.push(`${file}: href="#${m[1]}" has no id="${m[1]}"`);
    }
    const skip = html.match(/<a\b[^>]*class="[^"]*\bskip-link\b[^"]*"[^>]*>/);
    if (!skip) { broken.push(`${file}: no skip link`); continue; }
    const target = (skip[0].match(/\shref="#([^"]+)"/) || [])[1];
    if (!target || !ids.has(target)) broken.push(`${file}: skip link target "#${target}" does not exist`);
  }
  assert.deepEqual(broken, [], `fragment links that go nowhere:\n  ${broken.join('\n  ')}`);
});

/* --------------------------------------------------------------- 2. fonts */
test('the Google Fonts stylesheet is requested exactly once per page', () => {
  /* Counted outside <noscript>: every page also carries the same link inside a
     <noscript> as the no-JavaScript fallback, and that one is not a second
     request. Also asserts Sora 800 has not come back — nothing uses it. */
  const wrong = [];
  for (const [file, html] of pages) {
    const live = html.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
    const links = [...live.matchAll(/<link\b[^>]*href="https:\/\/fonts\.googleapis\.com\/css2[^"]*"[^>]*>/g)].map((m) => m[0]);
    if (links.length !== 1) wrong.push(`${file}: ${links.length} Google Fonts stylesheet links outside <noscript>`);
    for (const l of [...html.matchAll(/fonts\.googleapis\.com\/css2[^"]*/g)]) {
      if (/Sora:wght@[^&"]*800/.test(l[0])) wrong.push(`${file}: requests Sora 800, which no rule uses`);
    }
  }
  assert.deepEqual(wrong, [], wrong.join('\n'));
});

/* ---------------------------------------------------------------- 3. sand */
test('sand is not a background anywhere in the shared stylesheet', () => {
  /* Sand (#e9e0d3) was the ground of 4 of 10 homepage sections. It is retired as
     a token and as a literal; --warm-50 is the only warm tint and is for
     components. This fails on the hex, on any --sand* token, and on --warm-50
     used by a section-level selector. */
  const css = read('css/style.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const hits = [];
  if (/--sand[\w-]*\s*:/.test(css)) hits.push('a --sand token is defined');
  for (const chunk of css.split('}')) {
    const i = chunk.indexOf('{');
    if (i === -1) continue;
    const sel = squash(chunk.slice(0, i)); const body = chunk.slice(i + 1);
    for (const m of body.matchAll(/background(?:-color|-image)?\s*:\s*([^;]+)/g)) {
      if (/#e9e0d3|var\(--sand/i.test(m[1])) hits.push(`${sel} paints sand: ${m[1].trim()}`);
      if (/var\(--warm-50\)/.test(m[1]) && /(^|,)\s*\.(section|hero|page-hero)(--[\w-]+)?\s*(,|$)/.test(sel)) hits.push(`${sel} uses --warm-50 as a section background`);
    }
  }
  for (const [file, html] of pages) {
    if (/#e9e0d3|var\(--sand/i.test(html)) hits.push(`${file}: references sand in page-level styles`);
  }
  assert.deepEqual(hits, [], hits.join('\n'));
});

/* ------------------------------------------------------------- 4. JSON-LD */
test('JSON-LD parses, and every FAQPage question and answer is on the page verbatim', () => {
  /* A claim lives twice on these pages — in the markup and in the schema — in
     two entity encodings. Fixing one and not the other publishes the old claim
     to every answer engine. Both sides are entity-decoded and whitespace-
     collapsed before comparing, and nothing else is forgiven. */
  const problems = []; let faqs = 0;
  for (const [file, html] of pages) {
    const seen = plainQuotes(visibleText(html));
    for (const raw of jsonLdBlocks(html)) {
      let doc;
      try { doc = JSON.parse(raw); } catch (e) { problems.push(`${file}: JSON-LD does not parse (${e.message})`); continue; }
      const nodes = doc['@graph'] || [doc];
      for (const n of nodes) {
        if (n['@type'] !== 'FAQPage') continue;
        for (const q of n.mainEntity || []) {
          faqs++;
          const name = plainQuotes(squash(decode(q.name || ''))); const text = plainQuotes(squash(decode((q.acceptedAnswer || {}).text || '')));
          if (!seen.includes(name)) problems.push(`${file}: FAQ question not visible: "${name.slice(0, 70)}"`);
          if (!seen.includes(text)) problems.push(`${file}: FAQ answer not visible verbatim: "${text.slice(0, 70)}…"`);
        }
      }
    }
  }
  console.log(`    FAQ entries compared: ${faqs}`);
  assert.ok(faqs > 20, `only ${faqs} FAQ entries found — the extractor has stopped seeing them`);
  assert.deepEqual(problems, [], problems.join('\n'));
});

/* ---------------------------------------------------------- 5. claim lint */
/* Sentences that describe a customer base Callvix does not have, promise an
   absolute, or promise something unmeasurable. Each allow-list entry names the
   file and the exact text, and says in one line why it is not that. */
const CLAIM_PATTERNS = [
  [/\b(?:most|many|a lot of|some)\s+(?:[\w-]+\s+){0,2}(?:offices|companies|customers|clients|owner-operators|shops)\b[^.?!]{0,80}/gi, 'describes a customer base'],
  [/\boffices (?:like yours )?(?:usually|tend to|typically|often)\b[^.?!]{0,60}/gi, 'describes a customer base'],
  [/\b(?:we see|our clients|our customers)\b[^.?!]{0,60}/gi, 'describes a customer base'],
  [/\bevery single call\b|\bnever a generic\b|\bno long-term contract, ever\b|\ba robot can(?:'|’)t fake\b/gi, 'absolute claim'],
  [/\bleaking\b[^.?!]{0,40}/gi, 'unmeasurable promise'],
];
const CLAIM_ALLOW = [
  /* General statements about how pest control companies operate, not about Callvix's
     customers. Unsourced; listed in the round 11 review for the owner's judgement. */
  ['blog/ai-vs-human-answering-service-pest-control.html', 'some pest control companies, a hybrid', 'a conditional about the market ("for some companies a hybrid is right"), not a customer count'],
  ['blog/ai-vs-human-answering-service-pest-control.html', 'Some companies split the work', 'describes an arrangement that exists in the market, not Callvix customers'],
  ['blog/ai-vs-human-answering-service-pest-control.html', 'Some companies use an automated system', 'the same sentence as an FAQ answer and its JSON-LD copy'],
  ['blog/pest-control-call-script-intake-form.html', 'Some companies route every commercial enquiry', 'owner-approved wording (round 11 pre-merge): an example of a rule some companies use, not a claim about Callvix customers'],
  ['privacy-policy.html', 'many companies at optout', 'owner-approved privacy wording (27 Oct 2026): the ad networks a visitor can opt out of at optout.aboutads.info, not Callvix customers'],
];
test('no sentence claims a customer base, an absolute or an unmeasurable result', () => {
  const hits = []; const used = new Set();
  const scan = (file, where, text) => {
    for (const [re, why] of CLAIM_PATTERNS) {
      for (const m of text.matchAll(re)) {
        const ctx = text.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40);
        const allow = CLAIM_ALLOW.findIndex(([f, t]) => f === file && ctx.includes(t));
        if (allow !== -1) { used.add(allow); continue; }
        hits.push(`${file} [${where}] ${why}: "…${squash(m[0]).slice(0, 110)}"`);
      }
    }
  };
  for (const [file, html] of pages) { scan(file, 'visible', visibleText(html)); scan(file, 'schema/meta', machineText(html)); }
  scan('llms.txt', 'llms.txt', squash(read('llms.txt')));
  const stale = CLAIM_ALLOW.filter((_, i) => !used.has(i)).map(([f, t]) => `${f}: "${t}"`);
  assert.deepEqual(hits, [], `claims to rewrite, or to allow-list with a reason:\n  ${hits.join('\n  ')}`);
  assert.deepEqual(stale, [], `allow-list entries that no longer match anything — remove them:\n  ${stale.join('\n  ')}`);
});

/* -------------------------------------------------------------- 6. frozen */
test('/services title, description and H1, and every canonical and robots tag, match the baseline', () => {
  const diffs = [];
  const s = read('services.html');
  const got = { title: (s.match(/<title>([\s\S]*?)<\/title>/) || [])[1], description: (s.match(/<meta name="description" content="([^"]*)"/) || [])[1], h1: (s.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] };
  for (const k of Object.keys(FROZEN.services)) if (got[k] !== FROZEN.services[k]) diffs.push(`services.html ${k}: "${got[k]}" (baseline "${FROZEN.services[k]}")`);
  for (const [file, html] of pages) {
    const want = FROZEN.pages[file];
    if (!want) { diffs.push(`${file}: not in scripts/round11-frozen.json — add its canonical and robots there deliberately`); continue; }
    const canonical = (html.match(/<link rel="canonical" href="([^"]*)"/) || [])[1] ?? null;
    const robots = (html.match(/<meta name="robots" content="([^"]*)"/) || [])[1] ?? null;
    if (canonical !== want.canonical) diffs.push(`${file} canonical: ${canonical} (baseline ${want.canonical})`);
    if (robots !== want.robots) diffs.push(`${file} robots: ${robots} (baseline ${want.robots})`);
  }
  for (const file of Object.keys(FROZEN.pages)) if (!pages.some(([f]) => f === file)) diffs.push(`${file}: in the baseline but no longer in the site`);
  assert.deepEqual(diffs, [], diffs.join('\n'));
});

/* ------------------------------------------------------ 7. campaign page */
test('the retired campaign pages stay archived, and /thank-you is still noindex', () => {
  /* /pest-control-call-demo/ and its v1 copy were retired on 27 Oct 2026 (git tag archive/landing-pages-2026-10-27)
     and redirect to /pest-control-answering-service/; scripts/lp-answering.test.mjs checks the redirects. */
  for (const dir of ['pest-control-call-demo', 'pest-control-call-demo-v1']) assert.ok(!existsSync(join(ROOT, dir)), dir + ' is back in the site');
  assert.match(read('thank-you.html'), /<meta\s+name="robots"[^>]*content="[^"]*noindex/i, '/thank-you must stay noindex');
});

/* ------------------------------------------------------- 8. banned strings */
const BANNED = [
  [/Chris Taylor/gi, 'no person is named on the site'],
  [/\bEgypt(?:ian)?\b|\bCairo\b/gi, 'location is not stated (owner decision)'],
  [/weekly activity summary/gi, 'reporting frequency and format are not committed'],
  [/not (?:a )?real (?:callvix )?(?:calls?|customers?|clients)|not real callvix|hypothetical/gi, 'owner decision, 24 Oct 2026: no "not a real call" style disclaimers and no "hypothetical"; call examples "examples"'],
  [/illustrat\w*/gi, 'owner decision, 24 Oct 2026: no "illustrative" wording; label assumed figures as example figures the reader replaces'],
  [/billed monthly|in advance|billed weekly|following Monday|no penalty|pause, or cancel|add, remove, or cancel/gi, 'Callvix billing mechanics are not published'],
];
const BANNED_ALLOW = [
  ['services.html', 'Illustrative', '/services is outside the 24 Oct 2026 "illustrative" removal by owner instruction (it must not be touched)'],
  ['blog/ai-vs-human-answering-service-pest-control.html', 'in advance', 'article prose — "decide in advance which calls go where" — about call routing, not a billing term'],
  ['blog/pest-control-receptionist-vs-answering-service.html', 'in advance', 'comparison table — "books under rules you set in advance" — about booking rules, not a billing term'],
];
test('banned strings are absent from visible text, schema, meta and llms.txt', () => {
  const hits = []; const used = new Set();
  const scan = (file, where, text) => {
    for (const [re, why] of BANNED) {
      for (const m of text.matchAll(re)) {
        const allow = BANNED_ALLOW.findIndex(([f, t]) => f === file && t.toLowerCase() === m[0].toLowerCase());
        if (allow !== -1) { used.add(allow); continue; }
        hits.push(`${file} [${where}] "${m[0]}" — ${why}: "…${text.slice(Math.max(0, m.index - 50), m.index + 60)}…"`);
      }
    }
  };
  for (const [file, html] of pages) { scan(file, 'visible', visibleText(html)); scan(file, 'schema/meta', machineText(html)); }
  scan('llms.txt', 'llms.txt', squash(read('llms.txt')));
  const stale = BANNED_ALLOW.filter((_, i) => !used.has(i)).map(([f, t]) => `${f}: "${t}"`);
  assert.deepEqual(hits, [], `banned strings:\n  ${hits.join('\n  ')}`);
  assert.deepEqual(stale, [], `allow-list entries that no longer match anything — remove them:\n  ${stale.join('\n  ')}`);
});
