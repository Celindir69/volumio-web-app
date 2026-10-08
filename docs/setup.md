# Setting Up on the Player

All commands are run on the player (via SSH), as a user with `sudo` privileges. Written for Volumio 2; everything that differs under Volumio 4 is collected under #volumio-4.

## Interface

Copy `app.html` and `web/` to `/volumio/http/www3/`, then open `http://<player>/app.html`.

Copy `kioskTV.html` to `/volumio/http/www/` (the Volumio kiosk gets its files from `www/`).

After an update, perform a hard reload in the browser. An existing `web/config.local.js` is preserved.

Custom settings (Last.fm key, Rotel, enabling/disabling services) go into `web/config.local.js`; use `web/config.local.js.example` as the template.

### Language

The interface is available in German and English. It follows the device (browser) language; if neither matches, it is
shown in English. To fix the language, set `LANGUAGE: 'de'` or `'en'` in `web/config.local.js`. For a quick test,
`http://<player>/app.html?lang=en` also works.

Adding a language: copy `web/lang/en.js`, e.g. to `web/lang/fr.js`, adjust code, name and locale in the last line
(`langRegister('fr', 'Français', {…}, 'fr-FR')`) and translate the texts; `{name}` are placeholders and stay as they are,
`{one: …, other: …}` are singular and plural. Then add it in `web/config.local.js`: `LANGUAGES: ['de', 'en', 'fr']`.
Texts missing from the file are shown in English. `mx-deploy` leaves your own language files in `web/lang/` in place.
Dates, numbers, month and weekday names come from the browser in the selected language.

Not translated: texts that Volumio itself delivers (e.g. menu names when browsing) and error messages from the tag
service; these stay German.

## Updating with mx-deploy

Set it up once:

```bash
curl -fsSL https://raw.githubusercontent.com/Celindir69/volumio-web-app/main/tools/mx-deploy.sh | sudo tee /usr/local/bin/mx-deploy >/dev/null
sudo chmod +x /usr/local/bin/mx-deploy
```

Then on the player:

| Command | Effect |
|---|---|
| `sudo mx-deploy` | fetch `main` from volumio-web-app, show changed and new files, and deploy them after confirmation |
| `sudo mx-deploy <branch>` | use a different branch, e.g. for testing before merging |
| `sudo mx-deploy -n <branch>` | only show what would change |
| `sudo mx-deploy -y <branch>` | deploy without confirmation |
| `sudo mx-deploy --zurueck` | restore the latest backup (repeat to go back step by step) |

Targets: `app.html`, `web/`, and `tools/` go to `/volumio/http/www3/`, `kioskTV.html` goes to `/volumio/http/www/`, and `tags/` plus `rotel/rotel-bridge.js` go to `/data/INTERNAL/`; the script also updates itself. `tag-service` and `rotel-bridge` are restarted only if their files have changed. Before each deployment, the script backs up the affected files to `/data/INTERNAL/mx-deploy/` (the latest 5 backups). Nothing is deleted; custom files such as `web/config.local.js` are preserved.

On Volumio 4, use the same script under the name `volumio4-deploy`; see #volumio-4.

## Tag Service (for the Tag Editor)

```bash
sudo mkdir -p /data/INTERNAL/tags && sudo cp -r tags/. /data/INTERNAL/tags/
sudo chown -R volumio:volumio /data/INTERNAL/tags
sudo tee /etc/systemd/system/tag-service.service > /dev/null << 'UNIT'
[Unit]
Description=Tag-Dienst fuer app.html
After=network-online.target

[Service]
ExecStart=/usr/bin/env node /data/INTERNAL/tags/tag-service.js
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

The service writes to music files as the `volumio` user. To check whether this works:

`sudo -u volumio touch /mnt/USB/<MusicFolder>/.test && sudo rm /mnt/USB/<MusicFolder>/.test && echo writable`.

If it does not work, uncomment `Environment=USE_SUDO=1` (then only `tags.py` runs as root).

After an update: `sudo systemctl restart tag-service`. Log: `journalctl -u tag-service -e`.

Additional variables: `HTTP_PORT`, `MUSIC_ROOT` (`/mnt`), `PYTHON`, `MPC`, `TAGS_LOG`.

`tags.py` runs with Python 2.7 and 3 and includes mutagen itself; if there is no `python` command, the service uses `python3`.

Notes: Only files under `/mnt/INTERNAL`, `/mnt/USB`, and `/mnt/NAS` are allowed. Previous values for "Undo" are stored in `/data/INTERNAL/tags/changes.jsonl`. If the music files are mirrored from another computer, the next synchronization will overwrite the changes made on the player. The service is accessible on the local network without authentication.

### Search for Cover Art Online

In the Album Editor, "Search Online" searches iTunes, Last.fm (using the Last.fm key from `web/config.local.js`), and the Cover Art Archive (MusicBrainz) for the album artist (otherwise the artist) and album currently entered in the fields. You can temporarily change the fields for searching without saving them.

Suggestions appear side by side; tapping one applies the image just like a manually selected image (embed and/or `folder.jpg`, with Undo support).

The Tag Service performs the queries; the player therefore needs internet access.

### Library Check

In the search area at the top right (checkmark icon, only available while the Tag Service is running): finds albums without cover art, compilations without a consistent album artist, artists with multiple spellings, inconsistent album names/years, and tracks without track numbers; the pencil icon opens the appropriate editor.

The check reads the MPD database (`MPD_HOST`, `MPD_PORT`, default `localhost:6600`) and the folders, does not modify any files, and only runs when triggered manually. Result: `/data/INTERNAL/tags/check.json`, retained until the next check.

### Web Radio: Cover Art and Station Logos

If a web radio station broadcasts "Artist - Title", the Tag Service searches iTunes for the corresponding cover art (falling back to Deezer) and displays it in the app and on the kiosk TV; if no title is available or no match is found, the station logo remains.

The radio list displays the station logos using the address provided by Volumio, otherwise by looking up the station name via radio-browser.info. The Tag Service stores both under `/data/INTERNAL/tags/radio-covers/` and `/data/INTERNAL/tags/stations/`.

### History and Statistics

In the search area at the top right (clock icon): **Recently Played** (by day), **Most Played** (tracks, albums, or artists; 30 days, 12 months, or all time), **Statistics** (plays, listening time, history, time of day, weekday), and **Review** (one year: totals compared with the previous year, months, plus expandable top tracks, albums, artists, genres, and newly discovered artists; tapping a monthly bar displays the rankings for that month; genres are taken from the album list below).

Tapping plays the track or opens the album or artist.

**Discover:** As long as nothing has been entered in the search field, it displays artists, albums, or tracks appropriate to the selected tab that were played around this date one year ago (otherwise 2, 3, etc. years ago), plus a **Random Artist**, **Random Album**, or **Random Track** (tap artist or album to open it, tap a track to play it, and tap the dice to select a new one). Items that have not been played for a long time or have never been played are preferred.

The Tag Service reads the album list from MPD and stores it in `/data/INTERNAL/tags/albums.json`; it is re-read when the MPD database changes.

The Tag Service fetches artist images once from Deezer and stores them under `/data/INTERNAL/tags/artists/` (Last.fm no longer provides them); if no image is available, Volumio's artist icon is shown.

The Tag Service checks Volumio every 5 seconds (every 15 seconds while paused/stopped) for playback status (`VOLUMIO_URL`, default `http://localhost:3000`). A track counts if it is longer than 30 seconds and has been played either halfway through or for 4 minutes; web radio does not count.

Each play is stored as one line in `/data/INTERNAL/tags/plays.jsonl`. To disable it: set `HISTORY: false` in `web/config.local.js`, then restart the Tag Service.

**Last.fm:** For scrobbling, the service needs not only `LASTFM_KEY` but also `LASTFM_SECRET` (the "Shared secret" from https://www.last.fm/api/accounts) in `web/config.local.js`. Then, under Statistics, select "Connect to Last.fm", choose "Allow" on Last.fm, and then return to the app and select "Done". After that:

- new plays are scrobbled (including "now playing"); without an internet connection, they wait in a queue (Last.fm still accepts them up to 14 days later),
- the existing Last.fm history is imported once; "Sync with Last.fm" only fetches new entries later. Anything already in the history (same track within 5 minutes) is not added twice.

The session key is stored in `/data/INTERNAL/tags/lastfm.json` and remains on the player. If another Last.fm plugin in Volumio is also scrobbling, disable one of them, otherwise every track will be submitted to Last.fm twice.

### Mood Tags

With `LASTFM_KEY`, the Tag Service retrieves the Last.fm tags for every track in the library (`track.getTopTags`, falling back to the artist's tags if no useful track tags are available) and maps them to mood, energy (1–5), and style according to `tags/mood/lastfm_mapping.json` and `tags/mood/classification_rules.json`.

Queries are only made while nothing is playing (stopped or paused; checked every 5 seconds), at around 4 requests per second. The music files remain unchanged; the raw tags are stored in `/data/INTERNAL/tags/moodtags/`, and the associated track list is stored in `/data/INTERNAL/tags/library-tracks.json` (generated together with the album list).

Progress and distribution are shown in the Library Check under "Mood Tags (Last.fm)".

To disable it: set `MOODTAGS: false` in `web/config.local.js`, then restart the Tag Service.

**Mood Mix:** Playlist button, "Mood Mix" tab (appears as soon as the Tag Service is running). Here you can select multiple moods, an energy range, and, under "Fine Tuning", styles, length, and discovery level (based on playback history: favorites, balanced, hidden gems).

"Create Mix" only shows a preview; only "Play Mix" replaces the queue (the list icon next to it appends the mix instead). If there are fewer than 20 exact matches, the mix also includes similar tracks (energy ±1, then without style) and indicates this. The same artist is never played twice in a row.

### Audio Analysis with Essentia (Optional, on the Mac)

[Essentia](https://essentia.upf.edu) analyzes each track's audio directly and provides tempo (BPM), key, mood (happy, sad, relaxed, aggressive, party), danceability, vocal/instrumental classification, valence and arousal, as well as Discogs styles.

This requires too much processing power for the player, so `tools/essentia/analyse.py` runs on the Mac and uploads a results file. The Tag Service then uses the audio-derived energy, tempo, and mood values for those tracks, while Last.fm adds additional moods and styles; the Mood Mix then gets a tempo control under "Fine Tuning".

One-time setup (macOS 15 or later; Python 3.14 from python.org or `brew install python@3.14`):

```bash
python3.14 -m venv ~/mx-essentia && source ~/mx-essentia/bin/activate
python -m pip install essentia-tensorflow mutagen
```

If pip reports "from versions: none", there is no current package for that Mac. On an Intel Mac running macOS 14, the latest compatible version requires Python 3.13 (`brew install python@3.13`):

```bash
python3.13 -m venv ~/mx-essentia && source ~/mx-essentia/bin/activate
python -m pip install "essentia-tensorflow==2.1b6.dev1389" mutagen
```

The pretrained models (around 100 MB, licensed under CC BY-NC-SA 4.0, non-commercial use only) are not included in the pip package; the script downloads them to `~/.cache/mx-essentia` on the first run.

Run the analysis (first a short test run, then everything; `caffeinate -i` keeps the Mac awake):

```bash
source ~/mx-essentia/bin/activate
python3 analyse.py --limit 20 /Volumes/<Drive>/<MusicFolder>
caffeinate -i python3 analyse.py /Volumes/<Drive>/<Folder 1> /Volumes/<Drive>/<Folder 2>
python3 analyse.py --upload http://<player>:8766
```

- Matching is based on artist and title (as with the Last.fm tags), not on the path: the folder structure and drive used on the Mac do not matter. Tracks that do not exist on the player are simply ignored there.
- Multiple folders can be specified, symlinks are followed; `--exclude "*/Audiobooks/*"` excludes matching paths.
- Unchanged files are skipped on subsequent runs; Ctrl-C aborts the process, and the next invocation continues where it left off.
- `--seconds 120` (default) analyzes only the middle two minutes (for valence/arousal, the middle 45 seconds of that section); `--jobs` specifies the number of parallel processes.
- Duration: on an older Intel Mac, around 9 seconds per file, or about 5 days for 50,000 tracks; Apple Silicon Macs are significantly faster. `--profile` displays the time spent on each analysis step. Using more processes than CPU cores provides no benefit.
- An intermediate upload can be performed at any time; the Tag Service then uses the results available so far.
- If the analysis crashes on a file (macOS then reports "Python quit unexpectedly"), the script continues and records the file as an error; `--retry-errors` retries such files later. Files longer than 30 minutes (recordings, DJ mixes) are skipped because they are loaded entirely into memory (`--max-minutes`, 0 = all).
- The result file `essentia.jsonl` is located on the player under `/data/INTERNAL/tags/` (replaced with each upload; alternatively copy it there using `scp`). The Library Check shows under "Mood Tags" how many tracks have been matched.

### Artist and Album Information

The information page queries Volumio first. If nothing is returned (Volumio 4 only provides the information with a subscription, or Volumio does not respond within 6 seconds), the app retrieves the information itself: album information from Last.fm (in the interface language, otherwise English; requires `LASTFM_KEY`), and artist information from Last.fm and Wikipedia, first both in the interface language, then both in English (Wikipedia: only articles that appear to be music-related).

The source is shown below the text. There is no fallback for contributors.

### Lyrics Offset

If synchronized lyrics consistently appear too early or too late (for example, because a different version of the track is being played), the "−" and "+" controls next to the "Lyrics" heading (stage view: round buttons at the top right) shift the lyrics by 0.5 seconds at a time.

The value applies to that track on all devices (`/data/INTERNAL/tags/lyrics-offsets.json`); tapping the value resets it to 0.

## Rotel Bridge (Optional)

Copy `rotel/rotel-bridge.js` to `/data/INTERNAL/rotel/` and configure it as a systemd service as above (port 8765). In `web/config.local.js`:

```js
window.APP_CONFIG.ROTEL = true;                  // Power button and amplifier volume in the interface
window.APP_CONFIG.ROTEL_HOST = '192.168.1.50';   // Amplifier address, read by the bridge at startup
```

Then restart the bridge. To allow the amplifier to be powered on via the network while in standby, set its Power Mode to "Quick".

Without `ROTEL: true`, the interface controls Volumio's volume instead (if enabled there).

## Streaming Services (TIDAL, Qobuz, HIGHRESAUDIO, Spotify)

The elements for streaming services (tiles in search, similar artists from the service in the information view, and the service's artist and album pages) only appear if the corresponding plugin is active in Volumio.

To permanently enable or disable them, set `window.APP_CONFIG.TIDAL = true;` or `false` (likewise `QOBUZ`, `HRA`, `SPOTIFY`) in `web/config.local.js`.

If multiple services are active, search displays their results in separate sections. Spotify requires Volumio's Spotify plugin with search support (Premium account); Spotify Connect alone does not provide search.

The TIDAL watchdog described below applies only to TIDAL.

## TIDAL Watchdog (Optional)

```bash
sudo mkdir -p /volumio/http/www3/tools && sudo cp tools/tidal-watchdog.sh /volumio/http/www3/tools/
sudo chmod +x /volumio/http/www3/tools/tidal-watchdog.sh
sudo /volumio/http/www3/tools/tidal-watchdog.sh --check      # check only
echo '*/10 * * * * root /volumio/http/www3/tools/tidal-watchdog.sh' | sudo tee /etc/cron.d/tidal-watchdog
```

Checks every 10 minutes whether TIDAL responds and restarts Volumio if it does not (at most once per hour). Log: `/var/log/tidal-watchdog.log`.

If TIDAL is not logged in, do not set up the watchdog.

## Volumio 4

The interface also runs under Volumio 4 (tested on a test instance). Differences compared with Volumio 2:

- **Folders:** Volumio 4 serves the interface from `/volumio/http/www4/` instead of `www3/`. It is still accessed via `http://<player>/app.html`; `web/config.local.js` belongs in `/volumio/http/www4/web/`.

- **Updating:** use the same script as mx-deploy, but install it under the name `volumio4-deploy`. This deploys `app.html`, `web/`, and `tools/` to `www4/` and stores backups under `/data/INTERNAL/volumio4-deploy/`:

  ```bash
  curl -fsSL https://raw.githubusercontent.com/Celindir69/volumio-web-app/main/tools/mx-deploy.sh | sudo tee /usr/local/bin/volumio4-deploy >/dev/null
  sudo chmod +x /usr/local/bin/volumio4-deploy
  sudo volumio4-deploy -n          # inspect first: "changed" would mean that a Volumio file would be replaced
  sudo volumio4-deploy             # deploy; other commands work as with mx-deploy (<branch>, -n, -y, --zurueck)
  ```

  At the end, it must say "Eingespielt nach /volumio/http/www4". If it says "zurück mit: sudo mx-deploy", an old mx-deploy version is still installed under that name: run the two lines above again. Use `MX_WWW=<folder>` to select a different folder.

- **Tag Service:** The service file above starts Node via `/usr/bin/env node` and therefore works on both versions. An older service file using `/usr/local/bin/node` fails under Volumio 4 with `status=203/EXEC`; in that case:

  `sudo sed -i 's|^ExecStart=/usr/local/bin/node|ExecStart=/usr/bin/env node|' /etc/systemd/system/tag-service.service && sudo systemctl daemon-reload && sudo systemctl restart tag-service`.

  Python 3 is included, and the Tag Service includes mutagen.

- **Information texts:** Volumio 4 only provides artist and album information with a subscription; the app therefore retrieves it from Last.fm and Wikipedia (see #artist-and-album-information). With `LASTFM_KEY` in `web/config.local.js`, album information is also available.

- **Not tested under Volumio 4:** `kioskTV.html` (kiosk folder), Rotel Bridge, and TIDAL Watchdog (the watchdog is located under `/volumio/http/www4/tools/` there; adjust the path in the cron entry accordingly).
