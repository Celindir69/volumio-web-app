#!/bin/bash
# Früherer Name von web-app-deploy. Unter /usr/local/bin/mx-deploy bzw. volumio4-deploy eingerichtet, richtet es
# web-app-deploy ein (falls noch nicht da) und ruft es mit denselben Angaben auf. Aufrufe wie bisher:
#   sudo mx-deploy [-n|-y] [branch]   sudo mx-deploy --rollback
ROOT=${DEPLOY_ROOT:-${MX_ROOT:-}}                   # nur für Tests
B=$ROOT/usr/local/bin/web-app-deploy
if [ ! -x "$B" ]; then
  [ -n "$ROOT" ] || [ "$(id -u)" = 0 ] || { echo "$(basename "$0"): bitte mit sudo aufrufen" >&2; exit 1; }
  mkdir -p "$(dirname "$B")"
  # von einem älteren mx-deploy mit der Oberfläche eingespielt, sonst aus dem Repo laden
  src=$(ls -1 "$ROOT"/volumio/http/www*/tools/web-app-deploy.sh 2>/dev/null | head -n 1)
  if [ -n "$src" ]; then cp "$src" "$B.neu"
  else curl -fsSL --max-time 60 -o "$B.neu" https://raw.githubusercontent.com/Celindir69/volumio-web-app/main/tools/web-app-deploy.sh \
    || { echo "web-app-deploy nicht ladbar (Netz?)" >&2; rm -f "$B.neu"; exit 1; }
  fi
  chmod +x "$B.neu" && mv "$B.neu" "$B"
  echo "web-app-deploy eingerichtet ($B)"
fi
echo "Hinweis: $(basename "$0" .sh) heißt jetzt web-app-deploy."
exec "$B" "$@"
