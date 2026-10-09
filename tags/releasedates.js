/* Erscheinungsdaten der Alben für die Geburtstage: volles Date-Tag aus den Dateien (albums.json: rd), sonst einmal bei
   MusicBrainz nachgeschlagen (Release-Group, erstes Erscheinen), höchstens eine Anfrage je STEP_MS.
   Gespeichert in releasedates.jsonl ({dir, d: 'JJJJ-MM-TT' oder '' = nicht gefunden, at}); nicht Gefundenes nach
   RETRY_DAYS erneut. Node 8, nur ES5. */
var fs = require('fs');
var coversearch = require('./coversearch.js');

var STEP_MS = 1500;              /* MusicBrainz erlaubt eine Anfrage je Sekunde */
var RETRY_DAYS = 90;
var MIN_SCORE = 90;
var MB = process.env.MB_URL || 'https://musicbrainz.org';
var DAY = 86400;

function full(d) { return /^\d{4}-\d\d-\d\d$/.test(d || '') ? d : ''; }
/* Vergleich der Titel: wie coversearch.key, aber Klammerzusätze zählen mit ("(Live)" ist ein anderes Album) */
function tkey(s) {
  s = String(s || '');
  if (s.normalize) s = s.normalize('NFKD');
  return s.replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/^the\s+/, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');
}
function quote(s) { return '"' + String(s || '').replace(/["\\]/g, '\\$&') + '"'; }

/* bester Treffer einer MusicBrainz-Antwort: Titel und Künstler passen, Datum vollständig, nicht jünger als das eigene Jahr */
function pickDate(j, al, ar, y) {
  var hit = ((j && j['release-groups']) || []).filter(function(g){
    var credit = (g['artist-credit'] || []).map(function(c){ return c.name || (c.artist && c.artist.name) || ''; }).join(' ');
    var d = full(g['first-release-date']);
    return (g.score || 0) >= MIN_SCORE && d && tkey(g.title) === tkey(al) &&
           coversearch.key(credit).indexOf(coversearch.key(ar)) >= 0 && !(y && +d.slice(0, 4) > y + 1);
  })[0];
  return hit ? hit['first-release-date'] : '';
}

/* opts: file, list() -> Albenliste (albums.json), getJson(url, cb) zum Testen, stepMs */
function Collector(opts) {
  this.file = opts.file; this.list = opts.list; this.stepMs = opts.stepMs || STEP_MS;
  this.getJson = opts.getJson || function(u, cb){
    coversearch.fetchUrl(u, 256 * 1024, function(e, r){
      if (e) return cb(e);
      try { cb(null, JSON.parse(r.body.toString('utf8'))); } catch (x) { cb(x); }
    });
  };
  this.by = {}; this.timer = null; this.running = false; this.fetched = 0; this.rev = 0;
  var self = this, txt = '';
  try { txt = fs.readFileSync(this.file, 'utf8'); } catch (e) { /* noch leer */ }
  txt.split('\n').forEach(function(l){ try { var o = l && JSON.parse(l); if (o && o.dir) self.by[o.dir] = o; } catch (x) { /* überspringen */ } });
}

/* Datum eines Albums: Date-Tag, sonst nachgeschlagen; '' unbekannt */
Collector.prototype.dateOf = function(a) { return full(a.rd) || (this.by[a.dir] && this.by[a.dir].d) || ''; };

/* nächstes Album ohne Datum, das noch nicht (oder vor RETRY_DAYS erfolglos) nachgeschlagen wurde */
Collector.prototype.next = function(now) {
  var list = this.list() || [];
  for (var i = 0; i < list.length; i++) {
    var a = list[i], r = this.by[a.dir];
    if (full(a.rd) || !a.al || !a.ar || a.ar === 'Verschiedene') continue;
    if (!r || (!r.d && now - r.at > RETRY_DAYS * DAY)) return a;
  }
  return null;
};

Collector.prototype.status = function() {
  var list = this.list() || [], self = this, n = 0;
  list.forEach(function(a){ if (self.dateOf(a)) n++; });
  return {albums: list.length, dated: n, fetched: this.fetched, running: this.running};
};

Collector.prototype.start = function() { if (!this.running) { this.running = true; this.schedule(this.stepMs); } };
Collector.prototype.stop = function() { this.running = false; clearTimeout(this.timer); };
Collector.prototype.schedule = function(ms) {
  var self = this;
  clearTimeout(this.timer);
  if (this.running) this.timer = setTimeout(function(){ self.step(); }, ms);
};

Collector.prototype.step = function(done) {
  var self = this, now = Math.floor(Date.now() / 1000), a = this.next(now);
  if (!(this.list() || []).length) { this.schedule(60000); return done && done(); }   /* Albenliste noch nicht gelesen */
  if (!a) { this.schedule(3600000); return done && done(); }           /* alles erledigt: stündlich nach neuen Alben sehen */
  var q = 'releasegroup:' + quote(a.al) + ' AND artist:' + quote(a.ar);
  this.getJson(MB + '/ws/2/release-group/?fmt=json&limit=5&query=' + encodeURIComponent(q), function(e, j){
    if (e) { self.schedule(60000); return done && done(e); }           /* Netz oder MusicBrainz weg: später weiter */
    var rec = {dir: a.dir, d: pickDate(j, a.al, a.ar, a.y), at: now};
    self.by[a.dir] = rec; self.fetched++; self.rev++;
    try { fs.appendFileSync(self.file, JSON.stringify(rec) + '\n'); } catch (x) { /* nächstes Mal */ }
    self.schedule(self.stepMs);
    if (done) done();
  });
};

/* Geburtstage zum Tag day ('JJJJ-MM-TT', Datum beim Hörer): heute, in dieser Woche (Montag bis Sonntag, ohne heute),
   in diesem Monat (ohne die Woche). dateOf(a) -> 'JJJJ-MM-TT' oder ''. Je Eintrag {dir, al, ar, y, date, years, mark}:
   mark 'jubilee' bei 25, 50, 75 … Jahren, 'round' bei 10, 20, 30 …; ausgezeichnete zuerst, sonst nach Tag. */
function birthdays(list, dateOf, day, limit) {
  var m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(day || '');
  if (!m) return {today: [], week: [], month: []};
  var Y = +m[1], M = +m[2], D = +m[3], t0 = Date.UTC(Y, M - 1, D);
  var wd = (new Date(t0).getUTCDay() + 6) % 7, mon = t0 - wd * DAY * 1000, sun = mon + 6 * DAY * 1000;
  var leap = (Y % 4 === 0 && Y % 100 !== 0) || Y % 400 === 0;
  var out = {today: [], week: [], month: []};
  list.forEach(function(a){
    var d = dateOf(a), x = /^(\d{4})-(\d\d)-(\d\d)$/.exec(d);
    if (!x) return;
    var years = Y - +x[1], mm = +x[2], dd = +x[3];
    if (years <= 0) return;
    if (mm === 2 && dd === 29 && !leap) dd = 28;
    var t = Date.UTC(Y, mm - 1, dd);
    var o = {dir: a.dir, al: a.al, ar: a.ar, date: d, years: years, mark: years % 25 === 0 ? 'jubilee' : years % 10 === 0 ? 'round' : ''};
    if (a.y) o.y = a.y;
    if (t === t0) out.today.push(o);
    else if (t >= mon && t <= sun) out.week.push(o);
    else if (mm === M) out.month.push(o);
  });
  var rank = {jubilee: 0, round: 1, '': 2};
  Object.keys(out).forEach(function(k){
    out[k].sort(function(a, b){ return rank[a.mark] - rank[b.mark] || a.date.slice(5).localeCompare(b.date.slice(5)) || b.years - a.years; });
    out[k] = out[k].slice(0, limit || 24);
  });
  return out;
}

/* Bibliotheks-Check: Alben, deren Date-Tag vom Erscheinungsdatum bei MusicBrainz abweicht (anderes Jahr, anderes volles
   Datum oder gar keins). Nur ein Jahr im Tag, das zum Jahr bei MusicBrainz passt, gilt als stimmig.
   albumList: albums.fromSongs(songs); songs: wie mpdWalk; mbOf(dir) -> 'JJJJ-MM-TT' oder ''; albumDir wie albums.albumDir
   -> [{dir, name, artist, count, tag, mb, files: [{uri, title}]}] */
function diffs(albumList, songs, mbOf, albumDir) {
  var byDir = {};
  songs.forEach(function(s){ var d = albumDir(s.file); (byDir[d] || (byDir[d] = [])).push(s); });
  var out = [];
  albumList.forEach(function(a){
    var mb = mbOf(a.dir), tag = full(a.rd) || (a.y ? String(a.y) : '');
    if (!mb || (tag && tag.slice(0, 4) === mb.slice(0, 4) && (tag.length === 4 || tag === mb))) return;
    var list = byDir[a.dir] || [];
    out.push({dir: a.dir, name: a.al, artist: a.ar, count: list.length, tag: tag, mb: mb,
              files: list.map(function(s){ return {uri: s.file, title: s.title || s.file.replace(/^.*\//, '')}; })});
  });
  return out.sort(function(a, b){ return a.artist.localeCompare(b.artist) || a.name.localeCompare(b.name); });
}

module.exports = {Collector: Collector, birthdays: birthdays, pickDate: pickDate, diffs: diffs};
