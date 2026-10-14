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
  /* Round 17 restored the sections Round 15 merged away, each with its own job:
     the call example carries the only transcript, the handoff section the only
     sheet. The words of that call still appear once each. */
  assert.equal(count(main, 'class="h17-track"'), 1, 'exactly one transcript');
  assert.equal(count(main, 'class="h15-sheet"'), 1, 'exactly one handoff sheet');
  assert.ok(!/<img[^>]*>/.test(main.slice(main.indexOf('h17-handoff'), main.indexOf('h17-process'))), 'the handoff is shown by the call summary itself, not a photograph');
  for (const once of ['There are wasps building a nest', '14 Oak Lane.”', 'Dog in the rear yard', 'Wasp nest — front door eave']) {
    assert.equal(count(text, once), 1, `"${once}" should appear once, found ${count(text, once)}`);
  }
  /* Restored in Round 17 and not to be merged away again without a decision. */
  for (const back of ['Keep working. We’ll take the next call.', 'Human call answering for U.S. pest control companies', 'For the calls your team can’t get to', 'In pest control, a missed call can mean a missed booking', 'See what happens to one call',
    'A clear handoff after each call we take', 'From first call to booked job', 'Your rules stay in charge', 'When a call isn’t a booking',
    'The week it covers', 'Works with the tools your office already runs on', 'Which CRM or scheduling systems do you work with?']) {
    assert.equal(count(text, back), 1, `"${back}" should be on the homepage exactly once`);
  }
  for (const name of ['FieldRoutes', 'ServiceTitan', 'GorillaDesk', 'Briostack', 'PestPac', 'Housecall Pro']) assert.ok(text.includes(name));
  for (const cls of ['rec-bubble', 'jobnote']) {
    assert.ok(!new RegExp(`class="[^"]*\\b${cls}\\b`).test(main), `old component .${cls} is back on the homepage`);
  }
  assert.ok(text.includes('Stock photographs, not Callvix customers.'), 'the stock-photo label must stay beside the photographs');
  /* The hero is one illustration, described for people who cannot see it, and not a photograph of a person. */
  const hero = main.slice(0, main.indexOf('h18-who'));
  assert.equal(count(hero, '<svg'), 1); assert.ok(/<title id="h18t">[^<]{30,}<\/title>/.test(hero) && !/<img/.test(hero), 'the hero illustration needs its title and no photograph');
  assert.ok(count(main, 'href="/services"') >= 1, 'a body link to /services');
});

test('the facts search and AI tools read are plain HTML text on the homepage', () => {
  const FACTS = ['Answered by people, not an AI voice bot', 'answers in your business name', 'Callvix works only with pest control companies', 'Our representatives only handle pest control calls',
    '$399/month + $2.99 per inbound call', '$399 / month', '$2.99 / inbound call', '$0.99 per outbound follow-up, when used.',
    'Mon–Fri, 9am–6pm your local time', '9am–6pm, your local time — included', 'Overnight coverage is not offered.',
    'Month-to-month, with no long-term contract.', 'using access you grant and can revoke',
    'It’s manual work by a person — no native integration or automatic sync.'];
  for (const fact of FACTS) assert.ok(text.includes(fact), `missing from visible text: "${fact}"`);
  for (const [name, price] of [['After-Hours Coverage', '$199/month'], ['Weekend Coverage', '$149/month'], ['CRM Management', '$99/month']]) {
    assert.ok(new RegExp(name + '[^$]{0,140}' + price.replace('$', '\\$')).test(text), `${name} must sit beside ${price}`);
  }
  for (const banned of [/24\s*\/\s*7/, /guarantee/i, /U\.?S\.?-based/i, /integrates with/i, /syncs? (?:to|with)/i]) {
    assert.ok(!banned.test(text), `banned claim on the homepage: ${banned}`);
  }
  /* "overnight" and "native integration" are allowed only as denials. */
  assert.equal(count(text.toLowerCase(), 'overnight'), 1);
  for (const m of text.matchAll(/native integration/gi)) assert.match(text.slice(m.index - 12, m.index), /no $/i, 'native integration only ever denied');
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
  const SHARED_OK = new Set(['home-main', 'btn', 'eyebrow', 'lede', 'container', 'crmflow', 'coverage', 'syslist']);
  const foreign = [...new Set(selectors.flatMap((s) => [...s.matchAll(/\.([a-z][\w-]*)/g)].map((m) => m[1])))].filter((c) => !/^h1[578]-/.test(c) && !SHARED_OK.has(c));
  assert.deepEqual(foreign, [], 'home.css may only name h15-/h17- classes (shared classes only inside one of those blocks)');
  for (const banned of [/gradient\(/, /@keyframes/, /animation\s*:/, /position\s*:\s*(?:sticky|fixed)/]) assert.ok(!banned.test(body), `not on the homepage: ${banned}`);
  assert.equal(count(body, 'box-shadow'), 1, 'one shadow, on the handoff sheet');
  assert.ok(/\.h15-sheet\s*\{[^}]*box-shadow/.test(body));
});

test('the services stylesheet is current, services-only and scoped', () => {
  const css = read('css/services.css'); const page = read('services.html');
  const hash = createHash('sha256').update(css).digest('hex').slice(0, 10);
  assert.ok(page.includes(`href="/css/services.css?v=${hash}"`), `services.html must link /css/services.css?v=${hash}`);
  const others = [];
  (function walk(dir) {
    for (const e of readdirSync(dir)) {
      const abs = join(dir, e); const rel = relative(ROOT, abs);
      if (['.git', 'node_modules', 'preview', 'docs'].includes(rel.split('/')[0])) continue;
      if (statSync(abs).isDirectory()) walk(abs);
      else if (e.endsWith('.html') && rel !== 'services.html' && readFileSync(abs, 'utf8').includes('services.css')) others.push(rel);
    }
  }(ROOT));
  assert.deepEqual(others, [], 'css/services.css is for services.html only');
  const body = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const selectors = [...body.matchAll(/(^|[{}])\s*([^{}@]+?)\s*\{/g)].map((m) => m[2]).flatMap((s) => s.split(',')).map((s) => s.trim()).filter(Boolean);
  assert.ok(selectors.length > 80);
  assert.deepEqual(selectors.filter((s) => !s.startsWith('.svc-main ')), [], 'selector not scoped to /services');
  const OK = new Set(['svc-main', 'lede', 'hero-cta', 'svc-base-line']);
  const foreign = [...new Set(selectors.flatMap((s) => [...s.matchAll(/\.([a-z][\w-]*)/g)].map((m) => m[1])))].filter((c) => !c.startsWith('s18-') && !OK.has(c));
  assert.deepEqual(foreign, [], 'services.css may only name s18- classes');
  /* The protected tags, read from the file this stylesheet belongs to. */
  assert.ok(page.includes('<title>Human Pest Control Answering Service | Callvix Solutions</title>'));
  assert.equal((page.match(/<h1[^>]*>([^<]*)<\/h1>/g) || []).join(), '<h1>Human Pest Control Answering Service</h1>');
  assert.ok(page.includes('<link rel="canonical" href="https://callvixsolutions.com/services">'));
  assert.ok(/<meta name="robots" content="index,follow/.test(page), '/services must stay indexable in the repository');
  /* The sample call checks before it promises. */
  const svc = page.slice(page.indexOf('<main'), page.indexOf('</main>'));
  assert.ok(!/let(&rsquo;|’|')s get someone out/i.test(svc), 'the handler must not promise a visit before the area and the diary are checked');
});

test('the homepage photographs are sized, described and within budget', () => {
  const BUDGET_KB = { 'home-case-tech': 20, 'home-case-office': 20, 'home-rules-desktop': 120, 'home-rules-mobile': 80 };
  const manifest = read('assets/photos/MANIFEST.md');
  const referenced = [...new Set([...main.matchAll(/\/assets\/photos\/([\w-]+)\.\w+/g)].map((m) => m[1]))].sort();
  assert.deepEqual(referenced, Object.keys(BUDGET_KB).sort());
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
  assert.equal(imgs.length, 3);
  /* One use per photograph: the same scene twice adds nothing the second time. */
  const used = imgs.map((tag) => tag.match(/photos\/([\w-]+)\./)[1].replace(/-(desktop|mobile)$/, ''));
  assert.equal(new Set(used).size, used.length, `a photograph is used more than once: ${used.join(', ')}`);
  for (const tag of imgs) {
    assert.ok(/\bwidth="\d+"/.test(tag) && /\bheight="\d+"/.test(tag), 'explicit width and height');
    const alt = tag.match(/\balt="([^"]*)"/)[1];
    assert.ok(alt.length > 20, 'alt text describes the photo');
    assert.ok(!/callvix|representative|our team|staff|agent/i.test(alt), `alt text must not imply Callvix: "${alt}"`);
  }
  assert.equal(imgs.filter((tag) => /loading="lazy"/.test(tag)).length, 3, 'every photograph is below the fold, so all are lazy');
});

test('the homepage structured data is byte-identical to before the rebuild', () => {
  const blocks = (home.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g) || []).join('');
  assert.equal(createHash('sha256').update(blocks).digest('hex'), 'f8196557dd1970209b5b52407451246921c0026f8dc432ebbab63ccc13e0b268',
    'Round 15 changed markup and CSS only. If the JSON-LD is meant to change, that is its own decision: update this hash with it.');
  assert.ok(!/"@type"\s*:\s*"FAQPage"/.test(blocks), 'the homepage has no FAQPage');
  assert.equal(count(main, '<h1'), 1);
});
