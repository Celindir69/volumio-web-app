/* Stimmungs-Mix: Stimmung, Energie und optional Stil wählen, Vorschau ansehen, dann Warteschlange ersetzen und spielen
   (Tag-Dienst GET /moodmix). Erstellen ändert die Warteschlange noch nicht; erst „Mix abspielen“.
   Klassisches Skript, gemeinsamer globaler Gültigkeitsbereich; nach check.js, history.js und discover.js geladen. */
var overlayMix = document.getElementById('overlayMix');
var mixBody    = document.getElementById('mixBody');
var MIX_CORE   = ['relaxed', 'dreamy', 'uplifting', 'melancholic', 'dark', 'reflective', 'happy', 'romantic'];
var MIX_MORE   = ['calm', 'atmospheric', 'emotional', 'epic', 'intense', 'aggressive', 'sensual', 'sad'];
var MIX_DISC   = [[0, 'Favoriten'], [0.5, 'Ausgewogen'], [1, 'Versteckte Perlen']];
var mixCrit    = {moods: [], emin: 1, emax: 5, styles: [], match: 'any', n: 50, disc: 0.5};
var mixState   = {view: 'pick', fine: false, more: false, styles: null, result: null};
var mixCountSeq = 0, mixCountTimer = null;

try { var saved = JSON.parse(localStorage.getItem('moodMix') || 'null'); if (saved && saved.moods) mixCrit = saved; } catch (e) { /* ohne Speicher */ }
function mixSave() { try { localStorage.setItem('moodMix', JSON.stringify(mixCrit)); } catch (e) { /* egal */ } }

function mixName(m) { var s = MOOD_NAMES[m] || m; return s.charAt(0).toUpperCase() + s.slice(1); }
function mixQuery() {
  return 'moods=' + encodeURIComponent(mixCrit.moods.join(',')) + '&emin=' + mixCrit.emin + '&emax=' + mixCrit.emax +
    '&styles=' + encodeURIComponent(mixCrit.styles.join(',')) + '&match=' + mixCrit.match + '&n=' + mixCrit.n + '&disc=' + mixCrit.disc;
}
function mixClear() { while (mixBody.firstChild) mixBody.removeChild(mixBody.firstChild); }
function mixDuration(sec) {
  var m = Math.round(sec / 60);
  return m < 60 ? m + ' Min.' : Math.floor(m / 60) + ' Std. ' + (m % 60) + ' Min.';
}
function mixEnergyDots(e) {
  if (!e) return '';
  var s = '';
  for (var i = 1; i <= 5; i++) s += i <= e ? '●' : '○';
  return s;
}

/* von außen: Mix-Blatt öffnen, optional mit einer Stimmung vorgewählt */
function openMoodMix(mood) {
  closeAllOverlays();
  if (mood) mixCrit.moods = [mood];
  mixState.view = 'pick';
  overlayMix.classList.add('on');
  mixRender();
}

function mixRender() {
  mixClear();
  if (mixState.view === 'preview' && mixState.result) return mixPreview();
  mixPick();
}

/* ---------- Auswahl ---------- */

function mixChip(label, on, onClick, cls) {
  var c = histEl('div', 'mxChip' + (on ? ' on' : '') + (cls ? ' ' + cls : ''), label);
  c.addEventListener('click', onClick);
  return c;
}

function mixPick() {
  mixBody.appendChild(histEl('div', 'mxAsk', 'Was möchtest du hören?'));
  var chips = histEl('div', 'mxChips');
  function toggle(m) {
    var i = mixCrit.moods.indexOf(m);
    if (i >= 0) mixCrit.moods.splice(i, 1); else mixCrit.moods.push(m);
    mixCrit.styles = [];                                   /* Stile hängen an der Stimmung */
    mixRender();
  }
  var more = mixState.more || MIX_MORE.some(function(m){ return mixCrit.moods.indexOf(m) >= 0; });
  MIX_CORE.concat(more ? MIX_MORE : []).forEach(function(m){
    chips.appendChild(mixChip((mixCrit.moods.indexOf(m) >= 0 ? '✓ ' : '') + mixName(m), mixCrit.moods.indexOf(m) >= 0, function(){ toggle(m); }));
  });
  if (!more) chips.appendChild(mixChip('Weitere …', false, function(){ mixState.more = true; mixRender(); }, 'mxMore'));
  mixBody.appendChild(chips);

  /* Energie als Bereich 1–5 (zwei Regler übereinander) */
  mixBody.appendChild(histEl('div', 'mxLabel', 'Energie'));
  var en = histEl('div', 'mxEnergy');
  var track = histEl('div', 'mxTrack'), fill = histEl('div', 'mxFill');
  track.appendChild(fill);
  var lo = document.createElement('input'), hi = document.createElement('input');
  [lo, hi].forEach(function(r){ r.type = 'range'; r.min = 1; r.max = 5; r.step = 1; r.className = 'mxRange'; });
  lo.value = mixCrit.emin; hi.value = mixCrit.emax;
  function paint() {
    fill.style.left = ((mixCrit.emin - 1) * 25) + '%';
    fill.style.right = ((5 - mixCrit.emax) * 25) + '%';
    val.textContent = mixCrit.emin === 1 && mixCrit.emax === 5 ? 'alle' : mixCrit.emin === mixCrit.emax ? String(mixCrit.emin) : mixCrit.emin + '–' + mixCrit.emax;
  }
  function changed(which) {
    var a = +lo.value, b = +hi.value;
    if (a > b) { if (which === lo) hi.value = b = a; else lo.value = a = b; }
    mixCrit.emin = a; mixCrit.emax = b;
    paint(); mixCount();
  }
  lo.addEventListener('input', function(){ changed(lo); });
  hi.addEventListener('input', function(){ changed(hi); });
  en.appendChild(track); en.appendChild(lo); en.appendChild(hi);
  var ends = histEl('div', 'mxEnds');
  ends.appendChild(histEl('span', '', 'ruhig'));
  var val = histEl('span', 'mxVal');
  ends.appendChild(val);
  ends.appendChild(histEl('span', '', 'kraftvoll'));
  mixBody.appendChild(en); mixBody.appendChild(ends);
  paint();

  /* Feinabstimmung */
  var fold = histEl('div', 'hFold mxFold' + (mixState.fine ? ' open' : ''));
  fold.appendChild(histEl('span', '', 'Feinabstimmung'));
  var fine = histEl('div', 'mxFine');
  fine.style.display = mixState.fine ? '' : 'none';
  fold.addEventListener('click', function(){
    mixState.fine = !mixState.fine;
    fold.classList.toggle('open', mixState.fine);
    fine.style.display = mixState.fine ? '' : 'none';
  });
  mixBody.appendChild(fold); mixBody.appendChild(fine);

  fine.appendChild(histEl('div', 'mxLabel', 'Stil'));
  var styleBox = histEl('div', 'mxChips mxStyles');
  fine.appendChild(styleBox);
  var matchBox = histEl('div', 'mxSeg');
  fine.appendChild(matchBox);
  mixState.styleBox = styleBox; mixState.matchBox = matchBox;
  mixStyles();

  fine.appendChild(histEl('div', 'mxLabel', 'Länge'));
  fine.appendChild(mixSeg([[25, '25 Titel'], [50, '50 Titel'], [100, '100 Titel']], mixCrit.n, function(v){ mixCrit.n = v; }));
  fine.appendChild(histEl('div', 'mxLabel', 'Entdeckungsgrad'));
  fine.appendChild(mixSeg(MIX_DISC, mixCrit.disc, function(v){ mixCrit.disc = v; }));
  fine.appendChild(histEl('div', 'mxHint', 'Nach deinem Verlauf: oft Gehörtes, eine Mischung oder lange nicht Gehörtes.'));

  var hits = histEl('div', 'mxHits', ' ');
  mixState.hits = hits;
  mixBody.appendChild(hits);
  var go = histEl('button', 'mxGo', 'Mix erstellen');
  go.addEventListener('click', mixBuild);
  mixState.go = go;
  mixBody.appendChild(go);
  mixCount();
}

/* Auswahl aus festen Werten (Länge, Entdeckungsgrad, Stil-Verknüpfung) */
function mixSeg(opts, cur, set) {
  var seg = histEl('div', 'mxSeg');
  opts.forEach(function(o){
    var b = histEl('div', 'mxSegB' + (o[0] === cur ? ' on' : ''), o[1]);
    b.addEventListener('click', function(){
      set(o[0]); mixSave();
      Array.prototype.forEach.call(seg.children, function(x){ x.classList.toggle('on', x === b); });
      mixCount();
    });
    seg.appendChild(b);
  });
  return seg;
}

/* Stil-Chips: die häufigsten Stile unter den Treffern der gewählten Stimmung */
function mixStyles() {
  var box = mixState.styleBox, mb = mixState.matchBox;
  if (!box) return;
  while (box.firstChild) box.removeChild(box.firstChild);
  while (mb.firstChild) mb.removeChild(mb.firstChild);
  var list = mixState.styles || [];
  mixCrit.styles.forEach(function(s){ if (!list.some(function(x){ return x[0] === s; })) list = list.concat([[s, 0]]); });
  if (!list.length) { box.appendChild(histEl('div', 'mxHint', 'Keine Stile bei dieser Auswahl.')); return; }
  list.slice(0, 16).forEach(function(x){
    var on = mixCrit.styles.indexOf(x[0]) >= 0;
    box.appendChild(mixChip((on ? '✓ ' : '') + x[0], on, function(){
      var i = mixCrit.styles.indexOf(x[0]);
      if (i >= 0) mixCrit.styles.splice(i, 1); else mixCrit.styles.push(x[0]);
      mixStyles(); mixCount();
    }, 'mxSmall'));
  });
  if (mixCrit.styles.length > 1) {
    mb.appendChild(mixSeg([['any', 'Mindestens einer'], ['all', 'Alle gewählten']], mixCrit.match, function(v){ mixCrit.match = v; }));
  }
}

/* Trefferzahl live (kurz verzögert, damit der Regler nicht für jeden Schritt fragt) */
function mixCount() {
  mixSave();
  clearTimeout(mixCountTimer);
  var seq = ++mixCountSeq;
  mixCountTimer = setTimeout(function(){
    tagGetJson('/moodmix?count=1&' + mixQuery()).then(function(r){
      if (seq !== mixCountSeq || !mixState.hits) return;
      var styleKey = JSON.stringify(r.styles || []);
      if (styleKey !== mixState.styleKey) { mixState.styleKey = styleKey; mixState.styles = r.styles || []; mixStyles(); }
      var h = mixState.hits;
      h.className = 'mxHits';
      if (!r.rated) {
        h.textContent = 'Noch keine Stimmungs-Tags. Der Tag-Dienst sammelt sie bei Last.fm, solange nichts spielt; den Fortschritt zeigt der Bibliotheks-Check.';
        mixState.go.disabled = true;
        return;
      }
      mixState.go.disabled = false;
      if (!r.count) { h.textContent = 'Keine Titel passen genau. Der Mix nimmt dann Ähnliches (Energie etwas weiter, Stile egal).'; h.className += ' warn'; }
      else if (r.count < Math.min(mixCrit.n, 20)) { h.textContent = 'Nur ' + checkNum(r.count) + ' Titel passen genau; der Mix wird mit Ähnlichem aufgefüllt.'; h.className += ' warn'; }
      else if (r.count < mixCrit.n) h.textContent = checkNum(r.count) + ' Titel passen; der Mix wird entsprechend kürzer.';
      else h.textContent = 'Ca. ' + checkNum(r.count) + ' Titel passen.';
    }).catch(function(){ if (seq === mixCountSeq && mixState.hits) mixState.hits.textContent = 'Tag-Dienst nicht erreichbar.'; });
  }, 200);
}

function mixBuild() {
  if (mixState.go) { mixState.go.disabled = true; mixState.go.textContent = 'Wird erstellt …'; }
  tagGetJson('/moodmix?' + mixQuery()).then(function(r){
    if (!r || !r.ok) throw new Error('kein Ergebnis');
    mixState.result = r;
    mixState.view = 'preview';
    mixRender();
    mixBody.scrollTop = 0;
  }).catch(function(){
    if (mixState.go) { mixState.go.disabled = false; mixState.go.textContent = 'Mix erstellen'; }
    if (mixState.hits) mixState.hits.textContent = 'Der Mix konnte nicht erstellt werden (Tag-Dienst nicht erreichbar).';
  });
}

/* ---------- Vorschau ---------- */

function mixSummary() {
  var parts = mixCrit.moods.map(mixName);
  if (!parts.length) parts.push('Alle Stimmungen');
  parts.push(mixCrit.emin === 1 && mixCrit.emax === 5 ? 'jede Energie' : 'Energie\u00a0' + (mixCrit.emin === mixCrit.emax ? mixCrit.emin : mixCrit.emin + '\u2060–\u2060' + mixCrit.emax));
  return parts.join(' · ');
}

function mixPreview() {
  var r = mixState.result, tracks = r.tracks;
  var head = histEl('div', 'mxHead');
  var info = histEl('div', 'mxSum');
  info.appendChild(histEl('div', 'mxSumT', mixSummary()));
  if (mixCrit.styles.length) info.appendChild(histEl('div', 'mxSumS', mixCrit.styles.join(mixCrit.match === 'all' ? ' + ' : ' · ')));
  var total = tracks.reduce(function(s, x){ return s + (x.d || 0); }, 0);
  info.appendChild(histEl('div', 'mxSumN', tracks.length + ' Titel' + (total ? ' · ' + mixDuration(total) : '')));
  head.appendChild(info);
  var edit = histEl('div', 'mxEdit', 'Ändern');
  edit.addEventListener('click', function(){ mixState.view = 'pick'; mixRender(); });
  head.appendChild(edit);
  mixBody.appendChild(head);

  if (r.level) mixBody.appendChild(histEl('div', 'mxHits warn', r.level === 1
    ? 'Nicht genug genaue Treffer: Energie etwas weiter gefasst.'
    : 'Nicht genug genaue Treffer: Energie weiter gefasst und Stile nicht berücksichtigt.'));
  if (!tracks.length) {
    mixBody.appendChild(histEl('div', 'mxHits', 'Für diese Auswahl gibt es keine Titel. Versuche eine andere Stimmung oder einen weiteren Energie-Bereich.'));
    return;
  }

  var bar = histEl('div', 'mxBar');
  var play = histEl('button', 'mxGo mxPlay', '▶  Mix abspielen');
  play.addEventListener('click', function(){ mixPlay(tracks, true); });
  var reroll = histEl('button', 'mxIcon', '');
  reroll.title = 'Neu mischen';
  reroll.innerHTML = '<svg viewBox="0 0 24 24"><path d="M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>';
  reroll.addEventListener('click', function(){ reroll.classList.add('spin'); mixBuild(); });
  var add = histEl('button', 'mxIcon', '');
  add.title = 'An die Warteschlange anhängen';
  add.innerHTML = '<svg viewBox="0 0 24 24"><path d="M14 10H3v2h11v-2zm0-4H3v2h11V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM3 16h7v-2H3v2z"/></svg>';
  add.addEventListener('click', function(){ mixPlay(tracks, false); });
  bar.appendChild(play); bar.appendChild(reroll); bar.appendChild(add);
  mixBody.appendChild(bar);

  var list = histEl('div', 'mxList');
  tracks.forEach(function(x, i){
    var dir = x.f.replace(/\/[^\/]*$/, '');
    var row = histEl('div', 'sRow mxRow');
    row.appendChild(histEl('div', 'mxNo', String(i + 1)));
    row.appendChild(histImg(histAlbumArt(x.ar, x.al, dir)));
    var meta = histEl('div', 'sMeta');
    meta.appendChild(histEl('div', 'sTitle', x.ti));
    meta.appendChild(histEl('div', 'sSub', x.ar));
    var why = x.mood.map(mixName).concat(x.style.slice(0, 2));
    if (x.src === 'artist') why.push('über Künstler');
    meta.appendChild(histEl('div', 'mxWhy', why.join(' · ')));
    row.appendChild(meta);
    row.appendChild(histEl('div', 'mxDots', mixEnergyDots(x.energy)));
    var del = histEl('div', 'mxDel');
    del.title = 'Aus dem Mix nehmen';
    del.innerHTML = '<svg viewBox="0 0 24 24"><path d="M19 6.4L17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z"/></svg>';
    del.addEventListener('click', function(e){
      e.stopPropagation();
      tracks.splice(tracks.indexOf(x), 1);
      var keep = mixBody.scrollTop;
      mixRender();
      mixBody.scrollTop = keep;
    });
    row.appendChild(del);
    list.appendChild(row);
  });
  mixBody.appendChild(list);
}

/* replace: Warteschlange ersetzen und ab Titel 1 spielen; sonst hinten anhängen */
function mixPlay(tracks, replace) {
  var items = tracks.map(function(x){
    return {uri: 'music-library/' + x.f, service: 'mpd', type: 'song', title: x.ti, artist: x.ar, album: x.al};
  });
  if (!replace) { socket.emit('addToQueue', items); closeAllOverlays(); return; }
  fetch('/api/v1/replaceAndPlay', {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({item: items[0]})
  }).then(function(){
    if (items.length > 1) setTimeout(function(){ socket.emit('addToQueue', items.slice(1)); }, 300);
  }).catch(function(){});
  closeAllOverlays();
}

document.getElementById('closeMix').addEventListener('click', function(){ closeAllOverlays(); });
document.getElementById('mixBack').addEventListener('click', function(){
  if (mixState.view === 'preview') { mixState.view = 'pick'; return mixRender(); }
  closeAllOverlays();
  overlaySearch.classList.add('on');
});
