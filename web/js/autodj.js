/* Endlos-Wiedergabe über das AutoDJ-Plugin (Celindir69/autodj-plugin, REST-Endpunkt "autodj"): vierter Zustand ∞ am
   Wiederholen-Knopf (aus → alle → einer → ∞). AutoDJ pausiert, solange Wiederholen an ist; die Zustände schließen
   sich also aus. Ohne Plugin oder ohne Last.fm-Key im Plugin bleibt es bei drei Zuständen.
   Klassisches Skript, gemeinsamer globaler Gültigkeitsbereich; Reihenfolge siehe xplorio.html. */
var autodj = {avail: false, enabled: false, ready: false};

/* angezeigter Zustand: AutoDJ an und Wiederholen aus = ∞ */
function repeatShown(mode, adj) { return (mode === 'off' && adj.avail && adj.enabled) ? 'inf' : mode; }

/* nächster Zustand beim Tippen: {mode, repeat: Werte für setRepeat oder null, autodj: true/false oder null (nichts tun)} */
function repeatNext(shown, adj) {
  var OFF = {value: false, repeatSingle: false};
  if (shown === 'off') return {mode: 'all', repeat: {value: true, repeatSingle: false}, autodj: null};
  if (shown === 'all') return {mode: 'one', repeat: {value: true, repeatSingle: true}, autodj: null};
  if (shown === 'one') {
    if (adj.avail && adj.ready) return {mode: 'inf', repeat: OFF, autodj: true};
    return {mode: 'off', repeat: OFF, autodj: (adj.avail && adj.enabled) ? false : null};
  }
  return {mode: 'off', repeat: null, autodj: false};                       /* ∞ → aus */
}

/* Plugin fragen ({} = Zustand, {enabled: …} = schalten); ohne Antwort gilt es als nicht vorhanden */
var autodjTimer = null;
function autodjCall(data) {
  clearTimeout(autodjTimer);
  return withTimeout(fetch('/api/v1/pluginEndpoint', {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({endpoint: 'autodj', data: data || {}})
  }), 5000).then(function(r){ return r.json(); })
    .then(function(j){
      var d = j && j.data;
      if (!d || typeof d.enabled !== 'boolean') throw new Error('kein AutoDJ');
      autodj = {avail: true, enabled: d.enabled, ready: d.ready !== false};
    })
    .catch(function(){ autodj = {avail: false, enabled: false, ready: false}; })
    .then(function(){
      if (typeof updateCtrlUI === 'function') updateCtrlUI();
      /* Zustand nachhalten (auch in Volumio umgeschaltet); ohne Plugin selten nachsehen */
      autodjTimer = setTimeout(function(){ autodjCall(); }, autodj.avail ? 30000 : 300000);
    });
}

if (typeof module !== 'undefined') module.exports = {repeatShown: repeatShown, repeatNext: repeatNext};
else {
  document.addEventListener('visibilitychange', function(){ if (!document.hidden) autodjCall(); });
  setTimeout(function(){ autodjCall(); }, 0);                               /* nach dem Laden aller Skripte */
}
