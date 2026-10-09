#!/bin/bash
# Früherer Name von xplorio-deploy. Unter /usr/local/bin/web-app-deploy eingerichtet, richtet es xplorio-deploy ein
# (falls noch nicht da) und ruft es mit denselben Angaben auf. Aufrufe wie bisher:
#   sudo web-app-deploy [-n|-y] [branch]   sudo web-app-deploy --rollback
ROOT=${DEPLOY_ROOT:-${MX_ROOT:-}}                   # nur für Tests
B=$ROOT/usr/local/bin/xplorio-deploy
if [ ! -x "$B" ]; then
  [ -n "$ROOT" ] || [ "$(id -u)" = 0 ] || { echo "$(basename "$0"): bitte mit sudo aufrufen" >&2; exit 1; }
  mkdir -p "$(dirname "$B")"
  # mit der Oberfläche eingespielt, sonst aus dem Repo laden
  src=$(ls -1 "$ROOT"/volumio/http/www*/tools/xplorio-deploy.sh 2>/dev/null | head -n 1)
  if [ -n "$src" ]; then cp "$src" "$B.neu"
  else curl -fsSL --max-time 60 -o "$B.neu" https://raw.githubusercontent.com/Celindir69/xplorio/main/tools/xplorio-deploy.sh \
    || { echo "xplorio-deploy nicht ladbar (Netz?)" >&2; rm -f "$B.neu"; exit 1; }
  fi
  chmod +x "$B.neu" && mv "$B.neu" "$B"
  echo "xplorio-deploy eingerichtet ($B)"
fi
echo "Hinweis: $(basename "$0" .sh) heißt jetzt xplorio-deploy."
exec "$B" "$@"
