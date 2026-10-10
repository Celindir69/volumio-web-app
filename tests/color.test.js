/* Prüft pickMood (Farbwahl aus Cover-Pixeln) mit künstlichen Pixelfeldern.
   Aufruf: node tests/color.test.js */
var fs = require('fs'), vm = require('vm'), assert = require('assert');
vm.runInThisContext(fs.readFileSync(__dirname + '/../web/js/color.js', 'utf8'));

function field(parts) {                 /* parts: [[r,g,b,anzahl], …] -> RGBA-Liste */
  var out = [];
  parts.forEach(function(p){ for (var i = 0; i < p[3]; i++) out.push(p[0], p[1], p[2], 255); });
  return out;
}
function hueOf(m) { return m ? m.hue : null; }
function near(h, target, tol) { var d = Math.abs(h - target) % 360; return Math.min(d, 360 - d) <= tol; }

var fail = 0;
function t(name, fn) { try { fn(); console.log('ok   ' + name); } catch (e) { fail++; console.log('FAIL ' + name + ': ' + e.message.split('\n')[0]); } }

t('Orange/Rot -> Farbton um 15–30', function(){
  var m = pickMood(field([[200, 90, 40, 300]])); assert(m && near(m.hue, 20, 12), JSON.stringify(m)); });
t('Blau -> Farbton um 220', function(){
  var m = pickMood(field([[40, 80, 180, 300]])); assert(m && near(m.hue, 222, 12), JSON.stringify(m)); });
t('Grün -> Farbton um 120', function(){
  var m = pickMood(field([[50, 160, 70, 300]])); assert(m && near(m.hue, 130, 15), JSON.stringify(m)); });
t('überwiegend Blau, wenig Rot -> Blau', function(){
  var m = pickMood(field([[40, 80, 180, 400], [200, 40, 40, 100]])); assert(m && near(m.hue, 222, 15), JSON.stringify(m)); });
t('Grau -> keine Farbe', function(){ assert.strictEqual(pickMood(field([[120, 120, 120, 300]])), null); });
t('Schwarz/Weiß -> keine Farbe', function(){ assert.strictEqual(pickMood(field([[0, 0, 0, 200], [255, 255, 255, 200]])), null); });
t('Grau mit wenigen bunten Pixeln -> keine Farbe', function(){
  assert.strictEqual(pickMood(field([[120, 120, 120, 480], [200, 40, 40, 20]])), null); });
t('zu wenige Pixel -> keine Farbe', function(){ assert.strictEqual(pickMood(field([[200, 40, 40, 3]])), null); });
t('durchsichtige Pixel zählen nicht', function(){
  var px = []; for (var i = 0; i < 300; i++) px.push(200, 40, 40, 0); assert.strictEqual(pickMood(px), null); });
t('Akzent ist hell genug (l 58–72 %) und kräftig genug (s ≥ 45 %), auch bei dunklem Cover', function(){
  var m = pickMood(field([[60, 20, 80, 300]]));
  var mm = /hsl\((\d+), (\d+)%, (\d+)%\)/.exec(m.accent);
  assert(mm && +mm[3] >= 58 && +mm[3] <= 72 && +mm[2] >= 45, m.accent); });
t('Akzent bleibt bei sehr hellem Cover im erlaubten Bereich', function(){
  var m = pickMood(field([[250, 200, 190, 300]]));
  var mm = /hsl\((\d+), (\d+)%, (\d+)%\)/.exec(m.accent);
  assert(m === null || (+mm[3] >= 58 && +mm[3] <= 72), m && m.accent); });
t('Tönung ist halbtransparent und dunkel (l 34 %)', function(){
  var m = pickMood(field([[200, 90, 40, 300]])); assert(/hsla\(\d+, \d+%, 34%, 0\.42\)/.test(m.tint), m.tint); });
t('Schrift auf dem Akzent: dunkel auf hellem Gelb, hell auf dunklem Blau', function(){
  assert.strictEqual(cmOnColor(55, 0.85, 0.65), '#111');
  assert.strictEqual(cmOnColor(230, 0.8, 0.35), '#fff');
  var m = pickMood(field([[200, 90, 40, 300]]));
  assert(/^#(111|fff)$/.test(m.onAccent) && /^#(111|fff)$/.test(m.onAccentLight), JSON.stringify(m)); });
process.exit(fail ? 1 : 0);
