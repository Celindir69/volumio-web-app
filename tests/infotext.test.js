/* Ersatztexte für Künstler und Album (web/js/infotext.js), wenn Volumio nichts liefert */
var assert = require('assert');
var it = require('../web/js/infotext.js');
var n = 0, pending = [];
function t(name, fn) { pending.push(fn().then(function(){ n++; console.log('ok   ' + name); })); }
function res(j, ok) { return Promise.resolve({ok: ok !== false, json: function(){ return Promise.resolve(j); }}); }
var LONG = 'Massive Attack sind eine britische Band aus Bristol, gegründet 1988, Wegbereiter des Trip-Hop.';

t('Last.fm-Text säubern: Link und Lizenzhinweis weg, kurze Stummel zählen nicht', function(){
  assert.strictEqual(it.infoClean(LONG + ' <a href="https://www.last.fm/music/x">Read more on Last.fm</a>. User-contributed text is available under the Creative Commons By-SA License; additional terms may apply.'), LONG);
  assert.strictEqual(it.infoClean(' <a href="x">Read more on Last.fm</a>'), '');
  return Promise.resolve();
});

t('Künstler: Last.fm deutsch zuerst', function(){
  var urls = [];
  return it.infoFallback(function(u){ urls.push(u); return res({artist: {bio: {content: LONG}}}); }, 'KEY', 'storyArtist', 'Massive Attack', undefined, 'de')
    .then(function(r){
      assert.strictEqual(r.src, 'Last.fm');
      assert.ok(/Quelle: Last\.fm$/.test(r.value));
      assert.strictEqual(urls.length, 1);
      assert.ok(/method=artist\.getinfo/.test(urls[0]) && /lang=de/.test(urls[0]) && /artist=Massive%20Attack/.test(urls[0]));
    });
});

t('Album: Last.fm englisch, wenn es keinen deutschen Text gibt', function(){
  var urls = [];
  return it.infoFallback(function(u){ urls.push(u); return res(/lang=de/.test(u) ? {album: {}} : {album: {wiki: {summary: LONG}}}); },
    'KEY', 'storyAlbum', 'Massive Attack', 'Mezzanine', 'de').then(function(r){
      assert.strictEqual(urls.length, 2);
      assert.ok(/album=Mezzanine/.test(urls[1]) && !/lang=/.test(urls[1]));
      assert.ok(r.value.indexOf(LONG) === 0);
    });
});

t('Künstler ohne Last.fm-Schlüssel: Wikipedia, Begriffsklärung und Fremdes übergehen', function(){
  var urls = [];
  return it.infoFallback(function(u){
    urls.push(u);
    if (/de\.wikipedia/.test(u)) return res({type: 'disambiguation', extract: 'Air steht für …'});
    return res({type: 'standard', description: 'French music duo', extract: 'Air is a French music duo from Versailles, formed in 1995.'});
  }, '', 'storyArtist', 'Air', undefined, 'de').then(function(r){
    assert.strictEqual(r.src, 'Wikipedia');
    assert.ok(/en\.wikipedia\.org\/api\/rest_v1\/page\/summary\/Air$/.test(urls[1]));
    return it.infoFallback(function(){ return res({type: 'standard', description: 'Gas', extract: 'Luft ist das Gasgemisch der Erdatmosphäre.'}); }, '', 'storyArtist', 'Luft');
  }).then(function(r){ assert.strictEqual(r, null); });
});

t('Sprache en: je Quelle nur eine Abfrage, ohne lang und nur en.wikipedia', function(){
  var urls = [];
  return it.infoFallback(function(u){ urls.push(u); return res({}); }, 'KEY', 'storyArtist', 'Nobody', undefined, 'en')
    .then(function(r){
      assert.strictEqual(r, null);
      assert.strictEqual(urls.length, 2);
      assert.ok(/audioscrobbler/.test(urls[0]) && !/lang=/.test(urls[0]));
      assert.ok(/^https:\/\/en\.wikipedia\.org\//.test(urls[1]));
      urls = [];
      return it.infoFallback(function(u){ urls.push(u); return res({}); }, 'KEY', 'storyArtist', 'Nobody');   /* ohne lang = en */
    }).then(function(){ assert.strictEqual(urls.length, 2); });
});

t('Sprache fr: erst Last.fm und Wikipedia französisch, dann beide englisch', function(){
  var urls = [];
  return it.infoFallback(function(u){
    urls.push(u);
    if (/en\.wikipedia/.test(u)) return res({type: 'standard', description: 'French music duo', extract: 'Air is a French music duo from Versailles, formed in 1995.'});
    return res({});
  }, 'KEY', 'storyArtist', 'Air', undefined, 'fr').then(function(r){
    assert.strictEqual(urls.length, 4);
    assert.ok(/audioscrobbler.*lang=fr/.test(urls[0]) && /^https:\/\/fr\.wikipedia\.org\//.test(urls[1]));
    assert.ok(/audioscrobbler/.test(urls[2]) && !/lang=/.test(urls[2]) && /^https:\/\/en\.wikipedia\.org\//.test(urls[3]));
    assert.strictEqual(r.src, 'Wikipedia');
  });
});

t('Album ohne Schlüssel und Netzfehler: nichts', function(){
  return Promise.all([
    it.infoFallback(function(){ throw new Error('nie'); }, '', 'storyAlbum', 'A', 'B'),
    it.infoFallback(function(){ return Promise.reject(new Error('offline')); }, 'KEY', 'storyArtist', 'A')
  ]).then(function(r){ assert.deepStrictEqual(r, [null, null]); });
});

Promise.all(pending).then(function(){ console.log(n + ' Prüfungen bestanden'); }, function(e){ console.error(e); process.exit(1); });
