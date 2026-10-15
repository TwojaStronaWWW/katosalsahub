<?php
declare(strict_types=1);

/**
 * Kato Salsa Hub - Salsopedia Backend API
 * Obsługa: Listowanie, Oczekujące (Pending), Zgłaszanie (Submit), Moderacja i Administracja
 * Zabezpieczenia ISO 27001:
 * - Zero zahardkodowanych haseł (getenv('KATO_ADMIN_SECRET') + password_verify / hash_equals)
 * - Sesja administratora HttpOnly + SameSite=Strict oraz ochrona CSRF (X-CSRF-Token)
 * - Rate Limiting przeciwko Brute-Force i spamowi zgłoszeń
 * - Transakcyjny zapis z blokadą flock(LOCK_EX) oraz automatyczną kopią zapasową .bak
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

if (!file_exists($dataDir)) {
    @mkdir($dataDir, 0755, true);
}

/**
 * Pobiera zmienną środowiskową z getenv(), $_ENV lub pliku .env poza webrootem
 */
function get_env_secret(string $key, string $default = ''): string {
    $val = getenv($key);
    if ($val !== false && $val !== '') return (string)$val;
    if (!empty($_ENV[$key])) return (string)$_ENV[$key];
    foreach ([__DIR__ . '/../../../.env', __DIR__ . '/../../.env'] as $envPath) {
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
 * Pobiera sekret administratora z getenv(), $_ENV lub pliku .env poza webrootem (Zero Secrets in Git)
 */
function get_admin_secret(): string {
    $secret = get_env_secret('KATO_ADMIN_SECRET');
    if ($secret !== '') return $secret;
    return get_env_secret('KATO_ADMIN_PASS');
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
 * Atomowy zapis pliku JSON z blokadą wyłączną flock(LOCK_EX) i kopią zapasową .bak (Issue #13)
 */
function save_json_file(string $file, array $data): bool {
    $encoded = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    if ($encoded === false) return false;

    $fp = @fopen($file, 'c+b');
    if (!$fp) {
        return @file_put_contents($file, $encoded, LOCK_EX) !== false;
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
 * Weryfikacja hasła administratora z użyciem password_verify() oraz hash_equals() (Issue #1)
 */
function verify_admin($password): bool {
    $secret = get_admin_secret();
    if ($secret === '' || empty($password)) {
        return false;
    }
    $passwordStr = (string)$password;
    if (strpos($secret, '$2y$') === 0 || strpos($secret, '$2a$') === 0 || strpos($secret, '$argon2') === 0) {
        return password_verify($passwordStr, $secret);
    }
    return hash_equals($secret, $passwordStr);
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
 * Weryfikuje aktywną sesję administratora oraz token CSRF dla żądań modyfikujących (Issue #12)
 */
function require_admin_auth(array $input = [], bool $requireCsrf = true): void {
    $isSessionAuth = !empty($_SESSION['kato_admin_auth']) && $_SESSION['kato_admin_auth'] === true;

    if (!$isSessionAuth) {
        $password = $input['password'] ?? '';
        if (!empty($password)) {
            if (!rate_limit('wiki_auth_' . get_client_masked_ip(), 5, 60)) {
                error_res('Zbyt wiele prób autoryzacji. Odczekaj minutę.', 429);
            }
            if (verify_admin($password)) {
                @session_regenerate_id(true);
                $_SESSION['kato_admin_auth'] = true;
                ensure_csrf_token();
                $isSessionAuth = true;
            }
        }
    }

    if (!$isSessionAuth) {
        error_res('Brak autoryzacji administratora', 401);
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

    return $entry;
}

// ROUTER
$action = (string)($_GET['action'] ?? 'list');

switch ($action) {
    case 'list':
        $live = read_json_file($salsopediaFile);
        respond($live);
        break;

    case 'check_auth':
        $input = get_request_data();
        $password = $input['password'] ?? '';
        if (!empty($_SESSION['kato_admin_auth']) && $_SESSION['kato_admin_auth'] === true && empty($password)) {
            respond([
                'success' => true,
                'authenticated' => true,
                'csrf_token' => ensure_csrf_token()
            ]);
        }
        if (!rate_limit('wiki_auth_' . get_client_masked_ip(), 5, 60)) {
            error_res('Zbyt wiele prób logowania. Odczekaj minutę przed kolejną próbą.', 429);
        }
        if (verify_admin($password)) {
            @session_regenerate_id(true);
            $_SESSION['kato_admin_auth'] = true;
            $csrfToken = ensure_csrf_token();
            respond([
                'success' => true,
                'authenticated' => true,
                'csrf_token' => $csrfToken
            ]);
        } else {
            error_res('Niepoprawne hasło administratora.', 401);
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
        require_admin_auth($input, false);
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

        $entry = normalize_entry($input);
        $entry['pending'] = true;
        $entry['pending_action'] = !empty($input['id']) ? 'edit' : 'new';
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
        require_admin_auth($input, true);

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

        if ($modAction === 'approve') {
            $live = read_json_file($salsopediaFile);

            if (!empty($input['updated_entry']) && is_array($input['updated_entry'])) {
                $cleanEntry = normalize_entry($input['updated_entry'], true);
            } else {
                $cleanEntry = $item;
                unset($cleanEntry['pending'], $cleanEntry['pending_action'], $cleanEntry['submitted_at']);
            }

            $cleanEntry['status'] = 'verified';
            $cleanEntry['last_updated'] = date('Y-m-d');

            $liveIndex = array_search($cleanEntry['id'], array_column($live, 'id'));
            if ($liveIndex === false) {
                foreach ($live as $idx => $liveTerm) {
                    if (strcasecmp($liveTerm['term'], $cleanEntry['term']) === 0) {
                        $liveIndex = $idx;
                        $cleanEntry['id'] = $liveTerm['id'];
                        break;
                    }
                }
            }

            if ($liveIndex === false) {
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

    case 'admin_save':
        $input = get_request_data();
        require_admin_auth($input, true);

        $entryData = $input['entry'] ?? null;
        if (empty($entryData) || empty($entryData['term']) || empty($entryData['definition'])) {
            error_res('Niepoprawne dane hasła');
        }

        $entry = normalize_entry($entryData, true);
        $entry['status'] = 'verified';
        if ($entry['verification_count'] < 1) $entry['verification_count'] = 1;

        $live = read_json_file($salsopediaFile);
        $liveIndex = array_search($entry['id'], array_column($live, 'id'));

        if ($liveIndex === false) {
            $live[] = $entry;
        } else {
            $live[$liveIndex] = $entry;
        }

        usort($live, function($a, $b) {
            return strcasecmp($a['term'], $b['term']);
        });

        save_json_file($salsopediaFile, $live);
        respond(['success' => true, 'message' => 'Hasło zapisane w bazie.', 'entry' => $entry]);
        break;

    case 'admin_delete':
        $input = get_request_data();
        require_admin_auth($input, true);

        $id = $input['id'] ?? null;
        if (!$id) error_res('Wymagane ID hasła');

        $live = read_json_file($salsopediaFile);
        $index = array_search($id, array_column($live, 'id'));
        if ($index === false) error_res('Nie znaleziono hasła o podanym ID');

        array_splice($live, $index, 1);
        save_json_file($salsopediaFile, $live);

        respond(['success' => true, 'message' => 'Hasło usunięte z bazy.']);
        break;

    default:
        error_res('Nieznana akcja API: ' . htmlspecialchars($action));
}
