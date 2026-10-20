<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');

ini_set('display_errors', '0');
ini_set('log_errors', '1');
error_reporting(E_ALL);

require_once __DIR__ . '/rate-limit.php';

function debug_log(string $message): void {
    error_log('[KatoContact] ' . $message);
}

/**
 * Pobiera zmienną środowiskową z getenv(), $_ENV lub lokalnego pliku .env poza webrootem
 */
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

// Obsługa wejścia (JSON lub POST/FormData)
$input = json_decode((string)file_get_contents("php://input"), true);
if (!is_array($input)) {
    $input = is_array($_POST) ? $_POST : [];
}

if (empty($input)) {
    echo json_encode(['success' => false, 'message' => 'Brak danych wejściowych']);
    exit;
}

// Rzeczywiste IP klienta (z uwzględnieniem Cloudflare Proxy Anycast) i anonimizacja RODO
$rawIp = $_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
$maskedIp = mask_ip($rawIp);

// 0. Zabezpieczenie Rate Limiting (ISO 27001): maks. 5 zgłoszeń na 60 sekund
if (!rate_limit('contact_' . $maskedIp, 5, 60)) {
    http_response_code(429);
    echo json_encode(['success' => false, 'message' => 'Zbyt wiele prób wysłania wiadomości. Odczekaj chwilę przed kolejną próbą.']);
    exit;
}

// 1. Zabezpieczenie Anty-Bot: Honeypot (dedykowane pole pułapki odporne na Autofill przeglądarek)
$honeypots = ['hp_chk', 'company_name', 'phone_extra'];
foreach ($honeypots as $hp) {
    if (!empty($input[$hp])) {
        debug_log("BOT BLOCKED: Honeypot field '$hp' filled");
        echo json_encode(['success' => true, 'message' => 'Wiadomość wysłana pomyślnie!']);
        exit;
    }
}

// 2. Zabezpieczenie Anty-Bot: Sprawdzenie obecności tokena JS i czasu interakcji (min 1.2s)
if (empty($input['js_check'])) {
    debug_log("BOT BLOCKED: Missing js_check token");
    echo json_encode(['success' => true, 'message' => 'Wiadomość wysłana pomyślnie!']);
    exit;
}

if (!isset($input['submission_seconds']) || (float)$input['submission_seconds'] < 1.2) {
    debug_log("BOT BLOCKED: Form submitted too quickly or missing submission_seconds");
    echo json_encode(['success' => true, 'message' => 'Wiadomość wysłana pomyślnie!']);
    exit;
}

// 3. Walidacja i oczyszczenie pól formularza oraz zgody RODO (Issue #6 & #7)
$rawName = strip_tags((string)($input['name'] ?? ''));
$name = mb_substr(trim((string)preg_replace('/[\r\n]+/', ' ', $rawName)), 0, 120);

$rawEmail = (string)($input['email'] ?? '');
$email = mb_substr(trim((string)preg_replace('/[\r\n]+/', '', $rawEmail)), 0, 180);

$message = mb_substr(trim(strip_tags((string)($input['message'] ?? ''))), 0, 4000);
$gdprConsent = !empty($input['gdpr_consent']);

if (empty($name) || empty($email) || empty($message)) {
    echo json_encode(['success' => false, 'message' => 'Wypełnij wszystkie wymagane pola (imię lub pseudonim, e-mail, wiadomość)!']);
    exit;
}

if (!$gdprConsent) {
    echo json_encode(['success' => false, 'message' => 'Wymagana jest akceptacja Polityki Prywatności przed wysłaniem wiadomości.']);
    exit;
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    echo json_encode(['success' => false, 'message' => 'Podaj poprawny adres e-mail!']);
    exit;
}

// 4. Zabezpieczenie Anty-Bot: Wykrywanie spamu (Cyrylica i linki)
if (preg_match('/\p{Cyrillic}/u', $message)) {
    debug_log("BOT BLOCKED: Cyrillic spam in message");
    echo json_encode(['success' => true, 'message' => 'Wiadomość wysłana pomyślnie!']);
    exit;
}

if (preg_match_all('/https?:\/\//i', $message) > 6) {
    debug_log("BOT BLOCKED: Excessive links in message");
    echo json_encode(['success' => true, 'message' => 'Wiadomość wysłana pomyślnie!']);
    exit;
}

// 5. Utworzenie zgłoszenia w osTicket przez klucz ze zmiennej środowiskowej (Issue #2)
$osTicketApiKey = get_env_secret('OSTICKET_API_KEY');
$configuredApiUrl = get_env_secret('OSTICKET_API_URL', 'https://hd.twojastronawww.pl/ticket_hook.php');
if (strpos($configuredApiUrl, 'crm.katosalsahub.pl') !== false) {
    $configuredApiUrl = 'https://hd.twojastronawww.pl/ticket_hook.php';
}
$ticketCreated = false;
$ticketNum = 'BRAK';

if (!empty($osTicketApiKey) && function_exists('curl_init')) {
    $ticketData = [
        'name' => $name,
        'email' => $email,
        'subject' => "[Kato Salsa Hub] Wiadomość od: $name",
        'message' => $message,
        'topicId' => 12,
        'ip' => $maskedIp,
        'source' => 'Web',
        'autorespond' => false,
        'send_email' => false,
    ];

    $endpoints = [
        ['url' => 'https://hd.twojastronawww.pl/ticket_hook.php', 'resolve' => []],
    ];
    if ($configuredApiUrl !== 'https://hd.twojastronawww.pl/ticket_hook.php') {
        $endpoints[] = ['url' => $configuredApiUrl, 'resolve' => ['hd.twojastronawww.pl:8080:127.0.0.1']];
    }

    foreach ($endpoints as $ep) {
        $ch = curl_init($ep['url']);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'X-API-Key: ' . $osTicketApiKey,
            'Content-Type: application/json',
            'Expect:'
        ]);
        if (!empty($ep['resolve']) && strpos($ep['url'], ':8080') !== false) {
            curl_setopt($ch, CURLOPT_RESOLVE, $ep['resolve']);
        }
        curl_setopt($ch, CURLOPT_USERAGENT, 'KatoSalsaHub-HelpdeskClient/2.0');
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($ticketData, JSON_UNESCAPED_UNICODE));
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 6);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 2);

        $apiResponse = @curl_exec($ch);
        $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $resArr = json_decode((string)$apiResponse, true);
        if ($httpCode === 201 && !empty($resArr['success'])) {
            $ticketCreated = true;
            $ticketNum = (string)($resArr['number'] ?? 'unknown');
            debug_log("TICKET CREATED: #$ticketNum (masked IP: $maskedIp)");
            break;
        }
        debug_log("osTicket API attempt failed on {$ep['url']} (Code $httpCode)");
    }
}

// 6. Scentralizowana wysyłka powiadomienia e-mail na poczatek.krzysztof@gmail.com (zawsze, niezależnie od osTicket)
$to = get_env_secret('CENTRAL_LEAD_EMAIL', get_env_secret('CONTACT_EMAIL', 'poczatek.krzysztof@gmail.com'));
$subject = "[Kato Salsa Hub] Nowa wiadomość od: $name" . ($ticketCreated ? " [Ticket #$ticketNum]" : "");
$email_content = "Nowe zgłoszenie z formularza kontaktowego (Kato Salsa Hub):\n"
               . "=========================================\n"
               . "Imię lub pseudonim: $name\n"
               . "E-mail:             $email\n"
               . "Ticket osTicket:    " . ($ticketCreated ? "#$ticketNum (https://hd.twojastronawww.pl/scp/)" : "Brak") . "\n"
               . "Zanonimizowane IP:  $maskedIp\n"
               . "Data:               " . date('Y-m-d H:i:s') . "\n"
               . "-----------------------------------------\n"
               . "Treść wiadomości:\n$message\n";
$from_email = "noreply@katosalsahub.pl";
$headers = "From: Kato Salsa Hub <$from_email>\r\nReply-To: $email\r\nContent-Type: text/plain; charset=UTF-8\r\n";
@mail($to, $subject, $email_content, $headers, "-f$from_email");

// 7. Powiadomienie Push na Ntfy.sh (z bezpiecznym kodowaniem RFC 2047 UTF-8 dla polskich znaków w nagłówkach)
$ntfyTopic = get_env_secret('NTFY_TOPIC');
if ($ntfyTopic !== '' && function_exists('curl_init')) {
    $ntfyLines = [
        "👤 IMIĘ: {$name}",
        "✉️ E-MAIL: {$email}",
        "🎫 TICKET: " . ($ticketCreated ? "#{$ticketNum}" : "brak"),
        "🌐 ŹRÓDŁO: Formularz katosalsahub.pl",
        "────────────────────────",
        "💬 Wiadomość:",
        $message
    ];
    $rawTitle = "Formularz (katosalsahub) - {$name} | EMAIL: {$email}";
    $encodedTitle = '=?UTF-8?B?' . base64_encode($rawTitle) . '?=';
    $safeEmailForAction = preg_replace('/[;,\r\n]+/', '', $email);
    $ntfyHeaders = [
        "Title: {$encodedTitle}",
        'Priority: high',
        'Tags: incoming_envelope,dancer',
        "Actions: view, Napisz e-mail ({$safeEmailForAction}), mailto:{$safeEmailForAction}; view, Otworz Helpdesk, https://hd.twojastronawww.pl/scp/"
    ];
    $chNtfy = curl_init("https://ntfy.sh/{$ntfyTopic}");
    curl_setopt_array($chNtfy, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => implode("\n", $ntfyLines),
        CURLOPT_HTTPHEADER     => $ntfyHeaders,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 3,
        CURLOPT_CONNECTTIMEOUT => 2
    ]);
    @curl_exec($chNtfy);
    curl_close($chNtfy);
}

echo json_encode([
    'success' => true,
    'ticket'  => $ticketCreated ? $ticketNum : null,
    'message' => 'Dziękujemy! Twoja wiadomość została wysłana.'
]);
