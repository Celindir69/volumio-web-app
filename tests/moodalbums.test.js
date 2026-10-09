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

console.log(n + ' Prüfungen');
