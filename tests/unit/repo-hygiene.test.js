const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');

describe('Higiena repozytorium i bezpieczeństwo ISO 27001 (Wzorzec Gal Anonim)', () => {
  it('plik package.json powinien posiadać wymagane skrypty CI i dev (test, test:smoke, check, check:syntax, prepare, dev, serve)', () => {
    const pkgPath = path.join(ROOT_DIR, 'package.json');
    assert.ok(fs.existsSync(pkgPath), 'Brak package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

    assert.ok(pkg.scripts, 'Brak sekcji scripts');
    assert.ok(pkg.scripts.test, 'Brak skryptu test');
    assert.ok(pkg.scripts['test:smoke'], 'Brak skryptu test:smoke');
    assert.ok(pkg.scripts.check, 'Brak skryptu check');
    assert.ok(pkg.scripts['check:syntax'], 'Brak skryptu check:syntax');
    assert.ok(pkg.scripts.prepare, 'Brak skryptu prepare');
    assert.ok(pkg.scripts.dev, 'Brak skryptu dev');
    assert.ok(pkg.scripts.serve, 'Brak skryptu serve');
  });

  it('pliki dokumentacji, SEO (robots.txt, sitemap.xml), bezpieczeństwa (.gitleaks.toml, .env.example, .htaccess, rate-limit.php) oraz PWA (manifest.json, sw.js) powinny istnieć', () => {
    assert.ok(fs.existsSync(path.join(ROOT_DIR, 'AGENTS.md')), 'Brak AGENTS.md');
    assert.ok(fs.existsSync(path.join(ROOT_DIR, 'GEMINI.md')), 'Brak GEMINI.md');
    assert.ok(fs.existsSync(path.join(ROOT_DIR, 'BLUEPRINT.md')), 'Brak BLUEPRINT.md');
    assert.ok(fs.existsSync(path.join(ROOT_DIR, 'SECURITY.md')), 'Brak SECURITY.md');
    assert.ok(fs.existsSync(path.join(ROOT_DIR, 'LICENSE')), 'Brak LICENSE');
    assert.ok(fs.existsSync(path.join(ROOT_DIR, '.editorconfig')), 'Brak .editorconfig');
    assert.ok(fs.existsSync(path.join(ROOT_DIR, '.gitleaks.toml')), 'Brak .gitleaks.toml (#3)');
    assert.ok(fs.existsSync(path.join(ROOT_DIR, '.env.example')), 'Brak .env.example (#1, #2)');
    assert.ok(fs.existsSync(path.join(ROOT_DIR, 'katosalsahub.pl', '.htaccess')), 'Brak katosalsahub.pl/.htaccess (#4)');
    assert.ok(fs.existsSync(path.join(ROOT_DIR, 'katosalsahub.pl', 'assets', 'data', '.htaccess')), 'Brak katosalsahub.pl/assets/data/.htaccess (#4)');
    assert.ok(fs.existsSync(path.join(ROOT_DIR, 'katosalsahub.pl', 'assets', 'php', 'rate-limit.php')), 'Brak katosalsahub.pl/assets/php/rate-limit.php');
    assert.ok(fs.existsSync(path.join(ROOT_DIR, 'katosalsahub.pl', 'robots.txt')), 'Brak katosalsahub.pl/robots.txt');
    assert.ok(fs.existsSync(path.join(ROOT_DIR, 'katosalsahub.pl', 'sitemap.xml')), 'Brak katosalsahub.pl/sitemap.xml');
    assert.ok(fs.existsSync(path.join(ROOT_DIR, 'dancepuls.pl', '.htaccess')), 'Brak dancepuls.pl/.htaccess');
    assert.ok(fs.existsSync(path.join(ROOT_DIR, 'dancepuls.pl', 'robots.txt')), 'Brak dancepuls.pl/robots.txt');
    assert.ok(fs.existsSync(path.join(ROOT_DIR, 'dancepuls.pl', 'sitemap.xml')), 'Brak dancepuls.pl/sitemap.xml');
    assert.ok(fs.existsSync(path.join(ROOT_DIR, 'katosalsahub.pl', 'manifest.json')), 'Brak manifest.json (#21)');
    assert.ok(fs.existsSync(path.join(ROOT_DIR, 'katosalsahub.pl', 'sw.js')), 'Brak sw.js (#21)');
    assert.ok(fs.existsSync(path.join(ROOT_DIR, '.github', 'pull_request_template.md')), 'Brak .github/pull_request_template.md');
    assert.ok(fs.existsSync(path.join(ROOT_DIR, '.github', 'ISSUE_TEMPLATE', 'bug_report.yml')), 'Brak .github/ISSUE_TEMPLATE/bug_report.yml');
    assert.ok(fs.existsSync(path.join(ROOT_DIR, '.github', 'ISSUE_TEMPLATE', 'task.yml')), 'Brak .github/ISSUE_TEMPLATE/task.yml');
    assert.ok(fs.existsSync(path.join(ROOT_DIR, '.github', 'ISSUE_TEMPLATE', 'event_org.yml')), 'Brak .github/ISSUE_TEMPLATE/event_org.yml');
  });

  it('kod źródłowy PHP i JS (w tym ai-widget.js) nie może zawierać zahardkodowanych haseł ani kluczy API oraz musi stosować rate_limit i HTTP_CF_CONNECTING_IP (#1, #2, ISO 27001)', () => {
    const wikiPhp = fs.readFileSync(path.join(ROOT_DIR, 'katosalsahub.pl', 'assets', 'php', 'wiki.php'), 'utf-8');
    const wikiJs = fs.readFileSync(path.join(ROOT_DIR, 'katosalsahub.pl', 'assets', 'js', 'wiki.js'), 'utf-8');
    const aiWidgetJs = fs.readFileSync(path.join(ROOT_DIR, 'katosalsahub.pl', 'assets', 'js', 'ai-widget.js'), 'utf-8');
    const contactPhp = fs.readFileSync(path.join(ROOT_DIR, 'katosalsahub.pl', 'assets', 'php', 'contact.php'), 'utf-8');

    assert.doesNotMatch(wikiPhp, /katoAdmin2024/i, 'Wykryto zahardkodowane hasło w wiki.php');
    assert.doesNotMatch(wikiJs, /katoAdmin2024/i, 'Wykryto zahardkodowane hasło w wiki.js');
    assert.doesNotMatch(aiWidgetJs, /AIzaSy[A-Za-z0-9_-]{33}/, 'Wykryto klucz Google API w ai-widget.js');
    assert.doesNotMatch(aiWidgetJs, /gsk_[A-Za-z0-9]{20,}/, 'Wykryto klucz Groq API w ai-widget.js');
    assert.doesNotMatch(aiWidgetJs, /sk-or-v1-[A-Za-z0-9]{20,}/, 'Wykryto klucz OpenRouter w ai-widget.js');
    assert.match(wikiPhp, /flock\s*\(\s*\$fp\s*,\s*LOCK_EX\s*\)/i, 'Brak blokady flock(LOCK_EX) w wiki.php (#13)');
    assert.match(wikiPhp, /X_CSRF_TOKEN/i, 'Brak weryfikacji tokenu CSRF w wiki.php (#12)');
    assert.match(wikiPhp, /rate_limit\s*\(/i, 'Brak ochrony rate_limit() w wiki.php');
    assert.match(wikiPhp, /sanitize_http_url/i, 'Brak walidacji URL sanitize_http_url() w wiki.php');
    assert.match(contactPhp, /OSTICKET_API_KEY/i, 'Brak odczytu OSTICKET_API_KEY ze środowiska w contact.php (#2)');
    assert.match(contactPhp, /function\s+mask_ip/i, 'Brak funkcji anonimizacji IP mask_ip() w contact.php (#7)');
    assert.match(contactPhp, /HTTP_CF_CONNECTING_IP/i, 'Brak odczytu HTTP_CF_CONNECTING_IP w contact.php');
    assert.match(contactPhp, /rate_limit\s*\(/i, 'Brak ochrony rate_limit() w contact.php');
  });

  it('git hook (.githooks/pre-commit) powinien istnieć, posiadać shebang bash i uruchamiać npm run check', () => {
    const hookPath = path.join(ROOT_DIR, '.githooks', 'pre-commit');
    assert.ok(fs.existsSync(hookPath), 'Brak .githooks/pre-commit');
    const content = fs.readFileSync(hookPath, 'utf-8');
    const firstLine = content.split(/\r?\n/)[0];
    assert.match(firstLine, /^#!\/(usr\/bin\/env bash|bin\/bash)\s*$/);
    assert.match(content, /npm\s+run\s+check/);
  });

  it('git hook (.githooks/commit-msg) powinien weryfikować format Conventional Commits', () => {
    const hookPath = path.join(ROOT_DIR, '.githooks', 'commit-msg');
    assert.ok(fs.existsSync(hookPath), 'Brak .githooks/commit-msg');
    const content = fs.readFileSync(hookPath, 'utf-8');
    const firstLine = content.split(/\r?\n/)[0];
    assert.match(firstLine, /^#!\/(usr\/bin\/env bash|bin\/bash)\s*$/);
    assert.match(content, /build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test/i);
    assert.match(content, /Conventional Commits/i);
  });

  it('konfiguracja CI/CD (.github/workflows) powinna posiadać ci.yml, deploy.yml, dependabot-automerge.yml oraz weekly-report.yml', () => {
    const workflows = ['ci.yml', 'deploy.yml', 'dependabot-automerge.yml', 'weekly-report.yml'];
    for (const wf of workflows) {
      const wfPath = path.join(ROOT_DIR, '.github', 'workflows', wf);
      assert.ok(fs.existsSync(wfPath), `Brak pliku .github/workflows/${wf}`);
      const content = fs.readFileSync(wfPath, 'utf-8');
      assert.match(content, /runs-on:\s*ubuntu-latest/i);
    }

    const ciContent = fs.readFileSync(path.join(ROOT_DIR, '.github', 'workflows', 'ci.yml'), 'utf-8');
    assert.match(ciContent, /actions\/checkout@v\d+/i);
    assert.match(ciContent, /gitleaks/i);
    assert.match(ciContent, /smoke-diagnostics/i);

    const deployContent = fs.readFileSync(path.join(ROOT_DIR, '.github', 'workflows', 'deploy.yml'), 'utf-8');
    assert.match(deployContent, /workflow_run:/i, 'deploy.yml powinien używać wyzwalacza workflow_run po zakończeniu CI & Quality Gate');
    assert.match(deployContent, /cancel-in-progress:\s*false/i, 'deploy.yml powinien chronić aktywny transfer SFTP (cancel-in-progress: false)');
    assert.match(deployContent, /head_sha/i, 'deploy.yml powinien pobierać zwalidowany commit (head_sha)');
    assert.match(deployContent, /--exclude-glob\s+assets\/data\/pending_edits\.json/i, 'Brak ochrony pending_edits.json podczas wdrożenia SFTP');
    assert.match(deployContent, /--exclude-glob\s+assets\/data\/moderators\.json/i, 'Brak ochrony moderators.json podczas wdrożenia SFTP');
  });

  it('konfiguracja audytu Lighthouse CI (.lighthouserc.json) powinna istnieć i definiować asercje jakościowe oraz jawną listę stron URL (ochrona przed audytem plików google*.html)', () => {
    const lhciPath = path.join(ROOT_DIR, '.lighthouserc.json');
    assert.ok(fs.existsSync(lhciPath), 'Brak .lighthouserc.json');
    const cfg = JSON.parse(fs.readFileSync(lhciPath, 'utf-8'));
    assert.ok(cfg.ci && cfg.ci.assert && cfg.ci.assert.assertions);
    assert.ok(Array.isArray(cfg.ci.collect.url) && cfg.ci.collect.url.length === 3, 'Brak jawnej listy 3 stron w collect.url w .lighthouserc.json');
  });

  it('konfiguracja Dependabot (.github/dependabot.yml) powinna istnieć i chronić npm oraz github-actions', () => {
    const depPath = path.join(ROOT_DIR, '.github', 'dependabot.yml');
    assert.ok(fs.existsSync(depPath), 'Brak .github/dependabot.yml');
    const content = fs.readFileSync(depPath, 'utf-8');
    assert.match(content, /package-ecosystem:\s*"npm"/i);
    assert.match(content, /package-ecosystem:\s*"github-actions"/i);
  });

  it('serwer lokalny scripts/serve.js oraz test dymny tests/smoke/ui-smoke.js powinny istnieć i chronić przed Directory Traversal oraz DoS', () => {
    assert.ok(fs.existsSync(path.join(ROOT_DIR, 'scripts', 'serve.js')), 'Brak scripts/serve.js');
    assert.ok(fs.existsSync(path.join(ROOT_DIR, 'tests', 'smoke', 'ui-smoke.js')), 'Brak tests/smoke/ui-smoke.js');

    const srv = require('../../scripts/serve.js');
    assert.strictEqual(typeof srv.resolveSafeFilePath, 'function');
    assert.strictEqual(srv.SECURITY_HEADERS['X-Content-Type-Options'], 'nosniff');

    const safeIndex = srv.resolveSafeFilePath('/index.html');
    assert.strictEqual(safeIndex.isAllowed, true);

    const traversal = srv.resolveSafeFilePath('/../../package.json');
    assert.strictEqual(traversal.isAllowed, false, 'Directory Traversal powinien być zablokowany');

    const malformed = srv.resolveSafeFilePath('/%E0%A4%A');
    assert.strictEqual(malformed.isMalformed, true, 'Uszkodzony URL powinien zwrócić flagę isMalformed bez rzucania wyjątku');

    const blockedPhp = srv.resolveSafeFilePath('/assets/php/wiki.php');
    assert.strictEqual(blockedPhp.isAllowed, false, 'Kod źródłowy PHP nie może być serwowany jako plain text');

    const blockedPending = srv.resolveSafeFilePath('/assets/data/pending_edits.json');
    assert.strictEqual(blockedPending.isAllowed, false, 'Plik pending_edits.json musi być zablokowany');

    const blockedModerators = srv.resolveSafeFilePath('/assets/data/moderators.json');
    assert.strictEqual(blockedModerators.isAllowed, false, 'Plik moderators.json musi być zablokowany');

    const blockedAttempts = srv.resolveSafeFilePath('/assets/data/login_attempts.json');
    assert.strictEqual(blockedAttempts.isAllowed, false, 'Plik login_attempts.json musi być zablokowany');
  });

  it('kluczowe pliki źródłowe nie mogą zawierać pozostałości po konfliktach gita (merge conflict markers)', () => {
    const extensionsToCheck = ['.html', '.js', '.css', '.json', '.md', '.yml'];
    const CONFLICT_START = '<<<<<<<' + ' ';
    const CONFLICT_END = '>>>>>>>' + ' ';

    function scanDir(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.git') || entry.name === 'node_modules' || entry.name === 'backup') continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (extensionsToCheck.some(ext => entry.name.endsWith(ext))) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          assert.strictEqual(
            content.includes(CONFLICT_START) || content.includes(CONFLICT_END),
            false,
            `Plik ${fullPath} zawiera markery konfliktu gita!`
          );
        }
      }
    }

    scanDir(ROOT_DIR);
  });

  it('ochrona transakcyjna współbieżności powinna obejmować wiki.php (update_json_file + session_write_close), wiki.js (inFlightMutations), sync_engine.js (writeFileAtomically z PID) oraz potoki CI/CD', () => {
    const wikiPhp = fs.readFileSync(path.join(ROOT_DIR, 'katosalsahub.pl', 'assets', 'php', 'wiki.php'), 'utf-8');
    const wikiJs = fs.readFileSync(path.join(ROOT_DIR, 'katosalsahub.pl', 'assets', 'js', 'wiki.js'), 'utf-8');
    const syncEngineJs = fs.readFileSync(path.join(ROOT_DIR, 'dancepuls.pl', 'tools', 'sync_engine.js'), 'utf-8');
    const weeklyWf = fs.readFileSync(path.join(ROOT_DIR, '.github', 'workflows', 'weekly-report.yml'), 'utf-8');

    assert.match(wikiPhp, /function\s+update_json_file\s*\(/, 'Brak transakcyjnej funkcji update_json_file() w wiki.php');
    assert.match(wikiPhp, /session_write_close\s*\(\s*\)/, 'Brak wczesnego zwalniania blokady sesji session_write_close() w wiki.php');
    assert.match(wikiJs, /inFlightMutations/, 'Brak strażnika inFlightMutations przeciw podwójnym kliknięciom w wiki.js');
    assert.match(syncEngineJs, /process\.pid/, 'Brak izolacji PID w writeFileAtomically w sync_engine.js');
    assert.match(weeklyWf, /concurrency:/, 'Brak bloku concurrency w weekly-report.yml');

    const contactJs = fs.readFileSync(path.join(ROOT_DIR, 'katosalsahub.pl', 'assets', 'js', 'contact.js'), 'utf-8');
    const serveJs = fs.readFileSync(path.join(ROOT_DIR, 'scripts', 'serve.js'), 'utf-8');
    assert.match(contactJs, /inFlightContactSubmit/, 'Brak strażnika inFlightContactSubmit w contact.js');
    assert.match(serveJs, /handleLocalContactApi/, 'Brak lokalnego handlera handleLocalContactApi dla /assets/php/contact.php w scripts/serve.js');
  });
});
