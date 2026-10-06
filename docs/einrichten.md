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

### Verlauf und Statistik
In der Suche oben rechts (Uhr-Symbol): **Zuletzt** gespielt (nach Tagen), **Meistgespielt** (Titel, Alben oder Künstler;
30 Tage, 12 Monate oder gesamt) und **Statistik** (Wiedergaben, Hörzeit, Verlauf, Tageszeit, Wochentag). Antippen spielt
den Titel ab bzw. öffnet Album oder Künstler.
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
