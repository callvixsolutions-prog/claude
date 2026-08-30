import json, os, re, html

BASE = "https://callvixsolutions.com"
SRC  = open("services.html", encoding="utf-8").read()
C    = json.load(open(".build/content.json", encoding="utf-8"))

# ---- extract template chunks from the live services.html -------------------
PRE       = SRC[:SRC.index("<title>")]                       # doctype, GTM, meta
i_icon    = SRC.index('<link rel="icon"')
i_style   = SRC.index("</style>", i_icon) + len("</style>")
HEAD_TAIL = SRC[i_icon:i_style]                              # favicons, fonts, inlined CSS

body      = SRC.split("</head>", 1)[1]
i_body    = body.index("<body>")
i_navend  = body.index("</div>", body.index('class="mobile-nav"')) + len("</div>")
BODY_TOP  = body[i_body:i_navend].replace(' aria-current="page"', "")
BODY_END  = body[body.index('<footer class="site-footer">'):]

CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M20 6 9 17l-5-5"/></svg>'
PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>'
CAL  = "https://calendly.com/callvixsolutions/callvix-discovery-call"
e    = lambda s: html.escape(s, quote=True)

def head(title, desc, url, img="og-default.jpg"):
    return (PRE
      + f"<title>{e(title)}</title>\n"
      + f'<meta name="description" content="{e(desc)}">\n'
      + f'<link rel="canonical" href="{url}">\n'
      + '<meta name="robots" content="index,follow,max-image-preview:large">\n'
      + '<meta property="og:type" content="website">\n'
      + '<meta property="og:site_name" content="Callvix Solutions">\n'
      + f'<meta property="og:title" content="{e(title)}">\n'
      + f'<meta property="og:description" content="{e(desc)}">\n'
      + f'<meta property="og:url" content="{url}">\n'
      + f'<meta property="og:image" content="{BASE}/assets/{img}">\n'
      + '<meta property="og:image:width" content="1200">\n'
      + '<meta property="og:image:height" content="630">\n'
      + '<meta name="twitter:card" content="summary_large_image">\n'
      + f'<meta name="twitter:title" content="{e(title)}">\n'
      + f'<meta name="twitter:description" content="{e(desc)}">\n'
      + f'<meta name="twitter:image" content="{BASE}/assets/{img}">\n'
      + HEAD_TAIL)

def ld(obj):
    return '<script type="application/ld+json">\n' + json.dumps(obj, indent=2, ensure_ascii=False) + "\n</script>\n"

def faq_html(pairs):
    out = ['<div class="faq-list">']
    for q, a in pairs:
        out.append(
          f'      <div class="faq-item"><button class="faq-q" aria-expanded="false">{e(q)}{PLUS}</button>'
          f'<div class="faq-a"><div class="faq-a-inner">{e(a)}</div></div></div>')
    out.append("    </div>")
    return "\n".join(out)

def faq_ld(pairs):
    return {"@context":"https://schema.org","@type":"FAQPage","mainEntity":[
        {"@type":"Question","name":q,"acceptedAnswer":{"@type":"Answer","text":a}} for q,a in pairs]}

def crumbs(items):
    el=[]
    for n,(name,url) in enumerate(items,1):
        d={"@type":"ListItem","position":n,"name":name}
        if url: d["item"]=url
        el.append(d)
    return {"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":el}

OFFER = {"@type":"Offer","priceCurrency":"USD","price":"399",
  "description":"$399/month base (Mon-Fri live answering and booking) plus $2.99 per inbound call and $0.99 per outbound follow-up call. Optional add-ons: After-Hours $199/mo, Weekend $149/mo, CRM Management $99/mo."}

PRICE_BLOCK = """<section class="section section--alt">
  <div class="container container-narrow">
    <div class="section-head">
      <div class="eyebrow">Pricing</div>
      <h2>The same flat pricing, whichever system you run</h2>
      <p class="lede">Per call, not per minute &mdash; a long, complicated booking costs the same as a quick question.</p>
    </div>
    <ul class="svc-price-list">
      <li><span>Base subscription &mdash; Mon&ndash;Fri live answering &amp; booking</span><span class="amt">$399/mo</span></li>
      <li><span>Per inbound call we handle</span><span class="amt">$2.99</span></li>
      <li><span>Per outbound follow-up call</span><span class="amt">$0.99</span></li>
      <li><span>CRM Management add-on &mdash; deeper record hygiene in %s</span><span class="amt">$99/mo</span></li>
      <li><span>After-Hours coverage add-on</span><span class="amt">$199/mo</span></li>
      <li><span>Weekend coverage add-on</span><span class="amt">$149/mo</span></li>
    </ul>
    <p style="margin-top:18px;">Our prices are published rather than quoted &mdash; you can work out what Callvix costs before you ever speak to us. <a href="/pricing">See the full pricing breakdown &rarr;</a></p>
  </div>
</section>
"""

def cta(name):
    return f"""<section class="section">
  <div class="container">
    <div class="cta-band">
      <div class="eyebrow">Now onboarding founding partners</div>
      <h2>Let&rsquo;s map your current call flow</h2>
      <p class="lede">A free 15-minute discovery call. We&rsquo;ll look at where calls are leaking today and what booking correctly in {e(name)} would actually take. No contract, no pressure.</p>
      <div class="btn-row">
        <a href="{CAL}" class="btn btn-primary btn-lg">Book a Free Discovery Call</a>
        <a href="/contact" class="btn btn-ghost">Contact us</a>
      </div>
    </div>
  </div>
</section>
"""

RELATED = f"""<section class="section section--tight">
  <div class="container container-narrow">
    <h2 style="font-size:22px;">Related reading</h2>
    <div class="checklist" style="margin-top:16px;">
      <div class="ck">{CHECK}<p><a href="/services">How our pest control call handling works, end to end</a></p></div>
      <div class="ck">{CHECK}<p><a href="/integrations/">Answering service by CRM &mdash; all six systems</a></p></div>
      <div class="ck">{CHECK}<p><a href="/blog/pest-control-answering-service-cost">How much does a pest control answering service cost in 2026?</a></p></div>
      <div class="ck">{CHECK}<p><a href="/blog/ai-vs-human-answering-service-pest-control">AI vs. human answering service for pest control</a></p></div>
      <div class="ck">{CHECK}<p><a href="/blog/after-hours-pest-control-call-handling">Building an after-hours call and escalation plan</a></p></div>
      <div class="ck">{CHECK}<p><a href="/faq">Everything pest control owners ask before getting started</a></p></div>
    </div>
  </div>
</section>
"""

# ---------------- detail pages ----------------
os.makedirs("integrations", exist_ok=True)
built = []

for slug, d in C.items():
    url  = f"{BASE}/integrations/{slug}"
    name = d["name"]
    steps = "\n".join(
        f'      <div class="step"><div class="step-num">{n}</div><div><h4>{e(t)}</h4><p>{e(b)}</p></div></div>'
        for n, (t, b) in enumerate(d["steps"], 1))
    specifics = "\n".join(f'      <div class="ck">{CHECK}<p>{e(s)}</p></div>' for s in d["specifics"])
    scen = "\n".join(
        f'      <div class="card"><h3>{e(t)}</h3><p>{e(b)}</p></div>' for t, b in d["scenarios"])

    schema = (ld(crumbs([("Home", f"{BASE}/"), ("Integrations", f"{BASE}/integrations/"), (name, url)]))
            + ld({"@context":"https://schema.org","@type":"Service",
                  "name": f"Pest control answering service for {name} users",
                  "serviceType":"Pest control answering & appointment-booking service",
                  "provider":{"@type":"Organization","name":"Callvix Solutions","url":f"{BASE}/"},
                  "areaServed":{"@type":"Country","name":"United States"},
                  "audience":{"@type":"BusinessAudience","audienceType":f"Pest control companies using {name}"},
                  "url": url, "description": d["desc"], "offers": OFFER})
            + ld(faq_ld(d["faq"])))

    page = f"""{head(d['title'], d['desc'], url)}
{schema}</head>
{BODY_TOP}

<section class="page-hero">
  <div class="container">
    <div class="breadcrumbs"><a href="/">Home</a> / <a href="/integrations/">Integrations</a> / {e(name)}</div>
    <div class="eyebrow">{e(d['eyebrow'])}</div>
    <h1>{e(d['h1'])}</h1>
    <p class="hero-subhead">{e(d['subhead'])}</p>
    <p class="lede">{e(d['lede'])}</p>
    <div class="hero-cta" style="margin-top:26px;">
      <a href="{CAL}" class="btn btn-primary">Book a Discovery Call</a>
      <a href="/pricing" class="btn btn-outline">See pricing</a>
    </div>
  </div>
</section>

<section class="section section--white">
  <div class="container">
    <div class="photo-split">
      <div class="photo-frame">
        <img src="/assets/{d['image']}?v=2" alt="{e(d['imageAlt'])}" width="900" height="540" loading="lazy">
      </div>
      <div>
        <div class="eyebrow">What we do</div>
        <h2>Your phone, handled like an in-house office</h2>
        <p>Callvix is a pest control answering service staffed by trained people, not an AI bot. During your agreed coverage we answer in your company&rsquo;s name, qualify the pest issue, and book eligible jobs by your rules &mdash; working inside {e(name)} so your team sees the job where they expect it.</p>
        <p>Standard coverage is live answering and booking Monday to Friday, 9am to 6pm in your local time. Evening and weekend coverage are optional add-ons.</p>
      </div>
    </div>
  </div>
</section>

<section class="section section--alt">
  <div class="container container-narrow">
    <div class="section-head">
      <div class="eyebrow">Call flow</div>
      <h2>What happens to a call, step by step</h2>
    </div>
    <div class="steps">
{steps}
    </div>
  </div>
</section>

<section class="section section--white">
  <div class="container container-narrow">
    <div class="section-head">
      <div class="eyebrow">System specifics</div>
      <h2>Where {e(name)} changes how we work</h2>
    </div>
    <div class="checklist">
{specifics}
    </div>
  </div>
</section>

<section class="section section--alt">
  <div class="container">
    <div class="section-head">
      <div class="eyebrow">In practice</div>
      <h2>Three calls a {e(name)} office gets every week</h2>
      <p class="lede">The ones where the difference between a trained pest-control representative and a generic call center shows up in your revenue rather than in a survey.</p>
    </div>
    <div class="grid grid-3">
{scen}
    </div>
  </div>
</section>

<section class="section section--white">
  <div class="container container-narrow">
    <div class="section-head">
      <div class="eyebrow">Onboarding</div>
      <h2>What we agree before we take a live call</h2>
      <p class="lede">Setup is a conversation, not a form. All of this is written down before we answer in your name.</p>
    </div>
    <div class="checklist">
      <div class="ck">{CHECK}<p>A named user in {e(name)} with the permission level you&rsquo;re comfortable granting &mdash; revocable at any time.</p></div>
      <div class="ck">{CHECK}<p>Your service areas, and what we should do with an address that falls outside them.</p></div>
      <div class="ck">{CHECK}<p>Your pricing rules, and the point at which a pricing question should come to you instead.</p></div>
      <div class="ck">{CHECK}<p>A mapping between what a caller describes and the service or job type you want booked.</p></div>
      <div class="ck">{CHECK}<p>Your escalation contact, the method, and what counts as urgent enough to use it.</p></div>
      <div class="ck">{CHECK}<p>The greeting, in your company&rsquo;s name, exactly as you want it spoken.</p></div>
    </div>
  </div>
</section>

<section class="section section--alt">
  <div class="container container-narrow">
    <div class="section-head">
      <div class="eyebrow">Straight answers</div>
      <h2>What we don&rsquo;t do</h2>
      <p class="lede">The difference between a useful answering service and one that creates work for you.</p>
    </div>
    <div class="article-callout">
      <p><strong>We are not a {e(name)} partner and this is not a native integration.</strong> There is no data sync. Our people work in your account like an in-house CSR would, using access you control.</p>
      <p>We don&rsquo;t take payment or quote account balances. We don&rsquo;t invent an answer to a pricing or scope question that falls outside your rules &mdash; it gets escalated. We don&rsquo;t process cancellations; we capture the reason and hand the call to you the same day. And we only work with pest control companies, so we would be the wrong choice for your other trades if you run any.</p>
    </div>
  </div>
</section>

{PRICE_BLOCK % e(name)}
<section class="section section--white">
  <div class="container">
    <div class="section-head section-head--center">
      <div class="eyebrow">FAQ</div>
      <h2>Questions {e(name)} offices ask</h2>
    </div>
    {faq_html(d['faq'])}
  </div>
</section>

{cta(name)}{RELATED}
<section class="section section--tight">
  <div class="container container-narrow">
    <p class="card-disclaimer" style="text-align:left;">{e(name)} is a trademark of its respective owner. Callvix Solutions is an independent answering service and is not affiliated with, endorsed by, or partnered with {e(name)}. Call workflows are configured around the system your office already uses and are subject to the access you grant.</p>
  </div>
</section>

{BODY_END}"""
    open(f"integrations/{slug}.html", "w", encoding="utf-8").write(page)
    built.append(slug)

# ---------------- hub page ----------------
BLURB = {
 "fieldroutes": "Formerly PestRoutes. Route density, subscriptions and lead source attribution &mdash; the three things a generic call center gets wrong here.",
 "pestpac": "Service codes, branches and territories. We build a written mapping table and escalate anything that isn&rsquo;t on it.",
 "gorilladesk": "Small teams, tight schedules. Usually a defined daily booking window plus escalation for everything else.",
 "briostack": "Heavy on recurring service and automated comms, so we book conservatively and never process a cancellation.",
 "servicetitan": "Business units, job types and campaign attribution. A mis-booked job corrupts capacity planning as well as revenue.",
 "housecall-pro": "Not pest-specific, so the pest knowledge has to come from whoever answers. That is the whole point of us.",
}
ORDER = ["fieldroutes","pestpac","gorilladesk","briostack","servicetitan","housecall-pro"]
cards = "\n".join(f"""      <a class="card" href="/integrations/{s}">
        <h3>Answering service for {e(C[s]['name'])} users</h3>
        <p>{BLURB[s]}</p>
      </a>""" for s in ORDER)

HUB_T = "Pest Control Answering Service by CRM | Callvix"
HUB_D = "How Callvix books pest control jobs into the system your office already runs: FieldRoutes, PestPac, GorillaDesk, Briostack, ServiceTitan and Housecall Pro."
hub_url = f"{BASE}/integrations/"
hub_schema = (ld(crumbs([("Home", f"{BASE}/"), ("Integrations", None)]))
 + ld({"@context":"https://schema.org","@type":"CollectionPage","name":"Pest control answering service by CRM",
       "url":hub_url,"description":HUB_D,
       "about":{"@type":"Organization","name":"Callvix Solutions","url":f"{BASE}/"},
       "mainEntity":{"@type":"ItemList","itemListElement":[
         {"@type":"ListItem","position":i+1,"name":f"Answering service for {C[s]['name']} users",
          "url":f"{BASE}/integrations/{s}"} for i,s in enumerate(ORDER)]}}))

hub = f"""{head(HUB_T, HUB_D, hub_url)}
{hub_schema}</head>
{BODY_TOP}

<section class="page-hero">
  <div class="container">
    <div class="breadcrumbs"><a href="/">Home</a> / Integrations</div>
    <div class="eyebrow">Fits how you already work</div>
    <h1>We book into the system your office already runs</h1>
    <p class="hero-subhead">Answering the phone is the easy half.</p>
    <p class="lede">The half that decides whether an answering service is worth paying for is what happens next &mdash; whether the job lands in your software as a clean, correctly-coded appointment with notes your tech can use, or as a message somebody has to re-key an hour later.</p>
    <div class="hero-cta" style="margin-top:26px;">
      <a href="{CAL}" class="btn btn-primary">Book a Discovery Call</a>
    </div>
  </div>
</section>

<section class="section section--white">
  <div class="container">
    <div class="section-head">
      <p class="lede">Callvix representatives work inside the system your office already uses, the way an in-house CSR would. There is no data sync and no native integration to configure &mdash; you grant the access you are comfortable with, we agree the booking rules in writing, and you can revoke it at any time. Pick your system to see exactly what that looks like.</p>
    </div>
    <div class="grid grid-3">
{cards}
    </div>
  </div>
</section>

<section class="section section--alt">
  <div class="container container-narrow">
    <div class="section-head">
      <div class="eyebrow">Something else?</div>
      <h2>Running a system that isn&rsquo;t on this list?</h2>
    </div>
    <p>These six are the systems we see most often in pest control, but they are not a requirement. If your office runs something else &mdash; or a spreadsheet and a shared calendar &mdash; we adapt to your workflow rather than asking you to change it. Bring it to the discovery call and we will work through what booking correctly would take.</p>
  </div>
</section>

{PRICE_BLOCK % "your system"}
{cta("your system")}{RELATED}
<section class="section section--tight">
  <div class="container container-narrow">
    <p class="card-disclaimer" style="text-align:left;">Software names and trademarks belong to their respective owners. Callvix Solutions is an independent answering service and is not affiliated with, endorsed by, or partnered with any of the products listed. Call workflows are configured around the system your office already uses and are subject to the access you grant.</p>
  </div>
</section>

{BODY_END}"""
open("integrations/index.html", "w", encoding="utf-8").write(hub)

for f in ["integrations/index.html"] + [f"integrations/{s}.html" for s in ORDER]:
    print(f"{f:34s} {os.path.getsize(f)/1024:6.1f} KB")
