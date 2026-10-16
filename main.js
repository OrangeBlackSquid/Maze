import init, { Maze } from './pkg/maze.js';

const SETTINGS_KEY = 'maze-settings-v1';
const ANIMATION_CELL_LIMIT = 40000;
const MIN_SIZE = 1;
const MAX_SIZE = 1000;

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const genBtn = document.getElementById('genBtn');
const solveBtn = document.getElementById('solveBtn');
const cancelBtn = document.getElementById('cancelBtn');
const resetBtn = document.getElementById('resetBtn');
const settingsBtn = document.getElementById('settingsBtn');
const overlay = document.getElementById('overlay');
const closeBtn = document.getElementById('closeBtn');
const importBtn = document.getElementById('importBtn');
const exportBtn = document.getElementById('exportBtn');
const fileInput = document.getElementById('fileInput');
const genAlgo = document.getElementById('genAlgo');
const genRows = document.getElementById('genRows');
const genCols = document.getElementById('genCols');
const genSpeed = document.getElementById('genSpeed');
const genSpeedVal = document.getElementById('genSpeedVal');
const alwaysAnimate = document.getElementById('alwaysAnimate');
const animateWarning = document.getElementById('animateWarning');
const solveAlgo = document.getElementById('solveAlgo');
const solveSpeed = document.getElementById('solveSpeed');
const solveSpeedVal = document.getElementById('solveSpeedVal');
const placeStartBtn = document.getElementById('placeStartBtn');
const placeGoalBtn = document.getElementById('placeGoalBtn');
const drawBtn = document.getElementById('drawBtn');
const placeHint = document.getElementById('placeHint');

let W = 0, H = 0, DPR = 1;
let maze = null;
let cellSize = 0, offsetX = 0, offsetY = 0;
let generating = false, solving = false;
let animToken = null;
let placeMode = null, drawMode = false, lastDrawCell = null, drawing = false;

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
  if (!animateWarning || !alwaysAnimate) return;
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
    if (typeof s.genSpeed === 'number') {
      genSpeed.value = clampCount(s.genSpeed);
      genSpeedVal.textContent = genSpeed.value;
    }
    if (typeof s.solveAlgo === 'number') solveAlgo.value = s.solveAlgo;
    if (typeof s.solveSpeed === 'number') {
      solveSpeed.value = clampCount(s.solveSpeed);
      solveSpeedVal.textContent = solveSpeed.value;
    }
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
  var rect = canvas.getBoundingClientRect();
  var w = rect.width;
  var h = rect.height;

  if (w < 10 || h < 10) {
    var parent = canvas.parentElement;
    if (parent) {
      w = parent.clientWidth;
      h = parent.clientHeight;
    }
  }
  if (w < 10 || h < 10) {
    w = window.innerWidth - 40;
    h = window.innerHeight - 200;
  }
  if (w < 10 || h < 10) return false;

  W = w;
  H = h;
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  updateLayout();
  draw();
  return true;
}

function updateLayout() {
  if (!maze) return;
  var rows = maze.rows();
  var cols = maze.cols();
  var pad = 8;
  var availW = W - pad * 2;
  var availH = H - pad * 2;
  cellSize = Math.min(availW / cols, availH / rows);
  offsetX = (W - cellSize * cols) / 2;
  offsetY = (H - cellSize * rows) / 2;
}

function colorFor(c, s) {
  if (s & 0x08) return '#5ecf7a';
  if (s & 0x10) return '#3b82f6';
  if (s & 0x02) return '#fcc02a';
  if (s & 0x04) return '#1e40af';
  if (s & 0x01) return '#3b82f6';
  if (c & 0x20) return '#fcc02a';
  if (c & 0x80) return '#c084fc';
  if (c & 0x40) return '#4c1d95';
  if (c & 0x10) return '#2d1b4e';
  return null;
}

function draw() {
  if (!maze) return;
  var rows = maze.rows();
  var cols = maze.cols();
  var cs = cellSize;
  var ox = offsetX;
  var oy = offsetY;

  ctx.fillStyle = '#0d1014';
  ctx.fillRect(0, 0, W, H);

  var cells = maze.get_cells();
  var solve = maze.get_solve();
  var fillPad = cs >= 2 ? 1 : 0;
  var fillSize = cs - fillPad;

  for (var y = 0; y < rows; y++) {
    var cy0 = oy + y * cs;
    for (var x = 0; x < cols; x++) {
      var i = y * cols + x;
      var col = colorFor(cells[i], solve[i]);
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(ox + x * cs, cy0, fillSize, fillSize);
    }
  }

  if (cs >= 1.5) {
    var wl = Math.max(1, Math.min(2.5, cs * 0.14));
    ctx.fillStyle = '#e8ebee';
    for (var y2 = 0; y2 < rows; y2++) {
      for (var x2 = 0; x2 < cols; x2++) {
        var ii = y2 * cols + x2;
        var cc = cells[ii];
        var cx = ox + x2 * cs;
        var cy = oy + y2 * cs;
        if (cc & 0x01) ctx.fillRect(cx, cy, cs, wl);
        if (cc & 0x08) ctx.fillRect(cx, cy, wl, cs);
        if (y2 === rows - 1 && (cc & 0x04)) ctx.fillRect(cx, cy + cs - wl, cs, wl);
        if (x2 === cols - 1 && (cc & 0x02)) ctx.fillRect(cx + cs - wl, cy, wl, cs);
      }
    }
  }

  var sIdx = maze.start();
  var gIdx = maze.goal();
  var sx = ox + (sIdx % cols) * cs + cs / 2;
  var sy = oy + Math.floor(sIdx / cols) * cs + cs / 2;
  var gx = ox + (gIdx % cols) * cs + cs / 2;
  var gy = oy + Math.floor(gIdx / cols) * cs + cs / 2;
  var mr = Math.max(3, Math.min(cs * 0.28, 12));

  ctx.fillStyle = '#34d399';
  ctx.beginPath();
  ctx.arc(sx, sy, mr, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#f87171';
  ctx.beginPath();
  ctx.arc(gx, gy, mr, 0, Math.PI * 2);
  ctx.fill();
}

function delayFromSpeed(speed) {
  var t = speed / 100;
  return Math.pow(10, 2.7 - t * 4);
}

function sleep(ms) {
  return new Promise(function (r) { setTimeout(r, ms); });
}

function cancelAnimation() {
  if (animToken) {
    animToken.cancelled = true;
    animToken = null;
  }
}

async function runAnimation(stepFn, speedGetter) {
  cancelAnimation();
  var token = { cancelled: false };
  animToken = token;
  var totalCells = maze.rows() * maze.cols();
  var fastMode = totalCells > ANIMATION_CELL_LIMIT && !alwaysAnimate.checked;
  if (fastMode) {
    var done = false;
    while (!done && !token.cancelled) {
      done = stepFn(25000);
      await new Promise(function (r) { requestAnimationFrame(r); });
    }
    draw();
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
  hintTimeout = setTimeout(function () {
    hidePlaceHint();
    hintTimeout = null;
  }, duration || 1600);
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
  if (lastDrawCell === null) {
    lastDrawCell = cell.i;
    return;
  }
  var last = lastDrawCell;
  if (last === cell.i) return;
  var lx = last % maze.cols();
  var ly = Math.floor(last / maze.cols());
  var dx = Math.abs(lx - cell.x);
  var dy = Math.abs(ly - cell.y);
  if (dx + dy === 1) {
    maze.remove_wall(last, cell.i);
    lastDrawCell = cell.i;
  } else {
    lastDrawCell = cell.i;
  }
}

function openOverlay() { overlay.classList.remove('hidden'); }
function closeOverlay() { overlay.classList.add('hidden'); }

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

canvas.addEventListener('pointercancel', function () {
  drawing = false;
  lastDrawCell = null;
});

settingsBtn.addEventListener('click', openOverlay);
closeBtn.addEventListener('click', closeOverlay);
overlay.addEventListener('pointerdown', function (e) {
  if (e.target === overlay) closeOverlay();
});
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

placeStartBtn.addEventListener('click', function () {
  exitDrawMode();
  placeMode = 'start';
  closeOverlay();
  showPlaceHint('start', 'tap to place start');
});

placeGoalBtn.addEventListener('click', function () {
  exitDrawMode();
  placeMode = 'goal';
  closeOverlay();
  showPlaceHint('goal', 'tap to place goal');
});

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

importBtn.addEventListener('click', function () {
  fileInput.value = '';
  fileInput.click();
});

fileInput.addEventListener('change', async function (e) {
  var file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    var buf = new Uint8Array(await file.arrayBuffer());
    if (maze.import_state(buf)) {
      updateLayout();
      draw();
      showTempHint('import-ok', 'imported');
    } else {
      showTempHint('import-error', 'import failed');
    }
  } catch (err) {
    showTempHint('import-error', 'import failed');
  }
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

window.addEventListener('resize', function () { resize(); });
window.addEventListener('orientationchange', function () { setTimeout(resize, 200); });

async function boot() {
  await init();
  var rows = clampSize(genRows.value);
  var cols = clampSize(genCols.value);
  maze = new Maze(rows, cols);
  loadSettings();
  resize();
  requestAnimationFrame(function () {
    resize();
    setControlsEnabled(true);
    runGenerate();
  });
}

boot();
