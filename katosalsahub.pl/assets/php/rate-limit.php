<?php
declare(strict_types=1);

/**
 * Mechanizm Rate Limiting oparty na blokadzie plikowej i Garbage Collectorze (ISO 27001).
 * Chroni formularze i endpointy API przed atakami typu brute-force i DoS.
 */
function rate_limit(string $key, int $limit, int $seconds): bool {
    $dir = __DIR__ . '/rate_limits';
    if (!file_exists($dir)) {
        if (!@mkdir($dir, 0755, true)) {
            $dir = sys_get_temp_dir();
        } else {
            @file_put_contents($dir . '/.htaccess', "Deny from all\n");
            @file_put_contents($dir . '/index.html', "");
        }
    }

    // Hashujemy klucz (np. zanonimizowane IP + akcja), aby uniknąć kolizji oktetów IPv4 i nie przechowywać IP w nazwach plików (RODO)
    $sanitizedKey = preg_replace('/[^a-zA-Z0-9_]/', '', substr($key, 0, 24)) . '_' . substr(hash('sha256', $key), 0, 16);
    $file = $dir . '/rate_' . $sanitizedKey . '.json';

    // Garbage Collector (1% prawdopodobieństwa)
    if (random_int(1, 100) === 1) {
        $files = glob($dir . '/rate_*.json');
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
        $decoded = json_decode($content, true);
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
