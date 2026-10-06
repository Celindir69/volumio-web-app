/* Verlauf und Statistik: zuletzt gespielt, meistgespielt, Statistik und Last.fm (Tag-Dienst GET /plays, /lastfm).
   Klassisches Skript, gemeinsamer globaler Gültigkeitsbereich; nach tagedit.js und browse.js geladen. */
var overlayHistory = document.getElementById('overlayHistory');
var histBody       = document.getElementById('histBody');
var btnHistory     = document.getElementById('btnHistory');
var histTab        = 'recent';
var histKind       = 'track';
var histRange      = 'd30';
var histSeq        = 0;          /* verwirft Antworten veralteter Anfragen */
var histTimer      = null;
var HIST_DAYS      = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
var HIST_MONTHS    = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
var HIST_RANGES    = [['d30', '30 Tage'], ['m12', '12 Monate'], ['all', 'Gesamt']];
var HIST_KINDS     = [['track', 'Titel'], ['album', 'Alben'], ['artist', 'Künstler']];

function histClear() { while (histBody.firstChild) histBody.removeChild(histBody.firstChild); }
function histEl(tag, cls, text) {
  var el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
}
function histTwo(n) { return (n < 10 ? '0' : '') + n; }
function histDay(t) {
  var d = new Date(t * 1000), today = new Date();
  today.setHours(0, 0, 0, 0);
  var diff = Math.round((today.getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000);
  if (diff === 0) return 'Heute';
  if (diff === 1) return 'Gestern';
  return HIST_DAYS[(d.getDay() + 6) % 7] + ', ' + d.getDate() + '.' + (d.getMonth() + 1) + '.' + d.getFullYear();
}
function histTz() {
  var y = new Date().getFullYear();
  return '&tzw=' + (-new Date(y, 0, 1).getTimezoneOffset()) + '&tzs=' + (-new Date(y, 6, 1).getTimezoneOffset());
}

function openHistory() {
  closeAllOverlays();
  overlayHistory.classList.add('on');
  histShow(histTab);
}

function histShow(tab) {
  histTab = tab;
  clearTimeout(histTimer);
  document.querySelectorAll('#histTabBar .qTab').forEach(function(t){ t.className = 'qTab' + (t.dataset.tab === tab ? ' on' : ''); });
  histBody.scrollTop = 0;
  histClear();
  histBody.appendChild(browseNote('Laden…'));
  var seq = ++histSeq;
  if (tab === 'recent') histRecent(seq);
  else if (tab === 'top') histTop(seq);
  else histStats(seq);
}

function histFail(seq) {
  if (seq !== histSeq) return;
  histClear();
  histBody.appendChild(browseNote('Tag-Dienst nicht erreichbar (Port ' + ((window.APP_CONFIG && window.APP_CONFIG.TAGS_PORT) || 8766) + ')'));
}

/* Auswahl-Knöpfe (Zeitraum, Art) */
function histChips(list, cur, onPick) {
  var row = histEl('div', 'hChips');
  list.forEach(function(it){
    var b = histEl('button', 'hChip' + (it[0] === cur ? ' on' : ''), it[1]);
    b.addEventListener('click', function(){ onPick(it[0]); });
    row.appendChild(b);
  });
  return row;
}

/* ---------- Abspielen und Öffnen ---------- */

function histPlayUri(uri, service, e) {
  fetch('/api/v1/replaceAndPlay', {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({item: {uri: uri, service: service, type: 'song', title: e.ti, artist: e.ar, album: e.al || ''}})
  }).catch(function(){});
  closeAllOverlays();
}

function histPlay(e) {
  if (e.u) return histPlayUri(e.u, e.s && e.s !== 'lastfm' ? e.s : 'mpd', e);
  tagGetJson('/plays/resolve?artist=' + encodeURIComponent(e.ar) + '&title=' + encodeURIComponent(e.ti)).then(function(r){
    if (r && r.file) histPlayUri('music-library/' + r.file, 'mpd', e);
    else showToast('„' + e.ti + '“ ist nicht in der Bibliothek');
  }).catch(function(){ showToast('Tag-Dienst nicht erreichbar'); });
}

function histRow(title, sub, right, onClick) {
  var row = histEl('div', 'sRow hRow');
  var meta = histEl('div', 'sMeta');
  meta.appendChild(histEl('div', 'sTitle', title));
  if (sub) meta.appendChild(histEl('div', 'sSub', sub));
  row.appendChild(meta);
  if (right) row.appendChild(histEl('div', 'hRight', right));
  row.addEventListener('click', onClick);
  return row;
}

/* ---------- Zuletzt gespielt ---------- */

function histRecent(seq) {
  var lastDay = '', before = 0;
  function more(btn) {
    tagGetJson('/plays?view=recent&limit=100' + (before ? '&before=' + before : '')).then(function(r){
      if (seq !== histSeq) return;
      if (!btn) histClear();
      else btn.parentNode.removeChild(btn);
      var items = (r && r.items) || [];
      if (!before && !items.length) {
        histBody.appendChild(browseNote(r && r.recording === false
          ? 'Der Verlauf ist ausgeschaltet (HISTORY: false in config.local.js).'
          : 'Noch nichts gespielt. Ein Titel zählt, sobald er zur Hälfte oder 4 Minuten lief.'));
        return;
      }
      items.forEach(function(e){
        var day = histDay(e.t);
        if (day !== lastDay) { histBody.appendChild(browseHeading(day)); lastDay = day; }
        var d = new Date(e.t * 1000);
        histBody.appendChild(histRow(e.ti, e.ar + (e.al ? ' · ' + e.al : ''), histTwo(d.getHours()) + ':' + histTwo(d.getMinutes()),
                                     function(){ histPlay(e); }));
        before = e.t;
      });
      if (items.length >= 100) {
        var b = histEl('div', 'ckMore', 'Ältere anzeigen');
        b.addEventListener('click', function(){ b.textContent = 'Laden…'; more(b); });
        histBody.appendChild(b);
      }
    }).catch(function(){ histFail(seq); });
  }
  more(null);
}

/* ---------- Meistgespielt ---------- */

function histTop(seq) {
  tagGetJson('/plays?view=top&limit=100&kind=' + histKind + '&range=' + histRange).then(function(r){
    if (seq !== histSeq) return;
    histClear();
    histBody.appendChild(histChips(HIST_KINDS, histKind, function(k){ histKind = k; histShow('top'); }));
    histBody.appendChild(histChips(HIST_RANGES, histRange, function(k){ histRange = k; histShow('top'); }));
    var items = (r && r.items) || [];
    if (!items.length) { histBody.appendChild(browseNote('In diesem Zeitraum nichts gespielt.')); return; }
    items.forEach(function(it, i){
      var title = histKind === 'artist' ? it.ar : it.ti;
      var sub = histKind === 'artist' ? '' : (histKind === 'track' && it.al ? it.ar + ' · ' + it.al : it.ar);
      var row = histRow(title, sub, it.n + '×', function(){
        if (histKind === 'track') return histPlay({ti: it.ti, ar: it.ar, al: it.al, u: it.u});
        if (histKind === 'artist') return openBrowse({kind: 'artist', artist: it.ar});
        openBrowse({kind: 'album', artist: it.ar === 'Verschiedene' ? '' : it.ar, album: it.ti, uri: it.u ? 'music-library/' + it.u : undefined});
      });
      row.insertBefore(histEl('div', 'hRank', String(i + 1)), row.firstChild);
      histBody.appendChild(row);
    });
  }).catch(function(){ histFail(seq); });
}

/* ---------- Statistik ---------- */

function histNum(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

function histBars(title, values, labels, every) {
  var box = histEl('div', 'hChart');
  box.appendChild(browseHeading(title));
  var max = Math.max.apply(null, values.concat([1]));
  var bars = histEl('div', 'hBars'), lab = histEl('div', 'hLabels');
  values.forEach(function(v, i){
    var b = histEl('div', 'hBar');
    var fill = histEl('div', 'hFill');
    fill.style.height = Math.round(v / max * 100) + '%';
    b.title = labels[i] + ': ' + v;
    b.appendChild(fill);
    bars.appendChild(b);
    lab.appendChild(histEl('div', 'hLabel', i % every === 0 ? labels[i] : ''));
  });
  box.appendChild(bars); box.appendChild(lab);
  return box;
}

function histStats(seq) {
  Promise.all([
    tagGetJson('/plays?view=stats&range=' + histRange + histTz()),
    tagGetJson('/lastfm').catch(function(){ return null; })
  ]).then(function(rs){
    if (seq !== histSeq) return;
    histClear();
    var s = rs[0] && rs[0].stats;
    histBody.appendChild(histChips(HIST_RANGES, histRange, function(k){ histRange = k; histShow('stats'); }));
    if (s) {
      var hours = Math.round(s.seconds / 3600);
      var grid = histEl('div', 'hNums');
      [[histNum(s.plays), 'Wiedergaben'], [(s.estimated ? 'ca. ' : '') + histNum(hours) + ' h', 'Hörzeit'],
       [histNum(s.tracks), 'Titel'], [histNum(s.artists), 'Künstler'], [histNum(s.albums), 'Alben']].forEach(function(n){
        var c = histEl('div', 'hNum');
        c.appendChild(histEl('div', 'hBig', n[0]));
        c.appendChild(histEl('div', 'hSmall', n[1]));
        grid.appendChild(c);
      });
      histBody.appendChild(grid);
      if (s.plays) {
        var labels = s.buckets.map(function(b){
          var p = b.k.split('-');
          return s.unit === 'day' ? String(parseInt(p[2], 10)) : s.unit === 'month' ? HIST_MONTHS[parseInt(p[1], 10) - 1] : p[0];
        });
        var every = s.unit === 'day' ? 5 : s.unit === 'month' ? 2 : Math.max(1, Math.ceil(labels.length / 8));
        histBody.appendChild(histBars(s.unit === 'day' ? 'WIEDERGABEN PRO TAG' : s.unit === 'month' ? 'WIEDERGABEN PRO MONAT' : 'WIEDERGABEN PRO JAHR',
          s.buckets.map(function(b){ return b.n; }), labels, every));
        histBody.appendChild(histBars('TAGESZEIT', s.hours, s.hours.map(function(v, i){ return String(i); }), 6));
        histBody.appendChild(histBars('WOCHENTAG', s.weekdays, HIST_DAYS, 1));
      }
      if (s.first) histBody.appendChild(browseNote('Verlauf seit ' + histDay(s.first).replace(/^(Heute|Gestern)$/, function(x){ return x.toLowerCase(); })));
    }
    histBody.appendChild(histLastfm(rs[1] && rs[1].lastfm, seq));
  }).catch(function(){ histFail(seq); });
}

/* ---------- Last.fm ---------- */

function histLastfmBtn(text, fn) {
  var b = histEl('button', 'ckBtn', text);
  b.addEventListener('click', function(){ b.disabled = true; fn(b); });
  return b;
}

function histLastfmAction(action) {
  return tagPost('/lastfm', {action: action}).then(function(r){
    if (r && !r.ok) showToast(r.error || 'Last.fm: Fehler');
    return r;
  }).catch(function(){ showToast('Tag-Dienst nicht erreichbar'); });
}

function histLastfm(st, seq) {
  var box = histEl('div', 'hLastfm');
  box.appendChild(browseHeading('LAST.FM'));
  var info = histEl('div', 'ckInfo'), btns = histEl('div', 'hBtns');
  box.appendChild(info); box.appendChild(btns);
  if (!st) { info.textContent = 'Tag-Dienst nicht erreichbar.'; return box; }
  if (!st.configured) {
    info.textContent = st.hasKey
      ? 'Zum Scrobbeln fehlt LASTFM_SECRET in config.local.js (das „Shared secret“ deines Last.fm-API-Kontos).'
      : 'Zum Scrobbeln LASTFM_KEY und LASTFM_SECRET in config.local.js eintragen.';
    return box;
  }
  if (!st.connected) {
    info.textContent = st.user ? 'Die Verbindung zu Last.fm ist abgelaufen. Bitte neu verbinden.' : 'Nicht verbunden. Nach dem Verbinden werden neue Wiedergaben gescrobbelt und dein bisheriger Last.fm-Verlauf eingelesen.';
    btns.appendChild(histLastfmBtn('Mit Last.fm verbinden', function(b){
      var win = window.open('about:blank', '_blank');          /* gleich öffnen, sonst blockiert der Browser das Fenster */
      histLastfmAction('connect').then(function(r){
        b.disabled = false;
        if (!r || !r.ok) { if (win) win.close(); return; }
        if (win) win.location.href = r.url; else location.href = r.url;
        info.textContent = 'Bei Last.fm „Zulassen“ tippen, dann hierher zurückkommen und „Fertig“ tippen.';
        while (btns.firstChild) btns.removeChild(btns.firstChild);
        btns.appendChild(histLastfmBtn('Fertig', function(b2){
          histLastfmAction('finish').then(function(r2){ b2.disabled = false; if (r2 && r2.ok) histShow('stats'); });
        }));
      });
    }));
    return box;
  }
  var lines = ['Verbunden als ' + st.user + '. Neue Wiedergaben werden gescrobbelt.'];
  if (st.queue) lines.push(st.queue + ' Wiedergabe' + (st.queue > 1 ? 'n warten' : ' wartet') + ' auf das Senden' + (st.sendError ? ' (' + st.sendError + ')' : '') + '.');
  if (st.importing) lines.push('Lese Last.fm-Verlauf… Seite ' + st.importing.page + ' von ' + (st.importing.pages || '?') + ', ' + histNum(st.importing.added) + ' neu.');
  else if (st.importError) lines.push('Einlesen fehlgeschlagen: ' + st.importError);
  else if (st.lastImport) lines.push('Zuletzt abgeglichen ' + histDay(st.lastImport.at).replace(/^(Heute|Gestern)$/, function(x){ return x.toLowerCase(); }) + ': ' + histNum(st.lastImport.added) + ' neu.');
  info.textContent = lines.join(' ');
  if (!st.importing) btns.appendChild(histLastfmBtn(st.lastImport ? 'Mit Last.fm abgleichen' : 'Last.fm-Verlauf einlesen', function(){
    histLastfmAction('import').then(function(){ histShow('stats'); });
  }));
  if (st.queue && !st.importing) btns.appendChild(histLastfmBtn('Jetzt senden', function(){
    histLastfmAction('send').then(function(){ setTimeout(function(){ histShow('stats'); }, 1500); });
  }));
  btns.appendChild(histLastfmBtn('Trennen', function(){ histLastfmAction('disconnect').then(function(){ histShow('stats'); }); }));
  if (st.importing) histTimer = setTimeout(function(){ if (seq === histSeq && overlayHistory.classList.contains('on')) histShow('stats'); }, 3000);
  return box;
}

document.querySelectorAll('#histTabBar .qTab').forEach(function(t){
  t.addEventListener('click', function(){ histShow(t.dataset.tab); });
});
btnHistory.addEventListener('click', openHistory);
document.getElementById('closeHistory').addEventListener('click', function(){ clearTimeout(histTimer); closeAllOverlays(); });
document.getElementById('historyBack').addEventListener('click', function(){
  clearTimeout(histTimer);
  closeAllOverlays();
  overlaySearch.classList.add('on');
});

/* Knopf in der Suche nur zeigen, wenn der Tag-Dienst läuft */
tagGetJson('/health').then(function(r){ if (r && r.ok) btnHistory.style.display = ''; }).catch(function(){});
