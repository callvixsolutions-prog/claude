/* Isolated test harness for the two-step funnel.
 *
 * Serving under /__test/ rewrites the page so NOTHING reaches production:
 *   - the GTM loader URL is swapped for a local no-op, so window.dataLayer
 *     still exists and still records pushes, but gtm.js never loads, which
 *     means no GA4 tag and no Clarity tag ever fire. This is isolation by
 *     preventing the transport, not by debug-mode flagging.
 *   - the Formspree action is swapped for a local mock endpoint, so no real
 *     submission and no real notification email is ever created.
 * Requests are logged so a test can assert how many POSTs actually landed.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = process.argv[2];
const PORT = Number(process.argv[3] || 8799);
const TYPES = { '.html':'text/html; charset=utf-8', '.css':'text/css', '.js':'text/javascript',
  '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.svg':'image/svg+xml',
  '.ico':'image/x-icon', '.json':'application/json', '.txt':'text/plain', '.xml':'application/xml' };

const posts = [];          // every mock-form POST that actually arrived
let mode = 'ok';           // ok | fail | neterr

function resolve(p) {
  let f = path.join(ROOT, p);
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  else if (!fs.existsSync(f) && fs.existsSync(f + '.html')) f += '.html';
  return f;
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let p = decodeURIComponent(url.pathname);

  if (p === '/__probe') {
    // Bare page: real Calendly widget, no site chrome, no GTM, no Clarity.
    // Generated inline so the HTML rewrite below never touches it.
    res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'});
    return res.end(`<!doctype html><html><head><meta charset="utf-8">
<title>Calendly prefill probe</title><style>body{margin:0;font:15px system-ui}#probe{height:760px}</style></head>
<body><div id="probe"></div>
<script src="https://assets.calendly.com/assets/external/widget.js"></script>
<script>
window.addEventListener('load', function(){
  Calendly.initInlineWidget({
    url: 'https://calendly.com/callvixsolutions/callvix-discovery-call',
    parentElement: document.getElementById('probe'),
    prefill: { name: 'PROBE NAME', email: 'probe.person@example.com' }
  });
});
</script></body></html>`);
  }
  if (p === '/__noop.js') { res.writeHead(200,{'Content-Type':'text/javascript'}); return res.end('/* gtm blocked in tests */'); }
  if (p === '/__mode')    { mode = url.searchParams.get('m') || 'ok'; res.writeHead(200); return res.end(mode); }
  if (p === '/__posts')   { res.writeHead(200,{'Content-Type':'application/json'}); return res.end(JSON.stringify(posts)); }
  if (p === '/__reset')   { posts.length = 0; mode='ok'; res.writeHead(200); return res.end('reset'); }

  if (p === '/__mock-form') {
    let body = '';
    req.on('data', c => body += c);
    return req.on('end', () => {
      if (mode === 'neterr') { return req.socket.destroy(); }     // simulate network failure
      posts.push({ at: Date.now(), len: body.length });
      if (mode === 'fail') {
        res.writeHead(500, {'Content-Type':'application/json'});
        return res.end(JSON.stringify({ errors: [{ message: 'Test backend refused the submission.' }] }));
      }
      res.writeHead(200, {'Content-Type':'application/json'});
      res.end(JSON.stringify({ ok: true }));
    });
  }

  if (p.startsWith('/__test')) p = p.slice('/__test'.length) || '/';
  const file = resolve(p);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('404'); }

  const ext = path.extname(file);
  if (ext === '.html') {
    let html = fs.readFileSync(file, 'utf8');
    html = html.replace(/https:\/\/www\.googletagmanager\.com\/gtm\.js/g, '/__noop.js');
    html = html.replace(/https:\/\/www\.googletagmanager\.com\/ns\.html/g, '/__noop.js');
    html = html.replace(/https:\/\/formspree\.io\/f\/\w+/g, '/__mock-form');
    // Any absolute in-page navigation target must stay on this server too.
    html = html.replace(/data-success="\/(?!__)/g, 'data-success="/');
    html = html.replace(/https:\/\/assets\.calendly\.com[^"']*/g, '/__noop.js');
    res.writeHead(200, {'Content-Type': TYPES['.html']});
    return res.end(html);
  }
  res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log('TEST harness on http://localhost:' + PORT + '/__test/  (root ' + ROOT + ')'));
