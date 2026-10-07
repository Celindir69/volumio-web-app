/* Stimmungs-Mix: Kriterien, Trefferzahl, Lockern, Verlaufsgewicht und Reihenfolge */
var assert = require('assert');
var mm = require('../tags/moodmix.js');
var n = 0;
function t(name, fn) { fn(); n++; console.log('ok   ' + name); }

/* Bibliothek: Künstler A–F, je 6 Titel; Stimmung, Energie und Stil fest vorgegeben */
var DATA = {
  A: {mood: ['relaxed'], energy: 2, style: ['ambient']},
  B: {mood: ['relaxed', 'dreamy'], energy: 2, style: ['trip-hop', 'electronic']},
  C: {mood: ['dreamy'], energy: 3, style: ['electronic']},
  D: {mood: ['happy'], energy: 4, style: ['pop']},
  E: {mood: ['relaxed'], energy: null, style: ['jazz']},
  F: {mood: ['dark'], energy: 5, style: ['metal'], src: 'artist'}
};
var lib = [];
Object.keys(DATA).forEach(function(a){ for (var i = 1; i <= 6; i++) lib.push({ar: a, ti: a + ' Titel ' + i, k: a.toLowerCase() + '|' + a.toLowerCase() + 'titel' + i, f: 'USB/' + a + '/' + i + '.flac', d: 200, al: 'Album ' + a}); });
var coll = {libAt: 1, fetched: 1, loadLib: function(){ return lib; }, moodOf: function(ar){
  var d = DATA[ar]; return {mood: d.mood, energy: d.energy, style: d.style, src: d.src || 'track'};
}};
var seed = 3;
function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }

t('Kriterien lesen: Grenzen und Standardwerte', function(){
  var c = mm.parse({moods: 'Relaxed, dreamy', emin: '4', emax: '2', n: '999', disc: '7', match: 'x'});
  assert.deepStrictEqual(c, {moods: ['relaxed', 'dreamy'], styles: [], match: 'any', emin: 2, emax: 4, n: 200, disc: 0.5});
  assert.deepStrictEqual(mm.parse({}), {moods: [], styles: [], match: 'any', emin: 1, emax: 5, n: 50, disc: 0.5});
});

t('Trefferzahl und Stile unter den Treffern', function(){
  var r = mm.count(coll, mm.parse({moods: 'relaxed', emin: 2, emax: 3}));
  assert.strictEqual(r.count, 12);                        /* A und B; E ohne Energie zählt bei eingeschränkter Energie nicht */
  assert.strictEqual(r.rated, 36);
  assert.deepStrictEqual(r.styles.map(function(s){ return s[0]; }), ['ambient', 'electronic', 'trip-hop']);
  assert.strictEqual(mm.count(coll, mm.parse({moods: 'relaxed', emin: 2, emax: 3, styles: 'electronic'})).count, 6);
  assert.strictEqual(mm.count(coll, mm.parse({moods: 'relaxed', emin: 2, emax: 3, styles: 'electronic,ambient', match: 'all'})).count, 0);
  assert.strictEqual(mm.count(coll, mm.parse({moods: 'relaxed'})).count, 18);   /* ganze Energie: E zählt mit */
});

t('Mix: nur passende Titel, gewünschte Länge, nie zweimal derselbe Künstler hintereinander', function(){
  var m = mm.build(coll, {}, mm.parse({moods: 'relaxed,dreamy', emin: 2, emax: 3, n: 10}), rnd);
  assert.strictEqual(m.level, 0);
  assert.strictEqual(m.tracks.length, 10);
  m.tracks.forEach(function(x, i){
    assert.ok(['A', 'B', 'C'].indexOf(x.ar) >= 0);
    if (i) assert.notStrictEqual(x.ar, m.tracks[i - 1].ar);
  });
  assert.ok(m.tracks[0].f && m.tracks[0].d === 200 && m.tracks[0].al);
});

t('Höchstens einige Titel je Künstler', function(){
  var m = mm.build(coll, {}, mm.parse({n: 12}), rnd);
  var per = {};
  m.tracks.forEach(function(x){ per[x.ar] = (per[x.ar] || 0) + 1; });
  Object.keys(per).forEach(function(a){ assert.ok(per[a] <= 2, a + ' ' + per[a]); });
});

t('zu wenige Treffer: Kriterien werden gelockert', function(){
  var m = mm.build(coll, {}, mm.parse({moods: 'relaxed', emin: 2, emax: 2, styles: 'ambient', n: 8}), rnd);
  assert.strictEqual(m.level, 2);                         /* Stufe 1 (E ohne Energie) reicht noch nicht, Stufe 2 lässt die Stile weg */
  assert.ok(m.tracks.some(function(x){ return x.ar === 'E'; }));
  var none = mm.build(coll, {}, mm.parse({moods: 'romantic', n: 5}), rnd);
  assert.strictEqual(none.tracks.length, 0);
});

t('genug genaue Treffer (ab 20): kürzerer Mix statt Lockern', function(){
  var m = mm.build(coll, {}, mm.parse({moods: 'relaxed,dreamy,happy', emin: 2, emax: 4, n: 50}), rnd);
  assert.strictEqual(m.level, 0);
  assert.strictEqual(m.tracks.length, 24);
});

t('Entdeckungsgrad: Favoriten bevorzugen Gespieltes, versteckte Perlen Ungespieltes', function(){
  var pc = {};
  lib.forEach(function(it){ if (it.ar === 'A') pc[it.k] = 40; });
  function share(disc) {
    var a = 0;
    for (var i = 0; i < 40; i++) {
      mm.build(coll, pc, mm.parse({moods: 'relaxed,dreamy', emin: 2, emax: 3, n: 4, disc: disc}), rnd).tracks
        .forEach(function(x){ if (x.ar === 'A') a++; });
    }
    return a / 160;
  }
  var fav = share(0), gem = share(1);
  assert.ok(fav > 0.4, 'Favoriten ' + fav);
  assert.ok(gem < 0.1, 'Perlen ' + gem);
});

t('Titel nur mit Künstler-Tags zählen schwächer', function(){
  var c = mm.parse({});
  assert.ok(mm.fit({mood: ['dark'], energy: 5, style: [], src: 'artist'}, c, 0) < mm.fit({mood: ['dark'], energy: 5, style: [], src: 'track'}, c, 0));
});

console.log(n + ' Prüfungen bestanden');
