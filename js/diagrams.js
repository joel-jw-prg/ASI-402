/* =====================================================================
   diagrams.js — interactive diagrams
   Relay line-of-sight simulator, system architecture, CAD hotspots,
   signal architecture and the pan/zoom wiring-diagram viewer.
   ===================================================================== */
(function () {
  'use strict';
  var D = window.DRONE, M = window.MRT;
  if (!D || !M) return;
  var $ = M.$, $$ = M.$$, h = M.h, s = M.s, fmt = M.fmt, clamp = M.clamp, lin = M.lin;

  /* --------------------------------------------- hero contour motif */
  function contours() {
    var el = $('#hero-contours'); if (!el) return;
    for (var k = 1; k <= 13; k++) {
      var r = 22 * k, pts = [];
      for (var a = 0; a < 360; a += 5) {
        var t = a * Math.PI / 180;
        var rr = r * (1 + 0.16 * Math.sin(3 * t + 0.5) + 0.09 * Math.sin(5 * t + 1.7 + k * 0.08) + 0.05 * Math.sin(2 * t + k * 0.25));
        pts.push((300 + rr * Math.cos(t) * 1.25).toFixed(1) + ',' + (300 + rr * Math.sin(t) * 0.82).toFixed(1));
      }
      s('path', { d: 'M' + pts.join('L') + 'Z' }, el);
    }
  }

  /* ------------------------------------ 01 relay line-of-sight scene */
  /* Illustrative terrain profile: height (m) at distance x (m) from the base station */
  function terrain(x) {
    return 4 * Math.sin(x / 140) + 3 * Math.sin(x / 61 + 1) +
      58 * Math.exp(-Math.pow((x - 900) / 210, 2)) +
      22 * Math.exp(-Math.pow((x - 1650) / 170, 2)) + 6 * (x / 2000);
  }
  /* First point where terrain rises above the straight path P→Q, or null */
  function los(P, Q) {
    var n = Math.max(2, Math.ceil(Math.abs(Q.x - P.x) / 5));
    for (var i = 1; i < n; i++) {
      var t = i / n, x = P.x + (Q.x - P.x) * t, z = P.z + (Q.z - P.z) * t;
      if (terrain(x) > z + 0.01) return { x: x, z: terrain(x) };
    }
    return null;
  }
  function relaySim() {
    var stage = $('#relay-sim'); if (!stage) return;
    var rover = $('#sim-rover'), dx = $('#sim-dx'), alt = $('#sim-alt');
    var relay = D.links.options.filter(function (o) { return o.id === 'relay'; })[0];
    var target = D.links.marginTarget;
    var geom = null, dragging = null;

    function draw(w) {
      var hgt = Math.round(clamp(w * 0.46, 250, 430));
      var g = M.frame(stage, w, hgt);
      var x = lin(0, 2000, 46, w - 24), y = lin(-12, 205, hgt - 26, 14);
      geom = { x: x, y: y, svg: g };
      s('rect', { class: 'sky', x: 0, y: 0, width: w, height: hgt }, g);

      var ground = [], cap = [], xi;
      for (xi = 0; xi <= 2000; xi += 10) {
        ground.push(x(xi).toFixed(1) + ',' + y(terrain(xi)).toFixed(1));
        cap.push(x(xi).toFixed(1) + ',' + y(terrain(xi) + 120).toFixed(1));
      }
      s('path', { class: 'cap', fill: 'none', d: 'M' + cap.join('L') }, g);
      var narrow = w < 520;
      s('text', { class: 'cap-lbl', x: x(2000) - 2, y: y(terrain(2000) + 120) + (narrow ? 15 : -7), 'text-anchor': 'end' }, g, narrow ? '120 m limit' : '120 m height limit');
      s('path', { class: 'ground', d: 'M' + x(0) + ',' + hgt + 'L' + ground.join('L') + 'L' + x(2000) + ',' + hgt + 'Z' }, g);
      (narrow ? [0, 1000, 2000] : [0, 500, 1000, 1500, 2000]).forEach(function (t) {
        s('text', { class: 'cap-lbl', x: x(t), y: hgt - 8, 'text-anchor': t === 0 ? 'start' : t === 2000 ? 'end' : 'middle' }, g, t === 0 ? '0 m' : fmt(t) + ' m');
      });

      var rx = +rover.value, ddx = +dx.value, a = +alt.value;
      var B = { x: 0, z: terrain(0) + 3 }, R = { x: rx, z: terrain(rx) + 1 }, Dn = { x: ddx, z: terrain(ddx) + Math.max(a, 0.5) };
      function link(P, Q) {
        var d = Math.sqrt(Math.pow(Q.x - P.x, 2) + Math.pow(Q.z - P.z, 2));
        return { hit: los(P, Q), d: d, m: M.linkAt(relay, Math.max(d, 1) / 1000, false).margin };
      }
      var direct = link(B, R), h1 = link(B, Dn), h2 = link(Dn, R);

      function drawLink(P, Q, L) {
        s('line', { class: L.hit ? 'path-bad' : 'path-ok', x1: x(P.x), y1: y(P.z), x2: x(Q.x), y2: y(Q.z) }, g);
        if (L.hit) {
          var bx = x(L.hit.x), by = y(L.hit.z);
          s('circle', { class: 'blocker', r: 7, cx: bx, cy: by }, g);
          s('path', { d: 'M' + (bx - 3) + ',' + (by - 3) + 'l6,6m0,-6l-6,6', stroke: '#fff', 'stroke-width': 1.8, 'stroke-linecap': 'round', fill: 'none' }, g);
        }
      }
      drawLink(B, R, direct);
      drawLink(B, Dn, h1);
      drawLink(Dn, R, h2);

      /* base station mast */
      var bx0 = x(B.x), bg = y(terrain(0));
      s('path', { class: 'ink-line', d: 'M' + bx0 + ',' + bg + 'v-26M' + (bx0 - 8) + ',' + bg + 'l8,-16l8,16' }, g);
      s('circle', { class: 'accent-fill', r: 4, cx: bx0, cy: bg - 28 }, g);
      s('text', { class: 'node-lbl', x: bx0 + 10, y: bg - 34 }, g, 'Base (C2)');

      /* rover */
      var rpx = x(R.x), rpy = y(terrain(rx));
      var rg = s('g', { class: 'drag', 'data-who': 'rover' }, g);
      s('circle', { class: 'halo', r: 22, cx: rpx, cy: rpy - 8 }, rg);
      s('rect', { class: 'ink', x: rpx - 12, y: rpy - 14, width: 24, height: 8, rx: 2 }, rg);
      s('circle', { class: 'ink', r: 3.6, cx: rpx - 8, cy: rpy - 3.5 }, rg);
      s('circle', { class: 'ink', r: 3.6, cx: rpx, cy: rpy - 3.5 }, rg);
      s('circle', { class: 'ink', r: 3.6, cx: rpx + 8, cy: rpy - 3.5 }, rg);
      s('path', { class: 'ink-line', d: 'M' + (rpx + 6) + ',' + (rpy - 14) + 'v-8' }, rg);
      s('text', { class: 'node-lbl', x: rpx, y: rpy - 30, 'text-anchor': rpx > w - 70 ? 'end' : 'middle' }, g, 'Rover');

      /* drone */
      var dpx = x(Dn.x), dpy = y(Dn.z);
      s('line', { class: 'agl', x1: dpx, x2: dpx, y1: dpy + 6, y2: y(terrain(ddx)) }, g);
      var dg = s('g', { class: 'drag', 'data-who': 'drone' }, g);
      s('circle', { class: 'halo', r: 26, cx: dpx, cy: dpy }, dg);
      s('path', { class: 'ink-line', d: 'M' + (dpx - 16) + ',' + (dpy - 3) + 'h32M' + (dpx - 23) + ',' + (dpy - 7) + 'h14M' + (dpx + 9) + ',' + (dpy - 7) + 'h14' }, dg);
      s('ellipse', { class: 'accent-fill', cx: dpx, cy: dpy, rx: 8, ry: 5 }, dg);
      var lblEnd = dpx > w - 120, lblStart = dpx < 110;
      s('text', { class: 'node-lbl', x: dpx, y: dpy - 18, 'text-anchor': lblEnd ? 'end' : lblStart ? 'start' : 'middle' }, g, 'Drone · ' + fmt(a) + ' m up');

      /* read-outs */
      $('#sim-rover-out').textContent = fmt(rx) + ' m';
      $('#sim-dx-out').textContent = fmt(ddx) + ' m';
      $('#sim-alt-out').textContent = fmt(a) + ' m';
      var relayOk = !h1.hit && !h2.hit, weakest = Math.min(h1.m, h2.m);
      function hopItem(label, L) {
        return L.hit
          ? { label: label, value: 'Blocked', state: 'bad', sub: 'Terrain in the way' }
          : { label: label, value: fmt(L.m, 1), unit: 'dB', state: L.m >= target ? 'ok' : 'warn', sub: fmt(L.d) + ' m · ' + (L.m >= target ? 'meets' : 'below') + ' 20 dB target' };
      }
      var status = relayOk
        ? { label: 'Rover link', value: 'Relayed', state: weakest >= target ? 'ok' : 'warn', sub: 'Weakest hop ' + fmt(weakest, 1) + ' dB' }
        : !direct.hit
          ? { label: 'Rover link', value: 'Direct', state: 'ok', sub: 'Line of sight to the base' }
          : { label: 'Rover link', value: 'Lost', state: 'bad', sub: 'Move the drone to clear both hops' };
      M.readouts($('#sim-readouts'), [
        { label: 'Direct path', value: direct.hit ? 'Blocked' : 'Clear', state: direct.hit ? 'bad' : 'ok', sub: 'Base to rover, ' + fmt(direct.d) + ' m' },
        hopItem('Hop 1 · base to drone', h1),
        hopItem('Hop 2 · drone to rover', h2),
        status
      ]);
      g.setAttribute('role', 'img');
      g.setAttribute('aria-label', 'Terrain cross-section. Direct path from base to rover is ' + (direct.hit ? 'blocked' : 'clear') +
        '. Relay through the drone is ' + (relayOk ? 'working' : 'not working') + '.');
    }

    var redraw = M.mount(stage, draw);
    [rover, dx, alt].forEach(function (i) { i.addEventListener('input', redraw); });
    $('#sim-reset').addEventListener('click', function () { rover.value = 1500; dx.value = 900; alt.value = 60; redraw(); });

    function toWorld(e) {
      var b = geom.svg.getBoundingClientRect();
      return { x: geom.x.inv(e.clientX - b.left), z: geom.y.inv(e.clientY - b.top) };
    }
    stage.addEventListener('pointerdown', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('.drag') : null;
      if (!t) return;
      dragging = t.getAttribute('data-who');
      try { stage.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
      e.preventDefault();
    });
    stage.addEventListener('pointermove', function (e) {
      if (!dragging || !geom) return;
      var p = toWorld(e);
      if (dragging === 'rover') {
        rover.value = clamp(Math.round(p.x / 10) * 10, 150, 1950);
      } else {
        var nx = clamp(Math.round(p.x / 10) * 10, 0, 1950);
        dx.value = nx;
        alt.value = clamp(Math.round(p.z - terrain(nx)), 0, 120);
      }
      redraw();
    });
    function stop() { dragging = null; }
    stage.addEventListener('pointerup', stop);
    stage.addEventListener('pointercancel', stop);
  }

  /* ------------------------------------------- 05 CAD view hotspots */
  function anatomy() {
    var canvas = $('#anatomy-canvas'), views = $('#anatomy-views'), note = $('#anatomy-note');
    if (!canvas) return;
    var A = D.anatomy, names = { iso: 'Isometric', front: 'Front', top: 'Top' };
    var view = 'iso', active = 0;
    Object.keys(names).forEach(function (k) {
      views.appendChild(h('button', { type: 'button', role: 'tab', 'data-view': k, text: names[k],
        onclick: function () { view = k; active = 0; render(); } }));
    });
    function render() {
      var v = A[view];
      $$('button', views).forEach(function (b) {
        var on = b.getAttribute('data-view') === view;
        b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      canvas.textContent = '';
      canvas.appendChild(h('img', { src: v.src, alt: v.alt, width: v.w, height: v.h, loading: 'lazy' }));
      v.spots.forEach(function (sp, i) {
        var n = A.notes[sp.key];
        var b = h('button', { type: 'button', class: 'hotspot' + (i === active ? ' on' : ''), text: String(i + 1),
          'aria-label': (i + 1) + ': ' + n.title, 'aria-pressed': i === active ? 'true' : 'false',
          onclick: function () { active = i; render(); } });
        b.style.left = sp.x + '%'; b.style.top = sp.y + '%';
        canvas.appendChild(b);
      });
      var cur = A.notes[v.spots[active].key];
      note.textContent = '';
      note.appendChild(h('span', { class: 'big-n', text: String(active + 1).length < 2 ? '0' + (active + 1) : String(active + 1) }));
      note.appendChild(h('h4', { text: cur.title }));
      note.appendChild(h('p', { text: cur.text }));
      note.appendChild(h('div', { class: 'pager' }, [
        h('span', { text: (active + 1) + ' of ' + v.spots.length + ' · ' + names[view] + ' view' }),
        h('button', { type: 'button', class: 'btn btn-small', text: 'Next', onclick: function () { active = (active + 1) % v.spots.length; render(); } })
      ]));
    }
    render();
  }

  /* -------------------------------------- 06 system architecture map */
  function architecture() {
    var host = $('#arch-diagram'), panel = $('#arch-panel'); if (!host) return;
    var A = D.arch;
    var box = {
      power: [16, 14, 728, 62], video: [16, 170, 190, 84], fc: [285, 170, 190, 84], prop: [554, 170, 190, 84],
      rc: [16, 352, 190, 84], relay: [554, 352, 190, 84]
    };
    var short = { video: 'FPV video' };
    var subs = {
      power: ['MAD 6S 16 Ah battery → PM08-CAN → main bus, 5 A fuse and 12 V BEC'],
      video: ['GT2 VTX + HD camera', 'on a GM3 gimbal'], fc: ['Pixhawk 6X', 'on Mini Baseboard'],
      prop: ['Tekko32 4-in-1 ESC', '4 × MAD 5008 340KV'], rc: ['RadioMaster DBR4', 'dual-band ELRS'],
      relay: ['GL.iNet 2.4 GHz router', '5 V from GPS2']
    };
    /* wire geometry: path, arrow-head tip [x, y, direction], label position */
    var wires = [
      { from: 'power', to: 'video', kind: 'power', d: 'M111,76V162', head: [111, 170, 'd'], lbl: [121, 128, 'start'] },
      { from: 'power', to: 'fc', kind: 'power', d: 'M380,76V162', head: [380, 170, 'd'], lbl: [390, 128, 'start'] },
      { from: 'power', to: 'prop', kind: 'power', d: 'M649,76V162', head: [649, 170, 'd'], lbl: [659, 128, 'start'] },
      { from: 'fc', to: 'prop', kind: 'signal', d: 'M475,212H546', head: [554, 212, 'r'], lbl: [514, 200, 'middle'] },
      { from: 'fc', to: 'video', kind: 'signal', d: 'M285,212H214', head: [206, 212, 'l'], lbl: [246, 200, 'middle'] },
      { from: 'fc', to: 'rc', kind: 'power', d: 'M322,254V386H214', head: [206, 386, 'l'], lbl: null },
      { from: 'fc', to: 'rc', kind: 'signal', d: 'M206,404H340V262', head: [340, 254, 'u'], lbl: [350, 326, 'start'] },
      { from: 'fc', to: 'relay', kind: 'power', d: 'M430,254V394H546', head: [554, 394, 'r'], lbl: [440, 300, 'start'] }
    ];
    var g = s('svg', { viewBox: '0 0 760 450', role: 'group', 'aria-label': 'System architecture: six subsystems joined by power and signal connections' }, host);
    var layer = 'all', selected = 'fc';

    function linkFor(wr) {
      return A.links.filter(function (l) { return l.from === wr.from && l.to === wr.to; })[0];
    }
    var wireNodes = wires.map(function (wr) {
      var L = linkFor(wr);
      var grp = s('g', { class: 'w' }, g);
      s('path', { class: 'wire ' + wr.kind, d: wr.d }, grp);
      var x = wr.head[0], y = wr.head[1], pts = {
        d: [x - 6, y - 10, x + 6, y - 10, x, y], u: [x - 6, y + 10, x + 6, y + 10, x, y],
        r: [x - 10, y - 6, x - 10, y + 6, x, y], l: [x + 10, y - 6, x + 10, y + 6, x, y]
      }[wr.head[2]];
      s('polygon', { class: 'head ' + wr.kind, points: pts.join(',') }, grp);
      if (wr.lbl) s('text', { class: 'wlbl', x: wr.lbl[0], y: wr.lbl[1], 'text-anchor': wr.lbl[2] }, grp, L.label);
      /* fat invisible stroke as the hover target */
      var hit = s('path', { d: wr.d, fill: 'none', stroke: 'transparent', 'stroke-width': 16 }, grp);
      M.hover(hit, function () {
        return { title: L.label, rows: [{ color: M.cssVar(host, wr.kind === 'power' ? '--power' : '--signal'), value: L.wires, label: wr.kind }] };
      });
      return { el: grp, wr: wr };
    });

    var blockNodes = {};
    A.blocks.forEach(function (b) {
      var r = box[b.id];
      var grp = s('g', { class: 'blk', tabindex: 0, role: 'button', 'aria-label': b.n + ' ' + b.title + '. Show details.' }, g);
      s('rect', { x: r[0], y: r[1], width: r[2], height: r[3], rx: 10 }, grp);
      s('text', { class: 'blk-n', x: r[0] + 14, y: r[1] + 27 }, grp, b.n);
      s('text', { class: 'blk-t', x: r[0] + 42, y: r[1] + 28 }, grp, short[b.id] || b.title);
      subs[b.id].forEach(function (line, i) { s('text', { class: 'blk-s', x: r[0] + 14, y: r[1] + 49 + i * 16 }, grp, line); });
      grp.addEventListener('click', function () { select(b.id); });
      grp.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(b.id); } });
      blockNodes[b.id] = grp;
    });

    function paint() {
      wireNodes.forEach(function (n) {
        var touches = n.wr.from === selected || n.wr.to === selected;
        var off = layer !== 'all' && n.wr.kind !== layer;
        n.el.classList.toggle('faded', off);
        n.el.querySelector('.wire').classList.toggle('hot', touches && !off);
      });
      Object.keys(blockNodes).forEach(function (id) {
        blockNodes[id].classList.toggle('on', id === selected);
        blockNodes[id].setAttribute('aria-pressed', id === selected ? 'true' : 'false');
      });
    }
    function select(id) {
      selected = id;
      var b = A.blocks.filter(function (x) { return x.id === id; })[0];
      var names = {}; A.blocks.forEach(function (x) { names[x.id] = x.title; });
      panel.textContent = '';
      panel.appendChild(h('p', { class: 'panel-n', text: b.n + ' / 06' }));
      panel.appendChild(h('h3', { text: b.title }));
      panel.appendChild(h('p', { class: 'panel-sub', text: b.sub }));
      panel.appendChild(h('div', { class: 'panel-cols' }, [
        h('div', null, [h('h4', { text: 'Inside' }), h('ul', { class: 'ticks' }, b.inside.map(function (t) { return h('li', { text: t }); }))]),
        h('div', null, [h('h4', { text: 'Why this design' }), h('ul', { class: 'ticks' }, b.why.map(function (t) { return h('li', { text: t }); }))])
      ]));
      panel.appendChild(h('h4', { text: 'Connections' }));
      panel.appendChild(h('div', { class: 'wires' }, A.links.filter(function (l) { return l.from === id || l.to === id; }).map(function (l) {
        var other = l.from === id ? l.to : l.from;
        return h('span', { class: l.kind === 'signal' ? 'signal' : 'power', text: l.label + ' ' + (l.from === id ? '→ ' : '← ') + names[other] + ' · ' + l.wires });
      })));
      paint();
    }
    $$('#arch-layers button').forEach(function (b) {
      b.addEventListener('click', function () {
        layer = b.getAttribute('data-layer');
        $$('#arch-layers button').forEach(function (x) { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        paint();
      });
    });
    select(selected);
  }

  /* --------------------------------------- 07 signal architecture map */
  function signalDiagram() {
    var host = $('#signal-diagram'); if (!host) return;
    var g = s('svg', { viewBox: '0 0 960 392', role: 'img',
      'aria-label': 'Signal architecture. Inside the base station: controller and monitor. Outside on stands: control antenna, goggles and Rocket M2 radio. On the drone: receiver, video transmitter and repeater, which also links to the rover.' }, host);
    function zone(x, w, hgt, title, accent) {
      s('rect', { class: 'zone-box', x: x, y: 30, width: w, height: hgt, rx: 12 }, g);
      var tw = title.length * 8.2 + 26;
      s('rect', { class: 'zone-tab' + (accent ? ' accent' : ''), x: x + 14, y: 14, width: tw, height: 30, rx: 8 }, g);
      s('text', { class: 'zone-title', x: x + 27, y: 34 }, g, title);
    }
    function dev(x, y, w, title, sub) {
      var grp = s('g', { class: 'dev' }, g);
      s('rect', { x: x, y: y, width: w, height: 52, rx: 8 }, grp);
      s('text', { class: 'dev-t', x: x + 14, y: y + 23 }, grp, title);
      s('text', { class: 'dev-s', x: x + 14, y: y + 40 }, grp, sub);
    }
    zone(10, 250, 270, 'Base station');
    zone(290, 300, 270, 'Antenna stands, outside');
    zone(620, 330, 270, 'Drone', true);
    dev(40, 64, 190, 'TX16S MK3 controller', 'Pilot commands');
    dev(40, 144, 190, 'Laptop monitor', 'Video for the operators');
    dev(330, 64, 220, 'Control antenna', '2.4 GHz, on a stand');
    dev(330, 144, 220, 'Goggles X', '5.8 GHz video receiver');
    dev(330, 224, 220, 'Rocket M2 radio', 'Base end of the rover network');
    dev(650, 64, 270, 'DBR4 receiver', 'Dual-band ELRS');
    dev(650, 144, 270, 'GT2 VTX + HD camera', '1080p at 60 Hz');
    dev(650, 224, 270, 'GL-AR300M-Ext repeater', '2.4 GHz Wi-Fi relay');
    dev(690, 326, 190, 'Rover', 'Rocket M2 radio on board');
    /* cables through the base-station wall */
    s('path', { class: 'cable', d: 'M230,90H330' }, g);
    s('text', { class: 'cable-lbl', x: 280, y: 80, 'text-anchor': 'middle' }, g, '20 m LMR400');
    s('path', { class: 'cable', d: 'M230,170H330' }, g);
    s('text', { class: 'cable-lbl', x: 280, y: 160, 'text-anchor': 'middle' }, g, 'HDMI');
    /* radio links */
    var links = [
      { grp: 'rc', d: 'M550,90C583,64 617,64 650,90', label: '2.4 GHz control', lx: 600, ly: 62, heads: [[650, 90, 1]] },
      { grp: 'fpv', d: 'M550,170C583,144 617,144 650,170', label: '5.8 GHz video', lx: 600, ly: 142, heads: [[550, 170, -1]] },
      { grp: 'relay', d: 'M550,250C583,224 617,224 650,250', label: '2.4 GHz relay', lx: 600, ly: 222, heads: [[650, 250, 1], [550, 250, -1]] },
      { grp: 'relay', d: 'M785,276V326', label: 'about 1 km', lx: 838, ly: 306, heads: [[785, 326, 0]] }
    ];
    var nodes = [];
    links.forEach(function (L) {
      var grp = s('g', { class: 'rf-g', 'data-grp': L.grp, style: 'cursor:pointer' }, g);
      s('path', { class: 'rf ' + L.grp, d: L.d }, grp);
      var tw = L.label.length * 7.4 + 14;
      s('rect', { class: 'rf-chip', x: L.lx - tw / 2, y: L.ly - 14, width: tw, height: 20, rx: 6, fill: M.cssVar(host, '--surface') }, grp);
      s('text', { class: 'rf-lbl', x: L.lx, y: L.ly, 'text-anchor': 'middle' }, grp, L.label);
      grp.addEventListener('click', function () {
        var id = { rc: 'rc24', fpv: 'fpv', relay: 'relay' }[L.grp];
        var tab = $('#link-options [data-id="' + id + '"]');
        if (tab) { tab.click(); tab.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
      });
      nodes.push(grp);
    });
    M.highlightLink = function (group) {
      nodes.forEach(function (n) { n.classList.toggle('dimmed', !!group && n.getAttribute('data-grp') !== group); });
    };
  }

  /* --------------------------------------- 06 wiring-diagram viewer */
  function wiringViewer() {
    var modal = $('#wiring-modal'), stage = $('#wiring-stage'), img = $('#wiring-full'), opener = $('#wiring-open');
    if (!modal || !opener) return;
    var W = D.wiring, k = 1, tx = 0, ty = 0, loaded = false, pending = null, lastFocus = null;
    var pointers = {}, pinch = 0;
    function apply() { img.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + k + ')'; }
    function minK() { return Math.min(stage.clientWidth / W.size[0], stage.clientHeight / W.size[1]) * 0.9; }
    function fitBox(b) {
      var sw = stage.clientWidth, sh = stage.clientHeight, pad = 20;
      k = Math.min((sw - 2 * pad) / b[2], (sh - 2 * pad) / b[3]);
      tx = (sw - b[2] * k) / 2 - b[0] * k;
      ty = (sh - b[3] * k) / 2 - b[1] * k;
      apply();
    }
    function zoomAt(px, py, f) {
      var nk = clamp(k * f, minK(), 4); f = nk / k;
      tx = px - (px - tx) * f; ty = py - (py - ty) * f; k = nk; apply();
    }
    function open(box) {
      lastFocus = document.activeElement;
      modal.hidden = false;
      document.body.style.overflow = 'hidden';
      pending = box || W.zones[0].box;
      if (!loaded) {
        img.onload = function () { loaded = true; img.width = W.size[0]; img.height = W.size[1]; fitBox(pending); };
        img.src = W.full;
      } else fitBox(pending);
      $('#wz-close').focus();
    }
    function close() {
      modal.hidden = true;
      document.body.style.overflow = '';
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }
    opener.addEventListener('click', function () { open(); });
    W.zones.forEach(function (z, i) {
      if (i) $('#wiring-zones').appendChild(h('button', { type: 'button', class: 'zone', text: z.label, onclick: function () { open(z.box); } }));
      $('#modal-zones').appendChild(h('button', { type: 'button', text: z.label, onclick: function () { if (loaded) fitBox(z.box); else pending = z.box; } }));
    });
    $('#wz-close').addEventListener('click', close);
    $('#wz-in').addEventListener('click', function () { zoomAt(stage.clientWidth / 2, stage.clientHeight / 2, 1.4); });
    $('#wz-out').addEventListener('click', function () { zoomAt(stage.clientWidth / 2, stage.clientHeight / 2, 1 / 1.4); });
    stage.addEventListener('wheel', function (e) {
      e.preventDefault();
      var r = stage.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0016));
    }, { passive: false });
    stage.addEventListener('pointerdown', function (e) {
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      try { stage.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      pinch = 0;
    });
    stage.addEventListener('pointermove', function (e) {
      var p = pointers[e.pointerId]; if (!p) return;
      var ids = Object.keys(pointers);
      if (ids.length === 1) { tx += e.clientX - p.x; ty += e.clientY - p.y; apply(); }
      p.x = e.clientX; p.y = e.clientY;
      if (ids.length === 2) {
        var a = pointers[ids[0]], b = pointers[ids[1]], dist = Math.hypot(a.x - b.x, a.y - b.y), r = stage.getBoundingClientRect();
        if (pinch) zoomAt((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, dist / pinch);
        pinch = dist;
      }
    });
    function up(e) { delete pointers[e.pointerId]; pinch = 0; }
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);
    document.addEventListener('keydown', function (e) {
      if (modal.hidden) return;
      if (e.key === 'Escape') { close(); return; }
      var step = 80;
      if (e.key === 'ArrowLeft') tx += step; else if (e.key === 'ArrowRight') tx -= step;
      else if (e.key === 'ArrowUp') ty += step; else if (e.key === 'ArrowDown') ty -= step;
      else if (e.key === '+' || e.key === '=') { zoomAt(stage.clientWidth / 2, stage.clientHeight / 2, 1.3); return; }
      else if (e.key === '-') { zoomAt(stage.clientWidth / 2, stage.clientHeight / 2, 1 / 1.3); return; }
      else return;
      e.preventDefault(); apply();
    });
  }

  M.safe('hero contours', contours);
  M.safe('relay simulator', relaySim);
  M.safe('anatomy', anatomy);
  M.safe('architecture', architecture);
  M.safe('signal diagram', signalDiagram);
  M.safe('wiring viewer', wiringViewer);
})();
