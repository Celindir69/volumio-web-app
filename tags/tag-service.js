/* Tag-Dienst: liest und schreibt Tags der Audiodateien (m4a, flac, mp3, dsf).
   HTTP, Port 8766. Läuft mit Node 8 (nur ES5-Syntax). Die eigentliche Arbeit macht tags.py (Python 2.7/3 + mutagen). */
var http  = require('http');
var fs    = require('fs');
var path  = require('path');
var cp    = require('child_process');
var url   = require('url');
var vm    = require('vm');

var HTTP_PORT   = parseInt(process.env.HTTP_PORT || '8766', 10);
var MUSIC_ROOT  = process.env.MUSIC_ROOT  || '/mnt';
/* Volumio 2: python (2.7); Volumio 4 (Debian 12) hat nur python3 */
var PYTHON      = process.env.PYTHON      || (['/usr/bin/python', '/usr/local/bin/python'].some(function(p){
  try { return fs.statSync(p).isFile(); } catch (e) { return false; } }) ? 'python' : 'python3');
var USE_SUDO    = process.env.USE_SUDO === '1';          /* tags.py per "sudo -n" starten (nötig, wenn der Mount nur root beschreiben lässt) */
var MPC         = process.env.MPC         || 'mpc';
var LOG_FILE    = process.env.TAGS_LOG    || '/data/INTERNAL/tags/changes.jsonl';
var MPD_HOST    = process.env.MPD_HOST    || 'localhost';
var MPD_PORT    = parseInt(process.env.MPD_PORT || '6600', 10);
var SCRIPT      = path.join(__dirname, 'tags.py');
var ROOTS       = ['INTERNAL', 'USB', 'NAS'];            /* erlaubte Ordner unterhalb von MUSIC_ROOT */
var EXT_RE      = /\.(m4a|mp4|m4b|flac|mp3|dsf)$/i;
var MAX_ITEMS   = 500;                                   /* Dateien je Anfrage */
var MAX_ARTIST  = 3000;                                  /* Dateien je Künstler (/artist) */
var PY_BATCH    = 20;                                    /* Dateien je Python-Aufruf */
var MAX_BODY    = 12 * 1024 * 1024;                     /* Cover-Bilder kommen als base64 mit */
var JOB_TIMEOUT = 120000;
var COVER_DIR   = path.join(path.dirname(LOG_FILE), 'covers');   /* Sicherungen alter Cover (für Rückgängig) */
var FOLDER_JPG  = 'folder.jpg';

/* ---------- Pfade ---------- */

/* Volumio-URI ("USB/Ordner/x.flac", "music-library/USB/…", "/mnt/USB/…") -> absoluter Pfad; null, wenn nicht erlaubt */
function resolveUri(uri) {
  if (typeof uri !== 'string' || !uri || uri.indexOf('\0') >= 0) return null;
  var rel = uri.replace(/^\/+/, '').replace(/^music-library\//, '').replace(/^mnt\//, '');
  var parts = rel.split('/');
  if (ROOTS.indexOf(parts[0]) < 0 || parts.length < 2) return null;
  for (var i = 0; i < parts.length; i++) {
    if (parts[i] === '' || parts[i] === '.' || parts[i] === '..') return null;
  }
  if (!EXT_RE.test(rel)) return null;
  var full = path.join(MUSIC_ROOT, rel);
  var real;
  try { real = fs.realpathSync(full); } catch (e) { return { rel: rel, full: full, missing: true }; }
  var root;
  try { root = fs.realpathSync(path.join(MUSIC_ROOT, parts[0])); } catch (e) { return null; }
  if (real.indexOf(root + path.sep) !== 0) return null;   /* Symlink führt aus INTERNAL/USB/NAS heraus */
  return { rel: rel, full: full };
}

/* ---------- tags.py aufrufen (immer nur ein Auftrag gleichzeitig; der CM3 hat wenig Speicher) ---------- */

var queue = [], busy = false;

function runPy(job, cb) {
  queue.push({job: job, cb: cb});
  next();
}

/* mehrere Aufträge, je PY_BATCH in einem Python-Aufruf; cb(results) in derselben Reihenfolge */
function runPyMany(jobs, cb) {
  var out = [], i = 0;
  (function step() {
    if (i >= jobs.length) return cb(out);
    var chunk = jobs.slice(i, i + PY_BATCH);
    i += chunk.length;
    runPy({op: 'batch', jobs: chunk}, function(r){
      chunk.forEach(function(j, k){
        out.push(r.ok && r.results && r.results[k] ? r.results[k] : {ok: false, error: r.error || 'keine Antwort'});
      });
      step();
    });
  })();
}
function next() {
  if (busy || !queue.length) return;
  busy = true;
  var q = queue.shift();
  var args = USE_SUDO ? ['-n', PYTHON, SCRIPT] : [SCRIPT];
  var child = cp.spawn(USE_SUDO ? 'sudo' : PYTHON, args, {stdio: ['pipe', 'pipe', 'pipe']});
  var out = '', err = '', done = false;
  function finish(res) {
    if (done) return;
    done = true; clearTimeout(timer); busy = false;
    q.cb(res); next();
  }
  var limit = Math.max(JOB_TIMEOUT, (q.job.jobs ? q.job.jobs.length : 1) * 15000);   /* m4a-Umschreiben kann je Datei dauern */
  var timer = setTimeout(function(){ child.kill('SIGKILL'); finish({ok: false, error: 'Zeitüberschreitung'}); }, limit);
  child.stdout.on('data', function(d){ out += d; });
  child.stderr.on('data', function(d){ err += d; });
  child.on('error', function(e){ finish({ok: false, error: 'Python nicht startbar: ' + e.message}); });
  child.on('close', function(){
    var res;
    try { res = JSON.parse(out); } catch (e) { res = {ok: false, error: (err || 'Keine Antwort von tags.py').trim().split('\n').pop()}; }
    if (!res.ok && /permission denied|read-only/i.test(res.error || '')) {
      res.error += ' (keine Schreibrechte auf dem Datenträger; siehe docs/tags.md)';
    }
    finish(res);
  });
  child.stdin.on('error', function(){});
  child.stdin.end(JSON.stringify(q.job));
}

/* ---------- Protokoll der Änderungen (für Rückgängig) ---------- */

function logEntry(entry) {
  try {
    fs.mkdirSync(path.dirname(LOG_FILE));
  } catch (e) { /* existiert schon */ }
  try { fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n'); return true; } catch (e) { return false; }
}
function readLog() {
  var txt;
  try { txt = fs.readFileSync(LOG_FILE, 'utf8'); } catch (e) { return []; }
  var list = [];
  txt.split('\n').forEach(function(line){
    if (!line) return;
    try { list.push(JSON.parse(line)); } catch (e) { /* kaputte Zeile überspringen */ }
  });
  return list;
}

/* ---------- MPD: geänderte Ordner neu einlesen ---------- */

/* Jedes "mpc update" lässt Volumio seine ganze Albumliste neu aufbauen (rund 1 min Last). Darum möglichst nur
   einen Ordner einlesen: den gemeinsamen Elternordner, solange er mindestens 3 Ebenen tief liegt
   (z. B. USB/MX-Media/AllFlac), sonst die einzelnen Ordner. */
function scanDirs(relFiles) {
  var dirs = {};
  relFiles.forEach(function(r){ dirs[path.dirname(r)] = true; });
  var list = Object.keys(dirs);
  if (list.length < 2) return list;
  var common = list[0].split('/');
  list.forEach(function(d){
    var p = d.split('/'), k = 0;
    while (k < common.length && k < p.length && common[k] === p[k]) k++;
    common = common.slice(0, k);
  });
  return common.length >= 3 ? [common.join('/')] : list;
}

function mpdUpdate(relFiles, cb) {
  var list = scanDirs(relFiles), ok = true;
  (function step() {
    if (!list.length) return cb(ok);
    cp.execFile(MPC, ['update', list.shift()], {timeout: 15000}, function(e){ if (e) ok = false; step(); });
  })();
}

/* ---------- Aufträge ---------- */

function mapSeq(items, fn, cb) {
  var res = [], i = 0;
  (function step() {
    if (i >= items.length) return cb(res);
    fn(items[i], function(r){ res.push(r); i++; step(); });
  })();
}

function doRead(body, cb) {
  var uris = body.uris;
  if (!Array.isArray(uris) || !uris.length || uris.length > MAX_ITEMS) return cb(400, {ok: false, error: 'uris fehlt oder zu viele'});
  var items = new Array(uris.length), jobs = [], at = [];
  uris.forEach(function(uri, k){
    var p = resolveUri(uri);
    if (!p || p.missing) items[k] = {uri: uri, ok: false, error: p ? 'Datei nicht gefunden' : 'Pfad nicht erlaubt'};
    else { jobs.push({op: 'read', path: p.full}); at.push(k); }
  });
  runPyMany(jobs, function(rs){
    rs.forEach(function(r, k){ r.uri = uris[at[k]]; items[at[k]] = r; });
    cb(200, {ok: true, items: items});
  });
}

var BATCH_RE = /^[a-z0-9]{6,16}$/;

/* POST /write {items:[{uri, tags}], batch?, scan?}
   batch: Kennung mitgeben, damit mehrere Anfragen gemeinsam rückgängig gemacht werden;
   scan:false: MPD nicht neu einlesen lassen (das macht dann ein abschließendes /scan) */
function doWrite(body, cb) {
  var items = body.items;
  if (!Array.isArray(items) || !items.length || items.length > MAX_ITEMS) return cb(400, {ok: false, error: 'items fehlt oder zu viele'});
  if (body.batch !== undefined && !BATCH_RE.test(String(body.batch))) return cb(400, {ok: false, error: 'batch ungültig'});
  writeItems(items, body.batch || Date.now().toString(36), body.scan !== false, cb);
}

function writeItems(items, batch, scan, cb) {
  var results = new Array(items.length), jobs = [], at = [], paths = [], changedRel = [];
  items.forEach(function(it, k){
    var p = resolveUri(it && it.uri);
    if (!p || p.missing) results[k] = {uri: it && it.uri, ok: false, error: p ? 'Datei nicht gefunden' : 'Pfad nicht erlaubt'};
    else { jobs.push({op: 'write', path: p.full, tags: it.tags || {}}); at.push(k); paths.push(p); }
  });
  runPyMany(jobs, function(rs){
    rs.forEach(function(r, k){
      var it = items[at[k]];
      r.uri = it.uri;
      if (r.ok && r.changed) {
        changedRel.push(paths[k].rel);
        if (!logEntry({batch: batch, time: new Date().toISOString(), uri: it.uri, before: r.before, after: r.after})) r.logWarning = true;
      }
      results[at[k]] = r;
    });
    if (!changedRel.length) return cb(200, {ok: true, batch: null, items: results, scan: null});
    if (!scan) return cb(200, {ok: true, batch: batch, items: results, scan: null});
    mpdUpdate(changedRel, function(scanned){ cb(200, {ok: true, batch: batch, items: results, scan: scanned}); });
  });
}

/* POST /scan {uris}: geänderte Dateien von MPD neu einlesen lassen (nach mehreren /write mit scan:false) */
function doScan(body, cb) {
  var rel = [];
  (Array.isArray(body.uris) ? body.uris : []).forEach(function(u){ var p = resolveUri(u); if (p && !p.missing) rel.push(p.rel); });
  if (!rel.length) return cb(400, {ok: false, error: 'uris fehlt'});
  mpdUpdate(rel, function(scanned){ cb(200, {ok: true, scan: scanned}); });
}

/* GET /artist?name=…: alle Dateien, deren Interpret oder Album-Interpret dem Namen entspricht
   (Groß-/Kleinschreibung und Leerzeichen am Rand egal), über MPD.
   Mit &tracks=1 stattdessen alle Suchtreffer mit Titel und Album (Künstlerseite: Titel ohne eigenes Album). */
function doArtist(query, cb) {
  var name = String(query.name || '').trim();
  if (!name) return cb(400, {ok: false, error: 'name fehlt'});
  var me = name.toLowerCase(), seen = {}, files = [], tracks = [], withTracks = query.tracks === '1';
  function search(tag, done) {
    cp.execFile(MPC, ['-f', '%file%\t[%artist%]\t[%albumartist%]\t[%title%]\t[%album%]', 'search', tag, name], {timeout: 30000, maxBuffer: 32 * 1024 * 1024}, function(e, out){
      if (e) return done(e);
      String(out).split('\n').forEach(function(line){
        var f = line.split('\t');
        if (!f[0] || seen[f[0]]) return;
        if (withTracks) {                                    /* Teiltreffer ("A feat. B") filtert der Browser */
          seen[f[0]] = true;
          tracks.push({file: f[0], artist: f[1] || '', albumartist: f[2] || '', title: f[3] || '', album: f[4] || ''});
          return;
        }
        if ((f[1] || '').trim().toLowerCase() !== me && (f[2] || '').trim().toLowerCase() !== me) return;
        seen[f[0]] = true;
        files.push(f[0]);
      });
      done();
    });
  }
  search('artist', function(e1){
    search('albumartist', function(e2){
      if (e1 && e2) return cb(500, {ok: false, error: 'MPD-Suche fehlgeschlagen: ' + e1.message});
      if (withTracks) return cb(200, {ok: true, tracks: tracks.slice(0, MAX_ARTIST)});
      files = files.filter(function(f){ var p = resolveUri(f); return p && !p.missing; }).sort();
      if (files.length > MAX_ARTIST) return cb(200, {ok: false, error: 'zu viele Dateien (' + files.length + ', höchstens ' + MAX_ARTIST + ')'});
      cb(200, {ok: true, files: files});
    });
  });
}

/* ---------- Bibliotheks-Check ---------- */
/* POST /check startet die Prüfung im Hintergrund, GET /check liefert Fortschritt und das letzte Ergebnis.
   Das Ergebnis liegt in check.json neben dem Änderungsprotokoll, bis neu geprüft wird. */
var libcheck = require('./libcheck.js');
var CHECK_FILE = path.join(path.dirname(LOG_FILE), 'check.json');
var checkRun = null;                                     /* {phase, done, total, started} während der Prüfung */
var checkError = null;

function doCheckStart(body, cb) {
  if (checkRun) return cb(200, {ok: true, running: checkRun});
  checkRun = {phase: 'mpd', done: 0, total: 0, started: Date.now()};
  checkError = null;
  cb(200, {ok: true, running: checkRun});
  libcheck.mpdWalk({host: MPD_HOST, port: MPD_PORT}, function(err, songs){
    if (err) { checkError = 'MPD: ' + err.message; checkRun = null; return; }
    checkRun.phase = 'cover';
    var cand = libcheck.dirsWithoutImage(songs, MUSIC_ROOT), noCover = {};
    checkRun.done = 0; checkRun.total = cand.length;
    var jobs = cand.map(function(c){ return {op: 'cover_has', path: path.join(MUSIC_ROOT, c.file)}; });
    var i = 0, results = [];
    (function step() {                                   /* in Teilen, damit der Fortschritt mitläuft */
      if (i >= jobs.length) {
        cand.forEach(function(c, k){ if (!(results[k] && results[k].ok && results[k].has)) noCover[c.dir] = true; });
        var res = libcheck.analyze(songs, function(d){ return !noCover[d]; });
        res.at = Date.now();
        res.seconds = Math.round((res.at - checkRun.started) / 1000);
        try { fs.writeFileSync(CHECK_FILE, JSON.stringify(res)); } catch (e) { checkError = 'Ergebnis nicht speicherbar: ' + e.message; }
        checkRun = null;
        return;
      }
      var part = jobs.slice(i, i + PY_BATCH);
      i += part.length;
      runPyMany(part, function(r){ results = results.concat(r); checkRun.done = i; step(); });
    })();
  }, function(done, total){ checkRun.done = done; checkRun.total = total; });
}

function doCheckGet(cb) {
  var last = null;
  try { last = JSON.parse(fs.readFileSync(CHECK_FILE, 'utf8')); } catch (e) { /* noch nie geprüft */ }
  cb(200, {ok: true, running: checkRun, error: checkError, result: last});
}

/* ---------- Cover online suchen ---------- */
/* GET /coversearch?artist=…&album=… -> {ok, results:[{id, source}]}; GET /coverimage?id=… liefert das Bild.
   Nur Adressen, die die Suche selbst gefunden hat, werden geladen (über die id). Last.fm-Schlüssel aus web/config*.js. */
var coversearch = require('./coversearch.js');
var APP_CONFIG_DIR = process.env.APP_CONFIG_DIR || '/volumio/http/www3/web';
var coverHits = {}, coverHitIds = [], coverHitSeq = 0;

function appConfig() {
  var ctx = {window: {}};
  ['config.js', 'config.local.js'].forEach(function(f){
    try { vm.runInNewContext(fs.readFileSync(path.join(APP_CONFIG_DIR, f), 'utf8'), ctx, {filename: f, timeout: 1000}); }
    catch (e) { /* Datei fehlt oder ist fehlerhaft: Standardwerte */ }
  });
  return ctx.window.APP_CONFIG || {};
}

function doCoverSearch(query, cb) {
  var album = String(query.album || '').trim();
  if (!album) return cb(400, {ok: false, error: 'album fehlt'});
  coversearch.search({artist: query.artist, album: album, lastfmKey: process.env.LASTFM_KEY || appConfig().LASTFM_KEY}, function(list){
    cb(200, {ok: true, results: list.map(function(r){
      var id = String(++coverHitSeq);
      coverHits[id] = r.url; coverHitIds.push(id);
      if (coverHitIds.length > 100) delete coverHits[coverHitIds.shift()];
      return {id: id, source: r.source};
    })});
  });
}

function doCoverImage(query, res) {
  var u = coverHits[String(query.id || '')];
  if (!u) return send(res, 404, {ok: false, error: 'unbekannt'});
  coversearch.image(u, function(e, img){
    if (e) return send(res, 404, {ok: false, error: e.message});
    res.writeHead(200, {'Content-Type': img.mime, 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'max-age=600'});
    res.end(img.body);
  });
}

/* ---------- Verlauf und Last.fm ---------- */
/* Der Dienst fragt Volumio alle paar Sekunden nach dem Wiedergabestand und schreibt gezählte Wiedergaben
   nach plays.jsonl. GET /plays?view=recent|top|stats liefert Listen und Statistik, /lastfm verbindet und gleicht ab. */
var plays  = require('./plays.js');
var lastfm = require('./lastfm.js');
var DATA_DIR    = path.dirname(LOG_FILE);
var VOLUMIO_URL = process.env.VOLUMIO_URL || 'http://localhost:3000';
var playStore = new plays.Store(path.join(DATA_DIR, 'plays.jsonl'));
var lfm = new lastfm.Sync(path.join(DATA_DIR, 'lastfm.json'), playStore, function(){
  var c = appConfig();
  return {key: process.env.LASTFM_KEY || c.LASTFM_KEY, secret: process.env.LASTFM_SECRET || c.LASTFM_SECRET};
});
var tracker = new plays.Tracker(function(e){ playStore.add([e]); lfm.played(e); }, function(e){ lfm.nowPlaying(e); });
var recording = false;

function playerState(cb) {
  var done = false;
  function finish(e, st) { if (!done) { done = true; cb(e, st); } }
  var req = http.get(VOLUMIO_URL + '/api/v1/getState', function(res){
    var data = '';
    res.setEncoding('utf8');
    res.on('data', function(d){ data += d; });
    res.on('end', function(){ try { finish(null, JSON.parse(data)); } catch (e) { finish(e); } });
  });
  req.setTimeout(5000, function(){ req.abort(); finish(new Error('Zeitüberschreitung')); });
  req.on('error', finish);
}

function watchPlayer() {
  playerState(function(e, st){
    if (!e && st) tracker.update(st, Date.now());
    setTimeout(watchPlayer, tracker.cur && tracker.cur.playing ? 5000 : 15000);
  });
}

/* Volumio-uri -> Pfad relativ zum Musikordner ("USB/…"), sonst '' */
function relUri(u) {
  u = String(u || '');
  if (/^([a-z]+:\/\/|(tidal|qobuz|hra|highresaudio|hi_res_audio)\/|spotify:)/i.test(u)) return '';
  return u.replace(/^\/+/, '').replace(/^music-library\//, '').replace(/^mnt\//, '');
}

function doPlays(query, cb) {
  var list = playStore.load(), now = Math.floor(Date.now() / 1000), view = query.view;
  var limit = Math.min(parseInt(query.limit, 10) || 100, 500);
  if (view === 'recent') return cb(200, {ok: true, recording: recording, items: plays.recent(list, parseInt(query.before, 10) || 0, limit)});
  if (view === 'top') {
    var kind = ['track', 'album', 'artist'].indexOf(query.kind) >= 0 ? query.kind : 'track';
    var items = plays.top(list, kind, plays.rangeStart(query.range, now), limit);
    if (kind === 'album') items.forEach(function(it){ if (it.u) it.u = relUri(it.u); if (!it.u) delete it.u; });
    return cb(200, {ok: true, items: items});
  }
  var tz = {w: parseInt(query.tzw, 10) || 0, s: parseInt(query.tzs, 10) || 0};
  if (view === 'stats') return cb(200, {ok: true, recording: recording, stats: plays.stats(list, query.range, now, tz)});
  if (view === 'year') {
    var ys = plays.years(list, tz), y = parseInt(query.y, 10) || ys[0] || plays.local(now, tz).getUTCFullYear();
    albumsEnsure();                                      /* Genres kommen aus der Albenliste */
    var gi = albumIdx && albumIdx.list;
    if (gi && (!albumGenre || albumGenre.list !== gi)) albumGenre = {list: gi, fn: albums.genreIndex(gi)};
    var m = parseInt(query.m, 10);
    var yr = plays.year(list, y, tz, now, 10, gi ? albumGenre.fn : null, m >= 1 && m <= 12 ? m - 1 : -1);
    yr.albums_top.forEach(function(it){ if (it.u) it.u = relUri(it.u); if (!it.u) delete it.u; });
    return cb(200, {ok: true, years: ys, review: yr});
  }
  if (view === 'ago') {
    var ak = ['artist', 'track'].indexOf(query.kind) >= 0 ? query.kind : 'album';
    var ag = plays.ago(list, now, tz, 12, ak);
    ag.items.forEach(function(it){ if (it.u) it.u = relUri(it.u); if (!it.u) delete it.u; });
    return cb(200, {ok: true, ago: ag});
  }
  cb(400, {ok: false, error: 'view fehlt'});
}

/* ---------- Zufallsalbum ---------- */
/* GET /random[?kind=artist|track] -> {ok, album: {dir, al, ar, last}} (artist: {ar, n, dir, last}; track: {ar, ti, al, f, d, last}) oder {ok: false, building: true}, solange die Albenliste entsteht.
   Die Liste kommt aus MPD (wie beim Bibliotheks-Check), liegt in albums.json und wird neu gelesen,
   wenn MPDs Datenbank sich geändert hat (Prüfung höchstens alle 10 Minuten). */
var albums = require('./albums.js');
var ALBUMS_FILE = path.join(DATA_DIR, 'albums.json');
var albumIdx = null, albumBuilding = false, albumChecked = 0, albumPicks = [], albumLast = null, albumGenre = null;
var ALBUMS_VERSION = 4;                                  /* 2: mit Genre, 3: dazu library-tracks.json, 4: mit Dauer und Album */
var TRACKS_FILE = path.join(DATA_DIR, 'library-tracks.json');   /* [[Künstler, Titel, Datei, Sekunden, Album], …] für die Stimmungs-Tags */

function albumsEnsure(cb) {
  cb = cb || function(){};
  if (!albumIdx) { try { albumIdx = JSON.parse(fs.readFileSync(ALBUMS_FILE, 'utf8')); } catch (e) { /* noch nie gelesen */ } }
  if (albumBuilding || (albumIdx && Date.now() - albumChecked < 600000)) return cb(albumIdx && albumIdx.list);
  albumChecked = Date.now();
  libcheck.mpdCommand({host: MPD_HOST, port: MPD_PORT}, 'stats', function(err, st){
    var stamp = !err && st.db_update;
    if (albumIdx && (err || stamp === albumIdx.db) && albumIdx.v === ALBUMS_VERSION) return cb(albumIdx.list);
    albumBuilding = true;
    if (albumIdx) cb(albumIdx.list);                     /* alte Liste bis die neue fertig ist */
    libcheck.mpdWalk({host: MPD_HOST, port: MPD_PORT}, function(e2, songs){
      albumBuilding = false;
      if (!e2 && songs.length) {
        albumIdx = {v: ALBUMS_VERSION, db: stamp || null, at: Date.now(), list: albums.fromSongs(songs)};
        try { fs.writeFileSync(ALBUMS_FILE, JSON.stringify(albumIdx)); } catch (x) { /* nächstes Mal */ }
        var tl = songs.filter(function(s){ return s.artist && s.title; }).map(function(s){ return [s.artist, s.title, s.file, parseInt(s.time, 10) || 0, s.album]; });
        try { fs.writeFileSync(TRACKS_FILE + '.neu', JSON.stringify(tl)); fs.renameSync(TRACKS_FILE + '.neu', TRACKS_FILE); } catch (x) { /* nächstes Mal */ }
      }
    });
    if (!albumIdx) cb(null);
  });
}

/* ---------- Stimmungs-Tags ---------- */
/* Last.fm-Tags je Titel sammeln, nur solange nichts spielt (Pause und Stopp zählen als still).
   GET /moodtags -> {ok, status, summary}; GET /moodtags?artist=…&title=… -> Rohtags und Ergebnis für einen Titel */
var moodtags = require('./moodtags.js');
var essentia = require('./essentia.js');
var ESSENTIA_FILE = path.join(DATA_DIR, 'essentia.jsonl');      /* Audio-Analyse vom Mac (tools/essentia), per POST /essentia oder scp */
var ESSENTIA_MAX = 300 * 1024 * 1024;
var audioStore = new essentia.Store(ESSENTIA_FILE);
var moodCollector = new moodtags.Collector({
  dir: path.join(DATA_DIR, 'moodtags'), libFile: TRACKS_FILE, audio: audioStore,
  getCfg: function(){ return {key: process.env.LASTFM_KEY || appConfig().LASTFM_KEY}; },
  playing: function(cb){ playerState(function(e, st){ cb(!!(e || (st && st.status === 'play'))); }); }   /* im Zweifel: spielt */
});

function doMoodtags(query, cb) {
  if (query.artist || query.title) {
    var ar = String(query.artist || ''), ti = String(query.title || ''), k = moodtags.trackKey(ar, ti);
    var t = moodCollector.tracks[k], a = moodCollector.artists[moodtags.artistKey(ar)], au = audioStore.get(ar, ti, query.album);
    return cb(200, {ok: true, track: t ? t.g : null, artist: a ? a.g : null, audio: au ? strip(au) : null,
                    result: moodCollector.moodOf(ar, ti, query.album)});
  }
  cb(200, {ok: true, enabled: moodCollector.running, status: moodCollector.status(), summary: moodCollector.summary(),
           audio: audioStore.status()});
}
function strip(o) { var r = {}; Object.keys(o).forEach(function(k){ if (k.charAt(0) !== '_') r[k] = o[k]; }); return r; }

/* POST /essentia: Ergebnisdatei des Analyse-Skripts (JSON Lines) ersetzt die bisherige */
function doEssentiaUpload(req, res) {
  try { mkdirs(DATA_DIR); } catch (e) { /* existiert */ }
  var tmp = ESSENTIA_FILE + '.neu', out = fs.createWriteStream(tmp), size = 0, failed = false;
  function fail(code, msg) {
    if (failed) return; failed = true;
    out.destroy(); try { fs.unlinkSync(tmp); } catch (e) { /* schon weg */ }
    send(res, code, {ok: false, error: msg});
  }
  req.on('data', function(d){ size += d.length; if (size > ESSENTIA_MAX) { fail(413, 'Datei zu groß'); req.destroy(); } });
  req.on('error', function(){ fail(400, 'Übertragung abgebrochen'); });
  out.on('error', function(e){ fail(500, 'Schreiben fehlgeschlagen: ' + e.message); });
  out.on('finish', function(){
    if (failed) return;
    try { fs.renameSync(tmp, ESSENTIA_FILE); } catch (e) { return fail(500, 'Speichern fehlgeschlagen'); }
    audioStore.reload(true);
    var st = audioStore.status(), lib = moodCollector.loadLib(), matched = 0;
    lib.forEach(function(it){ if (audioStore.get(it.ar, it.ti, it.al)) matched++; });
    send(res, 200, {ok: true, tracks: st.tracks, library: lib.length, matched: matched});
  });
  req.pipe(out);
}

/* GET /moodmix?moods=a,b&emin=&emax=&styles=&match=any|all&n=&disc=0..1 -> {ok, level, matches, tracks}
   mit count=1 nur {ok, count, rated, styles} (Trefferanzeige und Stil-Chips) */
var moodmix = require('./moodmix.js');
var mixPlays = null;
function doMoodmix(query, cb) {
  var c = moodmix.parse(query);
  if (query.count) { var r = moodmix.count(moodCollector, c); r.ok = true; return cb(200, r); }
  var pl = playStore.load();
  if (!mixPlays || mixPlays.n !== pl.length) mixPlays = {n: pl.length, pc: moodmix.playCounts(pl)};
  var m = moodmix.build(moodCollector, mixPlays.pc, c);
  m.ok = true;
  m.tracks.forEach(function(t){ t.f = relUri(t.f) || t.f; });
  cb(200, m);
}

var artistPicks = [], trackPicks = [], libTracks = null, artistList = null;
/* Titelliste der Bibliothek (library-tracks.json), neu gelesen, wenn die Datei sich geändert hat */
function libTracksLoad() {
  var st;
  try { st = fs.statSync(TRACKS_FILE); } catch (e) { return null; }
  if (!libTracks || libTracks.m !== +st.mtime) {
    try { libTracks = {m: +st.mtime, list: JSON.parse(fs.readFileSync(TRACKS_FILE, 'utf8'))}; } catch (e) { return libTracks && libTracks.list; }
  }
  return libTracks.list;
}

function doRandom(query, cb) {
  var kind = query.kind === 'artist' || query.kind === 'track' ? query.kind : 'album';
  albumsEnsure(function(list){
    if (!list || !list.length) return cb(200, {ok: false, building: albumBuilding, error: albumBuilding ? null : 'keine Alben gefunden'});
    var pl = playStore.load(), now = Math.floor(Date.now() / 1000);
    if (kind === 'artist') {
      if (!artistList || artistList.src !== list) artistList = {src: list, list: albums.artists(list)};
      var ar = albums.pickArtist(artistList.list, albums.lastArtistIndex(pl), now, artistPicks);
      return cb(200, ar ? {ok: true, artist: ar} : {ok: false, error: 'keine Künstler gefunden'});
    }
    if (kind === 'track') {
      var tl = libTracksLoad();
      if (!tl || !tl.length) return cb(200, {ok: false, building: albumBuilding, error: 'keine Titel gefunden'});
      return cb(200, {ok: true, track: albums.pickTrack(tl, albums.lastTrackIndex(pl), now, trackPicks)});
    }
    if (!albumLast || albumLast.n !== pl.length) albumLast = {n: pl.length, fn: albums.lastIndex(pl)};
    cb(200, {ok: true, album: albums.pick(list, albumLast.fn, now, albumPicks)});
  });
}

/* GET /plays/resolve?artist=…&title=…: lokale Datei zu einem Titel aus dem Verlauf (z. B. von Last.fm eingelesen) */
function doResolve(query, cb) {
  var artist = String(query.artist || '').trim(), title = String(query.title || '').trim();
  if (!artist || !title) return cb(400, {ok: false, error: 'artist und title nötig'});
  function find(how, done) {
    cp.execFile(MPC, ['-f', '%file%', how, 'artist', artist, 'title', title], {timeout: 15000, maxBuffer: 4 * 1024 * 1024}, function(e, out){
      done(e ? [] : String(out).split('\n').filter(Boolean));
    });
  }
  find('find', function(hits){
    if (hits.length) return cb(200, {ok: true, file: hits[0]});
    find('search', function(more){
      var want = plays.norm(title);
      var exact = more.filter(function(f){ return plays.norm(path.basename(f).replace(/\.[^.]+$/, '')).indexOf(want) >= 0; });
      cb(200, {ok: true, file: exact[0] || more[0] || null});
    });
  });
}

function doLastfm(body, cb) {
  var a = body.action;
  if (a === 'connect') return lfm.connect(function(e, u){ cb(200, e ? {ok: false, error: e} : {ok: true, url: u}); });
  if (a === 'finish') return lfm.finish(function(e){
    if (e) return cb(200, {ok: false, error: e});
    if (!lfm.state.importedTo) lfm.importAll();          /* beim ersten Verbinden gleich den Verlauf holen */
    cb(200, {ok: true, status: lfm.status()});
  });
  if (a === 'disconnect') { lfm.disconnect(); return cb(200, {ok: true, status: lfm.status()}); }
  if (a === 'import') {
    if (!lfm.state.user) return cb(200, {ok: false, error: 'Erst mit Last.fm verbinden'});
    lfm.importAll();
    return cb(200, {ok: true, status: lfm.status()});
  }
  if (a === 'send') { lfm.flush(); return cb(200, {ok: true, status: lfm.status()}); }
  cb(400, {ok: false, error: 'action unbekannt'});
}

/* GET /artistimage?name=…: Künstlerfoto (Deezer, auf dem Player gespeichert unter artists/); 404 ohne Foto */
var artistimg = require('./artistimg.js');
var artistImages = new artistimg.Store(path.join(DATA_DIR, 'artists'));

function doArtistImage(query, res) {
  var name = String(query.name || '').trim();
  if (!name || name.length > 200) return send(res, 400, {ok: false, error: 'name fehlt'});
  artistImages.get(name, function(e, buf){
    if (!buf) { res.writeHead(404, {'Access-Control-Allow-Origin': '*', 'Cache-Control': 'max-age=3600'}); return res.end(); }
    res.writeHead(200, {'Content-Type': buf[0] === 0x89 ? 'image/png' : 'image/jpeg', 'Content-Length': buf.length,
                        'Access-Control-Allow-Origin': '*', 'Cache-Control': 'max-age=2592000'});
    res.end(buf);
  });
}

/* Webradio: GET /radiocover?artist=…&title=… (Cover zum laufenden Titel) und GET /stationlogo?name=…[&url=…] (Senderlogo);
   beides auf dem Player gespeichert unter radio-covers/ bzw. stations/; 404 ohne Bild */
var radio = require('./radio.js');
var radioCovers = new artistimg.Store(path.join(DATA_DIR, 'radio-covers'), {lookup: radio.songLookup, noneTtl: 7 * 86400000});
var stationLogos = new artistimg.Store(path.join(DATA_DIR, 'stations'), {lookup: radio.logoLookup});

function sendImage(res, buf) {
  var type = buf && radio.mime(buf);
  if (!type) { res.writeHead(404, {'Access-Control-Allow-Origin': '*', 'Cache-Control': 'max-age=3600'}); return res.end(); }
  res.writeHead(200, {'Content-Type': type, 'Content-Length': buf.length, 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'max-age=2592000'});
  res.end(buf);
}
function doRadioCover(query, res) {
  var artist = String(query.artist || '').trim(), title = String(query.title || '').trim();
  if (!artist || !title || artist.length + title.length > 300) return send(res, 400, {ok: false, error: 'artist und title nötig'});
  radioCovers.get(artist + '\n' + title, function(e, buf){ sendImage(res, buf); });
}
function doStationLogo(query, res) {
  var name = String(query.name || '').trim(), u = String(query.url || '').trim();
  if (!name || name.length > 200 || u.length > 1000) return send(res, 400, {ok: false, error: 'name fehlt'});
  stationLogos.get(name, function(e, buf){ sendImage(res, buf); }, u);
}

/* GET /lyricsoffset?key=… -> {ok, ms}; POST /lyricsoffset {key, ms}: Versatz der synchronen Lyrics je Titel
   (in ms, positiv = Text kommt später), für alle Geräte gemeinsam in lyrics-offsets.json */
var OFFSET_FILE = path.join(DATA_DIR, 'lyrics-offsets.json');
function readOffsets() { try { return JSON.parse(fs.readFileSync(OFFSET_FILE, 'utf8')) || {}; } catch (e) { return {}; } }

function doOffsetGet(query, cb) {
  var key = String(query.key || '');
  if (!key || key.length > 400) return cb(400, {ok: false, error: 'key fehlt'});
  cb(200, {ok: true, ms: readOffsets()[key] || 0});
}
function doOffsetSet(body, cb) {
  var key = String(body.key || ''), ms = Math.round(Number(body.ms) || 0);
  if (!key || key.length > 400 || Math.abs(ms) > 600000) return cb(400, {ok: false, error: 'key oder ms ungültig'});
  var all = readOffsets();
  if (ms) all[key] = ms; else delete all[key];
  try { mkdirs(DATA_DIR); fs.writeFileSync(OFFSET_FILE + '.neu', JSON.stringify(all)); fs.renameSync(OFFSET_FILE + '.neu', OFFSET_FILE); }
  catch (e) { return cb(500, {ok: false, error: e.message}); }
  cb(200, {ok: true, ms: ms});
}

/* ---------- Cover ---------- */

function mkdirs(dir) {
  var parts = path.resolve(dir).split(path.sep), cur = '';
  parts.forEach(function(p, i){
    cur = i ? path.join(cur, p) : (p || path.sep);
    try { fs.mkdirSync(cur); } catch (e) { /* existiert schon */ }
  });
}

/* Ordner der Dateien (ohne Doppelte), als {rel, full} */
function dirsOf(paths) {
  var seen = {}, out = [];
  paths.forEach(function(p){
    var rel = path.dirname(p.rel);
    if (!seen[rel]) { seen[rel] = true; out.push({rel: rel, full: path.dirname(p.full)}); }
  });
  return out;
}

/* GET /image?uri=…&src=embedded|folder: eingebettetes Cover der Datei bzw. folder.jpg ihres Ordners */
function doImage(query, res) {
  var p = resolveUri(query.uri);
  function none(code) { res.writeHead(code || 404, {'Access-Control-Allow-Origin': '*'}); res.end(); }
  if (!p || p.missing) return none(p ? 404 : 400);
  function img(mime, buf) {
    res.writeHead(200, {'Content-Type': mime, 'Content-Length': buf.length, 'Cache-Control': 'no-store',
                        'Access-Control-Allow-Origin': '*'});
    res.end(buf);
  }
  if (query.src === 'folder') {
    fs.readFile(path.join(path.dirname(p.full), FOLDER_JPG), function(e, buf){ if (e) return none(); img('image/jpeg', buf); });
    return;
  }
  runPy({op: 'cover_get', path: p.full}, function(r){
    if (!r.ok || !r.data) return none();
    img(r.mime || 'image/jpeg', Buffer.from(r.data, 'base64'));
  });
}

/* POST /cover {uris, image:<base64 JPEG>, embed:bool, folder:bool, overwrite:bool}
   embed: Bild als Frontcover in alle Dateien; folder: Bild als folder.jpg in deren Ordner.
   Eine vorhandene folder.jpg wird nur mit overwrite ersetzt (sonst {ok:false, exists:[Ordner]}). */
function doCover(body, cb) {
  var uris = body.uris;
  if (!Array.isArray(uris) || !uris.length || uris.length > MAX_ITEMS) return cb(400, {ok: false, error: 'uris fehlt oder zu viele'});
  if (typeof body.image !== 'string' || !body.image) return cb(400, {ok: false, error: 'Bild fehlt'});
  if (!body.embed && !body.folder) return cb(400, {ok: false, error: 'nichts zu tun'});
  var buf = Buffer.from(body.image, 'base64');
  if (buf.length < 100 || !(buf[0] === 0xff && buf[1] === 0xd8)) return cb(400, {ok: false, error: 'Bild ist kein JPEG'});

  var paths = [], bad = [];
  uris.forEach(function(u){ var p = resolveUri(u); if (p && !p.missing) { p.uri = u; paths.push(p); } else bad.push(u); });
  if (!paths.length) return cb(400, {ok: false, error: 'keine gültigen Dateien'});
  var dirs = body.folder ? dirsOf(paths) : [];
  var exists = dirs.filter(function(d){ return fs.existsSync(path.join(d.full, FOLDER_JPG)); });
  if (exists.length && !body.overwrite) return cb(200, {ok: false, exists: exists.map(function(d){ return d.rel; })});

  var batch = Date.now().toString(36), bdir = path.join(COVER_DIR, batch), tmp = path.join(bdir, 'neu.jpg');
  try { mkdirs(bdir); fs.writeFileSync(tmp, buf); } catch (e) { return cb(500, {ok: false, error: 'Sicherungsordner nicht beschreibbar: ' + e.message}); }

  var results = bad.map(function(u){ return {uri: u, ok: false, error: 'Pfad nicht erlaubt oder Datei fehlt'}; });
  var changedRel = [], folders = [];
  dirs.forEach(function(d, i){                                  /* folder.jpg zuerst (schnell, ohne Python) */
    var target = path.join(d.full, FOLDER_JPG), backup = null;
    try {
      if (fs.existsSync(target)) { backup = path.join(bdir, 'folder-' + i + '.jpg'); fs.writeFileSync(backup, fs.readFileSync(target)); }
      fs.writeFileSync(target, buf);
      logEntry({batch: batch, time: new Date().toISOString(), folder: d.rel, cover: {backup: backup}});
      folders.push({dir: d.rel, ok: true});
    } catch (e) { folders.push({dir: d.rel, ok: false, error: e.message}); }
  });
  if (!body.embed) return finish();
  var i = 0;
  mapSeq(paths, function(p, done){
    runPy({op: 'cover_set', path: p.full, image: tmp, mime: 'image/jpeg', backup: path.join(bdir, String(i++))}, function(r){
      r.uri = p.uri;
      if (r.ok && r.changed) {
        changedRel.push(p.rel);
        logEntry({batch: batch, time: new Date().toISOString(), uri: p.uri, cover: {backup: r.backup}});
      }
      done(r);
    });
  }, function(rs){ results = results.concat(rs); finish(); });

  function finish() {
    var changed = changedRel.length + folders.filter(function(f){ return f.ok; }).length;
    var out = {ok: true, batch: changed ? batch : null, items: results, folders: folders};
    if (!changedRel.length) return cb(200, out);
    mpdUpdate(changedRel, function(scanned){ out.scan = scanned; cb(200, out); });
  }
}

/* Rückgängig: Text-Tags (before), eingebettete Cover und folder.jpg eines Auftrags zurücksetzen */
function doUndo(body, cb) {
  var entries = readLog().filter(function(e){ return e.batch === body.batch; });
  if (!entries.length) return cb(404, {ok: false, error: 'Änderung nicht gefunden'});
  var textEntries = entries.filter(function(e){ return e.before; });
  var coverEntries = entries.filter(function(e){ return e.cover && e.uri; });
  var folderEntries = entries.filter(function(e){ return e.cover && e.folder; });
  var results = [], changedRel = [];

  folderEntries.forEach(function(e){
    var dir = path.join(MUSIC_ROOT, e.folder), target = path.join(dir, FOLDER_JPG);
    try {
      if (e.folder.split('/').indexOf('..') >= 0) throw new Error('Pfad nicht erlaubt');
      if (e.cover.backup) fs.writeFileSync(target, fs.readFileSync(e.cover.backup)); else fs.unlinkSync(target);
      results.push({folder: e.folder, ok: true, changed: true});
    } catch (err) { results.push({folder: e.folder, ok: false, error: err.message}); }
  });
  mapSeq(coverEntries, function(e, done){
    var p = resolveUri(e.uri);
    if (!p || p.missing) return done({uri: e.uri, ok: false, error: 'Datei nicht gefunden'});
    runPy({op: 'cover_set', path: p.full, image: e.cover.backup || null}, function(r){
      r.uri = e.uri;
      if (r.ok && r.changed) changedRel.push(p.rel);
      done(r);
    });
  }, function(rs){
    results = results.concat(rs);
    if (!textEntries.length) {
      if (!changedRel.length) return cb(200, {ok: true, batch: null, items: results, undone: body.batch});
      return mpdUpdate(changedRel, function(scanned){ cb(200, {ok: true, batch: null, items: results, scan: scanned, undone: body.batch}); });
    }
    writeItems(textEntries.map(function(e){ return {uri: e.uri, tags: e.before}; }), Date.now().toString(36), true, function(code, res){
      res.items = results.concat(res.items || []);
      if (changedRel.length) mpdUpdate(changedRel, function(){});
      res.undone = body.batch; cb(code, res);
    });
  });
}

function doHistory(cb) {
  var seen = {}, list = [];
  readLog().reverse().forEach(function(e){
    if (!e.uri) return;                                   /* folder.jpg-Einträge zählen nicht als Datei */
    if (!seen[e.batch]) { seen[e.batch] = {batch: e.batch, time: e.time, files: 0}; list.push(seen[e.batch]); }
    seen[e.batch].files++;
  });
  cb(200, {ok: true, batches: list.slice(0, 20)});
}

/* ---------- HTTP ---------- */

function send(res, code, obj) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(obj));
}

var server = http.createServer(function(req, res){
  var route = req.url.split('?')[0];
  if (req.method === 'OPTIONS') return send(res, 204, {});
  if (req.method === 'GET' && route === '/health')  return send(res, 200, {ok: true});
  if (req.method === 'GET' && route === '/history') return doHistory(function(c, o){ send(res, c, o); });
  if (req.method === 'GET' && route === '/image')   return doImage(url.parse(req.url, true).query, res);
  if (req.method === 'GET' && route === '/coverimage') return doCoverImage(url.parse(req.url, true).query, res);
  if (req.method === 'GET' && route === '/coversearch') return doCoverSearch(url.parse(req.url, true).query, function(c, o){ send(res, c, o); });
  if (req.method === 'GET' && route === '/check')   return doCheckGet(function(c, o){ send(res, c, o); });
  if (req.method === 'GET' && route === '/radiocover')  return doRadioCover(url.parse(req.url, true).query, res);
  if (req.method === 'GET' && route === '/stationlogo') return doStationLogo(url.parse(req.url, true).query, res);
  if (req.method === 'GET' && route === '/artistimage') return doArtistImage(url.parse(req.url, true).query, res);
  if (req.method === 'GET' && route === '/lyricsoffset') return doOffsetGet(url.parse(req.url, true).query, function(c, o){ send(res, c, o); });
  if (req.method === 'GET' && route === '/moodmix')  return doMoodmix(url.parse(req.url, true).query, function(c, o){ send(res, c, o); });
  if (req.method === 'GET' && route === '/moodtags') return doMoodtags(url.parse(req.url, true).query, function(c, o){ send(res, c, o); });
  if (req.method === 'GET' && route === '/random')  return doRandom(url.parse(req.url, true).query, function(c, o){ send(res, c, o); });
  if (req.method === 'GET' && route === '/plays')   return doPlays(url.parse(req.url, true).query, function(c, o){ send(res, c, o); });
  if (req.method === 'GET' && route === '/plays/resolve') return doResolve(url.parse(req.url, true).query, function(c, o){ send(res, c, o); });
  if (req.method === 'GET' && route === '/lastfm')  return send(res, 200, {ok: true, recording: recording, lastfm: lfm.status()});
  if (req.method === 'GET' && route === '/artist')  return doArtist(url.parse(req.url, true).query, function(c, o){ send(res, c, o); });
  if (req.method === 'POST' && route === '/essentia') return doEssentiaUpload(req, res);
  if (req.method !== 'POST' || ['/read', '/write', '/undo', '/cover', '/scan', '/check', '/lastfm', '/lyricsoffset'].indexOf(route) < 0) return send(res, 404, {ok: false, error: 'unbekannter Pfad'});
  var data = '', tooBig = false;
  req.setEncoding('utf8');
  req.on('data', function(d){ data += d; if (data.length > MAX_BODY) { tooBig = true; req.destroy(); } });
  req.on('end', function(){
    if (tooBig) return;
    var body;
    try { body = JSON.parse(data); } catch (e) { return send(res, 400, {ok: false, error: 'Ungültiges JSON'}); }
    var fn = {'/read': doRead, '/write': doWrite, '/cover': doCover, '/scan': doScan, '/undo': doUndo, '/check': doCheckStart, '/lastfm': doLastfm, '/lyricsoffset': doOffsetSet}[route];
    fn(body || {}, function(c, o){ send(res, c, o); });
  });
});

if (require.main === module) {
  server.listen(HTTP_PORT, function(){ console.log('tag-service auf Port ' + HTTP_PORT + ', Musik unter ' + MUSIC_ROOT); });
  if (process.env.HISTORY !== '0' && appConfig().HISTORY !== false) { recording = true; watchPlayer(); lfm.flush(); }
  setTimeout(function(){ albumsEnsure(); }, 90000);       /* Albenliste fürs Zufallsalbum vorbereiten */
  if (process.env.MOODTAGS !== '0' && appConfig().MOODTAGS !== false) {
    moodCollector.start();
    setInterval(function(){ albumsEnsure(); }, 3600000);  /* Titelliste aktuell halten (liest nur neu, wenn MPD sich geändert hat) */
  }
}
module.exports = {resolveUri: resolveUri, scanDirs: scanDirs, server: server, tracker: tracker, playStore: playStore, lastfm: lfm, moodtags: moodCollector};
