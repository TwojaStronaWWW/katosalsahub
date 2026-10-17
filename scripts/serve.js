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
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.pdf': 'application/pdf',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.webp': 'image/webp',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

const BLOCKED_FILE_PATTERN = /(^|[\/\\])(\.env.*|\.htaccess|\.git.*|pending_edits\.json|.*\.(php|bak|tmp|log|sql|sh|swp))$/i;

function resolveSafeFilePath(rawInputUrl = '/', customBaseDir = null) {
  let decodedUrl;
  try {
    decodedUrl = decodeURI(String(rawInputUrl || '/').split('?')[0]);
  } catch {
    return { filePath: '', isAllowed: false, isMalformed: true };
  }

  let targetBase = customBaseDir ? path.resolve(customBaseDir) : KSH_DIR;
  let relPath = decodedUrl;

  if (!customBaseDir && (decodedUrl === '/dancepuls' || decodedUrl.startsWith('/dancepuls/'))) {
    targetBase = DANCEPULS_DIR;
    relPath = decodedUrl.replace(/^\/dancepuls(\/)?/, '') || 'index.html';
  } else if (relPath === '/' || relPath === '') {
    relPath = 'index.html';
  }

  const hasTraversalAttempt = /(^|[\/\\])\.\.([\/\\]|$)/.test(decodedUrl);
  const relativeTarget = relPath.replace(/^[\/\\]+/, '');
  const filePath = path.resolve(targetBase, relativeTarget);

  const withinBase =
    !hasTraversalAttempt &&
    (filePath === targetBase || filePath.startsWith(targetBase + path.sep));

  const isSensitiveBlocked = BLOCKED_FILE_PATTERN.test(filePath);

  return {
    filePath,
    isAllowed: withinBase && !isSensitiveBlocked,
    isMalformed: false,
  };
}

const server = http.createServer((req, res) => {
  const { filePath, isAllowed, isMalformed } = resolveSafeFilePath(req.url);

  if (isMalformed) {
    res.writeHead(400, {
      'Content-Type': 'text/plain; charset=utf-8',
      ...SECURITY_HEADERS,
    });
    res.end('400 Nieprawidłowy adres URL');
    return;
  }

  if (!isAllowed) {
    res.writeHead(403, {
      'Content-Type': 'text/plain; charset=utf-8',
      ...SECURITY_HEADERS,
    });
    res.end('403 Dostęp zabroniony');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err) {
      res.writeHead(404, {
        'Content-Type': 'text/plain; charset=utf-8',
        ...SECURITY_HEADERS,
      });
      res.end('404 Nie znaleziono pliku');
      return;
    }

    let finalPath = filePath;
    if (stats.isDirectory()) {
      finalPath = path.join(filePath, 'index.html');
      if (!fs.existsSync(finalPath)) {
        res.writeHead(404, {
          'Content-Type': 'text/plain; charset=utf-8',
          ...SECURITY_HEADERS,
        });
        res.end('404 Brak index.html w katalogu');
        return;
      }
    }

    const ext = path.extname(finalPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
      ...SECURITY_HEADERS,
    });

    const stream = fs.createReadStream(finalPath);
    stream.on('error', () => {
      if (!res.headersSent) {
        res.writeHead(500, {
          'Content-Type': 'text/plain; charset=utf-8',
          ...SECURITY_HEADERS,
        });
      }
      res.end('500 Błąd odczytu pliku');
    });
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

server.resolveSafeFilePath = resolveSafeFilePath;
server.SECURITY_HEADERS = SECURITY_HEADERS;
server.MIME_TYPES = MIME_TYPES;

module.exports = server;
