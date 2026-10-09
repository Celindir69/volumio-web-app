/* Suchen & Entdecken ohne Eingabe, passend zum Reiter (Künstler, Alben, Titel): Reihen „Zufällige Entdeckungen“ (mit Würfel),
   „Vor einem Jahr gehört“, „Lange nicht gehört“, „Noch nie gehört“, „Früher oft gehört“
   (Tag-Dienst GET /discover?kind=…, /plays?view=ago&kind=…). Leere Reihen fallen weg.
   Klassisches Skript, gemeinsamer globaler Gültigkeitsbereich; nach library.js und history.js geladen. */
var discoverReady = false;       /* Tag-Dienst erreichbar */
var discoverSeq   = 0;
var discoverTimer = null;
/* Suchreiter -> Art beim Tag-Dienst */
var DISCOVER_KIND = {
  artists: {kind: 'artist', ago: 'disc.ago.artist'},
  albums:  {kind: 'album',  ago: 'disc.ago.album'},
  songs:   {kind: 'track',  ago: 'disc.ago.track'}
};
var DISCOVER_SHELVES = ['random', 'gems', 'ago', 'forgotten', 'never', 'oldfav'];   /* Reihenfolge auf der Seite */

function discoverDate(t) { return langDate(t * 1000); }
function discoverCat() { return DISCOVER_KIND[searchCat] || DISCOVER_KIND.albums; }

/* von renderSearchResults aufgerufen, solange nichts gesucht wurde; false: nicht verfügbar */
function discoverShow() {
  if (!discoverReady) return false;
  var seq = ++discoverSeq, cat = discoverCat();
  clearTimeout(discoverTimer);
  while (searchResults.firstChild) searchResults.removeChild(searchResults.firstChild);
  var box = histEl('div', 'dBox'), secs = {};
  DISCOVER_SHELVES.forEach(function(id){ secs[id] = histEl('div', 'dSec'); box.appendChild(secs[id]); });
  box.appendChild(discoverChips(seq));
  searchResults.appendChild(box);

  tagGetJson('/plays?view=ago&kind=' + cat.kind + histTz()).then(function(r){
    var a = r && r.ago;
    if (seq !== discoverSeq || !a || !a.items.length) return;
    secs.ago.appendChild(browseHeading(T(cat.ago, {n: a.years})));
    var row = histEl('div', 'dRow');
    a.items.forEach(function(it){ row.appendChild(discoverTile(cat.kind, it)); });
    secs.ago.appendChild(row);
    discoverFit(row);
  }).catch(function(){});

  discoverLoad(seq, cat, secs, false);
  discoverGems(seq, cat, secs.gems);
  return true;
}

/* Versteckte Perlen (Tag-Dienst GET /gems): eigene Reihe mit Würfel; ohne Geschmack (keine Bewertungen, kein Verlauf) leer */
function discoverGems(seq, cat, sec) {
  tagGetJson('/gems?kind=' + cat.kind).then(function(r){
    if (seq !== discoverSeq || !r || !r.ok) return;
    discoverClear(sec);
    if (!r.items.length) return;
    var head = discoverDiceHead(T('disc.shelf.gems'), function(){ discoverGems(discoverSeq, cat, sec); });
    sec.appendChild(head);
    var row = histEl('div', 'dRow');
    r.items.forEach(function(it){ row.appendChild(discoverShelfTile(cat.kind, 'gems', it)); });
    sec.appendChild(row);
    discoverFit(row);
  }).catch(function(){});
}

/* Grund einer Perle: ungehört von einem Lieblingskünstler, wie ein Lieblingskünstler, sonst Stimmung · Genre */
function discoverWhy(it) {
  var w = it.why || {};
  if (w.why === 'artist') return T(it.plays ? 'gems.why.artistRare' : 'gems.why.artist');   /* Künstler steht schon darüber */
  if (w.why === 'like') return T('gems.why.like', {ar: histArtistName(w.ar)});
  var m = w.mood ? T('mood.' + w.mood) : '';
  return [m ? m.charAt(0).toUpperCase() + m.slice(1) : '', w.ge || ''].filter(Boolean).join(' · ');
}

/* Überschrift mit Würfel (Zufallsreihe, Perlen) */
function discoverDiceHead(title, roll) {
  var head = browseHeading(title);
  head.classList.add('dHead');
  var dice = histEl('div', 'dDice');
  dice.title = T('disc.reroll');
  dice.innerHTML = DICE_SVG;
  dice.addEventListener('click', function(){
    dice.classList.remove('roll'); void dice.offsetWidth; dice.classList.add('roll');
    roll();
  });
  head.appendChild(dice);
  return head;
}

/* Reihen vom Tag-Dienst; onlyRandom: nur die Zufallsreihe neu (Würfel) */
function discoverLoad(seq, cat, secs, onlyRandom) {
  tagGetJson('/discover?kind=' + cat.kind).then(function(r){
    if (seq !== discoverSeq) return;
    if (!r || !r.ok) {
      if (r && r.building) {
        discoverClear(secs.random);
        secs.random.appendChild(browseNote(T('disc.building')));
        discoverTimer = setTimeout(function(){ if (seq === discoverSeq) discoverLoad(seq, cat, secs, false); }, 5000);
      }
      return;
    }
    r.shelves.forEach(function(sh){
      if (!secs[sh.id] || (onlyRandom && sh.id !== 'random')) return;
      discoverShelf(secs[sh.id], sh, cat, secs);
    });
  }).catch(function(){});
}

/* Auswahlknöpfe unter den Reihen: Stimmung, Energie, Stil und Jahrzehnt; jeder öffnet die passenden Alben (genre.js) */
var DISCOVER_MOODS = [['relaxed'], ['dreamy'], ['melancholic'], ['dark'], ['happy'], ['intense'], ['epic']];   /* Namen wie im Stimmungs-Mix */
var DISCOVER_ENERGY = [[1, 2, 'disc.energy.low'], [3, 3, 'disc.energy.mid'], [4, 5, 'disc.energy.high']];
var DISCOVER_STYLES = [
  ['Acoustic', ['acoustic', 'folk', 'singer-songwriter']],
  ['Ambient', ['ambient', 'dark ambient', 'atmospheric']],
  ['Electronic', ['electronic', 'downtempo', 'trip-hop', 'house', 'deep house', 'techno', 'minimal', 'trance', 'breakbeat', 'drum and bass', 'dubstep']],
  ['Funky', ['funky', 'funk', 'groovy', 'disco']],
  ['Soulful', ['soul', 'neo-soul', 'r&b']],
  ['Experimental', ['experimental', 'avant-garde', 'noise', 'free jazz']]
];
function discoverChips(seq) {
  var wrap = histEl('div', 'dChipBox');
  function group(title) {
    var sec = histEl('div', 'dSec');
    sec.appendChild(browseHeading(title));
    var chips = histEl('div', 'mxChips dChips');
    sec.appendChild(chips);
    wrap.appendChild(sec);
    return chips;
  }
  function chip(box, label, onClick) {
    var c = histEl('div', 'mxChip', label);
    c.addEventListener('click', onClick);
    box.appendChild(c);
  }
  function open(title, q) { openBrowse({kind: 'moodset', title: title, q: q}); }
  var g = group(T('disc.chips.mood'));
  DISCOVER_MOODS.forEach(function(m){
    var name = mixName(m[0]);
    chip(g, name, function(){ open(name, 'moods=' + encodeURIComponent(m.join(','))); });
  });
  g = group(T('disc.chips.energy'));
  DISCOVER_ENERGY.forEach(function(e){
    var name = T(e[2]);
    chip(g, name, function(){ open(name, 'emin=' + e[0] + '&emax=' + e[1]); });
  });
  g = group(T('disc.chips.style'));
  DISCOVER_STYLES.forEach(function(s){ chip(g, s[0], function(){ open(s[0], 'styles=' + encodeURIComponent(s[1].join(','))); }); });
  var dec = group(T('disc.chips.decade'));
  dec.parentNode.style.display = 'none';
  tagGetJson('/decades').then(function(r){
    if (seq !== discoverSeq || !r || !r.ok || !r.decades.length) return;
    r.decades.forEach(function(d){
      chip(dec, T('disc.decade', {d: d.d}), function(){ openBrowse({kind: 'decade', decade: d.d}); });
    });
    dec.parentNode.style.display = '';
  }).catch(function(){});
  return wrap;
}

function discoverClear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

function discoverShelf(sec, sh, cat, secs) {
  discoverClear(sec);
  if (!sh.items.length && sh.id !== 'random') return;
  sec.appendChild(sh.id === 'random'
    ? discoverDiceHead(T('disc.shelf.random'), function(){ discoverLoad(discoverSeq, cat, secs, true); })
    : browseHeading(T('disc.shelf.' + sh.id)));
  if (!sh.items.length) {
    sec.appendChild(browseNote(T('disc.none.' + cat.kind)));
    return;
  }
  var row = histEl('div', 'dRow');
  sh.items.forEach(function(it){ row.appendChild(discoverShelfTile(cat.kind, sh.id, it)); });
  sec.appendChild(row);
  discoverFit(row);
}

/* Kachel einer Reihe: Künstler öffnen, Album öffnen, Titel abspielen; darunter, wann bzw. wie oft gehört */
function discoverShelfTile(kind, shelf, it) {
  var tile = histEl('div', 'dTile' + (kind === 'artist' ? ' dArtist' : ''));
  var dir = kind === 'track' ? it.f.replace(/\/[^\/]*$/, '') : it.dir;
  var art = kind === 'artist' ? histArtistArt(it.ar) : histAlbumArt(it.ar, it.al, dir);
  var img = histImg(art, kind === 'artist');
  if (kind === 'artist') histArtistFallback(img, it.ar);
  tile.appendChild(img);
  tile.appendChild(histEl('div', 'dTi', kind === 'artist' ? it.ar : kind === 'track' ? it.ti : it.al));
  tile.appendChild(histEl('div', 'dAr', kind === 'artist' ? T('disc.albums', {n: it.n}) : histArtistName(it.ar)));
  var info = shelf === 'gems' ? discoverWhy(it)
           : shelf === 'oldfav' ? T('disc.plays', {n: it.plays})
           : shelf === 'never' ? '' : it.last ? T('disc.last', {date: discoverDate(it.last)}) : T('disc.never');
  if (info) tile.appendChild(histEl('div', 'dSub', info));
  tile.addEventListener('click', function(){
    if (kind === 'artist') return openBrowse({kind: 'artist', artist: it.ar});
    if (kind === 'track') return histPlayUri('music-library/' + it.f, 'mpd', it);
    openBrowse({kind: 'album', artist: it.ar === 'Verschiedene' ? '' : it.ar, album: it.al, uri: 'music-library/' + it.dir, albumart: art});
  });
  return tile;
}

/* Kachel für "vor einem Jahr": Künstler öffnen, Album öffnen, Titel abspielen */
function discoverTile(kind, it) {
  var tile = histEl('div', 'dTile' + (kind === 'artist' ? ' dArtist' : ''));
  var art = kind === 'artist' ? histArtistArt(it.ar) : kind === 'album' ? histAlbumArt(it.ar, it.ti, it.u || '') : histTrackArt(it);
  var img = histImg(art, kind === 'artist');
  if (kind === 'artist') histArtistFallback(img, it.ar);
  tile.appendChild(img);
  tile.appendChild(histEl('div', 'dTi', kind === 'artist' ? it.ar : it.ti));
  if (kind !== 'artist') tile.appendChild(histEl('div', 'dAr', histArtistName(it.ar)));
  tile.addEventListener('click', function(){
    if (kind === 'artist') return openBrowse({kind: 'artist', artist: it.ar});
    if (kind === 'track') return histPlay({ti: it.ti, ar: it.ar, al: it.al, u: it.u ? 'music-library/' + it.u : ''});
    openBrowse({kind: 'album', artist: it.ar === 'Verschiedene' ? '' : it.ar, album: it.ti,
                uri: it.u ? 'music-library/' + it.u : undefined, albumart: art});
  });
  return tile;
}

/* Kacheln gleichmäßig über die Breite verteilen, wenn sie hineinpassen; sonst links beginnend zum Wischen */
function discoverFit(row) {
  if (!row || !row.parentNode) return;
  row.classList.remove('fit');
  if (row.scrollWidth <= row.clientWidth + 1) row.classList.add('fit');
}
window.addEventListener('resize', function(){ Array.prototype.forEach.call(document.querySelectorAll('.dRow'), discoverFit); });

/* beim Öffnen der Suche neu füllen, wenn nichts gesucht wurde */
if (window.MutationObserver) new MutationObserver(function(){
  if (overlaySearch.classList.contains('on') && !searchQuery && discoverReady && searchCat !== 'genres') discoverShow();   /* Genres: Kacheln bleiben */
  if (!overlaySearch.classList.contains('on')) clearTimeout(discoverTimer);
}).observe(overlaySearch, {attributes: true, attributeFilter: ['class']});

tagGetJson('/health').then(function(r){ if (r && r.ok) { discoverReady = true; if (!searchQuery) renderSearchResults(); } }).catch(function(){});

/* ---------- Zufallsmix: Würfel neben „Alle abspielen“ ---------- */
/* q: {artist} oder {dirs: [...]}; der Tag-Dienst zieht 25 Titel (nie derselbe Künstler direkt hintereinander),
   die ersetzen die Warteschlange */
function randomMixPlay(q) {
  tagPostJson('/randommix', q).then(function(r){
    if (!(r && r.items && r.items.length)) return showToast(T(r && r.building ? 'disc.building' : 'mix.empty'));
    tracksPlay(r.items);
    showToast(T('disc.mixStarted', {n: r.items.length}));
  }).catch(function(){ showToast(T('hist.offline')); });
}

/* Titel vom Tag-Dienst ([{f, ti, ar, al}]) werden die Warteschlange, der erste läuft */
function tracksPlay(list) {
  var items = list.map(function(t){
    return {uri: 'music-library/' + t.f, service: 'mpd', type: 'song', title: t.ti, artist: t.ar, album: t.al};
  });
  browseOrigin = null;
  fetch('/api/v1/replaceAndPlay', {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({item: items[0]})
  }).then(function(){
    if (items.length > 1) setTimeout(function(){ socket.emit('addToQueue', items.slice(1)); }, 300);
  }).catch(function(){});
  closeAllOverlays();
}

/* ---------- Mehr wie dieser Titel (Tipp auf den Titel in der Wiedergabe) ---------- */
/* Tag-Dienst GET /similar: Titel mit ähnlicher Stimmung, Energie und ähnlichem Tempo, je Künstler höchstens zwei.
   „Alle abspielen“ spielt die Liste, der Würfel 25 andere ähnliche Titel; Tipp auf einen Titel spielt ihn. */
function similarQuery(e) {
  return '/similar?file=' + encodeURIComponent(e.file || '') + '&artist=' + encodeURIComponent(e.artist || '') +
    '&title=' + encodeURIComponent(e.title || '') + '&album=' + encodeURIComponent(e.album || '');
}
function browseSimilar(e, seq) {
  tagGetJson(similarQuery(e)).then(function(r){
    if (seq !== browseSeq) return;
    discoverClear(browseBody);
    if (!r || !r.ok || !r.items.length) { browseBody.appendChild(browseNote(T(r && r.nodata ? 'similar.nodata' : 'similar.none'))); return; }
    var s = r.seed, sum = s.mood.map(mixName).concat(s.energy ? [T('similar.energy', {e: s.energy})] : [], s.bpm ? [s.bpm + '\u00a0BPM'] : []);
    if (sum.length) browseBody.appendChild(browseNote(T('similar.seed', {why: sum.join(' · ')}), 'sHint simSeed'));
    var head = document.createElement('div');
    head.id = 'browseArtistHead';
    head.innerHTML = '<div id="browsePlayAll"><svg viewBox="0 0 24 24"><path d="M7 5v14l12-7z"/></svg></div>';
    var lbl = histEl('div', 'sMeta');
    lbl.appendChild(histEl('div', 'sTitle bAlbum', T('browse.playAll')));
    lbl.appendChild(histEl('div', 'sSub', T('browse.trackCount', {n: r.items.length})));
    head.appendChild(lbl);
    var dice = histEl('div', 'mixDice');
    dice.title = T('disc.mix');
    dice.innerHTML = DICE_SVG;
    dice.addEventListener('click', function(ev){
      ev.stopPropagation();
      dice.classList.remove('roll'); void dice.offsetWidth; dice.classList.add('roll');
      tagGetJson(similarQuery(e) + '&shuffle=1').then(function(m){
        if (!m || !m.ok || !m.items.length) return showToast(T('similar.none'));
        tracksPlay(m.items);
        showToast(T('disc.mixStarted', {n: m.items.length}));
      }).catch(function(){ showToast(T('hist.offline')); });
    });
    head.appendChild(dice);
    head.addEventListener('click', function(){ tracksPlay(r.items); });
    browseBody.appendChild(head);
    r.items.forEach(function(x){
      var row = histEl('div', 'sRow mxRow');
      row.appendChild(histImg(histAlbumArt(x.ar, x.al, x.f.replace(/\/[^\/]*$/, ''))));
      var meta = histEl('div', 'sMeta');
      meta.appendChild(histEl('div', 'sTitle', x.ti));
      meta.appendChild(histEl('div', 'sSub', x.ar));
      var why = x.why.mood.map(mixName);
      if (x.why.bpm) why.push(x.why.bpm + '\u00a0BPM');
      if (why.length) meta.appendChild(histEl('div', 'mxWhy', why.join(' · ')));
      row.appendChild(meta);
      if (x.why.energy) row.appendChild(histEl('div', 'mxDots', mixEnergyDots(x.why.energy)));
      row.style.cursor = 'pointer';
      row.addEventListener('click', function(){ histPlayUri('music-library/' + x.f, 'mpd', x); });
      browseBody.appendChild(row);
    });
  }).catch(function(){
    if (seq !== browseSeq) return;
    discoverClear(browseBody);
    browseBody.appendChild(browseNote(T('genre.offline')));
  });
}

/* ---------- Mehr entdecken (Künstlerseite) ---------- */
/* Ähnliche Künstler aus der Sammlung (mit Würfel: 25 Titel daraus, jeder Künstler etwa gleich oft) und
   Stimmungen, Energie, Stile und Jahrzehnte des Künstlers (Tag-Dienst GET /artistprofile); jeder Knopf öffnet
   wie beim Entdecken die passenden Alben. Ohne Inhalt bleibt der Abschnitt leer. alive(): Seite noch dieselbe. */
function discoverMore(artist, alive) {
  var box = histEl('div', 'dMore'), head = null;
  function group(label) {
    if (!head) { head = browseHeading(T('more.title')); box.insertBefore(head, box.firstChild); }
    var sec = histEl('div', 'dMoreSec');
    sec.appendChild(histEl('div', 'mxLabel', label));
    var chips = histEl('div', 'mxChips');
    sec.appendChild(chips);
    return {sec: sec, chips: chips};
  }
  function chip(box_, label, onClick, cls) {
    var c = histEl('div', 'mxChip' + (cls ? ' ' + cls : ''), label);
    c.addEventListener('click', function(ev){ ev.stopPropagation(); onClick(c); });
    box_.appendChild(c);
    return c;
  }
  function moodset(title, q) { openBrowse({kind: 'moodset', title: title, q: q}); }
  var simSec = histEl('div'), tagSec = histEl('div');            /* feste Reihenfolge, egal was zuerst ankommt */
  box.appendChild(simSec); box.appendChild(tagSec);
  loadSimilarArtists(artist).then(function(names){
    if (!alive() || !names || !names.length) return;
    var g = group(T('more.similar'));
    var dice = chip(g.chips, '', function(c){
      c.classList.remove('roll'); void c.offsetWidth; c.classList.add('roll');
      randomMixPlay({artists: names});
    }, 'dMixChip');
    dice.innerHTML = DICE_SVG;
    dice.title = T('disc.mix');
    names.forEach(function(n){ chip(g.chips, n, function(){ openBrowse({kind: 'artist', artist: n}); }); });
    simSec.appendChild(g.sec);
  }).catch(function(){});
  if (!discoverReady) return box;
  tagGetJson('/artistprofile?artist=' + encodeURIComponent(artist)).then(function(r){
    if (!alive() || !r || !r.ok) return;
    var g;
    if (r.moods.length || r.energy) {
      g = group(T('more.mood'));
      r.moods.forEach(function(m){ var name = mixName(m); chip(g.chips, name, function(){ moodset(name, 'moods=' + encodeURIComponent(m)); }); });
      DISCOVER_ENERGY.forEach(function(e){
        if (r.energy < e[0] || r.energy > e[1]) return;
        var name = T(e[2]);
        chip(g.chips, name, function(){ moodset(name, 'emin=' + e[0] + '&emax=' + e[1]); });
      });
      tagSec.appendChild(g.sec);
    }
    if (r.styles.length) {
      g = group(T('more.style'));
      r.styles.forEach(function(s){
        var name = s.charAt(0).toUpperCase() + s.slice(1);
        chip(g.chips, name, function(){ moodset(name, 'styles=' + encodeURIComponent(s)); });
      });
      tagSec.appendChild(g.sec);
    }
    if (r.decades.length) {
      g = group(T('more.decade'));
      r.decades.forEach(function(d){ chip(g.chips, T('disc.decade', {d: d}), function(){ openBrowse({kind: 'decade', decade: d}); }); });
      tagSec.appendChild(g.sec);
    }
  }).catch(function(){});
  return box;
}

/* Würfel-Knopf für die Zeile „Alle abspielen“ (Klick geht nicht an die Zeile weiter) */
function randomMixButton(q) {
  var b = histEl('div', 'mixDice');
  b.title = T('disc.mix');
  b.innerHTML = DICE_SVG;
  b.addEventListener('click', function(ev){
    ev.stopPropagation();
    b.classList.remove('roll'); void b.offsetWidth; b.classList.add('roll');
    randomMixPlay(typeof q === 'function' ? q() : q);
  });
  return b;
}
