/**
 * GTM host gate (20 Oct 2026). The container (GA4 + Clarity) loads only when
 * location.hostname is exactly callvixsolutions.com, so localhost, 127.0.0.1 and the
 * Hostinger preview domain stop sending hits. Each page's own snippet is executed
 * against a stubbed window/document, so this fails if the gate is missing, misspelt
 * or blocks production.
 *
 * Every GTM page is gated. /services was gated on 26 Oct 2026; the old landing pages were
 * retired on 27 Oct 2026 and their replacement (/pest-control-answering-service/) is gated.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKIP = new Set(['preview', 'node_modules', '.git', 'docs', 'scripts']);
const UNGATED = new Set(); // none since 27 Oct 2026
const pages = [];
(function walk(dir) { for (const e of readdirSync(dir)) { const abs = join(dir, e); const rel = relative(ROOT, abs);
  if (SKIP.has(rel.split('/')[0])) continue; if (statSync(abs).isDirectory()) walk(abs); else if (e.endsWith('.html')) pages.push(rel); } }(ROOT));

const snippetOf = (html) => {
  const m = html.match(/<script>((?:(?!<\/script>)[\s\S])*?GTM-PJFS7HV5'\);)<\/script>/);
  return m ? m[1] : null;
};

/* Runs a snippet on the given host, firing every listener and timer at once; returns the scripts it injected. */
function run(code, hostname) {
  const injected = [];
  const first = { parentNode: { insertBefore: (el) => injected.push(el.src) } };
  const window = { addEventListener: (_e, fn) => fn() };
  const context = {
    window, location: { hostname },
    document: { readyState: 'complete', getElementsByTagName: () => [first], createElement: () => ({}) },
    setTimeout: (fn) => fn(),
  };
  context.window.location = context.location;
  vm.runInNewContext(code, context);
  return injected;
}

const gtmPages = pages.filter((p) => readFileSync(join(ROOT, p), 'utf8').includes('GTM-PJFS7HV5'));

test('every editable GTM page loads the container on callvixsolutions.com only', () => {
  const gated = gtmPages.filter((p) => !UNGATED.has(p));
  assert.ok(gated.length >= 27, `expected at least 27 gated pages, found ${gated.length}`);
  const wrong = [];
  for (const rel of gated) {
    const code = snippetOf(readFileSync(join(ROOT, rel), 'utf8'));
    if (!code) { wrong.push(rel + ': snippet not found'); continue; }
    /* Hostinger's preview proxy rewrites every literal copy of the domain in served HTML, which turned the gate into a pass on the preview host (20 Oct 2026). */
    if (code.includes('callvixsolutions.com')) wrong.push(rel + ': the domain appears literally in the snippet, so the preview proxy can rewrite it');
    if (run(code.split('callvixsolutions.com').join('beige-cassowary-782482.hostingersite.com'), 'beige-cassowary-782482.hostingersite.com').length) wrong.push(rel + ': loads on the preview host after its proxy rewrite');
    const prod = run(code, 'callvixsolutions.com');
    if (prod.length !== 1 || !prod[0].startsWith('https://www.googletagmanager.com/gtm.js?id=GTM-PJFS7HV5')) wrong.push(rel + ': production did not load gtm.js once');
    for (const host of ['localhost', '127.0.0.1', 'beige-cassowary-782482.hostingersite.com', 'www.callvixsolutions.com', 'callvixsolutions.com.evil.test']) {
      if (run(code, host).length) wrong.push(`${rel}: loaded gtm.js on ${host}`);
    }
  }
  assert.deepEqual(wrong, []);
});

test('no page is left ungated', () => {
  assert.equal(UNGATED.size, 0);
});
