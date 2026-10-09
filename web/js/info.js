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
  lyrSyncShow(false);
  if (!data) return;
  if (data.kind === 'syncedLyrics') {
    renderSyncedLyrics(data.value, data.key);
  } else {
    lyricsText.textContent = data.value;
  }
}

/* ---------- Info ---------- */
/* Reiter "Titel" (Text zum einzelnen Lied): nur wenn etwas gefunden wurde. Bei Alben als zweiter Reiter (Album bleibt
   der Startreiter, damit nichts springt); beim Webradio ganz vorn, dort gibt es kein Album und der Titel ist das Neue */
var trackInfo = null;            /* {key, item, radio} des laufenden Titels */
function trackInfoAt() { return trackInfo && trackInfo.radio ? 0 : 1; }
function withTrackInfo(list) {
  if (!trackInfo || !trackInfo.item || !list.length) return list;
  var at = trackInfoAt();
  return list.slice(0, at).concat([trackInfo.item], list.slice(at));
}
function setTrackInfo(key, title, data, radio) {
  var cur = infoItems[infoIdx];
  var item = data ? {title: title, label: T('info.tab.track'), data: data, track: true} : null;
  trackInfo = {key: key, item: item, radio: !!radio};
  var at = -1;
  infoItems.forEach(function(it, i){ if (it.track) at = i; });
  if (!infoItems.length || (at < 0 && !item)) return;  /* Album/Künstler noch nicht da: kommt mit showInfo */
  if (at >= 0) infoItems.splice(at, 1);
  if (item) infoItems.splice(trackInfoAt(), 0, item);
  var idx = infoItems.indexOf(cur);                    /* auf dem gleichen Reiter bleiben */
  if (item && radio && infoIdx === 0) idx = -1;        /* Radio: stand der Startreiter offen, den Titel zeigen */
  infoIdx = idx >= 0 ? idx : 0;
  btnInfo.className = 'actBtn' + (infoItems.length ? ' has-content' : '');
  buildInfoTabs();
  if (idx < 0) renderInfo(false);                      /* der alte Titel-Reiter war offen */
}

function showInfo(list) {
  list = withTrackInfo(list);
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
    loading.textContent = T('info.similar.searching');
    infoContent.appendChild(loading);
    loadSimilarArtists(it.artist).then(function(matches){
      var streams = {};                                    /* je Dienst: null = wird noch gesucht */
      streamsOn().forEach(function(svc){ streams[svc.id] = null; });
      it.data = {kind:'similarArtists', value: matches, streams: streams};
      if (infoItems[infoIdx] === it) renderInfo(false);
      var data = it.data;                                  /* Dienste danach (nacheinander), damit die Sammlung sofort erscheint */
      streamsOn().reduce(function(chain, svc){
        return chain.then(function(){
          return loadStreamSimilar(svc, it.artist, matches).then(function(list){
            data.streams[svc.id] = list;
            if (infoItems[infoIdx] === it && it.data === data) renderInfo(false);
          });
        });
      }, Promise.resolve());
    });
    return;
  }


if (!it.data || it.data.kind === 'story') {
  var img = document.createElement('img');
  if (it.title === curAlbum || it.track) {
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
  p.textContent = it.data ? it.data.value : T('info.noContent');
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
    var st = it.data.streams || {}, ids = Object.keys(st);
    var pending = ids.filter(function(id){ return st[id] === null; });
    var found = ids.filter(function(id){ return st[id] && st[id].length; });
    if (!it.data.value.length && !found.length && !pending.length) {
      var none = document.createElement('div');
      none.className = 'plHint';
      none.textContent = T('info.similar.none');
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
    found.forEach(function(id){
      var svc = streamById(id);
      var hd = document.createElement('div');
      hd.className = 'infoSection'; hd.textContent = svc.name;
      infoContent.appendChild(hd);
      st[id].forEach(function(t){
        var row = document.createElement('div');
        row.className = 'disc-row';
        row.textContent = t.title;
        row.addEventListener('click', function(){
          openBrowse({kind:'artist', artist:t.title, uri:t.uri});     /* Alben beim Dienst (browse.js) */
        });
        infoContent.appendChild(row);
      });
    });
    if (pending.length) {
      var wait = document.createElement('div');
      wait.className = 'plHint';
      wait.textContent = T('info.similar.searchingAt', {services: pending.map(function(id){ return streamById(id).name; }).join(T('info.listAnd'))});

      infoContent.appendChild(wait);
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

