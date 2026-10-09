/* web-app-deploy.sh mit einer Test-Wurzel: einspielen, nichts zu tun, Änderung, Rückfrage, zurück; alte Namen */
var assert = require('assert'), cp = require('child_process'), fs = require('fs'), path = require('path'), os = require('os');
var repo = path.join(__dirname, '..'), n = 0;
function t(name, fn) { fn(); n++; console.log('ok   ' + name); }
var T = fs.mkdtempSync(path.join(os.tmpdir(), 'wad-')), app = path.join(T, 'app'), R = path.join(T, 'root');
function sh(cmd, input) { return cp.execSync(cmd, {cwd: repo, input: input || '', env: Object.assign({}, process.env, {MX_ROOT: R}), encoding: 'utf8'}); }
function pack(name) { cp.execSync('tar czf ' + name + ' --transform "s|^app|volumio-web-app-x|" --exclude=.git app', {cwd: T}); return path.join(T, name); }
fs.mkdirSync(app);
cp.execSync('git ls-files | tar cf - -T - | tar xf - -C ' + app, {cwd: repo});     /* das Repo selbst als Archivinhalt */
fs.mkdirSync(path.join(R, 'volumio/http/www3/web'), {recursive: true});
fs.mkdirSync(path.join(R, 'volumio/http/www'), {recursive: true});              /* klassische Oberfläche (wie auf dem mxstream) */
fs.writeFileSync(path.join(R, 'volumio/http/www3/web/config.local.js'), 'lokal');
var v1 = pack('v1.tar.gz');
var out = sh('MX_SOURCE=' + v1 + ' bash tools/web-app-deploy.sh -y');
t('erster Lauf spielt alles ein', function(){
  assert.ok(/Eingespielt/.test(out));
  assert.ok(fs.existsSync(path.join(R, 'volumio/http/www3/web/js/core.js')));
  assert.ok(fs.existsSync(path.join(R, 'data/INTERNAL/tags/tag-service.js')));
  assert.ok(fs.existsSync(path.join(R, 'volumio/http/www/kioskTV.html')));
  assert.ok(/Eingespielt nach \/volumio\/http\/www, www3\./.test(out), out);
  assert.ok(fs.existsSync(path.join(R, 'volumio/http/www/web/js/core.js')));          /* auch in den anderen vorhandenen Ordner */
  assert.ok(!fs.existsSync(path.join(R, 'volumio/http/www4')));                      /* neue Ordner legt es nicht an */
  assert.ok(fs.statSync(path.join(R, 'usr/local/bin/web-app-deploy')).mode & 0o100);
  assert.ok(!fs.existsSync(path.join(R, 'usr/local/bin/mx-deploy')));                /* alte Namen nur, wenn schon da */
  assert.ok(fs.readdirSync(path.join(R, 'data/web-app-deploy')).some(function(f){ return /^backup-/.test(f); }));
  assert.strictEqual(fs.readFileSync(path.join(R, 'volumio/http/www3/web/config.local.js'), 'utf8'), 'lokal');
  assert.ok(!fs.existsSync(path.join(R, 'volumio/http/www3/README.md')));
  assert.ok(!fs.existsSync(path.join(R, 'volumio/http/www3/tests')));
});
t('zweiter Lauf: nichts zu tun', function(){ assert.ok(/nichts zu tun/.test(sh('MX_SOURCE=' + v1 + ' bash tools/web-app-deploy.sh -y'))); });
fs.appendFileSync(path.join(app, 'tags/tag-service.js'), '\n// X\n');
var v2 = pack('v2.tar.gz');
t('-n zeigt nur', function(){
  var o = sh('MX_SOURCE=' + v2 + ' bash tools/web-app-deploy.sh -n');
  assert.ok(/geändert: tags\/tag-service.js/.test(o));
  assert.ok(!/X/.test(fs.readFileSync(path.join(R, 'data/INTERNAL/tags/tag-service.js'), 'utf8').slice(-6)));
});
t('Rückfrage mit n bricht ab', function(){ assert.ok(/Abgebrochen/.test(sh('MX_SOURCE=' + v2 + ' bash tools/web-app-deploy.sh', 'n\n'))); });
t('Rückfrage mit j spielt ein und startet den Tag-Dienst neu', function(){
  var o = sh('MX_SOURCE=' + v2 + ' bash tools/web-app-deploy.sh', 'j\n');
  assert.ok(/tag-service neu starten/.test(o) && !/rotel-bridge/.test(o));
  assert.ok(/\/\/ X/.test(fs.readFileSync(path.join(R, 'data/INTERNAL/tags/tag-service.js'), 'utf8')));
});
t('Oberflächen-Dateien mit Ordner in der Anzeige', function(){
  fs.appendFileSync(path.join(app, 'app.html'), '\n<!-- X -->\n');
  var o = sh('MX_SOURCE=' + pack('v3.tar.gz') + ' bash tools/web-app-deploy.sh -n');
  assert.ok(/geändert: app.html \(www3\)/.test(o) && /geändert: app.html \(www\)/.test(o), o);
  fs.writeFileSync(path.join(app, 'app.html'), fs.readFileSync(path.join(app, 'app.html'), 'utf8').replace('\n<!-- X -->\n', ''));
});
t('--zurueck stellt den vorigen Stand her', function(){
  sh('bash tools/web-app-deploy.sh --zurueck');
  assert.ok(!/\/\/ X/.test(fs.readFileSync(path.join(R, 'data/INTERNAL/tags/tag-service.js'), 'utf8')));
});
t('noch einmal --zurueck entfernt die neu angelegten Dateien', function(){
  sh('bash tools/web-app-deploy.sh --zurueck');
  assert.ok(!fs.existsSync(path.join(R, 'volumio/http/www3/web/js/core.js')));
  assert.strictEqual(fs.readFileSync(path.join(R, 'volumio/http/www3/web/config.local.js'), 'utf8'), 'lokal');
});
/* Volumio 4: nur www4, alter Name volumio4-deploy und alte Sicherungen vorhanden */
var R4 = path.join(T, 'root4');
function sh4(cmd, env) { return cp.execSync(cmd, {cwd: repo, env: Object.assign({}, process.env, {MX_ROOT: R4}, env || {}), encoding: 'utf8'}); }
fs.mkdirSync(path.join(R4, 'volumio/http/www4'), {recursive: true});
fs.mkdirSync(path.join(R4, 'usr/local/bin'), {recursive: true});
fs.writeFileSync(path.join(R4, 'usr/local/bin/volumio4-deploy'), '#!/bin/bash\necho alt\n');
var oldState = path.join(R4, 'data/INTERNAL/volumio4-deploy');
fs.mkdirSync(oldState, {recursive: true});
fs.writeFileSync(path.join(R4, 'volumio/http/www4/alt.txt'), 'alt');
cp.execSync('tar czf ' + path.join(oldState, 'backup-20200101-000000.tar.gz') + ' volumio/http/www4/alt.txt', {cwd: R4});
fs.writeFileSync(path.join(R4, 'volumio/http/www4/alt.txt'), 'neuer');
t('Volumio 4: spielt nach www4 ein, ersetzt den alten Namen durch den Verweis', function(){
  var o = sh4('bash tools/web-app-deploy.sh -y', {MX_SOURCE: v1});
  assert.ok(/Eingespielt nach \/volumio\/http\/www4\./.test(o), o);
  assert.ok(/sudo web-app-deploy --zurueck/.test(o));
  assert.ok(fs.existsSync(path.join(R4, 'volumio/http/www4/web/js/core.js')));
  assert.ok(!fs.existsSync(path.join(R4, 'volumio/http/www3')));
  assert.ok(/heißt jetzt web-app-deploy/.test(fs.readFileSync(path.join(R4, 'usr/local/bin/volumio4-deploy'), 'utf8')));
  assert.ok(!fs.existsSync(path.join(R4, 'usr/local/bin/mx-deploy')));
});
t('--zurueck: erst die neue, dann die alte Sicherung von volumio4-deploy', function(){
  sh4('bash tools/web-app-deploy.sh --zurueck');
  assert.ok(!fs.existsSync(path.join(R4, 'volumio/http/www4/app.html')));
  assert.ok(/backup-20200101/.test(sh4('bash tools/web-app-deploy.sh --zurueck')));
  assert.strictEqual(fs.readFileSync(path.join(R4, 'volumio/http/www4/alt.txt'), 'utf8'), 'alt');
});
t('alter Name: richtet web-app-deploy ein und ruft es auf', function(){
  fs.mkdirSync(path.join(R4, 'volumio/http/www4/tools'), {recursive: true});
  fs.copyFileSync(path.join(repo, 'tools/web-app-deploy.sh'), path.join(R4, 'volumio/http/www4/tools/web-app-deploy.sh'));
  var o = sh4('bash tools/mx-deploy.sh -n', {MX_SOURCE: v1});
  assert.ok(/web-app-deploy eingerichtet/.test(o) && /heißt jetzt web-app-deploy/.test(o), o);
  assert.ok(/neu: +app.html/.test(o), o);
  assert.ok(fs.statSync(path.join(R4, 'usr/local/bin/web-app-deploy')).mode & 0o100);
});
t('ohne Ordner /volumio/http/www*: Abbruch, nichts angelegt', function(){
  var R0 = path.join(T, 'root0'); fs.mkdirSync(R0);
  var r = cp.spawnSync('bash', ['tools/web-app-deploy.sh', '-y'], {cwd: repo, env: Object.assign({}, process.env, {MX_ROOT: R0, MX_SOURCE: v1}), encoding: 'utf8'});
  assert.notStrictEqual(r.status, 0); assert.ok(/kein Ordner/.test(r.stderr), r.stderr);
  assert.ok(!fs.existsSync(path.join(R0, 'volumio')));
});
console.log(n + ' Prüfungen');
