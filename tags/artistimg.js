/* Künstlerfotos von Deezer (ohne Schlüssel), einmal geladen und auf dem Player gespeichert.
   Last.fm liefert seit 2019 keine Künstlerfotos mehr, darum zeigt Volumio dort nur ein Symbol. Node 8, nur ES5. */
var fs     = require('fs');
var path   = require('path');
var crypto = require('crypto');
var coversearch = require('./coversearch.js');

var DEEZER   = process.env.DEEZER_URL || 'https://api.deezer.com';
var NONE_TTL = 30 * 86400 * 1000;      /* ohne Foto: nach 30 Tagen erneut fragen */
var PARALLEL = 2;                      /* gleichzeitige Abfragen bei Deezer */

function norm(s) {
  s = String(s || '');
  if (s.normalize) s = s.normalize('NFKD');
  return s.replace(/[̀-ͯ]/g, '').toLowerCase().replace(/^the\s+/, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');
}

/* dir: Ablage; opts.lookup(name, cb(Bild oder null, vorübergehend?), extra) ersetzt die Deezer-Künstlersuche,
   opts.noneTtl: so lange gilt "nichts gefunden", opts.max: höchstens so viele Dateien (älteste fliegen raus) */
function Store(dir, opts) {
  this.dir = dir; this.waiting = {}; this.queue = []; this.running = 0; this.writes = 0;
  opts = opts || {};
  if (opts.lookup) this.lookup = opts.lookup;
  this.noneTtl = opts.noneTtl || NONE_TTL;
  this.max = opts.max || 0;
  if (this.max) this.prune();
}

/* Ablage begrenzen: die ältesten Dateien löschen, bis höchstens max übrig sind */
Store.prototype.prune = function() {
  var dir = this.dir, max = this.max, list;
  if (!max) return 0;
  try { list = fs.readdirSync(dir); } catch (e) { return 0; }
  if (list.length <= max) return 0;
  list = list.map(function(n){
    try { return {n: n, t: fs.statSync(path.join(dir, n)).mtime.getTime()}; } catch (e) { return null; }
  }).filter(Boolean).sort(function(a, b){ return a.t - b.t; });
  var gone = 0;
  list.slice(0, list.length - max).forEach(function(f){
    try { fs.unlinkSync(path.join(dir, f.n)); gone++; } catch (e) { /* schon weg */ }
  });
  return gone;
};

Store.prototype.files = function(name) {
  var h = crypto.createHash('sha1').update(norm(name) || String(name)).digest('hex');
  return {img: path.join(this.dir, h + '.jpg'), none: path.join(this.dir, h + '.none')};
};

/* cb(null, Buffer) oder cb(null, null) wenn es kein Foto gibt; extra geht an lookup */
Store.prototype.get = function(name, cb, extra) {
  var self = this, f = this.files(name);
  fs.readFile(f.img, function(e, buf){
    if (!e) return cb(null, buf);
    var none = null, noneFor = '';
    try { none = fs.statSync(f.none); noneFor = fs.readFileSync(f.none, 'utf8'); } catch (x) { /* noch nie gesucht */ }
    /* "nichts gefunden" gilt, bis die Zeit um ist; eine neue Bildadresse (extra) wird trotzdem versucht */
    if (none && Date.now() - none.mtime.getTime() < self.noneTtl && (!extra || String(extra) === noneFor)) return cb(null, null);
    if (self.waiting[f.img]) return self.waiting[f.img].push(cb);
    self.waiting[f.img] = [cb];
    self.queue.push(function(done){
      self.lookup(name, function(buf, temporary){
        try { fs.mkdirSync(self.dir); } catch (x) { /* existiert schon */ }
        try {
          if (buf) { fs.writeFileSync(f.img, buf); try { fs.unlinkSync(f.none); } catch (x) { /* gab keins */ } }
          else if (!temporary) fs.writeFileSync(f.none, extra ? String(extra) : '');   /* Netzfehler nicht merken */
        } catch (x) { /* nächstes Mal neu */ }
        if (self.max && ++self.writes % 50 === 0) self.prune();
        var list = self.waiting[f.img]; delete self.waiting[f.img];
        list.forEach(function(c){ c(null, buf); });
        done();
      }, extra);
    });
    self.next();
  });
};

Store.prototype.next = function() {
  var self = this;
  while (this.running < PARALLEL && this.queue.length) {
    this.running++;
    this.queue.shift()(function(){ self.running--; self.next(); });
  }
};

/* cb(Bild oder null, vorübergehender Fehler?). Deezer: Künstler mit gleichem Namen (ohne Groß-/Kleinschreibung, Akzente, "The"); Platzhalterbild zählt nicht */
Store.prototype.lookup = function(name, cb) {
  coversearch.fetchUrl(DEEZER + '/search/artist?limit=10&q=' + encodeURIComponent(name), 256 * 1024, function(e, r){
    if (e) return cb(null, true);
    var list;
    try { list = JSON.parse(r.body.toString('utf8')).data; } catch (x) { return cb(null, true); }
    if (!Array.isArray(list)) return cb(null, true);              /* z. B. Fehlermeldung bei zu vielen Anfragen */
    var want = norm(name);
    var hit = list.filter(function(a){ return a && norm(a.name) === want; })
      .sort(function(a, b){ return (b.nb_fan || 0) - (a.nb_fan || 0); })[0];
    var u = hit && (hit.picture_big || hit.picture_medium);
    if (!u || /\/artist\/\/|\/images\/artist\/?$/.test(u)) return cb(null);
    coversearch.image(u, function(e2, img){ cb(e2 ? null : img.body, !!e2); });
  });
};

module.exports = {Store: Store, norm: norm};
