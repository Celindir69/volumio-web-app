/* Genres: vierter Suchreiter (Kacheln aller Genres bzw. passende Genres zum Suchbegriff), Genre-Seite (alle Alben eines
   Genres) und das Genre klein an Alben (Albumseite, Albumlisten). Quelle: Tag-Dienst (je Album das häufigste Genre-Tag,
   GET /genrelist, /genrealbums, /albumgenre). Klassisches Skript, gemeinsamer globaler Gültigkeitsbereich;
   nach library.js, browse.js, history.js und discover.js geladen. */
var genreReady = false;          /* Tag-Dienst erreichbar: Reiter zeigen, Genres an Alben nachtragen */
var genreSeq = 0;
var genreTab = document.getElementById('searchTabGenres');

/* Suchreiter "Genres": ohne Suchbegriff Kacheln aller Genres, sonst Zeilen der passenden */
function genreSearch() {
  var seq = ++genreSeq, q = searchQuery || '';
  while (searchResults.firstChild) searchResults.removeChild(searchResults.firstChild);
  searchResults.appendChild(browseNote(T('browse.loading')));
  tagGetJson('/genrelist' + (q ? '?q=' + encodeURIComponent(q) : '')).then(function(r){
    if (seq !== genreSeq || searchCat !== 'genres') return;
    while (searchResults.firstChild) searchResults.removeChild(searchResults.firstChild);
    var list = (r && r.genres) || [];
    if (!r || !r.ok) { searchResults.appendChild(browseNote(r && r.building ? T('disc.building') : T('genre.none'))); return; }
    if (!list.length && !(r.subs || []).length) { searchResults.appendChild(browseNote(q ? T('search.noResults') : T('genre.none'))); return; }
    if (!q) {
      if (list.length > GENRE_RANDOM) searchResults.appendChild(genreRandomShelf(list));
      if (list.length > GENRE_RANDOM) searchResults.appendChild(browseHeading(T('genre.allHead')));
      var grid = histEl('div', 'gGrid');
      list.forEach(function(g){ grid.appendChild(genreTile(g)); });
      searchResults.appendChild(grid);
      return;
    }
    list.forEach(function(g){
      var row = histEl('div', 'sRow');
      row.appendChild(histImg(histAlbumArt(g.ar, g.al, g.dir)));
      var meta = histEl('div', 'sMeta');
      meta.appendChild(histEl('div', 'sTitle', g.g));
      meta.appendChild(histEl('div', 'sSub', T('disc.albums', {n: g.n})));
      row.appendChild(meta);
      row.addEventListener('click', function(){ openBrowse({kind: 'genre', genre: g.g}); });
      searchResults.appendChild(row);
    });
    (r.subs || []).forEach(function(x){                  /* Unterstile (Audio-Analyse) mit ihrem Genre */
      var row = histEl('div', 'sRow');
      row.appendChild(histImg(histAlbumArt(x.ar, x.al, x.dir)));
      var meta = histEl('div', 'sMeta');
      meta.appendChild(histEl('div', 'sTitle', x.s));
      meta.appendChild(histEl('div', 'sSub', x.g + ' · ' + T('disc.albums', {n: x.n})));
      row.appendChild(meta);
      row.addEventListener('click', function(){ openBrowse({kind: 'genre', genre: x.g, sub: x.s}); });
      searchResults.appendChild(row);
    });
    searchResults.appendChild(browseNote(T('search.tapOpen')));
  }).catch(function(){
    if (seq !== genreSeq) return;
    while (searchResults.firstChild) searchResults.removeChild(searchResults.firstChild);
    searchResults.appendChild(browseNote(T('genre.offline')));
  });
}

/* Reihe „Zufällige Genres“ über der Übersicht, der Würfel zieht neu (nur bei mehr Genres, als in die Reihe passen) */
var GENRE_RANDOM = 12;
function genreRandomShelf(list) {
  var sec = histEl('div', 'dSec'), head = browseHeading(T('disc.shelf.randomGenres')), row = histEl('div', 'dRow');
  head.classList.add('dHead');
  var dice = histEl('div', 'dDice');
  dice.title = T('disc.reroll');
  dice.innerHTML = DICE_SVG;
  function fill() {
    while (row.firstChild) row.removeChild(row.firstChild);
    var a = list.slice();
    for (var i = 0; i < GENRE_RANDOM; i++) {
      var j = i + Math.floor(Math.random() * (a.length - i)), x = a[i];
      a[i] = a[j]; a[j] = x;
      row.appendChild(genreTile(a[i]));
    }
    discoverFit(row);
  }
  dice.addEventListener('click', function(){
    dice.classList.remove('roll'); void dice.offsetWidth; dice.classList.add('roll');
    fill();
  });
  head.appendChild(dice);
  sec.appendChild(head);
  sec.appendChild(row);
  fill();
  setTimeout(function(){ discoverFit(row); }, 0);   /* erst im Dokument messbar */
  return sec;
}

function genreTile(g) {
  var tile = histEl('div', 'dTile');
  tile.appendChild(histImg(histAlbumArt(g.ar, g.al, g.dir)));
  tile.appendChild(histEl('div', 'dTi', g.g));
  tile.appendChild(histEl('div', 'dAr', T('disc.albums', {n: g.n})));
  tile.addEventListener('click', function(){ openBrowse({kind: 'genre', genre: g.g}); });
  return tile;
}

/* Genre-Seite (browseStack-Eintrag {kind:'genre', genre, sub, all}): gibt es Unterstile, zuerst deren Kacheln mit „Alle“
   davor, sonst (und nach der Wahl) die Alben, nach Künstler sortiert; sub: nur Alben mit diesem Unterstil */
function browseGenre(e, seq) {
  tagGetJson('/genrealbums?g=' + encodeURIComponent(e.genre)).then(function(r){
    if (seq !== browseSeq) return;
    while (browseBody.firstChild) browseBody.removeChild(browseBody.firstChild);
    var list = (r && r.albums) || [], subs = (r && r.subs) || [];
    if (list.length && subs.length && !e.sub && !e.all) return genreSubTiles(e, list, subs);
    if (e.sub) list = list.filter(function(a){ return (a.st || []).indexOf(e.sub) >= 0; });
    if (!list.length) { browseBody.appendChild(browseNote(r && r.building ? T('disc.building') : T('genre.noAlbums'))); return; }
    genreAlbumPage(list);
  }).catch(function(){
    if (seq !== browseSeq) return;
    while (browseBody.firstChild) browseBody.removeChild(browseBody.firstChild);
    browseBody.appendChild(browseNote(T('genre.offline')));
  });
}

/* Alben aus der Albenliste des Tag-Dienstes ({dir, al, ar, y}) mit „Alle abspielen“ und Würfel darüber;
   mit Jahr (Jahrzehnt-Seite) steht es klein hinter dem Künstler */
function genreAlbumPage(list) {
  browseBody.appendChild(genrePlayAllHead(list));
  browseBody.appendChild(browseHeading(T('disc.albums', {n: list.length})));
  list.forEach(function(a){
    var uri = 'music-library/' + a.dir, art = histAlbumArt(a.ar, a.al, a.dir);
    var row = histEl('div', 'sRow' + (a.al === curAlbum ? ' cur' : ''));
    row.appendChild(histImg(art));
    var meta = histEl('div', 'sMeta');
    meta.appendChild(histEl('div', 'sTitle', a.al));
    meta.appendChild(histEl('div', 'sSub', histArtistName(a.ar) + (a.y ? '  ·  ' + a.y : '')));
    row.appendChild(meta);
    var pen = tagAlbumButton({uri: uri, title: a.al, service: 'mpd'});
    if (pen) row.appendChild(pen);
    row.addEventListener('click', function(){
      browseStack.push({kind: 'album', artist: a.ar === 'Verschiedene' ? '' : a.ar, album: a.al, uri: uri, albumart: art});
      browseRender();
    });
    browseBody.appendChild(row);
  });
}

/* Jahrzehnt-Seite (browseStack-Eintrag {kind:'decade', decade: 1990}): Alben nach Jahr (Date-Tag) */
function browseDecade(e, seq) {
  tagGetJson('/decadealbums?d=' + e.decade).then(function(r){
    if (seq !== browseSeq) return;
    while (browseBody.firstChild) browseBody.removeChild(browseBody.firstChild);
    var list = (r && r.albums) || [];
    if (!list.length) { browseBody.appendChild(browseNote(r && r.building ? T('disc.building') : T('genre.noAlbums'))); return; }
    genreAlbumPage(list);
  }).catch(function(){
    if (seq !== browseSeq) return;
    while (browseBody.firstChild) browseBody.removeChild(browseBody.firstChild);
    browseBody.appendChild(browseNote(T('genre.offline')));
  });
}

/* Alben nach Stimmung, Energie oder Stil (browseStack-Eintrag {kind:'moodset', title, q}): q geht an GET /moodalbums */
function browseMoodSet(e, seq) {
  tagGetJson('/moodalbums?' + e.q).then(function(r){
    if (seq !== browseSeq) return;
    while (browseBody.firstChild) browseBody.removeChild(browseBody.firstChild);
    var list = (r && r.albums) || [];
    if (!list.length) { browseBody.appendChild(browseNote(r && r.building ? T('disc.building') : T('disc.moodNone'))); return; }
    genreAlbumPage(list);
  }).catch(function(){
    if (seq !== browseSeq) return;
    while (browseBody.firstChild) browseBody.removeChild(browseBody.firstChild);
    browseBody.appendChild(browseNote(T('genre.offline')));
  });
}

/* „Alle abspielen“ wie auf der Künstlerseite: Warteschlange durch alle Alben der Liste ersetzen (Reihenfolge wie angezeigt) */
function genrePlayAllHead(list) {
  var head = document.createElement('div');
  head.id = 'browseArtistHead';
  head.innerHTML = '<div id="browsePlayAll"><svg viewBox="0 0 24 24"><path d="M7 5v14l12-7z"/></svg></div>';
  var lbl = histEl('div', 'sMeta');
  lbl.appendChild(histEl('div', 'sTitle bAlbum', T('browse.playAll')));
  head.appendChild(lbl);
  head.appendChild(randomMixButton({dirs: list.map(function(a){ return a.dir; })}));   /* 25 zufällige Titel daraus (discover.js) */
  head.addEventListener('click', function(){
    var items = list.map(function(a){ return {uri: 'music-library/' + a.dir, service: 'mpd', type: 'folder', title: a.al, artist: a.ar}; });
    browseOrigin = null;
    fetch('/api/v1/replaceAndPlay', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({item: items[0]})
    }).then(function(){
      if (items.length > 1) setTimeout(function(){ socket.emit('addToQueue', items.slice(1)); }, 300);
    }).catch(function(){});
    closeAllOverlays();
  });
  return head;
}

function genreSubTiles(e, list, subs) {
  var grid = histEl('div', 'gGrid');
  function tile(title, n, art, next) {
    var t = histEl('div', 'dTile');
    t.appendChild(histImg(art));
    t.appendChild(histEl('div', 'dTi', title));
    t.appendChild(histEl('div', 'dAr', T('disc.albums', {n: n})));
    t.addEventListener('click', function(){ browseStack.push(next); browseRender(); });
    grid.appendChild(t);
  }
  tile(T('genre.all'), list.length, histAlbumArt(list[0].ar, list[0].al, list[0].dir), {kind: 'genre', genre: e.genre, all: true});
  subs.forEach(function(x){ tile(x.s, x.n, histAlbumArt(x.ar, x.al, x.dir), {kind: 'genre', genre: e.genre, sub: x.s}); });
  browseBody.appendChild(grid);
  browseBody.appendChild(browseNote(T('genre.subsHint')));
}

function genreOpen(g) {
  browseStack.push({kind: 'genre', genre: g});
  browseRender();
}

/* Genres zu Alben nachschlagen: items [{uri, album, artist}] -> Promise [Genre oder ''] (lokal; sonst leer) */
function genreLookup(items) {
  if (!genreReady || !items.length) return Promise.resolve(items.map(function(){ return ''; }));
  var q = items.map(function(it){ return [it.uri || '', it.album || '', it.artist || '']; });
  return tagGetJson('/albumgenre?q=' + encodeURIComponent(JSON.stringify(q))).then(function(r){
    return (r && r.genres) || [];
  }).catch(function(){ return []; });
}

/* Genre klein rechts in Albumzeilen (vor dem Stift); ein Tipp öffnet die Genre-Seite. rows: [{row, uri, album, artist}] */
function genreDecorate(rows, seq) {
  rows = rows.filter(function(x){ return x.uri && !streamOf(x.uri); });
  for (var i = 0; i < rows.length; i += 200) (function(part){
    genreLookup(part).then(function(gs){
      if (seq !== undefined && seq !== browseSeq) return;
      part.forEach(function(x, k){
        var g = gs[k];
        if (!g || !x.row.parentNode) return;
        var el = histEl('div', 'bGenre', g);
        el.addEventListener('click', function(ev){ ev.stopPropagation(); genreFromAnywhere(g); });
        x.row.insertBefore(el, x.row.querySelector('.tagEditMini'));
      });
    });
  })(rows.slice(i, i + 200));
}

/* Genre-Seite aus der Suche oder aus dem Browser heraus öffnen */
function genreFromAnywhere(g) {
  if (overlayBrowse.classList.contains('on')) genreOpen(g);
  else openBrowse({kind: 'genre', genre: g});
}

tagGetJson('/health').then(function(r){
  if (!r || !r.ok) return;
  genreReady = true;
  if (genreTab) genreTab.style.display = '';
}).catch(function(){});
