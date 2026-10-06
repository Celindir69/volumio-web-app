var net  = require('net');
var http = require('http');
var url  = require('url');

var fs   = require('fs');
var vm   = require('vm');

/* Adresse des Verstärkers aus der Konfiguration der Oberfläche (web/config.js, dann web/config.local.js):
   ROTEL_HOST, ROTEL_AMP_PORT (Verstärker, 9590) und ROTEL_PORT (dieser Dienst, 8765).
   Umgebungsvariablen ROTEL_HOST, ROTEL_PORT (Verstärker), HTTP_PORT gehen vor. */
var CONFIG_DIR = process.env.APP_CONFIG_DIR || '/volumio/http/www3/web';
function loadAppConfig() {
  var ctx = {window: {}};
  ['config.js', 'config.local.js'].forEach(function(f){
    try { vm.runInNewContext(fs.readFileSync(CONFIG_DIR + '/' + f, 'utf8'), ctx, {filename: f, timeout: 1000}); }
    catch (e) { if (e.code !== 'ENOENT') console.error('Konfiguration ' + f + ': ' + e.message); }
  });
  return ctx.window.APP_CONFIG || {};
}
var CFG = loadAppConfig();

var ROTEL_HOST = process.env.ROTEL_HOST || CFG.ROTEL_HOST || '';
var ROTEL_PORT = parseInt(process.env.ROTEL_PORT || CFG.ROTEL_AMP_PORT || '9590', 10);
var HTTP_PORT  = parseInt(process.env.HTTP_PORT  || CFG.ROTEL_PORT || '8765', 10);
var MAX_VOL    = 70;   /* Sicherheitsgrenze (Rotel: 0-96) */

/* Nach dem Einschalten diesen Eingang wählen ('' = nichts umschalten) */
var POWER_ON_SOURCE = 'pcusb';

var state = {connected:false, power:null, volume:null, mute:null, source:null};
var sock = null, buf = '', retry = null, connectTimer = null, sourceTimer = null;

function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

/* true, wenn der Befehl wirklich an den Verstärker ging */
function send(c) {
  if (sock && state.connected) { sock.write(c + '!'); return true; }
  return false;
}

/* Eingang nach dem Einschalten: Der Verstärker braucht beim Hochfahren einen Moment und
   nimmt Befehle erst danach an. Darum: senden, kurz warten, nachfragen, bei Bedarf bis zu
   fünfmal wiederholen. */
function ensureSource(tries) {
  clearTimeout(sourceTimer);
  if (!POWER_ON_SOURCE || !state.connected || state.power !== true) return;
  if (norm(state.source) === norm(POWER_ON_SOURCE)) return;
  if (tries <= 0) return;
  send(POWER_ON_SOURCE);
  sourceTimer = setTimeout(function(){
    if (sock && state.connected) sock.write('source?');
    sourceTimer = setTimeout(function(){ ensureSource(tries - 1); }, 1000);
  }, 1500);
}

function parseMsg(m) {
  m = m.trim();
  var i = m.indexOf('=');
  if (i < 0) return;
  var k = m.slice(0, i).toLowerCase(), v = m.slice(i + 1).toLowerCase();
  if (k === 'volume') { var n = parseInt(v, 10); if (!isNaN(n)) state.volume = n; }
  else if (k === 'mute')   state.mute  = (v === 'on');
  else if (k === 'power') {
    var was = state.power;
    state.power = (v === 'on');
    /* Wechsel von Standby auf "an" (nicht beim ersten Abfragen nach dem Verbinden) */
    if (was === false && state.power === true) {
      clearTimeout(sourceTimer);
      sourceTimer = setTimeout(function(){ ensureSource(5); }, 2000);
    }
    if (!state.power) clearTimeout(sourceTimer);
  }
  else if (k === 'source') state.source = v;
}

function connect() {
  clearTimeout(retry);
  if (!ROTEL_HOST) { console.error('ROTEL_HOST fehlt (web/config.local.js oder Umgebungsvariable): keine Verbindung zum Verstärker'); return; }
  buf = '';
  sock = net.createConnection({host:ROTEL_HOST, port:ROTEL_PORT});
  sock.setEncoding('ascii');
  sock.setKeepAlive(true, 10000);
  /* hängt der Verbindungsaufbau (Verstärker antwortet nicht), nach 5 s abbrechen und neu versuchen */
  clearTimeout(connectTimer);
  var mine = sock;
  connectTimer = setTimeout(function(){ if (mine === sock && !state.connected) mine.destroy(); }, 5000);
  sock.on('connect', function(){
    clearTimeout(connectTimer);
    state.connected = true;
    send('rs232_update_on');          /* Rotel meldet Änderungen selbst */
    ['power?','volume?','mute?','source?'].forEach(function(q){ sock.write(q); });
  });
  sock.on('data', function(d){
    buf += d;
    var parts = buf.split('$');
    buf = parts.pop();
    parts.forEach(parseMsg);
  });
  sock.on('error', function(){});
  sock.on('close', function(){
    clearTimeout(connectTimer);
    clearTimeout(sourceTimer);
    state.connected = false;
    state.power = null;               /* unbekannt statt eines alten Werts */
    sock = null;
    clearTimeout(retry);
    retry = setTimeout(connect, 5000);
  });
}

var ALLOWED = ['vol_up','vol_dwn','mute_on','mute_off','power_on','power_off','pcusb'];

http.createServer(function(req, res){
  var u = url.parse(req.url, true), ok = true, error = null;
  if (u.pathname === '/cmd' && ALLOWED.indexOf(u.query.c) > -1) {
    if (!send(u.query.c)) { ok = false; error = 'nicht verbunden'; }
  } else if (u.pathname === '/vol') {
    var v = parseInt(u.query.v, 10);
    if (!isNaN(v)) {
      v = Math.max(0, Math.min(MAX_VOL, v));
      if (send('vol_' + (v < 10 ? '0' : '') + v)) state.volume = v;
      else { ok = false; error = 'nicht verbunden'; }
    }
  } else if (u.pathname !== '/state') {
    ok = false; error = 'unbekannt';
  }
  res.writeHead(ok ? 200 : (error === 'unbekannt' ? 404 : 503), {
    'Content-Type':'application/json',
    'Access-Control-Allow-Origin':'*',
    'Cache-Control':'no-store'
  });
  var out = {ok:ok, state:state};
  if (error) out.error = error;
  res.end(JSON.stringify(out));
}).listen(HTTP_PORT);

connect();
