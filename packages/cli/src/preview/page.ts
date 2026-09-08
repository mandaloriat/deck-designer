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

  button, select, input[type=search], input[type=text], input[type=number] {
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
  input:disabled { opacity: 0.5; }
  .zoom { min-width: 52px; text-align: center; font-variant-numeric: tabular-nums; }

  .toggle { display: inline-flex; align-items: center; gap: 5px; color: var(--muted); cursor: pointer; }
  .toggle input { accent-color: var(--accent); }

  main { position: relative; overflow: hidden; display: grid; grid-template-columns: 1fr auto; }
  iframe { width: 100%; height: 100%; border: 0; display: block; background: var(--canvas); }

  #theme {
    width: 280px;
    overflow: auto;
    padding: 10px 12px 16px;
    background: var(--bar);
    border-left: 1px solid var(--line);
  }
  #theme[hidden] { display: none; }
  #theme h2 { margin: 4px 0 10px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); font-weight: 600; }
  #theme .note { color: var(--warn); margin-bottom: 10px; }
  .knob { margin-bottom: 12px; }
  .knob > label { display: block; margin-bottom: 4px; }
  .knob .row { display: flex; align-items: center; gap: 6px; }
  .knob .row input[type=text] { flex: 1; min-width: 0; font: 12px ui-monospace, Menlo, monospace; }
  .knob .row input[type=range] { flex: 1; min-width: 0; accent-color: var(--accent); }
  .knob input[type=color] { width: 30px; height: 26px; padding: 1px; background: var(--bar-2); border: 1px solid var(--line); border-radius: 6px; cursor: pointer; }
  .knob .chip { width: 30px; height: 26px; border: 1px solid var(--line); border-radius: 6px; flex: none; }
  .knob .num { min-width: 68px; text-align: right; color: var(--muted); font: 12px ui-monospace, Menlo, monospace; font-variant-numeric: tabular-nums; }
  .knob .src { color: var(--muted); font-size: 11px; margin-top: 3px; font-family: ui-monospace, Menlo, monospace; }
  .knob .bad { color: var(--error); font-size: 11px; margin-top: 3px; }
  .knob[hidden] { display: none; }

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
  <button id="toggle-theme" hidden>Theme</button>
  <button id="toggle-diagnostics">Diagnostics</button>
</header>

<main>
  <iframe id="stage" title="deck"></iframe>
  <aside id="theme" hidden><h2>Theme</h2><div id="knobs"></div></aside>
</main>

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
    themePanel: false,
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


  /**
   * Uncommitted knob values. The stylesheet is the source of truth, so these
   * exist only between a drag and the write that persists it, and are reapplied
   * if the frame happens to reload in that window.
   */
  var overrides = {};
  var themeSignature = '';

  function applyLive(name, value) {
    try {
      stage.contentDocument.documentElement.style.setProperty(name, value);
    } catch (e) { /* the frame is mid-navigation; the load handler will catch up */ }
  }

  stage.addEventListener('load', function () {
    for (var name in overrides) applyLive(name, overrides[name]);
  });

  /** A native colour input speaks hex and nothing else. */
  function hexOf(value) {
    var v = String(value == null ? '' : value).trim();
    if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
    if (/^#[0-9a-f]{3}$/i.test(v)) return ('#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3]).toLowerCase();
    return null;
  }

  /** Enough resolution to drag a corner radius, without pretending to nanometres. */
  function stepFor(min, max) {
    var span = Math.abs(max - min);
    return span <= 2 ? 0.01 : span <= 50 ? 0.1 : 1;
  }

  function knob(v, writable) {
    var wrap = document.createElement('div');
    wrap.className = 'knob';
    var label = document.createElement('label');
    label.textContent = v.label;
    wrap.appendChild(label);

    var row = document.createElement('div');
    row.className = 'row';
    wrap.appendChild(row);

    var bad = document.createElement('div');
    bad.className = 'bad';
    bad.hidden = true;

    var current = overrides[v.name] !== undefined ? overrides[v.name] : v.value;

    function set(value, commit) {
      overrides[v.name] = value;
      applyLive(v.name, value);
      if (!commit || !writable) return;
      bad.hidden = true;
      fetch('/__preview/theme', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: v.name, value: value })
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, data: d }; });
      }).then(function (out) {
        // The write triggers the watcher, which reloads the frame with the
        // value the file now holds; nothing local needs to survive that.
        if (out.ok) { delete overrides[v.name]; return; }
        bad.hidden = false;
        bad.textContent = out.data && out.data.error ? out.data.error.message : 'The write failed.';
      }).catch(function () {
        bad.hidden = false;
        bad.textContent = 'The preview server did not answer.';
      });
    }

    if (v.kind === 'color') {
      var text = document.createElement('input');
      text.type = 'text';
      text.value = current;
      text.disabled = !writable;
      var hex = hexOf(current);
      if (hex) {
        var picker = document.createElement('input');
        picker.type = 'color';
        picker.value = hex;
        picker.disabled = !writable;
        picker.oninput = function () { text.value = picker.value; set(picker.value, false); };
        picker.onchange = function () { text.value = picker.value; set(picker.value, true); };
        text.oninput = function () {
          var h = hexOf(text.value);
          if (h) picker.value = h;
          set(text.value, false);
        };
        row.appendChild(picker);
      } else {
        // oklch(), colour functions, keywords: the browser paints them even
        // though the picker cannot parse them, so show a swatch instead.
        var chip = document.createElement('span');
        chip.className = 'chip';
        chip.style.background = current;
        text.oninput = function () { chip.style.background = text.value; set(text.value, false); };
        row.appendChild(chip);
      }
      text.onchange = function () { set(text.value, true); };
      row.appendChild(text);
    } else if (v.kind === 'length' || v.kind === 'number') {
      var unit = v.unit || '';
      var readout = document.createElement('span');
      readout.className = 'num';
      var numeric = document.createElement('input');
      if (v.min !== undefined && v.max !== undefined) {
        numeric.type = 'range';
        numeric.min = String(v.min);
        numeric.max = String(v.max);
        numeric.step = String(stepFor(v.min, v.max));
      } else {
        numeric.type = 'number';
        numeric.step = 'any';
      }
      numeric.value = String(parseFloat(current));
      numeric.disabled = !writable;
      readout.textContent = numeric.value + unit;
      var push = function (commit) {
        // A cleared number field is not an instruction to write "mm".
        if (numeric.value === '') return;
        readout.textContent = numeric.value + unit;
        set(numeric.value + unit, commit);
      };
      numeric.oninput = function () { push(false); };
      numeric.onchange = function () { push(true); };
      row.appendChild(numeric);
      row.appendChild(readout);
    } else {
      var free = document.createElement('input');
      free.type = 'text';
      free.value = current;
      free.disabled = !writable;
      free.oninput = function () { set(free.value, false); };
      free.onchange = function () { set(free.value, true); };
      row.appendChild(free);
    }

    var src = document.createElement('div');
    src.className = 'src';
    src.textContent = v.name + ' · ' + v.file;
    wrap.appendChild(src);
    wrap.appendChild(bad);
    return wrap;
  }

  function renderTheme(variables, writable) {
    // Rebuilding on every poll would fight the hand on the slider, so the panel
    // is only rewritten when the declared knobs or their stored values move.
    var signature = JSON.stringify(variables) + '|' + writable;
    if (signature === themeSignature) return;
    themeSignature = signature;

    el('toggle-theme').hidden = variables.length === 0;
    el('theme').hidden = variables.length === 0 || !state.themePanel;
    el('toggle-theme').classList.toggle('on', !el('theme').hidden);
    if (!variables.length) return;

    var box = el('knobs');
    box.innerHTML = '';
    if (!writable) {
      var note = document.createElement('div');
      note.className = 'note';
      note.textContent = 'Read-only: writing needs a preview bound to loopback.';
      box.appendChild(note);
    }
    variables.forEach(function (v) { box.appendChild(knob(v, writable)); });
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
      renderTheme(data.theme || [], data.themeWritable !== false);
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
  el('toggle-theme').onclick = function () {
    var box = el('theme');
    box.hidden = !box.hidden;
    this.classList.toggle('on', !box.hidden);
    state.themePanel = !box.hidden;
    persist();
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
