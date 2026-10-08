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
    if (!list.length) { searchResults.appendChild(browseNote(q ? T('search.noResults') : T('genre.none'))); return; }
    if (!q) {
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
    searchResults.appendChild(browseNote(T('search.tapOpen')));
  }).catch(function(){
    if (seq !== genreSeq) return;
    while (searchResults.firstChild) searchResults.removeChild(searchResults.firstChild);
    searchResults.appendChild(browseNote(T('genre.offline')));
  });
}

function genreTile(g) {
  var tile = histEl('div', 'dTile');
  tile.appendChild(histImg(histAlbumArt(g.ar, g.al, g.dir)));
  tile.appendChild(histEl('div', 'dTi', g.g));
  tile.appendChild(histEl('div', 'dAr', T('disc.albums', {n: g.n})));
  tile.addEventListener('click', function(){ openBrowse({kind: 'genre', genre: g.g}); });
  return tile;
}

/* Genre-Seite: alle Alben des Genres, nach Künstler sortiert (browseStack-Eintrag {kind:'genre', genre}) */
function browseGenre(e, seq) {
  tagGetJson('/genrealbums?g=' + encodeURIComponent(e.genre)).then(function(r){
    if (seq !== browseSeq) return;
    while (browseBody.firstChild) browseBody.removeChild(browseBody.firstChild);
    var list = (r && r.albums) || [];
    if (!list.length) { browseBody.appendChild(browseNote(r && r.building ? T('disc.building') : T('genre.noAlbums'))); return; }
    browseBody.appendChild(browseHeading(T('disc.albums', {n: list.length})));
    list.forEach(function(a){
      var uri = 'music-library/' + a.dir, art = histAlbumArt(a.ar, a.al, a.dir);
      var row = histEl('div', 'sRow' + (a.al === curAlbum ? ' cur' : ''));
      row.appendChild(histImg(art));
      var meta = histEl('div', 'sMeta');
      meta.appendChild(histEl('div', 'sTitle', a.al));
      meta.appendChild(histEl('div', 'sSub', histArtistName(a.ar)));
      row.appendChild(meta);
      var pen = tagAlbumButton({uri: uri, title: a.al, service: 'mpd'});
      if (pen) row.appendChild(pen);
      row.addEventListener('click', function(){
        browseStack.push({kind: 'album', artist: a.ar === 'Verschiedene' ? '' : a.ar, album: a.al, uri: uri, albumart: art});
        browseRender();
      });
      browseBody.appendChild(row);
    });
  }).catch(function(){
    if (seq !== browseSeq) return;
    while (browseBody.firstChild) browseBody.removeChild(browseBody.firstChild);
    browseBody.appendChild(browseNote(T('genre.offline')));
  });
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
