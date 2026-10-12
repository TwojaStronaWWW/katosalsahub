const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');

describe('Higiena repozytorium (Repo Hygiene wzorowane na _site-template & Gal Anonim)', () => {
  it('plik package.json powinien posiadać wymagane skrypty CI i dev (test, check, check:syntax, prepare, dev, serve)', () => {
    const pkgPath = path.join(ROOT_DIR, 'package.json');
    assert.ok(fs.existsSync(pkgPath), 'Brak package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

    assert.ok(pkg.scripts, 'Brak sekcji scripts');
    assert.ok(pkg.scripts.test, 'Brak skryptu test');
    assert.ok(pkg.scripts.check, 'Brak skryptu check');
    assert.ok(pkg.scripts['check:syntax'], 'Brak skryptu check:syntax');
    assert.ok(pkg.scripts.prepare, 'Brak skryptu prepare');
    assert.ok(pkg.scripts.dev, 'Brak skryptu dev');
    assert.ok(pkg.scripts.serve, 'Brak skryptu serve');
  });

  it('pliki dokumentacji i standardów AGENTS.md, GEMINI.md, BLUEPRINT.md, SECURITY.md, LICENSE oraz .editorconfig powinny istnieć', () => {
    assert.ok(fs.existsSync(path.join(ROOT_DIR, 'AGENTS.md')), 'Brak AGENTS.md');
    assert.ok(fs.existsSync(path.join(ROOT_DIR, 'GEMINI.md')), 'Brak GEMINI.md');
    assert.ok(fs.existsSync(path.join(ROOT_DIR, 'BLUEPRINT.md')), 'Brak BLUEPRINT.md');
    assert.ok(fs.existsSync(path.join(ROOT_DIR, 'SECURITY.md')), 'Brak SECURITY.md');
    assert.ok(fs.existsSync(path.join(ROOT_DIR, 'LICENSE')), 'Brak LICENSE');
    assert.ok(fs.existsSync(path.join(ROOT_DIR, '.editorconfig')), 'Brak .editorconfig');
    assert.ok(fs.existsSync(path.join(ROOT_DIR, '.github', 'pull_request_template.md')), 'Brak .github/pull_request_template.md');
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

  it('konfiguracja CI/CD (.github/workflows) powinna posiadać ci.yml oraz deploy.yml', () => {
    const workflows = ['ci.yml', 'deploy.yml'];
    for (const wf of workflows) {
      const wfPath = path.join(ROOT_DIR, '.github', 'workflows', wf);
      assert.ok(fs.existsSync(wfPath), `Brak pliku .github/workflows/${wf}`);
      const content = fs.readFileSync(wfPath, 'utf-8');
      assert.match(content, /runs-on:\s*ubuntu-latest/i);
      assert.match(content, /actions\/checkout@v4/i);
    }
  });

  it('konfiguracja audytu Lighthouse CI (.lighthouserc.json) powinna istnieć i definiować asercje jakościowe', () => {
    const lhciPath = path.join(ROOT_DIR, '.lighthouserc.json');
    assert.ok(fs.existsSync(lhciPath), 'Brak .lighthouserc.json');
    const cfg = JSON.parse(fs.readFileSync(lhciPath, 'utf-8'));
    assert.ok(cfg.ci && cfg.ci.assert && cfg.ci.assert.assertions);
  });

  it('konfiguracja Dependabot (.github/dependabot.yml) powinna istnieć i chronić npm oraz github-actions', () => {
    const depPath = path.join(ROOT_DIR, '.github', 'dependabot.yml');
    assert.ok(fs.existsSync(depPath), 'Brak .github/dependabot.yml');
    const content = fs.readFileSync(depPath, 'utf-8');
    assert.match(content, /package-ecosystem:\s*"npm"/i);
    assert.match(content, /package-ecosystem:\s*"github-actions"/i);
  });

  it('serwer lokalny scripts/serve.js powinien istnieć i być poprawnym modułem Node.js', () => {
    const servePath = path.join(ROOT_DIR, 'scripts', 'serve.js');
    assert.ok(fs.existsSync(servePath), 'Brak scripts/serve.js');
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
});
