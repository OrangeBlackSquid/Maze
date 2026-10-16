import init, { Maze } from './pkg/maze.js';

const GEN_ALGO_KEYS = ['dfs', 'prim', 'kruskal', 'wilson', 'binary'];
const SOLVE_ALGO_KEYS = ['astar', 'wall', 'deadend', 'flood', 'tremaux'];

const MIN_SIZE = 1;
const MAX_SIZE = 1000;
const ANIMATION_CELL_LIMIT = 40000;
const SETTINGS_KEY = 'maze-settings-v1';

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
let generating = false, solving = false, animating = false;
let animToken = null;
let placeMode = null, drawMode = false, lastDrawCell = null, drawing = false;

let colorBuf = null;
let imageData = null;

const PALETTE = [
  [13, 16, 20, 255],
  [45, 27, 78, 255],
  [76, 29, 149, 255],
  [252, 192, 42, 255],
  [192, 132, 252, 255],
  [59, 130, 246, 255],
  [30, 64, 175, 255],
  [252, 192, 42, 255],
  [94, 207, 122, 255],
  [59, 130, 246, 255],
];

function clampSize(v) {
  let n = parseInt(v, 10);
  if (isNaN(n)) return 20;
  if (n < MIN_SIZE) n = MIN_SIZE;
  if (n > MAX_SIZE) n = MAX_SIZE;
  return n;
}

function clampCount(v) {
  let n = parseInt(v, 10);
  if (isNaN(n)) return 50;
  if (n < 1) n = 1;
  if (n > 100) n = 100;
  return n;
}

function updateAnimateWarning() {
  animateWarning.classList.toggle('active', alwaysAnimate.checked);
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
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
      alwaysAnimate: alwaysAnimate.checked,
    }));
  } catch (e) {}
}

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
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
  const rows = maze.rows();
  const cols = maze.cols();
  const pad = 8;
  const availW = W - pad * 2;
  const availH = H - pad * 2;
  cellSize = Math.min(availW / cols, availH / rows);
  offsetX = (W - cellSize * cols) / 2;
  offsetY = (H - cellSize * rows) / 2;
}

function paintColor(x0, y0, x1, y1, r, g, b, a) {
  const dw = canvas.width;
  const dh = canvas.height;
  if (x1 <= 0 || y1 <= 0 || x0 >= W || y0 >= H) return;
  const px0 = Math.max(0, Math.floor(x0 * DPR));
  const py0 = Math.max(0, Math.floor(y0 * DPR));
  const px1 = Math.min(dw, Math.ceil(x1 * DPR));
  const py1 = Math.min(dh, Math.ceil(y1 * DPR));
  for (let py = py0; py < py1; py++) {
    let o = (py * dw + px0) * 4;
    for (let px = px0; px < px1; px++) {
      colorBuf[o] = r;
      colorBuf[o + 1] = g;
      colorBuf[o + 2] = b;
      colorBuf[o + 3] = a;
      o += 4;
    }
  }
}

function paintAll(r, g, b, a) {
  const total = canvas.width * canvas.height * 4;
  for (let i = 0; i < total; i += 4) {
    colorBuf[i] = r;
    colorBuf[i + 1] = g;
    colorBuf[i + 2] = b;
    colorBuf[i + 3] = a;
  }
}

function colorFor(c, s) {
  if (s & 0b0000_1000) return PALETTE[8];
  if (s & 0b0001_0000) return PALETTE[9];
  if (s & 0b0000_0010) return PALETTE[7];
  if (s & 0b0000_0100) return PALETTE[6];
  if (s & 0b0000_0001) return PALETTE[5];
  if (c & 0b0010_0000) return PALETTE[3];
  if (c & 0b1000_0000) return PALETTE[4];
  if (c & 0b0100_0000) return PALETTE[2];
  if (c & 0b0001_0000) return PALETTE[1];
  return null;
}

function draw() {
  if (!maze || !colorBuf) return;

  const rows = maze.rows();
  const cols = maze.cols();
  const cs = cellSize;
  const ox = offsetX;
  const oy = offsetY;

  paintAll(13, 16, 20, 255);

  const cells = maze.get_cells();
  const solve = maze.get_solve();

  const fillPad = cs >= 2 ? 1 : 0;

  for (let y = 0; y < rows; y++) {
    const cy0 = oy + y * cs;
    const cy1 = cy0 + cs - fillPad;
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const col = colorFor(cells[i], solve[i]);
      if (!col) continue;
      paintColor(ox + x * cs, cy0, ox + x * cs + cs - fillPad, cy1, col[0], col[1], col[2], col[3]);
    }
  }

  if (cs >= 1.5) {
    const wl = Math.max(1, Math.min(2.5, cs * 0.14));
    const wl2 = Math.max(1, Math.ceil(wl * DPR));
    const wlPx = wl2 / DPR;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        const c = cells[i];
        const cx = ox + x * cs;
        const cy = oy + y * cs;
        if (c & 0b0000_0001) paintColor(cx, cy, cx + cs, cy + wlPx, 232, 235, 238, 255);
        if (c & 0b0000_1000) paintColor(cx, cy, cx + wlPx, cy + cs, 232, 235, 238, 255);
        if (y === rows - 1 && (c & 0b0000_0100)) paintColor(cx, cy + cs - wlPx, cx + cs, cy + cs, 232, 235, 238, 255);
        if (x === cols - 1 && (c & 0b0000_0010)) paintColor(cx + cs - wlPx, cy, cx + cs, cy + cs, 232, 235, 238, 255);
      }
    }
  }

  const startIdx = maze.start();
  const goalIdx = maze.goal();
  const sx = ox + (startIdx % cols) * cs + cs / 2;
  const sy = oy + Math.floor(startIdx / cols) * cs + cs / 2;
  const gx = ox + (goalIdx % cols) * cs + cs / 2;
  const gy = oy + Math.floor(goalIdx / cols) * cs + cs / 2;
  const mr = Math.max(3, Math.min(cs * 0.28, 12));
  const mrPx = Math.round(mr * DPR);

  for (let dy = -mrPx; dy <= mrPx; dy++) {
    for (let dx = -mrPx; dx <= mrPx; dx++) {
      if (dx * dx + dy * dy > mrPx * mrPx) continue;
      const px = Math.round(sx * DPR) + dx;
      const py = Math.round(sy * DPR) + dy;
      if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) continue;
      const o = (py * canvas.width + px) * 4;
      colorBuf[o] = 52; colorBuf[o + 1] = 211; colorBuf[o + 2] = 153; colorBuf[o + 3] = 255;
    }
  }
  for (let dy = -mrPx; dy <= mrPx; dy++) {
    for (let dx = -mrPx; dx <= mrPx; dx++) {
      if (dx * dx + dy * dy > mrPx * mrPx) continue;
      const px = Math.round(gx * DPR) + dx;
      const py = Math.round(gy * DPR) + dy;
      if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) continue;
      const o = (py * canvas.width + px) * 4;
      colorBuf[o] = 248; colorBuf[o + 1] = 113; colorBuf[o + 2] = 113; colorBuf[o + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

function delayFromSpeed(speed) {
  const t = speed / 100;
  return Math.pow(10, 2.7 - t * 4);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function cancelAnimation() {
  if (animToken) {
    animToken.cancelled = true;
    animToken = null;
  }
}

async function runAnimation(stepFn, speedGetter) {
  cancelAnimation();
  const token = { cancelled: false };
  animToken = token;
  animating = true;

  const totalCells = maze.rows() * maze.cols();
  const fastMode = totalCells > ANIMATION_CELL_LIMIT && !alwaysAnimate.checked;

  if (fastMode) {
    let done = false;
    while (!done && !token.cancelled) {
      done = stepFn(25000);
      await new Promise(r => requestAnimationFrame(r));
    }
    draw();
    animating = false;
    if (animToken === token) animToken = null;
    return;
  }

  while (!token.cancelled) {
    const delay = delayFromSpeed(speedGetter());
    if (delay >= 16) {
      const done = stepFn(1);
      draw();
      if (done) break;
      await sleep(delay);
    } else {
      const batch = delay < 1 ? 100 : Math.max(1, Math.floor(16 / delay));
      const done = stepFn(batch);
      draw();
      if (done) break;
      await new Promise(r => requestAnimationFrame(r));
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
  const rows = clampSize(genRows.value);
  const cols = clampSize(genCols.value);
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

  const kind = parseInt(genAlgo.value, 10);
  maze.start_generate(kind);

  await runAnimation((n) => maze.step_generate(n), () => parseInt(genSpeed.value, 10));

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

  const kind = parseInt(solveAlgo.value, 10);
  maze.start_solve(kind);

  await runAnimation((n) => maze.step_solve(n), () => parseInt(solveSpeed.value, 10));

  maze.clear_solve_markers_only_current?.();
  const s = maze.get_solve();
  for (let i = 0; i < s.length; i++) {
    if (s[i] & 0b0000_0010) {
      // clear current — Maze has no method, do nothing, visual is fine
    }
  }
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

let hintTimeout = null;
function showTempHint(mode, text, duration) {
  if (hintTimeout) clearTimeout(hintTimeout);
  showPlaceHint(mode, text);
  hintTimeout = setTimeout(() => { hidePlaceHint(); hintTimeout = null; }, duration || 1600);
}

function cellFromEvent(e) {
  if (!maze) return null;
  const rect = canvas.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;
  const x = Math.floor((px - offsetX) / cellSize);
  const y = Math.floor((py - offsetY) / cellSize);
  if (x < 0 || x >= maze.cols() || y < 0 || y >= maze.rows()) return null;
  return { x, y, i: y * maze.cols() + x };
}

function carveAt(cell) {
  if (!cell || !maze) return;
  if (lastDrawCell === null) {
    lastDrawCell = cell.i;
    return;
  }
  const last = lastDrawCell;
  if (last === cell.i) return;
  const lx = last % maze.cols();
  const ly = Math.floor(last / maze.cols());
  const dx = Math.abs(lx - cell.x);
  const dy = Math.abs(ly - cell.y);
  if (dx + dy === 1) {
    maze.remove_wall(last, cell.i);
    lastDrawCell = cell.i;
  } else {
    lastDrawCell = cell.i;
  }
}

canvas.addEventListener('pointerdown', (e) => {
  if (generating || solving || !maze) return;
  if (drawMode) {
    e.preventDefault();
    drawing = true;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    const cell = cellFromEvent(e);
    lastDrawCell = null;
    carveAt(cell);
    draw();
    return;
  }
  if (!placeMode) return;
  const cell = cellFromEvent(e);
  if (!cell) return;
  if (placeMode === 'start') maze.set_start(cell.i);
  else maze.set_goal(cell.i);
  placeMode = null;
  hidePlaceHint();
  draw();
});

canvas.addEventListener('pointermove', (e) => {
  if (!drawing || !drawMode) return;
  e.preventDefault();
  carveAt(cellFromEvent(e));
  draw();
});

canvas.addEventListener('pointerup', (e) => {
  if (drawing) {
    drawing = false;
    lastDrawCell = null;
    try { canvas.releasePointerCapture(e.pointerId); } catch (err) {}
  }
});
canvas.addEventListener('pointercancel', () => { drawing = false; lastDrawCell = null; });

function openOverlay() { overlay.classList.remove('hidden'); }
function closeOverlay() { overlay.classList.add('hidden'); }

settingsBtn.addEventListener('click', openOverlay);
closeBtn.addEventListener('click', closeOverlay);
overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay) closeOverlay(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !overlay.classList.contains('hidden')) closeOverlay();
});

genBtn.addEventListener('click', runGenerate);
solveBtn.addEventListener('click', runSolve);
cancelBtn.addEventListener('click', cancelAction);
resetBtn.addEventListener('click', resetMaze);

genSpeed.addEventListener('input', () => { genSpeedVal.textContent = genSpeed.value; saveSettings(); });
solveSpeed.addEventListener('input', () => { solveSpeedVal.textContent = solveSpeed.value; saveSettings(); });
genAlgo.addEventListener('change', saveSettings);
solveAlgo.addEventListener('change', saveSettings);
alwaysAnimate.addEventListener('change', () => { updateAnimateWarning(); saveSettings(); });

genRows.addEventListener('blur', () => { genRows.value = clampSize(genRows.value); saveSettings(); });
genCols.addEventListener('blur', () => { genCols.value = clampSize(genCols.value); saveSettings(); });

placeStartBtn.addEventListener('click', () => {
  exitDrawMode();
  placeMode = 'start';
  closeOverlay();
  showPlaceHint('start', 'tap to place start');
});
placeGoalBtn.addEventListener('click', () => {
  exitDrawMode();
  placeMode = 'goal';
  closeOverlay();
  showPlaceHint('goal', 'tap to place goal');
});

drawBtn.addEventListener('click', () => {
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

importBtn.addEventListener('click', () => { fileInput.value = ''; fileInput.click(); });

fileInput.addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    const buf = new Uint8Array(await file.arrayBuffer());
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

exportBtn.addEventListener('click', () => {
  if (!maze) { showTempHint('import-error', 'nothing to export'); return; }
  const data = maze.export_state();
  const blob = new Blob([data], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'maze-' + maze.cols() + 'x' + maze.rows() + '.maze';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showTempHint('import-ok', 'exported');
});

async function boot() {
  await init();
  maze = new Maze(clampSize(genRows.value), clampSize(genCols.value));
  loadSettings();
  maze.set_size(clampSize(genRows.value), clampSize(genCols.value));
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));
  resize();
  setControlsEnabled(true);
}

boot();
