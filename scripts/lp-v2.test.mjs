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
    'The $399 monthly base stays fixed. Usage charges vary with your call volume.',
    'Mon–Fri, 9am–6pm, your time zone', 'No setup fee', 'Cancel with 30 days’ notice.']) {
    assert.ok(visible.includes(s), `missing: "${s}"`);
  }
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

test('the only statistic is the approved 78% figure, with no source line', () => {
  const pct = [...visible.matchAll(/\d+(?:\.\d+)?\s?%/g)].map((m) => m[0]);
  assert.deepEqual(pct, ['78%']);
  assert.ok(visible.includes('78% of surveyed U.S. consumers said an unanswered call had led them to take their business elsewhere.'));
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
  const calc = HTML.slice(HTML.indexOf('<section class="sec sec--white" id="calculator"'), HTML.indexOf('<section class="sec sec--navy" id="pricing"'));
  for (const s of ['$518.60', '$997', 'Cover the calls you miss', 'If we answer all your calls', '$399', '$2.99', 'Your estimate with', '$3,700', 'Add-ons']) assert.ok(!calc.includes(s), `calculator still contains "${s}"`);
  assert.match(calc, /<h2 id="calc-h">What are missed calls costing&nbsp;you\?<\/h2>/);
  assert.ok(calc.replace(/<[^>]+>/g, '').includes('See what it would cost you: book a 20-minute demo') && /href="#book" data-cta="calc" id="calcCta"/.test(calc), 'CTA scrolls to the calendar');
  assert.ok(calc.includes('A monthly scenario based on your numbers, not a forecast. Some callers may call back or book another way, and revenue isn’t profit.'), 'scenario caption');
  assert.ok(!/o-cost-|o-math-|PRICE\./.test(JS), 'no cost code left in the script');
  assert.ok(JS.includes("return 'Calls/month: ' + num0.format(calcState.calls) + ' · Miss rate: ' + calcState.miss + '%';"), 'Calendly a1 summary unchanged');
  /* Pricing keeps the published rates, the add-ons, the not-billed list and the billing link. */
  const pricing = HTML.slice(HTML.indexOf('id="pricing"'), HTML.indexOf('id="terms"'));
  for (const s of ['$399', '$2.99', '$0.99', 'The $399 monthly base stays fixed. Usage charges vary with your call volume.', 'Full billing detail', 'hang-ups before we answer', '+$199/mo', '+$149/mo', '+$99/mo']) assert.ok(pricing.replace(/&nbsp;/g, ' ').includes(s), s);
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
  /* lp.css (1 year) and lp.js (7 days) are cached: bump ?v= whenever either file changes. Current: lp.css v=6, lp.js v=5. */
  assert.ok(HTML.includes('/css/lp.css?v=6') && HTML.includes('/js/lp.js?v=5') && !/lp\.css\?v=5|lp\.js\?v=4/.test(HTML), 'asset versions bumped');
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

test('"hang-up" never appears without "before we answer" (page, /pricing, /faq)', () => {
  for (const f of ['pest-control-call-demo/index.html', 'pricing.html', 'faq.html']) {
    const t = squash(decode(read(f).replace(/<[^>]+>/g, ' '))).replace(/&rsquo;/g, '’');
    const bare = [...t.matchAll(/hang-ups?\b(?![^.]{0,4}before we answer)/gi)].map((m) => t.slice(Math.max(0, m.index - 40), m.index + 40));
    assert.deepEqual(bare, [], `${f}: bare "hang-up": ${bare.join(' | ')}`);
  }
  for (const s of ['Spam & wrong numbers aren’t billed', 'Spam & wrong numbers not billed']) assert.ok(visible.includes(s), s);
});

test('the brand reads "Callvix Solutions"; short "Callvix" only in tight UI', () => {
  assert.match(HTML, /<title>Pest Control Answering Service \| Real People, Booked Jobs \| Callvix Solutions<\/title>/);
  assert.match(HTML, /og:title" content="[^"]*\| Callvix Solutions">/); assert.match(HTML, /twitter:title" content="[^"]*\| Callvix Solutions">/);
  const ld = [...HTML.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  assert.equal(ld.find((n) => n['@type'] === 'Organization').name, 'Callvix Solutions');
  const faqText = JSON.stringify(ld.find((n) => n['@type'] === 'FAQPage'));
  assert.ok(!/Callvix(?! Solutions)/.test(faqText), 'FAQ schema uses the full name');
  /* Headings, body copy and FAQ: full name. Allowed short forms: the comparison column header,
     the hero call card, the forwarding diagram node, buttons and the logo alt text. */
  const body = HTML.slice(HTML.indexOf('<body'))
    .replace(/<script[\s\S]*?<\/script>/g, '').replace(/<th scope="col" class="c-cvx">Callvix<\/th>/, '')
    .replace(/<div class="callcard"[\s\S]*?<\/div>\n    <\/div>/, '').replace(/<li class="fwd-n fwd-n--teal">[\s\S]*?<\/li>/, '')
    .replace(/alt="Callvix Solutions"/g, '').replace(/<[^>]+>/g, ' ');
  const short = [...body.matchAll(/Callvix(?! Solutions)/g)].map((m) => body.slice(Math.max(0, m.index - 30), m.index + 30).replace(/\s+/g, ' '));
  assert.deepEqual(short, [], `short "Callvix" outside tight UI: ${short.join(' | ')}`);
  assert.ok(visible.includes('Callvix Solutions is a pest-control-only answering team.') && visible.includes('How Callvix Solutions compares'));
  assert.ok(visible.includes('Callvix Solutions (callvixsolutions.com) is not affiliated with callvix.com.'), 'non-affiliation line kept');
});

test('the calendar has a visible loading state and warms up early, off the critical path', () => {
  assert.ok(HTML.includes('id="calStatusText">Loading available times…</span>') && (HTML.match(/<div class="cs-grid">((?:<i><\/i>)+)<\/div>/) || [, ''])[1].length === 35 * 7, 'month-grid skeleton + spinner text');
  assert.ok(HTML.indexOf('class="cal-fb"') > HTML.indexOf('id="cal"'), 'new-tab link stays under the calendar');
  assert.ok(/window\.addEventListener\('scroll', warm, \{ passive: true \}\)/.test(JS) && JS.includes("requestIdleCallback(warm, { timeout: 3000 })") && JS.includes('setTimeout(warm, 3000)'), 'scroll / idle / 3 s triggers');
  assert.ok(!/<script[^>]+widget\.js/.test(HTML), 'Calendly script is not in the HTML (injected later)');
});

/* Conversion polish, 22 Oct 2026. */
test('polish: #team is gone, the hero H1 caps at 52px, and phones get the finished call card', () => {
  assert.ok(!/id="team"|href="#team"|team-h/.test(HTML) && !/\.team\b/.test(CSS) && !/#team\b/.test(JS), '#team section, links and styles removed');
  assert.ok(HTML.includes('.lp .hero h1{font-size:clamp(2.25rem,4.6vw + .5rem,3.25rem);'), 'H1 max 3.25rem (52px)');
  assert.ok(HTML.includes('@media (min-width:1024px){.lp .hero{padding:48px 0 56px}'), 'tighter desktop hero padding');
  const phone = HTML.match(/@media \(max-width:639px\)\{([^\n]*)\}\n/)[1];
  assert.ok(phone.includes('.js .lp .callcard .st{opacity:1;transform:none}') && phone.includes('.lp .callcard.play .st{animation:none}'), 'phone CSS shows the final card before JS runs');
  assert.ok(JS.includes("window.matchMedia('(max-width: 639px)').matches") && /if \(reduceMotion \|\| phone \|\| /.test(JS), 'JS skips the type-in under 640px');
});

test('polish: brand lockup, non-breaking phrases, label sizes and contrast', () => {
  const sub = '<span class="logo-sub" aria-hidden="true">Solutions</span></a>';
  assert.equal(HTML.split(sub).length - 1, 2, '"Solutions" wordmark in header and footer');
  assert.ok(HTML.includes('U.S.&nbsp;companies&nbsp;only</p>') && HTML.includes('· No&nbsp;setup&nbsp;fee ·'), 'eyebrow and price phrases kept together');
  /* The phone wordmark is the one exception: it is the logo's aria-hidden descriptor, sized to CALLVIX's width, not a label. */
  const small = [];
  for (const [name, src] of [['inline', HTML.match(/<style>([\s\S]*?)<\/style>/)[1]], ['lp.css', CSS]]) {
    for (const m of src.matchAll(/([^{}]*)\{[^{}]*font-size:([\d.]+)(px|rem)/g)) { const px = +m[2] * (m[3] === 'rem' ? 16 : 1); if (px < 12.5 && !m[1].trim().endsWith('.lp .logo-sub')) small.push(`${name} ${m[1].trim()} ${px}px`); }
  }
  assert.deepEqual(small, [], 'no label under 12.5px');
  const lum = (h) => { const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const green = HTML.match(/\.lp \.cc-top\{[^}]*color:#([0-9a-f]{6});/i)[1];
  assert.ok(1.05 / (lum(green) + 0.05) >= 4.5, `"Incoming call" #${green} must reach 4.5:1 on white`);
});

test('polish: the page has its own 1200x630 share image', () => {
  const url = 'https://callvixsolutions.com/assets/og-pest-control-call-demo.jpg';
  assert.ok(HTML.includes(`<meta property="og:image" content="${url}">`) && HTML.includes(`<meta name="twitter:image" content="${url}">`));
  const jpg = readFileSync(join(ROOT, 'assets/og-pest-control-call-demo.jpg'));
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
  map.default = decode(HTML.match(/<h1 id="lp-h1">(.*?)<\/h1>/)[1]);
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
    assert.ok(!(HTML + JS + SITE).includes(old), `still present: "${old}"`);
  }
  /* "Illustrative" is barred from this page only; /services keeps its own disclaimer (out of this pass's scope). */
  assert.ok(!/illustrative/i.test(HTML + JS + CSS), 'no "illustrative" on the landing page');
  assert.ok(!/7(?:–|&ndash;)10 days/.test(HTML + SITE), '"7–10 days" without "business"');
});

test('accuracy pass: timing, CRM qualifier, problem, scope and booking copy', () => {
  for (const t of ['Typically live in 7–10 business days.', 'Typically live 7–10 business days after we receive your details.', 'Typical setup: 7–10 business days',
    'Typically 7–10 business days after we receive your details. You fill in a setup questionnaire',
    'By text or email, or entered in your CRM with the $99/month add-on.', 'reach you by text or email, or are entered in your CRM with the $99/month add-on.',
    'When nobody picks up, many callers move on to the next company.', 'logged and sent to you unless your rules allow us to book it.',
    'handled within your instructions; anything outside them goes to you.', 'Unless you tell us to.', 'Bookings go where your office already works']) {
    assert.ok(visible.includes(t), `missing: "${t}"`);
  }
  const ld = [...HTML.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const start = ld.find((n) => n['@type'] === 'FAQPage').mainEntity.find((q) => q.name === 'How fast can we start?');
  assert.ok(start.acceptedAnswer.text.startsWith('Typically 7–10 business days after we receive your details.'));
  assert.ok(JS.includes("missed: 'Your office answers first; we handle overflow during your agreed coverage hours.'"));
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
  for (const r of ['A real person answers', 'Pest-control-only training', 'Books jobs by your rules', 'Priced per call, not per minute', 'Spam &amp; wrong numbers not billed']) {
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

test('accuracy pass: sample call names a text walkthrough; audio mode keeps its labels', () => {
  assert.ok(visible.includes('See how a sample call is handled.') && HTML.includes('<p class="sc-note" id="scNote">Sample call shown as text. Names and details are made up.</p>'));
  assert.ok(HTML.includes('id="scPlay" aria-label="Start text walkthrough">') && HTML.includes('<span class="sc-play-t">Start text walkthrough</span>'));
  assert.ok(JS.includes("var TEXT_LABELS = { start: 'Start text walkthrough', playing: 'Pause walkthrough', paused: 'Resume walkthrough', done: 'Replay walkthrough' };"));
  assert.ok(JS.includes("btn.setAttribute('aria-label', on ? 'Pause sample call' : 'Play sample call');") && JS.includes("if (mode === 'audio') $('.sc-play-t', btn).textContent = 'Play again';"), 'audio labels unchanged');
  assert.ok(CSS.includes('.lp .sc-player:not(.is-audio) .sc-time,.lp .sc-player:not(.is-audio) .seg{display:none}') && JS.includes("mode = 'audio'; player.classList.add('is-audio');"));
  assert.ok(JS.includes('var SAMPLE_CALL_AUDIO = false;'));
});

test('accuracy pass: phone service cards show their descriptions; the hero pulse runs twice', () => {
  assert.ok(!/\.cards6 p\{display:none\}/.test(CSS), 'descriptions no longer hidden on phones');
  for (const q of ['book from your approved slots.', 'Reschedule or note requests by your rules.', 'Quote only the services and prices you allow.']) assert.ok(visible.includes(q), q);
  assert.ok(HTML.includes('animation:lp-pulse 1.8s 2;') && !/lp-pulse[^;]*infinite/.test(HTML + CSS), 'pulse: 2 cycles, then static');
  assert.ok(HTML.includes('.lp .cc-dot{animation:none}}'), 'reduced motion still stops it');
  assert.ok(/sc-typing|lp-dot/.test(CSS) && /lp-dot[^;]*infinite/.test(CSS), 'typing indicator untouched');
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
