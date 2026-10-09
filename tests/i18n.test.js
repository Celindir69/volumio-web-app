/* Mehrsprachigkeit: Sprachwahl, Rückfall, Platzhalter; jeder Schlüssel im Code steht in de.js, en.js hat dieselben */
var assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
var i18n = require('../web/js/i18n.js'), n = 0;
function t(name, fn) { fn(); n++; console.log('ok   ' + name); }
var ROOT = path.join(__dirname, '..'), LANGDIR = path.join(ROOT, 'web/lang');

var files = {};
fs.readdirSync(LANGDIR).filter(function(f){ return /^[\w-]+\.js$/.test(f); }).forEach(function(f){
  var got = null;
  vm.runInNewContext(fs.readFileSync(path.join(LANGDIR, f), 'utf8'), {langRegister: function(c, name, texts, loc){ got = {c: c, name: name, texts: texts, loc: loc}; }});
  files[f.replace(/\.js$/, '')] = got;
});

t('Sprachwahl: Adresse vor Einstellung vor Gerät, Region egal, sonst Englisch', function(){
  assert.strictEqual(i18n.langPick(['de', 'en'], '?lang=en', 'de', ['de-DE']), 'en');
  assert.strictEqual(i18n.langPick(['de', 'en'], '', 'de', ['en-US']), 'de');
  assert.strictEqual(i18n.langPick(['de', 'en'], '', '', ['fr-FR', 'de-AT']), 'de');
  assert.strictEqual(i18n.langPick(['de', 'en'], '?x=1&lang=fr', '', ['it']), 'en');
  assert.strictEqual(i18n.langPick(['de', 'en', 'fr'], '', 'fr', []), 'fr');
  assert.strictEqual(i18n.langPick(['de', 'en'], '', '', ['en', 'de-DE']), 'en');   /* Volumio-Sprache vor dem Gerät */
});

t('T: Rückfall Sprache -> Englisch -> Deutsch -> Schlüssel, Platzhalter, Einzahl/Mehrzahl', function(){
  i18n.langRegister('de', 'Deutsch', {'a': 'A-de', 'b': 'B-de', 'n': {one: '1 Titel', other: '{n} Titel'}, 'p': 'Hallo {name}'});
  i18n.langRegister('en', 'English', {'a': 'A-en', 'n': {one: '1 track', other: '{n} tracks'}, 'p': 'Hello {name}'});
  i18n.langRegister('fr', 'Français', {'a': 'A-fr'});
  i18n.setLang('fr');
  assert.strictEqual(i18n.T('a'), 'A-fr'); assert.strictEqual(i18n.T('p', {name: 'X'}), 'Hello X');
  assert.strictEqual(i18n.T('b'), 'B-de'); assert.strictEqual(i18n.T('zz'), 'zz');
  i18n.setLang('de', 'de-DE');
  assert.strictEqual(i18n.T('n', {n: 1}), '1 Titel');
  assert.strictEqual(i18n.T('n', {n: 3}), '3 Titel');
  assert.strictEqual(i18n.T('p', {}), 'Hallo {name}');
});

t('Sprachdateien: de und en vorhanden, gleiche Schlüssel, gleiche Platzhalter und Formen', function(){
  assert.ok(files.de && files.en, 'de.js und en.js');
  assert.strictEqual(files.de.c, 'de'); assert.strictEqual(files.en.c, 'en');
  var de = files.de.texts, en = files.en.texts;
  var miss = Object.keys(de).filter(function(k){ return !(k in en); }), extra = Object.keys(en).filter(function(k){ return !(k in de); });
  assert.deepStrictEqual(miss, [], 'fehlt in en.js'); assert.deepStrictEqual(extra, [], 'nur in en.js');
  function ph(v) { return (typeof v === 'object' ? v.one + v.other : v).match(/\{\w+\}/g) || []; }
  Object.keys(de).forEach(function(k){
    assert.strictEqual(typeof de[k], typeof en[k], 'Form ' + k);
    if (typeof de[k] === 'object') assert.ok(de[k].one !== undefined && de[k].other !== undefined && en[k].one !== undefined && en[k].other !== undefined, k);
    assert.deepStrictEqual(ph(en[k]).filter(function(x, i, a){ return a.indexOf(x) === i; }).sort(),
                           ph(de[k]).filter(function(x, i, a){ return a.indexOf(x) === i; }).sort(), 'Platzhalter ' + k);
  });
});

t('jeder Schlüssel im Code (T(…), data-i18n*) steht in de.js', function(){
  var src = fs.readdirSync(path.join(ROOT, 'web/js')).filter(function(f){ return f !== 'i18n.js'; }).map(function(f){ return path.join(ROOT, 'web/js', f); })
    .concat([path.join(ROOT, 'xplorio.html'), path.join(ROOT, 'kioskTV.html')]);
  var used = {};
  src.forEach(function(f){
    var s = fs.readFileSync(f, 'utf8'), m, re = /\b(?:T|textT)\(\s*'([\w.-]+)'|data-i18n(?:-title|-placeholder|-aria|-empty)?="([\w.-]+)"/g;
    while ((m = re.exec(s))) if (!/\.$/.test(m[1] || m[2])) used[m[1] || m[2]] = path.basename(f);   /* 'mood.' + id: zusammengesetzt */
  });
  var missing = Object.keys(used).filter(function(k){ return !(k in files.de.texts); }).map(function(k){ return k + ' (' + used[k] + ')'; });
  assert.deepStrictEqual(missing, []);
  assert.ok(Object.keys(used).length > 100, 'Schlüssel gefunden: ' + Object.keys(used).length);
});

t('weitere Sprachdateien: gültig, nur bekannte Schlüssel', function(){
  Object.keys(files).filter(function(c){ return c !== 'de' && c !== 'en'; }).forEach(function(c){
    assert.ok(files[c] && files[c].c === c, c + '.js ruft langRegister(\'' + c + '\', …)');
    Object.keys(files[c].texts).forEach(function(k){ assert.ok(k in files.de.texts, c + ': unbekannter Schlüssel ' + k); });
  });
});
console.log(n + ' Prüfungen');
