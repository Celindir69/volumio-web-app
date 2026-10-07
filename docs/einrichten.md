# Einrichten auf dem Player

Alle Befehle auf dem Player (ssh), als Benutzer mit `sudo`.

## Oberfläche
`app.html` und `web/` nach `/volumio/http/www3/` kopieren, Aufruf `http://<player>/app.html`.
`kioskTV.html` nach `/volumio/http/www/` (der Volumio-Kiosk bekommt die Dateien aus `www/`).
Nach einem Update im Browser hart neu laden. Eine vorhandene `web/config.local.js` bleibt erhalten.

## Aktualisieren mit mx-deploy
Einmal einrichten:
```bash
curl -fsSL https://raw.githubusercontent.com/Celindir69/volumio-web-app/main/tools/mx-deploy.sh | sudo tee /usr/local/bin/mx-deploy >/dev/null
sudo chmod +x /usr/local/bin/mx-deploy
```
Danach auf dem Player:
| Aufruf | Wirkung |
|---|---|
| `sudo mx-deploy` | `main` aus volumio-web-app laden, geänderte und neue Dateien zeigen, nach Rückfrage einspielen |
| `sudo mx-deploy <branch>` | einen anderen Branch, z. B. zum Testen vor dem Merge |
| `sudo mx-deploy -n <branch>` | nur zeigen, was sich ändern würde |
| `sudo mx-deploy -y <branch>` | ohne Rückfrage |
| `sudo mx-deploy --zurueck` | letzte Sicherung wiederherstellen (mehrmals: Schritt für Schritt weiter zurück) |

Ziele: `app.html`, `web/`, `tools/` nach `/volumio/http/www3/`, `kioskTV.html` nach `/volumio/http/www/`, `tags/` und
`rotel/rotel-bridge.js` nach `/data/INTERNAL/`; das Skript aktualisiert sich selbst. `tag-service` bzw. `rotel-bridge`
werden nur neu gestartet, wenn sich ihre Dateien geändert haben. Vor jedem Einspielen sichert es die betroffenen Dateien nach
`/data/INTERNAL/mx-deploy/` (die letzten 5). Gelöscht wird nichts; eigene Dateien wie `web/config.local.js` bleiben.

## Tag-Dienst (für den Tag-Editor)
```bash
sudo mkdir -p /data/INTERNAL/tags && sudo cp -r tags/. /data/INTERNAL/tags/
sudo chown -R volumio:volumio /data/INTERNAL/tags
sudo tee /etc/systemd/system/tag-service.service > /dev/null << 'UNIT'
[Unit]
Description=Tag-Dienst fuer app.html
After=network-online.target

[Service]
ExecStart=/usr/local/bin/node /data/INTERNAL/tags/tag-service.js
WorkingDirectory=/data/INTERNAL/tags
Restart=always
User=volumio
# Environment=USE_SUDO=1

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload && sudo systemctl enable tag-service && sudo systemctl start tag-service
curl -s localhost:8766/health
```
Der Dienst schreibt als `volumio` in die Musikdateien. Ob das geht:
`sudo -u volumio touch /mnt/USB/<Musikordner>/.test && sudo rm /mnt/USB/<Musikordner>/.test && echo schreibbar`.
Wenn nicht, `Environment=USE_SUDO=1` einkommentieren (dann läuft nur `tags.py` als root).
Nach einem Update: `sudo systemctl restart tag-service`. Log: `journalctl -u tag-service -e`.
Weitere Variablen: `HTTP_PORT`, `MUSIC_ROOT` (`/mnt`), `PYTHON`, `MPC`, `TAGS_LOG`.

Hinweise: Erlaubt sind nur Dateien unter `/mnt/INTERNAL`, `/mnt/USB`, `/mnt/NAS`. Alte Werte für „Rückgängig“ stehen in
`/data/INTERNAL/tags/changes.jsonl`. Werden die Musikdateien von einem anderen Rechner gespiegelt, überschreibt die nächste
Spiegelung die Änderungen am Player. Der Dienst ist ohne Anmeldung im lokalen Netz erreichbar.

### Cover online suchen
Im Album-Editor sucht „Online suchen“ bei iTunes, Last.fm (mit dem Last.fm-Schlüssel aus `web/config.local.js`) und im
Cover Art Archive (MusicBrainz) nach Album-Interpret (sonst Interpret) und Album, wie sie gerade in den Feldern stehen
(zum Suchen kurz ändern, ohne zu speichern). Die Vorschläge erscheinen
nebeneinander; ein Tipp übernimmt das Bild wie ein gewähltes (einbetten und/oder folder.jpg, mit Rückgängig).
Die Abfragen macht der Tag-Dienst; der Player braucht dafür Internetzugang.

### Bibliotheks-Check
In der Suche oben rechts (Symbol mit Haken, nur wenn der Tag-Dienst läuft): findet Alben ohne Cover, Compilations ohne
einheitlichen Album-Interpreten, Künstler in mehreren Schreibweisen, uneinheitliche Albumnamen/Jahre und Titel ohne
Tracknummer; der Stift öffnet den passenden Editor. Die Prüfung liest die MPD-Datenbank (`MPD_HOST`, `MPD_PORT`, Standard
`localhost:6600`) und die Ordner, ändert nichts an den Dateien und läuft nur auf Knopfdruck. Ergebnis:
`/data/INTERNAL/tags/check.json`, bis neu geprüft wird.

### Webradio: Cover und Senderlogos
Sendet ein Webradio „Künstler - Titel“, sucht der Tag-Dienst das Cover dazu bei iTunes (sonst Deezer) und zeigt es in der
App und auf dem Kiosk-TV; ohne Titel oder ohne Treffer bleibt das Senderlogo. Die Radio-Liste zeigt die Senderlogos
(Adresse aus Volumio, sonst über den Sendernamen von radio-browser.info). Beides speichert der Tag-Dienst unter
`/data/INTERNAL/tags/radio-covers/` und `/data/INTERNAL/tags/stations/`.

### Verlauf und Statistik
In der Suche oben rechts (Uhr-Symbol): **Zuletzt** gespielt (nach Tagen), **Meistgespielt** (Titel, Alben oder Künstler;
30 Tage, 12 Monate oder gesamt), **Statistik** (Wiedergaben, Hörzeit, Verlauf, Tageszeit, Wochentag) und **Rückblick**
(ein Jahr: Summen mit Vergleich zum Vorjahr, Monate und zum Aufklappen Top-Titel, -Alben, -Künstler, -Genres und neu entdeckte Künstler; Tipp auf einen Monatsbalken zeigt die Ranglisten für diesen Monat; Genres aus der Albenliste unten). Antippen spielt
den Titel ab bzw. öffnet Album oder Künstler.

**Entdecken:** Solange in der Suche nichts eingegeben ist, zeigt sie Alben, die um dieses Datum vor einem Jahr liefen
(sonst vor 2, 3 … Jahren), und ein **Zufallsalbum** (Cover tippen spielt ab, Würfel wählt neu). Bevorzugt kommen Alben, die
lange nicht oder nie liefen. Die Albenliste liest der Tag-Dienst aus MPD und speichert sie in
`/data/INTERNAL/tags/albums.json`; sie wird neu gelesen, wenn sich MPDs Datenbank ändert.
Künstlerfotos holt der Tag-Dienst einmal von Deezer und speichert sie unter `/data/INTERNAL/tags/artists/`
(Last.fm liefert keine mehr); ohne Foto erscheint Volumios Künstler-Symbol.

Der Tag-Dienst fragt Volumio alle 5 s (bei Pause/Stopp alle 15 s) nach dem Wiedergabestand (`VOLUMIO_URL`, Standard
`http://localhost:3000`). Ein Titel zählt, wenn er länger als 30 s ist und zur Hälfte oder 4 Minuten lief; Webradio zählt
nicht. Jede Wiedergabe ist eine Zeile in `/data/INTERNAL/tags/plays.jsonl`. Ausschalten: `HISTORY: false` in
`web/config.local.js`, dann den Tag-Dienst neu starten.

**Last.fm:** Zum Scrobbeln braucht der Dienst neben `LASTFM_KEY` auch `LASTFM_SECRET` (das „Shared secret“ auf
https://www.last.fm/api/accounts) in `web/config.local.js`. Dann unter Statistik „Mit Last.fm verbinden“, bei Last.fm
„Zulassen“ und zurück in der App „Fertig“. Danach:
- neue Wiedergaben werden gescrobbelt („läuft gerade“ inklusive); ohne Internet warten sie in einer Warteschlange
  (Last.fm nimmt sie bis zu 14 Tage später noch an),
- der bisherige Last.fm-Verlauf wird einmal eingelesen; „Mit Last.fm abgleichen“ holt später nur Neues. Was schon im
  Verlauf steht (gleicher Titel innerhalb von 5 Minuten), wird nicht doppelt eingetragen.

Der Sitzungsschlüssel liegt in `/data/INTERNAL/tags/lastfm.json` und bleibt auf dem Player. Falls ein anderes
Last.fm-Plugin in Volumio scrobbelt, eines davon abschalten, sonst kommt jeder Titel doppelt bei Last.fm an.

### Stimmungs-Tags
Mit `LASTFM_KEY` holt der Tag-Dienst für jeden Titel der Bibliothek die Last.fm-Tags (`track.getTopTags`, ohne
brauchbare Titel-Tags ersatzweise die Tags des Künstlers) und rechnet sie nach `tags/mood/lastfm_mapping.json` und
`tags/mood/classification_rules.json` in Stimmung, Energie (1–5) und Stil um. Abgefragt wird nur, solange nichts spielt
(Stopp oder Pause; geprüft alle 5 s), mit etwa 4 Anfragen je Sekunde. Die Musikdateien bleiben unverändert; die Rohtags
liegen in `/data/INTERNAL/tags/moodtags/`, die Titelliste dazu in `/data/INTERNAL/tags/library-tracks.json` (entsteht
zusammen mit der Albenliste). Fortschritt und Verteilung zeigt der Bibliotheks-Check unter „Stimmungs-Tags (Last.fm)“.
Ausschalten: `MOODTAGS: false` in `web/config.local.js`, dann den Tag-Dienst neu starten.

**Stimmungs-Mix:** In der Suche (ohne Eingabe) unter „Stimmungs-Mix“ eine Stimmung antippen. Im Blatt lassen sich
mehrere Stimmungen, ein Energie-Bereich und unter „Feinabstimmung“ Stile, Länge und Entdeckungsgrad (nach dem Verlauf:
Favoriten, ausgewogen, versteckte Perlen) wählen. „Mix erstellen“ zeigt nur eine Vorschau; erst „Mix abspielen“ ersetzt
die Warteschlange (das Listensymbol daneben hängt den Mix an). Gibt es weniger als 20 genaue Treffer, nimmt der Mix
Ähnliches dazu (Energie ±1, dann ohne Stil) und sagt das. Derselbe Künstler kommt nie direkt hintereinander.

### Audio-Analyse mit Essentia (optional, auf dem Mac)
[Essentia](https://essentia.upf.edu) hört jeden Titel selbst an und liefert je Titel Tempo (BPM), Tonart, Stimmung
(fröhlich, traurig, entspannt, aggressiv, Party), Tanzbarkeit, Gesang/instrumental, Valenz und Erregung sowie
Discogs-Stile. Für den Player ist das zu viel Rechenarbeit, deshalb läuft `tools/essentia/analyse.py` auf dem Mac und
lädt eine Ergebnisdatei hoch. Der Tag-Dienst nimmt dann Energie, Tempo und Stimmung dieser Titel aus dem Audio,
Last.fm ergänzt weitere Stimmungen und Stile; der Stimmungs-Mix bekommt unter „Feinabstimmung“ einen Tempo-Regler.

Einmalig (macOS 15 oder neuer; Python 3.14 von python.org oder `brew install python@3.14`):
```bash
python3.14 -m venv ~/mx-essentia && source ~/mx-essentia/bin/activate
pip install essentia-tensorflow mutagen
```
Die vortrainierten Modelle (rund 100 MB, Lizenz CC BY-NC-SA 4.0, nur nicht-kommerziell) gehören nicht zum pip-Paket;
das Skript lädt sie beim ersten Lauf nach `~/.cache/mx-essentia`.

Analysieren (erst ein kurzer Probelauf, dann alles; `caffeinate -i` hält den Mac wach):
```bash
source ~/mx-essentia/bin/activate
python3 analyse.py --limit 20 /Volumes/<Platte>/<Musikordner>
caffeinate -i python3 analyse.py /Volumes/<Platte>/<Ordner 1> /Volumes/<Platte>/<Ordner 2>
python3 analyse.py --upload http://<player>:8766
```
- Zugeordnet wird über Künstler und Titel (wie bei den Last.fm-Tags), nicht über den Pfad: Ordnerstruktur und Laufwerk
  auf dem Mac sind egal. Titel, die es auf dem Player nicht gibt, werden dort einfach nicht verwendet.
- Mehrere Ordner lassen sich angeben, Symlinks werden verfolgt; `--exclude "*/Hörbücher/*"` lässt Pfade aus.
- Unveränderte Dateien werden beim nächsten Lauf übersprungen; Ctrl-C bricht ab, der nächste Aufruf macht weiter.
- `--seconds 180` (Standard) hört nur die mittleren drei Minuten an, `--jobs` legt die Zahl paralleler Prozesse fest.
- Die Ergebnisdatei `essentia.jsonl` liegt auf dem Player unter `/data/INTERNAL/tags/` (ersetzt bei jedem Hochladen die
  vorige; alternativ per `scp` dorthin kopieren). Der Bibliotheks-Check zeigt unter „Stimmungs-Tags“, wie viele Titel
  zugeordnet sind.

### Lyrics-Versatz
Laufen synchrone Lyrics konstant zu früh oder zu spät (andere Fassung des Titels), verschieben „−“ und „+“ neben der
Überschrift „Lyrics“ (Bühnenansicht: runde Knöpfe oben rechts) den Text um je 0,5 s. Der Wert gilt für diesen Titel auf
allen Geräten (`/data/INTERNAL/tags/lyrics-offsets.json`); Tippen auf den Wert setzt ihn auf 0 zurück.

## Rotel-Bridge (optional)
`rotel/rotel-bridge.js` nach `/data/INTERNAL/rotel/`, als systemd-Dienst wie oben (Port 8765). In `web/config.local.js`:
```js
window.APP_CONFIG.ROTEL = true;                  // Ein/Aus-Knopf und Verstärker-Lautstärke in der Oberfläche
window.APP_CONFIG.ROTEL_HOST = '192.168.1.50';   // Adresse des Verstärkers, liest die Bridge beim Start
```
Danach die Bridge neu starten. Damit der Verstärker im Standby per Netz einschaltbar ist, dort Power Mode „Quick“ einstellen.
Ohne `ROTEL: true` regelt die Oberfläche die Lautstärke von Volumio (falls dort eingeschaltet).

## TIDAL
Die TIDAL-Teile (Auswahl Lokal/TIDAL in der Suche, ähnliche Künstler bei TIDAL) erscheinen nur, wenn das TIDAL-Plugin in Volumio
aktiv ist. Fest ein- oder ausschalten: `window.APP_CONFIG.TIDAL = true;` bzw. `false` in `web/config.local.js`.

## TIDAL-Wächter (optional)
```bash
sudo mkdir -p /volumio/http/www3/tools && sudo cp tools/tidal-watchdog.sh /volumio/http/www3/tools/
sudo chmod +x /volumio/http/www3/tools/tidal-watchdog.sh
sudo /volumio/http/www3/tools/tidal-watchdog.sh --check      # nur prüfen
echo '*/10 * * * * root /volumio/http/www3/tools/tidal-watchdog.sh' | sudo tee /etc/cron.d/tidal-watchdog
```
Prüft alle 10 Minuten, ob TIDAL antwortet, und startet Volumio sonst neu (höchstens einmal je Stunde). Protokoll:
`/var/log/tidal-watchdog.log`. Ist TIDAL nicht angemeldet, den Wächter nicht einrichten.
