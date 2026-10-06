/* Cover-Farbstimmung: eine Akzentfarbe und eine Hintergrundtönung aus dem Cover des laufenden Titels.
   pickMood() ist eine reine Funktion (Pixel -> Farben) und mit tests/color.test.js prüfbar;
   updateMood() lädt das Cover klein in eine Zeichenfläche und setzt die CSS-Variablen
   --accent und --bg-tint. Nur Cover vom eigenen Player (same origin bzw. /albumart) werden gelesen:
   fremde Server (z. B. Tidal, TuneIn) senden keine CORS-Kopfzeile, dort bleibt es bei der Standardoptik.
   Klassisches Skript, gemeinsamer globaler Gültigkeitsbereich; Reihenfolge siehe app.html. */

function cmClamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

function cmHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, h = 0, s = 0, d = mx - mn;
  if (d > 0) {
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return [h, s, l];
}

/* px: flache RGBA-Liste (wie ImageData.data). Ergebnis {hue, accent, tint} oder null (Cover ohne Farbe) */
function pickMood(px) {
  var BINS = 36, bins = [], i, valid = 0, colored = 0;
  for (i = 0; i < BINS; i++) bins.push({ w: 0, s: 0, l: 0 });
  for (i = 0; i + 3 < px.length; i += 4) {
    if (px[i + 3] < 200) continue;
    var c = cmHsl(px[i], px[i + 1], px[i + 2]), h = c[0], s = c[1], l = c[2];
    if (l < 0.10 || l > 0.92) continue;           /* fast schwarz oder weiß zählt nicht */
    valid++;
    if (s < 0.18) continue;                       /* Grautöne zählen nicht */
    colored++;
    var w = s * (1 - Math.abs(l - 0.5) * 1.4);    /* kräftige Mitteltöne zählen am meisten */
    if (w <= 0) continue;
    var b = bins[Math.floor(h / (360 / BINS)) % BINS];
    b.w += w; b.s += s * w; b.l += l * w;
  }
  if (valid < 8 || colored / valid < 0.15) return null;   /* Cover (fast) ohne Farbe */
  var best = -1, bestW = 0;
  for (i = 0; i < BINS; i++) {
    var sum = bins[i].w + bins[(i + BINS - 1) % BINS].w + bins[(i + 1) % BINS].w;
    if (sum > bestW) { bestW = sum; best = i; }
  }
  if (best < 0) return null;
  /* Mittelwert der drei Fächer (Farbton als Kreismittel) */
  var sx = 0, sy = 0, tw = 0, ts = 0, tl = 0;
  [-1, 0, 1].forEach(function(o){
    var k = (best + o + BINS) % BINS, bw = bins[k].w;
    if (!bw) return;
    var ang = (k + 0.5) * (360 / BINS) * Math.PI / 180;
    sx += Math.cos(ang) * bw; sy += Math.sin(ang) * bw; tw += bw; ts += bins[k].s; tl += bins[k].l;
  });
  var hue = Math.round(((Math.atan2(sy, sx) * 180 / Math.PI) + 360) % 360);
  var avgS = ts / tw, avgL = tl / tw;
  var s = cmClamp(avgS, 0.45, 0.85);
  var accentL = cmClamp(avgL * 0.5 + 0.34, 0.58, 0.72);     /* hell genug für dunklen Hintergrund */
  var tintS = cmClamp(avgS * 0.9, 0.30, 0.65);
  return {
    hue: hue,
    accent: 'hsl(' + hue + ', ' + Math.round(s * 100) + '%, ' + Math.round(accentL * 100) + '%)',
    tint: 'hsla(' + hue + ', ' + Math.round(tintS * 100) + '%, 34%, 0.42)'
  };
}

function applyMood(m) {
  var root = document.documentElement.style;
  if (m) { root.setProperty('--accent', m.accent); root.setProperty('--bg-tint', m.tint); }
  else { root.removeProperty('--accent'); root.removeProperty('--bg-tint'); }
}

var moodCache = {};      /* Cover-Adresse -> {…} oder null */
var moodSeq = 0;

function moodReadable(url) {
  try { return new URL(url, location.href).origin === location.origin || url.indexOf('/albumart') > -1; }
  catch (e) { return false; }
}

function updateMood(url) {
  var cfg = window.APP_CONFIG || {};
  var mySeq = ++moodSeq;
  if (cfg.COLOR_MOOD === false || !url || !moodReadable(url)) { applyMood(null); return; }
  if (moodCache.hasOwnProperty(url)) { applyMood(moodCache[url]); return; }
  var img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = function(){
    var m = null;
    try {
      var N = 24, cv = document.createElement('canvas'); cv.width = cv.height = N;
      var ctx = cv.getContext('2d');
      ctx.drawImage(img, 0, 0, N, N);
      m = pickMood(ctx.getImageData(0, 0, N, N).data);
    } catch (e) { m = null; }
    moodCache[url] = m;
    if (mySeq === moodSeq) applyMood(m);       /* nur, wenn inzwischen kein anderer Titel läuft */
  };
  img.onerror = function(){ moodCache[url] = null; if (mySeq === moodSeq) applyMood(null); };
  /* eigener Parameter, damit eine ohne CORS zwischengespeicherte Fassung des Covers nicht wiederverwendet wird */
  img.src = url + (url.indexOf('?') > -1 ? '&' : '?') + 'aw=mood';
}
