/* Ersatz für Volumios Künstler- und Albumtexte (metavolumio), wenn die nichts liefern: Volumio 4 gibt sie nur mit
   bezahltem Abo heraus. Erst Last.fm (braucht LASTFM_KEY, in der gewählten Sprache, sonst englisch), für Künstler dann
   Wikipedia (gewählte Sprache, sonst englisch, ohne Schlüssel). Klassisches Skript, ES5; im Test mit eigenem fetch. */

/* Last.fm-Text säubern: Link "Read more on Last.fm" und HTML weg, Lizenzhinweis bleibt als Quelle unten */
function infoClean(s) {
  s = String(s || '')
    .replace(/<a [^>]*>[^<]*<\/a>\.?/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/User-contributed text is available under the Creative Commons By-SA License[^\n]*/i, '')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n')
    .trim();
  return s.length >= 40 ? s : '';            /* "Read more"-Stummel und leere Einträge zählen nicht */
}

function infoLastfm(fetchFn, key, mode, artist, album, lang) {
  var m = mode === 'storyAlbum' ? 'album.getinfo' : 'artist.getinfo';
  var url = 'https://ws.audioscrobbler.com/2.0/?method=' + m + '&artist=' + encodeURIComponent(artist) +
            (mode === 'storyAlbum' ? '&album=' + encodeURIComponent(album) : '') +
            '&autocorrect=1&api_key=' + encodeURIComponent(key) + '&format=json' + (lang ? '&lang=' + lang : '');
  return fetchFn(url).then(function(r){ return r.json(); }).then(function(j){
    var o = j && (mode === 'storyAlbum' ? j.album && j.album.wiki : j.artist && j.artist.bio);
    return o ? infoClean(o.content || o.summary) : '';
  }).catch(function(){ return ''; });
}

function infoWikipedia(fetchFn, artist, lang) {
  var url = 'https://' + lang + '.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(artist.replace(/ /g, '_'));
  return fetchFn(url).then(function(r){ return r.ok ? r.json() : null; }).then(function(j){
    if (!j || j.type !== 'standard' || !j.extract) return '';      /* Begriffsklärung oder nichts gefunden */
    /* nur nehmen, wenn es um Musik geht: sonst trifft "Air" oder "Yes" leicht etwas anderes */
    var d = (j.description || '') + ' ' + j.extract.slice(0, 300);
    return /band|musik|sänger|rapper|komponist|duo|gruppe|music|singer|composer|songwriter|dj\b|producer|produzent|orchest|ensemble|pianist|gitarrist|guitarist/i.test(d)
      ? j.extract : '';
  }).catch(function(){ return ''; });
}

/* ---------- Texte zu einzelnen Titeln (meist Singles): Last.fm track.getInfo, dann Wikipedia-Artikel zum Lied ---------- */

/* Zusätze weg, die nicht zum Liednamen gehören: "(Remastered 2011)", "- Live", "[feat. X]" */
function infoSongName(title) {
  return String(title || '')
    .replace(/\s*[\(\[][^\)\]]*(remaster|live|version|edit|mix|mono|stereo|feat\.?|ft\.|bonus|demo|single|radio)[^\)\]]*[\)\]]/gi, '')
    .replace(/\s+-\s+.*(remaster|live|version|edit|mix|mono|stereo|bonus|demo|single|radio).*$/i, '')
    .trim();
}
function infoNorm(s) {
  return String(s || '').toLowerCase().replace(/[\u2018\u2019\u00b4`]/g, "'").replace(/[^a-z0-9\u00c0-\u024f']+/g, ' ').trim();
}

function infoLastfmTrack(fetchFn, key, artist, title, lang) {
  var url = 'https://ws.audioscrobbler.com/2.0/?method=track.getinfo&artist=' + encodeURIComponent(artist) +
            '&track=' + encodeURIComponent(title) + '&autocorrect=1&api_key=' + encodeURIComponent(key) + '&format=json' +
            (lang ? '&lang=' + lang : '');
  return fetchFn(url).then(function(r){ return r.json(); }).then(function(j){
    var w = j && j.track && j.track.wiki;
    return w ? infoClean(w.content || w.summary) : '';
  }).catch(function(){ return ''; });
}

/* Wikipedia-Suche nach "Titel Interpret"; genommen wird nur ein Artikel, dessen Name der Liedname ist (Zusatz in
   Klammern egal, z. B. "Teardrop (Lied)"), der sich als Lied/Single/Song beschreibt und den Interpreten nennt */
var INFO_SONG_RE = /\b(lied|song|single|ballade|hymne|instrumental)/i;
function infoWikipediaTrack(fetchFn, artist, title, lang) {
  var base = 'https://' + lang + '.wikipedia.org/';
  var want = infoNorm(title), who = infoNorm(String(artist).split(/\s+(?:feat\.?|ft\.|&|und|and|with|x)\s+|\s*[,;\/]\s*/i)[0]);
  if (!want || !who) return Promise.resolve('');
  return fetchFn(base + 'w/rest.php/v1/search/page?limit=5&q=' + encodeURIComponent(title + ' ' + artist))
    .then(function(r){ return r.ok ? r.json() : null; }).then(function(j){
      var pages = (j && j.pages) || [];
      var hits = pages.filter(function(p){ return infoNorm(String(p.title || '').replace(/\s*\([^)]*\)\s*$/, '')) === want; });
      return hits.reduce(function(chain, p){
        return chain.then(function(found){
          if (found) return found;
          return fetchFn(base + 'api/rest_v1/page/summary/' + encodeURIComponent(String(p.key || p.title).replace(/ /g, '_')))
            .then(function(r){ return r.ok ? r.json() : null; }).then(function(s){
              if (!s || s.type !== 'standard' || !s.extract) return '';
              /* Kurzbeschreibung ("song by …", "Lied von …") entscheidet; ohne sie der Anfang des Artikels.
                 Gleichnamige Alben (Titelstück) nicht: die beschreiben sich als Album */
              var lead = s.description || s.extract.slice(0, 200);
              if (!INFO_SONG_RE.test(lead) || /\balbum\b/i.test(lead) && !/\b(lied|song|single)\b/i.test(lead)) return '';
              return infoNorm(lead + ' ' + s.extract.slice(0, 400)).indexOf(who) >= 0 ? s.extract : '';
            });
        });
      }, Promise.resolve(''));
    }).catch(function(){ return ''; });
}

/* -> {kind:'story', value, src} oder null; Reihenfolge wie bei Künstlern: beide Quellen in der Sprache, dann englisch */
function infoTrack(fetchFn, key, artist, title, lang) {
  lang = String(lang || 'en').toLowerCase();
  var song = infoSongName(title);
  if (!artist || !song) return Promise.resolve(null);
  var tries = [];
  (lang === 'en' ? [''] : [lang, '']).forEach(function(l){
    if (key) tries.push({src: 'Last.fm', fn: function(){ return infoLastfmTrack(fetchFn, key, artist, song, l); }});
    tries.push({src: 'Wikipedia', fn: function(){ return infoWikipediaTrack(fetchFn, artist, song, l || 'en'); }});
  });
  return tries.reduce(function(p, t){
    return p.then(function(hit){ return hit || t.fn().then(function(v){ return v ? {v: v, src: t.src} : null; }); });
  }, Promise.resolve(null)).then(function(hit){
    if (!hit) return null;
    var srcText = typeof T === 'function' ? T('infotext.source', {src: hit.src}) : 'Quelle: ' + hit.src;
    return {kind: 'story', value: hit.v + '\n\n' + srcText, src: hit.src};
  });
}

/* -> {kind:'story', value, src} oder null; lang: Sprachcode der Oberfläche (Standard 'en') */
function infoFallback(fetchFn, key, mode, artist, album, lang) {
  lang = String(lang || 'en').toLowerCase();
  if (!artist || (mode === 'storyAlbum' && !album)) return Promise.resolve(null);
  function first(tries) {
    return tries.reduce(function(p, t){
      return p.then(function(hit){ return hit || t().then(function(v){ return v ? {v: v, src: t.src} : null; }); });
    }, Promise.resolve(null));
  }
  function tr(src, fn) { fn.src = src; return fn; }
  /* erst beide Quellen in der gewählten Sprache, dann beide auf Englisch (Last.fm ohne lang = Englisch) */
  var tries = [];
  (lang === 'en' ? [''] : [lang, '']).forEach(function(l){
    if (key) tries.push(tr('Last.fm', function(){ return infoLastfm(fetchFn, key, mode, artist, album, l); }));
    if (mode === 'storyArtist') tries.push(tr('Wikipedia', function(){ return infoWikipedia(fetchFn, artist, l || 'en'); }));
  });
  return first(tries).then(function(hit){
    if (!hit) return null;
    var srcText = typeof T === 'function' ? T('infotext.source', {src: hit.src}) : 'Quelle: ' + hit.src;   /* ohne T(): Test in Node */
    return {kind: 'story', value: hit.v + '\n\n' + srcText, src: hit.src};
  });
}

if (typeof module !== 'undefined') module.exports = {infoClean: infoClean, infoFallback: infoFallback, infoTrack: infoTrack, infoSongName: infoSongName};
