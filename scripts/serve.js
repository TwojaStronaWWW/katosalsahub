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
  '.kml': 'application/vnd.google-earth.kml+xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.webp': 'image/webp',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

const BLOCKED_FILE_PATTERN = /(^|[\/\\])(\.env.*|\.htaccess|\.git.*|pending_edits\.json|moderators\.json|login_attempts\.json|.*\.(php|bak|tmp|log|sql|sh|swp))$/i;

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

const crypto = require('node:crypto');

const DATA_DIR = path.join(KSH_DIR, 'assets', 'data');
const SALSOPEDIA_FILE = path.join(DATA_DIR, 'salsopedia.json');
const PENDING_FILE = path.join(DATA_DIR, 'pending_edits.json');
const MODERATORS_FILE = path.join(DATA_DIR, 'moderators.json');
const localSessions = new Map();

function readJsonSafe(filePath, fallback = []) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return fallback;
  }
}

function writeJsonSafe(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (fs.existsSync(filePath)) {
    try {
      fs.copyFileSync(filePath, `${filePath}.bak`);
    } catch { /* ignore backup error */ }
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function getEnvSecret(key) {
  if (process.env[key]) return process.env[key];
  for (const envPath of [path.join(ROOT_DIR, '.env'), path.join(KSH_DIR, '.env')]) {
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, 'utf-8').split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
        const idx = trimmed.indexOf('=');
        const k = trimmed.slice(0, idx).trim();
        const v = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
        if (k === key) return v;
      }
    }
  }
  return '';
}

function hashPasswordPbkdf2(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const iter = 100000;
  const dk = crypto.pbkdf2Sync(String(password), salt, iter, 32, 'sha256').toString('hex');
  return `pbkdf2$${iter}$${salt}$${dk}`;
}

function verifyPasswordHashNode(password, storedHash) {
  if (!password || !storedHash) return false;
  if (storedHash.startsWith('pbkdf2$')) {
    const parts = storedHash.split('$');
    if (parts.length === 4) {
      const iter = Math.max(1000, parseInt(parts[1], 10) || 100000);
      const salt = parts[2];
      const expected = parts[3];
      const derived = crypto.pbkdf2Sync(String(password), salt, iter, 32, 'sha256').toString('hex');
      return expected.length === derived.length &&
        crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(derived));
    }
  }
  return false;
}

function authenticateLocalUser(loginInput, password) {
  const login = String(loginInput || '').trim().toLowerCase();
  const passStr = String(password || '');
  if (!passStr) return null;

  const modData = readJsonSafe(MODERATORS_FILE, { users: {} });
  const users = modData.users || {};

  if (login && users[login]) {
    const u = users[login];
    const hash = typeof u === 'object' ? (u.hash || '') : String(u);
    if (verifyPasswordHashNode(passStr, hash)) {
      return {
        email: login,
        name: u.name || login,
        role: u.role === 'admin' ? 'admin' : 'moderator',
        force_change: Boolean(u.force_change)
      };
    }
  }

  if (login && !users[login]) {
    for (const [emailKey, u] of Object.entries(users)) {
      if (u && u.name && String(u.name).trim().toLowerCase() === login) {
        if (verifyPasswordHashNode(passStr, u.hash || '')) {
          return {
            email: emailKey,
            name: u.name,
            role: u.role === 'admin' ? 'admin' : 'moderator',
            force_change: Boolean(u.force_change)
          };
        }
      }
    }
  }

  const secret = getEnvSecret('KATO_ADMIN_SECRET') || getEnvSecret('KATO_ADMIN_PASS');
  if (secret && (login === '' || login === 'admin' || login === 'admin@katosalsahub.pl')) {
    const ok = secret.startsWith('pbkdf2$')
      ? verifyPasswordHashNode(passStr, secret)
      : (secret.length === passStr.length && crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(passStr)));
    if (ok) {
      return {
        email: 'admin@katosalsahub.pl',
        name: 'Główny Administrator',
        role: 'admin',
        force_change: false
      };
    }
  }
  return null;
}

function handleLocalWikiApi(req, res) {
  const urlObj = new URL(req.url, `http://localhost:${PORT}`);
  const action = urlObj.searchParams.get('action') || 'list';

  const sendJson = (data, status = 200, extraHeaders = {}) => {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      ...SECURITY_HEADERS,
      ...extraHeaders
    });
    res.end(JSON.stringify(data, null, 2));
  };

  const cookies = {};
  String(req.headers.cookie || '').split(';').forEach(pair => {
    const idx = pair.indexOf('=');
    if (idx > -1) cookies[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  });
  let sid = cookies.KSH_DEV_SID || '';
  let session = sid ? localSessions.get(sid) : null;

  let bodyStr = '';
  req.on('data', chunk => { bodyStr += chunk; });
  req.on('end', () => {
    let input = {};
    try {
      if (bodyStr) input = JSON.parse(bodyStr);
    } catch { input = {}; }

    if (action === 'list') {
      return sendJson(readJsonSafe(SALSOPEDIA_FILE, []));
    }
    if (action === 'kb_meta') {
      const live = readJsonSafe(SALSOPEDIA_FILE, []);
      return sendJson({ success: true, count: live.length, mtime: Date.now(), version: `kb_${live.length}` });
    }
    if (action === 'check_auth') {
      const pass = input.password || '';
      const login = input.email || input.login || '';
      if (session && session.authenticated && !pass) {
        return sendJson({
          success: true,
          authenticated: true,
          role: session.role,
          user_name: session.name,
          user_email: session.email,
          force_change: session.force_change,
          csrf_token: session.csrf_token
        });
      }
      const authUser = authenticateLocalUser(login, pass);
      if (authUser) {
        sid = crypto.randomBytes(16).toString('hex');
        const csrfToken = crypto.randomBytes(24).toString('hex');
        session = {
          authenticated: true,
          role: authUser.role,
          name: authUser.name,
          email: authUser.email,
          force_change: authUser.force_change,
          csrf_token: csrfToken
        };
        localSessions.set(sid, session);
        return sendJson({
          success: true,
          authenticated: true,
          role: session.role,
          user_name: session.name,
          user_email: session.email,
          force_change: session.force_change,
          csrf_token: csrfToken
        }, 200, { 'Set-Cookie': `KSH_DEV_SID=${sid}; Path=/; HttpOnly; SameSite=Strict` });
      }
      return sendJson({ success: false, error: 'Niepoprawne dane logowania.' }, 401);
    }
    if (action === 'logout') {
      if (sid) localSessions.delete(sid);
      return sendJson({ success: true, authenticated: false });
    }
    if (action === 'submit') {
      if (!input.term || !input.definition) {
        return sendJson({ success: false, error: 'Hasło i definicja są wymagane' }, 400);
      }
      const pending = readJsonSafe(PENDING_FILE, []);
      const targetId = input.id ? String(input.id).trim() : '';
      const entry = {
        id: targetId ? `sub_${Date.now()}` : `term_${Date.now()}`,
        target_id: targetId || undefined,
        term: String(input.term).trim(),
        definition: String(input.definition).trim(),
        author: String(input.author || 'Społeczność').trim(),
        author_link: String(input.author_link || '').trim(),
        category: Array.isArray(input.category) ? input.category : ['dance'],
        subcategory: Array.isArray(input.subcategory) ? input.subcategory : [],
        source: Array.isArray(input.source) ? input.source : [],
        change_note: String(input.change_note || '').trim(),
        status: 'unverified',
        verification_count: 0,
        pending: true,
        pending_action: input.verification_request ? 'verify' : (targetId ? 'edit' : 'new'),
        submitted_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
      };
      pending.push(entry);
      writeJsonSafe(PENDING_FILE, pending);
      return sendJson({ success: true, message: 'Hasło przesłane do kolejki moderacji.', entry });
    }

    if (!session || !session.authenticated) {
      return sendJson({ success: false, error: 'Brak autoryzacji moderatora lub administratora' }, 401);
    }
    if (action === 'pending') {
      return sendJson(readJsonSafe(PENDING_FILE, []));
    }
    if (action === 'change_password') {
      const { old_password: oldP = '', new_password: newP = '', confirm_password: confP = '' } = input;
      if (!oldP || !newP || newP !== confP || newP.length < 8) {
        return sendJson({ success: false, error: 'Sprawdź poprawność nowego hasła (min. 8 znaków).' }, 400);
      }
      const modData = readJsonSafe(MODERATORS_FILE, { users: {} });
      modData.users = modData.users || {};
      modData.users[session.email] = {
        name: session.name,
        role: session.role,
        hash: hashPasswordPbkdf2(newP),
        force_change: false,
        created_at: new Date().toISOString().slice(0, 10)
      };
      writeJsonSafe(MODERATORS_FILE, modData);
      session.force_change = false;
      return sendJson({ success: true, message: 'Hasło zostało bezpiecznie zmienione.' });
    }
    if (session.force_change) {
      return sendJson({ success: false, error: 'Wymagana jest zmiana hasła startowego przed wykonaniem tej operacji.' }, 403);
    }
    if (action === 'list_moderators') {
      if (session.role !== 'admin') return sendJson({ success: false, error: 'Wymagane uprawnienia Admina' }, 403);
      const modData = readJsonSafe(MODERATORS_FILE, { users: {} });
      const users = Object.entries(modData.users || {}).map(([email, u]) => ({
        email,
        name: u.name || email,
        role: u.role || 'moderator',
        force_change: Boolean(u.force_change),
        created_at: u.created_at || '-'
      }));
      return sendJson({ success: true, users });
    }
    if (action === 'save_moderator') {
      if (session.role !== 'admin') return sendJson({ success: false, error: 'Wymagane uprawnienia Admina' }, 403);
      const email = String(input.email || '').trim().toLowerCase();
      const name = String(input.name || email).trim();
      const role = input.role === 'admin' ? 'admin' : 'moderator';
      const pass = String(input.password || '');
      if (!email) return sendJson({ success: false, error: 'Podaj login lub e-mail.' }, 400);
      if (email === session.email && role !== 'admin') {
        return sendJson({ success: false, error: 'Nie możesz odebrać uprawnień administratora własnemu kontu.' }, 400);
      }
      const modData = readJsonSafe(MODERATORS_FILE, { users: {} });
      modData.users = modData.users || {};
      const existing = modData.users[email];
      if (!existing && pass.length < 8) {
        return sendJson({ success: false, error: 'Hasło startowe musi mieć min. 8 znaków.' }, 400);
      }
      modData.users[email] = {
        name,
        role,
        hash: pass ? hashPasswordPbkdf2(pass) : (existing?.hash || ''),
        force_change: input.force_change !== undefined ? Boolean(input.force_change) : true,
        created_at: existing?.created_at || new Date().toISOString().slice(0, 10)
      };
      writeJsonSafe(MODERATORS_FILE, modData);
      return sendJson({ success: true, message: existing ? 'Zaktualizowano konto.' : 'Dodano nowe konto moderatora!' });
    }
    if (action === 'delete_moderator') {
      if (session.role !== 'admin') return sendJson({ success: false, error: 'Wymagane uprawnienia Admina' }, 403);
      const email = String(input.email || '').trim().toLowerCase();
      if (email === session.email) {
        return sendJson({ success: false, error: 'Nie możesz usunąć własnego, aktualnie zalogowanego konta.' }, 400);
      }
      const modData = readJsonSafe(MODERATORS_FILE, { users: {} });
      if (modData.users && modData.users[email]) {
        delete modData.users[email];
        writeJsonSafe(MODERATORS_FILE, modData);
      }
      return sendJson({ success: true, message: 'Konto moderatora usunięte.' });
    }
    if (action === 'quick_verify') {
      const live = readJsonSafe(SALSOPEDIA_FILE, []);
      const idx = live.findIndex(t => t.id === input.id);
      if (idx === -1) return sendJson({ success: false, error: 'Nie znaleziono hasła' }, 404);
      live[idx].status = 'verified';
      live[idx].verification_count = (Number(live[idx].verification_count) || 0) + 1;
      live[idx].verified_by = session.name;
      live[idx].last_updated = new Date().toISOString().slice(0, 10);
      writeJsonSafe(SALSOPEDIA_FILE, live);
      return sendJson({ success: true, entry: live[idx] });
    }
    if (action === 'admin_save') {
      const e = input.entry || {};
      const live = readJsonSafe(SALSOPEDIA_FILE, []);
      const id = e.id || `term_${Date.now()}`;
      let idx = live.findIndex(t => t.id === id || (t.term && e.term && t.term.toLowerCase() === e.term.toLowerCase()));
      const entryObj = {
        ...(idx !== -1 ? live[idx] : {}),
        ...e,
        id: idx !== -1 ? live[idx].id : id,
        status: 'verified',
        verified_by: session.name,
        verification_count: idx !== -1 ? Math.max(1, Number(live[idx].verification_count) || 1) : 1,
        last_updated: new Date().toISOString().slice(0, 10)
      };
      if (idx === -1) live.push(entryObj);
      else live[idx] = entryObj;
      live.sort((a, b) => String(a.term || '').localeCompare(String(b.term || ''), 'pl'));
      writeJsonSafe(SALSOPEDIA_FILE, live);
      return sendJson({ success: true, entry: entryObj });
    }
    if (action === 'moderate') {
      const pending = readJsonSafe(PENDING_FILE, []);
      const pIdx = pending.findIndex(t => t.id === input.id);
      if (pIdx === -1) return sendJson({ success: false, error: 'Nie znaleziono zgłoszenia' }, 404);
      const item = pending[pIdx];
      if (input.action === 'approve') {
        const live = readJsonSafe(SALSOPEDIA_FILE, []);
        const base = input.updated_entry || item;
        const lookupId = item.target_id || base.id;
        let lIdx = live.findIndex(t => t.id === lookupId || (t.term && base.term && t.term.toLowerCase() === base.term.toLowerCase()));
        const clean = { ...base };
        delete clean.pending;
        delete clean.pending_action;
        delete clean.submitted_at;
        delete clean.target_id;
        clean.status = 'verified';
        clean.verified_by = session.name;
        clean.last_updated = new Date().toISOString().slice(0, 10);
        if (lIdx === -1) {
          clean.id = item.target_id || (String(clean.id).startsWith('sub_') ? `term_${Date.now()}` : clean.id);
          clean.verification_count = 1;
          live.push(clean);
        } else {
          clean.id = live[lIdx].id;
          clean.verification_count = (Number(live[lIdx].verification_count) || 0) + 1;
          live[lIdx] = { ...live[lIdx], ...clean };
        }
        live.sort((a, b) => String(a.term || '').localeCompare(String(b.term || ''), 'pl'));
        writeJsonSafe(SALSOPEDIA_FILE, live);
      }
      pending.splice(pIdx, 1);
      writeJsonSafe(PENDING_FILE, pending);
      return sendJson({ success: true, action: input.action, id: input.id });
    }
    if (action === 'admin_delete') {
      if (session.role !== 'admin') return sendJson({ success: false, error: 'Wymagane uprawnienia Admina' }, 403);
      const live = readJsonSafe(SALSOPEDIA_FILE, []);
      const idx = live.findIndex(t => t.id === input.id);
      if (idx === -1) return sendJson({ success: false, error: 'Nie znaleziono hasła' }, 404);
      live.splice(idx, 1);
      writeJsonSafe(SALSOPEDIA_FILE, live);
      return sendJson({ success: true });
    }
    return sendJson({ success: false, error: 'Nieznana akcja API' }, 400);
  });
}

const server = http.createServer((req, res) => {
  const cleanUrlPath = String(req.url || '/').split('?')[0];
  if (cleanUrlPath === '/assets/php/wiki.php' && (req.method === 'POST' || String(req.url).includes('action='))) {
    return handleLocalWikiApi(req, res);
  }

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
