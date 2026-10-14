/**
 * GTM loading. Main-site pages fetch gtm.js on the first interaction or 1.5 s after
 * load, so ~300 KB of tags stays out of the critical path (PSI mobile LCP 6.4 s with
 * the standard snippet). The paid campaign page and /thank-you keep the standard
 * snippet: their conversion measurement must not wait for an idle timer.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKIP = new Set(['preview', 'node_modules', '.git', 'docs', 'scripts']);
const STANDARD = new Set(['pest-control-call-demo/index.html', 'thank-you.html']);
const pages = [];
(function walk(dir) { for (const e of readdirSync(dir)) { const abs = join(dir, e); const rel = relative(ROOT, abs);
  if (SKIP.has(rel.split('/')[0])) continue; if (statSync(abs).isDirectory()) walk(abs); else if (e.endsWith('.html')) pages.push(rel); } }(ROOT));

export const deferred = (html) => /function load\(\)\{if\(done\)return;done=true;/.test(html) && /addEventListener\('load',function\(\)\{setTimeout\(load,1500\);\}\)/.test(html) && /\['pointerdown','keydown','touchstart','scroll'\]/.test(html);
export const standard = (html) => /j\.async=true;j\.src=\s*'https:\/\/www\.googletagmanager\.com\/gtm\.js\?id='\+i\+dl;f\.parentNode\.insertBefore\(j,f\);\s*\}\)\(window/.test(html);

test('the detector tells the two snippets apart', () => {
  const std = "j.async=true;j.src=\n'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);\n})(window,document,'script','dataLayer','GTM-X');";
  assert.equal(standard(std), true); assert.equal(deferred(std), false);
  assert.equal(deferred(readFileSync(join(ROOT, 'index.html'), 'utf8')), true);
});

test('main-site pages defer GTM; the campaign page and /thank-you keep the standard snippet', () => {
  const wrong = [];
  for (const rel of pages) {
    const html = readFileSync(join(ROOT, rel), 'utf8'); if (!html.includes('GTM-PJFS7HV5')) continue;
    if (STANDARD.has(rel)) { if (!standard(html) || deferred(html)) wrong.push(rel + ' should keep the standard snippet'); }
    else if (!deferred(html) || standard(html)) wrong.push(rel + ' should defer GTM');
  }
  assert.deepEqual(wrong, []);
  assert.ok(pages.filter((p) => !STANDARD.has(p) && deferred(readFileSync(join(ROOT, p), 'utf8'))).length >= 26, 'expected at least 26 deferred pages');
});
