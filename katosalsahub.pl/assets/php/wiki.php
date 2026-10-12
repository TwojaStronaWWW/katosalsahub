<?php
/**
 * Kato Salsa Hub - Salsopedia Backend API
 * Obsługa: Listowanie, Oczekujące (Pending), Zgłaszanie (Submit), Moderacja i Administracja
 */

ini_set('display_errors', 0);
ini_set('log_errors', 1);
error_reporting(E_ALL);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$dataDir = __DIR__ . '/../data';
$salsopediaFile = $dataDir . '/salsopedia.json';
$pendingFile = $dataDir . '/pending_edits.json';

if (!file_exists($dataDir)) {
    @mkdir($dataDir, 0755, true);
}

$ADMIN_PASSWORD = getenv('KATO_ADMIN_PASS') ?: 'katoAdmin2024';

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
    $content = @file_get_contents($file);
    if ($content === false || $content === '') return [];
    $data = json_decode($content, true);
    return is_array($data) ? $data : [];
}

function save_json_file($file, $data) {
    $encoded = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    return @file_put_contents($file, $encoded, LOCK_EX);
}

function get_request_data() {
    $raw = file_get_contents('php://input');
    if (!empty($raw)) {
        $json = json_decode($raw, true);
        if (is_array($json)) return $json;
    }
    return is_array($_POST) ? $_POST : [];
}

function verify_admin($password) {
    global $ADMIN_PASSWORD;
    if (empty($password)) return false;
    return hash_equals($ADMIN_PASSWORD, (string)$password);
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
        $password = $input['password'] ?? $_GET['password'] ?? '';
        if (verify_admin($password)) {
            respond(['success' => true, 'authenticated' => true]);
        } else {
            error_res('Niepoprawne hasło administratora', 401);
        }
        break;

    case 'pending':
        $input = get_request_data();
        $password = $input['password'] ?? $_GET['password'] ?? '';
        if (!verify_admin($password)) {
            error_res('Brak autoryzacji do podglądu kolejki moderacji', 401);
        }
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
        $password = $input['password'] ?? '';
        if (!verify_admin($password)) {
            error_res('Brak autoryzacji administratora', 401);
        }

        $id = $input['id'] ?? null;
        $modAction = $input['action'] ?? null; // 'approve', 'reject'
        if (!$id || !in_array($modAction, ['approve', 'reject'])) {
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

            // Jeśli admin przesłał zaktualizowane dane w trakcie zatwierdzania
            if (!empty($input['updated_entry']) && is_array($input['updated_entry'])) {
                $cleanEntry = normalize_entry($input['updated_entry'], true);
            } else {
                $cleanEntry = $item;
                unset($cleanEntry['pending'], $cleanEntry['pending_action'], $cleanEntry['submitted_at']);
            }

            $cleanEntry['status'] = 'verified';
            $cleanEntry['last_updated'] = date('Y-m-d');

            // Szukamy po ID lub nazwie hasła
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

            // Sortowanie A-Z
            usort($live, function($a, $b) {
                return strcasecmp($a['term'], $b['term']);
            });

            save_json_file($salsopediaFile, $live);
        }

        // Usuń z pending (zarówno approve jak i reject)
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
        // Bezpośredni zapis/edycja przez administratora w bazie live
        $input = get_request_data();
        $password = $input['password'] ?? '';
        if (!verify_admin($password)) {
            error_res('Brak autoryzacji administratora', 401);
        }

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
        $password = $input['password'] ?? '';
        if (!verify_admin($password)) {
            error_res('Brak autoryzacji administratora', 401);
        }

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
