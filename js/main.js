/* ------------------------------------------------------------------
   Where a contact-form visitor came from (owner-approved 6 Nov 2026).
   Kept only in this visitor's own browser and sent only with the contact
   form, so the enquiry email says how they reached us even when analytics
   and Clarity are blocked:
   - this visit (this tab): entry page, referring site (name only), ad or
     campaign tags, pages viewed, start time  -> sessionStorage
   - a visit opened with ad or campaign tags: the first one for 90 days and
     the latest one -> localStorage, the same keys and shape the landing page
     uses, so an ad click there is still named on a later contact enquiry.
------------------------------------------------------------------ */
var cvxVisitSource = (function () {
  var TRACKING = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'gbraid', 'wbraid', 'fbclid'];
  var VISIT_DAYS = 90, SESSION_KEY = 'cvx_visit_session', MAX_PAGES = 12;
  var query = {};
  try { new URLSearchParams(window.location.search).forEach(function (v, k) { query[k] = v; }); } catch (e) { /* old browser */ }
  var tags = { ts: Date.now() }, tagged = false;
  TRACKING.forEach(function (k) { if (query[k]) { tags[k] = String(query[k]).slice(0, 200); tagged = true; } });

  function readVisit(key) {
    try {
      var v = JSON.parse(localStorage.getItem(key) || 'null');
      return v && typeof v.ts === 'number' && Date.now() - v.ts < VISIT_DAYS * 864e5 ? v : null;
    } catch (e) { return null; }
  }
  function writeVisit(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* storage blocked */ } }
  if (tagged) {
    if (!readVisit('cvx_visit_first')) writeVisit('cvx_visit_first', tags);
    writeVisit('cvx_visit_latest', tags);
  }

  function describeTags(v, withDate) {
    if (!v) return '';
    var parts = [], any = false;
    TRACKING.forEach(function (k) { if (v[k]) any = true; });
    if (!any) return '';
    parts.push((v.utm_source || '(no source)') + ' / ' + (v.utm_medium || '(no medium)'));
    if (v.utm_campaign) parts.push('campaign ' + v.utm_campaign);
    if (v.utm_content) parts.push('ad ' + v.utm_content);
    if (v.utm_term) parts.push('term ' + v.utm_term);
    ['gclid', 'gbraid', 'wbraid', 'fbclid'].forEach(function (k) { if (v[k]) parts.push(k + ' ' + v[k]); });
    if (withDate) parts.push('on ' + new Date(v.ts).toISOString().slice(0, 10));
    return parts.join(', ').slice(0, 900);
  }
  function referrerName() {
    var r = '';
    try { r = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, '') : ''; } catch (e) { r = ''; }
    if (r && r === window.location.hostname.replace(/^www\./, '')) return 'this site (opened in a new tab)';
    return r;
  }

  // This visit: started on the first page this tab opened on the site.
  var session = null;
  try { session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { session = null; }
  if (!session || typeof session.ts !== 'number' || !session.pages) {
    session = { ts: Date.now(), entry: window.location.pathname, ref: referrerName(), tags: tagged ? tags : null, pages: [] };
  } else if (tagged) {
    session.tags = tags;   // tags that arrive mid-visit (a new ad click in the same tab) replace the old ones
  }
  if (session.pages[session.pages.length - 1] !== window.location.pathname) session.pages.push(window.location.pathname);
  if (session.pages.length > MAX_PAGES) session.pages = session.pages.slice(0, 1).concat(['…'], session.pages.slice(-(MAX_PAGES - 2)));
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch (e) { /* storage blocked: still sent from memory below */ }

  return {
    // Added to the contact form when it is sent. The server never rejects a form over these.
    fields: function () {
      return {
        visit_entry: session.entry,
        visit_referrer: session.ref || 'none',
        visit_tags: describeTags(session.tags, false) || 'none',
        visit_pages: session.pages.join(' → '),
        visit_seconds: String(Math.max(0, Math.round((Date.now() - session.ts) / 1000))),
        first_visit: describeTags(readVisit('cvx_visit_first'), true),
        latest_visit: describeTags(readVisit('cvx_visit_latest'), true)
      };
    }
  };
}());

// Mobile nav toggle
document.addEventListener('DOMContentLoaded', function () {
  var toggle = document.querySelector('.nav-toggle');
  var mobileNav = document.querySelector('.mobile-nav');
  if (toggle && mobileNav) {
    // One setter, so the panel and aria-expanded cannot disagree. They used to:
    // following a link closed the panel and left the button saying "expanded".
    var setOpen = function (open) {
      mobileNav.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', String(open));
    };
    toggle.addEventListener('click', function () { setOpen(!mobileNav.classList.contains('open')); });
    mobileNav.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () { setOpen(false); });
    });
    // Escape closes the menu and hands focus back to the button that opened it.
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || !mobileNav.classList.contains('open')) return;
      setOpen(false);
      toggle.focus();
    });
  }

  // FAQ accordions
  document.querySelectorAll('.faq-item').forEach(function (item) {
    var q = item.querySelector('.faq-q');
    if (!q) return;
    q.addEventListener('click', function () {
      var isOpen = item.classList.contains('open');
      item.closest('.faq-list').querySelectorAll('.faq-item').forEach(function (i) {
        i.classList.remove('open');
        var btn = i.querySelector('.faq-q');
        if (btn) btn.setAttribute('aria-expanded', 'false');
      });
      if (!isOpen) {
        item.classList.add('open');
        q.setAttribute('aria-expanded', 'true');
      }
    });
  });

  // A link to /faq#booking (or any FAQ item id) opens that answer.
  function openFaqFromHash() {
    var id = window.location.hash.slice(1);
    if (!id || !/^[a-z0-9-]+$/.test(id)) return;
    var item = document.getElementById(id);
    if (!item || !item.classList.contains('faq-item') || item.classList.contains('open')) return;
    var q = item.querySelector('.faq-q');
    if (q) q.click();
  }
  openFaqFromHash();
  window.addEventListener('hashchange', openFaqFromHash);

  // Footer year
  document.querySelectorAll('.current-year').forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });

  /* ------------------------------------------------------------------
     AJAX form submit (Formspree)
     Formspree's own `_next` redirect is unreliable on the free plan and
     dumps visitors on formspree.io. Submitting with fetch() keeps the
     visitor on our domain, and WE send them to /thank-you ourselves.
     If JavaScript is unavailable the form still posts normally.
  ------------------------------------------------------------------ */
  document.querySelectorAll('form[data-ajax]').forEach(function (form) {
    var status = form.querySelector('.form-status');
    var submitBtn = form.querySelector('[type="submit"]');
    var originalLabel = submitBtn ? submitBtn.textContent : '';

    // The error status is added to, and later removed from, a field's
    // aria-describedby token list; any helper text it already points at stays.
    function describedBy(el, add) {
      if (!status || !status.id) return;
      var ids = (el.getAttribute('aria-describedby') || '').split(/\s+/).filter(function (t) { return t && t !== status.id; });
      if (add) ids.push(status.id);
      if (ids.length) el.setAttribute('aria-describedby', ids.join(' '));
      else el.removeAttribute('aria-describedby');
    }
    function unmark(el) { el.removeAttribute('aria-invalid'); describedBy(el, false); }
    // Entered values are never cleared on failure; only the error marking is.
    function clearInvalid() {
      form.querySelectorAll('[aria-invalid="true"]').forEach(unmark);
    }
    function markInvalid(name) {
      var el = form.elements[name];
      if (!el || !el.setAttribute) return;
      el.setAttribute('aria-invalid', 'true');
      describedBy(el, true);
    }
    form.addEventListener('input', function (e) {
      if (e.target && e.target.getAttribute && e.target.getAttribute('aria-invalid') === 'true') unmark(e.target);
    });

    form.addEventListener('submit', function (e) {
      if (!window.fetch) return;           // very old browser: normal POST
      e.preventDefault();

      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Sending…'; }
      if (status) { status.textContent = ''; status.className = 'form-status'; }
      clearInvalid();

      var body = new FormData(form);
      // The contact form also says where the visitor came from (see cvxVisitSource above).
      if (/\/contact-send\.php$/.test(form.getAttribute('action') || '')) {
        try { var src = cvxVisitSource.fields(); Object.keys(src).forEach(function (k) { body.set(k, src[k]); }); } catch (e) { /* never block the enquiry */ }
      }

      fetch(form.action, {
        method: 'POST',
        body: body,
        headers: { Accept: 'application/json' }
      })
        .then(function (res) {
          if (res.ok) {
            // Mark this session as having genuinely completed the form. The
            // generate_lead event fires on the thank-you page, not here, so a
            // failed submit can never be counted and the push is not lost to
            // the navigation that follows.
            try { sessionStorage.setItem('cvx_lead_pending', '1'); } catch (e) {}
            window.location.href = form.getAttribute('data-success') || '/thank-you';
            return;
          }
          return res.json().then(function (data) {
            // Formspree names the field on a validation error. Mark it, so the
            // failure is announced on the control and not only in the status line.
            if (data && data.errors) data.errors.forEach(function (x) { if (x.field) markInvalid(x.field); });
            var msg = (data && data.errors)
              ? data.errors.map(function (x) { return x.message; }).join(', ')
              : 'Something went wrong. Please email contact@callvixsolutions.com.';
            throw new Error(msg);
          });
        })
        .catch(function (err) {
          if (status) {
            // A network failure rejects with a TypeError whose message is the
            // browser's own ("Failed to fetch", "Load failed"). That is not
            // something to show a visitor, so it gets the fallback text.
            status.textContent = (err && err.name !== 'TypeError' && err.message) || 'Could not send. Please call (551) 373-6777 or email us.';
            status.className = 'form-status form-status--error';
          }
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalLabel; }
        });
    });
  });
});

/* ------------------------------------------------------------------
   Conversion instrumentation -> window.dataLayer (consumed by GTM)

   GTM container GTM-PJFS7HV5 and GA4 G-PNTC76HGVB are already live, so
   this file only PUSHES events. It never calls gtag() and never loads a
   tag of its own. These events reach GA4 only once the matching GTM
   custom-event triggers + GA4 event tags are created.

   Privacy: no names, emails, phone numbers or form contents are ever
   sent. Only a page_path and a normalized, non-identifying location.
------------------------------------------------------------------ */
(function () {
  function pushEvent(name, params) {
    try {
      window.dataLayer = window.dataLayer || [];
      /* GTM keeps every data layer key until it is overwritten, so an event that doesn't set a
         parameter would inherit the previous event's value (a phone click reported with the hero
         button's cta_location). Every event therefore sets each forwarded parameter, clearing
         the ones it doesn't use; the GA4 tag drops undefined values. */
      var payload = { event: name, page_path: window.location.pathname, link_location: undefined,
        cta_location: undefined, file_name: undefined, booking_step: undefined, booking_method: undefined };
      if (params) {
        for (var k in params) {
          if (Object.prototype.hasOwnProperty.call(params, k) && params[k]) payload[k] = params[k];
        }
      }
      window.dataLayer.push(payload);
    } catch (e) { /* analytics must never break the page */ }
  }
  window.cvxPushEvent = pushEvent;

  // Which call to action this is, when the markup says so. link_location stays
  // coarse (header, hero, cta_band...) so it is comparable across time;
  // cta_location is the specific one and falls back to link_location.
  function ctaLocation(el, fallback) {
    var marked = (el && el.closest) ? el.closest('[data-cta-location]') : null;
    return (marked && marked.getAttribute('data-cta-location')) || fallback;
  }

  // Normalized description of where a link sits. Contains no user data.
  function linkLocation(el) {
    if (!el || !el.closest) return 'body';
    if (el.closest('.site-header')) return 'header';
    if (el.closest('.mobile-nav')) return 'mobile_nav';
    if (el.closest('.site-footer')) return 'footer';
    // .cta-close is the homepage's full-width closing band; it reports as the
    // cta_band it replaced so link_location stays comparable with older data.
    if (el.closest('.cta-band, .cta-close')) return 'cta_band';
    if (el.closest('.hero, .page-hero')) return 'hero';
    if (el.closest('.article-body')) return 'article_body';
    return 'body';
  }

  /* ----------------------------------------------------------------
     Calendly popup + completed bookings (main site)

     A booking link used to open calendly.com in a new tab, so the click was
     the last thing this site could see. It now opens Calendly's own popup
     widget over the page, and Calendly's confirmation message becomes
     callvix_meeting_booked — the same event the campaign page sends from
     js/lp-booking.js. bookingKey() and the cvx_bookings store are copied
     from that file on purpose and a test holds the two copies identical:
     lp-booking.js is frozen, so it cannot be turned into a shared module.

     The links stay ordinary <a href>. Without JavaScript, with a modifier
     key, or if Calendly's script is blocked or slow, the visitor still
     reaches the booking page.

     Never on the campaign page: it embeds the calendar inline and
     lp-booking.js owns its listener. A second one here would count twice.

     Privacy: Calendly's message carries invitee and event URIs. Nothing
     from it is pushed. The URI is hashed into a storage key so a repeated
     message or a reload cannot count the booking twice, and that is all.
  ---------------------------------------------------------------- */
  var CALENDLY_ORIGIN = 'https://calendly.com';
  var BOOKING_URL = 'calendly.com/callvixsolutions/callvix-discovery-call';
  var WIDGET_JS = 'https://assets.calendly.com/assets/external/widget.js';
  var WIDGET_CSS = 'https://assets.calendly.com/assets/external/widget.css';
  var WIDGET_WAIT_MS = 3000;

  var widgetState = 'idle';      // idle -> loading -> ready | failed
  var opener = null;             // the link that opened the popup; focus goes back to it
  var openerCta = null;          // its cta_location, reported with the booking

  function isCampaignPage() { return !!document.querySelector('.calendly-inline-widget'); }
  function isBookingLink(a) { return !!a && (a.href || '').indexOf(BOOKING_URL) !== -1; }

  function loadWidget(done) {
    if (widgetState === 'ready') { done(true); return; }
    if (widgetState === 'failed') { done(false); return; }
    var finished = false;
    var finish = function (ok) {
      if (finished) return;
      finished = true;
      widgetState = ok ? 'ready' : 'failed';
      done(ok);
    };
    widgetState = 'loading';
    var css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = WIDGET_CSS;
    document.head.appendChild(css);
    var js = document.createElement('script');
    js.src = WIDGET_JS; js.async = true;
    js.onload = function () { finish(!!(window.Calendly && window.Calendly.initPopupWidget)); };
    js.onerror = function () { finish(false); };
    document.head.appendChild(js);
    setTimeout(function () { finish(false); }, WIDGET_WAIT_MS);
  }

  function closePopup() {
    try { if (window.Calendly && window.Calendly.closePopupWidget) window.Calendly.closePopupWidget(); } catch (e) {}
  }

  // Calendly builds the overlay; this makes it a dialog a keyboard can use.
  // Its close control is a bare <div>, and it has no Escape handling.
  function dressPopup() {
    var overlay = document.querySelector('.calendly-overlay');
    if (!overlay) return;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Book a discovery call');
    // Calendly caps the popup at 700px with !important, which also beats its own
    // phone rule and leaves a strip of page showing under the calendar. On a
    // narrow screen the popup should run to the bottom edge.
    var popup = overlay.querySelector('.calendly-popup');
    if (popup && window.matchMedia && window.matchMedia('(max-width: 975px)').matches) {
      popup.style.setProperty('max-height', 'none', 'important');
    }
    var frame = overlay.querySelector('iframe');
    if (frame && !frame.getAttribute('title')) frame.setAttribute('title', 'Calendly booking calendar');
    var close = overlay.querySelector('.calendly-popup-close');
    if (close) {
      close.setAttribute('role', 'button');
      close.setAttribute('tabindex', '0');
      close.setAttribute('aria-label', 'Close booking window');
      close.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); closePopup(); }
      });
      close.focus();
    } else if (frame) {
      frame.setAttribute('tabindex', '0'); frame.focus();
    }
    // Calendly removes the overlay itself on close, by whichever route.
    if (window.MutationObserver) {
      var watch = new MutationObserver(function () {
        if (document.querySelector('.calendly-overlay')) return;
        watch.disconnect();
        // A link inside the mobile menu is hidden again by the time the popup
        // closes (following it closes the menu), so focus goes to the menu button.
        var inMenu = opener && opener.closest && opener.closest('.mobile-nav');
        var back = inMenu ? document.querySelector('.nav-toggle') : opener;
        if (back && back.focus) back.focus();
      });
      watch.observe(document.body, { childList: true });
    }
  }

  function openBooking(a) {
    // Read now, not at page load: GTM adds the campaign and cta_location
    // parameters to this href after the page has rendered.
    var url = a.href;
    opener = a;
    openerCta = ctaLocation(a, linkLocation(a));
    a.setAttribute('aria-busy', 'true');
    loadWidget(function (ok) {
      a.removeAttribute('aria-busy');
      if (!ok) { window.location.href = url; return; }   // blocked or slow: book the ordinary way
      try {
        window.Calendly.initPopupWidget({ url: url });
        dressPopup();
      } catch (e) { window.location.href = url; }
    });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && document.querySelector('.calendly-overlay')) closePopup();
  });

  // A short, stable, non-reversible id for one booking. Used only to stop a
  // repeated postMessage counting twice; never sent anywhere.
  function bookingKey(payload) {
    var uri = '';
    try {
      uri = (payload && payload.invitee && payload.invitee.uri) ||
            (payload && payload.event && payload.event.uri) || '';
    } catch (e) { uri = ''; }
    if (!uri) return 'nokey';
    var h = 5381;
    for (var i = 0; i < uri.length; i++) { h = ((h << 5) + h + uri.charCodeAt(i)) | 0; }
    return 'b' + Math.abs(h).toString(36);
  }

  var seen = {};
  function alreadyCounted(key) {
    if (seen[key]) return true;
    seen[key] = 1;
    // survives an accidental reload of the confirmation state within the session
    try {
      var store = JSON.parse(sessionStorage.getItem('cvx_bookings') || '{}');
      if (store[key]) return true;
      store[key] = 1;
      sessionStorage.setItem('cvx_bookings', JSON.stringify(store));
    } catch (e) { /* private mode: in-memory dedupe above still applies */ }
    return false;
  }

  window.addEventListener('message', function (e) {
    if (e.origin !== CALENDLY_ORIGIN) return;
    var d = e.data;
    if (!d || typeof d !== 'object' || d.event !== 'calendly.event_scheduled') return;
    if (isCampaignPage()) return;           // lp-booking.js counts that page's bookings
    if (alreadyCounted(bookingKey(d.payload))) return;
    pushEvent('callvix_meeting_booked', { cta_location: openerCta || 'unknown', booking_method: 'calendly_popup' });
  }, false);

  // One delegated listener. tel: and mailto: are only reported, never
  // intercepted. A booking link is reported exactly as before and then, on a
  // plain click, opened in the popup instead of a new tab.
  document.addEventListener('click', function (e) {
    var a = (e.target && e.target.closest) ? e.target.closest('a[href]') : null;
    if (!a) return;
    var href = a.getAttribute('href') || '';
    var where = linkLocation(a);
    // Scorecard PDF links (scorecard page and /tools/) carry their own markers.
    if (a.getAttribute('data-scorecard-download') !== null) {
      pushEvent('vendor_scorecard_download', {
        link_location: a.getAttribute('data-link-location') || where,
        cta_location: a.getAttribute('data-cta-location') || where,
        file_name: 'pest-control-answering-service-vendor-scorecard.pdf'
      });
      return;
    }
    if (href.indexOf('tel:') === 0) {
      pushEvent('phone_click', { link_location: where });
    } else if (href.indexOf('mailto:') === 0) {
      pushEvent('email_click', { link_location: where });
    } else if (href.indexOf('calendly.com') !== -1) {
      pushEvent('calendly_click', { link_location: where, cta_location: ctaLocation(a, where) });
      // Ctrl/Cmd/Shift/Alt or a non-primary button means "open it my way".
      if (!isBookingLink(a) || isCampaignPage() || e.defaultPrevented) return;
      if (e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      if (widgetState !== 'loading') openBooking(a);
    }
  }, true);

  document.addEventListener('DOMContentLoaded', function () {
    // Print / Save-as-PDF on the call-script intake form. The button keeps its
    // inline onclick, so printing itself is unchanged.
    document.querySelectorAll('.print-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        // The event name stays the same for continuity; file_name says which
        // printable was printed (intake form or after-hours checklist).
        pushEvent('intake_form_print', {
          link_location: 'article_body',
          file_name: btn.getAttribute('data-file-name') || 'unknown_printable'
        });
      });
    });

    // generate_lead fires only on a genuine thank-you arrival that followed a
    // successful submit, and only once per session, so refreshing the
    // thank-you page (or landing on it directly) does not create a lead.
    if (!/^\/thank-you(\.html)?\/?$/.test(window.location.pathname)) return;
    try {
      if (sessionStorage.getItem('cvx_lead_fired') === '1') return;
      if (sessionStorage.getItem('cvx_lead_pending') !== '1') return;
      sessionStorage.removeItem('cvx_lead_pending');
      sessionStorage.setItem('cvx_lead_fired', '1');
      pushEvent('generate_lead', { cta_location: 'contact_form' });
    } catch (e) { /* storage blocked: stay silent rather than over-count */ }
  });
})();
