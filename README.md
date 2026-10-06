# volumio-web-app

Eigene Weboberfläche für Volumio 2 (gebaut für einen Musical Fidelity MX-Stream, Raspberry-Pi-CM3), läuft ohne Build-Schritt
direkt im Browser. Neben den Dateien, die auf dem Player laufen, enthält es nur Tests (`tests/`) und die Einrichtungs-Doku;
`mx-deploy` spielt nur die Laufzeitdateien ein.

| Datei / Ordner | Inhalt | Ort auf dem Player |
|---|---|---|
| `app.html` + `web/` | Oberfläche für Handy, iPad, Desktop (Wiedergabe, Queue, Suche lokal und TIDAL, Lyrics, Infos, Tag-Editor, Display-Layout für große Bildschirme) | `/volumio/http/www3/` |
| `kioskTV.html` | Seite für einen Kiosk-Bildschirm (Cover, Titel, Lyrics) | `/volumio/http/www/` |
| `tags/` | Tag-Dienst (Port 8766) für den Tag-Editor; Python 2.7 mit mitgelieferter mutagen-Bibliothek (GPLv2, siehe `tags/vendor/mutagen/COPYING`) | `/data/INTERNAL/tags/` |
| `rotel/rotel-bridge.js` | optional: HTTP-Dienst (Port 8765) für einen Rotel-Verstärker im Netz (Lautstärke, Ein/Aus, Eingang) | `/data/INTERNAL/rotel/` |
| `tools/tidal-watchdog.sh`, `tools/tidal-reconnect.js` | startet Volumio neu bzw. verbindet TIDAL neu, wenn das TIDAL-Plugin hängt | `/volumio/http/www3/tools/` |

Voraussetzungen: Volumio 2 (Node 8, Python 2.7, `mpc`). Einrichtung: [docs/einrichten.md](docs/einrichten.md).
Aktualisieren direkt auf dem Player: `sudo mx-deploy` (`tools/mx-deploy.sh`, siehe dort).

Rotel-Verstärker und TIDAL sind optional (siehe Einrichtung). Eigene Einstellungen (z. B. ein Last.fm-Schlüssel für ähnliche Künstler) gehören in `web/config.local.js`
(Vorlage `web/config.local.js.example`); diese Datei ist nicht im Repository.

## Tests
`node tests/run-all.js` (Node 18 oder neuer, keine Abhängigkeiten; der Tag-Dienst-Test braucht zusätzlich Python).

Lizenz: MIT (siehe `LICENSE`), ausgenommen die mitgelieferte Bibliothek in `tags/vendor/mutagen/` (GPLv2, eigene `COPYING`).
