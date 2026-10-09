/* Alben nach Stimmung, Energie und Stil (tags/moodalbums.js) */
var assert = require('assert');
var ma = require('../tags/moodalbums.js');
var n = 0;
function t(name, fn) { fn(); n++; console.log('ok   ' + name); }
function tr(dir, i, mood, energy, style) { return {it: {f: 'mnt/USB/' + dir + '/' + i + '.flac'}, r: {mood: mood, energy: energy, style: style}}; }
var idx = [
  tr('A/Ruhig', 1, ['relaxed'], 2, ['ambient']), tr('A/Ruhig', 2, ['relaxed', 'dreamy'], 1, ['ambient']), tr('A/Ruhig', 3, ['dark'], 2, ['downtempo']),
  tr('B/Laut', 1, ['intense'], 5, ['house']), tr('B/Laut', 2, ['epic'], 4, ['techno']), tr('B/Laut', 3, ['relaxed'], null, ['rock']),
  tr('C/Single', 1, ['relaxed'], 2, ['ambient'])
];
var albumList = [{dir: 'USB/A/Ruhig', al: 'Ruhig', ar: 'Alpha', y: 1999}, {dir: 'USB/B/Laut', al: 'Laut', ar: 'Beta'}, {dir: 'USB/C/Single', al: 'Single', ar: 'Gamma'}];
var sums = ma.summarize(idx);
function names(q) { return ma.list(sums, albumList, q).map(function(a){ return a.al; }); }

t('Stimmung: überwiegend (mindestens die Hälfte der eingeordneten Titel), Einzeltitel-Alben nicht', function(){
  assert.deepStrictEqual(names({moods: ['relaxed']}), ['Ruhig']);
  assert.deepStrictEqual(names({moods: ['dark']}), []);
  assert.deepStrictEqual(names({moods: ['intense', 'epic']}), ['Laut']);
});

t('Stil: ein Knopf mit mehreren verwandten Stilen zählt jeden Titel einmal', function(){
  assert.deepStrictEqual(names({styles: ['house', 'techno']}), ['Laut']);
  assert.deepStrictEqual(names({styles: ['house']}), []);
  assert.deepStrictEqual(names({styles: ['ambient', 'downtempo']}), ['Ruhig']);
});

t('Energie: gerundeter Mittelwert der Titel mit Energie', function(){
  assert.deepStrictEqual(names({emin: 1, emax: 2}), ['Ruhig']);
  assert.deepStrictEqual(names({emin: 4, emax: 5}), ['Laut']);
  assert.deepStrictEqual(names({emin: 3, emax: 3}), []);
  assert.deepStrictEqual(ma.list(sums, albumList, {emin: 1, emax: 2})[0], {dir: 'USB/A/Ruhig', al: 'Ruhig', ar: 'Alpha', y: 1999});
});

t('Profil eines Künstlers: häufige Stimmungen und Stile, mittlere Energie, Jahrzehnte seiner Alben', function(){
  function a(ar, mood, energy, style) { return {it: {ar: ar, f: 'x'}, r: {mood: mood, energy: energy, style: style}}; }
  var ix = [a('Alpha', ['relaxed', 'dreamy'], 2, ['ambient']), a('Alpha', ['relaxed'], 1, ['ambient', 'downtempo']),
            a('Alpha', ['relaxed'], 2, ['ambient']), a('Alpha', ['dark'], 3, []), a('alpha', ['relaxed'], null, ['ambient']),
            a('Beta', ['intense'], 5, ['house'])];
  for (var i = 0; i < 6; i++) ix.push(a('Alpha', [], null, []));          /* Titel ohne Stimmung zählen mit */
  var al = albumList.concat([{dir: 'USB/A/Neu', al: 'Neu', ar: 'Alpha', y: 2004}, {dir: 'USB/A/Alt', al: 'Alt', ar: 'alpha', y: 1971}]);
  var norm = function(s){ return String(s).toLowerCase(); };
  var p = ma.artistProfile(ix, al, 'alpha', norm);
  assert.strictEqual(p.n, 11);
  assert.deepStrictEqual(p.moods, ['relaxed']);                          /* dreamy, dark: zu selten (unter 20 %) */
  assert.deepStrictEqual(p.styles, ['ambient']);
  assert.strictEqual(p.energy, 2);
  assert.deepStrictEqual(p.decades, [1970, 1990, 2000]);
  assert.deepStrictEqual(ma.artistProfile(ix, al, 'gamma', norm), {n: 0, moods: [], styles: [], energy: 0, decades: []});
});

console.log(n + ' Prüfungen');
