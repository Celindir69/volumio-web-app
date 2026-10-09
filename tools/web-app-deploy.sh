#!/bin/bash
# web-app-deploy: Oberfläche und Dienste direkt auf dem Player aktualisieren, aus dem öffentlichen Repo volumio-web-app.
#
#   sudo web-app-deploy                    main laden, Änderungen zeigen, nach Rückfrage einspielen
#   sudo web-app-deploy claude/mein-branch einen bestimmten Branch
#   sudo web-app-deploy -n [branch]        nur zeigen, was sich ändern würde
#   sudo web-app-deploy -y [branch]        ohne Rückfrage
#   sudo web-app-deploy --zurueck          letzte Sicherung wiederherstellen (auch --zurück)
#
# Die Oberfläche (app.html, web/, tools/) kommt in jeden vorhandenen Ordner /volumio/http/www*/: Welchen Volumio
# ausliefert, hängt von Version und gewählter Oberfläche ab (Volumio 3: www3, Volumio 4: www4). Neue Ordner legt das
# Skript nicht an; gibt es keinen, bricht es ab.
# Vor jedem Einspielen werden die betroffenen Dateien unter /data/web-app-deploy gesichert (die letzten 5 bleiben).
# Eigene Dateien wie web/config.local.js stehen nicht im Repo und bleiben unberührt; gelöscht wird nichts.
# Einrichten:  curl -fsSL https://raw.githubusercontent.com/Celindir69/volumio-web-app/main/tools/web-app-deploy.sh | sudo tee /usr/local/bin/web-app-deploy >/dev/null && sudo chmod +x /usr/local/bin/web-app-deploy
# Die früheren Namen mx-deploy und volumio4-deploy rufen dieses Skript auf (tools/mx-deploy.sh).
set -e

REPO=${DEPLOY_REPO:-${MX_REPO:-Celindir69/volumio-web-app}}
ROOT=${DEPLOY_ROOT:-${MX_ROOT:-}}                   # nur für Tests: alles unter diesem Ordner statt unter /
SOURCE=${DEPLOY_SOURCE:-${MX_SOURCE:-}}             # nur für Tests: Archiv statt Download
PROG=web-app-deploy
WWWS=${DEPLOY_WWW:-${MX_WWW:-}}                     # Ordner der Oberfläche unter /volumio/http/ (Vorgabe: alle vorhandenen www*)
if [ -z "$WWWS" ]; then
  for d in "$ROOT"/volumio/http/www*/; do
    [ -d "$d" ] && WWWS="$WWWS $(basename "$d")"
  done
  WWWS=${WWWS# }
fi
STATE=$ROOT/data/web-app-deploy
OLD_STATES="$ROOT/data/INTERNAL/mx-deploy $ROOT/data/INTERNAL/volumio4-deploy"   # Sicherungen der früheren Namen
KEEP=5

# Ziele je Datei im Repo, eins je Zeile (leer = nicht auf den Player)
target() {
  case "$1" in
    kioskTV.html)            echo "$ROOT/volumio/http/www/$1" ;;
    tags/*)                  echo "$ROOT/data/INTERNAL/$1" ;;
    rotel/rotel-bridge.js)   echo "$ROOT/data/INTERNAL/$1" ;;
    tools/web-app-deploy.sh) echo "$ROOT/usr/local/bin/$PROG" ;;
    tools/mx-deploy.sh)      for p in mx-deploy volumio4-deploy; do [ -e "$ROOT/usr/local/bin/$p" ] && echo "$ROOT/usr/local/bin/$p"; done; true ;;   # nur vorhandene alte Namen
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
    [ -d /data/web-app ] || { mkdir -m 700 /data/web-app && chown volumio:volumio /data/web-app && echo "Datenordner /data/web-app angelegt"; } || true
    systemctl restart tag-service 2>/dev/null && echo "tag-service neu gestartet" || echo "Hinweis: tag-service nicht neu gestartet (eingerichtet?)"
  fi
  if echo "$1" | grep -q '^rotel/'; then
    systemctl restart rotel-bridge 2>/dev/null && echo "rotel-bridge neu gestartet" || echo "Hinweis: rotel-bridge nicht neu gestartet (eingerichtet?)"
  fi
}

# ---------- Wiederherstellen ----------
if [ "$1" = "--zurueck" ] || [ "$1" = "--zurück" ]; then
  last=$(for d in "$STATE" $OLD_STATES; do ls -1 "$d"/backup-*.tar.gz 2>/dev/null; done \
    | while IFS= read -r b; do printf '%s\t%s\n' "$(basename "$b")" "$b"; done | sort | tail -n 1 | cut -f2)
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

[ -n "$WWWS" ] || die "kein Ordner /volumio/http/www* gefunden (Volumio installiert?); mit DEPLOY_WWW=<ordner> einen bestimmten wählen"

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
if [ -n "$SOURCE" ]; then
  cp "$SOURCE" "$TMP/src.tar.gz"                 # nur für Tests
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
  if [ "$r" != "$t" ] && [ "${WWWS#* }" != "$WWWS" ] && [ "$f" != kioskTV.html ]; then echo "$f (${r%%/*})"; else echo "$f"; fi
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
    */usr/local/bin/*) cp "$f" "$t.neu" && chmod +x "$t.neu" && mv "$t.neu" "$t" ;;   # läuft evtl. gerade: neue Datei statt überschreiben
    *.sh)              cp "$f" "$t" && chmod +x "$t" ;;
    *)                 cp "$f" "$t" ;;                                               # vorhandene Datei: Besitzer und Rechte bleiben
  esac
done <<< "$ALL"
echo "Eingespielt nach /volumio/http/$(echo $WWWS | sed 's/ /, /g'). Sicherung: $(basename "$base") (zurück mit: sudo $PROG --zurueck)"
restart_services "$ALL"
echo "Im Browser hart neu laden."
