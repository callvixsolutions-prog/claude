/*
 * PestMaster of Naperville/Wheaton — page settings.
 * This file is NOT bundled, so it can be edited on the host without rebuilding.
 * Anything left empty or switched off renders nothing on the page.
 * Never put secrets here (passwords, API keys): this file is public.
 */
window.PM_SITE_CONFIG = {
  // 'preview' keeps the form mocked and loads no tags.
  // 'production' only takes effect when the page is ALSO served from an origin
  // listed in productionOrigins (scheme + host, no trailing slash).
  environment: 'preview',
  productionOrigins: [], // add the final HTTPS domain, e.g. ['https://www.example-domain.com']

  form: {
    // Where requests are posted. 'send.php' is this page's own script, in the same
    // folder: it emails each request to the business from this website's server (the
    // recipient is set inside send.php, never here). It may also be a full https URL
    // of a webhook that answers with JSON {"ok": true}. Empty = the form stays mocked.
    endpoint: 'send.php',
    // true = the form really sends, even while the page itself is still a preview
    // (noindex, no tags). false = mocked, with the "Preview build" notice.
    live: true,
    format: 'json', // 'json' or 'form' (application/x-www-form-urlencoded)
    subject: 'New quote request: PestMaster landing page',
    callbackPromise: '' // client-approved only, e.g. 'We call back within 1 business hour.'
  },

  // Text-message consent. Off until the client supplies approved consent wording.
  sms: { enabled: false, consentText: '' },

  // Tracking. Fill GTM *or* gtag, not both. Nothing loads while these are empty.
  analytics: {
    gtmId: '',                 // e.g. 'GTM-XXXXXXX'
    gtagId: '',                // GA4 'G-XXXXXXXXXX' or Google Ads 'AW-XXXXXXXXXX'
    adsLeadSendTo: '',         // Google Ads form-lead conversion, e.g. 'AW-XXXXXXXXXX/AbCdEfGh'
    phoneConversionNumber: '', // '(630) 300-3503' to enable Google forwarding numbers
    clarityId: '',             // Microsoft Clarity project ID; loads after page load when set
    // Off. If ever switched on, the visitor's details are passed to the Google tag only
    // at a confirmed request and cleared straight after. Needs a decision first.
    enhancedConversions: false
  },

  // Second hero bullet (owner decision, 13 Oct 2026). To switch back, set it to
  // 'Pet & Kid Friendly Service'.
  hero: { kidsPetsLabel: 'Safe for Kids & Pets' },

  // The advertised starting price. eligibleSvc lists the service ids whose pages show it:
  // 'general' is the default page. Every other ad version hides it.
  offer: {
    enabled: true,
    headline: 'Pest control starting from $199',
    footnote: 'Starting price for an initial general pest control service. Exact price confirmed by phone before booking.',
    faqAnswer: 'General pest control starts from $199 for the initial service. We confirm your exact price on the phone before you book. Mice and rats, bed bugs and specialty services such as wildlife and termite (WDI) inspections are priced separately.',
    eligibleSvc: ['general']
  },

  // Optional extra cards in "Why Choose Us". The client must confirm each one.
  // A card appears only when its flag is true AND its text/number is filled in.
  edges: {
    noContract: false, noContractText: '', // "No long-term contracts" with the client's exact text
    // Owner confirmed on 13 Oct 2026 that the business is licensed, so the page says
    // "Illinois licensed & insured". No number is shown; the extra card needs one.
    licensed: true, licenseNumber: '',
    guarantee: false, guaranteeText: '',// "Satisfaction guarantee" with the client's exact text
    nextDay: false, nextDayText: ''     // "Fast scheduling" with the client's exact text
  },

  // Photos are fixed files in assets-source/originals/, processed by `npm run images`
  // (slots are listed at the top of tools/images.mjs and in ASSETS.md).
  // customerConsent: set true ONLY when every customer whose face appears in a supplied
  // photo has agreed in writing. While false, do not add photos showing a customer's face.
  photos: { customerConsent: false, creditNote: '' },

  // Service-area towns shown on the page. A town listed here can also be used as an
  // `?s=` ad label when the page has ZIP data for it.
  locations: {
    towns: ['Naperville', 'Wheaton', 'Aurora', 'Warrenville', 'Winfield', 'West Chicago', 'Carol Stream', 'Glen Ellyn', 'Lombard', 'Villa Park', 'Lisle', 'Downers Grove', 'Woodridge', 'Westmont', 'Darien', 'Oak Brook', 'Bolingbrook', 'Oswego']
  },

  // Google reviews: rating, count, profile link and the review cards.
  // `title` and `text` are verbatim ("…" only where text is cut). `svc` tags let an ad
  // version show its matching review first.
  reviews: {
    rating: '5.0',
    count: '33',
    profileUrl: 'https://www.google.com/maps/search/?api=1&query=Pestmaster+of+Naperville%2FWheaton&query_place_id=ChIJ_9jL91LyDogR_Q6Nnu1wI3I',
    items: [
      { author: 'Karen P.', svc: 'ants', title: 'After one application, they are gone!', text: 'Used Pestmaster of Naperville to get rid of those stubborn sugar ants in my pantry. After one application, they are gone! Everyone was so nice to deal with there. Highly recommend them.' },
      { author: 'Essen Y.', svc: 'general', title: 'Took the time to explain everything clearly', text: '… They were professional, punctual, and took the time to explain everything clearly. The technician was knowledgeable and addressed our concerns thoroughly. …' },
      { author: 'George S.', svc: 'rodents', title: 'Good, quick service!', text: 'Good, quick service! Arrives on time and performed all the pest treatment (mice). They’ll be back soon to spray for box elder bugs. I definitely recommend them!' },
      { author: 'R. A.', svc: 'general', title: 'For an affordable price', text: '… Excellent communication from start to finish. Addressed my pest control problem promptly and for an affordable price. Highly recommend Pestmaster!' },
      { author: 'Benjamin Y.', svc: 'general', title: 'They volunteered to return a week later', text: '… Pestmaster was a local provider with a good rating so I gave them a chance. … Not only that they volunteered to return a week later just to make sure we were satisfied. …' },
      { author: 'Art M.', svc: 'general', title: 'Really knew what they were doing', text: '… Super friendly, on time, and really knew what they were doing. They took care of the issue quickly and explained everything in a way that actually made sense. …' }
    ]
  },

  privacyUrl: 'privacy.html'
};
