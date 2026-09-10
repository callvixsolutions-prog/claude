// Mobile nav toggle
document.addEventListener('DOMContentLoaded', function () {
  var toggle = document.querySelector('.nav-toggle');
  var mobileNav = document.querySelector('.mobile-nav');
  if (toggle && mobileNav) {
    toggle.addEventListener('click', function () {
      mobileNav.classList.toggle('open');
      var expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!expanded));
    });
    mobileNav.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () { mobileNav.classList.remove('open'); });
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

    form.addEventListener('submit', function (e) {
      if (!window.fetch) return;           // very old browser: normal POST
      e.preventDefault();

      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Sending…'; }
      if (status) { status.textContent = ''; status.className = 'form-status'; }

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
            var msg = (data && data.errors)
              ? data.errors.map(function (x) { return x.message; }).join(', ')
              : 'Something went wrong. Please email contact@callvixsolutions.com.';
            throw new Error(msg);
          });
        })
        .catch(function (err) {
          if (status) {
            status.textContent = err.message || 'Could not send. Please call (551) 373-6777 or email us.';
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

  // Normalized description of where a link sits. Contains no user data.
  function linkLocation(el) {
    if (!el || !el.closest) return 'body';
    if (el.closest('.site-header')) return 'header';
    if (el.closest('.mobile-nav')) return 'mobile_nav';
    if (el.closest('.site-footer')) return 'footer';
    if (el.closest('.cta-band')) return 'cta_band';
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
    if (href.indexOf('tel:') === 0) {
      pushEvent('phone_click', { link_location: where });
    } else if (href.indexOf('mailto:') === 0) {
      pushEvent('email_click', { link_location: where });
    } else if (href.indexOf('calendly.com') !== -1) {
      pushEvent('calendly_click', { link_location: where, cta_location: where });
    }
  }, true);

  document.addEventListener('DOMContentLoaded', function () {
    // Print / Save-as-PDF on the call-script intake form. The button keeps its
    // inline onclick, so printing itself is unchanged.
    document.querySelectorAll('.print-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        pushEvent('intake_form_print', { link_location: 'article_body' });
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
