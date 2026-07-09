<?php
header('Content-Type: application/json; charset=utf-8');

// Logowanie błędów do pliku systemowego (poza public_html)
ini_set('log_errors', 1);
ini_set('display_errors', 0);

// Obsługa wejścia (JSON lub POST) — php://input jest strumieniem jednorazowym
$rawInput = file_get_contents('php://input');
$input = json_decode($rawInput, true);
if (!is_array($input)) {
    $input = $_POST;
}

if (empty($input)) {
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
$name = str_replace(["\r", "\n", "\0"], '', trim($input['name'] ?? ''));
$email = filter_var(trim($input['email'] ?? ''), FILTER_VALIDATE_EMAIL);
$message = trim($input['message'] ?? '');

if (empty($name) || !$email || empty($message)) {
    echo json_encode(['success' => false, 'message' => 'Wypełnij wszystkie pola poprawnie!']);
    exit;
}

// Konfiguracja Email
$to = "kontakt@twojastronawww.pl";
$subject = '=?UTF-8?B?' . base64_encode("Nowa wiadomość od: $name") . '?=';
$email_content = "Imię: $name\nEmail: $email\n\nWiadomość:\n$message";

// Nagłówki i Sender
$server_domain = "katosalsahub.pl"; // Hardcoded domain
$from_email = "noreply@" . $server_domain;

$headers = "From: Kato Salsa Hub <$from_email>\r\n";
$headers .= "Reply-To: $email\r\n";
$headers .= "Content-Type: text/plain; charset=UTF-8\r\n";
$headers .= "Return-Path: <$from_email>\r\n"; // Ważne dla debugowania zwrotek

// WYSYŁKA
$mailResult = mail($to, $subject, $email_content, $headers, "-f$from_email");

if ($mailResult) {
    echo json_encode(['success' => true, 'message' => 'Wiadomość wysłana pomyślnie!']);
} else {
    error_log('contact.php: mail() failed for ' . $email);
    echo json_encode(['success' => false, 'message' => 'Błąd wysyłania. Spróbuj ponownie później.']);
}
?>
