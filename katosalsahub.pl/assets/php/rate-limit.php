<?php
declare(strict_types=1);

if (isset($_SERVER['SCRIPT_FILENAME']) && realpath($_SERVER['SCRIPT_FILENAME']) === __FILE__) {
    http_response_code(403);
    exit;
}

/**
 * Mechanizm Rate Limiting, 15-minutowego IP Penalty Boxa (Zero-PII SHA-256) oraz SSRF Guard
 * oparty na blokadzie plikowej flock(LOCK_EX) i Garbage Collectorze (ISO 27001 / OWASP ASVS [REF-05]).
 * Chroni formularze i endpointy API przed atakami typu brute-force, WAF L7, SSRF i DoS.
 */

if (!function_exists('is_safe_ssrf_url')) {
    function is_safe_ssrf_url(string $url): bool {
        $trimmed = trim($url);
        if ($trimmed === '' || filter_var($trimmed, FILTER_VALIDATE_URL) === false) {
            return false;
        }
        $scheme = strtolower((string)parse_url($trimmed, PHP_URL_SCHEME));
        if ($scheme !== 'https') {
            return false;
        }
        $host = strtolower(trim((string)parse_url($trimmed, PHP_URL_HOST), '[]'));
        if ($host === '') {
            return false;
        }
        $blockedHosts = [
            '169.254.169.254',
            '127.0.0.1',
            'localhost',
            '0.0.0.0',
            '::1',
            'metadata.google.internal',
            'metadata.goog',
            '100.100.100.200',
        ];
        if (in_array($host, $blockedHosts, true)) {
            return false;
        }
        if (
            str_starts_with($host, '169.254.') ||
            str_starts_with($host, '127.') ||
            str_starts_with($host, '10.') ||
            str_starts_with($host, '192.168.')
        ) {
            return false;
        }
        if (filter_var($host, FILTER_VALIDATE_IP) !== false) {
            return filter_var(
                $host,
                FILTER_VALIDATE_IP,
                FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE
            ) !== false;
        }
        return true;
    }
}

function ensure_rate_limit_dir(): string {
    $dir = __DIR__ . '/rate_limits';
    $htaccessRules = "<IfModule mod_authz_core.c>\n    Require all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n    Order allow,deny\n    Deny from all\n</IfModule>\n";
    if (!is_dir($dir)) {
        if (!@mkdir($dir, 0750, true)) {
            return sys_get_temp_dir();
        }
        @file_put_contents($dir . '/.htaccess', $htaccessRules, LOCK_EX);
        @file_put_contents($dir . '/index.html', '', LOCK_EX);
    } elseif (!is_file($dir . '/.htaccess')) {
        @file_put_contents($dir . '/.htaccess', $htaccessRules, LOCK_EX);
    }
    return $dir;
}

/**
 * Sprawdza, czy klucz (Zero-PII SHA-256) znajduje się w aktywnym IP Penalty Boxie (domyślnie 15 min = 900 s).
 */
function is_ip_penalized(string $key): bool {
    $dir = ensure_rate_limit_dir();
    $file = $dir . '/penalty_' . substr(hash('sha256', 'penalty_' . $key), 0, 24) . '.json';
    if (!is_file($file)) {
        return false;
    }

    $fp = @fopen($file, 'rb');
    if (!$fp) {
        return false;
    }

    $active = false;
    if (@flock($fp, LOCK_SH)) {
        $raw = (string)stream_get_contents($fp);
        @flock($fp, LOCK_UN);
        if ($raw !== '') {
            $decoded = json_decode($raw, true, 16);
            if (is_array($decoded) && isset($decoded['expires_at']) && (int)$decoded['expires_at'] > time()) {
                $active = true;
            }
        }
    }
    fclose($fp);

    if (!$active) {
        @unlink($file);
    }
    return $active;
}

/**
 * Umieszcza klucz (Zero-PII SHA-256) w 15-minutowym IP Penalty Boxie (900 s) pod blokadą flock(LOCK_EX).
 */
function penalize_ip(string $key, int $banSeconds = 900, string $reason = 'security_violation'): void {
    $dir = ensure_rate_limit_dir();
    $file = $dir . '/penalty_' . substr(hash('sha256', 'penalty_' . $key), 0, 24) . '.json';
    $fp = @fopen($file, 'c+b');
    if (!$fp) {
        return;
    }

    if (@flock($fp, LOCK_EX)) {
        $now = time();
        $payload = [
            'banned_at'  => $now,
            'expires_at' => $now + max(60, $banSeconds),
            'reason'     => substr($reason, 0, 64),
        ];
        ftruncate($fp, 0);
        rewind($fp);
        fwrite($fp, (string)json_encode($payload));
        fflush($fp);
        @flock($fp, LOCK_UN);
    }
    fclose($fp);
}

/**
 * Banuje bieżące IP klienta (Zero-PII SHA-256) w 15-minutowym IP Penalty Boxie.
 */
if (!function_exists('ban_client_ip')) {
    function ban_client_ip(string $action = 'contact_waf', int $banSeconds = 900, string $reason = 'security_penalty_box'): void {
        $rawIp = (!empty($_SERVER['HTTP_CF_RAY']) && !empty($_SERVER['HTTP_CF_CONNECTING_IP']))
            ? (string)$_SERVER['HTTP_CF_CONNECTING_IP']
            : (string)($_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1');
        $cleanIp = trim(explode(',', $rawIp)[0]);
        if (filter_var($cleanIp, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
            $parts = explode('.', $cleanIp);
            $parts[3] = '0';
            $maskedIp = implode('.', $parts);
        } elseif (filter_var($cleanIp, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6)) {
            $parts = explode(':', $cleanIp);
            $maskedIp = implode(':', array_slice($parts, 0, 3)) . '::0';
        } else {
            $maskedIp = '0.0.0.0';
        }
        $ipHash = hash('sha256', $maskedIp);
        penalize_ip($action . '_' . $ipHash, $banSeconds, $reason);
    }
}

function rate_limit(string $key, int $limit, int $seconds): bool {
    $dir = ensure_rate_limit_dir();

    // Zero-PII SHA-256: wyodrębniamy wyłącznie literowy prefiks akcji, a cały klucz (w tym IP) poddajemy skrótowi SHA-256 (0 cyfr IP na dysku)
    $rawPrefix = explode('_', $key)[0] ?? 'rl';
    $bucketPrefix = (string)preg_replace('/[^a-zA-Z]/', '', $rawPrefix);
    $sanitizedKey = ($bucketPrefix !== '' ? substr(strtolower($bucketPrefix), 0, 16) : 'rl') . '_' . substr(hash('sha256', $key), 0, 24);
    $file = $dir . '/rate_' . $sanitizedKey . '.json';

    // Garbage Collector (1% prawdopodobieństwa)
    if (random_int(1, 100) === 1) {
        $files = glob($dir . '/{rate,penalty}_*.json', GLOB_BRACE);
        if (is_array($files)) {
            $now = time();
            foreach ($files as $f) {
                if ($now - (int)@filemtime($f) > 3600) {
                    @unlink($f);
                }
            }
        }
    }

    // Otwarcie pliku z blokadą wyłączną (exclusive lock)
    $fp = @fopen($file, 'c+b');
    if (!$fp) {
        return true; // Fail-open w razie problemów z systemem plików
    }

    if (!@flock($fp, LOCK_EX)) {
        fclose($fp);
        return true;
    }

    $current = [];
    $content = stream_get_contents($fp);
    if ($content !== false && $content !== '') {
        $decoded = json_decode($content, true, 16);
        if (is_array($decoded)) {
            $current = $decoded;
        }
    }

    $now = time();

    if (!isset($current['start_time']) || ($now - (int)$current['start_time'] > $seconds)) {
        $current = [
            'start_time' => $now,
            'count' => 0
        ];
    }

    if ((int)$current['count'] >= $limit) {
        @flock($fp, LOCK_UN);
        fclose($fp);
        return false;
    }

    $current['count'] = (int)$current['count'] + 1;

    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, (string)json_encode($current));
    fflush($fp);

    @flock($fp, LOCK_UN);
    fclose($fp);

    return true;
}
