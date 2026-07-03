<?php
// Ustawienie nagłówka na JSON
header('Content-Type: application/json; charset=utf-8');

// Logowanie błędów do pliku
ini_set('log_errors', 1);
ini_set('error_log', 'email_debug.log');

// Funkcja logująca
function debug_log($message) {
    file_put_contents('email_debug.log', date('Y-m-d H:i:s') . " " . $message . "\n", FILE_APPEND);
}

// Obsługa wejścia (JSON lub POST)
$input = json_decode(file_get_contents("php://input"), true);
if (!is_array($input)) {
    $input = $_POST;
}

// Logowanie surowego wejścia dla pewności
debug_log("RAW INPUT: " . file_get_contents("php://input"));
if (empty($input)) {
    debug_log("Input empty after parsing.");
    echo json_encode(['success' => false, 'message' => 'Brak danych wejściowych']);
    exit;
}

// Honeypot (hp_chk)
if (!empty($input['hp_chk'])) {
    debug_log("Honeypot triggered. Value: " . $input['hp_chk']);
    // Symulujemy sukces dla bota
    echo json_encode(['success' => true, 'message' => 'Wiadomość wysłana!']);
    exit;
}

// Walidacja pól
$name = trim($input['name'] ?? '');
$email = trim($input['email'] ?? '');
$message = trim($input['message'] ?? '');

if (empty($name) || empty($email) || empty($message)) {
    debug_log("Validation failed. Name: $name, Email: $email, Msg length: " . strlen($message));
    echo json_encode(['success' => false, 'message' => 'Wypełnij wszystkie pola!']);
    exit;
}

// Konfiguracja Email
$to = "kontakt@twojastronawww.pl"; // Twój email
$subject = "Nowa wiadomość od: $name";
$email_content = "Imię: $name\nEmail: $email\n\nWiadomość:\n$message";

// Nagłówki i Sender
$server_domain = "katosalsahub.pl"; // Hardcoded domain
$from_email = "noreply@" . $server_domain;

$headers = "From: Kato Salsa Hub <$from_email>\r\n";
$headers .= "Reply-To: $email\r\n";
$headers .= "Content-Type: text/plain; charset=UTF-8\r\n";
$headers .= "Return-Path: <$from_email>\r\n"; // Ważne dla debugowania zwrotek

// WYSYŁKA
debug_log("Attempting to send email from $from_email to $to");

// Użycie parametru -f dla sendmaila
$mailResult = mail($to, $subject, $email_content, $headers, "-f$from_email");

if ($mailResult) {
    debug_log("Mail SUCCESS.");
    echo json_encode(['success' => true, 'message' => 'Wiadomość wysłana pomyślnie!']);
} else {
    $error = error_get_last();
    debug_log("Mail FAILED. System Error: " . print_r($error, true));
    echo json_encode(['success' => false, 'message' => 'Błąd wysyłania (Server Error). Sprawdź logi.']);
}
?>
