// Minimal static server for local preview of this no-build-step site.
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = process.argv[2];
const PORT = Number(process.argv[3] || 8788);
const TYPES = { '.html':'text/html; charset=utf-8', '.css':'text/css', '.js':'text/javascript',
  '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.svg':'image/svg+xml',
  '.ico':'image/x-icon', '.json':'application/json', '.txt':'text/plain', '.xml':'application/xml' };

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  let file = path.join(ROOT, p);
  // Mirror the production rewrite: extensionless URLs resolve to name.html.
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    else if (fs.existsSync(file + '.html')) file += '.html';
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log('serving ' + ROOT + ' on http://localhost:' + PORT));
