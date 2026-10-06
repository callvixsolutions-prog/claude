/* Landing-page booking + measurement — /pest-control-call-demo/
 *
 * Three jobs, deliberately kept apart so a click is never reported as a booking:
 *   1. CTA clicks            -> callvix_cta_click      (engagement)
 *   2. Scheduler engagement  -> callvix_booking_step   (engagement)
 *   3. A completed booking   -> callvix_meeting_booked (the conversion)
 *
 * Only (3) should ever be imported as a Google Ads conversion.
 *
 * Privacy: Calendly's event_scheduled payload carries invitee and event URIs
 * that resolve to the customer's name and email through the Calendly API. None
 * of that is pushed to the dataLayer. We derive a short non-reversible id from
 * the invitee URI purely to deduplicate repeated postMessages, and send nothing
 * else about the person.
 */
(function () {
  'use strict';

  var CALENDLY_ORIGIN = 'https://calendly.com';
  var dl = function () { window.dataLayer = window.dataLayer || []; return window.dataLayer; };

  function push(event, params) {
    try {
      var payload = { event: event, page_path: window.location.pathname };
      if (params) {
        for (var k in params) {
          if (Object.prototype.hasOwnProperty.call(params, k) && params[k] != null) payload[k] = params[k];
        }
      }
      dl().push(payload);
    } catch (e) { /* measurement must never break the page */ }
  }

  /* ---------------------------------------------------------------- CTAs -- */
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('[data-cta]') : null;
    if (!a) return;
    push('callvix_cta_click', { cta_location: a.getAttribute('data-cta') });
  }, true);

  /* ------------------------------------------------- Calendly embed events -- */
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

  // Calendly re-emits event_type_viewed when the widget re-renders, so the
  // engagement steps are counted once per page view rather than once per message.
  var stepsSent = {};
  function stepOnce(step) {
    if (stepsSent[step]) return;
    stepsSent[step] = 1;
    push('callvix_booking_step', { booking_step: step });
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
    // Reject anything that is not genuinely from Calendly, and anything whose
    // shape we do not recognise, before touching it.
    if (e.origin !== CALENDLY_ORIGIN) return;
    var d = e.data;
    if (!d || typeof d !== 'object') return;
    if (typeof d.event !== 'string' || d.event.indexOf('calendly.') !== 0) return;

    switch (d.event) {
      case 'calendly.event_type_viewed':
        stepOnce('calendar_viewed');
        break;
      case 'calendly.date_and_time_selected':
        stepOnce('time_selected');
        break;
      case 'calendly.event_scheduled':
        var key = bookingKey(d.payload);
        if (alreadyCounted(key)) return;
        push('callvix_meeting_booked', { booking_method: 'calendly_embed' });
        break;
      default:
        return; // profile_page_viewed and anything unrecognised are ignored
    }
  }, false);

  /* ------------------------------------------- callback form: context only -- */
  // Campaign context goes to the form backend, not into analytics parameters.
  document.addEventListener('DOMContentLoaded', function () {
    var lp = document.getElementById('cb_landing');
    var cp = document.getElementById('cb_campaign');
    if (lp) lp.value = window.location.pathname;
    if (cp) {
      try {
        var q = new URLSearchParams(window.location.search);
        var bits = [];
        ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid'].forEach(function (k) {
          var v = q.get(k);
          if (v) bits.push(k + '=' + v.slice(0, 120));
        });
        cp.value = bits.join('&').slice(0, 600);
      } catch (e) { /* leave blank */ }
    }

    /* ------------------------------------- sticky CTA, out of the way when booking -- */
    // The sticky bar is only useful in the stretch between the hero CTA and the
    // booking section. Showing it beside either one just duplicates a button
    // that is already on screen, and over the calendar it would cover controls.
    var sticky = document.getElementById('lpSticky');
    var book = document.getElementById('book');
    var heroCta = document.querySelector('.hero-cta');
    if (sticky && book && heroCta && 'IntersectionObserver' in window) {
      var visible = { hero: true, book: false };
      var sync = function () { sticky.hidden = visible.hero || visible.book; };
      sync();
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.target === heroCta) visible.hero = entry.isIntersecting;
          if (entry.target === book) visible.book = entry.isIntersecting;
        });
        sync();
      }, { rootMargin: '0px 0px -15% 0px' });
      io.observe(heroCta);
      io.observe(book);
    } else if (sticky) {
      sticky.hidden = true; // no IntersectionObserver: leave the page unobstructed
    }
  });
})();
