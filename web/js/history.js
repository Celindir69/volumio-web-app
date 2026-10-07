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
  else if (tab === 'year') histYear(seq);
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

/* ---------- Bilder (Volumios /albumart mit Zwischenspeicher; lokal aus dem Ordner, sonst einmal online) ---------- */

/* uri bzw. Ordner relativ zu /mnt ("USB/…"); '' bei TIDAL und Co. */
function histRel(u) {
  if (!u || /^[a-z]+:\/\//.test(u)) return '';
  return u.replace(/^\/+/, '').replace(/^music-library\//, '').replace(/^mnt\//, '');
}
function histAlbumArt(artist, album, dir) {
  var web = artist && album && artist !== 'Verschiedene' ? 'web=' + encodeURIComponent(artist) + '/' + encodeURIComponent(album) + '/extralarge' : '';
  var path = dir ? 'path=' + encodeURIComponent('/mnt/' + dir) : '';
  return web || path ? '/albumart?' + [web, path].filter(Boolean).join('&') : '';
}
/* Künstlerfoto vom Tag-Dienst (Deezer); gibt es keins, Volumios Künstler-Symbol */
function histArtistArt(artist) { return TAGS + '/artistimage?name=' + encodeURIComponent(artist); }
function histArtistFallback(img, artist) {
  img.addEventListener('error', function once(){
    img.removeEventListener('error', once);
    img.src = artUrl('/albumart?web=' + encodeURIComponent(artist) + '/large&icon=users');
  });
}
function histImg(src, round) {
  var img = histEl('img', 'sCover' + (round ? ' hRound' : ''));
  img.loading = 'lazy';
  img.decoding = 'async';
  if (src) img.src = artUrl(src);
  return img;
}
function histTrackArt(e) {
  var rel = histRel(e.u);
  return histAlbumArt(e.ar, e.al, rel ? rel.replace(/\/[^\/]*$/, '') : '');
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

function histRow(title, sub, right, onClick, img) {
  var row = histEl('div', 'sRow hRow');
  if (img) row.appendChild(img);
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
                                     function(){ histPlay(e); }, histImg(histTrackArt(e))));
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

/* eine Zeile mit Rang, Bild und Anzahl; kind track|album|artist */
function histTopRow(kind, it, i) {
  var title = kind === 'artist' ? it.ar : it.ti;
  var sub = kind === 'artist' ? '' : (kind === 'track' && it.al ? it.ar + ' · ' + it.al : it.ar);
  var art = kind === 'artist' ? histArtistArt(it.ar)
          : kind === 'album' ? histAlbumArt(it.ar, it.ti, it.u || '')
          : histTrackArt(it);
  var row = histRow(title, sub, it.n + '×', function(){
    if (kind === 'track') return histPlay({ti: it.ti, ar: it.ar, al: it.al, u: it.u});
    if (kind === 'artist') return openBrowse({kind: 'artist', artist: it.ar});
    openBrowse({kind: 'album', artist: it.ar === 'Verschiedene' ? '' : it.ar, album: it.ti, uri: it.u ? 'music-library/' + it.u : undefined,
                albumart: art});
  }, histImg(art, kind === 'artist'));
  if (kind === 'artist') histArtistFallback(row.querySelector('img'), it.ar);
  row.insertBefore(histEl('div', 'hRank', String(i + 1)), row.firstChild);
  return row;
}

function histTop(seq) {
  tagGetJson('/plays?view=top&limit=100&kind=' + histKind + '&range=' + histRange).then(function(r){
    if (seq !== histSeq) return;
    histClear();
    histBody.appendChild(histChips(HIST_KINDS, histKind, function(k){ histKind = k; histShow('top'); }));
    histBody.appendChild(histChips(HIST_RANGES, histRange, function(k){ histRange = k; histShow('top'); }));
    var items = (r && r.items) || [];
    if (!items.length) { histBody.appendChild(browseNote('In diesem Zeitraum nichts gespielt.')); return; }
    items.forEach(function(it, i){ histBody.appendChild(histTopRow(histKind, it, i)); });
  }).catch(function(){ histFail(seq); });
}

/* ---------- Statistik ---------- */

function histNum(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

/* Balken: Tippen (oder Mauszeiger) zeigt den Wert in der Überschrift; details[i] ist die ausführliche Beschriftung */
function histBars(title, values, labels, every, details) {
  var box = histEl('div', 'hChart');
  var head = browseHeading(title);
  var info = histEl('span', 'hPick');
  head.appendChild(info);
  box.appendChild(head);
  var max = Math.max.apply(null, values.concat([1]));
  var bars = histEl('div', 'hBars'), lab = histEl('div', 'hLabels'), picked = null;
  function pick(b, i) {
    if (picked) picked.classList.remove('on');
    if (picked === b) { picked = null; info.textContent = ''; return; }
    picked = b; b.classList.add('on');
    info.textContent = (details || labels)[i] + ': ' + histNum(values[i]);
  }
  values.forEach(function(v, i){
    var b = histEl('div', 'hBar');
    var fill = histEl('div', 'hFill');
    fill.style.height = Math.round(v / max * 100) + '%';
    b.appendChild(fill);
    b.addEventListener('click', function(){ pick(b, i); });
    b.addEventListener('pointerenter', function(e){ if (e.pointerType === 'mouse' && picked !== b) pick(b, i); });   /* Touch: nur Tippen */
    bars.appendChild(b);
    lab.appendChild(histEl('div', 'hLabel', i % every === 0 ? labels[i] : ''));
  });
  bars.addEventListener('pointerleave', function(e){ if (e.pointerType === 'mouse' && picked) pick(picked, 0); });
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
      [[histNum(s.plays), 'Wiedergaben'], [histNum(hours) + ' h', s.estimated ? 'Hörzeit ca.' : 'Hörzeit'],
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
        var details = s.buckets.map(function(b){
          var p = b.k.split('-');
          if (s.unit === 'day') {
            var d = new Date(+p[0], +p[1] - 1, +p[2]);
            return HIST_DAYS[(d.getDay() + 6) % 7] + ', ' + d.getDate() + '.' + (d.getMonth() + 1) + '.';
          }
          return s.unit === 'month' ? HIST_MONTHS[+p[1] - 1] + ' ' + p[0] : p[0];
        });
        histBody.appendChild(histBars(s.unit === 'day' ? 'WIEDERGABEN PRO TAG' : s.unit === 'month' ? 'WIEDERGABEN PRO MONAT' : 'WIEDERGABEN PRO JAHR',
          s.buckets.map(function(b){ return b.n; }), labels, every, details));
        histBody.appendChild(histBars('TAGESZEIT', s.hours, s.hours.map(function(v, i){ return String(i); }), 6,
          s.hours.map(function(v, i){ return i + '–' + (i + 1) + ' Uhr'; })));
        histBody.appendChild(histBars('WOCHENTAG', s.weekdays, HIST_DAYS, 1,
          ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']));
      }
      if (s.first) histBody.appendChild(browseNote('Verlauf seit ' + histDay(s.first).replace(/^(Heute|Gestern)$/, function(x){ return x.toLowerCase(); })));
    }
    histBody.appendChild(histLastfm(rs[1] && rs[1].lastfm, seq));
  }).catch(function(){ histFail(seq); });
}

/* ---------- Jahresrückblick ---------- */

var histYearSel = 0;            /* 0: neuestes Jahr */
var HIST_MONTHS_FULL = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

/* Veränderung zum Vorjahr in Prozent, '' ohne Vorjahr */
function histDelta(now, before) {
  if (!before) return '';
  var p = Math.round((now - before) / before * 100);
  return (p > 0 ? '+' : p < 0 ? '−' : '±') + Math.abs(p) + ' %';
}

function histYear(seq) {
  tagGetJson('/plays?view=year' + (histYearSel ? '&y=' + histYearSel : '') + histTz()).then(function(r){
    if (seq !== histSeq) return;
    histClear();
    var y = r && r.review, years = (r && r.years) || [];
    if (!y || !years.length) { histBody.appendChild(browseNote('Noch kein Verlauf. Der Rückblick füllt sich mit jeder Wiedergabe.')); return; }
    if (years.length > 1) histBody.appendChild(histChips(years.map(function(v){ return [v, String(v)]; }), y.year, function(v){ histYearSel = v; histShow('year'); }));
    if (!y.plays) { histBody.appendChild(browseNote(y.year + ' wurde nichts gespielt.')); return; }
    var hp = Math.round(y.prev.seconds / 3600), hours = Math.round(y.seconds / 3600);
    var grid = histEl('div', 'hNums');
    [[histNum(y.plays), 'Wiedergaben', histDelta(y.plays, y.prev.plays)],
     [histNum(hours) + ' h', y.estimated ? 'Hörzeit ca.' : 'Hörzeit', histDelta(hours, hp)],
     [histNum(y.tracks), 'Titel', histDelta(y.tracks, y.prev.tracks)],
     [histNum(y.artists), 'Künstler', histDelta(y.artists, y.prev.artists)],
     [histNum(y.albums), 'Alben', histDelta(y.albums, y.prev.albums)]].forEach(function(n){
      var c = histEl('div', 'hNum');
      c.appendChild(histEl('div', 'hBig', n[0]));
      c.appendChild(histEl('div', 'hSmall', n[1]));
      if (n[2]) c.appendChild(histEl('div', 'hDelta', n[2] + ' zu ' + (y.year - 1)));
      grid.appendChild(c);
    });
    histBody.appendChild(grid);
    if (y.partial && y.prev.plays) {
      var td = new Date();
      histBody.appendChild(browseNote('Vergleich mit ' + (y.year - 1) + ' bis zum ' + td.getDate() + '. ' + HIST_MONTHS_FULL[td.getMonth()]));
    }
    var best = y.months.indexOf(Math.max.apply(null, y.months));
    var full = HIST_MONTHS_FULL;
    histBody.appendChild(histBars('WIEDERGABEN PRO MONAT', y.months, HIST_MONTHS.map(function(m){ return m.charAt(0); }), 1,
      full.map(function(m){ return m + ' ' + y.year; })));
    histBody.appendChild(browseNote('Stärkster Monat: ' + full[best] + ' mit ' + histNum(y.months[best]) + ' Wiedergaben'));
    function list(head, kind, items) {
      if (!items.length) return;
      histBody.appendChild(browseHeading(head));
      items.forEach(function(it, i){ histBody.appendChild(histTopRow(kind, it, i)); });
    }
    list('MEISTGESPIELTE TITEL', 'track', y.tracks_top);
    list('TOP-ALBEN', 'album', y.albums_top);
    list('TOP-KÜNSTLER', 'artist', y.artists_top);
    if (y.hasBefore) {
      list('NEU ENTDECKT', 'artist', y.newArtists);
      if (!y.newArtists.length) { histBody.appendChild(browseHeading('NEU ENTDECKT')); histBody.appendChild(browseNote('Keine neuen Künstler in diesem Jahr.')); }
    }
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
tagGetJson('/health').then(function(r){ if (r && r.ok) { btnHistory.style.display = ''; histAlignSearchHead(); } }).catch(function(){});

/* Suche: Symbole Bibliotheks-Check und Verlauf enden bündig mit dem Eingabefeld, das X steht über "Los" */
function histAlignSearchHead() {
  var x = document.getElementById('closeSearch'), field = document.getElementById('searchField');
  var icon = btnHistory.querySelector('svg');
  if (!x || !field || btnHistory.style.display === 'none') return;
  var cur = parseFloat(x.style.marginLeft) || 0;
  var m = cur + icon.getBoundingClientRect().right - field.getBoundingClientRect().right;
  if (field.getBoundingClientRect().width > 0) x.style.marginLeft = Math.max(0, Math.round(m)) + 'px';
}
window.addEventListener('resize', histAlignSearchHead);
if (window.MutationObserver) new MutationObserver(function(){ if (overlaySearch.classList.contains('on')) histAlignSearchHead(); })
  .observe(overlaySearch, {attributes: true, attributeFilter: ['class']});
