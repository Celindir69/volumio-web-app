/* Genre-Vorschläge: Zuordnungstabelle, Audio-Mehrheit je Album, Check-Gruppen */
var assert = require('assert');
var g = require('../tags/genres.js'), lc = require('../tags/libcheck.js'), n = 0;
function t(name, fn) { fn(); n++; console.log('ok   ' + name); }
function A(styles) { return {styles: styles}; }

t('Schlüssel und Tabelle', function(){
  assert.strictEqual(g.genreKey('Hip-Hop'), 'hiphop');
  assert.strictEqual(g.genreKey('R&B'), 'randb');
  assert.deepStrictEqual(g.topsOf('Trip-Hop'), ['Electronic']);
  assert.deepStrictEqual(g.topsOf('Klassik'), ['Classical']);
  assert.deepStrictEqual(g.topsOf('Hörspiel'), ['Non-Music']);
  assert.deepStrictEqual(g.topsOf('Folk, World, & Country'), ['Folk, World, & Country']);
  assert.deepStrictEqual(g.topsOf('Pop/Rock'), ['Rock', 'Pop']);         /* als Ganzes in der Tabelle */
  assert.deepStrictEqual(g.topsOf('Jazz; Blues'), ['Jazz', 'Blues']);    /* zerlegt */
  assert.deepStrictEqual(g.topsOf('Irgendwas'), []);
});

t('Unterstile aus der Audio-Analyse lernen', function(){
  var subs = g.learnStyles([A([['Electronic---Synthwave', 0.4], ['Rock---Krautrock', 0.2]])]);
  assert.deepStrictEqual(g.topsOf('Synthwave', subs), ['Electronic']);
});

t('Audio: Mehrheit über das Album, Unterstile der Gewinner-Kategorie', function(){
  var v = g.audioVote([A([['Electronic---Trip Hop', 0.5], ['Electronic---Downtempo', 0.3], ['Rock---Indie Rock', 0.2]]),
                       A([['Rock---Indie Rock', 0.6], ['Electronic---Trip Hop', 0.4]]),
                       A([['Electronic---Trip Hop', 0.9]]), A([])]);
  assert.strictEqual(v.tracks, 3);
  assert.strictEqual(v.order[0], 'Electronic');
  assert.deepStrictEqual(v.subs, ['Trip Hop', 'Downtempo']);
});

t('Vorschlag: Tabelle, mehrdeutig mit Audio, nur Audio, nichts', function(){
  var el = g.audioVote([A([['Electronic---Synth-pop', 0.8], ['Pop---Synth-pop', 0.2]])]);
  assert.deepStrictEqual(g.suggest({'Trip-Hop': 3}, null), {genre: 'Electronic', how: 'table', share: null});
  assert.strictEqual(g.suggest({'Synth Pop': 3}, null).genre, 'Electronic');
  assert.deepStrictEqual(g.suggest({'Indie': 3}, el), {genre: 'Pop', how: 'both', share: 0.2});   /* Rock oder Pop: Audio sagt Pop */
  var pop = g.audioVote([A([['Pop---Ballad', 0.7], ['Rock---Soft Rock', 0.3]])]);
  assert.deepStrictEqual(g.suggest({'Indie': 3}, pop), {genre: 'Pop', how: 'both', share: 0.7});
  assert.deepStrictEqual(g.suggest({}, el), {genre: 'Electronic', how: 'audio', share: 0.8});
  assert.strictEqual(g.suggest({'Irgendwas': 2}, null), null);
  var weak = g.audioVote([A([['Rock---Punk', 0.2], ['Pop---Ballad', 0.2], ['Jazz---Swing', 0.2], ['Latin---Salsa', 0.2], ['Blues---Delta Blues', 0.2]])]);
  assert.strictEqual(g.suggest({}, weak), null);                        /* zu unsicher */
});

function S(file, o) { var s = {file: file, artist: 'X', albumartist: '', album: '', title: file, track: '1', date: '', genre: ''}; for (var k in o) s[k] = o[k]; return s; }
var songs = [
  S('M/A/1.flac', {album: 'A', genre: 'Trip-Hop'}), S('M/A/2.flac', {album: 'A', genre: 'TripHop'}),
  S('M/B/1.flac', {album: 'B', genre: 'Trip Hop'}),
  S('M/C/1.flac', {album: 'C'}), S('M/C/2.flac', {album: 'C'}),
  S('M/D/1.flac', {album: 'D', genre: 'Rock'}),
  S('M/E/1.flac', {album: 'E'})
];
var audio = {'M/C/1.flac': A([['Jazz---Cool Jazz', 0.9]]), 'M/C/2.flac': A([['Jazz---Bop', 0.6], ['Blues---Delta Blues', 0.4]]),
             'M/D/1.flac': A([['Rock---Punk', 0.9]])};
var r = lc.analyze(songs, function(){ return true; }, function(s){ return audio[s.file] || null; });

t('Check: ohne Genre mit Vorschlag zuerst, ohne Audio ohne Vorschlag', function(){
  assert.deepStrictEqual(r.genreMissing.map(function(x){ return [x.dir, x.genre]; }), [['M/C', 'Jazz'], ['M/E', null]]);
  assert.deepStrictEqual(r.genreMissing[0].subs, ['Cool Jazz', 'Bop']);
  assert.strictEqual(r.genreMissing[0].files.length, 2);
});

t('Check: Schreibweisen zusammengefasst, passende Alben nicht gelistet', function(){
  assert.deepStrictEqual(r.genreMerge.map(function(x){ return [x.from, x.genre, x.albums.length, x.files.length]; }),
    [['Trip Hop', 'Electronic', 1, 1], ['Trip-Hop / TripHop', 'Electronic', 1, 2]]);
});

t('Check: Unterstile je Album nur im Ergebnis', function(){
  assert.deepStrictEqual(r.genreStyles['M/D'], {genre: 'Rock', share: 1, subs: ['Punk']});
});

console.log(n + ' Prüfungen bestanden');
