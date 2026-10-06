/* Verlauf: Wiedergaben mitschreiben (über Volumios getState), speichern und auswerten.
   Ein Titel zählt als gespielt, wenn er länger als 30 s ist und zur Hälfte oder 4 Minuten lief (wie beim Scrobbeln).
   Jede Wiedergabe ist eine Zeile in plays.jsonl: {t: Start (Unix-Sekunden), ar, ti, al, u: uri, d: Dauer s, s: Quelle}.
   Node 8, nur ES5. */
var fs   = require('fs');
var path = require('path');

var MIN_TRACK  = 30;          /* s: kürzere Titel zählen nie */
var MAX_NEEDED = 240;         /* s: nach 4 Minuten zählt jeder Titel */
var MAX_STEP   = 30000;       /* ms: mehr Spielzeit pro Abfrage wird nicht angerechnet (Dienst hing, Rechner schlief) */
var DUP_WINDOW = 300;         /* s: gleicher Titel innerhalb von 5 min = dieselbe Wiedergabe (Last.fm-Abgleich) */

/* Vergleichsschlüssel: ohne Akzente, Groß-/Kleinschreibung, Satzzeichen */
function norm(s) {
  s = String(s || '');
  if (s.normalize) s = s.normalize('NFKD');
  return s.replace(/[̀-ͯ]/g, '').toLowerCase().replace(/^the\s+/, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');
}
/* normierte Schlüssel einmal je Eintrag rechnen (nicht aufzählbar: landen nicht in JSON und Datei) */
function keys(e) {
  if (!e._n) Object.defineProperty(e, '_n', {value: {ar: norm(e.ar), ti: norm(e.ti), al: e.al ? norm(e.al) : ''}});
  return e._n;
}
function trackKey(e) { var k = keys(e); return k.ar + '|' + k.ti; }

/* ---------- Speicher ---------- */

function Store(file) { this.file = file; this.list = null; }

Store.prototype.load = function() {
  if (this.list) return this.list;
  var list = [], txt = '';
  try { txt = fs.readFileSync(this.file, 'utf8'); } catch (e) { /* noch leer */ }
  txt.split('\n').forEach(function(line){
    if (!line) return;
    try { var e = JSON.parse(line); if (e && e.t && e.ti) list.push(e); } catch (x) { /* kaputte Zeile überspringen */ }
  });
  list.sort(function(a, b){ return a.t - b.t; });
  this.list = list;
  return list;
};

/* Einträge anhängen (Datei und Speicher); liefert true, wenn geschrieben */
Store.prototype.add = function(entries) {
  if (!entries.length) return true;
  var list = this.load(), ok = true;
  try { fs.mkdirSync(path.dirname(this.file)); } catch (e) { /* existiert schon */ }
  try { fs.appendFileSync(this.file, entries.map(function(e){ return JSON.stringify(e); }).join('\n') + '\n'); }
  catch (e) { ok = false; }
  var sorted = list.length === 0 || entries.every(function(e){ return e.t >= list[list.length - 1].t; });
  var idx = this.idx;
  entries.forEach(function(e){
    list.push(e);
    if (idx) { var k = trackKey(e); (idx[k] || (idx[k] = [])).push(e.t); }
  });
  if (!sorted) list.sort(function(a, b){ return a.t - b.t; });
  return ok;
};

/* nur die Einträge, die noch nicht im Verlauf stehen (gleicher Titel innerhalb von 5 min) */
Store.prototype.fresh = function(entries) {
  var idx = this.idx, seen = {};
  if (!idx) {                                            /* Titel -> Zeiten; bleibt danach im Speicher (add pflegt ihn mit) */
    idx = this.idx = {};
    this.load().forEach(function(e){ var k = trackKey(e); (idx[k] || (idx[k] = [])).push(e.t); });
  }
  return entries.filter(function(e){
    var k = trackKey(e), ts = (idx[k] || []).concat(seen[k] || []);
    for (var i = 0; i < ts.length; i++) if (Math.abs(ts[i] - e.t) <= DUP_WINDOW) return false;
    (seen[k] || (seen[k] = [])).push(e.t);
    return true;
  });
};

/* ---------- Mitschreiben ---------- */

/* update(state, jetzt in ms) mit jeder getState-Antwort aufrufen; onPlay(entry) für jede gezählte Wiedergabe,
   onStart(entry) wenn ein neuer Titel zu spielen beginnt (für "läuft gerade") */
function Tracker(onPlay, onStart) {
  this.cur = null;
  this.onPlay = onPlay;
  this.onStart = onStart || function(){};
}

function stateKey(st) { return [st.uri || '', st.artist || '', st.title || ''].join('\n'); }
function countable(st) {
  return !!(st && st.title && st.artist && st.service !== 'webradio' && st.trackType !== 'webradio');
}

Tracker.prototype.finish = function() {
  var c = this.cur;
  this.cur = null;
  if (!c) return;
  var played = c.played / 1000, d = c.entry.d;
  var needed = d > 0 ? Math.min(d / 2, MAX_NEEDED) : MAX_NEEDED;
  if ((d > 0 && d <= MIN_TRACK) || played < needed || played < MIN_TRACK) return;
  this.onPlay(c.entry);
};

Tracker.prototype.update = function(st, now) {
  st = st || {};
  var c = this.cur, seek = Math.max(0, Number(st.seek) || 0);
  var playing = st.status === 'play';
  var same = !!c && stateKey(st) === c.key;
  if (same && playing && seek + 5000 < c.seek && seek < 15000) same = false;     /* von vorn (Wiederholen) */

  if (c && c.playing) {
    var step = Math.min(now - c.last, MAX_STEP);
    if (!same && playing) step -= seek;                  /* der neue Titel läuft schon seit "seek" */
    c.played += Math.max(0, step);
  }
  if (c && (!same || st.status === 'stop')) this.finish();
  c = this.cur;
  if (!c && playing && countable(st)) {
    c = this.cur = {
      key: stateKey(st), played: Math.min(seek, MAX_STEP), seek: seek,
      entry: {t: Math.round((now - seek) / 1000), ar: st.artist, ti: st.title, al: st.album || '',
              u: st.uri || '', d: Math.round(Number(st.duration) || 0), s: st.service || ''}
    };
    if (!c.entry.al) delete c.entry.al;
    if (!c.entry.u) delete c.entry.u;
    if (!c.entry.d) delete c.entry.d;
    if (seek < 15000) this.onStart(c.entry);
  }
  if (c) { c.playing = playing; c.last = now; c.seek = seek; }
};

/* ---------- Auswerten ---------- */

var DAY = 86400;

/* Ortszeit: Versatz in Minuten für Winter (tzw) und Sommer (tzs); Umstellung nach EU-Regel */
function lastSunday(y, m) { var d = new Date(Date.UTC(y, m + 1, 0, 1)); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d.getTime() / 1000; }
function local(t, tz) {
  var off = tz.w;
  if (tz.s !== tz.w) {
    var y = new Date(t * 1000).getUTCFullYear();
    if (t >= lastSunday(y, 2) && t < lastSunday(y, 9)) off = tz.s;
  }
  return new Date((t + off * 60) * 1000);              /* nur getUTC… verwenden */
}
function two(n) { return (n < 10 ? '0' : '') + n; }
function dayKey(d) { return d.getUTCFullYear() + '-' + two(d.getUTCMonth() + 1) + '-' + two(d.getUTCDate()); }
function monthKey(d) { return d.getUTCFullYear() + '-' + two(d.getUTCMonth() + 1); }

function rangeStart(range, now) {
  if (range === 'd30') return now - 30 * DAY;
  if (range === 'm12') return now - 365 * DAY;
  return 0;
}
function since(list, t) {
  var lo = 0, hi = list.length;                           /* Liste ist nach t sortiert */
  while (lo < hi) { var mid = (lo + hi) >> 1; if (list[mid].t < t) lo = mid + 1; else hi = mid; }
  return list.slice(lo);
}

/* neueste zuerst, vor "before" */
function recent(list, before, limit) {
  var out = [];
  for (var i = list.length - 1; i >= 0 && out.length < limit; i--) if (!before || list[i].t < before) out.push(list[i]);
  return out;
}

/* Meistgespielt: kind track|album|artist */
function top(list, kind, from, limit) {
  var part = since(list, from), groups = {}, order = [];
  var albumDir = {};                                     /* Album+Interpret -> Ordner: Sampler-Titel verschiedener Interpreten zusammen */
  if (kind === 'album') part.forEach(function(e){
    if (e.al && e.u && !/^[a-z]+:\/\//.test(e.u)) albumDir[keys(e).al + '|' + keys(e).ar] = path.dirname(e.u);
  });
  for (var i = part.length - 1; i >= 0; i--) {           /* neueste zuerst: Anzeige und uri vom letzten Mal */
    var e = part[i], k;
    if (kind === 'artist') k = keys(e).ar;
    else if (kind === 'album') { if (!e.al) continue; k = keys(e).al + '|' + keys(e).ar; k = albumDir[k] || k; }
    else k = trackKey(e);
    if (!k) continue;
    var g = groups[k];
    if (!g) {
      g = groups[k] = {n: 0, last: e.t, ar: e.ar, artists: {}};
      if (kind !== 'artist') { g.ti = kind === 'album' ? e.al : e.ti; g.al = e.al || ''; }
      order.push(k);
    }
    g.n++;
    g.artists[keys(e).ar] = true;
    if (!g.u && e.u) g.u = kind === 'album' && !/^[a-z]+:\/\//.test(e.u) ? path.dirname(e.u) : (kind === 'track' ? e.u : undefined);
  }
  return order.map(function(k){
    var g = groups[k], o = {n: g.n, last: g.last, ar: g.ar};
    if (kind === 'album' && Object.keys(g.artists).length > 2) o.ar = 'Verschiedene';
    if (g.ti) o.ti = g.ti;
    if (kind === 'track' && g.al) o.al = g.al;
    if (g.u) o.u = g.u;
    return o;
  }).sort(function(a, b){ return b.n - a.n || b.last - a.last; }).slice(0, limit);
}

/* Statistik: Summen, Verlauf (Tage/Monate/Jahre), Tageszeit, Wochentag */
function stats(list, range, now, tz) {
  var from = rangeStart(range, now), part = since(list, from);
  var known = part.filter(function(e){ return e.d > 0; }).map(function(e){ return e.d; }).sort(function(a, b){ return a - b; });
  var est = known.length ? known[known.length >> 1] : MAX_NEEDED;
  var res = {plays: part.length, seconds: 0, estimated: 0, tracks: 0, artists: 0, albums: 0,
             unit: range === 'd30' ? 'day' : range === 'm12' ? 'month' : 'year', buckets: [],
             hours: [], weekdays: [0, 0, 0, 0, 0, 0, 0], first: list.length ? list[0].t : null};
  for (var h = 0; h < 24; h++) res.hours.push(0);
  var bkeys = [], idx = {}, tr = {}, ar = {}, al = {};
  function bucket(k) { if (!(k in idx)) { idx[k] = bkeys.length; bkeys.push(k); } }
  var nowL = local(now, tz);
  if (res.unit === 'day') for (var i = 29; i >= 0; i--) bucket(dayKey(local(now - i * DAY, tz)));
  else if (res.unit === 'month') {
    for (i = 11; i >= 0; i--) bucket(monthKey(new Date(Date.UTC(nowL.getUTCFullYear(), nowL.getUTCMonth() - i, 1))));
  } else if (part.length) {
    for (var y = local(part[0].t, tz).getUTCFullYear(); y <= nowL.getUTCFullYear(); y++) bucket(String(y));
  }
  var counts = bkeys.map(function(){ return 0; });
  part.forEach(function(e){
    var d = local(e.t, tz);
    var k = res.unit === 'day' ? dayKey(d) : res.unit === 'month' ? monthKey(d) : String(d.getUTCFullYear());
    if (k in idx) counts[idx[k]]++;
    res.hours[d.getUTCHours()]++;
    res.weekdays[(d.getUTCDay() + 6) % 7]++;            /* Montag zuerst */
    if (e.d > 0) res.seconds += e.d; else { res.seconds += est; res.estimated++; }
    tr[trackKey(e)] = 1; ar[keys(e).ar] = 1;
    if (e.al) al[keys(e).al + '|' + keys(e).ar] = 1;
  });
  res.buckets = bkeys.map(function(k, i){ return {k: k, n: counts[i]}; });
  res.tracks = Object.keys(tr).length; res.artists = Object.keys(ar).length; res.albums = Object.keys(al).length;
  return res;
}

module.exports = {Store: Store, Tracker: Tracker, recent: recent, top: top, stats: stats, rangeStart: rangeStart,
                  norm: norm, trackKey: trackKey, local: local};
