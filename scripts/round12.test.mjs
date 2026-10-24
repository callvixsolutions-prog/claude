/**
 * Round 12 regression checks.
 *
 * 1. The duplicate-block guard. Round 11 shipped the missed-calls article with a
 *    paragraph on the page five times and a heading four times. An edit script
 *    captured 2.4 KB of markup where it meant to capture one icon, and inserted
 *    it once per new list item. Thirty-one tests passed, because none of them
 *    asked whether a page says the same thing twice. This one does.
 *
 * 2. Claim-lint strings retired in round 12.
 *
 * The campaign page and preview/ are outside both. Run with `npm test`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const EXCLUDED_DIRS = new Set(['pest-control-call-demo', 'pest-control-call-demo-v1', 'docs', 'preview', '.git', 'node_modules', 'scripts', 'assets', 'css', 'js', '.github', '.claude']);
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
/* Every sitemap page plus /thank-you and 404: all 27 main-site files. */
const pages = htmlFiles().map((f) => [f, read(f)]);

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘',
  rdquo: '”', ldquo: '“', hellip: '…', times: '×', middot: '·', rarr: '→', larr: '←', copy: '©' };
function decode(s) {
  return s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => (n in ENTITIES ? ENTITIES[n] : m));
}
const squash = (s) => s.replace(/\s+/g, ' ').trim();
const textOf = (html) => squash(decode(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<svg[\s\S]*?<\/svg>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ')));

/* ============================================================ duplicate blocks */
const BLOCK_TAGS = ['p', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'td', 'th', 'dd', 'dt', 'figcaption'];
const MIN_LENGTH = 40;

/**
 * Every block element inside <main>, with its position, so a block and a child
 * that carries the same words (an <li> wrapping one <p>) can be told apart from
 * two separate blocks saying the same thing.
 *
 * The closing tag is found by walking forward and counting nested openings of
 * the same tag. A lazy regex would stop at the first closing tag it met, which
 * for a nested list is the inner item's — and a lazy regex stopping in the
 * wrong place is how this file came to exist.
 */
export function blocksIn(html) {
  const a = html.indexOf('<main'); const b = html.indexOf('</main>');
  if (a === -1 || b === -1) return [];
  /* An "On this page" list repeats the H2s it links to by design; it is navigation, not copy. */
  const main = html.slice(a, b).replace(/<nav\b[^>]*class="toc"[^>]*>[\s\S]*?<\/nav>/g, '');
  const out = [];
  for (const tag of BLOCK_TAGS) {
    const open = new RegExp(`<${tag}(?=[\\s>])[^>]*>`, 'g');
    const either = new RegExp(`<(/?)${tag}(?=[\\s>])[^>]*>`, 'g');
    for (const m of main.matchAll(open)) {
      either.lastIndex = m.index + m[0].length;
      let depth = 1; let end = -1; let t;
      while ((t = either.exec(main))) { depth += t[1] ? -1 : 1; if (depth === 0) { end = t.index; break; } }
      if (end === -1) continue;                         /* unclosed: nothing to compare */
      const text = textOf(main.slice(m.index + m[0].length, end));
      if (text.length >= MIN_LENGTH) out.push({ tag, start: m.index, end, text });
    }
  }
  return out;
}

/** Texts that occur in more than one block, ignoring a block nested inside another with the same text. */
export function duplicatesIn(html) {
  const groups = new Map();
  for (const blk of blocksIn(html)) { if (!groups.has(blk.text)) groups.set(blk.text, []); groups.get(blk.text).push(blk); }
  const dups = [];
  for (const [text, list] of groups) {
    const separate = list.filter((x) => !list.some((y) => y !== x && y.start <= x.start && y.end >= x.end && (y.start < x.start || y.end > x.end)));
    if (separate.length > 1) dups.push({ text, count: separate.length });
  }
  return dups.sort((x, y) => y.count - x.count);
}

/* Deliberate repeats. Keyed by page and by the start of the text; one line of reason each. */
const DUPLICATE_ALLOW = [
  ['blog/pest-control-call-script-intake-form.html', 'Before you start: safety overrides everything.', 'the safety notice is shown before step 1 and again at the top of the printable form, which is printed on its own'],
  ['blog/best-pest-control-answering-services.html', 'Mon–Fri 9am–6pm your local time; evening and weekend add-ons', 'owner brief 24 Oct 2026: Callvix is the first row of both the human and the AI comparison tables, so its hours cell repeats'],
  ['blog/best-pest-control-answering-services.html', 'FieldRoutes, PestPac, GorillaDesk, Briostack', 'comparison table cells: several services name the same four pest CRMs, so the cell text repeats by design'],
  ['index.html', 'Sample call. Names and details are made up.', 'owner-approved 22 Oct 2026: the same label captions both sample-call figures (the call walkthrough and the handoff details)'],
];

test('the duplicate detector sees a planted duplicate, a nested copy and a short repeat correctly', () => {
  /* "Prove it can fail" does not catch a detector that quietly finds nothing. */
  const para = 'The same forty-character-plus sentence, said again on the same page.';
  const planted = `<main><h2>One</h2><p>${para}</p><ul><li>${para}</li></ul><p>Yes.</p><p>Yes.</p></main>`;
  assert.deepEqual(duplicatesIn(planted).map((d) => [d.text, d.count]), [[para, 2]], 'a paragraph repeated in a list item must be reported, and "Yes." (under 40 characters) must not');
  const nested = `<main><ul><li><p>${para}</p></li></ul></main>`;
  assert.deepEqual(duplicatesIn(nested), [], 'an <li> wrapping one <p> is one block, not a duplicate');
  const nestedLists = `<main><ul><li>${para} outer<ul><li>${para} inner</li></ul></li><li>${para} inner</li></ul></main>`;
  assert.equal(duplicatesIn(nestedLists).length, 1, 'nested lists must be walked by depth, not cut at the first closing tag');
  const toc = `<main><nav class="toc" aria-label="On this page"><ol><li><a href="#a">${para}</a></li></ol></nav><h2 id="a">${para}</h2></main>`;
  assert.deepEqual(duplicatesIn(toc), [], 'an on-page jump list repeating its headings is not a duplicate');
  assert.equal(duplicatesIn(`<main><nav class="toc"></nav><h2>${para}</h2><p>${para}</p></main>`).length, 1, 'copy outside the jump list is still checked');
});

test('no page says the same thing twice', () => {
  const problems = []; const used = new Set(); let blocks = 0;
  for (const [file, html] of pages) {
    blocks += blocksIn(html).length;
    for (const d of duplicatesIn(html)) {
      const allow = DUPLICATE_ALLOW.findIndex(([f, t]) => f === file && d.text.startsWith(t));
      if (allow !== -1) { used.add(allow); continue; }
      problems.push(`${file}: ${d.count}x "${d.text.slice(0, 90)}${d.text.length > 90 ? '…' : ''}"`);
    }
  }
  console.log(`    blocks compared: ${blocks} across ${pages.length} pages`);
  assert.ok(blocks > 800, `only ${blocks} blocks found — the extractor has stopped seeing the pages`);
  const stale = DUPLICATE_ALLOW.filter((_, i) => !used.has(i)).map(([f, t]) => `${f}: "${t}"`);
  assert.deepEqual(problems, [], `repeated blocks of ${MIN_LENGTH}+ characters inside <main>:\n  ${problems.join('\n  ')}\n`
    + 'If a repeat is deliberate, add it to DUPLICATE_ALLOW with the reason.');
  assert.deepEqual(stale, [], `allow-list entries that no longer match anything — remove them:\n  ${stale.join('\n  ')}`);
});

/* ================================================================== claim lint */
/* Strings round 12 retired. Matched case-insensitively in everything a visitor or a
   crawler reads: body text, title, meta content and every <script> (JSON-LD included). */
const RETIRED = [
  'three numbers', 'already booked someone else', 'more than most trades', 'whole relationship', 'closed for the night', 'recovering even half',
  'days, not weeks', 'pays for the service', 'whatever you run', 'right the first time', 'worse than a call that went to voicemail', 'non-member price',
  'office gets every week', 'shows up in your revenue',
  'will follow up with you today', 'books faster', 'single sheet', 'one-page after-hours plan',
];
/* Round 13. These four are also checked on the campaign page (/pest-control-call-demo/),
   which every other rule in this file leaves alone: the owner removed the parent-company
   line from every public page, that one included. */
const RETIRED_EVERYWHERE = ['zenova', 'registration is finalized', 'often a lost customer', 'win back on a callback'];
/* Round 14. Capability and loss claims that outran what Callvix can show: "anything a
   caller throws at them", "we adapt to your workflow", unsourced call lengths and
   "lost revenue" framing. Checked on every main-site page and in llms.txt. Written in
   lower case with straight apostrophes; the page text is folded the same way. */
const RETIRED_R14 = ['anything a caller throws', 'we adapt to your workflow', 'whichever system your office runs', 'is often a job that goes to a competitor',
  'cost you thousands', '4–6 minute', 'pest calls tend to run long', 'long pest calls', 'every call is answered by a trained', "how many jobs you're losing", 'estimating lost revenue'];
const fold = (t) => t.toLowerCase().replace(/[‘’]/g, "'");
/* "$2.99 per call" loses the word that says which calls. "$2.99 per inbound call" and the
   "/call" unit in a price table are the two allowed forms. */
const PER_CALL = /\$2\.99 per call/gi;

/* PENDING — strings still live until the round-12 commit that rewrites them. Each entry
   names that commit and must be deleted in it: a stale entry fails this test. */
const RETIRED_PENDING = [
];

function readable(html) {
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join(' \n ');
  const meta = [...html.matchAll(/<meta\s+(?:name|property)="[^"]*"\s+content="([^"]*)"/g)].map((m) => m[1]).join(' \n ');
  const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [, ''])[1];
  const body = html.slice(html.indexOf('<body')).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ').replace(/<\/?(?:a|strong|em|b|i|span|sup|sub|small|code|time)\b[^>]*>/gi, '').replace(/<[^>]+>/g, ' ');
  return squash(decode([title, meta, body, scripts].join(' \n ')));
}

test('strings retired in round 12 have not come back', () => {
  const hits = []; const used = new Set();
  for (const [file, html] of pages) {
    const text = readable(html); const lower = fold(text);
    const found = [...RETIRED, ...RETIRED_EVERYWHERE, ...RETIRED_R14].filter((s) => lower.includes(s));
    if (PER_CALL.test(text)) found.push('$2.99 per call'); PER_CALL.lastIndex = 0;
    for (const s of found) {
      const pend = RETIRED_PENDING.findIndex(([f, t]) => f === file && t === s);
      if (pend !== -1) { used.add(pend); continue; }
      const i = lower.indexOf(s.toLowerCase());
      hits.push(`${file}: "${s}" — "…${text.slice(Math.max(0, i - 45), i + s.length + 45)}…"`);
    }
  }
  {
    const file = 'pest-control-call-demo/index.html'; const text = readable(read(file)); const lower = text.toLowerCase();
    for (const s of RETIRED_EVERYWHERE.filter((x) => lower.includes(x))) { const i = lower.indexOf(s); hits.push(`${file}: "${s}" — "…${text.slice(Math.max(0, i - 45), i + s.length + 45)}…"`); }
    const llms = fold(read('llms.txt'));
    for (const s of [...RETIRED_EVERYWHERE, ...RETIRED_R14].filter((x) => llms.includes(x))) hits.push(`llms.txt: "${s}"`);
  }
  const stale = RETIRED_PENDING.filter((_, i) => !used.has(i)).map(([f, t, c]) => `${f}: "${t}" (${c})`);
  assert.deepEqual(hits, [], `retired strings:\n  ${hits.join('\n  ')}`);
  assert.deepEqual(stale, [], `PENDING entries whose string is gone — delete them:\n  ${stale.join('\n  ')}`);
});

/* 22 Oct 2026, owner-approved: example call content on the homepage and the integration pages is labelled
   "Sample call" ("Names and details are made up"), never "illustrative", and out-of-area calls are not
   described as "never booked" (the client's rules can allow it). */
test('homepage and integration pages: sample-call labels, no "illustrative" or "never booked"', () => {
  const pages = ['index.html', 'integrations/index.html', ...['fieldroutes', 'pestpac', 'servicetitan', 'gorilladesk', 'briostack', 'housecall-pro'].map((n) => `integrations/${n}.html`)];
  const hits = [];
  for (const rel of pages) {
    const html = readFileSync(join(ROOT, rel), 'utf8');
    for (const old of [/llustrative/, /not a recording/, /customer record/, /never booked/]) if (old.test(html)) hits.push(`${rel}: ${old}`);
    if (rel.startsWith('integrations/') && rel !== 'integrations/index.html') {
      assert.ok(html.includes('Sample call record</') && html.includes('Sample call record. Names and details are made up. Entry in ') && html.includes('Sample scenarios &mdash; your own booking'), rel);
    }
  }
  assert.deepEqual(hits, []);
  const home = readFileSync(join(ROOT, 'index.html'), 'utf8');
  assert.equal(home.split('Sample call. Names and details are made up.').length - 1, 2);
  assert.ok(home.includes('Logged and sent to you unless your rules allow us to book it') && home.includes('Sample call. Callvix Solutions answers and books; your own technicians do the work.') && home.includes('The same steps on one sample call.'));
  assert.ok(readFileSync(join(ROOT, 'integrations/index.html'), 'utf8').includes('Sample call. Names and details are made up. Entering the booking in your software requires the CRM Management add-on.'));
});
