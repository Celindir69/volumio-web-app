/* Entdecken: Reihen für die Suche ohne Eingabe (Zufällige Entdeckungen, Lange nicht gehört, Noch nie gehört,
   Früher oft gehört) je Künstler, Album oder Titel, und der Zufallsmix für den Würfel neben „Alle abspielen“.
   Node 8, nur ES5. */
var plays  = require('./plays.js');
var albums = require('./albums.js');

var DAY = 86400;
var ROW = 12;                                            /* Kacheln je Reihe */
var LONG = 180 * DAY;                                    /* lange nicht gehört: über ein halbes Jahr her */
var OLDFAV_GAP = 180 * DAY;                              /* früher oft gehört: seit einem halben Jahr nicht mehr */
var OLDFAV_MIN = {artist: 10, album: 5, track: 4};       /* … und mindestens so oft gehört */
var OLDFAV_POOL = 36;                                    /* aus den so vielen Meistgehörten wird gezogen */
var STREAM_RE = /^([a-z]+:\/\/|(tidal|qobuz|hra|highresaudio|hi_res_audio)\/|spotify:)/i;

function bump(map, k, t) {
  if (!k) return;
  var s = map[k] || (map[k] = {last: 0, n: 0});
  s.n++;
  if (t > s.last) s.last = t;
}

/* Verlauf -> Zähler {last, n} je Künstler, Album und Titel; NONE, wenn nie gehört */
var NONE = {last: 0, n: 0};
function statIndex(list) {
  var ar = {}, tr = {}, dir = {}, alk = {};
  list.forEach(function(e){
    bump(ar, plays.norm(e.ar), e.t);
    bump(tr, plays.trackKey(e), e.t);
    if (e.u && !STREAM_RE.test(e.u)) bump(dir, albums.albumDir(String(e.u).replace(/^\/+/, '').replace(/^music-library\//, '').replace(/^mnt\//, '')), e.t);
    if (e.al) bump(alk, plays.norm(e.al) + '|' + plays.norm(e.ar), e.t);
  });
  return {
    artist: function(a){ return ar[plays.norm(a.ar)] || NONE; },
    track:  function(t){ return tr[plays.norm(t[0]) + '|' + plays.norm(t[1])] || NONE; },
    album:  function(a){                                 /* Ordner (sicher) oder Album+Künstler (Last.fm-Einträge ohne Pfad), der größere Wert */
      var d = dir[a.dir] || NONE, k = alk[plays.norm(a.al) + '|' + plays.norm(a.ar)] || NONE;
      return d.n >= k.n ? {n: d.n, last: Math.max(d.last, k.last)} : {n: k.n, last: Math.max(d.last, k.last)};
    }
  };
}

/* k zufällige Einträge (ohne Wiederholung) */
function sample(arr, k, rnd) {
  rnd = rnd || Math.random;
  var a = arr.slice(), n = Math.min(k, a.length);
  for (var i = 0; i < n; i++) {
    var j = i + Math.floor(rnd() * (a.length - i)), x = a[i];
    a[i] = a[j]; a[j] = x;
  }
  return a.slice(0, n);
}

/* k Einträge, gewichtet wie das Zufallsalbum: nie oder lange nicht gehört öfter (albums.weight) */
function weighted(arr, statOf, now, k, rnd) {
  rnd = rnd || Math.random;
  var cand = sample(arr, k * 4, rnd).map(function(x){ return {x: x, w: albums.weight(statOf(x).last || null, now)}; }), out = [];
  while (out.length < k && cand.length) {
    var sum = 0, i;
    for (i = 0; i < cand.length; i++) sum += cand[i].w;
    var r = rnd() * sum;
    for (i = 0; i < cand.length - 1; i++) { r -= cand[i].w; if (r < 0) break; }
    out.push(cand.splice(i, 1)[0].x);
  }
  return out;
}

/* Eintrag für die Oberfläche */
function item(kind, x, s) {
  var o = kind === 'artist' ? {ar: x.ar, n: x.n, dir: x.dir}
        : kind === 'track' ? {ar: x[0], ti: x[1], f: x[2], d: x[3] || 0, al: x[4] || ''}
        : {dir: x.dir, al: x.al, ar: x.ar};
  o.plays = s.n;
  if (s.last) o.last = s.last;
  return o;
}

/* Reihen für kind (artist|album|track); ents: Künstler (albums.artists), Alben (albums.json) bzw. Titel (library-tracks.json) */
function shelves(kind, ents, stats, now, rnd) {
  var statOf = stats[kind], forgotten = [], never = [], often = [], min = OLDFAV_MIN[kind];
  ents.forEach(function(x){
    var s = statOf(x);
    if (!s.n) never.push(x);
    else if (now - s.last > LONG) forgotten.push(x);
    if (s.n >= min && now - s.last > OLDFAV_GAP) often.push(x);
  });
  often.sort(function(a, b){ return statOf(b).n - statOf(a).n; });
  var oldfav = sample(often.slice(0, OLDFAV_POOL), ROW, rnd).sort(function(a, b){ return statOf(b).n - statOf(a).n; });
  function out(list) { return list.map(function(x){ return item(kind, x, statOf(x)); }); }
  return [
    {id: 'random',    items: out(weighted(ents, statOf, now, ROW, rnd))},
    {id: 'forgotten', items: out(sample(forgotten, ROW, rnd).sort(function(a, b){ return statOf(a).last - statOf(b).last; }))},
    {id: 'never',     items: out(sample(never, ROW, rnd))},
    {id: 'oldfav',    items: out(oldfav)}
  ];
}

/* Zufallsmix: bis zu k Titel aus pool ([[Künstler, Titel, Datei, …], …]), rein zufällig, derselbe Künstler nie
   direkt hintereinander (außer es bleibt nur noch einer, z. B. auf der Künstlerseite); jede Datei höchstens einmal */
function mix(pool, k, rnd) {
  var seen = {}, a = sample(pool.filter(function(t){ return seen[t[2]] ? false : (seen[t[2]] = true); }), pool.length, rnd);
  var out = [], prev = null;
  while (out.length < k && a.length) {
    var idx = 0;
    for (var i = 0; i < a.length; i++) if (plays.norm(a[i][0]) !== prev) { idx = i; break; }
    var t = a.splice(idx, 1)[0];
    out.push(t);
    prev = plays.norm(t[0]);
  }
  return out;
}

/* Titel für den Mix: {artist} -> Titel des Künstlers und seiner Alben; {dirs: [...]} -> Titel dieser Albumordner */
function mixPool(tracks, albumList, q) {
  var dirs = {};
  (q.dirs || []).forEach(function(d){ dirs[String(d)] = true; });
  var want = q.artist ? plays.norm(q.artist) : '';
  if (want) (albumList || []).forEach(function(a){ if (plays.norm(a.ar) === want) dirs[a.dir] = true; });
  return tracks.filter(function(t){ return (want && plays.norm(t[0]) === want) || dirs[albums.albumDir(t[2])]; });
}

module.exports = {statIndex: statIndex, shelves: shelves, mix: mix, mixPool: mixPool, sample: sample, ROW: ROW};
