#!/usr/bin/env node
/**
 * IndexNow submitter for https://callvixsolutions.com
 *
 * Tooling only: this file is blocked from the public web by .htaccess and is
 * never loaded by the site. It needs Node 18+ (built-in fetch) and has no
 * dependencies.
 *
 * Modes (pick one):
 *   --urls <url> [url...]        submit specific URLs (bare URLs work too)
 *   --sitemap                    submit every canonical URL in the live sitemap
 *   --changed --from <sha> --to <sha>
 *                                submit pages added, updated or deleted between
 *                                two commits (used by the production workflow)
 *
 * Flags:
 *   --dry-run                    validate and report only; never submit
 *   --production                 allow submission outside the production CI job
 *   --wait-for-deploy            (--changed) wait until production serves each
 *                                changed page's committed bytes before submitting
 *   --wait-timeout <seconds>     how long to wait for the deploy (default 600)
 *   --strict                     exit 1 if IndexNow does not accept the request
 *
 * Every URL is checked against production before it is sent: it must be the
 * canonical https://callvixsolutions.com form, return 200 without redirecting,
 * carry a self-referencing canonical tag and not be noindex. Deleted pages are
 * sent only once production returns 404/410 for them.
 *
 * An IndexNow or network failure prints a warning and exits 0, so it can never
 * fail or roll back a deployment (use --strict to change that).
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const SITE_ORIGIN = 'https://callvixsolutions.com';
export const HOST = 'callvixsolutions.com';
// The IndexNow key is public by design: it must be served from the site root.
export const KEY = 'cb5b7350e51fd62e3bbef397cf0f8c98';
export const KEY_LOCATION = `${SITE_ORIGIN}/${KEY}.txt`;
export const ENDPOINT = 'https://api.indexnow.org/indexnow';
export const MAX_URLS_PER_REQUEST = 10000;

const PRODUCTION_REPO = 'callvixsolutions-prog/claude';
const PRODUCTION_REF = 'refs/heads/main';
const USER_AGENT = 'callvix-indexnow/1.0 (+https://callvixsolutions.com)';
const IN_ACTIONS = process.env.GITHUB_ACTIONS === 'true';

// ---------------------------------------------------------------- logging --

function log(msg) { console.log(msg); }
function warn(msg) {
  console.warn(IN_ACTIONS ? `::warning title=IndexNow::${msg}` : `WARNING: ${msg}`);
}
function summary(lines) {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (!file) return;
  try { appendFileSync(file, lines.join('\n') + '\n'); } catch { /* summary is optional */ }
}

// ------------------------------------------------------------- validation --

/**
 * Returns the canonical URL string, or throws with the reason it is not
 * submittable. Pure: no network access.
 */
export function normalizeUrl(input) {
  let url;
  try { url = new URL(String(input).trim()); } catch { throw new Error('not a valid absolute URL'); }
  if (url.protocol !== 'https:') throw new Error('must use https');
  if (url.hostname !== HOST) throw new Error(`host must be exactly ${HOST} (no www, staging or localhost)`);
  if (url.port) throw new Error('must not specify a port');
  if (url.username || url.password) throw new Error('must not contain credentials');
  if (url.search) throw new Error('query-string variations are not canonical');
  if (url.hash) throw new Error('fragments are not canonical');
  const last = url.pathname.split('/').pop();
  if (last.includes('.')) throw new Error('files and assets are not submitted (canonical pages have no extension)');
  // Trailing-slash variants of non-directory pages redirect; the live check rejects those.
  return url.href;
}

/** Validates and de-duplicates a list, returning accepted URLs and rejections. */
export function dedupeAndValidate(inputs) {
  const accepted = [];
  const rejected = [];
  const seen = new Set();
  for (const raw of inputs) {
    try {
      const href = normalizeUrl(raw);
      if (seen.has(href)) continue;
      seen.add(href);
      accepted.push(href);
    } catch (err) {
      rejected.push({ url: String(raw), reason: err.message });
    }
  }
  return { accepted, rejected };
}

/** Extracts the canonical href and robots directives from an HTML document. */
export function readPageSignals(html) {
  let canonical = null;
  for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
    if (/\brel\s*=\s*["']?canonical\b/i.test(tag)) {
      const m = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i);
      if (m) { canonical = m[1]; break; }
    }
  }
  let robots = '';
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    if (/\bname\s*=\s*["']?robots\b/i.test(tag)) {
      const m = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i);
      if (m) robots += ` ${m[1]}`;
    }
  }
  return { canonical, noindex: /\bnoindex\b/i.test(robots) };
}

/** Maps a documented IndexNow HTTP status to a human-readable verdict. */
export function interpretStatus(status) {
  switch (status) {
    case 200: return { ok: true, meaning: 'OK - URLs submitted successfully.' };
    case 202: return { ok: true, meaning: 'Accepted - URLs received; IndexNow key validation is pending.' };
    case 400: return { ok: false, meaning: 'Bad request - invalid request format.' };
    case 403: return { ok: false, meaning: `Forbidden - key not valid (key file missing, or its content does not match). Check ${KEY_LOCATION}.` };
    case 422: return { ok: false, meaning: `Unprocessable entity - URLs do not belong to ${HOST}, or the key does not match the protocol schema.` };
    case 429: return { ok: false, meaning: 'Too many requests - rate limited (potential spam). Wait before submitting again.' };
    default:
      if (status >= 500) return { ok: false, meaning: `IndexNow server error (${status}). Temporary; safe to retry later.` };
      return { ok: false, meaning: `Unexpected response status ${status}.` };
  }
}

// ---------------------------------------------------------------- network --

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: ctrl.signal,
      headers: { 'User-Agent': USER_AGENT, ...(options.headers || {}) },
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Confirms a URL is publicly live and indexable. Returns null if fine, else a reason. */
async function checkLiveIndexable(href) {
  let res;
  try {
    res = await fetchWithTimeout(href, { redirect: 'manual', headers: { 'Cache-Control': 'no-cache' } });
  } catch (err) {
    return `could not be fetched (${err.name === 'AbortError' ? 'timeout' : err.message})`;
  }
  if (res.status >= 300 && res.status < 400) return `redirects (${res.status}) - only final canonical URLs are submitted`;
  if (res.status !== 200) return `returns HTTP ${res.status}`;
  if (/\bnoindex\b/i.test(res.headers.get('x-robots-tag') || '')) return 'X-Robots-Tag noindex';
  const type = res.headers.get('content-type') || '';
  if (!type.includes('text/html')) return `is not an HTML page (${type || 'no content-type'})`;
  const { canonical, noindex } = readPageSignals(await res.text());
  if (noindex) return 'meta robots noindex';
  if (!canonical) return 'has no canonical tag';
  if (canonical !== href) return `canonical points elsewhere (${canonical})`;
  return null;
}

async function checkLiveGone(href) {
  try {
    const res = await fetchWithTimeout(href, { redirect: 'manual', method: 'GET' });
    if (res.status === 404 || res.status === 410) return null;
    return `still returns HTTP ${res.status}`;
  } catch (err) {
    return `could not be fetched (${err.message})`;
  }
}

async function preflightKey() {
  try {
    const res = await fetchWithTimeout(`${KEY_LOCATION}?preflight=${Date.now()}`, { redirect: 'manual' });
    if (res.status !== 200) return `key file returned HTTP ${res.status}`;
    const body = await res.text();
    if (body.trim() !== KEY) return 'key file content does not match the key';
    return null;
  } catch (err) {
    return `key file could not be fetched (${err.message})`;
  }
}

async function postToIndexNow(urlList) {
  const body = JSON.stringify({ host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList });
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetchWithTimeout(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body,
      }, 30000);
      const text = (await res.text()).trim();
      // Retry only transient server errors; 4xx responses are reported as-is.
      if (res.status >= 500 && attempt < 3) { await sleep(5000 * attempt); continue; }
      return { status: res.status, body: text };
    } catch (err) {
      lastError = err;
      if (attempt < 3) await sleep(5000 * attempt);
    }
  }
  return { status: null, body: '', error: lastError ? lastError.message : 'unknown network error' };
}

// ----------------------------------------------------------- URL sources --

async function urlsFromSitemap(sitemapUrl = `${SITE_ORIGIN}/sitemap.xml`, depth = 0) {
  const res = await fetchWithTimeout(sitemapUrl, { redirect: 'follow' });
  if (res.status !== 200) throw new Error(`sitemap ${sitemapUrl} returned HTTP ${res.status}`);
  const xml = await res.text();
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].replace(/&amp;/g, '&'));
  if (/<sitemapindex\b/i.test(xml) && depth < 2) {
    const nested = [];
    for (const loc of locs) nested.push(...await urlsFromSitemap(loc, depth + 1));
    return nested;
  }
  return locs;
}

function git(args, encoding = 'utf8') {
  return execFileSync('git', args, { encoding, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}

function commitExists(sha) {
  try { git(['cat-file', '-e', `${sha}^{commit}`]); return true; } catch { return false; }
}

/** Pages added/modified/deleted between two commits, keyed by their canonical URL. */
export function changedPages(from, to) {
  const out = git(['diff', '--name-status', '--no-renames', from, to, '--', '*.html']);
  const pages = [];
  for (const line of out.split('\n').filter(Boolean)) {
    const [status, path] = line.split('\t');
    const deleted = status === 'D';
    const rev = deleted ? from : to;
    const html = git(['show', `${rev}:${path}`]);
    const { canonical, noindex } = readPageSignals(html);
    if (noindex || !canonical) continue; // noindex / utility pages are never submitted
    const bytes = deleted ? null : git(['show', `${to}:${path}`], 'buffer');
    pages.push({
      path,
      url: canonical,
      deleted,
      sha256: bytes ? createHash('sha256').update(bytes).digest('hex') : null,
    });
  }
  return pages;
}

/** Waits until production serves each page's committed bytes (or 404/410 for deletions). */
export async function waitForDeploy(pages, timeoutSec) {
  const pending = new Map(pages.map((p) => [p.url, p]));
  const ready = [];
  const deadline = Date.now() + timeoutSec * 1000;
  while (pending.size && Date.now() < deadline) {
    for (const [url, page] of pending) {
      try {
        if (page.deleted) {
          const res = await fetchWithTimeout(url, { redirect: 'manual' });
          if (res.status === 404 || res.status === 410) { ready.push(page); pending.delete(url); }
          continue;
        }
        // The throwaway query string only defeats caches for this readiness check.
        const probe = `${url}?indexnow-deploy-check=${page.sha256.slice(0, 12)}-${Date.now()}`;
        const res = await fetchWithTimeout(probe, { headers: { 'Cache-Control': 'no-cache', 'Accept-Encoding': 'identity' } });
        if (res.status === 200) {
          const live = createHash('sha256').update(Buffer.from(await res.arrayBuffer())).digest('hex');
          if (live === page.sha256) { ready.push(page); pending.delete(url); }
        }
      } catch { /* not ready yet; keep polling */ }
    }
    if (pending.size) {
      log(`  waiting for production to serve ${pending.size} page(s)...`);
      await sleep(15000);
    }
  }
  for (const page of pending.values()) {
    warn(`${page.url} was not live with this commit's content within ${timeoutSec}s; not submitted.`);
  }
  return ready;
}

// ------------------------------------------------------------------ main --

function parseArgs(argv) {
  const opts = { mode: null, urls: [], from: null, to: null, dryRun: false, production: false, waitForDeploy: false, waitTimeout: 600, strict: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--urls': opts.mode = 'urls'; break;
      case '--sitemap': opts.mode = 'sitemap'; break;
      case '--changed': opts.mode = 'changed'; break;
      case '--from': opts.from = argv[++i]; break;
      case '--to': opts.to = argv[++i]; break;
      case '--dry-run': opts.dryRun = true; break;
      case '--production': opts.production = true; break;
      case '--wait-for-deploy': opts.waitForDeploy = true; break;
      case '--wait-timeout': opts.waitTimeout = Number(argv[++i]); break;
      case '--strict': opts.strict = true; break;
      case '-h': case '--help': opts.help = true; break;
      default:
        if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
        opts.urls.push(a);
        if (!opts.mode) opts.mode = 'urls';
    }
  }
  return opts;
}

function isProductionCi() {
  return IN_ACTIONS
    && process.env.GITHUB_REPOSITORY === PRODUCTION_REPO
    && process.env.GITHUB_REF === PRODUCTION_REF;
}

async function main() {
  const [major] = process.versions.node.split('.').map(Number);
  if (major < 18) { console.error('Node 18 or newer is required.'); return 1; }

  let opts;
  try { opts = parseArgs(process.argv.slice(2)); } catch (err) { console.error(err.message); return 1; }
  if (opts.help || !opts.mode) {
    console.log('Usage: submit-indexnow.mjs (--urls <url...> | --sitemap | --changed --from <sha> --to <sha>) [--dry-run] [--production] [--wait-for-deploy] [--wait-timeout s] [--strict]');
    return opts.help ? 0 : 1;
  }

  const allowed = isProductionCi() || opts.production;
  const dryRun = opts.dryRun || !allowed;
  if (!opts.dryRun && !allowed) {
    log('Not the production deploy job and --production was not given: running as a dry run (nothing will be submitted).');
  }

  // 1. Collect candidates.
  let candidates = [];
  let deploymentPages = null;
  if (opts.mode === 'urls') {
    candidates = opts.urls;
  } else if (opts.mode === 'sitemap') {
    try { candidates = await urlsFromSitemap(); } catch (err) { warn(`Could not read the sitemap: ${err.message}`); return opts.strict ? 1 : 0; }
  } else {
    if (!opts.from || !opts.to) { console.error('--changed needs --from <sha> and --to <sha>'); return 1; }
    if (/^0+$/.test(opts.from) || !commitExists(opts.from) || !commitExists(opts.to)) {
      warn(`Cannot reliably determine changed pages (base commit ${opts.from} is unavailable). Nothing submitted; run the sitemap mode if a full resubmission is needed.`);
      return 0;
    }
    deploymentPages = changedPages(opts.from, opts.to);
    candidates = deploymentPages.map((p) => p.url);
  }

  const { accepted, rejected } = dedupeAndValidate(candidates);
  for (const r of rejected) warn(`Skipped ${r.url}: ${r.reason}`);
  if (deploymentPages) deploymentPages = deploymentPages.filter((p) => accepted.includes(p.url));

  if (!accepted.length) {
    log('No canonical public pages to submit.');
    summary(['### IndexNow', 'No canonical public pages changed; nothing submitted.']);
    return 0;
  }

  // 2. Wait for the deployment when notifying about a push.
  let deletedUrls = new Set();
  let toCheck = accepted;
  if (deploymentPages) {
    const ready = opts.waitForDeploy && !dryRun ? await waitForDeploy(deploymentPages, opts.waitTimeout) : deploymentPages;
    deletedUrls = new Set(ready.filter((p) => p.deleted).map((p) => p.url));
    toCheck = ready.map((p) => p.url);
  }

  // 3. Confirm each URL against production.
  const finalList = [];
  for (const href of toCheck) {
    const reason = deletedUrls.has(href) ? await checkLiveGone(href) : await checkLiveIndexable(href);
    if (reason) warn(`Skipped ${href}: ${reason}`);
    else finalList.push(href);
  }

  log(`\n${finalList.length} URL(s) ready for IndexNow:`);
  for (const u of finalList) log(`  ${deletedUrls.has(u) ? '[deleted] ' : ''}${u}`);
  if (!finalList.length) return 0;

  if (dryRun) {
    log('\nDry run: nothing submitted.');
    return 0;
  }

  // 4. Submit.
  const keyProblem = await preflightKey();
  if (keyProblem) {
    warn(`IndexNow key check failed: ${keyProblem}. Nothing submitted (IndexNow would reject it with 403).`);
    return opts.strict ? 1 : 0;
  }

  let allOk = true;
  const report = ['### IndexNow submission', `Endpoint: ${ENDPOINT}`, ''];
  for (let i = 0; i < finalList.length; i += MAX_URLS_PER_REQUEST) {
    const batch = finalList.slice(i, i + MAX_URLS_PER_REQUEST);
    const result = await postToIndexNow(batch);
    if (result.status === null) {
      allOk = false;
      warn(`IndexNow request failed after retries: ${result.error}. The deployment itself is unaffected.`);
      report.push(`- ${batch.length} URL(s): network failure (${result.error})`);
      continue;
    }
    const verdict = interpretStatus(result.status);
    const line = `IndexNow responded HTTP ${result.status} for ${batch.length} URL(s): ${verdict.meaning}${result.body ? ` Body: ${result.body}` : ' (empty body)'}`;
    if (verdict.ok) log(`\n${line}`); else { allOk = false; warn(line); }
    report.push(`- HTTP **${result.status}** for ${batch.length} URL(s): ${verdict.meaning}`);
    if (result.body) report.push(`  - Response body: \`${result.body.slice(0, 500)}\``);
  }
  report.push('', ...finalList.map((u) => `- ${u}`));
  summary(report);
  return allOk || !opts.strict ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      warn(`Unexpected error: ${err && err.message ? err.message : err}. The deployment itself is unaffected.`);
      process.exit(0);
    },
  );
}
