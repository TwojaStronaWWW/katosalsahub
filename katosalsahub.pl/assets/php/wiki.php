<?php
/**
 * Kato Salsa Hub - Salsopedia Backend API
 * Obsługa: Listowanie, Oczekujące (Pending), Zgłaszanie (Submit), Moderacja i Administracja
 * Zabezpieczenia ISO 27001:
 * - Zero zahardkodowanych haseł (getenv('KATO_ADMIN_SECRET') + password_verify / hash_equals)
 * - Sesja administratora HttpOnly + SameSite=Strict oraz ochrona CSRF (X-CSRF-Token)
 * - Transakcyjny zapis z blokadą flock(LOCK_EX) oraz automatyczną kopią zapasową .bak
 */

ini_set('display_errors', 0);
ini_set('log_errors', 1);
error_reporting(E_ALL);

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
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-CSRF-Token');

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
 * Pobiera sekret z getenv(), $_ENV lub pliku .env poza webrootem (Zero Secrets in Git)
 */
function get_admin_secret() {
    $keys = ['KATO_ADMIN_SECRET', 'KATO_ADMIN_PASS'];
    foreach ($keys as $key) {
        $val = getenv($key);
        if ($val !== false && $val !== '') {
            return $val;
        }
        if (!empty($_ENV[$key])) {
            return $_ENV[$key];
        }
    }

    $envPaths = [
        __DIR__ . '/../../../.env',
        __DIR__ . '/../../.env',
    ];
    foreach ($envPaths as $envPath) {
        if (is_readable($envPath)) {
            $lines = @file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
            if (is_array($lines)) {
                foreach ($lines as $line) {
                    $line = trim($line);
                    if ($line === '' || strpos($line, '#') === 0 || strpos($line, '=') === false) {
                        continue;
                    }
                    list($k, $v) = explode('=', $line, 2);
                    $k = trim($k);
                    if (in_array($k, $keys, true)) {
                        return trim($v, " \t\n\r\0\x0B\"'");
                    }
                }
            }
        }
    }
    return '';
}

function respond($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit;
}

function error_res($msg, $code = 400) {
    respond(['success' => false, 'error' => $msg], $code);
}

function read_json_file($file) {
    if (!file_exists($file)) return [];
    $fp = @fopen($file, 'rb');
    if (!$fp) return [];
    $content = '';
    if (@flock($fp, LOCK_SH)) {
        $size = filesize($file);
        if ($size > 0) {
            $content = fread($fp, $size);
        }
        @flock($fp, LOCK_UN);
    }
    fclose($fp);
    if ($content === false || $content === '') return [];
    $data = json_decode($content, true);
    return is_array($data) ? $data : [];
}

/**
 * Atomowy zapis pliku JSON z blokadą wyłączną flock(LOCK_EX) i kopią zapasową .bak (Issue #13)
 */
function save_json_file($file, $data) {
    $encoded = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    if ($encoded === false) return false;

    // 1. Automatyczna kopia zapasowa .bak przed modyfikacją
    if (file_exists($file) && filesize($file) > 0) {
        @copy($file, $file . '.bak');
    }

    // 2. Zapis z blokadą wyłączną flock(LOCK_EX)
    $fp = @fopen($file, 'c+b');
    if (!$fp) {
        return @file_put_contents($file, $encoded, LOCK_EX) !== false;
    }

    if (!@flock($fp, LOCK_EX)) {
        fclose($fp);
        return false;
    }

    ftruncate($fp, 0);
    rewind($fp);
    $written = fwrite($fp, $encoded);
    fflush($fp);
    @flock($fp, LOCK_UN);
    fclose($fp);

    return $written !== false;
}

function get_request_data() {
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
function verify_admin($password) {
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

function ensure_csrf_token() {
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

function verify_csrf_token($input = []) {
    $sessionToken = $_SESSION['csrf_token'] ?? '';
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
function require_admin_auth($input = [], $requireCsrf = true) {
    $isSessionAuth = !empty($_SESSION['kato_admin_auth']) && $_SESSION['kato_admin_auth'] === true;

    if (!$isSessionAuth) {
        $password = $input['password'] ?? '';
        if (!empty($password) && verify_admin($password)) {
            @session_regenerate_id(true);
            $_SESSION['kato_admin_auth'] = true;
            ensure_csrf_token();
            $isSessionAuth = true;
        }
    }

    if (!$isSessionAuth) {
        error_res('Brak autoryzacji administratora', 401);
    }

    if ($requireCsrf && !verify_csrf_token($input)) {
        error_res('Nieprawidłowy lub brakujący token bezpieczeństwa CSRF', 403);
    }
}

function normalize_entry($input, $isUpdate = false) {
    $cats = $input['category'] ?? ['dance'];
    if (!is_array($cats)) {
        $cats = is_string($cats) ? explode(',', $cats) : [$cats];
    }
    $cats = array_values(array_filter(array_map('trim', $cats)));
    if (empty($cats)) $cats = ['dance'];

    $subs = $input['subcategory'] ?? [];
    if (!is_array($subs)) {
        $subs = is_string($subs) ? explode(',', $subs) : [$subs];
    }
    $subs = array_values(array_filter(array_map('trim', $subs)));

    $sources = [];
    if (!empty($input['source']) && is_array($input['source'])) {
        foreach ($input['source'] as $src) {
            if (is_array($src)) {
                $name = trim(strip_tags($src['name'] ?? ''));
                $url = trim(strip_tags($src['url'] ?? ''));
                if (!empty($name) || !empty($url)) {
                    $sources[] = ['name' => $name, 'url' => $url];
                }
            } elseif (is_string($src) && !empty(trim($src))) {
                $sources[] = ['name' => trim(strip_tags($src)), 'url' => ''];
            }
        }
    } elseif (isset($input['source_name'])) {
        $names = (array)$input['source_name'];
        $urls = (array)($input['source_url'] ?? []);
        for ($i = 0; $i < count($names); $i++) {
            $name = trim(strip_tags($names[$i] ?? ''));
            $url = trim(strip_tags($urls[$i] ?? ''));
            if (!empty($name) || !empty($url)) {
                $sources[] = ['name' => $name, 'url' => $url];
            }
        }
    }

    $entry = [
        'id' => !empty($input['id']) ? trim($input['id']) : uniqid('term_'),
        'term' => trim(strip_tags($input['term'] ?? '')),
        'definition' => trim(strip_tags($input['definition'] ?? '')),
        'author' => trim(strip_tags($input['author'] ?? 'Społeczność')),
        'author_link' => trim(strip_tags($input['author_link'] ?? '')),
        'category' => $cats,
        'subcategory' => $subs,
        'user_category' => trim(strip_tags($input['user_category'] ?? '')),
        'source' => $sources,
        'status' => $input['status'] ?? 'unverified',
        'verification_count' => isset($input['verification_count']) ? (int)$input['verification_count'] : 0,
        'last_updated' => date('Y-m-d')
    ];

    return $entry;
}

// ROUTER
$action = $_GET['action'] ?? 'list';

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
            error_res('Niepoprawne hasło administratora lub nieaktywna konfiguracja KATO_ADMIN_SECRET', 401);
        }
        break;

    case 'logout':
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(
                session_name(),
                '',
                time() - 42000,
                $params['path'],
                $params['domain'],
                $params['secure'],
                $params['httponly']
            );
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
