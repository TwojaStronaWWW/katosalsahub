<?php
declare(strict_types=1);

/**
 * Timba Nation Radio - Stream Edge Resolver (ISO 27001 Safe)
 * Rozwiązuje przekierowanie 302 Zeno.fm po stronie serwera, zwracając bezpośredni
 * adres węzła brzegowego audio (surfernetwork.com) jako fallback dla przeglądarek.
 */

// [Threat Protection] Wyrejestrowanie niebezpiecznych wrapperów strumieni (blokada Phar Deserialization / SSRF / RCE)
foreach (['phar', 'ftp', 'ftps', 'expect'] as $__unsafeWrapper) {
    if (in_array($__unsafeWrapper, stream_get_wrappers(), true)) {
        @stream_wrapper_unregister($__unsafeWrapper);
    }
}
unset($__unsafeWrapper);

ini_set('display_errors', '0');
ini_set('log_errors', '1');
error_reporting(E_ALL);

header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');

if (isset($_SERVER['CONTENT_LENGTH']) && (int)$_SERVER['CONTENT_LENGTH'] > 65536) {
    http_response_code(413);
    echo json_encode(['ok' => false, 'error' => 'Payload Too Large']);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Method Not Allowed']);
    exit;
}

// [REF-05] Blokada żądań Cross-Site (Sec-Fetch-Site)
if (isset($_SERVER['HTTP_SEC_FETCH_SITE']) && strtolower(trim((string)$_SERVER['HTTP_SEC_FETCH_SITE'])) === 'cross-site') {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'Cross-Site Request Blocked']);
    exit;
}

if (session_status() === PHP_SESSION_ACTIVE) {
    @session_write_close();
}

require_once __DIR__ . '/rate-limit.php';

$rawClientIp = (!empty($_SERVER['HTTP_CF_RAY']) && !empty($_SERVER['HTTP_CF_CONNECTING_IP']))
    ? (string)$_SERVER['HTTP_CF_CONNECTING_IP']
    : ($_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
$cleanClientIp = trim(explode(',', (string)$rawClientIp)[0]);
if (filter_var($cleanClientIp, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
    $ipParts = explode('.', $cleanClientIp);
    $ipParts[3] = '0';
    $maskedClientIp = implode('.', $ipParts);
} elseif (filter_var($cleanClientIp, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6)) {
    $ipParts = explode(':', $cleanClientIp);
    $maskedClientIp = implode(':', array_slice($ipParts, 0, 3)) . '::0';
} else {
    $maskedClientIp = '0.0.0.0';
}

if (!rate_limit('radio_resolve_' . hash('sha256', $maskedClientIp), 30, 60)) {
    http_response_code(429);
    echo json_encode([
        'ok'        => true,
        'streamUrl' => 'https://stream.zeno.fm/g0zpm0pypuhvv',
        'source'    => 'rate-limit-fallback'
    ], JSON_UNESCAPED_SLASHES);
    exit;
}

$zenoMountUrl = 'https://stream.zeno.fm/g0zpm0pypuhvv?_t=' . round(microtime(true) * 1000);
$resolvedLocation = null;

if (function_exists('curl_init') && is_safe_ssrf_url($zenoMountUrl)) {
    $ch = curl_init($zenoMountUrl);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_MAXREDIRS      => 0,
        CURLOPT_HEADER         => true,
        CURLOPT_NOBODY         => false,
        CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_TIMEOUT        => 4,
        CURLOPT_USERAGENT      => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        CURLOPT_HTTPHEADER     => ['Accept: */*'],
        CURLOPT_HEADERFUNCTION => function ($curl, $headerLine) use (&$resolvedLocation) {
            if (stripos($headerLine, 'Location:') === 0) {
                $loc = trim((string)preg_replace('/[\r\n\0]+/', '', substr($headerLine, 9)));
                if (
                    strpos($loc, 'https://') === 0
                    && strpos($loc, '169.254.169.254') === false
                    && is_safe_ssrf_url($loc)
                    && (stripos($loc, '.surfernetwork.com/') !== false || stripos($loc, '.zeno.fm/') !== false)
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
    if (defined('CURLPROTO_HTTPS')) {
        curl_setopt($ch, CURLOPT_PROTOCOLS, CURLPROTO_HTTPS);
    }
    @curl_exec($ch);
    unset($ch);
}

if ($resolvedLocation !== null) {
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
