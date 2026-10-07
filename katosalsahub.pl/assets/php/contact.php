<?php
header('Content-Type: application/json; charset=utf-8');

ini_set('log_errors', 1);

function debug_log($message) {
    error_log('[KatoContact] ' . $message);
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

$ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';

// 1. Zabezpieczenie Anty-Bot: Honeypot (pola pułapki)
$honeypots = ['hp_chk', 'website', 'website_url', 'company_name', 'phone_extra'];
foreach ($honeypots as $hp) {
    if (!empty($input[$hp])) {
        debug_log("BOT BLOCKED: Honeypot field '$hp' filled: " . substr($input[$hp], 0, 50));
        // Cichy sukces dla bota
        echo json_encode(['success' => true, 'message' => 'Wiadomość wysłana pomyślnie!']);
        exit;
    }
}

// 2. Zabezpieczenie Anty-Bot: Sprawdzenie obecności tokena JS i czasu wypełniania (min 2.5s)
if (empty($input['js_check'])) {
    debug_log("BOT BLOCKED: Missing js_check token (direct bot curl without browser JS execution)");
    echo json_encode(['success' => true, 'message' => 'Wiadomość wysłana pomyślnie!']);
    exit;
}

if (isset($input['submission_seconds']) && (float)$input['submission_seconds'] < 2.5) {
    debug_log("BOT BLOCKED: Form submitted too quickly (" . $input['submission_seconds'] . "s)");
    echo json_encode(['success' => true, 'message' => 'Wiadomość wysłana pomyślnie!']);
    exit;
}

// 3. Walidacja pól formularza
$name = trim(strip_tags($input['name'] ?? ''));
$email = trim($input['email'] ?? '');
$message = trim(strip_tags($input['message'] ?? ''));

if (empty($name) || empty($email) || empty($message)) {
    echo json_encode(['success' => false, 'message' => 'Wypełnij wszystkie pola!']);
    exit;
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    echo json_encode(['success' => false, 'message' => 'Podaj poprawny adres e-mail!']);
    exit;
}

// 4. Zabezpieczenie Anty-Bot: Wykrywanie spamu (Cyrylica i linki)
if (preg_match('/\p{Cyrillic}/u', $message)) {
    debug_log("BOT BLOCKED: Cyrillic spam in message: " . substr($message, 0, 50));
    echo json_encode(['success' => true, 'message' => 'Wiadomość wysłana pomyślnie!']);
    exit;
}

if (preg_match_all('/https?:\/\//i', $message) > 2) {
    debug_log("BOT BLOCKED: Excessive links in message: " . substr($message, 0, 50));
    echo json_encode(['success' => true, 'message' => 'Wiadomość wysłana pomyślnie!']);
    exit;
}

// 5. Utworzenie zgłoszenia w osTicket przez bezpośredni wewnętrzny endpoint
$ticketData = [
    'name' => $name,
    'email' => $email,
    'subject' => "[Kato Salsa Hub] Wiadomość od: $name",
    'message' => $message,
    'topicId' => 12, // Dział: Kato Salsa Hub
    'ip' => $ip,
    'source' => 'Web',
];

$ch = curl_init('http://hd.twojastronawww.pl:8080/ticket_hook.php');
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'X-API-Key: A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6',
    'Content-Type: application/json',
    'Expect:'
]);
curl_setopt($ch, CURLOPT_RESOLVE, ['hd.twojastronawww.pl:8080:127.0.0.1']);
curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
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
    debug_log("TICKET CREATED: #$ticketNum for $email");
} else {
    debug_log("osTicket API FAILED (Code $httpCode): " . $apiResponse);
    // Awaryjny fallback e-mail
    $to = "kontakt@twojastronawww.pl";
    $subject = "Nowa wiadomość od: $name [Kato Salsa Hub]";
    $email_content = "Imię: $name\nEmail: $email\n\nWiadomość:\n$message";
    $from_email = "noreply@katosalsahub.pl";
    $headers = "From: Kato Salsa Hub <$from_email>\r\nReply-To: $email\r\nContent-Type: text/plain; charset=UTF-8\r\n";
    @mail($to, $subject, $email_content, $headers, "-f$from_email");
}

echo json_encode(['success' => true, 'message' => 'Dziękujemy! Twoja wiadomość została wysłana.']);
