/* Hell oder dunkel: ?theme=light|dark|auto in der Adresse, sonst THEME in config(.local).js, sonst 'auto' (wie das Gerät,
   wechselt mit, z. B. abends). Setzt html.light; die Farben stehen in web/css/base.css. Die Bühnenansicht bleibt dunkel.
   Klassisches Skript, ES5; wird im <head> nach config.js geladen, damit die Seite gleich in der richtigen Farbe erscheint. */
(function(){
  var cfg = window.APP_CONFIG || {};
  var m = /[?&]theme=(light|dark|auto)\b/.exec(location.search);
  var want = (m && m[1]) || cfg.THEME || 'auto';
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;
  function apply() {
    var light = want === 'light' || (want !== 'dark' && !!(mq && mq.matches));
    document.documentElement.classList.toggle('light', light);
  }
  apply();
  if (want === 'auto' && mq) {
    if (mq.addEventListener) mq.addEventListener('change', apply); else if (mq.addListener) mq.addListener(apply);
  }
})();
