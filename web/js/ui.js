/* Overlays öffnen/schließen und Wiedergabe-Tasten
   Klassisches Skript, gemeinsamer globaler Gültigkeitsbereich; Reihenfolge siehe app.html. */
/* ---------- Overlays ---------- */
function closeAllOverlays() {
  overlayLyrics.classList.remove('on');
  overlayInfo.classList.remove('on');
  overlayQueue.classList.remove('on');
  overlayPlaylists.classList.remove('on');
  overlaySearch.classList.remove('on');
  var ob = document.getElementById('overlayBrowse');
  if (ob) ob.classList.remove('on');
  var ov = document.getElementById('overlayVolumio');
  if (ov) ov.classList.remove('on');
  var oc = document.getElementById('overlayCheck');
  if (oc) oc.classList.remove('on');
  var ot = document.getElementById('overlayTags');
  if (ot) ot.classList.remove('on');
  if (window.closeVolumioFrame) closeVolumioFrame();
}
function toggleOverlay(overlay) {
  var isOpen = overlay.classList.contains('on');
  closeAllOverlays();
  if (!isOpen) overlay.classList.add('on');
}

btnLyrics.addEventListener('click', function(){
  if (!btnLyrics.classList.contains('has-content')) return;
  toggleOverlay(overlayLyrics);
});
document.getElementById('closeLyrics').addEventListener('click', closeAllOverlays);

btnInfo.addEventListener('click', function(){
  if (!btnInfo.classList.contains('has-content')) return;
  toggleOverlay(overlayInfo);
});

document.getElementById('closeInfo').addEventListener('click', closeAllOverlays);

btnQueue.addEventListener('click', function(){
  var isOpen = overlayQueue.classList.contains('on');
  closeAllOverlays();
  if (!isOpen) { overlayQueue.classList.add('on'); loadQueue(); }
});
document.getElementById('closeQueue').addEventListener('click', closeAllOverlays);

btnPlaylists.addEventListener('click', function(){
  var isOpen = overlayPlaylists.classList.contains('on');
  closeAllOverlays();
  if (!isOpen) {
    overlayPlaylists.classList.add('on');
    plTabActive = 1;
    document.getElementById('plTab1').className = 'qTab on';
    document.getElementById('plTab2').className = 'qTab';
    document.getElementById('plOverlayTitle').textContent = 'Playlisten';
    playlistResults.style.display = 'block';
    radioPanel.style.display = 'none';
    loadPlaylists();
  }
});
document.getElementById('closePlaylists').addEventListener('click', closeAllOverlays);

btnSearch.addEventListener('click', function(){
  var isOpen = overlaySearch.classList.contains('on');
  closeAllOverlays();
  if (!isOpen) {
    overlaySearch.classList.add('on');
    setTimeout(function(){ searchInput.focus(); }, 400);
  }
});
document.getElementById('closeSearch').addEventListener('click', closeAllOverlays);

var swipeStartY = 0, swipeStartX = 0;
var swipeFromTop = false;

document.addEventListener('touchstart', function(e){
  swipeStartY = e.changedTouches[0].clientY;
  swipeStartX = e.changedTouches[0].clientX;
  swipeFromTop = false;
  var el = e.target;
  while (el && el !== document.body) {
    if (el.classList &&
        (el.classList.contains('overlayHandle') ||
         el.classList.contains('overlayHead'))) {
      swipeFromTop = true;
      break;
    }
    el = el.parentElement;
  }
}, {passive:true});

document.addEventListener('touchend', function(e){
  if (drag) return;
  if (!swipeFromTop) return;
  var dy = e.changedTouches[0].clientY - swipeStartY;
  var dx = e.changedTouches[0].clientX - swipeStartX;
  if (window.matchMedia('(orientation:landscape)').matches) {      /* Querformat: Seitenleiste, nach rechts wischen */
    if (dx > 80 && dx > Math.abs(dy) * 1.5) closeAllOverlays();
  } else if (dy > 80) closeAllOverlays();
}, {passive:true});

/* ---------- Wiedergabe ---------- */
function cmd(c) { fetch('/api/v1/commands/?cmd=' + c).catch(function(){}); }
document.getElementById('cPrev').addEventListener('click', function(){ cmd('prev'); });
document.getElementById('cPlay').addEventListener('click', function(){ cmd('toggle'); });
document.getElementById('cNext').addEventListener('click', function(){ cmd('next'); });

document.getElementById('seekBar').addEventListener('click', function(e){
  if (!curDur) return;
  var rect = this.getBoundingClientRect();
  var pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  seekBase = pct * curDur * 1000; seekStamp = Date.now();
  paintTime();
  fetch('/api/v1/commands/?cmd=seek&position=' + Math.floor(pct * curDur))
    .catch(function(){});
});

document.addEventListener('visibilitychange', function(){
  if (!document.hidden) { lastKey = ''; lastLyrKey = ''; poll(); }
});

/* kurze Meldung unten */
var toastTimer = null;
function showToast(text) {
  var el = document.getElementById('toast');
  el.textContent = text;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function(){ el.classList.remove('on'); }, 3500);
}
