/**
 * Round 15: the homepage rebuild.
 *
 * The page used to explain answer → qualify → book three times (a hero
 * transcript, a handoff band that reused the same call, and a four-step rail).
 * It now does it once. These checks hold that, the facts that must stay in
 * plain HTML text, the homepage-only stylesheet's isolation, and the two
 * photographs. Run with `npm test`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const home = read('index.html');
const main = home.slice(home.indexOf('<main'), home.indexOf('</main>'));

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', nbsp: ' ', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', middot: '·', rarr: '→' };
const decode = (s) => s.replace(/&([a-z]+);/gi, (m, n) => (n in ENTITIES ? ENTITIES[n] : m));
/* Visible text only: no scripts, styles, SVG, comments or attributes. An alt
   attribute is therefore NOT text here, which is the point of the facts test. */
const textOf = (html) => decode(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<svg[\s\S]*?<\/svg>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const text = textOf(main);
const count = (hay, needle) => hay.split(needle).length - 1;

test('the homepage shows one call and one handoff sheet', () => {
  assert.equal(count(main, 'class="h15-steps"'), 1, 'exactly one transcript');
  assert.equal(count(main, 'class="h15-sheet"'), 1, 'exactly one handoff sheet');
  /* The lines that used to appear twice, once in the hero and once in the band. */
  for (const once of ['There are wasps building a nest', '14 Oak Lane.”', 'Job booked', 'Dog in the rear yard']) {
    assert.equal(count(text, once), 1, `"${once}" should appear once, found ${count(text, once)}`);
  }
  for (const gone of ['From first call to booked job', 'A clear handoff after each call we take',
    'In pest control, a missed call can mean a missed booking', 'Which CRM or scheduling systems do you work with?']) {
    assert.equal(count(text, gone), 0, `"${gone}" was merged away and must not return`);
  }
  for (const cls of ['rec-bubble', 'jobnote', 'crmflow', 'coverage-grid', 'syslist']) {
    assert.ok(!new RegExp(`class="[^"]*\\b${cls}\\b`).test(main), `old component .${cls} is back on the homepage`);
  }
});

test('the facts search and AI tools read are plain HTML text on the homepage', () => {
  const FACTS = ['Real people, not an AI voice bot', 'Our representatives only handle pest control calls',
    '$399/month + $2.99 per inbound call', '$399 / month', '$2.99 / inbound call', '$0.99 per outbound follow-up, when used.',
    'Mon–Fri, 9am–6pm your local time', '9am–6pm, your local time — included', 'Evenings $199/month', 'Weekends $149/month',
    'CRM Management Direct entry into your system $99/month', 'Overnight coverage is not offered.',
    'Month-to-month, with no long-term contract.', 'using access you grant and can revoke',
    'It’s manual work by a person — no native integration or automatic sync.'];
  for (const fact of FACTS) assert.ok(text.includes(fact), `missing from visible text: "${fact}"`);
  for (const banned of [/24\s*\/\s*7/, /guarantee/i, /U\.?S\.?-based/i, /integrates with/i, /syncs? (?:to|with)/i]) {
    assert.ok(!banned.test(text), `banned claim on the homepage: ${banned}`);
  }
  /* "overnight" and "native integration" are allowed only as denials. */
  assert.equal(count(text.toLowerCase(), 'overnight'), 1);
  assert.equal(count(text.toLowerCase(), 'native integration'), 1);
});

test('each call-to-action location is on one control, the right one', () => {
  const EXPECT = { hero_primary: 'calendly.com', hero_secondary: '#pricing', pricing: 'calendly.com', works_with: '/integrations/fieldroutes',
    faq: '/faq', closing_primary: 'calendly.com', closing_secondary: '/contact' };
  const found = [...main.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]).filter((tag) => tag.includes('data-cta-location'))
    .map((tag) => [tag.match(/data-cta-location="([^"]+)"/)[1], tag.match(/href="([^"]+)"/)[1]]);
  assert.deepEqual(found.map(([k]) => k).sort(), Object.keys(EXPECT).sort());
  for (const [where, href] of found) assert.ok(href.includes(EXPECT[where]), `${where} is on ${href}`);
  assert.equal(count(main, 'data-cta-location'), 7, 'no data-cta-location on anything that is not a link');
  assert.ok(main.includes('id="pricing"'));
});

test('the homepage stylesheet is current, homepage-only and scoped', () => {
  const css = read('css/home.css');
  const hash = createHash('sha256').update(css).digest('hex').slice(0, 10);
  assert.ok(home.includes(`href="/css/home.css?v=${hash}"`), `index.html must link /css/home.css?v=${hash}`);
  const others = [];
  (function walk(dir) {
    for (const e of readdirSync(dir)) {
      const abs = join(dir, e); const rel = relative(ROOT, abs);
      if (['.git', 'node_modules', 'preview', 'docs'].includes(rel.split('/')[0])) continue;
      if (statSync(abs).isDirectory()) walk(abs);
      else if (e.endsWith('.html') && rel !== 'index.html' && readFileSync(abs, 'utf8').includes('home.css')) others.push(rel);
    }
  }(ROOT));
  assert.deepEqual(others, [], 'css/home.css is for index.html only');
  /* Every selector starts at .home-main and every class it introduces is h15-. */
  const body = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const selectors = [...body.matchAll(/(^|[{}])\s*([^{}@]+?)\s*\{/g)].map((m) => m[2]).flatMap((s) => s.split(',')).map((s) => s.trim()).filter(Boolean);
  assert.ok(selectors.length > 80);
  const unscoped = selectors.filter((s) => !s.startsWith('.home-main '));
  assert.deepEqual(unscoped, [], 'selector not scoped to the homepage');
  const SHARED_OK = new Set(['home-main', 'btn', 'eyebrow', 'lede', 'container']);
  const foreign = [...new Set(selectors.flatMap((s) => [...s.matchAll(/\.([a-z][\w-]*)/g)].map((m) => m[1])))].filter((c) => !c.startsWith('h15-') && !SHARED_OK.has(c));
  assert.deepEqual(foreign, [], 'home.css may only name h15- classes (and .btn/.eyebrow/.lede/.container inside an h15- block)');
  for (const banned of [/gradient\(/, /@keyframes/, /animation\s*:/, /position\s*:\s*(?:sticky|fixed)/]) assert.ok(!banned.test(body), `not on the homepage: ${banned}`);
  assert.equal(count(body, 'box-shadow'), 1, 'one shadow, on the handoff sheet');
  assert.ok(/\.h15-sheet\s*\{[^}]*box-shadow/.test(body));
});

test('the homepage photographs are sized, described and within budget', () => {
  const BUDGET_KB = { 'home-hero-desktop': 180, 'home-hero-mobile': 100, 'home-rules-desktop': 120, 'home-rules-mobile': 80 };
  const manifest = read('assets/photos/MANIFEST.md');
  const referenced = [...new Set([...main.matchAll(/\/assets\/photos\/([\w.-]+)/g)].map((m) => m[1]))].sort();
  const expected = Object.keys(BUDGET_KB).flatMap((n) => ['avif', 'webp'].map((e) => `${n}.${e}`)).concat(['home-hero-desktop.jpg', 'home-rules-desktop.jpg']).sort();
  assert.deepEqual(referenced, expected);
  for (const [name, kb] of Object.entries(BUDGET_KB)) {
    for (const ext of ['avif', 'webp', 'jpg']) {
      const rel = `assets/photos/${name}.${ext}`;
      assert.ok(existsSync(join(ROOT, rel)), `${rel} is missing`);
      const size = statSync(join(ROOT, rel)).size / 1024;
      assert.ok(size <= kb, `${rel} is ${size.toFixed(0)} KB, budget ${kb} KB`);
    }
    assert.ok(manifest.includes(name), `${name} is not in assets/photos/MANIFEST.md`);
  }
  const imgs = [...main.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
  assert.equal(imgs.length, 2);
  for (const tag of imgs) {
    assert.ok(/\bwidth="\d+"/.test(tag) && /\bheight="\d+"/.test(tag), 'explicit width and height');
    const alt = tag.match(/\balt="([^"]*)"/)[1];
    assert.ok(alt.length > 20, 'alt text describes the photo');
    assert.ok(!/callvix|representative|our team|staff/i.test(alt), `alt text must not imply Callvix: "${alt}"`);
  }
  assert.ok(/fetchpriority="high"/.test(imgs[0]) && !/loading="lazy"/.test(imgs[0]), 'the hero loads eagerly, high priority');
  assert.ok(/loading="lazy"/.test(imgs[1]), 'the second photo is lazy');
});

test('the homepage structured data is byte-identical to before the rebuild', () => {
  const blocks = (home.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g) || []).join('');
  assert.equal(createHash('sha256').update(blocks).digest('hex'), 'f8196557dd1970209b5b52407451246921c0026f8dc432ebbab63ccc13e0b268',
    'Round 15 changed markup and CSS only. If the JSON-LD is meant to change, that is its own decision: update this hash with it.');
  assert.ok(!/"@type"\s*:\s*"FAQPage"/.test(blocks), 'the homepage has no FAQPage');
  assert.equal(count(main, '<h1'), 1);
});
