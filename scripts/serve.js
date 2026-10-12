/**
 * Lekki, bezbiblioteczny serwer HTTP do lokalnego podglądu i rozwoju Kato Salsa Hub & DancePuls.
 * Zero zewnętrznych zależności - wykorzystuje wbudowany moduł node:http.
 * 
 * Obsługuje routing:
 * - http://localhost:3000/           -> Portal Kato Salsa Hub (katosalsahub.pl)
 * - http://localhost:3000/dancepuls/ -> Agregator DancePuls (dancepuls.pl)
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const ROOT_DIR = path.resolve(__dirname, '..');
const KSH_DIR = path.join(ROOT_DIR, 'katosalsahub.pl');
const DANCEPULS_DIR = path.join(ROOT_DIR, 'dancepuls.pl');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.webp': 'image/webp',
};

const server = http.createServer((req, res) => {
  let rawUrl = decodeURI((req.url || '/').split('?')[0]);

  let targetBase = KSH_DIR;
  let relPath = rawUrl;

  // Routing DancePuls
  if (rawUrl === '/dancepuls' || rawUrl.startsWith('/dancepuls/')) {
    targetBase = DANCEPULS_DIR;
    relPath = rawUrl.replace(/^\/dancepuls(\/)?/, '') || 'index.html';
  } else {
    if (relPath === '/' || relPath === '') {
      relPath = 'index.html';
    }
  }

  // Sanitizacja ścieżki i ochrona przed Directory Traversal
  const safePath = path.normalize(relPath).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(targetBase, safePath);

  if (!filePath.startsWith(targetBase)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Dostęp zabroniony');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`404 Nie znaleziono pliku: ${rawUrl}`);
      return;
    }

    let finalPath = filePath;
    if (stats.isDirectory()) {
      finalPath = path.join(filePath, 'index.html');
      if (!fs.existsSync(finalPath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`404 Brak index.html w katalogu: ${rawUrl}`);
        return;
      }
    }

    const ext = path.extname(finalPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
    });

    const stream = fs.createReadStream(finalPath);
    stream.pipe(res);
  });
});

if (require.main === module) {
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[Dev Server] Serwer działa lokalnie na http://localhost:${PORT}`);
    console.log(`[Dev Server] 💃 Kato Salsa Hub: http://localhost:${PORT}/`);
    console.log(`[Dev Server] 🔥 DancePuls:       http://localhost:${PORT}/dancepuls/`);
    console.log(`[Dev Server] Wciśnij Ctrl+C, aby zatrzymać.`);
  });
}

module.exports = server;
