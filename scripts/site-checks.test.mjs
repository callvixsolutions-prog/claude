/**
 * Site consistency checks.
 *
 * These exist because the site has no build step and no template engine, so
 * nothing stops a page and the sitemap, or a title and its og:title, from
 * drifting apart silently. A test is the proportionate substitute: it fails
 * loudly without introducing a build.
 *
 * Run with `npm test`. Wire into a pre-commit hook by calling `npm test`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ORIGIN = 'https://callvixsolutions.com';

/* Directories that are deliberately outside the main site:
   - pest-control-call-demo is the paid-ads landing page, noindex and
     intentionally absent from the sitemap
   - docs holds measurement handoff files that are gitignored             */
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
const isNoindex = (html) => /<meta\s+name="robots"[^>]*content="[^"]*noindex/i.test(html);

/** The canonical URL a file is served at, per .htaccess: extensionless, and
 *  real directories keep their trailing slash. */
function urlFor(rel) {
  if (rel === 'index.html') return `${ORIGIN}/`;
  if (rel.endsWith('/index.html')) return `${ORIGIN}/${rel.slice(0, -'index.html'.length)}`;
  return `${ORIGIN}/${rel.slice(0, -'.html'.length)}`;
}

/** The file that should back a sitemap <loc>. */
function fileFor(url) {
  const path = url.replace(ORIGIN, '');
  if (path === '/') return 'index.html';
  if (path.endsWith('/')) return `${path.slice(1)}index.html`;
  return `${path.slice(1)}.html`;
}

const sitemap = read('sitemap.xml');
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

test('every indexable page has a sitemap entry', () => {
  const missing = htmlFiles()
    .filter((f) => f !== '404.html')
    .filter((f) => !isNoindex(read(f)))
    .filter((f) => !locs.includes(urlFor(f)))
    .map((f) => `${f} -> ${urlFor(f)}`);
  assert.deepEqual(missing, [], `indexable pages absent from sitemap.xml:\n  ${missing.join('\n  ')}`);
});

test('every sitemap entry has a file behind it', () => {
  const orphaned = locs
    .filter((url) => !existsSync(join(ROOT, fileFor(url))))
    .map((url) => `${url} -> ${fileFor(url)} (no such file)`);
  assert.deepEqual(orphaned, [], `sitemap entries with no file:\n  ${orphaned.join('\n  ')}`);
});

test('no sitemap entry points at a noindex page', () => {
  const contradictory = locs
    .filter((url) => existsSync(join(ROOT, fileFor(url))))
    .filter((url) => isNoindex(read(fileFor(url))))
    .map((url) => `${url} is noindex but listed`);
  assert.deepEqual(contradictory, []);
});

test('title and og:title do not drift apart', () => {
  // og:title normally drops the brand suffix, so compare the leading phrase
  // rather than the whole string.
  const lead = (s) => s.split('|')[0].trim().toLowerCase();
  const drifted = [];
  for (const f of htmlFiles()) {
    const html = read(f);
    const title = html.match(/<title>(.*?)<\/title>/s)?.[1]?.trim();
    const og = html.match(/<meta property="og:title" content="(.*?)"/s)?.[1]?.trim();
    if (!title || !og) continue;
    if (lead(title) !== lead(og)) drifted.push(`${f}\n     title: ${title}\n     og:    ${og}`);
  }
  assert.deepEqual(drifted, [], `title/og:title drift:\n  ${drifted.join('\n  ')}`);
});

test('every page has exactly one h1', () => {
  const bad = htmlFiles()
    .map((f) => [f, (read(f).match(/<h1\b/g) || []).length])
    .filter(([, n]) => n !== 1)
    .map(([f, n]) => `${f} has ${n}`);
  assert.deepEqual(bad, []);
});
