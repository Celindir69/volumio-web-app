/* Systeminfo für die Seite „System“ im Zahnrad-Menü: CPU-Last (live und 24 h), Arbeitsspeicher, Temperatur,
   Belegung der Laufwerke (interne Karte, USB, jede NAS-Verbindung), Laufzeit und Version.
   Liest nur /proc, /sys und df; misst alle 2 s (eine kleine Datei), fasst je Minute zusammen und hält 24 h im
   Speicher (alle 10 min in sysinfo.json gesichert, damit ein Neustart des Dienstes den Verlauf nicht löscht).
   Node 8, nur ES5. root: Präfix für /proc usw. (Tests) */
var fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');

var SAMPLE_MS = 2000, MINUTE_MS = 60000, KEEP_MS = 24 * 3600000, LIVE_N = 90, SAVE_MS = 600000;
var DF_TIMEOUT = 4000, DISK_CACHE_MS = 30000;

/* /proc/stat -> {busy, total} gesamt und je Kern */
function parseStat(text) {
  var out = {all: null, cores: []};
  String(text || '').split('\n').forEach(function(l){
    var m = /^cpu(\d*)\s+(.*)$/.exec(l);
    if (!m) return;
    var v = m[2].trim().split(/\s+/).map(Number), total = 0;
    v.forEach(function(x){ total += x || 0; });
    var idle = (v[3] || 0) + (v[4] || 0);                   /* idle + iowait */
    var r = {busy: total - idle, total: total};
    if (m[1] === '') out.all = r; else out.cores.push(r);
  });
  return out;
}
/* Last in Prozent zwischen zwei Messungen */
function pct(a, b) {
  if (!a || !b) return null;
  var dt = b.total - a.total;
  return dt > 0 ? Math.max(0, Math.min(100, Math.round((b.busy - a.busy) / dt * 1000) / 10)) : null;
}

/* /proc/meminfo -> kB */
function parseMeminfo(text) {
  var o = {};
  String(text || '').split('\n').forEach(function(l){
    var m = /^(\w+):\s+(\d+)/.exec(l);
    if (m) o[m[1]] = +m[2];
  });
  var avail = o.MemAvailable !== undefined ? o.MemAvailable : (o.MemFree || 0) + (o.Buffers || 0) + (o.Cached || 0);
  return {total: o.MemTotal || 0, avail: avail, swapTotal: o.SwapTotal || 0, swapFree: o.SwapFree || 0};
}

/* /proc/mounts -> Laufwerke, die auf der Seite erscheinen: /data (interne Karte), alles unter /mnt/
   (USB, NAS, …); gleiche lokale Geräte nur einmal (z. B. /mnt/INTERNAL liegt auf /data) */
var NET_FS = /^(cifs|smb3|smbfs|nfs|nfs4|fuse\.sshfs)$/;
var SKIP_FS = /^(tmpfs|devtmpfs|proc|sysfs|devpts|cgroup2?|squashfs|overlay|autofs|debugfs|securityfs|pstore|mqueue|configfs|fusectl|binfmt_misc|rpc_pipefs)$/;
function parseMounts(text) {
  var seen = {}, out = [];
  String(text || '').split('\n').forEach(function(l){
    var p = l.split(' ');
    if (p.length < 3) return;
    var dev = p[0].replace(/\\040/g, ' '), mount = p[1].replace(/\\040/g, ' '), type = p[2];
    if (SKIP_FS.test(type)) return;
    if (mount !== '/data' && mount.indexOf('/mnt/') !== 0) return;
    var net = NET_FS.test(type);
    if (!net && seen[dev]) return;
    seen[dev] = true;
    out.push({mount: mount, type: type, net: net});
  });
  return out;
}

/* Ausgabe von df -kP für einen Pfad -> kB */
function parseDf(text) {
  var l = String(text || '').trim().split('\n')[1];
  if (!l) return null;
  var p = l.trim().split(/\s+/);
  if (p.length < 6) return null;
  return {size: +p[1], used: +p[2], avail: +p[3]};
}

/* /etc/os-release -> {VOLUMIO_VERSION, PRETTY_NAME, …} */
function parseOsRelease(text) {
  var o = {};
  String(text || '').split('\n').forEach(function(l){
    var m = /^([A-Z_]+)=("?)(.*)\2$/.exec(l.trim());
    if (m) o[m[1]] = m[3];
  });
  return o;
}

function Sysinfo(opts) {
  opts = opts || {};
  this.root = opts.root || '';
  this.file = opts.file || '';
  this.df = opts.df || dfRun;
  this.prev = null;                  /* letzte /proc/stat-Messung */
  this.minA = null;                  /* Messung zu Beginn der laufenden Minute */
  this.minStart = 0;
  this.cpu = null; this.cores = [];
  this.live = [];                    /* [Zeit, Last] der letzten 3 min */
  this.hist = [];                    /* [Zeit, Last, Speicher %, Temperatur] je Minute */
  this.disks = null; this.disksAt = 0; this.disksWait = null;
  this.timers = [];
  this.load();
}

Sysinfo.prototype.read = function(p) {
  try { return fs.readFileSync(this.root + p, 'utf8'); } catch (e) { return ''; }
};

Sysinfo.prototype.temp = function() {
  var t = parseInt(this.read('/sys/class/thermal/thermal_zone0/temp'), 10);
  return isFinite(t) ? Math.round(t / 100) / 10 : null;
};

Sysinfo.prototype.mem = function() { return parseMeminfo(this.read('/proc/meminfo')); };

/* eine Messung (alle 2 s); now für Tests */
Sysinfo.prototype.sample = function(now) {
  now = now || Date.now();
  var s = parseStat(this.read('/proc/stat'));
  if (!s.all) return;
  if (this.prev) {
    this.cpu = pct(this.prev.all, s.all);
    var prev = this.prev;
    this.cores = s.cores.map(function(c, i){ return pct(prev.cores[i], c); });
    if (this.cpu !== null) {
      this.live.push([now, this.cpu]);
      if (this.live.length > LIVE_N) this.live.splice(0, this.live.length - LIVE_N);
    }
  }
  this.prev = s;
  if (!this.minA) { this.minA = s.all; this.minStart = now; }
  if (now - this.minStart >= MINUTE_MS) {
    var m = this.mem(), memPct = m.total ? Math.round((m.total - m.avail) / m.total * 1000) / 10 : null;
    this.hist.push([Math.round(now / 1000) * 1000, pct(this.minA, s.all), memPct, this.temp()]);
    this.minA = s.all; this.minStart = now;
    this.trim(now);
  }
};

Sysinfo.prototype.trim = function(now) {
  var cut = (now || Date.now()) - KEEP_MS, i = 0;
  while (i < this.hist.length && this.hist[i][0] < cut) i++;
  if (i) this.hist.splice(0, i);
};

Sysinfo.prototype.load = function() {
  if (!this.file) return;
  try {
    var j = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    if (Array.isArray(j.hist)) this.hist = j.hist.filter(function(r){ return Array.isArray(r) && r.length >= 4; });
    this.trim();
  } catch (e) { /* noch kein Verlauf */ }
};
Sysinfo.prototype.save = function() {
  if (!this.file) return;
  var tmp = this.file + '.tmp';
  try { fs.writeFileSync(tmp, JSON.stringify({hist: this.hist})); fs.renameSync(tmp, this.file); } catch (e) { /* nächstes Mal */ }
};

Sysinfo.prototype.start = function() {
  var self = this;
  this.sample();
  this.timers.push(setInterval(function(){ self.sample(); }, SAMPLE_MS));
  this.timers.push(setInterval(function(){ self.save(); }, SAVE_MS));
  this.timers.forEach(function(t){ if (t.unref) t.unref(); });
};
Sysinfo.prototype.stop = function() {
  this.timers.forEach(clearInterval); this.timers = [];
  this.save();
};

/* df je Laufwerk einzeln und mit Zeitgrenze: eine hängende NAS-Verbindung blockiert so nicht die anderen */
function dfRun(mount, cb) {
  var done = false, out = '';
  var child;
  try { child = cp.spawn('df', ['-kP', '--', mount]); } catch (e) { return cb(null); }
  var timer = setTimeout(function(){ if (!done) { done = true; try { child.kill('SIGKILL'); } catch (e) { /* weg */ } cb(null); } }, DF_TIMEOUT);
  child.stdout.on('data', function(d){ out += d; });
  child.on('error', function(){ if (!done) { done = true; clearTimeout(timer); cb(null); } });
  child.on('close', function(){ if (!done) { done = true; clearTimeout(timer); cb(parseDf(out)); } });
}

Sysinfo.prototype.diskList = function(cb) {
  var self = this;
  if (this.disks && Date.now() - this.disksAt < DISK_CACHE_MS) return cb(this.disks);
  if (this.disksWait) return this.disksWait.push(cb);
  this.disksWait = [cb];
  var list = parseMounts(this.read('/proc/mounts')), left = list.length, res = [];
  function fin() {
    self.disks = res.filter(Boolean); self.disksAt = Date.now();
    var w = self.disksWait; self.disksWait = null;
    w.forEach(function(f){ f(self.disks); });
  }
  if (!left) return fin();
  list.forEach(function(d, i){
    self.df(d.mount, function(r){
      res[i] = {mount: d.mount, type: d.type, net: d.net, ok: !!r, size: r ? r.size : 0, used: r ? r.used : 0, avail: r ? r.avail : 0};
      if (--left === 0) fin();
    });
  });
};

/* Antwort für GET /sysinfo; full: mit Verlauf, Laufwerken und festen Angaben */
Sysinfo.prototype.report = function(full, cb) {
  var self = this, up = parseFloat(this.read('/proc/uptime'));
  var r = {ok: true, now: Date.now(), cpu: this.cpu, cores: this.cores, live: this.live, load: os.loadavg().map(function(x){ return Math.round(x * 100) / 100; }),
           mem: this.mem(), temp: this.temp(), uptime: isFinite(up) ? Math.round(up) : null};
  if (!full) return cb(r);
  var osr = parseOsRelease(this.read('/etc/os-release')), cpus = os.cpus() || [];
  r.hist = this.hist;
  r.sys = {host: os.hostname(), kernel: os.release(), arch: os.arch(), node: process.version,
           volumio: osr.VOLUMIO_VERSION || '', hardware: osr.VOLUMIO_HARDWARE || '', os: osr.PRETTY_NAME || '',
           cpuModel: cpus[0] ? String(cpus[0].model || '').trim() : '', cpuCount: cpus.length};
  this.diskList(function(d){ r.disks = d; cb(r); });
};

module.exports = {Sysinfo: Sysinfo, parseStat: parseStat, pct: pct, parseMeminfo: parseMeminfo, parseMounts: parseMounts,
                  parseDf: parseDf, parseOsRelease: parseOsRelease};
