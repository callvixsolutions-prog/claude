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

## 1. Contact form — how to make it work (5 minutes, no coding)

The form in `contact.html` currently points at a placeholder. A static site can't
process form submissions itself, so it needs a free form backend. Use **Formspree**:

1. Go to **[formspree.io](https://formspree.io)** and create a free account
   (free tier = 50 submissions/month).
2. Verify your email address when prompted.
3. Click **+ New Form**.
   - **Form name:** `Callvix Website Contact`
   - **Send to:** `contact@callvixsolutions.com`
4. Formspree shows you an endpoint like `https://formspree.io/f/xdkogqwl`.
   The part after `/f/` (e.g. `xdkogqwl`) is your **form ID**.
5. Open `contact.html`, find this line (around line 120):

   ```html
   <form action="https://formspree.io/f/YOUR_FORM_ID" method="POST">
   ```

   Replace `YOUR_FORM_ID` with your real ID:

   ```html
   <form action="https://formspree.io/f/xdkogqwl" method="POST">
   ```

6. Re-upload `contact.html`, then **submit the form once yourself**. Formspree
   asks you to confirm the first submission — after that, every message lands in
   your inbox automatically.

**Optional:** in Formspree settings you can turn on reCAPTCHA (spam protection)
and set a custom "thank you" redirect page.

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
