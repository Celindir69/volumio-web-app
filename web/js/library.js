/* Playlisten, Web-Radio und Suche
   Klassisches Skript, gemeinsamer globaler Gültigkeitsbereich; Reihenfolge siehe app.html. */
/* ---------- Playlisten / Radio ---------- */
function renderPlList(items, container, clickFn) {
  while (container.firstChild) container.removeChild(container.firstChild);
  if (!items.length) {
    var empty = document.createElement('div');
    empty.className = 'plHint'; empty.textContent = 'Keine Einträge gefunden';
    container.appendChild(empty);
    return;
  }
  items.forEach(function(it){
    var row = document.createElement('div');
    row.className = 'plRow';
    var icon = document.createElement('div');
    icon.className = 'plIcon';
    if (it.albumart) {
      var img = document.createElement('img');
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:calc(1.5 * var(--vw));';
      img.src = artUrl(it.albumart);
      icon.appendChild(img);
    } else {
      icon.innerHTML = '<svg viewBox="0 0 24 24"><path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/></svg>';
    }
    var nm = document.createElement('div');
    nm.className = 'plName'; nm.textContent = it.title || it.name || '';
    row.appendChild(icon); row.appendChild(nm);
    row.addEventListener('click', function(){ clickFn(it); });
    container.appendChild(row);
  });
}

function loadPlaylists() {
  while (playlistResults.firstChild) playlistResults.removeChild(playlistResults.firstChild);
  var hint = document.createElement('div');
  hint.className = 'plHint'; hint.textContent = 'Laden…';
  playlistResults.appendChild(hint);

  fetch('/api/v1/browse?uri=playlists')
    .then(function(r){ return r.json(); })
    .then(function(j){
      var items = (j && j.navigation && j.navigation.lists && j.navigation.lists[0])
                  ? j.navigation.lists[0].items : [];
      renderPlList(items, playlistResults, function(pl){
        openBrowse({kind:'playlist', name:pl.title || pl.name || '', uri:pl.uri, service:pl.service || 'mpd'});   /* Titel der Playlist; zurück-Pfeil führt hierher */
      });
    }).catch(function(){
      while (playlistResults.firstChild) playlistResults.removeChild(playlistResults.firstChild);
      var err = document.createElement('div');
      err.className = 'plHint'; err.textContent = 'Fehler beim Laden';
      playlistResults.appendChild(err);
    });
}

function loadMyRadio() {
  while (radioPanel.firstChild) radioPanel.removeChild(radioPanel.firstChild);
  var hint = document.createElement('div');
  hint.className = 'plHint'; hint.textContent = 'Laden…';
  radioPanel.appendChild(hint);

  fetch('/api/v1/browse?uri=' + encodeURIComponent('radio/favourites'))
    .then(function(r){ return r.json(); })
    .then(function(j){
      var lists = (j && j.navigation && j.navigation.lists) || [];
      var items = [];
      lists.forEach(function(l){ items = items.concat(l.items || []); });
      renderPlList(items, radioPanel, function(it){
        socket.emit('replaceAndPlay', {
          uri:      it.uri,
          title:    it.title || it.name || '',
          albumart: it.albumart || null,
          service:  it.service || 'webradio'
        });
        closeAllOverlays();
      });
    }).catch(function(){
      while (radioPanel.firstChild) radioPanel.removeChild(radioPanel.firstChild);
      var err = document.createElement('div');
      err.className = 'plHint'; err.textContent = 'Fehler beim Laden';
      radioPanel.appendChild(err);
    });
}

document.getElementById('plTab1').addEventListener('click', function(){
  plTabActive = 1;
  document.getElementById('plTab1').className = 'qTab on';
  document.getElementById('plTab2').className = 'qTab';
  document.getElementById('plOverlayTitle').textContent = 'Playlisten';
  playlistResults.style.display = 'block';
  radioPanel.style.display = 'none';
});

document.getElementById('plTab2').addEventListener('click', function(){
  plTabActive = 2;
  document.getElementById('plTab1').className = 'qTab';
  document.getElementById('plTab2').className = 'qTab on';
  document.getElementById('plOverlayTitle').textContent = 'Radio';
  playlistResults.style.display = 'none';
  radioPanel.style.display = 'block';
  loadMyRadio();
});

/* ---------- Suche ---------- */
document.getElementById('searchTabBar').querySelectorAll('.qTab').forEach(function(t){
  t.addEventListener('click', function(){
    document.getElementById('searchTabBar').querySelectorAll('.qTab').forEach(function(x){
      x.className = 'qTab';
    });
    t.className = 'qTab on';
    searchCat = t.dataset.cat;
    renderSearchResults();
  });
});

function triggerSearch() {
  var q = searchInput.value.trim();
  if (q.length < 2) {
    searchData = {artists:[], albums:[], songs:[], tidal:{artists:[], albums:[], songs:[]}};
    searchSeq++;
    renderSearchResults();
    return;
  }
  doSearch(q);
}

var searchShowLocal = true, searchShowTidal = true;     /* Kontrollkästchen "Lokal" und "TIDAL" neben der Überschrift */
var searchSeq = 0;          /* verwirft Antworten veralteter Suchen */
var SEARCH_SLOW_MS = 5000;  /* danach Hinweis "Warte auf TIDAL" */
var SEARCH_TIMEOUT_MS = 20000;

function searchMessage(text) {
  while (searchResults.firstChild) searchResults.removeChild(searchResults.firstChild);
  var hint = document.createElement('div');
  hint.className = 'sHint'; hint.textContent = text;
  searchResults.appendChild(hint);
}

function doSearch(q) {
  searchQuery = q;
  var seq = ++searchSeq;
  searchMessage('Suche…');
  var slow = setTimeout(function(){ if (seq === searchSeq) searchMessage(tidalOn ? 'Suche läuft… (Warte auf TIDAL)' : 'Suche läuft…'); }, SEARCH_SLOW_MS);
  withTimeout(fetch('/api/v1/search?query=' + encodeURIComponent(q)).then(function(r){ return r.json(); }), SEARCH_TIMEOUT_MS)
    .then(function(j){
      clearTimeout(slow);
      if (seq !== searchSeq) return;
      searchData = {artists:[], albums:[], songs:[], tidal:{artists:[], albums:[], songs:[]}};
      var lists = (j && j.navigation && j.navigation.lists) || [];
      var q_lower = q.toLowerCase();
      lists.forEach(function(l){
        var t = (l.title || '').toLowerCase().split("'")[0];      /* nur der Teil vor dem Suchbegriff: "gefunden 1 Album 'Begriff'" */
        var items = l.items || [];
        if (t.indexOf('internetradio') > -1) return;
        if (t.indexOf('tidal') > -1) {                            /* "TIDAL Interpreten" / "TIDAL Alben" / "TIDAL Titel"; Playlisten bleiben draußen */
          if (t.indexOf('interpret') > -1) searchData.tidal.artists = items;
          else if (t.indexOf('album') > -1 || t.indexOf('alben') > -1) searchData.tidal.albums = items;
          else if (t.indexOf('titel') > -1) searchData.tidal.songs = items;
          return;
        }
        if (t.indexOf('interpret') > -1)  searchData.artists = items;
        else if (t.indexOf('album') > -1 || t.indexOf('alben') > -1) searchData.albums = items;     /* Volumio schreibt "1 Album" und "2 Alben" */
        else if (t.indexOf('titel') > -1) {
          searchData.songs = items.filter(function(it){
            return (it.title || it.name || '').toLowerCase().indexOf(q_lower) > -1 ||
                   (it.artist || '').toLowerCase().indexOf(q_lower) > -1;
          });
        }
      });

      renderSearchResults();
    }).catch(function(){
      clearTimeout(slow);
      if (seq !== searchSeq) return;
      searchMessage('Keine Antwort von Volumio' + (tidalOn ? ' (TIDAL?)' : '') + '. Bitte erneut versuchen.');
    });
}

function searchRow(it, tidal) {
  var row = document.createElement('div');
  row.className = 'sRow';
  var img = document.createElement('img');
  img.className = 'sCover';
  if (it.albumart) img.src = artUrl(it.albumart);
  var meta = document.createElement('div');
  meta.className = 'sMeta';
  var ti = document.createElement('div');
  ti.className = 'sTitle'; ti.textContent = it.title || it.name || '';
  var sub = document.createElement('div');
  sub.className = 'sSub';
  sub.textContent = searchCat === 'artists' ? '' : (it.artist || it.album || '');
  meta.appendChild(ti);
  if (sub.textContent) meta.appendChild(sub);
  row.appendChild(img); row.appendChild(meta);
  if (searchCat === 'songs' && !tidal) {                   /* lokaler Titel: Tags bearbeiten */
    var pen = tagTrackButton(it);
    if (pen) row.appendChild(pen);
  }
  row.addEventListener('click', function(){
    if (searchCat === 'songs') { playSearchItem(it); closeAllOverlays(); return; }
    if (searchCat === 'artists') {
      openBrowse({kind:'artist', artist:it.title || it.name || '', uri:tidal ? it.uri : undefined});
      return;
    }
    openBrowse({kind:'album', artist:it.artist || '', album:it.title || it.name || '', uri:it.uri,
                albumart:it.albumart, service:it.service});          /* zurück-Pfeil führt in die Suche */
  });
  return row;
}

function renderSearchResults() {
  while (searchResults.firstChild) searchResults.removeChild(searchResults.firstChild);
  var list = searchShowLocal ? (searchData[searchCat] || []) : [];
  var tlist = searchShowTidal ? ((searchData.tidal && searchData.tidal[searchCat]) || []) : [];

  if (!list.length && !tlist.length) {
    var hint = document.createElement('div');
    hint.className = 'sHint';
    hint.textContent = (!searchShowLocal && !searchShowTidal) ? 'Lokal oder TIDAL ankreuzen'
                     : (searchQuery ? 'Keine Ergebnisse' : 'Mind. 2 Zeichen eingeben und Los tippen');
    searchResults.appendChild(hint);
    return;
  }

  if (list.length) {
    var lh = document.createElement('div');
    lh.className = 'infoSection'; lh.textContent = 'Lokal';
    searchResults.appendChild(lh);
  }
  list.forEach(function(it){ searchResults.appendChild(searchRow(it, false)); });
  if (tlist.length) {
    var hd = document.createElement('div');
    hd.className = 'infoSection'; hd.textContent = 'TIDAL';
    searchResults.appendChild(hd);
    tlist.forEach(function(it){ searchResults.appendChild(searchRow(it, true)); });
  }

  var hint = document.createElement('div');
  hint.className = 'sHint'; hint.textContent = searchCat === 'songs' ? 'Tippen zum Abspielen' : 'Tippen zum Öffnen';
  searchResults.appendChild(hint);
}

function playSearchItem(it) {
  var type = searchCat === 'songs' ? 'song' : 'folder';
  fetch('/api/v1/replaceAndPlay', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({item:{
      uri:    it.uri,
      service:it.service || 'mpd',
      type:   type,
      title:  it.title || it.name || '',
      artist: it.artist || '',
      album:  it.album  || ''
    }})
  }).catch(function(){});
}

searchInput.addEventListener('keydown', function(e){
  if (e.key === 'Enter') { e.preventDefault(); searchInput.blur(); triggerSearch(); }
});
document.getElementById('searchGoBtn').addEventListener('click', triggerSearch);


tidalApply();
document.getElementById('srcLocal').addEventListener('change', function(){ searchShowLocal = this.checked; renderSearchResults(); });
document.getElementById('srcTidal').addEventListener('change', function(){ searchShowTidal = this.checked; renderSearchResults(); });

/* x im Suchfeld: Eingabe löschen */
var searchClear = document.getElementById('searchClear');
function paintSearchClear() { searchClear.style.display = searchInput.value ? 'block' : 'none'; }
searchInput.addEventListener('input', paintSearchClear);
searchClear.addEventListener('click', function(){
  searchInput.value = '';
  paintSearchClear();
  searchSeq++;                                  /* laufende Suche verwerfen */
  searchQuery = '';
  searchData = {artists:[], albums:[], songs:[], tidal:{artists:[], albums:[], songs:[]}};
  renderSearchResults();
  searchInput.focus();
});
