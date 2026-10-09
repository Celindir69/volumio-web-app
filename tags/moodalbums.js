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

module.exports = {summarize: summarize, fit: fit, list: list, SHARE: SHARE};
