/* Wiederholen-Knopf mit viertem Zustand ∞ (AutoDJ-Plugin), web/js/autodj.js */
var assert = require('assert');
var a = require('../web/js/autodj.js');
var n = 0;
function t(name, fn) { fn(); n++; console.log('ok   ' + name); }
var NONE = {avail: false, enabled: false, ready: false}, READY = {avail: true, enabled: false, ready: true};

t('ohne Plugin: drei Zustände wie bisher', function(){
  assert.strictEqual(a.repeatNext('off', NONE).mode, 'all');
  assert.strictEqual(a.repeatNext('all', NONE).mode, 'one');
  assert.deepStrictEqual(a.repeatNext('one', NONE), {mode: 'off', repeat: {value: false, repeatSingle: false}, autodj: null});
});
t('mit Plugin: einer → ∞ schaltet Wiederholen aus und AutoDJ an, ∞ → aus schaltet AutoDJ aus', function(){
  assert.deepStrictEqual(a.repeatNext('one', READY), {mode: 'inf', repeat: {value: false, repeatSingle: false}, autodj: true});
  assert.deepStrictEqual(a.repeatNext('inf', READY), {mode: 'off', repeat: null, autodj: false});
});
t('Plugin ohne Last.fm-Key: kein ∞; ein noch laufendes AutoDJ wird beim Weg über „aus“ abgeschaltet', function(){
  assert.strictEqual(a.repeatNext('one', {avail: true, enabled: false, ready: false}).mode, 'off');
  assert.strictEqual(a.repeatNext('one', {avail: true, enabled: true, ready: false}).autodj, false);
});
t('Anzeige: ∞ nur bei AutoDJ an und Wiederholen aus', function(){
  var on = {avail: true, enabled: true, ready: true};
  assert.strictEqual(a.repeatShown('off', on), 'inf');
  assert.strictEqual(a.repeatShown('all', on), 'all');               /* AutoDJ pausiert bei Wiederholen */
  assert.strictEqual(a.repeatShown('off', READY), 'off');
  assert.strictEqual(a.repeatShown('off', {avail: false, enabled: true, ready: true}), 'off');
});
console.log(n + ' Prüfungen');
