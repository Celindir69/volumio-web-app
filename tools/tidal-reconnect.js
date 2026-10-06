/* TIDAL neu verbinden, ohne Volumio neu zu starten: Plugin ausschalten und wieder einschalten
   (das macht auch der Schalter im Plugin-Manager). Läuft auf dem MX-Stream:

     node /volumio/http/www3/tools/tidal-reconnect.js

   Node 8 genügt, benutzt das socket.io-client-Paket von Volumio. Nicht während der Wiedergabe von TIDAL ausführen. */
var io = require('/volumio/node_modules/socket.io-client');

var CATEGORY = 'music_service';
var PLUGIN = 'tidal';
var PAUSE_MS = 4000;      /* zwischen Aus und Ein */
var SETTLE_MS = 8000;     /* nach dem Einschalten warten, bis Volumio fertig meldet */

var socket = io('http://localhost:3000', { reconnection: false, timeout: 5000 });
var seen = [];

socket.on('connect_error', function (e) { console.log('Keine Verbindung zu Volumio:', e && e.message); process.exit(2); });
socket.on('pushToastMessage', function (m) {
  seen.push(m);
  console.log('Meldung von Volumio:', m && (m.type || '') , m && (m.message || m.title || ''));
});

socket.on('connect', function () {
  console.log('verbunden, schalte', PLUGIN, 'aus ...');
  socket.emit('disablePlugin', { category: CATEGORY, plugin: PLUGIN });
  setTimeout(function () {
    console.log('schalte', PLUGIN, 'ein ...');
    socket.emit('enablePlugin', { category: CATEGORY, plugin: PLUGIN });
    setTimeout(function () {
      console.log('fertig (' + seen.length + ' Meldungen). Jetzt in der App eine TIDAL-Suche versuchen.');
      process.exit(0);
    }, SETTLE_MS);
  }, PAUSE_MS);
});
