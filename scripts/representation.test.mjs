/**
 * Representation guard.
 *
 * Callvix sells the fact that real people answer the phone. For a long time the
 * site illustrated that claim with stock photography of strangers, labelled as
 * Callvix personnel: "Callvix representative" above a stock headshot in the call
 * transcript, and `.photo-badge` overlays welding each photograph to the claim it
 * was illustrating. A labelled stock headshot next to "a real person, not a bot"
 * is a sentence arguing with its own picture.
 *
 * That was removed in commit e276673. Removals do not stay removed: the next time
 * someone wants the homepage to feel warmer, a stock headshot is the obvious thing
 * to reach for, and nothing else in this suite would object.
 *
 * Note the direction of test 2. It is an ALLOW-LIST, not a deny-list, because the
 * failure that nearly shipped was an og:image — a surface more prominent than the
 * page itself and invisible to anyone auditing the page. A deny-list of known-bad
 * filenames would have passed it. A newly added photo has to fail by default.
 *
 * Run with `npm test`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/* Same exclusions as site-checks: the paid-ads landing page is out of scope for
   every main-site rule, and docs/ holds gitignored measurement handoffs. */
const EXCLUDED_DIRS = new Set(['pest-control-call-demo', 'docs', '.git', 'node_modules', 'scripts', 'assets', 'css', 'js', '.github', '.claude']);

function htmlFiles(dir = ROOT, out = []) {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    const rel = relative(ROOT, abs);
    if (EXCLUDED_DIRS.has(rel.split('/')[0])) continue;
    if (statSync(abs).isDirectory()) htmlFiles(abs, out);
    else if (entry.endsWith('.html')) out.push(rel);
  }
  return out;
}

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/* css/style.css is inlined into every page's <head>, so scanning markup means
   scanning past ~700 lines of CSS on each file. Everything these tests care
   about lives in the body. */
const bodyOf = (html) => {
  const i = html.indexOf('<body');
  return i === -1 ? html : html.slice(i);
};

const pages = htmlFiles().map((f) => [f, read(f)]);

/* ------------------------------------------------------------------ */

/**
 * Alt text that describes a person in a working role. The site may depict the
 * customer's world — see photo-tech.jpg on /about — but it may not depict, or
 * describe, someone doing the job Callvix sells.
 */
const PERSON_ROLE = /representative|agent|team|staff|our people|headset/i;

test('no image is described as a person doing Callvix\'s job', () => {
  const offenders = [];
  for (const [file, html] of pages) {
    for (const tag of bodyOf(html).match(/<img\b[^>]*>/g) || []) {
      const alt = tag.match(/\balt="([^"]*)"/);
      if (alt && PERSON_ROLE.test(alt[1])) {
        const src = (tag.match(/\bsrc="([^"]*)"/) || [, '?'])[1];
        offenders.push(`${file}: ${src.split('/').pop()} — alt="${alt[1]}"`);
      }
    }
  }
  assert.deepEqual(offenders, [],
    `image alt text describes a person in a Callvix working role:\n  ${offenders.join('\n  ')}\n` +
    'Callvix has no stock photographs of its own staff. Use a branded graphic, or depict ' +
    'the customer\'s world rather than the vendor\'s.');
});

/* ------------------------------------------------------------------ */

/**
 * Every og:image on the site, each one opened and confirmed to contain no
 * depiction of a person. Adding an entry here means someone looked at the file.
 *
 * blog-missed-calls.jpg is the one photograph in the list. It shows a pair of
 * hands holding a phone — no face, and its subject is the caller who did not get
 * through, not anyone working for Callvix. It is allowed on the same reasoning
 * that keeps photo-tech.jpg on /about: it depicts the customer's world. If that
 * reasoning stops holding, this is the line to delete.
 */
const ALLOWED_OG_IMAGES = new Set([
  'og-default.jpg',                            // branded card, no people
  'blog-after-hours-call-flow-1200x630.png',   // flow diagram
  'blog-ai-vs-human-1200x630.jpg',             // comparison graphic
  'blog-call-script-1200x630.png',             // branded cover
  'blog-checklist-1200x630.png',               // branded cover
  'blog-pricing.jpg',                          // calculator and cash, no people
  'vendor-scorecard-1200x630.png',             // branded cover
  'blog-missed-calls.jpg',                     // caller's hands, no face — see above
]);

test('every og:image is an allow-listed asset with no people in it', () => {
  const offenders = [];
  for (const [file, html] of pages) {
    const tags = html.match(/<meta\s+property="og:image"[^>]*>/gi) || [];
    if (!tags.length) { offenders.push(`${file}: no og:image`); continue; }
    for (const tag of tags) {
      const content = (tag.match(/content="([^"]*)"/) || [, ''])[1];
      const name = content.split('/').pop().split('?')[0];
      if (!ALLOWED_OG_IMAGES.has(name)) offenders.push(`${file}: og:image is "${name}"`);
    }
  }
  assert.deepEqual(offenders, [],
    `og:image is not on the allow-list:\n  ${offenders.join('\n  ')}\n` +
    'This is an allow-list on purpose. Open the image, confirm it depicts no one who ' +
    'could be read as Callvix staff, then add it to ALLOWED_OG_IMAGES with a comment ' +
    'saying what it shows. Do not add it to make a run pass.');
});

/* ------------------------------------------------------------------ */

/**
 * The retired assets. av-* were the stock headshots; photo-agent-desk.jpg and
 * blog-ai-human.jpg were stock call-centre photographs.
 *
 * photo-team.jpg is in this list but still exists on disk, and that is
 * deliberate. Its bytes were replaced with the branded og-default card so that
 * link previews cached against the old URL stop serving a stock team photo.
 * The path has to keep working; nothing may reference it again.
 */
const RETIRED = [
  'av-1', 'av-2', 'av-3', 'av-4', 'av-5', 'av-6', 'av-7', 'av-8',
  'av-rep', 'av-rep2', 'photo-team', 'photo-agent-desk', 'blog-ai-human',
];

test('retired people-depicting assets are referenced nowhere', () => {
  const sources = [...pages, ['css/style.css', read('css/style.css')]];
  const offenders = [];
  for (const [file, text] of sources) {
    const scope = file.endsWith('.css') ? text : bodyOf(text);
    for (const name of RETIRED) {
      if (new RegExp(`\\b${name}\\.(png|jpe?g|webp|svg)\\b`).test(scope)) {
        offenders.push(`${file}: references ${name}`);
      }
    }
  }
  assert.deepEqual(offenders, [],
    `retired asset referenced again:\n  ${offenders.join('\n  ')}\n` +
    'These were removed because they depicted people as Callvix staff.');
});
