/* Callvix Solutions landing page (/pest-control-answering-service/), live since 27 Oct 2026.
 *
 * What it does:
 *   - Every "Book a call" / "Book a 20-minute call" button scrolls to the lead form and focuses its first field.
 *   - The lead form (a normal HTML form that posts to send.php without JavaScript): inline validation, then a
 *     background JSON send to send.php, then the move to /schedule/ without waiting on a slow server.
 *   - The phone-only sticky button and the explainer video: an unlisted YouTube video (youtube-nocookie player),
 *     nothing loads before play; falls back to the self-hosted MP4 if YouTube can't load.
 *
 * Measurement (names unchanged from the earlier landing page; GTM forwards them to GA4, Google Ads and Meta):
 *   callvix_cta_click     {cta_location}   a booking button
 *   callvix_booking_step  {booking_step}   details_started (first use of the form), details_sent (form accepted)
 *   generate_lead         {cta_location}   once per session, when the lead is sent (see sendLead)
 *   callvix_video_play                     once per page view
 *   callvix_video_progress {video_percent} 50 and 100, once each per page view (retargeting video viewers)
 * generate_lead carries event_id; the same id goes to send.php, which sends the lead to Meta's Conversions API, so
 * Meta counts the browser and server copies once.
 * GTM keeps every data layer key until it is overwritten, so every event sets each forwarded parameter and
 * clears the ones it doesn't use (same fix as js/main.js, 26 Oct 2026).
 *
 * Privacy: the visitor's details never go into event parameters or the URL. Email and phone are pushed as
 * user_data for the ad tag's enhanced conversions just before generate_lead and cleared straight after.
 * First name, full name and email are kept in sessionStorage (this tab only) to prefill the calendar.
 */
(function () {
  'use strict';
  var root = document.documentElement;
  if (!root.hasAttribute('data-callvix-v3b')) return;

  var LP_VIDEO = true;                       // false removes the video block; nothing else changes
  var ENDPOINT = '/pest-control-answering-service/send.php';
  var SCHEDULE = '/pest-control-answering-service/schedule/';
  var SEND_WAIT_MS = 1200;                   // the longest the visitor waits for the server before moving on
  var TRACKING = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid'];
  var UTM = TRACKING.slice(0, 5);

  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------- dataLayer ---------------- */
  function record(name, params, extra) {
    try {
      var p = { event: name, page_path: location.pathname, link_location: undefined, cta_location: undefined,
        file_name: undefined, booking_step: undefined, booking_method: undefined, event_id: undefined, video_percent: undefined };
      if (params) Object.keys(params).forEach(function (k) { if (params[k]) p[k] = params[k]; });
      if (extra) Object.keys(extra).forEach(function (k) { p[k] = extra[k]; });
      (window.dataLayer = window.dataLayer || []).push(p);
    } catch (e) { /* measurement must never break the page */ }
  }
  function store(key, value) { try { sessionStorage.setItem(key, value); } catch (e) { /* private mode */ } }
  function stored(key) { try { return sessionStorage.getItem(key); } catch (e) { return null; } }

  var query = {};
  try { new URLSearchParams(location.search).forEach(function (v, k) { query[k] = v; }); } catch (e) { /* old browser */ }
  function utmQuery() {
    var parts = [];
    UTM.forEach(function (k) { if (query[k]) parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(query[k].slice(0, 200))); });
    return parts.length ? '?' + parts.join('&') : '';
  }

  /* ---------------- tracked-visit memory ----------------
     A visit that opens this page with any utm_* / gclid / fbclid is remembered in this browser (localStorage):
     the first one for 90 days, and the latest one. Both go out only with the lead form, so the lead email
     says which ad brought the person even when they come back later another way. */
  var VISIT_DAYS = 90;
  function readVisit(key) {
    try {
      var v = JSON.parse(localStorage.getItem(key) || 'null');
      return v && typeof v.ts === 'number' && Date.now() - v.ts < VISIT_DAYS * 864e5 ? v : null;
    } catch (e) { return null; }
  }
  function writeVisit(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* storage blocked */ } }
  (function () {
    var v = { ts: Date.now() }, tagged = false;
    TRACKING.forEach(function (k) { if (query[k]) { v[k] = query[k].slice(0, 200); tagged = true; } });
    if (!tagged) return;
    if (!readVisit('cvx_visit_first')) writeVisit('cvx_visit_first', v);
    writeVisit('cvx_visit_latest', v);
  }());
  function describeVisit(v) {
    if (!v) return '';
    var parts = [(v.utm_source || '(no source)') + ' / ' + (v.utm_medium || '(no medium)')];
    if (v.utm_campaign) parts.push('campaign ' + v.utm_campaign);
    if (v.utm_content) parts.push('ad ' + v.utm_content);
    if (v.utm_term) parts.push('term ' + v.utm_term);
    if (v.gclid) parts.push('gclid ' + v.gclid);
    if (v.fbclid) parts.push('fbclid ' + v.fbclid);
    parts.push('on ' + new Date(v.ts).toISOString().slice(0, 10));
    return parts.join(', ').slice(0, 900);
  }

  /* ---------------- booking buttons ---------------- */
  var lead = $('#cv3b-lead'), form = $('#cv3b-form'), firstField = $('#cv3b-name');
  var lastCta = 'direct';
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('[data-cv3b-book]');
    if (!a || !lead) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    lastCta = a.getAttribute('data-cta') || 'other';
    record('callvix_cta_click', { cta_location: lastCta });
    lead.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    if (firstField) firstField.focus({ preventScroll: true });
  });

  /* ---------------- lead form ---------------- */
  if (form) {
    form.noValidate = true;                  // the script's own messages replace the browser's bubbles
    var submit = $('#cv3b-submit'), alertBox = $('#cv3b-form-alert');
    var pageUrl = location.origin + location.pathname;
    form.elements.page_url.value = pageUrl;
    TRACKING.forEach(function (k) { if (form.elements[k]) form.elements[k].value = (query[k] || '').slice(0, 200); });

    // Time since the page loaded (not since the first click in the form: autofill can complete the form in a
    // second, and send.php treats anything under 3 s as a bot).
    var openedAt = Date.now(), started = false, busy = false;
    form.addEventListener('focusin', function () {
      if (started) return;
      started = true;
      record('callvix_booking_step', { booking_step: 'details_started', cta_location: lastCta });
    });

    var digits = function (v) { var d = String(v || '').replace(/\D/g, ''); return d.length === 11 && d.charAt(0) === '1' ? d.slice(1) : d; };
    var isPhone = function (v) { return /^[2-9]\d{2}[2-9]\d{6}$/.test(digits(v)); };
    var isEmail = function (v) { return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(v) && v.length <= 120; };
    var CHECKS = {
      name: function (v) { return v.length >= 2 ? '' : 'Please enter your name.'; },
      business: function (v) { return v.length >= 2 ? '' : 'Please enter your business name.'; },
      phone: function (v) { return isPhone(v) ? '' : 'Please enter a 10-digit U.S. mobile number, like (555) 123-4567.'; },
      email: function (v) { return isEmail(v) ? '' : 'Please enter an email address, like name@company.com.'; }
    };
    var ICON = '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/></svg>';
    function show(name, msg) {
      var input = form.elements[name], err = document.getElementById('cv3b-' + name + '-error');
      if (!input || !err) return;
      if (msg) {
        input.setAttribute('aria-invalid', 'true');
        err.innerHTML = ICON; err.appendChild(document.createTextNode(msg)); err.hidden = false;
      } else {
        input.removeAttribute('aria-invalid'); err.textContent = ''; err.hidden = true;
      }
    }
    function check(name) { var msg = CHECKS[name](form.elements[name].value.trim()); show(name, msg); return !msg; }
    Object.keys(CHECKS).forEach(function (name) {
      var input = form.elements[name];
      // Checked when the visitor leaves a field (never on each keystroke); an error clears as soon as it's fixed.
      input.addEventListener('blur', function () { if (input.value.trim() || input.hasAttribute('aria-invalid')) check(name); });
      input.addEventListener('input', function () { if (input.hasAttribute('aria-invalid')) check(name); });
    });
    form.elements.phone.addEventListener('blur', function () {
      var d = digits(form.elements.phone.value);
      if (/^\d{10}$/.test(d)) form.elements.phone.value = '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6);
    });

    function payload() {
      var p = {};
      ['name', 'business', 'email', 'website', 'page_url'].concat(TRACKING).forEach(function (k) { p[k] = (form.elements[k] ? form.elements[k].value : '').trim(); });
      p.phone = digits(form.elements.phone.value);
      p.first_visit = describeVisit(readVisit('cvx_visit_first'));
      p.latest_visit = describeVisit(readVisit('cvx_visit_latest'));
      p.elapsed_ms = Date.now() - openedAt;
      p.event_id = 'lead.' + Date.now().toString(36) + '.' + Math.random().toString(36).slice(2, 8);
      return p;
    }
    function post(body) {
      return fetch(ENDPOINT, {
        method: 'POST', credentials: 'same-origin', keepalive: true,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: body
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, j: j || {} }; });
      });
    }

    /* Send, but never keep the visitor waiting on a slow server: after SEND_WAIT_MS the move to the calendar
       goes ahead while the request finishes in the background (keepalive). A failed first attempt is retried
       once, in the background. generate_lead fires once per session when the lead is on its way: the server
       said ok, or it is still in flight at the cut-off, or it is being retried. Not when the server rejected
       it as spam, and not when it asked for a field to be corrected (the visitor stays on the form). */
    function sendLead(p) {
      var body = JSON.stringify(p), done = false;
      return new Promise(function (resolve) {
        var finish = function (outcome) { if (!done) { done = true; resolve(outcome); } };
        window.setTimeout(function () { finish('pending'); }, SEND_WAIT_MS);
        post(body).then(function (res) {
          if (res.status === 200 && res.j.ok === true) return finish('ok');
          if (res.status === 400 && res.j.error === 'invalid') return finish({ invalid: res.j.fields || [] });
          if (res.status === 400 && res.j.error === 'rejected') return finish('rejected');
          if (res.status === 429) return finish('ok');            // already sent several times this hour
          post(body).catch(function () {});                       // one retry, in the background
          finish('retrying');
        }).catch(function () {
          post(body).catch(function () {});
          finish('retrying');
        });
      });
    }

    function goToCalendar(fireLead, p) {
      var go = function () { location.assign(SCHEDULE + utmQuery()); };
      if (!fireLead || stored('cvx_lp_lead_sent') === '1') { window.setTimeout(go, 0); return; }
      store('cvx_lp_lead_sent', '1');
      var left = false, leave = function () { if (!left) { left = true; go(); } };
      try {
        var ud = { phone_number: '+1' + p.phone }; if (p.email) ud.email = p.email.toLowerCase();
        (window.dataLayer = window.dataLayer || []).push({ user_data: ud });
        record('callvix_booking_step', { booking_step: 'details_sent', cta_location: lastCta });
        // GTM calls eventCallback once its tags for this event have run; without GTM the timer moves on.
        record('generate_lead', { cta_location: lastCta, event_id: p.event_id }, { eventCallback: leave, eventTimeout: 1000 });
        window.dataLayer.push({ user_data: undefined });
      } catch (e) { /* measurement must never block the visitor */ }
      window.setTimeout(leave, 1100);           // GTM blocked or not loaded (e.g. an ad blocker)
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (busy) return;
      var bad = Object.keys(CHECKS).filter(function (name) { return !check(name); });
      if (bad.length) { form.elements[bad[0]].focus(); return; }
      busy = true; alertBox.hidden = true;
      submit.disabled = true; submit.setAttribute('aria-busy', 'true'); submit.textContent = 'One moment…';
      var p = payload();
      var name = form.elements.name.value.trim();
      store('cvx_lead_first', name.split(/\s+/)[0].slice(0, 40));
      store('cvx_lead_name', name.slice(0, 80));
      store('cvx_lead_email', p.email.slice(0, 120));
      sendLead(p).then(function (outcome) {
        if (outcome && outcome.invalid) {
          // The server disagreed with a field: show it and keep everything the visitor typed.
          var fields = outcome.invalid.filter(function (f) { return CHECKS[f]; });
          fields.forEach(function (f) { show(f, CHECKS[f]('') || 'Please check this field.'); });
          if (!fields.length) { alertBox.textContent = 'Something didn’t go through. Please check your details and try again.'; alertBox.hidden = false; }
          busy = false; submit.disabled = false; submit.removeAttribute('aria-busy'); submit.textContent = 'Continue to pick a time';
          if (fields.length) form.elements[fields[0]].focus();
          return;
        }
        store('lead_ok', '1');               // the calendar page checks and clears this before anything else runs
        goToCalendar(outcome !== 'rejected', p);
      });
    });
  }

  /* ---------------- phone-only sticky button ---------------- */
  var sticky = $('#cv3b-sticky'), heroCta = $('#cv3b-hero-cta'), bookSection = $('#book');
  if (sticky && heroCta && bookSection && 'IntersectionObserver' in window && window.matchMedia) {
    var phoneMq = window.matchMedia('(max-width: 768px)');
    var heroGone = false, bookingReached = false;
    var update = function () {
      var a = document.activeElement, typing = !!a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
      var showBar = phoneMq.matches && heroGone && !bookingReached && !typing;
      if (sticky.hidden === showBar) sticky.hidden = !showBar;
      root.classList.toggle('cv3b-has-sticky', showBar);
    };
    new IntersectionObserver(function (entries) {
      var en = entries[entries.length - 1];
      heroGone = !en.isIntersecting && en.boundingClientRect.bottom <= 0;
      update();
    }).observe(heroCta);
    new IntersectionObserver(function (entries) {
      var en = entries[entries.length - 1];
      bookingReached = en.isIntersecting || en.boundingClientRect.top < 0;
      update();
    }).observe(bookSection);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', function () { window.setTimeout(update, 0); });
    if (phoneMq.addEventListener) phoneMq.addEventListener('change', update);
  }

  /* ---------------- explainer video ---------------- */
  if (LP_VIDEO) {
    var vtpl = document.getElementById('cv3b-tpl-video'), chips = $('.cv3b-trained');
    if (vtpl && chips) {
      chips.parentNode.insertBefore(vtpl.content.cloneNode(true), chips);
      var frame = $('[data-cv3b-vid]'), facade = frame && $('.cv3b-video__facade', frame), played = false;
      var reached = {};
      var progress = function (pct) { if (!reached[pct]) { reached[pct] = 1; record('callvix_video_progress', { video_percent: String(pct) }); } };
      var markPlay = function () { if (!played) { played = true; record('callvix_video_play'); } };

      /* The video plays from YouTube (unlisted, privacy-enhanced youtube-nocookie.com player). Our own host was too
         slow and uneven for iPhone Safari, which never started the self-hosted file (28 Oct 2026). Nothing from
         YouTube loads until the visitor presses play. If YouTube can't load in 8 s, the self-hosted MP4 plays instead. */
      var YT_ID = 'nQgnjTaxi8A';
      var started = false;
      function playYouTube() {
        var holder = document.createElement('div'); holder.className = 'cv3b-video__player cv3b-video__yt';
        frame.replaceChildren(holder);
        var timer = window.setTimeout(function () { if (!started) playSelfHosted(); }, 8000);
        function build() {
          if (started || !frame.contains(holder)) return;
          started = true; window.clearTimeout(timer);
          var poll = null;
          new window.YT.Player(holder, {
            host: 'https://www.youtube-nocookie.com', videoId: YT_ID, width: '100%', height: '100%',
            playerVars: { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1, cc_load_policy: 0 },
            events: {
              onReady: function (e) { try { e.target.playVideo(); } catch (x) { /* iPhone may want a second tap on YouTube's own button */ } },
              onError: function () { if (frame.contains(holder) || frame.querySelector('iframe')) playSelfHosted(); },
              onStateChange: function (e) {
                var p = e.target;
                if (e.data === 1) {
                  markPlay();
                  if (!poll) poll = window.setInterval(function () { try { var d = p.getDuration(); if (d && p.getCurrentTime() / d >= 0.5) progress(50); } catch (x) { /* player gone */ } }, 1000);
                } else if (e.data === 0) { progress(50); progress(100); if (poll) { window.clearInterval(poll); poll = null; } }
              }
            }
          });
        }
        if (window.YT && window.YT.Player) { build(); return; }
        var prev = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = function () { if (prev) try { prev(); } catch (x) { /* other page code */ } build(); };
        var s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; s.async = true;
        s.onerror = function () { if (!started) { window.clearTimeout(timer); playSelfHosted(); } };
        document.head.appendChild(s);
      }
      if (facade) facade.addEventListener('click', playYouTube);

      function playSelfHosted() {
        started = true;
        var VID = '/pest-control-answering-service/assets/video/callvix-lp-video';
        var v = document.createElement('video');
        v.controls = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.preload = 'none';
        v.poster = '/pest-control-answering-service/assets/video/callvix-lp-poster.jpg';
        v.className = 'cv3b-video__player';
        v.setAttribute('aria-labelledby', 'cv3b-video-title');
        /* captions are burned into the picture, so the VTT track is listed but off by default (no "default" attribute) */
        /* MP4 (H.264/AAC) first: every phone plays it, including older iPhones that may accept WebM and then fail to decode it */
        v.innerHTML = '<source src="' + VID + '.mp4" type="video/mp4"><source src="' + VID + '.webm" type="video/webm"><track kind="captions" src="' + VID + '.vtt" srclang="en" label="English">';
        frame.replaceChildren(v);
        v.addEventListener('play', markPlay);
        v.addEventListener('timeupdate', function () { if (v.duration && v.currentTime / v.duration >= 0.5) progress(50); });
        v.addEventListener('ended', function () { progress(50); progress(100); });
        var pl = v.play(); if (pl && pl.catch) pl.catch(function () { /* the visitor can press play on the native controls */ });
      }
    }
  }
}());
