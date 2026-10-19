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
    mascot: 0xd97757,
    mascotDark: 0xb85a3d,
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

  // ---------------------------------------------------------------- mascot
  // A neutral little character: rounded body, two eyes, a nub on each side, four legs.
  // pose({ walk, bob, jump, look, squash }) — the same call works for any character you swap in.
  K.mascot = function (THREE, opts) {
    const o = opts || {};
    const s = o.scale == null ? 1 : o.scale;
    const g = new THREE.Group();
    const bodyMat = K.mat(THREE, o.color == null ? K.PAL.mascot : o.color, { roughness: 0.72 });

    const body = new THREE.Mesh(K.roundBox(THREE, 1.0, 0.74, 0.62, 0.1, 3), bodyMat);
    body.position.y = 0.56;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);

    const eyeMat = K.mat(THREE, K.PAL.eye, { roughness: 0.35 });
    const eyes = new THREE.Group();
    for (const sx of [-0.2, 0.2]) {
      const e = new THREE.Mesh(K.roundBox(THREE, 0.085, 0.14, 0.03, 0.03, 2), eyeMat);
      e.position.set(sx, 0.62, 0.315);
      eyes.add(e);
    }
    g.add(eyes);

    const nubMat = K.mat(THREE, o.color == null ? K.PAL.mascotDark : o.color, { roughness: 0.7 });
    for (const sx of [-0.52, 0.52]) {
      const nub = new THREE.Mesh(K.roundBox(THREE, 0.1, 0.1, 0.16, 0.04, 2), nubMat);
      nub.position.set(sx, 0.54, 0);
      g.add(nub);
    }

    const legs = [];
    for (let i = 0; i < 4; i++) {
      const leg = new THREE.Mesh(K.roundBox(THREE, 0.13, 0.24, 0.14, 0.05, 2), bodyMat);
      leg.castShadow = true;
      leg.position.set(i < 2 ? -0.24 : 0.24, 0.12, i % 2 === 0 ? -0.16 : 0.16);
      g.add(leg);
      legs.push(leg);
    }
    g.scale.setScalar(s);

    const st = { walk: 0, bob: 0, jump: 0, look: 0, squash: 1 };
    const pose = (p) => {
      Object.assign(st, p || {});
      const t = st.walk;
      g.position.y = st.bob + st.jump - (1 - st.squash) * 0.25;
      g.rotation.y = st.look;
      g.rotation.z = Math.sin(t * Math.PI * 2) * 0.03;
      g.scale.set(s * (2 - st.squash), s * st.squash, s * (2 - st.squash));
      legs.forEach((leg, i) => {
        const ph = t * Math.PI * 2 + (i % 2 ? Math.PI : 0) + (i < 2 ? 0 : Math.PI);
        leg.position.y = 0.12 + Math.max(0, Math.sin(ph)) * 0.05;
        leg.position.z = (i % 2 === 0 ? -0.16 : 0.16) + Math.cos(ph) * 0.03;
      });
    };
    pose({});
    return { group: g, pose, body, eyes };
  };

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

  K.sunOrMoon = function (THREE, opts) {
    const o = opts || {};
    const sp = K.glowSprite(THREE, o.color == null ? K.PAL.sun : o.color, o.size == null ? 4.6 : o.size, { soft: true });
    sp.position.set(o.x == null ? -14 : o.x, o.y == null ? 4.6 : o.y, o.z == null ? -19 : o.z);
    return sp;
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
    // Fill that rides with the camera. Backlit or night shots otherwise read as a black cut-out where
    // the character faces the lens; a fill from the camera side fixes it without flattening the key.
    // Off by default (fill: 0). Call rig.sync(camera) once per frame in draw(t).
    const fillOn = o.fill != null && o.fill > 0;
    const fill = new THREE.DirectionalLight(o.fillColor == null ? 0x9fb6d8 : o.fillColor, o.fill || 0);
    fill.position.set(0, 6, 14);
    scene.add(fill);
    const rig = { hemi, key, rim, fill };
    rig.sync = function (camera) {
      if (!fillOn || !camera) return rig;
      const d = o.fillDist == null ? 1 : o.fillDist;
      const p = camera.position;
      fill.position.set(p.x * d, p.y * d + (o.fillLift == null ? 2 : o.fillLift), p.z * d);
      return rig;
    };
    return rig;
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
