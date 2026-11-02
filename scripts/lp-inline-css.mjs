// Copies pest-control-answering-service/assets/cv3b.css into the landing page's <style id="cv3b-css"> block
// (speed pass, owner-approved 2 Nov 2026: the page no longer waits for a separate stylesheet before it can paint).
// cv3b.css stays the source of truth; the calendar page (schedule/index.html) still links it.
// Run after every cv3b.css edit:  node scripts/lp-inline-css.mjs   (lp-answering.test.mjs fails if they differ)
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'pest-control-answering-service');
const css = readFileSync(join(DIR, 'assets', 'cv3b.css'), 'utf8');
if (/<\/style/i.test(css)) throw new Error('cv3b.css contains "</style", which would end the inline block early');
const pagePath = join(DIR, 'index.html');
const page = readFileSync(pagePath, 'utf8');
const block = `<style id="cv3b-css">\n${css.replace(/\n$/, '')}\n</style>`;
const re = /<style id="cv3b-css">[\s\S]*?<\/style>/;
if (!re.test(page)) throw new Error('no <style id="cv3b-css"> block in index.html');
const next = page.replace(re, () => block);
if (next !== page) { writeFileSync(pagePath, next); console.log('index.html: inline CSS updated from cv3b.css'); }
else console.log('index.html: inline CSS already matches cv3b.css');
