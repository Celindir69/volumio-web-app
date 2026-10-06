/* Cover online suchen: Last.fm, iTunes und Cover Art Archive (MusicBrainz).
   Liefert Vorschläge [{source, url}]; die Bilder lädt der Tag-Dienst erst bei Bedarf. Node 8, nur ES5. */
var http  = require('http');
var https = require('https');
var url   = require('url');

var UA = 'volumio-web-app/1.0 ( https://github.com/Celindir69/volumio-web-app )';   /* MusicBrainz verlangt eine Kennung */
var BASE = {
  itunes:  process.env.ITUNES_URL  || 'https://itunes.apple.com',
  lastfm:  process.env.LASTFM_URL  || 'https://ws.audioscrobbler.com',
  mb:      process.env.MB_URL      || 'https://musicbrainz.org',
  caa:     process.env.CAA_URL     || 'https://coverartarchive.org'
};
var LASTFM_BLANK = '2a96cbd8b46e442fc41c2b86b821562f';      /* Platzhalter-Stern von Last.fm */

/* einfacher GET mit Weiterleitungen, Zeit- und Größengrenze: cb(err, {type, body:Buffer}) */
function fetchUrl(u, maxBytes, cb, hops) {
  var p = url.parse(u);
  if (p.protocol !== 'https:' && p.protocol !== 'http:') return cb(new Error('ungültige Adresse'));
  var done = false;
  function finish(e, r) { if (!done) { done = true; cb(e, r); } }
  var req = (p.protocol === 'https:' ? https : http).get({
    protocol: p.protocol, hostname: p.hostname, port: p.port, path: p.path,
    headers: {'User-Agent': UA, 'Accept': '*/*'}
  }, function(res){
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && (hops || 0) < 4) {
      res.resume();
      return fetchUrl(url.resolve(u, res.headers.location), maxBytes, finish, (hops || 0) + 1);
    }
    if (res.statusCode !== 200) { res.resume(); return finish(new Error('HTTP ' + res.statusCode)); }
    var parts = [], size = 0;
    res.on('data', function(d){
      size += d.length;
      if (size > maxBytes) { req.abort(); return finish(new Error('Antwort zu groß')); }
      parts.push(d);
    });
    res.on('end', function(){ finish(null, {type: String(res.headers['content-type'] || ''), body: Buffer.concat(parts)}); });
  });
  req.setTimeout(12000, function(){ req.abort(); finish(new Error('Zeitüberschreitung')); });
  req.on('error', function(e){ finish(e); });
}

function getJson(u, cb) {
  fetchUrl(u, 512 * 1024, function(e, r){
    if (e) return cb(e);
    try { cb(null, JSON.parse(r.body.toString('utf8'))); } catch (x) { cb(new Error('keine JSON-Antwort')); }
  });
}

/* Vergleichsschlüssel: ohne Akzente, Klammerzusätze ("(Remastered)"), Satzzeichen, "The " */
function key(s) {
  s = String(s || '');
  if (s.normalize) s = s.normalize('NFKD');
  s = s.replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s*[\(\[][^\)\]]*[\)\]]/g, '').replace(/^the\s+/, '').replace(/&/g, 'and');
  return s.replace(/[^a-z0-9]+/g, '');
}
function similar(a, b) { a = key(a); b = key(b); return !!a && !!b && (a === b || a.indexOf(b) === 0 || b.indexOf(a) === 0); }

/* ---------- Quellen: cb(Liste von {source, url}) ---------- */

function itunes(artist, album, cb) {
  getJson(BASE.itunes + '/search?media=music&entity=album&limit=10&term=' + encodeURIComponent(artist + ' ' + album), function(e, j){
    if (e || !j || !j.results) return cb([]);
    var hit = j.results.filter(function(r){ return similar(r.collectionName, album) && (!artist || similar(r.artistName, artist)); })[0];
    if (!hit || !hit.artworkUrl100) return cb([]);
    cb([{source: 'iTunes', url: hit.artworkUrl100.replace(/\/\d+x\d+(bb)?\.(jpg|png)$/, '/1200x1200bb.jpg')}]);
  });
}

function lastfm(artist, album, apiKey, cb) {
  if (!apiKey || !artist) return cb([]);
  getJson(BASE.lastfm + '/2.0/?method=album.getinfo&autocorrect=1&format=json&api_key=' + encodeURIComponent(apiKey) +
          '&artist=' + encodeURIComponent(artist) + '&album=' + encodeURIComponent(album), function(e, j){
    var imgs = !e && j && j.album && j.album.image;
    if (!imgs || !imgs.length) return cb([]);
    var u = '';
    imgs.forEach(function(i){ if (i && i['#text']) u = i['#text']; });           /* größte steht zuletzt */
    if (!u || u.indexOf(LASTFM_BLANK) >= 0) return cb([]);
    cb([{source: 'Last.fm', url: u.replace(/\/i\/u\/[0-9a-z]+x[0-9a-z]+\//, '/i/u/')}]);   /* Originalgröße statt 300 px */
  });
}

function coverArtArchive(artist, album, cb) {
  var q = 'releasegroup:"' + album.replace(/"/g, '') + '"' + (artist ? ' AND artist:"' + artist.replace(/"/g, '') + '"' : '');
  getJson(BASE.mb + '/ws/2/release-group/?fmt=json&limit=5&query=' + encodeURIComponent(q), function(e, j){
    var groups = (!e && j && j['release-groups']) || [];
    var hit = groups.filter(function(g){ return (g.score || 0) >= 90 && similar(g.title, album); })[0];
    if (!hit) return cb([]);
    cb([{source: 'Cover Art Archive', url: BASE.caa + '/release-group/' + hit.id + '/front-1200'}]);
  });
}

/* alle Quellen gleichzeitig; Reihenfolge der Antwort: iTunes, Last.fm, Cover Art Archive */
function search(opts, cb) {
  var artist = String(opts.artist || '').trim(), album = String(opts.album || '').trim();
  var jobs = [
    function(done){ itunes(artist, album, done); },
    function(done){ lastfm(artist, album, opts.lastfmKey, done); },
    function(done){ coverArtArchive(artist, album, done); }
  ];
  var out = new Array(jobs.length), left = jobs.length;
  jobs.forEach(function(job, i){
    job(function(list){ out[i] = list; if (--left === 0) cb([].concat.apply([], out)); });
  });
}

/* Bild laden und prüfen: cb(err, {mime, body}) */
function image(u, cb) {
  fetchUrl(u, 10 * 1024 * 1024, function(e, r){
    if (e) return cb(e);
    var b = r.body, jpeg = b[0] === 0xff && b[1] === 0xd8, png = b[0] === 0x89 && b[1] === 0x50;
    if (!jpeg && !png) return cb(new Error('kein JPEG oder PNG'));
    cb(null, {mime: jpeg ? 'image/jpeg' : 'image/png', body: b});
  });
}

module.exports = {search: search, image: image, key: key, fetchUrl: fetchUrl};
