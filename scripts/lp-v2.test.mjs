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
  /* Terms follow service agreement v2 (§4 which calls are billed, §6 cancelling), which the owner confirmed on 22 Oct 2026:
     wrong numbers are billed, cancel any time by email, service runs to the end of the billing month, no part-month refunds. */
  for (const s of ['$399/month + $2.99 per answered call', 'Outbound, $0.99', 'Only when someone answers or we leave a voicemail.', '+$199/mo', '+$149/mo', '+$99/mo',
    'The $399 monthly base stays fixed; usage charges vary with your call volume.', 'Answered inbound calls, including wrong numbers and repeat calls. Spam and robocalls are excluded.',
    'Mon–Fri, 9am–6pm, your time zone', 'No setup fee', 'Month-to-month: cancel any time by email', 'Service runs to the end of that billing month; no refunds for part months']) {
    assert.ok(visible.includes(s), `missing: "${s}"`);
  }
  assert.ok(!/30 days’ notice|30 days&rsquo; notice|refund(?:ed)? (?:of your first payment|in full)|before onboarding starts/i.test(HTML), 'no 30-days’-notice or pre-onboarding refund wording anywhere on the page (incl. FAQ JSON-LD)');
  const amounts = new Set([...visible.matchAll(/\$\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?/g)].map((m) => m[0].replace(/\s/g, '')));
  const allowed = new Set(['$399', '$2.99', '$0.99', '$199', '$149', '$99', '$3,000', '$']);
  const extra = [...amounts].filter((a) => !allowed.has(a));
  assert.deepEqual(extra, [], `unexpected money amounts on the page: ${extra.join(', ')}`);
  for (const gone of ['$578.40', '$847.50', '$5.65', '$3,700', '$179.40', '$448.50', '$757.80', '$358.80', 'Quiet month', 'Busy month', 'CSR costs', 'wages alone', 'Example bill']) {
    assert.ok(!HTML.includes(gone) && !JS.includes(gone), `"${gone}" must not appear anywhere on the page`);
  }
});

test('banned words and claims are absent from the page, its script and its styles', () => {
  const lower = everything.toLowerCase();
  const BANNED = ['egypt', 'cairo', 'founder', 'u.s.-based', 'us-based', 'trial', 'founding', 'zenova', 'illustrative', 'ai-generated', 'eligible',
    '24/7', 'overnight', 'callrail', 'trustpilot', 'g2.com', 'clutch.co', 'not a real customer record', 'registration pending'];
  const hits = BANNED.filter((w) => lower.includes(w));
  assert.deepEqual(hits, [], `banned: ${hits.join(', ')}`);
  assert.ok(!/★|☆|star rating/i.test(visible), 'no star ratings');
});

test('no survey statistics: the 78% figure stays removed (owner decision, 23 Oct 2026)', () => {
  const pct = [...visible.matchAll(/\d+(?:\.\d+)?\s?%/g)].map((m) => m[0]);
  assert.deepEqual(pct, [], 'no percentages in the visible copy');
  assert.ok(!/78%|78&#37;|surveyed U\.S\. consumers|take their business elsewhere/i.test(HTML + JS), 'the 78% line is gone');
  assert.ok(!/source:/i.test(visible), 'no "Source:" line');
});

test('the calculator defaults produce 40 missed calls, 10 jobs and $3,000 at risk', () => {
  const src = JS.slice(JS.indexOf('function calcMath('), JS.indexOf('window.__lpCalc'));
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(src + '; this.calcMath = calcMath;', ctx);
  assert.deepEqual({ ...ctx.calcMath({ calls: 200, miss: 20, newp: 50, book: 50, val: 300 }) }, { missed: 40, jobs: 10, risk: 3000 });
  for (const [id, v] of [['o-missed', '40'], ['o-jobs', '10'], ['o-risk', '$3,000']]) {
    assert.match(HTML, new RegExp(`id="${id}">${v.replace(/[$.+*?()[\]{}|^\\]/g, '\\$&')}<`), `${id} shows ${v} before any script runs`);
  }
  assert.equal(ctx.calcMath({ calls: 2000, miss: 80, newp: 100, book: 100, val: 5000 }).risk, 8000000, 'extreme inputs stay finite');
});

test('the calculator shows only what missed calls cost; no Callvix pricing in it', () => {
  const calc = HTML.slice(HTML.indexOf('<details id="calculator">'), HTML.indexOf('<details id="compare">'));
  assert.ok(calc.length > 500, 'calculator found inside its <details>');
  for (const s of ['$518.60', '$997', 'Cover the calls you miss', 'If we answer all your calls', '$399', '$2.99', 'Your estimate with', '$3,700', 'Add-ons']) assert.ok(!calc.includes(s), `calculator still contains "${s}"`);
  assert.match(calc, /<h3 id="calc-h">What are missed calls costing&nbsp;you\?<\/h3>/);
  assert.ok(calc.replace(/<[^>]+>/g, '').includes('See what it would cost you: book a 20-minute demo') && /href="#book" data-cta="calc" id="calcCta"/.test(calc), 'CTA scrolls to the calendar');
  assert.ok(calc.includes('A monthly scenario based on your numbers, not a forecast. Some callers may call back or book another way, and revenue isn’t profit.'), 'scenario caption');
  assert.ok(!/o-cost-|o-math-|PRICE\./.test(JS), 'no cost code left in the script');
  assert.ok(JS.includes("return 'Calls/month: ' + num0.format(calcState.calls) + ' · Miss rate: ' + calcState.miss + '%';"), 'Calendly a1 summary unchanged');
  /* Pricing keeps the published rates, the add-ons, the not-billed list, the terms and the billing link. */
  const pricing = HTML.slice(HTML.indexOf('id="pricing"'), HTML.indexOf('id="how-it-works"'));
  for (const s of ['$399', '$2.99', '$0.99', 'The $399 monthly base stays fixed; usage charges vary with your call&nbsp;volume.', 'Full billing detail', 'hang-ups before we answer', '+$199/mo', '+$149/mo', '+$99/mo',
    'Month-to-month: cancel any time by email', 'Service runs to the end of that billing month; no refunds for part months', 'Mon–Fri, 9am–6pm, your time zone',
    'Each invoice comes with an itemized record of billed calls.']) assert.ok(pricing.includes(s), s);
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

test('testimonials come only from the approved data, and only this page loads the v2 files', () => {
  /* lp.css (1 year) and lp.js (7 days) are cached: bump ?v= whenever either file changes. Current: lp.css v=23, lp.js v=13 (above every other preview branch, so no browser mixes cached files). */
  assert.ok(HTML.includes('/css/lp.css?v=23') && HTML.includes('/js/lp.js?v=13') && !/lp\.css\?v=(?:[5-9]|1\d|2[0-2])\b|lp\.js\?v=(?:[4-9]|1[0-2])\b/.test(HTML), 'asset versions bumped');
  assert.ok(JS.includes('var SHOW_TESTIMONIALS = true;'));
  assert.ok(!/<template id="tplProof">/.test(HTML) && (HTML.match(/ data-proof[ >]/g) || []).length === 1, 'the testimonial is static markup in one place (the proof strip), removable by the kill switch');
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
  /* Measured live (calqa.mjs, 22 Oct 2026, colour pass): from 1024px the calendar sits in a ≤620px column (604px inside
     its frame) and Calendly needs 602px before a date is picked, 767px after; 700px at 640-1023px (full width);
     602px on phones.
     Reserved heights cover the first state; the page_height handler grows the box for the second. */
  assert.ok(JS.includes("'?hide_event_type_details=1&hide_landing_page_details=1&hide_gdpr_banner=1"), 'details panels hidden');
  assert.ok(/case 'calendly\.page_height':[\s\S]{0,200}cbox\.style\.height = \(hpx \+ 2\) \+ 'px'/.test(JS), 'box follows Calendly page_height');
  const h = (re) => +(CSS.match(re) || [, 0])[1];
  assert.ok(h(/\.lp \.cal\{position:relative;(?:box-sizing:content-box;)?height:(\d+)px/) >= 604, 'base reserved height');
  assert.ok(h(/@media \(min-width:640px\)\{\.lp \.cal\{height:(\d+)px\}\}/) >= 700, '640px+ reserved height');
  assert.ok(h(/@media \(min-width:1024px\)\{\.lp \.cal\{height:(\d+)px\}\}/) >= 604, '1024px+ reserved height (calendar column ≤620px)');
  assert.ok(h(/@media \(max-width:639px\)\{[\s\S]*?\.lp \.cal\{height:(\d+)px\}/) >= 604, 'phone reserved height');
  assert.ok(CSS.includes('.lp .book-grid{display:grid;gap:24px;grid-template-columns:minmax(0,1fr);grid-template-areas:"intro" "cal" "more"}'), 'phones: intro, then the calendar, then everything else');
  assert.ok(CSS.includes('@media (min-width:1024px){.lp .book-grid{grid-template-columns:minmax(0,45fr) minmax(0,55fr);grid-template-areas:"intro cal" "more cal";'), 'desktop: intro and secondary material left (45%), calendar right (55%)');
  assert.ok(CSS.includes('.lp .book-r{width:100%;max-width:620px;justify-self:end}'), 'calendar framed to ≤620px');
  const book = HTML.slice(HTML.indexOf('id="book"'), HTML.indexOf('</section>', HTML.indexOf('id="book"')));
  const order = ['class="book-intro"', 'id="book-h"', 'class="book-sub"', 'class="book-r"', 'id="cal"', 'class="cal-fb"', 'class="book-call"', 'class="book-more"', 'class="book-after"', 'class="mini-trust"', 'id="cbWrap"'].map((k) => book.indexOf(k));
  assert.ok(order.every((v, i) => v > 0 && (i === 0 || v > order[i - 1])), 'reading order: heading + one-sentence agenda, calendar, fallback, phone, then after-demo, terms, callback');
  assert.ok(!/<figure|<blockquote|book-quote/.test(book), 'no repeated testimonial before (or after) the calendar');
  const sub = (book.match(/<p class="book-sub">([^<]*)<\/p>/) || [, ''])[1];
  assert.ok(sub && (sub.match(/\./g) || []).length === 1, 'the agenda is one sentence');
});

test('"hang-up" never appears without "before we answer" (page, /pricing, /faq)', () => {
  for (const f of ['pest-control-call-demo/index.html', 'pricing.html', 'faq.html']) {
    const t = squash(decode(read(f).replace(/<[^>]+>/g, ' '))).replace(/&rsquo;/g, '’');
    const bare = [...t.matchAll(/hang-ups?\b(?![^.]{0,4}before we answer)/gi)].map((m) => t.slice(Math.max(0, m.index - 40), m.index + 40));
    assert.deepEqual(bare, [], `${f}: bare "hang-up": ${bare.join(' | ')}`);
  }
  for (const s of ['Spam & robocalls', 'wrong numbers', 'Spam & robocalls not billed']) assert.ok(visible.includes(s), s);
  /* Agreement v2 §4 bills wrong numbers: the page must never list them as unbilled (visible copy, FAQ or JSON-LD). */
  assert.ok(!/(?:not billed|never billed|don’t bill|aren’t billed|isn’t billed)[^.]{0,120}wrong numbers|wrong numbers[^.]{0,40}(?:not billed|aren’t billed)/i.test(decode(HTML)), 'wrong numbers are never described as unbilled');
});

test('the brand reads "Callvix Solutions"; short "Callvix" only in tight UI', () => {
  assert.match(HTML, /<title>Pest Control Answering Service \| Real People, Booked Jobs \| Callvix Solutions<\/title>/);
  assert.match(HTML, /og:title" content="[^"]*\| Callvix Solutions">/); assert.match(HTML, /twitter:title" content="[^"]*\| Callvix Solutions">/);
  const ld = [...HTML.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  assert.equal(ld.find((n) => n['@type'] === 'Organization').name, 'Callvix Solutions');
  const faqText = JSON.stringify(ld.find((n) => n['@type'] === 'FAQPage'));
  assert.ok(!/Callvix(?! Solutions)/.test(faqText), 'FAQ schema uses the full name');
  /* Headings, body copy and FAQ: full name, everywhere (the logo alt text is the only short-form exception). */
  const body = HTML.slice(HTML.indexOf('<body'))
    .replace(/<script[\s\S]*?<\/script>/g, '').replace(/alt="Callvix Solutions"/g, '').replace(/<[^>]+>/g, ' ');
  const short = [...body.matchAll(/Callvix(?! Solutions)/g)].map((m) => body.slice(Math.max(0, m.index - 30), m.index + 30).replace(/\s+/g, ' '));
  assert.deepEqual(short, [], `short "Callvix" outside tight UI: ${short.join(' | ')}`);
  assert.ok(visible.includes('We only answer for pest control companies.') && visible.includes('How Callvix Solutions compares'));
  assert.ok(visible.includes('Callvix Solutions (callvixsolutions.com) is not affiliated with callvix.com.'), 'non-affiliation line kept');
});

test('the calendar has a visible loading state and warms up early, off the critical path', () => {
  assert.ok(HTML.includes('id="calStatusText">Loading available times…</span>') && (HTML.match(/<div class="cs-grid">((?:<i><\/i>)+)<\/div>/) || [, ''])[1].length === 35 * 7, 'month-grid skeleton + spinner text');
  assert.ok(HTML.indexOf('class="cal-fb"') > HTML.indexOf('id="cal"'), 'new-tab link stays under the calendar');
  assert.ok(/window\.addEventListener\('scroll', warm, \{ passive: true \}\)/.test(JS) && JS.includes("requestIdleCallback(warm, { timeout: 3000 })") && JS.includes('setTimeout(warm, 3000)'), 'scroll / idle / 3 s triggers');
  assert.ok(!/<script[^>]+widget\.js/.test(HTML), 'Calendly script is not in the HTML (injected later)');
});

/* Conversion polish, 22 Oct 2026. */
/* Second design pass, 22 Oct 2026: light hero, Inter only, Omar's quote as the hero visual. */
/* Page B revision 2, 24 Oct 2026: the owner-preferred sample call card returns as the hero visual; Omar's quote moves to a strip below. */
test('hero: solid navy, the restored sample call card (static, labelled), Inter only, one coverage line', () => {
  assert.ok(!/id="team"|href="#team"|team-h/.test(HTML) && !/\.team\b/.test(CSS) && !/#team\b/.test(JS), '#team stays gone');
  assert.ok(HTML.includes('.lp .hero{background:var(--navy-900);color:#fff;') && !/gradient\(|radial-|backdrop-filter|filter:blur/.test(HTML + CSS), 'solid navy hero; no grid texture, gradient or glow anywhere');
  assert.ok(HTML.includes('.lp .hero h1 .h1-b{color:var(--teal-300)}') && HTML.includes('<h1 id="lp-h1"><span class="h1-a">Your pest control calls.</span> <span class="h1-b">Answered by real&nbsp;people.</span></h1>'), 'default H1 unchanged; second sentence in teal-300');
  const hero = HTML.slice(HTML.indexOf('<section class="hero"'), HTML.indexOf('</section>', HTML.indexOf('<section class="hero"')));
  assert.ok(/first built in da94fd3,\s*live in production fa1cb78, refined in r2 fec65cb/.test(HTML), 'the card records where it came from');
  const card = (hero.match(/<figure class="callfig" id="heroIllus">([\s\S]*?)<\/figure>/) || [, ''])[1];
  assert.ok(card.includes('<span class="tag">Sample call</span>') && card.includes('<figcaption class="callfig-cap">Sample call. Names and details are made up.</figcaption>'), 'visibly labelled as a made-up sample');
  assert.ok(/<div class="callcard" role="img" aria-label="Sample call: [^"]+">/.test(card), 'one accessible description for the illustration');
  assert.ok(card.includes('Inside your service area') && card.includes('Booked from your approved slots') && card.includes('Details sent to your office') && card.includes('Pest unconfirmed.'), 'human answer -> approved booking -> office handoff, with caller-reported facts');
  assert.ok(!/cc-dot|cc-timer|ccTimer|lp-pulse|lp-in\b|class="st"|\bst"|Live call|Incoming call|00:0/.test(HTML + CSS + JS), 'no fake live status, timer, pulse or typing');
  assert.ok(!/hero-quote|q-mark|hq-label/.test(HTML + CSS), 'the oversized hero quote card is gone');
  assert.ok(hero.indexOf('id="heroCta"') < hero.indexOf('id="heroIllus"'), 'on phones the CTA comes before the illustration');
  assert.ok(!/Sora|sora-latin/.test(HTML + CSS) && /--font-h:'Inter'/.test(HTML), 'Inter for headings and body');
  const fams = new Set([...(HTML + CSS).matchAll(/@font-face\{font-family:'([^']+)'/g)].map((m) => m[1]));
  assert.deepEqual([...fams].sort(), ['Inter', 'Inter Fallback'], 'only Inter is loaded');
  assert.ok(HTML.includes('.lp .hero h1{font-size:clamp(2.375rem,2.6vw + 1.6rem,3.75rem);line-height:1.05;letter-spacing:-.025em;font-weight:800;color:#fff}') && HTML.includes('@media (max-width:374px){.lp .hero h1{font-size:36px}}') && HTML.includes('@media (max-width:359px){.lp .hero h1{font-size:30px}}'), 'H1 sizes unchanged');
  assert.ok(hero.includes('<a class="text-link" href="#sample-call" data-play-sample><span id="heroSecondaryLabel">See how we handle a call</span></a>'), 'secondary link to the sample');
  assert.ok(!/<ul class="trust"/.test(hero) && /<p class="hero-cover">[\s\S]*?Base coverage Mon–Fri, 9am–6pm your time zone\. Evening and weekend coverage are <span class="nw">add-ons<\/span>\./.test(hero), 'one positive coverage line instead of repeated assurances');
  assert.equal((decode(hero.replace(/<[^>]+>/g, ' ')).match(/Month-to-month/g) || []).length, 1, '"Month-to-month" once in the hero');
  assert.ok(hero.includes('On the demo we map your call flow and give you a cost estimate. No obligation.'));
  assert.ok(HTML.includes('@media (min-width:1280px){.lp .hero .wrap{grid-template-columns:minmax(0,1fr) 432px;gap:40px;align-items:center}}') && HTML.includes('.lp .hero-copy{max-width:728px}'), '432px card column beside a 728px text column (the default H1 holds 2 lines)');
  assert.ok(!/\.rv\b|classList\.add\('rv'\)/.test(HTML + CSS + JS), 'no reveal-on-scroll');
  assert.ok(!/id="fwd"|scen-card|id="scPlay"|id="scBar"/.test(HTML + CSS + JS), 'no forwarding animation, scenario toggles or player');
});

test('polish: brand lockup, non-breaking phrases and label sizes', () => {
  const sub = '<span class="logo-sub" aria-hidden="true">Solutions</span></a>';
  assert.equal(HTML.split(sub).length - 1, 2, '"Solutions" wordmark in header and footer');
  assert.ok(HTML.includes('Answering service for U.S. pest control&nbsp;companies</p>') && HTML.includes('· No&nbsp;setup&nbsp;fee ·'), 'eyebrow and price phrases kept together');
  /* The phone wordmark is the one exception: it is the logo's aria-hidden descriptor, sized to CALLVIX's width, not a label. */
  const small = [];
  for (const [name, src] of [['inline', HTML.match(/<style>([\s\S]*?)<\/style>/)[1]], ['lp.css', CSS]]) {
    for (const m of src.matchAll(/([^{}]*)\{[^{}]*font-size:([\d.]+)(px|rem)/g)) { const px = +m[2] * (m[3] === 'rem' ? 16 : 1); if (px < 12.5 && !m[1].trim().endsWith('.lp .logo-sub')) small.push(`${name} ${m[1].trim()} ${px}px`); }
  }
  assert.deepEqual(small, [], 'no label under 12.5px');
});

test('polish: the page has its own 1200x630 share image', () => {
  const url = 'https://callvixsolutions.com/assets/og-pest-control-call-demo-v5.jpg'; // v5: navy hero + the restored sample call card (Page B r2, 24 Oct 2026)
  assert.ok(HTML.includes(`<meta property="og:image" content="${url}">`) && HTML.includes(`<meta name="twitter:image" content="${url}">`));
  const jpg = readFileSync(join(ROOT, 'assets/og-pest-control-call-demo-v5.jpg'));
  let i = 2, size = null;
  while (i < jpg.length) { const marker = jpg[i + 1]; const len = jpg.readUInt16BE(i + 2); if (marker >= 0xc0 && marker <= 0xc2) { size = [jpg.readUInt16BE(i + 7), jpg.readUInt16BE(i + 5)]; break; } i += 2 + len; }
  assert.deepEqual(size, [1200, 630]);
});

test('variant H1s are the approved short versions, and the README ad table matches the page', () => {
  const swap = HTML.match(/var v = window\.__lpVariant;[\s\S]*?\}\)\(\);/)[0];
  const map = Object.fromEntries([...swap.matchAll(/'([a-z-]+)': '([^']+)'/g)].map((m) => [m[1], m[2].replace(/\\u00a0/g, ' ')]));
  assert.equal(map.answering, 'Pest control answering service. Real people. Jobs booked.');
  assert.equal(map['call-center'], 'A pest control call center that books the job.');
  assert.ok(!/booking jobs in your|books jobs in your company/.test(HTML), 'the old long variants are gone');
  map.default = decode(HTML.match(/<h1 id="lp-h1">(.*?)<\/h1>/)[1].replace(/<[^>]+>/g, ''));
  const README = read('README.md');
  for (const [k, h1] of Object.entries(map)) {
    const row = README.match(new RegExp('\\| ' + k + ' \\| `https://callvixsolutions\\.com/pest-control-call-demo/' + (k === 'default' ? '' : '\\?h=' + k) + '` \\| (.*?) \\|'));
    assert.ok(row, `README ad table row for ${k}`); assert.equal(row[1], h1, `README H1 for ${k}`);
  }
});

test('header CTA: "Book demo" under 360px, "Book a demo" from 360px, full label from 1024px', () => {
  assert.ok(HTML.includes('<span class="full">Book a 20-minute demo</span><span class="short">Book a demo</span><span class="xs">Book demo</span></a>'));
  assert.ok(HTML.includes('.lp .hdr .btn--cta .full,.lp .hdr .btn--cta .xs{display:none}'));
  assert.ok(HTML.includes('@media (max-width:359px){.lp .hdr .btn--cta .short{display:none}.lp .hdr .btn--cta .xs{display:inline;white-space:nowrap}.lp .hdr .wrap{gap:8px}.lp .hdr-r{gap:8px}.lp .hdr .btn--sm{padding:8px 12px}}'), 'under 360px: short label, kept on one line, with room made for it');
  assert.ok(HTML.includes('.lp .hdr .btn--cta .full{display:inline}.lp .hdr .btn--cta .short{display:none}}'), 'desktop shows only the full label');
});

/* Accuracy pass, owner-approved 22 Oct 2026. */
test('accuracy pass: retired wording is gone from the page, its script and the three site pages', () => {
  const SITE = ['services.html', 'pricing.html', 'faq.html'].map(read).join('\n');
  for (const old of ['58%', 'about a week', '~7–10', 'charged only when one is placed', 'Revenue at risk', 'Rarely', 'Often takes messages', 'Often per minute',
    'never booked', 'we catch the rest', 'person who will set up', 'Average value of a new customer', 'Covers sick days', 'Typical answering service',
    'Here’s exactly how we handle', 'Jobs you may be missing', 'quieter months']) {
    assert.ok(!(HTML + JS + CSS + SITE).includes(old), `still present: "${old}"`);
  }
  /* "Illustrative" is barred from this page only; /services keeps its own disclaimer (out of this pass's scope). */
  assert.ok(!/illustrative/i.test(HTML + JS + CSS), 'no "illustrative" on the landing page');
  assert.ok(!/7(?:–|&ndash;)10 days/.test(HTML + SITE), '"7–10 days" without "business"');
});

test('accuracy pass: timing, CRM qualifier, problem, scope and booking copy', () => {
  for (const t of ['Typically live in 7–10 business days.', 'After we receive your details. Nothing goes live until you’ve approved it.', 'Typically live 7–10 business days after we receive your setup details. You approve your call guide and we run test calls together before anything goes live.', 
    'Typically 7–10 business days after we receive your details. You fill in a setup questionnaire',
    'By text or email, or entered in your CRM with the $99/month add-on.', 'Without it, bookings and handoffs reach you by text or email.',
    'Forward every call during your coverage hours, or only the ones your office doesn’t answer.', 'Logged and sent to you unless your rules allow us to book it.',
    'Handled within your instructions; anything outside them goes to you.', 'Take payments, quote account balances, process cancellations, promise warranty outcomes or book outside your area.',
    'It’s not an automatic sync.', 'Bookings in your own system']) {
    assert.ok(visible.includes(t), `missing: "${t}"`);
  }
  const ld = [...HTML.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const start = ld.find((n) => n['@type'] === 'FAQPage').mainEntity.find((q) => q.name === 'How fast can we start?');
  assert.ok(start.acceptedAnswer.text.startsWith('Typically 7–10 business days after we receive your details.'));
  assert.ok(!HTML.includes('class="book-who"'), 'booking line removed, nothing added');
  const OUT = 'Outbound follow-ups are $0.99 per call, billed only when someone answers or we leave a voicemail.';
  assert.equal(read('services.html').split(OUT).length - 1, 2, '/services: visible FAQ and JSON-LD');
  assert.ok(read('pricing.html').includes('Typically live 7&ndash;10 business days after we receive your details.'));
  assert.equal(read('faq.html').split('Typically, you’re live 7–10 business days after').length - 1, 2, '/faq: visible and JSON-LD');
});

test('accuracy pass: comparison table, one implementation for desktop and the mobile tabs', () => {
  const t = HTML.slice(HTML.indexOf('<table class="cmp"'), HTML.indexOf('</table>'));
  assert.equal((HTML.match(/<table class="cmp"/g) || []).length, 1);
  assert.ok(t.includes('<th scope="col" class="c-cvx">Callvix Solutions</th>') && t.includes('<th scope="col" class="c-as">Other answering services</th>'));
  const row = (h) => (t.match(new RegExp('<tr><th scope="row">' + h + '</th>(.*?)</tr>')) || [])[1] || '';
  assert.ok(row('Pest-control-only training').includes('<td class="c-as">Varies by provider</td>'));
  assert.ok(row('Books jobs by your rules').includes('<td class="c-as">Varies by plan</td>') && row('Priced per call, not per minute').includes('<td class="c-as">Varies by plan</td>'));
  assert.equal(row('Coverage while your staff are away'), '<td class="c-cvx">During agreed hours</td><td class="c-vm"><svg class="ic d" aria-hidden="true"><use href="#i-dash"/></svg><span class="sr">Not applicable</span></td><td class="c-as">Depends on coverage</td><td class="c-ai">Depends on setup</td><td class="c-csr">Backup still needed</td>');
  for (const r of ['A real person answers', 'Pest-control-only training', 'Books jobs by your rules', 'Priced per call, not per minute', 'Spam &amp; robocalls not billed']) {
    assert.ok(row(r).startsWith('<td class="c-cvx"><svg class="ic y"'), `Callvix Solutions keeps "Yes" on: ${r}`);
  }
  assert.ok(HTML.includes('<p class="foot-note">Features, coverage and pricing vary by provider and plan.</p>') && !/a typical answering service/i.test(HTML));
  assert.ok(HTML.includes('data-col="as">vs Other services</button>'), 'mobile tab matches the column and stays on one line at 320');
  assert.ok(CSS.includes('@media (max-width:359px){.lp .cmp th,.lp .cmp td{padding:10px 6px}}'), 'narrow phones: the longer heading still fits the clipped card');
});

test('accuracy pass: calculator wording only; maths, inputs and defaults unchanged', () => {
  assert.ok(HTML.includes('<label for="c-val">Average first-job revenue</label>') && HTML.includes('aria-label="Average first-job revenue, dollars"'));
  assert.ok(visible.includes('Potential first-job revenue from missed calls') && visible.includes('Potential bookings per month'));
  for (const d of ['id="c-calls" min="20" max="2000" step="10" value="200"', 'id="c-miss" min="0" max="80" step="1" value="20"', 'id="c-newp" min="0" max="100" step="1" value="50"', 'id="c-book" min="0" max="100" step="1" value="50"', 'id="c-val" min="50" max="5000" step="10" value="300"']) assert.ok(HTML.includes(d), d);
  assert.ok(JS.includes('var jobs = missed * (s.newp / 100) * (s.book / 100);') && JS.includes('var risk = Math.round(jobs * s.val);'));
});

test('demonstration: three decisions beside the office handoff, the full transcript on demand; no player; audio only behind the flag', () => {
  assert.ok(HTML.includes('<p class="sc-note" id="scNote">Sample call. Names and details are made up.</p>'), 'the example is labelled as made up');
  assert.equal((HTML.match(/<ol class="sc-lines" id="scLines">/g) || []).length, 1, 'exactly one sample transcript');
  assert.equal((HTML.match(/<ol class="ex-lines"/g) || []).length, 0, 'no visible short excerpt (the hero card already shows the exchange)');
  assert.equal((HTML.match(/id="sample-call"/g) || []).length, 1);
  const lines = HTML.slice(HTML.indexOf('<ol class="sc-lines" id="scLines">'), HTML.indexOf('</ol>', HTML.indexOf('id="scLines"')));
  assert.equal((lines.match(/<li /g) || []).length, 12, 'all 12 lines are in the page, visible without JS or a play button');
  for (const t of ['Thanks for calling Oak Valley Pest Control, this is Dana. How can I help?', 'We’re hearing scratching in the kitchen wall, and there are droppings under the sink.', 'I have tomorrow between 10am and 12pm. Does that work?', 'Is this the best number to reach you?']) assert.ok(lines.includes(t), t);
  /* Revision 3: the dialogue is shown once (hero card) and in full on demand; the section explains the decisions instead of replaying it. */
  const demo0 = HTML.slice(HTML.indexOf('<div class="demo" id="sample-call"'), HTML.indexOf('<h3 class="sits-h">'));
  const dec = [...demo0.matchAll(/<li><h4>([^<]*)<\/h4><p>([^<]*)<\/p><\/li>/g)].map((m) => [m[1], decode(m[2])]);
  assert.deepEqual(dec.map((d) => d[0]), ['Capture what the caller reports', 'Check the address and your booking rules', 'Offer an approved slot, or hand it off']);
  assert.ok(/we don’t name the pest/.test(dec[0][1]) && /inside your service area/.test(dec[1][1]) && /approved slots/.test(dec[2][1]) && /named contact/.test(dec[2][1]), 'report, rules check, slot-or-handoff');
  const outsideTranscript = demo0.replace(/<details class="sc-full"[\s\S]*?<\/details>/, '');
  assert.ok(!/class="sc-who"|class="ex-lines"|data-who=/.test(outsideTranscript), 'no replayed dialogue outside the transcript disclosure');
  assert.ok(demo0.includes('<h2') === false && HTML.includes('<h2 id="handle-h">From the first question to a clear&nbsp;handoff.</h2>'), 'section heading');
  assert.ok(!/wasps building a nest/.test(HTML), 'one story only: the mice call');
  assert.ok(/<details class="sc-full" id="scFull">\s*<summary>Read the full sample transcript/.test(HTML) && HTML.indexOf('id="scLines"') > HTML.indexOf('id="scFull"'), 'the full transcript sits behind a native, keyboard-accessible control');
  const demo = HTML.slice(HTML.indexOf('<div class="demo" id="sample-call"'), HTML.indexOf('<h3 class="sits-h">'));
  assert.ok(demo.indexOf('id="scPlayer"') > 0 && demo.indexOf('id="scPlayer"') < demo.indexOf('class="demo-to"') && demo.indexOf('class="demo-to"') < demo.indexOf('id="hoCard"'), 'the call, then an arrow, then the handoff: one demonstration');
  const ho = demo.slice(demo.indexOf('<div class="ho" id="hoCard">'));
  assert.ok(ho.includes('<h3 class="ho-h" id="handoff-h">What your office receives</h3>'), 'handoff heading');
  assert.deepEqual([...ho.matchAll(/<dt>([^<]*)<\/dt><dd>([^<]*)<\/dd>/g)].map((m) => m[1] + ': ' + m[2]),
    ['Caller reports: Scratching in kitchen wall, droppings under sink. Pest unconfirmed.', 'Address: 14 Oak Lane, inside your area', 'Booked: Tomorrow 10am–12pm, from your approved slots', 'Access: Caller home', 'Pets: Dog in rear yard. Asked about treatment safety: for your technician.']);
  /* Agreement v2 §2: no pest identification. The sample models it: what the caller reports, pest unconfirmed. */
  assert.ok(!/\bMice\b|We identify the pest|identify the pest/.test(HTML.replace(/<script[\s\S]*?<\/script>/g, '')), 'no definitive pest named for the caller, and no pest-identification claim');
  assert.ok(!/Start text walkthrough|class="sc-play"|class="sc-prog"|data-speed=/.test(HTML), 'no play button, progress bar or speed toggle');
  for (const t of ['Logged and sent to you unless your rules allow us to book it.', 'Handled within your instructions; anything outside them goes to you.']) assert.ok(visible.includes(t), t);
  assert.ok(JS.includes('var SAMPLE_CALL_AUDIO = false;') && JS.includes("push('sample_call_play', { mode: 'audio' })") && JS.includes("push('sample_call_complete', { mode: 'audio' })"), 'audio mode keeps its events, behind the flag');
});

test('call handling: three common situations in 35–50 words each, no repeated dialogue; the rules consolidated in one panel', () => {
  assert.ok(HTML.includes('<h3 class="sits-h">Three common call situations</h3>'));
  const sits = HTML.slice(HTML.indexOf('<ol class="sits">'), HTML.indexOf('</ol>', HTML.indexOf('<ol class="sits">')));
  const cards = [...sits.matchAll(/<li class="sit">([\s\S]*?)<\/li>/g)].map((m) => m[1]);
  assert.equal(cards.length, 3);
  const words = cards.map((c) => decode(c.replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ')).trim().split(/\s+/).length);
  assert.ok(words.every((n) => n >= 35 && n <= 50), `35–50 words each: ${words.join(', ')}`);
  assert.ok(!/class="eg"|[“”]|scratching|droppings/i.test(sits), 'no quoted dialogue, and the scratching example is not repeated a third time');
  const head = cards.map((c) => decode((c.match(/<h3>([^<]*)<\/h3>/) || [, ''])[1]));
  assert.deepEqual(head, ['A new customer asks for a visit.', 'An existing customer needs a change.', 'A call needs your judgment.']);
  assert.ok(/or a handoff when the request falls outside your rules\./.test(cards[0]), 'new booking: the outcome is qualified');
  assert.ok(/Cancellations and billing questions go to you unless you tell us otherwise\./.test(cards[1]), 'existing customer: cancellations stay with the owner by default');
  assert.ok(/make no promises on your behalf/.test(cards[2]) && /named contact/.test(cards[2]), 'judgment call: escalation rule');
  const rules = HTML.slice(HTML.indexOf('<details class="rules" id="rules">'), HTML.indexOf('</details>', HTML.indexOf('id="rules"')));
  assert.ok(/<summary>What we do, and don’t do, on your calls<\/summary>/.test(rules), 'one optional, keyboard-native panel');
  for (const t of ['Also part of the job', 'Outside your service area', 'Warranty, billing or a judgment call', 'Only if you tell us to', 'Questions we pass to you', 'Pest identification, treatment, chemical-safety and medical questions']) assert.ok(rules.includes(t), t);
  assert.ok(visible.includes('Trained on pest control calls: ants and carpenter ants, termite swarmers, bed bugs, rodents, wasps and hornets, mosquitoes, wildlife, one-time vs quarterly service.'));
  assert.ok(!/notbook|hw-notes|class="rows"|stat-line/.test(HTML + CSS), 'the old operating-manual rows and the repeated non-booking list are gone');
});

test('accuracy pass: callback form options, local-time label and visitor_tz', () => {
  const vals = [...HTML.matchAll(/name="calls_per_month" value="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(vals, ['Under 100', '100–299', '300–599', '600+', 'not_sure']);
  assert.ok(HTML.includes('value="not_sure"><span>Not sure</span>') && HTML.includes('<legend>Best time to call (your local time)</legend>'));
  assert.ok(CSS.includes('.lp #cbStep1 .chip-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))}') && !/#cbStep1 \.chip-row\{flex-wrap:nowrap\}/.test(CSS), 'phones: five options wrap as a grid instead of overflowing one row');
  for (const b of ['Morning', 'Afternoon', 'Anytime']) assert.ok(HTML.includes(`name="best_time" value="${b}"`));
  assert.ok(HTML.includes('<input type="hidden" name="visitor_tz" id="cb_tz" value="">'));
  assert.ok(/try \{ tz\.value = Intl\.DateTimeFormat\(\)\.resolvedOptions\(\)\.timeZone \|\| ''; \} catch \(e\) \{ tz\.value = ''; \}/.test(JS));
  assert.ok(!/push\([^)]*(?:visitor_tz|timeZone)/.test(JS) && !/dataLayer[^\n]*tz/.test(JS), 'time zone never reaches dataLayer');
  assert.ok(JS.includes("var CALLBACK_PROMISE = 'shortly during U.S. business hours';"));
});

/* First client testimonial, owner-approved 22 Oct 2026 (Omar Abouhussein approved the wording and the use of his name, title and company). */
/* First client testimonial, owner-approved 22 Oct 2026 (Omar Abouhussein approved the wording and the use of his name, title and company). */
/* First client testimonial. Wording approved 22 Oct 2026; the owner confirmed permission to use it on 23 Oct 2026. */
test('testimonial: shown once, in the proof strip after the hero, byte for byte from the approved record', () => {
  const T = JS.slice(JS.indexOf('var TESTIMONIALS = ['), JS.indexOf('}];', JS.indexOf('var TESTIMONIALS = [')) + 3);
  const field = (k) => (T.match(new RegExp(k + ": '([^']*)'")) || [])[1];
  const QUOTE = 'Callvix Solutions took the time to understand how we run our business. Their team answers our calls professionally, follows our booking rules, and enters customer details and appointments accurately in FieldRoutes. Setup was straightforward, and they’ve been easy to work with.';
  assert.equal(field('quote'), QUOTE);
  assert.equal(field('name'), 'Omar Abouhussein'); assert.equal(field('title'), 'Owner');
  assert.equal(field('company'), 'PestMaster of Naperville & Wheaton'); assert.equal(field('place'), 'IL');
  const bqs = [...HTML.matchAll(/<blockquote>([^<]*)<\/blockquote>/g)].map((m) => m[1]);
  assert.deepEqual(bqs, [QUOTE], 'exactly one quote on the page, identical to the record');
  assert.ok(!HTML.includes(field('excerpt')), 'the booking-section excerpt is gone');
  const strip = HTML.slice(HTML.indexOf('<section class="proof" id="proof"'), HTML.indexOf('</section>', HTML.indexOf('id="proof"')));
  assert.ok(HTML.indexOf('id="proof"') > HTML.indexOf('id="hero"') && HTML.indexOf('id="proof"') < HTML.indexOf('id="how-we-handle"'), 'directly after the hero');
  assert.ok(strip.includes('data-proof') && strip.includes('<span class="pf-who">Omar Abouhussein</span><span class="pf-co">Owner, PestMaster of Naperville&nbsp;&amp; Wheaton, IL</span>'), 'attribution unchanged');
  assert.ok(!/q-mark|<svg/.test(strip) && !/[“”"]/.test(bqs[0]), 'no oversized decorative quote marks, no typed quotes inside the text');
  assert.ok(!/label:/.test(T) && !/Founding client|Client since/i.test(JS + HTML), 'no label');
  assert.ok(!/result:|photo:/.test(T), 'no photo or result supplied');
  assert.ok(JS.includes("if (!SHOW_TESTIMONIALS) { $$('[data-proof]').forEach(function (n) { n.parentNode.removeChild(n); }); }"), 'kill switch removes the strip');
});

test('testimonial: no review or rating schema, stars, "trusted by", counts, discounts or free-call offers', () => {
  for (const m of HTML.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    assert.ok(!/"Review"|AggregateRating|ratingValue|reviewRating|"review"/.test(m[1]), 'no Review/AggregateRating JSON-LD');
  }
  assert.ok(!/★|☆|itemprop="rating|aggregateRating/i.test(HTML + JS + CSS), 'no star markup');
  assert.ok(!/trusted by|\d+\+? (?:pest control )?(?:clients|companies) (?:use|trust)/i.test(HTML + JS), 'no "Trusted by" or client counts');
  assert.ok(!/Omar|PestMaster/.test(HTML.slice(0, HTML.indexOf('<main'))), 'not in the header');
  for (const m of HTML.matchAll(/<figure class="proof-q"[\s\S]*?<\/figure>/g)) {
    const near = decode(m[0].replace(/<[^>]+>/g, ' '));
    assert.ok(!/client since|discount|% off|free calls?|free month|logo|★|rating/i.test(near), 'nothing beside the quote but the approved wording and attribution');
    assert.ok(!/<img|<picture/.test(m[0]), 'no portrait or logo');
  }
});

/* Testimonial design, owner-approved 22 Oct 2026: a review card above pricing, a smaller card in the booking section. */
test('visual system: gold only on booking buttons; navy only on hero, pricing, booking and footer', () => {
  const inline = HTML.match(/<style>([\s\S]*?)<\/style>/)[1];
  const all = (inline + '\n' + CSS).replace(/\/\*[\s\S]*?\*\//g, '');
  const ctaUse = [...all.matchAll(/([^{}]*)\{[^{}]*var\(--cta(?:-hover)?\)[^{}]*\}/g)].map((m) => m[1].trim());
  assert.deepEqual(ctaUse, ['.lp .btn--cta', '.lp .btn--cta:hover'], 'the gold token is used only by the booking button');
  assert.ok(!/gold|#f5b83d|#e9a41f|#e0a63c/i.test(all.replace(/--cta:#F5B83D;--cta-hover:#E9A41F;/, '')), 'no other gold anywhere');
  const navyBg = [...all.matchAll(/([^{}]*)\{[^{}]*background:var\(--navy-9[05]0\)[^{}]*\}/g)].map((m) => m[1].trim());
  assert.deepEqual(navyBg.filter((sel) => /\.(hero|sec|sec--[a-z]+|band|book|pricing|ftr)\b/.test(sel) && !/\.vid|hero-video|cmp/.test(sel)), ['.lp .hero', '.lp .sec--navy', '.lp .ftr'], 'navy bands: hero, .sec--navy, footer');
  const secs = Object.fromEntries([...HTML.matchAll(/<section class="([^"]+)" id="([^"]+)"/g)].map((m) => [m[2], m[1]]));
  assert.deepEqual(Object.keys(secs).filter((id) => /sec--navy/.test(secs[id])), ['pricing', 'book'], '.sec--navy only on pricing and booking');
  assert.deepEqual(Object.keys(secs).filter((id) => /sec--teal/.test(secs[id])), ['how-it-works'], 'setup on teal-100');
  assert.ok(['how-we-handle', 'video', 'faq'].every((id) => /sec--white/.test(secs[id])), 'the middle and the questions are white');
  assert.ok(HTML.includes('<section class="proof" id="proof"') && CSS.length && HTML.includes('.lp .proof{background:var(--teal-100);'), 'the proof strip is teal-100');
  assert.ok(/\.lp \.ftr\{background:var\(--navy-950\);[^}]*border-top:1px solid rgba\(255,255,255,\.08\)\}/.test(CSS), 'footer darker than the booking band, with a hairline');
  assert.ok(!/class="[^"]*\b(?:pill|chip-cloud|num-c|ic-circle)\b/.test(HTML.replace(/<form[\s\S]*?<\/form>/g, '')), 'no pills, chip clouds or numbered circles outside the callback form');
  assert.ok(!/@keyframes|animation:/.test(all.replace(/@keyframes lp-spin\{[^{}]*\{[^{}]*\}[^{}]*\}|animation:lp-spin[^;}]*/g, '')), 'no pulses or typing; only the calendar spinner animates');
  const eyebrows = [...HTML.matchAll(/<p class="eyebrow"[^>]*>/g)].length;
  assert.equal(eyebrows, 2, 'eyebrows only on the hero and pricing');
});

/* Colour pass, 22 Oct 2026: every text colour used on navy and on teal-100 clears WCAG AA, computed from the declared tokens. */
test('colour pass: on-navy and teal-100 text colours pass contrast; focus ring teal-300 on navy', () => {
  const root = HTML.match(/:root\{([^}]*)\}/)[1]; const tok = Object.fromEntries([...root.matchAll(/--([a-z0-9-]+):(#[0-9a-fA-F]{3,6})/g)].map((m) => [m[1], m[2].toLowerCase()]));
  assert.equal(tok['on-navy'], '#d6dbea'); assert.equal(tok['on-navy-2'], '#aeb6cf'); assert.equal(tok['navy-900'], '#101c4c'); assert.equal(tok['teal-300'], '#83d6df');
  assert.ok(!('cream' in tok) && !('teal-400' in tok), 'retired tokens are gone');
  const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  for (const [fg, bg] of [['#ffffff', 'navy-900'], ['on-navy', 'navy-900'], ['on-navy-2', 'navy-900'], ['teal-300', 'navy-900'], ['ink-900', 'teal-100'], ['ink-700', 'teal-100'], ['navy-900', 'teal-100'], ['teal-600', 'teal-100'], ['teal-600', '#ffffff']]) {
    const r = ratio(tok[fg] || fg, tok[bg] || bg); assert.ok(r >= 4.5, `${fg} on ${bg} is ${r.toFixed(2)}:1`);
  }
  assert.ok(ratio(tok['teal-500'], '#ffffff') < 3 && /\.lp \.pr-plus\{[^}]*color:var\(--teal-600\)/.test(CSS), 'the price "+" uses teal-600 because teal-500 on white fails 3:1');
  assert.ok(HTML.includes('.lp :focus-visible{outline:3px solid var(--teal-600);outline-offset:2px;border-radius:4px}') && HTML.includes('.lp .hero :focus-visible,.lp .sec--navy :focus-visible,.lp .ftr :focus-visible{outline-color:var(--teal-300)}'), 'focus ring: teal-600 on light, teal-300 on navy');
  assert.ok(/\.lp \.sec h2::before,\.lp \.sec-head \.eyebrow::before\{content:"";display:block;width:48px;height:4px;border-radius:2px;background:var\(--teal-500\);margin-bottom:16px\}/.test(CSS), '48×4 teal rule above section headings');
  assert.ok(/box-sizing:content-box;height:610px;padding:8px;background:#fff;border-radius:16px/.test(CSS), 'Calendly sits in an 8px white frame outside the height its handler sets');
});

/* Redesign, 22 Oct 2026: section order and the optional extras. */
/* Second pass, 22 Oct 2026: section order; old anchors still land. */
test('redesign: the page answers one buyer question per section, in decision order', () => {
  const ids = [...HTML.slice(HTML.indexOf('<main'), HTML.indexOf('</main>')).matchAll(/<section[^>]* id="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids, ['hero', 'proof', 'how-we-handle', 'video', 'pricing', 'how-it-works', 'faq', 'book']);
  assert.ok(HTML.indexOf('id="faqList"') > HTML.indexOf('id="faq"') && HTML.indexOf('<div class="more" id="details"') > HTML.indexOf('id="faqList"') && HTML.indexOf('id="details"') < HTML.indexOf('class="faq-more"'), 'practical questions first; calculator and comparison after them, within the section');
  for (const a of ['what-we-handle', 'sample-call', 'how-it-works', 'how-we-handle', 'details', 'rules', 'billing']) assert.equal((HTML.match(new RegExp(`id="${a}"`, 'g')) || []).length, 1, `#${a} still lands`);
  assert.ok(HTML.indexOf('id="pricing"') < HTML.indexOf('id="calculator"') && HTML.indexOf('id="pricing"') < HTML.indexOf('id="compare"'), 'price before the calculator and the comparison');
  assert.ok(/<details id="calculator">/.test(HTML) && /<details id="compare">/.test(HTML), 'calculator and comparison are optional, collapsed details');
  assert.ok(JS.includes("var d = hash && /^#(calculator|compare)$/.test(hash) ? $(hash) : null;") && JS.includes("if (d && d.tagName === 'DETAILS' && !d.open) d.open = true;"), 'links to #calculator / #compare open them');
  for (const id of ['heroCta', 'calcCta', 'cmp', 'calc', 'faqList', 'cal', 'cbForm', 'mbar', 'scLines', 'hoCard', 'proofQuote', 'heroIllus', 'lp-h1', 'lp-eyebrow', 'lp-sub', 'heroSecondaryLabel']) assert.ok(HTML.includes(`id="${id}"`), `hook kept: #${id}`);
  for (const c of ['hero', 'sample_call', 'pricing', 'how', 'calc', 'faq', 'header', 'mobile_bar', 'book_fallback', 'callback_success']) assert.ok(HTML.includes(`data-cta="${c}"`), `data-cta="${c}" kept`);
  const links = [...HTML.matchAll(/<a [^>]*href="#([a-z-]+)"/g)].map((m) => m[1]).filter((h) => h !== 'top');
  const missing = [...new Set(links)].filter((h) => !HTML.includes(`id="${h}"`)); assert.deepEqual(missing, [], 'every in-page link has a target');
  assert.ok(!/<img[^>]+assets\/photos\/|<source[^>]+assets\/photos\/|assets\/photos\//.test(HTML + CSS + JS), 'no photographs on the landing page');
  assert.ok(!/<picture>(?![\s\S]{0,120}(?:\/assets\/logo|\/assets\/video\/callvix-lp-poster))/.test(HTML), 'the only <picture> elements are the logo and the video poster');
  assert.ok(HTML.includes('<p class="book-after">Typically live <span class="nw">7–10</span> business days after we receive your setup details. You approve your call guide and we run test calls together before anything goes live.</p>'), 'booking: timing starts when the details arrive, not at the demo; 7–10 never splits');
  assert.ok(HTML.includes('<ul class="mini-trust"><li>No setup fee</li><li>Month-to-month</li></ul>') && !HTML.includes('Typical setup:'), 'booking: the setup time is said once, in the after-demo line');
  const addons = (CSS.match(/\n\.lp \.addons\{([^}]*)\}/) || [, ''])[1];
  assert.ok(addons && !/max-width/.test(addons) && /\.lp \.addons li::after\{content:"";order:1;flex:1 1 24px/.test(CSS) && /\.lp \.addons strong\{order:2\}/.test(CSS), 'add-on prices sit on the list\'s right edge after a dotted leader');
});

/* Revision 3, 24 Oct 2026: the broad billing statement names the spam exception everywhere; /pricing agrees with agreement v2
   (owner, 22 Oct: "The service agreement v2 is correct: wrong numbers are billed, clients cancel any time by email with service
   to month-end, and there's no pre-onboarding refund."). */
test('billing and cancelling read the same on the page, its JSON-LD and /pricing', () => {
  const ld = [...HTML.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const bill = ld.find((n) => n['@type'] === 'FAQPage').mainEntity.find((q) => q.name === 'What counts as a billable call?').acceptedAnswer.text;
  assert.ok(bill.startsWith('Answered inbound calls are $2.99 each, whatever their length, including wrong numbers and repeat calls. Spam and robocalls are excluded,'), 'FAQ (and its JSON-LD) names the exception in the broad statement');
  assert.ok(!/every inbound call (?:we|an agent) answer/i.test(decode(HTML)), 'no unqualified "every inbound call we answer"');
  const pricing = squash(decode(read('pricing.html').replace(/<[^>]+>/g, ' '))).replace(/&rsquo;/g, '’').replace(/&ndash;/g, '–');
  for (const t of ['Cancel any time by email; service continues to the end of that billing month, and part months aren’t refunded.',
    'Answered inbound calls are billed, including wrong numbers and repeat calls. Spam and robocalls, missed calls and hang-ups before we answer aren’t billed.',
    'Each invoice comes with an itemized record of billed calls.', 'Typically live 7–10 business days after we receive your details.']) assert.ok(pricing.includes(t), `/pricing: ${t}`);
  assert.ok(!/30 days’ notice|refunded in full|before onboarding starts|wrong numbers, missed calls/.test(pricing), '/pricing: no 30-days notice, pre-onboarding refund or unbilled wrong numbers');
  /* The weekly summary (service reporting) and the itemized billing record (agreement v2 §4) are different things: both are listed, separately. */
  const pr = HTML.slice(HTML.indexOf('id="pricing"'), HTML.indexOf('id="how-it-works"'));
  assert.ok(/<h3>Included<\/h3>[\s\S]*?<li>Weekly activity summary<\/li>/.test(pr) && /<div class="pr-bill"[\s\S]*Each invoice comes with an itemized record of billed calls\./.test(pr), 'weekly summary under Included; billing record in the billing strip');
});
