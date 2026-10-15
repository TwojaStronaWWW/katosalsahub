<?php
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

ini_set('display_errors', 0);
ini_set('log_errors', 1);
error_reporting(E_ALL);

function debug_log($message) {
    error_log('[KatoContact] ' . $message);
}

/**
 * Pobiera zmienną środowiskową z getenv(), $_ENV lub lokalnego pliku .env poza webrootem
 */
function get_env_secret($key, $default = '') {
    $val = getenv($key);
    if ($val !== false && $val !== '') {
        return $val;
    }
    if (!empty($_ENV[$key])) {
        return $_ENV[$key];
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
function mask_ip($ip) {
    if (empty($ip) || !is_string($ip)) {
        return '0.0.0.0';
    }
    if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
        $parts = explode('.', $ip);
        $parts[3] = '0';
        return implode('.', $parts);
    }
    if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6)) {
        $parts = explode(':', $ip);
        return implode(':', array_slice($parts, 0, 3)) . '::0';
    }
    return '0.0.0.0';
}

// Obsługa wejścia (JSON lub POST/FormData)
$input = json_decode(file_get_contents("php://input"), true);
if (!is_array($input)) {
    $input = $_POST;
}

if (empty($input)) {
    echo json_encode(['success' => false, 'message' => 'Brak danych wejściowych']);
    exit;
}

$rawIp = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
$maskedIp = mask_ip($rawIp);

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

if (isset($input['submission_seconds']) && (float)$input['submission_seconds'] < 2.5) {
    debug_log("BOT BLOCKED: Form submitted too quickly (" . $input['submission_seconds'] . "s)");
    echo json_encode(['success' => true, 'message' => 'Wiadomość wysłana pomyślnie!']);
    exit;
}

// 3. Walidacja pól formularza oraz zgody RODO (Issue #6 & #7)
$name = trim(strip_tags($input['name'] ?? ''));
$email = trim($input['email'] ?? '');
$message = trim(strip_tags($input['message'] ?? ''));
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

if (!empty($osTicketApiKey)) {
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
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($ticketData));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 6);

    $apiResponse = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    $resArr = json_decode($apiResponse, true);
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
    $to = "kontakt@twojastronawww.pl";
    $subject = "Nowa wiadomość od: $name [Kato Salsa Hub]";
    $email_content = "Imię lub pseudonim: $name\nEmail: $email\nZanonimizowane IP: $maskedIp\n\nWiadomość:\n$message";
    $from_email = "noreply@katosalsahub.pl";
    $headers = "From: Kato Salsa Hub <$from_email>\r\nReply-To: $email\r\nContent-Type: text/plain; charset=UTF-8\r\n";
    @mail($to, $subject, $email_content, $headers, "-f$from_email");
}

echo json_encode(['success' => true, 'message' => 'Dziękujemy! Twoja wiadomość została wysłana.']);
