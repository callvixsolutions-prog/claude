/**
 * Contact form "Where they came from" (owner-approved 6 Nov 2026).
 *
 * js/main.js remembers, in the visitor's own browser, how this visit started (entry page, referring site, ad or
 * campaign tags, pages viewed) and the first and latest ad-tagged visits (the landing page's keys), and adds them
 * to the contact form only. contact-send.php puts them in the enquiry email and never rejects or stores them.
 * These tests run the real main.js in a stub page (no browser, no network). The real PHP is checked with
 * _callvix-live-tools/php-wasm/contact-php-check.mjs and the whole flow with contact-source-flow.mjs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = readFileSync(join(ROOT, 'js/main.js'), 'utf8');
const PHP = readFileSync(join(ROOT, 'contact-send.php'), 'utf8');
const LPJS = readFileSync(join(ROOT, 'pest-control-answering-service/assets/cv3b.js'), 'utf8');

const store = () => { const m = new Map(); return { m, api: { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) } }; };
/** Load main.js on one page; returns cvxVisitSource.fields(). Storage maps carry over between "page loads". */
function load(url, { referrer = '', local, session, now = Date.now() } = {}) {
  const u = new URL(url);
  const win = { location: { pathname: u.pathname, search: u.search, hostname: u.hostname, href: u.href }, addEventListener() {}, dataLayer: [] };
  const doc = { referrer, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] };
  const FakeDate = class extends Date { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } };
  const ctx = vm.createContext({ window: win, document: doc, localStorage: local.api, sessionStorage: session.api, URLSearchParams, URL, JSON, Object, String, Math, Date: FakeDate });
  vm.runInContext(SRC + '\n;this.__src = cvxVisitSource;', ctx);
  return ctx.__src.fields();
}

test('a Google search visit: entry page, referrer name only, pages in order, time on site', () => {
  const local = store(), session = store(), t0 = Date.UTC(2026, 10, 6, 15, 0, 0);
  load('https://callvixsolutions.com/pricing', { referrer: 'https://www.google.com/search?q=secret+query', local, session, now: t0 });
  load('https://callvixsolutions.com/services', { referrer: 'https://callvixsolutions.com/pricing', local, session, now: t0 + 20000 });
  const f = load('https://callvixsolutions.com/contact', { referrer: 'https://callvixsolutions.com/services', local, session, now: t0 + 61000 });
  assert.equal(f.visit_entry, '/pricing');
  assert.equal(f.visit_referrer, 'google.com', 'only the site name, never the search words or full address');
  assert.equal(f.visit_tags, 'none');
  assert.equal(f.visit_pages, '/pricing → /services → /contact');
  assert.equal(f.visit_seconds, '61');
  assert.equal(f.first_visit, ''); assert.equal(f.latest_visit, '');
  assert.equal(local.m.size, 0, 'an untagged visit writes nothing that lasts beyond the tab');
});

test('an ad-tagged visit is remembered 90 days under the landing page keys, and a later visit names it', () => {
  const local = store(), t0 = Date.UTC(2026, 10, 2, 12, 0, 0);
  load('https://callvixsolutions.com/?utm_source=google&utm_medium=cpc&utm_campaign=23456&gclid=TESTGCLID', { local, session: store(), now: t0 });
  assert.deepEqual(JSON.parse(local.m.get('cvx_visit_first')), { ts: t0, utm_source: 'google', utm_medium: 'cpc', utm_campaign: '23456', gclid: 'TESTGCLID' });
  const f = load('https://callvixsolutions.com/contact', { local, session: store(), now: t0 + 4 * 864e5 });
  assert.equal(f.visit_entry, '/contact'); assert.equal(f.visit_referrer, 'none'); assert.equal(f.visit_tags, 'none');
  assert.equal(f.first_visit, 'google / cpc, campaign 23456, gclid TESTGCLID, on 2026-11-02');
  assert.equal(f.latest_visit, 'google / cpc, campaign 23456, gclid TESTGCLID, on 2026-11-02');
  const late = load('https://callvixsolutions.com/contact', { local, session: store(), now: t0 + 91 * 864e5 });
  assert.equal(late.first_visit, '', 'older than 90 days is forgotten');
  assert.match(LPJS, /writeVisit\('cvx_visit_first', v\)/, 'the landing page writes the same key');
});

test('tags arriving on this visit show as this visit\'s tags; a new tab is not a referrer', () => {
  const local = store(), session = store();
  load('https://callvixsolutions.com/?utm_source=chatgpt&utm_medium=paid&utm_campaign=pilot', { referrer: 'https://chatgpt.com/', local, session });
  const f = load('https://callvixsolutions.com/contact', { local, session });
  assert.equal(f.visit_referrer, 'chatgpt.com');
  assert.equal(f.visit_tags, 'chatgpt / paid, campaign pilot');
  const tab = load('https://callvixsolutions.com/contact', { referrer: 'https://callvixsolutions.com/faq', local, session: store() });
  assert.equal(tab.visit_referrer, 'this site (opened in a new tab)');
});

test('long visits keep the entry page and the latest pages only', () => {
  const local = store(), session = store();
  for (let i = 0; i < 20; i++) load(`https://callvixsolutions.com/p${i}`, { local, session });
  const f = load('https://callvixsolutions.com/contact', { local, session });
  const pages = f.visit_pages.split(' → ');
  assert.equal(pages.length, 12); assert.equal(pages[0], '/p0'); assert.equal(pages[1], '…'); assert.equal(pages[11], '/contact');
});

test('only the contact form gets the fields, and they can never block it', () => {
  assert.match(SRC, /if \(\/\\\/contact-send\\\.php\$\/\.test\(form\.getAttribute\('action'\) \|\| ''\)\) \{\n\s+try \{ var src = cvxVisitSource\.fields\(\);[^\n]*\} catch \(e\) \{ \/\* never block the enquiry \*\/ \}/);
  assert.match(SRC, /body: body,/);
});

test('contact-send.php: optional fields, capped; the email section is after the message', () => {
  for (const [k, max] of [['visit_entry', 300], ['visit_referrer', 200], ['visit_tags', 900], ['visit_pages', 900], ['first_visit', 1000], ['latest_visit', 1000]]) {
    assert.ok(PHP.includes(`cvx_line($data['${k}'] ?? '', ${max})`), k);
  }
  assert.match(PHP, /\$lines = array_merge\(\$lines, \$source, \['', \$recordNote, 'Reply to this email to write to them directly\.'\]\);/);
  assert.doesNotMatch(PHP.slice(PHP.indexOf('where they came from (optional')), /REMOTE_ADDR/, 'no IP address in the email');
});

/* Owner-approved 12 Nov 2026: an 11 Nov enquiry never arrived and left no trace. The contact form now keeps a
   private record of every request, saved BEFORE the email, and of why any request was turned away. */
test('contact-send.php: private record next to public_html, saved before the email, every turn-away recorded', () => {
  assert.match(PHP, /const CVX_RECORD_DIR = 'callvix-leads';/);
  assert.match(PHP, /const CVX_RECORD_KEEP_MONTHS = 12;/);
  assert.match(PHP, /return defined\('CVX_TEST_DATA_DIR'\) \? \(string\) constant\('CVX_TEST_DATA_DIR'\) : dirname\(__DIR__\);/, 'one level up from public_html');
  assert.match(PHP, /@mkdir\(\$dir, 0700, true\)/);
  assert.match(PHP, /@chmod\(\$file, 0600\);/);
  assert.match(PHP, /\$file = \$dir \. '\/contact-' \. gmdate\('Y-m'\) \. '\.jsonl';/, 'its own monthly files');
  assert.match(PHP, /glob\(cvx_data_dir\(\) \. '\/' \. CVX_RECORD_DIR \. '\/contact-\*\.jsonl'\)/, 'pruning never touches the landing page leads-*.jsonl');
  /* Order: record "received", then the email, then the result, then the answer. */
  const order = ["$recorded = cvx_record([\n    'outcome' => 'received',", '$sent = cvx_send_mail(', "cvx_record(['outcome' => $sent === true ? 'emailed' : 'email_failed'], true);", 'cvx_succeed();'];
  const at = order.map((k) => PHP.indexOf(k));
  assert.ok(at.every((v, i) => v > 0 && (i === 0 || v > at[i - 1])), 'record, mail, result, answer: ' + JSON.stringify(at));
  assert.match(PHP, /\$recordNote = 'Record ID: ' \. cvx_record_id\(\)/, 'the email carries the record id');
  /* Every rejection after the method check is recorded with its reason; only 405 and the final 500 answer directly. */
  const flow = PHP.slice(PHP.indexOf('/* ---------- request checks ---------- */'));
  const direct = flow.match(/cvx_fail\(\d+/g) || [];
  assert.deepEqual(direct, ['cvx_fail(405', 'cvx_fail(500'], 'only the method check and the failed email answer without a turn-away record');
  for (const reason of ['origin', 'too_large', 'rate_limited', 'honeypot', 'too_fast', 'invalid']) assert.ok(flow.includes(`'${reason}'`), reason);
  assert.match(PHP, /'honeypot', \['elapsed_ms' => \$elapsed\]\);/, 'a honeypot hit is a bot: no typed text kept');
  assert.doesNotMatch(PHP, /\$_(GET|POST|REQUEST|COOKIE)\[['"]CVX_TEST/, 'test hooks are never switched on by a request');
  assert.ok(!existsSync(join(ROOT, 'callvix-leads')), 'no records in the repository');
});
