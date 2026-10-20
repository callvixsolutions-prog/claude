# Callvix Solutions — Website

A fast, static website (plain HTML/CSS/JS — no build step, no dependencies, no database).

## What's in here

```
index.html            Home
services.html          How It Works
pricing.html            Pricing (flat per-call model + cost comparison)
about.html              Why Callvix (differentiators + delivery model)
faq.html                FAQ (FAQ schema for Google / AI answer boxes)
contact.html            Contact + message form
404.html                Custom "page not found"
blog/index.html          Resource hub
blog/*.html              3 cornerstone SEO/GEO articles
css/style.css            All styling (warm/human design system)
js/main.js               Mobile menu + FAQ accordion
assets/                   Logo, favicons, photography, representative avatars
.htaccess                Redirects, HTTPS, clean URLs, caching, security headers
robots.txt               Allows search engines + AI crawlers
sitemap.xml               Page list for search engines
llms.txt                  Structured summary for AI engines (ChatGPT, Perplexity, Claude)
```

---

## 1. Contact form — CONFIGURED ✅

The contact form is wired to **Formspree**, form ID **`maqrpwqw`**
(`https://formspree.io/f/maqrpwqw`). Nothing further to code.

It's set up with:

| Field | Purpose |
|---|---|
| `_subject` | Emails arrive titled "New enquiry from callvixsolutions.com" |
| `_next` | After submitting, visitors land on our own `thank-you.html`, not Formspree's default page |
| `_gotcha` | Hidden honeypot — bots fill it in, humans never see it, so spam is filtered without a CAPTCHA |

### Remaining one-time step (after the site is live)
Submit the form **once yourself** from the live domain. Formspree requires you to
confirm the very first submission before it starts forwarding to your inbox.

### Notes
- The destination email is set **in the Formspree dashboard**, not in the code —
  change it there, no re-upload needed.
- Free tier is 50 submissions/month. If you outgrow it, upgrading in Formspree
  requires no code change.
- The `_next` redirect points at `https://callvixsolutions.com/thank-you.html`,
  so it only works once the site is on the real domain. Testing locally will show
  Formspree's default confirmation page instead — that's expected.

---

## 2. Analytics — what's already wired up

**Google Tag Manager is installed on every page** using your existing container:

```
GTM-PJFS7HV5
```

This is the same container ID your old WordPress site used. Because your Google
Analytics 4 property is configured *inside* that GTM container, **GA4 keeps
reporting automatically** once the new site is live — nothing to reconfigure.

### After you go live, verify it:
1. Open **[tagmanager.google.com](https://tagmanager.google.com)** → your container → **Preview**,
   enter `https://callvixsolutions.com`, and confirm tags fire.
2. Open **Google Analytics → Reports → Realtime** and load your site — you should appear.

### Google Search Console (important)
Your old site was verified in Search Console. After launch:
1. Go to **[search.google.com/search-console](https://search.google.com/search-console)**.
2. Confirm the property is still verified. If verification was done by **DNS record**
   or **Google Analytics/Tag Manager**, it will keep working. If it used an
   **HTML file** or **meta tag**, you'll need to re-verify — easiest is to pick
   *Google Tag Manager* as the verification method, since GTM is already installed.
3. Go to **Sitemaps** and submit: `https://callvixsolutions.com/sitemap.xml`
4. Under **Indexing → Pages**, watch for the old URLs redirecting correctly
   (they're 301-redirected — see section 4).

### Click events and their two location parameters

`js/main.js` pushes four events to the dataLayer: `phone_click`, `email_click`,
`calendly_click` and `generate_lead`. One GTM trigger (a regex on the event name)
fires one GA4 event tag, which forwards `page_path`, `link_location` and
`cta_location`. Both are registered in GA4 as event-scoped custom dimensions.

| Parameter | What it means | Values |
|---|---|---|
| `link_location` | Where on the page the link sits. Coarse and structural, so it stays comparable over time. Sent with every click event. | `header`, `mobile_nav`, `footer`, `cta_band`, `hero`, `article_body`, `body` |
| `cta_location` | Which call to action it was. Sent with `calendly_click` and `generate_lead`. Read from the nearest `data-cta-location` attribute; where there is none it equals `link_location`. | `hero_primary`, `hero_secondary`, `pricing`, `works_with`, `faq`, `closing_primary`, `closing_secondary`, `contact_calendly`, `contact_form`, plus any `link_location` value |

To name a new call to action, add `data-cta-location="..."` to the link (or to a
wrapper around several links). Do not change what `link_location` returns.

**There is a second thing called `cta_location`, and it is not this one.** A custom
HTML tag in the GTM container rewrites every Calendly link on the page and adds a
`cta_location` **URL query parameter** so that Calendly's own reports show where a
booking started. It picks its value by position, in its own vocabulary:
`home_hero`, `<page>_header`, `<page>_footer`, `<page>_body_cta` (for example
`pricing_header`). That value travels to Calendly in the link. It never reaches the
dataLayer or GA4, and the dataLayer `cta_location` above never reaches Calendly.
The two share a name only. When comparing a GA4 report with a Calendly report,
do not expect the values to match.

The campaign page (`/pest-control-call-demo/`) loads the same `main.js` plus
`js/lp-booking.js`, which pushes its own events (`callvix_cta_click`,
`callvix_booking_step`, `callvix_meeting_booked`). Only that page reports a
completed booking; on the main site a Calendly link opens in a new tab and is
recorded as a click.

---

## 3. Session recording & heatmaps — free option

**Microsoft Clarity** is genuinely free with **unlimited** sessions, recordings,
heatmaps, and rage-click/dead-click detection. (Hotjar's free plan caps you at a
few thousand sessions; Clarity doesn't.)

The snippet is already in every page, commented out. To turn it on:

1. Sign up at **[clarity.microsoft.com](https://clarity.microsoft.com)** with your Microsoft/Google account.
2. **+ New project** → name `Callvix` → website `callvixsolutions.com`.
3. Copy your **Project ID** (a short code like `k4n2p9xyz`).
4. In every `.html` file, find the Clarity block near the top and:
   - delete the line `<!-- Microsoft Clarity — FREE unlimited ... replace CLARITY_PROJECT_ID with it.`
   - delete the closing `-->` a few lines below it
   - replace `CLARITY_PROJECT_ID` with your real Project ID

   *(Or simply tell me your Project ID and I'll enable it across all pages.)*

**Even easier alternative:** add Clarity as a tag inside Google Tag Manager
instead — then it's one setup in GTM and no file edits at all.

---

## 4. SEO: the old URLs are redirected (don't skip this)

Your old WordPress pages are indexed by Google. `.htaccess` 301-redirects them to
the new pages so you keep those rankings:

| Old URL | New URL |
|---|---|
| `/about-us/` | `/about.html` |
| `/why-egypt/` | `/about.html` |
| `/landing/` | `/services.html` |
| `/pricing/` | `/pricing.html` |
| `/contact-us/` | `/contact.html` |
| `/home/` | `/` |
| `/sitemap_index.xml` | `/sitemap.xml` |

`.htaccess` also forces HTTPS, enables clean URLs (`/pricing` works as well as
`/pricing.html`), turns on compression and browser caching, and sets security headers.

> **Important:** `.htaccess` starts with a dot, so it's hidden by default. In
> Hostinger's File Manager enable **Settings → Show hidden files** before
> uploading, or it will silently be left out and the redirects won't work.

---

## 5. Design versions & rollback

The current warm/human design is live on `main`. The previous dark-navy version
is preserved:
- git branch `v1-design` and tag `v1-design-backup`
- folder copy: `callvix-v1-backup/`

Roll back with: `git checkout v1-design -- .` then commit.

There is also a full backup of the **old WordPress site** (public pages, CSS,
images) at `callvix-LIVE-SITE-BACKUP-2026-07-23/` on the Desktop. Note that a
public crawl does **not** include the WordPress database — take a full
Files + Database backup from **hPanel → Files → Backups** before replacing the site.

---

## 6. Publishing to Hostinger

1. **Back up first:** hPanel → **Files → Backups** → *Create new backup*, then
   download both the **Files** and **Database** backups.
2. hPanel → **Files → File Manager** → open `public_html`.
3. Enable **Settings → Show hidden files** (so `.htaccess` uploads).
4. Move the old WordPress files aside (don't delete until the new site is confirmed).
5. Upload everything from this project into `public_html`, keeping folder structure.
6. Visit the domain to confirm, then test a few old URLs
   (e.g. `callvixsolutions.com/pricing/`) to confirm they redirect.
7. Submit `https://callvixsolutions.com/sitemap.xml` in Google Search Console.

**Cleaner alternative:** hPanel → **Advanced → Git**, connect the GitHub repo
(`callvixsolutions-prog/claude`) and deploy from there — future updates become
one click with no manual uploads.

---

## 7. Editing text later

Every page is plain HTML — open a `.html` file in any text editor, find the
sentence, change it, re-upload. No CMS, no build step.

When adding a blog post: copy an existing article in `blog/`, change the content,
then add its URL to `sitemap.xml` and to the "Resources" list in the footer of
each page.

---

## 8. IndexNow (automatic search-engine notifications)

IndexNow tells Bing and the other participating engines (Yandex, Seznam, Naver,
Yep...) that a page was added, updated or deleted. Google does not use IndexNow —
keep using Search Console for Google.

**Key file:** `cb5b7350e51fd62e3bbef397cf0f8c98.txt` in the site root, served at
<https://callvixsolutions.com/cb5b7350e51fd62e3bbef397cf0f8c98.txt>. It must
contain only the key. Don't rename or delete it; if the key is ever rotated,
update `KEY` in `scripts/submit-indexnow.mjs` in the same commit.

### How it runs automatically

`.github/workflows/indexnow.yml` runs on every push to `main` — the same push
that makes Hostinger deploy the site. It:

1. lists the `.html` pages added, changed or deleted in that push
   (noindex pages such as `thank-you.html` and `404.html` are ignored);
2. **waits until production serves each changed page's new content** (it
   compares the live bytes with the committed file; deleted pages must return
   404/410), for up to 15 minutes;
3. re-checks each URL is live, not redirected, not noindex and self-canonical;
4. sends the list to `https://api.indexnow.org/indexnow`.

Pages that never went live in time are skipped with a warning. An IndexNow or
network failure is only a warning — it can't fail or undo the deploy. Results
(HTTP status and response body) appear in the GitHub **Actions** run summary.
It does not run for other branches, pull requests or local work. Pushes that
change no pages (CSS-only commits still re-inline CSS into pages, so those do
count) submit nothing.

### Manual commands (Node 18+, no install needed)

```bash
npm run indexnow:check                                          # dry run: validate every sitemap URL, submit nothing
npm run indexnow:sitemap                                        # submit every canonical URL in the live sitemap
npm run indexnow -- https://callvixsolutions.com/pricing https://callvixsolutions.com/services
npm run indexnow:changed -- --from <old-sha> --to <new-sha>     # what the workflow runs
npm test                                                        # unit tests for the script
```

Or, without a terminal: GitHub → **Actions → IndexNow → Run workflow** (choose
`sitemap` or `urls`).

Only canonical `https://callvixsolutions.com` page URLs are ever sent: `www`,
`http`, query strings, `.html` variants, assets, redirects and noindex pages are
rejected. Response meaning: **200** submitted · **202** received, key check
pending · **400** bad request · **403** key not valid · **422** URLs/key don't
match the host · **429** rate-limited.

`scripts/`, `package.json` and `.github/` are blocked from the public web by
`.htaccess`.

---

## 9. Landing page (`/pest-control-call-demo/`)

The paid-traffic page (Google Ads and Facebook/Instagram). It is `noindex` and not in
`sitemap.xml`. Its files are its own: `pest-control-call-demo/index.html`, `css/lp.css`,
`js/lp.js` and `assets/fonts/*.woff2`. No other page loads them, and it does not load the
main site's `css/style.css` or `js/main.js`. Tests: `scripts/lp-v2.test.mjs` (part of `npm test`).

`/pest-control-call-demo-v1/` is the previous version, kept live for rollback or an A/B
test. It stays `noindex` and out of the sitemap, and its file is hash-pinned in
`scripts/round11-frozen.json` (`campaignV1Sha256`) so it can't change by accident.

### Switches (current values)

| Switch | Current value | Lives in | What it does / how to change it |
|---|---|---|---|
| `LP_VIDEO` | `false` | `pest-control-call-demo/index.html`, the first `<script>` in `<head>` (`var LP_VIDEO = false;`) | Shows the video. Turn on only after the five video files are uploaded (steps below). It sits in the head so the page lays out correctly before it paints. |
| `SAMPLE_CALL_AUDIO` | `false` | `js/lp.js`, top of the file | Plays a recorded sample call in sync with the transcript. Add `assets/audio/sample-call.mp3` and `assets/audio/sample-call.vtt` (one caption cue per transcript line, same order as on the page), then set to `true`. |
| `SHOW_TESTIMONIALS` | `false` | `js/lp.js`, top of the file | Shows the testimonials section above the FAQ. Add approved quotes to the `TESTIMONIALS` list just below it (`{ quote, name, company, place, photo?, result? }`), then set to `true`. Never add a quote a client hasn't approved. |
| `CALLBACK_PROMISE` | `"shortly during U.S. business hours"` | `js/lp.js`, top of the file | The end of the callback-form thank-you line: "Thanks, Pat. We'll call you …". Change the text between the quotes. |

**After changing `css/lp.css` or `js/lp.js`, raise the `?v=` number** on its `<link>`/`<script>`
in `pest-control-call-demo/index.html` (currently `?v=3`), and update the matching check in
`scripts/lp-v2.test.mjs`. Browsers keep these files for up to a year (CSS) or a week (JS), so a
returning visitor would otherwise get the old file. Any edit to the page's HTML also needs
`campaignSha256` in `scripts/round11-frozen.json` updated (the test failure tells you the new value).

### Going live with the video

1. Put exactly these five files in `assets/video/`:
   - `callvix-lp-video.mp4` (H.264, 16:9, ideally ≤ 10 MB)
   - `callvix-lp-video.webm` (same video, WebM)
   - `callvix-lp-video.vtt` (captions; shown by default)
   - `callvix-lp-poster.webp` and `callvix-lp-poster.jpg` (the still shown before play, 16:9, e.g. 1280×720)
2. In `pest-control-call-demo/index.html`, change `var LP_VIDEO = false;` to `var LP_VIDEO = true;`.
3. Update `campaignSha256` (run `npm test`; the failure prints the new value), then commit and push to
   `main`. Hostinger deploys in about a minute.

What visitors then see: search and other traffic get a "See how it works in about a minute"
section after the problem section. Facebook/Instagram traffic (`?src=fb`, or
`utm_source=facebook|instagram|fb|ig`) gets the video in place of the hero call card (on phones,
directly under the subhead), and the "See a sample call" link becomes "Watch how it works".
Nothing loads until the visitor presses play. When the video ends, an overlay offers "Book a
20-minute demo" (scrolls to the calendar) and "Replay".

### Headline variants for ads

`?h=` picks the H1 from a fixed list; anything else shows the default. Use these final URLs:

| Variant | URL |
|---|---|
| default | `https://callvixsolutions.com/pest-control-call-demo/` |
| answering | `https://callvixsolutions.com/pest-control-call-demo/?h=answering` |
| call-center | `https://callvixsolutions.com/pest-control-call-demo/?h=call-center` |
| receptionist | `https://callvixsolutions.com/pest-control-call-demo/?h=receptionist` |
| after-hours | `https://callvixsolutions.com/pest-control-call-demo/?h=after-hours` |
| missed | `https://callvixsolutions.com/pest-control-call-demo/?h=missed` |
| human | `https://callvixsolutions.com/pest-control-call-demo/?h=human` |
| Facebook/Instagram | `https://callvixsolutions.com/pest-control-call-demo/?src=fb` |
