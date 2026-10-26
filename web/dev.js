// ============================================================================
// punds web — lokálny server na skúšanie a testy
//   node web/dev.js [port]   → http://localhost:8790/punds-sk/sk/
// Bez databázy: ponuky sú ukážkové (DEMO_ADS), formuláre sa len vypíšu.
// ============================================================================
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { handle } = require('./server');
const { DEMO_ADS } = require('./shared/jobs');

const ROOT = path.join(__dirname, '..');
const MIME = { '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json' };

function start(port = 8790, { ads = async () => DEMO_ADS, api } = {}) {
  const sent = [];
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, `http://${req.headers.host}`);
    if (u.pathname.startsWith('/web/public/')) {
      const f = path.join(ROOT, decodeURIComponent(u.pathname));
      if (!f.startsWith(path.join(ROOT, 'web', 'public')) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      return fs.createReadStream(f).pipe(res);
    }
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', async () => {
      const r = await handle({
        method: req.method, host: req.headers['x-test-host'] || req.headers.host, path: u.pathname,
        query: Object.fromEntries(u.searchParams), body, ip: '127.0.0.1', acceptLanguage: req.headers['accept-language'] || '',
      }, { ads, api: api || (async (site, name, rq) => { sent.push({ site: site.key, name, body: JSON.parse(rq.body || '{}') });
        return { status: 200, headers: { 'Content-Type': 'application/json' }, body: '{"ok":true}' }; }) });
      res.writeHead(r.status, r.headers);
      res.end(r.body);
    });
  });
  return new Promise((ok) => server.listen(port, () => ok({ server, sent, url: `http://localhost:${server.address().port}` })));
}

if (require.main === module) {
  start(Number(process.argv[2]) || 8790).then(({ url }) => console.log(`punds web: ${url}/punds-sk/sk/  ·  ${url}/punds-eu/de/`));
}
module.exports = { start };
