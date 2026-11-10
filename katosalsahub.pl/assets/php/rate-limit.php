<?php
declare(strict_types=1);

/**
 * Mechanizm Rate Limiting oraz 15-minutowego IP Penalty Boxa oparty na blokadzie plikowej
 * flock(LOCK_EX) i Garbage Collectorze (ISO 27001 / OWASP ASVS).
 * Chroni formularze i endpointy API przed atakami typu brute-force, WAF L7 i DoS.
 */

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
 * Sprawdza, czy klucz (np. zanonimizowane IP) znajduje się w aktywnym IP Penalty Boxie (domyślnie 15 min = 900 s).
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
            $decoded = json_decode($raw, true, 8);
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
 * Umieszcza klucz (zanonimizowane IP) w 15-minutowym IP Penalty Boxie (900 s) pod blokadą flock(LOCK_EX).
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

function rate_limit(string $key, int $limit, int $seconds): bool {
    $dir = ensure_rate_limit_dir();

    // Hashujemy klucz (np. zanonimizowane IP + akcja), aby uniknąć kolizji oktetów IPv4 i nie przechowywać IP w nazwach plików (RODO)
    $sanitizedKey = preg_replace('/[^a-zA-Z0-9_]/', '', substr($key, 0, 24)) . '_' . substr(hash('sha256', $key), 0, 16);
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
        $decoded = json_decode($content, true, 8);
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
