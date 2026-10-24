/**
 * Pre-flight for switching on the landing-page video (README §9, "Going live with the video").
 * Run: node scripts/check-lp-video.mjs [dir]. Not part of `npm test`, because the files don't exist yet.
 *
 * Checks the brief's switch-on rules: all five files present and non-empty; MP4 1920×1080 and ≤ 10 MB;
 * posters 1280×720; the VTT parses and its last cue ends within the video's duration.
 * It can't hear the voice-over: confirming it is a real person stays a human check.
 */
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = process.argv[2] || join(fileURLToPath(new URL('..', import.meta.url)), 'assets/video');
const F = { mp4: 'callvix-lp-video.mp4', webm: 'callvix-lp-video.webm', vtt: 'callvix-lp-video.vtt', webp: 'callvix-lp-poster.webp', jpg: 'callvix-lp-poster.jpg' };
const problems = [];
const buf = {};
for (const [k, f] of Object.entries(F)) {
  try { const st = statSync(join(DIR, f)); if (!st.size) problems.push(`empty: ${f}`); else buf[k] = readFileSync(join(DIR, f)); }
  catch { problems.push(`missing: ${f}`); }
}

/* MP4: walk boxes to moov > mvhd (duration) and the video trak > tkhd (width/height, 16.16 fixed point). */
function mp4Info(b) {
  const out = { dur: null, w: 0, h: 0 };
  const walk = (s, e) => {
    for (let i = s; i + 8 <= e;) {
      let size = b.readUInt32BE(i); const type = b.toString('latin1', i + 4, i + 8); let hdr = 8;
      if (size === 1) { size = Number(b.readBigUInt64BE(i + 8)); hdr = 16; } else if (size === 0) size = e - i;
      if (size < hdr) break;
      if (['moov', 'trak'].includes(type)) walk(i + hdr, i + size);
      if (type === 'mvhd') { const v = b[i + hdr]; const ts = v ? b.readUInt32BE(i + hdr + 20) : b.readUInt32BE(i + hdr + 12); const d = v ? Number(b.readBigUInt64BE(i + hdr + 24)) : b.readUInt32BE(i + hdr + 16); out.dur = d / ts; }
      if (type === 'tkhd') { const v = b[i + hdr]; const off = i + hdr + (v ? 88 : 76); const w = b.readUInt32BE(off) / 65536, h = b.readUInt32BE(off + 4) / 65536; if (w * h > out.w * out.h) { out.w = w; out.h = h; } }
      i += size;
    }
  };
  walk(0, b.length); return out;
}
/* JPEG: first SOF0-2 marker. WebP: VP8 / VP8L / VP8X headers. */
function jpgSize(b) { for (let i = 2; i + 9 < b.length;) { if (b[i] !== 0xff) return null; const m = b[i + 1], len = b.readUInt16BE(i + 2); if (m >= 0xc0 && m <= 0xc2) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)]; i += 2 + len; } return null; }
function webpSize(b) {
  const t = b.toString('latin1', 12, 16);
  if (t === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  if (t === 'VP8L') { const n = b.readUInt32LE(21); return [(n & 0x3fff) + 1, ((n >> 14) & 0x3fff) + 1]; }
  if (t === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  return null;
}
const ts = (s) => { const p = s.split(':').map(Number); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]; };

let duration = null;
if (buf.mp4) {
  if (buf.mp4.length > 10 * 1024 * 1024) problems.push(`MP4 is ${(buf.mp4.length / 1048576).toFixed(1)} MB (must be ≤ 10 MB)`);
  const m = mp4Info(buf.mp4); duration = m.dur;
  if (m.w !== 1920 || m.h !== 1080) problems.push(`MP4 is ${m.w}×${m.h} (must be 1920×1080)`);
  if (!duration) problems.push('MP4 duration could not be read');
}
if (buf.webm && buf.webm.readUInt32BE(0) !== 0x1a45dfa3) problems.push('WebM file is not a WebM/Matroska container');
for (const [k, fn] of [['jpg', jpgSize], ['webp', webpSize]]) if (buf[k]) { const s = fn(buf[k]); if (!s || s[0] !== 1280 || s[1] !== 720) problems.push(`${F[k]} is ${s ? s.join('×') : 'unreadable'} (must be 1280×720)`); }
if (buf.vtt) {
  const t = buf.vtt.toString('utf8').replace(/^﻿/, '');
  if (!/^WEBVTT/.test(t)) problems.push('VTT does not start with "WEBVTT"');
  const cues = [...t.matchAll(/((?:\d+:)?\d{2}:\d{2}\.\d{3}) --> ((?:\d+:)?\d{2}:\d{2}\.\d{3})/g)];
  if (!cues.length) problems.push('VTT has no cues');
  else {
    const end = ts(cues[cues.length - 1][2]);
    if (cues.some((c) => ts(c[2]) <= ts(c[1]))) problems.push('VTT has a cue that ends before it starts');
    if (duration && end > duration + 0.05) problems.push(`VTT's last cue ends at ${end.toFixed(2)}s, after the video (${duration.toFixed(2)}s)`);
  }
}
if (problems.length) { console.log('NOT READY — keep LP_VIDEO = false:\n  ' + problems.join('\n  ')); process.exit(1); }
console.log(`OK: five files present; MP4 1920×1080, ${(buf.mp4.length / 1048576).toFixed(1)} MB, ${duration.toFixed(1)}s; posters 1280×720; VTT within the video.`);
console.log('Still check by ear: the voice-over must be a real person (not the v6 scratch voice).');
