/* Lyrics-Overlay und Info-Overlay mit Reitern und Wischgesten
   Klassisches Skript, gemeinsamer globaler Gültigkeitsbereich; Reihenfolge siehe app.html. */
/* ---------- Lyrics ---------- */
function showLyrics(data) {
  lyricLines = [];
paintTime();
  lyricsText.className = '';
  lyricsText.style.paddingBottom = '';
  area.scrollTop = 0;
  while (lyricsText.firstChild) lyricsText.removeChild(lyricsText.firstChild);
  btnLyrics.className = 'actBtn' + (data ? ' has-content' : '');
  if (!data) return;
  if (data.kind === 'syncedLyrics') {
    renderSyncedLyrics(data.value);
  } else {
    lyricsText.textContent = data.value;
  }
}

/* ---------- Info ---------- */
function showInfo(list) {
  infoItems = list.filter(function(i){ return i && (i.data || i.always || i.lazy); });
  infoIdx = 0;
  btnInfo.className = 'actBtn' + (infoItems.length ? ' has-content' : '');
  buildInfoTabs();
  renderInfo(false);
}


function buildInfoTabs() {
  while (infoTabs.firstChild) infoTabs.removeChild(infoTabs.firstChild);
  if (infoItems.length < 2) { infoTabs.style.display = 'none'; return; }
  infoTabs.style.display = 'flex';
  infoItems.forEach(function(it, i){
    var t = document.createElement('div');
    t.className = 'infoTab' + (i === infoIdx ? ' on' : '');
    t.textContent = it.label || it.title;
    t.addEventListener('click', function(){
      var dir = i > infoIdx ? 1 : -1;
      infoIdx = i; buildInfoTabs(); renderInfo(dir);
    });
    infoTabs.appendChild(t);
  });
}

function tinyart() {
  var parts = Array.prototype.slice.call(arguments);
  return '/tinyart/' + parts.map(function(s){
    return (s || '').replace(/ /g, '_');
  }).join('/') + '/large';
}

function renderInfo(dir) {
  if (!infoItems.length) {
    while (infoContent.firstChild) infoContent.removeChild(infoContent.firstChild);
    return;
  }
  var it = infoItems[infoIdx];
  infoOverlayTitle.textContent = it.title;
  if (dir) {
    infoContent.style.transition = 'none';
    infoContent.style.transform = 'translateX(' + (dir * 100) + '%)';
    setTimeout(function(){
      infoContent.style.transition = 'transform .25s ease';
      infoContent.style.transform = 'translateX(0)';
    }, 20);
  } else {
    infoContent.style.transition = 'none';
    infoContent.style.transform = 'translateX(0)';
  }
  while (infoContent.firstChild) infoContent.removeChild(infoContent.firstChild);


  if (it.lazy && !it.data) {
    var loading = document.createElement('div');
    loading.className = 'plHint';
    loading.textContent = 'Suche ähnliche Künstler…';
    infoContent.appendChild(loading);
    loadSimilarArtists(it.artist).then(function(matches){
      it.data = {kind:'similarArtists', value: matches, tidal: null};
      if (infoItems[infoIdx] === it) renderInfo(false);
      var data = it.data;                                  /* TIDAL danach, damit die Sammlung sofort erscheint */
      loadTidalSimilar(it.artist, matches).then(function(list){
        data.tidal = list;
        if (infoItems[infoIdx] === it && it.data === data) renderInfo(false);
      });
    });
    return;
  }


if (!it.data || it.data.kind === 'story') {
  var img = document.createElement('img');
  if (it.title === curAlbum) {
    img.src = lastArt || tinyart(curArtist, curAlbum);
    img.className = 'infoImg album';             /* im Querformat ausgeblendet: das Cover ist dort ohnehin zu sehen */
  } else {
    img.src = tinyart(it.title);
    img.className = 'infoImg artist';
  }
  img.onerror = function(){ this.style.display='none'; };
  infoContent.appendChild(img);

  var p = document.createElement('div');
  p.style.cssText = 'font-size:calc(4 * var(--vw));line-height:1.65;white-space:pre-wrap;padding-bottom:2vh;';
  p.textContent = it.data ? it.data.value : 'Kein Inhalt gefunden.';
  infoContent.appendChild(p);
  return;
}

  if (it.data.kind === 'disc') {
    it.data.value.forEach(function(al){
      var row = document.createElement('div');
      var isCur = (al.title === curAlbum);
      row.className = 'disc-row' + (isCur ? ' cur' : '');
      row.textContent = al.title;
      row.addEventListener('click', function(){
        openBrowse({kind:'album', artist:curArtist, album:al.title, uri:al.uri});   /* Titel des Albums; zurück-Pfeil führt hierher */
      });
      infoContent.appendChild(row);
    });
    return;
  }


  if (it.data.kind === 'similarArtists') {
    var tidal = it.data.tidal;                      /* null: wird noch gesucht */
    if (!it.data.value.length && tidal && tidal.length) {
      /* nichts in der Sammlung, aber bei TIDAL: kein Hinweis "nichts gefunden" nötig */
    } else if (!it.data.value.length && tidal) {
      var none = document.createElement('div');
      none.className = 'plHint';
      none.textContent = 'Keine ähnlichen Künstler gefunden';
      infoContent.appendChild(none);
      return;
    }
    it.data.value.forEach(function(name){
      var row = document.createElement('div');
      row.className = 'disc-row';
      row.textContent = name;
      row.addEventListener('click', function(){
        openBrowse({kind:'artist', artist:name});                                  /* Alben des Künstlers; zurück-Pfeil führt hierher */
      });
      infoContent.appendChild(row);
    });
    if (tidal === null) {
      var wait = document.createElement('div');
      wait.className = 'plHint'; wait.textContent = 'Suche bei TIDAL…';
      infoContent.appendChild(wait);
    } else if (tidal.length) {
      var hd = document.createElement('div');
      hd.className = 'infoSection'; hd.textContent = 'TIDAL';
      infoContent.appendChild(hd);
      tidal.forEach(function(t){
        var row = document.createElement('div');
        row.className = 'disc-row';
        row.textContent = t.title;
        row.addEventListener('click', function(){
          openBrowse({kind:'artist', artist:t.title, uri:t.uri});     /* Alben bei TIDAL (browse.js) */
        });
        infoContent.appendChild(row);
      });
    }
    return;
  }


  it.data.value.forEach(function(row){
    var line = document.createElement('div');
    line.className = 'credit-row';
    var k = document.createElement('div');
    k.className = 'credit-key'; k.textContent = row.key;
    var v = document.createElement('div');
    v.className = 'credit-val';
    v.textContent = (row.values || []).map(function(x){ return x.name; }).join(', ');
    line.appendChild(k); line.appendChild(v);
    infoContent.appendChild(line);
  });
}

var infoSwipeX = null;
infoOverlayBody.addEventListener('touchstart', function(e){
  infoSwipeX = e.changedTouches[0].clientX;
}, {passive:true});
infoOverlayBody.addEventListener('touchend', function(e){
  if (infoSwipeX === null) return;
  var dx = e.changedTouches[0].clientX - infoSwipeX;
  infoSwipeX = null;
  if (Math.abs(dx) < 50) return;
  var dir = dx < 0 ? 1 : -1;
  var next = infoIdx + dir;
  if (next < 0 || next >= infoItems.length) return;
  infoIdx = next; buildInfoTabs(); renderInfo(dir);
}, {passive:true});

