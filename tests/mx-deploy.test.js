/* mx-deploy.sh mit einer Test-Wurzel: einspielen, nichts zu tun, Änderung, Rückfrage, zurück */
var assert = require('assert'), cp = require('child_process'), fs = require('fs'), path = require('path'), os = require('os');
var repo = path.join(__dirname, '..'), n = 0;
function t(name, fn) { fn(); n++; console.log('ok   ' + name); }
var T = fs.mkdtempSync(path.join(os.tmpdir(), 'mxd-')), app = path.join(T, 'app'), R = path.join(T, 'root');
function sh(cmd, input) { return cp.execSync(cmd, {cwd: repo, input: input || '', env: Object.assign({}, process.env, {MX_ROOT: R}), encoding: 'utf8'}); }
function pack(name) { cp.execSync('tar czf ' + name + ' --transform "s|^app|volumio-web-app-x|" --exclude=.git app', {cwd: T}); return path.join(T, name); }
fs.mkdirSync(app);
cp.execSync('git ls-files | tar cf - -T - | tar xf - -C ' + app, {cwd: repo});     /* das Repo selbst als Archivinhalt */
fs.mkdirSync(path.join(R, 'volumio/http/www3/web'), {recursive: true});
fs.writeFileSync(path.join(R, 'volumio/http/www3/web/config.local.js'), 'lokal');
var v1 = pack('v1.tar.gz');
var out = sh('MX_SOURCE=' + v1 + ' bash tools/mx-deploy.sh -y');
t('erster Lauf spielt alles ein', function(){
  assert.ok(/Eingespielt/.test(out));
  assert.ok(fs.existsSync(path.join(R, 'volumio/http/www3/web/js/core.js')));
  assert.ok(fs.existsSync(path.join(R, 'data/INTERNAL/tags/tag-service.js')));
  assert.ok(fs.existsSync(path.join(R, 'volumio/http/www/kioskTV.html')));
  assert.ok(fs.statSync(path.join(R, 'usr/local/bin/mx-deploy')).mode & 0o100);
  assert.strictEqual(fs.readFileSync(path.join(R, 'volumio/http/www3/web/config.local.js'), 'utf8'), 'lokal');
  assert.ok(!fs.existsSync(path.join(R, 'volumio/http/www3/README.md')));
  assert.ok(!fs.existsSync(path.join(R, 'volumio/http/www3/tests')));
});
t('zweiter Lauf: nichts zu tun', function(){ assert.ok(/nichts zu tun/.test(sh('MX_SOURCE=' + v1 + ' bash tools/mx-deploy.sh -y'))); });
fs.appendFileSync(path.join(app, 'tags/tag-service.js'), '\n// X\n');
var v2 = pack('v2.tar.gz');
t('-n zeigt nur', function(){
  var o = sh('MX_SOURCE=' + v2 + ' bash tools/mx-deploy.sh -n');
  assert.ok(/geändert: tags\/tag-service.js/.test(o));
  assert.ok(!/X/.test(fs.readFileSync(path.join(R, 'data/INTERNAL/tags/tag-service.js'), 'utf8').slice(-6)));
});
t('Rückfrage mit n bricht ab', function(){ assert.ok(/Abgebrochen/.test(sh('MX_SOURCE=' + v2 + ' bash tools/mx-deploy.sh', 'n\n'))); });
t('Rückfrage mit j spielt ein und startet den Tag-Dienst neu', function(){
  var o = sh('MX_SOURCE=' + v2 + ' bash tools/mx-deploy.sh', 'j\n');
  assert.ok(/tag-service neu starten/.test(o) && !/rotel-bridge/.test(o));
  assert.ok(/\/\/ X/.test(fs.readFileSync(path.join(R, 'data/INTERNAL/tags/tag-service.js'), 'utf8')));
});
t('--zurueck stellt den vorigen Stand her', function(){
  sh('bash tools/mx-deploy.sh --zurueck');
  assert.ok(!/\/\/ X/.test(fs.readFileSync(path.join(R, 'data/INTERNAL/tags/tag-service.js'), 'utf8')));
});
t('noch einmal --zurueck entfernt die neu angelegten Dateien', function(){
  sh('bash tools/mx-deploy.sh --zurueck');
  assert.ok(!fs.existsSync(path.join(R, 'volumio/http/www3/web/js/core.js')));
  assert.strictEqual(fs.readFileSync(path.join(R, 'volumio/http/www3/web/config.local.js'), 'utf8'), 'lokal');
});
console.log(n + ' Prüfungen');
