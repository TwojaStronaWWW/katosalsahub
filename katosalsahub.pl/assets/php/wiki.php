<?php
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);
header('Content-Type: application/json; charset=utf-8');

/**
 * Salsopedia Unified Backend (v9)
 * Single source of truth for List, Pending, Submit, Moderate.
 * Implements User's strict architecture and data model.
 */

// Headers
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *'); 
header('Access-Control-Allow-Methods: GET, POST');

// Paths
$salsopediaFile = '../data/salsopedia.json';
$pendingFile = '../data/pending_edits.json';

// Ensure data directory exists
if (!file_exists('../data')) {
    mkdir('../data', 0777, true);
}

// === ROUTER ===
$action = $_GET['action'] ?? 'list';

switch ($action) {
    case 'list':
        respond(readJSON($salsopediaFile));
        break;

    case 'pending':
        respond(readJSON($pendingFile));
        break;

    case 'submit':
        handleSubmit();
        break;

    case 'moderate':
        handleModeration();
        break;

    default:
        error('Nieznana akcja');
}

// === HELPERS ===

function readJSON($file) {
    if (!file_exists($file)) return [];
    $content = file_get_contents($file);
    return json_decode($content, true) ?? [];
}

function saveJSON($file, $data) {
    return file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}

function respond($data) {
    echo json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit;
}

function error($msg, $code = 400) {
    http_response_code($code);
    respond(['success' => false, 'error' => $msg]);
}

function getInput() {
    // Robust input handling (JSON or POST)
    $input = json_decode(file_get_contents('php://input'), true);
    if (is_array($input)) return $input;
    return $_POST;
}

function normalizeEntry($input) {
    // Process Categories (Ensure Array)
    $cats = $input['category'] ?? ['dance'];
    if (!is_array($cats)) $cats = is_string($cats) ? explode(',', $cats) : [$cats];
    $cats = array_filter($cats);
    if (empty($cats)) $cats = ['dance'];

    // Process Subcategories
    $subs = $input['subcategory'] ?? [];
    if (!is_array($subs)) $subs = is_string($subs) ? explode(',', $subs) : [$subs];

    // Process Sources (Defensive)
    $sources = $input['source'] ?? [];
    // If coming from POST arrays (source_name[] / source_url[])
    if (empty($sources) && isset($input['source_name'])) {
         $names = $input['source_name'];
         $urls = $input['source_url'] ?? [];
         if (is_array($names)) {
             for ($i = 0; $i < count($names); $i++) {
                if (!empty($names[$i]) || !empty($urls[$i])) {
                    $sources[] = [
                        'name' => strip_tags(trim($names[$i])),
                        'url' => strip_tags(trim($urls[$i] ?? ''))
                    ];
                }
             }
         }
    }
    
    return [
        'id' => $input['id'] ?? uniqid('term_'),
        'term' => strip_tags(trim($input['term'])),
        'definition' => strip_tags(trim($input['definition'] ?? '')),
        'author' => strip_tags(trim($input['author'])),
        'author_link' => strip_tags(trim($input['author_link'] ?? '')),
        'category' => array_values($cats),
        'subcategory' => array_values($subs),
        'user_category' => strip_tags(trim($input['user_category'] ?? '')),
        'source' => $sources,
        'status' => 'unverified',
        'verification_count' => 0,
        'last_updated' => date('Y-m-d')
    ];
}

// === ACTIONS ===

function handleSubmit() {
    global $pendingFile;

    $input = getInput();
    if (empty($input)) error('Brak danych');

    if (empty($input['term']) || empty($input['author']))
        error('Hasło i autor wymagane');

    // Honeypot
    if (!empty($input['surname'])) {
        respond(['success' => true]); // Fake success
    }

    $entry = normalizeEntry($input);
    
    // Add Pending Logic
    $entry['pending'] = true;
    $entry['pending_action'] = !empty($input['id']) ? 'edit' : 'new';
    
    // Verification Request Flag
    if (!empty($input['verification_request'])) {
        $entry['pending_action'] = 'verify';
    }

    // Save
    $pending = readJSON($pendingFile);
    $pending[] = $entry;
    saveJSON($pendingFile, $pending);

    respond(['success' => true]);
}

function handleModeration() {
    global $pendingFile, $salsopediaFile;

    $input = getInput();
    if (empty($input)) error('Brak danych');

    // Security Check
    $pass = $input['password'] ?? $_GET['password'] ?? null;
    if ($pass !== 'katoAdmin2024') error('Brak autoryzacji');

    $id = $input['id'] ?? null;
    $action = $input['action'] ?? null;

    if (!$id || !in_array($action, ['approve', 'reject']))
        error('Złe dane (ID lub Action)');

    $pending = readJSON($pendingFile);
    
    // Find by ID (not token)
    $index = array_search($id, array_column($pending, 'id'));
    
    if ($index === false) error('Brak zgłoszenia o podanym ID');

    $entry = $pending[$index];

    if ($action === 'approve') {
        $live = readJSON($salsopediaFile);
        $liveIndex = array_search($id, array_column($live, 'id'));

        // Prepare Live Entry (Clean pending flags)
        $cleanEntry = $entry;
        unset($cleanEntry['pending'], $cleanEntry['pending_action']);
        
        // Status Logic: Admin Approved = Verified
        $cleanEntry['status'] = 'verified';
        $cleanEntry['last_updated'] = date('Y-m-d');

        if ($liveIndex === false) {
            // New Term
            $cleanEntry['verification_count'] = 1;
            $live[] = $cleanEntry;
        } else {
            // Update Existing
            $currentCount = $live[$liveIndex]['verification_count'] ?? 0;
            $cleanEntry['verification_count'] = $currentCount + 1;
            
            // Merge logic (Overwrite)
            $live[$liveIndex] = array_merge($live[$liveIndex], $cleanEntry);
        }
        
        // Sort A-Z
        usort($live, function($a, $b) {
            return strcasecmp($a['term'], $b['term']);
        });

        saveJSON($salsopediaFile, $live);
    }

    // Remove from Pending (for both approve and reject)
    array_splice($pending, $index, 1);
    saveJSON($pendingFile, $pending);

    respond(['success' => true]);
}
?>
