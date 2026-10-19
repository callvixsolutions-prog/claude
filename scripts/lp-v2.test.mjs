/**
 * Landing page v2 (/pest-control-call-demo/) — content and behaviour guards.
 *
 * Every check here can fail: each one names the exact string, number or
 * function it expects, so a drifted price, a returned banned word or a
 * broken calculator shows up as a red test rather than a silent change.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const HTML = read('pest-control-call-demo/index.html');
const JS = read('js/lp.js');
const CSS = read('css/lp.css');
const V1JS = read('js/lp-booking.js');

const decode = (s) => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&rsquo;/g, '’').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
const squash = (s) => s.replace(/\s+/g, ' ').trim();
/* Visible text: body without scripts, styles, templates, the icon sprite and comments. */
const visible = squash(decode(HTML.slice(HTML.indexOf('<body'))
  .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<template[\s\S]*?<\/template>/gi, ' ').replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
  .replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ')));
const everything = HTML + '\n' + JS + '\n' + CSS;

test('every price matches the approved facts to the cent', () => {
  for (const s of ['$399/month + $2.99 per answered call', 'Outbound follow-ups: $0.99 per call, only when used.', '+$199/mo', '+$149/mo', '+$99/mo',
    '$399.00', '$358.80', '$757.80', 'Mon–Fri, 9am–6pm, your time zone', 'No setup fee', 'Cancel with 30 days’ notice.']) {
    assert.ok(visible.includes(s), `missing: "${s}"`);
  }
  const amounts = new Set([...visible.matchAll(/\$\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?/g)].map((m) => m[0].replace(/\s/g, '')));
  const allowed = new Set(['$399', '$2.99', '$0.99', '$199', '$149', '$99', '$399.00', '$358.80', '$757.80', '$3,000', '$518.60', '$997.00', '$']);
  const extra = [...amounts].filter((a) => !allowed.has(a));
  assert.deepEqual(extra, [], `unexpected money amounts on the page: ${extra.join(', ')}`);
  assert.equal(399 + 120 * 2.99, 757.8, 'the example bill adds up');
});

test('banned words and claims are absent from the page, its script and its styles', () => {
  const lower = everything.toLowerCase();
  const BANNED = ['egypt', 'cairo', 'founder', 'u.s.-based', 'us-based', 'trial', 'founding', 'zenova', 'illustrative', 'ai-generated', 'eligible',
    '24/7', 'overnight', 'callrail', 'trustpilot', 'g2.com', 'clutch.co', 'not a real customer record', 'registration pending'];
  const hits = BANNED.filter((w) => lower.includes(w));
  assert.deepEqual(hits, [], `banned: ${hits.join(', ')}`);
  assert.ok(!/★|☆|star rating/i.test(visible), 'no star ratings');
});

test('the only statistics are the two approved figures, with no source line', () => {
  const pct = [...visible.matchAll(/\d+(?:\.\d+)?\s?%/g)].map((m) => m[0]);
  assert.deepEqual(pct, ['58%', '78%']);
  assert.ok(visible.includes('58% of callers don’t leave a voicemail. And 78% say they’ve stopped using a business after a call went unanswered.'));
  assert.ok(!/source:/i.test(visible), 'no "Source:" line');
});

test('the calculator defaults produce 40, 10, $3,000, $518.60 and $997.00', () => {
  const src = JS.slice(JS.indexOf('function calcMath('), JS.indexOf('window.__lpCalc'));
  const ctx = { PRICE: { base: 399, inbound: 2.99 } }; vm.createContext(ctx);
  vm.runInContext(src + '; this.calcMath = calcMath;', ctx);
  const r = ctx.calcMath({ calls: 200, miss: 20, newp: 50, book: 50, val: 300 });
  assert.deepEqual({ ...r }, { missed: 40, jobs: 10, risk: 3000, costMiss: 518.6, costAll: 997 });
  assert.ok(JS.includes("var PRICE = { base: 399, inbound: 2.99 };"), 'the calculator uses the published prices');
  for (const [id, v] of [['o-missed', '40'], ['o-jobs', '10'], ['o-risk', '$3,000'], ['o-cost-miss', '$518.60/mo'], ['o-cost-all', '$997.00/mo']]) {
    assert.match(HTML, new RegExp(`id="${id}">${v.replace(/[$.]/g, '\\$&')}<`), `${id} shows ${v} before any script runs`);
  }
  /* Extreme inputs stay finite and formatted. */
  const big = ctx.calcMath({ calls: 2000, miss: 80, newp: 100, book: 100, val: 5000 });
  assert.equal(big.risk, 8000000); assert.equal(big.costAll, 6379);
});

test('?h= only ever picks from the whitelist; anything else falls back to the default', () => {
  const head = HTML.match(/<script>\n\/\* Runs before first paint[\s\S]*?<\/script>/)[0].replace(/<\/?script>/g, '');
  const run = (search, stored) => {
    const store = new Map(stored ? [['lp_variant', stored]] : []);
    const ctx = { location: { search }, document: { documentElement: { className: '' } }, URLSearchParams,
      sessionStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }, window: {} };
    ctx.window = ctx; vm.createContext(ctx); vm.runInContext(head, ctx);
    return { v: ctx.__lpVariant, cls: ctx.document.documentElement.className, store };
  };
  assert.equal(run('?h=missed').v, 'missed');
  assert.equal(run('?h=after-hours').v, 'after-hours');
  assert.equal(run('?h=%3Cscript%3Ealert(1)%3C/script%3E').v, 'default');
  assert.equal(run('?h=constructor').v, 'default');
  assert.equal(run('?h=__proto__').v, 'default');
  assert.equal(run('', 'human').v, 'human', 'the variant persists for the session');
  assert.match(run('?utm_source=facebook').cls, /is-social/);
  assert.match(run('?src=fb').cls, /is-social/);
  assert.doesNotMatch(run('?utm_source=google').cls, /is-social/);
  /* The swap writes textContent from a fixed map, never URL text. */
  const swap = HTML.match(/var v = window\.__lpVariant;[\s\S]*?\}\)\(\);/)[0];
  assert.ok(!/innerHTML|location|search/.test(swap));
  const keys = (s) => [...s.matchAll(/'([a-z-]+)':/g)].map((m) => m[1]).sort();
  assert.deepEqual(keys(swap).filter((k) => k !== 'default'), ['after-hours', 'answering', 'call-center', 'human', 'missed', 'receptionist']);
  assert.ok(swap.includes('9am–6pm') && swap.includes('+$199/month') && swap.includes('+$149/month'), 'after-hours keeps the base hours and both add-on prices');
});

test('FAQ answers are on the page word for word, and the page has one H1 and stays noindex', () => {
  const ld = [...HTML.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const faq = ld.find((n) => n['@type'] === 'FAQPage');
  assert.equal(faq.mainEntity.length, 10);
  for (const q of faq.mainEntity) {
    assert.ok(visible.includes(q.name), `question not visible: ${q.name}`);
    assert.ok(visible.includes(q.acceptedAnswer.text), `answer not visible verbatim: ${q.name}`);
  }
  assert.ok(ld.some((n) => n['@type'] === 'Organization' && n.telephone === '+1-551-373-6777'));
  assert.equal((HTML.match(/<h1\b/g) || []).length, 1);
  assert.match(HTML, /<meta name="robots" content="noindex, follow">/);
  assert.match(HTML, /<link rel="canonical" href="https:\/\/callvixsolutions\.com\/pest-control-call-demo\/">/);
});

test('measurement keeps the existing conversion names and never leaks personal data into events', () => {
  for (const ev of ["'callvix_meeting_booked'", "'generate_lead'", "'callvix_cta_click'", "'callvix_booking_step'", "'phone_click'", "'lp_view'"]) assert.ok(JS.includes(ev), `missing ${ev}`);
  for (const old of ["'calendly_booked'", "'form_submit'", "'cta_click'"]) assert.ok(!JS.includes(`push(${old}`), `${old} must map to the existing name`);
  /* user_data is pushed alone, read at generate_lead, then cleared. */
  const i = JS.indexOf('dl().push({ user_data: ud });'), j = JS.indexOf("push('generate_lead'"), k = JS.indexOf('dl().push({ user_data: undefined });');
  assert.ok(i > 0 && i < j && j < k, 'order: user_data, generate_lead, clear');
  assert.ok(JS.includes("if (!leadSent)") && JS.includes("cvx_lead_sent"), 'generate_lead cannot double-fire');
  assert.ok(/if \(!res\.ok \|\| \(res\.j && res\.j\.errors\)\) throw/.test(JS), 'generate_lead only after Formspree says OK');
  /* One dedupe pattern across v1 and v2. */
  const fn = (src, name) => src.slice(src.indexOf(`function ${name}(`), src.indexOf('\n  }\n', src.indexOf(`function ${name}(`)) + 5);
  for (const name of ['bookingKey', 'alreadyCounted']) assert.equal(fn(JS, name), fn(V1JS, name), `${name}() has drifted from js/lp-booking.js`);
  assert.ok(JS.includes("booking_method: 'calendly_embed'"));
  /* E.164 */
  const src = JS.slice(JS.indexOf('function e164('), JS.indexOf('function fmtPhone('));
  const ctx = {}; vm.createContext(ctx); vm.runInContext(src + '; this.e164 = e164;', ctx);
  assert.equal(ctx.e164('(551) 373-6777'), '+15513736777');
  assert.equal(ctx.e164('1-551-373-6777'), '+15513736777');
  assert.equal(ctx.e164('12345'), '');
});

test('click IDs reach the form and Calendly; the phone number is swappable text', () => {
  for (const k of ['gclid', 'gbraid', 'wbraid', 'fbclid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']) {
    assert.match(HTML, new RegExp(`name="${k}" data-attr="${k}"`), `hidden field ${k}`);
  }
  for (const f of ['_gotcha', '_subject', 'lead_source', 'landing_page', 'campaign_source']) assert.ok(HTML.includes(`name="${f}"`), f);
  assert.ok(HTML.includes('action="https://formspree.io/f/maqrpwqw"'));
  assert.ok(JS.includes("if (gid) content = content ? gid + '|' + content : gid;"), 'gclid rides in utmContent');
  assert.ok(JS.includes("customAnswers = { a1:"), 'notes go to Calendly question a1');
  for (const where of ['data-phone="header"', 'data-phone="footer"']) {
    const at = HTML.indexOf(where); assert.ok(at > 0 && HTML.slice(at, at + 400).includes('<span class="tracking-phone">(551) 373-6777</span>'), `${where} carries the number as text`);
  }
});

test('testimonials stay off, and only this page loads the v2 files', () => {
  assert.ok(JS.includes('var SHOW_TESTIMONIALS = false;'));
  assert.ok(HTML.includes('<template id="tplProof">'), 'the testimonials section is a template, not rendered markup');
  assert.ok(JS.includes("var CALLBACK_PROMISE = 'shortly during U.S. business hours';"));
  const others = [];
  const walk = (d) => { for (const n of readdirSync(join(ROOT, d))) {
    const p = d ? `${d}/${n}` : n; if (['node_modules', '.git', 'scripts'].includes(n)) continue;
    if (statSync(join(ROOT, p)).isDirectory()) walk(p);
    else if (p.endsWith('.html') && p !== 'pest-control-call-demo/index.html' && /\/(css\/lp\.css|js\/lp\.js)/.test(readFileSync(join(ROOT, p), 'utf8'))) others.push(p);
  } };
  walk('');
  assert.deepEqual(others, []);
  assert.ok(!HTML.includes('fonts.googleapis.com'), 'fonts are self-hosted on this page');
  assert.ok(!/\bmain\.js|style\.css|lp-booking\.js/.test(HTML), 'v2 loads none of the shared site files');
});

test('the Calendly embed shows the whole month, time zone and slots without scrolling inside it', () => {
  /* Measured live (calqa.mjs, Oct 2026): Calendly needs 798px when the box is 1200px wide (slots beside the month),
     700px at 600-1000px and 602px on phones before a date is picked, then 955-1001px once slots stack below.
     Reserved heights cover the first state; the page_height handler grows the box for the second. */
  assert.ok(JS.includes("'?hide_event_type_details=1&hide_landing_page_details=1&hide_gdpr_banner=1"), 'details panels hidden');
  assert.ok(/case 'calendly\.page_height':[\s\S]{0,200}cbox\.style\.height = \(hpx \+ 2\) \+ 'px'/.test(JS), 'box follows Calendly page_height');
  const h = (re) => +(CSS.match(re) || [, 0])[1];
  assert.ok(h(/\.lp \.cal\{position:relative;height:(\d+)px/) >= 604, 'base reserved height');
  assert.ok(h(/@media \(min-width:640px\)\{\.lp \.cal\{height:(\d+)px\}\}/) >= 700, '640px+ reserved height');
  assert.ok(h(/@media \(min-width:1280px\)\{\.lp \.cal\{height:(\d+)px\}\}/) >= 800, '1280px+ reserved height');
  assert.ok(h(/@media \(max-width:639px\)\{[\s\S]*?\.lp \.cal\{height:(\d+)px\}/) >= 604, 'phone reserved height');
  assert.ok(/@media \(min-width:1024px\)\{\.lp \.book-l\{display:grid/.test(CSS) && !/minmax\(0,35fr\) minmax\(0,65fr\)/.test(CSS), 'desktop calendar uses the full container width');
});
