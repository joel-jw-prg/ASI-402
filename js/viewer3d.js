/* =====================================================================
   viewer3d.js — dependency-free WebGL 2 viewer for the frame reference model
   The mesh (assets/model/frame-model.js) is loaded only when the reader asks
   for it. Units are millimetres, Z is up.
   ===================================================================== */
(function () {
  'use strict';
  var M = window.MRT; if (!M) return;
  var $ = M.$;
  var stage = $('#viewer3d'), loadBtn = $('#viewer-load'), tools = $('#viewer-tools');
  if (!stage || !loadBtn) return;

  var MOTOR_R = 240.4163;      // motor centres at (±R, ±R), i.e. a 680 mm diagonal
  var MOTOR_Z = 46;            // motor plate height in the model
  var PROP_R = 228.6;          // 18-inch propeller radius
  var PROP_Z = MOTOR_Z + 35;   // nominal propeller plane above the motor plate

  loadBtn.addEventListener('click', function () {
    loadBtn.disabled = true;
    loadBtn.textContent = 'Loading model…';
    if (window.FRAME_MODEL) { M.safe('3D viewer', init); return; }
    var sc = document.createElement('script');
    sc.src = 'assets/model/frame-model.js';
    sc.onload = function () { M.safe('3D viewer', init); };
    sc.onerror = function () { fail('The 3D model file could not be loaded.'); };
    document.head.appendChild(sc);
  });

  function fail(msg) {
    loadBtn.hidden = true;
    stage.appendChild(M.h('p', { class: 'viewer-msg', text: msg + ' The static view is shown instead.' }));
  }

  /* ---- small column-major matrix helpers ---- */
  function perspective(fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
  }
  function norm(v) { var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function lookAt(eye, up) {
    var z = norm(eye), x = norm(cross(up, z)), y = cross(z, x);
    return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1]);
  }
  function mul(a, b) {
    var o = new Float32Array(16), i, j;
    for (i = 0; i < 4; i++) for (j = 0; j < 4; j++) {
      o[j * 4 + i] = a[i] * b[j * 4] + a[4 + i] * b[j * 4 + 1] + a[8 + i] * b[j * 4 + 2] + a[12 + i] * b[j * 4 + 3];
    }
    return o;
  }

  var VS = '#version 300 es\n' +
    'layout(location=0) in vec3 aPos;\n' +
    'uniform mat4 uMVP; uniform mat4 uMV; uniform vec3 uOff; uniform float uInv;\n' +
    'out vec3 vView;\n' +
    'void main(){ vec3 p = (aPos + 32768.0) * uInv + uOff; vec4 mv = uMV * vec4(p, 1.0); vView = mv.xyz; gl_Position = uMVP * vec4(p, 1.0); }';
  var FS = '#version 300 es\n' +
    'precision highp float;\n' +
    'in vec3 vView; uniform vec3 uColor; uniform float uAlpha; uniform float uFlat;\n' +
    'out vec4 o;\n' +
    'void main(){\n' +
    '  if (uFlat > 0.5) { o = vec4(uColor, uAlpha); return; }\n' +
    '  vec3 n = normalize(cross(dFdx(vView), dFdy(vView)));\n' +
    '  float d = abs(dot(n, normalize(vec3(0.35, 0.55, 0.76))));\n' +
    '  float rim = pow(1.0 - abs(n.z), 2.0);\n' +
    '  vec3 c = uColor * (0.36 + 0.64 * d) + vec3(0.11) * rim;\n' +
    '  o = vec4(c, uAlpha);\n' +
    '}';

  function init() {
    var model = window.FRAME_MODEL;
    var canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Interactive 3D view of the bare Tarot TL680A frame with 18-inch propeller discs. Drag to orbit.');
    canvas.tabIndex = 0;
    var gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
    if (!gl) { fail('This browser does not support WebGL 2.'); return; }

    function shader(type, src) {
      var sh = gl.createShader(type);
      gl.shaderSource(sh, src); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
      return sh;
    }
    var prog = gl.createProgram();
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    var U = {};
    ['uMVP', 'uMV', 'uOff', 'uInv', 'uColor', 'uAlpha', 'uFlat'].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });

    /* decode the base64 mesh */
    var bin = atob(model.b64), bytes = new Uint8Array(bin.length), i;
    for (i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    var offset = 0, meshes = [];
    model.chunks.forEach(function (c) {
      var vao = gl.createVertexArray(); gl.bindVertexArray(vao);
      var vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb);
      gl.bufferData(gl.ARRAY_BUFFER, new Int16Array(bytes.buffer, offset, c.v * 3), gl.STATIC_DRAW);
      offset += c.v * 6;
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.SHORT, false, 0, 0);
      var ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(bytes.buffer, offset, c.i), gl.STATIC_DRAW);
      offset += c.i * 2;
      meshes.push({ vao: vao, count: c.i });
    });
    window.FRAME_MODEL.b64 = null; // free the string

    var centre = [(model.min[0] + model.max[0]) / 2, (model.min[1] + model.max[1]) / 2, (model.min[2] + PROP_Z) / 2];
    var modelOff = [model.min[0] - centre[0], model.min[1] - centre[1], model.min[2] - centre[2]];
    var plainOff = [-centre[0] - 32768, -centre[1] - 32768, -centre[2] - 32768];

    /* propeller discs (filled fan + outline) */
    var SEG = 72, fan = [], ring = [], k, a0, a1;
    [[1, 1], [-1, 1], [-1, -1], [1, -1]].forEach(function (q) {
      var cx = q[0] * MOTOR_R, cy = q[1] * MOTOR_R;
      for (k = 0; k < SEG; k++) {
        a0 = k / SEG * 2 * Math.PI; a1 = (k + 1) / SEG * 2 * Math.PI;
        fan.push(cx, cy, PROP_Z, cx + PROP_R * Math.cos(a0), cy + PROP_R * Math.sin(a0), PROP_Z, cx + PROP_R * Math.cos(a1), cy + PROP_R * Math.sin(a1), PROP_Z);
        ring.push(cx + PROP_R * Math.cos(a0), cy + PROP_R * Math.sin(a0), PROP_Z, cx + PROP_R * Math.cos(a1), cy + PROP_R * Math.sin(a1), PROP_Z);
      }
    });
    function plain(data) {
      var vao = gl.createVertexArray(); gl.bindVertexArray(vao);
      var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      return { vao: vao, count: data.length / 3 };
    }
    var discFill = plain(fan), discRing = plain(ring);

    /* camera state */
    var HOME = { yaw: -0.62, pitch: 0.42, dist: 1560 };
    var cam = { yaw: HOME.yaw, pitch: HOME.pitch, dist: HOME.dist };
    var showDiscs = true, spin = true, dragging = false, zoomArmed = false, visible = true, raf = 0, last = 0;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) spin = false;

    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var w = Math.max(1, Math.round(stage.clientWidth * dpr)), hh = Math.max(1, Math.round(stage.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== hh) { canvas.width = w; canvas.height = hh; }
      gl.viewport(0, 0, w, hh);
      request();
    }
    function render(now) {
      raf = 0;
      var dt = last ? Math.min(0.05, (now - last) / 1000) : 0; last = now;
      if (spin && !dragging) cam.yaw += dt * 0.22;
      var cp = Math.cos(cam.pitch), eye = [cam.dist * cp * Math.cos(cam.yaw), cam.dist * cp * Math.sin(cam.yaw), cam.dist * Math.sin(cam.pitch)];
      var mv = lookAt(eye, [0, 0, 1]);
      var mvp = mul(perspective(0.56, canvas.width / canvas.height, cam.dist / 40, cam.dist * 4), mv);
      gl.clearColor(0.957, 0.961, 0.969, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.depthMask(true);
      gl.uniformMatrix4fv(U.uMVP, false, mvp); gl.uniformMatrix4fv(U.uMV, false, mv);
      gl.uniform3fv(U.uOff, modelOff); gl.uniform1f(U.uInv, 1 / model.scale);
      gl.uniform3f(U.uColor, 0.20, 0.22, 0.26); gl.uniform1f(U.uAlpha, 1); gl.uniform1f(U.uFlat, 0);
      meshes.forEach(function (m) { gl.bindVertexArray(m.vao); gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_SHORT, 0); });
      if (showDiscs) {
        gl.uniform3fv(U.uOff, plainOff); gl.uniform1f(U.uInv, 1);
        gl.uniform3f(U.uColor, 0.84, 0.353, 0.192); gl.uniform1f(U.uFlat, 1);
        gl.uniform1f(U.uAlpha, 0.9);
        gl.bindVertexArray(discRing.vao); gl.drawArrays(gl.LINES, 0, discRing.count);
        gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
        gl.uniform1f(U.uAlpha, 0.2);
        gl.bindVertexArray(discFill.vao); gl.drawArrays(gl.TRIANGLES, 0, discFill.count);
        gl.depthMask(true);
      }
      if (spin && !dragging && visible) request();
    }
    function request() { if (!raf && visible) { raf = requestAnimationFrame(render); } }

    /* interaction */
    var px = 0, py = 0, pts = {}, pinch = 0;
    canvas.addEventListener('pointerdown', function (e) {
      pts[e.pointerId] = { x: e.clientX, y: e.clientY }; px = e.clientX; py = e.clientY;
      dragging = true; zoomArmed = true; pinch = 0;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!pts[e.pointerId]) return;
      pts[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(pts);
      if (ids.length === 1) {
        cam.yaw -= (e.clientX - px) * 0.008;
        cam.pitch = M.clamp(cam.pitch + (e.clientY - py) * 0.008, -0.12, 1.54);
        px = e.clientX; py = e.clientY;
      } else if (ids.length === 2) {
        var a = pts[ids[0]], b = pts[ids[1]], dd = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch) cam.dist = M.clamp(cam.dist * pinch / dd, 520, 4200);
        pinch = dd;
      }
      request();
    });
    function up(e) { delete pts[e.pointerId]; pinch = 0; if (!Object.keys(pts).length) { dragging = false; last = 0; request(); } }
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('pointerleave', function () { zoomArmed = false; });
    canvas.addEventListener('wheel', function (e) {
      if (!zoomArmed) return;            // page scroll stays free until the reader clicks the model
      e.preventDefault();
      cam.dist = M.clamp(cam.dist * Math.exp(e.deltaY * 0.0012), 520, 4200);
      request();
    }, { passive: false });
    canvas.addEventListener('keydown', function (e) {
      var used = true;
      if (e.key === 'ArrowLeft') cam.yaw -= 0.12; else if (e.key === 'ArrowRight') cam.yaw += 0.12;
      else if (e.key === 'ArrowUp') cam.pitch = M.clamp(cam.pitch + 0.1, -0.12, 1.54);
      else if (e.key === 'ArrowDown') cam.pitch = M.clamp(cam.pitch - 0.1, -0.12, 1.54);
      else if (e.key === '+' || e.key === '=') cam.dist = M.clamp(cam.dist * 0.88, 520, 4200);
      else if (e.key === '-') cam.dist = M.clamp(cam.dist / 0.88, 520, 4200);
      else used = false;
      if (used) { e.preventDefault(); request(); }
    });

    $('#viewer-discs').addEventListener('change', function (e) { showDiscs = e.target.checked; request(); });
    var spinBox = $('#viewer-spin');
    spinBox.checked = spin;
    spinBox.addEventListener('change', function (e) { spin = e.target.checked; last = 0; request(); });
    $('#viewer-top').addEventListener('click', function () { cam.pitch = 1.54; cam.yaw = -Math.PI / 2; cam.dist = 1900; spin = false; spinBox.checked = false; request(); });
    $('#viewer-reset').addEventListener('click', function () { cam.yaw = HOME.yaw; cam.pitch = HOME.pitch; cam.dist = HOME.dist; request(); });

    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); visible = false; });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) { visible = en[0].isIntersecting; last = 0; if (visible) request(); }).observe(stage);
    }
    document.addEventListener('visibilitychange', function () { last = 0; if (!document.hidden) request(); });
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(stage); else window.addEventListener('resize', resize);

    /* swap the poster for the live canvas */
    var poster = stage.querySelector('img');
    if (poster) poster.hidden = true;
    loadBtn.hidden = true;
    stage.appendChild(canvas);
    tools.hidden = false;
    resize();
  }
})();
