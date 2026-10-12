# Polityka Bezpieczeństwa (Security Policy) - Kato Salsa Hub & DancePuls

## 1. Zakres i Standardy Bezpieczeństwa (ISO 27001 / RODO)
Bezpieczeństwo danych tancerzy, organizatorów oraz stabilność platformy internetowej są priorytetem Fundacji Kato Salsa Hub. Stosujemy:
- Wielowarstwową ochronę antybotową formularzy (Honeypot, weryfikacja tokena wykonania JS, pomiar czasu interakcji użytkownika, filtr cyrylicy).
- Ochronę prywatności i RODO (brak zewnętrznych inwazyjnych trackerów, bezpieczne sesje).
- Brak sekretów w repozytorium (sekrety przekazywane wyłącznie przez zmienne środowiskowe CI/CD).

## 2. Odpowiedzialne Ujawnianie Podatności (Responsible Disclosure)
Jeżeli odkryłeś potencjalną lukę bezpieczeństwa w portalu `katosalsahub.pl` lub silniku `dancepuls.pl`, prosimy o zgłoszenie:
- **E-mail:** `kontakt@katosalsahub.pl` (z kopią do `kontakt@twojastronawww.pl`)
- **Poufność:** Prosimy o niepublikowanie informacji w publicznych zgłoszeniach (Issues) przed wdrożeniem poprawki.
- **Czas reakcji:** Analiza do 24-48 godzin roboczych.
