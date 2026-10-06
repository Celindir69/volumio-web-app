/* Künstler und Album aus der Wiedergabe: Alben eines Künstlers, Titel eines Albums
   Klassisches Skript, gemeinsamer globaler Gültigkeitsbereich; Reihenfolge siehe app.html.
   Klick auf den Künstler: Alben des Künstlers. Klick auf das Album (oder ein Album aus der Liste): Titel des Albums. */
var overlayBrowse = document.getElementById('overlayBrowse');
var browseTitle   = document.getElementById('browseTitle');
var browseBack    = document.getElementById('browseBack');
var browseBody    = document.getElementById('browseBody');
var browseStack   = [];       /* Verlauf: {kind:'artist'|'album', artist, album, uri} */
var browseOrigin  = null;     /* Overlay, aus dem die Ansicht geöffnet wurde (Suche, Info): der Zurück-Pfeil führt dorthin */
var browseSeq     = 0;        /* verwirft Antworten veralteter Anfragen */

function browseItems(j) {
  var lists = (j && j.navigation && j.navigation.lists) || [];
  var out = [];
  lists.forEach(function(l){ (l.items || []).forEach(function(it){ out.push(it); }); });
  return out;
}

var TIDAL_TIMEOUT_MS = 12000;     /* TIDAL antwortet manchmal nicht mehr (Session-Timeout in Volumio) */
var tidalDownUntil = 0;           /* nach einem Timeout TIDAL kurz in Ruhe lassen */

function browseGet(uri) {
  var p = fetch('/api/v1/browse?uri=' + encodeURIComponent(uri)).then(function(r){ return r.json(); });
  if (!/^tidal:/.test(uri)) return p;
  return withTimeout(p, TIDAL_TIMEOUT_MS).catch(function(err){
    tidalDownUntil = Date.now() + 60000;
    throw err;
  });
}

function browsePlay(item) {
  browseOrigin = null;
  fetch('/api/v1/replaceAndPlay', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({item:item})
  }).catch(function(){});
  closeAllOverlays();
}

function browseNote(text, cls) {
  var d = document.createElement('div');
  d.className = cls || 'sHint';
  d.textContent = text;
  return d;
}

/* ---------- TIDAL: ähnliche Künstler ---------- */
var TIDAL_ARTIST_RE = /^tidal:\/\/artist\/\d+$/;
var TIDAL_FALLBACK_MAX = 8;       /* so viele Last.fm-Namen höchstens einzeln bei TIDAL suchen */
var tidalSimilarCache = {};

function tidalArtistItems(j) {
  return browseItems(j).filter(function(it){ return it.service === 'tidal' && it.uri && TIDAL_ARTIST_RE.test(it.uri); });
}

/* Künstler bei TIDAL suchen; nur ein Treffer mit genau gleichem Namen zählt */
function tidalFindArtist(name) {
  if (!tidalOn || Date.now() < tidalDownUntil) return Promise.resolve(null);
  return withTimeout(fetch('/api/v1/search?query=' + encodeURIComponent(name)).then(function(r){ return r.json(); }), TIDAL_TIMEOUT_MS).then(function(j){
    var hit = null;
    tidalArtistItems(j).forEach(function(it){
      if (!hit && (it.title || '').toLowerCase() === name.toLowerCase()) hit = it;
    });
    return hit;
  }).catch(function(){ tidalDownUntil = Date.now() + 60000; return null; });
}

/* Liefert [{title, uri, albumart}]. Erst die eigene Künstlerseite bei TIDAL (falls sie ähnliche Künstler enthält),
   sonst die Last.fm-Namen, die nicht in der Sammlung sind, einzeln nachschlagen. */
function loadTidalSimilar(artist, localNames) {
  if (!tidalOn) return Promise.resolve([]);
  if (tidalSimilarCache[artist]) return Promise.resolve(tidalSimilarCache[artist]);
  function done(list) { if (list.length || Date.now() >= tidalDownUntil) tidalSimilarCache[artist] = list; return list; }   /* leere Antwort nach Timeout nicht merken */
  return tidalFindArtist(artist).then(function(self){
    var viaPage = self ? browseGet(self.uri).then(function(j){
      return tidalArtistItems(j).filter(function(it){ return it.uri !== self.uri; });
    }).catch(function(){ return []; }) : Promise.resolve([]);
    return viaPage.then(function(list){
      if (list.length) return list;
      var have = {};
      (localNames || []).forEach(function(n){ have[n.toLowerCase()] = true; });
      var names = (similarAllCache[artist] || []).filter(function(n){ return !have[n.toLowerCase()]; }).slice(0, TIDAL_FALLBACK_MAX);
      var found = [];
      return names.reduce(function(chain, n){            /* nacheinander, schont den Player */
        return chain.then(function(){
          return tidalFindArtist(n).then(function(it){ if (it) found.push(it); });
        });
      }, Promise.resolve()).then(function(){ return found; });
    });
  }).then(function(list){
    var seen = {};
    return done(list.filter(function(it){ if (seen[it.uri]) return false; seen[it.uri] = true; return true; })
      .map(function(it){ return {title:it.title, uri:it.uri, albumart:it.albumart}; }));
  }).catch(function(){ return []; });
}

function openBrowse(entry) {
  var cur = document.querySelector('.overlay.on');
  if (cur && cur !== overlayBrowse) browseOrigin = cur;
  else if (!cur) browseOrigin = null;
  closeAllOverlays();
  browseStack = [entry];
  overlayBrowse.classList.add('on');
  browseRender();
}

function browseRender() {
  var e = browseStack[browseStack.length - 1];
  var seq = ++browseSeq;
  browseBack.style.display = (browseStack.length > 1 || browseOrigin) ? '' : 'none';
  browseTitle.textContent = e.kind === 'artist' ? e.artist : (e.kind === 'playlist' ? e.name : e.album);
  browseBody.scrollTop = 0;
  while (browseBody.firstChild) browseBody.removeChild(browseBody.firstChild);
  browseBody.appendChild(browseNote('Laden…'));
  if (e.kind === 'artist') browseArtist(e, seq);
  else if (e.kind === 'playlist') browsePlaylist(e, seq);
  else browseAlbum(e, seq);
}

/* ---------- Alben eines Künstlers ---------- */
/* Künstlerzeile wie "A feat. B" oder "A, B" gehört auch zu A und B */
function artistParts(str) {
  var whole = String(str || '').toLowerCase().trim();       /* ganze Zeile zählt auch ("Simon & Garfunkel") */
  return [whole].concat(whole.split(/\s*(?:,|;|\/|&|\bfeat\.?|\bft\.?|\bwith\b|\bx\b)\s*/)).filter(function(x){ return x; });
}

/* Einzeltitel des Künstlers, die auf keinem seiner Alben liegen (z. B. Compilations, Various Artists).
   Quelle: der Tag-Dienst (MPD-Suche nach Interpret); ohne ihn die Volumio-Suche, die aber nur Titel liefert,
   in deren Titel der Name vorkommt. */
function localExtraTitles(artist, albumTitles) {
  var have = {};
  albumTitles.forEach(function(t){ have[t.toLowerCase()] = true; });
  var me = artist.toLowerCase();
  return withTimeout(fetch(TAGS + '/artist?tracks=1&name=' + encodeURIComponent(artist)).then(function(r){ return r.json(); }), 15000).then(function(j){
    if (!j.ok || !Array.isArray(j.tracks)) throw new Error(j.error || 'Tag-Dienst');
    return j.tracks.filter(function(t){
      return artistParts(t.artist).indexOf(me) >= 0 && !have[(t.album || '').toLowerCase()];
    }).map(function(t){
      var dir = t.file.replace(/\/[^\/]*$/, '');
      return {uri: 'mnt/' + t.file, service: 'mpd', type: 'song', title: t.title || t.file.replace(/^.*\//, ''),
              artist: t.artist, album: t.album, albumart: '/albumart?' + (t.artist && t.album ? 'web=' + encodeURIComponent(t.artist) + '/' + encodeURIComponent(t.album) + '/extralarge&' : '') +
                        'path=' + encodeURIComponent('/mnt/' + dir)};      /* wie Volumio selbst */
    }).sort(function(x, y){ return (x.title || '').localeCompare(y.title || ''); }).slice(0, 100);
  }).catch(function(){ return localSearchTitles(artist, have, me); });
}

function localSearchTitles(artist, have, me) {
  return fetch('/api/v1/search?query=' + encodeURIComponent(artist)).then(function(r){ return r.json(); }).then(function(j){
    var seen = {};
    return browseItems(j).filter(function(it){
      if (it.type !== 'song' || it.service !== 'mpd' || !it.uri || seen[it.uri]) return false;
      if (artistParts(it.artist).indexOf(me) < 0) return false;
      if (have[(it.album || '').toLowerCase()]) return false;                 /* liegt auf einem eigenen Album */
      seen[it.uri] = true;
      return true;
    }).sort(function(x, y){ return (x.title || '').localeCompare(y.title || ''); }).slice(0, 100);
  }).catch(function(){ return []; });
}

function browseHeading(text) {
  var d = document.createElement('div');
  d.className = 'infoSection'; d.textContent = text;
  return d;
}

function browseTrackRow(t, e, showAlbum) {
  var row = document.createElement('div');
  row.className = 'sRow';
  var img = document.createElement('img');
  img.className = 'sCover';
  if (t.albumart) img.src = artUrl(t.albumart);
  var meta = document.createElement('div');
  meta.className = 'sMeta';
  var ti = document.createElement('div');
  ti.className = 'sTitle'; ti.textContent = t.title || t.name || '';
  meta.appendChild(ti);
  var subText = showAlbum ? (t.album || '') : '';
  if (subText) { var sub = document.createElement('div'); sub.className = 'sSub'; sub.textContent = subText; meta.appendChild(sub); }
  row.appendChild(img); row.appendChild(meta);
  var pen = tagTrackButton(t);                             /* lokale Datei: Tags dieses Titels bearbeiten */
  if (pen) row.appendChild(pen);
  row.addEventListener('click', function(){
    browsePlay({uri:t.uri, service:t.service || 'mpd', type:'song',
                title:t.title || t.name || '', artist:t.artist || e.artist || '', album:t.album || ''});
  });
  return row;
}

function browseArtist(e, seq) {
  var isTidal = !!(e.uri && /^tidal:/.test(e.uri));
  browseGet(e.uri || ('artists://' + e.artist)).then(function(j){
    if (seq !== browseSeq) return;
    var seenUri = {};
    var all = browseItems(j);
    var albums = all.filter(function(it){
      if (!it.title || !it.uri || !/^folder/.test(it.type || '') || seenUri[it.uri]) return false;
      if (it.service === 'tidal' && TIDAL_ARTIST_RE.test(it.uri)) return false;       /* andere Künstler nicht als Album */
      seenUri[it.uri] = true;
      return true;
    });
    var pageTracks = all.filter(function(it){ return it.uri && it.title && !/^folder/.test(it.type || '') && it.type === 'song'; });   /* z. B. Top-Titel bei TIDAL */
    while (browseBody.firstChild) browseBody.removeChild(browseBody.firstChild);
    if (!albums.length && !pageTracks.length && isTidal) { browseBody.appendChild(browseNote('Keine Alben gefunden')); return; }

    var photo = document.createElement('img');      /* Künstlerfoto vom Tag-Dienst (Deezer); ohne Foto fällt es weg */
    photo.id = 'browseArtistPhoto';
    photo.alt = '';
    photo.addEventListener('error', function(){ if (photo.parentNode) photo.parentNode.removeChild(photo); });
    photo.src = TAGS + '/artistimage?name=' + encodeURIComponent(e.artist);
    browseBody.appendChild(photo);

    if (!isTidal) {                                   /* alles vom Künstler abspielen (Alben und Einzeltitel) */
      var head = document.createElement('div');
      head.id = 'browseArtistHead';
      head.innerHTML = '<div id="browsePlayAll"><svg viewBox="0 0 24 24"><path d="M7 5v14l12-7z"/></svg></div>';
      var lbl = document.createElement('div');
      lbl.className = 'bAlbum'; lbl.textContent = 'Alle abspielen';
      head.appendChild(lbl);
      head.appendChild(tagArtistButton(e.artist));    /* Tags aller lokalen Titel des Künstlers bearbeiten */
      head.addEventListener('click', function(){
        browsePlay({uri:'artists://' + e.artist, service:'mpd', type:'folder', title:e.artist});
      });
      browseBody.appendChild(head);
    }

    var albumHead = browseHeading('Alben');
    albumHead.style.display = 'none';
    browseBody.appendChild(albumHead);
    if (!albums.length && !isTidal) browseBody.appendChild(browseNote('Keine Alben in der Sammlung gefunden'));

    albums.forEach(function(al){
      var row = document.createElement('div');
      row.className = 'sRow' + (al.title === curAlbum && e.artist === curArtist ? ' cur' : '');
      var img = document.createElement('img');
      img.className = 'sCover';
      if (al.albumart) img.src = artUrl(al.albumart);
      var meta = document.createElement('div');
      meta.className = 'sMeta';
      var ti = document.createElement('div');
      ti.className = 'sTitle'; ti.textContent = al.title;
      meta.appendChild(ti);
      var subText = al.service === 'tidal' ? [al.year, al.audioQuality && al.audioQuality !== 'LOSSLESS' ? al.audioQuality : ''].filter(function(x){ return x; }).join('  ·  ') : (al.artist || '');
      if (subText) { var sub = document.createElement('div'); sub.className = 'sSub'; sub.textContent = subText; meta.appendChild(sub); }
      row.appendChild(img); row.appendChild(meta);
      var apen = tagAlbumButton(al);                  /* lokales Album: Tags aller Titel */
      if (apen) row.appendChild(apen);
      row.addEventListener('click', function(){
        browseStack.push({kind:'album', artist:e.artist, album:al.title, uri:al.uri, albumart:al.albumart, service:al.service});
        browseRender();
      });
      browseBody.appendChild(row);
    });

    function addTitles(list, showAlbum) {
      if (!list.length || seq !== browseSeq) return;
      albumHead.style.display = '';                   /* "Alben" erst anzeigen, wenn darunter "Titel" folgt */
      browseBody.appendChild(browseHeading('Titel'));
      list.forEach(function(t){ browseBody.appendChild(browseTrackRow(t, e, showAlbum)); });
    }
    if (isTidal) addTitles(pageTracks, true);
    else localExtraTitles(e.artist, albums.map(function(a){ return a.title; })).then(function(list){ addTitles(list, true); });
  }).catch(function(){
    if (seq !== browseSeq) return;
    while (browseBody.firstChild) browseBody.removeChild(browseBody.firstChild);
    browseBody.appendChild(browseNote('Fehler beim Laden'));
  });
}

/* ---------- Titel eines Albums ---------- */
/* Aus der Wiedergabe ist nur Künstler und Album bekannt: die Adresse steht in der Albumliste des Künstlers */
function resolveAlbumUri(artist, album) {
  return browseGet('artists://' + artist).then(function(j){
    var hit = null;
    browseItems(j).forEach(function(it){
      if (!hit && it.type === 'folder' && it.uri && (it.title || '').toLowerCase() === album.toLowerCase()) hit = it;
    });
    return hit ? hit.uri : 'albums://' + artist + '/' + album;
  }).catch(function(){ return 'albums://' + artist + '/' + album; });
}

function browseAlbum(e, seq) {
  var ready = e.uri ? Promise.resolve(e.uri) : resolveAlbumUri(e.artist, e.album).then(function(u){ e.uri = u; return u; });
  ready.then(browseGet).then(function(j){
    if (seq !== browseSeq) return;
    var info = (j && j.navigation && j.navigation.info) || {};
    var tracks = browseItems(j).filter(function(it){ return it.uri && !/^folder/.test(it.type || ''); });
    while (browseBody.firstChild) browseBody.removeChild(browseBody.firstChild);
    if (!tracks.length) { browseBody.appendChild(browseNote('Keine Titel gefunden')); return; }

    var art = info.albumart || e.albumart || tracks[0].albumart || (e.album === curAlbum ? lastArt : '');
    var head = document.createElement('div');
    head.id = 'browseAlbumHead';
    var img = document.createElement('img');
    img.className = 'bCover';
    if (art) img.src = artUrl(art);
    var meta = document.createElement('div');
    meta.className = 'sMeta';
    var ti = document.createElement('div');
    ti.className = 'sTitle bAlbum'; ti.textContent = e.album;
    var sub = document.createElement('div');
    sub.className = 'sSub'; sub.textContent = info.artist || e.artist || '';
    meta.appendChild(ti); meta.appendChild(sub);
    var play = document.createElement('div');
    play.id = 'browsePlayAll';
    play.title = 'Ganzes Album abspielen';
    play.innerHTML = '<svg viewBox="0 0 24 24"><path d="M7 5v14l12-7z"/></svg>';
    play.addEventListener('click', function(){
      browsePlay({uri:e.uri, service:info.service || e.service || 'mpd', type:'folder', title:e.album, artist:e.artist});
    });
    head.appendChild(img); head.appendChild(meta);
    var localTracks = tracks.filter(isLocalTrack);
    if (localTracks.length) {                              /* lokale Dateien: Tags bearbeiten */
      head.appendChild(tagEditButton(localTracks.map(function(t){ return {uri:t.uri, title:t.title || t.name || ''}; }),
                                     e.album, 'browseEditBtn'));
    }
    head.appendChild(play);
    browseBody.appendChild(head);

    tracks.forEach(function(t, i){
      var row = document.createElement('div');
      var isCur = (e.album === curAlbum && (t.title || t.name) === mTitle.textContent);
      row.className = 'sRow bTrack' + (isCur ? ' cur' : '');
      var num = document.createElement('div');
      num.className = 'bNum'; num.textContent = i + 1;
      var tm = document.createElement('div');
      tm.className = 'sMeta';
      var tt = document.createElement('div');
      tt.className = 'sTitle'; tt.textContent = t.title || t.name || '';
      tm.appendChild(tt);
      row.appendChild(num); row.appendChild(tm);
      if (t.duration) {
        var du = document.createElement('div');
        du.className = 'bDur'; du.textContent = fmtTime(t.duration);
        row.appendChild(du);
      }
      var pen = tagTrackButton(t);
      if (pen) row.appendChild(pen);
      row.addEventListener('click', function(){            /* Album ab diesem Titel (wie bei Playlisten) */
        playlistPlay({uri:e.uri, name:e.album, service:info.service || e.service || 'mpd', type:'folder'}, tracks, i);
      });
      browseBody.appendChild(row);
    });
    browseBody.appendChild(browseNote('Tippen: Album ab diesem Titel'));
  }).catch(function(){
    if (seq !== browseSeq) return;
    while (browseBody.firstChild) browseBody.removeChild(browseBody.firstChild);
    browseBody.appendChild(browseNote('Fehler beim Laden'));
  });
}

/* ---------- Titel einer Playlist ---------- */
/* Tipp auf einen Titel: die ganze Playlist wird zur Warteschlange und läuft ab diesem Titel */
var lastPlayedPlaylist = '';
function playlistPlay(e, tracks, from) {
  lastPlayedPlaylist = e.uri;
  socket.emit('replaceAndPlay', {uri:e.uri, title:e.name, albumart:null, service:e.service || 'mpd', type:e.type || undefined});
  closeAllOverlays();
  browseOrigin = null;
  if (!from) return;
  var tries = 0;
  (function waitForQueue() {                       /* warten, bis die Warteschlange vollständig ist, dann springen */
    setTimeout(function(){
      fetch('/api/v1/getQueue').then(function(r){ return r.json(); }).then(function(j){
        var n = (j && j.queue) ? j.queue.length : 0;
        if (n >= tracks.length) socket.emit('play', {value:from});
        else if (++tries < 16) waitForQueue();
      }).catch(function(){ if (++tries < 16) waitForQueue(); });
    }, 500);
  })();
}

function browsePlaylist(e, seq) {
  browseGet(e.uri).then(function(j){
    if (seq !== browseSeq) return;
    var tracks = browseItems(j).filter(function(it){ return it.uri && !/^folder/.test(it.type || ''); });
    while (browseBody.firstChild) browseBody.removeChild(browseBody.firstChild);
    if (!tracks.length) { browseBody.appendChild(browseNote('Playlist ist leer')); return; }

    var head = document.createElement('div');
    head.id = 'browseArtistHead';
    head.innerHTML = '<div id="browsePlayAll"><svg viewBox="0 0 24 24"><path d="M7 5v14l12-7z"/></svg></div>';
    var lbl = document.createElement('div');
    lbl.className = 'sMeta';
    var t1 = document.createElement('div'); t1.className = 'sTitle bAlbum'; t1.textContent = 'Playlist abspielen';
    var t2 = document.createElement('div'); t2.className = 'sSub'; t2.textContent = tracks.length + ' Titel';
    lbl.appendChild(t1); lbl.appendChild(t2);
    head.appendChild(lbl);
    head.addEventListener('click', function(){ playlistPlay(e, tracks, 0); });
    browseBody.appendChild(head);

    tracks.forEach(function(t, i){
      var row = document.createElement('div');
      var isCur = (i === curPos && lastPlayedPlaylist === e.uri);
      row.className = 'sRow bTrack' + (isCur ? ' cur' : '');
      var num = document.createElement('div');
      num.className = 'bNum'; num.textContent = i + 1;
      var tm = document.createElement('div');
      tm.className = 'sMeta';
      var tt = document.createElement('div');
      tt.className = 'sTitle'; tt.textContent = t.title || t.name || '';
      tm.appendChild(tt);
      if (t.artist) { var ts = document.createElement('div'); ts.className = 'sSub'; ts.textContent = t.artist; tm.appendChild(ts); }
      row.appendChild(num); row.appendChild(tm);
      if (t.duration) {
        var du = document.createElement('div');
        du.className = 'bDur'; du.textContent = fmtTime(t.duration);
        row.appendChild(du);
      }
      var pen = tagTrackButton(t);
      if (pen) row.appendChild(pen);
      row.addEventListener('click', function(){ playlistPlay(e, tracks, i); });
      browseBody.appendChild(row);
    });
    browseBody.appendChild(browseNote('Tippen: Playlist ab diesem Titel'));
  }).catch(function(){
    if (seq !== browseSeq) return;
    while (browseBody.firstChild) browseBody.removeChild(browseBody.firstChild);
    browseBody.appendChild(browseNote('Fehler beim Laden'));
  });
}

/* ---------- Einstieg und Zurück ---------- */
mArtist.addEventListener('click', function(){
  var a = mArtist.textContent;
  if (curRadio || !a) return;
  openBrowse({kind:'artist', artist:a});
});
mAlbum.addEventListener('click', function(){
  var a = mArtist.textContent, al = mAlbum.textContent;
  if (curRadio || !a || !al) return;
  openBrowse({kind:'album', artist:a, album:al});
});
mTitle.addEventListener('click', function(){       /* Webradio: Klick auf "Künstler - Titel" */
  if (curRadio && radioArtist) openBrowse({kind:'artist', artist:radioArtist});
});
browseBack.addEventListener('click', function(){
  if (browseStack.length > 1) { browseStack.pop(); browseRender(); }
  else if (browseOrigin) {                        /* zurück zu Suche bzw. Info, wie sie waren */
    var o = browseOrigin; browseOrigin = null;
    closeAllOverlays(); o.classList.add('on');
  }
});
document.getElementById('closeBrowse').addEventListener('click', function(){ closeAllOverlays(); });
