// Unit tests for scripts/submit-indexnow.mjs (no network). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  KEY, KEY_LOCATION, HOST, normalizeUrl, dedupeAndValidate, readPageSignals, interpretStatus,
} from './submit-indexnow.mjs';

test('key meets the IndexNow format and matches the hosted key file', () => {
  assert.match(KEY, /^[a-zA-Z0-9-]{8,128}$/);
  assert.equal(KEY_LOCATION, `https://${HOST}/${KEY}.txt`);
  assert.equal(readFileSync(new URL(`../${KEY}.txt`, import.meta.url), 'utf8'), KEY);
});

test('accepts canonical production URLs', () => {
  for (const u of [
    'https://callvixsolutions.com/',
    'https://callvixsolutions.com/pricing',
    'https://callvixsolutions.com/blog/',
    'https://callvixsolutions.com/blog/pest-control-call-script-intake-form',
  ]) assert.equal(normalizeUrl(u), u);
});

test('rejects non-canonical, foreign and asset URLs', () => {
  for (const u of [
    'http://callvixsolutions.com/pricing',            // not https
    'https://www.callvixsolutions.com/pricing',       // www duplicate
    'https://localhost/pricing',                      // local
    'https://staging.callvixsolutions.com/pricing',   // staging
    'https://example.com/pricing',                    // other host
    'https://callvixsolutions.com/pricing?utm=x',     // query variation
    'https://callvixsolutions.com/pricing#faq',       // fragment
    'https://callvixsolutions.com/pricing.html',      // .html variant (redirects)
    'https://callvixsolutions.com/assets/logo.png',   // asset
    'https://callvixsolutions.com/sitemap.xml',       // file
    'https://callvixsolutions.com:8443/pricing',      // port
    'not a url',
  ]) assert.throws(() => normalizeUrl(u), undefined, u);
});

test('removes duplicates and reports rejections', () => {
  const { accepted, rejected } = dedupeAndValidate([
    'https://callvixsolutions.com/pricing',
    ' https://callvixsolutions.com/pricing ',
    'https://www.callvixsolutions.com/pricing',
  ]);
  assert.deepEqual(accepted, ['https://callvixsolutions.com/pricing']);
  assert.equal(rejected.length, 1);
});

test('reads canonical and noindex from real pages', () => {
  const page = readPageSignals(readFileSync(new URL('../pricing.html', import.meta.url), 'utf8'));
  assert.equal(page.canonical, 'https://callvixsolutions.com/pricing');
  assert.equal(page.noindex, false);
  assert.equal(readPageSignals(readFileSync(new URL('../thank-you.html', import.meta.url), 'utf8')).noindex, true);
  assert.equal(readPageSignals(readFileSync(new URL('../404.html', import.meta.url), 'utf8')).noindex, true);
});

test('interprets documented IndexNow status codes', () => {
  assert.equal(interpretStatus(200).ok, true);
  assert.equal(interpretStatus(202).ok, true);
  for (const s of [400, 403, 422, 429, 500]) assert.equal(interpretStatus(s).ok, false);
  assert.match(interpretStatus(403).meaning, /key/i);
  assert.match(interpretStatus(429).meaning, /too many/i);
});
