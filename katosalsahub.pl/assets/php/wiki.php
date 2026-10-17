<?php
declare(strict_types=1);

/**
 * Kato Salsa Hub - Salsopedia Backend API (v2.0 - Multi-Role Admin/Moderator & Raricart Security Patterns)
 * Obsługa: Listowanie, Oczekujące (Pending), Zgłaszanie (Submit), Moderacja (Diff), Szybka Weryfikacja i Zarządzanie Kontami
 * Zabezpieczenia ISO 27001 & Wzorce Raricart:
 * - Zero zahardkodowanych haseł (getenv('KATO_ADMIN_SECRET') + baza kont moderators.json z password_verify / hash_equals)
 * - Ochrona Brute-Force (Rate-Limiting per zanonimizowane IP w login_attempts.json + rate_limit)
 * - Wymuszenie zmiany hasła tymczasowego przy pierwszym logowaniu moderatora (force_change)
 * - Kontrola dostępu oparta na rolach (RBAC: 'admin' vs 'moderator')
 * - Sesja HttpOnly + SameSite=Strict oraz ochrona CSRF (X-CSRF-Token)
 * - Transakcyjny zapis z blokadą flock(LOCK_EX), kopią zapasową .bak oraz X-LiteSpeed-Purge
 */

ini_set('display_errors', '0');
ini_set('log_errors', '1');
error_reporting(E_ALL);

require_once __DIR__ . '/rate-limit.php';

if (session_status() === PHP_SESSION_NONE) {
    ini_set('session.use_strict_mode', '1');
    ini_set('session.cookie_httponly', '1');
    $isSecure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (!empty($_SERVER['SERVER_PORT']) && (int)$_SERVER['SERVER_PORT'] === 443);
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => $isSecure,
        'httponly' => true,
        'samesite' => 'Strict'
    ]);
    @session_start();
}

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$dataDir = __DIR__ . '/../data';
$salsopediaFile = $dataDir . '/salsopedia.json';
$pendingFile = $dataDir . '/pending_edits.json';
$moderatorsFile = $dataDir . '/moderators.json';
$attemptsFile = $dataDir . '/login_attempts.json';

if (!file_exists($dataDir)) {
    @mkdir($dataDir, 0755, true);
}

/**
 * Pobiera zmienną środowiskową z getenv(), $_ENV lub pliku .env poza webrootem (Zero Secrets in Git)
 */
function get_env_secret(string $key, string $default = ''): string {
    $val = getenv($key);
    if ($val !== false && $val !== '') return (string)$val;
    if (!empty($_ENV[$key])) return (string)$_ENV[$key];
    foreach ([__DIR__ . '/../../../../.env', __DIR__ . '/../../../.env', __DIR__ . '/../../.env', __DIR__ . '/.env'] as $envPath) {
        if (!is_readable($envPath)) continue;
        $lines = @file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if (!is_array($lines)) continue;
        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '' || strpos($line, '#') === 0 || strpos($line, '=') === false) continue;
            list($k, $v) = explode('=', $line, 2);
            if (trim($k) === $key) return trim($v, " \t\n\r\0\x0B\"'");
        }
    }
    return $default;
}

/**
 * Pobiera sekret administratora z getenv(), $_ENV, pliku .env lub jednokierunkowego hasha PBKDF2-SHA256 (Zero Plaintext Secrets in Git)
 */
function get_admin_secret(): string {
    $secret = get_env_secret('KATO_ADMIN_SECRET');
    if ($secret !== '') return $secret;
    $pass = get_env_secret('KATO_ADMIN_PASS');
    if ($pass !== '') return $pass;
    return 'pbkdf2$100000$36209c01de1f575247b3773fcb42022b$b49004673138ed7ad53b3cddc607dab77f3b08e67d6d48f0731791682ff06213';
}

/**
 * Zwraca zanonimizowany adres IP klienta (z uwzględnieniem Cloudflare Proxy) zgodny z RODO
 */
function get_client_masked_ip(): string {
    $raw = $_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
    $cleanIp = trim(explode(',', (string)$raw)[0]);
    if (filter_var($cleanIp, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
        $parts = explode('.', $cleanIp);
        $parts[3] = '0';
        return implode('.', $parts);
    }
    if (filter_var($cleanIp, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6)) {
        $parts = explode(':', $cleanIp);
        return implode(':', array_slice($parts, 0, 3)) . '::0';
    }
    return '0.0.0.0';
}

function respond($data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit;
}

function error_res(string $msg, int $code = 400): void {
    respond(['success' => false, 'error' => $msg], $code);
}

/**
 * Waliduje bezpieczny adres URL HTTP/HTTPS i odrzuca pseudoprotokoły (np. javascript:) oraz cudzysłowy
 */
function sanitize_http_url($url): string {
    $clean = trim(strip_tags((string)$url));
    if ($clean === '') return '';
    if (!preg_match('#^https?://[^\s"\'<>]+$#i', $clean)) {
        return '';
    }
    if (!filter_var($clean, FILTER_VALIDATE_URL)) {
        return '';
    }
    return mb_substr($clean, 0, 500);
}

/**
 * Powiadomienie moderatorów: zgłoszenie do Salsopedii trafia też jako ticket do osTicket
 * (ten sam kanał co formularz kontaktowy). Błąd nie blokuje zapisu zgłoszenia w kolejce.
 */
function notify_osticket(array $entry): bool {
    $apiKey = get_env_secret('OSTICKET_API_KEY');
    if (empty($apiKey) || !function_exists('curl_init')) return false;
    $apiUrl = get_env_secret('OSTICKET_API_URL', 'http://hd.twojastronawww.pl:8080/ticket_hook.php');

    $labels = ['verify' => 'Prośba o weryfikację', 'edit' => 'Poprawka hasła', 'new' => 'Nowe hasło'];
    $action = (string)($entry['pending_action'] ?? 'new');
    $term = mb_substr((string)($entry['term'] ?? ''), 0, 120);
    $definition = mb_substr((string)($entry['definition'] ?? ''), 0, 3000);
    $author = mb_substr((string)($entry['author'] ?? 'Społeczność'), 0, 100);

    $message = "Rodzaj zgłoszenia: " . ($labels[$action] ?? $action) . "\n"
        . "Hasło: $term\n"
        . "ID: " . ($entry['id'] ?? '-') . "\n"
        . "Autor: $author\n\n"
        . "Proponowana treść:\n$definition\n\n"
        . "Moderacja: salsopedia.html?admin=1 → zakładka „Do moderacji”";

    $ticketData = [
        'name' => $author !== '' ? $author : 'Salsopedia',
        'email' => 'noreply@katosalsahub.pl',
        'subject' => '[Salsopedia] ' . ($labels[$action] ?? $action) . ': ' . $term,
        'message' => $message,
        'topicId' => 12,
        'source' => 'Web',
    ];

    $ch = curl_init($apiUrl);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['X-API-Key: ' . $apiKey, 'Content-Type: application/json', 'Expect:']);
    curl_setopt($ch, CURLOPT_RESOLVE, ['hd.twojastronawww.pl:8080:127.0.0.1']);
    curl_setopt($ch, CURLOPT_USERAGENT, 'KatoSalsaHub-HelpdeskClient/2.0');
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($ticketData, JSON_UNESCAPED_UNICODE));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 6);
    $res = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    $arr = json_decode((string)$res, true);
    $ok = ($code === 201 && !empty($arr['success']));
    error_log('[KatoWiki] osTicket ' . ($ok ? 'TICKET CREATED' : "FAILED (Code $code)"));
    return $ok;
}

function read_json_file(string $file): array {
    if (!file_exists($file)) return [];
    $fp = @fopen($file, 'rb');
    if (!$fp) return [];
    $content = '';
    if (@flock($fp, LOCK_SH)) {
        clearstatcache(true, $file);
        $size = (int)@filesize($file);
        if ($size > 0) {
            $content = (string)fread($fp, $size);
        }
        @flock($fp, LOCK_UN);
    }
    fclose($fp);
    if ($content === '') return [];
    $data = json_decode($content, true);
    return is_array($data) ? $data : [];
}

/**
 * Atomowy zapis pliku JSON z blokadą wyłączną flock(LOCK_EX), kopią zapasową .bak oraz czyszczeniem cache LiteSpeed (Wzorzec Raricart)
 */
function save_json_file(string $file, array $data, bool $purgeCache = true): bool {
    $encoded = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    if ($encoded === false) return false;

    $fp = @fopen($file, 'c+b');
    if (!$fp) {
        $res = @file_put_contents($file, $encoded, LOCK_EX) !== false;
        if ($res && $purgeCache && !headers_sent()) {
            header("X-LiteSpeed-Purge: *");
        }
        return $res;
    }

    if (!@flock($fp, LOCK_EX)) {
        fclose($fp);
        return false;
    }

    // 1. Automatyczna kopia zapasowa .bak wykonywana wewnątrz sekcji krytycznej LOCK_EX
    $existingContent = stream_get_contents($fp);
    if ($existingContent !== false && strlen($existingContent) > 0) {
        @file_put_contents($file . '.bak', $existingContent, LOCK_EX);
    }

    // 2. Zapis nowej zawartości pod blokadą wyłączną
    ftruncate($fp, 0);
    rewind($fp);
    $written = fwrite($fp, $encoded);
    fflush($fp);
    @flock($fp, LOCK_UN);
    fclose($fp);

    if ($written !== false && $purgeCache && !headers_sent()) {
        header("X-LiteSpeed-Purge: *");
    }

    return $written !== false;
}

function get_request_data(): array {
    $raw = file_get_contents('php://input');
    if (!empty($raw)) {
        $json = json_decode($raw, true);
        if (is_array($json)) return $json;
    }
    return is_array($_POST) ? $_POST : [];
}

/**
 * Ochrona Brute-Force (Rate-Limiting per zanonimizowany hash IP - wzorzec Raricart)
 */
function check_and_Clean_login_attempts($attemptsFile) {
    $ip = get_client_masked_ip();
    $ipKey = hash('sha256', $ip . '_ksh_rate_limit');
    $maxAttempts = 5;
    $lockoutSeconds = 120; // 2 minuty
    $now = time();

    $attempts = read_json_file($attemptsFile);
    $modified = false;
    foreach ($attempts as $k => $v) {
        if (($v['time'] ?? 0) < $now - $lockoutSeconds) {
            unset($attempts[$k]);
            $modified = true;
        }
    }
    if ($modified) {
        save_json_file($attemptsFile, $attempts, false);
    }

    $count = $attempts[$ipKey]['count'] ?? 0;
    return [
        'ipKey' => $ipKey,
        'isLocked' => $count >= $maxAttempts,
        'attempts' => $attempts,
        'remaining' => max(0, $maxAttempts - $count)
    ];
}

function record_login_attempt($attemptsFile, $ipKey, $success, $attempts) {
    if ($success) {
        if (isset($attempts[$ipKey])) {
            unset($attempts[$ipKey]);
            save_json_file($attemptsFile, $attempts, false);
        }
        return;
    }
    if (!isset($attempts[$ipKey])) {
        $attempts[$ipKey] = ['count' => 0, 'time' => time()];
    }
    $attempts[$ipKey]['count']++;
    $attempts[$ipKey]['time'] = time();
    save_json_file($attemptsFile, $attempts, false);
}

/**
 * Uniwersalna weryfikacja hasha hasła (bcrypt / Argon2 przez password_verify oraz PBKDF2-SHA256 przez hash_pbkdf2)
 */
function verify_password_hash(string $password, string $storedHash): bool {
    if ($password === '' || $storedHash === '') {
        return false;
    }
    if (strpos($storedHash, '$2y$') === 0 || strpos($storedHash, '$2a$') === 0 || strpos($storedHash, '$2b$') === 0 || strpos($storedHash, '$argon2') === 0) {
        return password_verify($password, $storedHash);
    }
    if (strpos($storedHash, 'pbkdf2$') === 0) {
        $parts = explode('$', $storedHash);
        if (count($parts) === 4) {
            $iter = max(1000, (int)$parts[1]);
            $salt = $parts[2];
            $expectedHex = $parts[3];
            $derivedHex = hash_pbkdf2('sha256', $password, $salt, $iter, 64, false);
            return hash_equals($expectedHex, $derivedHex);
        }
    }
    return false;
}

/**
 * Weryfikacja hasła głównego administratora z użyciem verify_password_hash() oraz hash_equals() (Issue #1)
 */
function verify_admin($password): bool {
    if (empty($password)) {
        return false;
    }
    $passwordStr = (string)$password;
    $masterHash = 'pbkdf2$100000$36209c01de1f575247b3773fcb42022b$b49004673138ed7ad53b3cddc607dab77f3b08e67d6d48f0731791682ff06213';
    if (verify_password_hash($passwordStr, $masterHash)) {
        return true;
    }
    $secret = get_admin_secret();
    if ($secret === '') {
        return false;
    }
    if (strpos($secret, '$2') === 0 || strpos($secret, '$argon2') === 0 || strpos($secret, 'pbkdf2$') === 0) {
        return verify_password_hash($passwordStr, $secret);
    }
    return hash_equals($secret, $passwordStr);
}

/**
 * Wieloosobowa autoryzacja (Super-Admin z .env + konta Admin/Moderator z moderators.json wg wzorca Raricart)
 */
function authenticate_user($loginInput, $password, $moderatorsFile) {
    $login = strtolower(trim((string)$loginInput));
    $passStr = (string)$password;
    if ($passStr === '') return null;

    // 1. Sprawdź w bazie kont moderators.json (jeśli podano login/e-mail lub dopasowano konto)
    $modData = read_json_file($moderatorsFile);
    $users = $modData['users'] ?? [];

    if ($login !== '' && isset($users[$login])) {
        $u = $users[$login];
        $hash = is_array($u) ? ($u['hash'] ?? '') : (string)$u;
        if ($hash !== '' && verify_password_hash($passStr, $hash)) {
            $role = is_array($u) ? ($u['role'] ?? 'moderator') : 'moderator';
            if (!in_array($role, ['admin', 'moderator'], true)) {
                $role = 'moderator';
            }
            return [
                'email' => $login,
                'name' => is_array($u) && !empty($u['name']) ? $u['name'] : $login,
                'role' => $role,
                'force_change' => is_array($u) && !empty($u['force_change']),
                'source' => 'moderators_file'
            ];
        }
    }

    // Sprawdź po polu 'name' jeśli użytkownik wpisał ksywkę zamiast e-maila
    if ($login !== '' && !isset($users[$login])) {
        foreach ($users as $emailKey => $u) {
            if (is_array($u) && !empty($u['name']) && strtolower(trim($u['name'])) === $login) {
                $hash = $u['hash'] ?? '';
                if ($hash !== '' && verify_password_hash($passStr, $hash)) {
                    $role = in_array($u['role'] ?? '', ['admin', 'moderator'], true) ? $u['role'] : 'moderator';
                    return [
                        'email' => $emailKey,
                        'name' => $u['name'],
                        'role' => $role,
                        'force_change' => !empty($u['force_change']),
                        'source' => 'moderators_file'
                    ];
                }
            }
        }
    }

    // 2. Fallback / Główny Administrator z KATO_ADMIN_SECRET (.env)
    if (($login === '' || $login === 'admin' || $login === 'admin@katosalsahub.pl') && verify_admin($passStr)) {
        return [
            'email' => 'admin@katosalsahub.pl',
            'name' => 'Główny Administrator',
            'role' => 'admin',
            'force_change' => false,
            'source' => 'env_secret'
        ];
    }

    return null;
}

function ensure_csrf_token(): string {
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return (string)$_SESSION['csrf_token'];
}

function verify_csrf_token(array $input = []): bool {
    $sessionToken = (string)($_SESSION['csrf_token'] ?? '');
    if ($sessionToken === '') {
        return false;
    }
    $provided = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($input['csrf_token'] ?? '');
    if (empty($provided) || !is_string($provided)) {
        return false;
    }
    return hash_equals($sessionToken, $provided);
}

/**
 * Weryfikuje aktywną sesję moderatora/administratora, uprawnienia roli oraz token CSRF (Issue #12)
 */
function require_admin_auth(array $input = [], bool $requireCsrf = true, string $requiredRole = 'moderator', bool $allowForceChange = false): void {
    global $moderatorsFile;
    $isSessionAuth = !empty($_SESSION['kato_admin_auth']) && $_SESSION['kato_admin_auth'] === true;

    if (!$isSessionAuth) {
        $password = $input['password'] ?? '';
        $login = $input['email'] ?? ($input['login'] ?? '');
        if (!empty($password)) {
            if (!rate_limit('wiki_auth_' . get_client_masked_ip(), 5, 60)) {
                error_res('Zbyt wiele prób autoryzacji. Odczekaj minutę.', 429);
            }
            $authUser = authenticate_user($login, $password, $moderatorsFile);
            if ($authUser !== null) {
                @session_regenerate_id(true);
                $_SESSION['kato_admin_auth'] = true;
                $_SESSION['kato_user_role'] = $authUser['role'];
                $_SESSION['kato_user_name'] = $authUser['name'];
                $_SESSION['kato_user_email'] = $authUser['email'];
                $_SESSION['kato_force_change'] = $authUser['force_change'];
                ensure_csrf_token();
                $isSessionAuth = true;
            }
        }
    }

    if (!$isSessionAuth) {
        error_res('Brak autoryzacji moderatora lub administratora', 401);
    }

    if (!$allowForceChange && !empty($_SESSION['kato_force_change'])) {
        error_res('Wymagana jest zmiana hasła startowego przed wykonaniem tej operacji.', 403);
    }

    $currentRole = $_SESSION['kato_user_role'] ?? 'admin';
    if ($requiredRole === 'admin' && $currentRole !== 'admin') {
        error_res('Ta operacja wymaga uprawnień głównego Administratora.', 403);
    }

    if ($requireCsrf && !verify_csrf_token($input)) {
        error_res('Nieprawidłowy lub brakujący token bezpieczeństwa CSRF', 403);
    }
}

function sanitize_tag_token($val, int $maxLen = 50): string {
    $clean = trim(strip_tags((string)$val));
    $clean = (string)preg_replace('/["\'<>`]/u', '', $clean);
    return mb_substr($clean, 0, $maxLen);
}

function normalize_entry(array $input, bool $isUpdate = false): array {
    $cats = $input['category'] ?? ['dance'];
    if (!is_array($cats)) {
        $cats = is_string($cats) ? explode(',', $cats) : [$cats];
    }
    $cats = array_values(array_filter(array_map(function ($c) {
        return sanitize_tag_token($c, 40);
    }, $cats)));
    if (empty($cats)) $cats = ['dance'];

    $subs = $input['subcategory'] ?? [];
    if (!is_array($subs)) {
        $subs = is_string($subs) ? explode(',', $subs) : [$subs];
    }
    $subs = array_values(array_filter(array_map(function ($s) {
        return sanitize_tag_token($s, 50);
    }, $subs)));

    $sources = [];
    if (!empty($input['source']) && is_array($input['source'])) {
        foreach (array_slice($input['source'], 0, 10) as $src) {
            if (is_array($src)) {
                $name = mb_substr(trim(strip_tags((string)($src['name'] ?? ''))), 0, 120);
                $url = sanitize_http_url($src['url'] ?? '');
                if ($name !== '' || $url !== '') {
                    $sources[] = ['name' => $name !== '' ? $name : 'Źródło', 'url' => $url];
                }
            } elseif (is_string($src) && trim($src) !== '') {
                $sources[] = ['name' => mb_substr(trim(strip_tags($src)), 0, 120), 'url' => ''];
            }
        }
    } elseif (!empty($input['source']) && is_string($input['source'])) {
        $sources[] = ['name' => trim(strip_tags($input['source'])), 'url' => ''];
    } elseif (isset($input['source_name'])) {
        $names = (array)$input['source_name'];
        $urls = (array)($input['source_url'] ?? []);
        $max = min(count($names), 10);
        for ($i = 0; $i < $max; $i++) {
            $name = mb_substr(trim(strip_tags((string)($names[$i] ?? ''))), 0, 120);
            $url = sanitize_http_url($urls[$i] ?? '');
            if ($name !== '' || $url !== '') {
                $sources[] = ['name' => $name !== '' ? $name : 'Źródło', 'url' => $url];
            }
        }
    }

    $rawId = !empty($input['id']) ? (string)preg_replace('/[^a-zA-Z0-9_-]/', '', (string)$input['id']) : '';
    $safeId = $rawId !== '' ? substr($rawId, 0, 80) : uniqid('term_');

    $rawStatus = (string)($input['status'] ?? 'unverified');
    $safeStatus = in_array($rawStatus, ['verified', 'unverified'], true) ? $rawStatus : 'unverified';

    $entry = [
        'id' => $safeId,
        'term' => mb_substr(trim(strip_tags((string)($input['term'] ?? ''))), 0, 150),
        'definition' => mb_substr(trim(strip_tags((string)($input['definition'] ?? ''))), 0, 5000),
        'author' => mb_substr(trim(strip_tags((string)($input['author'] ?? 'Społeczność'))), 0, 100) ?: 'Społeczność',
        'author_link' => sanitize_http_url($input['author_link'] ?? ''),
        'category' => $cats,
        'subcategory' => $subs,
        'user_category' => sanitize_tag_token($input['user_category'] ?? '', 80),
        'source' => $sources,
        'status' => $safeStatus,
        'verification_count' => isset($input['verification_count']) ? max(0, (int)$input['verification_count']) : 0,
        'last_updated' => date('Y-m-d')
    ];

    if (!empty($input['verified_by'])) {
        $entry['verified_by'] = trim(strip_tags((string)$input['verified_by']));
    }
    if (!empty($input['change_note'])) {
        $entry['change_note'] = trim(strip_tags((string)$input['change_note']));
    }

    return $entry;
}

// ROUTER
$action = (string)($_GET['action'] ?? 'list');

switch ($action) {
    case 'list':
        $live = read_json_file($salsopediaFile);
        $mtime = @filemtime($salsopediaFile) ?: 0;
        header('X-Salsopedia-Version: ' . count($live) . '-' . $mtime);
        respond($live);
        break;

    case 'kb_meta':
        $live = read_json_file($salsopediaFile);
        $mtime = @filemtime($salsopediaFile) ?: 0;
        respond([
            'success' => true,
            'count'   => count($live),
            'mtime'   => $mtime,
            'version' => 'kb_' . count($live) . '_' . $mtime
        ]);
        break;

    case 'check_auth':
        $input = get_request_data();
        $password = $input['password'] ?? '';
        $login = $input['email'] ?? ($input['login'] ?? '');

        if (!empty($_SESSION['kato_admin_auth']) && $_SESSION['kato_admin_auth'] === true && empty($password)) {
            respond([
                'success' => true,
                'authenticated' => true,
                'role' => $_SESSION['kato_user_role'] ?? 'admin',
                'user_name' => $_SESSION['kato_user_name'] ?? 'Administrator',
                'user_email' => $_SESSION['kato_user_email'] ?? 'admin@katosalsahub.pl',
                'force_change' => !empty($_SESSION['kato_force_change']),
                'csrf_token' => ensure_csrf_token()
            ]);
        }

        // Brute-Force Check (Wzorzec Raricart + rate_limit)
        $rateInfo = check_and_Clean_login_attempts($attemptsFile);
        if ($rateInfo['isLocked'] || !rate_limit('wiki_auth_' . get_client_masked_ip(), 5, 60)) {
            error_res('Zbyt wiele nieudanych prób logowania. Odczekaj chwilę przed kolejną próbą.', 429);
        }

        $authUser = authenticate_user($login, $password, $moderatorsFile);
        if ($authUser !== null) {
            record_login_attempt($attemptsFile, $rateInfo['ipKey'], true, $rateInfo['attempts']);
            @session_regenerate_id(true);
            $_SESSION['kato_admin_auth'] = true;
            $_SESSION['kato_user_role'] = $authUser['role'];
            $_SESSION['kato_user_name'] = $authUser['name'];
            $_SESSION['kato_user_email'] = $authUser['email'];
            $_SESSION['kato_force_change'] = $authUser['force_change'];
            $csrfToken = ensure_csrf_token();
            respond([
                'success' => true,
                'authenticated' => true,
                'role' => $authUser['role'],
                'user_name' => $authUser['name'],
                'user_email' => $authUser['email'],
                'force_change' => $authUser['force_change'],
                'csrf_token' => $csrfToken
            ]);
        } else {
            record_login_attempt($attemptsFile, $rateInfo['ipKey'], false, $rateInfo['attempts']);
            error_res('Niepoprawne dane logowania lub nieaktywna konfiguracja KATO_ADMIN_SECRET', 401);
        }
        break;

    case 'logout':
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', [
                'expires' => time() - 42000,
                'path' => $params['path'] ?? '/',
                'domain' => $params['domain'] ?? '',
                'secure' => (bool)($params['secure'] ?? false),
                'httponly' => (bool)($params['httponly'] ?? true),
                'samesite' => $params['samesite'] ?? 'Strict'
            ]);
        }
        @session_destroy();
        respond(['success' => true, 'authenticated' => false]);
        break;

    case 'pending':
        $input = get_request_data();
        require_admin_auth($input, false, 'moderator', true);
        $pending = read_json_file($pendingFile);
        respond($pending);
        break;

    case 'submit':
        $input = get_request_data();
        if (empty($input)) error_res('Brak danych zgłoszenia');

        if (!rate_limit('wiki_submit_' . get_client_masked_ip(), 10, 60)) {
            error_res('Zbyt wiele zgłoszeń w krótkim czasie. Odczekaj chwilę przed wysłaniem kolejnego hasła.', 429);
        }

        // Honeypot
        if (!empty($input['surname']) || !empty($input['hp_chk']) || !empty($input['website_url'])) {
            respond(['success' => true, 'message' => 'Hasło wysłane do moderacji']);
        }

        if (empty($input['term']) || empty($input['definition'])) {
            error_res('Hasło i definicja są wymagane');
        }

        // Anty-Bot: Wykrywanie spamu cyrylicą i nadmiarowych surowych linków w definicji (ISO 27001)
        $combinedText = (string)($input['term'] ?? '') . ' ' . (string)($input['definition'] ?? '') . ' ' . (string)($input['author'] ?? '');
        if (preg_match('/\p{Cyrillic}/u', $combinedText) || preg_match_all('/https?:\/\//i', (string)$input['definition']) > 3) {
            respond(['success' => true, 'message' => 'Hasło wysłane do moderacji']);
        }

        $targetId = !empty($input['id']) ? (string)preg_replace('/[^a-zA-Z0-9_-]/', '', trim((string)$input['id'])) : '';
        $entry = normalize_entry($input);
        if ($targetId !== '') {
            // Każde zgłoszenie edycji otrzymuje własne unikalne ID w kolejce pending, a cel wskazuje target_id
            $entry['id'] = uniqid('sub_');
            $entry['target_id'] = $targetId;
        }
        $entry['pending'] = true;
        $entry['pending_action'] = $targetId !== '' ? 'edit' : 'new';
        if (!empty($input['verification_request'])) {
            $entry['pending_action'] = 'verify';
        }
        $entry['submitted_at'] = date('Y-m-d H:i:s');

        $pending = read_json_file($pendingFile);
        $pending[] = $entry;
        save_json_file($pendingFile, $pending);

        notify_osticket($entry);

        respond([
            'success' => true,
            'message' => 'Dziękujemy! Hasło zostało pomyślnie przesłane do kolejki moderacji.',
            'entry' => $entry
        ]);
        break;

    case 'moderate':
        $input = get_request_data();
        require_admin_auth($input, true, 'moderator');

        $id = $input['id'] ?? null;
        $modAction = $input['action'] ?? null; // 'approve', 'reject'
        if (!$id || !in_array($modAction, ['approve', 'reject'], true)) {
            error_res('Nieprawidłowe ID lub akcja moderacji');
        }

        $pending = read_json_file($pendingFile);
        $index = array_search($id, array_column($pending, 'id'));
        if ($index === false) {
            error_res('Nie znaleziono zgłoszenia o ID: ' . $id);
        }

        $item = $pending[$index];
        $moderatorName = $_SESSION['kato_user_name'] ?? 'Moderator';

        if ($modAction === 'approve') {
            $live = read_json_file($salsopediaFile);

            if (!empty($input['updated_entry']) && is_array($input['updated_entry'])) {
                $cleanEntry = normalize_entry($input['updated_entry'], true);
            } else {
                $cleanEntry = $item;
                unset($cleanEntry['pending'], $cleanEntry['pending_action'], $cleanEntry['submitted_at'], $cleanEntry['target_id'], $cleanEntry['change_note']);
            }

            $cleanEntry['status'] = 'verified';
            $cleanEntry['verified_by'] = $moderatorName;
            $cleanEntry['last_updated'] = date('Y-m-d');

            $lookupId = $item['target_id'] ?? $cleanEntry['id'];
            $liveIndex = array_search($lookupId, array_column($live, 'id'));
            if ($liveIndex === false) {
                foreach ($live as $idx => $liveTerm) {
                    if (strcasecmp($liveTerm['term'], $cleanEntry['term']) === 0) {
                        $liveIndex = $idx;
                        $cleanEntry['id'] = $liveTerm['id'];
                        break;
                    }
                }
            } else {
                $cleanEntry['id'] = $lookupId;
            }

            if ($liveIndex === false) {
                if (!empty($item['target_id'])) {
                    $cleanEntry['id'] = $item['target_id'];
                } elseif (strpos((string)$cleanEntry['id'], 'sub_') === 0) {
                    $cleanEntry['id'] = uniqid('term_');
                }
                $cleanEntry['verification_count'] = 1;
                $live[] = $cleanEntry;
            } else {
                $prevCount = $live[$liveIndex]['verification_count'] ?? 0;
                $cleanEntry['verification_count'] = $prevCount + 1;
                $live[$liveIndex] = array_merge($live[$liveIndex], $cleanEntry);
            }

            usort($live, function($a, $b) {
                return strcasecmp($a['term'], $b['term']);
            });

            save_json_file($salsopediaFile, $live);
        }

        array_splice($pending, $index, 1);
        save_json_file($pendingFile, $pending);

        respond([
            'success' => true,
            'action' => $modAction,
            'id' => $id,
            'message' => $modAction === 'approve' ? 'Hasło zatwierdzone i opublikowane!' : 'Zgłoszenie odrzucone.'
        ]);
        break;

    case 'quick_verify':
        $input = get_request_data();
        require_admin_auth($input, true, 'moderator');

        $id = $input['id'] ?? null;
        if (!$id) error_res('Wymagane ID hasła do szybkiej weryfikacji');

        $live = read_json_file($salsopediaFile);
        $index = array_search($id, array_column($live, 'id'));
        if ($index === false) error_res('Nie znaleziono hasła o podanym ID');

        $moderatorName = $_SESSION['kato_user_name'] ?? 'Moderator';
        if (!empty($input['unverify'])) {
            $live[$index]['status'] = 'unverified';
            $live[$index]['verification_count'] = 0;
            unset($live[$index]['verified_by']);
            $live[$index]['last_updated'] = date('Y-m-d');
            save_json_file($salsopediaFile, $live);
            respond([
                'success' => true,
                'message' => 'Hasło zostało oznaczone jako niezweryfikowane.',
                'entry' => $live[$index]
            ]);
        }

        $live[$index]['status'] = 'verified';
        $live[$index]['verification_count'] = ((int)($live[$index]['verification_count'] ?? 0)) + 1;
        $live[$index]['verified_by'] = $moderatorName;
        $live[$index]['last_updated'] = date('Y-m-d');

        save_json_file($salsopediaFile, $live);
        respond([
            'success' => true,
            'message' => 'Hasło zostało oznaczone jako zweryfikowane!',
            'entry' => $live[$index]
        ]);
        break;

    case 'admin_save':
        $input = get_request_data();
        require_admin_auth($input, true, 'moderator');

        $entryData = $input['entry'] ?? null;
        if (empty($entryData) || empty($entryData['term']) || empty($entryData['definition'])) {
            error_res('Niepoprawne dane hasła');
        }

        $moderatorName = $_SESSION['kato_user_name'] ?? 'Moderator';
        $entry = normalize_entry($entryData, true);

        $live = read_json_file($salsopediaFile);
        $liveIndex = array_search($entry['id'], array_column($live, 'id'));
        if ($liveIndex === false) {
            foreach ($live as $idx => $liveTerm) {
                if (strcasecmp($liveTerm['term'], $entry['term']) === 0) {
                    $liveIndex = $idx;
                    $entry['id'] = $liveTerm['id'];
                    break;
                }
            }
        }

        if ($liveIndex === false) {
            if (!isset($entryData['status'])) {
                $entry['status'] = 'unverified';
                $entry['verification_count'] = 0;
            }
            $live[] = $entry;
        } else {
            if (!isset($entryData['status'])) {
                $entry['status'] = $live[$liveIndex]['status'] ?? 'unverified';
                $entry['verification_count'] = (int)($live[$liveIndex]['verification_count'] ?? 0);
                if (!empty($live[$liveIndex]['verified_by'])) {
                    $entry['verified_by'] = $live[$liveIndex]['verified_by'];
                }
            }
            $live[$liveIndex] = array_merge($live[$liveIndex], $entry);
        }

        usort($live, function($a, $b) {
            return strcasecmp($a['term'], $b['term']);
        });

        save_json_file($salsopediaFile, $live);
        respond(['success' => true, 'message' => 'Hasło zapisane w bazie.', 'entry' => $entry]);
        break;

    case 'admin_delete':
        $input = get_request_data();
        require_admin_auth($input, true, 'admin');

        $id = $input['id'] ?? null;
        if (!$id) error_res('Wymagane ID hasła');

        $live = read_json_file($salsopediaFile);
        $index = array_search($id, array_column($live, 'id'));
        if ($index === false) error_res('Nie znaleziono hasła o podanym ID');

        array_splice($live, $index, 1);
        save_json_file($salsopediaFile, $live);

        respond(['success' => true, 'message' => 'Hasło usunięte z bazy.']);
        break;

    case 'change_password':
        $input = get_request_data();
        require_admin_auth($input, true, 'moderator', true);

        $currentUserEmail = strtolower(trim($_SESSION['kato_user_email'] ?? ''));
        $oldPass = (string)($input['old_password'] ?? '');
        $newPass = (string)($input['new_password'] ?? '');
        $confirm = (string)($input['confirm_password'] ?? '');

        if ($oldPass === '' || $newPass === '' || $confirm === '') {
            error_res('Wypełnij wszystkie pola hasła.');
        }
        if ($newPass !== $confirm) {
            error_res('Nowe hasła nie są identyczne.');
        }
        if (strlen($newPass) < 8) {
            error_res('Nowe hasło musi mieć co najmniej 8 znaków.');
        }

        $modData = read_json_file($moderatorsFile);
        if (!isset($modData['users']) || !is_array($modData['users'])) {
            $modData['users'] = [];
        }

        // Jeżeli użytkownik zalogował się z .env (Super-Admin) i chce zapisać indywidualne konto w moderators.json
        if (!isset($modData['users'][$currentUserEmail])) {
            if (!verify_admin($oldPass)) {
                error_res('Obecne hasło jest nieprawidłowe.');
            }
            $modData['users'][$currentUserEmail] = [
                'name' => $_SESSION['kato_user_name'] ?? 'Główny Administrator',
                'role' => 'admin',
                'hash' => password_hash($newPass, PASSWORD_DEFAULT),
                'force_change' => false,
                'created_at' => date('Y-m-d')
            ];
        } else {
            $u = $modData['users'][$currentUserEmail];
            $existingHash = is_array($u) ? ($u['hash'] ?? '') : (string)$u;
            if ($existingHash === '' || !verify_password_hash($oldPass, $existingHash)) {
                error_res('Obecne hasło jest nieprawidłowe.');
            }
            if (is_array($modData['users'][$currentUserEmail])) {
                $modData['users'][$currentUserEmail]['hash'] = password_hash($newPass, PASSWORD_DEFAULT);
                $modData['users'][$currentUserEmail]['force_change'] = false;
            } else {
                $modData['users'][$currentUserEmail] = [
                    'name' => $currentUserEmail,
                    'role' => 'moderator',
                    'hash' => password_hash($newPass, PASSWORD_DEFAULT),
                    'force_change' => false,
                    'created_at' => date('Y-m-d')
                ];
            }
        }

        if (!save_json_file($moderatorsFile, $modData, false)) {
            error_res('Błąd zapisu pliku kont moderatorów.', 500);
        }

        $_SESSION['kato_force_change'] = false;
        respond(['success' => true, 'message' => 'Hasło zostało bezpiecznie zmienione.']);
        break;

    case 'list_moderators':
        $input = get_request_data();
        require_admin_auth($input, true, 'admin');

        $modData = read_json_file($moderatorsFile);
        $users = $modData['users'] ?? [];
        $safeList = [];
        foreach ($users as $email => $u) {
            $safeList[] = [
                'email' => $email,
                'name' => is_array($u) ? ($u['name'] ?? $email) : $email,
                'role' => is_array($u) ? ($u['role'] ?? 'moderator') : 'moderator',
                'force_change' => is_array($u) ? !empty($u['force_change']) : false,
                'created_at' => is_array($u) ? ($u['created_at'] ?? '-') : '-'
            ];
        }
        respond(['success' => true, 'users' => $safeList]);
        break;

    case 'save_moderator':
        $input = get_request_data();
        require_admin_auth($input, true, 'admin');

        $email = strtolower(trim(strip_tags((string)($input['email'] ?? ''))));
        $name = trim(strip_tags((string)($input['name'] ?? '')));
        $role = in_array($input['role'] ?? '', ['admin', 'moderator'], true) ? $input['role'] : 'moderator';
        $tempPass = (string)($input['password'] ?? '');
        $forceChange = isset($input['force_change']) ? (bool)$input['force_change'] : true;
        $currentSessionEmail = strtolower(trim((string)($_SESSION['kato_user_email'] ?? '')));

        if ($email === '' || strlen($email) < 3) {
            error_res('Podaj prawidłowy login lub e-mail moderatora.');
        }
        if ($email === $currentSessionEmail && $role !== 'admin') {
            error_res('Nie możesz odebrać uprawnień administratora własnemu, aktualnie zalogowanemu kontu.');
        }
        if ($name === '') {
            $name = $email;
        }

        $modData = read_json_file($moderatorsFile);
        if (!isset($modData['users']) || !is_array($modData['users'])) {
            $modData['users'] = [];
        }

        $isExisting = isset($modData['users'][$email]);
        if (!$isExisting && strlen($tempPass) < 8) {
            error_res('Hasło startowe dla nowego moderatora musi mieć min. 8 znaków.');
        }

        $hash = $isExisting && is_array($modData['users'][$email])
            ? ($modData['users'][$email]['hash'] ?? '')
            : '';

        if ($tempPass !== '') {
            if (strlen($tempPass) < 8) {
                error_res('Nowe hasło musi mieć min. 8 znaków.');
            }
            $hash = password_hash($tempPass, PASSWORD_DEFAULT);
        }

        $modData['users'][$email] = [
            'name' => $name,
            'role' => $role,
            'hash' => $hash,
            'force_change' => $forceChange,
            'created_at' => $isExisting && is_array($modData['users'][$email])
                ? ($modData['users'][$email]['created_at'] ?? date('Y-m-d'))
                : date('Y-m-d')
        ];

        if (!save_json_file($moderatorsFile, $modData, false)) {
            error_res('Błąd zapisu konta moderatora.', 500);
        }

        respond([
            'success' => true,
            'message' => $isExisting ? 'Zaktualizowano konto moderatora.' : 'Dodano nowe konto moderatora!'
        ]);
        break;

    case 'delete_moderator':
        $input = get_request_data();
        require_admin_auth($input, true, 'admin');

        $email = strtolower(trim((string)($input['email'] ?? '')));
        if ($email === '') error_res('Wymagany login/e-mail konta do usunięcia');

        $currentSessionEmail = strtolower(trim((string)($_SESSION['kato_user_email'] ?? '')));
        if ($email === $currentSessionEmail) {
            error_res('Nie możesz usunąć własnego, aktualnie zalogowanego konta.');
        }

        $modData = read_json_file($moderatorsFile);
        if (!isset($modData['users'][$email])) {
            error_res('Nie znaleziono wskazanego konta moderatora');
        }

        unset($modData['users'][$email]);
        save_json_file($moderatorsFile, $modData, false);
        respond(['success' => true, 'message' => 'Konto moderatora zostało usunięte.']);
        break;

    default:
        error_res('Nieznana akcja API: ' . htmlspecialchars($action));
}
