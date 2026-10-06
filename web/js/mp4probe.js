/* Codec einer m4a-Datei bestimmen: ALAC (verlustfrei) oder AAC (verlustbehaftet).
   getState verrät das nicht, die Datei schon: Der Player liefert seine Dateien unter /music/... aus
   (inklusive Teilabrufen). Wir lesen nur die Kopf-Boxen (ftyp, ggf. mdat überspringen, moov) und darin den
   Sample-Eintrag ("alac" oder "mp4a"); bei ALAC steht dort auch die echte Bit-Tiefe.
   Reine Teile (mp4Audio, mp4Candidates) sind mit tests/mp4probe.test.js prüfbar.
   Klassisches Skript, gemeinsamer globaler Gültigkeitsbereich; Reihenfolge siehe app.html. */

var MP4_BASE = '';                 /* Vorsatz für Adressen; leer = gleiche Herkunft wie die Seite */
var MP4_WINDOW = 65536;            /* so viel wird pro Schritt vom Dateianfang bzw. nach mdat gelesen */
var MP4_MOOV_MAX = 524288;         /* so viel von moov höchstens (stsd liegt weit vorn) */
var mp4Cache = {};                 /* uri -> {codec, bits, rate} | false (nicht bestimmbar) */
var mp4Pending = {};

function mp4U32(b, o) { return b[o] * 16777216 + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3]; }
function mp4Type(b, o) { return String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]); }

/* Kind-Boxen zwischen start und end; fn(type, payloadStart, boxEnd); true = abbrechen */
function mp4Boxes(b, start, end, fn) {
  var o = start;
  while (o + 8 <= end) {
    var size = mp4U32(b, o), type = mp4Type(b, o + 4), hdr = 8;
    if (size === 1) {
      if (o + 16 > end) return false;
      size = mp4U32(b, o + 8) * 4294967296 + mp4U32(b, o + 12); hdr = 16;
    } else if (size === 0) { size = end - o; }
    if (size < hdr) return false;
    if (fn(type, o + hdr, Math.min(o + size, end)) === true) return true;
    o += size;
  }
  return false;
}

/* Sample-Eintrag aus "stsd": {codec:'alac'|'aac'|<fourcc>, bits, rate} */
function mp4Entry(b, p, e) {
  if (p + 16 > e) return null;
  var four = mp4Type(b, p + 12), entryEnd = Math.min(p + 8 + mp4U32(b, p + 8), e);
  if (four === 'mp4a') return { codec: 'aac' };
  if (four === 'alac') {
    var res = { codec: 'alac' };
    mp4Boxes(b, p + 8 + 8 + 28, entryEnd, function(type, ps, pe){
      if (type === 'alac' && ps + 4 + 24 <= pe + 0) {
        var c = ps + 4;                    /* nach Version/Flags: ALACSpecificConfig */
        res.bits = b[c + 5]; res.rate = mp4U32(b, c + 20);
        return true;
      }
    });
    return res;
  }
  return { codec: four };
}

function mp4Trak(b, s, e) {
  var soun = false, res = null;
  mp4Boxes(b, s, e, function(type, ps, pe){
    if (type !== 'mdia') return;
    mp4Boxes(b, ps, pe, function(t2, p2, e2){
      if (t2 === 'hdlr') { soun = (p2 + 12 <= e2 && mp4Type(b, p2 + 8) === 'soun'); }
      else if (t2 === 'minf') {
        mp4Boxes(b, p2, e2, function(t3, p3, e3){
          if (t3 !== 'stbl') return;
          mp4Boxes(b, p3, e3, function(t4, p4, e4){
            if (t4 === 'stsd') { res = mp4Entry(b, p4, e4); return true; }
          });
          return true;
        });
      }
    });
  });
  return soun ? res : null;
}

/* b: Bytes ab dem Anfang der moov-Box (inkl. Kopf), start = Länge des Kopfes */
function mp4Audio(b, start, end) {
  var res = null;
  mp4Boxes(b, start, end, function(type, ps, pe){
    if (type === 'trak') { var r = mp4Trak(b, ps, pe); if (r) { res = r; return true; } }
  });
  return res;
}

/* uri aus getState -> mögliche Pfade unter /music (Volumio-Adressen sind nicht immer echte Dateipfade) */
function mp4Candidates(uri) {
  var u = String(uri || '').replace(/^\/+/, ''), list = [], rest;
  function add(p) { if (list.indexOf(p) < 0) list.push(p); }
  if (/^music-library\//.test(u)) {
    rest = u.slice('music-library/'.length);
    add('mnt/' + rest); if (/^INTERNAL\//.test(rest)) add('data/' + rest);
  } else if (/^mnt\//.test(u) || /^data\//.test(u)) { add(u); }
  else { add('mnt/' + u); if (/^INTERNAL\//.test(u)) add('data/' + u); }
  return list.map(function(p){ return MP4_BASE + '/music/' + p.split('/').map(encodeURIComponent).join('/'); });
}

function mp4Range(url, from, len) {
  return fetch(url, { headers: { Range: 'bytes=' + from + '-' + (from + len - 1) } }).then(function(r){
    if (r.status !== 206) {               /* Server ignoriert Teilabrufe: nicht die ganze Datei laden */
      try { r.body.cancel(); } catch (e) { /* egal */ }
      throw new Error('http ' + r.status);
    }
    return r.arrayBuffer();
  }).then(function(ab){ return new Uint8Array(ab); });
}

/* Codec einer einzelnen Adresse; Promise<{codec,…}|null> */
function mp4Probe(url) {
  var steps = 0;
  function at(off) {
    if (++steps > 8) return Promise.resolve(null);
    return mp4Range(url, off, MP4_WINDOW).then(function(b){
      var o = 0, next = -1;
      while (o + 8 <= b.length) {
        var size = mp4U32(b, o), type = mp4Type(b, o + 4), hdr = 8;
        if (size === 1) { if (o + 16 > b.length) break; size = mp4U32(b, o + 8) * 4294967296 + mp4U32(b, o + 12); hdr = 16; }
        if (type === 'moov') return moov(off + o, size, hdr);
        if (size === 0 || size < hdr) return null;
        o += size;
        if (o >= b.length) { next = off + o; break; }
      }
      return next >= 0 ? at(next) : null;
    });
  }
  function moov(off, size, hdr) {
    return mp4Range(url, off, Math.min(size, MP4_MOOV_MAX)).then(function(b){ return mp4Audio(b, hdr, b.length); });
  }
  return at(0);
}

/* Codec zu einer getState-uri (mit Zwischenspeicher); Promise<{…}|false> */
function mp4Codec(uri) {
  if (mp4Cache.hasOwnProperty(uri)) return Promise.resolve(mp4Cache[uri]);
  var urls = mp4Candidates(uri);
  function next(i) {
    if (i >= urls.length) return Promise.resolve(false);
    return mp4Probe(urls[i]).then(function(r){ return r || next(i + 1); }, function(){ return next(i + 1); });
  }
  return next(0).then(function(r){ mp4Cache[uri] = r; return r; });
}

/* Trägt das Prüfergebnis in den Titel ein (st.fileCodec: Objekt | false | undefined = läuft noch)
   und ruft repaint(), sobald es da ist. */
function mp4Attach(st, repaint) {
  var type = String((st && (st.fileFormat || st.trackType)) || '').toLowerCase();
  if ((type !== 'm4a' && type !== 'mp4') || !st.uri || /^https?:/i.test(st.uri) || (window.APP_CONFIG && window.APP_CONFIG.M4A_PROBE === false)) return;
  if (mp4Cache.hasOwnProperty(st.uri)) { st.fileCodec = mp4Cache[st.uri]; return; }
  st.fileCodec = undefined;
  if (mp4Pending[st.uri]) return;
  mp4Pending[st.uri] = true;
  mp4Codec(st.uri).then(function(){ delete mp4Pending[st.uri]; repaint(); }, function(){ delete mp4Pending[st.uri]; repaint(); });
}
