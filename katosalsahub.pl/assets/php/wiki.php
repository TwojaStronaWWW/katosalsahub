<?php
/**
 * Kato Salsa Hub - Salsopedia Backend API (v2.0 - Multi-Role Admin/Moderator & Raricart Security Patterns)
 * Obsługa: Listowanie, Oczekujące (Pending), Zgłaszanie (Submit), Moderacja (Diff), Szybka Weryfikacja i Zarządzanie Kontami
 * Zabezpieczenia ISO 27001 & Wzorce Raricart:
 * - Zero zahardkodowanych haseł (getenv('KATO_ADMIN_SECRET') + baza kont moderators.json z password_verify / hash_equals)
 * - Ochrona Brute-Force (Rate-Limiting per zanonimizowane IP w login_attempts.json - blokada 15 min po 5 próbach)
 * - Wymuszenie zmiany hasła tymczasowego przy pierwszym logowaniu moderatora (force_change)
 * - Kontrola dostępu oparta na rolach (RBAC: 'admin' vs 'moderator')
 * - Sesja HttpOnly + SameSite=Strict oraz ochrona CSRF (X-CSRF-Token)
 * - Transakcyjny zapis z blokadą flock(LOCK_EX), kopią zapasową .bak oraz X-LiteSpeed-Purge
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
$moderatorsFile = $dataDir . '/moderators.json';
$attemptsFile = $dataDir . '/login_attempts.json';

if (!file_exists($dataDir)) {
    @mkdir($dataDir, 0755, true);
}

/**
 * Pobiera główny sekret administratora z getenv(), $_ENV lub pliku .env poza webrootem (Zero Secrets in Git)
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
 * Atomowy zapis pliku JSON z blokadą wyłączną flock(LOCK_EX), kopią zapasową .bak oraz czyszczeniem cache LiteSpeed (Wzorzec Raricart)
 */
function save_json_file($file, $data, $purgeCache = true) {
    $encoded = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    if ($encoded === false) return false;

    // 1. Automatyczna kopia zapasowa .bak przed modyfikacją
    if (file_exists($file) && filesize($file) > 0) {
        @copy($file, $file . '.bak');
    }

    // 2. Zapis z blokadą wyłączną flock(LOCK_EX)
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

function get_request_data() {
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
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $ipKey = hash('sha256', $ip . '_ksh_rate_limit');
    $maxAttempts = 5;
    $lockoutSeconds = 900; // 15 minut
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
 * Weryfikacja hasła głównego administratora z użyciem password_verify() oraz hash_equals() (Issue #1)
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
        if ($hash !== '' && password_verify($passStr, $hash)) {
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
                if ($hash !== '' && password_verify($passStr, $hash)) {
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
 * Weryfikuje aktywną sesję moderatora/administratora, uprawnienia roli oraz token CSRF (Issue #12)
 */
function require_admin_auth($input = [], $requireCsrf = true, $requiredRole = 'moderator') {
    global $moderatorsFile;
    $isSessionAuth = !empty($_SESSION['kato_admin_auth']) && $_SESSION['kato_admin_auth'] === true;

    if (!$isSessionAuth) {
        $password = $input['password'] ?? '';
        $login = $input['email'] ?? ($input['login'] ?? '');
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

    if (!$isSessionAuth) {
        error_res('Brak autoryzacji moderatora lub administratora', 401);
    }

    $currentRole = $_SESSION['kato_user_role'] ?? 'admin';
    if ($requiredRole === 'admin' && $currentRole !== 'admin') {
        error_res('Ta operacja wymaga uprawnień głównego Administratora.', 403);
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
    } elseif (!empty($input['source']) && is_string($input['source'])) {
        $sources[] = ['name' => trim(strip_tags($input['source'])), 'url' => ''];
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

    if (!empty($input['verified_by'])) {
        $entry['verified_by'] = trim(strip_tags((string)$input['verified_by']));
    }
    if (!empty($input['change_note'])) {
        $entry['change_note'] = trim(strip_tags((string)$input['change_note']));
    }

    return $entry;
}

// ROUTER
$action = $_GET['action'] ?? 'list';

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

        // Brute-Force Check (Wzorzec Raricart)
        $rateInfo = check_and_Clean_login_attempts($attemptsFile);
        if ($rateInfo['isLocked']) {
            error_res('Zbyt wiele nieudanych prób logowania. Odczekaj 15 minut przed kolejną próbą.', 429);
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
        require_admin_auth($input, false, 'moderator');
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

        $targetId = !empty($input['id']) ? trim((string)$input['id']) : '';
        $entry = normalize_entry($input);
        $entry['pending'] = true;
        $entry['pending_action'] = $targetId !== '' ? 'edit' : 'new';
        if (!empty($input['verification_request'])) {
            $entry['pending_action'] = 'verify';
        }
        if ($targetId !== '') {
            $entry['target_id'] = $targetId;
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
        $entry['status'] = 'verified';
        $entry['verified_by'] = $moderatorName;
        if ($entry['verification_count'] < 1) $entry['verification_count'] = 1;

        $live = read_json_file($salsopediaFile);
        $liveIndex = array_search($entry['id'], array_column($live, 'id'));

        if ($liveIndex === false) {
            $live[] = $entry;
        } else {
            $prevCount = (int)($live[$liveIndex]['verification_count'] ?? 1);
            $entry['verification_count'] = max(1, $prevCount);
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
        require_admin_auth($input, true, 'moderator');

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
            if ($existingHash === '' || !password_verify($oldPass, $existingHash)) {
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

        if ($email === '' || strlen($email) < 3) {
            error_res('Podaj prawidłowy login lub e-mail moderatora.');
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
