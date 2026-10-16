(function () {
  'use strict';

  var lines = [];
  function log(text, color) {
    lines.push({ text: text, color: color || '#e8ebee' });
    render();
  }
  function render() {
    var el = document.getElementById('__dbg');
    if (!el) {
      el = document.createElement('div');
      el.id = '__dbg';
      el.style.cssText = 'position:fixed;top:0;left:0;right:0;max-height:60vh;overflow-y:auto;padding:14px;font:12px/1.5 monospace;z-index:99999;color:#fff;background:#0d1014;border-bottom:2px solid #252b36;';
      document.body.appendChild(el);
    }
    el.innerHTML = '';
    for (var i = 0; i < lines.length; i++) {
      var div = document.createElement('div');
      div.textContent = lines[i].text;
      div.style.color = lines[i].color;
      el.appendChild(div);
    }
    el.scrollTop = el.scrollHeight;
  }

  window.addEventListener('error', function (e) {
    log('FEHLER: ' + e.message + ' (Zeile ' + e.lineno + ')', '#f87171');
  });

  async function checkFile(url) {
    try {
      var res = await fetch(url, { method: 'HEAD' });
      if (res.ok) {
        log('OK  ' + url + ' (Status ' + res.status + ')', '#5ecf7a');
        return true;
      } else {
        log('FEHLT ' + url + ' (Status ' + res.status + ')', '#f87171');
        return false;
      }
    } catch (err) {
      log('FEHLT ' + url + ' (Netzwerkfehler)', '#f87171');
      return false;
    }
  }

  async function boot() {
    log('--- Maze Debug ---', '#fcc02a');
    log('Teste Dateien...', '#9ca3af');

    var okJs = await checkFile('./pkg/maze.js');
    var okWasm = await checkFile('./pkg/maze_bg.wasm');

    if (!okJs) {
      log('', '#fff');
      log('pkg/maze.js fehlt. Dateiname könnte anders sein.', '#f87171');
      log('Versuch: ./pkg/maze.js zu laden mit getFullList...', '#9ca3af');
      try {
        var res = await fetch('./pkg/');
        if (res.ok) {
          var text = await res.text();
          log('Antwort auf ./pkg/: ' + text.substring(0, 500), '#9ca3af');
        }
      } catch (e) {}
      return;
    }

    log('', '#fff');
    log('Lade Modul...', '#9ca3af');
    var mod;
    try {
      mod = await import('./pkg/maze.js');
      log('Modul geladen. Exports: ' + Object.keys(mod).join(', '), '#5ecf7a');
    } catch (err) {
      log('FEHLER beim import: ' + err.message, '#f87171');
      return;
    }

    var initFn = mod.default;
    var MazeClass = mod.Maze;
    if (typeof initFn !== 'function') {
      log('mod.default ist keine Funktion! Typ: ' + typeof initFn, '#f87171');
      return;
    }
    if (typeof MazeClass !== 'function') {
      log('mod.Maze ist keine Klasse! Typ: ' + typeof MazeClass, '#f87171');
      return;
    }

    log('Rufe init() auf...', '#9ca3af');
    try {
      await initFn();
      log('init() erfolgreich.', '#5ecf7a');
    } catch (err) {
      log('FEHLER bei init(): ' + err.message, '#f87171');
      log('Stack: ' + (err.stack || '?'), '#9ca3af');
      return;
    }

    log('Erstelle Maze(20, 20)...', '#9ca3af');
    var maze;
    try {
      maze = new MazeClass(20, 20);
      log('Maze erstellt: ' + maze.rows() + 'x' + maze.cols(), '#5ecf7a');
    } catch (err) {
      log('FEHLER bei new Maze(): ' + err.message, '#f87171');
      return;
    }

    log('Teste generate_all(0)...', '#9ca3af');
    try {
      var t0 = performance.now();
      maze.generate_all(0);
      var dt = Math.round(performance.now() - t0);
      log('generate_all in ' + dt + 'ms fertig. Zellen: ' + maze.get_cells().length, '#5ecf7a');
    } catch (err) {
      log('FEHLER bei generate_all: ' + err.message, '#f87171');
      return;
    }

    log('', '#fff');
    log('ALLES FUNKTIONIERT. Das Problem liegt in der echten main.js.', '#5ecf7a');
  }

  boot();
})();
