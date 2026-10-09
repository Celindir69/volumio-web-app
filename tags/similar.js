/* Mehr wie dieser Titel: Titel der Bibliothek mit ähnlicher Stimmung, Energie und ähnlichem Tempo (Audio-Analyse),
   dazu etwas Stil und Genre. Grundlage ist moodmix.index (Titel mit Stimmungsdaten). Node 8, nur ES5. */
var moodtags = require('./moodtags.js');

var MIN_SCORE = 0.35;            /* darunter ist ein Titel nicht mehr „ähnlich“ */
var BPM_SPAN = 24;               /* so viele BPM Abstand: Tempo zählt nicht mehr */

function jaccard(a, b) {
  a = a || []; b = b || [];
  if (!a.length || !b.length) return 0;
  var both = a.filter(function(x){ return b.indexOf(x) >= 0; }).length;
  return both / (a.length + b.length - both);
}

/* Tempo-Abstand, halbes und doppeltes Tempo zählen als gleich (90 und 180 BPM) */
function bpmGap(a, b) { return Math.min(Math.abs(a - b), Math.abs(a - 2 * b), Math.abs(2 * a - b)); }

/* Ähnlichkeit 0..1 zwischen Startpunkt s und Titel r ({mood, style, energy, bpm, src}); ge*: Genre der beiden */
function score(s, r, geS, geR) {
  var m = jaccard(s.mood, r.mood);
  if (s.mood && s.mood.length && !m) return 0;                    /* ohne gemeinsame Stimmung nicht ähnlich */
  var parts = s.mood && s.mood.length ? [[0.4, m]] : [];
  if (s.energy !== null && s.energy !== undefined) {
    parts.push([0.3, r.energy === null || r.energy === undefined ? 0.4 : Math.max(0, 1 - Math.abs(s.energy - r.energy) / 2.5)]);   /* 3 Stufen daneben: passt nicht */
  }
  if (s.bpm && r.bpm) parts.push([0.2, 1 - Math.min(bpmGap(s.bpm, r.bpm) / BPM_SPAN, 1)]);
  if (s.style && s.style.length) parts.push([0.15, jaccard(s.style, r.style)]);
  if (geS) parts.push([0.05, String(geS).toLowerCase() === String(geR || '').toLowerCase() ? 1 : 0]);
  var w = 0, v = 0;
  parts.forEach(function(p){ w += p[0]; v += p[0] * p[1]; });
  return (w ? v / w : 0) * (r.src === 'artist' ? 0.85 : 1);          /* nur Künstler-Tags: weniger sicher */
}

/* Startpunkt: Eintrag aus dem Index (Datei oder Künstler+Titel) oder Stimmungsdaten von moodOf */
function seedOf(idx, q, moodOf) {
  var f = q.f, k = moodtags.trackKey(q.ar, q.ti), hit = null;
  for (var i = 0; i < idx.length && !hit; i++) {
    var it = idx[i].it;
    if ((f && it.f && (it.f === f || it.f.replace(/^mnt\//, '') === f.replace(/^mnt\//, ''))) || it.k === k) hit = idx[i];
  }
  if (hit) return {it: hit.it, r: hit.r};
  var r = moodOf ? moodOf(q.ar, q.ti, q.al) : null;
  return r ? {it: {f: f || '', ar: q.ar, ti: q.ti, al: q.al || '', k: k, ge: q.ge || ''}, r: r} : null;
}

/* Ähnliche Titel: höchstens n, je Künstler höchstens maxPer, ohne den Titel selbst und skip(it);
   shuffle (Würfel): aus den besten 3n gewichtet gezogen statt der besten n, kürzlich Gehörtes (o.recent) zuletzt. -> {seed, items: [{it, r, s}]} */
function pick(idx, seed, o) {
  o = o || {};
  var n = o.n || 25, maxPer = o.maxPer || 2, rnd = o.rnd || Math.random;
  var s = seed.r, selfK = seed.it.k || moodtags.trackKey(seed.it.ar, seed.it.ti), seen = {};
  seen[selfK] = true;
  var cand = [];
  idx.forEach(function(x){
    if (seen[x.it.k] || (o.skip && o.skip(x.it))) return;
    seen[x.it.k] = true;
    var v = score(s, x.r, seed.it.ge, x.it.ge);
    if (v >= MIN_SCORE) cand.push({it: x.it, r: x.r, s: v});
  });
  cand.sort(function(a, b){ return b.s - a.s; });
  if (o.shuffle) {
    cand = cand.slice(0, n * 3);
    cand.forEach(function(x){                          /* Ähnlichere öfter, kürzlich Gehörtes (o.recent) nur zum Auffüllen */
      x.key = Math.pow(rnd() || 1e-9, 1 / (x.s * x.s)) - (o.recent && o.recent(x.it) ? 1 : 0);
    });
    cand.sort(function(a, b){ return b.key - a.key; });
  }
  var per = {}, out = [];
  for (var i = 0; i < cand.length && out.length < n; i++) {
    var a = moodtags.artistKey(cand[i].it.ar);
    if ((per[a] || 0) >= maxPer) continue;
    per[a] = (per[a] || 0) + 1;
    out.push(cand[i]);
  }
  return out;
}

/* Grund für die Anzeige: gemeinsame Stimmungen (höchstens zwei), Energie und Tempo des Titels */
function why(s, r) {
  return {mood: (r.mood || []).filter(function(m){ return (s.mood || []).indexOf(m) >= 0; }).slice(0, 2),
          energy: r.energy === undefined ? null : r.energy, bpm: r.bpm || null};
}

module.exports = {score: score, seedOf: seedOf, pick: pick, why: why, bpmGap: bpmGap, MIN_SCORE: MIN_SCORE};
