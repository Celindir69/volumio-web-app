#!/bin/sh
# TIDAL-Wächter: startet Volumio neu, wenn TIDAL nicht mehr antwortet (Session-Timeout im Plugin).
#
# Ablauf: Eine leichte TIDAL-Seite abfragen (Zeitgrenze TIMEOUT). Misslingt das, nach RETRY_PAUSE Sekunden noch einmal.
# Misslingt auch das zweite Mal, wird Volumio neu gestartet (die Wiedergabe läuft dabei weiter). Danach wird nach
# SETTLE Sekunden erneut geprüft und das Ergebnis protokolliert.
# Schutz vor Dauerschleifen: höchstens ein Neustart je MIN_GAP Sekunden (z. B. bei einer Störung bei TIDAL selbst).
# Läuft Volumio gar nicht (Verbindung verweigert), passiert nichts.
#
# Aufruf:   tidal-watchdog.sh            prüfen und bei Bedarf neu starten (für Cron, als root)
#           tidal-watchdog.sh --check    nur prüfen und ausgeben, nie neu starten
# Protokoll: /var/log/tidal-watchdog.log (nur die letzten Zeilen bleiben erhalten)

URL="${VOLUMIO_URL:-http://localhost:3000}"
CHECK_URI="${CHECK_URI:-tidal://artist/27441}"      # eine Seite, die bei TIDAL abgefragt wird
TIMEOUT="${TIMEOUT:-20}"
RETRY_PAUSE="${RETRY_PAUSE:-60}"
SETTLE="${SETTLE:-90}"
MIN_GAP="${MIN_GAP:-3600}"                          # 1 Stunde (TIDAL fällt etwa alle 4 Stunden aus, siehe docs/tidal-waechter.md)
RESTART_CMD="${RESTART_CMD:-systemctl restart volumio}"
LOG="${LOG:-/var/log/tidal-watchdog.log}"
STAMP="${STAMP:-/var/run/tidal-watchdog.last}"
LOCK="${LOCK:-/var/run/tidal-watchdog.lock}"

log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG" 2>/dev/null
  [ "$CHECK_ONLY" = 1 ] && echo "$*"
  if [ -f "$LOG" ] && [ "$(wc -l < "$LOG")" -gt 300 ]; then tail -n 150 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"; fi
}

CHECK_ONLY=0
[ "$1" = "--check" ] && CHECK_ONLY=1

# Ergebnis: 0 = TIDAL antwortet, 1 = Zeitüberschreitung oder falsche Antwort, 2 = Volumio nicht erreichbar
check() {
  body=$(curl -s -m "$TIMEOUT" "$URL/api/v1/browse?uri=$CHECK_URI")
  rc=$?
  [ $rc -eq 7 ] && return 2
  [ $rc -ne 0 ] && return 1
  case "$body" in *'"navigation"'*'"lists"'*) return 0 ;; esac
  return 1
}

# nur ein Lauf gleichzeitig
if ! mkdir "$LOCK" 2>/dev/null; then exit 0; fi
trap 'rmdir "$LOCK"' EXIT

check; r=$?
[ $r -eq 2 ] && { log "Volumio nicht erreichbar - nichts unternommen"; exit 0; }
[ $r -eq 0 ] && { log "TIDAL ok"; exit 0; }

log "TIDAL antwortet nicht (1. Versuch), warte ${RETRY_PAUSE}s"
[ "$CHECK_ONLY" = 1 ] && exit 1
sleep "$RETRY_PAUSE"
check; r=$?
[ $r -eq 2 ] && { log "Volumio nicht erreichbar - nichts unternommen"; exit 0; }
[ $r -eq 0 ] && { log "TIDAL wieder ok (2. Versuch)"; exit 0; }

now=$(date +%s)
last=$(cat "$STAMP" 2>/dev/null || echo 0)
if [ $((now - last)) -lt "$MIN_GAP" ]; then
  log "TIDAL antwortet weiter nicht, aber letzter Neustart ist weniger als ${MIN_GAP}s her - kein Neustart"
  exit 1
fi

echo "$now" > "$STAMP"
log "TIDAL antwortet nicht (2. Versuch): starte Volumio neu"
sh -c "$RESTART_CMD" >> "$LOG" 2>&1
sleep "$SETTLE"
check; r=$?
if [ $r -eq 0 ]; then log "nach dem Neustart: TIDAL ok"; else log "nach dem Neustart: TIDAL antwortet weiter nicht (Ergebnis $r)"; fi
