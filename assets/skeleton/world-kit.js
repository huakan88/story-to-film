// world-kit.js — the shared art layer every story film starts from.
// Classic script (no bundler): include it with <script src="world-kit.js"> and use window.WORLD_KIT.
// Every function takes THREE in, touches no clock, and never calls Math.random:
// the same seed gives the same world, and every frame is a pure function of time.
(function () {
  const K = (window.WORLD_KIT = window.WORLD_KIT || {});

  // ---------------------------------------------------------------- palette
  K.PAL = {
    ink: 0x0d0f12,
    soil: 0x33241b,
    soilDark: 0x241a13,
    grass: 0x4f7c33,
    grassLight: 0x6ea94a,
    leafDark: 0x245f33,
    leafMid: 0x2f7a3d,
    leafLight: 0x3c8f46,
    rock: 0x8b7a63,
    rockDark: 0x6f5f4a,
    sand: 0xd8c49a,
    water: 0x3f9fc4,
    skyTop: 0x6ea3cf,
    skyBottom: 0xf2e2c8,
    sun: 0xffd9a0,
    star: 0xdfe8ff,
    figureTunic: 0x6d7f93,

    figureTunicDark: 0x55647a,

    figureSkin: 0xe8c39a,

    figureStraw: 0xd9b86a,

    // kept as aliases so older films that read PAL.mascot still get a sane colour

    mascot: 0x6d7f93,

    mascotDark: 0x55647a,
    eye: 0x241512,
    accent: 0xc07c48,
  };

  // ---------------------------------------------------------------- math
  K.clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  K.seg = (t, a, b) => K.clamp((t - a) / (b - a));                 // 0→1 across [a,b]
  K.smooth = (x) => x * x * (3 - 2 * x);
  K.smoothSeg = (t, a, b) => K.smooth(K.seg(t, a, b));
  K.lerp = (a, b, k) => a + (b - a) * k;
  K.easeOut = (x) => 1 - Math.pow(1 - x, 3);
  K.easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  K.easeOutBack = (x, s = 1.4) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2);
  // Closed-form spring step response: 0→1 with one overshoot, settles inside the window.
  // bounce 0 = critically damped, 0.2 = visibly springy. Pure in x, so any frame can be seeked.
  K.spring = (x, bounce = 0.18) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const b = Math.min(0.9, Math.max(0, bounce));
    const z = b <= 0 ? 1 : -Math.log(b) / Math.sqrt(Math.PI * Math.PI + Math.log(b) ** 2);
    const w = 6.9 / z, wd = w * Math.sqrt(Math.max(1e-6, 1 - z * z));
    return 1 - Math.exp(-z * w * x) * (Math.cos(wd * x) + ((z * w) / wd) * Math.sin(wd * x));
  };

  // Seeded RNG (mulberry32): same seed → same sequence. Never use Math.random in a film.
  K.rand = (seed) => {
    let a = (seed | 0) || 1;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // ---------------------------------------------------------------- materials
  const cache = new Map();
  // Cached standard material. Use ownMat() when one object must change on its own.
  K.mat = function (THREE, color, opts) {
    const o = opts || {};
    const key = color + '|' + JSON.stringify(o);
    if (cache.has(key)) return cache.get(key);
    const m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: o.roughness == null ? 0.9 : o.roughness,
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
  K.ownMat = (THREE, color, opts) => K.mat(THREE, color, opts).clone();

  // Rounded box geometry: the shape of characters, caps and soft props.
  K.roundBox = function (THREE, w, h, d, r, seg) {
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

  // ---------------------------------------------------------------- glow
  K.glowTexture = function (THREE, color, soft) {
    K._glow = K._glow || new Map();
    const key = color + '|' + (soft ? 1 : 0);
    if (K._glow.has(key)) return K._glow.get(key);
    const size = 128;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    const col = new THREE.Color(color);
    const rgba = (a) => `rgba(${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)},${a})`;
    grad.addColorStop(0, rgba(1));
    grad.addColorStop(soft ? 0.28 : 0.12, rgba(soft ? 0.5 : 0.72));
    grad.addColorStop(1, rgba(0));
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    K._glow.set(key, tex);
    return tex;
  };
  K.glowSprite = function (THREE, color, size, opts) {
    const o = opts || {};
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: K.glowTexture(THREE, color, o.soft),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: o.opacity == null ? 1 : o.opacity,
    }));
    sp.scale.set(size, size, 1);
    return sp;
  };

  // ---------------------------------------------------------------- character
  // A small anthropomorphic figure — the default hero of this kit. Two arms, two legs,
  // a head, and an optional hat / beard / tool, because most stories are about a person
  // doing something to the world. The pose contract is the whole vocabulary of the film:
  //
  //   const hero = K.mascot(THREE, { scale: 1 });     // K.figure is the same function
  //   hero.pose({ walk: .3, bob: .01, look: .4, crouch: 0, reach: 0, sit: 0, eyes: 1 })
  //
  // Everything is derived from those values — no clocks, no random, no state between frames.
  K.mascot = function (THREE, opts) {
    const o = opts || {};
    const s = o.scale == null ? 1 : o.scale;
    const tunic = o.tunic == null ? (o.color == null ? K.PAL.figureTunic : o.color) : o.tunic;
    const tunicDk = o.tunicDark == null ? (o.tunicDark === undefined ? K.PAL.figureTunicDark : o.tunicDark) : o.tunicDark;
    const skin = o.skin == null ? K.PAL.figureSkin : o.skin;
    const straw = o.straw == null ? K.PAL.figureStraw : o.straw;

    const g = new THREE.Group();
    const tunicMat = K.mat(THREE, tunic, { roughness: 0.95 });
    const tunicDkMat = K.mat(THREE, tunicDk, { roughness: 0.95 });
    const skinMat = K.mat(THREE, skin, { roughness: 0.9 });

    // ---- legs (they swing while walking, fold under the body when sitting) ----
    const legs = [];
    for (const sx of [-0.15, 0.15]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.44, 0.19), tunicDkMat);
      leg.position.set(sx, 0.22, 0);
      leg.castShadow = true;
      g.add(leg);
      legs.push(leg);
    }

    // ---- torso -----------------------------------------------------------------
    const torso = new THREE.Mesh(K.roundBox(THREE, 0.62, 0.62, 0.42, 0.08, 2), tunicMat);
    torso.position.y = 0.74;
    torso.castShadow = true;
    torso.receiveShadow = true;
    g.add(torso);
    const sash = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.09, 0.44), tunicDkMat);
    sash.position.y = 0.62;
    g.add(sash);

    // ---- head, eyes, optional beard and hat -----------------------------------
    const head = new THREE.Group();
    head.position.y = 1.24;
    g.add(head);
    const skull = new THREE.Mesh(K.roundBox(THREE, 0.42, 0.38, 0.38, 0.07, 2), skinMat);
    skull.castShadow = true;
    head.add(skull);

    const eyeMat = K.mat(THREE, K.PAL.eye, { roughness: 0.4 });
    const eyes = new THREE.Group();
    for (const sx of [-0.09, 0.09]) {
      const e = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.07, 0.02), eyeMat);
      e.position.set(sx, 0.02, 0.2);
      eyes.add(e);
    }
    head.add(eyes);

    if (o.beard) {
      const beard = new THREE.Mesh(K.roundBox(THREE, 0.24, 0.26, 0.1, 0.04, 2),
        K.mat(THREE, o.beardColor == null ? 0xf2efe6 : o.beardColor, { roughness: 1 }));
      beard.position.set(0, -0.24, 0.16);
      head.add(beard);
    }
    if (o.hat) {
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.05, 10), K.mat(THREE, straw, { roughness: 1 }));
      brim.position.y = 0.26;
      brim.castShadow = true;
      head.add(brim);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.2, 10), K.mat(THREE, straw, { roughness: 1 }));
      cap.position.y = 0.36;
      head.add(cap);
    }

    // ---- arms; the right one pivots at the shoulder and can hold a tool --------
    const armGeo = new THREE.BoxGeometry(0.13, 0.44, 0.15);
    const armL = new THREE.Mesh(armGeo, tunicMat);
    armL.position.set(-0.38, 0.82, 0);
    armL.castShadow = true;
    g.add(armL);

    const armR = new THREE.Group();
    armR.position.set(0.38, 1.0, 0);
    g.add(armR);
    const armRMesh = new THREE.Mesh(armGeo, tunicMat);
    armRMesh.position.y = -0.2;
    armRMesh.castShadow = true;
    armR.add(armRMesh);

    const toolName = o.tool || null;
    if (toolName) {
      const wood = K.mat(THREE, o.wood == null ? 0x8a6034 : o.wood, { roughness: 1 });
      const tool = new THREE.Group();
      if (toolName === 'hoe') {
        const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.05, 0.06), wood);
        shaft.position.y = -0.55;
        tool.add(shaft);
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.3, 0.05),
          K.mat(THREE, 0x6b6b6b, { roughness: 0.6, metalness: 0.3 }));
        blade.position.set(0.1, -1.05, 0);
        blade.rotation.z = -0.4;
        tool.add(blade);
      } else {
        const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.055, 1.25, 0.055), wood);
        shaft.position.y = -0.5;
        tool.add(shaft);
      }
      tool.position.y = -0.18;
      armR.add(tool);
    }

    const st = { walk: 0, bob: 0, jump: 0, look: 0, crouch: 0, reach: 0, sit: 0, eyes: 1, squash: 1 };

    const pose = (p) => {
      Object.assign(st, p || {});
      const crouch = K.clamp(st.crouch), sit = K.clamp(st.sit), reach = K.clamp(st.reach);
      const drop = crouch * 0.14 + sit * 0.3;
      const tip = crouch * 0.34 + reach * 0.55;

      g.position.y = st.bob + st.jump;
      g.rotation.y = st.look;
      g.rotation.x = tip;
      g.scale.set(s * (2 - st.squash), s * st.squash, s * (2 - st.squash));

      legs.forEach((leg, i) => {
        const ph = st.walk * Math.PI * 2 + (i ? Math.PI : 0);
        leg.position.z = Math.sin(ph) * 0.16 * (1 - sit);
        leg.position.y = 0.22 - drop * 0.5 - sit * 0.06;
        leg.rotation.x = Math.sin(ph) * 0.5 * (1 - sit) + sit * 1.1;
        leg.scale.y = 1 - sit * 0.35;
      });

      torso.position.y = 0.74 - drop;
      torso.scale.set(1 + sit * 0.05, 1 - crouch * 0.06, 1 + sit * 0.06);
      sash.position.y = 0.62 - drop;
      head.position.y = 1.24 - drop;
      head.rotation.x = tip * 0.35;

      armL.position.y = 0.82 - drop;
      armL.rotation.x = -Math.sin(st.walk * Math.PI * 2) * 0.5;
      armR.position.y = 1.0 - drop;
      armR.rotation.x = 0.25 + reach * 1.35 - crouch * 0.2;

      eyes.scale.y = Math.max(0.06, K.clamp(st.eyes));
    };
    pose({});

    return { group: g, pose, body: torso, eyes, head, arms: [armL, armR] };
  };
  K.figure = K.mascot;   // the same factory under a name that says what it is

  // ---------------------------------------------------------------- voxels
  // Accumulates quads with a colour each and merges them into ONE geometry:
  // a whole forest, town or terrain slab can be a single draw call.
  K.Vox = function (THREE) {
    const pos = [], nor = [], col = [], idx = [];
    const c = new THREE.Color();
    const quad = (a, b, d, e, n, color, jit) => {
      c.set(color);
      if (jit) c.multiplyScalar(1 + (jit.r() - 0.5) * jit.amount);
      const base = pos.length / 3;
      pos.push(...a, ...b, ...d, ...e);
      for (let i = 0; i < 4; i++) { nor.push(n[0], n[1], n[2]); col.push(c.r, c.g, c.b); }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    const api = {
      // axis-aligned box; y is the BOTTOM, which makes stacking readable
      box(x, y, z, w, h, d, color, opts) {
        const o = opts || {};
        const jit = o.jitter ? { r: o.rand || K.rand(1), amount: o.jitter } : null;
        const x0 = x - w / 2, x1 = x + w / 2, y0 = y, y1 = y + h, z0 = z - d / 2, z1 = z + d / 2;
        quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], color, jit);
        if (!o.noBottom) quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], color, jit);
        quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], color, jit);
        quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], color, jit);
        quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], color, jit);
        quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], color, jit);
      },
      // a gable roof (ridge along z)
      gable(x, y, z, w, h, d, color, opts) {
        const o = opts || {};
        const jit = o.jitter ? { r: o.rand || K.rand(2), amount: o.jitter } : null;
        const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
        const tri = (a, b, e, col2) => {
          const base = pos.length / 3;
          pos.push(...a, ...b, ...e);
          const ab = new THREE.Vector3(...b).sub(new THREE.Vector3(...a));
          const ae = new THREE.Vector3(...e).sub(new THREE.Vector3(...a));
          const n = ab.cross(ae).normalize();
          c.set(col2);
          if (jit) c.multiplyScalar(1 + (jit.r() - 0.5) * jit.amount);
          for (let i = 0; i < 3; i++) { nor.push(n.x, n.y, n.z); col.push(c.r, c.g, c.b); }
          idx.push(base, base + 1, base + 2);
        };
        tri([x0, y, z1], [x1, y, z1], [x1, y + h, z1], color);
        tri([x0, y, z1], [x1, y + h, z1], [x0, y + h, z1], color);
        tri([x1, y, z0], [x0, y, z0], [x0, y + h, z0], color);
        tri([x1, y, z0], [x0, y + h, z0], [x1, y + h, z0], color);
        tri([x0, y, z0], [x0, y, z1], [x0, y + h, z1], color);
        tri([x1, y, z0], [x1, y + h, z1], [x1, y, z1], color);
        void x0; void x1; void z0; void z1;
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
  K.voxMaterial = (THREE, opts) => new THREE.MeshLambertMaterial(Object.assign({ vertexColors: true }, opts || {}));

  // ---------------------------------------------------------------- props
  K.pine = function (THREE, opts) {
    const o = opts || {};
    const r = o.rand || K.rand(3);
    const h = o.h == null ? 1 : o.h;
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.045 * h, 0.06 * h, 0.28 * h, 6),
      K.mat(THREE, 0x5b4433, { flat: true, roughness: 1 }));
    trunk.position.y = 0.14 * h;
    trunk.castShadow = true;
    g.add(trunk);
    const shades = [K.PAL.leafMid, K.PAL.leafLight, K.PAL.leafDark];
    for (let i = 0; i < 3; i++) {
      const t = i / 2;
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry((0.34 - t * 0.1) * h, (0.42 - t * 0.06) * h, 7),
        K.mat(THREE, shades[(i + Math.floor(r() * 3)) % 3], { flat: true, roughness: 1 })
      );
      cone.position.y = (0.34 + i * 0.26) * h;
      cone.rotation.y = r() * Math.PI;
      cone.castShadow = true;
      g.add(cone);
    }
    return g;
  };
  K.bush = function (THREE, opts) {
    const o = opts || {};
    const r = o.rand || K.rand(4);
    const g = new THREE.Group();
    const n = 2 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const b = new THREE.Mesh(
        new THREE.IcosahedronGeometry((0.12 + r() * 0.1) * (o.h || 1), 0),
        K.mat(THREE, [K.PAL.leafMid, K.PAL.leafLight, K.PAL.leafDark][Math.floor(r() * 3)], { flat: true, roughness: 1 })
      );
      b.position.set((r() - 0.5) * 0.3, (0.08 + r() * 0.12) * (o.h || 1), (r() - 0.5) * 0.3);
      b.castShadow = true;
      g.add(b);
    }
    return g;
  };
  // A stack of blocks — the simplest "something grows here" object. Scale the group in y.
  // Kept for compatibility; `K.stack` (below) is the same idea with per-block timing and collapse.
  K.boxStack = function (THREE, opts) {
    const o = opts || {};
    const r = o.rand || K.rand(5);
    const n = o.n == null ? 5 : o.n;
    const w = o.w == null ? 0.5 : o.w;
    const h = o.h == null ? 0.28 : o.h;
    const colors = o.colors || [K.PAL.rock, K.PAL.rockDark, K.PAL.grassLight];
    const g = new THREE.Group();
    for (let i = 0; i < n; i++) {
      const k = i / Math.max(1, n - 1);
      const m = new THREE.Mesh(L_BOX(THREE, w * (1 - k * 0.42), h, w * (1 - k * 0.42)),
        K.mat(THREE, colors[Math.floor(r() * colors.length)], { flat: true, roughness: 0.95 }));
      m.position.set((r() - 0.5) * 0.03, h * (i + 0.5), (r() - 0.5) * 0.03);
      m.rotation.y = r() * 0.25;
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    }
    return g;
  };
  const L_BOX = (THREE, w, h, d) => new THREE.BoxGeometry(w, h, d);

  // A per-block stack: each block has its own birth (it drops in and bounces once), and the whole
  // stack can collapse at `collapseAt` (each block gets its own launch velocity, spin and fall).
  // This is the factory behind the grammar's "堆叠 / 砌" and "裂开 / 断裂" rows.
  //   const tower = K.stack(T, { count: 12, size: 0.42, layers: 1, birth: [2.0, 3.6], collapseAt: 15 });
  //   scene.add(tower.group);        // once
  //   tower.setTime(t);              // every frame — pure in t, nothing accumulates
  // opts: count | size | layers(blocks side by side) | birth(number|[start,end]|array) | fall(false|{height,gap,dur})
  //       collapseAt | collapseDur | spread | colors | rand | restY(ground level, default 0)
  K.stack = function (THREE, opts) {
    const o = opts || {};
    const r = o.rand || K.rand(17);
    const n = Math.max(1, o.count == null ? 8 : o.count | 0);
    const size = o.size == null ? 0.42 : o.size;
    const perLayer = Math.max(1, o.layers == null ? 1 : o.layers | 0);
    const h = size * 0.62;
    const colors = o.colors || [K.PAL.rock, K.PAL.rockDark, K.PAL.grassLight];
    const fall = o.fall === false ? null : Object.assign({ height: 1.6, gap: 0.34, dur: 0.5 }, o.fall || {});
    const restY = o.restY == null ? 0 : o.restY;
    const collapseAt = o.collapseAt == null ? null : o.collapseAt;
    const collapseDur = o.collapseDur == null ? 1.4 : o.collapseDur;
    const spread = o.spread == null ? 1.7 : o.spread;
    const births = (() => {
      if (Array.isArray(o.birth)) return (i) => (o.birth[i] == null ? o.birth[o.birth.length - 1] : o.birth[i]);
      if (typeof o.birth === 'number') return (i) => o.birth + i * (fall ? fall.gap : 0);
      const [a, b] = o.birth || [0, n * (fall ? fall.gap : 0)];
      return (i) => K.lerp(a, b, n === 1 ? 0 : i / (n - 1));
    })();

    const group = new THREE.Group();
    const blocks = [];
    for (let i = 0; i < n; i++) {
      const layer = Math.floor(i / perLayer);
      const slot = i % perLayer;
      const baseX = (slot - (perLayer - 1) / 2) * size * 0.92 + (r() - 0.5) * 0.03;
      const baseZ = (r() - 0.5) * 0.05;
      const baseY = restY + h * (layer + 0.5);
      const mesh = new THREE.Mesh(
        L_BOX(THREE, size * (1 - layer * 0.04), h, size * (1 - layer * 0.04)),
        K.mat(THREE, colors[Math.floor(r() * colors.length)], { flat: true, roughness: 0.95 })
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      blocks.push({
        mesh, baseX, baseY, baseZ,
        birth: births(i),
        yaw: (r() - 0.5) * 0.3,
        vx: (r() - 0.5) * spread,
        vz: (r() - 0.5) * spread,
        vy: 0.9 + r() * 1.5,
        spin: (r() - 0.5) * 7,
        land: restY + h * 0.5,
      });
    }

    function setTime(t) {
      for (const b of blocks) {
        const { mesh } = b;
        if (t < b.birth) { mesh.visible = false; continue; }
        mesh.visible = true;
        const age = t - b.birth;
        // 1. drop in: falls from `height` above its slot and settles with one small bounce
        const k = fall ? K.clamp(age / fall.dur) : 1;
        const dropY = fall ? fall.height * (1 - K.spring(k, 0.22)) : 0;
        let x = b.baseX, y = b.baseY + Math.max(0, dropY), z = b.baseZ;
        let rx = 0, rz = 0, ry = b.yaw;
        let sy = 1;
        if (fall && k < 1) sy = 1 + (1 - k) * 0.06;    // slight stretch while falling
        // 2. collapse: launch, spin, fall under gravity, land and stay (all from c = t - collapseAt)
        if (collapseAt != null && t > collapseAt) {
          const c = Math.max(0, t - collapseAt);
          const c1 = Math.min(c, collapseDur);
          x = b.baseX + b.vx * c1;
          z = b.baseZ + b.vz * c1;
          const yFree = b.baseY + b.vy * c1 - 2.4 * c1 * c1;
          const hit = Math.max(0, (b.baseY - b.land) / Math.max(0.001, b.vy)) + 0.18; // when it lands
          const settled = c1 >= hit;
          y = settled ? b.land : Math.max(b.land, yFree);
          if (settled) sy = 1 - 0.18 * Math.max(0, 1 - (c1 - hit) * 6);   // squash on landing
          rx = b.spin * c1 * (settled ? 0.35 : 1);
          rz = (b.vx > 0 ? -1 : 1) * Math.min(0.9, c1 * 0.7) * (settled ? 1 : 0.6);
          ry = b.yaw + b.spin * 0.4 * c1;
        }
        mesh.position.set(x, y, z);
        mesh.rotation.set(rx, ry, rz);
        mesh.scale.set(1, sy, 1);
      }
    }
    setTime(0);
    return { group, setTime, blocks };
  };

  // ---------------------------------------------------------------- terrain & sky
  // A diorama island: soil cylinder + grass cap. size = top radius.
  K.ground = function (THREE, opts) {
    const o = opts || {};
    const size = o.size == null ? 5 : o.size;
    const g = new THREE.Group();
    const soil = new THREE.Mesh(
      new THREE.CylinderGeometry(size, size * 0.9, o.depth == null ? 1.5 : o.depth, 56),
      K.mat(THREE, o.soil == null ? K.PAL.soil : o.soil, { roughness: 1 })
    );
    soil.position.y = -0.6;
    soil.receiveShadow = true;
    g.add(soil);
    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(size * 0.985, size * 1.04, 0.2, 56),
      K.mat(THREE, o.top == null ? K.PAL.grass : o.top, { roughness: 1 })
    );
    top.position.y = 0.1;
    top.receiveShadow = true;
    g.add(top);
    g.userData.top = top;
    return g;
  };

  // Sky dome with a day↔night knob: uniforms.night 0..1.
  K.skyDome = function (THREE, opts) {
    const o = opts || {};
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(o.top == null ? K.PAL.skyTop : o.top) },
        bottom: { value: new THREE.Color(o.bottom == null ? K.PAL.skyBottom : o.bottom) },
        night: { value: 0 },
        nightColor: { value: new THREE.Color(o.night == null ? 0x0b1a33 : o.night) },
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: [
        'uniform vec3 top; uniform vec3 bottom; uniform vec3 nightColor; uniform float night; varying vec3 vP;',
        'void main(){',
        '  float h = clamp(normalize(vP).y * 0.5 + 0.5, 0.0, 1.0);',
        '  vec3 day = mix(bottom, top, pow(h, 0.9));',
        '  vec3 n = mix(nightColor * 0.55, nightColor, pow(h, 0.8));',
        '  gl_FragColor = vec4(mix(day, n, night), 1.0);',
        '}',
      ].join('\n'),
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(o.r == null ? 120 : o.r, 32, 16), mat);
    mesh.frustumCulled = false;
    return { mesh, mat };
  };

  // The sun / moon: a soft halo PLUS a solid disc, wrapped in one Group so `scene.add(sun)` keeps
  // working the way a bare glow sprite did. Move it with `sun.position` / `sun.setPosition(v)` — the
  // whole thing travels together, which is what "the moon slides down to the treetop" needs.
  //   const sun = K.sunOrMoon(T, { color, size, x, y, z, disc: true, discSize });
  //   sun.setPosition(new T.Vector3(0.2, 5.2, -3));   sun.setIntensity(0.35);  // 0..1
  K.sunOrMoon = function (THREE, opts) {
    const o = opts || {};
    const size = o.size == null ? 4.6 : o.size;
    const color = o.color == null ? K.PAL.sun : o.color;
    const group = new THREE.Group();
    const glow = K.glowSprite(THREE, color, size, { soft: true });
    group.add(glow);
    let disc = null;
    if (o.disc !== false) {
      disc = new THREE.Mesh(
        new THREE.CircleGeometry(o.discSize == null ? size * 0.17 : o.discSize, 40),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false })
      );
      disc.position.z = 0.01;                       // in front of the halo, same plane
      group.add(disc);
    }
    group.position.set(o.x == null ? -14 : o.x, o.y == null ? 4.6 : o.y, o.z == null ? -19 : o.z);
    group.disc = disc;
    group.glow = glow;
    group.setPosition = (v) => { group.position.copy(v); return group; };
    group.setIntensity = (k) => {
      const q = K.clamp(k);
      glow.material.opacity = q;
      if (disc) disc.material.opacity = q * 0.95;
      return group;
    };
    return group;
  };

  K.stars = function (THREE, count, radius, rand) {
    const r = rand || K.rand(11);
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const th = r() * Math.PI * 2;
      const ph = Math.acos(r() * 0.9);
      const rad = (radius || 90) * (0.8 + r() * 0.2);
      pos[i * 3] = Math.sin(ph) * Math.cos(th) * rad;
      pos[i * 3 + 1] = Math.abs(Math.cos(ph)) * rad * 0.9 + 20;
      pos[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * rad;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color: K.PAL.star, size: 1.5, transparent: true, opacity: 0, depthWrite: false });
    return new THREE.Points(g, m);
  };

  K.clouds = function (THREE, opts) {
    const o = opts || {};
    const r = o.rand || K.rand(9);
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0xf7fbff, transparent: true, opacity: 0.9 });
    for (let i = 0; i < (o.count || 8); i++) {
      const c = new THREE.Group();
      const n = 3 + Math.floor(r() * 3);
      for (let j = 0; j < n; j++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(4 + r() * 7, 1.6 + r() * 1.6, 3 + r() * 4), mat);
        b.position.set((r() - 0.5) * 10, (r() - 0.5) * 1.8, (r() - 0.5) * 6);
        c.add(b);
      }
      c.position.set((r() - 0.5) * (o.spread || 160), (o.y || 34) + r() * 10, (r() - 0.5) * (o.spread || 160) - 40);
      c.rotation.y = r() * Math.PI;
      g.add(c);
    }
    return g;
  };

  // ---------------------------------------------------------------- camera / light / renderer
  // keys: [{ t, pos:[x,y,z], look:[x,y,z], fov?, roll? }] — eased between neighbours, pure in t.
  K.camPath = function (THREE, keys) {
    const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
    return function (camera, t) {
      let i = 0;
      while (i < keys.length - 1 && t > keys[i + 1].t) i++;
      const a = keys[i], b = keys[Math.min(keys.length - 1, i + 1)];
      const span = b.t - a.t;
      const k = span <= 0 ? 0 : K.easeInOut(K.clamp((t - a.t) / span));
      camera.position.copy(V(a.pos)).lerp(V(b.pos), k);
      camera.lookAt(V(a.look).lerp(V(b.look), k));
      const fov = K.lerp(a.fov == null ? 36 : a.fov, b.fov == null ? 36 : b.fov, k);
      if (Math.abs(camera.fov - fov) > 1e-3) { camera.fov = fov; camera.updateProjectionMatrix(); }
      camera.rotation.z += K.lerp(a.roll || 0, b.roll || 0, k);
    };
  };

  K.lightRig = function (THREE, scene, opts) {
    const o = opts || {};
    const hemi = new THREE.HemisphereLight(o.sky == null ? 0xbcd8f0 : o.sky, o.ground == null ? 0x4a3a2c : o.ground,
      o.hemi == null ? 0.85 : o.hemi);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(o.keyColor == null ? 0xfff0d8 : o.keyColor, o.key == null ? 2.2 : o.key);
    key.position.set(o.kx == null ? 12 : o.kx, o.ky == null ? 18 : o.ky, o.kz == null ? 9 : o.kz);
    if (o.shadow !== false) {
      const mapSize = o.shadowMap || 2048;
      key.castShadow = true;
      key.shadow.mapSize.set(mapSize, mapSize);
      const c = o.shadowSize || 9;
      key.shadow.camera.left = -c; key.shadow.camera.right = c;
      key.shadow.camera.top = c; key.shadow.camera.bottom = -c;
      key.shadow.camera.near = 1; key.shadow.camera.far = 120;
      key.shadow.bias = -0.002;
      key.shadow.normalBias = 0.5;
    }
    scene.add(key);
    const rim = new THREE.DirectionalLight(o.rimColor == null ? 0x9fc4ff : o.rimColor, o.rim == null ? 0.5 : o.rim);
    rim.position.set(-14, 10, -18);
    scene.add(rim);
    // FILL — the light that saves a backlit or night scene. With key/rim only, a character facing the
    // lens is a black cut-out (this was the first real gap the 31 s story film hit). The fill sits on
    // the camera side by default, slightly above eye level, cool and weak enough not to flatten the key.
    //   fill: number | 'auto' (= 1.1)      default 0 → identical to the old rig
    //   fillColor                           default 0x9fb6d8
    //   fillFrom: [x, y, z] | 'camera'      default [7, 5.5, 10] (front-right, above)
    //   rig.setFill(k)                      animate it with t (ramp up when the scene goes to night)
    //   rig.sync(camera)                    once per frame; only needed when fillFrom === 'camera'
    const fillWanted = o.fill === 'auto' ? 1.1 : Math.max(0, Number(o.fill) || 0);
    const fill = new THREE.DirectionalLight(o.fillColor == null ? 0x9fb6d8 : o.fillColor, fillWanted);
    const followCamera = o.fillFrom === 'camera';
    const fillFrom = followCamera ? null : (o.fillFrom || [7, 5.5, 10]);
    if (fillFrom) fill.position.set(fillFrom[0], fillFrom[1], fillFrom[2]);
    else fill.position.set(0, 6, 14);                 // a sane pose before the first sync()
    scene.add(fill);
    const rig = { hemi, key, rim, fill };
    rig.setFill = function (k) {
      fill.intensity = Math.max(0, k == null ? fillWanted : Number(k) || 0);
      return rig;
    };
    rig.sync = function (camera) {
      if (!followCamera || !camera) return rig;
      const d = o.fillDist == null ? 1 : o.fillDist;
      const p = camera.position;
      fill.position.set(p.x * d, p.y * d + (o.fillLift == null ? 2 : o.fillLift), p.z * d);
      return rig;
    };
    return rig;
  };

  // GRADE — desaturation / lift / tint for "lost, weathered, remembered" beats (the grammar's
  // 风化 / 失去 row). Every graded material keeps a snapshot of its original colour, and
  // setDesaturate(k) recomputes from that snapshot, so it is a pure function of k: no accumulation,
  // no drift after seeking backwards.
  //   const grade = K.grade(scene, K, { tint: 0x9aa7b5, lift: 0.02 });
  //   grade.setDesaturate(0.6);   // 0 = as authored, 1 = fully grey
  //   grade.set({ desaturate: 0.6, lift: 0 });   // same thing, all knobs at once
  // Materials added to the scene AFTER the first call are not graded (call grade.refresh() if you add more).
  K.grade = function (scene, L, opts) {
    const kit = L || K;
    const o = opts || {};
    const base = new Map();                            // material.uuid -> { mat, color: Color }
    const collect = () => {
      scene.traverse((obj) => {
        const mats = obj.material ? (Array.isArray(obj.material) ? obj.material : [obj.material]) : [];
        for (const m of mats) {
          if (!m || !m.color || base.has(m.uuid)) continue;
          base.set(m.uuid, { mat: m, color: m.color.clone() });
        }
      });
      return base.size;
    };
    collect();
    // no THREE here (this factory gets the scene, not the namespace): derive a scratch colour from a
    // material we already hold, so grading works without importing anything.
    const scratch = base.size ? [...base.values()][0].color.clone() : null;
    const tint = o.tint == null || !scratch ? null : scratch.clone().setHex(o.tint);
    const grey = scratch ? scratch.clone() : null;
    const state = { desaturate: kit.clamp(o.desaturate == null ? 0 : o.desaturate), lift: o.lift == null ? 0 : o.lift };
    const apply = () => {
      const k = kit.clamp(state.desaturate);
      for (const { mat, color } of base.values()) {
        const c = color.clone();
        if (k > 0 && grey) {
          const g = c.r * 0.299 + c.g * 0.587 + c.b * 0.114;
          grey.setRGB(g, g, g);
          c.lerp(grey, k);
        }
        if (tint) c.lerp(tint, 0.35 * k);
        if (state.lift) c.addScalar(state.lift * (1 - k * 0.5));
        mat.color.copy(c);
      }
      return gradeApi;
    };
    const gradeApi = {
      setDesaturate(k) { state.desaturate = kit.clamp(k); return apply(); },
      set(next) {
        if (!next) return apply();
        if (next.desaturate != null) state.desaturate = kit.clamp(next.desaturate);
        if (next.lift != null) state.lift = next.lift;
        return apply();
      },
      refresh() { collect(); return apply(); },
      get materials() { return [...base.values()].map((b) => b.mat); },
    };
    return apply();
  };

  K.makeRenderer = function (THREE, canvas, opts) {
    const o = opts || {};
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(1);
    r.setSize(o.width || 1920, o.height || 1080, false);
    r.shadowMap.enabled = o.shadow !== false;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = o.tone === false ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = o.exposure == null ? 1.05 : o.exposure;
    r.outputColorSpace = THREE.SRGBColorSpace;
    return r;
  };
})();
