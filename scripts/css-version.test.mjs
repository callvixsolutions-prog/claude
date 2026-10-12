/**
 * The stylesheet cache-busting guard.
 *
 * css/style.css used to be inlined into every page's <head>. That cost ~10KB
 * gzipped on every page view — 53% of the homepage transfer — because the
 * stylesheet was re-sent with each page instead of being cached once. It is now
 * a linked file.
 *
 * That swap introduces a hazard the inlined version did not have. Production
 * serves /css/style.css with `cache-control: public, max-age=31536000` — one
 * year — while the HTML carries max-age=3600. A plain <link rel="stylesheet">
 * would therefore freeze the stylesheet in every returning visitor's browser
 * for a year: you would edit style.css, deploy, see the change yourself after a
 * hard refresh, and ship nothing to anyone who had already visited.
 *
 * So the href carries a content hash, and this test asserts it is current. If
 * you edit css/style.css you must update the query string on every page, and
 * this fails loudly until you do. It replaces the old "remember to re-inline
 * into 27 pages" chore with the same mechanical work plus a check that catches
 * you forgetting.
 *
 * Run with `npm test`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/* The paid-ads landing page keeps its own divergent copy of the stylesheet and
   is out of scope for every main-site rule. docs/ is gitignored handoff files. */
const EXCLUDED_DIRS = new Set(['pest-control-call-demo', 'docs', '.git', 'node_modules', 'scripts', 'assets', 'css', 'js', '.github', '.claude']);

function htmlFiles(dir = ROOT, out = []) {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    const rel = relative(ROOT, abs);
    if (EXCLUDED_DIRS.has(rel.split('/')[0])) continue;
    if (statSync(abs).isDirectory()) htmlFiles(abs, out);
    else if (entry.endsWith('.html')) out.push(rel);
  }
  return out;
}

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/** How the version in the href is derived. Change this and every page changes. */
export function cssVersion() {
  return createHash('sha256').update(readFileSync(join(ROOT, 'css/style.css'))).digest('hex').slice(0, 10);
}

const pages = htmlFiles().map((f) => [f, read(f)]);

test('every page links the stylesheet at its current content hash', () => {
  const want = cssVersion();
  const wrong = [];
  for (const [file, html] of pages) {
    const m = html.match(/<link\b[^>]*\bhref="\/css\/style\.css(?:\?v=([0-9a-f]+))?"/);
    if (!m) { wrong.push(`${file}: no stylesheet link`); continue; }
    if (m[1] !== want) wrong.push(`${file}: ?v=${m[1] ?? '(none)'}`);
  }
  assert.deepEqual(wrong, [],
    `stylesheet version is stale on these pages (css/style.css is now ${want}):\n  ${wrong.join('\n  ')}\n`
    + 'Production caches /css/style.css for a year. Until the query string matches the file, '
    + 'returning visitors keep the old stylesheet and your change reaches nobody.');
});

test('no page still inlines the stylesheet', () => {
  /* The inlined <style> block was ~45KB of the source of every page. A second,
     page-specific <style> block is fine and several pages have one — this only
     fails if a whole copy of the design system has come back. */
  const offenders = [];
  for (const [file, html] of pages) {
    for (const m of html.matchAll(/<style>([\s\S]*?)<\/style>/g)) {
      if (m[1].includes('--navy-900') && m[1].length > 10000) offenders.push(`${file}: ${m[1].length} chars`);
    }
  }
  assert.deepEqual(offenders, [],
    `the full stylesheet is inlined again:\n  ${offenders.join('\n  ')}\n`
    + 'It was externalised deliberately: inlining re-sent ~10KB gzipped on every page view.');
});
