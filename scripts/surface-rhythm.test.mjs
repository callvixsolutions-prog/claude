/**
 * Surface rhythm guard.
 *
 * The original rule was "no two adjacent sections share a surface". That was a
 * band-aid: it produced a stripe pattern across nine structurally identical
 * containers, which reads as metronomic rather than rhythmic.
 *
 * The real question is whether two adjacent sections are visually
 * distinguishable. Two sections with clearly different internal formats are
 * distinguishable even on the same surface, so the guard now fails only when
 * both the surface AND the format signature match.
 *
 * The signature is inferred from what a section actually contains, never from
 * a hand-applied class. A `data-format="prose"` attribute would drift from
 * reality the first time someone added a card to the section.
 *
 * Exemptions:
 *
 * 1. The page opening. A hero or page-hero followed by the first body section
 *    sharing a surface is the top of the page, not body rhythm.
 *
 * 2. An explicit `section--continues` opt-out, which must carry an inline
 *    comment giving the reason. The count is printed on every run and capped:
 *    exceptions may be paid down, never accumulated.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/* The ceiling. Raise it only by deliberate decision, never to make a run pass. */
const MAX_OPT_OUTS = 0;

const EXCLUDED = new Set(['pest-control-call-demo', 'docs', 'preview', '.git', 'node_modules', 'scripts', 'assets', 'css', 'js', '.github', '.claude']);
const OPENING = new Set(['hero', 'page-hero']);
/* Density and behaviour modifiers, not surfaces. */
const NOT_A_SURFACE = new Set(['section--tight', 'section--roomy', 'section--continues']);

/**
 * The surface vocabulary, derived from the stylesheet rather than hardcoded.
 *
 * This used to be `classes.find(c => c.startsWith('section--'))`. That is a
 * hardcoded prefix, and it was wrong the first time markup used anything else:
 * run against three homepage directions whose sections were `.d-sec--tint`,
 * `.w-sec--alt` and `.c-sec--light`, it reported every section as `base` and
 * then failed all three for "adjacent sections sharing a surface" — on pages
 * that measurably had two and three distinct grounds. It suppressed good pages
 * because the instrument could not see.
 *
 * So the vocabulary comes from the stylesheet: any lone class selector that
 * paints a background is a candidate surface. Add a surface to style.css and
 * the guard learns it; rename one and the guard follows. Nothing to maintain
 * here.
 *
 * Classes that paint a background but are not section surfaces — .card, .btn —
 * end up in the set harmlessly, because a section is only ever matched against
 * its own class list.
 *
 * KNOWN LIMIT: only css/style.css is parsed. A surface declared in a page's own
 * <style> block is still invisible, so a page that paints sections locally will
 * report them all as 'base'. That is acceptable while every surface on the site
 * is a shared one, and it is the reason the preview directions still read as
 * single-surface. If a page ever needs a local surface, parse its block too
 * rather than adding the class name here.
 */
function surfaceVocabulary() {
  const css = readFileSync(join(ROOT, 'css/style.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');            /* comments carry example code */
  const out = new Set();
  /* Split on the closing brace rather than matching whole rules. A global regex
     over "selector { ... }" consumes each closing brace, so it is unavailable as
     the delimiter for the next rule and every second rule goes unseen — which is
     how .section--navy was missing from the vocabulary the first time this ran. */
  for (const chunk of css.split('}')) {
    const i = chunk.indexOf('{');
    if (i === -1) continue;
    const selector = chunk.slice(0, i);
    const body = chunk.slice(i + 1);
    if (!/(^|;|\s)background(-color|-image)?\s*:/.test(body)) continue;
    for (const sel of selector.split(',')) {
      const t = sel.trim();
      if (!/^\.[A-Za-z0-9_-]+$/.test(t)) continue;   /* lone class only */
      const name = t.slice(1);
      if (!NOT_A_SURFACE.has(name)) out.add(name);
    }
  }
  return out;
}

const SURFACES = surfaceVocabulary();

/**
 * Which surfaces are LIGHT.
 *
 * Round 11 retired sand. Light sections now alternate cream (the canvas, so a
 * section with no surface class) and white (.section--alt), and those two are
 * about 2 dL* apart — not a boundary a reader can see. Treating them as two
 * surfaces would let the guard pass a page of nine identical sections purely
 * because their classes alternate, which is the stripe pattern the guard was
 * rewritten to stop rewarding. So every light surface resolves to one name,
 * 'light', and adjacent light sections have to differ in FORMAT.
 *
 * Read from the stylesheet like the vocabulary itself: a surface is light when
 * its rule paints var(--white) or var(--cream). Nothing to maintain here if a
 * third light token is ever added to that list on purpose.
 */
const LIGHT_TOKENS = ['var(--white)', 'var(--cream)'];
function lightSurfaces() {
  const css = readFileSync(join(ROOT, 'css/style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const out = new Set();
  for (const chunk of css.split('}')) {
    const i = chunk.indexOf('{');
    if (i === -1) continue;
    const m = chunk.slice(i + 1).match(/(?:^|;|\s)background(?:-color)?\s*:\s*([^;]+)/);
    if (!m || !LIGHT_TOKENS.includes(m[1].trim())) continue;
    for (const sel of chunk.slice(0, i).split(',')) {
      const t = sel.trim();
      if (/^\.[A-Za-z0-9_-]+$/.test(t)) out.add(t.slice(1));
    }
  }
  return out;
}
const LIGHT = lightSurfaces();
/** The name a reader would give the ground: 'light', or the class that paints something else. */
function surfaceName(classes) {
  const own = classes.find((c) => SURFACES.has(c) && !NOT_A_SURFACE.has(c));
  if (!own || LIGHT.has(own)) return 'light';
  return own;
}

/**
 * Format signature, inferred from the section's own markup.
 *
 * This used to be a hand-maintained vocabulary of class names, and it drifted
 * away from the markup in whichever direction nobody was watching: over-matching
 * gave us `card` catching `call-card` and `stat` catching `stat-band`;
 * under-matching gave us `step` missing `svc-setup` and `faq-list` missing
 * `svc-faq`, which printed three prose sections on /services where two were a
 * numbered process and an accordion. Adding strings made the table right that day
 * and wrong again the next time a section got a new class.
 *
 * So structure decides. Class names are kept, but only as hints for the formats
 * that have no structural signal of their own — a checklist and a pull quote are
 * styling decisions, not shapes.
 *
 * Order matters only for readability of the printed sequence; parts are sorted.
 */

/* The .container max-width. The media rule asks whether an image is a major
   element of its section rather than an inline ornament, and 40% of the content
   column is the threshold. Kept here so it moves if the container does. */
const CONTAINER_WIDTH = 1180;
const MEDIA_WIDTH_THRESHOLD = Math.round(CONTAINER_WIDTH * 0.4); /* 472px */

/** Text content of leaf elements, in document order. */
function leafTexts(html) {
  return [...html.matchAll(/>([^<>]+)</g)].map((m) => m[1].trim()).filter(Boolean);
}

/**
 * A numbered process. Either a real ordered list, or three or more elements
 * whose entire text is a small integer, running consecutively from 1.
 *
 * The "consecutive from 1" part is load-bearing: the pricing table is full of
 * bare figures, and without it a price list reads as a sequence of steps.
 */
function isSteps(html) {
  if (/<ol\b/.test(html)) return true;
  const ints = leafTexts(html)
    .filter((t) => /^\d{1,2}$/.test(t))
    .map(Number);
  if (ints.length < 3) return false;
  for (let i = 0; i < 3; i++) if (ints[i] !== i + 1) return false;
  return true;
}

/**
 * An accordion. This site has TWO implementations and both clauses are needed:
 * .svc-faq uses native <details>/<summary>, while .faq-list uses
 * button.faq-q[aria-expanded] driven by js/main.js. Either clause alone misses
 * half the accordions on the site — do not "simplify" this to one.
 */
function isAccordion(html) {
  return /<details\b/.test(html) || /\baria-expanded=/.test(html);
}

/**
 * A card grid: three or more sibling elements with the same tag and class, each
 * carrying a heading. The heading is the discriminator — .checklist .ck is three
 * or more parallel siblings too, but a card is a unit with a title and a list
 * item is a line.
 *
 * Approximated without a DOM: a repeated tag.class run of three or more, and at
 * least that many headings in the section.
 */
function isCards(html) {
  const runs = new Map();
  for (const m of html.matchAll(/<([a-z][a-z0-9]*)(?=[\s>])[^>]*\sclass="([^"]+)"/gi)) {
    const key = `${m[1]}.${m[2]}`;
    runs.set(key, (runs.get(key) || 0) + 1);
  }
  const headings = (html.match(/<h[2-6]\b/g) || []).length;
  for (const n of runs.values()) if (n >= 3 && headings >= n) return true;
  return false;
}

/**
 * The built artifacts. These carry no <img> and no <figure>, so neither the
 * media rule nor any structural signal reaches them: a call record is a stack
 * of divs, and a configure panel is a list with ticks. They are named here
 * because there is nothing else to read, which is the same honest exception
 * the list/quote/cta hints already are.
 */
function isArtifact(html) {
  /* .coverage is deliberately absent. It is a <figure>, so isMedia already
     claims it, and listing it here reported the pricing section as
     "artifact+media" where a reader sees one thing. The printed sequence exists
     for a human scanning for flatness, so it must not inflate a section's
     format count. */
  return /class="[^"]*\b(?:rec|jobnote|config)\b/.test(html);
}

/**
 * Media. A <figure>, or an image declared wide enough to be a major element of
 * the section. Every <img> on this site carries explicit width/height, so this
 * reads from markup — measuring true layout share would mean putting a headless
 * browser in the suite to classify nine sections, which is out of proportion.
 */
function isMedia(html) {
  /* A .crmflow figure is the call-flow rail. It is a <figure> for its aria-label,
     not because it is a picture; it has its own format, 'flow', below. */
  if (/<figure\b(?![^>]*\bcrmflow\b)/.test(html)) return true;
  for (const m of html.matchAll(/<img\b[^>]*\bwidth="(\d+)"/gi)) {
    if (Number(m[1]) >= MEDIA_WIDTH_THRESHOLD) return true;
  }
  /* Hint only: components that are structurally media but carry no <img> of
     their own — the transcript card and the hero visual are built from divs. */
  return /class="[^"]*\b(?:photo-split|hero-visual|call-card)\b/.test(html);
}

const FORMATS = [
  ['table', (h) => /<table\b/.test(h)],
  ['steps', isSteps],
  /* The call-flow rail: nodes joined by arrows. Not 'steps' — on the six Works
     With pages the rail is followed directly by a numbered list, and calling
     both 'steps' reported two sections as the same format when one is a
     horizontal diagram and the other a vertical numbered procedure. */
  ['flow', (h) => /class="[^"]*\bcrmflow\b/.test(h)],
  ['accordion', isAccordion],
  ['cards', isCards],
  ['media', isMedia],
  ['artifact', isArtifact],
  /* Hints: styling choices with no structural signal to read. */
  ['list', (h) => /class="[^"]*\b(?:read-list|checklist|syslist)\b/.test(h)],
  ['quote', (h) => /class="[^"]*\bquote-card\b/.test(h)],
  ['cta', (h) => /class="[^"]*\b(?:cta-band|cta-close)\b/.test(h)],
];

/* Precedence. A numbered step is also "a repeated unit with a heading", so a
   steps section satisfies the card test as well. Steps is the more specific
   answer, and reporting both would say a section is two formats when a reader
   sees one. */
const SUPPRESSED_BY = { steps: ['cards'] };

function signatureOf(html) {
  let parts = FORMATS.filter(([, fn]) => fn(html)).map(([name]) => name);
  for (const [winner, losers] of Object.entries(SUPPRESSED_BY)) {
    if (parts.includes(winner)) parts = parts.filter((p) => !losers.includes(p));
  }
  return parts.length ? parts.sort().join('+') : 'prose';
}

function htmlFiles(dir = ROOT, out = []) {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (EXCLUDED.has(relative(ROOT, abs).split('/')[0])) continue;
    if (statSync(abs).isDirectory()) htmlFiles(abs, out);
    else if (entry.endsWith('.html')) out.push(relative(ROOT, abs));
  }
  return out;
}

function sectionsOf(html) {
  const main = html.match(/<main\b[\s\S]*?<\/main>/);
  if (!main) return [];
  const body = main[0];
  const opens = [...body.matchAll(/<section class="([^"]+)"[^>]*>/g)];
  return opens.map((m, i) => {
    const classes = m[1].split(/\s+/);
    const slice = body.slice(m.index, i + 1 < opens.length ? opens[i + 1].index : body.length);
    const after = slice.slice(m[0].length, m[0].length + 300);
    const comment = after.match(/^\s*<!--([\s\S]*?)-->/);
    return {
      html: slice,
      surface: surfaceName(classes),
      signature: signatureOf(slice),
      isOpening: classes.some((c) => OPENING.has(c)),
      optOut: classes.includes('section--continues'),
      reason: comment ? comment[1].trim() : '',
    };
  });
}

const pages = htmlFiles().map((f) => [f, sectionsOf(readFileSync(join(ROOT, f), 'utf8'))]);

/**
 * The surface parser, cross-checked against an independently written one.
 *
 * "Prove it can fail" does not catch an enumerator that silently finds too few:
 * an undercount is not a failure, it is a quieter pass. The first version of
 * surfaceVocabulary() found 29 of 41 lone-class background rules and omitted
 * .section--navy — the homepage's one real pause — and every test still passed.
 *
 * A hardcoded 41 would be wrong the next time someone adds a background. So the
 * check is that two differently-built parsers agree: the production one splits
 * on the closing brace, this one matches whole rules using a lookbehind so the
 * delimiter is never consumed. The brace-consuming bug breaks exactly one of
 * those two, which is the point.
 */
function surfaceVocabularyIndependent() {
  const css = readFileSync(join(ROOT, 'css/style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const out = new Set();
  for (const m of css.matchAll(/(?<=^|[};])\s*([^{}]+?)\s*\{([^{}]*)\}/g)) {
    if (!/(^|;|\s)background(-color|-image)?\s*:/.test(m[2])) continue;
    for (const sel of m[1].split(',')) {
      const t = sel.trim();
      if (!/^\.[A-Za-z0-9_-]+$/.test(t)) continue;
      const name = t.slice(1);
      if (!NOT_A_SURFACE.has(name)) out.add(name);
    }
  }
  return out;
}

test('the surface parser agrees with an independently written one', () => {
  const b = surfaceVocabularyIndependent();
  const onlyA = [...SURFACES].filter((x) => !b.has(x));
  const onlyB = [...b].filter((x) => !SURFACES.has(x));
  console.log(`    surface vocabulary: ${SURFACES.size} classes, cross-check ${b.size}`);
  assert.deepEqual({ onlyA, onlyB }, { onlyA: [], onlyB: [] },
    'the two surface parsers disagree, so at least one is missing rules:\n'
    + `  only the production parser: ${onlyA.join(', ') || '(none)'}\n`
    + `  only the cross-check:       ${onlyB.join(', ') || '(none)'}\n`
    + 'An undercount here is silent — it does not fail anything, it just makes the '
    + 'guard blind to a surface. That is how .section--navy went missing.');
  /* The homepage's three grounds must always be in the vocabulary; if the page
     ever stops using one, this is the right place to notice. */
  for (const required of ['section--alt', 'section--navy']) {
    assert.ok(SURFACES.has(required), `${required} is missing from the derived vocabulary`);
  }
});

test('no two adjacent sections share both surface and format', () => {
  const collisions = [];
  for (const [file, secs] of pages) {
    for (let i = 0; i < secs.length - 1; i++) {
      if (secs[i].isOpening) continue;
      if (secs[i].surface !== secs[i + 1].surface) continue;
      if (secs[i].signature !== secs[i + 1].signature) continue;
      if (secs[i + 1].optOut) continue;
      collisions.push(`${file}: sections ${i} and ${i + 1} are both ${secs[i].surface}/${secs[i].signature}`);
    }
  }
  assert.deepEqual(collisions, [],
    `adjacent sections are visually indistinguishable:\n  ${collisions.join('\n  ')}\n` +
    'Change one section\'s format or surface, or mark the second section--continues with a reason.');
});

/**
 * The guard on the guard.
 *
 * Every signature above is matched by class name, and a hand-maintained
 * vocabulary drifts away from the markup in whichever direction nobody is
 * watching. This does not need to know the right answer — only that `prose` is
 * a suspicious answer for a section containing an ordered list, a disclosure
 * widget, or a repeated run of sibling components.
 *
 * It warns rather than fails on purpose. It is a second opinion, and a second
 * opinion that can block a commit would just get its patterns edited until it
 * stopped talking.
 */
function suspicionsOf(html) {
  const why = [];
  if (/<ol\b/.test(html)) why.push('<ol>');
  if (/<details\b/.test(html)) why.push('<details>');
  /* Parallel siblings, approximated without a DOM: the same tag carrying the
     same class three or more times inside one section. Good enough for a hint.
     The lookahead skips elements that close immediately: <span class="sep"></span>
     is a decorative dot repeated in every byline, not a repeated component, and
     without this it was seven of the fourteen first warnings this check produced.
     The tag name is pinned with (?=[\s>]) so the engine cannot backtrack to a
     shorter tag just to make the backreference in the lookahead fail. */
  const runs = new Map();
  for (const m of html.matchAll(/<([a-z][a-z0-9]*)(?=[\s>])[^>]*\sclass="([^"]+)"[^>]*>(?!\s*<\/\1>)/gi)) {
    const key = `${m[1]}.${m[2]}`;
    runs.set(key, (runs.get(key) || 0) + 1);
  }
  for (const [key, n] of runs) if (n >= 3) { why.push(`${n}x ${key}`); break; }
  return why;
}

test('sections resolving to prose are not obviously something else', () => {
  const suspect = [];
  for (const [file, secs] of pages) {
    secs.forEach((s, i) => {
      if (s.signature !== 'prose') return;
      const why = suspicionsOf(s.html);
      if (why.length) suspect.push(`${file} section ${i}: prose, but contains ${why.join(', ')}`);
    });
  }
  if (suspect.length) {
    console.log(`    WARNING — ${suspect.length} section(s) may be misclassified:`);
    for (const line of suspect) console.log(`      ${line}`);
    console.log('      prose is suspicious here. Either the signature table is missing a');
    console.log('      pattern, or the section genuinely is prose and this is noise.');
  } else {
    console.log('    no misclassified-prose suspicions');
  }
  /* Warning only — see the comment above. */
  assert.ok(true);
});

test('format signatures are visible for review', () => {
  /* Printed every run. Nine identical signatures in a column is the fastest
     way for a human to see that the page has flattened again. */
  for (const [file, secs] of pages) {
    if (secs.length < 2) continue;
    console.log(`    ${file}`);
    secs.forEach((s, i) => {
      console.log(`      ${String(i).padEnd(2)} ${s.surface.padEnd(14)} ${s.signature}${s.isOpening ? '   (page opening, exempt)' : ''}`);
    });
  }
  assert.ok(pages.length > 0);
});

test('surface opt-outs stay at or below the ceiling', () => {
  const optOuts = [];
  for (const [file, secs] of pages) {
    secs.forEach((s, i) => { if (s.optOut) optOuts.push({ file, i, reason: s.reason }); });
  }
  console.log(`    surface opt-outs in use: ${optOuts.length} (ceiling ${MAX_OPT_OUTS})`);
  for (const o of optOuts) console.log(`      ${o.file} section ${o.i}: ${o.reason || '(NO REASON GIVEN)'}`);

  const unexplained = optOuts.filter((o) => !o.reason).map((o) => `${o.file} section ${o.i}`);
  assert.deepEqual(unexplained, [],
    `section--continues without an inline comment giving the reason:\n  ${unexplained.join('\n  ')}`);

  assert.ok(optOuts.length <= MAX_OPT_OUTS,
    `${optOuts.length} surface opt-outs, ceiling is ${MAX_OPT_OUTS}. ` +
    'Exceptions may be paid down, not accumulated: change a format instead, or raise the ceiling deliberately.');
});
