/* Qualitätsanzeige: ordnet den Titel aus getState ein (Hi-Res, Lossless, DSD, Lossy, Radio)
   und liefert die Technikzeile. Reine Funktion ohne Zugriff auf die Seite, damit sie sich mit
   tests/quality.test.js prüfen lässt.
   Klassisches Skript, gemeinsamer globaler Gültigkeitsbereich; Reihenfolge siehe app.html. */

/* Dateitypen (trackType bzw. fileFormat), in Kleinbuchstaben */
var Q_LOSSLESS = ['flac', 'wav', 'aiff', 'aif', 'alac', 'ape', 'wv', 'tta', 'tak'];
var Q_DSD      = ['dsf', 'dff', 'dsd'];
var Q_LOSSY    = ['mp3', 'mp2', 'aac', 'ogg', 'oga', 'opus', 'wma'];
var Q_SERVICES = ['tidal', 'qobuz', 'hra'];       /* Streaming mit Qualitätsstufen: Einordnung über Rate, Bit-Tiefe, Bitrate */

/* "44.1 kHz" -> 44100, "2.82 MHz" -> 2820000, sonst 0 */
function qParseRate(s) {
  var m = /([\d.,]+)\s*(khz|mhz|hz)/i.exec(String(s || ''));
  if (!m) return 0;
  var n = parseFloat(m[1].replace(',', '.')), u = m[2].toLowerCase();
  return Math.round(u === 'mhz' ? n * 1e6 : (u === 'khz' ? n * 1e3 : n));
}
function qParseBits(s) { var m = /(\d+)\s*bit/i.exec(String(s || '')); return m ? parseInt(m[1], 10) : 0; }
function qParseKbps(s) { var m = /(\d+)\s*kbps/i.exec(String(s || '')); return m ? parseInt(m[1], 10) : 0; }

/* DSD64 = 2,8224 MHz, DSD128 = 5,6448 MHz, ... */
function qDsdName(hz) {
  var steps = [64, 128, 256, 512, 1024], best = 64, bestDiff = 1e12;
  steps.forEach(function(n){ var d = Math.abs(hz - n * 44100); if (d < bestDiff) { bestDiff = d; best = n; } });
  return 'DSD' + best;
}

/* cfg: { M4A_LOSSLESS: true } – m4a kann ALAC (verlustfrei) oder AAC (verlustbehaftet) sein, getState verrät es nicht.
   Ist st.fileCodec gesetzt (mp4probe.js), gilt die Angabe aus der Datei: {codec:'alac'|'aac', bits}; false = nicht
   bestimmbar (dann M4A_LOSSLESS); undefined = Prüfung läuft noch (dann kein Abzeichen, nur die Technikzeile). */
function classifyQuality(st, cfg) {
  cfg = cfg || {};
  st = st || {};
  var type = String(st.fileFormat || st.trackType || '').toLowerCase();
  var service = String(st.service || '').toLowerCase();
  var rate = qParseRate(st.samplerate), bits = qParseBits(st.bitdepth), kbps = qParseKbps(st.bitrate);
  var fmt = (st.fileFormat || (type !== 'webradio' ? st.trackType : '') || '').toString().toUpperCase();
  var kind = '', label = '', tech = [];

  if (type === 'webradio' || service === 'webradio') {
    kind = 'radio'; label = 'Radio';
    if (kbps) tech.push(kbps + ' kbps');
    return { kind: kind, label: label, tech: tech };
  }

  var lossless = null;                      /* true, false oder null = unbekannt */
  if (Q_DSD.indexOf(type) > -1 || rate >= 2.8e6) { kind = 'dsd'; label = qDsdName(rate || 2822400); }
  else if (Q_LOSSLESS.indexOf(type) > -1) lossless = true;
  else if (Q_LOSSY.indexOf(type) > -1 || service === 'spotify' || service === 'spop') lossless = false;
  else if (type === 'm4a' || type === 'mp4') {
    var fc = st.fileCodec;
    if (fc && fc.codec === 'alac') { lossless = true; if (fc.bits) bits = fc.bits; }
    else if (fc && fc.codec === 'aac') { lossless = false; fmt = 'AAC'; }
    else if (fc === undefined && st.hasOwnProperty('fileCodec')) lossless = null;       /* Prüfung läuft noch */
    else lossless = (cfg.M4A_LOSSLESS === false) ? null : true;
  }
  else if (Q_SERVICES.indexOf(service) > -1 || Q_SERVICES.indexOf(type) > -1) {
    lossless = (kbps && kbps < 400) ? false : true;     /* z. B. AAC 96/320 kbps = verlustbehaftet */
  }

  if (!kind) {
    if (lossless === true)  { kind = (bits > 16 || rate > 48000) ? 'hires' : 'lossless'; label = (kind === 'hires') ? 'Hi-Res' : 'Lossless'; }
    else if (lossless === false) { kind = 'lossy'; label = 'Lossy'; }
  }

  /* Technikzeile: bei verlustbehafteten Titeln ohne Bit-Tiefe (MPD meldet dort die Decoder-Tiefe, z. B. 24 bit bei MP3) */
  if (st.samplerate) tech.push(st.samplerate);
  if (bits && kind !== 'lossy' && kind !== 'dsd' && bits !== qParseBits(st.bitdepth)) tech.push(bits + ' bit');
  else if (st.bitdepth && kind !== 'lossy') tech.push(st.bitdepth);
  if (fmt) tech.push(fmt);
  if (kind === 'lossy' && kbps) tech.push(kbps + ' kbps');
  return { kind: kind, label: label, tech: tech };
}
