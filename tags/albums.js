/* Zufallsalbum: Albenliste der Bibliothek (aus MPD, einmal gelesen und gespeichert) und Auswahl,
   bevorzugt Alben, die lange nicht oder nie liefen. Node 8, nur ES5. */
var path  = require('path');
var plays = require('./plays.js');

var DAY = 86400;
var DISC_RE = /^(cd|dis[ck]|disco|seite|side|vol(ume)?)[\s._-]*\d+\b/i;     /* Unterordner einer Mehrfach-CD */
var RECENT_PICKS = 30;                                                     /* so viele zuletzt gezeigte nicht gleich wieder */

/* Ordner eines Titels; CD1/CD2-Unterordner zählen zum Album darüber */
function albumDir(file) {
  var d = path.dirname(String(file || ''));
  return DISC_RE.test(path.basename(d)) ? path.dirname(d) : d;
}

/* songs wie libcheck.mpdWalk -> [{dir, al, ar}] */
function fromSongs(songs) {
  var dirs = {}, order = [];
  songs.forEach(function(s){
    var d = albumDir(s.file);
    if (!dirs[d]) { dirs[d] = {al: '', aa: '', artists: {}, n: 0}; order.push(d); }
    var g = dirs[d];
    if (!g.al && s.album) g.al = s.album;
    if (!g.aa && s.albumartist) g.aa = s.albumartist;
    if (s.artist) g.artists[s.artist] = true;
    g.n++;
  });
  return order.sort().map(function(d){
    var g = dirs[d], artists = Object.keys(g.artists);
    return {dir: d, al: g.al || path.basename(d), ar: g.aa || (artists.length === 1 ? artists[0] : 'Verschiedene')};
  });
}

/* Verlauf -> wann zuletzt gelaufen: nach Ordner (lokal gespielt) und nach Album+Künstler (auch Last.fm) */
function lastIndex(list) {
  var byDir = {}, byKey = {}, byAlbum = {};
  list.forEach(function(e){
    if (e.u && !/^[a-z]+:\/\//.test(e.u)) {
      var d = albumDir(e.u.replace(/^\/+/, '').replace(/^music-library\//, '').replace(/^mnt\//, ''));
      if (!(byDir[d] >= e.t)) byDir[d] = e.t;
    }
    if (e.al) {
      var a = plays.norm(e.al), k = a + '|' + plays.norm(e.ar);
      if (!(byKey[k] >= e.t)) byKey[k] = e.t;
      if (!(byAlbum[a] >= e.t)) byAlbum[a] = e.t;
    }
  });
  return function(al) {
    var a = plays.norm(al.al), t = Math.max(byDir[al.dir] || 0, byKey[a + '|' + plays.norm(al.ar)] || 0,
                                             al.ar === 'Verschiedene' ? byAlbum[a] || 0 : 0);
    return t || null;
  };
}

/* Gewicht: nie gehört oder über ein Jahr her 4, über drei Monate 2, sonst 1 */
function weight(last, now) {
  if (!last || now - last > 365 * DAY) return 4;
  return now - last > 90 * DAY ? 2 : 1;
}

/* ein Album auswählen; last: lastIndex(Verlauf); picks: zuletzt gezeigte Ordner (wird ergänzt); rnd: Zufallszahl 0..1 (Tests) */
function pick(albums, last, now, picks, rnd) {
  if (!albums.length) return null;
  rnd = rnd || Math.random;
  var skip = {};
  (picks || []).forEach(function(d){ skip[d] = true; });
  var pool = albums.length > (picks || []).length ? albums.filter(function(a){ return !skip[a.dir]; }) : albums;
  /* Stichprobe statt alle gewichten: schnell auch bei vielen Tausend Alben */
  var cand = [], sum = 0;
  for (var i = 0; i < Math.min(40, pool.length); i++) {
    var a = pool[Math.floor(rnd() * pool.length)], l = last(a), w = weight(l, now);
    cand.push({a: a, last: l, w: w}); sum += w;
  }
  var r = rnd() * sum, c = cand[cand.length - 1];
  for (i = 0; i < cand.length; i++) { r -= cand[i].w; if (r < 0) { c = cand[i]; break; } }
  if (picks) { picks.push(c.a.dir); if (picks.length > RECENT_PICKS) picks.shift(); }
  return {dir: c.a.dir, al: c.a.al, ar: c.a.ar, last: c.last};
}

module.exports = {albumDir: albumDir, fromSongs: fromSongs, lastIndex: lastIndex, pick: pick, weight: weight};
