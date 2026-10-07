/* Streamingdienste neben der eigenen Sammlung (TIDAL, Qobuz, HIGHRESAUDIO, Spotify): welche es gibt, woran man
   ihre Einträge erkennt und wie Volumios Suchergebnisse aufgeteilt werden. Eingeschaltet über APP_CONFIG.TIDAL,
   .QOBUZ, .HRA, .SPOTIFY (true, false oder 'auto' = nur, wenn das Plugin in Volumio aktiv ist).
   Klassisches Skript, gemeinsamer globaler Gültigkeitsbereich; als erstes App-Skript geladen (vor core.js). */
/* key: Plugin- bzw. Dienstname (service, plugin_name) und Anfang der Adressen; short: Beschriftung des Kästchens in der Suche;
   title: Überschrift einer Ergebnisliste dieses Dienstes */
var STREAMS = [
  {id: 'tidal', name: 'TIDAL', short: 'TIDAL', cfg: 'TIDAL', key: /^tidal/i, title: /tidal/,
   uriRe: /^tidal:/i, artistRe: /^tidal:\/\/artist\/\d+$/i},
  /* Qobuz-Plugin von Volumio: Adressen wie qobuz://artist/123 (ältere Fassungen qobuz/artist/123) */
  {id: 'qobuz', name: 'Qobuz', short: 'Qobuz', cfg: 'QOBUZ', key: /^qobuz/i, title: /qobuz/,
   uriRe: /^qobuz(:\/\/|\/)/i, artistRe: /^qobuz(:\/\/|\/)artists?\/[\w-]+$/i},
  /* HIGHRESAUDIO-Plugin: heißt in Volumio hi_res_audio (Quelle uri "hi_res_audio"), ältere Namen hra/highresaudio; Format der Adressen noch nicht am Gerät geprüft */
  {id: 'hra', name: 'HIGHRESAUDIO', short: 'HRA', cfg: 'HRA', key: /^(hra|highresaudio|hi_res_audio)/i, title: /\bhra\b|highresaudio|hi_res_audio|high res audio/,
   uriRe: /^(hra|highresaudio|hi_res_audio)(:\/\/|\/|:)/i, artistRe: /^(hra|highresaudio|hi_res_audio)(:\/\/|\/|:)artists?\/[\w-]+$/i},
  /* Spotify-Plugin von Volumio (spop, nur mit Premium): Adressen wie spotify:artist:4Z8W…; Spotify Connect allein bietet keine Suche */
  {id: 'spotify', name: 'Spotify', short: 'Spotify', cfg: 'SPOTIFY', key: /^(spop|spotify)/i, title: /spotify/,
   uriRe: /^spotify[:\/]/i, artistRe: /^spotify:artist:\w+$/i}
];
STREAMS.forEach(function(s){ s.on = false; s.show = true; s.downUntil = 0; });

function streamById(id) { return STREAMS.filter(function(s){ return s.id === id; })[0] || null; }

/* Dienst eines Eintrags (item mit service/uri) oder einer Adresse; null = eigene Sammlung, Radio usw. */
function streamOf(x) {
  if (!x) return null;
  if (typeof x === 'string') return STREAMS.filter(function(s){ return s.uriRe.test(x); })[0] || null;
  var sv = String(x.service || '');
  return (sv && STREAMS.filter(function(s){ return s.key.test(sv); })[0]) || streamOf(x.uri || '');
}
function streamIsArtist(it) {
  var s = streamOf(it);
  if (!s || !it.uri || !s.artistRe.test(it.uri)) return false;
  /* HIGHRESAUDIO liefert auch Alben mit einer artists/-Adresse; die tragen einen anderen Namen als den Künstler */
  return !it.artist || String(it.artist).toLowerCase() === String(it.title || '').toLowerCase();
}
function streamsOn() { return STREAMS.filter(function(s){ return s.on; }); }

/* Art einer Ergebnisliste nach ihrer Überschrift (deutsch oder englisch) und ihren Einträgen: artists, albums, songs oder null */
function streamListCat(title, items) {
  var t = String(title || '').toLowerCase().split("'")[0];   /* nur der Teil vor dem Suchbegriff: "gefunden 1 Album 'Begriff'" */
  if (/playlist|radio/.test(t)) return null;
  if (/interpret|künstler|kuenstler|artist/.test(t)) return 'artists';
  if (/album|alben/.test(t)) return 'albums';
  if (/titel|track|song/.test(t)) return 'songs';
  var first = (items || [])[0];                              /* Überschrift unbekannt: am ersten Eintrag erkennen */
  if (!first) return null;
  if (first.type === 'song') return 'songs';
  if (streamIsArtist(first)) return 'artists';
  if (/^folder|album/.test(first.type || '')) return 'albums';
  return null;
}

/* Volumios Suchantwort aufteilen -> {artists, albums, songs, stream: {tidal: {...}, qobuz: {...}}} */
function streamEmptySearch() {
  var d = {artists: [], albums: [], songs: [], stream: {}};
  STREAMS.forEach(function(s){ d.stream[s.id] = {artists: [], albums: [], songs: []}; });
  return d;
}
function streamSplitSearch(lists, query) {
  var d = streamEmptySearch(), q = String(query || '').toLowerCase();
  (lists || []).forEach(function(l){
    var items = l.items || [], title = String(l.title || '').toLowerCase().split("'")[0];   /* ohne den Suchbegriff */
    if (title.indexOf('internetradio') > -1 || title.indexOf('webradio') > -1) return;
    var svc = STREAMS.filter(function(s){ return s.title.test(title); })[0] || (items[0] && streamOf(items[0]));
    var cat = streamListCat(l.title, items);
    if (!cat) return;
    if (svc) {
      var into = d.stream[svc.id], byTitle = streamListCat(l.title, []);
      items.forEach(function(it){
        if (!it.title && !it.name) return;                  /* HIGHRESAUDIO hängt einen leeren Eintrag an */
        /* Liste ohne Überschrift (TIDAL, HIGHRESAUDIO): jeden Eintrag selbst einordnen, die Dienste mischen Arten */
        var c = byTitle || (it.type === 'song' ? 'songs' : streamIsArtist(it) ? 'artists' : 'albums');
        into[c].push(it);
      });
      return;
    }
    if (cat === 'songs') {                                  /* lokale Titel: nur echte Treffer im Titel oder Künstler */
      items = items.filter(function(it){
        return (it.title || it.name || '').toLowerCase().indexOf(q) > -1 || (it.artist || '').toLowerCase().indexOf(q) > -1;
      });
    }
    d[cat] = items;
  });
  return d;
}

/* Dienste nach der Einstellung einschalten; 'auto' erst mit Volumios Quellenliste (sources) */
function streamConfigure(cfg, sources) {
  STREAMS.forEach(function(s){
    var v = cfg ? cfg[s.cfg] : undefined;
    if (v === true || v === false) { s.on = v; return; }
    if (!sources) { s.on = s.id === 'tidal'; return; }      /* bis Volumio antwortet: wie bisher nur TIDAL annehmen */
    s.on = sources.some(function(x){ return s.key.test(x.plugin_name || '') || s.key.test(x.uri || ''); });
  });
}
function streamNeedsSources(cfg) {
  return STREAMS.some(function(s){ var v = cfg ? cfg[s.cfg] : undefined; return v !== true && v !== false; });
}

if (typeof module !== 'undefined') module.exports = {STREAMS: STREAMS, streamOf: streamOf, streamIsArtist: streamIsArtist,
  streamListCat: streamListCat, streamSplitSearch: streamSplitSearch, streamConfigure: streamConfigure,
  streamNeedsSources: streamNeedsSources, streamsOn: streamsOn};
