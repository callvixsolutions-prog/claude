/* Calendar page after the landing-page form (/pest-control-answering-service/schedule/).
 *
 * The guard at the top of the page's <head> has already decided this visit is valid (or sent the visitor
 * back, in which case window.__cvxBounce is set and nothing here runs).
 *
 *   - Greets the visitor by first name (sessionStorage, this tab only; never the URL).
 *   - Loads Calendly's inline embed with event details hidden, name and email prefilled, and the page's UTM
 *     parameters passed through. Its height follows Calendly's own size messages, so the calendar never
 *     scrolls inside the page. After booking, Calendly's confirmation shows in place.
 *   - Measurement, same names and dedupe as the earlier landing page:
 *       callvix_booking_step {booking_step: calendar_viewed | time_selected}
 *       callvix_meeting_booked {booking_method: calendly_embed}, once per booking
 */
(function () {
  'use strict';
  if (window.__cvxBounce) return;
  var CALENDLY = 'https://calendly.com/callvixsolutions/callvix-discovery-call';
  var CALENDLY_ORIGIN = 'https://calendly.com';
  var doc = document;
  var $ = function (s) { return doc.querySelector(s); };
  function stored(key) { try { return sessionStorage.getItem(key) || ''; } catch (e) { return ''; } }

  function record(name, params) {
    try {
      var p = { event: name, page_path: location.pathname, link_location: undefined, cta_location: undefined,
        file_name: undefined, booking_step: undefined, booking_method: undefined };
      if (params) Object.keys(params).forEach(function (k) { if (params[k]) p[k] = params[k]; });
      (window.dataLayer = window.dataLayer || []).push(p);
    } catch (e) { /* measurement must never break the page */ }
  }

  /* Greeting */
  var first = stored('cvx_lead_first').replace(/[^\p{L}\p{M}'’ .-]/gu, '').slice(0, 40).trim();
  var title = $('#cv3b-schedule-title');
  if (first && title) title.textContent = 'Thanks, ' + first + '. Pick a time for your 20-minute call.';

  /* Calendly */
  var box = $('#cv3b-cal'), status = $('#cv3b-cal-status'), fallback = $('#cv3b-cal-fallback');
  var query = {};
  try { new URLSearchParams(location.search).forEach(function (v, k) { query[k] = v.slice(0, 200); }); } catch (e) { /* old browser */ }
  var utm = {};
  [['utm_source', 'utmSource'], ['utm_medium', 'utmMedium'], ['utm_campaign', 'utmCampaign'], ['utm_term', 'utmTerm'], ['utm_content', 'utmContent']]
    .forEach(function (pair) { if (query[pair[0]]) utm[pair[1]] = query[pair[0]]; });
  var prefill = {};
  if (stored('cvx_lead_name')) prefill.name = stored('cvx_lead_name');
  if (stored('cvx_lead_email')) prefill.email = stored('cvx_lead_email');

  var ready = false;
  function failed() {
    if (ready) return;
    if (status) status.textContent = 'The calendar is taking too long to load.';
    if (fallback) fallback.hidden = false;
    if (box) box.removeAttribute('aria-busy');
  }
  function init() {
    if (!box || !window.Calendly || !window.Calendly.initInlineWidget) { failed(); return; }
    var holder = doc.createElement('div'); holder.className = 'cv3b-cal__frame'; box.appendChild(holder);
    try {
      window.Calendly.initInlineWidget({
        url: CALENDLY + '?hide_event_type_details=1&hide_landing_page_details=1&hide_gdpr_banner=1&primary_color=0a7c82&text_color=0e1a2f',
        parentElement: holder, prefill: prefill, utm: utm
      });
    } catch (e) { failed(); }
  }
  var s = doc.createElement('script');
  s.src = 'https://assets.calendly.com/assets/external/widget.js'; s.async = true;
  s.onload = init; s.onerror = failed;
  doc.head.appendChild(s);
  window.setTimeout(failed, 15000);

  /* Calendly's messages: size, steps, booking. Same dedupe as js/lp-booking.js and js/main.js. */
  function bookingKey(payload) {
    var uri = '';
    try { uri = (payload && payload.invitee && payload.invitee.uri) || (payload && payload.event && payload.event.uri) || ''; } catch (e) { uri = ''; }
    if (!uri) return 'nokey';
    var h = 5381;
    for (var i = 0; i < uri.length; i++) { h = ((h << 5) + h + uri.charCodeAt(i)) | 0; }
    return 'b' + Math.abs(h).toString(36);
  }
  var seen = {};
  function alreadyCounted(key) {
    if (seen[key]) return true;
    seen[key] = 1;
    try {
      var st = JSON.parse(sessionStorage.getItem('cvx_bookings') || '{}');
      if (st[key]) return true;
      st[key] = 1; sessionStorage.setItem('cvx_bookings', JSON.stringify(st));
    } catch (e) { /* private mode: the in-memory dedupe above still applies */ }
    return false;
  }
  var sent = {};
  window.addEventListener('message', function (e) {
    if (e.origin !== CALENDLY_ORIGIN) return;
    var d = e.data;
    if (!d || typeof d !== 'object' || typeof d.event !== 'string' || d.event.indexOf('calendly.') !== 0) return;
    switch (d.event) {
      case 'calendly.page_height':
        var h = parseInt(d.payload && d.payload.height, 10);
        if (box && h >= 400 && h <= 2600) box.style.height = (h + 2) + 'px';
        break;
      case 'calendly.event_type_viewed':
        ready = true;
        if (box) { box.classList.add('is-ready'); box.removeAttribute('aria-busy'); }
        if (fallback) fallback.hidden = true;
        if (!sent.view) { sent.view = 1; record('callvix_booking_step', { booking_step: 'calendar_viewed' }); }
        break;
      case 'calendly.date_and_time_selected':
        if (!sent.time) { sent.time = 1; record('callvix_booking_step', { booking_step: 'time_selected' }); }
        break;
      case 'calendly.event_scheduled':
        if (alreadyCounted(bookingKey(d.payload))) return;
        record('callvix_meeting_booked', { booking_method: 'calendly_embed' });
        break;
    }
  }, false);
}());
