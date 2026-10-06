/* Textfunktionen für den Tag-Editor (Wortanfänge groß, Title Case, klein, GROSS, Leerzeichen, Ersetzen).
   Klassisches Skript im globalen Gültigkeitsbereich; für die Tests auch per require() ladbar. */

/* Englische Kleinwörter, die im Title Case klein bleiben (außer am Anfang, am Ende und nach : ( - usw.) */
var TEXT_SMALL_WORDS = ['a', 'an', 'the', 'and', 'but', 'or', 'nor', 'for', 'of', 'on', 'in', 'at', 'to', 'by',
                        'as', 'vs', 'vs.', 'via'];

function textIsLetter(ch) { return ch.toLowerCase() !== ch.toUpperCase(); }
function textHasLower(s)  { for (var i = 0; i < s.length; i++) if (textIsLetter(s[i]) && s[i] === s[i].toLowerCase()) return true; return false; }

/* Nach diesen Zeichen beginnt ein neues Wort (Apostroph nicht: "don't" bleibt "Don't") */
var TEXT_WORD_START = ' \t(["{-/.&+_';

/* "tears for fears" -> "Tears For Fears". Der Rest eines Wortes bleibt, wie er ist ("AC/DC", "McCartney"),
   außer der ganze Text aus mehreren Wörtern ist in GROSSBUCHSTABEN ("TEARS FOR FEARS"): dann zuerst alles klein.
   Ein einzelnes Wort in Großbuchstaben bleibt ("ABBA", "AC/DC"). */
function textWords(s) {
  s = String(s || '');
  if (!textHasLower(s) && /\S\s+\S/.test(s)) s = s.toLowerCase();
  var out = '', start = true;
  for (var i = 0; i < s.length; i++) {
    var ch = s[i];
    if (start && textIsLetter(ch)) { out += ch.toUpperCase(); start = false; }
    else {
      out += ch;
      if (TEXT_WORD_START.indexOf(ch) >= 0) start = true;
      else if (textIsLetter(ch) || /[0-9]/.test(ch)) start = false;
    }
  }
  return out;
}

/* Wie textWords, aber englische Kleinwörter (of, the, and …) bleiben klein, außer am Anfang und am Ende
   und am Anfang eines Abschnitts (nach ":", "(", " - ", "/"): "Back In Black" -> "Back in Black" */
function textTitle(s) {
  var w = textWords(s);
  var parts = w.split(/(\s+)/), words = [];
  parts.forEach(function(p, i){ if (p && !/^\s+$/.test(p)) words.push(i); });
  words.forEach(function(idx, n){
    if (n === 0 || n === words.length - 1) return;
    var prev = parts[words[n - 1]];
    if (/[:(\[\/–-]$/.test(prev) || /^[-–\/]$/.test(prev)) return;
    var p = parts[idx], m = /^([("'\[]*)(.*?)([)"'\],;!?]*)$/.exec(p);
    if (m[1]) return;                                         /* "(The …" beginnt einen Abschnitt */
    if (TEXT_SMALL_WORDS.indexOf(m[2].toLowerCase()) >= 0 && m[2] === textWords(m[2].toLowerCase())) {
      parts[idx] = m[1] + m[2].toLowerCase() + m[3];
    }
  });
  return parts.join('');
}

function textLower(s)  { return String(s || '').toLowerCase(); }
function textUpper(s)  { return String(s || '').toUpperCase(); }
function textSpaces(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }

/* einfacher Text, alle Vorkommen; Groß-/Kleinschreibung wird beachtet */
function textReplace(s, find, repl) {
  s = String(s || '');
  if (!find) return s;
  return s.split(find).join(repl || '');
}

/* ---------- Aufteilen nach Muster ---------- */
/* Platzhalter im Muster -> Tag-Feld; %DUMMY% nimmt Text auf, der verworfen wird */
var TEXT_PLACEHOLDERS = {title: 'title', artist: 'artist', album: 'album', albumartist: 'albumartist', genre: 'genre',
                         composer: 'composer', date: 'date', year: 'date', track: 'track', disc: 'disc', dummy: null};

function textEscRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'); }

/* "%TITLE% - %ARTIST%" -> {names:['title','artist'], lazy:RegExp, greedy:RegExp}; bei Fehler {error} */
function textPattern(pattern) {
  var parts = String(pattern || '').split(/%([a-zA-Z]+)%/), names = [], lazy = '', greedy = '';
  for (var i = 0; i < parts.length; i++) {
    if (i % 2 === 0) { lazy += textEscRe(parts[i]); greedy += textEscRe(parts[i]); continue; }
    var key = parts[i].toLowerCase();
    if (!TEXT_PLACEHOLDERS.hasOwnProperty(key)) return {error: 'unbekannter Platzhalter %' + parts[i] + '%'};
    if (i > 1 && parts[i - 1] === '') return {error: 'zwischen zwei Platzhaltern muss ein Trennzeichen stehen'};
    names.push(TEXT_PLACEHOLDERS[key]);
    lazy += '(.+?)'; greedy += '(.+)';
  }
  if (!names.some(function(n){ return n; })) return {error: 'Muster braucht mindestens einen Platzhalter wie %TITLE%'};
  return {names: names, lazy: new RegExp('^\\s*' + lazy + '\\s*$'), greedy: new RegExp('^\\s*' + greedy + '\\s*$')};
}

/* Text nach Muster zerlegen -> {tags:{feld:wert}, ambiguous:bool, alt:{…}} oder null, wenn er nicht passt.
   ambiguous: das Trennzeichen kommt öfter vor, als das Muster braucht ("A - B - C"). tags teilt an der ersten,
   alt an der letzten Stelle. */
function textSplit(value, pat) {
  var m = pat.lazy.exec(String(value || ''));
  if (!m) return null;
  var g = pat.greedy.exec(String(value || '')), tags = {}, alt = {}, ambiguous = false;
  pat.names.forEach(function(name, i){
    if (g && g[i + 1].trim() !== m[i + 1].trim()) ambiguous = true;
    if (name) { tags[name] = m[i + 1].trim(); alt[name] = g ? g[i + 1].trim() : tags[name]; }
  });
  return ambiguous ? {tags: tags, ambiguous: true, alt: alt} : {tags: tags, ambiguous: false};
}

/* Liste für Menüs: [Kennung, Beschriftung, Funktion] */
var TEXT_FUNCS = [
  ['words', 'Wortanfänge groß', textWords],
  ['title', 'Title Case (englisch)', textTitle],
  ['lower', 'alles klein', textLower],
  ['upper', 'ALLES GROSS', textUpper],
  ['spaces', 'Leerzeichen bereinigen', textSpaces]
];
function textFunc(id) {
  for (var i = 0; i < TEXT_FUNCS.length; i++) if (TEXT_FUNCS[i][0] === id) return TEXT_FUNCS[i][2];
  return null;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {textWords: textWords, textTitle: textTitle, textLower: textLower, textUpper: textUpper,
                    textSpaces: textSpaces, textReplace: textReplace, textFunc: textFunc, TEXT_FUNCS: TEXT_FUNCS,
                    textPattern: textPattern, textSplit: textSplit};
}
