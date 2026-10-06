/* Bibliotheks-Check: Problemfälle der Sammlung (Tag-Dienst GET/POST /check), je Eintrag ein Stift zum passenden Editor.
   Klassisches Skript, gemeinsamer globaler Gültigkeitsbereich; nach tagedit.js geladen. */
var overlayCheck = document.getElementById('overlayCheck');
var checkBody    = document.getElementById('checkBody');
var btnCheck     = document.getElementById('btnCheck');
var checkTimer   = null;
var checkOpen    = {};          /* aufgeklappte Kategorien bleiben beim Neuzeichnen offen */
var CHECK_PAGE   = 100;         /* so viele Einträge je Kategorie, dann "weitere anzeigen" */

var CHECK_CATS = [
  {key: 'noCover', name: 'Alben ohne Cover', hint: 'Weder Bilddatei im Ordner noch eingebettetes Cover. Stift: Album-Editor mit Cover.'},
  {key: 'albumArtist', name: 'Album-Interpret fehlt oder uneinheitlich', hint: 'Mehrere Interpreten im Ordner, aber nicht überall derselbe Album-Interpret (z. B. Compilations). Stift: Mehrfachbearbeitung.'},
  {key: 'spelling', name: 'Künstler in mehreren Schreibweisen', hint: 'Gleicher Name bis auf Groß-/Kleinschreibung, Akzente, „The“ oder Satzzeichen. Stift: alle Titel dieser Schreibweise.'},
  {key: 'mixed', name: 'Albumname oder Jahr uneinheitlich', hint: 'Titel eines Ordners mit verschiedenen Albumnamen oder Jahren. Stift: Mehrfachbearbeitung.'},
  {key: 'noTrack', name: 'Titel ohne Tracknummer', hint: 'Stift: Album-Editor.'}
];
var CHECK_CHEVRON = '<svg viewBox="0 0 24 24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>';

function checkFmtDate(ms) {
  var d = new Date(ms);
  function two(n) { return (n < 10 ? '0' : '') + n; }
  return d.getDate() + '.' + (d.getMonth() + 1) + '.' + d.getFullYear() + ', ' + two(d.getHours()) + ':' + two(d.getMinutes()) + ' Uhr';
}
function checkNum(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

function openCheck() {
  closeAllOverlays();
  overlayCheck.classList.add('on');
  while (checkBody.firstChild) checkBody.removeChild(checkBody.firstChild);
  checkBody.appendChild(browseNote('Laden…'));
  checkLoad();
}

function checkLoad() {
  clearTimeout(checkTimer);
  tagGetJson('/check').then(function(res){
    if (!overlayCheck.classList.contains('on')) return;
    checkRender(res);
    if (res.running) checkTimer = setTimeout(checkLoad, 2000);
  }).catch(function(){
    while (checkBody.firstChild) checkBody.removeChild(checkBody.firstChild);
    checkBody.appendChild(browseNote('Tag-Dienst nicht erreichbar (Port ' + ((window.APP_CONFIG && window.APP_CONFIG.TAGS_PORT) || 8766) + ')'));
  });
}

function checkStart() {
  tagPost('/check', {}).then(checkLoad).catch(checkLoad);
}

function checkRender(res) {
  var keepScroll = checkBody.scrollTop;
  while (checkBody.firstChild) checkBody.removeChild(checkBody.firstChild);
  var r = res.result, run = res.running;

  var head = document.createElement('div'); head.className = 'ckHead';
  var info = document.createElement('div'); info.className = 'ckInfo';
  if (run) {
    info.textContent = run.phase === 'mpd'
      ? 'Prüfe… Ordner ' + checkNum(run.done) + (run.total ? ' von ' + checkNum(run.total) : '')
      : 'Prüfe eingebettete Cover… ' + checkNum(run.done) + ' von ' + checkNum(run.total);
  } else if (r) {
    info.textContent = 'Geprüft am ' + checkFmtDate(r.at) + ': ' + checkNum(r.songs) + ' Titel in ' + checkNum(r.albums) + ' Ordnern';
  } else {
    info.textContent = 'Noch nicht geprüft. Die Prüfung liest die Datenbank und schaut in die Ordner; an den Dateien ändert sie nichts. Sie dauert einige Minuten.';
  }
  if (res.error) info.textContent += ' · Fehler: ' + res.error;
  var btn = document.createElement('button'); btn.className = 'ckBtn';
  btn.textContent = run ? 'Läuft…' : (r ? 'Neu prüfen' : 'Prüfen');
  btn.disabled = !!run;
  btn.addEventListener('click', function(){ btn.disabled = true; btn.textContent = 'Läuft…'; checkStart(); });
  head.appendChild(info); head.appendChild(btn);
  checkBody.appendChild(head);
  if (!r) return;

  CHECK_CATS.forEach(function(cat){
    var list = r[cat.key] || [];
    var row = document.createElement('div'); row.className = 'ckCat' + (checkOpen[cat.key] ? ' open' : '');
    row.innerHTML = '<div class="ckName"></div><div class="ckNum"></div>' + CHECK_CHEVRON;
    row.querySelector('.ckName').textContent = cat.name;
    var num = row.querySelector('.ckNum');
    num.textContent = checkNum(list.length);
    if (!list.length) num.className += ' zero';
    var box = document.createElement('div'); box.className = 'ckList';
    row.addEventListener('click', function(){
      checkOpen[cat.key] = !checkOpen[cat.key];
      row.classList.toggle('open', checkOpen[cat.key]);
      if (checkOpen[cat.key] && !box.firstChild) checkFill(box, cat, list);
    });
    checkBody.appendChild(row); checkBody.appendChild(box);
    if (checkOpen[cat.key]) checkFill(box, cat, list);
  });
  checkBody.scrollTop = keepScroll;
}

function checkFill(box, cat, list) {
  var hint = document.createElement('div'); hint.className = 'ckCatHint'; hint.textContent = list.length ? cat.hint : 'Nichts gefunden.';
  box.appendChild(hint);
  var shown = 0;
  function more() {
    var end = Math.min(list.length, shown + CHECK_PAGE);
    for (; shown < end; shown++) {
      if (cat.key === 'spelling') list[shown].variants.forEach(function(v, i){ box.insertBefore(checkSpellingRow(v, i, list[shown]), moreRow); });
      else box.insertBefore(checkAlbumRow(cat.key, list[shown]), moreRow);
    }
    moreRow.style.display = shown < list.length ? '' : 'none';
    moreRow.textContent = 'Weitere ' + Math.min(CHECK_PAGE, list.length - shown) + ' anzeigen (' + checkNum(list.length - shown) + ' übrig)';
  }
  var moreRow = document.createElement('div'); moreRow.className = 'ckMore';
  moreRow.addEventListener('click', more);
  box.appendChild(moreRow);
  more();
}

function checkRow(title, sub, onEdit) {
  var row = document.createElement('div'); row.className = 'sRow';
  var meta = document.createElement('div'); meta.className = 'sMeta';
  var ti = document.createElement('div'); ti.className = 'sTitle'; ti.textContent = title;
  var su = document.createElement('div'); su.className = 'sSub'; su.textContent = sub;
  meta.appendChild(ti); meta.appendChild(su);
  row.appendChild(meta);
  row.appendChild(tagPenButton('tagEditMini', 'Bearbeiten', function(){ row.classList.add('done'); onEdit(); }));
  return row;
}

function checkAlbumRow(key, it) {
  var heading = it.name + (it.artist ? ' · ' + it.artist : '');
  var sub = it.dir;
  if (key === 'albumArtist') sub = (it.missing ? 'Album-Interpret fehlt' : 'Album-Interpret: ' + it.albumartists.join(' / ')) + ' · ' + it.artists.join(', ') + (it.artists.length > 5 ? ' …' : '');
  else if (key === 'mixed') sub = [it.albums.length > 1 ? it.albums.join(' / ') : '', it.years.length > 1 ? it.years.join(' / ') : ''].filter(Boolean).join(' · ') || it.dir;
  else if (key === 'noTrack') sub = it.missing + ' von ' + it.count + ' Titeln ohne Nummer · ' + it.dir;
  return checkRow(heading, sub, function(){
    if (key === 'albumArtist' || key === 'mixed') openBulkEditor(it.files.map(function(f){ return f.uri; }), it.name);
    else openTagEditor(it.files, it.name);
  });
}

function checkSpellingRow(v, i, group) {
  var others = group.variants.filter(function(o){ return o !== v; }).map(function(o){ return o.name; }).join(', ');
  return checkRow(v.name, v.count + ' Titel · auch: ' + others, function(){ openArtistEditor(v.name); });
}

btnCheck.addEventListener('click', openCheck);
document.getElementById('closeCheck').addEventListener('click', function(){ clearTimeout(checkTimer); closeAllOverlays(); });
document.getElementById('checkBack').addEventListener('click', function(){
  clearTimeout(checkTimer);
  closeAllOverlays();
  overlaySearch.classList.add('on');
});

/* Knopf in der Suche nur zeigen, wenn der Tag-Dienst läuft */
tagGetJson('/health').then(function(r){ if (r && r.ok) btnCheck.style.display = ''; }).catch(function(){});
