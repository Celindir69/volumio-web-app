/* Alben nach Stimmung, Energie und Stil (Suchen & Entdecken): die eingeordneten Titel je Album zusammengefasst.
   Ein Album gehört zu einer Stimmung bzw. einem Stil, wenn mindestens die Hälfte seiner eingeordneten Titel sie trägt
   (bei mehreren Stilen eines Knopfs: einer davon); seine Energie ist der gerundete Mittelwert. Node 8, nur ES5. */
var albums = require('./albums.js');

var SHARE = 0.5;                 /* „überwiegend“ */
var MIN_TRACKS = 2;              /* so viele eingeordnete Titel braucht ein Album mindestens */

function rel(f) { return String(f || '').replace(/^\/+/, '').replace(/^music-library\//, '').replace(/^mnt\//, ''); }

/* idx: [{it: {f}, r: {mood, energy, style}}] (moodmix.index) -> {Ordner: {n, moods: [[…] je Titel], styles: [[…] je Titel], eSum, eN}} */
function summarize(idx) {
  var by = {};
  idx.forEach(function(x){
    if (!x.it.f) return;
    var d = albums.albumDir(rel(x.it.f)), s = by[d] || (by[d] = {n: 0, moods: [], styles: [], eSum: 0, eN: 0});
    s.n++;
    s.moods.push(x.r.mood || []);
    s.styles.push(x.r.style || []);
    if (typeof x.r.energy === 'number') { s.eSum += x.r.energy; s.eN++; }
  });
  return by;
}

/* Anteil der Titel mit mindestens einer der Stimmungen bzw. einem der Stile */
function share(perTrack, keys, n) {
  var hit = 0;
  perTrack.forEach(function(list){ if (list.some(function(k){ return keys.indexOf(k) >= 0; })) hit++; });
  return hit / n;
}

/* q: {moods: [], styles: [], emin, emax} -> passt das Album? Gibt den Anteil (0..1) zurück, 0 = passt nicht */
function fit(s, q) {
  if (!s || s.n < MIN_TRACKS) return 0;
  var sh = 1;
  if (q.moods && q.moods.length) { sh = share(s.moods, q.moods, s.n); if (sh < SHARE) return 0; }
  if (q.styles && q.styles.length) { var st = share(s.styles, q.styles, s.n); if (st < SHARE) return 0; sh = Math.min(sh, st); }
  if (q.emin || q.emax) {
    if (!s.eN) return 0;
    var e = Math.round(s.eSum / s.eN);
    if (e < (q.emin || 1) || e > (q.emax || 5)) return 0;
  }
  return sh;
}

/* passende Alben der Albenliste, nach Künstler und Album sortiert (wie die Genre-Seite) */
function list(sums, albumList, q) {
  function key(a) { return (a.ar === 'Verschiedene' ? '￿' : '') + a.ar.toLowerCase().replace(/^the\s+/, ''); }
  return albumList.filter(function(a){ return fit(sums[a.dir], q) > 0; })
    .map(function(a){ var o = {dir: a.dir, al: a.al, ar: a.ar}; if (a.y) o.y = a.y; return o; })
    .sort(function(a, b){ return key(a).localeCompare(key(b)) || a.al.localeCompare(b.al); });
}

/* „Mehr entdecken“ auf der Künstlerseite: Stimmungen und Stile, die mindestens PROFILE_SHARE seiner eingeordneten Titel
   tragen (die häufigsten zuerst, je höchstens PROFILE_MAX), mittlere Energie und die Jahrzehnte seiner Alben.
   idx: moodmix.index; albumList: albums.json; key: Künstler normiert (plays.norm) -> {n, moods, styles, energy, decades} */
var PROFILE_SHARE = 0.2, PROFILE_MAX = 5;
function artistProfile(idx, albumList, key, norm) {
  var n = 0, moods = {}, styles = {}, eSum = 0, eN = 0, dec = {};
  idx.forEach(function(x){
    if (norm(x.it.ar) !== key) return;
    n++;
    (x.r.mood || []).forEach(function(m){ moods[m] = (moods[m] || 0) + 1; });
    (x.r.style || []).forEach(function(s){ styles[s] = (styles[s] || 0) + 1; });
    if (typeof x.r.energy === 'number') { eSum += x.r.energy; eN++; }
  });
  (albumList || []).forEach(function(a){ if (a.y && norm(a.ar) === key) dec[Math.floor(a.y / 10) * 10] = true; });
  function top(o) {
    return Object.keys(o).filter(function(k){ return o[k] >= Math.max(1, n * PROFILE_SHARE); })
      .sort(function(a, b){ return o[b] - o[a] || (a < b ? -1 : 1); }).slice(0, PROFILE_MAX);
  }
  return {n: n, moods: top(moods), styles: top(styles), energy: eN ? Math.round(eSum / eN) : 0,
          decades: Object.keys(dec).map(Number).sort(function(a, b){ return a - b; })};
}

/* Entdecken zu einem Jahrzehnt (Jahres- und Jahrzehnt-Seite): Künstler mit Alben darin (die mit den meisten zuerst),
   häufige Stimmungen und Stile der Titel darin (Anteil mindestens PROFILE_SHARE), Nachbar-Jahrzehnte mit Alben.
   idx: moodmix.index; albumList: albums.json; albumDir: Ordner eines Titels -> {n, artists, moods, styles, decades} */
var DECADE_ARTISTS = 24;
function decadeProfile(idx, albumList, d, albumDir) {
  var inDec = {}, artists = {}, names = {}, has = {};
  (albumList || []).forEach(function(a){
    if (!a.y) return;
    var dd = a.y - a.y % 10;
    has[dd] = true;
    if (dd !== d) return;
    inDec[a.dir] = true;
    if (a.ar === 'Verschiedene' || !a.ar) return;
    var k = a.ar.toLowerCase();
    artists[k] = (artists[k] || 0) + 1;
    names[k] = names[k] || a.ar;
  });
  var n = 0, moods = {}, styles = {};
  idx.forEach(function(x){
    if (!inDec[albumDir(String(x.it.f || '').replace(/^mnt\//, ''))]) return;
    n++;
    (x.r.mood || []).forEach(function(m){ moods[m] = (moods[m] || 0) + 1; });
    (x.r.style || []).forEach(function(s){ styles[s] = (styles[s] || 0) + 1; });
  });
  function top(o, k, share) {
    return Object.keys(o).filter(function(x){ return o[x] >= Math.max(1, n * share); })
      .sort(function(a, b){ return o[b] - o[a] || (a < b ? -1 : 1); }).slice(0, k);
  }
  return {n: n, artists: top(artists, DECADE_ARTISTS, 0).map(function(k){ return names[k]; }),
          moods: top(moods, 6, PROFILE_SHARE / 2), styles: top(styles, 6, PROFILE_SHARE / 2),
          decades: [d - 10, d, d + 10].filter(function(x){ return has[x]; })};
}

module.exports = {summarize: summarize, fit: fit, list: list, artistProfile: artistProfile, decadeProfile: decadeProfile, SHARE: SHARE};
