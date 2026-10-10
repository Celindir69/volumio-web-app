/* Zugriffsschutz: Tag-Dienst und Rotel-Brücke nehmen nur Anfragen der eigenen Oberfläche an */
var assert = require('assert'), http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
var guard = require('../tags/guard.js');
var n = 0;
function t(name, fn) { fn(); n++; console.log('ok   ' + name); }
function rq(h) { return {headers: h}; }

t('Host: Heimnetz-Namen und IPs erlaubt, fremde Namen nicht', function(){
  ['volumio.local:8766', '192.168.1.20:8766', 'localhost', 'volumio', '[::1]:8766', 'player.fritz.box', 'x.home.arpa']
    .forEach(function(h){ assert.ok(guard.hostOk(h), h); });
  ['evil.example.com:8766', 'volumio.local.evil.com', '', 'a b'].forEach(function(h){ assert.ok(!guard.hostOk(h), h); });
  assert.ok(guard.hostOk('player.example.net', ['player.example.net']));
});

t('Origin: nur dasselbe Gerät; "null" und fremde Seiten abgelehnt', function(){
  assert.ok(guard.check(rq({host: 'volumio.local:8766', origin: 'http://volumio.local'}), true).ok);
  assert.strictEqual(guard.check(rq({host: 'volumio.local:8766', origin: 'http://volumio.local:3000'}), false).origin, 'http://volumio.local:3000');
  assert.strictEqual(guard.check(rq({host: 'volumio.local:8766', origin: 'https://evil.example.com'}), false).reason, 'origin');
  assert.strictEqual(guard.check(rq({host: 'volumio.local:8766', origin: 'http://192.168.1.66'}), true).reason, 'origin');
  assert.strictEqual(guard.check(rq({host: 'volumio.local:8766', origin: 'null'}), true).reason, 'origin');
  assert.strictEqual(guard.check(rq({host: 'evil.example.com:8766', origin: 'http://evil.example.com:8766'}), false).reason, 'host');
});

t('ohne Origin: lesen frei, schreiben nur mit X-Xplorio oder JSON-Typ', function(){
  assert.ok(guard.check(rq({host: 'volumio.local:8766'}), false).ok);
  assert.strictEqual(guard.check(rq({host: 'volumio.local:8766', 'content-type': 'text/plain'}), true).reason, 'marker');
  assert.ok(guard.check(rq({host: 'volumio.local:8766', 'x-xplorio': '1'}), true).ok);
  assert.ok(guard.check(rq({host: 'volumio.local:8766', 'content-type': 'application/x-ndjson'}), true).ok);
});

t('CORS-Köpfe nur für die erlaubte Herkunft', function(){
  assert.strictEqual(guard.corsHeaders('')['Access-Control-Allow-Origin'], undefined);
  assert.strictEqual(guard.corsHeaders('http://volumio.local')['Access-Control-Allow-Origin'], 'http://volumio.local');
});

var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-'));
process.env.TAGS_LOG = path.join(dir, 'data', 'changes.jsonl');
process.env.APP_CONFIG_DIR = dir;
var tagSvc = require('../tags/tag-service.js').server;
var rotelSvc = require('../rotel/rotel-bridge.js').server;

function call(svc, method, p, headers, body, cb) {
  var r = http.request({port: svc.address().port, path: p, method: method, headers: headers}, function(res){
    var d = ''; res.on('data', function(c){ d += c; }); res.on('end', function(){ cb(res.statusCode, res.headers); });
  });
  r.end(body);
}
var steps = [
  ['Tag-Dienst: fremde Seite darf nicht schreiben', tagSvc, 'POST', '/lyricsoffset', {Origin: 'https://evil.example.com', 'Content-Type': 'text/plain'}, '{"key":"a|b","ms":5}', 403],
  ['Tag-Dienst: Oberfläche darf schreiben (text/plain, kein Vorab-Request)', tagSvc, 'POST', '/lyricsoffset', {Host: 'volumio.local:8766', Origin: 'http://volumio.local', 'Content-Type': 'text/plain'}, '{"key":"a|b","ms":5}', 200],
  ['Tag-Dienst: Formular ohne Origin wird abgelehnt', tagSvc, 'POST', '/lyricsoffset', {'Content-Type': 'text/plain'}, '{"key":"a|b","ms":5}', 403],
  ['Tag-Dienst: DNS-Rebinding (fremder Host) wird abgelehnt', tagSvc, 'GET', '/health', {Host: 'evil.example.com:8766'}, null, 403],
  ['Tag-Dienst: curl /health geht weiter', tagSvc, 'GET', '/health', {}, null, 200],
  ['Rotel: fremde Seite darf nicht schalten', rotelSvc, 'GET', '/cmd?c=power_off', {Origin: 'https://evil.example.com'}, null, 403],
  ['Rotel: Bild-Link ohne Origin darf nicht schalten', rotelSvc, 'GET', '/cmd?c=power_off', {}, null, 403],
  ['Rotel: Oberfläche darf schalten (ohne Verstärker: 503)', rotelSvc, 'GET', '/cmd?c=power_off', {Host: 'volumio.local:8765', Origin: 'http://volumio.local'}, null, 503],
  ['Rotel: Zustand lesbar', rotelSvc, 'GET', '/state', {}, null, 200]
];
tagSvc.listen(0, function(){ rotelSvc.listen(0, function(){
  (function next(i){
    if (i >= steps.length) {
      return call(tagSvc, 'GET', '/health', {Host: 'volumio.local:8766', Origin: 'http://volumio.local'}, null, function(c, h){
        t('Tag-Dienst: Antwort trägt die erlaubte Herkunft statt *', function(){ assert.strictEqual(h['access-control-allow-origin'], 'http://volumio.local'); });
        console.log(n + ' Prüfungen bestanden'); process.exit(0);
      });
    }
    var s = steps[i];
    call(s[1], s[2], s[3], s[4], s[5], function(code){
      t(s[0], function(){ assert.strictEqual(code, s[6]); });
      next(i + 1);
    });
  })(0);
}); });
