/* Tag-Editor: Tags lokaler Dateien (m4a, flac, mp3, dsf) bearbeiten, über den Tag-Dienst auf dem Player (tags/tag-service.js).
   Klassisches Skript, gemeinsamer globaler Gültigkeitsbereich; Reihenfolge siehe app.html. */
var TAGS = 'http://' + location.hostname + ':' + ((window.APP_CONFIG && window.APP_CONFIG.TAGS_PORT) || 8766);
var TAG_LOCAL_RE = /^(music-library\/|\/?mnt\/)?(USB|INTERNAL|NAS)\//;
var TAG_COMMON = [['artist', 'Interpret'], ['albumartist', 'Album-Interpret'], ['album', 'Album'],
                  ['genre', 'Genre'], ['date', 'Jahr'], ['composer', 'Komponist'], ['disc', 'CD']];

var overlayTags = document.getElementById('overlayTags');
var tagBody     = document.getElementById('tagBody');
var tagSave     = document.getElementById('tagSave');
var tagUndo     = document.getElementById('tagUndo');
var tagStatus   = document.getElementById('tagStatus');
var tagFiles    = [];     /* [{uri, ok, error, tags, titleIn, trackIn}] */
var tagCommon   = {};     /* Feldname -> {input, mixed} */
var tagBatch    = null;
var tagMode     = 'album';  /* 'album': Editor für ausgewählte Dateien; 'artist': Mehrfachbearbeitung je Künstler */

/* nur lokale Dateien auf dem Player lassen sich bearbeiten (nicht TIDAL, Radio) */
function isLocalTrack(t) {
  return !!t && (t.service || 'mpd') === 'mpd' && TAG_LOCAL_RE.test(t.uri || '');
}

var TAG_PEN_SVG = '<svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';

/* Stift-Knopf. Tippen ruft onClick auf und löst nichts in der umgebenden Zeile aus
   (kein Abspielen, kein Wischen in der Queue). */
function tagPenButton(cls, title, onClick) {
  var b = document.createElement('div');
  b.className = cls || 'tagEditMini';
  b.title = title;
  b.innerHTML = TAG_PEN_SVG;
  ['touchstart', 'touchend', 'pointerdown'].forEach(function(ev){
    b.addEventListener(ev, function(e){ e.stopPropagation(); }, {passive:true});
  });
  b.addEventListener('click', function(e){ e.stopPropagation(); onClick(); });
  return b;
}

/* Stift für bestimmte Dateien; files: [{uri, title}] oder eine Funktion, die sie liefert */
function tagEditButton(files, heading, cls) {
  return tagPenButton(cls, 'Tags bearbeiten', function(){
    openTagEditor(typeof files === 'function' ? files() : files, heading);
  });
}

/* Stift in der Künstleransicht: alle Titel des Künstlers gemeinsam bearbeiten */
function tagArtistButton(name) {
  return tagPenButton('browseEditBtn', 'Alle Titel des Künstlers bearbeiten', function(){ openArtistEditor(name); });
}

/* Stift für einen einzelnen Titel, nur bei lokalen Dateien; sonst null */
function tagTrackButton(t) {
  if (!isLocalTrack(t)) return null;
  var title = t.title || t.name || '';
  return tagEditButton([{uri:t.uri, title:title}], title);
}

/* Stift im Player neben der Qualitätsanzeige: nur, wenn gerade eine lokale Datei läuft */
var mEdit = null, mEditUri = '';
function tagPaintPlayer(st) {
  if (!mEdit) {
    var row = document.getElementById('mTechRow');
    if (!row) return;
    mEdit = tagEditButton(function(){ return [{uri:mEditUri, title:mTitle.textContent}]; }, null, 'tagEditMini');
    mEdit.id = 'mEdit';
    row.appendChild(mEdit);
  }
  var local = !!st && st.trackType !== 'webradio' && isLocalTrack(st);
  mEditUri = local ? st.uri : '';
  mEdit.style.display = local ? '' : 'none';
}

function tagPost(route, body) {
  return fetch(TAGS + route, {method: 'POST', headers: {'Content-Type': 'text/plain;charset=UTF-8'}, body: JSON.stringify(body)})
    .then(function(r){ return r.json(); });
}

function tagField(label, input, extra) {
  var l = document.createElement('label');
  l.className = 'tagField';
  var s = document.createElement('span');
  s.textContent = label;
  l.appendChild(s);
  if (extra) {                                     /* z. B. "Aa"-Menü rechts neben dem Eingabefeld */
    var line = document.createElement('div');
    line.className = 'tagLine';
    line.appendChild(input); line.appendChild(extra);
    l.appendChild(line);
  } else l.appendChild(input);
  return l;
}

/* "Aa"-Menü mit den Textfunktionen (textfn.js); onPick(fn) wendet die gewählte Funktion an */
function tagAaMenu(onPick, title) {
  var sel = document.createElement('select');
  sel.className = 'tagAa';
  sel.title = title || 'Textfunktion anwenden';
  var o = document.createElement('option');
  o.value = ''; o.textContent = 'Aa';
  sel.appendChild(o);
  TEXT_FUNCS.forEach(function(f){
    var op = document.createElement('option');
    op.value = f[0]; op.textContent = f[1];
    sel.appendChild(op);
  });
  sel.addEventListener('click', function(e){ e.stopPropagation(); });
  sel.addEventListener('change', function(){
    var fn = textFunc(sel.value);
    sel.value = '';
    if (fn) onPick(fn);
  });
  return sel;
}

/* Textfunktion auf ein Eingabefeld anwenden und es als geändert markieren */
function tagApplyFn(input, fn) {
  var v = fn(input.value);
  if (v === input.value) return;
  input.value = v;
  input.setAttribute('data-dirty', '1');
}

function tagInput(value, cls) {
  var i = document.createElement('input');
  i.type = 'text'; i.className = 'tagIn' + (cls ? ' ' + cls : '');
  i.value = value || '';
  i.autocomplete = 'off'; i.autocorrect = 'off'; i.spellcheck = false;
  i.addEventListener('input', function(){ i.setAttribute('data-dirty', '1'); });
  return i;
}

function tagMsg(text) {
  while (tagBody.firstChild) tagBody.removeChild(tagBody.firstChild);
  tagBody.appendChild(browseNote(text));
}

/* files: [{uri, title}] */
function openTagEditor(files, heading) {
  tagMode = 'album'; artSeq++;
  tagSave.textContent = 'Speichern';
  if (!heading && files.length === 1) heading = files[0].title;
  document.getElementById('tagTitle').textContent = heading || 'Tags bearbeiten';
  tagBatch = null; tagUndo.style.display = 'none'; tagSave.disabled = true; tagStatus.textContent = '';
  tagMsg('Laden…');
  overlayTags.classList.add('on');
  tagPost('/read', {uris: files.map(function(f){ return f.uri; })}).then(function(res){
    if (!res.ok) { tagMsg('Fehler: ' + (res.error || 'unbekannt')); return; }
    tagRender(files, res.items);
  }).catch(function(){
    tagMsg('Tag-Dienst nicht erreichbar (Port ' + ((window.APP_CONFIG && window.APP_CONFIG.TAGS_PORT) || 8766) + ')');
  });
}

function tagRender(files, items) {
  tagFiles = items.map(function(it, i){
    return {uri: it.uri, ok: !!it.ok, error: it.error, tags: it.tags || {}, name: files[i] && files[i].title};
  });
  var good = tagFiles.filter(function(f){ return f.ok; });
  while (tagBody.firstChild) tagBody.removeChild(tagBody.firstChild);
  if (!good.length) { tagMsg(tagFiles.length ? tagFiles[0].error || 'Keine Tags lesbar' : 'Keine Dateien'); return; }

  tagBody.appendChild(tagCoverSection(good));

  tagCommon = {};
  TAG_COMMON.forEach(function(fd){
    var vals = good.map(function(f){ return f.tags[fd[0]] || ''; });
    var same = vals.every(function(v){ return v === vals[0]; });
    var inp = tagInput(same ? vals[0] : '');
    if (!same) inp.placeholder = '(verschieden)';
    tagCommon[fd[0]] = {input: inp, mixed: !same};
    var aa = fd[0] === 'date' || fd[0] === 'disc' ? null : tagAaMenu(function(fn){ tagApplyFn(inp, fn); });
    tagBody.appendChild(tagField(fd[1], inp, aa));
  });

  if (good.length > 1) {                                /* Muster, Ersetzen usw. für das ganze Album */
    var bulk = document.createElement('button');
    bulk.className = 'tagBtn'; bulk.textContent = 'Mehrfachbearbeitung (Muster, Ersetzen …)';
    bulk.addEventListener('click', function(){
      openBulkEditor(good.map(function(f){ return f.uri; }), document.getElementById('tagTitle').textContent);
    });
    tagBody.appendChild(bulk);
  }

  var h = document.createElement('div');
  h.className = 'infoSection tagSectionAa';
  var hl = document.createElement('span');
  hl.textContent = good.length > 1 ? 'Titel' : 'Titel und Nummer';
  h.appendChild(hl);
  h.appendChild(tagAaMenu(function(fn){                  /* auf alle Titel des Albums */
    tagFiles.forEach(function(f){ if (f.titleIn) tagApplyFn(f.titleIn, fn); });
  }, 'Textfunktion auf alle Titel anwenden'));
  tagBody.appendChild(h);
  tagFiles.forEach(function(f){
    var row = document.createElement('div');
    row.className = 'tagRow';
    if (!f.ok) {
      row.textContent = (f.name || f.uri) + ': ' + (f.error || 'nicht lesbar');
      row.classList.add('err');
    } else {
      f.trackIn = tagInput(f.tags.track, 'tagNum');
      f.titleIn = tagInput(f.tags.title, 'tagTit');
      row.appendChild(f.trackIn); row.appendChild(f.titleIn);
    }
    tagBody.appendChild(row);
  });
  tagSave.disabled = false;
}

function tagCollect() {
  var common = {};
  Object.keys(tagCommon).forEach(function(k){
    var c = tagCommon[k], v = c.input.value;
    if (c.input.getAttribute('data-dirty') !== '1') return;
    if (c.mixed && v === '') return;            /* "(verschieden)" nicht versehentlich leeren */
    common[k] = v;
  });
  return tagFiles.filter(function(f){ return f.ok; }).map(function(f){
    var t = {title: f.titleIn.value, track: f.trackIn.value};
    Object.keys(common).forEach(function(k){ t[k] = common[k]; });
    return {uri: f.uri, tags: t};
  });
}

/* ---------- Cover ---------- */
var TAG_COVER_MAX = 1000;          /* längere Seite eines gewählten Bildes in Pixeln (größere werden verkleinert) */

function tagImageUrl(uri, src) {
  return TAGS + '/image?src=' + src + '&uri=' + encodeURIComponent(uri) + '&t=' + Date.now();
}

function bufToB64(buf) {
  var bytes = new Uint8Array(buf), out = '', CH = 0x8000;
  for (var i = 0; i < bytes.length; i += CH) out += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(out);
}
function isJpeg(buf) { var b = new Uint8Array(buf, 0, 2); return b[0] === 0xff && b[1] === 0xd8; }

/* Bild (Blob) -> base64-JPEG; JPEGs bis TAG_COVER_MAX bleiben unverändert, alles andere wird neu kodiert */
function tagPrepareImage(blob) {
  return new Promise(function(resolve, reject){
    var url = URL.createObjectURL(blob), img = new Image();
    img.onload = function(){
      URL.revokeObjectURL(url);
      var w = img.naturalWidth, h = img.naturalHeight, f = Math.min(1, TAG_COVER_MAX / Math.max(w, h));
      blob.arrayBuffer().then(function(buf){
        if (f === 1 && isJpeg(buf)) return resolve({b64: bufToB64(buf), w: w, h: h});
        var c = document.createElement('canvas');
        c.width = Math.round(w * f); c.height = Math.round(h * f);
        var g = c.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);            /* PNG mit Transparenz: weißer Grund */
        g.drawImage(img, 0, 0, c.width, c.height);
        resolve({b64: c.toDataURL('image/jpeg', 0.9).split(',')[1], w: c.width, h: c.height});
      }, reject);
    };
    img.onerror = function(){ URL.revokeObjectURL(url); reject(new Error('Bild nicht lesbar')); };
    img.src = url;
  });
}

function tagThumb(caption) {
  var box = document.createElement('div');
  box.className = 'tagThumb';
  var img = document.createElement('img');
  var cap = document.createElement('div');
  cap.className = 'tagThumbCap'; cap.textContent = caption;
  var none = document.createElement('div');
  none.className = 'tagThumbNone'; none.textContent = 'keins';
  box.appendChild(img); box.appendChild(none); box.appendChild(cap);
  box.show = function(src, text){
    box.classList.remove('empty');
    img.onerror = function(){ box.classList.add('empty'); if (box.onEmpty) box.onEmpty(); };
    img.onload = function(){ if (text !== undefined) cap.textContent = text; else if (img.naturalWidth) cap.textContent = caption + ' · ' + img.naturalWidth + '×' + img.naturalHeight; };
    img.src = src;
  };
  return box;
}

/* Bereich oben im Editor: eingebettetes Cover und folder.jpg anzeigen, neues Bild wählen, folder.jpg erzeugen */
function tagCoverSection(good) {
  var uris = good.map(function(f){ return f.uri; }), first = uris[0], n = uris.length;
  var wrap = document.createElement('div');
  wrap.className = 'tagCover';
  var thumbs = document.createElement('div');
  thumbs.className = 'tagThumbs';
  var emb = tagThumb('Eingebettet'), fol = tagThumb('folder.jpg');
  thumbs.appendChild(emb); thumbs.appendChild(fol);
  wrap.appendChild(thumbs);

  var btns = document.createElement('div');
  btns.className = 'tagCoverBtns';
  var file = document.createElement('input');
  file.type = 'file'; file.accept = 'image/*'; file.style.display = 'none';
  var pick = document.createElement('button'); pick.textContent = 'Bild wählen…';
  var toFolder = document.createElement('button'); toFolder.textContent = 'Eingebettetes als folder.jpg';
  var online = document.createElement('button'); online.textContent = 'Online suchen';
  btns.appendChild(pick);
  if (window.APP_CONFIG && window.APP_CONFIG.COVER_SEARCH_URL) btns.appendChild(online);     /* nur mit eingerichteter Cover-Suche */
  btns.appendChild(toFolder); btns.appendChild(file);
  wrap.appendChild(btns);

  var opts = document.createElement('div');                 /* erscheint nach der Bildwahl */
  opts.className = 'tagCoverOpts'; opts.style.display = 'none';
  function check(label, on) {
    var l = document.createElement('label'), c = document.createElement('input');
    c.type = 'checkbox'; c.checked = on;
    l.appendChild(c); l.appendChild(document.createTextNode(' ' + label));
    opts.appendChild(l);
    return c;
  }
  var cEmbed = check(n > 1 ? 'in alle ' + n + ' Titel einbetten' : 'in diesen Titel einbetten', true);
  var cFolder = check('als folder.jpg in den Ordner', false);
  var apply = document.createElement('button'); apply.className = 'tagCoverApply'; apply.textContent = 'Cover übernehmen';
  opts.appendChild(apply);
  wrap.appendChild(opts);

  var chosen = null;
  function refresh() {
    emb.show(tagImageUrl(first, 'embedded'));
    fol.show(tagImageUrl(first, 'folder'));
  }
  emb.onEmpty = function(){ toFolder.disabled = true; };
  refresh();

  pick.addEventListener('click', function(){ file.click(); });
  file.addEventListener('change', function(){
    if (!file.files || !file.files[0]) return;
    tagStatus.textContent = 'Bild wird vorbereitet…';
    tagPrepareImage(file.files[0]).then(function(r){ useImage(r, 'Neu'); }).catch(function(e){ tagStatus.textContent = e.message; });
    file.value = '';
  });

  function useImage(r, label) {                            /* Vorschau im Feld "Eingebettet", Optionen einblenden */
    chosen = r;
    emb.show('data:image/jpeg;base64,' + r.b64, label + ' · ' + r.w + '×' + r.h + ' · ' + Math.round(r.b64.length * 0.75 / 1024) + ' KB');
    opts.style.display = '';
    tagStatus.textContent = '';
  }

  /* Cover online suchen: Album-Interpret (sonst Interpret) und Album des ersten Titels */
  online.addEventListener('click', function(){
    var t = good[0].tags || {}, artist = t.albumartist || t.artist || '', album = t.album || '';
    if (!album) { tagStatus.textContent = 'Kein Albumname eingetragen'; return; }
    tagStatus.textContent = 'Suche Cover für „' + album + '“…';
    online.disabled = true;
    tagGetJson('/coversearch?artist=' + encodeURIComponent(artist) + '&album=' + encodeURIComponent(album)).then(function(res){
      online.disabled = false;
      if (!res.ok) { tagStatus.textContent = res.notFound ? 'Online kein Cover gefunden' : (res.error || 'Fehler'); return; }
      var bin = atob(res.image), bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return tagPrepareImage(new Blob([bytes], {type: res.mime})).then(function(r){ useImage(r, 'Online'); });
    }).catch(function(e){ online.disabled = false; tagStatus.textContent = e && e.message ? e.message : 'Tag-Dienst nicht erreichbar'; });
  });

  function send(body, done) {
    tagStatus.textContent = 'Cover wird geschrieben…';
    pick.disabled = toFolder.disabled = apply.disabled = true;
    tagPost('/cover', body).then(function(res){
      if (!res.ok && res.exists) {
        var q = res.exists.length > 1 ? 'In ' + res.exists.length + ' Ordnern liegt schon eine folder.jpg. Überschreiben?'
                                      : 'Im Ordner liegt schon eine folder.jpg. Überschreiben?';
        if (window.confirm(q)) { body.overwrite = true; return send(body, done); }
        tagStatus.textContent = 'Nichts geändert';
        pick.disabled = toFolder.disabled = apply.disabled = false;
        return;
      }
      pick.disabled = toFolder.disabled = apply.disabled = false;
      if (!res.ok) { tagStatus.textContent = 'Fehler: ' + (res.error || 'unbekannt'); return; }
      var files = (res.items || []).filter(function(r){ return r.ok && r.changed; }).length;
      var errs = (res.items || []).filter(function(r){ return !r.ok; }).concat((res.folders || []).filter(function(f){ return !f.ok; }));
      var dirs = (res.folders || []).filter(function(f){ return f.ok; }).length;
      var parts = [];
      if (files) parts.push('Cover in ' + files + ' Datei' + (files > 1 ? 'en' : ''));
      if (dirs) parts.push('folder.jpg in ' + dirs + ' Ordner' + (dirs > 1 ? 'n' : ''));
      tagStatus.textContent = (parts.length ? parts.join(', ') + ' geschrieben' : 'Nichts geändert') +
        (errs.length ? ' – ' + errs.length + ' Fehler: ' + errs[0].error : '');
      tagBatch = res.batch;
      tagUndo.style.display = tagBatch ? '' : 'none';
      if (done) done();
      refresh();
      if (files || dirs) tagRefreshView();
    }).catch(function(){
      tagStatus.textContent = 'Tag-Dienst nicht erreichbar';
      pick.disabled = toFolder.disabled = apply.disabled = false;
    });
  }

  apply.addEventListener('click', function(){
    if (!chosen || (!cEmbed.checked && !cFolder.checked)) return;
    send({uris: uris, image: chosen.b64, embed: cEmbed.checked, folder: cFolder.checked},
         function(){ chosen = null; opts.style.display = 'none'; });
  });

  toFolder.addEventListener('click', function(){
    tagStatus.textContent = 'Cover wird gelesen…';
    fetch(tagImageUrl(first, 'embedded')).then(function(r){
      if (!r.ok) throw new Error('Kein eingebettetes Cover');
      return r.blob();
    }).then(function(blob){
      return blob.arrayBuffer().then(function(buf){            /* JPEG unverändert übernehmen, sonst umwandeln */
        return isJpeg(buf) ? {b64: bufToB64(buf)} : tagPrepareImage(blob);
      });
    }).then(function(r){
      send({uris: uris, image: r.b64, embed: false, folder: true});
    }).catch(function(e){ tagStatus.textContent = e.message; });
  });

  return wrap;
}

/* ---------- Mehrfachbearbeitung (alle Titel eines Künstlers oder eines Albums) ---------- */
var TAG_BULK_FIELDS = [['artist', 'Interpret'], ['albumartist', 'Album-Interpret'], ['album', 'Album'],
                       ['title', 'Titel'], ['genre', 'Genre'], ['composer', 'Komponist']];
var TAG_BULK_ACTIONS = [['set', 'Wert setzen'], ['replace', 'Suchen und ersetzen'], ['split', 'Aufteilen nach Muster']].concat(
  TEXT_FUNCS.map(function(f){ return [f[0], f[1]]; }));
var TAG_CHUNK = 100;                                 /* Dateien je Anfrage an den Tag-Dienst */

var artName = '', artFiles = [], artErrors = 0;      /* artFiles: [{uri, tags}] */
var artSeq = 0;                                       /* verwirft Antworten eines früher geöffneten Editors */
var artUi = null;                                     /* Eingabeelemente der Ansicht */
var artChanges = [];                                  /* Vorschau: [{from, to, tags:{feld:wert}, files:[f], check}] */
var artReload = null;                                 /* lädt den Editor nach Rückgängig neu */
var TAG_LABELS = {title: 'Titel', track: 'Nr.'};
TAG_COMMON.forEach(function(fd){ TAG_LABELS[fd[0]] = fd[1]; });

function tagSelect(list, value) {
  var sel = document.createElement('select');
  sel.className = 'tagSel';
  list.forEach(function(x){
    var o = document.createElement('option');
    o.value = x[0]; o.textContent = x[1];
    sel.appendChild(o);
  });
  if (value) sel.value = value;
  return sel;
}

function tagGetJson(route) {
  return fetch(TAGS + route).then(function(r){ return r.json(); });
}

/* Liste in Teilen nacheinander verarbeiten; fn(teil) -> Promise */
function tagInChunks(list, size, fn) {
  var i = 0;
  function step() {
    if (i >= list.length) return Promise.resolve();
    var part = list.slice(i, i + size);
    i += part.length;
    return fn(part, i).then(step);
  }
  return step();
}

function tagBulkStart(heading) {
  tagMode = 'artist';
  var seq = ++artSeq;
  artFiles = []; artErrors = 0; artChanges = []; artUi = null;
  document.getElementById('tagTitle').textContent = heading;
  tagBatch = null; tagUndo.style.display = 'none'; tagSave.disabled = true; tagSave.textContent = 'Speichern';
  tagStatus.textContent = '';
  overlayTags.classList.add('on');
  return seq;
}

function tagBulkFail(seq, e) {
  if (e.message === 'abgebrochen' || seq !== artSeq) return;
  tagMsg(e instanceof TypeError ? 'Tag-Dienst nicht erreichbar (Port ' + ((window.APP_CONFIG && window.APP_CONFIG.TAGS_PORT) || 8766) + ')'
                                : 'Fehler: ' + e.message);
}

/* Tags der Dateien in Teilen lesen, dann die Mehrfachbearbeitung anzeigen */
function tagBulkLoad(seq, uris) {
  return tagInChunks(uris, TAG_CHUNK * 2, function(part, done){
    if (seq !== artSeq) return Promise.reject(new Error('abgebrochen'));
    tagMsg('Tags lesen… ' + Math.min(done, uris.length) + ' von ' + uris.length);
    return tagPost('/read', {uris: part}).then(function(r){
      if (!r.ok) throw new Error(r.error || 'Lesen fehlgeschlagen');
      r.items.forEach(function(it){
        if (it.ok) artFiles.push({uri: it.uri, tags: it.tags || {}}); else artErrors++;
      });
    });
  }).then(function(){ if (seq === artSeq) artistRender(); });
}

/* alle lokalen Titel eines Künstlers (Stift in der Künstleransicht) */
function openArtistEditor(name) {
  var seq = tagBulkStart(name);
  artName = name;
  artReload = function(){ openArtistEditor(name); };
  tagMsg('Titel suchen…');
  tagGetJson('/artist?name=' + encodeURIComponent(name)).then(function(res){
    if (!res.ok) throw new Error(res.error || 'Suche fehlgeschlagen');
    if (!res.files.length) { tagMsg('Keine lokalen Titel mit diesem Interpreten gefunden'); return; }
    return tagBulkLoad(seq, res.files);
  }).catch(function(e){ tagBulkFail(seq, e); });
}

/* bestimmte Dateien, z. B. ein Album (Knopf "Mehrfachbearbeitung" im Album-Editor) */
function openBulkEditor(uris, heading) {
  var seq = tagBulkStart(heading);
  artReload = function(){ openBulkEditor(uris, heading); };
  tagBulkLoad(seq, uris).catch(function(e){ tagBulkFail(seq, e); });
}

function artistRender() {
  while (tagBody.firstChild) tagBody.removeChild(tagBody.firstChild);
  var albums = {};
  artFiles.forEach(function(f){ albums[(f.tags.album || '').toLowerCase()] = true; });
  var n = Object.keys(albums).length;
  var info = document.createElement('div');
  info.className = 'tagInfo';
  info.textContent = artFiles.length + ' Titel in ' + n + (n === 1 ? ' Album' : ' Alben') +
    (artErrors ? ' · ' + artErrors + ' Datei' + (artErrors > 1 ? 'en' : '') + ' nicht lesbar' : '');
  tagBody.appendChild(info);

  var ui = artUi = {
    field: tagSelect(TAG_BULK_FIELDS, artUi ? artUi.field.value : 'artist'),
    action: tagSelect(TAG_BULK_ACTIONS, artUi ? artUi.action.value : 'words'),
    value: tagInput(''), find: tagInput(''), repl: tagInput(''), pattern: tagInput(artUi ? artUi.pattern.value : '%TITLE% - %ARTIST%'),
    preview: document.createElement('button'),
    list: document.createElement('div')
  };
  ui.value.placeholder = 'neuer Wert (leer = Feld löschen)';
  ui.find.placeholder = 'suchen (genau so geschrieben)';
  ui.repl.placeholder = 'ersetzen durch';
  var fValue = tagField('Neuer Wert', ui.value), fFind = tagField('Suchen', ui.find), fRepl = tagField('Ersetzen durch', ui.repl);
  var fPattern = tagField('Muster', ui.pattern);
  var hint = document.createElement('div');
  hint.className = 'tagHint';
  hint.textContent = 'Der Inhalt des gewählten Feldes wird zerlegt. Platzhalter: %TITLE% %ARTIST% %ALBUM% %ALBUMARTIST% ' +
    '%GENRE% %COMPOSER% %YEAR% %TRACK% %DISC%, dazu %DUMMY% für Text, der wegfallen soll.';
  fPattern.appendChild(hint);
  var fField = tagField('Feld', ui.field);
  tagBody.appendChild(fField);
  tagBody.appendChild(tagField('Aktion', ui.action));
  tagBody.appendChild(fValue); tagBody.appendChild(fFind); tagBody.appendChild(fRepl); tagBody.appendChild(fPattern);
  ui.preview.className = 'tagBtn'; ui.preview.textContent = 'Vorschau';
  tagBody.appendChild(ui.preview);
  ui.list.className = 'tagPreview';
  tagBody.appendChild(ui.list);

  function sync() {
    var a = ui.action.value;
    fValue.style.display = a === 'set' ? '' : 'none';
    fFind.style.display = fRepl.style.display = a === 'replace' ? '' : 'none';
    fPattern.style.display = a === 'split' ? '' : 'none';
    fField.firstChild.textContent = a === 'split' ? 'Feld, das zerlegt wird' : 'Feld';
    artChanges = []; ui.list.innerHTML = ''; tagSave.disabled = true; tagStatus.textContent = '';
  }
  [ui.field, ui.action].forEach(function(el){ el.addEventListener('change', sync); });
  [ui.value, ui.find, ui.repl, ui.pattern].forEach(function(el){ el.addEventListener('input', function(){
    if (artChanges.length) { artChanges = []; ui.list.innerHTML = ''; tagSave.disabled = true; tagStatus.textContent = ''; }
  }); });
  ui.preview.addEventListener('click', artistPreview);
  sync();
}

/* neuer Wert eines Feldes nach der gewählten Aktion */
function artistNewValue(old) {
  var a = artUi.action.value;
  if (a === 'set') return artUi.value.value.trim();
  if (a === 'replace') return textReplace(old, artUi.find.value, artUi.repl.value);
  return textFunc(a)(old);
}

/* geänderte Felder aus split-Werten -> {tags, label} oder null */
function artistSplitTags(f, values) {
  var tags = {}, parts = [];
  Object.keys(values).forEach(function(k){
    if (values[k] === (f.tags[k] || '')) return;
    tags[k] = values[k];
    parts.push((TAG_LABELS[k] || k) + ': ' + (values[k] || '(leer)'));
  });
  return parts.length ? {tags: tags, label: parts.join(' · ')} : null;
}

/* Änderungen einer Datei nach der gewählten Aktion -> [{from, to, tags}] (leer: keine Änderung);
   beim Aufteilen null, wenn das Muster nicht passt; mehrdeutig: zwei Varianten, die sich gegenseitig ausschließen */
function artistChanges(f, field, pat) {
  var from = f.tags[field] || '';
  if (pat) {
    var r = textSplit(from, pat);
    if (!r) return null;
    var a = artistSplitTags(f, r.tags);
    if (!r.ambiguous) return a ? [{from: from, to: a.label, tags: a.tags}] : [];
    var b = artistSplitTags(f, r.alt), out = [];
    if (a) out.push({from: from, to: a.label, tags: a.tags, ambiguous: 1});
    if (b) out.push({from: from, to: b.label, tags: b.tags, ambiguous: 2});
    return out;
  }
  var to = artistNewValue(from);
  if (to === from) return [];
  var t = {}; t[field] = to;
  return [{from: from, to: to, tags: t}];
}

/* Änderungen berechnen und gruppiert anzeigen (gleiche Änderung "alt -> neu" = eine Zeile) */
function artistPreview() {
  var field = artUi.field.value, action = artUi.action.value, groups = {}, order = [], pat = null, skipped = 0;
  if (action === 'replace' && !artUi.find.value) { tagStatus.textContent = 'Suchtext fehlt'; return; }
  if (action === 'split') {
    pat = textPattern(artUi.pattern.value);
    if (pat.error) { tagStatus.textContent = 'Muster: ' + pat.error; return; }
  }
  artFiles.forEach(function(f, n){
    var cs = artistChanges(f, field, pat);
    if (!cs) { skipped++; return; }
    cs.forEach(function(c){
      var key = c.ambiguous ? n + '\u0000' + c.ambiguous : c.from + '\u0000' + c.to;    /* Varianten nicht zusammenfassen */
      if (!groups[key]) { c.files = []; groups[key] = c; order.push(key); }
      groups[key].files.push(f);
    });
  });
  artChanges = order.map(function(k){ return groups[k]; });
  artChanges.forEach(function(g, k){ g.order = k; });
  artChanges.sort(function(x, y){ return x.from.localeCompare(y.from) || x.order - y.order; });
  var list = artUi.list;
  list.innerHTML = '';
  if (skipped) list.appendChild(browseNote(skipped + (skipped > 1 ? ' Titel passen' : ' Titel passt') + ' nicht zum Muster und ' +
                                           (skipped > 1 ? 'bleiben' : 'bleibt') + ' unverändert'));
  if (!artChanges.length) { list.appendChild(browseNote('Keine Änderungen')); tagSave.disabled = true; tagStatus.textContent = ''; return; }
  artChanges.forEach(function(g, k){
    var row = document.createElement('label');
    row.className = 'tagChange' + (g.ambiguous ? ' unsure' : '');
    g.check = document.createElement('input');
    g.check.type = 'checkbox'; g.check.checked = !g.ambiguous;      /* mehrdeutig: erst nach Prüfung anhaken */
    g.check.addEventListener('change', function(){
      if (g.ambiguous && g.check.checked) {                      /* nur eine der beiden Varianten */
        var other = artChanges[g.ambiguous === 1 ? k + 1 : k - 1];
        if (other && other.files[0] === g.files[0] && other.ambiguous) other.check.checked = false;
      }
      artistCount();
    });
    var txt = document.createElement('div');
    txt.className = 'tagChangeText';
    var a = document.createElement('div'); a.className = 'tagOld'; a.textContent = g.from || '(leer)';
    var b = document.createElement('div'); b.className = 'tagNew'; b.textContent = '→ ' + (g.to || '(leer)');
    txt.appendChild(a); txt.appendChild(b);
    var sub = document.createElement('div');
    sub.className = 'tagChangeSub';
    sub.textContent = (g.ambiguous ? 'mehrdeutig, Variante ' + g.ambiguous + ' von 2 · ' : '') + (g.files.length > 1 ? g.files.length + ' Titel'
      : (field === 'title' ? (g.files[0].tags.album || '') : (g.files[0].tags.title || '')));
    if (sub.textContent) txt.appendChild(sub);
    row.appendChild(g.check); row.appendChild(txt);
    list.appendChild(row);
  });
  artistCount();
}

function artistSelected() {
  var items = [];
  artChanges.forEach(function(g){
    if (!g.check.checked) return;
    g.files.forEach(function(f){ items.push({uri: f.uri, tags: g.tags, file: f}); });
  });
  return items;
}

function artistCount() {
  var n = artistSelected().length;
  tagSave.disabled = !n;
  tagStatus.textContent = n ? (n > 1 ? n + ' Dateien werden' : '1 Datei wird') + ' geändert' : 'nichts ausgewählt';
}

/* in Teilen schreiben (gemeinsame Kennung für Rückgängig), MPD erst am Ende einmal neu einlesen lassen */
function artistSave() {
  var items = artistSelected();
  if (!items.length) return;
  var batch = Date.now().toString(36), changed = [], errs = [];
  tagSave.disabled = true; artUi.preview.disabled = true;
  tagInChunks(items, TAG_CHUNK, function(part, done){
    tagStatus.textContent = 'Speichern… ' + Math.min(done, items.length) + ' von ' + items.length;
    return tagPost('/write', {items: part.map(function(it){ return {uri: it.uri, tags: it.tags}; }), batch: batch, scan: false})
      .then(function(res){
        if (!res.ok) throw new Error(res.error || 'Schreiben fehlgeschlagen');
        res.items.forEach(function(r, k){
          var it = part[k];
          if (!r.ok) { errs.push(r.error); return; }
          if (r.changed) { changed.push(it.uri); Object.keys(r.after || {}).forEach(function(f){ it.file.tags[f] = r.after[f]; }); }
        });
      });
  }).then(function(){
    return changed.length ? tagPost('/scan', {uris: changed}).catch(function(){ return {ok: false}; }) : {ok: true};
  }).then(function(scan){
    tagBatch = changed.length ? batch : null;
    tagUndo.style.display = tagBatch ? '' : 'none';
    artistRender();
    tagStatus.textContent = (changed.length ? changed.length + ' Datei' + (changed.length > 1 ? 'en' : '') + ' geändert' : 'Nichts geändert') +
      (errs.length ? ' – ' + errs.length + ' Fehler: ' + errs[0] : '') +
      (changed.length && !(scan && scan.ok && scan.scan !== false) ? ' – Bibliothek bitte neu einlesen' : '');
    if (changed.length) tagRefreshView();
  }).catch(function(e){
    tagBatch = changed.length ? batch : null;            /* schon Geschriebenes bleibt rückgängig machbar */
    tagUndo.style.display = tagBatch ? '' : 'none';
    artUi.preview.disabled = false;
    tagStatus.textContent = (e instanceof TypeError ? 'Tag-Dienst nicht erreichbar' : 'Fehler: ' + e.message) +
      (changed.length ? ' – ' + changed.length + ' Dateien schon geändert' : '');
    if (changed.length) tagPost('/scan', {uris: changed}).catch(function(){});
  });
}

/* nach Änderungen die Ansicht neu laden, sobald MPD die Dateien neu eingelesen hat */
function tagRefreshView() {
  setTimeout(function(){
    if (overlayBrowse.classList.contains('on') && browseStack.length) browseRender();
    if (overlayQueue.classList.contains('on')) loadQueue();
    if (overlaySearch.classList.contains('on') && searchQuery) doSearch(searchQuery);
    lastKey = null; lastLyrKey = null;               /* Player: Info und Lyrics mit den neuen Tags neu holen */
  }, 4000);
}

tagSave.addEventListener('click', function(){
  if (tagMode === 'artist') return artistSave();
  tagSave.disabled = true; tagStatus.textContent = 'Speichern…';
  tagPost('/write', {items: tagCollect()}).then(function(res){
    if (!res.ok) { tagStatus.textContent = 'Fehler: ' + (res.error || 'unbekannt'); tagSave.disabled = false; return; }
    var changed = 0, errs = [];
    res.items.forEach(function(r){
      if (!r.ok) errs.push(r.error); else if (r.changed) changed++;
    });
    tagBatch = res.batch;
    tagUndo.style.display = tagBatch ? '' : 'none';
    tagStatus.textContent = (changed ? changed + ' Datei' + (changed > 1 ? 'en' : '') + ' geändert' : 'Nichts geändert') +
      (errs.length ? ' – ' + errs.length + ' Fehler: ' + errs[0] : '') +
      (changed && res.scan === false ? ' – Bibliothek bitte neu einlesen (mpc update fehlgeschlagen)' : '');
    tagSave.disabled = false;
    if (changed) tagRefreshView();
  }).catch(function(){ tagStatus.textContent = 'Tag-Dienst nicht erreichbar'; tagSave.disabled = false; });
});

tagUndo.addEventListener('click', function(){
  if (!tagBatch) return;
  tagUndo.style.display = 'none'; tagStatus.textContent = 'Zurücksetzen…';
  tagPost('/undo', {batch: tagBatch}).then(function(res){
    showToast(res.ok ? 'Änderung rückgängig gemacht' : 'Rückgängig fehlgeschlagen: ' + (res.error || ''));
    tagBatch = null;
    if (tagMode === 'artist' && artReload) artReload();    /* Mehrfachbearbeitung mit den alten Werten neu laden */
    else overlayTags.classList.remove('on');
    tagRefreshView();
  }).catch(function(){ tagStatus.textContent = 'Tag-Dienst nicht erreichbar'; });
});

document.getElementById('closeTags').addEventListener('click', function(){ overlayTags.classList.remove('on'); });
