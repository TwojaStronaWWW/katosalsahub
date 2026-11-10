<?php
declare(strict_types=1);

// [Threat Protection] Wyrejestrowanie niebezpiecznych wrapperów strumieni (blokada Phar Deserialization / SSRF / RCE)
foreach (['phar', 'ftp', 'ftps', 'expect'] as $__unsafeWrapper) {
    if (in_array($__unsafeWrapper, stream_get_wrappers(), true)) {
        @stream_wrapper_unregister($__unsafeWrapper);
    }
}
unset($__unsafeWrapper);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');

ini_set('display_errors', '0');
ini_set('log_errors', '1');
error_reporting(E_ALL);

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Niedozwolona metoda HTTP (wymagane POST).'], JSON_UNESCAPED_UNICODE);
    exit;
}

// [Threat Protection] Twardy limit rozmiaru ciała żądania (64 KB -> HTTP 413 Payload Too Large)
if (isset($_SERVER['CONTENT_LENGTH']) && (int)$_SERVER['CONTENT_LENGTH'] > 65536) {
    http_response_code(413);
    echo json_encode(['success' => false, 'message' => 'Przekroczono dopuszczalny rozmiar wiadomości (max 64 KB).'], JSON_UNESCAPED_UNICODE);
    exit;
}

// Wczesne zwolnienie sesji PHP (jeśli aktywna), aby nie blokować równoległych żądań podczas cURL i zapisu plikowego
if (session_status() === PHP_SESSION_ACTIVE) {
    @session_write_close();
}

// [REF-05] Zabezpieczenie OWASP Fetch Metadata (Sec-Fetch-Site) przed żądaniami Cross-Site
if (isset($_SERVER['HTTP_SEC_FETCH_SITE']) && strtolower(trim((string)$_SERVER['HTTP_SEC_FETCH_SITE'])) === 'cross-site') {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Niedozwolone żądanie międzywitrynowe (Cross-Site Request Blocked).'], JSON_UNESCAPED_UNICODE);
    exit;
}

require_once __DIR__ . '/rate-limit.php';
require_once __DIR__ . '/leads-store.php';

function debug_log(string $message): void {
    error_log('[KatoContact] ' . $message);
}

/**
 * Pobiera zmienną środowiskową z getenv(), $_ENV lub lokalnego pliku .env poza webrootem
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
            __DIR__ . '/../../../../.env',
            __DIR__ . '/../../../.env',
            __DIR__ . '/../../.env',
            __DIR__ . '/../.env',
            __DIR__ . '/.env',
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

/**
 * Anonimizacja adresu IP zgodnie z zasadą minimalizacji danych RODO (Issue #7)
 * Zeruje ostatni oktet w IPv4 (np. 192.168.1.0) lub końcówkę w IPv6.
 */
function mask_ip($ip): string {
    if (empty($ip) || !is_string($ip)) {
        return '0.0.0.0';
    }
    $cleanIp = trim(explode(',', $ip)[0]);
    if (filter_var($cleanIp, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
        $parts = explode('.', $cleanIp);
        $parts[3] = '0';
        return implode('.', $parts);
    }
    if (filter_var($cleanIp, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6)) {
        $parts = explode(':', $cleanIp);
        return implode(':', array_slice($parts, 0, 3)) . '::0';
    }
    return '0.0.0.0';
}

/**
 * Koduje nagłówek wiadomości (np. Subject) zgodnie ze standardem RFC 2047 UTF-8 Base64 i usuwa CRLF.
 */
function encode_rfc2047_header(string $text): string {
    $clean = trim((string)preg_replace('/[\r\n\0]+/', ' ', $text));
    return '=?UTF-8?B?' . base64_encode($clean) . '?=';
}

/**
 * Lekki filtr WAF warstwy 7 (SQLi, XSS, Path Traversal, PHP/JNDI Wrappers, Prompt/Shell Injection)
 */
function detect_l7_waf_attack(string $payload): ?string {
    if ($payload === '') {
        return null;
    }
    $decoded = rawurldecode($payload);
    $combined = $payload . "\n" . $decoded;

    $signatures = [
        'xss_script'       => '/<\s*\/?\s*(?:script|iframe|object|embed|svg|math)\b|javascript\s*:|vbscript\s*:|on(?:error|load|click|mouseover|focus|toggle)\s*=/i',
        'sqli_payload'     => '/\b(?:union\s+(?:all\s+)?select|select\s+.+\s+from\s+information_schema|drop\s+table|insert\s+into\s+\w+\s+values|benchmark\s*\(|pg_sleep\s*\(|waitfor\s+delay)\b|(?:\'\s*or\s*[\'"]?1[\'"]?\s*=\s*[\'"]?1)/i',
        'path_traversal'   => '/(?:\.\.\/|\.\.\\\\|\/etc\/passwd|\/proc\/self\/|(?:php|phar|expect|zip|data):\/\/|\$\{jndi:)/i',
        'prompt_injection' => '/\b(?:ignore\s+(?:all\s+)?previous\s+instructions|system\s+prompt\s+reveal|disregard\s+above\s+instructions)\b/i',
    ];

    foreach ($signatures as $ruleName => $pattern) {
        if (preg_match($pattern, $combined) === 1) {
            return $ruleName;
        }
    }
    return null;
}

// Rzeczywiste IP klienta (z uwzględnieniem Cloudflare Proxy Anycast) i anonimizacja RODO
$rawIp = (!empty($_SERVER['HTTP_CF_RAY']) && !empty($_SERVER['HTTP_CF_CONNECTING_IP']))
    ? (string)$_SERVER['HTTP_CF_CONNECTING_IP']
    : ($_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1');
$maskedIp = mask_ip((string)$rawIp);

// Sprawdzenie 15-minutowego IP Penalty Boxa przed dekodowaniem ładunku
if (is_ip_penalized('contact_waf_' . $maskedIp)) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Adres IP jest tymczasowo zablokowany na 15 minut z powodu naruszenia polityki bezpieczeństwa.'], JSON_UNESCAPED_UNICODE);
    exit;
}

// Obsługa wejścia (JSON z limitem rozmiaru 64 KB i głębokości 16 lub POST/FormData)
$rawInputBody = (string)@file_get_contents('php://input', false, null, 0, 65536);
$input = $rawInputBody !== '' ? json_decode($rawInputBody, true, 16) : null;
if (!is_array($input)) {
    $input = is_array($_POST) ? $_POST : [];
}

if (empty($input)) {
    echo json_encode(['success' => false, 'message' => 'Brak danych wejściowych'], JSON_UNESCAPED_UNICODE);
    exit;
}

// [WAF L7 -> 15-min IP Penalty Box] Inspekcja surowych pól przed strip_tags()
$wafBuffer = implode("\n", [
    (string)($input['name'] ?? ''),
    (string)($input['email'] ?? ''),
    (string)($input['phone'] ?? ''),
    (string)($input['message'] ?? ''),
]);
$wafRule = detect_l7_waf_attack($wafBuffer);
if ($wafRule !== null) {
    penalize_ip('contact_waf_' . $maskedIp, 900, $wafRule);
    debug_log("WAF L7 BLOCKED ({$wafRule}) -> 15-min Penalty Box for masked IP {$maskedIp}");
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Żądanie zablokowane przez zaporę bezpieczeństwa (WAF). Adres IP objęty 15-minutową kwarantanną.'], JSON_UNESCAPED_UNICODE);
    exit;
}

// 0. Zabezpieczenie Rate Limiting (ISO 27001): maks. 5 zgłoszeń na 60 sekund
if (!rate_limit('contact_' . $maskedIp, 5, 60)) {
    http_response_code(429);
    echo json_encode(['success' => false, 'message' => 'Zbyt wiele prób wysłania wiadomości. Odczekaj chwilę przed kolejną próbą.'], JSON_UNESCAPED_UNICODE);
    exit;
}

// 1. Zabezpieczenie Anty-Bot: Honeypot (dedykowane pole pułapki odporne na Autofill przeglądarek)
$honeypots = ['hp_chk', 'company_name', 'phone_extra'];
foreach ($honeypots as $hp) {
    if (!empty($input[$hp])) {
        debug_log("BOT BLOCKED: Honeypot field '$hp' filled");
        echo json_encode(['success' => true, 'message' => 'Wiadomość wysłana pomyślnie!'], JSON_UNESCAPED_UNICODE);
        exit;
    }
}

// 2. Zabezpieczenie Anty-Bot: Sprawdzenie obecności tokena JS i rzeczywistego czasu interakcji (min 1.2s)
if (empty($input['js_check'])) {
    debug_log("BOT BLOCKED: Missing js_check token");
    echo json_encode(['success' => true, 'message' => 'Wiadomość wysłana pomyślnie!'], JSON_UNESCAPED_UNICODE);
    exit;
}

$rawSubSec = $input['submission_seconds'] ?? null;
$subSecFloat = (is_numeric($rawSubSec) && !is_bool($rawSubSec)) ? (float)$rawSubSec : 0.0;
if (!is_finite($subSecFloat) || $subSecFloat < 1.2) {
    debug_log("BOT BLOCKED: Form submitted too quickly or missing submission_seconds");
    echo json_encode(['success' => true, 'message' => 'Wiadomość wysłana pomyślnie!'], JSON_UNESCAPED_UNICODE);
    exit;
}

// 3. Walidacja i oczyszczenie pól formularza oraz zgody RODO (ochrona przed CRLF Header Injection)
$rawName = strip_tags((string)($input['name'] ?? ''));
$name = mb_substr(trim((string)preg_replace('/[\r\n\0]+/', ' ', $rawName)), 0, 120);

$rawEmail = (string)($input['email'] ?? '');
$email = mb_substr(trim((string)preg_replace('/[\r\n\0]+/', '', $rawEmail)), 0, 180);

// Sanityzacja numeru telefonu bez \s (wykluczenie \r i \n — ochrona przed CRLF Injection)
$rawPhone = (string)($input['phone'] ?? '');
$cleanPhone = trim((string)preg_replace('/[^0-9+\- ()]/', '', $rawPhone));
$phone = $cleanPhone !== '' ? mb_substr($cleanPhone, 0, 32) : '-';

$message = mb_substr(trim(strip_tags((string)($input['message'] ?? ''))), 0, 4000);
$gdprConsent = !empty($input['gdpr_consent']);

if (empty($name) || empty($email) || empty($message)) {
    echo json_encode(['success' => false, 'message' => 'Wypełnij wszystkie wymagane pola (imię lub pseudonim, e-mail, wiadomość)!'], JSON_UNESCAPED_UNICODE);
    exit;
}

if (!$gdprConsent) {
    echo json_encode(['success' => false, 'message' => 'Wymagana jest akceptacja Polityki Prywatności przed wysłaniem wiadomości.'], JSON_UNESCAPED_UNICODE);
    exit;
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    echo json_encode(['success' => false, 'message' => 'Podaj poprawny adres e-mail!'], JSON_UNESCAPED_UNICODE);
    exit;
}

// 4. Zabezpieczenie Anty-Bot: Wykrywanie spamu (Cyrylica i linki)
if (preg_match('/\p{Cyrillic}/u', $message)) {
    debug_log("BOT BLOCKED: Cyrillic spam in message");
    echo json_encode(['success' => true, 'message' => 'Wiadomość wysłana pomyślnie!'], JSON_UNESCAPED_UNICODE);
    exit;
}

if (preg_match_all('/https?:\/\//i', $message) > 6) {
    debug_log("BOT BLOCKED: Excessive links in message");
    echo json_encode(['success' => true, 'message' => 'Wiadomość wysłana pomyślnie!'], JSON_UNESCAPED_UNICODE);
    exit;
}

@session_write_close();

// 4b. Zapis leada do lokalnej bazy CSV pod blokadą wyłączną flock(LOCK_EX) (Zero-Data-Loss Backup)
save_lead([
    date('Y-m-d'),
    date('H:i:s'),
    $name,
    $email,
    $message,
    hash('sha256', $maskedIp),
    $phone,
    'NIE'
], false);

// 5. Utworzenie zgłoszenia w osTicket wyłącznie po szyfrowanym kanale HTTPS (CURLPROTO_HTTPS)
$osTicketApiKey = get_env_secret('OSTICKET_API_KEY');
$defaultOsTicketUrl = 'https://hd.twojastronawww.pl/ticket_hook.php';
$configuredApiUrl = trim(get_env_secret('OSTICKET_API_URL', $defaultOsTicketUrl));
if (
    $configuredApiUrl === ''
    || strpos($configuredApiUrl, 'https://') !== 0
    || strpos($configuredApiUrl, 'crm.katosalsahub.pl') !== false
    || strpos($configuredApiUrl, ':8080') !== false
    || !filter_var($configuredApiUrl, FILTER_VALIDATE_URL)
) {
    $configuredApiUrl = $defaultOsTicketUrl;
}
$ticketCreated = false;
$ticketNum = 'BRAK';

if (!empty($osTicketApiKey) && function_exists('curl_init')) {
    $ticketData = [
        'name'        => $name,
        'email'       => $email,
        'phone'       => $phone !== '-' ? $phone : '',
        'subject'     => "[Kato Salsa Hub] Wiadomość od: $name",
        'message'     => $message,
        'topicId'     => 12,
        'ip'          => $maskedIp,
        'source'      => 'Web',
        'autorespond' => false,
        'send_email'  => false,
    ];

    $endpoints = [$configuredApiUrl];
    if ($configuredApiUrl !== $defaultOsTicketUrl) {
        $endpoints[] = $defaultOsTicketUrl;
    }

    foreach ($endpoints as $epUrl) {
        $ch = curl_init($epUrl);
        curl_setopt_array($ch, [
            CURLOPT_HTTPHEADER     => [
                'X-API-Key: ' . $osTicketApiKey,
                'Content-Type: application/json',
                'Expect:'
            ],
            CURLOPT_USERAGENT      => 'KatoSalsaHub-HelpdeskClient/2.1',
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => json_encode($ticketData, JSON_UNESCAPED_UNICODE),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 6,
            CURLOPT_CONNECTTIMEOUT => 2,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_MAXREDIRS      => 0,
        ]);
        if (defined('CURLPROTO_HTTPS')) {
            curl_setopt($ch, CURLOPT_PROTOCOLS, CURLPROTO_HTTPS);
        }

        $apiResponse = @curl_exec($ch);
        if (is_string($apiResponse) && strlen($apiResponse) > 65536) {
            $apiResponse = substr($apiResponse, 0, 65536);
        }
        $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        unset($ch);

        $resArr = json_decode((string)$apiResponse, true, 16);
        if ($httpCode === 201 && !empty($resArr['success'])) {
            $ticketCreated = true;
            $ticketNum = (string)preg_replace('/[^a-zA-Z0-9_-]/', '', (string)($resArr['number'] ?? 'unknown'));
            debug_log("TICKET CREATED: #$ticketNum (masked IP: $maskedIp)");
            break;
        }
        debug_log("osTicket API attempt failed on {$epUrl} (Code $httpCode)");
    }
}

// 6. Scentralizowana wysyłka powiadomienia e-mail z kodowaniem Subject RFC 2047 (=?UTF-8?B?...?=)
$rawTo = get_env_secret('CENTRAL_LEAD_EMAIL', get_env_secret('CONTACT_EMAIL', 'poczatek.krzysztof@gmail.com'));
$to = trim((string)preg_replace('/[\r\n\0]+/', '', $rawTo));
$rawSubject = "[Kato Salsa Hub] Nowa wiadomość od: $name" . ($ticketCreated ? " [Ticket #$ticketNum]" : "");
$encodedSubject = encode_rfc2047_header($rawSubject);
$emailContent = "Nowe zgłoszenie z formularza kontaktowego (Kato Salsa Hub):\n"
              . "=========================================\n"
              . "Imię lub pseudonim: $name\n"
              . "E-mail:             $email\n"
              . ($phone !== '-' ? "Telefon:            $phone\n" : '')
              . "Ticket osTicket:    " . ($ticketCreated ? "#$ticketNum (https://hd.twojastronawww.pl/scp/)" : "Brak") . "\n"
              . "Zanonimizowane IP:  $maskedIp\n"
              . "Data:               " . date('Y-m-d H:i:s') . "\n"
              . "-----------------------------------------\n"
              . "Treść wiadomości:\n$message\n";
$fromEmail = 'noreply@katosalsahub.pl';
$headers = "From: Kato Salsa Hub <{$fromEmail}>\r\nReply-To: {$email}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n";
@mail($to, $encodedSubject, $emailContent, $headers, "-f{$fromEmail}");

// 7. Powiadomienie Push Ntfy (obsługa własnej instancji NTFY_BASE_URL + autoryzacji Bearer NTFY_TOKEN)
$ntfyTopic = trim((string)preg_replace('/[\r\n\0]+/', '', get_env_secret('NTFY_TOPIC')));
if ($ntfyTopic !== '' && function_exists('curl_init')) {
    $ntfyBaseUrl = rtrim(trim(get_env_secret('NTFY_BASE_URL', 'https://ntfy.sh')), '/');
    if ($ntfyBaseUrl === '' || strpos($ntfyBaseUrl, 'https://') !== 0 || !filter_var($ntfyBaseUrl, FILTER_VALIDATE_URL)) {
        $ntfyBaseUrl = 'https://ntfy.sh';
    }
    $ntfyToken = trim((string)preg_replace('/[\r\n\0]+/', '', get_env_secret('NTFY_TOKEN')));

    $ntfyLines = [
        "👤 IMIĘ: {$name}",
        "✉️ E-MAIL: {$email}",
    ];
    if ($phone !== '-') {
        $ntfyLines[] = "📞 TELEFON: {$phone}";
    }
    $ntfyLines[] = "🎫 TICKET: " . ($ticketCreated ? "#{$ticketNum}" : "brak");
    $ntfyLines[] = "🌐 ŹRÓDŁO: Formularz katosalsahub.pl";
    $ntfyLines[] = "────────────────────────";
    $ntfyLines[] = "💬 Wiadomość:";
    $ntfyLines[] = $message;

    $rawTitle = "Formularz (katosalsahub) - {$name} | EMAIL: {$email}";
    $encodedTitle = encode_rfc2047_header($rawTitle);
    $safeEmailForAction = (string)preg_replace('/[;,\r\n\0]+/', '', $email);
    $ntfyHeaders = [
        "Title: {$encodedTitle}",
        'Priority: high',
        'Tags: incoming_envelope,dancer',
        "Actions: view, Napisz e-mail ({$safeEmailForAction}), mailto:{$safeEmailForAction}; view, Otworz Helpdesk, https://hd.twojastronawww.pl/scp/"
    ];
    if ($ntfyToken !== '') {
        $ntfyHeaders[] = 'Authorization: Bearer ' . $ntfyToken;
    }

    $safeTopicSegment = rawurlencode(trim($ntfyTopic, '/'));
    $chNtfy = curl_init("{$ntfyBaseUrl}/{$safeTopicSegment}");
    curl_setopt_array($chNtfy, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => implode("\n", $ntfyLines),
        CURLOPT_HTTPHEADER     => $ntfyHeaders,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 3,
        CURLOPT_CONNECTTIMEOUT => 2,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_MAXREDIRS      => 0
    ]);
    if (defined('CURLPROTO_HTTPS')) {
        curl_setopt($chNtfy, CURLOPT_PROTOCOLS, CURLPROTO_HTTPS);
    }
    @curl_exec($chNtfy);
    unset($chNtfy);
}

// 8. Autoresponder dla nadawcy wiadomości z kodowaniem Subject RFC 2047 (=?UTF-8?B?...?=)
$rawAutoSubject = 'Potwierdzenie otrzymania wiadomości — Kato Salsa Hub';
$encodedAutoSubject = encode_rfc2047_header($rawAutoSubject);
$autoBody  = "Cześć $name!\n\n";
$autoBody .= "Dziękujemy za wiadomość wysłaną przez formularz Kato Salsa Hub.\n";
$autoBody .= "Twoje zgłoszenie dotarło do nas bezpiecznie" . ($ticketCreated ? " (numer zgłoszenia: #$ticketNum)" : "") . ".\n\n";
$autoBody .= "Treść Twojej wiadomości:\n-----------------------------------------\n$message\n-----------------------------------------\n\n";
$autoBody .= "Do zobaczenia na parkiecie!\nZespół Kato Salsa Hub\nhttps://katosalsahub.pl\n";
$autoHeaders = "From: Kato Salsa Hub <{$fromEmail}>\r\nReply-To: {$fromEmail}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n";
@mail($email, $encodedAutoSubject, $autoBody, $autoHeaders, "-f{$fromEmail}");

echo json_encode([
    'success' => true,
    'ticket'  => $ticketCreated ? $ticketNum : null,
    'message' => 'Dziękujemy! Twoja wiadomość została wysłana.'
], JSON_UNESCAPED_UNICODE);
