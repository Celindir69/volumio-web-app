/* Langer Titel: läuft einmal durch, steht dann 30 Sekunden gekürzt (…), läuft wieder durch
   Klassisches Skript, gemeinsamer globaler Gültigkeitsbereich; Reihenfolge siehe app.html.
   Das Element hat overflow:hidden; der Text wird über scrollLeft bewegt (keine Zusatzelemente nötig). */
var MARQUEE_SPEED = 45;       /* Pixel pro Sekunde */
var MARQUEE_EDGE_MS = 1500;   /* Pause am Anfang und am Ende */
var MARQUEE_REST_MS = 30000;  /* gekürzt stehen, bevor der Titel wieder läuft */

function marqueeSet(el, text) {
  if (el._mqText === text) return;           /* der Poll liefert denselben Titel immer wieder */
  el._mqText = text;
  marqueeStop(el);
  el.textContent = text;
  marqueeSchedule(el, 800);
}

function marqueeStop(el) {
  clearTimeout(el._mqTimer);
  cancelAnimationFrame(el._mqFrame);
  el.scrollLeft = 0;
  el.style.textOverflow = '';
}

function marqueeSchedule(el, delay) {
  clearTimeout(el._mqTimer);
  el._mqTimer = setTimeout(function(){ marqueeRun(el); }, delay);
}

function marqueeRun(el) {
  var dist = el.scrollWidth - el.clientWidth;
  if (dist <= 2 || document.hidden) {         /* passt in die Zeile (oder Seite verdeckt): später erneut prüfen */
    marqueeSchedule(el, dist <= 2 ? MARQUEE_REST_MS : 2000);
    return;
  }
  el.style.textOverflow = 'clip';             /* beim Laufen ohne Auslassungspunkte */
  var dur = dist / MARQUEE_SPEED * 1000, t0 = 0;
  function step(now) {
    if (!t0) t0 = now;
    var k = Math.min(1, Math.max(0, (now - t0 - MARQUEE_EDGE_MS) / dur));
    el.scrollLeft = dist * k;
    if (now - t0 < MARQUEE_EDGE_MS + dur + MARQUEE_EDGE_MS) {
      el._mqFrame = requestAnimationFrame(step);
    } else {
      el.scrollLeft = 0;
      el.style.textOverflow = '';             /* wieder gekürzt */
      marqueeSchedule(el, MARQUEE_REST_MS);
    }
  }
  el._mqFrame = requestAnimationFrame(step);
}

/* Fenstergröße geändert (Drehen): neu beurteilen */
window.addEventListener('resize', function(){
  [mTitle].forEach(function(el){
    if (el._mqText === undefined) return;
    marqueeStop(el);
    marqueeSchedule(el, 500);
  });
});
