/* Cover online suchen: Tag-Dienst fragt die eingetragene Schnittstelle, folgt Weiterleitungen, liefert das Bild als base64 */
var assert = require('assert'), http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
var n = 0;
function t(name, fn) { fn(); n++; console.log('ok   ' + name); }
var JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100, 1)]);
var seen = [];
var api = http.createServer(function(req, res){
  seen.push(req.url);
  var u = require('url').parse(req.url, true), base = 'http://127.0.0.1:' + api.address().port;
  if (u.pathname === '/api.php') {
    res.writeHead(200, {'Content-Type': 'application/json'});
    if (u.query.album === 'The Stranger') return res.end(JSON.stringify({cover_url: base + '/umweg'}));
    if (u.query.album === 'Kaputt') return res.end(JSON.stringify({cover_url: base + '/text'}));
    return res.end('{}');
  }
  if (u.pathname === '/umweg') { res.writeHead(302, {Location: '/bild.jpeg'}); return res.end(); }
  if (u.pathname === '/bild.jpeg') { res.writeHead(200, {'Content-Type': 'image/jpeg'}); return res.end(JPG); }
  res.writeHead(200, {'Content-Type': 'text/html'}); res.end('<html>');
});
api.listen(0, function(){
  var cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-'));
  fs.writeFileSync(path.join(cfg, 'config.js'), 'window.APP_CONFIG = {COVER_SEARCH_URL: ""};');
  fs.writeFileSync(path.join(cfg, 'config.local.js'), 'window.APP_CONFIG.COVER_SEARCH_URL = "http://127.0.0.1:' + api.address().port + '/api.php?artist={artist}&album={album}&action=cover";');
  process.env.APP_CONFIG_DIR = cfg;
  process.env.TAGS_LOG = path.join(cfg, 'log', 'changes.jsonl');
  var svc = require('../tags/tag-service.js').server;
  svc.listen(0, function(){
    function get(q, cb) {
      http.get({port: svc.address().port, path: '/coversearch?' + q}, function(res){
        var d = ''; res.on('data', function(c){ d += c; }); res.on('end', function(){ cb(JSON.parse(d)); });
      });
    }
    get('artist=Billy%20Joel&album=The%20Stranger', function(r1){
      t('Treffer: Bild über Weiterleitung, als base64', function(){
        assert.ok(r1.ok, r1.error); assert.strictEqual(r1.mime, 'image/jpeg');
        assert.ok(Buffer.from(r1.image, 'base64').equals(JPG));
        assert.ok(seen.indexOf('/api.php?artist=Billy%20Joel&album=The%20Stranger&action=cover') >= 0);
      });
      get('artist=X&album=Nichts', function(r2){
        t('kein Treffer: notFound', function(){ assert.ok(!r2.ok && r2.notFound); });
        get('artist=X&album=Kaputt', function(r3){
          t('kein Bild hinter der Adresse: Fehler', function(){ assert.ok(!r3.ok && /kein JPEG/.test(r3.error)); });
          get('artist=X', function(r4){
            t('ohne Album: Fehler', function(){ assert.ok(!r4.ok); });
            fs.writeFileSync(path.join(cfg, 'config.local.js'), '');
            get('artist=X&album=Y', function(r5){
              t('ohne eingetragene Adresse: Hinweis', function(){ assert.ok(!r5.ok && /COVER_SEARCH_URL/.test(r5.error)); });
              svc.close(); api.close();
              console.log(n + ' Prüfungen');
            });
          });
        });
      });
    });
  });
});
