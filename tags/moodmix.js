/* Stimmungs-Mix: Titel der Bibliothek nach Stimmung, Energie und Stil auswählen (Grundlage: moodtags.Collector).
   Gewichtet nach dem Verlauf (Favoriten … versteckte Perlen); derselbe Künstler nie direkt hintereinander.
   Reichen die Treffer nicht, werden die Kriterien schrittweise gelockert. Node 8, nur ES5. */
var moodtags = require('./moodtags.js');

var MAX_N = 200;
var MIN_MATCHES = 20;            /* erst darunter werden die Kriterien gelockert */
var BPM_MIN = 40, BPM_MAX = 220;
var BPM_TOL = 8;                 /* ab Stufe 1: so viele BPM daneben zählen noch (halb) */

function list(s) {
  return String(s || '').split(',').map(function(x){ return x.trim().toLowerCase(); }).filter(Boolean);
}

/* Anfrage -> Kriterien */
function parse(q) {
  var emin = parseInt(q.emin, 10), emax = parseInt(q.emax, 10), n = parseInt(q.n, 10), disc = parseFloat(q.disc);
  emin = emin >= 1 && emin <= 5 ? emin : 1; emax = emax >= 1 && emax <= 5 ? emax : 5;
  if (emin > emax) { var x = emin; emin = emax; emax = x; }
  var bmin = parseInt(q.bmin, 10), bmax = parseInt(q.bmax, 10);    /* Tempo (Audio-Analyse); 0 = keine Grenze */
  bmin = bmin >= BPM_MIN && bmin <= BPM_MAX ? bmin : 0; bmax = bmax >= BPM_MIN && bmax <= BPM_MAX ? bmax : 0;
  if (bmin && bmax && bmin > bmax) { var y = bmin; bmin = bmax; bmax = y; }
  return {moods: list(q.moods), styles: list(q.styles), match: q.match === 'all' ? 'all' : 'any',
          emin: emin, emax: emax, bmin: bmin, bmax: bmax, n: Math.min(Math.max(n || 50, 1), MAX_N), disc: disc >= 0 && disc <= 1 ? disc : 0.5};
}

/* alle eingeordneten Titel mit Ergebnis; neu nur, wenn sich Bibliothek oder Tags geändert haben */
function index(coll) {
  var lib = coll.loadLib(), stamp = coll.libAt + ':' + coll.fetched + ':' + lib.length + ':' + (coll.audio ? (coll.audio.reload(), coll.audio.mtime) : 0);
  if (coll._mixIdx && coll._mixIdx.stamp === stamp) return coll._mixIdx.list;
  var out = [];
  lib.forEach(function(it){
    if (!it.f) return;
    var r = coll.moodOf(it.ar, it.ti, it.al);
    if (r) out.push({it: it, r: r});
  });
  coll._mixIdx = {stamp: stamp, list: out};
  return out;
}

/* Stufe 0: streng; 1: Energie ±1, Tempo ±8 BPM, Titel ohne Energie/Tempo; 2: zusätzlich Stile egal. -> Punktzahl oder 0 */
function fit(r, c, level) {
  var s = 1;
  if (c.moods.length) {
    var hit = r.mood.filter(function(m){ return c.moods.indexOf(m) >= 0; }).length;
    if (!hit) return 0;
    s = hit / Math.min(c.moods.length, 3) + (r.mood.length === hit ? 0.25 : 0);   /* reine Treffer etwas vorne */
  }
  var lo = c.emin - (level ? 1 : 0), hi = c.emax + (level ? 1 : 0);
  if (r.energy === null) { if (!level && (c.emin > 1 || c.emax < 5)) return 0; s *= 0.7; }
  else if (r.energy < lo || r.energy > hi) return 0;
  else if (r.energy < c.emin || r.energy > c.emax) s *= 0.5;
  if (c.bmin || c.bmax) {
    var blo = c.bmin || 0, bhi = c.bmax || 999, tol = level ? BPM_TOL : 0;
    if (r.bpm === null || r.bpm === undefined) { if (!level) return 0; s *= 0.6; }
    else if (r.bpm < blo - tol || r.bpm > bhi + tol) return 0;
    else if (r.bpm < blo || r.bpm > bhi) s *= 0.5;
  }
  if (c.styles.length && level < 2) {
    var sh = r.style.filter(function(x){ return c.styles.indexOf(x) >= 0; }).length;
    if (c.match === 'all' ? sh < c.styles.length : !sh) return 0;
    s *= 1 + 0.25 * sh;
  }
  return s * (r.src === 'artist' ? 0.6 : 1);
}

function candidates(all, c, level) {
  var out = [];
  all.forEach(function(x){ var s = fit(x.r, c, level); if (s) out.push({it: x.it, r: x.r, s: s}); });
  return out;
}

/* Trefferzahl (streng) und die Stile unter den Treffern ohne Stilfilter (für die Stil-Chips) */
function count(coll, c) {
  var all = index(coll), styles = {};
  var noStyle = {moods: c.moods, styles: [], match: 'any', emin: c.emin, emax: c.emax, bmin: c.bmin, bmax: c.bmax};
  var n = 0, bpm = 0;
  all.forEach(function(x){
    if (x.r.bpm) bpm++;
    if (!fit(x.r, noStyle, 0)) return;
    x.r.style.forEach(function(s){ styles[s] = (styles[s] || 0) + 1; });
    if (!c.styles.length || fit(x.r, c, 0)) n++;
  });
  return {count: n, rated: all.length, bpm: bpm,
          styles: Object.keys(styles).sort(function(a, b){ return styles[b] - styles[a] || (a < b ? -1 : 1); }).slice(0, 24)
            .map(function(s){ return [s, styles[s]]; })};
}

/* Verlauf -> Wiedergaben je Titel */
function playCounts(plays) {
  var pc = {};
  plays.forEach(function(e){ if (e.ar && e.ti) { var k = moodtags.trackKey(e.ar, e.ti); pc[k] = (pc[k] || 0) + 1; } });
  return pc;
}

/* Mix bauen. pc: playCounts(); rnd: Zufallszahl 0..1 (Tests) */
function build(coll, pc, c, rnd) {
  rnd = rnd || Math.random;
  var all = index(coll), level = 0, cand;
  for (;;) {
    cand = candidates(all, c, level);
    if (cand.length >= Math.min(c.n, MIN_MATCHES) || level === 2) break;   /* etwas weniger genaue Treffer: lieber ein kürzerer Mix */
    level++;
  }
  /* gewichtete Stichprobe: Favoriten (disc 0) bevorzugen oft Gespieltes, versteckte Perlen (disc 1) selten Gespieltes */
  var ex = 1 - 2 * c.disc;
  cand.forEach(function(x){
    var w = x.s * Math.pow(1 + (pc[x.it.k] || 0), ex);
    x.key = Math.pow(rnd() || 1e-9, 1 / w);
  });
  cand.sort(function(a, b){ return b.key - a.key; });
  /* je Künstler nur einige Titel; reicht das nicht, wird mit den übrigen aufgefüllt */
  var maxPer = Math.max(2, Math.ceil(c.n / 12)), per = {}, picked = [], skipped = [];
  for (var i = 0; i < cand.length && picked.length < c.n; i++) {
    var a = moodtags.artistKey(cand[i].it.ar);
    if ((per[a] || 0) >= maxPer) { skipped.push(cand[i]); continue; }
    per[a] = (per[a] || 0) + 1;
    picked.push(cand[i]);
  }
  picked = picked.concat(skipped.slice(0, c.n - picked.length));
  /* Reihenfolge: nie zweimal derselbe Künstler hintereinander, wenn es sich vermeiden lässt */
  var ordered = [], rest = picked.slice(), prev = null;
  while (rest.length) {
    var left = {}, top = null, j = 0;
    rest.forEach(function(x){ var k = moodtags.artistKey(x.it.ar); left[k] = (left[k] || 0) + 1; });
    Object.keys(left).forEach(function(k){ if (k !== prev && (!top || left[k] > left[top])) top = k; });
    if (top && left[top] * 2 >= rest.length) {                   /* ein Künstler dominiert den Rest: jetzt einsetzen */
      while (moodtags.artistKey(rest[j].it.ar) !== top) j++;
    } else {
      while (j < rest.length && moodtags.artistKey(rest[j].it.ar) === prev) j++;
      if (j === rest.length) j = 0;
    }
    var x = rest.splice(j, 1)[0];
    prev = moodtags.artistKey(x.it.ar);
    ordered.push(x);
  }
  return {level: level, matches: cand.length, tracks: ordered.map(function(x){
    return {f: x.it.f, ar: x.it.ar, ti: x.it.ti, al: x.it.al, d: x.it.d, mood: x.r.mood, energy: x.r.energy,
            style: x.r.style, src: x.r.src, bpm: x.r.bpm || null, key: x.r.key || null, plays: pc[x.it.k] || 0};
  })};
}

module.exports = {parse: parse, count: count, build: build, playCounts: playCounts, fit: fit};
