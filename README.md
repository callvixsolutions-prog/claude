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
