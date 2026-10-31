/**
 * Keyword targeting (owner brief, 31 Oct 2026).
 *
 * Search Console showed /services and several blog posts taking turns for
 * "pest control answering service" and its variants, with none of them holding
 * a position. The fix gives that search one page: the homepage. /services is the
 * "How It Works" page and stops competing for the phrase. Internal links follow
 * the same map: a keyword anchor points to "/", a process anchor to /services.
 *
 * These checks hold that map. Each one fails on the change it guards against:
 * the phrase back in a /services heading, a keyword anchor pointing at
 * /services, or a page losing (or doubling) its link to the homepage.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const ENT = { amp: '&', nbsp: ' ', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', rarr: '→', middot: '·' };
const plain = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&([a-z]+);/gi, (m, n) => ENT[n] ?? m).replace(/&#x27;/g, "'").replace(/\s+/g, ' ').trim();
const mainOf = (html) => html.slice(html.indexOf('<main'), html.indexOf('</main>'));
const PHRASE = /pest control answering service/i;
const KEYWORD_ANCHOR = /pest control answering service|pest control phone answering service|pest control call answering|human pest control answering service/i;
const links = (html) => [...mainOf(html).matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)]
  .map((m) => ({ href: (m[1].match(/href="([^"]*)"/) || [])[1] || '', text: plain(m[2]) }));

test('the homepage targets "pest control answering service"; /services does not', () => {
  const home = read('index.html'); const svc = read('services.html');
  const title = (h) => (h.match(/<title>([^<]*)<\/title>/) || [])[1];
  const h1 = (h) => plain((h.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || '');
  assert.equal(title(home), 'Pest Control Answering Service | Callvix Solutions');
  assert.ok(PHRASE.test(h1(home)), 'the homepage H1 names the service');
  const svcHeads = [title(svc), ...[...svc.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/g)].map((m) => plain(m[1])),
    ...[...svc.matchAll(/<summary>([\s\S]*?)<\/summary>/g)].map((m) => plain(m[1]))];
  assert.deepEqual(svcHeads.filter((t) => PHRASE.test(t)), [], '/services title, headings and FAQ questions must not use the phrase');
  const svcBody = plain(mainOf(svc)).match(new RegExp(PHRASE.source, 'gi')) || [];
  assert.ok(svcBody.length <= 1, `/services body uses the phrase ${svcBody.length} times (at most once, linked to "/")`);
  assert.ok(links(svc).some((l) => l.href === '/' && /^pest control answering service$/i.test(l.text)), '/services links back to "/" as "pest control answering service"');
  assert.ok(links(home).some((l) => l.href === '/services' && /see how our call handling works/i.test(l.text)), 'the homepage links to /services as "see how our call handling works"');
});

/* The pages that must each carry one contextual keyword link to "/". Two
   pages carry two because the brief names both links on each of them. */
const PAGES = ['pricing.html', 'about.html',
  'integrations/index.html', 'integrations/fieldroutes.html', 'integrations/pestpac.html', 'integrations/gorilladesk.html',
  'integrations/briostack.html', 'integrations/servicetitan.html', 'integrations/housecall-pro.html',
  'blog/pest-control-answering-service-cost.html', 'blog/pest-control-receptionist-vs-answering-service.html',
  'blog/ai-vs-human-answering-service-pest-control.html', 'blog/best-pest-control-answering-services.html',
  'blog/missed-calls-cost-pest-control.html', 'blog/after-hours-pest-control-call-handling.html',
  'blog/pest-control-call-script-intake-form.html', 'blog/pest-control-answering-service-checklist.html',
  'blog/pest-control-call-volume-by-season-and-region.html'];
const TWO = new Set(['blog/ai-vs-human-answering-service-pest-control.html', 'blog/best-pest-control-answering-services.html']);

test('each blog post, integration page, /pricing and /about links to "/" with a keyword anchor', () => {
  const problems = [];
  for (const file of PAGES) {
    const n = links(read(file)).filter((l) => l.href === '/' && KEYWORD_ANCHOR.test(l.text)).length;
    const want = TWO.has(file) ? 2 : 1;
    if (n !== want) problems.push(`${file}: ${n} keyword links to "/" (want ${want})`);
  }
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('no keyword anchor points at /services', () => {
  const sitemap = read('sitemap.xml');
  const files = [...sitemap.matchAll(/<loc>https:\/\/callvixsolutions\.com\/([^<]*)<\/loc>/g)].map((m) => {
    const p = m[1]; return p === '' ? 'index.html' : p.endsWith('/') ? `${p}index.html` : `${p}.html`;
  });
  const hits = [];
  for (const file of files) {
    for (const l of links(read(file))) if (/^\/services(#|$)/.test(l.href) && KEYWORD_ANCHOR.test(l.text)) hits.push(`${file}: "${l.text}" → ${l.href}`);
  }
  assert.ok(files.length > 20);
  assert.deepEqual(hits, [], hits.join('\n'));
});
