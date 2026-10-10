/* Webradio: Cover zum Titel (iTunes, sonst Deezer), Senderlogos (Volumio-Adresse, sonst radio-browser), Speicher auf dem Player */
var assert = require('assert'), http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), url = require('url');
var n = 0;
function t(name, fn) { fn(); n++; console.log('ok   ' + name); }
var JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100, 1)]);
var PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(100, 2)]);
var calls = [];
var fake = http.createServer(function(req, res){
  var u = url.parse(req.url, true), base = 'http://127.0.0.1:' + fake.address().port;
  calls.push(u.pathname);
  function json(o) { res.writeHead(200, {'Content-Type': 'application/json'}); res.end(JSON.stringify(o)); }
  if (u.pathname === '/search') {
    if (/Falco/.test(u.query.term)) return json({results: [
      {artistName: 'Falco Tribute', trackName: 'Jeanny', artworkUrl100: base + '/img/falsch/100x100bb.jpg'},
      {artistName: 'Falco', trackName: 'Jeanny (Remastered)', artworkUrl100: base + '/img/jeanny/100x100bb.jpg'}]});
    return json({results: []});
  }
  if (u.pathname === '/search/track') {
    if (/Nena/.test(u.query.q)) return json({data: [{title: '99 Luftballons', artist: {name: 'Nena'}, album: {cover_xl: base + '/img/nena.jpg'}}]});
    return json({data: []});
  }
  if (u.pathname.indexOf('/json/stations/byname/') === 0) {
    return json([{name: 'Radio Bob Rock', favicon: base + '/img/falsch.png'}, {name: 'Radio Bob', favicon: base + '/img/bob.png'}]);
  }
  if (u.pathname === '/img/jeanny/600x600bb.jpg' || u.pathname === '/img/nena.jpg') { res.writeHead(200); return res.end(JPG); }
  if (u.pathname === '/img/bob.png' || u.pathname === '/img/swr.png') { res.writeHead(200); return res.end(PNG); }
  if (u.pathname === '/img/text') { res.writeHead(200); return res.end('<svg></svg> kein Bild'); }
  res.writeHead(404); res.end();
});

fake.listen(0, function(){
  var base = 'http://127.0.0.1:' + fake.address().port;
  process.env.ITUNES_URL = base; process.env.DEEZER_URL = base; process.env.RADIOBROWSER_URL = base;
  process.env.RADIO_ALLOW_LOCAL = '1';                 /* Testserver läuft auf 127.0.0.1 */
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'radio-'));
  process.env.TAGS_LOG = path.join(dir, 'changes.jsonl');
  process.env.APP_CONFIG_DIR = dir;
  var svc = require('../tags/tag-service.js').server;
  svc.listen(0, function(){
    function get(p, cb) {
      http.get({port: svc.address().port, path: p}, function(res){
        var d = []; res.on('data', function(c){ d.push(c); }); res.on('end', function(){ cb(res, Buffer.concat(d)); });
      });
    }
    get('/radiocover?artist=Falco&title=Jeanny', function(r1, b1){
      t('iTunes: passender Künstler und Titel (Klammerzusatz egal), 600 px', function(){
        assert.strictEqual(r1.statusCode, 200); assert.ok(b1.equals(JPG)); assert.strictEqual(r1.headers['content-type'], 'image/jpeg');
      });
      get('/radiocover?artist=Nena&title=99%20Luftballons', function(r2){
        t('ohne iTunes-Treffer: Deezer', function(){ assert.strictEqual(r2.statusCode, 200); });
        get('/radiocover?artist=Niemand&title=Nichts', function(r3){
          var before = calls.length;
          get('/radiocover?artist=Niemand&title=Nichts', function(r4){
            t('nichts gefunden: 404, wird gemerkt', function(){
              assert.strictEqual(r3.statusCode, 404); assert.strictEqual(r4.statusCode, 404); assert.strictEqual(calls.length, before);
            });
            get('/stationlogo?name=SWR1&url=' + encodeURIComponent(base + '/img/swr.png'), function(r5){
              t('Senderlogo von der Volumio-Adresse', function(){ assert.strictEqual(r5.statusCode, 200); assert.strictEqual(r5.headers['content-type'], 'image/png'); });
              get('/stationlogo?name=Radio%20Bob&url=' + encodeURIComponent(base + '/img/text'), function(r6, b6){
                t('kein Bild unter der Adresse: radio-browser, genau passender Name', function(){
                  assert.strictEqual(r6.statusCode, 200); assert.ok(b6.equals(PNG));
                  assert.ok(calls.some(function(c){ return /byname\/Radio%20Bob/.test(c) || /byname\/Radio Bob/.test(c); }));
                });
                get('/radiocover?artist=Falco&title=Jeanny', function(r7){
                  t('zweites Mal vom Player', function(){ assert.strictEqual(r7.statusCode, 200); });
                  delete process.env.RADIO_ALLOW_LOCAL;
                  var swrBefore = calls.filter(function(c){ return c === '/img/swr.png'; }).length;
                  get('/stationlogo?name=' + encodeURIComponent('Heimnetz FM') + '&url=' + encodeURIComponent(base + '/img/swr.png'), function(r8){
                    t('Senderlogo-Adresse im eigenen Netz wird nicht geladen', function(){
                      assert.strictEqual(r8.statusCode, 404);
                      assert.strictEqual(calls.filter(function(c){ return c === '/img/swr.png'; }).length, swrBefore);
                    });
                    console.log(n + ' Prüfungen');
                    svc.close(); fake.close();
                  });
                });
              });
            });
          });
        });
      });
    });
  });
});
