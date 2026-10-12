/**
 * Surface rhythm guard.
 *
 * Two adjacent sections painting the same surface give the eye no cue that a
 * new idea has started. The page then reads as one undifferentiated column
 * however correct the padding is. This check fails when that happens.
 *
 * Two deliberate exemptions:
 *
 * 1. The page opening. A hero or page-hero followed by the first body section
 *    sharing a surface is normal: the opening is the top of the page, not part
 *    of the body rhythm. Without this exemption the check flags 49 pairs
 *    across 20 pages, almost all of them page openings, and measures the wrong
 *    thing.
 *
 * 2. An explicit `section--continues` opt-out, which must carry an inline
 *    comment giving the reason. The opt-out count is printed on every run and
 *    capped: exceptions may be paid down, never accumulated. A guard that
 *    silently tolerates a growing list of exceptions has stopped being a guard.
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
/* Density modifiers, not surfaces. */
const NOT_A_SURFACE = new Set(['section--tight', 'section--roomy', 'section--continues']);

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
  return [...main[0].matchAll(/<section class="([^"]+)"[^>]*>/g)].map((m) => {
    const classes = m[1].split(/\s+/);
    const surface = classes.find((c) => c.startsWith('section--') && !NOT_A_SURFACE.has(c)) || 'base';
    /* The reason must be an HTML comment immediately after the opening tag,
       so it sits where a reviewer reading the markup will see it. */
    const after = main[0].slice(m.index + m[0].length, m.index + m[0].length + 300);
    const comment = after.match(/^\s*<!--([\s\S]*?)-->/);
    return {
      surface,
      isOpening: classes.some((c) => OPENING.has(c)),
      optOut: classes.includes('section--continues'),
      reason: comment ? comment[1].trim() : '',
    };
  });
}

const pages = htmlFiles().map((f) => [f, sectionsOf(readFileSync(join(ROOT, f), 'utf8'))]);

test('no two adjacent body sections share a surface', () => {
  const collisions = [];
  for (const [file, secs] of pages) {
    for (let i = 0; i < secs.length - 1; i++) {
      if (secs[i].isOpening) continue;              // page opening, exempt
      if (secs[i].surface !== secs[i + 1].surface) continue;
      if (secs[i + 1].optOut) continue;             // declared exception
      collisions.push(`${file}: sections ${i} and ${i + 1} both "${secs[i].surface}"`);
    }
  }
  assert.deepEqual(collisions, [],
    `adjacent sections share a surface:\n  ${collisions.join('\n  ')}\n` +
    'Re-tag one of them, or mark the second section--continues with a comment saying why.');
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
    'Exceptions may be paid down, not accumulated: re-tag instead, or raise the ceiling deliberately.');
});
