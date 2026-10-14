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

      fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
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
      var payload = { event: name, page_path: window.location.pathname };
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

  // One delegated listener. It never calls preventDefault(), so navigation,
  // dialling and mail clients behave exactly as before.
  document.addEventListener('click', function (e) {
    var a = (e.target && e.target.closest) ? e.target.closest('a[href]') : null;
    if (!a) return;
    var href = a.getAttribute('href') || '';
    var where = linkLocation(a);
    // Scorecard PDF links (scorecard page and /tools/) carry their own markers.
    if (a.hasAttribute('data-scorecard-download')) {
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
