# volumio-web-app

[English version](README_EN.md)

Eigene Weboberfläche für Volumio 2 (gebaut für einen Musical Fidelity MX-Stream, Raspberry-Pi-CM3), läuft ohne Build-Schritt
direkt im Browser. Auf Volumio 4 läuft sie ebenfalls (Unterschiede siehe [Einrichtung](docs/einrichten.md#volumio-4)). Auf Volumio 3 vermutlich auch, wurde aber nicht getestet. 
Zusätzlich zu den Dateien, die auf dem Player laufen, enthält diese Repository nur Tests (`tests/`) und die Einrichtungs-Doku;
`mx-deploy` bzw. `volumio4-deploy` spielt nur die Laufzeitdateien ein.

<p align="center">
  <img src="docs/bilder/display-ipad.jpg" width="820" alt="Display-Layout auf dem iPad: Cover, Albuminfos und mitlaufende Lyrics">
</p>

Alle Bilder in dieser Datei zeigen eine erfundene Beispiel-Bibliothek (Künstler, Cover und Texte sind ausgedacht). Sie zeigen nicht immer den aktuellen Stand der Entwicklung. Manche Features wurden zwischenzeitlich verschoben oder erweitert.

Entwickelt mit KI (Claude code https://claude.ai)

## Funktionen

### Wiedergabe, Lyrics und Infos
Großes Cover, Titel und Album, Abzeichen für die Klangqualität (Hi-Res, Abtastrate, Bittiefe, Format), Fortschritt,
Lautstärke und die üblichen Knöpfe. Die Hintergrundfarbe und der Akzent kommen aus dem Cover. Lyrics laufen synchron mit
(lrclib.net); passt der Text nicht genau zur Aufnahme, verschieben „−“ und „+“ ihn in Schritten von 0,5 s, und der Wert
gilt dann für diesen Titel auf allen Geräten. Die Info-Seite zeigt Album, Künstler, Mitwirkende und was von diesem
Künstler in der Sammlung liegt. Liefert Volumio keinen Album- oder Künstlertext (Volumio 4 nur mit Abo), holt die App
ihn bei Last.fm bzw. Wikipedia. Gibt es dort einen Text zum laufenden Titel (meist bei Singles), erscheint zusätzlich
ein Reiter „Titel“.

<p>
  <img src="docs/bilder/wiedergabe.jpg" width="200" alt="Wiedergabe">
  <img src="docs/bilder/lyrics.jpg" width="200" alt="Synchrone Lyrics">
  <img src="docs/bilder/info.jpg" width="200" alt="Albuminfos">
  <img src="docs/bilder/warteschlange.jpg" width="200" alt="Warteschlange">
</p>

### Display-Layout für iPad, Desktop und Fernseher
Auf großen Bildschirmen stehen Cover, Infos und Steuerung links und die Lyrics rechts; die Infos blättern von selbst
weiter. Umschalten oben rechts oder mit `?layout=stage`. `kioskTV.html` ist eine reine Anzeige für einen Fernseher an
der Anlage, ohne Bedienung.

<p>
  <img src="docs/bilder/display-desktop.jpg" width="49%" alt="Display-Layout am Desktop">
  <img src="docs/bilder/kiosk.jpg" width="49%" alt="kioskTV.html">
</p>

### Suche und Entdecken
Die Suche findet Künstler, Alben, Titel und Genres (je Genre die Stilrichtungen aus der Audio-Analyse und alle Alben) in der eigenen Bibliothek und bei den Streamingdiensten, die in Volumio
eingerichtet sind (TIDAL, Qobuz, HIGHRESAUDIO, Spotify (bisher ungetestet)), jeweils in eigenen Abschnitten mit Kästchen zum Ein- und Ausblenden. Solange nichts
eingegeben ist, zeigt sie passend zum Reiter „Vor einem Jahr gehört“ (Künstler, Alben oder Titel, die um dieses Datum vor
einem Jahr liefen) und einen Zufallskünstler, ein Zufallsalbum oder einen Zufallstitel, bevorzugt lange nicht oder nie Gehörtes. Bei Webradio holt die App ein Cover
zum laufenden Titel und zeigt Senderlogos in der Senderliste.

### Stimmungs-Mix
Eigener erster Reiter neben Playlisten und Radio (Playlisten-Taste). Stimmung wählen (mehrere möglich), Energie von ruhig bis kraftvoll eingrenzen, auf Genres beschränken und unter „Feinabstimmung“ Stile, Länge
und Entdeckungsgrad festlegen: Favoriten, ausgewogen oder versteckte Perlen, je nach eigenem Verlauf. „Mix erstellen“
zeigt erst eine Vorschau mit der Begründung je Titel; einzelne Titel lassen sich herausnehmen oder neu mischen. Erst
„Mix abspielen“ ersetzt die Warteschlange. Grundlage sind Last.fm-Tags je Titel, die der Tag-Dienst sammelt, solange
nichts spielt; die Musikdateien bleiben dabei unverändert. Optional hört Essentia auf dem Mac jeden Titel an
(`tools/essentia/`): Dann kommen Energie und Stimmung aus dem Audio, und ein Tempo-Regler (BPM) kommt dazu.

<p>
  <img src="docs/bilder/entdecken.jpg" width="200" alt="Entdecken in der Suche">
  <img src="docs/bilder/mix-auswahl.jpg" width="200" alt="Stimmungs-Mix: Auswahl">
  <img src="docs/bilder/mix-vorschau.jpg" width="200" alt="Stimmungs-Mix: Vorschau">
</p>

### Verlauf, Statistik und Rückblick
Der Tag-Dienst schreibt mit, was läuft, und kann zu Last.fm scrobbeln sowie den bisherigen Last.fm-Verlauf einlesen.
Daraus entstehen „Zuletzt gehört“, Ranglisten (Titel, Alben, Künstler, Genres), Statistiken nach Tag, Tageszeit, Wochentag und Genre
und ein Jahresrückblick mit Vergleich zum Vorjahr, Top-Genres und neu entdeckten Künstlern. Tippen auf einen Monat zeigt
die Ranglisten für diesen Monat.

<p>
  <img src="docs/bilder/menue.jpg" width="200" alt="Menü hinter dem Zahnrad">
  <img src="docs/bilder/verlauf.jpg" width="200" alt="Zuletzt gehört">
  <img src="docs/bilder/statistik.jpg" width="200" alt="Statistik">
  <img src="docs/bilder/rueckblick.jpg" width="200" alt="Jahresrückblick">
</p>

### Tag-Editor und Bibliotheks-Check
Tags einzelner Titel, ganzer Alben oder aller Titel eines Künstlers bearbeiten, mit Textfunktionen wie Groß-/Kleinschreibung,
Rückgängig und Cover (Datei wählen, online suchen, eingebettetes Cover als `folder.jpg`). Der Bibliotheks-Check findet
Alben ohne Cover, fehlende oder uneinheitliche Album-Interpreten, Künstler in mehreren Schreibweisen, uneinheitliche
Albumnamen oder Jahre und Titel ohne Tracknummer und schlägt je Album ein Genre vor (Discogs-Oberkategorien, aus
vorhandenen Genre-Tags und der Audio-Analyse); jeder Eintrag öffnet direkt den passenden Editor und bleibt danach bis zur nächsten Prüfung ausgegraut. Dort steht auch der
Fortschritt der Stimmungs-Tags.

<p>
  <img src="docs/bilder/tag-editor.jpg" width="200" alt="Tag-Editor">
  <img src="docs/bilder/check.jpg" width="200" alt="Bibliotheks-Check">
  <img src="docs/bilder/stimmungs-tags.jpg" width="200" alt="Stimmungs-Tags im Bibliotheks-Check">
</p>

### Weiteres
- Menü hinter dem Zahnrad oben rechts: Verlauf und Statistik, Bibliotheks-Check, Bibliothek aktualisieren und die
  originale Volumio-Oberfläche (Durchsuchen, Warteschlange, Einstellungen, Plugins).
- Hell und dunkel, nach der Einstellung des Geräts oder fest eingestellt.
- Deutsch und Englisch, wie in Volumio eingestellt oder fest eingestellt; weitere Sprachen als Datei in `web/lang/`
  (siehe [Einrichten](docs/einrichten.md#sprache)).
- Optional: Rotel-Verstärker im Netz (Ein/Aus, Lautstärke, Eingang) über `rotel/rotel-bridge.js`.
- TIDAL-Wächter: verbindet TIDAL neu bzw. startet Volumio neu, wenn das TIDAL-Plugin hängt. 
  (Was auf meinem MX-Stream, aufgrund eines Session-Timeouts, etwa nach 4 Stunden ohne Tidal-Nutzung auftritt.)
- `mx-deploy`: aktualisiert direkt auf dem Player aus diesem Repository, mit Sicherung und `--zurueck`; auf Volumio 4
  dasselbe Skript als `volumio4-deploy`.

## Aufbau

| Datei / Ordner | Inhalt | Ort auf dem Player |
|---|---|---|
| `app.html` + `web/` | Oberfläche für Handy, iPad, Desktop (Wiedergabe, Queue, Suche lokal und bei Streamingdiensten, Lyrics, Infos, Tag-Editor, Stimmungs-Mix, Verlauf, Display-Layout für große Bildschirme) | `/volumio/http/www3/` (Volumio 4: `www4/`) |
| `kioskTV.html` | Seite für einen Kiosk-Bildschirm (Cover, Titel, Lyrics) | `/volumio/http/www/` |
| `tags/` | Tag-Dienst (Port 8766): Tag-Editor, Bibliotheks-Check, Verlauf, Stimmungs-Tags, Cover; Python 2.7 oder 3 mit mitgelieferter mutagen-Bibliothek (GPLv2, siehe `tags/vendor/mutagen/COPYING`) | `/data/INTERNAL/tags/` (Daten: `/data/web-app/data/`) |
| `rotel/rotel-bridge.js` | optional: HTTP-Dienst (Port 8765) für einen Rotel-Verstärker im Netz (Lautstärke, Ein/Aus, Eingang) | `/data/INTERNAL/rotel/` |
| `tools/tidal-watchdog.sh`, `tools/tidal-reconnect.js` | startet Volumio neu bzw. verbindet TIDAL neu, wenn das TIDAL-Plugin hängt (nur unter Volumio 2 erprobt) | `/volumio/http/www3/tools/` |
| `tools/mx-deploy.sh` | aktualisiert den Player aus diesem Repository (`mx-deploy`, auf Volumio 4 `volumio4-deploy`) | `/usr/local/bin/` |
| `tools/essentia/` | optionale Audio-Analyse auf dem Mac, Ergebnis wird zum Tag-Dienst hochgeladen | nicht auf dem Player |

Voraussetzungen: Volumio 2 (Node 8, Python 2.7, `mpc`) oder Volumio 4 (Node und Python 3 sind dabei). Einrichtung:
[docs/einrichten.md](docs/einrichten.md). Aktualisieren direkt auf dem Player: `sudo mx-deploy` bzw. `sudo volumio4-deploy`
(`tools/mx-deploy.sh`, siehe dort).

Rotel-Verstärker und TIDAL-Wächter sind optional (siehe Einrichtung). 
Eigene Einstellungen (Sprache, Rotel, Dienste ein/aus) gehören in `web/config.local.js`
(Vorlage `web/config.local.js.example`); diese Datei ist nicht im Repository. Der Last.fm-Zugang (für ähnliche Künstler,
Stimmungs-Tags, Infotexte und Scrobbeln) liegt in `/data/web-app/data/keys.json` und wird nur vom Tag-Dienst gelesen.

## Tests
`node tests/run-all.js` (Node 18 oder neuer, keine Abhängigkeiten; der Tag-Dienst-Test braucht zusätzlich Python).

Lizenz: MIT (siehe `LICENSE`), ausgenommen die mitgelieferte Bibliothek in `tags/vendor/mutagen/` (GPLv2, eigene `COPYING`).
