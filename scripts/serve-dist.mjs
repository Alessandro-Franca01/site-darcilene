// Servidor estático de desenvolvimento: reproduz as URLs limpas que o Caddy
// (Fase 5) e a Vercel servem em produção — /servicos → dist/servicos.html.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const DIST = path.join(import.meta.dirname, '..', 'dist');
const TYPES = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.js':'text/javascript', '.webp':'image/webp', '.jpg':'image/jpeg', '.png':'image/png',
  '.mp4':'video/mp4', '.xml':'application/xml', '.txt':'text/plain' };

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  for (const p of [url, url + '.html', path.join(url, 'index.html')]) {
    const file = path.join(DIST, p === '/' ? 'index.html' : p);
    if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) continue;
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    return res.end(fs.readFileSync(file));
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' }).end('404');
}).listen(4321, '127.0.0.1', () => console.log('http://127.0.0.1:4321'));
