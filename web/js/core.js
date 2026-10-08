/* Grundlagen: App-Icon, Elemente, Zustand, Zeitanzeige, Abfragen (Plugin, Diskografie, Last.fm)
   Klassisches Skript, gemeinsamer globaler Gültigkeitsbereich; Reihenfolge siehe app.html. */
/* App-Icon */
(function(){
  var c = document.createElement('canvas');
  c.width = c.height = 180;
  var x = c.getContext('2d');
  x.fillStyle = '#111'; x.fillRect(0, 0, 180, 180);
  x.fillStyle = '#fff';
  x.font = 'bold 96px Century Gothic, Avant Garde, sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('MX', 90, 90);
  document.getElementById('appIcon').href = c.toDataURL();
})();

/* Bilder, die nicht laden (Cover fehlt, Server weg), bleiben leer statt des Fragezeichen-Symbols.
   error/load steigen nicht auf, daher in der Capture-Phase am Dokument; Platz in der Zeile bleibt erhalten. */
function imgCheck(img) {
  if (img.complete && img.getAttribute('src') && !img.naturalWidth) img.classList.add('imgFail');
}
document.addEventListener('error', function(e){
  var t = e.target;
  if (t && t.tagName === 'IMG') t.classList.add('imgFail');
}, true);
document.addEventListener('load', function(e){
  var t = e.target;
  if (t && t.tagName === 'IMG') t.classList.remove('imgFail');
}, true);
/* Fehler, die schon vor dem Einhängen ins Dokument passiert sind, beim Einhängen nachholen */
if (window.MutationObserver) new MutationObserver(function(muts){
  muts.forEach(function(m){
    for (var i = 0; i < m.addedNodes.length; i++) {
      var n = m.addedNodes[i];
      if (n.nodeType !== 1) continue;
      if (n.tagName === 'IMG') imgCheck(n);
      else if (n.getElementsByTagName) Array.prototype.forEach.call(n.getElementsByTagName('img'), imgCheck);
    }
  });
}).observe(document.documentElement, {childList: true, subtree: true});

/* Alias für Lyrics-Funktionen */
var body = document.getElementById('lyricsText');
var area = document.getElementById('overlayLyrics').querySelector('.overlayBody');

var socket = io();
socket.on('connect', function(){ console.log('Socket verbunden'); });
socket.on('pushState', function(st){
  if (typeof showVolumio === 'function') showVolumio(st);
  if (typeof st.random === 'boolean') { stRandom = st.random; updateCtrlUI(); }
  if (typeof st.repeat === 'boolean') {
    stRepeatMode = st.repeatSingle ? 'one' : (st.repeat ? 'all' : 'off');
    updateCtrlUI();
  }
});

/* Streamingdienste (streaming.js): eingeschaltet nach APP_CONFIG.TIDAL / QOBUZ, 'auto' nach den Quellen von Volumio.
   Bis die Antwort da ist, gilt nur TIDAL als vorhanden (so bleibt beim Laden nichts hängen). */
var appCfg = window.APP_CONFIG || {};
var tidalOn = false;                                   /* Kurzform für Stellen, die nur TIDAL betreffen */
function streamCap(s) { return s.id.charAt(0).toUpperCase() + s.id.slice(1); }
function streamsApply() {
  var root = document.documentElement;
  STREAMS.forEach(function(s){
    root.classList.toggle('no' + streamCap(s), !s.on);         /* blendet das Kästchen des Dienstes in der Suche aus */
    var box = document.getElementById('src' + streamCap(s));
    if (box) box.checked = s.show;
  });
  root.classList.toggle('noStream', !streamsOn().length);
  root.classList.toggle('manyStreams', streamsOn().length > 2);
  tidalOn = streamById('tidal').on;
  if (!streamsOn().length && typeof searchShowLocal !== 'undefined') {
    searchShowLocal = true;
    document.getElementById('srcLocal').checked = true;
  }
}
streamConfigure(appCfg, null);
if (streamNeedsSources(appCfg)) {
  socket.on('pushBrowseSources', function(list){ streamConfigure(appCfg, list || []); streamsApply(); });
  socket.emit('getBrowseSources');
}
streamsApply();

function fmtTime(s) {
  s = Math.floor(s || 0);
  var m = Math.floor(s / 60); s = s % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}

var bg       = document.getElementById('bg');
var cover    = document.getElementById('cover');
var mTitle   = document.getElementById('mTitle');
var mArtist  = document.getElementById('mArtist');
var mAlbum   = document.getElementById('mAlbum');
var mTech    = document.getElementById('mTech');
var mBadge   = document.getElementById('mBadge');
var seekFill = document.getElementById('seekFill');
var tElapsed = document.getElementById('tElapsed');
var tRemain  = document.getElementById('tRemain');
var playIcon = document.getElementById('playIcon');

var lyricsText       = document.getElementById('lyricsText');
var infoContent      = document.getElementById('infoContent');
var infoTabs         = document.getElementById('infoTabs');
var infoOverlayTitle = document.getElementById('infoOverlayTitle');
var infoOverlayBody  = document.getElementById('infoOverlayBody');

var overlayLyrics    = document.getElementById('overlayLyrics');
var overlayInfo      = document.getElementById('overlayInfo');
var overlayQueue     = document.getElementById('overlayQueue');
var overlayPlaylists = document.getElementById('overlayPlaylists');
var overlaySearch    = document.getElementById('overlaySearch');

var queueList        = document.getElementById('queueList');

var btnLyrics    = document.getElementById('btnLyrics');
var btnInfo      = document.getElementById('btnInfo');
var btnQueue     = document.getElementById('btnQueue');
var btnPlaylists = document.getElementById('btnPlaylists');
var btnSearch    = document.getElementById('btnSearch');

var cRepeat      = document.getElementById('cRepeat');
var cRandom      = document.getElementById('cRandom');
var repeatBadge  = cRepeat.querySelector('.badge');

var playlistResults = document.getElementById('playlistResults');
var radioPanel      = document.getElementById('radioPanel');
var searchInput     = document.getElementById('searchInput');
var searchResults   = document.getElementById('searchResults');

var radioArtist = '';          /* Künstler aus dem Stream-Titel (nur Webradio) */
var curRadio    = false;       /* spielt gerade ein Webradio? */
var lastKey     = '';
var lastLyrKey  = '';
var lastArt     = '';
var lyricLines  = [];
var infoItems   = [];
var infoIdx     = 0;
var curDur      = 0;
var curAlbum    = '';
var curArtist = '';
var curPos      = -1;
var queueData   = [];
var stRandom    = false;
var stRepeatMode= 'off';
var drag        = null;
var swipe       = null;
var plTabActive = 1;

var searchData  = streamEmptySearch();
var searchCat   = 'artists';
var searchQuery = '';

var LASTFM_KEY = (window.APP_CONFIG && window.APP_CONFIG.LASTFM_KEY) || '';   /* in web/config.local.js eintragen */
var similarCache = {};
var similarAllCache = {};       /* Künstlername -> alle Namen von Last.fm (auch die nicht in der Sammlung) */          /* Künstlername -> Array gefundener Namen */

/* ---------- Zeitanzeige (läuft zwischen den Polls selbst weiter) ---------- */
var seekBase = 0, seekStamp = 0, playing = false;

function paintTime() {
  if (document.hidden) return;
  var pos = seekBase + (playing ? Date.now() - seekStamp : 0);
  if (curDur) pos = Math.min(pos, curDur * 1000);
  window.currentSeekMs = pos;          /* Lyrics laufen so flüssig mit */
  if (!curDur) {                       /* Webradio: keine Dauer */
    tElapsed.textContent = ''; tRemain.textContent = '';
    seekFill.style.width = '0%';
    return;
  }
  tElapsed.textContent = fmtTime(pos / 1000);
  tRemain.textContent  = '-' + fmtTime(Math.max(0, curDur - pos / 1000));
  seekFill.style.width = Math.min(100, pos / 1000 / curDur * 100) + '%';
}
setInterval(paintTime, 250);

/* an eine Stelle im Song springen (ms) */
function seekToMs(ms) {
  if (!curDur) return;
  var sec = Math.max(0, Math.min(curDur, Math.ceil(ms / 1000)));
  seekBase = sec * 1000; seekStamp = Date.now();
  paintTime();
  fetch('/api/v1/commands/?cmd=seek&position=' + sec).catch(function(){});
}


/* Antwort höchstens ms Millisekunden abwarten (Volumio/TIDAL hängt manchmal, Session-Timeout) */
function withTimeout(p, ms) {
  return new Promise(function(resolve, reject){
    var t = setTimeout(function(){ reject(new Error('timeout')); }, ms);
    p.then(function(v){ clearTimeout(t); resolve(v); }, function(e){ clearTimeout(t); reject(e); });
  });
}

function artUrl(a) {
  if (!a) return '';
  return (a.indexOf('http') === 0) ? a : (location.origin + a);
}

function ask(payload) {
  return withTimeout(fetch('/api/v1/pluginEndpoint', {          /* Volumio 4 ohne Abo antwortet teils gar nicht */
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({endpoint:'metavolumio', data:payload})
  }), 6000).then(function(r){ return r.json(); })
    .then(function(j){
      if (!j || !j.data || !j.data.value) return null;
      if (j.data.type === 'story')   return {kind:'story',   value:j.data.value};
      if (j.data.type === 'credits' && j.data.value.length)
                                     return {kind:'credits', value:j.data.value};
      return null;
    }).catch(function(){ return null; })
    .then(function(res){                       /* nichts von Volumio (Volumio 4 ohne Abo): Texte selbst holen (infotext.js) */
      if (res || !/^story/.test(payload.mode) || typeof infoFallback !== 'function') return res;
      return withTimeout(infoFallback(fetch.bind(window), LASTFM_KEY, payload.mode, payload.artist, payload.album, LANG), 10000)
        .catch(function(){ return null; });
    });
}

function askDiscography(artist) {
  var url = '/api/v1/browse?uri=' + encodeURIComponent('artists://' + artist);
  return fetch(url).then(function(r){ return r.json(); }).then(function(j){
    var lists = (j && j.navigation && j.navigation.lists) || [];
    var out = [];
    lists.forEach(function(l){
      (l.items || []).forEach(function(it){
        if (it.title && it.uri && it.type === 'folder')
          out.push({title:it.title, uri:it.uri});
      });
    });
    if (!out.length) return null;
    return {kind:'disc', value:out};
  }).catch(function(){ return null; });
}


function loadSimilarArtists(artist) {
  if (!LASTFM_KEY) return Promise.resolve([]);   /* ohne Schlüssel keine ähnlichen Künstler */
  if (similarCache[artist]) return Promise.resolve(similarCache[artist]);
  var url = 'https://ws.audioscrobbler.com/2.0/?method=artist.getsimilar' +
            '&artist=' + encodeURIComponent(artist) +
            '&api_key=' + LASTFM_KEY + '&format=json&limit=15';
  return fetch(url).then(function(r){ return r.json(); })
    .then(function(j){
      var list = (j && j.similarartists && j.similarartists.artist) || [];
      var names = list.map(function(a){ return a.name; }).filter(function(n){ return n; });
      similarAllCache[artist] = names;
      if (!names.length) { similarCache[artist] = []; return []; }
      var checks = names.map(function(name){
        return fetch('/api/v1/browse?uri=' + encodeURIComponent('artists://' + name))
          .then(function(r){ return r.json(); })
          .then(function(j){
            var lists = (j && j.navigation && j.navigation.lists) || [];
            var hasAlbums = lists.some(function(l){ return (l.items||[]).length > 0; });
            return hasAlbums ? name : null;
          }).catch(function(){ return null; });
      });
      return Promise.all(checks).then(function(results){
        var matched = results.filter(function(n){ return n; });
        similarCache[artist] = matched;
        return matched;
      });
    }).catch(function(){ similarCache[artist] = []; return []; });
}

function playArtistByName(name) {
  fetch('/api/v1/search?query=' + encodeURIComponent(name))
    .then(function(r){ return r.json(); })
    .then(function(j){
      var lists = (j && j.navigation && j.navigation.lists) || [];
      var artistItem = null;
      lists.forEach(function(l){
        var t = (l.title || '').toLowerCase();
        if (t.indexOf('interpret') > -1) {
          (l.items || []).forEach(function(it){
            if (!artistItem && (it.title||it.name||'').toLowerCase() === name.toLowerCase())
              artistItem = it;
          });
          if (!artistItem && l.items && l.items.length) artistItem = l.items[0];
        }
      });
      if (artistItem) {
        fetch('/api/v1/replaceAndPlay', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body:JSON.stringify({item:{
            uri: artistItem.uri, service: artistItem.service || 'mpd',
            type:'folder', title: artistItem.title || artistItem.name || name
          }})
        }).catch(function(){});
      }
    }).catch(function(){});
}


