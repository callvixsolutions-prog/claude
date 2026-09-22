#!/usr/bin/env python3
"""Build assets/pest-control-answering-service-vendor-scorecard.pdf.

The 25 questions and their seven parts are read from the published checklist
article, so the PDF can never drift from it. The scoring rubric (five categories,
0-2 points each, 0-10 total) is the one the article already uses.

Rendering uses headless Chromium (US Letter, selectable text, clickable links,
tagged PDF). It uses Helvetica rather than the site's web fonts: Chromium embeds
web fonts in a way that breaks copied and screen-read text into fragments. Set CHROME to the binary if it is not found automatically:

    CHROME=/path/to/chrome-headless-shell python3 scripts/build-vendor-scorecard-pdf.py

The scripts/ folder is blocked from the web by .htaccess.
"""
import base64
import glob
import os
import re
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARTICLE = os.path.join(ROOT, 'blog', 'pest-control-answering-service-checklist.html')
OUT = os.path.join(ROOT, 'assets', 'pest-control-answering-service-vendor-scorecard.pdf')
LOGO = os.path.join(ROOT, 'assets', 'logo.png')
ARTICLE_URL = 'https://callvixsolutions.com/blog/pest-control-answering-service-checklist'
PAGE_URL = 'https://callvixsolutions.com/resources/pest-control-answering-service-vendor-scorecard'

# Rubric copied from the article's "A simple vendor scorecard" table.
RUBRIC = [
    ('Pest-control readiness', 'Generic or unclear', 'Some relevant experience', 'Documented pest-specific workflow'),
    ('Booking control', 'Takes messages only', 'Limited booking', 'Books by your written rules'),
    ('Escalation', 'Ad hoc', 'Basic escalation', 'Tested, multi-step escalation plan'),
    ('Visibility', 'Minimal reporting', 'Summaries or recordings', 'Calls, outcomes and QA are reviewable'),
    ('Pricing clarity', 'Vague or incomplete', 'Most charges explained', 'Complete busy-season cost example'),
]
BANDS = [
    ('9&ndash;10', 'Strong candidate for a controlled pilot.'),
    ('7&ndash;8', 'Promising, but resolve the weak category in writing.'),
    ('5&ndash;6', 'High implementation risk; test carefully before forwarding all calls.'),
    ('0&ndash;4', 'The provider is not ready to operate as your front office.'),
]


def find_chrome():
    if os.environ.get('CHROME'):
        return os.environ['CHROME']
    pats = [os.path.expanduser('~/Library/Caches/ms-playwright/chromium_headless_shell-*/*/chrome-headless-shell'),
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
    for p in pats:
        hits = sorted(glob.glob(p))
        if hits:
            return hits[-1]
    sys.exit('Chromium not found; set CHROME=/path/to/chrome')


def read_questions():
    s = open(ARTICLE, encoding='utf8').read()
    parts = []
    for m in re.finditer(r'<h2 class="q-part"><span class="q-part-label">Part (\d+)</span>\s*(.*?)</h2>|'
                         r'<h3 class="q-title" id="q(\d+)">.*?<span class="visually-hidden">Question \d+: </span>(.*?)</span></h3>', s, re.S):
        if m.group(1):
            parts.append((int(m.group(1)), m.group(2).strip(), []))
        else:
            parts[-1][2].append((int(m.group(3)), m.group(4).strip()))
    assert len(parts) == 7 and sum(len(p[2]) for p in parts) == 25, 'article structure changed'
    return parts


def build_html(parts):
    logo = base64.b64encode(open(LOGO, 'rb').read()).decode()
    box = '<span class="box" aria-hidden="true"></span>'
    rows = []
    for num, title, qs in parts:
        body = ''.join(
            '<tr><td class="n">%d</td><td class="q">%s</td>'
            '<td class="a">%sClear<br>%sPartial<br>%sUnclear</td><td class="notes"></td></tr>' % (n, t, box, box, box)
            for n, t in qs)
        rows.append(
            '<table class="ws"><caption>Part %d &middot; %s</caption>'
            '<thead><tr><th scope="col" class="n">#</th><th scope="col">Question</th>'
            '<th scope="col" class="a">Answer</th><th scope="col">Notes and evidence</th></tr></thead>'
            '<tbody>%s<tr class="tally"><td colspan="4">Part %d tally &nbsp; Clear ____ &nbsp; Partial ____ &nbsp; Unclear ____</td></tr></tbody></table>'
            % (num, title, body, num))
    rubric = ''.join('<tr><th scope="row">%s</th><td>%s</td><td>%s</td><td>%s</td><td class="score"><span class="circle">0</span><span class="circle">1</span><span class="circle">2</span></td></tr>' % r for r in RUBRIC)
    bands = ''.join('<tr><th scope="row">%s</th><td>%s</td></tr>' % b for b in BANDS)
    lines = '<div class="line"></div>' * 3
    return '''<!doctype html>
<html lang="en-US"><head><meta charset="utf-8">
<title>Pest Control Answering Service Vendor Scorecard | Callvix Solutions</title>
<style>
@page { size: Letter; margin: 0.55in 0.55in 0.75in;
  @bottom-left { content: "callvixsolutions.com"; font: 7.5pt Helvetica, Arial, sans-serif; color: #3a3f52; }
  @bottom-center { content: "Full checklist: callvixsolutions.com/blog/pest-control-answering-service-checklist"; font: 7.5pt Helvetica, Arial, sans-serif; color: #3a3f52; }
  @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 7.5pt Helvetica, Arial, sans-serif; color: #3a3f52; } }
* { box-sizing: border-box; }
body { margin: 0; font: 9.5pt/1.4 Helvetica, Arial, sans-serif; color: #1c2033; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
h1, h2 { font-family: Helvetica, Arial, sans-serif; color: #101c4c; margin: 0; }
h1 { font-size: 21pt; line-height: 1.15; margin: 10pt 0 6pt; }
h2 { font-size: 13pt; margin: 13pt 0 6pt; break-after: avoid; }
a { color: #087480; }
.top { display: flex; justify-content: space-between; align-items: center; border-bottom: 2.5pt solid #26a8b6; padding-bottom: 7pt; }
.top img { height: 30pt; width: auto; }
.top span { font: 700 8pt Helvetica, Arial, sans-serif; letter-spacing: .08em; text-transform: uppercase; color: #087480; }
.purpose { font-size: 11pt; margin: 0 0 4pt; }
.disclosure { font-size: 8pt; color: #3a3f52; margin: 0 0 10pt; }
.fields { display: grid; grid-template-columns: 1fr 1fr; gap: 8pt 18pt; margin: 6pt 0 4pt; }
.field { border-bottom: 1pt solid #1c2033; padding: 12pt 0 2pt; font: 600 8pt Helvetica, Arial, sans-serif; color: #3a3f52; text-transform: uppercase; letter-spacing: .05em; }
ol.steps { margin: 0; padding-left: 14pt; columns: 2; column-gap: 18pt; }
ol.steps li { margin: 0 0 4pt; break-inside: avoid; }
.key { background: #f1fafb; border: 1pt solid #83d6df; border-radius: 4pt; padding: 6pt 9pt; margin: 8pt 0 0; font-size: 8.8pt; }
table { width: 100%; border-collapse: collapse; }
caption { text-align: left; font: 700 10.5pt Helvetica, Arial, sans-serif; color: #101c4c; padding: 12pt 0 5pt; }
table.ws { break-inside: avoid; }
.ws th, .ws td { border: 0.8pt solid #9aa0ae; padding: 5pt 6pt; vertical-align: top; text-align: left; }
.ws thead th { background: #e3f5f7; font: 700 8pt Helvetica, Arial, sans-serif; color: #101c4c; }
.ws tr { break-inside: avoid; }
.ws td.n { width: 0.3in; text-align: center; font-weight: 700; color: #087480; }
.ws td.q { width: 2.75in; }
.ws .a { width: 0.95in; font-size: 8pt; line-height: 1.75; }
.ws td.notes { height: 0.56in; }
.box { display: inline-block; width: 7pt; height: 7pt; border: 0.9pt solid #1c2033; margin-right: 4pt; vertical-align: -0.5pt; }
.ws tr.tally td { background: #f4efe8; font: 600 8.5pt Helvetica, Arial, sans-serif; color: #101c4c; }
.overall { margin: 10pt 0 0; padding: 7pt 9pt; border: 1.2pt solid #101c4c; border-radius: 4pt; font: 700 9.5pt Helvetica, Arial, sans-serif; color: #101c4c; }
.keep { break-inside: avoid; }
table.rb { break-inside: avoid; }
.rb th, .rb td { border: 0.8pt solid #9aa0ae; padding: 4pt 6pt; text-align: left; vertical-align: top; font-size: 8.8pt; }
.rb caption { font: 400 9pt Helvetica, Arial, sans-serif; color: #1c2033; padding: 0 0 5pt; }
.rb thead th { background: #e3f5f7; font: 700 8pt Helvetica, Arial, sans-serif; color: #101c4c; }
.rb tbody th { font-weight: 700; color: #101c4c; width: 1.35in; }
.rb td.score { width: 1.05in; white-space: nowrap; }
.circle { display: inline-block; width: 15pt; height: 15pt; border: 0.9pt solid #1c2033; border-radius: 50%; text-align: center; line-height: 13.5pt; font-size: 8pt; margin-right: 3pt; }
.total { display: flex; gap: 14pt; align-items: center; margin: 9pt 0 0; }
.total .t { white-space: nowrap; border: 1.5pt solid #101c4c; border-radius: 4pt; padding: 7pt 12pt; font: 700 12pt Helvetica, Arial, sans-serif; color: #101c4c; }
.bands th, .bands td { padding: 1.5pt 6pt 1.5pt 0; text-align: left; font-size: 8.8pt; }
.bands th { width: 0.55in; color: #087480; }
.note { background: #f9edd6; border-radius: 4pt; padding: 5pt 9pt; font-size: 8.6pt; margin: 7pt 0 0; }
.decide { display: grid; grid-template-columns: 1fr 1fr; gap: 9pt 14pt; }
.decide div.b { border: 0.9pt solid #9aa0ae; border-radius: 4pt; padding: 5pt 8pt 8pt; }
.decide div.b { break-inside: avoid; }
.decide h3 { font: 700 9pt Helvetica, Arial, sans-serif; color: #101c4c; margin: 0 0 2pt; }
.line { border-bottom: 0.7pt solid #9aa0ae; height: 15pt; }
.cmp th, .cmp td { border: 0.8pt solid #9aa0ae; padding: 5pt 6pt; text-align: left; font-size: 8.5pt; }
.cmp thead th { background: #e3f5f7; font: 700 8pt Helvetica, Arial, sans-serif; color: #101c4c; }
.cmp tbody td { height: 0.3in; }
.end { font-size: 8.5pt; margin: 10pt 0 0; color: #3a3f52; }
</style></head><body>
<header class="top"><img src="data:image/png;base64,''' + logo + '''" alt="Callvix Solutions"><span>Free resource</span></header>
<main>
<h1>Pest Control Answering Service Vendor Scorecard</h1>
<p class="purpose">Use this sheet to ask every answering-service provider the same 25 questions, record the evidence behind each answer and score them the same way.</p>
<p class="disclosure">Created by Callvix Solutions. It can be used to evaluate Callvix or any other provider.</p>
<section aria-label="Vendor details"><div class="fields">
<div class="field">Vendor name</div><div class="field">Reviewer</div>
<div class="field">Date</div><div class="field">Proposed plan / price</div>
</div></section>
<h2>How to use this scorecard</h2>
<ol class="steps">
<li>Use one copy per provider.</li>
<li>Ask all 25 questions. Ask for a direct answer, an example and, where possible, a live demonstration.</li>
<li>Tick Clear, Partial or Unclear for each answer and note the evidence you were shown.</li>
<li>Score the five categories on the last page from 0 to 2, add them up and compare providers.</li>
</ol>
<p class="key"><strong>Answer key.</strong> Clear: a direct answer backed by an example, document or demonstration. Partial: answered, but vague or not yet verified. Unclear: no answer, or the provider could not explain it.</p>
<h2>The 25 questions</h2>
''' + '\n'.join(rows) + '''
<p class="overall">All parts &nbsp; Clear ____ &nbsp; Partial ____ &nbsp; Unclear ____ &nbsp; (of 25)</p>
<section class="keep"><h2>Additional notes</h2>''' + '<div class="line"></div>' * 9 + '''</section>

<section class="keep">
<h2>Score the five categories</h2>
<table class="rb"><caption>Using your notes, circle a score from 0 to 2 for each category.</caption>
<thead><tr><th scope="col">Category</th><th scope="col">0 points</th><th scope="col">1 point</th><th scope="col">2 points</th><th scope="col">Score</th></tr></thead>
<tbody>''' + rubric + '''</tbody></table>
<div class="total"><span class="t">Total ____ / 10</span>
<table class="bands"><caption class="visually-hidden" style="display:none">Interpretation</caption><tbody>''' + bands + '''</tbody></table></div>
<p class="note"><strong>The total is a comparison aid, not a guarantee of service quality.</strong> The score is a screening tool, not a substitute for a pilot. A provider should still prove it can follow your actual rules on real or simulated calls.</p>

</section>
<section>
<h2>Decision summary</h2>
<div class="decide">
<div class="b"><h3>Strengths</h3>''' + lines + '''</div>
<div class="b"><h3>Risks</h3>''' + lines + '''</div>
<div class="b"><h3>Unanswered questions</h3>''' + lines + '''</div>
<div class="b"><h3>Next step</h3>''' + lines + '''</div>
</div>

</section>
<section class="keep">
<h2>Compare providers</h2>
<table class="cmp"><caption class="visually-hidden" style="display:none">Provider comparison</caption>
<thead><tr><th scope="col">Provider</th><th scope="col">Total / 10</th><th scope="col">Weakest category</th><th scope="col">Next step</th></tr></thead>
<tbody><tr><td></td><td></td><td></td><td></td></tr><tr><td></td><td></td><td></td><td></td></tr><tr><td></td><td></td><td></td><td></td></tr></tbody></table>
<p class="end">Full explanation of every question: <a href="''' + ARTICLE_URL + '''">''' + ARTICLE_URL.replace('https://', '') + '''</a><br>
Get a fresh copy: <a href="''' + PAGE_URL + '''">''' + PAGE_URL.replace('https://', '') + '''</a><br>
Created by Callvix Solutions, <a href="https://callvixsolutions.com">callvixsolutions.com</a>.</p>
</section>
</main></body></html>'''


def main():
    src = build_html(read_questions())
    with tempfile.TemporaryDirectory() as tmp:
        page = os.path.join(tmp, 'scorecard.html')
        open(page, 'w', encoding='utf8').write(src)
        subprocess.run([find_chrome(), '--headless', '--no-pdf-header-footer', '--generate-pdf-document-outline',
                        '--virtual-time-budget=10000', '--print-to-pdf=' + OUT, 'file://' + page],
                       check=True, capture_output=True)
    print('wrote', os.path.relpath(OUT, ROOT), os.path.getsize(OUT), 'bytes')


if __name__ == '__main__':
    main()
