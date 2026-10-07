/* Ersatz für Volumios Künstler- und Albumtexte (metavolumio), wenn die nichts liefern: Volumio 4 gibt sie nur mit
   bezahltem Abo heraus. Erst Last.fm (braucht LASTFM_KEY, deutsch, sonst englisch), für Künstler dann Wikipedia
   (deutsch, sonst englisch, ohne Schlüssel). Klassisches Skript, ES5; im Test mit eigenem fetch. */

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

/* -> {kind:'story', value, src} oder null */
function infoFallback(fetchFn, key, mode, artist, album) {
  if (!artist || (mode === 'storyAlbum' && !album)) return Promise.resolve(null);
  function first(tries) {
    return tries.reduce(function(p, t){
      return p.then(function(hit){ return hit || t().then(function(v){ return v ? {v: v, src: t.src} : null; }); });
    }, Promise.resolve(null));
  }
  function tr(src, fn) { fn.src = src; return fn; }
  var tries = [];
  if (key) {
    tries.push(tr('Last.fm', function(){ return infoLastfm(fetchFn, key, mode, artist, album, 'de'); }));
    tries.push(tr('Last.fm', function(){ return infoLastfm(fetchFn, key, mode, artist, album, ''); }));
  }
  if (mode === 'storyArtist') {
    tries.push(tr('Wikipedia', function(){ return infoWikipedia(fetchFn, artist, 'de'); }));
    tries.push(tr('Wikipedia', function(){ return infoWikipedia(fetchFn, artist, 'en'); }));
  }
  return first(tries).then(function(hit){
    return hit ? {kind: 'story', value: hit.v + '\n\nQuelle: ' + hit.src, src: hit.src} : null;
  });
}

if (typeof module !== 'undefined') module.exports = {infoClean: infoClean, infoFallback: infoFallback};
