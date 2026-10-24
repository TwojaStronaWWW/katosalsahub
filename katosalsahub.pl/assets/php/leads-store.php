<?php
declare(strict_types=1);

/**
 * Pobiera zmienną środowiskową z getenv(), $_ENV lub pliku .env poza katalogiem publicznym (ISO 27001)
 */
if (!function_exists('get_env_secret')) {
    function get_env_secret(string $key, string $default = ''): string {
        $val = getenv($key);
        if ($val !== false && $val !== '') {
            return (string)$val;
        }
        if (!empty($_ENV[$key])) {
            return (string)$_ENV[$key];
        }
        $envPaths = [
            __DIR__ . '/../../.env',
            __DIR__ . '/../.env',
        ];
        foreach ($envPaths as $envPath) {
            if (@is_readable($envPath)) {
                $lines = @file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
                if (is_array($lines)) {
                    foreach ($lines as $line) {
                        $line = trim($line);
                        if ($line === '' || strpos($line, '#') === 0 || strpos($line, '=') === false) {
                            continue;
                        }
                        list($k, $v) = explode('=', $line, 2);
                        if (trim($k) === $key) {
                            return trim($v, " \t\n\r\0\x0B\"'");
                        }
                    }
                }
            }
        }
        return $default;
    }
}

function csv_files(): array {
    return glob(__DIR__ . '/leads_*.csv') ?: [];
}

function is_draft_file(string $file): bool {
    return strpos(basename($file), '_draft_') !== false;
}

/**
 * Ochrona przed CSV Formula Injection (OWASP DDE) — neutralizuje znaki sterujące (=, +, -, @, TAB, CR)
 */
function sanitize_csv_cell(string $value): string {
    $clean = trim((string)preg_replace('/[\r\n]+/', ' ', $value));
    if ($clean !== '' && in_array($clean[0], ['=', '+', '-', '@', "\t", "\r"], true)) {
        return "'" . $clean;
    }
    return $clean;
}

/**
 * Normalizuje wiersz CSV (kompatybilność wsteczna 6 kolumn -> 8 kolumn:
 * [0]=date, [1]=time, [2]=name, [3]=email, [4]=message, [5]=ip_hash, [6]=phone, [7]=newsletter)
 */
function normalize_lead_row(array $row): ?array {
    if (count($row) === 6) {
        return [$row[0], $row[1], $row[2], $row[3], $row[4], $row[5], '-', 'NIE'];
    }
    if (count($row) >= 8) {
        return array_slice($row, 0, 8);
    }
    return null;
}

function read_leads(bool $draft = false, int $limit = 200): array {
    $rows = [];
    $files = csv_files();
    rsort($files);

    foreach ($files as $file) {
        if ($draft !== is_draft_file($file)) {
            continue;
        }

        if (($h = @fopen($file, 'rb')) === false) {
            continue;
        }

        $fileRows = [];
        if (@flock($h, LOCK_SH)) {
            fgetcsv($h);

            while (($row = fgetcsv($h)) !== false) {
                $normalized = normalize_lead_row($row);
                if ($normalized !== null) {
                    array_unshift($fileRows, $normalized);
                }
            }
            @flock($h, LOCK_UN);
        }
        fclose($h);

        foreach ($fileRows as $r) {
            $rows[] = $r;
            if (count($rows) >= $limit) {
                break 2;
            }
        }

        if (count($rows) >= $limit) {
            break;
        }
    }
    return $rows;
}

function lead_id(array $row): string {
    $normalized = normalize_lead_row($row) ?? $row;
    return hash('sha256', implode('|', array_slice($normalized, 0, 6)));
}

function save_lead(array $data, bool $draft = false): void {
    if (count($data) < 6) {
        return;
    }
    $normalized = normalize_lead_row($data);
    if ($normalized === null) {
        return;
    }
    $sanitizedRow = array_map(static function ($cell): string {
        return sanitize_csv_cell((string)$cell);
    }, $normalized);

    $suffix = $draft ? '_draft' : '';
    $file = __DIR__ . '/leads' . $suffix . '_' . date('Y-m') . '.csv';

    $fp = @fopen($file, 'a+b');
    if (!$fp) return;

    if (@flock($fp, LOCK_EX)) {
        clearstatcache(true, $file);
        $stat = fstat($fp);
        $isNew = ($stat === false || ($stat['size'] ?? 0) === 0);
        if ($isNew) {
            fputcsv($fp, ['date', 'time', 'name', 'email', 'message', 'ip_hash', 'phone', 'newsletter']);
        }
        fputcsv($fp, $sanitizedRow);
        fflush($fp);
        @flock($fp, LOCK_UN);
    }
    fclose($fp);

    // Opcjonalny Off-Site Backup do prywatnego bucketa Cloudflare R2 (jeśli skonfigurowano w .env)
    if (!$draft && is_readable(__DIR__ . '/PrivateStorageService.php')) {
        $privBucket = get_env_secret('R2_PRIVATE_BUCKET_NAME');
        if ($privBucket !== '') {
            require_once __DIR__ . '/PrivateStorageService.php';
            $storage = new \TwojaStronaWWW\Api\PrivateStorageService(
                get_env_secret('R2_ACCOUNT_ID'),
                get_env_secret('R2_ACCESS_KEY_ID'),
                get_env_secret('R2_SECRET_ACCESS_KEY'),
                $privBucket
            );
            if ($storage->isAvailable()) {
                @$storage->backupLeads($file);
            }
        }
    }
}

/**
 * Usuwa wpis leada o podanym skrócie SHA-256 zgodnie z prawem do bycia zapomnianym (RODO art. 17)
 * z utrzymaniem blokady wyłącznej flock(LOCK_EX).
 */
function delete_lead_by_id(string $targetId): bool {
    if ($targetId === '') return false;
    $deleted = false;

    foreach (csv_files() as $file) {
        $fp = @fopen($file, 'c+b');
        if (!$fp) continue;

        if (@flock($fp, LOCK_EX)) {
            rewind($fp);
            $header = fgetcsv($fp);
            $keptRows = [];
            $foundInFile = false;

            while (($row = fgetcsv($fp)) !== false) {
                if (lead_id($row) === $targetId) {
                    $foundInFile = true;
                    $deleted = true;
                } else {
                    $keptRows[] = $row;
                }
            }

            if ($foundInFile) {
                ftruncate($fp, 0);
                rewind($fp);
                fputcsv($fp, is_array($header) ? $header : ['date', 'time', 'name', 'email', 'message', 'ip_hash', 'phone', 'newsletter']);
                foreach ($keptRows as $r) {
                    fputcsv($fp, $r);
                }
                fflush($fp);
            }

            @flock($fp, LOCK_UN);
        }
        fclose($fp);
    }

    return $deleted;
}

/**
 * Współbieżny odczyt pliku JSON z blokadą współdzieloną flock(LOCK_SH)
 */
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
 * Atomowa transakcja Read-Modify-Write (RMW) na pliku JSON z blokadą wyłączną flock(LOCK_EX)
 * utrzymywaną przez cały cykl: Odczyt -> Modyfikacja -> Kopia .bak -> Zapis -> Zwolnienie blokady.
 * Eliminuje wyścigi TOCTOU (Lost Update) przy równoczesnych operacjach wielu użytkowników/moderatorów.
 *
 * @param string   $file       Ścieżka do pliku JSON
 * @param callable $mutator    Funkcja function(array &$data): mixed — zwraca false, aby anulować zapis
 * @param bool     $purgeCache Czy wysłać nagłówek X-LiteSpeed-Purge
 * @return array{ok: bool, result: mixed}
 */
function update_json_file(string $file, callable $mutator, bool $purgeCache = true): array {
    $fp = @fopen($file, 'c+b');
    if (!$fp) {
        return ['ok' => false, 'result' => null];
    }

    if (!@flock($fp, LOCK_EX)) {
        fclose($fp);
        return ['ok' => false, 'result' => null];
    }

    rewind($fp);
    $existingContent = stream_get_contents($fp);
    $data = [];
    if ($existingContent !== false && $existingContent !== '') {
        $decoded = json_decode($existingContent, true);
        if (is_array($decoded)) {
            $data = $decoded;
        }
    }

    $mutationResult = $mutator($data);
    if ($mutationResult === false) {
        @flock($fp, LOCK_UN);
        fclose($fp);
        return ['ok' => false, 'result' => null];
    }

    $encoded = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    if ($encoded === false) {
        @flock($fp, LOCK_UN);
        fclose($fp);
        return ['ok' => false, 'result' => null];
    }

    if ($existingContent !== false && strlen($existingContent) > 0) {
        @file_put_contents($file . '.bak', $existingContent, LOCK_EX);
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

    return ['ok' => $written !== false, 'result' => $mutationResult];
}
