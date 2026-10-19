# 03 · 世界套件（world-kit.js）

`assets/skeleton/world-kit.js` 是一个 21KB 的纯函数美术层：调色板、角色工厂、体素构建器、道具、
相机轨迹、灯光、调色。classic script，暴露 `window.WORLD_KIT`（下文简写 `K`），
**不自己建 renderer、不读时钟**。

```js
const K = window.WORLD_KIT;
```

## 设计原则

1. **块面/体素优先。** 写实毛发、布料、人脸在这条管线上会翻车；块面 + 平直着色反而稳定、可读、快。
2. **一个材质一次分配。** `K.mat()` 带缓存，同色同参数复用；实例化物体共用一份材质。
3. **颜色从调色板取。** 全片最多 1 个强调色 + 3 个中性色，别每个物体自己调色。
4. **尺度统一。** 角色高 1–2 单位，道具 0.2–3，地形 50–200；先定尺度再建东西。
5. **原点在脚下。** 角色/道具的 `group` 原点 = 地面接触点，方便放到任意高度。

## API（按用途）

### 数学 / 时间

| 函数 | 用途 |
|---|---|
| `K.clamp(v, a, b)` / `K.seg(t, a, b)` / `K.smoothSeg(t, a, b)` | 夹取 / 线性 0→1 / 平滑 0→1 |
| `K.easeOut / easeInOut / easeOutBack(x)` | 缓动 |
| `K.spring(x, bounce = 0.18)` | **闭式弹簧**：0→1 带一次过冲，纯函数 |
| `K.lerp(a, b, k)` | 插值 |
| `K.rand(seed)` | 播种随机（同 seed 同序列）——**不要用 Math.random** |

### 材质 / 几何 / 光晕

```js
K.mat(THREE, 0x7cb04a, { roughness: .9, flat: true })  // 缓存材质
K.ownMat(THREE, color, opts)                            // 要单独改（如点亮）时用
K.roundBox(THREE, w, h, d, r, seg)                      // 圆角盒（角色、软道具）
K.Vox(THREE)                                            // 体素构建器（合并成一个 draw call）
K.voxMaterial(THREE)                                    // 顶点色 Lambert 材质
K.glowTexture(THREE, color, soft) / K.glowSprite(THREE, color, size, { soft, opacity })
```

体素构建器：

```js
const v = K.Vox(THREE);
v.box(x, y, z, w, h, d, color, { jitter: .06, rand });   // 轴对齐块
v.gable(x, y, z, w, h, d, color);                        // 人字屋顶
const mesh = new THREE.Mesh(v.build(), K.voxMaterial(THREE));
```

### 角色

```js
const hero = K.mascot(THREE, { scale: 1 });   // → { group, pose, body, eyes }
hero.pose({ walk: .4, bob: .02, jump: 0, look: .3, squash: 1 });
```

`pose` 就是全部表演语言（全部由 t 算，可叠加）：

| 参数 | 含义 | 典型用法 |
|---|---|---|
| `walk` | 0..1 步态相位 | 走路时给 `t * 步频` |
| `bob` | 身体上下（米） | 呼吸 `sin(t*1.5)*.01`，跑动 `abs(sin(t*6))*.03` |
| `jump` | 离地高度 | 抛物线 `h*(1-(2k-1)²)` |
| `look` | 转身（弧度） | 发现/注视：`easeOutBack(seg(t,a,b)) * π` |
| `squash` | 挤压 0.8–1.05 | 落地压扁、起跳前压缩 |
| `crouch` | 0..1 蹲下（压低 + 前倾） | "把种子按进土里"、"躲一下" |
| `sit` | 0..1 坐下（后腿收起、前腿直） | 落点、等待、疲惫 |
| `reach` | 0..1 向前下伸（侧瘤当手） | 伸手够/按下/递东西 |
| `eyes` | 0..1 睁眼程度 | 惊讶、眨眼、失神（0.1 = 几乎闭） |

**换主角只改工厂**：`K.mascot = (...) => MyCharacter.build(...)`，场景代码一行不动。
新角色必须返回同样的 `{ group, pose }`，`pose` 语义保持一致。

### 道具 / 场景

```js
K.pine(THREE, { h: 1, rand })              // 松树（三层锥 + 树干）
K.bush(THREE, { h: 1, rand })
K.boxStack(THREE, { count, size, rand })   // 静态方块堆（装饰）
K.stack(THREE, { count, size, layers, birth, collapseAt })   // 逐块生长 + 可崩塌，见下
K.ground(THREE, { size })                  // 岛式地形（土体 + 草帽）
K.skyDome(THREE, { r, top, bottom })       // → { mesh, mat }；mat.uniforms.night 0..1 做昼夜
K.sunOrMoon(THREE, { x, y, z, size, color, disc })  // → Group(disc + glow)，见下
K.stars(THREE, count, radius, rand)        // Points，改 material.opacity 控制出现
K.clouds(THREE, { count, y, spread, rand })
```

### 相机 / 灯光 / 调色 / 渲染器

```js
const camPath = K.camPath(THREE, [
  { t: 0, pos: [3, 1.3, 4], look: [0, .3, 0], fov: 32 },
  { t: 6, pos: [5, 2.5, 7], look: [0, .6, 0], fov: 40 },
]);
camPath(camera, t);                  // 纯 t，段间 easeInOut；fov 变化已处理 updateProjectionMatrix

const rig = K.lightRig(THREE, scene, {
  key: 2.6, hemi: .75, shadowSize: 9, shadowMap: 2048,
  fill: 'auto',                     // 0（默认关闭）/ 数字 / 'auto' → 角色正面补光
  fillColor: 0x9fb6d8, fillFrom: [7, 5.5, 10],   // 也可 'camera'：补光跟着镜头
});
rig.sync(camera);                   // 每帧调一次（fillFrom: 'camera' 时必须）
// rig → { hemi, key, rim, fill, setFill(k), sync(camera) }

const grade = K.grade(scene, K, { tint: 0x8fa4b8, lift: 0.02 });
grade.setDesaturate(0.6);           // 从快照重算，不是乘上去 → 倒 seek 不漂

const renderer = K.makeRenderer(THREE, canvas, { width: 1920, height: 1080 });
```

## 三件"骨架没替你想好"的事

### 1）逐块生长 / 崩塌的塔 —— `K.stack`

```js
const tower = K.stack(THREE, {
  count: 12, size: 0.42, layers: 1,
  birth: [3.6, 6.5],      // 第一块与最后一块的出生时间（线性排开）
  collapseAt: 15.0,       // 到这个时刻开始散落（不传 = 永远不塌）
});
scene.add(tower.group);
// 每帧：tower.setTime(t)
```

每块落下带一次回弹；崩塌后各自按初速/自转散落并落地压扁。全是 `f(t)`，没有累积。
自己拼盒子也行（`examples/moon-tree` 最初就是手拼的），但用 `stack` 省 40 行。

### 2）月亮滑到树梢 —— `K.sunOrMoon` 的 Group

```js
const moon = K.sunOrMoon(THREE, { x: 1.75, y: 6.4, z: -4.6, size: 4.2, color: 0xfff3cf });
scene.add(moon);
const target = new THREE.Vector3(0.15, 5.05, -1.3);
// 每帧：3 秒的"慢降"，不是抛体
const k = K.easeInOut(K.seg(t, 27.2, 30.2));
moon.setPosition(new THREE.Vector3(1.75, 6.4, -4.6).lerp(target, k));
moon.setIntensity(0.7 + 0.3 * k);   // 落定后更亮一点
```

`opts.disc === false` 就退回纯光晕（旧行为）。**注意**：现在它会真的出现在画面里，
以前"只有一团光"的构图需要重新确认。

### 3）失去 = 去饱和 —— `K.grade`

```js
const grade = K.grade(scene, K, {});
grade.setDesaturate(K.smoothSeg(t, 15.0, 15.6) * 0.75);   // 崩塌那一刻起灰
```

它给场景里每个材质存一份颜色快照，`setDesaturate(k)` 从快照重算——所以来回 seek 都不会越变越灰。
要更狠可以同时降主光、升雾：

```js
rig.key.intensity = K.lerp(2.6, 1.4, K.seg(t, 15.0, 15.6));
scene.fog.color.setHex(0xb9b7b2);
scene.fog.near = K.lerp(60, 24, K.seg(t, 15.0, 15.6));
```

## 美术方向速查（默认「微缩模型」风格）

| 项 | 默认 | 说明 |
|---|---|---|
| 画幅 | 1920×1080 / 30–60fps | 竖版改 1080×1920，相机 fov 与构图重排 |
| 调色 | 1 强调色 + 泥土/草/石/木 | 强调色只给"变化"用（新长出来的、被点亮的） |
| 光 | 主平行光 + 半球 + 轮廓 + **fill** | 影子的方向就是叙事方向；逆光必开 fill |
| 材质 | `flat: true`，roughness .85–1 | 不要金属/塑料感，除非那是叙事点 |
| 景深 | 自写 depth-of-field 后处理（可选） | 成本高，只在"桌面/宏观"段落值得 |
| 暗角 | 全屏 radial 渐变 | 让画面像一张照片，不是一张图 |

## 性能预算

| 指标 | 目标 | 怎么做 |
|---|---|---|
| draw call | < 150 | 体素合并（`K.Vox`）、实例化、共用材质 |
| 单帧 JS | < 8ms | 只更新矩阵/材质标量；别每帧新建几何或材质 |
| 阴影 | 1 张 2048 | 阴影相机正好框住场景；`normalBias` 0.5 消条纹 |
| 粒子/光点 | 用 `Points` 一张 | 不要用 N 个 sprite |
| 实测（日景） | 1080p60 ≈ 70–140ms/帧 | 8 秒 ≈ 33 秒；30 秒 ≈ 2–4 分钟 |
| 实测（夜景） | ×1.6–1.9 | 900 颗星 + 2048 阴影时，31 秒 @30fps ≈ 4 分钟 |

## 常见坑

- **`castShadow` 给大地形**：地面自阴影会出现条纹（acne）。地面只 `receiveShadow`。
- **`scale.y = 0`**：退化矩阵（NaN 法线）。用 `Math.max(0.001, k)`。
- **实例矩阵忘记 `needsUpdate`**：所有实例停在第一帧。
- **材质缓存被改**：`K.mat()` 返回共享实例；要点亮某个物体用 `K.ownMat()`。
- **相机 + fov 一起插值**：`fov` 变了必须 `updateProjectionMatrix()`（`K.camPath` 已处理）。
- **逆光/夜景角色全黑**：忘了 `fill: 'auto'` 与每帧 `rig.sync(camera)`。
- **`sunOrMoon` 现在有实体圆盘**：以前靠"只有光晕"蒙混的天空，会多出一个球。
