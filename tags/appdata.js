/* Datenordner des Tag-Dienstes und Zugangsdaten. Node 8, nur ES5.
   Daten (Verlauf, Last.fm-Sitzung, Check, Analyse …) liegen in /data/xplorio/data: außerhalb des Webordners und
   außerhalb von /data/INTERNAL, das Volumio als Netzwerkfreigabe anbietet. Früher lagen sie neben dem Programm in
   /data/INTERNAL/tags; beim ersten Start werden sie verschoben. Den Ordner /data/web-app zieht xplorio-deploy um.
   Last.fm-Key und -Secret stehen in keys.json im Datenordner (nur für den Dienst lesbar), nicht mehr in
   web/config.local.js, das jeder Browser im Netz laden kann. */
var fs   = require('fs');
var path = require('path');

/* alles, was der Dienst selbst anlegt; Programmdateien bleiben, wo sie sind */
var DATA_FILES = ['changes.jsonl', 'covers', 'check.json', 'plays.jsonl', 'lastfm.json', 'albums.json',
  'library-tracks.json', 'essentia.jsonl', 'moodtags', 'artists', 'radio-covers', 'stations', 'lyrics-offsets.json'];
var KEYS_FILE = 'keys.json';

function exists(p) { try { fs.lstatSync(p); return true; } catch (e) { return false; } }

/* Datenordner anlegen (nur für den Dienst lesbar) und alte Daten aus oldDir hinüberschieben.
   Klappt das Anlegen nicht (Elternordner fehlt oder keine Rechte), bleibt es beim alten Ordner. -> {dir, moved:[…], error} */
function prepare(dir, oldDir, log) {
  log = log || function(){};
  try { fs.mkdirSync(dir, 448); }                          /* 0700 */
  catch (e) {
    if (e.code !== 'EEXIST') {
      log('Datenordner ' + dir + ' nicht anlegbar (' + e.code + '), bleibe bei ' + oldDir);
      return {dir: oldDir, moved: [], error: e.code};
    }
  }
  try { fs.chmodSync(dir, 448); } catch (e) { /* gehört jemand anderem */ }
  var moved = [];
  if (oldDir && oldDir !== dir && exists(oldDir)) {
    DATA_FILES.forEach(function(name){
      var src = path.join(oldDir, name), dst = path.join(dir, name);
      if (!exists(src) || exists(dst)) return;
      try { fs.renameSync(src, dst); moved.push(name); }
      catch (e) { log('Umzug ' + name + ' fehlgeschlagen: ' + e.code); }
    });
    if (moved.length) log('Daten nach ' + dir + ' verschoben: ' + moved.join(', '));
  }
  return {dir: dir, moved: moved};
}

/* Vorgabe für den Datenordner: dir, solange es dessen Elternordner gibt oder legacy fehlt; sonst legacy
   (von Hand eingerichtet unter /data/web-app, noch nicht umgezogen) */
function defaultDir(dir, legacy) {
  return exists(path.dirname(dir)) || !legacy || !exists(legacy) ? dir : legacy;
}

/* Last.fm-Zugang: Umgebung vor keys.json vor (übergangsweise) config.local.js.
   Steht der Zugang nur in config.local.js, wird er einmal nach keys.json übernommen. */
function Keys(dir, appConfig, log) {
  this.file = path.join(dir, KEYS_FILE);
  this.appConfig = appConfig;
  this.log = log || function(){};
}
Keys.prototype.read = function() {
  try { var k = JSON.parse(fs.readFileSync(this.file, 'utf8')); return k && typeof k === 'object' ? k : {}; }
  catch (e) { return {}; }
};
Keys.prototype.write = function(k) {
  fs.writeFileSync(this.file + '.neu', JSON.stringify(k, null, 2) + '\n', {mode: 384});   /* 0600 */
  fs.renameSync(this.file + '.neu', this.file);
};
/* einmal beim Start: Werte aus config.local.js übernehmen, wenn keys.json sie noch nicht hat */
Keys.prototype.migrate = function() {
  var c = this.appConfig(), k = this.read(), changed = false;
  ['LASTFM_KEY', 'LASTFM_SECRET'].forEach(function(n){ if (c[n] && !k[n]) { k[n] = c[n]; changed = true; } });
  if (!changed) return false;
  try { this.write(k); } catch (e) { this.log('keys.json nicht schreibbar: ' + e.message); return false; }
  this.log('Last.fm-Zugang nach ' + this.file + ' übernommen; LASTFM_KEY und LASTFM_SECRET können aus web/config.local.js entfernt werden');
  return true;
};
Keys.prototype.lastfm = function() {
  var k = this.read(), c = this.appConfig();
  return {key: process.env.LASTFM_KEY || k.LASTFM_KEY || c.LASTFM_KEY || '',
          secret: process.env.LASTFM_SECRET || k.LASTFM_SECRET || c.LASTFM_SECRET || ''};
};
/* stehen Key oder Secret noch im Webordner? (Hinweis für die Oberfläche) */
Keys.prototype.inWeb = function() {
  var c = this.appConfig();
  return !!(c.LASTFM_KEY || c.LASTFM_SECRET);
};

module.exports = {prepare: prepare, defaultDir: defaultDir, Keys: Keys, DATA_FILES: DATA_FILES};
