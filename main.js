(function () {
  'use strict';

  function banner(text, color) {
    let el = document.getElementById('__dbg');
    if (!el) {
      el = document.createElement('div');
      el.id = '__dbg';
      el.style.cssText = 'position:fixed;top:0;left:0;right:0;padding:10px 14px;font:12px monospace;z-index:99999;white-space:pre-wrap;color:#fff;line-height:1.4;';
      document.body.appendChild(el);
    }
    el.style.background = color || '#1a7a3a';
    el.textContent = text;
  }

  window.addEventListener('error', function (e) {
    banner('[ERROR]\n' + e.message + '\n at ' + (e.filename || '?') + ':' + (e.lineno || '?'), '#a01a1a');
  });

  window.addEventListener('unhandledrejection', function (e) {
    var msg = e.reason && e.reason.message ? e.reason.message : String(e.reason);
    banner('[PROMISE REJECTED]\n' + msg, '#a01a1a');
  });

  banner('[1/5] Script gestartet. Lade WASM-Modul...', '#0a4a8a');

  var init, Maze;
  var MIN_SIZE = 1, MAX_SIZE = 1000, ANIMATION_CELL_LIMIT = 40000;
  var SETTINGS_KEY = 'maze-settings-v1';

  var canvas, ctx, genBtn, solveBtn, cancelBtn, resetBtn, settingsBtn, overlay, closeBtn;
  var importBtn, exportBtn, fileInput, genAlgo, genRows, genCols, genSpeed, genSpeedVal;
  var alwaysAnimate, animateWarning, solveAlgo, solveSpeed, solveSpeedVal;
  var placeStartBtn, placeGoalBtn, drawBtn, placeHint;

  var W = 0, H = 0, DPR = 1;
  var maze = null;
  var cellSize = 0, offsetX = 0, offsetY = 0;
  var generating = false, solving = false, animating = false;
  var animToken = null;
  var placeMode = null, drawMode = false, lastDrawCell = null, drawing = false;
  var colorBuf = null, imageData = null;

  var PALETTE = [
    [13, 16, 20, 255], [45, 27, 78, 255], [76, 29, 149, 255], [252, 192, 42, 255],
    [192, 132, 252, 255], [59, 130, 246, 255], [30, 64, 175, 255], [252, 192, 42, 255],
    [94, 207, 122, 255], [59, 130, 246, 255]
  ];

  function clampSize(v) {
    var n = parseInt(v, 10);
    if (isNaN(n)) return 20;
    if (n < MIN_SIZE) n = MIN_SIZE;
    if (n > MAX_SIZE) n = MAX_SIZE;
    return n;
  }

  function clampCount(v) {
    var n = parseInt(v, 10);
    if (isNaN(n)) return 50;
    if (n < 1) n = 1;
    if (n > 100) n = 100;
    return n;
  }

  function updateAnimateWarning() {
    if (!animateWarning) return;
    if (alwaysAnimate.checked) animateWarning.classList.add('active');
    else animateWarning.classList.remove('active');
  }

  function loadSettings() {
    try {
      var raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return;
      var s = JSON.parse(raw);
      if (typeof s.genAlgo === 'number') genAlgo.value = s.genAlgo;
      if (typeof s.genRows === 'number') genRows.value = clampSize(s.genRows);
      if (typeof s.genCols === 'number') genCols.value = clampSize(s.genCols);
      if (typeof s.genSpeed === 'number') { genSpeed.value = clampCount(s.genSpeed); genSpeedVal.textContent = genSpeed.value; }
      if (typeof s.solveAlgo === 'number') solveAlgo.value = s.solveAlgo;
      if (typeof s.solveSpeed === 'number') { solveSpeed.value = clampCount(s.solveSpeed); solveSpeedVal.textContent = solveSpeed.value; }
      if (typeof s.alwaysAnimate === 'boolean') alwaysAnimate.checked = s.alwaysAnimate;
    } catch (e) {}
    updateAnimateWarning();
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({
        genAlgo: parseInt(genAlgo.value, 10),
        genRows: clampSize(genRows.value),
        genCols: clampSize(genCols.value),
        genSpeed: parseInt(genSpeed.value, 10),
        solveAlgo: parseInt(solveAlgo.value, 10),
        solveSpeed: parseInt(solveSpeed.value, 10),
        alwaysAnimate: alwaysAnimate.checked
      }));
    } catch (e) {}
  }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    var rect = canvas.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return;
    W = rect.width;
    H = rect.height;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    imageData = ctx.createImageData(canvas.width, canvas.height);
    colorBuf = imageData.data;
    updateLayout();
    draw();
  }

  function updateLayout() {
    if (!maze) return;
    var rows = maze.rows(), cols = maze.cols();
    var pad = 8;
    cellSize = Math.min((W - pad * 2) / cols, (H - pad * 2) / rows);
    offsetX = (W - cellSize * cols) / 2;
    offsetY = (H - cellSize * rows) / 2;
  }

  function paintColor(x0, y0, x1, y1, r, g, b, a) {
    var dw = canvas.width, dh = canvas.height;
    if (x1 <= 0 || y1 <= 0 || x0 >= W || y0 >= H) return;
    var px0 = Math.max(0, Math.floor(x0 * DPR));
    var py0 = Math.max(0, Math.floor(y0 * DPR));
    var px1 = Math.min(dw, Math.ceil(x1 * DPR));
    var py1 = Math.min(dh, Math.ceil(y1 * DPR));
    for (var py = py0; py < py1; py++) {
      var o = (py * dw + px0) * 4;
      for (var px = px0; px < px1; px++) {
        colorBuf[o] = r; colorBuf[o + 1] = g; colorBuf[o + 2] = b; colorBuf[o + 3] = a;
        o += 4;
      }
    }
  }

  function paintAll(r, g, b, a) {
    var total = canvas.width * canvas.height * 4;
    for (var i = 0; i < total; i += 4) {
      colorBuf[i] = r; colorBuf[i + 1] = g; colorBuf[i + 2] = b; colorBuf[i + 3] = a;
    }
  }

  function colorFor(c, s) {
    if (s & 0x08) return PALETTE[8];
    if (s & 0x10) return PALETTE[9];
    if (s & 0x02) return PALETTE[7];
    if (s & 0x04) return PALETTE[6];
    if (s & 0x01) return PALETTE[5];
    if (c & 0x20) return PALETTE[3];
    if (c & 0x80) return PALETTE[4];
    if (c & 0x40) return PALETTE[2];
    if (c & 0x10) return PALETTE[1];
    return null;
  }

  function draw() {
    if (!maze || !colorBuf) return;
    var rows = maze.rows(), cols = maze.cols();
    var cs = cellSize, ox = offsetX, oy = offsetY;
    paintAll(13, 16, 20, 255);
    var cells = maze.get_cells();
    var solve = maze.get_solve();
    var fillPad = cs >= 2 ? 1 : 0;
    for (var y = 0; y < rows; y++) {
      var cy0 = oy + y * cs;
      var cy1 = cy0 + cs - fillPad;
      for (var x = 0; x < cols; x++) {
        var i = y * cols + x;
        var col = colorFor(cells[i], solve[i]);
        if (!col) continue;
        paintColor(ox + x * cs, cy0, ox + x * cs + cs - fillPad, cy1, col[0], col[1], col[2], col[3]);
      }
    }
    if (cs >= 1.5) {
      var wl = Math.max(1, Math.min(2.5, cs * 0.14));
      var wl2 = Math.max(1, Math.ceil(wl * DPR));
      var wlPx = wl2 / DPR;
      for (var y2 = 0; y2 < rows; y2++) {
        for (var x2 = 0; x2 < cols; x2++) {
          var ii = y2 * cols + x2;
          var cc = cells[ii];
          var cx = ox + x2 * cs;
          var cy = oy + y2 * cs;
          if (cc & 0x01) paintColor(cx, cy, cx + cs, cy + wlPx, 232, 235, 238, 255);
          if (cc & 0x08) paintColor(cx, cy, cx + wlPx, cy + cs, 232, 235, 238, 255);
          if (y2 === rows - 1 && (cc & 0x04)) paintColor(cx, cy + cs - wlPx, cx + cs, cy + cs, 232, 235, 238, 255);
          if (x2 === cols - 1 && (cc & 0x02)) paintColor(cx + cs - wlPx, cy, cx + cs, cy + cs, 232, 235, 238, 255);
        }
      }
    }
    var sIdx = maze.start(), gIdx = maze.goal();
    var sx = ox + (sIdx % cols) * cs + cs / 2;
    var sy = oy + Math.floor(sIdx / cols) * cs + cs / 2;
    var gx = ox + (gIdx % cols) * cs + cs / 2;
    var gy = oy + Math.floor(gIdx / cols) * cs + cs / 2;
    var mr = Math.max(3, Math.min(cs * 0.28, 12));
    var mrPx = Math.round(mr * DPR);
    for (var dy = -mrPx; dy <= mrPx; dy++) {
      for (var dx = -mrPx; dx <= mrPx; dx++) {
        if (dx * dx + dy * dy > mrPx * mrPx) continue;
        var ppx = Math.round(sx * DPR) + dx;
        var ppy = Math.round(sy * DPR) + dy;
        if (ppx < 0 || ppy < 0 || ppx >= canvas.width || ppy >= canvas.height) continue;
        var oo = (ppy * canvas.width + ppx) * 4;
        colorBuf[oo] = 52; colorBuf[oo + 1] = 211; colorBuf[oo + 2] = 153; colorBuf[oo + 3] = 255;
      }
    }
    for (var dy2 = -mrPx; dy2 <= mrPx; dy2++) {
      for (var dx2 = -mrPx; dx2 <= mrPx; dx2++) {
        if (dx2 * dx2 + dy2 * dy2 > mrPx * mrPx) continue;
        var ppx2 = Math.round(gx * DPR) + dx2;
        var ppy2 = Math.round(gy * DPR) + dy2;
        if (ppx2 < 0 || ppy2 < 0 || ppx2 >= canvas.width || ppy2 >= canvas.height) continue;
        var oo2 = (ppy2 * canvas.width + ppx2) * 4;
        colorBuf[oo2] = 248; colorBuf[oo2 + 1] = 113; colorBuf[oo2 + 2] = 113; colorBuf[oo2 + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  function delayFromSpeed(speed) {
    var t = speed / 100;
    return Math.pow(10, 2.7 - t * 4);
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function cancelAnimation() {
    if (animToken) { animToken.cancelled = true; animToken = null; }
  }

  async function runAnimation(stepFn, speedGetter) {
    cancelAnimation();
    var token = { cancelled: false };
    animToken = token;
    animating = true;
    var totalCells = maze.rows() * maze.cols();
    var fastMode = totalCells > ANIMATION_CELL_LIMIT && !alwaysAnimate.checked;
    if (fastMode) {
      var done = false;
      while (!done && !token.cancelled) {
        done = stepFn(25000);
        await new Promise(function (r) { requestAnimationFrame(r); });
      }
      draw();
      animating = false;
      if (animToken === token) animToken = null;
      return;
    }
    while (!token.cancelled) {
      var delay = delayFromSpeed(speedGetter());
      if (delay >= 16) {
        var d1 = stepFn(1);
        draw();
        if (d1) break;
        await sleep(delay);
      } else {
        var batch = delay < 1 ? 100 : Math.max(1, Math.floor(16 / delay));
        var d2 = stepFn(batch);
        draw();
        if (d2) break;
        await new Promise(function (r) { requestAnimationFrame(r); });
      }
    }
    animating = false;
    if (animToken === token) animToken = null;
  }

  function setControlsEnabled(enabled) {
    genBtn.disabled = !enabled;
    solveBtn.disabled = !enabled || !maze;
    cancelBtn.disabled = enabled;
    resetBtn.disabled = !enabled;
    genAlgo.disabled = !enabled;
    solveAlgo.disabled = !enabled;
    genRows.disabled = !enabled;
    genCols.disabled = !enabled;
    genSpeed.disabled = !enabled;
    solveSpeed.disabled = !enabled;
    alwaysAnimate.disabled = !enabled;
    placeStartBtn.disabled = !enabled;
    placeGoalBtn.disabled = !enabled;
    drawBtn.disabled = !enabled;
  }

  function exitDrawMode() {
    if (!drawMode) return;
    drawMode = false;
    lastDrawCell = null;
    drawing = false;
    drawBtn.classList.remove('active');
    drawBtn.textContent = 'draw maze';
    hidePlaceHint();
  }

  async function runGenerate() {
    if (generating || solving) return;
    exitDrawMode();
    var rows = clampSize(genRows.value);
    var cols = clampSize(genCols.value);
    genRows.value = rows;
    genCols.value = cols;
    saveSettings();
    closeOverlay();
    generating = true;
    setControlsEnabled(false);
    hidePlaceHint();
    maze.set_size(rows, cols);
    maze.seed(Date.now());
    updateLayout();
    draw();
    var kind = parseInt(genAlgo.value, 10);
    maze.start_generate(kind);
    await runAnimation(function (n) { return maze.step_generate(n); }, function () { return parseInt(genSpeed.value, 10); });
    maze.clear_gen_markers();
    draw();
    generating = false;
    setControlsEnabled(true);
  }

  async function runSolve() {
    if (generating || solving) return;
    if (!maze) return;
    exitDrawMode();
    closeOverlay();
    solving = true;
    setControlsEnabled(false);
    hidePlaceHint();
    maze.clear_solve_markers();
    draw();
    var kind = parseInt(solveAlgo.value, 10);
    maze.start_solve(kind);
    await runAnimation(function (n) { return maze.step_solve(n); }, function () { return parseInt(solveSpeed.value, 10); });
    draw();
    solving = false;
    setControlsEnabled(true);
  }

  function cancelAction() {
    if (!generating && !solving) return;
    cancelAnimation();
    generating = false;
    solving = false;
    maze.clear_gen_markers();
    maze.clear_solve_markers();
    draw();
    setControlsEnabled(true);
  }

  function resetMaze() {
    if (generating || solving) return;
    exitDrawMode();
    closeOverlay();
    if (!maze) return;
    maze.reset_walls();
    draw();
  }

  function showPlaceHint(mode, text) {
    placeHint.classList.remove('start', 'goal', 'draw', 'import-error', 'import-ok');
    if (mode) placeHint.classList.add(mode);
    placeHint.textContent = text;
    placeHint.classList.add('visible');
  }

  function hidePlaceHint() {
    placeHint.classList.remove('visible', 'start', 'goal', 'draw', 'import-error', 'import-ok');
  }

  var hintTimeout = null;
  function showTempHint(mode, text, duration) {
    if (hintTimeout) clearTimeout(hintTimeout);
    showPlaceHint(mode, text);
    hintTimeout = setTimeout(function () { hidePlaceHint(); hintTimeout = null; }, duration || 1600);
  }

  function cellFromEvent(e) {
    if (!maze) return null;
    var rect = canvas.getBoundingClientRect();
    var px = e.clientX - rect.left;
    var py = e.clientY - rect.top;
    var x = Math.floor((px - offsetX) / cellSize);
    var y = Math.floor((py - offsetY) / cellSize);
    if (x < 0 || x >= maze.cols() || y < 0 || y >= maze.rows()) return null;
    return { x: x, y: y, i: y * maze.cols() + x };
  }

  function carveAt(cell) {
    if (!cell || !maze) return;
    if (lastDrawCell === null) { lastDrawCell = cell.i; return; }
    var last = lastDrawCell;
    if (last === cell.i) return;
    var lx = last % maze.cols();
    var ly = Math.floor(last / maze.cols());
    var dx = Math.abs(lx - cell.x);
    var dy = Math.abs(ly - cell.y);
    if (dx + dy === 1) { maze.remove_wall(last, cell.i); lastDrawCell = cell.i; }
    else { lastDrawCell = cell.i; }
  }

  function openOverlay() { overlay.classList.remove('hidden'); }
  function closeOverlay() { overlay.classList.add('hidden'); }

  function bindEvents() {
    canvas.addEventListener('pointerdown', function (e) {
      if (generating || solving || !maze) return;
      if (drawMode) {
        e.preventDefault();
        drawing = true;
        try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
        var cell = cellFromEvent(e);
        lastDrawCell = null;
        carveAt(cell);
        draw();
        return;
      }
      if (!placeMode) return;
      var c = cellFromEvent(e);
      if (!c) return;
      if (placeMode === 'start') maze.set_start(c.i);
      else maze.set_goal(c.i);
      placeMode = null;
      hidePlaceHint();
      draw();
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!drawing || !drawMode) return;
      e.preventDefault();
      carveAt(cellFromEvent(e));
      draw();
    });
    canvas.addEventListener('pointerup', function (e) {
      if (drawing) {
        drawing = false;
        lastDrawCell = null;
        try { canvas.releasePointerCapture(e.pointerId); } catch (err) {}
      }
    });
    canvas.addEventListener('pointercancel', function () { drawing = false; lastDrawCell = null; });
    settingsBtn.addEventListener('click', openOverlay);
    closeBtn.addEventListener('click', closeOverlay);
    overlay.addEventListener('pointerdown', function (e) { if (e.target === overlay) closeOverlay(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !overlay.classList.contains('hidden')) closeOverlay();
    });
    genBtn.addEventListener('click', runGenerate);
    solveBtn.addEventListener('click', runSolve);
    cancelBtn.addEventListener('click', cancelAction);
    resetBtn.addEventListener('click', resetMaze);
    genSpeed.addEventListener('input', function () { genSpeedVal.textContent = genSpeed.value; saveSettings(); });
    solveSpeed.addEventListener('input', function () { solveSpeedVal.textContent = solveSpeed.value; saveSettings(); });
    genAlgo.addEventListener('change', saveSettings);
    solveAlgo.addEventListener('change', saveSettings);
    alwaysAnimate.addEventListener('change', function () { updateAnimateWarning(); saveSettings(); });
    genRows.addEventListener('blur', function () { genRows.value = clampSize(genRows.value); saveSettings(); });
    genCols.addEventListener('blur', function () { genCols.value = clampSize(genCols.value); saveSettings(); });
    placeStartBtn.addEventListener('click', function () { exitDrawMode(); placeMode = 'start'; closeOverlay(); showPlaceHint('start', 'tap to place start'); });
    placeGoalBtn.addEventListener('click', function () { exitDrawMode(); placeMode = 'goal'; closeOverlay(); showPlaceHint('goal', 'tap to place goal'); });
    drawBtn.addEventListener('click', function () {
      if (drawMode) { exitDrawMode(); return; }
      placeMode = null;
      drawMode = true;
      lastDrawCell = null;
      drawing = false;
      drawBtn.classList.add('active');
      drawBtn.textContent = 'stop drawing';
      closeOverlay();
      showPlaceHint('draw', 'drag to draw');
    });
    importBtn.addEventListener('click', function () { fileInput.value = ''; fileInput.click(); });
    fileInput.addEventListener('change', async function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        var buf = new Uint8Array(await file.arrayBuffer());
        if (maze.import_state(buf)) { updateLayout(); draw(); showTempHint('import-ok', 'imported'); }
        else showTempHint('import-error', 'import failed');
      } catch (err) { showTempHint('import-error', 'import failed'); }
    });
    exportBtn.addEventListener('click', function () {
      if (!maze) { showTempHint('import-error', 'nothing to export'); return; }
      var data = maze.export_state();
      var blob = new Blob([data], { type: 'application/octet-stream' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'maze-' + maze.cols() + 'x' + maze.rows() + '.maze';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      showTempHint('import-ok', 'exported');
    });
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', function () { setTimeout(resize, 200); });
  }

  function grabElements() {
    canvas = document.getElementById('canvas');
    ctx = canvas.getContext('2d');
    genBtn = document.getElementById('genBtn');
    solveBtn = document.getElementById('solveBtn');
    cancelBtn = document.getElementById('cancelBtn');
    resetBtn = document.getElementById('resetBtn');
    settingsBtn = document.getElementById('settingsBtn');
    overlay = document.getElementById('overlay');
    closeBtn = document.getElementById('closeBtn');
    importBtn = document.getElementById('importBtn');
    exportBtn = document.getElementById('exportBtn');
    fileInput = document.getElementById('fileInput');
    genAlgo = document.getElementById('genAlgo');
    genRows = document.getElementById('genRows');
    genCols = document.getElementById('genCols');
    genSpeed = document.getElementById('genSpeed');
    genSpeedVal = document.getElementById('genSpeedVal');
    alwaysAnimate = document.getElementById('alwaysAnimate');
    animateWarning = document.getElementById('animateWarning');
    solveAlgo = document.getElementById('solveAlgo');
    solveSpeed = document.getElementById('solveSpeed');
    solveSpeedVal = document.getElementById('solveSpeedVal');
    placeStartBtn = document.getElementById('placeStartBtn');
    placeGoalBtn = document.getElementById('placeGoalBtn');
    drawBtn = document.getElementById('drawBtn');
    placeHint = document.getElementById('placeHint');
  }

  async function boot() {
    try {
      banner('[2/5] Elemente sammeln...', '#0a4a8a');
      grabElements();
      if (!canvas) throw new Error('canvas nicht gefunden');
      if (!genBtn) throw new Error('genBtn nicht gefunden');

      banner('[3/5] Lade pkg/maze.js...', '#0a4a8a');
      var mod = await import('./pkg/maze.js');
      banner('[4/5] Modul geladen. Exports: ' + Object.keys(mod).join(', '), '#0a4a8a');
      init = mod.default;
      Maze = mod.Maze;
      if (typeof init !== 'function') throw new Error('init ist keine Funktion');
      if (typeof Maze !== 'function') throw new Error('Maze ist keine Klasse');

      banner('[5/5] Rufe init() auf...', '#0a4a8a');
      await init();
      banner('WASM geladen. Erstelle Maze-Objekt...', '#0a4a8a');
      maze = new Maze(clampSize(genRows.value), clampSize(genCols.value));
      loadSettings();
      maze.set_size(clampSize(genRows.value), clampSize(genCols.value));
      bindEvents();
      resize();
      setControlsEnabled(true);
      banner('Alles bereit. ' + maze.rows() + 'x' + maze.cols() + ' — Klick auf generate!', '#1a7a3a');
      setTimeout(function () { var el = document.getElementById('__dbg'); if (el) el.style.display = 'none'; }, 3000);
    } catch (err) {
      banner('[FEHLER beim Start]\n' + (err && err.message ? err.message : String(err)) + '\n\nStack:\n' + (err && err.stack ? err.stack : '?'), '#a01a1a');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
