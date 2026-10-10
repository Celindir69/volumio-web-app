/* Zugriffsschutz für die Dienste auf dem Player (Tag-Dienst; rotel/rotel-bridge.js hat eine Kopie).
   - Host: nur Adressen aus dem Heimnetz (IP, Name ohne Punkt, .local/.lan/…, eigene Liste).
     Schützt vor "DNS-Rebinding", bei dem eine fremde Webseite ihren Namen auf den Player umbiegt.
   - Origin: schickt der Browser eine Herkunft mit, muss sie zum selben Gerät gehören.
     Fremde Webseiten dürfen so weder schreiben noch Antworten lesen.
   - Ändernde Anfragen ohne Origin (curl, analyse.py) brauchen den Kopf X-Xplorio
     oder einen JSON-Inhaltstyp; beides kann eine fremde Seite nicht unbemerkt senden. */

var LOCAL_SUFFIX = /\.(local|lan|home|internal|home\.arpa|fritz\.box|localdomain)$/;

/* "Name:Port" bzw. "[::1]:Port" -> Name in Kleinbuchstaben */
function hostName(h) {
  h = String(h || '').trim().toLowerCase();
  if (h.charAt(0) === '[') { var e = h.indexOf(']'); return e > 0 ? h.slice(1, e) : ''; }
  var i = h.indexOf(':');
  if (i >= 0 && h.indexOf(':', i + 1) < 0) h = h.slice(0, i);    /* IPv6 ohne Klammern: unverändert */
  return h.replace(/\.$/, '');
}

function isIp(h) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || (h.indexOf(':') >= 0 && /^[0-9a-f:.]+$/.test(h));
}

/* extra: zusätzliche erlaubte Namen (APP_CONFIG.ALLOWED_HOSTS) */
function hostOk(h, extra) {
  var n = hostName(h);
  if (!n) return false;
  if ((extra || []).some(function(x){ return hostName(x) === n; })) return true;
  return n === 'localhost' || isIp(n) || /^[a-z0-9-]+$/.test(n) || LOCAL_SUFFIX.test(n);
}

/* Herkunft "http://name:port" -> Name, sonst '' ("null", file:, Unsinn) */
function originName(o) {
  var m = /^https?:\/\/([^\/?#]+)$/i.exec(String(o || '').trim());
  return m ? hostName(m[1].replace(/^[^@]*@/, '')) : '';
}

/* Prüft eine Anfrage. Ergebnis: {ok, origin, reason}
   origin: die erlaubte Herkunft für Access-Control-Allow-Origin ('' = keine)
   write:  true für Anfragen, die etwas ändern */
function check(req, write, extra) {
  var h = req.headers || {}, host = h.host, origin = h.origin;
  if (!hostOk(host, extra)) return {ok: false, origin: '', reason: 'host'};
  if (origin !== undefined) {
    var on = originName(origin);
    if (!on || on !== hostName(host) && !(extra || []).some(function(x){ return hostName(x) === on; }))
      return {ok: false, origin: '', reason: 'origin'};
    return {ok: true, origin: String(origin).trim(), reason: ''};
  }
  if (write && !h['x-xplorio'] && !/^application\/(json|x-ndjson)\b/i.test(String(h['content-type'] || '')))
    return {ok: false, origin: '', reason: 'marker'};
  return {ok: true, origin: '', reason: ''};
}

/* Kopfzeilen für CORS: nur für die erlaubte Herkunft */
function corsHeaders(origin) {
  var o = {'Vary': 'Origin'};
  if (origin) {
    o['Access-Control-Allow-Origin'] = origin;
    o['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    o['Access-Control-Allow-Headers'] = 'Content-Type, X-Xplorio';
    o['Access-Control-Max-Age'] = '600';
  }
  return o;
}

/* Liste aus APP_CONFIG.ALLOWED_HOSTS bzw. Umgebungsvariable XPLORIO_HOSTS ("a,b") */
function extraHosts(cfg, env) {
  var l = [].concat(cfg && cfg.ALLOWED_HOSTS || []);
  if (env) l = l.concat(String(env).split(','));
  return l.map(function(x){ return String(x).trim(); }).filter(Boolean);
}

module.exports = {hostName: hostName, hostOk: hostOk, originName: originName, check: check,
                  corsHeaders: corsHeaders, extraHosts: extraHosts};
