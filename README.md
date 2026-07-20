# Callvix Solutions — Website

A fast, static website (plain HTML/CSS/JS — no build step, no dependencies to install).

## What's in here

```
index.html        Home page
services.html      Services page
pricing.html        Pricing page
about.html          "Our Approach" (About + delivery model)
faq.html            FAQ (with schema markup for Google/AI answer boxes)
contact.html        Contact page + message form
css/style.css       All styling
js/main.js          Mobile menu + FAQ accordion
assets/                Real logo, favicon set, and site photography (see below)
robots.txt          Tells search engines & AI crawlers they can index the site
sitemap.xml          Page list for search engines
llms.txt             Plain-language summary for AI tools (ChatGPT, Perplexity, etc.)
```

### Brand assets in `assets/`

Pulled directly from the live site, so these are your real assets, already in use:
- `logo.png` — full logo, used on light backgrounds (header, mobile menu).
- `logo-white.png` — a white/teal version I generated from your logo for dark backgrounds (footer). If you ever get an official white/reversed logo file from a designer, swap it in here.
- `favicon.ico`, `favicon-32.png`, `favicon-192.png`, `apple-touch-icon.png` — your real favicon set.
- `photo-technician.jpg` — the real pest-control technician photo from your current site, reused on the Home and Our Approach pages.
- `badge-designrush.png` — your "Top Call Center Companies 2026" DesignRush recognition, shown in the footer.

Brand colors now match your logo exactly: navy `#101c4c` and teal `#26a8b6` (no orange/amber anywhere).

## Things you must do before this goes live

1. **Replace the placeholder phone number.**
   The number `(800) 555-0199` / `tel:+18005550199` appears in every page's header, mobile menu, and footer, plus the Contact page and the homepage's structured data (`index.html`, near the top, inside the `<script type="application/ld+json">` block). Find-and-replace it across all files once you have your real number.

2. **Connect the contact form.**
   `contact.html` has a message form pointing at `https://formspree.io/f/YOUR_FORM_ID`. Static sites can't process form submissions on their own, so:
   - Go to [formspree.io](https://formspree.io), make a free account, create a form, and copy the form ID it gives you.
   - Replace `YOUR_FORM_ID` in `contact.html` with that ID.
   - Submissions will then land directly in your email inbox. No coding required.

3. **Double-check the pricing numbers.** I pulled $399/month base + $2.99/inbound call + $0.99/outbound call + the three add-ons directly from your live pricing page — confirm these are still current before launch, since pricing is the kind of thing that's easy to quietly change and forget to update everywhere.

4. **Add real testimonials/case studies** once you have your first clients — there's a natural slot for this on the homepage between "Why Callvix" and "Pricing" once you're ready (ask your developer, or me, to add it back in).

## How to publish this on Hostinger

Since you're already hosting with Hostinger, this is the simplest path:

1. Log in to **hPanel** → **Files** → **File Manager** for your domain.
2. If a WordPress install currently lives in `public_html`, back it up first (Hostinger has a one-click backup/export option) — don't delete it until the new site is confirmed working.
3. Delete or move aside the old files in `public_html`.
4. Upload every file and folder from this project (`index.html`, `css/`, `js/`, `assets/`, `robots.txt`, `sitemap.xml`, `llms.txt`, and the other `.html` pages) directly into `public_html`, preserving the folder structure.
5. Visit your domain — it should load immediately. No database, no PHP, nothing else to configure.
6. In **Google Search Console**, submit `https://callvixsolutions.com/sitemap.xml` so Google indexes the new pages quickly.

If you'd rather not touch file uploads yourself, send me the go-ahead and I can walk you through it step by step, or prepare a zipped package.

## Editing text later

Every page is plain HTML — open any `.html` file in a text editor, find the sentence you want to change, and edit it directly. There's no CMS. If ongoing self-editing without a developer is important to you, let me know and I can adapt the pricing/copy blocks into a format that's easier to hand off to a page-builder instead.
