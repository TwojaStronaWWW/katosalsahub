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
        __DIR__ . '/../../../.env',
        __DIR__ . '/../../.env',
    ];
    foreach ($envPaths as $envPath) {
        if (is_readable($envPath)) {
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

// 1. Zabezpieczenie Anty-Bot: Honeypot (pola pułapki)
$honeypots = ['hp_chk', 'website', 'website_url', 'company_name', 'phone_extra'];
foreach ($honeypots as $hp) {
    if (!empty($input[$hp])) {
        debug_log("BOT BLOCKED: Honeypot field '$hp' filled");
        echo json_encode(['success' => true, 'message' => 'Wiadomość wysłana pomyślnie!']);
        exit;
    }
}

// 2. Zabezpieczenie Anty-Bot: Sprawdzenie obecności tokena JS i czasu wypełniania (min 2.5s)
if (empty($input['js_check'])) {
    debug_log("BOT BLOCKED: Missing js_check token");
    echo json_encode(['success' => true, 'message' => 'Wiadomość wysłana pomyślnie!']);
    exit;
}

if (!isset($input['submission_seconds']) || (float)$input['submission_seconds'] < 2.5) {
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

if (preg_match_all('/https?:\/\//i', $message) > 2) {
    debug_log("BOT BLOCKED: Excessive links in message");
    echo json_encode(['success' => true, 'message' => 'Wiadomość wysłana pomyślnie!']);
    exit;
}

// 5. Utworzenie zgłoszenia w osTicket przez klucz ze zmiennej środowiskowej (Issue #2)
$osTicketApiKey = get_env_secret('OSTICKET_API_KEY');
$osTicketApiUrl = get_env_secret('OSTICKET_API_URL', 'http://hd.twojastronawww.pl:8080/ticket_hook.php');
$ticketCreated = false;

if (!empty($osTicketApiKey) && function_exists('curl_init')) {
    $ticketData = [
        'name' => $name,
        'email' => $email,
        'subject' => "[Kato Salsa Hub] Wiadomość od: $name",
        'message' => $message,
        'topicId' => 12,
        'ip' => $maskedIp,
        'source' => 'Web',
    ];

    $ch = curl_init($osTicketApiUrl);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'X-API-Key: ' . $osTicketApiKey,
        'Content-Type: application/json',
        'Expect:'
    ]);
    curl_setopt($ch, CURLOPT_RESOLVE, ['hd.twojastronawww.pl:8080:127.0.0.1']);
    curl_setopt($ch, CURLOPT_USERAGENT, 'KatoSalsaHub-HelpdeskClient/2.0');
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($ticketData, JSON_UNESCAPED_UNICODE));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 6);

    $apiResponse = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    $resArr = json_decode((string)$apiResponse, true);
    $ticketCreated = ($httpCode === 201 && !empty($resArr['success']));
    $ticketNum = $resArr['number'] ?? 'unknown';

    if ($ticketCreated) {
        debug_log("TICKET CREATED: #$ticketNum (masked IP: $maskedIp)");
    } else {
        debug_log("osTicket API FAILED (Code $httpCode)");
    }
}

if (!$ticketCreated) {
    // Awaryjny fallback e-mail
    $to = get_env_secret('CONTACT_EMAIL', 'kontakt@twojastronawww.pl');
    $subject = "Nowa wiadomość od: $name [Kato Salsa Hub]";
    $email_content = "Imię lub pseudonim: $name\nEmail: $email\nZanonimizowane IP: $maskedIp\n\nWiadomość:\n$message";
    $from_email = "noreply@katosalsahub.pl";
    $headers = "From: Kato Salsa Hub <$from_email>\r\nReply-To: $email\r\nContent-Type: text/plain; charset=UTF-8\r\n";
    @mail($to, $subject, $email_content, $headers, "-f$from_email");
}

echo json_encode(['success' => true, 'message' => 'Dziękujemy! Twoja wiadomość została wysłana.']);
