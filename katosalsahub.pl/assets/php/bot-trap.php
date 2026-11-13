<?php
declare(strict_types=1);

/**
 * [REF-05] Bezpieczny Honeypot na Agresywne Boty AI i Skrapery (Zero-PII IP Penalty Box)
 *
 * Ścieżka /assets/php/bot-trap.php jest jawnie zakazana w robots.txt (Disallow: /assets/php/)
 * oraz wykluczona ze Speculation Rules API ([data-bot-trap], /assets/php/*).
 *
 * Zabezpieczenia inżynieryjne (lekcja z artykułu B^6):
 * 1. Ochrona przed False-Positive: żądania prefetch/prerender przeglądarek są cicho ignorowane (HTTP 204).
 * 2. Brak modyfikacji .htaccess w runtime (brak ryzyka uszkodzenia pliku przy współbieżności).
 * 3. Blokada 15 minut (900s) w istniejącym IP Penalty Box (SHA-256 Zero-PII + flock(LOCK_EX)).
 */

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('X-Robots-Tag: noindex, nofollow');

require_once __DIR__ . '/rate-limit.php';

if (session_status() === PHP_SESSION_ACTIVE) {
    @session_write_close();
}

// 1. Ochrona przed przypadkowym wywołaniem przez mechanizmy Prefetch / Prerender przeglądarki
$purposeHeaders = [
    (string)($_SERVER['HTTP_SEC_PURPOSE'] ?? ''),
    (string)($_SERVER['HTTP_PURPOSE'] ?? ''),
    (string)($_SERVER['HTTP_X_MOZ'] ?? ''),
];

foreach ($purposeHeaders as $headerVal) {
    if ($headerVal !== '' && preg_match('/\b(?:prefetch|prerender|preview)\b/i', $headerVal) === 1) {
        http_response_code(204);
        exit;
    }
}

// 2. Nałożenie 15-minutowej kary (900s) w IP Penalty Box (Zero-PII SHA-256 pod blokadą LOCK_EX)
ban_client_ip('contact_waf', 900, 'robots_honeypot_trap');
ban_client_ip('bot_trap', 900, 'robots_honeypot_trap');

http_response_code(403);
echo json_encode([
    'status'  => 'blocked',
    'success' => false,
    'reason'  => 'robots_honeypot_trap',
    'ttl'     => 900,
    'message' => 'Dostęp zablokowany na 15 minut (naruszenie dyrektywy Disallow w robots.txt).'
], JSON_UNESCAPED_UNICODE);
