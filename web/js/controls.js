/* Repeat/Random und Lautstärke (Rotel-Dienst oder, mit APP_CONFIG.ROTEL = false, Volumio)
   Klassisches Skript, gemeinsamer globaler Gültigkeitsbereich; Reihenfolge siehe app.html. */
/* ---------- Repeat / Random ---------- */
function updateCtrlUI() {
  var shown = repeatShown(stRepeatMode, autodj);                 /* ∞ = AutoDJ (autodj.js) */
  cRepeat.className = shown + (curRadio ? ' disabled' : '');
  repeatBadge.textContent = {all: 'ALL', one: '1', inf: '∞'}[shown] || '';
  cRandom.className = (stRandom ? 'on' : '') + (curRadio ? ' disabled' : '');
}

cRepeat.addEventListener('click', function(){
  if (curRadio) return;
  var nx = repeatNext(repeatShown(stRepeatMode, autodj), autodj);
  if (nx.repeat) socket.emit('setRepeat', nx.repeat);
  stRepeatMode = nx.mode === 'inf' ? 'off' : nx.mode;
  if (nx.autodj !== null) { autodj.enabled = nx.autodj; autodjCall({enabled: nx.autodj}); }
  updateCtrlUI();
});

cRandom.addEventListener('click', function(){
  if (curRadio) return;
  stRandom = !stRandom;
  socket.emit('setRandom', {value: stRandom});
  updateCtrlUI();
});


/* ---------- Rotel Lautstärke ---------- */
var ROTEL_ON = !!(window.APP_CONFIG && window.APP_CONFIG.ROTEL);
var ROTEL    = 'http://' + location.hostname + ':' + ((window.APP_CONFIG && window.APP_CONFIG.ROTEL_PORT) || 8765);
var volWrap  = document.getElementById('volWrap');
var vSlider  = document.getElementById('vSlider');
var vVal     = document.getElementById('vVal');
var vMute    = document.getElementById('vMute');
var volDrag  = false;
var rotelMute= false;

var SVG_VOL  = '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>';
var SVG_MUTE = '<svg viewBox="0 0 24 24"><path d="M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.8 8.8 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>';
vMute.innerHTML = SVG_VOL;

function paintSlider() {
  var pct = vSlider.value / vSlider.max * 100;
  vSlider.style.background = 'linear-gradient(to right, var(--accent, var(--fg)) ' + pct +
    '%, rgba(var(--fg-rgb),.25) ' + pct + '%)';
  vVal.textContent = vSlider.value;
}

/* Rotel ein/aus (Symbol oben links). Die Befehlsnamen stehen in web/config.js.
   Ausschalten: erst die Wiedergabe stoppen, dann Rotel aus. */
var btnRotelPower = document.getElementById('btnRotelPower');
var rotelOn = false;          /* was die Anzeige gerade zeigt */
var rotelReachable = false;   /* antwortet der Rotel-Dienst überhaupt? */
var rotelLinked = false;      /* hat der Rotel-Dienst eine Verbindung zum Verstärker? (Standby: oft nein) */
var rotelBusy = false;        /* Ausschalten läuft (Wiedergabe wird gestoppt) */
var rotelPowerHold = null;    /* {want:true/false, until:ms}: nach dem Tippen dem Wunsch folgen, bis der Dienst es bestätigt */

function paintRotelPower() {
  var cls = 'topBtn';
  if (!rotelReachable) cls += ' na';
  else if (rotelOn) cls += ' on';
  btnRotelPower.className = cls;
  btnRotelPower.title = !rotelReachable ? T('controls.rotel.unreachable') : (rotelOn ? T('controls.rotel.off') : T('controls.rotel.on'));
}

function sendRotelPower(want) {
  var cfg = window.APP_CONFIG || {};
  var c = want ? (cfg.ROTEL_CMD_POWER_ON || 'power_on') : (cfg.ROTEL_CMD_POWER_OFF || 'power_off');
  rotelPowerHold = { want: want, until: Date.now() + 20000 };
  return rotel('/cmd?c=' + encodeURIComponent(c));
}

/* Wiedergabe stoppen und kurz warten, bis Volumio sie nicht mehr als laufend meldet (höchstens 4 s) */
function stopPlaybackThen(done) {
  var tries = 0;
  function check() {
    fetch('/api/v1/getState').then(function(r){ return r.json(); }).then(function(st){
      if (st.status !== 'play' || ++tries > 12) { setTimeout(done, 500); } else { setTimeout(check, 300); }
    }).catch(function(){ setTimeout(done, 500); });
  }
  fetch('/api/v1/getState').then(function(r){ return r.json(); }).then(function(st){
    if (st.status === 'stop') { done(); return; }
    cmd('stop'); setTimeout(check, 300);
  }).catch(function(){ done(); });
}

btnRotelPower.addEventListener('click', function(){
  if (rotelBusy) return;
  var want = !rotelOn;
  if (want && !rotelLinked) {
    /* Der Dienst erreicht den Verstärker nicht (im Standby meist ohne Netzwerk): Befehl würde verworfen */
    showToast(T('controls.rotel.notLinked'));

    return;
  }
  rotelOn = want; paintRotelPower();
  volWrap.className = want ? '' : 'off';
  rotelPowerHold = { want: want, until: Date.now() + 20000 };
  if (want) { sendRotelPower(true); return; }
  rotelBusy = true;
  stopPlaybackThen(function(){ sendRotelPower(false); rotelBusy = false; });
});

function showRotel(s) {
  rotelReachable = true;
  rotelLinked = !!s.connected;
  var real = !!s.connected && s.power !== false;
  if (rotelPowerHold && (Date.now() > rotelPowerHold.until || real === rotelPowerHold.want)) rotelPowerHold = null;
  rotelOn = rotelPowerHold ? rotelPowerHold.want : real;
  paintRotelPower();
  volWrap.className = rotelOn ? '' : 'off';
  if (!!s.mute !== rotelMute || !vMute.firstChild) {
    rotelMute = !!s.mute;
    vMute.innerHTML = rotelMute ? SVG_MUTE : SVG_VOL;
  }
  if (!volDrag && typeof s.volume === 'number') {
    vSlider.value = s.volume;
    paintSlider();
  }
}

/* ohne Rotel: Lautstärke von Volumio (getState/pushState); ausgeblendet, wenn Volumio keine Lautstärkeregelung hat */
function showVolumio(st) {
  if (ROTEL_ON) return;
  var none = st.disableVolumeControl || typeof st.volume !== 'number';
  volWrap.style.display = none ? 'none' : '';
  if (none) return;
  volWrap.className = '';
  if (!!st.mute !== rotelMute || !vMute.firstChild) {
    rotelMute = !!st.mute;
    vMute.innerHTML = rotelMute ? SVG_MUTE : SVG_VOL;
  }
  if (!volDrag) { vSlider.value = st.volume; paintSlider(); }
}

function volumioVol(v) {
  v = Math.max(0, Math.min(100, v));
  vSlider.value = v; paintSlider();
  socket.emit('volume', v);
}

if (!ROTEL_ON) {
  btnRotelPower.style.display = 'none';
  vSlider.max = 100;
}

function rotel(path) {
  if (!ROTEL_ON) return Promise.resolve();
  return fetch(ROTEL + path)
    .then(function(r){ return r.json(); })
    .then(function(j){ if (j && j.state) showRotel(j.state); })
    .catch(function(){ volWrap.className = 'off'; rotelReachable = false; paintRotelPower(); });
}

vSlider.addEventListener('input', function(){ volDrag = true; paintSlider(); });
vSlider.addEventListener('change', function(){
  if (!ROTEL_ON) { volumioVol(+vSlider.value); volDrag = false; return; }
  rotel('/vol?v=' + vSlider.value).then(function(){ volDrag = false; });
});

document.getElementById('vDown').addEventListener('click', function(){
  if (!ROTEL_ON) return volumioVol(+vSlider.value - 1);
  vSlider.value = Math.max(0, +vSlider.value - 1); paintSlider();
  rotel('/cmd?c=vol_dwn');
});
document.getElementById('vUp').addEventListener('click', function(){
  if (!ROTEL_ON) return volumioVol(+vSlider.value + 1);
  vSlider.value = Math.min(+vSlider.max, +vSlider.value + 1); paintSlider();
  rotel('/cmd?c=vol_up');
});
vMute.addEventListener('click', function(){
  if (!ROTEL_ON) { socket.emit(rotelMute ? 'unmute' : 'mute'); return; }
  rotel('/cmd?c=' + (rotelMute ? 'mute_off' : 'mute_on'));
});

