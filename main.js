import init, { Maze } from './pkg/maze.js';

var maze = null;

function draw() {
  if (!maze) return;

  var canvas = document.getElementById('canvas');
  if (!canvas) return;

  // Größe IMMER frisch ermitteln, mit Fallback
  var w = canvas.clientWidth || 340;
  var h = canvas.clientHeight || 500;

  // Fallback: übergeordnetes Element
  if (w < 10 && canvas.parentElement) {
    w = canvas.parentElement.clientWidth || 340;
  }
  if (h < 10 && canvas.parentElement) {
    h = canvas.parentElement.clientHeight || 500;
  }

  // Letzter Fallback
  if (w < 10) w = window.innerWidth - 40;
  if (h < 10) h = window.innerHeight - 200;

  canvas.width = w;
  canvas.height = h;

  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Hintergrund
  ctx.fillStyle = '#0d1014';
  ctx.fillRect(0, 0, w, h);

  var cells = maze.get_cells();
  var rows = maze.rows();
  var cols = maze.cols();

  var cs = Math.min((w - 16) / cols, (h - 16) / rows);
  var ox = (w - cs * cols) / 2;
  var oy = (h - cs * rows) / 2;

  var wl = Math.max(1, Math.min(2.5, cs * 0.14));
  ctx.fillStyle = '#e8ebee';

  for (var i = 0; i < cells.length; i++) {
    var c = cells[i];
    var x = i % cols;
    var y = Math.floor(i / cols);
    var cx = ox + x * cs;
    var cy = oy + y * cs;
    if (c & 0x01) ctx.fillRect(cx, cy, cs, wl);
    if (c & 0x02) ctx.fillRect(cx + cs - wl, cy, wl, cs);
    if (c & 0x04) ctx.fillRect(cx, cy + cs - wl, cs, wl);
    if (c & 0x08) ctx.fillRect(cx, cy, wl, cs);
  }

  // Start-/Ziel-Marker
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

init().then(function () {
  maze = new Maze(20, 20);
  maze.generate_all(0);
  draw();

  var genBtn = document.getElementById('genBtn');
  var solveBtn = document.getElementById('solveBtn');
  var resetBtn = document.getElementById('resetBtn');

  if (genBtn) {
    genBtn.addEventListener('click', function () {
      maze.set_size(20, 20);
      maze.seed(Date.now());
      maze.generate_all(0);
      draw();
    });
  }

  if (solveBtn) {
    solveBtn.disabled = false;
    solveBtn.addEventListener('click', function () {
      maze.start_solve(0);
      while (!maze.step_solve(4096)) {}
      draw();
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', function () {
      maze.reset_walls();
      draw();
    });
  }

  window.addEventListener('resize', draw);
  window.addEventListener('orientationchange', function () {
    setTimeout(draw, 200);
  });
}).catch(function (err) {
  // Fehler sichtbar machen
  var el = document.createElement('div');
  el.style.cssText = 'position:fixed;top:50px;left:10px;right:10px;padding:14px;background:#f87171;color:#fff;font:13px monospace;border-radius:8px;z-index:99999;white-space:pre-wrap;';
  el.textContent = 'FEHLER: ' + (err.message || err) + '\n\n' + (err.stack || '');
  document.body.appendChild(el);
});
