/* Callvix paid-traffic landing page (/pest-control-call-demo/), v2.
 *
 * Page-only script, no libraries. Loaded with `defer`.
 *
 * Measurement contract (GA4 reports must not break):
 *   callvix_meeting_booked  the booking conversion (deduplicated, same as v1)
 *   generate_lead           the callback conversion, only after Formspree says OK
 *   callvix_cta_click       primary CTA clicks, with cta_location
 *   callvix_booking_step    calendar_viewed / time_selected, as before
 *   everything else         new names from the v2 brief (lp_view, phone_click, ...)
 *
 * Privacy: nothing about the visitor goes into event parameters. For Google Ads
 * enhanced conversions, user_data (email, E.164 phone) is pushed on its own,
 * read by the Ads tag at generate_lead, and cleared immediately after.
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------ config -- */
  var SAMPLE_CALL_AUDIO = false;   // true once /assets/audio/sample-call.mp3 (+ .vtt) exist
  var LP_VIDEO = !!window.__LP_VIDEO; // the flag itself lives in the page's head script (pest-control-call-demo/index.html)
  var SHOW_TESTIMONIALS = true;    // only real, approved quotes below (first one approved 22 Oct 2026)
  var CALLBACK_PROMISE = 'shortly during U.S. business hours';
  /* { quote, excerpt?, name, title?, company, place, label?, photo?, result? }. Wording exactly as approved: no edits, stars or results. */
  var TESTIMONIALS = [{
    quote: 'Callvix Solutions took the time to understand how we run our business. Their team answers our calls professionally, follows our booking rules, and enters customer details and appointments accurately in FieldRoutes. Setup was straightforward, and they’ve been easy to work with.',
    excerpt: 'Their team answers our calls professionally, follows our booking rules, and enters appointments accurately in FieldRoutes.',
    name: 'Omar Abouhussein',
    title: 'Owner',
    company: 'PestMaster of Naperville & Wheaton',
    place: 'IL'
  }];
  var CALENDLY_URL = 'https://calendly.com/callvixsolutions/callvix-discovery-call';
  var CALENDLY_ORIGIN = 'https://calendly.com';
  var FORMSPREE = 'https://formspree.io/f/maqrpwqw';

  var doc = document, root = doc.documentElement;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, c) { return (c || doc).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || doc).querySelectorAll(s)); };

  /* --------------------------------------------------------- dataLayer -- */
  function dl() { window.dataLayer = window.dataLayer || []; return window.dataLayer; }
  function push(event, params) {
    try {
      var p = { event: event, page_path: location.pathname };
      if (params) for (var k in params) if (Object.prototype.hasOwnProperty.call(params, k) && params[k] != null) p[k] = params[k];
      dl().push(p);
    } catch (e) { /* measurement must never break the page */ }
  }
  function eventId(prefix) { return prefix + '.' + Date.now().toString(36) + '.' + Math.random().toString(36).slice(2, 8); }
  /* Meta Pixel: only if a pixel is already on the page (via GTM). Never loaded here. */
  function meta(name, params, id) {
    try { if (typeof window.fbq === 'function') window.fbq('track', name, params || {}, id ? { eventID: id } : undefined); } catch (e) {}
  }
  /* Microsoft Clarity loads inside GTM; queue calls the standard way until it arrives. */
  window.clarity = window.clarity || function () { (window.clarity.q = window.clarity.q || []).push(arguments); };
  function clarity() { try { window.clarity.apply(null, arguments); } catch (e) {} }

  /* ------------------------------------------- attribution (first touch) -- */
  var ATTR_KEYS = ['gclid', 'gbraid', 'wbraid', 'fbclid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'h'];
  var NINETY_DAYS = 90 * 864e5;
  var q; try { q = new URLSearchParams(location.search); } catch (e) { q = { get: function () { return null; } }; }
  function clip(v) { return String(v).replace(/[\u0000-\u001f<>]/g, '').slice(0, 200); }
  function readCookie(name) {
    try { var m = doc.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : null; } catch (e) { return null; }
  }
  function writeCookie(name, value, ms) {
    try { doc.cookie = name + '=' + encodeURIComponent(value) + '; max-age=' + Math.floor(ms / 1000) + '; path=/; SameSite=Lax; Secure'; } catch (e) {}
  }
  var current = {};
  ATTR_KEYS.forEach(function (k) { var v = q.get(k); if (v) current[k] = clip(v); });
  var first = null;
  try { var raw = localStorage.getItem('cvx_ft') || readCookie('cvx_ft'); if (raw) { first = JSON.parse(raw); if (!first || first.exp < Date.now()) first = null; } } catch (e) { first = null; }
  if (!first && Object.keys(current).length) {
    first = { v: current, ts: new Date().toISOString(), exp: Date.now() + NINETY_DAYS };
    var s = JSON.stringify(first);
    try { localStorage.setItem('cvx_ft', s); } catch (e) {}
    writeCookie('cvx_ft', s, NINETY_DAYS);
  }
  /* The current click wins for the click IDs on this visit; first touch fills the gaps. */
  function attr(k) { return current[k] || (first && first.v && first.v[k]) || ''; }
  var landingTs = (first && first.ts) || new Date().toISOString();
  /* Meta's _fbc, built from fbclid when the pixel hasn't set it. */
  if (current.fbclid && !readCookie('_fbc')) writeCookie('_fbc', 'fb.1.' + Date.now() + '.' + current.fbclid, NINETY_DAYS);

  var variant = window.__lpVariant || 'default';
  var trafficType = (function () {
    var src = (attr('utm_source') + '|' + (q.get('src') || '')).toLowerCase(), med = attr('utm_medium').toLowerCase();
    if (root.classList.contains('is-social') || current.fbclid || /(^|\|)(facebook|instagram|fb|ig)(\||$)/.test(src)) return 'social';
    if (current.gclid || current.gbraid || current.wbraid || /cpc|ppc|paid/.test(med) || /(^|\|)(google|bing)(\||$)/.test(src)) return 'search';
    return 'other';
  })();

  /* ---------------------------------------------------------- lp_view -- */
  function onReady(fn) { if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', fn); else fn(); }
  onReady(function () {
    push('lp_view', { lp_variant: variant, traffic_type: trafficType });
    clarity('set', 'lp_variant', variant);
    clarity('set', 'traffic_type', trafficType);
  });

  /* ------------------------------------------------- CTA + phone clicks -- */
  var lastCta = 'book_section';
  doc.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target : null; if (!t) return;
    var a = t.closest('[data-cta]');
    if (a) {
      lastCta = a.getAttribute('data-cta');
      push('callvix_cta_click', { cta_location: lastCta });
      if (a.getAttribute('href') === '#book') { e.preventDefault(); loadCalendly(); goToCalendar(); }
    }
    var p = t.closest('a[href^="tel:"]');
    if (p) {
      var id = eventId('contact');
      push('phone_click', { cta_location: p.getAttribute('data-phone') || 'other', event_id: id });
      meta('Contact', {}, id);
    }
    var top = t.closest('[data-top]');
    if (top) { e.preventDefault(); window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }); }
  }, true);

  /* Land with the calendar itself just under the sticky header, not the section top. */
  function goToCalendar() {
    var cal = $('#cal'), hdr = $('.hdr'), h = $('#book-h'); if (!cal) return;
    var y = cal.getBoundingClientRect().top + window.scrollY - ((hdr && hdr.offsetHeight) || 64) - 16;
    window.scrollTo({ top: Math.max(0, y), behavior: reduceMotion ? 'auto' : 'smooth' });
    if (h) { h.setAttribute('tabindex', '-1'); try { h.focus({ preventScroll: true }); } catch (e) {} }
  }

  /* ------------------------------------------------- header + reveal -- */
  onReady(function () {
    var hdr = $('.hdr');
    var onScroll = function () { if (hdr) hdr.classList.toggle('is-scrolled', window.scrollY > 8); };
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll();

    if (!reduceMotion && 'IntersectionObserver' in window) {
      var targets = $$('.sec-head, .prob-grid, .sc-grid, .how-grid, .cards6, .cmp-wrap, .calc, .pr-grid, .terms, .sys, .team');
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
      }, { rootMargin: '0px 0px -8% 0px' });
      targets.forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.top < window.innerHeight) return; // never hide something already on screen
        el.classList.add('rv'); io.observe(el);
      });
    }
  });

  /* ------------------------------------------------- scroll depth + Meta -- */
  (function () {
    var marks = [25, 50, 75, 90], sent = {};
    function check() {
      var h = doc.documentElement.scrollHeight - window.innerHeight; if (h <= 0) return;
      var pct = (window.scrollY / h) * 100;
      marks.forEach(function (m) {
        if (!sent[m] && pct >= m) {
          sent[m] = 1; push('scroll_depth', { percent: m });
          if (m === 50) meta('ViewContent', {}, eventId('view'));
        }
      });
    }
    window.addEventListener('scroll', function () { if (!check.t) check.t = setTimeout(function () { check.t = 0; check(); }, 200); }, { passive: true });
  })();

  /* ------------------------------------------------ hero live call card -- */
  onReady(function () {
    var card = $('#callcard'), timer = $('#ccTimer'); if (!card) return;
    /* Phones get the finished card at once (CSS already shows it); the type-in plays from 640px up. */
    var phone = window.matchMedia && window.matchMedia('(max-width: 639px)').matches;
    if (reduceMotion || phone || !('IntersectionObserver' in window)) { card.classList.add('done'); if (timer) timer.textContent = '00:06'; return; }
    var io = new IntersectionObserver(function (es) {
      if (!es[0].isIntersecting) return; io.disconnect();
      card.classList.add('play');
      var start = Date.now();
      var iv = setInterval(function () {
        var s = Math.floor((Date.now() - start) / 1000);
        if (timer) timer.textContent = '00:' + (s < 10 ? '0' : '') + s;
        if (s >= 6) { clearInterval(iv); card.classList.add('done'); }
      }, 250);
    }, { threshold: 0.35 });
    io.observe(card);
  });

  /* -------------------------------------------------------- sample call -- */
  onReady(function () {
    var player = $('#scPlayer'); if (!player) return;
    var lines = $$('#scLines li'), btn = $('#scPlay'), fill = $('#scFill'), bar = $('#scBar'), time = $('#scTime'), live = $('#scLive'), full = $('#scFull');
    var ho = $('#hoCard'); if (ho) ho.classList.add('armed');
    var speed = 1, idx = 0, playing = false, tm = null, elapsed = 0, lastTick = 0, typing = null, completed = false, audio = null, cues = null;
    /* Text-mode timing: a short pause plus reading time for each line (ms at 1x). */
    var durs = lines.map(function (li) { var n = (li.textContent || '').length; return 900 + n * 38; });
    var total = durs.reduce(function (a, b) { return a + b; }, 0);
    function fmt(ms) { var s = Math.round(ms / 1000); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
    function setProg(ms, tot) { var pct = Math.min(100, (ms / tot) * 100); if (fill) fill.style.width = pct + '%'; if (bar) bar.setAttribute('aria-valuenow', Math.round(pct)); if (time) time.textContent = fmt(ms); }
    function light(li) {
      var step = li.getAttribute('data-step') || li.getAttribute('data-chip');
      if (step && ho) {
        var key = step === 'access2' ? 'access' : step;
        $$('[data-field="' + key + '"]', ho).forEach(function (f) { f.classList.add('lit'); });
      }
    }
    function reveal(i) {
      var li = lines[i]; if (!li) return;
      lines.forEach(function (l) { l.classList.remove('now'); });
      li.classList.add('shown', 'now'); light(li);
      if (live) live.textContent = (li.querySelector('p') || li).textContent;
    }
    function stopTyping() { if (typing && typing.parentNode) typing.parentNode.removeChild(typing); typing = null; }
    function showTyping(i) {
      stopTyping(); if (reduceMotion) return;
      var li = lines[i]; if (!li) return;
      typing = doc.createElement('li'); typing.setAttribute('aria-hidden', 'true'); typing.className = 'shown';
      typing.innerHTML = '<span class="sc-typing"><i></i><i></i><i></i></span>';
      li.parentNode.insertBefore(typing, li);
    }
    /* Text mode (the default, until audio files exist) names the walkthrough; audio mode keeps its labels. */
    var TEXT_LABELS = { start: 'Start text walkthrough', playing: 'Pause walkthrough', paused: 'Resume walkthrough', done: 'Replay walkthrough' };
    function setPlaying(on) {
      playing = on; btn.classList.toggle('is-playing', on);
      if (mode !== 'audio') {
        var t = TEXT_LABELS[on ? 'playing' : (completed ? 'done' : (idx > 0 ? 'paused' : 'start'))];
        btn.setAttribute('aria-label', t); $('.sc-play-t', btn).textContent = t;
        return;
      }
      btn.setAttribute('aria-label', on ? 'Pause sample call' : 'Play sample call');
      $('.sc-play-t', btn).textContent = on ? 'Pause' : (completed ? 'Play again' : (idx > 0 ? 'Resume' : 'Play sample call'));
    }
    function finish(mode) {
      stopTyping(); completed = true; setPlaying(false);
      if (mode === 'audio') $('.sc-play-t', btn).textContent = 'Play again';
      push('sample_call_complete', { mode: mode });
    }
    /* ---- text mode ---- */
    function tick() {
      var now = Date.now(); elapsed += (now - lastTick) * speed; lastTick = now;
      var acc = 0, target = 0;
      for (var i = 0; i < durs.length; i++) { acc += durs[i]; if (elapsed >= acc) target = i + 1; }
      while (idx < target && idx < lines.length) { stopTyping(); reveal(idx); idx++; }
      if (idx < lines.length && !typing) showTyping(idx);
      setProg(elapsed, total);
      if (idx >= lines.length) { clearInterval(tm); tm = null; setProg(total, total); finish('text'); }
    }
    function playText() {
      if (completed) { reset(); }
      setPlaying(true); lastTick = Date.now();
      if (idx === 0 && elapsed === 0) { reveal(0); idx = 1; elapsed = durs[0]; }
      else if (idx === 1) reveal(0);
      tm = setInterval(tick, 120);
    }
    function pauseText() { clearInterval(tm); tm = null; stopTyping(); setPlaying(false); }
    function reset() {
      completed = false; idx = 0; elapsed = 0;
      lines.forEach(function (l) { l.classList.remove('shown', 'now'); });
      if (ho) $$('.lit', ho).forEach(function (f) { f.classList.remove('lit'); });
      setProg(0, total);
    }
    /* ---- audio mode (only when the files exist) ---- */
    function parseVtt(txt) {
      var out = [], re = /(\d{2}:)?(\d{2}):(\d{2})[.,](\d{3})\s*-->/g, m;
      while ((m = re.exec(txt))) out.push((m[1] ? parseInt(m[1], 10) * 3600 : 0) + parseInt(m[2], 10) * 60 + parseInt(m[3], 10) + parseInt(m[4], 10) / 1000);
      return out;
    }
    function setupAudio(done) {
      if (!SAMPLE_CALL_AUDIO) return done(false);
      var a = new Audio(); a.preload = 'metadata'; a.src = '/assets/audio/sample-call.mp3';
      var ok = false;
      a.addEventListener('loadedmetadata', function () { if (ok) return; ok = true; audio = a;
        fetch('/assets/audio/sample-call.vtt').then(function (r) { return r.ok ? r.text() : ''; }).then(function (t) { cues = parseVtt(t); done(true); }).catch(function () { cues = []; done(true); });
      });
      a.addEventListener('error', function () { if (!ok) { ok = true; done(false); } });
    }
    function syncAudio() {
      if (!audio) return;
      var t = audio.currentTime, target = 0;
      if (cues && cues.length) { for (var i = 0; i < cues.length && i < lines.length; i++) if (t >= cues[i]) target = i + 1; }
      else target = Math.min(lines.length, Math.floor((t / (audio.duration || 1)) * lines.length) + 1);
      while (idx < target) { reveal(idx); idx++; }
      setProg(t * 1000, (audio.duration || 1) * 1000);
    }
    var mode = 'text', ready = false, first = true;
    setupAudio(function (hasAudio) {
      ready = true;
      if (hasAudio) {
        mode = 'audio'; player.classList.add('is-audio');
        var note = $('#scNote'); if (note) note.hidden = true;
        if (!playing) setPlaying(false);
        audio.addEventListener('timeupdate', syncAudio);
        audio.addEventListener('ended', function () { while (idx < lines.length) { reveal(idx); idx++; } finish('audio'); });
      }
    });
    function play() {
      if (first || completed) { push('sample_call_play', { mode: mode }); first = false; }
      if (mode === 'audio' && audio) {
        if (completed) { reset(); audio.currentTime = 0; }
        audio.playbackRate = speed; audio.play(); setPlaying(true);
      } else playText();
    }
    function pause() { if (mode === 'audio' && audio) { audio.pause(); setPlaying(false); } else pauseText(); }
    btn.addEventListener('click', function () { playing ? pause() : play(); });
    $$('[data-speed]', player).forEach(function (b) {
      b.addEventListener('click', function () {
        speed = parseFloat(b.getAttribute('data-speed')) || 1;
        $$('[data-speed]', player).forEach(function (o) { o.setAttribute('aria-pressed', o === b ? 'true' : 'false'); });
        if (audio) audio.playbackRate = speed;
      });
    });
    full.addEventListener('click', function () {
      var on = !player.classList.contains('full');
      player.classList.toggle('full', on); full.setAttribute('aria-pressed', on ? 'true' : 'false');
      full.textContent = on ? 'Hide full transcript' : 'Show full transcript';
      if (on && ho) $$('.ho-fields div', ho).forEach(function (f) { f.classList.add('lit'); });
    });
    /* "See a sample call" in the hero scrolls here and starts the player. */
    $$('[data-play-sample]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        /* Social traffic with the video on: this link plays the hero video instead. */
        if (LP_VIDEO && root.classList.contains('is-social')) { var hv = $$('.hero-video').filter(function (el) { return el.offsetParent !== null; })[0]; var vb = hv && $('.vid-btn', hv); if (vb) vb.click(); return; }
        var sec = $('#sample-call'); if (sec) sec.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
        setTimeout(function () { if (!playing) play(); btn.focus({ preventScroll: true }); }, reduceMotion ? 0 : 600);
      });
    });
    /* Start with the greeting on screen so the player never looks empty. */
    lines[0].classList.add('shown'); idx = 1; elapsed = durs[0];
    setProg(elapsed, total);
  });

  /* -------------------------------------------------------------- video -- */
  /* Poster + play-button facade; nothing loads until the click. Social traffic gets the
     video in the hero (CSS shows the right slot from first paint); everyone else gets the
     section after the problem block. When it ends, an overlay offers the demo or a replay. */
  var VID = '/assets/video/callvix-lp-video';
  onReady(function () {
    if (!LP_VIDEO) return;
    var social = root.classList.contains('is-social');
    var slot = (social ? $$('.hero-video') : [$('#video')]).filter(function (el) { return el && el.offsetParent !== null; })[0];
    if (!slot) return;
    var box = $('[data-vid]', slot), btn = $('.vid-btn', slot); if (!box || !btn) return;
    $$('source[data-srcset]', box).forEach(function (s) { s.srcset = s.getAttribute('data-srcset'); });
    $$('img[data-src]', box).forEach(function (i) { i.src = i.getAttribute('data-src'); });
    if (social) { var lbl = $('#heroSecondaryLabel'); if (lbl) lbl.textContent = 'Watch how it works'; }
    btn.addEventListener('click', function () {
      var v = doc.createElement('video');
      v.controls = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.preload = 'none';
      v.poster = VID.replace('callvix-lp-video', 'callvix-lp-poster') + '.jpg';
      v.innerHTML = '<source src="' + VID + '.webm" type="video/webm"><source src="' + VID + '.mp4" type="video/mp4"><track kind="captions" src="' + VID + '.vtt" srclang="en" label="English" default>';
      var end = doc.createElement('div'); end.className = 'vid-end'; end.hidden = true;
      end.innerHTML = '<p>Want to see it with your own calls?</p><a class="btn btn--cta" href="#book">Book a 20-minute demo <span class="arr" aria-hidden="true">→</span></a><button type="button" class="vid-replay">↻ Replay</button>';
      box.innerHTML = ''; box.appendChild(v); box.appendChild(end);
      $('a', end).addEventListener('click', function (e) { e.preventDefault(); loadCalendly(); goToCalendar(); });
      $('.vid-replay', end).addEventListener('click', function () { end.hidden = true; v.currentTime = 0; v.play(); v.focus(); });
      v.addEventListener('ended', function () { end.hidden = false; try { $('a', end).focus({ preventScroll: true }); } catch (e) {} });
      v.addEventListener('play', function () { end.hidden = true; });
      var sent = {};
      v.addEventListener('play', function () { if (!sent.play) { sent.play = 1; push('video_play'); } });
      v.addEventListener('timeupdate', function () {
        if (!v.duration) return; var p = (v.currentTime / v.duration) * 100;
        [25, 50, 75].forEach(function (m) { if (p >= m && !sent[m]) { sent[m] = 1; push('video_progress', { percent: m }); } });
      });
      v.addEventListener('ended', function () { if (!sent[100]) { sent[100] = 1; push('video_progress', { percent: 100 }); } });
      try { if (v.textTracks && v.textTracks[0]) v.textTracks[0].mode = 'showing'; } catch (e) {}
      v.play();
    });
  });

  /* ------------------------------------------------- social layout -- */
  onReady(function () {
    if (!root.classList.contains('is-social')) return;
    var cmp = $('#compare'), pricing = $('#pricing');
    if (cmp && pricing && pricing.parentNode) pricing.parentNode.insertBefore(cmp, pricing.nextSibling);
  });

  /* ------------------------------------------------- scenario cards -- */
  onReady(function () {
    $$('.scen-card').forEach(function (c) { c.addEventListener('click', function () { c.classList.toggle('on'); }); });
  });

  /* ----------------------------------------------------- forwarding -- */
  onReady(function () {
    var box = $('#fwd'); if (!box) return;
    var cap = $('#fwdCap');
    var CAPS = { all: 'We act as your front desk during your coverage hours.', missed: 'Your office answers first; we handle overflow during your agreed coverage hours.' };
    $$('[data-fwd]', box).forEach(function (b) {
      b.addEventListener('click', function () {
        var m = b.getAttribute('data-fwd'); box.setAttribute('data-mode', m);
        $$('[data-fwd]', box).forEach(function (o) { o.setAttribute('aria-pressed', o === b ? 'true' : 'false'); });
        if (cap) cap.textContent = CAPS[m];
      });
    });
  });

  /* --------------------------------------------------- compare (mobile) -- */
  onReady(function () {
    var table = $('#cmp'); if (!table) return;
    $$('.seg--cmp [data-col]').forEach(function (b) {
      b.addEventListener('click', function () {
        var c = b.getAttribute('data-col'); table.setAttribute('data-show', c);
        $$('.seg--cmp [data-col]').forEach(function (o) { o.setAttribute('aria-pressed', o === b ? 'true' : 'false'); });
        push('compare_toggle', { column: c });
      });
    });
  });

  /* --------------------------------------------------------- calculator -- */
  var calcState = { touched: false, calls: 200, miss: 20, newp: 50, book: 50, val: 300 };
  var money0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  var num0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  var num1 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
  /* Exposed for the test suite: the same maths the page shows. */
  function calcMath(s) {
    var missed = s.calls * s.miss / 100;
    var jobs = missed * (s.newp / 100) * (s.book / 100);
    var risk = Math.round(jobs * s.val);
    return { missed: missed, jobs: jobs, risk: risk };
  }
  window.__lpCalc = calcMath;
  onReady(function () {
    var form = $('#calcForm'); if (!form) return;
    var fields = { calls: { unit: ' calls' }, miss: { unit: ' percent' }, newp: { unit: ' percent' }, book: { unit: ' percent' }, val: { unit: ' dollars' } };
    var sentInteract = false, debounce = 0;
    function render() {
      var r = calcMath(calcState);
      $('#o-missed').textContent = num1.format(r.missed);
      $('#o-jobs').textContent = num1.format(r.jobs);
      $('#o-risk').textContent = money0.format(r.risk);
    }
    Object.keys(fields).forEach(function (k) {
      var range = $('#c-' + k), box = $('#c-' + k + '-n'); if (!range || !box) return;
      var min = parseFloat(range.min), max = parseFloat(range.max);
      function set(v, from) {
        v = Math.min(max, Math.max(min, isNaN(v) ? min : v));
        calcState[k] = v; calcState.touched = true;
        if (from !== range) range.value = v;
        if (from !== box) box.value = v;
        range.setAttribute('aria-valuetext', num0.format(v) + fields[k].unit);
        render();
        if (!sentInteract) { clearTimeout(debounce); debounce = setTimeout(function () { if (!sentInteract) { sentInteract = true; push('calculator_interact'); } }, 600); }
      }
      range.addEventListener('input', function () { set(parseFloat(range.value), range); });
      box.addEventListener('change', function () { set(parseFloat(box.value), box); });
      box.addEventListener('input', function () { var v = parseFloat(box.value); if (!isNaN(v) && v >= min && v <= max) set(v, box); });
    });
    var cta = $('#calcCta');
    if (cta) cta.addEventListener('click', function () {
      var r = calcMath(calcState);
      push('calculator_cta', { revenue_at_risk: r.risk, calls_per_month: calcState.calls });
      if (calendlyLoaded) initCalendly(); // refresh the prefill with the new numbers
    });
    render();
  });
  function calcSummary() {
    if (!calcState.touched) return '';
    return 'Calls/month: ' + num0.format(calcState.calls) + ' · Miss rate: ' + calcState.miss + '%';
  }

  /* ---------------------------------------------------------------- FAQ -- */
  onReady(function () {
    $$('#faqList .fq').forEach(function (fq, i) {
      var b = $('button', fq), panel = $('.fa', fq); if (!b || !panel) return;
      if (b.getAttribute('aria-expanded') !== 'true') panel.hidden = true;
      b.addEventListener('click', function () {
        var open = b.getAttribute('aria-expanded') !== 'true';
        b.setAttribute('aria-expanded', open ? 'true' : 'false'); panel.hidden = !open;
        if (open) push('faq_open', { question_id: b.getAttribute('data-q') || String(i + 1) });
      });
    });
  });

  /* ------------------------------------------------------- testimonials -- */
  /* A non-breaking space before "&" stops a wrapped line from starting with it. */
  function place(t) { return t.company.replace(/ & /g, '\u00a0& ') + (t.place ? ', ' + t.place : ''); }
  function initials(name) { var p = String(name || '').trim().split(/\s+/); return ((p[0] || '').charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : '')).toUpperCase(); }
  /* Decorative opening quote mark (the quote text keeps its own quote marks). */
  function quoteMark(cls, size) {
    var NS = 'http://www.w3.org/2000/svg', svg = doc.createElementNS(NS, 'svg'), path = doc.createElementNS(NS, 'path');
    svg.setAttribute('class', cls); svg.setAttribute('viewBox', '0 0 40 32'); svg.setAttribute('width', size); svg.setAttribute('height', Math.round(size * 0.8));
    svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
    path.setAttribute('d', 'M0 32V20C0 9.5 6 2.3 17 0l2 4.2C12.5 6.3 9.4 10 9 16h8v16H0zm22 0V20C22 9.5 28 2.3 39 0l1 4.2C33.5 6.3 30.4 10 30 16h8v16H22z');
    path.setAttribute('fill', 'currentColor'); svg.appendChild(path); return svg;
  }
  onReady(function () {
    if (!SHOW_TESTIMONIALS || !TESTIMONIALS.length) return;
    /* Main quote(s): review cards just above pricing. One quote gets a single centred card; 2+ use the grid. */
    var tpl = $('#tplProof'), pricing = $('#pricing');
    if (tpl && pricing) {
      var frag = tpl.content.cloneNode(true), list = $('#proofList', frag);
      if (TESTIMONIALS.length === 1) list.classList.add('proof--one');
      TESTIMONIALS.forEach(function (t) {
        var f = doc.createElement('figure');
        f.appendChild(quoteMark('pf-mark', 40));
        var bq = doc.createElement('blockquote'); bq.textContent = '“' + t.quote + '”'; f.appendChild(bq);
        if (t.result) { var r = doc.createElement('p'); r.className = 'res'; r.textContent = t.result; f.appendChild(r); }
        var cap = doc.createElement('figcaption');
        if (t.photo) { var im = doc.createElement('img'); im.src = t.photo; im.alt = ''; im.width = 48; im.height = 48; im.loading = 'lazy'; cap.appendChild(im); }
        else { var av = doc.createElement('span'); av.className = 'pf-avatar'; av.setAttribute('aria-hidden', 'true'); av.textContent = initials(t.name); cap.appendChild(av); }
        var txt = doc.createElement('span'); txt.className = 'pf-txt';
        var who = doc.createElement('span'); who.className = 'pf-who'; who.textContent = t.name; txt.appendChild(who);
        var co = doc.createElement('span'); co.className = 'pf-co'; co.textContent = (t.title ? t.title + ', ' : '') + place(t); txt.appendChild(co);
        if (t.label) { var lb = doc.createElement('span'); lb.className = 'pf-label'; lb.textContent = t.label; txt.appendChild(lb); }
        cap.appendChild(txt);
        f.appendChild(cap); list.appendChild(f);
      });
      pricing.parentNode.insertBefore(frag, pricing);
    }
    /* Short excerpt in the booking section, from the same data, after the trust chips. */
    var ex = TESTIMONIALS.filter(function (t) { return t.excerpt; })[0], mini = $('#book .mini-trust');
    if (ex && mini) {
      var q = doc.createElement('figure'); q.className = 'book-quote';
      q.appendChild(quoteMark('bq-mark', 24));
      var qb = doc.createElement('blockquote'); qb.textContent = '“' + ex.excerpt + '”'; q.appendChild(qb);
      var qc = doc.createElement('figcaption');
      qc.textContent = '— ' + ex.name + (ex.title ? ', ' + ex.title : '') + ' · ' + place(ex) + (ex.label ? ' · ' + ex.label : '');
      q.appendChild(qc);
      mini.parentNode.insertBefore(q, mini.nextSibling); mini.parentNode.classList.add('has-quote');
    }
  });

  /* ----------------------------------------------------------- Calendly -- */
  var calendlyLoaded = false, calendlyLoading = false, formInfo = {};
  function calendlyUtm() {
    var gid = attr('gclid') || attr('gbraid') || attr('wbraid');
    var content = attr('utm_content');
    if (gid) content = content ? gid + '|' + content : gid;
    var u = {};
    if (attr('utm_source')) u.utmSource = attr('utm_source');
    if (attr('utm_medium')) u.utmMedium = attr('utm_medium');
    if (attr('utm_campaign')) u.utmCampaign = attr('utm_campaign');
    if (attr('utm_term')) u.utmTerm = attr('utm_term');
    if (content) u.utmContent = content.slice(0, 255);
    return u;
  }
  function calendlyPrefill() {
    var p = {}, notes = [];
    if (formInfo.name) p.name = formInfo.name;
    if (formInfo.email) p.email = formInfo.email;
    var cs = calcSummary(); if (cs) notes.push(cs);
    if (formInfo.company) notes.push('Company: ' + formInfo.company);
    if (formInfo.calls) notes.push('Calls/month: ' + formInfo.calls);
    if (notes.length) p.customAnswers = { a1: notes.join(' · ') };
    return p;
  }
  function calendlyUrl() {
    return CALENDLY_URL + '?hide_event_type_details=1&hide_landing_page_details=1&hide_gdpr_banner=1&primary_color=087480&text_color=1c2033';
  }
  function initCalendly() {
    var box = $('#cal'); if (!box || !window.Calendly || !window.Calendly.initInlineWidget) return;
    $$('iframe, .calendly-inline-widget', box).forEach(function (n) { n.parentNode.removeChild(n); });
    box.classList.remove('is-ready');
    var holder = doc.createElement('div'); holder.style.height = '100%'; box.appendChild(holder);
    try {
      window.Calendly.initInlineWidget({ url: calendlyUrl(), parentElement: holder, prefill: calendlyPrefill(), utm: calendlyUtm() });
      calendlyLoaded = true;
      var fr = $('iframe', holder);
      if (fr) fr.addEventListener('load', function () { box.classList.add('is-ready'); });
      setTimeout(function () { box.classList.add('is-ready'); }, 4000);
    } catch (e) { calendlyFailed(); }
  }
  function calendlyFailed() {
    var st = $('#calStatus'), tx = $('#calStatusText'), sp = $('#calSpin');
    if (tx) tx.textContent = 'The calendar didn’t load here. Use the link below to open it in a new tab.';
    if (sp) sp.style.display = 'none'; if (st) st.classList.add('is-error');
  }
  function loadCalendly() {
    if (calendlyLoaded || calendlyLoading) return;
    calendlyLoading = true;
    var s = doc.createElement('script'); s.src = 'https://assets.calendly.com/assets/external/widget.js'; s.async = true;
    s.onload = function () { calendlyLoading = false; initCalendly(); };
    s.onerror = function () { calendlyLoading = false; calendlyFailed(); };
    doc.head.appendChild(s);
    setTimeout(function () { if (!calendlyLoaded) calendlyFailed(); }, 15000);
  }
  onReady(function () {
    var book = $('#book'); if (!book) return;
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { io.disconnect(); loadCalendly(); } }, { rootMargin: '1200px 0px 1200px 0px' });
      io.observe(book);
    } else loadCalendly();
    /* Warm the calendar early, off the critical path: first scroll, browser idle time after
       the load event, or 3 s after load, whichever comes first. A CTA click then shows it at once. */
    var warmed = false;
    var warm = function () { if (warmed) return; warmed = true; window.removeEventListener('scroll', warm); loadCalendly(); };
    window.addEventListener('scroll', warm, { passive: true });
    var afterLoad = function () {
      setTimeout(warm, 3000);
      if ('requestIdleCallback' in window) window.requestIdleCallback(warm, { timeout: 3000 });
    };
    if (doc.readyState === 'complete') afterLoad(); else window.addEventListener('load', afterLoad);
  });

  /* Calendly postMessage events. Same dedupe as js/lp-booking.js (v1) and js/main.js. */
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
  var stepsSent = {};
  window.addEventListener('message', function (e) {
    if (e.origin !== CALENDLY_ORIGIN) return;
    var d = e.data;
    if (!d || typeof d !== 'object' || typeof d.event !== 'string' || d.event.indexOf('calendly.') !== 0) return;
    switch (d.event) {
      case 'calendly.page_height':
        var hpx = parseInt(d.payload && d.payload.height, 10), cbox = $('#cal');
        if (cbox && hpx >= 400 && hpx <= 2400) cbox.style.height = (hpx + 2) + 'px';
        break;
      case 'calendly.event_type_viewed':
        var box = $('#cal'); if (box) box.classList.add('is-ready');
        if (!stepsSent.view) { stepsSent.view = 1; push('callvix_booking_step', { booking_step: 'calendar_viewed' }); push('calendly_view'); }
        break;
      case 'calendly.date_and_time_selected':
        if (!stepsSent.time) { stepsSent.time = 1; push('callvix_booking_step', { booking_step: 'time_selected' }); push('calendly_time_selected'); }
        break;
      case 'calendly.event_scheduled':
        if (alreadyCounted(bookingKey(d.payload))) return;
        var id = eventId('schedule');
        push('callvix_meeting_booked', { booking_method: 'calendly_embed', cta_location: lastCta, event_id: id });
        meta('Schedule', {}, id);
        clarity('event', 'calendly_booked');
        break;
      default:
        return;
    }
  }, false);

  /* ------------------------------------------------------ callback form -- */
  function e164(raw) {
    var d = String(raw || '').replace(/\D/g, '');
    if (d.length === 10) return '+1' + d;
    if (d.length === 11 && d.charAt(0) === '1') return '+' + d;
    return '';
  }
  function fmtPhone(raw) {
    var d = String(raw || '').replace(/\D/g, '');
    if (d.length === 11 && d.charAt(0) === '1') d = d.slice(1);
    if (d.length !== 10) return raw;
    return '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6);
  }
  window.__lpE164 = e164;
  onReady(function () {
    var form = $('#cbForm'); if (!form) return;
    var prog = $('#cbProg'), done = $('#cbDone'), errBox = $('#cbError'), submit = $('#cbSubmit');
    var started = false, sending = false, leadSent = false;
    try { leadSent = sessionStorage.getItem('cvx_lead_sent') === '1'; } catch (e) {}

    /* hidden context */
    var lp = $('#cb_landing'); if (lp) lp.value = location.pathname;
    /* The visitor's time zone, so "best time to call" can be read in their local time. Not sent to dataLayer. */
    var tz = $('#cb_tz'); if (tz) { try { tz.value = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { tz.value = ''; } }
    var cp = $('#cb_campaign');
    if (cp) cp.value = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid'].map(function (k) { var v = attr(k); return v ? k + '=' + v.slice(0, 120) : ''; }).filter(Boolean).join('&').slice(0, 600);
    $$('input[data-attr]', form).forEach(function (inp) {
      var k = inp.getAttribute('data-attr');
      inp.value = k === 'ts' ? landingTs : (k === 'h' ? variant : attr(k));
    });

    form.addEventListener('focusin', function () { if (!started) { started = true; push('form_start'); } });

    function showErr(input, id, msg) {
      var p = $('#' + id); if (!p) return;
      if (msg && input && input.hasAttribute('aria-invalid') && p.textContent === msg) return;
      if (msg) { p.textContent = msg; p.hidden = false; if (input) input.setAttribute('aria-invalid', 'true'); }
      else { p.textContent = ''; p.hidden = true; if (input) input.removeAttribute('aria-invalid'); }
    }
    var V = {
      company: function () { var i = $('#cb-company'); var ok = i.value.trim().length >= 2; showErr(i, 'err-company', ok ? '' : 'Please enter your company name.'); return ok; },
      calls: function () { var ok = !!$('input[name="calls_per_month"]:checked', form); showErr(null, 'err-calls', ok ? '' : 'Please pick your rough call volume.'); return ok; },
      name: function () { var i = $('#cb-name'); var ok = i.value.trim().length >= 2; showErr(i, 'err-name', ok ? '' : 'Please enter your name.'); return ok; },
      phone: function () { var i = $('#cb-phone'); var ok = !!e164(i.value); showErr(i, 'err-phone', ok ? '' : 'Please enter a 10-digit U.S. phone number.'); return ok; },
      email: function () { var i = $('#cb-email'); var v = i.value.trim(); var ok = !v || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); showErr(i, 'err-email', ok ? '' : 'Please check the email address.'); return ok; }
    };
    /* Validate on blur, never on each keystroke. */
    [['cb-company', 'company'], ['cb-name', 'name'], ['cb-phone', 'phone'], ['cb-email', 'email']].forEach(function (p) {
      var i = $('#' + p[0]); if (!i) return;
      i.addEventListener('blur', function () { if (i.value.trim() || i.hasAttribute('aria-invalid')) V[p[1]](); });
      /* Clear an error the moment the value becomes valid (errors only ever appear on blur),
         so the message never disappears mid-tap and shifts the next control. */
      i.addEventListener('input', function () { if (i.hasAttribute('aria-invalid')) V[p[1]](); });
    });
    var ph = $('#cb-phone'); if (ph) ph.addEventListener('blur', function () { if (e164(ph.value)) ph.value = fmtPhone(ph.value); });
    $$('input[name="calls_per_month"]', form).forEach(function (r) { r.addEventListener('change', function () { V.calls(); }); });

    function goStep(n) {
      form.classList.toggle('at-2', n === 2);
      if (prog) prog.textContent = 'Step ' + n + ' of 2';
      var f = n === 2 ? $('#cb-name') : $('#cb-company'); if (f) f.focus({ preventScroll: false });
    }
    $('#cbNext').addEventListener('click', function () {
      var ok = V.company() & V.calls();
      if (!ok) { var bad = $('[aria-invalid="true"]', $('#cbStep1')) || $('input[name="calls_per_month"]', form); if (bad) bad.focus(); return; }
      var picked = $('input[name="calls_per_month"]:checked', form), bucket = (picked || {}).value || '';
      /* The Calendly note uses the visible label ("Not sure", not "not_sure"). */
      var pickedLabel = picked && picked.nextElementSibling ? picked.nextElementSibling.textContent : bucket;
      formInfo.company = $('#cb-company').value.trim().slice(0, 80); formInfo.calls = pickedLabel;
      push('form_step', { calls_bucket: bucket });
      goStep(2);
    });
    $('#cbBack').addEventListener('click', function () { goStep(1); });

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (sending) return;
      var ok = V.name() & V.phone() & V.email();
      if (!ok) { var bad = $('[aria-invalid="true"]', $('#cbStep2')); if (bad) bad.focus(); return; }
      sending = true; submit.disabled = true; submit.textContent = 'Sending…'; errBox.hidden = true;
      var fd = new FormData(form);
      fetch(FORMSPREE, { method: 'POST', body: fd, headers: { Accept: 'application/json' } })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (!res.ok || (res.j && res.j.errors)) throw new Error('formspree');
          var name = $('#cb-name').value.trim(), email = $('#cb-email').value.trim(), phone = e164($('#cb-phone').value);
          var bucket = ($('input[name="calls_per_month"]:checked', form) || {}).value || '';
          formInfo.name = name.slice(0, 80); if (email) formInfo.email = email.slice(0, 120);
          if (!leadSent) {
            leadSent = true;
            try { sessionStorage.setItem('cvx_lead_sent', '1'); } catch (e) {}
            var id = eventId('lead');
            var ud = { phone_number: phone }; if (email) ud.email = email.toLowerCase();
            dl().push({ user_data: ud });
            push('generate_lead', { cta_location: 'lp_callback', calls_bucket: bucket, event_id: id });
            dl().push({ user_data: undefined });
            meta('Lead', {}, id);
            clarity('event', 'form_submit');
          }
          var firstName = name.split(/\s+/)[0] || '';
          $('#cbDoneText').textContent = 'Thanks' + (firstName ? ', ' + firstName : '') + '. We’ll call you ' + CALLBACK_PROMISE + '.';
          form.hidden = true; if (prog) prog.hidden = true; done.hidden = false; done.focus();
          if (calendlyLoaded) initCalendly();
        })
        .catch(function () {
          errBox.hidden = false; submit.disabled = false; submit.textContent = 'Request my callback';
        })
        .then(function () { sending = false; });
    });
    var skip = $('.cb-skip', done);
    if (skip) skip.addEventListener('click', function (e) {
      e.preventDefault();
      if (!calendlyLoaded) loadCalendly();
      goToCalendar();
    });
  });

  /* -------------------------------------------------- sticky mobile bar -- */
  onReady(function () {
    var bar = $('#mbar'), hero = $('#heroCta'), book = $('#book'); if (!bar || !hero || !book || !('IntersectionObserver' in window)) return;
    var state = { hero: true, book: false, focus: false, kb: false };
    var mq = window.matchMedia('(max-width: 1023px)');
    function sync() {
      var show = mq.matches && !state.hero && !state.book && !state.focus && !state.kb;
      bar.hidden = !show; doc.body.classList.toggle('has-mbar', show);
    }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (en) { if (en.target === hero) state.hero = en.isIntersecting || en.boundingClientRect.top > 0; if (en.target === book) state.book = en.isIntersecting; });
      sync();
    });
    io.observe(hero); io.observe(book);
    doc.addEventListener('focusin', function (e) { if (e.target.matches && e.target.matches('input, select, textarea')) { state.focus = true; sync(); } });
    doc.addEventListener('focusout', function () { setTimeout(function () { var a = doc.activeElement; state.focus = !!(a && a.matches && a.matches('input, select, textarea')); sync(); }, 50); });
    if (window.visualViewport) {
      var base = window.visualViewport.height;
      window.visualViewport.addEventListener('resize', function () { var h = window.visualViewport.height; if (h > base) base = h; state.kb = h < base * 0.75; sync(); });
    }
    if (mq.addEventListener) mq.addEventListener('change', sync);
    sync();
  });
})();
