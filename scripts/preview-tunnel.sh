#!/usr/bin/env bash
# ==============================================================================
# preview-tunnel.sh
# Blyskawiczny, szyfrowany podglad strony (Quick Tunnel via trycloudflare.com)
# Eliminuje potrzebe utrzymywania publicznych subdomen 'test.nazwastrony.pl'.
# ==============================================================================
set -euo pipefail

TARGET="${1:-http://localhost:8080}"

echo "======================================================================"
echo ">> [Cloudflare Quick Tunnel] Generowanie tymczasowego podgladu witryny"
echo ">> Cel docelowy: ${TARGET}"
echo ">> Zero konfiguracji DNS, zero otwartych portow na zaporze."
echo ">> Po zakonczeniu testow nacisnij Ctrl+C, aby natychmiast zamknac link."
echo "======================================================================"

if command -v docker >/dev/null 2>&1; then
  docker run --rm -it \
    --name ephemeral-site-preview \
    cloudflare/cloudflared:latest \
    tunnel --no-autoupdate --url "${TARGET}"
elif command -v cloudflared >/dev/null 2>&1; then
  cloudflared tunnel --no-autoupdate --url "${TARGET}"
else
  echo ">> Uruchamianie cloudflared przez npx..."
  npx --yes cloudflared tunnel --url "${TARGET}"
fi
