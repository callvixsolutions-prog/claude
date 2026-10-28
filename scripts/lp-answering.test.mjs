/**
 * The paid-traffic landing page /pest-control-answering-service/ and its calendar page /schedule/
 * (live 27 Oct 2026, built from review "Page B"), the lead endpoint send.php, and the 301s from the
 * retired landing pages. Every check names the section it looks in, so a string elsewhere can't pass it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const DIR = 'pest-control-answering-service';
const PAGE = read(`${DIR}/index.html`);
const SCHED = read(`${DIR}/schedule/index.html`);
const JS = read(`${DIR}/assets/cv3b.js`);
const SJS = read(`${DIR}/assets/schedule.js`);
const CSS = read(`${DIR}/assets/cv3b.css`);
const PHP = read(`${DIR}/send.php`);
const HTACCESS = read('.htaccess');
const head = (html) => html.slice(0, html.indexOf('</head>'));
const between = (html, a, b) => { const i = html.indexOf(a); assert.ok(i !== -1, 'missing ' + a); const j = html.indexOf(b, i); assert.ok(j !== -1, 'missing ' + b); return html.slice(i, j); };
const text = (html) => html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

test('both pages: noindex, canonical to themselves, not in sitemap.xml or llms.txt', () => {
  for (const [html, url] of [[PAGE, `https://callvixsolutions.com/${DIR}/`], [SCHED, `https://callvixsolutions.com/${DIR}/schedule/`]]) {
    assert.match(head(html), /<meta name="robots" content="noindex, nofollow">/);
    assert.ok(head(html).includes(`<link rel="canonical" href="${url}">`), url);
    assert.ok(!read('sitemap.xml').includes(url), `${url} must stay out of the sitemap`);
  }
  assert.ok(!read('sitemap.xml').includes(`/${DIR}/`) && !read('llms.txt').includes(`/${DIR}/`), 'the page path (with slashes; blog slugs share the words)');
});

test('no preview-only parts survive on the live pages', () => {
  for (const [name, src] of [['page', PAGE], ['schedule', SCHED], ['cv3b.js', JS], ['schedule.js', SJS], ['cv3b.css', CSS]]) {
    assert.doesNotMatch(src, /cv3b-review|cv3b-panel|cv3bReviewLog|review-state|data-cv3b-show-state|Review states|Content-Security-Policy|pest-control-discovery-v3|formspree/i, name);
  }
  assert.doesNotMatch(text(PAGE), /preview/i, 'no visible "preview" wording');
});

test('GTM: standard snippet, production host only, on both pages; the calendar guard runs before it', () => {
  for (const html of [PAGE, SCHED]) assert.ok(head(html).includes("'GTM-PJFS7HV5');</script>") && head(html).includes("location.hostname==='callvixsolutions'+'.com'"));
  const scripts = [...head(SCHED).matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.match(scripts[0], /sessionStorage\.getItem\('lead_ok'\)/, 'the guard is the first script');
  assert.match(scripts[1], /^if\(!window\.__cvxBounce&&location\.hostname===/, 'GTM is skipped on a bounced visit');
  assert.ok(head(SCHED).indexOf('<meta charset="utf-8">') < head(SCHED).indexOf('<script>'), 'charset stays in the first bytes');
});

/* Runs the calendar page's guard and then its GTM snippet, as the browser would. */
function visit(flag, hostname = 'callvixsolutions.com') {
  const store = new Map(flag ? [['lead_ok', flag]] : []);
  const replaced = []; const injected = [];
  const window = {};
  const ctx = {
    window, sessionStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), removeItem: (k) => store.delete(k) },
    location: { hostname, search: '?utm_source=google&utm_campaign=x', replace: (u) => replaced.push(u) },
    document: { getElementsByTagName: () => [{ parentNode: { insertBefore: (el) => injected.push(el.src) } }], createElement: () => ({}) },
  };
  ctx.window.__cvxBounce = undefined;
  vm.createContext(ctx);
  const scripts = [...head(SCHED).matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1].split('window.__cvxBounce').join('window.__cvxBounce'));
  vm.runInContext(scripts[0], ctx); vm.runInContext(scripts[1], ctx);
  return { replaced, injected, flagLeft: store.has('lead_ok') };
}
test('calendar guard: no flag = straight back to the landing page with no GTM; a valid visit clears the flag', () => {
  const direct = visit(null);
  assert.deepEqual(direct.replaced, [`/${DIR}/?utm_source=google&utm_campaign=x`]);
  assert.equal(direct.injected.length, 0, 'no GTM on a bounced visit');
  const valid = visit('1');
  assert.deepEqual(valid.replaced, []);
  assert.equal(valid.injected.length, 1, 'GTM loads on a valid visit');
  assert.equal(valid.flagLeft, false, 'the flag is cleared, so a refresh bounces');
  assert.equal(visit('1', 'localhost').injected.length, 0, 'no GTM off the production host');
});

test('booking buttons all lead to the form; steps line updated', () => {
  const ctas = [...PAGE.matchAll(/<a class="cv3b-btn[^"]*"(?: id="[^"]+")? href="#book" data-cv3b-book data-cta="([a-z_]+)">([^<]+)</g)].map((m) => [m[1], m[2].trim()]);
  assert.deepEqual(ctas.map((c) => c[0]), ['header', 'hero', 'strip', 'pricing', 'sticky_mobile']);
  for (const [, label] of ctas) assert.match(label, /^Book a (20-minute )?call$/);
  assert.match(JS, /lead\.scrollIntoView\(/); assert.match(JS, /firstField\.focus\(\{ preventScroll: true \}\)/);
  const steps = between(PAGE, '<ol class="cv3b-next"', '</ol>');
  assert.deepEqual(text(steps).split(/\s(?=\d )/), ['1 Your details', '2 Pick a time', '3 Talk for 20 minutes']);
});

test('lead form: plain HTML POST to send.php, four required single-line fields, honeypot, consent', () => {
  const card = between(PAGE, '<div class="cv3b-scheduler cv3b-lead" id="cv3b-lead">', '</form>');
  assert.match(card, /<h3 class="cv3b-scheduler__title" id="cv3b-lead-title">Book your 20-minute call<\/h3>/);
  assert.match(card, /<form class="cv3b-form" id="cv3b-form" action="\/pest-control-answering-service\/send\.php" method="POST"/);
  assert.doesNotMatch(card, /<form[^>]*novalidate/i, 'without JavaScript the browser still checks required fields');
  assert.doesNotMatch(card, /<select|<textarea/);
  const fields = [...card.matchAll(/<label class="cv3b-label" for="cv3b-(\w+)">([^<]+)<\/label>[\s\S]*?<input class="cv3b-input" id="cv3b-\1" name="(\w+)" ([^>]*)>/g)]
    .map((m) => ({ label: m[2], name: m[3], attrs: m[4] }));
  assert.deepEqual(fields.map((f) => [f.label, f.name]), [['Your name', 'name'], ['Business name', 'business'], ['Mobile number', 'phone'], ['Email', 'email']]);
  const want = { name: 'type="text" autocomplete="name"', business: 'type="text" autocomplete="organization"', phone: 'type="tel" autocomplete="tel" inputmode="tel"', email: 'type="email" autocomplete="email"' };
  for (const f of fields) { assert.ok(f.attrs.startsWith(want[f.name]), f.name); assert.match(f.attrs, / required /, f.name + ' required'); }
  assert.match(card, /<div class="cv3b-hp" aria-hidden="true"><label for="cv3b-website">[^<]+<\/label><input id="cv3b-website" name="website" type="text" tabindex="-1" autocomplete="off"><\/div>/);
  for (const k of ['page_url', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid']) assert.ok(card.includes(`<input type="hidden" name="${k}" value="">`), k);
  assert.match(card, /<button class="cv3b-btn cv3b-btn--block" id="cv3b-submit" type="submit">Continue to pick a time<\/button>/);
  assert.equal(text(between(card, '<p class="cv3b-consent">', '</p>')), 'By continuing, you agree we can call or text you about this request. See our Privacy Policy .');
  assert.match(card, /See our <a class="cv3b-link" href="\/privacy-policy">Privacy Policy<\/a>\./);
  assert.match(CSS, /\.cv3b-hp \{ position: absolute !important; left: -10000px;/);
  assert.match(CSS, /\.cv3b-receipt__tag \{ white-space: nowrap;/);
});

test('footers link the real Privacy and Terms pages', () => {
  for (const html of [PAGE, SCHED]) assert.match(between(html, '<ul class="cv3b-footer__links"', '</ul>'), /<a href="\/privacy-policy">Privacy<\/a><\/li>\s*<li><a href="\/terms">Terms<\/a>/);
  assert.ok(existsSync(join(ROOT, 'privacy-policy.html')) && existsSync(join(ROOT, 'terms.html')));
});

test('form script: background JSON send to send.php, one retry, generate_lead, session handoff without the URL', () => {
  assert.match(JS, /var ENDPOINT = '\/pest-control-answering-service\/send\.php';/);
  assert.match(JS, /keepalive: true/);
  assert.match(JS, /var SEND_WAIT_MS = 1200;/);
  assert.equal((JS.match(/post\(body\)\.catch\(function \(\) \{\}\);/g) || []).length, 2, 'exactly one background retry per failure path');
  for (const k of ['cvx_lead_first', 'cvx_lead_name', 'cvx_lead_email']) assert.match(JS, new RegExp(`store\\('${k}'`), k);
  assert.match(JS, /store\('lead_ok', '1'\);/);
  assert.match(JS, /record\('generate_lead', \{ cta_location: lastCta, event_id: p\.event_id \}/);
  assert.match(JS, /location\.assign\(SCHEDULE \+ utmQuery\(\)\)/);
  assert.match(JS, /var UTM = TRACKING\.slice\(0, 5\);/, 'only utm_* parameters are carried to the calendar page');
  assert.doesNotMatch(JS + SJS, /chris@|sales@|callvixsolutions@|callvixsupport\.com|noreply@/, 'no email address in page scripts');
  for (const ev of ["record('callvix_cta_click'", "record('callvix_booking_step'", "record('generate_lead'", "record('callvix_video_play')"]) assert.ok(JS.includes(ev), ev);
});

test('calendar page: greeting, Calendly inline embed with prefill and UTMs, details hidden, callback line, no nav', () => {
  assert.match(SCHED, /<h1 class="cv3b-schedule__title" id="cv3b-schedule-title" tabindex="-1">Thanks\. Pick a time for your 20-minute call\.<\/h1>/);
  assert.match(SJS, /'Thanks, ' \+ first \+ '\. Pick a time for your 20-minute call\.'/);
  assert.match(SJS, /var CALENDLY = 'https:\/\/calendly\.com\/callvixsolutions\/callvix-discovery-call';/);
  assert.match(SJS, /hide_event_type_details=1/);
  assert.match(SJS, /parentElement: holder, prefill: prefill, utm: utm/);
  assert.match(SJS, /case 'calendly\.page_height':/);
  assert.match(SJS, /record\('callvix_meeting_booked', \{ booking_method: 'calendly_embed', event_id: 'book\.' \+/);
  assert.equal(text(between(SCHED, '<p class="cv3b-schedule__later">', '</p>')), 'Can’t pick a time now? No problem. We’ll call you shortly during U.S. business hours.');
  const header = between(SCHED, '<header', '</header>');
  assert.doesNotMatch(header, /<nav|<a /, 'logo only, no nav links');
  assert.doesNotMatch(SCHED, /googletagmanager\.com\/ns\.html/, 'no noscript GTM: the guard needs JavaScript');
});

test('send.php: recipient, sender, reply-to, subject, JSON answer, spam limits, server-side checks', () => {
  assert.match(PHP, /return 'chris' \. '@' \. 'callvixsupport\.com';/);
  assert.doesNotMatch(PHP, /'sales' \. '@'/, 'the old sales@ recipient is gone');
  assert.ok(!/chris@|callvixsupport\.com/.test(PAGE + SCHED), 'the recipient is never in a page');
  assert.match(PHP, /const CVX_FROM_ADDRESS = 'noreply@callvixsolutions\.com';/);
  assert.match(PHP, /\$headers\[\] = 'Reply-To: ' \. \$replyTo;/);
  assert.match(PHP, /const CVX_SUBJECT_PREFIX = 'New landing page lead: ';/);
  assert.match(PHP, /CVX_SUBJECT_PREFIX \. \$business/);
  assert.match(PHP, /cvx_output\(200, \['ok' => true\]\);/);
  assert.match(PHP, /new DateTimeZone\('America\/New_York'\)/);
  for (const k of ['Name: ', 'Business: ', 'Phone: ', 'Email: ', 'Submitted: ', 'Page URL: ']) assert.ok(PHP.includes(`'${k}'`), k);
  assert.match(PHP, /const CVX_TRACKING_KEYS = \['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid'\];/);
  assert.match(PHP, /\$data\['website'\]/, 'honeypot name matches the page');
  assert.match(PHP, /const CVX_MAX_PER_HOUR = 5;/); assert.match(PHP, /cvx_rate_limited\(cvx_client_ip\(\)\)/);
  assert.match(PHP, /const CVX_ALLOWED_ORIGINS = \['https:\/\/callvixsolutions\.com'\];/);
  for (const f of ["'name'", "'business'", "'phone'", "'email'"]) assert.ok(PHP.includes(`$invalid[] = ${f};`), f);
  assert.match(PHP, /\$data = \$_POST;/, 'the no-JavaScript form post is accepted too');
  const code = PHP.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /formspree|password|api[_-]?key|EAA[A-Za-z0-9]{20,}/i, 'no form service and no secret or token in the code');
  assert.match(PHP, /const CVX_TRACKING_KEYS = \[[^\]]*'gclid', 'fbclid'\];/, 'fbclid reaches the lead email');
});

test('tracked-visit memory: first (90 days) and latest tagged visit reach the lead email, never reject a lead', () => {
  assert.match(JS, /var VISIT_DAYS = 90;/);
  assert.match(JS, /if \(!readVisit\('cvx_visit_first'\)\) writeVisit\('cvx_visit_first', v\);/, 'first visit is never overwritten while fresh');
  assert.match(JS, /writeVisit\('cvx_visit_latest', v\);/);
  assert.match(JS, /p\.first_visit = describeVisit\(readVisit\('cvx_visit_first'\)\);/);
  assert.match(JS, /p\.latest_visit = describeVisit\(readVisit\('cvx_visit_latest'\)\);/);
  assert.match(JS, /try \{ localStorage\.setItem/, 'blocked storage cannot break the form');
  assert.match(PHP, /\$firstVisit = cvx_line\(\$data\['first_visit'\] \?\? '', 1000\);/);
  assert.match(PHP, /'First tracked visit \(last 90 days\): ' \./);
  assert.match(PHP, /'Latest tracked visit: ' \./);
  assert.doesNotMatch(PHP, /\$invalid\[\] = '(first|latest)_visit'/, 'odd values never lose a lead');
  assert.match(PAGE, /assets\/cv3b\.js\?v=20261028c"/, 'cache-busted');
});

test('explainer video: unlisted YouTube (nocookie) on tap, self-hosted MP4 fallback, same tracking events', () => {
  assert.match(JS, /var YT_ID = 'nQgnjTaxi8A';/);
  assert.match(JS, /host: 'https:\/\/www\.youtube-nocookie\.com'/, 'privacy-enhanced player');
  assert.match(JS, /playsinline: 1/, 'plays inside the page on iPhone');
  assert.match(JS, /if \(facade\) facade\.addEventListener\('click', function \(\) \{ loadYouTube\(true\); \}\);/, 'a tap on our cover loads and starts the player');
  assert.match(JS, /entries\[0\]\.isIntersecting\) \{ near\.disconnect\(\); loadYouTube\(false\); \}[\s\S]{0,40}rootMargin: '600px 0px'/, 'one tap: the player loads, without playing, when the video is near the screen');
  assert.match(JS, /autoplay: autoplay \? 1 : 0/, 'never autoplays from scrolling');
  assert.ok(!/iframe_api/.test(PAGE), 'no YouTube script in the page HTML');
  assert.match(JS, /window\.setTimeout\(function \(\) \{ if \(!started\) showSelfHosted\(autoplay\); \}, 8000\)/, 'falls back when YouTube is slow');
  assert.match(JS, /if \(autoplay\) \{ var pl = v\.play\(\);/, 'the fallback MP4 only plays after a tap');
  const mp4 = JS.indexOf("VID + '.mp4\" type=\"video/mp4\"");
  const webm = JS.indexOf("VID + '.webm\" type=\"video/webm\"");
  assert.ok(mp4 > 0 && webm > mp4, 'fallback lists MP4 before WebM');
  assert.equal((JS.match(/record\('callvix_video_play'\)/g) || []).length, 1, 'one play event for both players');
  assert.match(JS, /if \(e\.data === 1\) \{\s*markPlay\(\);/, 'YouTube PLAYING state records the play');
  assert.match(JS, /e\.data === 0\) \{ progress\(50\); progress\(100\);/, 'YouTube ENDED records 50 and 100');
  assert.match(CSS, /\.cv3b-video__frame iframe \{ position: absolute; inset: 0;/);
  assert.match(JS, /onError: function \(\) \{ if \(frame\.contains\(holder\) \|\| frame\.querySelector\('iframe'\)\) showSelfHosted\(false\); \}/, 'a YouTube error (processing, removed) shows the MP4 instead');
});

test('send.php: Meta Conversions API is off without the server-only config, runs after the visitor has the answer', () => {
  assert.match(PHP, /const CVX_CONFIG_FILE = 'callvix-config\.php';/);
  assert.match(PHP, /\$file = dirname\(__DIR__, 2\) \. '\/' \. CVX_CONFIG_FILE;/, 'config lives above public_html');
  assert.ok(!existsSync(join(ROOT, 'callvix-config.php')) && !existsSync(join(ROOT, DIR, 'callvix-config.php')), 'no config file in the repository');
  const ok = PHP.indexOf("cvx_output(200, ['ok' => true]);"), finish = PHP.indexOf('litespeed_finish_request();'), meta = PHP.indexOf('$metaOk = cvx_meta_lead(');
  assert.ok(ok > 0 && ok < finish && finish < meta, 'answer, then finish the request, then Meta');
  assert.match(PHP, /if \(\$config !== \[\]\) \{/, 'nothing goes to Meta without the config');
  assert.match(PHP, /'event_name' => 'Lead'/); assert.match(PHP, /'action_source' => 'website'/);
  for (const k of ["'em' => [cvx_hash(", "'ph' => [cvx_hash('1' ."]) assert.ok(PHP.includes(k), k + ' hashed');
  assert.match(PHP, /preg_match\('\/\^lead\\\.\[a-z0-9\]\{6,12\}\\\.\[a-z0-9\]\{1,8\}\$\/', \$eventId\)/, 'the page event_id is reused for dedupe');
  assert.match(JS, /p\.event_id = 'lead\.' \+ Date\.now\(\)\.toString\(36\) \+ '\.' \+ Math\.random\(\)\.toString\(36\)\.slice\(2, 8\);/);
  assert.match(JS, /record\('generate_lead', \{ cta_location: lastCta, event_id: p\.event_id \}/, 'the same id goes to the dataLayer for the browser pixel');
  assert.match(JS, /record\('callvix_video_progress', \{ video_percent: String\(pct\) \}\)/);
});

test('video: Page B files in this folder, nothing loads before play, 9:16 cuts never referenced', () => {
  for (const f of ['callvix-lp-video.mp4', 'callvix-lp-video.webm', 'callvix-lp-video.vtt', 'callvix-lp-poster.jpg', 'callvix-lp-poster.webp']) assert.ok(existsSync(join(ROOT, DIR, 'assets/video', f)), f);
  assert.match(JS, /var VID = '\/pest-control-answering-service\/assets\/video\/callvix-lp-video';/);
  assert.match(JS, /v\.preload = 'none'/);
  assert.doesNotMatch(PAGE + JS + CSS, /9x16/);
  assert.match(text(between(PAGE, '<dl class="cv3b-terms">', '</dl>')), /Not billed Spam, robocalls and wrong numbers aren’t billed\./);
});

/* The retired landing pages: archived (git tag) and 301'd to the live page with the query string kept. */
test('retired landing pages: gone from the site, 301 to the live page in one hop, query string kept', () => {
  for (const dir of ['pest-control-call-demo', 'pest-control-call-demo-v1', 'pest-control-discovery-v3']) assert.ok(!existsSync(join(ROOT, dir)), dir);
  /* Each rule with the RewriteCond lines just above it (those only apply under their condition). */
  const rules = []; let conds = 0;
  for (const line of HTACCESS.split('\n')) {
    if (/^\s*RewriteCond /.test(line)) { conds++; continue; }
    const m = line.match(/^\s*RewriteRule (\S+)\s+(\S+)\s+\[([^\]]+)\]/);
    if (m) { rules.push({ re: new RegExp(m[1]), to: m[2], flags: m[3], conditional: conds > 0 }); conds = 0; }
  }
  const mine = rules.filter((r) => r.to === `/${DIR}/`);
  assert.equal(mine.length, 2);
  for (const r of mine) { assert.equal(r.flags, 'R=301,L'); assert.ok(!r.to.includes('?') && !/QSD/.test(r.flags), 'query string kept'); }
  /* First matching rule wins, the way mod_rewrite reads them (paths without the leading slash, as in .htaccess). */
  const first = (path) => rules.find((r) => !r.conditional && r.re.test(path));
  for (const p of ['pest-control-call-demo/', 'pest-control-call-demo', 'pest-control-call-demo/index.html', 'pest-control-call-demo-v1/', 'pest-control-call-demo-v1/index.html',
    'pest-control-discovery-v3/', 'pest-control-discovery-v3/b/', 'pest-control-discovery-v3/b/assets/cv3b.css']) assert.equal((first(p) || {}).to, `/${DIR}/`, p);
  for (const p of [`${DIR}/`, `${DIR}/schedule/`, `${DIR}/send.php`, 'pest-control-call-demos', 'pricing']) assert.notEqual((first(p) || {}).to, `/${DIR}/`, p);
  const at = (s) => HTACCESS.indexOf(s);
  assert.ok(at('^pest-control-call-demo(') < at('# 5. Remove trailing slash'), 'before the trailing-slash rule');
});
