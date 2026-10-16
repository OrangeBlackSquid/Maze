import init, { Maze } from './pkg/maze.js';

var canvas = document.getElementById('canvas');
var ctx = canvas.getContext('2d');
var logEl = document.createElement('div');
logEl.style.cssText = 'position:fixed;bottom:0;left:0;right:0;padding:8px;font:11px monospace;background:rgba(0,0,0,0.9);color:#0f0;z-index:99999;';
document.body.appendChild(logEl);

function log(t, c) {
  var line = document.createElement('div');
  line.textContent = t;
  line.style.color = c || '#0f0';
  logEl.appendChild(line);
}

log('Starting...');

init().then(function () {
  log('WASM OK');
  var m = new Maze(20, 20);
  m.generate_all(0);
  log('Maze generated: ' + m.rows() + 'x' + m.cols() + ' (' + m.get_cells().length + ' cells)');

  // Test 1: Zeichne mit normaler API
  log('Testing canvas fillRect...');
  var w = canvas.clientWidth;
  var h = canvas.clientHeight;
  log('CSS size: ' + w + ' x ' + h);

  canvas.width = w;
  canvas.height = h;

  ctx.fillStyle = '#ff0000';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#00ff00';
  ctx.fillRect(w * 0.1, h * 0.1, w * 0.8, h * 0.8);
  ctx.fillStyle = '#0000ff';
  ctx.fillRect(w * 0.2, h * 0.2, w * 0.6, h * 0.6);
  ctx.fillStyle = '#ffff00';
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, Math.min(w, h) * 0.15, 0, Math.PI * 2);
  ctx.fill();

  log('Drew test pattern (red/green/blue/yellow circles)');
  log('If you see this pattern, canvas works!');
  log('If canvas is invisible, CSS is the problem.');
}).catch(function (err) {
  log('ERROR: ' + err.message, '#f00');
  log(err.stack || '?', '#f88');
});
