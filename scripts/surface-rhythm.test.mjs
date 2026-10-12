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

const EXCLUDED = new Set(['pest-control-call-demo', 'docs', '.git', 'node_modules', 'scripts', 'assets', 'css', 'js', '.github', '.claude']);
const OPENING = new Set(['hero', 'page-hero']);
/* Density and behaviour modifiers, not surfaces. */
const NOT_A_SURFACE = new Set(['section--tight', 'section--roomy', 'section--continues']);

/**
 * Format signature, inferred from the section's own markup.
 *
 * STOPGAP. This is a hand-maintained vocabulary of class names, and markup drifts
 * away from it in whichever direction nobody is watching: over-matching gave us
 * `card` catching `call-card` and `stat` catching `stat-band`; under-matching gave
 * us `step` missing `svc-setup` and `faq-list` missing `svc-faq`, which printed
 * three prose sections on /services where two were a numbered process and an
 * accordion. Adding strings makes the table right today and wrong again next time.
 * The fix is to infer from structure — ordered lists, aria-expanded toggles,
 * parallel sibling counts, image share of layout width — with class names as hints
 * only. Scheduled for the next round. Order matters only
 * for readability of the printed sequence, so the parts are sorted.
 */
const FORMATS = [
  ['table', /<table\b/],
  ['steps', /class="[^"]*\b(?:step|svc-setup)\b/],
  ['cards', /class="[^"]*\b(?:card|blog-card|price-card|stat)\b/],
  ['list', /class="[^"]*\b(?:read-list|checklist|faq-list|svc-faq)\b/],
  ['quote', /class="[^"]*\bquote-card\b/],
  ['cta', /class="[^"]*\bcta-band\b/],
  ['media', /class="[^"]*\b(?:photo-split|hero-visual|call-card|avatar-stack)\b/],
];

function signatureOf(html) {
  const parts = FORMATS.filter(([, re]) => re.test(html)).map(([name]) => name);
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
      surface: classes.find((c) => c.startsWith('section--') && !NOT_A_SURFACE.has(c)) || 'base',
      signature: signatureOf(slice),
      isOpening: classes.some((c) => OPENING.has(c)),
      optOut: classes.includes('section--continues'),
      reason: comment ? comment[1].trim() : '',
    };
  });
}

const pages = htmlFiles().map((f) => [f, sectionsOf(readFileSync(join(ROOT, f), 'utf8'))]);

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
