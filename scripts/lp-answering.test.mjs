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
test('calendar guard: no flag = straight back to the landing page with no GTM; a valid visit keeps the flag (refresh stays)', () => {
  const direct = visit(null);
  assert.deepEqual(direct.replaced, [`/${DIR}/?utm_source=google&utm_campaign=x`]);
  assert.equal(direct.injected.length, 0, 'no GTM on a bounced visit');
  const valid = visit('1');
  assert.deepEqual(valid.replaced, []);
  assert.equal(valid.injected.length, 1, 'GTM loads on a valid visit');
  assert.equal(valid.flagLeft, true, 'the flag stays for this tab, so a refresh or back/forward keeps the calendar (29 Oct 2026)');
  assert.equal(visit('1').replaced.length, 0, 'a second visit in the same tab is let in too');
  assert.equal(visit('1', 'localhost').injected.length, 0, 'no GTM off the production host');
});

test('booking buttons all lead to the form; steps line updated', () => {
  const ctas = [...PAGE.matchAll(/<a class="cv3b-btn[^"]*"(?: id="[^"]+")? href="#book" data-cv3b-book data-cta="([a-z_]+)">([^<]+)</g)].map((m) => [m[1], m[2].trim()]);
  assert.deepEqual(ctas.map((c) => c[0]), ['header', 'hero', 'after_proof', 'strip', 'pricing', 'sticky_mobile']);
  for (const [, label] of ctas) assert.match(label, /^Book a (20-minute )?call$/);
  assert.match(JS, /lead\.scrollIntoView\(/); assert.match(JS, /firstField\.focus\(\{ preventScroll: true \}\)/);
  const steps = between(PAGE, '<ol class="cv3b-next"', '</ol>');
  assert.deepEqual(text(steps).split(/\s(?=\d )/), ['1 Your details', '2 Pick a time', '3 Talk for 20 minutes']);
});

test('lead form: plain HTML POST to send.php, four required single-line fields, honeypot, consent', () => {
  const card = between(PAGE, '<div class="cv3b-scheduler cv3b-lead" id="cv3b-lead">', '</form>');
  assert.match(card, /<h3 class="cv3b-scheduler__title" id="cv3b-lead-title" tabindex="-1">Book your 20-minute call<\/h3>/);
  assert.match(card, /<form class="cv3b-form" id="cv3b-form" action="\/pest-control-answering-service\/send\.php" method="POST"/);
  assert.doesNotMatch(card, /<form[^>]*novalidate/i, 'without JavaScript the browser still checks required fields');
  assert.doesNotMatch(card, /<select|<textarea/);
  const fields = [...card.matchAll(/<label class="cv3b-label" for="cv3b-(\w+)">([^<]+)<\/label>[\s\S]*?<input class="cv3b-input" id="cv3b-\1" name="(\w+)" ([^>]*)>/g)]
    .map((m) => ({ label: m[2], name: m[3], attrs: m[4] }));
  assert.deepEqual(fields.map((f) => [f.label, f.name]), [['Your name', 'name'], ['Business name', 'business'], ['Mobile number', 'phone'], ['Email', 'email']]);
  const want = { name: 'type="text" autocomplete="name"', business: 'type="text" autocomplete="organization"', phone: 'type="tel" autocomplete="tel" inputmode="tel"', email: 'type="email" autocomplete="email"' };
  for (const f of fields) { assert.ok(f.attrs.startsWith(want[f.name]), f.name); assert.match(f.attrs, / required /, f.name + ' required'); }
  assert.match(card, /<div class="cv3b-hp" aria-hidden="true"><label for="cv3b-website">[^<]+<\/label><input id="cv3b-website" name="website" type="text" tabindex="-1" autocomplete="off"><\/div>/);
  for (const k of ['page_url', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'gbraid', 'wbraid', 'fbclid']) assert.ok(card.includes(`<input type="hidden" name="${k}" value="">`), k);
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

test('form script: JSON send to send.php, lead counted only on "accepted", retries reuse the id, session handoff without the URL', () => {
  assert.match(JS, /var ENDPOINT = '\/pest-control-answering-service\/send\.php';/);
  assert.match(JS, /keepalive: true/);
  assert.doesNotMatch(JS, /SEND_WAIT_MS|finish\('pending'\)|finish\('retrying'\)/, 'no counting before the server answers');
  assert.match(JS, /var ATTEMPT_MS = 10000;/); assert.match(JS, /var RETRY_AFTER_MS = \[2000, 5000\];/);
  assert.match(JS, /if \(res\.status === 200 && j\.ok === true && j\.status === 'accepted' && j\.submission_id === p\.event_id\) return 'accepted';/);
  assert.match(JS, /if \(res\.status === 429\) return 'limited';/, '429 is never a success and never retried');
  const onAccepted = between(JS, "if (outcome === 'accepted') {", 'return;');
  assert.match(onAccepted, /store\('lead_ok', '1'\);[\s\S]*countLead\(p\);/, 'the calendar and the conversion only after "accepted"');
  assert.equal((JS.match(/countLead\(p\);/g) || []).length, 2, 'countLead: on accepted, and on a second press of an already-accepted submission');
  assert.match(JS, /if \(sub\.done\) \{ store\('lead_ok', '1'\); countLead\(p\); return; \}/);
  assert.match(JS, /if \(ids\.indexOf\(p\.event_id\) !== -1\) \{ window\.setTimeout\(goToCalendar, 0\); return; \}/, 'one conversion per submission id');
  assert.match(JS, /if \(!sub \|\| sub\.fp !== fp\) \{ sub = \{ id: newId\(\), fp: fp, done: false \};/, 'same details = same id; different details = a new submission');
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
  assert.match(PHP, /cvx_output\(200, \['ok' => true, 'status' => 'accepted', 'submission_id' => \$submissionId\]\);/);
  assert.match(PHP, /new DateTimeZone\('America\/New_York'\)/);
  for (const k of ['Name: ', 'Business: ', 'Phone: ', 'Email: ', 'Submitted: ', 'Page URL: ']) assert.ok(PHP.includes(`'${k}'`), k);
  assert.match(PHP, /const CVX_TRACKING_KEYS = \['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'gbraid', 'wbraid', 'fbclid'\];/);
  assert.match(PHP, /\$data\['website'\]/, 'honeypot name matches the page');
  assert.match(PHP, /const CVX_MAX_PER_HOUR = 5;/); assert.match(PHP, /cvx_rate_limited\(cvx_client_ip\(\)\)/);
  assert.match(PHP, /const CVX_ALLOWED_ORIGINS = \['https:\/\/callvixsolutions\.com'\];/);
  for (const f of ["'name'", "'business'", "'phone'", "'email'"]) assert.ok(PHP.includes(`$invalid[] = ${f};`), f);
  assert.match(PHP, /\$data = \$_POST;/, 'the no-JavaScript form post is accepted too');
  const code = PHP.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /formspree|password|api[_-]?key|EAA[A-Za-z0-9]{20,}/i, 'no form service and no secret or token in the code');
  assert.match(PHP, /const CVX_TRACKING_KEYS = \[[^\]]*'gclid', 'gbraid', 'wbraid', 'fbclid'\];/, 'gbraid, wbraid and fbclid reach the lead email');
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
  assert.match(PAGE, /assets\/cv3b\.js\?v=20261029b"/, 'cache-busted');
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
  assert.match(JS, /e\.data === 0\) \{\s*progress\(50\); progress\(100\);/, 'YouTube ENDED records 50 and 100');
  assert.match(JS, /showEndPanel\(function \(\) \{ try \{ p\.seekTo\(0\); p\.playVideo\(\); \}/, 'YouTube ENDED shows the booking panel');
  assert.match(JS, /data-cta="video_end"/);
  assert.match(JS, /showEndPanel\(function \(\) \{ v\.currentTime = 0; v\.play\(\); \}\)/, 'backup MP4 ended shows the booking panel too');
  assert.match(CSS, /\.cv3b-video__frame iframe \{ position: absolute; inset: 0;/);
  assert.match(JS, /onError: function \(\) \{ if \(frame\.contains\(holder\) \|\| frame\.querySelector\('iframe'\)\) showSelfHosted\(false\); \}/, 'a YouTube error (processing, removed) shows the MP4 instead');
});

test('send.php: Meta Conversions API is off without the server-only config, runs after the visitor has the answer', () => {
  assert.match(PHP, /const CVX_CONFIG_FILE = 'callvix-config\.php';/);
  assert.match(PHP, /\$file = dirname\(__DIR__, 2\) \. '\/' \. CVX_CONFIG_FILE;/, 'config lives above public_html');
  assert.ok(!existsSync(join(ROOT, 'callvix-config.php')) && !existsSync(join(ROOT, DIR, 'callvix-config.php')), 'no config file in the repository');
  const ok = PHP.indexOf("cvx_output(200, ['ok' => true, 'status' => 'accepted'"), finish = PHP.indexOf('litespeed_finish_request();'), meta = PHP.indexOf('$metaOk = cvx_meta_lead(');
  assert.ok(ok > 0 && ok < finish && finish < meta, 'answer, then finish the request, then Meta');
  assert.match(PHP, /if \(\$config !== \[\] && \$tracking\['utm_campaign'\] !== 'test-lead-ignore'\) \{/, 'nothing goes to Meta without the config, or for our own test leads');
  assert.match(PHP, /'event_name' => 'Lead'/); assert.match(PHP, /'action_source' => 'website'/);
  for (const k of ["'em' => [cvx_hash(", "'ph' => [cvx_hash('1' ."]) assert.ok(PHP.includes(k), k + ' hashed');
  assert.match(PHP, /\$eventId = \$submissionId;/, 'the page submission id is the Meta event id');
  assert.match(JS, /function newId\(\) \{ return 'lead\.' \+ Date\.now\(\)\.toString\(36\) \+ '\.' \+ Math\.random\(\)\.toString\(36\)\.slice\(2, 8\); \}/);
  assert.match(JS, /p\.event_id = id;/);
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

test('trim (28 Oct 2026): Omar quote under the hero button, video right after "Why it matters", bottom bar never doubles a visible button', () => {
  const hero = between(PAGE, '<div class="cv3b-hero__cta">', '<figure class="cv3b-hero__visual">');
  assert.match(hero, /<figure class="cv3b-hero__quote">\s*<blockquote>“Their team answers our calls professionally, follows our booking rules… Setup was straightforward\.”<\/blockquote>/);
  assert.match(hero, /<strong>Omar Abouhussein<\/strong>, Owner, PestMaster of Naperville &amp; Wheaton, IL/);
  assert.ok(PAGE.includes('enters customer details and appointments accurately in FieldRoutes'), 'the full testimonial stays, word for word');
  const watch = between(PAGE, 'id="watch"', '</section>');
  assert.match(watch, /<div class="cv3b-wrap" id="cv3b-video-slot"><\/div>/, 'video has its own section');
  assert.ok(PAGE.indexOf('id="problem"') < PAGE.indexOf('id="watch"') && PAGE.indexOf('id="watch"') < PAGE.indexOf('id="proof"'), 'order: Why it matters, video, testimonial');
  assert.match(PAGE, /<h2 class="cv3b-h2" id="cv3b-video-title">See how that call gets answered and booked<\/h2>/);
  assert.match(JS, /slot\.appendChild\(vtpl\.content\.cloneNode\(true\)\);/);
  assert.doesNotMatch(PAGE, /cv3b-handoff|cv3b-problem__more/, 'repeated blocks removed');
  assert.match(PAGE, /approved availability\. Booking is part of the base service\./);
  assert.match(JS, /!typing && otherCtaVisible === 0;/, 'bottom bar hides while another booking button is visible');
});

/* Owner decision 29 Oct 2026: wrong numbers are not billed. The landing page, the pricing page FAQ
   (visible answer and its FAQPage JSON-LD) and the video transcript must all say so. */
test('billing: wrong numbers are not billed on the landing page, the pricing page and the video transcript', () => {
  const PRICING = read('pricing.html');
  const visible = text(between(PRICING, '<h3>What counts as a billable call?</h3>', '</p>'));
  assert.match(visible, /including repeat calls\. Spam, robocalls and wrong numbers aren(’|&rsquo;)t billed/);
  const ld = between(PRICING, '"name": "What counts as a billable call?"', 'itemized record of billed calls."');
  assert.match(ld, /including repeat calls\. Spam, robocalls and wrong numbers aren’t billed/);
  for (const [name, src] of [['pricing visible', visible], ['pricing JSON-LD', ld], ['landing page', text(PAGE)]]) {
    assert.doesNotMatch(src, /including wrong numbers/i, name + ' must not bill wrong numbers');
  }
  assert.match(read(`${DIR}/assets/video/callvix-lp-video-transcript.txt`), /Spam and wrong numbers are never billed\./);
});

/* Owner-approved version C (29 Oct 2026): "Why it matters" sets up the call, the video answers it. */
test('why it matters (version C): heading beside the 78%, three moments, "With Callvix Solutions" pointing to the video', () => {
  const why = between(PAGE, 'id="problem"', '</section>');
  const top = between(why, '<div class="cv3b-why__top">', '<ol class="cv3b-why__moments"');
  assert.match(text(top), /^Why it matters When your team is busy, new callers still need an answer\. You work hard to bring inquiries to your business\. When a caller cannot get help, that opportunity may go elsewhere\. 78% of surveyed U\.S\. consumers said an unanswered call had led them to take their business elsewhere\. Source: CallRail, 2025 survey of 1,000 U\.S\. consumers\.$/);
  const moments = between(why, '<ol class="cv3b-why__moments"', '</ol>');
  assert.deepEqual([...moments.matchAll(/<li class="cv3b-why__moment">[\s\S]*?<\/li>/g)].map((m) => text(m[0])),
    ['Your technicians are on a job.', 'Your office is already helping another caller.', 'A new prospect reaches voicemail or waits for a callback.']);
  assert.match(why, /<p class="cv3b-why__turn"><span>With Callvix Solutions<\/span><svg class="cv3b-ico" aria-hidden="true" focusable="false"><use href="#i-arrow"\/><\/svg><\/p>\s*<\/div>\s*$/, 'the arrow closes the section');
  const head = between(PAGE, '<div class="cv3b-head cv3b-head--center cv3b-watch__head">', '<div class="cv3b-video__frame"');
  assert.equal(text(head), 'See it in action See how that call gets answered and booked A one-minute example: Callvix Solutions answers using your approved information and helps the caller take the next step, alongside the team you already have.');
  assert.doesNotMatch(PAGE, /class="[^"]*\bcv3b-(problem|flow|moment|stat)/, 'old section markup gone');
  assert.doesNotMatch(CSS, /\.cv3b-(problem|flow|moment|stat)/, 'old section styles gone');
  assert.match(CSS, /\.cv3b-why__moments \{ display: grid; grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
  assert.match(PAGE, /assets\/cv3b\.css\?v=20261031c"/, 'cache-busted');
  assert.match(SCHED, /assets\/cv3b\.css\?v=20261031c"/, 'schedule page shares the stylesheet');
});

/* Owner-approved 29 Oct 2026: send.php keeps a private lead record and recognises a repeated submission. */
test('send.php: private lead record above public_html, repeat = accepted again without a second email, rate limit counts new leads only', () => {
  assert.match(PHP, /const CVX_LEAD_DIR = 'callvix-leads';/); assert.match(PHP, /const CVX_LEAD_KEEP_MONTHS = 12;/);
  assert.match(PHP, /return defined\('CVX_TEST_DATA_DIR'\) \? \(string\) constant\('CVX_TEST_DATA_DIR'\) : dirname\(__DIR__, 2\);/, 'records live next to public_html');
  assert.match(PHP, /@mkdir\(\$dir, 0700, true\)/); assert.match(PHP, /@chmod\(\$file, 0600\);/);
  const order = ['$lock = cvx_store_lock();', 'cvx_already_accepted($submissionId)', 'if (cvx_rate_limited(cvx_client_ip())) {', '$sent = cvx_send_mail(', '$stored = cvx_store_append([', 'cvx_store_unlock($lock);\n}', "cvx_output(200, ['ok' => true, 'status' => 'accepted'"];
  const at = order.map((k) => PHP.indexOf(k));
  assert.ok(at.every((v, i) => v > 0 && (i === 0 || v > at[i - 1])), 'lock, repeat check, rate limit, mail, record, unlock, answer: ' + JSON.stringify(at));
  assert.ok(PHP.indexOf("cvx_respond(400, ['ok' => false, 'error' => 'rejected']);") < PHP.indexOf('if (cvx_rate_limited('), 'spam rejects come before (and never count towards) the rate limit');
  assert.match(PHP, /'submission_id' => \$submissionId,\n\s+'mail_sent' => \$sent === true,/, 'record keys in the order the repeat check reads');
  assert.match(PHP, /\$needle = '\{"submission_id":"' \. \$id \. '","mail_sent":true,';/);
  assert.match(PHP, /\$lines\[\] = 'Lead ID: ' \. \$submissionId;/);
  assert.match(PHP, /if \(defined\('CVX_TEST_MAIL_FILE'\)\) \{/, 'the test mail hook is switched on by a constant only');
  assert.doesNotMatch(PHP, /\$_(GET|POST|REQUEST|COOKIE)\[['"]CVX_TEST/, 'never from a request');
  assert.ok(!existsSync(join(ROOT, 'callvix-leads')) && !existsSync(join(ROOT, DIR, 'callvix-leads')), 'no lead records in the repository');
});

test('privacy policy: backup copy of landing-page requests on the web host, kept up to 12 months', () => {
  const pp = text(read('privacy-policy.html').replace(/<script[\s\S]*?<\/script>/g, ''));
  assert.match(pp, /keeps a private backup copy of each landing-page booking-form request/);
  assert.match(pp, /The backup copy of a landing-page booking-form request is kept on our web host, out of public reach, for up to 12 months and then deleted\./);
  assert.match(pp, /Effective date: October 29, 2026/);
});

/* Clarity pass (preview 29 Oct 2026): next step inside the form card, 78% source, booking vs CRM entry, video = example. */
test('clarity pass: form says what happens next, 78% has its source, booking vs CRM is stated in pricing and the FAQ', () => {
  const card = between(PAGE, '<div class="cv3b-scheduler cv3b-lead" id="cv3b-lead">', '<div class="cv3b-field">');
  assert.match(card, /<h3 class="cv3b-scheduler__title" id="cv3b-lead-title" tabindex="-1">Book your 20-minute call<\/h3>\s*<p class="cv3b-scheduler__intro" id="cv3b-lead-intro">Enter your details, then choose a time for your 20-minute call\.<\/p>\s*<!--/);
  assert.match(card, /aria-labelledby="cv3b-lead-title" aria-describedby="cv3b-lead-intro">/);
  const stat = between(PAGE, '<p class="cv3b-why__stat">', '</p>');
  assert.match(stat, /<span class="cv3b-why__stat-source">Source: CallRail, 2025 survey of 1,000 U\.S\. consumers\.<\/span>$/);
  assert.doesNotMatch(stat, /<a /, 'plain text, no link off the page');
  const terms = text(between(PAGE, '<dl class="cv3b-terms">', '</dl>'));
  assert.match(terms, /^Booking Included in the base plan: booking details reach your office by text or email\. Direct CRM entry \(\+\$99\/month\) is for when you want a person to enter them in your system for you\. Not billed /);
  const faq = text(between(PAGE, 'Can you work with our scheduling or CRM system?', '</details>'));
  assert.match(faq, /^Can you work with our scheduling or CRM system\? Booking is part of every plan, and booking details reach your office by text or email\. If you want them entered in your system too, Direct CRM entry is an optional \$99\/month add-on/);
  assert.match(faq, /It isn’t a native integration or automatic sync/, 'no integration claim');
  assert.doesNotMatch(PAGE, /Here&rsquo;s that call, answered by a real person|illustrative/i, 'the video is called an example, never a real call or "illustrative"');
  assert.match(CSS, /\.cv3b-terms > div:first-child \{ grid-column: 1 \/ -1; \}/);
});

/* Feedback pass (29 Oct 2026): "Still sending" after 4 s of silence; no keyboard pop-up on phones after a CTA tap. */
test('feedback pass: slow answers show "Still sending" after 4 s; touch devices focus the form title, not a field', () => {
  assert.match(JS, /var SLOW_MS = 4000;/);
  const sending = between(JS, "submit.textContent = 'Sending…';", "if (outcome === 'accepted')");
  assert.match(sending, /var slowTimer = window\.setTimeout\(slow, SLOW_MS\);/);
  assert.match(sending, /sendLead\(p, slow\)\.then\(function \(outcome\) \{\s*window\.clearTimeout\(slowTimer\);/, 'the timer is cleared on every outcome');
  assert.match(JS, /var touchOnly = !!\(window\.matchMedia && window\.matchMedia\('\(hover: none\) and \(pointer: coarse\)'\)\.matches\);/);
  assert.match(JS, /if \(touchOnly && leadTitle\) leadTitle\.focus\(\{ preventScroll: true \}\);\s*else if \(firstField\) firstField\.focus\(\{ preventScroll: true \}\);/);
});

/* OpenAI (ChatGPT Ads) Measurement Pixel disclosure (29 Oct 2026). The pixel itself lives in GTM, never in the page source. */
test('privacy policy discloses the OpenAI pixel in the processor table, cookies and advertising sections; no hardcoded pixel', () => {
  const PP = read('privacy-policy.html');
  const table = between(PP, '<h2>Third-party services (data processors)</h2>', '</table>');
  const rows = table.match(/<tr><td>OpenAI Ads Measurement Pixel \(ads in ChatGPT\)<\/td>/g) || [];
  assert.equal(rows.length, 1, 'exactly one OpenAI row');
  assert.match(table, /<\/td><\/tr>\s*<tr><td>OpenAI Ads Measurement Pixel \(ads in ChatGPT\)<\/td><td>Measuring which of our ads in ChatGPT lead to visits, inquiries and booked calls\. It keeps the ad-click reference from the ad link for 30 days and a random browser reference for up to 12 months, in cookies on this website<\/td><td><a href="https:\/\/openai\.com\/policies\/privacy-policy\/" rel="noopener">openai\.com<\/a><\/td><\/tr>\s*<tr><td>YouTube/, 'after Meta, before YouTube');
  const cookies = text(between(PP, '<h2>Cookies and analytics</h2>', '<h2>Advertising and remarketing</h2>'));
  assert.match(cookies, /through Google Tag Manager, Google Analytics 4, Microsoft Clarity, Google Ads, Meta and OpenAI to understand site usage/);
  const ads = text(between(PP, '<h2>Advertising and remarketing</h2>', '<h2>Data retention</h2>'));
  assert.match(ads, /^Advertising and remarketing We advertise with Google Ads, Meta \(Facebook and Instagram\) and OpenAI \(ads in ChatGPT\)\./);
  assert.match(ads, /We use OpenAI&rsquo;s pixel only to measure which of our ChatGPT ads lead to visits, inquiries and booked calls;/);
  assert.match(ads, /with Google, Meta and OpenAI in hashed \(one-way encrypted\) form/);
  assert.match(ads, /in ChatGPT you can turn off ad personalization under Settings &gt; Ad controls \(see help\.openai\.com \);/);
  for (const f of ['index.html', 'contact.html', 'privacy-policy.html', `${DIR}/index.html`, `${DIR}/schedule/index.html`]) assert.doesNotMatch(read(f), /oaiq|bzrcdn\.openai\.com/, f + ' must not hardcode the pixel (GTM loads it)');
});

test('type and spacing fine-tune (31 Oct 2026): rules sit after the clarity pass and set the approved values', () => {
  const tune = CSS.slice(CSS.indexOf('/* ---------------- type and spacing fine-tune'));
  assert.ok(CSS.indexOf('/* ---------------- type and spacing fine-tune') > CSS.indexOf('/* ---------------- clarity pass'), 'last block in the file, so it wins the cascade');
  assert.match(tune, /\.cv3b-h1 \{ letter-spacing: -0\.025em; \}/);
  assert.match(tune, /\.cv3b-h2 \{ letter-spacing: -0\.024em; \}/);
  assert.match(tune, /\.cv3b-trained__note,\s*\[data-callvix-v3b\] \.cv3b-addons__desc,\s*\[data-callvix-v3b\] \.cv3b-terms dd,\s*\[data-callvix-v3b\] \.cv3b-book__qualifier,\s*\[data-callvix-v3b\] \.cv3b-consent \{ font-size: 15px; line-height: 1\.6; \}/);
  assert.match(tune, /\.cv3b-trained__note \{ max-width: 68ch; \}/);
  assert.match(tune, /\.cv3b-head \{ margin-bottom: 52px; \}/);
  const phone = between(tune, '@media (max-width: 600px) {', '\n}');
  assert.match(phone, /--cv3b-section-y: 56px;/);
  assert.match(phone, /\.cv3b-head \{ margin-bottom: 30px; \}/);
  assert.doesNotMatch(tune, /\.cv3b-pill \{ font-size: 14px/, 'the 14px phone pill wrapped to two lines and was dropped');
  assert.doesNotMatch(tune, /\.cv3b-track__label \{ font-size: 13px/, '13px step labels wrapped and were dropped');
});

test('phone pricing link (31 Oct 2026): "View pricing" sits right under the hero CTA line, points at #pricing, shown only below 768px', () => {
  const cta = between(PAGE, '<div class="cv3b-hero__cta">', '<figure class="cv3b-hero__quote">');
  assert.match(cta, /id="cv3b-hero-cta"[\s\S]*<p class="cv3b-hero__micro">[^<]*<\/p>\s*<a class="cv3b-hero__pricing" href="#pricing">View pricing<svg/, 'after the booking CTA and its line, so the CTA does not move');
  assert.equal((PAGE.match(/class="cv3b-hero__pricing"/g) || []).length, 1);
  assert.ok(PAGE.includes('<section class="cv3b-section cv3b-section--navy" id="pricing"') || /<section[^>]*id="pricing"/.test(PAGE), '#pricing target exists');
  const block = CSS.slice(CSS.indexOf('/* ---------------- phone pricing link'));
  assert.match(block, /\.cv3b-hero__pricing \{ display: none; \}\s*@media \(max-width: 767px\) \{\s*\[data-callvix-v3b\] \.cv3b-hero__pricing \{ display: inline-flex;[^}]*min-height: 44px;/);
});

test('calendar page booked state (31 Oct 2026): says "You’re booked", moves to step 3, and a refresh shows that instead of the calendar; booking still counted once', () => {
  assert.match(SCHED, /assets\/schedule\.js\?v=20261031a"/, 'schedule.js cache-busted');
  const panel = between(SCHED, '<div class="cv3b-booked" id="cv3b-booked" hidden>', '</div>');
  assert.match(panel, /Your calendar invite is on its way to your email, with the time and how to join the call\./);
  assert.match(panel, /Need a different time\? Use the reschedule link in that email\./);
  assert.ok(SCHED.indexOf('id="cv3b-booked"') > SCHED.indexOf('id="cv3b-cal"') && SCHED.indexOf('id="cv3b-booked"') < SCHED.indexOf('class="cv3b-schedule__later"'), 'between the calendar and the "later" line');
  assert.match(SJS, /var booked = stored\('cvx_lp_booked'\) === '1';/);
  assert.match(SJS, /title\.textContent = first \? 'You\\u2019re booked, ' \+ first \+ '\.' : 'You\\u2019re booked\.';/);
  assert.match(SJS, /steps\[2\]\.className = 'is-current'; steps\[2\]\.setAttribute\('aria-current', 'step'\);/);
  assert.match(SJS, /if \(booked\) showBooked\(\);\s*else \{\s*var s = doc\.createElement\('script'\);/, 'a refresh after booking does not load Calendly again');
  assert.match(SJS, /if \(ready \|\| booked\) return;/, 'no "calendar didn’t load" message once booked');
  // tracking lines unchanged: the UI line sits before the existing dedupe + record
  assert.match(SJS, /case 'calendly\.event_scheduled':\n        booked = true; showBooked\(\);\n        if \(alreadyCounted\(bookingKey\(d\.payload\)\)\) return;\n        record\('callvix_meeting_booked', \{ booking_method: 'calendly_embed', event_id: 'book\.' \+ Date\.now\(\)\.toString\(36\) \+ '\.' \+ Math\.random\(\)\.toString\(36\)\.slice\(2, 8\) \}\);\n        break;/);
  assert.equal((SJS.match(/record\('callvix_meeting_booked'/g) || []).length, 1);
});
