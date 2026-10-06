/* Verlauf: Mitschreiben (Tracker), Speicher und Abgleich, Meistgespielt, Statistik, Ortszeit */
var assert = require('assert'), fs = require('fs'), path = require('path'), os = require('os');
var plays = require('../tags/plays.js');
var n = 0;
function t(name, fn) { fn(); n++; console.log('ok   ' + name); }

function st(status, title, seek, extra) {
  var s = {status: status, artist: 'Spliff', title: title, album: '85555', uri: 'music-library/USB/M/Spliff/' + title + '.flac',
           service: 'mpd', duration: 200, seek: seek};
  for (var k in extra || {}) s[k] = extra[k];
  return s;
}
function run(steps) {
  var got = [], started = [], tr = new plays.Tracker(function(e){ got.push(e); }, function(e){ started.push(e.ti); });
  steps.forEach(function(s){ tr.update(s[1], s[0] * 1000); });
  return {plays: got, started: started, tr: tr};
}
function every5(from, to, state) { var out = []; for (var s = from; s <= to; s += 5) out.push([s, state(s - from)]); return out; }

t('Titel zählt nach der Hälfte, Start = jetzt - seek', function(){
  var r = run(every5(1000, 1105, function(s){ return st('play', 'Carbonara', s * 1000); }).concat([[1110, st('play', 'Déjà vu', 0)]]));
  assert.strictEqual(r.plays.length, 1);
  assert.strictEqual(r.plays[0].ti, 'Carbonara');
  assert.strictEqual(r.plays[0].t, 1000);
  assert.strictEqual(r.plays[0].d, 200);
  assert.deepStrictEqual(r.started, ['Carbonara', 'Déjà vu']);
});
t('zu früh übersprungen zählt nicht', function(){
  var r = run(every5(1000, 1060, function(s){ return st('play', 'Carbonara', s * 1000); }).concat([[1065, st('play', 'Déjà vu', 0)]]));
  assert.strictEqual(r.plays.length, 0);
});
t('Pause zählt nicht als Spielzeit, Stopp schließt ab', function(){
  var steps = every5(1000, 1080, function(s){ return st('play', 'Carbonara', s * 1000); });
  steps = steps.concat(every5(1085, 2000, function(){ return st('pause', 'Carbonara', 80000); }));
  steps.push([2005, st('stop', 'Carbonara', 80000)]);
  assert.strictEqual(run(steps).plays.length, 0, '80 s von 200 s');
  steps = every5(1000, 1060, function(s){ return st('play', 'Carbonara', s * 1000); })
    .concat(every5(1065, 1500, function(){ return st('pause', 'Carbonara', 60000); }))
    .concat(every5(1505, 1555, function(s){ return st('play', 'Carbonara', 60000 + s * 1000); }));
  steps.push([1560, st('stop', 'Carbonara', 0)]);
  var r = run(steps);
  assert.strictEqual(r.plays.length, 1, '60 + 55 s');
  assert.strictEqual(r.plays[0].t, 1000);
});
t('Wiederholen desselben Titels = zwei Wiedergaben; Webradio und kurze Titel nie', function(){
  var steps = every5(1000, 1195, function(s){ return st('play', 'Carbonara', s * 1000); })
    .concat(every5(1200, 1300, function(s){ return st('play', 'Carbonara', s * 1000); }));
  steps.push([1305, st('stop', 'Carbonara', 0)]);
  assert.strictEqual(run(steps).plays.length, 2);
  var radio = every5(1000, 1400, function(s){ return st('play', 'Nachrichten', s * 1000, {service: 'webradio', duration: 0}); });
  radio.push([1405, st('stop', 'x', 0)]);
  assert.strictEqual(run(radio).plays.length, 0);
  var short = every5(1000, 1025, function(s){ return st('play', 'Intro', s * 1000, {duration: 25}); });
  short.push([1030, st('stop', 'x', 0)]);
  assert.strictEqual(run(short).plays.length, 0);
});
t('lange Titel zählen nach 4 Minuten; Lücken werden nicht voll angerechnet', function(){
  var steps = every5(1000, 1245, function(s){ return st('play', 'Lang', s * 1000, {duration: 1200}); });
  steps.push([1250, st('stop', 'Lang', 0)]);
  assert.strictEqual(run(steps).plays.length, 1);
  var gap = [[1000, st('play', 'Lang', 0, {duration: 1200})], [1600, st('play', 'Lang', 600000, {duration: 1200})], [1605, st('stop', 'Lang', 0)]];
  assert.strictEqual(run(gap).plays.length, 0, 'eine Abfrage 10 min später zählt höchstens 30 s');
});

var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plays-'));
var file = path.join(dir, 'sub', 'plays.jsonl');
t('Speicher: anhängen, laden, sortieren, Doppelte beim Abgleich erkennen', function(){
  var s = new plays.Store(file);
  assert.ok(s.add([{t: 2000, ar: 'Spliff', ti: 'Carbonara'}, {t: 3000, ar: 'Nena', ti: '99 Luftballons'}]));
  assert.ok(s.add([{t: 1000, ar: 'Spliff', ti: 'Heut Nacht', s: 'lastfm'}]));
  var again = new plays.Store(file).load();
  assert.deepStrictEqual(again.map(function(e){ return e.t; }), [1000, 2000, 3000]);
  var fresh = s.fresh([{t: 2100, ar: 'spliff', ti: 'CARBONARA'}, {t: 2500, ar: 'Spliff', ti: 'Carbonara'}, {t: 2550, ar: 'Spliff', ti: 'Carbonara'}, {t: 9000, ar: 'Nena', ti: 'Leuchtturm'}]);
  assert.deepStrictEqual(fresh.map(function(e){ return e.t; }), [2500, 9000], '±5 min gleich; auch innerhalb der Lieferung');
});

var NOW = Date.UTC(2026, 9, 6, 12) / 1000, H = 3600, D = 86400;
var list = [
  {t: NOW - 400 * D, ar: 'Nena', ti: 'Leuchtturm', al: '?', d: 240},
  {t: NOW - 20 * D, ar: 'Spliff', ti: 'Carbonara', al: '85555', u: 'music-library/USB/M/Spliff/85555/01.flac', d: 200},
  {t: NOW - 2 * D, ar: 'Spliff', ti: 'Carbonara', al: '85555', s: 'lastfm'},
  {t: NOW - 2 * D + 300, ar: 'Spliff', ti: 'Déjà vu', al: '85555', u: 'music-library/USB/M/Spliff/85555/02.flac', d: 300},
  {t: NOW - D, ar: 'Falco', ti: 'Jeanny', al: 'Bravo Hits', u: 'music-library/USB/M/Bravo/03.flac', d: 360},
  {t: NOW - D + 400, ar: 'Nena', ti: '99 Luftballons', al: 'Bravo Hits', u: 'music-library/USB/M/Bravo/04.flac', d: 230},
  {t: NOW - D + 800, ar: 'Spliff', ti: 'Heut Nacht', al: 'Bravo Hits', u: 'music-library/USB/M/Bravo/05.flac', d: 250},
  {t: NOW - H, ar: 'spliff', ti: 'carbonara', al: '85555', u: 'music-library/USB/M/Spliff/85555/01.flac', d: 200}
];
t('Meistgespielt: Titel, Künstler, Alben (Sampler zusammen), Zeitraum', function(){
  var tr = plays.top(list, 'track', plays.rangeStart('d30', NOW), 10);
  assert.strictEqual(tr[0].ti, 'carbonara', 'Schreibweise vom letzten Mal');
  assert.strictEqual(tr[0].n, 3);
  assert.strictEqual(tr[0].u, 'music-library/USB/M/Spliff/85555/01.flac');
  var ar = plays.top(list, 'artist', 0, 10);
  assert.deepStrictEqual(ar.map(function(x){ return x.n; }), [5, 2, 1]);
  var al = plays.top(list, 'album', plays.rangeStart('d30', NOW), 10);
  assert.strictEqual(al[0].ti, '85555'); assert.strictEqual(al[0].n, 4, 'auch der Last.fm-Eintrag ohne Datei');
  assert.strictEqual(al[1].ti, 'Bravo Hits'); assert.strictEqual(al[1].n, 3); assert.strictEqual(al[1].ar, 'Verschiedene');
  assert.strictEqual(al[1].u, 'music-library/USB/M/Bravo');
  assert.strictEqual(plays.recent(list, NOW - D, 2)[0].ti, 'Déjà vu');
});
t('Statistik: Summen, Tage, Tageszeit und Wochentag in Ortszeit', function(){
  var s = plays.stats(list, 'd30', NOW, {w: 60, s: 120});
  assert.strictEqual(s.plays, 7);
  assert.strictEqual(s.estimated, 1);
  assert.strictEqual(s.seconds, 200 + 250 + 300 + 360 + 230 + 250 + 200, 'unbekannte Dauer = Median');
  assert.strictEqual(s.buckets.length, 30);
  assert.strictEqual(s.buckets[29].k, '2026-10-06'); assert.strictEqual(s.buckets[29].n, 1);
  assert.strictEqual(s.buckets[28].n, 3);
  assert.strictEqual(s.hours[13], 1, '11 Uhr UTC = 13 Uhr Sommerzeit');
  assert.strictEqual(s.tracks, 5); assert.strictEqual(s.artists, 3);
  assert.strictEqual(s.weekdays[0], 3, 'Montag 5.10.'); assert.strictEqual(s.weekdays[1], 1, 'Dienstag 6.10.');
  var all = plays.stats(list, 'all', NOW, {w: 60, s: 120});
  assert.deepStrictEqual(all.buckets.map(function(b){ return b.k; }), ['2025', '2026']);
  assert.strictEqual(plays.stats(list, 'm12', NOW, {w: 60, s: 120}).buckets.length, 12);
});
t('Ortszeit: Umstellung Ende März und Ende Oktober', function(){
  var tz = {w: 60, s: 120};
  assert.strictEqual(plays.local(Date.UTC(2026, 2, 29, 0, 30) / 1000, tz).getUTCHours(), 1);
  assert.strictEqual(plays.local(Date.UTC(2026, 2, 29, 1, 30) / 1000, tz).getUTCHours(), 3);
  assert.strictEqual(plays.local(Date.UTC(2026, 9, 25, 0, 30) / 1000, tz).getUTCHours(), 2);
  assert.strictEqual(plays.local(Date.UTC(2026, 9, 25, 1, 30) / 1000, tz).getUTCHours(), 2);
});
console.log(n + ' Prüfungen');
