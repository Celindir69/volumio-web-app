/* Seite „Hilfe“ (Zahnrad-Menü): das Bedienkonzept in kurzen Abschnitten, je Zeile „was man tut | was passiert“
   (Texte in web/lang/*.js unter help.*, Zeilen durch \n getrennt), darunter je ein Verweis in die Anleitung im Repo.
   Klassisches Skript, gemeinsamer globaler Gültigkeitsbereich; Reihenfolge siehe xplorio.html. */
var overlayHelp = document.getElementById('overlayHelp');
var helpBody = document.getElementById('helpBody');

/* id, Symbol (Material-Pfad), Abschnitt in der Anleitung: [Datei, Anker] deutsch und englisch */
var HELP_SECTIONS = [
  {id: 'player', icon: 'M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z',
   de: ['README.md', 'wiedergabe-lyrics-und-infos'], en: ['README_EN.md', 'playback-lyrics-and-information']},
  {id: 'lists', icon: 'M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z',
   de: ['README.md', 'suchen--entdecken'], en: ['README_EN.md', 'search--discover']},
  {id: 'search', icon: 'M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
   de: ['README.md', 'suchen--entdecken'], en: ['README_EN.md', 'search--discover']},
  {id: 'mix', icon: 'M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18A3 3 0 1 0 19 17V8h3V6h-5z',
   de: ['README.md', 'stimmungs-mix'], en: ['README_EN.md', 'mood-mix']},
  {id: 'queue', icon: 'M3 15h18v-2H3v2zm0 4h18v-2H3v2zm0-8h18V9H3v2zm0-6v2h18V5H3z',
   de: ['README.md', 'wiedergabe-lyrics-und-infos'], en: ['README_EN.md', 'playback-lyrics-and-information']},
  {id: 'stage', icon: 'M21 3H3a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5v2h8v-2h5a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 14H3V5h18v12z',
   de: ['README.md', 'display-layout-für-ipad-desktop-und-fernseher'], en: ['README_EN.md', 'display-layout-for-ipad-desktop-and-tv']},
  {id: 'menu', icon: 'M19.14 12.94a7.07 7.07 0 0 0 0-1.88l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7 7 0 0 0-1.62-.94l-.36-2.54A.5.5 0 0 0 13.9 2h-3.84a.5.5 0 0 0-.49.42l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96a.5.5 0 0 0-.61.22L2.67 8.48a.5.5 0 0 0 .12.64l2.03 1.58a7.07 7.07 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.39.3.61.22l2.39-.96c.49.38 1.03.7 1.62.94l.36 2.54c.05.24.25.42.49.42h3.84c.24 0 .45-.18.49-.42l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.48 0 .61-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2z',
   de: ['README.md', 'weiteres'], en: ['README_EN.md', 'more']},
  {id: 'tips', icon: 'M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z',
   de: ['docs/einrichten.md', 'künstler--und-albumtexte'], en: ['docs/setup.md', 'artist-and-album-information']}
];

function openHelp() {
  closeAllOverlays();
  helpRender();
  overlayHelp.classList.add('on');
  helpBody.scrollTop = 0;
}

function helpRender() {
  while (helpBody.firstChild) helpBody.removeChild(helpBody.firstChild);
  helpBody.appendChild(histEl('div', 'hlIntro', T('help.intro')));
  var grid = histEl('div', 'syGridBox');
  HELP_SECTIONS.forEach(function(s){
    var card = histEl('div', 'syCard hlCard');
    var head = histEl('div', 'hlHead');
    head.appendChild(menuSvg(s.icon, 'hlIcon'));
    head.appendChild(histEl('div', 'hlTitle', T('help.' + s.id)));
    card.appendChild(head);
    String(T('help.' + s.id + '.lines')).split('\n').forEach(function(l){
      var p = l.split('|'), row = histEl('div', 'hlRow');
      if (p.length > 1) { row.appendChild(histEl('span', 'hlDo', p[0].trim())); row.appendChild(document.createTextNode(' ' + p.slice(1).join('|').trim())); }
      else row.textContent = l;
      card.appendChild(row);
    });
    var doc = LANG === 'de' ? s.de : s.en, a = document.createElement('a');
    a.className = 'hlMore'; a.target = '_blank'; a.rel = 'noopener';
    a.href = MENU_REPO + '/blob/main/' + doc[0] + '#' + encodeURIComponent(doc[1]);
    a.textContent = T('help.more');
    card.appendChild(a);
    grid.appendChild(card);
  });
  helpBody.appendChild(grid);
}

document.getElementById('closeHelp').addEventListener('click', closeAllOverlays);
document.getElementById('helpBack').addEventListener('click', function(){ openMenu(); });
