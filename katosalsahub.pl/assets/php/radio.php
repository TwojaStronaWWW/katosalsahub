<?php
/**
 * Timba Nation Radio - Stream Edge Resolver (ISO 27001 Safe)
 * Rozwiązuje przekierowanie 302 Zeno.fm po stronie serwera, zwracając bezpośredni
 * adres węzła brzegowego audio (surfernetwork.com) jako fallback dla przeglądarek.
 */

header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('X-Content-Type-Options: nosniff');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Method Not Allowed']);
    exit;
}

$zenoMountUrl = 'https://stream.zeno.fm/g0zpm0pypuhvv?_t=' . round(microtime(true) * 1000);
$resolvedLocation = null;

if (function_exists('curl_init')) {
    $ch = curl_init($zenoMountUrl);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_HEADER         => true,
        CURLOPT_NOBODY         => false,
        CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_TIMEOUT        => 4,
        CURLOPT_USERAGENT      => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        CURLOPT_HTTPHEADER     => ['Accept: */*'],
        CURLOPT_HEADERFUNCTION => function ($curl, $headerLine) use (&$resolvedLocation) {
            if (stripos($headerLine, 'Location:') === 0) {
                $loc = trim(substr($headerLine, 9));
                if (
                    strpos($loc, 'https://') === 0 &&
                    ( stripos($loc, '.surfernetwork.com/') !== false || stripos($loc, '.zeno.fm/') !== false )
                ) {
                    $resolvedLocation = $loc;
                }
            }
            if ($resolvedLocation !== null && trim($headerLine) === '') {
                return 0; // Przerwij po odebraniu nagłówków 302
            }
            return strlen($headerLine);
        }
    ]);
    @curl_exec($ch);
    curl_close($ch);
}

if ($resolvedLocation) {
    echo json_encode([
        'ok'        => true,
        'streamUrl' => $resolvedLocation,
        'fallback'  => $zenoMountUrl
    ], JSON_UNESCAPED_SLASHES);
    exit;
}

echo json_encode([
    'ok'        => true,
    'streamUrl' => $zenoMountUrl,
    'fallback'  => 'https://stream.zeno.fm/g0zpm0pypuhvv'
], JSON_UNESCAPED_SLASHES);
