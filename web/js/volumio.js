/* Zugang zur originalen Volumio-Oberfläche (Menü oben rechts, Eintrag "Volumio-Oberfläche")
   Klassisches Skript, gemeinsamer globaler Gültigkeitsbereich; Reihenfolge siehe xplorio.html.
   Die Seiten öffnen im Overlay in einem Rahmen (iframe), die App bleibt darunter erhalten.
   Seiten die xplorio.html selbst übernommen hat, können hier einfach aus der Liste entfernt werden. */

var VOLUMIO_PAGES = [
  { label: T('volumio.page.browse'),   path: '/browse' },
  { label: T('volumio.page.queue'),    path: '/queue' },
  { label: T('volumio.page.settings'), path: '/settings' },
  { label: T('volumio.page.plugins'),  path: '/plugin-manager' }

];

var overlayVolumio   = document.getElementById('overlayVolumio');
var volumioTabBar    = document.getElementById('volumioTabBar');
var volumioPanel     = document.getElementById('volumioPanel');
var volumioHint      = document.getElementById('volumioHint');
var openVolumioTab   = document.getElementById('openVolumioTab');
var volumioActive    = -1;

function buildVolumioTabs() {
  volumioTabBar.innerHTML = '';
  VOLUMIO_PAGES.forEach(function(pg, i){
    var tab = document.createElement('div');
    tab.className = 'qTab';
    tab.textContent = pg.label;
    tab.addEventListener('click', function(){ showVolumioPage(i); });
    volumioTabBar.appendChild(tab);
  });
}

function showVolumioPage(i) {
  var pg = VOLUMIO_PAGES[i];
  if (!pg) return;
  volumioActive = i;
  Array.prototype.forEach.call(volumioTabBar.children, function(el, k){
    el.className = 'qTab' + (k === i ? ' on' : '');
  });
  volumioHint.style.display = 'none';
  var f = document.getElementById('volumioFrame');
  if (!f) {
    f = document.createElement('iframe');
    f.id = 'volumioFrame';
    volumioPanel.appendChild(f);
  }
  f.src = pg.path;
  openVolumioTab.href = pg.path;
  openVolumioTab.style.display = '';
}

/* beim Schließen den Rahmen entfernen (spart Arbeit auf dem Player und im Browser) */
function closeVolumioFrame() {
  var f = document.getElementById('volumioFrame');
  if (f) f.parentNode.removeChild(f);
  volumioActive = -1;
  volumioHint.style.display = '';
  openVolumioTab.style.display = 'none';
  Array.prototype.forEach.call(volumioTabBar.children, function(el){ el.className = 'qTab'; });
}

function openVolumio() {                       /* aus dem Menü (menu.js) */
  closeAllOverlays();
  overlayVolumio.classList.add('on');
}
document.getElementById('volumioBack').addEventListener('click', function(){ openMenu(); });
document.getElementById('closeVolumio').addEventListener('click', closeAllOverlays);

buildVolumioTabs();
