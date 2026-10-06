#!/bin/bash
# mx-deploy: Oberfläche und Dienste direkt auf dem Player aktualisieren, aus dem öffentlichen Repo volumio-web-app.
#
#   sudo mx-deploy                    main laden, Änderungen zeigen, nach Rückfrage einspielen
#   sudo mx-deploy claude/mein-branch einen bestimmten Branch
#   sudo mx-deploy -n [branch]        nur zeigen, was sich ändern würde
#   sudo mx-deploy -y [branch]        ohne Rückfrage
#   sudo mx-deploy --zurueck          letzte Sicherung wiederherstellen (auch --zurück)
#
# Vor jedem Einspielen werden die betroffenen Dateien gesichert (die letzten 5 Sicherungen bleiben).
# Eigene Dateien wie web/config.local.js stehen nicht im Repo und bleiben unberührt; gelöscht wird nichts.
# Einrichten:  curl -fsSL https://raw.githubusercontent.com/Celindir69/volumio-web-app/main/tools/mx-deploy.sh | sudo tee /usr/local/bin/mx-deploy >/dev/null && sudo chmod +x /usr/local/bin/mx-deploy
set -e

REPO=${MX_REPO:-Celindir69/volumio-web-app}
ROOT=${MX_ROOT:-}                                   # nur für Tests: alles unter diesem Ordner statt unter /
STATE=$ROOT/data/INTERNAL/mx-deploy
KEEP=5

# Ziel je Datei im Repo (leer = nicht auf den Player)
target() {
  case "$1" in
    app.html|web/*)          echo "$ROOT/volumio/http/www3/$1" ;;
    kioskTV.html)            echo "$ROOT/volumio/http/www/$1" ;;
    tags/*)                  echo "$ROOT/data/INTERNAL/$1" ;;
    rotel/rotel-bridge.js)   echo "$ROOT/data/INTERNAL/$1" ;;
    tools/mx-deploy.sh)      echo "$ROOT/usr/local/bin/mx-deploy" ;;
    tools/*)                 echo "$ROOT/volumio/http/www3/$1" ;;
  esac
}

die() { echo "mx-deploy: $*" >&2; exit 1; }
[ -n "$ROOT" ] || [ "$(id -u)" = 0 ] || die "bitte mit sudo aufrufen"

restart_services() {               # $1: Liste geänderter Repo-Pfade
  [ -n "$ROOT" ] && { echo "$1" | grep -q '^tags/' && echo "(Test) tag-service neu starten"; echo "$1" | grep -q '^rotel/' && echo "(Test) rotel-bridge neu starten"; return 0; }
  if echo "$1" | grep -q '^tags/'; then
    chown -R volumio:volumio /data/INTERNAL/tags 2>/dev/null || true
    systemctl restart tag-service 2>/dev/null && echo "tag-service neu gestartet" || echo "Hinweis: tag-service nicht neu gestartet (eingerichtet?)"
  fi
  if echo "$1" | grep -q '^rotel/'; then
    systemctl restart rotel-bridge 2>/dev/null && echo "rotel-bridge neu gestartet" || echo "Hinweis: rotel-bridge nicht neu gestartet (eingerichtet?)"
  fi
}

# ---------- Wiederherstellen ----------
if [ "$1" = "--zurueck" ] || [ "$1" = "--zurück" ]; then
  last=$(ls -1 "$STATE"/backup-*.tar.gz 2>/dev/null | sort | tail -n 1)
  [ -n "$last" ] || die "keine Sicherung vorhanden"
  base=${last%.tar.gz}
  echo "Stelle wieder her: $(basename "$base")"
  tar xzf "$last" -C "${ROOT:-/}"
  if [ -s "$base.neu" ]; then while IFS= read -r f; do rm -f "$f"; done < "$base.neu"; fi
  restart_services "$(cat "$base.pfade" 2>/dev/null)"
  rm -f "$last" "$base.neu" "$base.pfade"            # die nächste Wiederherstellung nimmt die vorige Sicherung
  echo "Fertig. Im Browser hart neu laden."
  exit 0
fi

DRY=0; YES=0
while [ $# -gt 0 ]; do
  case "$1" in
    -n) DRY=1 ;;
    -y) YES=1 ;;
    -*) die "unbekannte Option $1" ;;
    *)  BRANCH=$1 ;;
  esac
  shift
done
BRANCH=${BRANCH:-main}

# ---------- Laden ----------
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
if [ -n "$MX_SOURCE" ]; then
  cp "$MX_SOURCE" "$TMP/src.tar.gz"                 # nur für Tests
else
  echo "Lade $REPO, Branch $BRANCH …"
  curl -fsSL --max-time 120 -o "$TMP/src.tar.gz" "https://codeload.github.com/$REPO/tar.gz/refs/heads/$BRANCH" \
    || die "Laden fehlgeschlagen (Branch '$BRANCH' vorhanden? Netz?)"
fi
mkdir "$TMP/src"
tar xzf "$TMP/src.tar.gz" -C "$TMP/src" --strip-components=1 || die "Archiv nicht lesbar"
[ -f "$TMP/src/app.html" ] || die "im Archiv fehlt app.html"

# ---------- Vergleichen ----------
CHANGED=""; NEW=""; n=0
cd "$TMP/src"
while IFS= read -r f; do
  f=${f#./}
  t=$(target "$f"); [ -n "$t" ] || continue
  if [ ! -e "$t" ]; then NEW="$NEW$f"$'\n'; n=$((n+1))
  elif ! cmp -s "$f" "$t"; then CHANGED="$CHANGED$f"$'\n'; n=$((n+1))
  fi
done < <(find . -type f ! -name '*.pyc' | sort)

if [ $n = 0 ]; then echo "Alles aktuell ($BRANCH), nichts zu tun."; exit 0; fi
echo "Branch $BRANCH: $n Datei(en)"
[ -n "$CHANGED" ] && printf '%s' "$CHANGED" | sed 's/^/  geändert: /'
[ -n "$NEW" ]     && printf '%s' "$NEW"     | sed 's/^/  neu:      /'
[ $DRY = 1 ] && exit 0
if [ $YES = 0 ]; then
  read -r -p "Einspielen? [j/N] " a
  case "$a" in j|J|ja|Ja|y|Y) ;; *) echo "Abgebrochen."; exit 0 ;; esac
fi

# ---------- Sichern ----------
mkdir -p "$STATE"
base="$STATE/backup-$(date +%Y%m%d-%H%M%S)"
ALL="$CHANGED$NEW"
: > "$base.neu"
printf '%s' "$ALL" > "$base.pfade"
list="$TMP/sicherung.txt"; : > "$list"
while IFS= read -r f; do
  [ -n "$f" ] || continue
  t=$(target "$f")
  if [ -e "$t" ]; then echo "${t#${ROOT:-/}}" | sed 's|^/||' >> "$list"; else echo "$t" >> "$base.neu"; fi
done <<< "$ALL"
if [ -s "$list" ]; then tar czf "$base.tar.gz" -C "${ROOT:-/}" -T "$list"; else tar czf "$base.tar.gz" -T /dev/null; fi
ls -1 "$STATE"/backup-*.tar.gz | sort | head -n -$KEEP | while IFS= read -r old; do rm -f "$old" "${old%.tar.gz}.neu" "${old%.tar.gz}.pfade"; done

# ---------- Einspielen ----------
while IFS= read -r f; do
  [ -n "$f" ] || continue
  t=$(target "$f")
  mkdir -p "$(dirname "$t")"
  case "$t" in
    */mx-deploy) cp "$f" "$t.neu" && chmod +x "$t.neu" && mv "$t.neu" "$t" ;;   # läuft gerade: neue Datei statt überschreiben
    *.sh)        cp "$f" "$t" && chmod +x "$t" ;;
    *)           cp "$f" "$t" ;;                                               # vorhandene Datei: Besitzer und Rechte bleiben
  esac
done <<< "$ALL"
echo "Eingespielt. Sicherung: $(basename "$base") (zurück mit: sudo mx-deploy --zurueck)"
restart_services "$ALL"
echo "Im Browser hart neu laden."
