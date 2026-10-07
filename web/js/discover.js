/* Suche ohne Eingabe: "Entdecken" mit Alben von vor einem Jahr und einem Zufallsalbum (Tag-Dienst GET /plays?view=ago, /random).
   Klassisches Skript, gemeinsamer globaler Gültigkeitsbereich; nach library.js und history.js geladen. */
var discoverReady = false;       /* Tag-Dienst erreichbar */
var discoverSeq   = 0;
var discoverTimer = null;
var discoverRandomBox = null;

function discoverDate(t) { var d = new Date(t * 1000); return d.getDate() + '.' + (d.getMonth() + 1) + '.' + d.getFullYear(); }

/* von renderSearchResults aufgerufen, solange nichts gesucht wurde; false: nicht verfügbar */
function discoverShow() {
  if (!discoverReady) return false;
  var seq = ++discoverSeq;
  clearTimeout(discoverTimer);
  while (searchResults.firstChild) searchResults.removeChild(searchResults.firstChild);
  var box = histEl('div', 'dBox');
  var agoBox = histEl('div', 'dSec'), randBox = histEl('div', 'dSec');
  box.appendChild(agoBox); box.appendChild(randBox);
  searchResults.appendChild(box);
  discoverRandomBox = randBox;

  tagGetJson('/plays?view=ago' + histTz()).then(function(r){
    var a = r && r.ago;
    if (seq !== discoverSeq || !a || !a.items.length) return;
    agoBox.appendChild(browseHeading(a.years === 1 ? 'VOR EINEM JAHR GEHÖRT' : 'VOR ' + a.years + ' JAHREN GEHÖRT'));
    var row = histEl('div', 'dRow');
    a.items.forEach(function(it){
      var art = histAlbumArt(it.ar, it.ti, it.u || '');
      var tile = histEl('div', 'dTile');
      tile.appendChild(histImg(art));
      tile.appendChild(histEl('div', 'dTi', it.ti));
      tile.appendChild(histEl('div', 'dAr', it.ar));
      tile.addEventListener('click', function(){
        openBrowse({kind: 'album', artist: it.ar === 'Verschiedene' ? '' : it.ar, album: it.ti,
                    uri: it.u ? 'music-library/' + it.u : undefined, albumart: art});
      });
      row.appendChild(tile);
    });
    agoBox.appendChild(row);
  }).catch(function(){});

  discoverRandom(seq);
  return true;
}

function discoverRandom(seq) {
  var box = discoverRandomBox;
  tagGetJson('/random').then(function(r){
    if (seq !== discoverSeq) return;
    while (box.firstChild) box.removeChild(box.firstChild);
    var head = browseHeading('ZUFALLSALBUM');
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
    if (!r || !r.ok) {
      box.appendChild(browseNote(r && r.building ? 'Die Albenliste wird gerade aus der Bibliothek gelesen…' : 'Keine Alben gefunden.'));
      if (r && r.building) discoverTimer = setTimeout(function(){ if (seq === discoverSeq) discoverRandom(seq); }, 5000);
      return;
    }
    var al = r.album, art = histAlbumArt(al.ar, al.al, al.dir);
    var card = histEl('div', 'dRand');
    var img = histImg(art);
    img.className = 'dBig';
    img.title = 'Abspielen';
    img.addEventListener('click', function(){
      browsePlay({uri: 'music-library/' + al.dir, service: 'mpd', type: 'folder', title: al.al, artist: al.ar});
    });
    card.appendChild(img);
    var meta = histEl('div', 'dMeta');
    meta.appendChild(histEl('div', 'dTi', al.al));
    meta.appendChild(histEl('div', 'dAr', al.ar));
    meta.appendChild(histEl('div', 'dLast', 'Zuletzt gehört: ' + (al.last ? discoverDate(al.last) : 'nie')));
    meta.addEventListener('click', function(){
      openBrowse({kind: 'album', artist: al.ar === 'Verschiedene' ? '' : al.ar, album: al.al, uri: 'music-library/' + al.dir, albumart: art});
    });
    card.appendChild(meta);
    box.appendChild(card);
  }).catch(function(){});
}

/* beim Öffnen der Suche neu füllen, wenn nichts gesucht wurde */
if (window.MutationObserver) new MutationObserver(function(){
  if (overlaySearch.classList.contains('on') && !searchQuery && discoverReady) discoverShow();
  if (!overlaySearch.classList.contains('on')) clearTimeout(discoverTimer);
}).observe(overlaySearch, {attributes: true, attributeFilter: ['class']});

tagGetJson('/health').then(function(r){ if (r && r.ok) { discoverReady = true; if (!searchQuery) renderSearchResults(); } }).catch(function(){});
