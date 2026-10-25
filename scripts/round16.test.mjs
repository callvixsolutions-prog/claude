/**
 * Round 16: completed bookings on the main site.
 *
 * js/main.js opens Calendly's popup for a booking link and turns Calendly's
 * confirmation message into callvix_meeting_booked. These tests run the real
 * file in a stub page — no browser, no network — and hold the properties that
 * matter: one event per booking, only from Calendly, nothing personal in it,
 * never on the campaign page, and the visitor can always still book.
 * Run with `npm test`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = readFileSync(join(ROOT, 'js/main.js'), 'utf8');
const LP = readFileSync(join(ROOT, 'js/lp-booking.js'), 'utf8');
const BOOKING = 'https://calendly.com/callvixsolutions/callvix-discovery-call';

/** A page with just enough DOM for main.js to run. */
function page({ path = '/', campaign = false, storage = new Map() } = {}) {
  const listeners = { document: {}, window: {} };
  const on = (bag) => (type, fn) => { (bag[type] ||= []).push(fn); };
  const injected = []; const timers = [];
  const win = {
    dataLayer: [], location: { pathname: path, href: 'https://callvixsolutions.com' + path },
    addEventListener: on(listeners.window),
    sessionStorage: { getItem: (k) => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) },
  };
  const doc = {
    addEventListener: on(listeners.document),
    querySelector: (sel) => (campaign && sel.includes('.calendly-inline-widget') ? {} : null),
    querySelectorAll: () => [],
    createElement: (tag) => ({ tag, setAttribute() {} }),
    head: { appendChild: (el) => { injected.push(el); } }, body: {},
  };
  const ctx = vm.createContext({ window: win, document: doc, sessionStorage: win.sessionStorage, setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, Date, JSON, Object, String, Math, URLSearchParams });
  vm.runInContext(SRC, ctx);
  const fire = (target, type, ev) => (listeners[target][type] || []).forEach((fn) => fn(ev));
  const message = (origin, data) => fire('window', 'message', { origin, data });
  const link = (href, { cta = 'hero_primary', zone = '.hero' } = {}) => {
    const a = { href, attrs: {}, getAttribute: (n) => (n === 'href' ? href : n === 'data-cta-location' ? cta : null), setAttribute(n, v) { this.attrs[n] = v; }, removeAttribute(n) { delete this.attrs[n]; }, focus() { this.focused = true; } };
    a.closest = (sel) => (sel === 'a[href]' ? a : sel === '[data-cta-location]' ? (cta ? a : null) : sel.includes(zone) ? {} : null);
    return a;
  };
  const click = (a, mods = {}) => { const ev = { target: a, button: 0, defaultPrevented: false, prevented: false, preventDefault() { this.prevented = true; }, ...mods }; fire('document', 'click', ev); return ev; };
  return { win, storage, injected, timers, message, link, click, events: (name) => win.dataLayer.filter((e) => e.event === name) };
}
const scheduled = (n = 1) => ({ event: 'calendly.event_scheduled', payload: { event: { uri: `https://api.calendly.com/scheduled_events/EVT${n}` }, invitee: { uri: `https://api.calendly.com/scheduled_events/EVT${n}/invitees/INV${n}` } } });
/** Click a booking link and let Calendly's script "load". */
function openPopup(p, opts) {
  const a = p.link(BOOKING + '?utm_source=callvixsolutions.com&cta_location=home_hero', opts);
  p.click(a);
  const script = p.injected.find((el) => el.tag === 'script');
  let opened = null; p.win.Calendly = { initPopupWidget: (o) => { opened = o.url; }, closePopupWidget() {} };
  script.onload();
  return { a, opened: () => opened };
}

test('a Calendly confirmation becomes exactly one callvix_meeting_booked', () => {
  const p = page({ path: '/pricing' }); openPopup(p, { cta: 'pricing', zone: '.none' });
  p.message('https://calendly.com', scheduled());
  assert.deepEqual(JSON.parse(JSON.stringify(p.events('callvix_meeting_booked'))),
    [{ event: 'callvix_meeting_booked', page_path: '/pricing', cta_location: 'pricing', booking_method: 'calendly_popup' }]);
  /* Engagement messages are not bookings. */
  for (const ev of ['calendly.event_type_viewed', 'calendly.date_and_time_selected', 'calendly.page_height', 'calendly.profile_page_viewed']) p.message('https://calendly.com', { event: ev, payload: {} });
  assert.equal(p.events('callvix_meeting_booked').length, 1);
});

test('the same message from any other origin produces nothing', () => {
  const p = page(); openPopup(p);
  for (const origin of ['https://callvixsolutions.com', 'https://evil.example', 'https://calendly.com.evil.example', 'https://assets.calendly.com', 'http://calendly.com', 'https://calendly.com:8443', 'null', '']) p.message(origin, scheduled());
  for (const junk of [null, 'calendly.event_scheduled', 42, {}, { event: 7 }]) p.message('https://calendly.com', junk);
  assert.equal(p.events('callvix_meeting_booked').length, 0);
});

test('a repeated message, or a reload, does not count the booking twice', () => {
  const p = page(); openPopup(p);
  p.message('https://calendly.com', scheduled(1)); p.message('https://calendly.com', scheduled(1)); p.message('https://calendly.com', scheduled(1));
  assert.equal(p.events('callvix_meeting_booked').length, 1, 'three identical messages, one event');
  /* Same tab after a reload: memory is gone, sessionStorage is not. */
  const again = page({ storage: p.storage }); openPopup(again);
  again.message('https://calendly.com', scheduled(1));
  assert.equal(again.events('callvix_meeting_booked').length, 0, 'the reloaded page must not count it again');
  again.message('https://calendly.com', scheduled(2));
  assert.equal(again.events('callvix_meeting_booked').length, 1, 'a genuinely different booking still counts');
});

test('nothing personal reaches the dataLayer or leaves the hash readable', () => {
  const p = page(); openPopup(p);
  p.message('https://calendly.com', scheduled());
  const [ev] = p.events('callvix_meeting_booked');
  assert.deepEqual(Object.keys(ev).filter((k) => ev[k] !== undefined).sort(), ['booking_method', 'cta_location', 'event', 'page_path']);
  /* 26 Oct 2026: every event sets all five forwarded parameters (unused ones undefined), so GTM can't carry
     a value over from the previous event (e.g. a phone click inheriting the hero button's cta_location). */
  for (const k of ['link_location', 'cta_location', 'file_name', 'booking_step', 'booking_method']) assert.ok(Object.prototype.hasOwnProperty.call(ev, k), `${k} is set (or cleared) on every event`);
  const everything = JSON.stringify(p.win.dataLayer) + JSON.stringify([...p.storage.entries()]);
  for (const leak of ['EVT1', 'INV1', 'api.calendly.com', 'scheduled_events', 'invitee', 'uri', '@']) assert.ok(!everything.includes(leak), `"${leak}" leaked`);
  assert.match([...p.storage.get('cvx_bookings').matchAll(/"([^"]+)":1/g)].map((m) => m[1]).join(), /^b[0-9a-z]+$/, 'the dedupe key is a short hash');
});

test('the campaign page is left to lp-booking.js', () => {
  const p = page({ path: '/pest-control-call-demo/', campaign: true });
  const a = p.link(BOOKING); const ev = p.click(a);
  assert.equal(ev.prevented, false, 'its fallback links still open the ordinary way');
  assert.equal(p.injected.length, 0, 'no second copy of the widget is loaded');
  assert.equal(p.events('calendly_click').length, 1, 'calendly_click is reported as it always was');
  p.message('https://calendly.com', scheduled());
  assert.equal(p.events('callvix_meeting_booked').length, 0, 'main.js must not double-count a campaign booking');
  /* One dedupe pattern, two files: lp-booking.js is frozen, so the copy is pinned. */
  const fn = (src, name) => src.slice(src.indexOf(`function ${name}(`), src.indexOf('\n  }\n', src.indexOf(`function ${name}(`)) + 5);
  for (const name of ['bookingKey', 'alreadyCounted']) assert.equal(fn(SRC, name), fn(LP, name), `${name}() has drifted from js/lp-booking.js`);
  assert.ok(LP.includes("booking_method: 'calendly_embed'") && SRC.includes("booking_method: 'calendly_popup'"));
});

test('a booking link opens the popup with its final href, lazily, and reports one click', () => {
  const p = page();
  assert.equal(p.injected.length, 0, 'nothing from Calendly is loaded before a click');
  const { a, opened } = openPopup(p);
  assert.deepEqual(p.injected.map((el) => el.href || el.src), ['https://assets.calendly.com/assets/external/widget.css', 'https://assets.calendly.com/assets/external/widget.js']);
  assert.equal(opened(), a.href, 'the popup gets the href as it is at click time, parameters and all');
  assert.deepEqual(JSON.parse(JSON.stringify(p.events('calendly_click'))), [{ event: 'calendly_click', page_path: '/', link_location: 'hero', cta_location: 'hero_primary' }]);
  /* Second click: no second download. */
  p.click(a); assert.equal(p.injected.length, 2); assert.equal(p.events('calendly_click').length, 2);
  /* Modifier keys, middle click and non-booking Calendly links are not taken over. */
  const q = page();
  for (const mods of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { button: 1 }]) assert.equal(q.click(q.link(BOOKING), mods).prevented, false);
  assert.equal(q.click(q.link('https://calendly.com/privacy')).prevented, false);
  assert.equal(q.injected.length, 0);
});

test('if Calendly is blocked or slow the visitor is sent to the link instead', () => {
  const blocked = page(); const a = blocked.link(BOOKING + '?cta_location=home_hero');
  assert.equal(blocked.click(a).prevented, true);
  blocked.injected.find((el) => el.tag === 'script').onerror();
  assert.equal(blocked.win.location.href, a.href, 'blocked script: navigate');
  const slow = page(); const b = slow.link(BOOKING);
  slow.click(b);
  const timer = slow.timers.find((t) => t.ms >= 2500 && t.ms <= 3500); assert.ok(timer, 'a wait of about three seconds');
  timer.fn();
  assert.equal(slow.win.location.href, b.href, 'slow script: navigate');
  /* The script turning up late must not open a popup on top of the navigation. */
  let late = 0; slow.win.Calendly = { initPopupWidget() { late++; } };
  slow.injected.find((el) => el.tag === 'script').onload();
  assert.equal(late, 0);
  assert.equal(slow.events('calendly_click').length, 1);
});

test('every main-site page loads the current main.js', () => {
  const SKIP = new Set(['preview', 'pest-control-call-demo', 'pest-control-call-demo-v1', 'docs', 'node_modules', '.git']);
  /* /thank-you is frozen for this round; it keeps its link and so its cached copy. */
  /* /services is frozen until 11 Nov 2026: it keeps ?v=20261014c and picks up the new main.js when its 7-day cache expires. */
  const FROZEN = new Set(['thank-you.html', 'services.html']);
  const versions = new Map();
  (function walk(dir) {
    for (const e of readdirSync(dir)) {
      const abs = join(dir, e); const rel = relative(ROOT, abs);
      if (SKIP.has(rel.split('/')[0])) continue;
      if (statSync(abs).isDirectory()) walk(abs);
      else if (e.endsWith('.html') && !FROZEN.has(rel)) { const m = readFileSync(abs, 'utf8').match(/\/js\/main\.js\?v=([\w-]+)/); if (m) versions.set(rel, m[1]); }
    }
  }(ROOT));
  assert.equal(versions.size, 27); // 26 + /blog/best-pest-control-answering-services (20 Oct 2026) + /blog/pest-control-call-volume-by-season-and-region (24 Oct 2026)
  assert.deepEqual([...new Set(versions.values())], ['20261026a'], 'main.js changed on 26 Oct 2026 (event parameters reset per event); every page must ask for the new copy');
});
