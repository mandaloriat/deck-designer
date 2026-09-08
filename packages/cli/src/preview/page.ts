/**
 * The preview chrome. Deliberately dependency-free and buildless: it is one
 * string, so `deck preview` stays a command rather than a second build target.
 *
 * The deck itself renders inside an iframe. That isolation is the point — the
 * document in the frame is the one the renderer produces, so what you see is
 * what a build will write, and no deck stylesheet can reach the toolbar.
 */
export const CHROME_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>deck preview</title>
<style>
  :root {
    --bar: #16181d;
    --bar-2: #1e2128;
    --line: #2c3038;
    --text: #e7e9ee;
    --muted: #969ba7;
    --accent: #7aa2f7;
    --error: #f7768e;
    --warn: #e0af68;
    --canvas: #8a8d93;
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body {
    display: grid;
    grid-template-rows: auto 1fr auto;
    font: 13px/1.4 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    background: var(--canvas);
    color: var(--text);
  }

  header {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
    padding: 8px 12px;
    background: var(--bar);
    border-bottom: 1px solid var(--line);
  }
  .brand { font-weight: 600; letter-spacing: 0.01em; }
  .brand small { color: var(--muted); font-weight: 400; margin-left: 6px; }
  .group { display: flex; align-items: center; gap: 6px; }
  .group > label { color: var(--muted); }
  .spacer { flex: 1; }

  button, select, input[type=search] {
    font: inherit;
    color: var(--text);
    background: var(--bar-2);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 4px 8px;
  }
  button { cursor: pointer; }
  button:hover { border-color: #3d434e; }
  button.on { background: var(--accent); border-color: var(--accent); color: #0f1115; }
  input[type=search] { min-width: 160px; }
  .zoom { min-width: 52px; text-align: center; font-variant-numeric: tabular-nums; }

  .toggle { display: inline-flex; align-items: center; gap: 5px; color: var(--muted); cursor: pointer; }
  .toggle input { accent-color: var(--accent); }

  main { position: relative; overflow: hidden; }
  iframe { width: 100%; height: 100%; border: 0; display: block; background: var(--canvas); }

  #diagnostics {
    max-height: 34vh;
    overflow: auto;
    background: var(--bar);
    border-top: 1px solid var(--line);
  }
  #diagnostics[hidden] { display: none; }
  .diag { display: grid; grid-template-columns: auto 1fr; gap: 8px; padding: 7px 12px; border-bottom: 1px solid var(--line); }
  .diag:last-child { border-bottom: 0; }
  .sev { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; padding-top: 2px; }
  .sev.error { color: var(--error); }
  .sev.warning { color: var(--warn); }
  .diag code { color: var(--muted); font-size: 12px; }
  .diag .where { color: var(--muted); font-size: 12px; margin-top: 2px; }

  footer {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 5px 12px;
    background: var(--bar);
    border-top: 1px solid var(--line);
    color: var(--muted);
    font-size: 12px;
  }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: #5a6; }
  .dot.off { background: var(--error); }
  .pill { padding: 1px 7px; border-radius: 999px; background: var(--bar-2); border: 1px solid var(--line); }
  .pill.error { color: var(--error); border-color: #4a2b33; }
  .pill.warn { color: var(--warn); border-color: #4a3f28; }
</style>
</head>
<body>
<header>
  <div class="brand">deck preview<small id="project"></small></div>

  <div class="group">
    <button id="zoom-out" title="Zoom out">&minus;</button>
    <span class="zoom" id="zoom-label">100%</span>
    <button id="zoom-in" title="Zoom in">+</button>
  </div>

  <div class="group">
    <label for="faces">Faces</label>
    <select id="faces">
      <option value="front,back">Both</option>
      <option value="front">Front</option>
      <option value="back">Back</option>
    </select>
  </div>

  <div class="group">
    <label for="type">Type</label>
    <select id="type"><option value="">All</option></select>
  </div>

  <label class="toggle"><input type="checkbox" id="bleed" /> Bleed</label>
  <label class="toggle"><input type="checkbox" id="guides" /> Guides</label>
  <label class="toggle"><input type="checkbox" id="rounded" /> Rounded</label>

  <input type="search" id="search" placeholder="Filter by id" />

  <div class="spacer"></div>
  <button id="toggle-diagnostics">Diagnostics</button>
</header>

<main><iframe id="stage" title="deck"></iframe></main>

<div id="diagnostics" hidden></div>

<footer>
  <span class="dot" id="dot"></span>
  <span id="status">connecting</span>
  <span id="counts"></span>
  <span id="badges"></span>
  <div class="spacer"></div>
  <span id="updated"></span>
</footer>

<script>
(function () {
  var state = {
    zoom: 1,
    faces: 'front,back',
    type: '',
    bleed: false,
    guides: false,
    rounded: false,
    search: '',
  };
  var STORAGE = 'deck-preview-controls';
  try {
    var saved = JSON.parse(localStorage.getItem(STORAGE) || 'null');
    if (saved) { for (var k in saved) { if (k in state) state[k] = saved[k]; } }
  } catch (e) { /* a stale or blocked store is not worth failing over */ }

  var el = function (id) { return document.getElementById(id); };
  var stage = el('stage');

  function persist() {
    try { localStorage.setItem(STORAGE, JSON.stringify(state)); } catch (e) {}
  }

  /** The filter both endpoints have to agree on, or the counts describe a
      different set of components than the gallery shows. */
  function filterParams() {
    var q = new URLSearchParams();
    if (state.type) q.set('type', state.type);
    if (state.search) q.set('search', state.search);
    return q;
  }

  function stateUrl() {
    var query = filterParams().toString();
    return '/__preview/state' + (query ? '?' + query : '');
  }

  function galleryUrl() {
    var q = filterParams();
    q.set('zoom', String(state.zoom));
    q.set('faces', state.faces);
    if (state.bleed) q.set('bleed', '1');
    if (state.guides) q.set('guides', '1');
    if (state.rounded) q.set('rounded', '1');
    q.set('t', String(Date.now()));
    return '/__preview/gallery?' + q.toString();
  }

  function refresh() {
    stage.src = galleryUrl();
    el('zoom-label').textContent = Math.round(state.zoom * 100) + '%';
    persist();
    loadState();
  }

  function renderDiagnostics(list) {
    var box = el('diagnostics');
    if (!list.length) {
      box.innerHTML = '<div class="diag"><span class="sev">ok</span><div>Nothing to report.</div></div>';
      return;
    }
    box.innerHTML = list.map(function (d) {
      var where = [d.file, d.cardType && 'type=' + d.cardType, d.card && 'card=' + d.card]
        .filter(Boolean).map(escapeHtml).join(' &middot; ');
      return '<div class="diag"><span class="sev ' + d.severity + '">' + d.severity + '</span><div>' +
        '<div>' + escapeHtml(d.message) + ' <code>' + escapeHtml(d.code) + '</code></div>' +
        (where ? '<div class="where">' + where + '</div>' : '') +
        (d.hint ? '<div class="where">hint: ' + escapeHtml(d.hint) + '</div>' : '') +
        '</div></div>';
    }).join('');
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function loadState() {
    fetch(stateUrl()).then(function (r) { return r.json(); }).then(function (data) {
      el('project').textContent = data.error ? '' : ' \\u00b7 ' + data.project;

      var select = el('type');
      var current = state.type;
      var options = '<option value="">All</option>';
      (data.cardTypes || []).forEach(function (t) {
        options += '<option value="' + t.id + '">' + escapeHtml(t.name) + ' (' + t.count + ')</option>';
      });
      select.innerHTML = options;
      select.value = current;

      var errors = (data.diagnostics || []).filter(function (d) { return d.severity === 'error'; }).length;
      var warnings = (data.diagnostics || []).length - errors;
      el('counts').textContent = data.error ? '' : data.shown + ' of ' + data.total + ' shown';
      el('badges').innerHTML =
        (errors ? '<span class="pill error">' + errors + ' error</span> ' : '') +
        (warnings ? '<span class="pill warn">' + warnings + ' warning</span>' : '');
      renderDiagnostics(data.error ? [{ severity: 'error', code: data.error.code, message: data.error.message }] : (data.diagnostics || []));
      if (errors || data.error) el('diagnostics').hidden = false;
      el('updated').textContent = 'updated ' + new Date().toLocaleTimeString();
    }).catch(function () { /* the reconnect loop will pick it up */ });
  }

  el('zoom-in').onclick = function () { state.zoom = Math.min(4, Math.round((state.zoom + 0.25) * 100) / 100); refresh(); };
  el('zoom-out').onclick = function () { state.zoom = Math.max(0.25, Math.round((state.zoom - 0.25) * 100) / 100); refresh(); };
  el('faces').onchange = function (e) { state.faces = e.target.value; refresh(); };
  el('type').onchange = function (e) { state.type = e.target.value; refresh(); };
  ['bleed', 'guides', 'rounded'].forEach(function (name) {
    el(name).onchange = function (e) { state[name] = e.target.checked; refresh(); };
  });
  var searchTimer;
  el('search').oninput = function (e) {
    clearTimeout(searchTimer);
    var value = e.target.value.trim();
    searchTimer = setTimeout(function () { state.search = value; refresh(); }, 200);
  };
  el('toggle-diagnostics').onclick = function () {
    var box = el('diagnostics');
    box.hidden = !box.hidden;
    this.classList.toggle('on', !box.hidden);
  };

  el('faces').value = state.faces;
  el('bleed').checked = state.bleed;
  el('guides').checked = state.guides;
  el('rounded').checked = state.rounded;
  el('search').value = state.search;

  function connect() {
    var source = new EventSource('/__preview/events');
    source.onopen = function () {
      el('dot').classList.remove('off');
      el('status').textContent = 'watching';
    };
    source.addEventListener('reload', function () { refresh(); });
    source.onerror = function () {
      el('dot').classList.add('off');
      el('status').textContent = 'disconnected';
      source.close();
      setTimeout(connect, 1000);
    };
  }

  refresh();
  connect();
})();
</script>
</body>
</html>`;
