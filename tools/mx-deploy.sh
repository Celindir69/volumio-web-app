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
#
# Die Oberfläche kommt nach www3/ (bzw. www4/, siehe unten) und zusätzlich in jeden anderen vorhandenen Ordner
# /volumio/http/www*/: Welchen Volumio ausliefert, hängt von der in Volumio gewählten Oberfläche ab. Neue Ordner
# legt das Skript nicht an.
#
# Volumio 4 liefert die Oberfläche aus /volumio/http/www4/ statt www3/. Dasselbe Skript, unter dem Namen
# volumio4-deploy eingerichtet, spielt dorthin ein (eigene Sicherungen unter /data/INTERNAL/volumio4-deploy):
#   curl -fsSL https://raw.githubusercontent.com/Celindir69/volumio-web-app/main/tools/mx-deploy.sh | sudo tee /usr/local/bin/volumio4-deploy >/dev/null && sudo chmod +x /usr/local/bin/volumio4-deploy
set -e

REPO=${MX_REPO:-Celindir69/volumio-web-app}
ROOT=${MX_ROOT:-}                                   # nur für Tests: alles unter diesem Ordner statt unter /
PROG=$(basename "$0" .sh)
case "$PROG" in
  volumio4-deploy*) WWW=www4 ;;
  *)                PROG=mx-deploy; WWW=www3 ;;
esac
WWW=${MX_WWW:-$WWW}                                 # Ordner der Oberfläche unter /volumio/http/
WWWS=$WWW                                           # dazu alle anderen vorhandenen www*-Ordner (nicht bei MX_WWW)
if [ -z "$MX_WWW" ]; then
  for d in "$ROOT"/volumio/http/www*/; do
    [ -d "$d" ] || continue
    w=$(basename "$d"); [ "$w" = "$WWW" ] || WWWS="$WWWS $w"
  done
fi
STATE=$ROOT/data/INTERNAL/$PROG
KEEP=5

# Ziele je Datei im Repo, eins je Zeile (leer = nicht auf den Player)
target() {
  case "$1" in
    kioskTV.html)            echo "$ROOT/volumio/http/www/$1" ;;
    tags/*)                  echo "$ROOT/data/INTERNAL/$1" ;;
    rotel/rotel-bridge.js)   echo "$ROOT/data/INTERNAL/$1" ;;
    tools/mx-deploy.sh)      echo "$ROOT/usr/local/bin/$PROG" ;;
    app.html|web/*|tools/*)  for w in $WWWS; do echo "$ROOT/volumio/http/$w/$1"; done ;;
  esac
}
TAB=$'\t'                                           # Einträge der Listen: Repo-Pfad TAB Ziel

die() { echo "$PROG: $*" >&2; exit 1; }
[ -n "$ROOT" ] || [ "$(id -u)" = 0 ] || die "bitte mit sudo aufrufen"

restart_services() {               # $1: Liste geänderter Repo-Pfade
  [ -n "$ROOT" ] && { echo "$1" | grep -q '^tags/' && echo "(Test) tag-service neu starten"; echo "$1" | grep -q '^rotel/' && echo "(Test) rotel-bridge neu starten"; return 0; }
  if echo "$1" | grep -q '^tags/'; then
    chown -R volumio:volumio /data/INTERNAL/tags 2>/dev/null || true
    # Datenordner des Tag-Dienstes (außerhalb von Webordner und Netzwerkfreigabe); der Dienst zieht beim Start dorthin um
    mkdir -p /data/web-app 2>/dev/null || true
    [ -d /data/web-app/data ] || { mkdir -m 700 /data/web-app/data && chown volumio:volumio /data/web-app/data && echo "Datenordner /data/web-app/data angelegt"; } || true
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
  while IFS= read -r t; do
    [ -n "$t" ] || continue
    if [ ! -e "$t" ]; then NEW="$NEW$f$TAB$t"$'\n'; n=$((n+1))
    elif ! cmp -s "$f" "$t"; then CHANGED="$CHANGED$f$TAB$t"$'\n'; n=$((n+1))
    fi
  done <<< "$(target "$f")"
done < <(find . -type f ! -name '*.pyc' | sort)
# Anzeige: Repo-Pfad, bei mehreren Oberflächen-Ordnern mit dem Ordner dahinter
show() { while IFS="$TAB" read -r f t; do
  [ -n "$f" ] || continue
  r=${t#$ROOT/volumio/http/}
  if [ "$r" != "$t" ] && [ "$WWWS" != "$WWW" ] && [ "$f" != kioskTV.html ]; then echo "$f (${r%%/*})"; else echo "$f"; fi
done; }

if [ $n = 0 ]; then echo "Alles aktuell ($BRANCH), nichts zu tun."; exit 0; fi
echo "Branch $BRANCH: $n Datei(en)"
[ -n "$CHANGED" ] && printf '%s' "$CHANGED" | show | sed 's/^/  geändert: /'
[ -n "$NEW" ]     && printf '%s' "$NEW"     | show | sed 's/^/  neu:      /'
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
while IFS="$TAB" read -r f t; do
  [ -n "$f" ] || continue
  if [ -e "$t" ]; then echo "${t#${ROOT:-/}}" | sed 's|^/||' >> "$list"; else echo "$t" >> "$base.neu"; fi
done <<< "$ALL"
if [ -s "$list" ]; then tar czf "$base.tar.gz" -C "${ROOT:-/}" -T "$list"; else tar czf "$base.tar.gz" -T /dev/null; fi
ls -1 "$STATE"/backup-*.tar.gz | sort | head -n -$KEEP | while IFS= read -r old; do rm -f "$old" "${old%.tar.gz}.neu" "${old%.tar.gz}.pfade"; done

# ---------- Einspielen ----------
while IFS="$TAB" read -r f t; do
  [ -n "$f" ] || continue
  mkdir -p "$(dirname "$t")"
  case "$t" in
    */"$PROG")   cp "$f" "$t.neu" && chmod +x "$t.neu" && mv "$t.neu" "$t" ;;   # läuft gerade: neue Datei statt überschreiben
    *.sh)        cp "$f" "$t" && chmod +x "$t" ;;
    *)           cp "$f" "$t" ;;                                               # vorhandene Datei: Besitzer und Rechte bleiben
  esac
done <<< "$ALL"
echo "Eingespielt nach /volumio/http/$(echo $WWWS | sed 's/ /, /g'). Sicherung: $(basename "$base") (zurück mit: sudo $PROG --zurueck)"
restart_services "$ALL"
echo "Im Browser hart neu laden."
