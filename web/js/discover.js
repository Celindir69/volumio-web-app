/* Suche ohne Eingabe: "Entdecken" passend zum Reiter (Künstler, Alben, Titel): was vor einem Jahr lief und ein Zufallsfund
   (Tag-Dienst GET /plays?view=ago&kind=…, /random?kind=…).
   Klassisches Skript, gemeinsamer globaler Gültigkeitsbereich; nach library.js und history.js geladen. */
var discoverReady = false;       /* Tag-Dienst erreichbar */
var discoverSeq   = 0;
var discoverTimer = null;
var discoverRandomBox = null;
/* Suchreiter -> Art beim Tag-Dienst und Überschriften */
var DISCOVER_KIND = {
  artists: {kind: 'artist', ago: 'KÜNSTLER', rand: 'ZUFALLSKÜNSTLER'},
  albums:  {kind: 'album',  ago: 'ALBEN',    rand: 'ZUFALLSALBUM'},
  songs:   {kind: 'track',  ago: 'TITEL',    rand: 'ZUFALLSTITEL'}
};

function discoverDate(t) { var d = new Date(t * 1000); return d.getDate() + '.' + (d.getMonth() + 1) + '.' + d.getFullYear(); }
function discoverCat() { return DISCOVER_KIND[searchCat] || DISCOVER_KIND.albums; }

/* von renderSearchResults aufgerufen, solange nichts gesucht wurde; false: nicht verfügbar */
function discoverShow() {
  if (!discoverReady) return false;
  var seq = ++discoverSeq, cat = discoverCat();
  clearTimeout(discoverTimer);
  while (searchResults.firstChild) searchResults.removeChild(searchResults.firstChild);
  var box = histEl('div', 'dBox');
  var agoBox = histEl('div', 'dSec'), randBox = histEl('div', 'dSec');
  box.appendChild(agoBox); box.appendChild(randBox);
  searchResults.appendChild(box);
  discoverRandomBox = randBox;

  tagGetJson('/plays?view=ago&kind=' + cat.kind + histTz()).then(function(r){
    var a = r && r.ago;
    if (seq !== discoverSeq || !a || !a.items.length) return;
    agoBox.appendChild(browseHeading((a.years === 1 ? 'VOR EINEM JAHR' : 'VOR ' + a.years + ' JAHREN') + ' GEHÖRT: ' + cat.ago));
    var row = histEl('div', 'dRow');
    a.items.forEach(function(it){ row.appendChild(discoverTile(cat.kind, it)); });
    agoBox.appendChild(row);
    discoverFit(row);
  }).catch(function(){});

  discoverRandom(seq);
  return true;
}

/* Kachel für "vor einem Jahr": Künstler öffnen, Album öffnen, Titel abspielen */
function discoverTile(kind, it) {
  var tile = histEl('div', 'dTile' + (kind === 'artist' ? ' dArtist' : ''));
  var art = kind === 'artist' ? histArtistArt(it.ar) : kind === 'album' ? histAlbumArt(it.ar, it.ti, it.u || '') : histTrackArt(it);
  var img = histImg(art, kind === 'artist');
  if (kind === 'artist') histArtistFallback(img, it.ar);
  tile.appendChild(img);
  tile.appendChild(histEl('div', 'dTi', kind === 'artist' ? it.ar : it.ti));
  if (kind !== 'artist') tile.appendChild(histEl('div', 'dAr', it.ar));
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
window.addEventListener('resize', function(){ discoverFit(document.querySelector('.dRow')); });

function discoverRandom(seq) {
  var box = discoverRandomBox, cat = discoverCat();
  tagGetJson('/random?kind=' + cat.kind).then(function(r){
    if (seq !== discoverSeq) return;
    while (box.firstChild) box.removeChild(box.firstChild);
    var head = browseHeading(cat.rand);
    head.classList.add('dHead');
    var dice = histEl('div', 'dDice');
    dice.title = 'Neu würfeln';
    dice.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm2.5 3a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm9 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM12 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM7.5 15a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm9 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z"/></svg>';
    dice.addEventListener('click', function(){
      dice.classList.remove('roll'); void dice.offsetWidth; dice.classList.add('roll');
      discoverRandom(++discoverSeq);
    });
    head.appendChild(dice);
    box.appendChild(head);
    var hit = r && (r.album || r.artist || r.track);
    if (!r || !r.ok || !hit) {
      box.appendChild(browseNote(r && r.building ? 'Die Bibliothek wird gerade gelesen…' :
        cat.kind === 'artist' ? 'Keine Künstler gefunden.' : cat.kind === 'track' ? 'Keine Titel gefunden.' : 'Keine Alben gefunden.'));
      if (r && r.building) discoverTimer = setTimeout(function(){ if (seq === discoverSeq) discoverRandom(seq); }, 5000);
      return;
    }
    var art, title, sub, open;
    if (cat.kind === 'artist') {
      art = histArtistArt(hit.ar); title = hit.ar; sub = hit.n === 1 ? '1 Album' : hit.n + ' Alben';
      open = function(){ openBrowse({kind: 'artist', artist: hit.ar}); };
    } else if (cat.kind === 'track') {
      var dir = hit.f.replace(/\/[^\/]*$/, '');
      art = histAlbumArt(hit.ar, hit.al, dir); title = hit.ti; sub = hit.ar + (hit.al ? ' · ' + hit.al : '');
      open = function(){ histPlayUri('music-library/' + hit.f, 'mpd', hit); };
    } else {
      art = histAlbumArt(hit.ar, hit.al, hit.dir); title = hit.al; sub = hit.ar;
      open = function(){                                 /* wie die Kacheln: erst die Albumansicht */
        openBrowse({kind: 'album', artist: hit.ar === 'Verschiedene' ? '' : hit.ar, album: hit.al, uri: 'music-library/' + hit.dir, albumart: art});
      };
    }
    var card = histEl('div', 'dRand');
    var img = histImg(art, cat.kind === 'artist');
    if (cat.kind === 'artist') histArtistFallback(img, hit.ar);
    img.className = 'dBig' + (cat.kind === 'artist' ? ' hRound' : '');
    card.appendChild(img);
    var meta = histEl('div', 'dMeta');
    meta.appendChild(histEl('div', 'dTi', title));
    meta.appendChild(histEl('div', 'dAr', sub));
    meta.appendChild(histEl('div', 'dLast', 'Zuletzt gehört: ' + (hit.last ? discoverDate(hit.last) : 'nie')));
    if (cat.kind === 'track') meta.appendChild(histEl('div', 'dLast', 'Tippen zum Abspielen'));
    card.appendChild(meta);
    card.addEventListener('click', open);
    box.appendChild(card);
  }).catch(function(){});
}

/* beim Öffnen der Suche neu füllen, wenn nichts gesucht wurde */
if (window.MutationObserver) new MutationObserver(function(){
  if (overlaySearch.classList.contains('on') && !searchQuery && discoverReady) discoverShow();
  if (!overlaySearch.classList.contains('on')) clearTimeout(discoverTimer);
}).observe(overlaySearch, {attributes: true, attributeFilter: ['class']});

tagGetJson('/health').then(function(r){ if (r && r.ok) { discoverReady = true; if (!searchQuery) renderSearchResults(); } }).catch(function(){});
