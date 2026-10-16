import init, { Maze } from './pkg/maze.js';

var maze = null;

function showError(msg) {
  var el = document.getElementById('__err');
  if (!el) {
    el = document.createElement('div');
    el.id = '__err';
    el.style.cssText = 'position:fixed;top:70px;left:10px;right:10px;padding:14px;background:#f87171;color:#fff;font:12px monospace;border-radius:8px;z-index:99999;white-space:pre-wrap;max-height:40vh;overflow:auto;';
    document.body.appendChild(el);
  }
  el.textContent += msg + '\n';
}

window.addEventListener('error', function (e) {
  showError('ERROR: ' + e.message + ' (Zeile ' + e.lineno + ')');
});

function draw() {
  if (!maze) return;

  var canvas = document.getElementById('canvas');
  if (!canvas) { showError('Canvas nicht gefunden'); return; }

  var w = canvas.clientWidth || 340;
  var h = canvas.clientHeight || 500;
  if (w < 10 && canvas.parentElement) w = canvas.parentElement.clientWidth || 340;
  if (h < 10 && canvas.parentElement) h = canvas.parentElement.clientHeight || 500;
  if (w < 10) w = window.innerWidth - 40;
  if (h < 10) h = window.innerHeight - 200;

  canvas.width = w;
  canvas.height = h;

  var ctx = canvas.getContext('2d');
  if (!ctx) { showError('Kein 2D Context'); return; }

  ctx.fillStyle = '#0d1014';
  ctx.fillRect(0, 0, w, h);

  var cells = maze.get_cells();
  var solve = maze.get_solve();
  var rows = maze.rows();
  var cols = maze.cols();

  var cs = Math.min((w - 16) / cols, (h - 16) / rows);
  var ox = (w - cs * cols) / 2;
  var oy = (h - cs * rows) / 2;

  var fillPad = cs >= 2 ? 1 : 0;
  var fillSize = cs - fillPad;

  for (var i = 0; i < cells.length; i++) {
    var c = cells[i];
    var s = solve[i];
    var col = null;
    if (s & 0x08) col = '#5ecf7a';
    else if (s & 0x10) col = '#3b82f6';
    else if (s & 0x02) col = '#fcc02a';
    else if (s & 0x04) col = '#1e40af';
    else if (s & 0x01) col = '#3b82f6';
    else if (c & 0x20) col = '#fcc02a';
    else if (c & 0x80) col = '#c084fc';
    else if (c & 0x40) col = '#4c1d95';
    else if (c & 0x10) col = '#2d1b4e';
    if (!col) continue;
    var x = i % cols;
    var y = Math.floor(i / cols);
    ctx.fillStyle = col;
    ctx.fillRect(ox + x * cs, oy + y * cs, fillSize, fillSize);
  }

  if (cs >= 1.5) {
    var wl = Math.max(1, Math.min(2.5, cs * 0.14));
    ctx.fillStyle = '#e8ebee';
    for (var i2 = 0; i2 < cells.length; i2++) {
      var c2 = cells[i2];
      var x2 = i2 % cols;
      var y2 = Math.floor(i2 / cols);
      var cx = ox + x2 * cs;
      var cy = oy + y2 * cs;
      if (c2 & 0x01) ctx.fillRect(cx, cy, cs, wl);
      if (c2 & 0x02) ctx.fillRect(cx + cs - wl, cy, wl, cs);
      if (c2 & 0x04) ctx.fillRect(cx, cy + cs - wl, cs, wl);
      if (c2 & 0x08) ctx.fillRect(cx, cy, wl, cs);
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

function bindButtons() {
  var genBtn = document.getElementById('genBtn');
  var solveBtn = document.getElementById('solveBtn');
  var resetBtn = document.getElementById('resetBtn');
  var cancelBtn = document.getElementById('cancelBtn');
  var settingsBtn = document.getElementById('settingsBtn');
  var importBtn = document.getElementById('importBtn');
  var exportBtn = document.getElementById('exportBtn');
  var closeBtn = document.getElementById('closeBtn');
  var overlay = document.getElementById('overlay');
  var fileInput = document.getElementById('fileInput');

  if (genBtn) {
    genBtn.addEventListener('click', function () {
      try {
        maze.set_size(20, 20);
        maze.generate_all(0);
        draw();
      } catch (err) {
        showError('generate: ' + err.message);
      }
    });
  }

  if (solveBtn) {
    solveBtn.disabled = false;
    solveBtn.addEventListener('click', function () {
      try {
        maze.start_solve(0);
        var safety = 0;
        while (!maze.step_solve(4096) && safety < 10000) safety++;
        draw();
      } catch (err) {
        showError('solve: ' + err.message);
      }
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', function () {
      try {
        maze.reset_walls();
        draw();
      } catch (err) {
        showError('reset: ' + err.message);
      }
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', function () {
      try {
        maze.clear_gen_markers();
        maze.clear_solve_markers();
        draw();
      } catch (err) {
        showError('cancel: ' + err.message);
      }
    });
  }

  if (settingsBtn && overlay) {
    settingsBtn.addEventListener('click', function () {
      overlay.classList.remove('hidden');
    });
  }

  if (closeBtn && overlay) {
    closeBtn.addEventListener('click', function () {
      overlay.classList.add('hidden');
    });
    overlay.addEventListener('pointerdown', function (e) {
      if (e.target === overlay) overlay.classList.add('hidden');
    });
  }

  if (importBtn && fileInput) {
    importBtn.addEventListener('click', function () {
      fileInput.value = '';
      fileInput.click();
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', async function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        var buf = new Uint8Array(await file.arrayBuffer());
        if (maze.import_state(buf)) {
          draw();
        } else {
          showError('import failed');
        }
      } catch (err) {
        showError('import: ' + err.message);
      }
    });
  }

  if (exportBtn) {
    exportBtn.addEventListener('click', function () {
      try {
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
      } catch (err) {
        showError('export: ' + err.message);
      }
    });
  }
}

init().then(function () {
  try {
    maze = new Maze(20, 20);
    maze.generate_all(0);
    draw();
    bindButtons();

    window.addEventListener('resize', function () { draw(); });
    window.addEventListener('orientationchange', function () {
      setTimeout(draw, 200);
    });
  } catch (err) {
    showError('Boot: ' + err.message + '\n' + (err.stack || ''));
  }
}).catch(function (err) {
  showError('init: ' + err.message);
});
