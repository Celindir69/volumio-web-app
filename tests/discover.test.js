/* Entdecken-Reihen und Zufallsmix (tags/discover.js) */
var assert = require('assert');
var d = require('../tags/discover.js');
var n = 0;
function t(name, fn) { fn(); n++; console.log('ok   ' + name); }
var DAY = 86400, NOW = 2000000000;
var seed = 1; function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }

/* Bibliothek: 30 Alben, je Album 4 Titel; Künstler A0..A9 */
var albumList = [], tracks = [];
for (var i = 0; i < 30; i++) {
  var ar = 'A' + (i % 10), dir = 'USB/' + ar + '/Album ' + i;
  albumList.push({dir: dir, al: 'Album ' + i, ar: ar});
  for (var k = 0; k < 4; k++) tracks.push([ar, 'Titel ' + i + '-' + k, dir + '/0' + k + '.flac', 200, 'Album ' + i]);
}
/* Verlauf: Album 0 vor zwei Jahren 8×, Album 1 gestern, Album 2 vor 400 Tagen einmal (nur Last.fm, ohne Pfad) */
var pl = [];
for (k = 0; k < 8; k++) pl.push({t: NOW - 730 * DAY + k, ar: 'A0', ti: 'Titel 0-0', al: 'Album 0', u: 'USB/A0/Album 0/00.flac'});
pl.push({t: NOW - 400 * DAY, ar: 'A2', ti: 'Titel 2-1', al: 'Album 2'});
pl.push({t: NOW - DAY, ar: 'A1', ti: 'Titel 1-0', al: 'Album 1', u: 'mnt/USB/A1/Album 1/00.flac'});
pl.sort(function(a, b){ return a.t - b.t; });
var st = d.statIndex(pl);

t('Zähler je Album: über den Ordner und ohne Pfad über Album+Künstler', function(){
  assert.deepStrictEqual(st.album(albumList[0]), {n: 8, last: NOW - 730 * DAY + 7});
  assert.strictEqual(st.album(albumList[1]).n, 1);
  assert.strictEqual(st.album(albumList[2]).last, NOW - 400 * DAY);
  assert.strictEqual(st.album(albumList[5]).n, 0);
});

t('Album-Reihen: lange nicht, nie, früher oft, Zufall', function(){
  var sh = d.shelves('album', albumList, st, NOW, rnd), by = {};
  sh.forEach(function(s){ by[s.id] = s.items; });
  assert.deepStrictEqual(sh.map(function(s){ return s.id; }), ['random', 'forgotten', 'never', 'oldfav']);
  assert.deepStrictEqual(by.forgotten.map(function(x){ return x.al; }), ['Album 0', 'Album 2']);     /* am längsten her zuerst */
  assert.strictEqual(by.never.length, 12);
  assert.ok(by.never.every(function(x){ return x.plays === 0 && !x.last && ['Album 0', 'Album 1', 'Album 2'].indexOf(x.al) < 0; }));
  assert.deepStrictEqual(by.oldfav.map(function(x){ return [x.al, x.plays]; }), [['Album 0', 8]]);
  assert.strictEqual(by.random.length, 12);
  assert.strictEqual(new Set(by.random.map(function(x){ return x.dir; })).size, 12);
});

t('Titel- und Künstler-Reihen', function(){
  var sh = d.shelves('track', tracks, st, NOW, rnd);
  assert.deepStrictEqual(sh[1].items.map(function(x){ return x.ti; }), ['Titel 0-0', 'Titel 2-1']);
  assert.deepStrictEqual(sh[3].items.map(function(x){ return x.ti; }), ['Titel 0-0']);              /* 8× gehört */
  assert.ok(sh[2].items.every(function(x){ return x.f && x.plays === 0; }));
  var arts = [];
  for (i = 0; i < 10; i++) arts.push({ar: 'A' + i, n: 3, dir: 'USB/A' + i + '/Album ' + i});
  var sa = d.shelves('artist', arts, st, NOW, rnd);
  assert.strictEqual(sa[2].items.length, 7);                                                         /* A0, A1, A2 gehört */
  assert.deepStrictEqual(sa[1].items.map(function(x){ return x.ar; }), ['A0', 'A2']);
});

t('Zufallsmix: 25 Titel, nie derselbe Künstler direkt hintereinander, keine Datei doppelt', function(){
  for (var r = 0; r < 20; r++) {
    var m = d.mix(tracks.concat(tracks.slice(0, 10)), 25, rnd);
    assert.strictEqual(m.length, 25);
    assert.strictEqual(new Set(m.map(function(x){ return x[2]; })).size, 25);
    for (var j = 1; j < m.length; j++) assert.notStrictEqual(m[j][0], m[j - 1][0]);
  }
});

t('Zufallsmix für einen Künstler: alle seine Titel, auch hintereinander', function(){
  var pool = d.mixPool(tracks, albumList, {artist: 'a3'});
  assert.strictEqual(pool.length, 12);
  assert.strictEqual(d.mix(pool, 25, rnd).length, 12);
});

t('Zufallsmix für Albumordner (Genre-Liste)', function(){
  var pool = d.mixPool(tracks, albumList, {dirs: ['USB/A1/Album 1', 'USB/A2/Album 12']});
  assert.deepStrictEqual(pool.map(function(x){ return x[4]; }).sort(), ['Album 1', 'Album 1', 'Album 1', 'Album 1', 'Album 12', 'Album 12', 'Album 12', 'Album 12']);
});
console.log(n + ' Prüfungen');
