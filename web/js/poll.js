/* Zustandsabfrage (Poll) und Start der Takte
   Klassisches Skript, gemeinsamer globaler Gültigkeitsbereich; Reihenfolge siehe xplorio.html. */
/* ---------- Poll ---------- */
var qualityState = null;
function paintQuality(st) {
  qualityState = st;
  mp4Attach(st, function(){ if (qualityState === st) paintQuality(st); });   /* m4a: Codec aus der Datei, sobald bekannt */
  var q = classifyQuality(st, window.APP_CONFIG);
  mTech.textContent = q.tech.join('  ·  ');
  mBadge.textContent = q.label;
  mBadge.className = 'qBadge' + (q.kind ? ' ' + q.kind : '');
}

/* Webradio: zeigt der Player ein Senderlogo (Adresse von Volumio), es dem Tag-Dienst für die Senderliste melden.
   Den Namen kennt die Senderliste (radioNames in library.js); einmal je Sender und Adresse */
var radioLogoSent = {};
function radioLogoLearn(st) {
  if (st.trackType !== 'webradio' || typeof TAGS === 'undefined' || !st.uri) return;
  var a = String(st.albumart || '');
  if (!/^https?:\/\//.test(a)) return;
  var name = (typeof radioNames === 'function' && radioNames()[st.uri]) || '';
  if (!name || radioLogoSent[st.uri] === a) return;
  radioLogoSent[st.uri] = a;
  new Image().src = TAGS + '/stationlogo?name=' + encodeURIComponent(name) + '&url=' + encodeURIComponent(a);
}

/* Webradio: Cover zum laufenden Titel vom Tag-Dienst (iTunes/Deezer); bis es geladen ist und ohne Treffer das Senderlogo */
var radioCovers = {};            /* "Künstler|Titel" -> Bildadresse, false (kein Cover) oder null (lädt) */
function radioArt(st, stationArt) {
  if (st.trackType !== 'webradio' || typeof TAGS === 'undefined') return stationArt;
  var t = st.title || '', p = t.indexOf(' - ');
  if (p <= 0) return stationArt;
  var artist = t.slice(0, p).trim(), title = t.slice(p + 3).trim(), k = artist + '|' + title;
  if (!artist || !title) return stationArt;
  if (radioCovers[k]) return radioCovers[k];
  if (radioCovers[k] === undefined) {
    radioCovers[k] = null;
    var u = TAGS + '/radiocover?artist=' + encodeURIComponent(artist) + '&title=' + encodeURIComponent(title);
    var img = new Image();
    img.onload = function(){ radioCovers[k] = u; poll(); };
    img.onerror = function(){ radioCovers[k] = false; };
    img.src = u;
  }
  return stationArt;
}

var playIconShown = null;                              /* zuletzt gezeichnetes Symbol (nur bei Wechsel neu setzen) */
var pollBusy = false;                                   /* nie mehrere getState gleichzeitig (Volumio hängt z. B. beim Einlesen) */
function poll() {
  if (document.hidden || pollBusy) return;
  pollBusy = true;
  if (!volDrag && ROTEL_ON) rotel('/state');  
withTimeout(fetch('/api/v1/getState'), 8000).then(function(r){ return r.json(); }).then(function(st){

curDur = Number(st.duration) || 0;
/* gestoppt zählt Volumio die Zeit teils weiter (Wiedergabe angefordert, aber das Ausgabegerät ließ sich nicht öffnen):
   dann steht der Titel am Anfang */
seekBase = st.status === 'stop' ? 0 : (Number(st.seek) || 0); seekStamp = Date.now();
playing = (st.status === 'play');
paintTime();
updateSyncedLyrics();


    var iconPlay = st.status === 'play';
    if (iconPlay !== playIconShown) {
      playIconShown = iconPlay;
      playIcon.innerHTML = iconPlay ? '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>' : '<path d="M7 5v14l12-7z"/>';
    }

    curRadio = (st.trackType === 'webradio');
    curStream = curRadio ? null : streamOf({service: st.service, uri: st.uri});
    showVolumio(st);
    if (typeof st.random === 'boolean') stRandom = st.random;
    if (typeof st.repeat === 'boolean') {
      stRepeatMode = st.repeatSingle ? 'one' : (st.repeat ? 'all' : 'off');
    }
    updateCtrlUI();

    radioLogoLearn(st);
    var art = radioArt(st, artUrl(st.albumart));
    if (art && art !== lastArt) {
      lastArt = art;
      cover.src = art;
      bg.style.backgroundImage = 'url("' + String(art).replace(/["\\\n]/g, encodeURIComponent) + '")';
      updateMood(art);
    }

    var newPos = (typeof st.position === 'number') ? st.position : -1;
    if (newPos !== curPos) {
      curPos = newPos;
      if (overlayQueue.classList.contains('on')) loadQueue();
    }

    var artist = st.artist || '', album = st.album || '';
    var title  = st.title  || '';
    var radio  = (st.trackType === 'webradio');

    marqueeSet(mTitle, title);
    mArtist.textContent = artist;
    if ((radio ? '' : album) !== curAlbumTitle || st.uri !== curAlbumUri) {   /* nur bei Wechsel: das Jahr kommt verzögert dazu */
      curAlbumTitle = radio ? '' : album; curAlbumUri = st.uri;
      mAlbum.textContent = curAlbumTitle;
      if (typeof playerYear === 'function') playerYear(st.uri || '', curAlbumTitle, artist);
    }
    mArtist.classList.toggle('link', !radio && !!artist);      /* Klick öffnet Alben bzw. Titel (browse.js) */
    mAlbum.classList.toggle('link',  !radio && !!album);
    paintQuality(st);
    tagPaintPlayer(st);
    if (radio) {
      var p = title.indexOf(' - ');
      artist = (p > 0) ? title.slice(0, p).trim() : '';
      title  = (p > 0) ? title.slice(p + 3).trim() : title;
      album  = '';
    }
    radioArtist = radio ? artist : '';                 /* "Künstler - Titel" im Stream-Titel erkannt */
    curUri = st.uri || ''; curTitle = radio ? '' : title;
    mTitle.classList.toggle('link', !!radioArtist || similarOk());   /* Klick öffnet dessen Alben bzw. ähnliche Titel (browse.js) */

    var key    = artist + '|' + album + '|' + (radio ? title : '');
    var lyrKey = artist + '|' + title;

    if (lyrKey !== lastLyrKey) {
      lastLyrKey = lyrKey;
      askExtra(artist, title, radio).then(function(res){ if (lyrKey === lastLyrKey) showLyrics(res); });   /* späte Antwort des vorigen Titels verwerfen */
      setTrackInfo(lyrKey, title, null, radio);                   /* Reiter des vorigen Titels weg */
      (function(k, ti){
        askTrack(artist, ti).then(function(res){ if (k === lastLyrKey) setTrackInfo(k, ti, res, radio); });
      })(lyrKey, title);
    }

    if (key === lastKey) return;
    lastKey  = key;
    curAlbum = album;
curArtist = artist;    
if (!artist) { showInfo([]); return; }

if (radio) {
  Promise.all([ask({mode:'storyArtist', artist:artist}), askDiscography(artist)])
    .then(function(res){
      if (key !== lastKey) return;                   /* inzwischen läuft etwas anderes */
      showInfo([
        {title:artist,            label:T('info.tab.artist'), data:res[0], always:true},
        {title:T('info.collection'), label:T('info.tab.collection'), data:res[1]},
        {title:T('info.similar'), label:T('info.tab.similar'), lazy:true, artist:artist},
        {title:T('browse.tab.more'), label:T('browse.tab.more'), discover:true, artist:artist}
      ]);
    });
  return;
}

Promise.all([
  ask({mode:'storyAlbum',   artist:artist, album:album}),
  ask({mode:'storyArtist',  artist:artist}),
  ask({mode:'creditsAlbum', artist:artist, album:album}),
  askDiscography(artist)
]).then(function(res){
  if (key !== lastKey) return;    /* inzwischen läuft etwas anderes: späte Antwort verwerfen */
  showInfo([                      /* title: Überschrift im Overlay; label: kurzer Reitername (lange Namen würden die Leiste sprengen) */
    {title:album,             label:T('info.tab.album'),       data:res[0], always:true},
    {title:artist,            label:T('info.tab.artist'),    data:res[1], always:true},
    {title:T('info.credits'), label:T('info.tab.credits'), data:res[2]},
    {title:T('info.collection'), label:T('info.tab.collection'), data:res[3]},
    {title:T('info.similar'), label:T('info.tab.similar'),   lazy:true, artist:artist},
    {title:T('browse.tab.more'), label:T('browse.tab.more'), discover:true, artist:artist}
  ]);
});

  }).catch(function(){ playing = false; })            /* Volumio nicht erreichbar: Zeit nicht weiterlaufen lassen */
    .then(function(){ pollBusy = false; });
}

/* kleine Zwischenspeicher im Dauerbetrieb (iPad läuft tagelang) begrenzen: älteste Einträge zuerst */
setInterval(function(){
  [[radioCovers, 300], [radioLogoSent, 300], [similarCache, 300], [similarAllCache, 300], [streamSimilarCache, 200], [moodCache, 300], [creditCache, 300]]
    .forEach(function(p){
      var keys = Object.keys(p[0]);
      keys.slice(0, Math.max(0, keys.length - p[1])).forEach(function(k){ delete p[0][k]; });
    });
}, 30 * 60000);

setInterval(function(){ updateSyncedLyrics(); }, 200);
setInterval(poll, 2000);
poll();

