/* Suchen & Entdecken ohne Eingabe, passend zum Reiter (Künstler, Alben, Titel): Reihen „Zufällige Entdeckungen“ (mit Würfel),
   „Vor einem Jahr gehört“, „Lange nicht gehört“, „Noch nie gehört“, „Früher oft gehört“
   (Tag-Dienst GET /discover?kind=…, /plays?view=ago&kind=…). Leere Reihen fallen weg.
   Klassisches Skript, gemeinsamer globaler Gültigkeitsbereich; nach library.js und history.js geladen. */
var discoverReady = false;       /* Tag-Dienst erreichbar */
var discoverSeq   = 0;
var discoverTimer = null;
/* Suchreiter -> Art beim Tag-Dienst */
var DISCOVER_KIND = {
  artists: {kind: 'artist', ago: 'disc.ago.artist'},
  albums:  {kind: 'album',  ago: 'disc.ago.album'},
  songs:   {kind: 'track',  ago: 'disc.ago.track'}
};
var DISCOVER_SHELVES = ['random', 'ago', 'forgotten', 'never', 'oldfav'];   /* Reihenfolge auf der Seite */

function discoverDate(t) { return langDate(t * 1000); }
function discoverCat() { return DISCOVER_KIND[searchCat] || DISCOVER_KIND.albums; }

/* von renderSearchResults aufgerufen, solange nichts gesucht wurde; false: nicht verfügbar */
function discoverShow() {
  if (!discoverReady) return false;
  var seq = ++discoverSeq, cat = discoverCat();
  clearTimeout(discoverTimer);
  while (searchResults.firstChild) searchResults.removeChild(searchResults.firstChild);
  var box = histEl('div', 'dBox'), secs = {};
  DISCOVER_SHELVES.forEach(function(id){ secs[id] = histEl('div', 'dSec'); box.appendChild(secs[id]); });
  searchResults.appendChild(box);

  tagGetJson('/plays?view=ago&kind=' + cat.kind + histTz()).then(function(r){
    var a = r && r.ago;
    if (seq !== discoverSeq || !a || !a.items.length) return;
    secs.ago.appendChild(browseHeading(T(cat.ago, {n: a.years})));
    var row = histEl('div', 'dRow');
    a.items.forEach(function(it){ row.appendChild(discoverTile(cat.kind, it)); });
    secs.ago.appendChild(row);
    discoverFit(row);
  }).catch(function(){});

  discoverLoad(seq, cat, secs, false);
  return true;
}

/* Reihen vom Tag-Dienst; onlyRandom: nur die Zufallsreihe neu (Würfel) */
function discoverLoad(seq, cat, secs, onlyRandom) {
  tagGetJson('/discover?kind=' + cat.kind).then(function(r){
    if (seq !== discoverSeq) return;
    if (!r || !r.ok) {
      if (r && r.building) {
        discoverClear(secs.random);
        secs.random.appendChild(browseNote(T('disc.building')));
        discoverTimer = setTimeout(function(){ if (seq === discoverSeq) discoverLoad(seq, cat, secs, false); }, 5000);
      }
      return;
    }
    r.shelves.forEach(function(sh){
      if (!secs[sh.id] || (onlyRandom && sh.id !== 'random')) return;
      discoverShelf(secs[sh.id], sh, cat, secs);
    });
  }).catch(function(){});
}

function discoverClear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

function discoverShelf(sec, sh, cat, secs) {
  discoverClear(sec);
  if (!sh.items.length && sh.id !== 'random') return;
  var head = browseHeading(T('disc.shelf.' + sh.id));
  if (sh.id === 'random') {
    head.classList.add('dHead');
    var dice = histEl('div', 'dDice');
    dice.title = T('disc.reroll');
    dice.innerHTML = DICE_SVG;
    dice.addEventListener('click', function(){
      dice.classList.remove('roll'); void dice.offsetWidth; dice.classList.add('roll');
      discoverLoad(discoverSeq, cat, secs, true);
    });
    head.appendChild(dice);
  }
  sec.appendChild(head);
  if (!sh.items.length) {
    sec.appendChild(browseNote(T('disc.none.' + cat.kind)));
    return;
  }
  var row = histEl('div', 'dRow');
  sh.items.forEach(function(it){ row.appendChild(discoverShelfTile(cat.kind, sh.id, it)); });
  sec.appendChild(row);
  discoverFit(row);
}

/* Kachel einer Reihe: Künstler öffnen, Album öffnen, Titel abspielen; darunter, wann bzw. wie oft gehört */
function discoverShelfTile(kind, shelf, it) {
  var tile = histEl('div', 'dTile' + (kind === 'artist' ? ' dArtist' : ''));
  var dir = kind === 'track' ? it.f.replace(/\/[^\/]*$/, '') : it.dir;
  var art = kind === 'artist' ? histArtistArt(it.ar) : histAlbumArt(it.ar, it.al, dir);
  var img = histImg(art, kind === 'artist');
  if (kind === 'artist') histArtistFallback(img, it.ar);
  tile.appendChild(img);
  tile.appendChild(histEl('div', 'dTi', kind === 'artist' ? it.ar : kind === 'track' ? it.ti : it.al));
  tile.appendChild(histEl('div', 'dAr', kind === 'artist' ? T('disc.albums', {n: it.n}) : histArtistName(it.ar)));
  var info = shelf === 'oldfav' ? T('disc.plays', {n: it.plays})
           : shelf === 'never' ? '' : it.last ? T('disc.last', {date: discoverDate(it.last)}) : T('disc.never');
  if (info) tile.appendChild(histEl('div', 'dSub', info));
  tile.addEventListener('click', function(){
    if (kind === 'artist') return openBrowse({kind: 'artist', artist: it.ar});
    if (kind === 'track') return histPlayUri('music-library/' + it.f, 'mpd', it);
    openBrowse({kind: 'album', artist: it.ar === 'Verschiedene' ? '' : it.ar, album: it.al, uri: 'music-library/' + it.dir, albumart: art});
  });
  return tile;
}

/* Kachel für "vor einem Jahr": Künstler öffnen, Album öffnen, Titel abspielen */
function discoverTile(kind, it) {
  var tile = histEl('div', 'dTile' + (kind === 'artist' ? ' dArtist' : ''));
  var art = kind === 'artist' ? histArtistArt(it.ar) : kind === 'album' ? histAlbumArt(it.ar, it.ti, it.u || '') : histTrackArt(it);
  var img = histImg(art, kind === 'artist');
  if (kind === 'artist') histArtistFallback(img, it.ar);
  tile.appendChild(img);
  tile.appendChild(histEl('div', 'dTi', kind === 'artist' ? it.ar : it.ti));
  if (kind !== 'artist') tile.appendChild(histEl('div', 'dAr', histArtistName(it.ar)));
  tile.addEventListener('click', function(){
    if (kind === 'artist') return openBrowse({kind: 'artist', artist: it.ar});
    if (kind === 'track') return histPlay({ti: it.ti, ar: it.ar, al: it.al, u: it.u ? 'music-library/' + it.u : ''});
    openBrowse({kind: 'album', artist: it.ar === 'Verschiedene' ? '' : it.ar, album: it.ti,
                uri: it.u ? 'music-library/' + it.u : undefined, albumart: art});
  });
  return tile;
}

/* Kacheln gleichmäßig über die Breite verteilen, wenn sie hineinpassen; sonst links beginnend zum Wischen */
function discoverFit(row) {
  if (!row || !row.parentNode) return;
  row.classList.remove('fit');
  if (row.scrollWidth <= row.clientWidth + 1) row.classList.add('fit');
}
window.addEventListener('resize', function(){ Array.prototype.forEach.call(document.querySelectorAll('.dRow'), discoverFit); });

/* beim Öffnen der Suche neu füllen, wenn nichts gesucht wurde */
if (window.MutationObserver) new MutationObserver(function(){
  if (overlaySearch.classList.contains('on') && !searchQuery && discoverReady && searchCat !== 'genres') discoverShow();   /* Genres: Kacheln bleiben */
  if (!overlaySearch.classList.contains('on')) clearTimeout(discoverTimer);
}).observe(overlaySearch, {attributes: true, attributeFilter: ['class']});

tagGetJson('/health').then(function(r){ if (r && r.ok) { discoverReady = true; if (!searchQuery) renderSearchResults(); } }).catch(function(){});

/* ---------- Zufallsmix: Würfel neben „Alle abspielen“ ---------- */
/* q: {artist} oder {dirs: [...]}; der Tag-Dienst zieht 25 Titel (nie derselbe Künstler direkt hintereinander),
   die ersetzen die Warteschlange */
function randomMixPlay(q) {
  tagPostJson('/randommix', q).then(function(r){
    var items = (r && r.items || []).map(function(t){
      return {uri: 'music-library/' + t.f, service: 'mpd', type: 'song', title: t.ti, artist: t.ar, album: t.al};
    });
    if (!items.length) return showToast(T(r && r.building ? 'disc.building' : 'mix.empty'));
    browseOrigin = null;
    fetch('/api/v1/replaceAndPlay', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({item: items[0]})
    }).then(function(){
      if (items.length > 1) setTimeout(function(){ socket.emit('addToQueue', items.slice(1)); }, 300);
    }).catch(function(){});
    showToast(T('disc.mixStarted', {n: items.length}));
    closeAllOverlays();
  }).catch(function(){ showToast(T('hist.offline')); });
}

/* Würfel-Knopf für die Zeile „Alle abspielen“ (Klick geht nicht an die Zeile weiter) */
function randomMixButton(q) {
  var b = histEl('div', 'mixDice');
  b.title = T('disc.mix');
  b.innerHTML = DICE_SVG;
  b.addEventListener('click', function(ev){
    ev.stopPropagation();
    b.classList.remove('roll'); void b.offsetWidth; b.classList.add('roll');
    randomMixPlay(typeof q === 'function' ? q() : q);
  });
  return b;
}
