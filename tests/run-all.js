/* Führt alle *.test.js in diesem Ordner nacheinander aus. Aufruf: node tests/run-all.js */
var fs = require('fs'), path = require('path'), cp = require('child_process');
var files = fs.readdirSync(__dirname).filter(function(f){ return /\.test\.js$/.test(f); }).sort();
var failed = [];
files.forEach(function(f){
  var r = cp.spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8' });
  var out = (r.stdout || '') + (r.stderr || '');
  var ok = (out.match(/^ok /gm) || []).length, bad = (out.match(/^FAIL /gm) || []).length;
  console.log((r.status === 0 ? 'ok    ' : 'FAIL  ') + f + '  (' + ok + ' ok' + (bad ? ', ' + bad + ' fehlgeschlagen' : '') + ')');
  if (r.status !== 0) { failed.push(f); console.log(out); }
});
console.log(failed.length ? '\n' + failed.length + ' Datei(en) mit Fehlern' : '\nalle Prüfungen bestanden');
process.exit(failed.length ? 1 : 0);
