/* Display-Layout für große Bildschirme im Querformat (iPad, MacBook, Desktop), angelehnt an legacy/now_playing.html:
   links Cover und Titel, darunter das Info-Karussell (blättert von selbst wie kioskTV.html), unten die Steuerung;
   rechts immer die Lyrics. Umschalter oben rechts; jedes Gerät merkt sich seine Wahl.
   Klassisches Skript, gemeinsamer globaler Gültigkeitsbereich; wird nach poll.js geladen. */
var STAGE_KEY = 'mxLayout';
var STAGE_MQ = window.matchMedia('(orientation:landscape) and (min-width:900px) and (min-height:560px)');
var STAGE_PAGE_MS = 25000;       /* Karussell und lange Lyrics ohne Zeitmarken: Seitenwechsel wie im Kiosk */
var STAGE_IDLE_MS = 60000;       /* nach eigenem Wischen/Tippen so lange nicht selbst blättern */

var btnStage = document.getElementById('btnStage');
var topRight = document.getElementById('topRight');
var stageOn = false;
var stageInfoTimer = null, stageInfoUserAt = 0;
var stagePlain = null;           /* lange Lyrics ohne Zeitmarken: {offs:[…], start, page} */

function stagePref() {
  try {
    var m = /[?&]layout=(stage|classic)\b/.exec(location.search);
    if (m) localStorage.setItem(STAGE_KEY, m[1]);           /* z. B. app.html?layout=stage für das iPad an der Anlage */
    return localStorage.getItem(STAGE_KEY) === 'stage';
  } catch (e) { return false; }
}

/* Knöpfe Queue, Playlisten, Suche wandern in die Leiste oben rechts (und zurück) */
var STAGE_BTNS = ['btnQueue', 'btnPlaylists', 'btnSearch'];
function stageMoveButtons(on) {
  var actions = document.getElementById('actions');
  STAGE_BTNS.forEach(function(id){
    var b = document.getElementById(id);
    if (on) { b.classList.add('topBtn'); topRight.insertBefore(b, btnStage); }
    else { b.classList.remove('topBtn'); actions.appendChild(b); }
  });
}

function stageApply() {
  var want = STAGE_MQ.matches && stagePref();
  if (want === stageOn) return;
  stageOn = want;
  closeAllOverlays();
  var info = document.getElementById('overlayInfo');
  if (want) document.getElementById('rightPane').insertBefore(info, document.getElementById('seekWrap'));   /* Karussell zwischen Titel und Steuerung */
  else document.body.insertBefore(info, document.getElementById('overlayQueue'));
  stageMoveButtons(want);
  document.documentElement.classList.toggle('stage', want);
  btnStage.classList.toggle('on', want);
  lyrLastH = 0;                                              /* Lyrics neu mittig ausrichten */
  infoOverlayBody.scrollTop = 0;
  stageInfoSchedule();
  setTimeout(stagePlainSetup, 50);
  lyrShiftPlace();                                           /* − und + über die Lyrics */
}

btnStage.addEventListener('click', function(){
  try { localStorage.setItem(STAGE_KEY, stageOn ? 'classic' : 'stage'); } catch (e) {}
  stageApply();
});
if (STAGE_MQ.addEventListener) STAGE_MQ.addEventListener('change', stageApply);
else if (STAGE_MQ.addListener) STAGE_MQ.addListener(stageApply);          /* ältere Safari-Versionen */

/* ---------- Info-Karussell: blättert seitenweise durch den Text, dann zum nächsten Reiter ---------- */
function stageInfoSchedule() {
  clearTimeout(stageInfoTimer);
  if (stageOn) stageInfoTimer = setTimeout(stageInfoStep, STAGE_PAGE_MS);
}

function stageInfoStep() {
  if (!stageOn) return;
  var idle = Date.now() - stageInfoUserAt >= STAGE_IDLE_MS;
  if (idle && infoItems.length) {
    var b = infoOverlayBody, page = b.clientHeight - 40;
    if (b.scrollTop + b.clientHeight < b.scrollHeight - 4 && page > 40) {
      stageScroll(b, Math.min(b.scrollTop + page, b.scrollHeight - b.clientHeight));
    } else if (infoItems.length > 1) {
      infoIdx = (infoIdx + 1) % infoItems.length;
      b.scrollTop = 0;
      buildInfoTabs(); renderInfo(1);
    } else if (b.scrollTop > 0) stageScroll(b, 0);
  }
  stageInfoSchedule();
}

/* sanft scrollen, in ganzen Pixeln (scrollTo mit Optionen fehlt in alten Browsern) */
function stageScroll(el, top) {
  var from = el.scrollTop, t0 = Date.now(), dur = 600;
  top = Math.round(top);
  (function step() {
    var k = Math.min(1, (Date.now() - t0) / dur);
    k = 1 - Math.pow(1 - k, 3);
    el.scrollTop = Math.round(from + (top - from) * k);
    if (k < 1) requestAnimationFrame(step);
  })();
}

['touchstart', 'wheel', 'mousedown'].forEach(function(ev){
  infoOverlayBody.addEventListener(ev, function(){ stageInfoUserAt = Date.now(); }, {passive:true});
});

/* Punkte unter dem Karussell statt der Reiterleiste; Tippen springt zum Reiter */
var stageDots = document.createElement('div');
stageDots.id = 'stageDots';
document.getElementById('overlayInfo').appendChild(stageDots);
function stagePaintDots() {
  while (stageDots.firstChild) stageDots.removeChild(stageDots.firstChild);
  if (infoItems.length < 2) return;
  infoItems.forEach(function(it, i){
    var d = document.createElement('span');
    d.className = i === infoIdx ? 'on' : '';
    d.title = it.label || it.title;
    d.addEventListener('click', function(){
      if (i === infoIdx) return;
      stageInfoUserAt = Date.now();
      var dir = i > infoIdx ? 1 : -1;
      infoIdx = i; infoOverlayBody.scrollTop = 0;
      buildInfoTabs(); renderInfo(dir);
    });
    stageDots.appendChild(d);
  });
}
var stageBuildTabs = buildInfoTabs;
buildInfoTabs = function(){ stageBuildTabs(); stagePaintDots(); };

/* neuer Titel: Karussell von vorn */
var stageShowInfo = showInfo;
showInfo = function(list){
  stageShowInfo(list);
  infoOverlayBody.scrollTop = 0;
  stageInfoSchedule();
};

/* ---------- Lyrics ohne Zeitmarken: zu lange Texte erst kleiner, dann seitenweise (wie kioskTV.html) ---------- */
var STAGE_PLAIN_MIN = 0.72;      /* kleinste Schrift relativ zur normalen Größe */

var stageShowLyrics = showLyrics;
showLyrics = function(data){
  stageShowLyrics(data);
  lyricsText.style.fontSize = '';
  stagePlainSetup();
};

function stagePlainSetup() {
  stagePlain = null;
  lyricsText.style.fontSize = '';
  if (!stageOn || lyricsText.classList.contains('synced') || !lyricsText.textContent) return;
  var avail = area.clientHeight - 24;
  if (!avail || lyricsText.scrollHeight <= avail) return;
  var base = parseFloat(getComputedStyle(lyricsText).fontSize), min = Math.round(base * STAGE_PLAIN_MIN);
  for (var px = Math.floor(base) - 1; px >= min && lyricsText.scrollHeight > avail; px--) lyricsText.style.fontSize = px + 'px';
  var total = lyricsText.scrollHeight;
  if (total <= avail) return;
  var lh = parseFloat(getComputedStyle(lyricsText).lineHeight) || 24;
  var pageH = Math.max(1, Math.floor(avail / lh) - 1) * lh, last = total - area.clientHeight + 24, offs = [];
  for (var y = 0; y < last; y += pageH) offs.push(Math.round(y));
  offs.push(Math.max(0, Math.round(last)));
  stagePlain = {offs: offs, start: Date.now(), page: -1};
  area.scrollTop = 0;
}

/* Seite nach Liedposition (über 90 % der Dauer verteilt), ohne Dauer (Radio) alle STAGE_PAGE_MS */
setInterval(function(){
  if (!stageOn || !stagePlain || Date.now() < lyrUserUntil) return;
  var n = stagePlain.offs.length, p;
  if (curDur > 0) p = Math.floor((Number(window.currentSeekMs) || 0) / (curDur * 1000 * 0.9 / n));
  else p = Math.floor((Date.now() - stagePlain.start) / STAGE_PAGE_MS);
  p = Math.max(0, Math.min(n - 1, p));
  if (p !== stagePlain.page || lyrPending) {
    stagePlain.page = p; lyrPending = false;
    stageScroll(area, stagePlain.offs[p]);
  }
}, 1000);

window.addEventListener('resize', function(){ if (stageOn) setTimeout(stagePlainSetup, 100); });

stageApply();
