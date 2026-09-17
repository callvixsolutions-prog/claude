# Callvix Solutions — site conventions

Static HTML site, no build step, deployed to Hostinger (Apache/LiteSpeed). Read this before editing.

## URL policy — the thing most likely to break

`.htaccess` makes **extensionless URLs canonical**. Real directories keep their trailing slash.

- `/pricing` is canonical and serves `pricing.html` via internal rewrite (200, not a redirect)
- `/pricing.html` → 301 → `/pricing`
- `/pricing/` → 301 → `/pricing`
- `/blog/` and `/integrations/` are **real directories** — they keep the trailing slash and serve `index.html`

So: a new top-level page is `name.html` linked as `/name`. A new **section** is `name/index.html` plus
`name/child.html`, linked as `/name/` and `/name/child`. Never link a directory without its trailing slash —
`Options -Indexes` is on, so a missing `index.html` gives a 403, not a listing.

**Do not reorder the `.htaccess` rewrite rules.** An earlier version looped `/pricing` ↔ `/pricing.html`.
The ordering comments in that file are load-bearing.

## CSS

`css/style.css` is the source of truth, but it is **inlined into every page** inside a `<style>` block to remove
the render-blocking request (commit `5fdb4a3`). If you edit `css/style.css` you must re-inline it into every
HTML file, or the change will not appear. Page-specific CSS goes in a second `<style>` block after the inlined one.

Reuse the existing classes rather than inventing new ones: `.section` (`--alt`/`--white`/`--navy`/`--teal`),
`.container`, `.container-narrow`, `.section-head`, `.eyebrow`, `.lede`, `.grid grid-2|3|4`, `.card`,
`.steps`/`.step`/`.step-num`, `.checklist`/`.ck`, `.compare-wrap`/`.compare-table`, `.faq-list`/`.faq-item`,
`.cta-band`, `.page-hero`, `.breadcrumbs`, `.photo-split`/`.photo-frame`, `.article-callout`, `.btn` variants.

FAQ accordions need `js/main.js` and this exact structure:
`.faq-item > button.faq-q[aria-expanded] + .faq-a > .faq-a-inner`.

## Every page needs

Header, `#mobileNav`, footer and `/js/main.js` copied from an existing page — there is no template engine.
Head must carry: GTM snippet, `<title>`, meta description, canonical, robots, OG (`og:image` is
`/assets/og-default.jpg`, 1200×630, unless the page has its own), Twitter card, favicons, fonts, inlined CSS,
then JSON-LD. Exactly one `<h1>` per page.

Add every new page to **`sitemap.xml`** and to **`llms.txt`** (robots.txt explicitly welcomes GPTBot,
ClaudeBot and PerplexityBot, so `llms.txt` is a real distribution channel, not decoration).

## Claims policy — non-negotiable

Callvix has **no native integrations, no partnerships and no data sync** with FieldRoutes/PestRoutes, PestPac,
GorillaDesk, Briostack, ServiceTitan, Housecall Pro or anyone else. Representatives work inside the client's own
account using access the client grants and can revoke.

Never write "integrates with", "syncs to", "connects directly to" or "partner". Every page naming a vendor keeps
its trademark disclaimer. A false integration claim ends a sales call.

Other standing accuracy rules:
- Base coverage is **Mon–Fri 9am–6pm client local time**. It is not 24/7. After-Hours ($199/mo) and Weekend
  ($149/mo) are paid add-ons; CRM Management is $99/mo.
- Pricing is $399/mo base + $2.99 per inbound call + $0.99 per outbound follow-up. Flat per call, never per minute.
- The homepage revenue maths is labelled as illustrative. Keep that label until real data replaces it.
- Callvix is human-answered. Never describe it as AI, automated, or a voice bot.

## IndexNow

A push to `main` triggers `.github/workflows/indexnow.yml`, which waits for the deploy to be live and then
notifies IndexNow about the `.html` pages changed in that push. Nothing to do per edit — but keep every new
indexable page's `<link rel="canonical">` correct, and keep noindex on utility pages, because the script uses
both to decide what to submit. Never delete or edit the root key file `cb5b7350e51fd62e3bbef397cf0f8c98.txt`.
Commands and details: README §8.
