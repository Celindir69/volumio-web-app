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

/* songs wie libcheck.mpdWalk -> [{dir, al, ar, ge}]; ge: häufigstes Genre im Ordner (fehlt ohne Genre) */
function fromSongs(songs) {
  var dirs = {}, order = [];
  songs.forEach(function(s){
    var d = albumDir(s.file);
    if (!dirs[d]) { dirs[d] = {al: '', aa: '', artists: {}, genres: {}, n: 0}; order.push(d); }
    var g = dirs[d];
    if (!g.al && s.album) g.al = s.album;
    if (!g.aa && s.albumartist) g.aa = s.albumartist;
    if (s.artist) g.artists[s.artist] = true;
    if (s.genre) g.genres[s.genre] = (g.genres[s.genre] || 0) + 1;
    g.n++;
  });
  return order.sort().map(function(d){
    var g = dirs[d], artists = Object.keys(g.artists);
    var o = {dir: d, al: g.al || path.basename(d), ar: g.aa || (artists.length === 1 ? artists[0] : 'Verschiedene')};
    var ge = Object.keys(g.genres).sort(function(a, b){ return g.genres[b] - g.genres[a]; })[0];
    if (ge) o.ge = ge;
    return o;
  });
}

/* Albenliste -> genreOf(Verlaufseintrag): Genre über den Ordner, sonst Album+Künstler, bei Samplern nur Albumname */
function genreIndex(list) {
  var byDir = {}, byKey = {}, byAlbum = {};
  list.forEach(function(a){
    if (!a.ge) return;
    var k = plays.norm(a.al);
    byDir[a.dir] = a.ge; byKey[k + '|' + plays.norm(a.ar)] = a.ge;
    if (a.ar === 'Verschiedene') byAlbum[k] = a.ge;
  });
  return function(e) {
    if (e.u && !/^([a-z]+:\/\/|(tidal|qobuz|hra|highresaudio|hi_res_audio)\/|spotify:)/i.test(e.u)) {
      var g = byDir[albumDir(e.u.replace(/^\/+/, '').replace(/^music-library\//, '').replace(/^mnt\//, ''))];
      if (g) return g;
    }
    if (!e.al) return '';
    var k = plays.norm(e.al);
    return byKey[k + '|' + plays.norm(e.ar)] || byAlbum[k] || '';
  };
}

/* Verlauf -> wann zuletzt gelaufen: nach Ordner (lokal gespielt) und nach Album+Künstler (auch Last.fm) */
function lastIndex(list) {
  var byDir = {}, byKey = {}, byAlbum = {};
  list.forEach(function(e){
    if (e.u && !/^([a-z]+:\/\/|(tidal|qobuz|hra|highresaudio|hi_res_audio)\/|spotify:)/i.test(e.u)) {
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

/* aus pool einen Eintrag ziehen, gewichtet nach weight(lastOf(x)); keyOf(x): Schlüssel für picks (zuletzt gezeigt, wird ergänzt) */
function draw(pool, keyOf, lastOf, now, picks, rnd) {
  if (!pool.length) return null;
  rnd = rnd || Math.random;
  var skip = {};
  (picks || []).forEach(function(d){ skip[d] = true; });
  if (pool.length > (picks || []).length) pool = pool.filter(function(a){ return !skip[keyOf(a)]; });
  /* Stichprobe statt alle gewichten: schnell auch bei vielen Tausend Einträgen */
  var cand = [], sum = 0;
  for (var i = 0; i < Math.min(40, pool.length); i++) {
    var a = pool[Math.floor(rnd() * pool.length)], l = lastOf(a), w = weight(l, now);
    cand.push({a: a, last: l, w: w}); sum += w;
  }
  var r = rnd() * sum, c = cand[cand.length - 1];
  for (i = 0; i < cand.length; i++) { r -= cand[i].w; if (r < 0) { c = cand[i]; break; } }
  if (picks) { picks.push(keyOf(c.a)); if (picks.length > RECENT_PICKS) picks.shift(); }
  return c;
}

/* ein Album auswählen; last: lastIndex(Verlauf); picks: zuletzt gezeigte Ordner (wird ergänzt); rnd: Zufallszahl 0..1 (Tests) */
function pick(albums, last, now, picks, rnd) {
  var c = draw(albums, function(a){ return a.dir; }, last, now, picks, rnd);
  return c && {dir: c.a.dir, al: c.a.al, ar: c.a.ar, last: c.last};
}

/* Künstler der Bibliothek (Albumkünstler, ohne Sampler) -> [{ar, n: Alben, dir: ein Albumordner}] */
function artists(albums) {
  var by = {}, out = [];
  albums.forEach(function(a){
    if (!a.ar || a.ar === 'Verschiedene') return;
    var k = plays.norm(a.ar);
    if (!k) return;
    if (by[k]) by[k].n++; else { by[k] = {ar: a.ar, n: 1, dir: a.dir}; out.push(by[k]); }
  });
  return out;
}

/* Verlauf -> wann ein Künstler bzw. ein Titel zuletzt lief */
function lastArtistIndex(list) {
  var by = {};
  list.forEach(function(e){ var k = plays.norm(e.ar); if (!(by[k] >= e.t)) by[k] = e.t; });
  return function(a){ return by[plays.norm(a.ar)] || null; };
}
function lastTrackIndex(list) {
  var by = {};
  list.forEach(function(e){ var k = plays.trackKey(e); if (!(by[k] >= e.t)) by[k] = e.t; });
  return function(t){ return by[plays.norm(t[0]) + '|' + plays.norm(t[1])] || null; };
}

/* Zufallskünstler aus artists(); last: lastArtistIndex */
function pickArtist(list, last, now, picks, rnd) {
  var c = draw(list, function(a){ return plays.norm(a.ar); }, last, now, picks, rnd);
  return c && {ar: c.a.ar, n: c.a.n, dir: c.a.dir, last: c.last};
}

/* Zufallstitel aus library-tracks.json ([[Künstler, Titel, Datei, Sekunden, Album], …]); last: lastTrackIndex */
function pickTrack(tracks, last, now, picks, rnd) {
  var c = draw(tracks, function(t){ return t[2]; }, last, now, picks, rnd);
  return c && {ar: c.a[0], ti: c.a[1], f: c.a[2], d: c.a[3] || 0, al: c.a[4] || '', last: c.last};
}

module.exports = {albumDir: albumDir, fromSongs: fromSongs, genreIndex: genreIndex, lastIndex: lastIndex, pick: pick, weight: weight,
                  artists: artists, lastArtistIndex: lastArtistIndex, lastTrackIndex: lastTrackIndex, pickArtist: pickArtist, pickTrack: pickTrack};
