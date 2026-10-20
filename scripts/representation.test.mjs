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
 * That was removed in e276673 and d580e8f. Removals do not stay removed: the next
 * time someone wants a page to feel warmer, a stock photograph is the obvious
 * thing to reach for, and nothing else in this suite would object.
 *
 * WHAT THIS CONTROLS, AND WHY IT IS SHAPED THIS WAY
 *
 * The thing we actually want is: no new photograph of a person enters the site
 * without a human deciding. The first version of this file tried to detect that
 * from alt wording, with a deny-list of role nouns. That was the wrong object.
 * Alt text is a description of an asset written by whoever added it, so a
 * deny-list over wording flags accurate descriptions of diagrams ("a trained
 * human agent", "an existing team with overflow support" — both charts, neither
 * depicting anyone) while a photograph with bland alt text sails through. Every
 * false positive is then pressure to reword a correct alt or weaken the pattern,
 * and a test you edit to make a run pass has stopped being a test.
 *
 * So the control is on the asset. Every image the markup references must appear
 * below with a line saying what it is. Anything else fails. A new image fails by
 * default, and the only way to pass is for a person to look at it and write down
 * what they saw — which is exactly the decision we want forced.
 *
 * The role-noun scan is kept, demoted to a warning. It is a useful hint and it
 * no longer shapes copy.
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
const EXCLUDED_DIRS = new Set(['pest-control-call-demo', 'pest-control-call-demo-v1', 'docs', 'preview', '.git', 'node_modules', 'scripts', 'assets', 'css', 'js', '.github', '.claude']);

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
   scanning past ~700 lines of CSS on each file. <img> tags live in the body;
   og:image and the favicons live in the head, so those are matched separately. */
const bodyOf = (html) => {
  const i = html.indexOf('<body');
  return i === -1 ? html : html.slice(i);
};

const basename = (url) => url.split('/').pop().split('?')[0];
const pages = htmlFiles().map((f) => [f, read(f)]);

/* ------------------------------------------------------------------ */

/**
 * Every image this site references, and what is in it. Each line was written
 * after opening the file — not after reading its name or its alt text, both of
 * which have already been wrong once each.
 *
 * To add an image: open it, look at it, write the line. If you cannot describe
 * it without using the word "representative", it probably does not belong here.
 */
const ALLOWED_IMAGES = {
  /* Brand marks. */
  'logo.png': 'Callvix wordmark',
  'logo-white.png': 'Callvix wordmark, reversed',
  'favicon.ico': 'Callvix mark',
  'favicon-32.png': 'Callvix mark',
  'favicon-192.png': 'Callvix mark',
  'apple-touch-icon.png': 'Callvix mark',
  'badge-designrush.png': 'DesignRush directory badge: chevron mark, five stars, no people',
  'og-default.jpg': 'branded share card, navy with the wordmark and a strapline, no people',

  /* Homepage field photographs (Round 15). Stock, licensed, sources in
     assets/photos/MANIFEST.md. Neither person is, or is presented as, Callvix
     staff: the alt text and the caption describe the work, not the company.
     Only the JPEG fallbacks are listed because the check reads <img src>; the
     AVIF and WebP beside each are the same crop of the same photograph. */
  'home-hero-desktop.jpg': 'photograph (opened 2026-10-14): a bald man in sunglasses, green work shirt and long black glove, white backpack sprayer, walking along a cream house wall spraying low shrubs; red shutters, a window, a lawn. No logo, vehicle, plate or text',
  'home-rules-desktop.jpg': 'photograph (opened 2026-10-14): a white-haired man in glasses, white polo and khaki trousers crouching on mulch beside an open crawl-space hatch in grey shingle siding, the white hatch door lying open. The small chest logo on the polo was painted out; no text remains',

  /* Homepage photographs after Round 18. Sources in assets/photos/MANIFEST.md.
     The hero is an illustration (inline SVG), so no person in a headset is
     shown anywhere on the site and nothing here is flagged. Each photograph
     is used once. */
  'home-case-tech.jpg': 'photograph (opened 2026-10-14): square crop of the Round 15 technician photograph — bald man in sunglasses, green work shirt, white backpack sprayer, house wall and red shutter behind. No logo or text',
  'home-case-office.jpg': 'photograph (opened 2026-10-14): square crop — a bearded man in glasses holding a desk-phone handset behind a monitor, window blinds behind. Reads as a client office, not a call centre. No logo or text',

  /* Blog card thumbnails, 900x506. These are SEPARATE FILES from the og images
     below, which is how a stock call-centre photograph survived a round of
     removals: the branded cover existing for an article did not mean the index
     was using it. Each one opened individually. */
  'blog-after-hours.jpg': 'flow diagram rendered from the article figure (2026-10-13): five labelled boxes in a row, note reads "Safety check at any point. Then the eligibility gate, then Levels 1–4.", no people',
  'blog-ai-vs-human-16x9.jpg': 'two-column comparison graphic with icons, no people',
  'blog-call-script.jpg': 'branded cover, title and subtitle on navy, no people',
  'blog-checklist.jpg': 'branded cover, title and subtitle on navy, no people',
  'blog-pricing.jpg': 'photograph: calculator, banknotes and a notepad. Objects only',
  'blog-receptionist-vs-service.svg': 'three-column diagram, vector text and shapes, no embedded raster',
  'blog-best-answering-services.svg': 'three-column comparison diagram (Human, AI, Hybrid), vector text and placeholder bars, no people, no logos, no embedded raster',
  'vendor-scorecard.jpg': 'branded cover with an illustrated checklist, no people',

  /* Open Graph images, 1200x630. */
  'blog-after-hours-call-flow-1200x630.png': 'flow diagram rendered from the article figure (2026-10-13): five labelled boxes in a row, note reads "Safety check at any point. Then the eligibility gate, then Levels 1–4.", no people',
  'blog-ai-vs-human-1200x630.jpg': 'two-column comparison graphic with icons, no people',
  'blog-call-script-1200x630.png': 'branded cover, no people',
  'blog-checklist-1200x630.png': 'branded cover, no people',
  'vendor-scorecard-1200x630.png': 'branded cover with an illustrated checklist, no people',

  /* Aspect-ratio variants referenced ONLY from JSON-LD, for rich results.
     Invisible to this test until it learned to read schema. Each opened: they
     are re-crops of the covers and diagrams above, with the flow diagram
     restacking from a row to a column at 4x3 and 1x1. Nothing appears in a crop
     that is absent from the wide version. */
  'blog-after-hours-call-flow-16x9.png': 'flow diagram rendered from the article figure (2026-10-13): five boxes in a row, note reads "Safety check at any point. Then the eligibility gate, then Levels 1–4.", no people',
  'blog-after-hours-call-flow-4x3.png': 'same flow diagram stacked vertically (2026-10-13), same note under the fifth box, no people',
  'blog-after-hours-call-flow-1x1.png': 'same flow diagram stacked vertically, square (2026-10-13), same note under the fifth box, no people',
  'blog-ai-vs-human-4x3.jpg': 'the comparison graphic, 4x3 crop, no people',
  'blog-ai-vs-human-1x1.jpg': 'the comparison graphic, square crop, no people',
  'blog-checklist-16x9.png': 'branded cover, 16x9 crop, no people',

  /* The one photograph of a person left on the site. Allowed because it depicts
     the CUSTOMER'S world, not the vendor's: nothing labels it as Callvix, and it
     illustrates no claim about who answers the phone. That is the line, written
     here rather than as a verdict because the judgement is what a future reader
     needs.

     photo-tech.jpg was allowed under the same line and turned out not to meet it
     — see RETIRED below. One image passing this test and one failing it is the
     reason the line is worth writing down. */
  'blog-missed-calls.jpg':
    'photograph: a pair of hands holding a phone. No face, no headset, no office. '
    + 'The subject is the caller who did not get through',
};

/**
 * Images referenced inside JSON-LD — Article.image, Organization.logo,
 * ImageObject.url, the aspect-ratio variants Google wants for rich results.
 *
 * This surface was invisible to the first version of this test, which read
 * markup only. That is the sixth instance of one pattern on this site: the
 * og:image, the blog index thumbnail, the integration transcript headers, an
 * alt string standing in for a file nobody opened, claim text living in
 * FAQPage schema, and now this. Every one of them was a place where reading
 * the page does not show you what the page references.
 */
function schemaImageRefs(html) {
  const out = [];
  const walk = (node) => {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) {
        const imageKey = ['image', 'logo', 'thumbnailUrl', 'contentUrl', 'primaryImageOfPage'].includes(k);
        for (const s of (Array.isArray(v) ? v : [v])) {
          if (typeof s === 'string' && /\.(png|jpe?g|webp|svg|ico)(\?|$)/i.test(s) && (imageKey || k === 'url')) out.push(s);
        }
        walk(v);
      }
    }
  };
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { walk(JSON.parse(m[1])); } catch { /* a parse failure is site-checks' problem, not this test's */ }
  }
  return out;
}

test('every referenced image is one a person has looked at', () => {
  const offenders = [];
  for (const [file, html] of pages) {
    const refs = new Set();
    for (const m of bodyOf(html).matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)) refs.add(m[1]);
    for (const m of html.matchAll(/<meta\b[^>]*\b(?:property|name)="(?:og:image|twitter:image)"[^>]*\bcontent="([^"]+)"/gi)) refs.add(m[1]);
    for (const m of html.matchAll(/<link\b[^>]*\brel="(?:icon|apple-touch-icon)[^"]*"[^>]*\bhref="([^"]+)"/gi)) refs.add(m[1]);
    for (const url of schemaImageRefs(html)) refs.add(url);
    for (const url of refs) {
      const name = basename(url);
      if (!(name in ALLOWED_IMAGES)) offenders.push(`${file}: ${name}`);
    }
  }
  assert.deepEqual(offenders, [],
    `image referenced that nobody has signed off:\n  ${offenders.join('\n  ')}\n`
    + 'Open the file. Look at it. If it shows a person who could be read as Callvix '
    + 'staff, do not use it. Otherwise add it to ALLOWED_IMAGES with a line saying '
    + 'what it shows. Do not add it blind to make a run pass.');
});

test('flagged images are still flagged', () => {
  /* An entry whose note says FLAGGED is allow-listed only because it is already
     live and removing it is somebody's decision, not the test's. Printed every
     run so it cannot quietly become permanent by being in a comment nobody
     reopens. */
  const flagged = Object.entries(ALLOWED_IMAGES).filter(([, note]) => /FLAGGED/.test(note));
  if (flagged.length) {
    console.log(`    WARNING — ${flagged.length} allow-listed image(s) awaiting a decision:`);
    for (const [name, note] of flagged) console.log(`      ${name}: ${note}`);
  } else {
    console.log('    no images awaiting a decision');
  }
  assert.ok(true); /* warning only */
});

test('every page carries an og:image', () => {
  const missing = pages.filter(([, html]) => !/<meta\b[^>]*property="og:image"/i.test(html)).map(([f]) => f);
  assert.deepEqual(missing, [],
    `no og:image:\n  ${missing.join('\n  ')}\n`
    + 'The homepage og:image was a stock team photograph for months. It is the most '
    + 'prominent surface on the site and the one an audit of the page cannot see.');
});

/* ------------------------------------------------------------------ */

/**
 * Role nouns in alt text. A hint, never a failure — see the header. It earns its
 * place by being cheap and occasionally right, not by being correct.
 */
const PERSON_ROLE = /representative|agent|team|staff|our people|headset/i;

test('alt text mentioning a working role is worth a second look', () => {
  const hits = [];
  for (const [file, html] of pages) {
    for (const tag of bodyOf(html).match(/<img\b[^>]*>/g) || []) {
      const alt = tag.match(/\balt="([^"]*)"/);
      if (alt && PERSON_ROLE.test(alt[1])) {
        hits.push(`${file}: ${basename((tag.match(/\bsrc="([^"]*)"/) || [, '?'])[1])} — alt="${alt[1]}"`);
      }
    }
  }
  if (hits.length) {
    console.log(`    WARNING — ${hits.length} alt string(s) name a working role:`);
    for (const h of hits) console.log(`      ${h}`);
    console.log('      Often a diagram legitimately describing roles. Check the asset, not the words.');
  } else {
    console.log('    no alt text naming a working role');
  }
  assert.ok(true); /* warning only */
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
  /* photo-tech.jpg was kept through two reviews on the strength of its alt text
     — "a pest control technician treating the exterior of a home" — which nobody
     had checked against the file. It showed a worker in a hard hat and
     respirator with a backpack sprayer, an Indonesian flag on the sleeve,
     beside stacked tyres and parked scooters, under a badge reading "You stay in
     the field. We stay on the phone." on a site built for U.S. companies. It
     surfaced only when this test forced every asset to be opened. */
  'photo-tech',
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
    `retired asset referenced again:\n  ${offenders.join('\n  ')}\n`
    + 'These were removed because they depicted people as Callvix staff.');
});
