import init, { Maze } from './pkg/maze.js';

init().then(function () {
  var canvas = document.getElementById('canvas');
  var w = canvas.clientWidth || 340;
  var h = canvas.clientHeight || 500;

  canvas.width = w;
  canvas.height = h;

  var ctx = canvas.getContext('2d');

  // Zuerst: Schwarzer Hintergrund
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, w, h);

  // Maze erzeugen und Zellen holen
  var maze = new Maze(20, 20);
  maze.generate_all(0);
  var cells = maze.get_cells();

  // Zeige die ersten Werte als Text
  ctx.fillStyle = '#00ff00';
  ctx.font = '11px monospace';
  ctx.fillText('Zellen: ' + cells.length + ' | Werte:', 8, 16);
  var first20 = [];
  for (var k = 0; k < 20; k++) first20.push(cells[k]);
  ctx.fillText(first20.join(','), 8, 30);

  // Zeichne die Maze mit fetten Wänden
  var cs = Math.min((w - 40) / 20, (h - 80) / 20);
  var ox = (w - cs * 20) / 2;
  var oy = 60;

  ctx.fillStyle = '#ffffff';
  for (var i = 0; i < cells.length; i++) {
    var x = i % 20;
    var y = Math.floor(i / 20);
    var c = cells[i];
    var cx = ox + x * cs;
    var cy = oy + y * cs;

    // Obere Wand
    if (c & 0x01) ctx.fillRect(cx, cy, cs, 3);
    // Rechte Wand
    if (c & 0x02) ctx.fillRect(cx + cs - 3, cy, 3, cs);
    // Untere Wand
    if (c & 0x04) ctx.fillRect(cx, cy + cs - 3, cs, 3);
    // Linke Wand
    if (c & 0x08) ctx.fillRect(cx, cy, 3, cs);
  }
}).catch(function (err) {
  document.body.style.background = '#ff0000';
  document.body.innerHTML = '<div style="color:white;font:16px monospace;padding:20px">FEHLER: ' + err.message + '</div>';
});
