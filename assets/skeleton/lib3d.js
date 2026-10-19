// lib3d.js — the shared art layer for 一句话，造一个世界 (film-mascot-world).
// Classic script (no bundler): include it BEFORE the module scripts. Every function takes THREE in,
// nothing touches the clock, nothing uses Math.random — one seeded RNG, one look, both scenes.
(function () {
  const L = (window.LIB3D = window.LIB3D || {});

  // ---------- palette (sampled from the reference film) ----------
  L.PAL = {
    mascot: 0xd97757, mascotDark: 0xb85a3d, mascotLight: 0xe8a184,
    eye: 0x241512,
    desk: 0x241a16, deskLight: 0x3a2a22,
    cap: 0x17120f, capTop: 0x221a16, legend: 0x6b5a50,
    grassA: 0x7cb04a, grassB: 0x8dc45c, grassDark: 0x4d7a33,
    grassNight: 0x14301f,
    leafA: 0x2f7a3d, leafB: 0x3c8f46, leafC: 0x245f33,
    rock: 0x9a866c, rockDark: 0x6f5f4a, rockLight: 0xb9a689,
    sand: 0xd8c49a,
    water: 0x3f9fc4, waterDeep: 0x2b6f92,
    sky: 0x9fc4e0,
    wall: 0xefe6d2, wallWarm: 0xe9d9bd,
    roofRed: 0xc0503a, roofTeal: 0x2f6f6a, roofDark: 0x3a3f4a, roofBlue: 0x40608a,
    windowLit: 0xffd48f, windowDark: 0x2a2b33,
    lamp: 0xffe0a8,
    star: 0xdfe8ff,
  };

  // ---------- math ----------
  L.clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  L.seg = (t, a, b) => L.clamp((t - a) / (b - a)); // 0..1 across a segment
  L.smooth = (x) => x * x * (3 - 2 * x);
  L.smoothSeg = (t, a, b) => L.smooth(L.seg(t, a, b));
  L.lerp = (a, b, k) => a + (b - a) * k;
  L.easeOut = (x) => 1 - Math.pow(1 - x, 3);
  L.easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  L.easeOutBack = (x, s = 1.4) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2);
  // a pure-function spring (settles inside the window): 0 → 1 with one overshoot
  L.spring = (x, bounce = 0.18) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const z = -Math.log(bounce) / Math.sqrt(Math.PI * Math.PI + Math.log(bounce) ** 2);
    const w = 6.9 / z, wd = w * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w * x) * (Math.cos(wd * x) + ((z * w) / wd) * Math.sin(wd * x));
  };

  // ---------- seeded random ----------
  L.rand = function (seed) {
    let a = (seed | 0) || 1;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // ---------- materials ----------
  const cache = new Map();
  L.mat = function (THREE, color, opts) {
    const o = opts || {};
    const key = color + '|' + JSON.stringify(o);
    if (cache.has(key)) return cache.get(key);
    const m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: o.roughness == null ? 0.88 : o.roughness,
      metalness: o.metalness == null ? 0 : o.metalness,
      flatShading: !!o.flat,
      emissive: new THREE.Color(o.emissive == null ? 0x000000 : o.emissive),
      emissiveIntensity: o.emissiveIntensity == null ? 1 : o.emissiveIntensity,
      transparent: !!o.transparent,
      opacity: o.opacity == null ? 1 : o.opacity,
      side: o.side || THREE.FrontSide,
    });
    cache.set(key, m);
    return m;
  };
  L.ownMat = function (THREE, color, opts) {
    const m = L.mat(THREE, color, opts).clone();
    return m;
  };

  // A rounded box: the shape of Mascot's body, the keycaps and every soft prop.
  L.roundBox = function (THREE, w, h, d, r, seg) {
    const rr = Math.min(r == null ? 0.08 : r, Math.min(w, h) / 2 - 1e-4);
    const s = new THREE.Shape();
    const x = -w / 2, y = -h / 2;
    s.moveTo(x + rr, y);
    s.lineTo(x + w - rr, y);
    s.quadraticCurveTo(x + w, y, x + w, y + rr);
    s.lineTo(x + w, y + h - rr);
    s.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    s.lineTo(x + rr, y + h);
    s.quadraticCurveTo(x, y + h, x, y + h - rr);
    s.lineTo(x, y + rr);
    s.quadraticCurveTo(x, y, x + rr, y);
    const depth = Math.max(0.001, d - rr * 2);
    const g = new THREE.ExtrudeGeometry(s, {
      depth, bevelEnabled: true, bevelSegments: seg == null ? 3 : seg,
      bevelSize: rr, bevelThickness: rr, curveSegments: 6,
    });
    g.translate(0, 0, -depth / 2);
    g.computeVertexNormals();
    return g;
  };

  // ---------- glow sprites (canvas, deterministic) ----------
  L.glowTexture = function (THREE, color, soft) {
    if (!L._glow) L._glow = new Map();
    const key = color + '|' + (soft || 0);
    if (L._glow.has(key)) return L._glow.get(key);
    const s = 128;
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    const col = new THREE.Color(color);
    const hex = (a) => `rgba(${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)},${a})`;
    grad.addColorStop(0, hex(1));
    grad.addColorStop(soft ? 0.25 : 0.12, hex(soft ? 0.55 : 0.75));
    grad.addColorStop(1, hex(0));
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    L._glow.set(key, tex);
    return tex;
  };
  L.glowSprite = function (THREE, color, size, opts) {
    const o = opts || {};
    const m = new THREE.SpriteMaterial({
      map: L.glowTexture(THREE, color, o.soft),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: o.opacity == null ? 1 : o.opacity,
    });
    const sp = new THREE.Sprite(m);
    sp.scale.set(size, size, 1);
    return sp;
  };

  // ---------- Mascot ----------
  // The character: a rounded coral box, two dark eyes, a nub on each side, four little legs.
  // Returns { group, pose({walk, bob, jump, look, eyes, squash}) }.
  L.mascot = function (THREE, opts) {
    const o = opts || {};
    const s = o.scale == null ? 1 : o.scale;
    const g = new THREE.Group();

    const bodyMat = L.mat(THREE, o.color == null ? L.PAL.mascot : o.color, { roughness: 0.72 });
    const body = new THREE.Mesh(L.roundBox(THREE, 1.0, 0.74, 0.62, 0.1, 3), bodyMat);
    body.position.y = 0.56;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);

    const eyeMat = L.mat(THREE, L.PAL.eye, { roughness: 0.35, metalness: 0.05 });
    const eyes = new THREE.Group();
    for (const sx of [-0.2, 0.2]) {
      const e = new THREE.Mesh(L.roundBox(THREE, 0.085, 0.14, 0.03, 0.03, 2), eyeMat);
      e.position.set(sx, 0.62, 0.315);
      eyes.add(e);
    }
    g.add(eyes);

    // the little nub ear / hand on both sides
    const nubMat = L.mat(THREE, L.PAL.mascotDark, { roughness: 0.7 });
    for (const sx of [-0.52, 0.52]) {
      const nub = new THREE.Mesh(L.roundBox(THREE, 0.1, 0.1, 0.16, 0.04, 2), nubMat);
      nub.position.set(sx, 0.54, 0);
      g.add(nub);
    }

    const legs = [];
    for (let i = 0; i < 4; i++) {
      const leg = new THREE.Mesh(L.roundBox(THREE, 0.13, 0.24, 0.14, 0.05, 2), bodyMat);
      leg.castShadow = true;
      const sx = i < 2 ? -0.24 : 0.24;
      const sz = i % 2 === 0 ? -0.16 : 0.16;
      leg.position.set(sx, 0.12, sz);
      g.add(leg);
      legs.push(leg);
    }

    g.scale.setScalar(s);

    const st = { walk: 0, bob: 0, jump: 0, look: 0, eyes: 1, squash: 1 };
    const pose = (p) => {
      Object.assign(st, p || {});
      const t = st.walk;
      g.position.y = st.bob + st.jump;
      g.rotation.z = Math.sin(t * Math.PI * 2) * 0.035 * (st.walk ? 1 : 0) + (st.look || 0) * 0.02;
      g.rotation.y = (st.look || 0);
      g.scale.set(s * (2 - st.squash), s * st.squash, s * (2 - st.squash));
      legs.forEach((leg, i) => {
        const ph = t * Math.PI * 2 + (i % 2 ? Math.PI : 0) + (i < 2 ? 0 : Math.PI);
        leg.position.y = 0.12 + Math.max(0, Math.sin(ph)) * 0.05;
        leg.position.z = (i % 2 === 0 ? -0.16 : 0.16) + Math.cos(ph) * 0.03;
      });
      const eyeScale = Math.max(0.08, st.eyes);
      eyes.scale.y = eyeScale;
      if (st.squash !== 1) { g.position.y -= (1 - st.squash) * 0.25; }
    };
    pose({});
    return { group: g, pose, body, eyes };
  };

  // ---------- voxel mesh builder ----------
  // Accumulates quads with a colour each; one geometry, MeshLambert-ish shading via vertex colours.
  // Used for terrain, mountains, roofs — cheap, flat, and it reads as the reference's blocky world.
  L.Vox = function (THREE) {
    const pos = [], nor = [], col = [], idx = [];
    const c = new THREE.Color();
    const push = (ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, nx, ny, nz, color, jitter) => {
      c.set(color);
      if (jitter) { const k = 1 + (jitter.r() - 0.5) * jitter.amount; c.multiplyScalar(k); }
      const base = pos.length / 3;
      pos.push(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz);
      for (let i = 0; i < 4; i++) { nor.push(nx, ny, nz); col.push(c.r, c.g, c.b); }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    const api = {
      // axis-aligned box, colour per face with a little per-block noise
      box(x, y, z, w, h, d, color, opts) {
        const o = opts || {};
        const j = o.jitter ? { r: o.rand || L.rand(1), amount: o.jitter } : null;
        const x0 = x - w / 2, x1 = x + w / 2, y0 = y, y1 = y + h, z0 = z - d / 2, z1 = z + d / 2;
        push(x0, y1, z1, x1, y1, z1, x1, y1, z0, x0, y1, z0, 0, 1, 0, color, j);
        if (!o.noBottom) push(x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1, 0, -1, 0, color, j);
        push(x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1, 0, 0, 1, color, j);
        push(x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0, 0, 0, -1, color, j);
        push(x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1, 1, 0, 0, color, j);
        push(x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0, -1, 0, 0, color, j);
      },
      // four sided pyramid-ish roof (a ridge along z)
      gable(x, y, z, w, h, d, color, opts) {
        const o = opts || {};
        const j = o.jitter ? { r: o.rand || L.rand(2), amount: o.jitter } : null;
        const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
        const n = new THREE.Vector3();
        const tri = (a, b, c2, color2) => {
          const base = pos.length / 3;
          pos.push(...a, ...b, ...c2);
          n.subVectors(new THREE.Vector3(...b), new THREE.Vector3(...a)).cross(new THREE.Vector3(...c2).sub(new THREE.Vector3(...a))).normalize();
          c.set(color2);
          if (j) c.multiplyScalar(1 + (j.r() - 0.5) * j.amount);
          for (let i = 0; i < 3; i++) { nor.push(n.x, n.y, n.z); col.push(c.r, c.g, c.b); }
          idx.push(base, base + 1, base + 2);
        };
        // two long slopes
        tri([x0, y, z1], [x1, y, z1], [x1, y + h, z1], color);
        tri([x0, y, z1], [x1, y + h, z1], [x0, y + h, z1], color);
        tri([x1, y, z0], [x0, y, z0], [x0, y + h, z0], color);
        tri([x1, y, z0], [x0, y + h, z0], [x1, y + h, z0], color);
        // gable ends
        tri([x0, y, z0], [x0, y, z1], [x0, y + h, z1], color);
        tri([x1, y, z0], [x1, y + h, z1], [x1, y, z1], color);
        void d; void z0; void z1;
      },
      build() {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        g.setIndex(idx);
        g.computeBoundingSphere();
        return g;
      },
      isEmpty: () => pos.length === 0,
    };
    return api;
  };
  L.voxMaterial = (THREE, opts) =>
    new THREE.MeshLambertMaterial(Object.assign({ vertexColors: true }, opts || {}));

  // ---------- foliage ----------
  L.pine = function (THREE, opts) {
    const o = opts || {};
    const r = o.rand || L.rand(3);
    const g = new THREE.Group();
    const h = o.h == null ? 1 : o.h;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.045 * h, 0.06 * h, 0.28 * h, 6), L.mat(THREE, 0x5b4433, { flat: true, roughness: 1 }));
    trunk.position.y = 0.14 * h;
    trunk.castShadow = true;
    g.add(trunk);
    const shades = [L.PAL.leafA, L.PAL.leafB, L.PAL.leafC];
    for (let i = 0; i < 3; i++) {
      const t = i / 2;
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry((0.34 - t * 0.1) * h, (0.42 - t * 0.06) * h, 7),
        L.mat(THREE, shades[(i + Math.floor(r() * 3)) % 3], { flat: true, roughness: 1 })
      );
      cone.position.y = (0.34 + i * 0.26) * h;
      cone.rotation.y = r() * Math.PI;
      cone.castShadow = true;
      g.add(cone);
    }
    return g;
  };
  L.bush = function (THREE, opts) {
    const o = opts || {};
    const r = o.rand || L.rand(4);
    const g = new THREE.Group();
    const n = 2 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const b = new THREE.Mesh(
        new THREE.IcosahedronGeometry((0.12 + r() * 0.1) * (o.h || 1), 0),
        L.mat(THREE, [L.PAL.leafA, L.PAL.leafB, L.PAL.leafC][Math.floor(r() * 3)], { flat: true, roughness: 1 })
      );
      b.position.set((r() - 0.5) * 0.3, (0.08 + r() * 0.12) * (o.h || 1), (r() - 0.5) * 0.3);
      b.castShadow = true;
      g.add(b);
    }
    return g;
  };

  // ---------- house ----------
  // A blocky house: pale wall box, pitched roof, a few warm windows, a door.
  L.house = function (THREE, opts) {
    const o = opts || {};
    const r = o.rand || L.rand(5);
    const w = o.w == null ? 1.2 : o.w;
    const d = o.d == null ? 1.6 : o.d;
    const h = o.h == null ? 0.9 : o.h;
    const g = new THREE.Group();
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), L.mat(THREE, o.wall == null ? L.PAL.wall : o.wall, { roughness: 0.95 }));
    wall.position.y = h / 2;
    wall.castShadow = true;
    wall.receiveShadow = true;
    g.add(wall);
    const roofMat = L.mat(THREE, o.roof == null ? L.PAL.roofRed : o.roof, { roughness: 0.9, flat: true });
    const roofH = o.roofH == null ? h * 0.55 : o.roofH;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.74, roofH, 4), roofMat);
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(w / Math.max(w, d), 1, d / Math.max(w, d));
    roof.position.y = h + roofH / 2;
    roof.castShadow = true;
    g.add(roof);
    // windows
    const winMat = L.mat(THREE, L.PAL.windowLit, { roughness: 0.4, emissive: 0xffb257, emissiveIntensity: o.lit ? 1.6 : 0 });
    const wins = [];
    const cols = Math.max(1, Math.round(w / 0.5));
    for (let i = 0; i < cols; i++) {
      for (const y of [h * 0.34, h * 0.68].slice(0, h > 0.8 ? 2 : 1)) {
        const win = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.2), winMat);
        win.position.set(-w / 2 + (i + 0.5) * (w / cols), y, d / 2 + 0.006);
        g.add(win);
        wins.push(win);
      }
    }
    const door = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.3), L.mat(THREE, 0x6b4a33, { roughness: 1 }));
    door.position.set(0, 0.15, d / 2 + 0.007);
    g.add(door);
    void r;
    return { group: g, winMat, wins, h, w, d, roofH };
  };

  L.lamp = function (THREE, opts) {
    const o = opts || {};
    const g = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, o.h == null ? 0.5 : o.h, 6), L.mat(THREE, 0x2a2622, { roughness: 1 }));
    post.position.y = (o.h == null ? 0.5 : o.h) / 2;
    post.castShadow = true;
    g.add(post);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.1), L.mat(THREE, L.PAL.lamp, { emissive: 0xffc978, emissiveIntensity: o.on ? 2.2 : 0, roughness: 0.4 }));
    head.position.y = (o.h == null ? 0.5 : o.h) + 0.02;
    g.add(head);
    const glow = L.glowSprite(THREE, 0xffc26a, o.on ? 0.5 : 0.0001, { soft: true });
    glow.position.copy(head.position);
    g.add(glow);
    return { group: g, head, glow };
  };

  // ---------- keycap ----------
  // A tapered cap: full box at the base, slightly smaller on top, with a bevel ring.
  L.keycap = function (THREE, opts) {
    const o = opts || {};
    const w = o.w == null ? 0.9 : o.w;
    const d = o.d == null ? 0.9 : o.d;
    const h = o.h == null ? 0.34 : o.h;
    const taper = o.taper == null ? 0.14 : o.taper;
    const g = new THREE.BoxGeometry(w, h, d, 1, 1, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      if (p.getY(i) > 0) {
        p.setX(i, p.getX(i) * (1 - taper));
        p.setZ(i, p.getZ(i) * (1 - taper));
      }
    }
    p.needsUpdate = true;
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, L.mat(THREE, o.color == null ? L.PAL.cap : o.color, { roughness: 0.62, metalness: 0.12 }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };
  // The glowing legend on top of a cap: a tiny emissive plate, invisible by default.
  L.keyGlow = function (THREE, w, d) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry((w || 0.9) * 0.5, (d || 0.9) * 0.28),
      new THREE.MeshBasicMaterial({ color: 0xffd9a8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    m.rotation.x = -Math.PI / 2;
    return m;
  };

  // ---------- sky helpers ----------
  L.skyDome = function (THREE, opts) {
    const o = opts || {};
    const geo = new THREE.SphereGeometry(o.r || 900, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(o.top == null ? 0x5d93c6 : o.top) },
        bottom: { value: new THREE.Color(o.bottom == null ? 0xd9ecf7 : o.bottom) },
        strength: { value: 1 },
        night: { value: 0 },
        nightColor: { value: new THREE.Color(0x0b1a33) },
      },
      vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform float night; uniform vec3 nightColor; varying vec3 vP;
        void main(){ float h = clamp(normalize(vP).y * 0.5 + 0.5, 0.0, 1.0); vec3 day = mix(bottom, top, pow(h, 0.9));
          vec3 n = mix(nightColor * 0.55, nightColor, pow(h, 0.8)); vec3 col = mix(day, n, night);
          gl_FragColor = vec4(col, 1.0); }`,
    });
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    return { mesh: m, mat };
  };

  L.clouds = function (THREE, opts) {
    const o = opts || {};
    const r = o.rand || L.rand(9);
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0xf7fbff, transparent: true, opacity: 0.92 });
    for (let i = 0; i < (o.count || 10); i++) {
      const c = new THREE.Group();
      const n = 3 + Math.floor(r() * 4);
      for (let j = 0; j < n; j++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(6 + r() * 10, 2 + r() * 2, 5 + r() * 5), mat);
        b.position.set((r() - 0.5) * 14, (r() - 0.5) * 2.4, (r() - 0.5) * 8);
        c.add(b);
      }
      c.position.set((r() - 0.5) * (o.spread || 300), (o.y || 55) + r() * 12, (r() - 0.5) * (o.spread || 300) - 60);
      c.rotation.y = r() * Math.PI;
      g.add(c);
    }
    return g;
  };

  L.stars = function (THREE, count, radius, rand) {
    const r = rand || L.rand(11);
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const th = r() * Math.PI * 2;
      const ph = Math.acos(r() * 0.9);
      const rad = radius * (0.8 + r() * 0.2);
      pos[i * 3] = Math.sin(ph) * Math.cos(th) * rad;
      pos[i * 3 + 1] = Math.abs(Math.cos(ph)) * rad * 0.9 + 20;
      pos[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * rad;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color: L.PAL.star, size: 1.5, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false });
    return new THREE.Points(g, m);
  };

  // ---------- camera choreography ----------
  // keys: [{ t, pos:[x,y,z], look:[x,y,z], fov?, roll? }] — eased between neighbours, pure in t.
  L.camPath = function (THREE, keys) {
    const v = (a) => new THREE.Vector3(a[0], a[1], a[2]);
    const find = (t) => {
      let i = 0;
      while (i < keys.length - 1 && t > keys[i + 1].t) i++;
      return i;
    };
    return function (camera, t) {
      const i = find(t);
      const a = keys[i], b = keys[Math.min(keys.length - 1, i + 1)];
      const span = b.t - a.t;
      const k = span <= 0 ? 0 : L.easeInOut(L.clamp((t - a.t) / span));
      camera.position.copy(v(a.pos)).lerp(v(b.pos), k);
      const la = v(a.look), lb = v(b.look);
      const target = la.clone().lerp(lb, k);
      camera.lookAt(target);
      const fov = L.lerp(a.fov == null ? 38 : a.fov, b.fov == null ? 38 : b.fov, k);
      if (Math.abs(camera.fov - fov) > 1e-3) { camera.fov = fov; camera.updateProjectionMatrix(); }
      camera.rotation.z += L.lerp(a.roll || 0, b.roll || 0, k);
    };
  };

  // ---------- lighting presets ----------
  L.lightRig = function (THREE, scene, opts) {
    const o = opts || {};
    const hemi = new THREE.HemisphereLight(o.sky == null ? 0xbcd8f0 : o.sky, o.ground == null ? 0x4a3a2c : o.ground, o.hemi == null ? 0.85 : o.hemi);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(o.keyColor == null ? 0xfff0d8 : o.keyColor, o.key == null ? 2.1 : o.key);
    key.position.set(o.kx == null ? 40 : o.kx, o.ky == null ? 70 : o.ky, o.kz == null ? 30 : o.kz);
    if (o.shadow !== false) {
      key.castShadow = true;
      key.shadow.mapSize.set(o.shadowMap || 2048, o.shadowMap || 2048);
      const c = o.shadowSize || 60;
      key.shadow.camera.left = -c; key.shadow.camera.right = c;
      key.shadow.camera.top = c; key.shadow.camera.bottom = -c;
      key.shadow.camera.near = 1; key.shadow.camera.far = 400;
      key.shadow.bias = -0.0012;
      key.shadow.normalBias = 0.05;
    }
    scene.add(key);
    const rim = new THREE.DirectionalLight(o.rimColor == null ? 0x9fc4ff : o.rimColor, o.rim == null ? 0.5 : o.rim);
    rim.position.set(-50, 40, -60);
    scene.add(rim);
    return { hemi, key, rim };
  };

  L.makeRenderer = function (THREE, canvas, opts) {
    const o = opts || {};
    const w = o.width || 1920, h = o.height || 1080;
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    r.setPixelRatio(1);
    r.setSize(w, h, false);
    r.shadowMap.enabled = o.shadow !== false;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = o.tone === false ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = o.exposure == null ? 1.05 : o.exposure;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.autoClear = true;
    return r;
  };
})();
