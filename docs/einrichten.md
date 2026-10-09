# Xplorio auf dem Player einrichten

Alle Befehle auf dem Player (ssh), als Benutzer mit `sudo`. Geschrieben für Volumio 2; was unter Volumio 4 anders ist,
steht gesammelt unter [Volumio 4](#volumio-4).

## Oberfläche
`xplorio.html`, `app.html` und `web/` nach `/volumio/http/www3/` kopieren, Aufruf `http://<player>/xplorio.html`
(`app.html` ist der frühere Name und leitet nur weiter; alte Lesezeichen und Home-Bildschirm-Verknüpfungen gehen also weiter).
`kioskTV.html` neben `xplorio.html` (der Kiosk lädt `http://localhost:3000/kioskTV.html`, also aus dem Ordner, den Volumio ausliefert).
Nach einem Update im Browser hart neu laden. Eine vorhandene `web/config.local.js` bleibt erhalten.
Eigene Einstellungen (Rotel, Dienste ein/aus, Sprache) kommen in `web/config.local.js`, Vorlage
`web/config.local.js.example`. Der Last.fm-Zugang gehört nicht dorthin, sondern nach `/data/xplorio/data/keys.json`
(siehe [Last.fm-Zugang](#lastfm-zugang)).

### Hell und dunkel
Die Oberfläche folgt der Einstellung des Geräts (hell oder dunkel) und wechselt mit, wenn das Gerät umschaltet.
Fest einstellen: `THEME: 'light'` oder `'dark'` in `web/config.local.js`; zum Ausprobieren `?theme=light` in der Adresse.
Das gilt auch für die Bühnenansicht auf großen Bildschirmen; nur `kioskTV.html` bleibt immer dunkel.

### Sprache
Die Oberfläche gibt es auf Deutsch und Englisch. Sie übernimmt die Sprache, die in Volumio unter Einstellungen eingestellt
ist; so passen auch die Künstler- und Albumtexte von Volumio dazu. Beim allerersten Aufruf kennt die App diese Sprache noch
nicht, zeigt kurz die Sprache des Geräts (Browser) und lädt einmal neu. Ist die Volumio-Sprache nicht vorhanden, gilt die
Gerätesprache, sonst Englisch. Fest einstellen: `LANGUAGE: 'de'` oder `'en'` in `web/config.local.js`. Zum Ausprobieren geht
auch `http://<player>/xplorio.html?lang=en`.

Weitere Sprache: `web/lang/en.js` kopieren, z. B. als `web/lang/fr.js`, in der letzten Zeile Code, Namen und Locale
anpassen (`langRegister('fr', 'Français', {…}, 'fr-FR')`) und die Texte übersetzen; `{name}` sind Platzhalter und bleiben
stehen, `{one: …, other: …}` sind Einzahl und Mehrzahl. Dann in `web/config.local.js` eintragen:
`LANGUAGES: ['de', 'en', 'fr']`. Fehlt in der Datei ein Text, erscheint er englisch. `xplorio-deploy` lässt eigene
Sprachdateien in `web/lang/` stehen. Datum, Zahlen, Monats- und Wochentagsnamen kommen vom Browser in der gewählten Sprache.

Nicht übersetzt werden Texte, die Volumio selbst liefert (z. B. Menünamen beim Durchsuchen), und Fehlermeldungen des
Tag-Dienstes; die bleiben deutsch.

## Aktualisieren mit xplorio-deploy
Einmal einrichten:
```bash
curl -fsSL https://raw.githubusercontent.com/Celindir69/xplorio/main/tools/xplorio-deploy.sh | sudo tee /usr/local/bin/xplorio-deploy >/dev/null
sudo chmod +x /usr/local/bin/xplorio-deploy
```
Danach auf dem Player:
| Aufruf | Wirkung |
|---|---|
| `sudo xplorio-deploy` | `main` aus xplorio laden, geänderte und neue Dateien zeigen, nach Rückfrage einspielen |
| `sudo xplorio-deploy <branch>` | einen anderen Branch, z. B. zum Testen vor dem Merge |
| `sudo xplorio-deploy -n <branch>` | nur zeigen, was sich ändern würde |
| `sudo xplorio-deploy -y <branch>` | ohne Rückfrage |
| `sudo xplorio-deploy --rollback` | letzte Sicherung wiederherstellen (mehrmals: Schritt für Schritt weiter zurück) |

Ziele: `xplorio.html`, `app.html` (Weiterleitung), `kioskTV.html`, `web/` und `tools/` in jeden vorhandenen Ordner `/volumio/http/www*/`, `tags/` und `rotel/rotel-bridge.js` nach `/data/xplorio/`; das Skript aktualisiert sich selbst.
Welchen der Ordner Volumio ausliefert, hängt von Version und gewählter Oberfläche ab (z. B. klassisch `www`, Volumio 3
`www3`, Volumio 4 `www4`); deshalb bekommen alle vorhandenen die Oberfläche. Neue Ordner legt das Skript nicht an, ohne
einen bricht es ab; `DEPLOY_WWW=<ordner>` wählt einen bestimmten. `web/config.local.js` liegt je Ordner: Wer die
Oberfläche wechselt, kopiert sie mit.

`tag-service` bzw. `rotel-bridge` werden nur neu gestartet, wenn sich ihre Dateien geändert haben. Vor jedem Einspielen
sichert das Skript die betroffenen Dateien nach `/data/xplorio/backup/` (die letzten 5). Gelöscht wird nichts; eigene
Dateien wie `web/config.local.js` bleiben.

Alles außer der Oberfläche liegt in `/data/xplorio/`: `tags/` (Tag-Dienst), `rotel/` (Rotel-Bridge), `data/` (Daten des
Tag-Dienstes) und `backup/` (Sicherungen). Der Ordner übersteht Volumio-Updates; vor einer Neuinstallation genügt es, ihn zu
sichern. Frühere Installationen hatten die Dienste unter `/data/INTERNAL/`: Das Skript stellt `tag-service.service` und
`rotel-bridge.service` dann einmal auf die neuen Pfade um (mit Sicherung) und startet die Dienste neu; der Tag-Dienst zieht
seine Daten selbst um. Die alten Ordner `/data/INTERNAL/tags` und `/data/INTERNAL/rotel` bleiben liegen und können nach
einem Test gelöscht werden.

**Umstieg von web-app-deploy (bis Oktober 2026 hießen Repo und Befehl `volumio-web-app` bzw. `web-app-deploy`):**
`xplorio-deploy` wie oben einrichten, dann `sudo xplorio-deploy -n` (zeigt unter anderem „Umzug: /data/web-app nach
/data/xplorio“) und `sudo xplorio-deploy`. Das Skript verschiebt `/data/web-app` samt Daten, Last.fm-Zugang und
Sicherungen nach `/data/xplorio`, lässt `/data/web-app` als Verweis (Symlink) stehen, stellt die systemd-Dateien um und
startet die Dienste neu. `web-app-deploy` und die noch älteren Namen `mx-deploy` und `volumio4-deploy` funktionieren
weiter und rufen `xplorio-deploy` auf (beim ersten Aufruf richten sie es selbst ein).

## Tag-Dienst (für den Tag-Editor)
```bash
sudo mkdir -p /data/xplorio/tags && sudo cp -r tags/. /data/xplorio/tags/
sudo chown -R volumio:volumio /data/xplorio/tags
sudo mkdir -p /data/xplorio && sudo mkdir -m 700 -p /data/xplorio/data && sudo chown volumio:volumio /data/xplorio/data
sudo tee /etc/systemd/system/tag-service.service > /dev/null << 'UNIT'
[Unit]
Description=Tag-Dienst fuer Xplorio
After=network-online.target

[Service]
ExecStart=/usr/bin/env node /data/xplorio/tags/tag-service.js
WorkingDirectory=/data/xplorio/tags
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
Weitere Variablen: `HTTP_PORT`, `MUSIC_ROOT` (`/mnt`), `PYTHON`, `MPC`, `TAGS_DATA` (Datenordner, Standard `/data/xplorio/data`).

**Datenordner:** Das Programm liegt in `/data/xplorio/tags/`, alles, was der Dienst anlegt (Verlauf, Last.fm-Sitzung,
Check-Ergebnis, Cover, Analyse …), in `/data/xplorio/data/`. Der Ordner ist nur für `volumio` lesbar und liegt weder im
Webordner noch in `/data/INTERNAL`, das Volumio im Netzwerk freigeben kann. Ältere Installationen hatten die Daten neben
dem Programm; der Dienst verschiebt sie beim ersten Start selbst. Fehlt der Ordner und darf der Dienst ihn nicht anlegen,
arbeitet er im alten Ordner weiter; dann einmal
`sudo mkdir -p /data/xplorio && sudo mkdir -m 700 -p /data/xplorio/data && sudo chown volumio:volumio /data/xplorio/data && sudo systemctl restart tag-service`.

### Last.fm-Zugang
API-Key und „Shared secret“ von https://www.last.fm/api/accounts stehen in `/data/xplorio/data/keys.json`; nur der Tag-Dienst
liest sie, die App fragt Last.fm über den Dienst:
```bash
sudo -u volumio tee /data/xplorio/data/keys.json > /dev/null << 'KEYS'
{ "LASTFM_KEY": "DEIN_LASTFM_SCHLUESSEL", "LASTFM_SECRET": "DEIN_SHARED_SECRET" }
KEYS
sudo chmod 600 /data/xplorio/data/keys.json && sudo systemctl restart tag-service
```
Der Key reicht für ähnliche Künstler, Texte, Cover-Suche und Stimmungs-Tags; das Secret braucht nur das Scrobbeln.
Stehen `LASTFM_KEY`/`LASTFM_SECRET` noch in `web/config.local.js` (frühere Versionen), übernimmt der Dienst sie beim
Start nach `keys.json`; danach die beiden Zeilen aus `web/config.local.js` löschen, denn diese Datei kann jeder Browser
im Netz laden. `curl -s localhost:8766/health` zeigt `"keysInWeb":true`, solange sie dort noch stehen.
`tags.py` läuft mit Python 2.7 und 3 und bringt mutagen selbst mit; gibt es kein `python`, nimmt der Dienst `python3`.

Hinweise: Erlaubt sind nur Dateien unter `/mnt/INTERNAL`, `/mnt/USB`, `/mnt/NAS`. Alte Werte für „Rückgängig“ stehen in
`/data/xplorio/data/changes.jsonl`. Werden die Musikdateien von einem anderen Rechner gespiegelt, überschreibt die nächste
Spiegelung die Änderungen am Player. Nach Änderungen liest MPD die betroffenen Ordner neu ein, gesammelt 15 Sekunden
nach der letzten Änderung und nie, solange MPD noch einliest; bei mehr als drei Ordnern ein Scan des gemeinsamen
Elternordners. Solange der Bibliotheks-Check offen ist, wird nur gesammelt und beim Schließen einmal eingelesen
(spätestens 10 Minuten nach der letzten Änderung). Das wirkt nur, wenn MPD nicht selbst mitliest: Steht in
`/etc/mpd.conf` `auto_update "yes"`, scannt MPD jede geänderte Datei sofort, und Volumio baut danach jedes Mal seine
Albumliste neu auf (rund eine Minute Last je Album, bei vielen Alben hintereinander bis zum Hänger). Empfehlung:
`auto_update "no"` (auch in der Vorlage unter `/volumio/app/plugins/music_service/mpd/`, falls dort vorhanden) und
`sudo systemctl restart mpd`; neue Musik dann wie gewohnt mit „Bibliothek aktualisieren“ einlesen (im Volumio-Menü „Aktualisieren“, nicht „Neu
einlesen“, oder mit dem Knopf oben im Bibliotheks-Check; dort gehen auch noch gesammelte Änderungen mit auf). Der Dienst ist ohne Anmeldung im lokalen Netz erreichbar.

### Cover online suchen
Im Album-Editor sucht „Online suchen“ bei iTunes, Last.fm (mit dem Last.fm-Key aus `keys.json`) und im
Cover Art Archive (MusicBrainz) nach Album-Interpret (sonst Interpret) und Album, wie sie gerade in den Feldern stehen
(zum Suchen kurz ändern, ohne zu speichern). Die Vorschläge erscheinen
nebeneinander; ein Tipp übernimmt das Bild wie ein gewähltes (einbetten und/oder folder.jpg, mit Rückgängig).
Die Abfragen macht der Tag-Dienst; der Player braucht dafür Internetzugang.

### Bibliotheks-Check
Im Menü (Zahnrad oben rechts, nur wenn der Tag-Dienst läuft): findet Alben ohne Cover, Compilations ohne
einheitlichen Album-Interpreten, Künstler in mehreren Schreibweisen, uneinheitliche Albumnamen/Jahre und Titel ohne
Tracknummer; der Stift öffnet den passenden Editor. Die Prüfung liest die MPD-Datenbank (`MPD_HOST`, `MPD_PORT`, Standard
`localhost:6600`) und die Ordner, ändert nichts an den Dateien und läuft nur auf Knopfdruck. Ergebnis:
`/data/xplorio/data/check.json`, bis neu geprüft wird. Einträge, deren Stift benutzt wurde, bleiben dort vermerkt und
ausgegraut, auch nach dem Schließen, bis zur nächsten Prüfung.

**Genres:** Zwei weitere Kategorien schlagen je Album genau ein Genre aus den 15 Discogs-Oberkategorien vor (Electronic,
Rock, Jazz, Classical, Pop, Hip Hop, Funk / Soul, Folk, World, & Country, Latin, Reggae, Blues, Stage & Screen,
Non-Music, Children's, Brass & Military).
- *Alben ohne Genre:* Vorschlag aus der Audio-Analyse ([Essentia](#audio-analyse-mit-essentia-optional-auf-dem-mac)), gemittelt über alle Titel
  des Albums. Ohne Audio-Analyse gibt es keinen Vorschlag.
- *Genres zusammenfassen:* Vorhandene Genre-Tags (z. B. „Trip-Hop“, „TripHop“, „Klassik“, „Hörspiel“) ordnet eine Tabelle
  in `tags/genres.js` einer Oberkategorie zu, ebenso die Discogs-Unterstile aus der Audio-Analyse. Bei mehrdeutigen Namen
  („Indie“: Rock oder Pop) entscheidet die Audio-Analyse. Gleiche Änderungen stehen in einer Zeile.

Der Stift öffnet die Mehrfachbearbeitung mit dem Vorschlag; geschrieben wird erst mit Speichern, Rückgängig geht wie
gewohnt. Neben jedem Genre-Feld im Tag-Editor steht eine Auswahl „Hauptgenre“ mit den 15 Oberkategorien; eigene Werte
lassen sich weiter eintippen. Die Unterstile („Trip Hop“, „Downtempo“) kommen nicht in die Dateien, sondern bleiben im Tag-Dienst:
`GET /genres?dir=<Ordner>` liefert Oberkategorie und Unterstile eines Albums (Stand des letzten Checks), ohne `dir` alle.
Klassik, Soundtracks und Hörspiele erkennt das Modell schwächer.

### Webradio: Cover und Senderlogos
Sendet ein Webradio „Künstler - Titel“, sucht der Tag-Dienst das Cover dazu bei iTunes (sonst Deezer) und zeigt es in der
App und auf dem Kiosk-TV; ohne Titel oder ohne Treffer bleibt das Senderlogo. Die Radio-Liste zeigt die Senderlogos
(Adresse aus Volumio, sonst über den Sendernamen von radio-browser.info). Beides speichert der Tag-Dienst unter
`/data/xplorio/data/radio-covers/` und `/data/xplorio/data/stations/`.

### Verlauf und Statistik
Im Menü (Zahnrad oben rechts) unter „Verlauf und Statistik“: **Zuletzt** gespielt (nach Tagen), **Meistgespielt** (Titel, Alben, Künstler oder Genres;
30 Tage, 12 Monate oder gesamt), **Statistik** (Wiedergaben, Hörzeit, Verlauf, Tageszeit, Wochentag, Top-8-Genres; ein Genre antippen öffnet seine Alben) und **Rückblick**
(ein Jahr: Summen mit Vergleich zum Vorjahr, Monate und zum Aufklappen Top-Titel, -Alben, -Künstler, -Genres (antippbar) und neu entdeckte Künstler; Tipp auf einen Monatsbalken zeigt die Ranglisten für diesen Monat; Genres aus der Albenliste unten). Antippen spielt
den Titel ab bzw. öffnet Album oder Künstler.

**Entdecken:** Solange in „Suchen & Entdecken“ nichts eingegeben ist, zeigt die Seite passend zum Reiter Künstler, Alben
oder Titel mehrere Reihen zum Wischen: **Zufällige Entdeckungen** (bevorzugt, was lange nicht oder nie lief; der Würfel
zieht neu), **Vor einem Jahr gehört** (um dieses Datum vor einem Jahr, sonst vor 2, 3 … Jahren), **Lange nicht gehört**
(über ein halbes Jahr her), **Noch nie gehört** und **Früher oft gehört** (oft gehört, aber seit einem halben Jahr nicht
mehr). Leere Reihen fallen weg. Künstler und Album tippen öffnet, Titel tippen spielt ab. Grundlage ist der Verlauf
(siehe oben).

**Nach Stimmung, Energie, Stil und Jahrzehnt:** Unter den Reihen stehen Auswahlknöpfe. Stimmung (Entspannt, Verträumt,
Melancholisch, Düster, Fröhlich, Intensiv, Episch; dieselben Namen wie im Stimmungs-Mix), Energie (Ruhig, Mittlere Energie, Energiegeladen) und Stil (Acoustic, Ambient,
Electronic, Funky, Soulful, Experimental) öffnen wie ein Genre die passenden Alben mit „Alle abspielen“ und Würfel.
Ein Album passt, wenn mindestens die Hälfte seiner eingeordneten Titel diese Stimmung bzw. diesen Stil trägt (ein
Stil-Knopf fasst verwandte Stile zusammen, z. B. Electronic auch Downtempo, House und Trip-Hop) oder wenn die mittlere
Energie im Bereich liegt (Ruhig 1–2, Mittlere Energie 3, Energiegeladen 4–5); es braucht mindestens zwei eingeordnete
Titel. Wie viele Alben passen, hängt von den Stimmungs-Tags ab. Der Stimmungs-Mix bleibt davon getrennt.
Ein Jahrzehnt öffnet seine Alben, nach Jahr sortiert, mit „Alle abspielen“ und Würfel. Das Jahr ist das häufigste
Date-Tag im Albumordner (aus MPD, also der Wert im Tag-Editor); Alben ohne Jahr fehlen dort. Nach dem Update liest
der Tag-Dienst die Albenliste einmal neu, bis dahin fehlen die Jahrzehnte.

**Bewertungen** (nur mit Tag-Dienst): Auf der Künstlerseite markiert ein Herz Lieblingskünstler, im Albumkopf gibt es
ein bis fünf Sterne (den gleichen Stern noch einmal tippen nimmt die Bewertung zurück). Titel haben einen Daumen, in der
Warteschlange und in der Titelliste eines Albums; ein Tipp schaltet weiter von neutral (Umriss) über
„mag ich“ (Daumen hoch) zu „mag ich nicht“ (Daumen runter) und zurück. „Mag ich“ ist dasselbe wie ein Favorit in Volumio:
Der Daumen legt den Titel in die Volumio-Favoriten, und vorhandene Favoriten zeigen den Daumen hoch. Herzen, Sterne und
„mag ich nicht“ speichert der Tag-Dienst in `/data/xplorio/data/ratings.json`. Titel mit „mag ich nicht“ lassen
Würfel, Stimmungs-Mix und die Titel-Reihen beim Entdecken aus.

**Versteckte Perlen** (nur mit Tag-Dienst): Beim Entdecken zeigt die Reihe unter den Zufälligen Entdeckungen Künstler,
Alben oder Titel aus der Mediathek, die nie oder kaum gelaufen sind (Künstler und Alben höchstens zweimal, Titel
höchstens einmal) und zum eigenen Geschmack passen. Den Geschmack bilden Künstler mit Herz, Alben mit 4 oder 5 Sternen,
die Volumio-Favoriten (der Tag-Dienst fragt sie höchstens einmal je Minute bei Volumio ab) und, schwächer, der Verlauf.
Verglichen werden Genre, Stimmung, Stil und Energie aus den Stimmungs-Tags; Titel ohne Stimmungs-Tags kommen in der
Titel-Reihe nicht vor. Ungehörte Alben und Titel von Lieblingskünstlern sind immer dabei. Unter jeder Kachel steht der
Grund: „♥ Ungehört“ (Lieblingskünstler), „Wie …“ (klingt wie ein Lieblingskünstler) oder Stimmung · Genre. Nicht
dabei: Titel mit „mag ich nicht“, Alben, deren Titel überwiegend „mag ich nicht“ tragen, schon bewertete Alben,
Künstler mit Herz und Favoriten. Der Würfel zieht neu. Ohne Bewertungen zählt nur der Verlauf; gibt es auch keinen,
fehlt die Reihe.

**Mehr entdecken:** Unten auf der Künstlerseite (eigene Sammlung) führen Knöpfe weiter: ähnliche Künstler aus der
Sammlung (Last.fm), die Stimmungen und Stile, die mindestens ein Fünftel seiner eingeordneten Titel tragen, seine mittlere
Energie und die Jahrzehnte seiner Alben. Jeder Knopf öffnet wie beim Entdecken den Künstler bzw. die passenden Alben; der
bisherige Weg zählt dabei nicht als Filter. Der Würfel vor den ähnlichen Künstlern startet einen Zufallsmix, in dem
jeder dieser Künstler etwa gleich oft vorkommt, egal wie viel von ihm in der Sammlung liegt.

**Mehr wie dieser Titel:** Ein Tipp auf den Titel in der Wiedergabe (eigene Datei) öffnet bis zu 25 Titel der Sammlung
mit ähnlicher Stimmung und Energie und, mit Audio-Analyse, ähnlichem Tempo (halbes oder doppeltes Tempo zählt als gleich);
Stil und Genre zählen etwas mit. Mindestens eine Stimmung muss übereinstimmen, je Künstler höchstens zwei Titel,
„mag ich nicht“ fällt weg. Jeder Titel zeigt die gemeinsamen Stimmungen, sein Tempo und seine Energie. „Alle abspielen“
spielt die Liste, der Würfel 25 andere ähnliche Titel. Ohne Stimmungsdaten zum Titel erscheint ein Hinweis.

**Zufallsmix:** Neben „Alle abspielen“ (Künstlerseite, Genre-Listen) startet der Würfel 25 zufällige Titel daraus, nie
derselbe Künstler direkt hintereinander. Die Albenliste liest der Tag-Dienst aus MPD und speichert sie in
`/data/xplorio/data/albums.json`; sie wird neu gelesen, wenn sich MPDs Datenbank ändert
(Prüfung höchstens einmal pro Minute; nach Tag-Änderungen gut eine Minute nach dem Scan von selbst).

**Genres:** Der vierte Suchreiter (nur mit Tag-Dienst) zeigt ohne Eingabe Kacheln aller Genres, mit Eingabe die passenden.
Bei mehr als zwölf Genres steht darüber die Reihe „Zufällige Genres“; der Würfel zieht sie neu.
Ein Tipp öffnet die Genre-Seite: Gibt es [Audio-Analysen](#audio-analyse-mit-essentia-optional-auf-dem-mac), zuerst Kacheln
der Stilrichtungen (Discogs-Unterstile, z. B. „Trip Hop“ unter Electronic) mit „Alle“ davor, sonst gleich alle Alben des
Genres, nach Künstler sortiert. Je Album zählen bis zu drei Unterstile seines Genres, gemittelt über die analysierten Titel;
Alben ohne Analyse stehen nur unter „Alle“. Die Suche findet auch Unterstile. Als Genre eines Albums gilt sein
häufigstes Genre-Tag (aus der Albenliste). Auf der Albumseite stehen Künstler, Album und Genre untereinander; Künstler und
Genre öffnen ihre Seite. In Albumlisten steht das Genre klein vor dem Stift. Genre-Tags vereinheitlichen und ergänzen hilft
der [Bibliotheks-Check](#bibliotheks-check).
Künstlerfotos holt der Tag-Dienst einmal von Deezer und speichert sie unter `/data/xplorio/data/artists/`
(Last.fm liefert keine mehr); ohne Foto erscheint Volumios Künstler-Symbol.

Der Tag-Dienst fragt Volumio alle 5 s (bei Pause/Stopp alle 15 s) nach dem Wiedergabestand (`VOLUMIO_URL`, Standard
`http://localhost:3000`). Ein Titel zählt, wenn er länger als 30 s ist und zur Hälfte oder 4 Minuten lief; Webradio zählt
nicht. Jede Wiedergabe ist eine Zeile in `/data/xplorio/data/plays.jsonl`. Ausschalten: `HISTORY: false` in
`web/config.local.js`, dann den Tag-Dienst neu starten.

**Last.fm:** Zum Scrobbeln braucht der Dienst neben `LASTFM_KEY` auch `LASTFM_SECRET` in `/data/xplorio/data/keys.json`
(siehe [Last.fm-Zugang](#lastfm-zugang)). Dann unter Statistik „Mit Last.fm verbinden“, bei Last.fm
„Zulassen“ und zurück in der App „Fertig“. Danach:
- neue Wiedergaben werden gescrobbelt („läuft gerade“ inklusive); ohne Internet warten sie in einer Warteschlange
  (Last.fm nimmt sie bis zu 14 Tage später noch an),
- der bisherige Last.fm-Verlauf wird einmal eingelesen; „Mit Last.fm abgleichen“ holt später nur Neues. Was schon im
  Verlauf steht (gleicher Titel innerhalb von 5 Minuten), wird nicht doppelt eingetragen.

Der Sitzungsschlüssel liegt in `/data/xplorio/data/lastfm.json` und bleibt auf dem Player. Falls ein anderes
Last.fm-Plugin in Volumio scrobbelt, eines davon abschalten, sonst kommt jeder Titel doppelt bei Last.fm an.

### Stimmungs-Tags
Mit `LASTFM_KEY` holt der Tag-Dienst für jeden Titel der Bibliothek die Last.fm-Tags (`track.getTopTags`, ohne
brauchbare Titel-Tags ersatzweise die Tags des Künstlers) und rechnet sie nach `tags/mood/lastfm_mapping.json` und
`tags/mood/classification_rules.json` in Stimmung, Energie (1–5) und Stil um. Abgefragt wird nur, solange nichts spielt
(Stopp oder Pause; geprüft alle 5 s), mit etwa 4 Anfragen je Sekunde. Die Musikdateien bleiben unverändert; die Rohtags
liegen in `/data/xplorio/data/moodtags/`, die Titelliste dazu in `/data/xplorio/data/library-tracks.json` (entsteht
zusammen mit der Albenliste). Fortschritt und Verteilung zeigt der Bibliotheks-Check unter „Stimmungs-Tags (Last.fm)“.
Ausschalten: `MOODTAGS: false` in `web/config.local.js`, dann den Tag-Dienst neu starten.

**Stimmungs-Mix:** Playlisten-Taste, Reiter „Stimmungs-Mix“ (erscheint, sobald der Tag-Dienst läuft). Dort lassen sich
mehrere Stimmungen, ein Energie-Bereich, ein oder mehrere Genres (Genre-Tag des Albums, nie gelockert) und unter „Feinabstimmung“ Stile, Länge, Höchstlänge je Titel (Vorgabe 20 min, hält DJ-Mixe draußen) und Entdeckungsgrad (nach dem Verlauf:
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
python -m pip install essentia-tensorflow mutagen
```
Meldet pip „from versions: none“, gibt es für diesen Mac kein aktuelles Paket. Intel-Mac mit macOS 14: die letzte
Fassung dafür braucht Python 3.13 (`brew install python@3.13`):
```bash
python3.13 -m venv ~/mx-essentia && source ~/mx-essentia/bin/activate
python -m pip install "essentia-tensorflow==2.1b6.dev1389" mutagen
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
- `--seconds 120` (Standard) hört nur die mittleren zwei Minuten an (Valenz/Erregung davon die mittleren 45 s), `--jobs` legt die Zahl paralleler Prozesse fest.
- Dauer: auf einem älteren Intel-Mac rund 9 s je Datei, also etwa 5 Tage für 50.000 Titel; Apple-Silicon-Macs
  sind deutlich schneller. `--profile` zeigt die Zeit je Analyseschritt. Mehr Prozesse als Kerne bringen nichts.
- Ein Hochladen zwischendurch geht jederzeit; der Tag-Dienst nimmt dann den bisherigen Stand.
- Stürzt die Analyse bei einer Datei ab (macOS meldet dann „Python wurde unerwartet beendet“), läuft das Skript weiter
  und trägt die Datei als Fehler ein; `--retry-errors` versucht solche Dateien später erneut. Dateien über 30 Minuten
  (Mitschnitte, DJ-Mixe) lässt es aus, weil sie ganz in den Speicher geladen werden (`--max-minutes`, 0 = alle); sie zählen als „übersprungen“, nicht als Fehler.
- Mit ffmpeg (`brew install ffmpeg`) liest das Skript Dateien, an denen Essentia scheitert: bei einem Lesefehler, bei
  fast leerem Ergebnis und nach einem Absturz (dann die Datei noch einmal einzeln, gleich mit ffmpeg). Es sucht ffmpeg
  selbst (PATH, `/opt/homebrew/bin`, `/usr/local/bin`) und zeigt beim Start, welches es nimmt; `--ffmpeg <pfad>` wählt
  ein anderes, `--ffmpeg aus` schaltet es ab. Bisher fehlgeschlagene Dateien holt `--retry-errors` nach. Mit ffmpeg
  gelesene Titel tragen `"dec":"ffmpeg"` in `essentia.jsonl`.
- Die Ergebnisdatei `essentia.jsonl` liegt auf dem Player unter `/data/xplorio/data/` (ersetzt bei jedem Hochladen die
  vorige; alternativ per `scp` dorthin kopieren). Der Bibliotheks-Check zeigt unter „Stimmungs-Tags“, wie viele Titel
  zugeordnet sind.

### Künstler- und Albumtexte
Die Info-Seite fragt zuerst Volumio. Kommt dort nichts (Volumio 4 gibt die Texte nur mit Abo heraus, oder Volumio antwortet
nicht binnen 6 s), holt die App den Text selbst: Album bei Last.fm (in der Sprache der Oberfläche, sonst englisch; braucht `LASTFM_KEY`),
Künstler bei Last.fm und Wikipedia, erst beide in der Sprache der Oberfläche, dann beide englisch (bei Wikipedia nur Artikel, die nach Musik aussehen). Die Quelle
steht unter dem Text. Für die Mitwirkenden gibt es keinen Ersatz.

Zum laufenden Titel sucht die App in derselben Reihenfolge einen eigenen Text (Last.fm `track.getInfo`, dann ein
Wikipedia-Artikel, dessen Name der Liedname ist, der sich als Lied, Single oder Song beschreibt und den Interpreten nennt).
Zusätze wie „(Remastered 2011)“ werden dafür weggelassen. Nur wenn etwas gefunden wird, erscheint der Reiter „Titel“
hinter „Album“, beim Webradio als erster Reiter. Das Ergebnis, auch „nichts gefunden“, merkt sich der Browser je Titel (die letzten 400).
Ist die App über `LANGUAGE` oder `?lang=` auf eine andere Sprache gestellt als Volumio, holt sie die Texte zuerst selbst und fragt Volumio
nur, wenn dabei nichts herauskommt (Volumio liefert seine Texte in der eigenen Sprache).

### Lyrics-Versatz
Laufen synchrone Lyrics konstant zu früh oder zu spät (andere Fassung des Titels), verschieben „−“ und „+“ neben der
Überschrift „Lyrics“ (Bühnenansicht: runde Knöpfe oben rechts) den Text um je 0,5 s. Der Wert gilt für diesen Titel auf
allen Geräten (`/data/xplorio/data/lyrics-offsets.json`); Tippen auf den Wert setzt ihn auf 0 zurück.

## Rotel-Bridge (optional)
`rotel/rotel-bridge.js` nach `/data/xplorio/rotel/`, als systemd-Dienst wie oben (Port 8765). In `web/config.local.js`:
```js
window.APP_CONFIG.ROTEL = true;                  // Ein/Aus-Knopf und Verstärker-Lautstärke in der Oberfläche
window.APP_CONFIG.ROTEL_HOST = '192.168.1.50';   // Adresse des Verstärkers, liest die Bridge beim Start
```
Danach die Bridge neu starten. Damit der Verstärker im Standby per Netz einschaltbar ist, dort Power Mode „Quick“ einstellen.
Ohne `ROTEL: true` regelt die Oberfläche die Lautstärke von Volumio (falls dort eingeschaltet).

## Streamingdienste (TIDAL, Qobuz, HIGHRESAUDIO, Spotify)
Die Teile für Streamingdienste (Kästchen in der Suche, ähnliche Künstler beim Dienst in den Infos, Künstler- und
Albumseiten des Dienstes) erscheinen nur, wenn das jeweilige Plugin in Volumio aktiv ist. Fest ein- oder ausschalten:
`window.APP_CONFIG.TIDAL = true;` bzw. `false` (ebenso `QOBUZ`, `HRA`, `SPOTIFY`) in `web/config.local.js`. Sind
mehrere Dienste aktiv, zeigt die Suche ihre Treffer in eigenen Abschnitten. Spotify braucht Volumios Spotify-Plugin
mit Suche (Premium-Konto); Spotify Connect allein bringt keine Suche mit. Der TIDAL-Wächter unten gilt nur für TIDAL.

## TIDAL-Wächter (optional)
```bash
sudo mkdir -p /volumio/http/www3/tools && sudo cp tools/tidal-watchdog.sh /volumio/http/www3/tools/
sudo chmod +x /volumio/http/www3/tools/tidal-watchdog.sh
sudo /volumio/http/www3/tools/tidal-watchdog.sh --check      # nur prüfen
echo '*/10 * * * * root /volumio/http/www3/tools/tidal-watchdog.sh' | sudo tee /etc/cron.d/tidal-watchdog
```
Prüft alle 10 Minuten, ob TIDAL antwortet, und startet Volumio sonst neu (höchstens einmal je Stunde). Protokoll:
`/var/log/tidal-watchdog.log`. Ist TIDAL nicht angemeldet, den Wächter nicht einrichten.

## Endlos-Wiedergabe (AutoDJ)
Mit dem Plugin [autodj-plugin](https://github.com/Celindir69/autodj-plugin) (ab Version 1.1) bekommt der
Wiederholen-Knopf einen vierten Zustand: aus → alle → einer → ∞. Bei ∞ ist Wiederholen aus und AutoDJ an; es hängt
ähnliche Titel an, sobald die Warteschlange zur Neige geht. Der nächste Tipp schaltet AutoDJ wieder aus. Auch in
Volumio umgeschaltet zeigt der Knopf den Zustand (spätestens nach 30 s). Ohne Plugin oder ohne Last.fm-Key in den
Plugin-Einstellungen bleibt es bei drei Zuständen.

## Volumio 4
Die Oberfläche läuft auch unter Volumio 4 (auf einer Testinstanz erprobt). Unterschiede zu Volumio 2:

- **Ordner:** Volumio 4 liefert die Oberfläche aus `/volumio/http/www4/` statt `www3/`. Aufruf weiter
  `http://<player>/xplorio.html`; `web/config.local.js` gehört nach `/volumio/http/www4/web/`.
- **Aktualisieren:** wie oben mit [xplorio-deploy](#aktualisieren-mit-xplorio-deploy); es findet `www4/` selbst. Beim
  ersten Mal erst ansehen: `sudo xplorio-deploy -n` („geändert“ hieße, eine Datei von Volumio würde ersetzt). In der
  Meldung „Eingespielt nach …“ muss `www4` stehen.
- **Tag-Dienst:** Die Dienstdatei oben startet Node über `/usr/bin/env node` und läuft damit auf beiden Versionen. Eine
  ältere Dienstdatei mit `/usr/local/bin/node` scheitert unter Volumio 4 mit `status=203/EXEC`; dann:
  `sudo sed -i 's|^ExecStart=/usr/local/bin/node|ExecStart=/usr/bin/env node|' /etc/systemd/system/tag-service.service && sudo systemctl daemon-reload && sudo systemctl restart tag-service`.
  Python 3 ist dabei, mutagen bringt der Tag-Dienst mit.
- **Infotexte:** Volumio 4 liefert Künstler- und Albumtexte nur mit Abo; die App holt sie dann bei Last.fm und Wikipedia
  (siehe [Künstler- und Albumtexte](#künstler--und-albumtexte)). Mit `LASTFM_KEY` in `/data/xplorio/data/keys.json` gibt es
  auch Albumtexte.
- **Nicht erprobt unter Volumio 4:** `kioskTV.html` (Kiosk-Ordner), Rotel-Bridge und TIDAL-Wächter (der Wächter liegt dort
  unter `/volumio/http/www4/tools/`; den Pfad im Cron-Eintrag entsprechend anpassen).
