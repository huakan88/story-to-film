# 03 · 世界套件（lib3d.js）

`assets/skeleton/lib3d.js` 是一个 22KB 的纯函数美术层：调色板、角色工厂、体素构建器、道具、相机轨迹、灯光。
它是 classic script，暴露 `window.LIB3D`，**不自己建 renderer、不读时钟**。

## 设计原则

1. **块面/体素优先。** 写实毛发、布料、人脸在这条管线上会翻车；块面 + 平直着色反而稳定、可读、快。
2. **一个材质一次分配。** `L.mat()` 带缓存，同色同参数复用；实例化物体共用一份材质。
3. **颜色从调色板取。** 全片最多 1 个强调色 + 3 个中性色，别每个物体自己调色。
4. **尺度统一。** 角色 1–2 单位高，道具 0.2–3 单位，地形 50–200 单位；先定尺度再建东西。
5. **单位原点在脚下。** 所有角色/道具的 `group` 原点 = 地面接触点，方便放到任意高度。

## API

### 数学 / 时间

| 函数 | 用途 |
|---|---|
| `L.clamp(v, a, b)` | 夹取 |
| `L.seg(t, a, b)` | 线性 0→1 进度（夹取） |
| `L.smoothSeg(t, a, b)` | 平滑 0→1（smoothstep） |
| `L.easeOut / easeInOut / easeOutBack(x)` | 缓动 |
| `L.spring(x, bounce)` | **闭式弹簧**：0→1，带一次过冲，纯函数（`bounce` 0 = 临界阻尼，0.2 = 有回弹） |
| `L.lerp(a, b, k)` | 插值 |
| `L.rand(seed)` | 播种随机（同一 seed 永远同一序列）——**不要用 Math.random** |

### 材质 / 几何

```js
L.mat(THREE, 0x7cb04a, { roughness: .9, flat: true })   // 缓存的标准材质
L.ownMat(THREE, color, opts)                             // 要单独改（如点亮）时用
L.roundBox(THREE, w, h, d, r, seg)                       // 圆角盒（角色、键帽、软道具）
L.Vox(THREE)                                             // 体素构建器，见下
L.voxMaterial(THREE)                                     // 顶点色的 Lambert 材质
```

体素构建器（合并成一个 draw call）：

```js
const v = L.Vox(THREE);
v.box(x, y, z, w, h, d, color, { jitter: 0.1, rand });   // y 是底部，不是中心
v.gable(x, y, z, w, h, d, color, {...});                 // 人字屋顶
const geo = v.build();                                   // BufferGeometry（带顶点色）
```

### 角色

```js
const c = L.mascot(THREE, { scale: 1, color: 0xd97757 });
// → { group, pose, body, eyes }
c.pose({ walk, bob, jump, look, eyes, squash });
//  walk: 步态相位（0..1 循环）  bob: 上下偏移  jump: 离地高度
//  look: 朝向（弧度）           eyes: 眼睛开合  squash: 压扁（0.8 蹲、1.05 起跳）
```

角色是**工厂**：换主角只改 `L.mascot` 的实现（或像 `examples/` 那样在入口覆盖
`LIB3D.mascot = (...) => MyCharacter.build(...)`），场景代码一行不动。
新角色必须返回同样的 `{ group, pose }`，`pose` 的参数语义保持一致。

### 道具

```js
L.pine(THREE, { h: 1, rand })        // 松树（3 层锥 + 树干）
L.bush(THREE, { h: 1, rand })
L.house(THREE, { w, d, h, wall, roof, lit })   // → { group, winMat }
L.lamp(THREE, { h, on })             // → { group, head, glow }
L.keycap(THREE, { w, d, h })         // 键帽（锥形帽）
L.clouds(THREE, { count, y, spread, rand })
L.stars(THREE, count, radius, rand)  // Points，材质 opacity 可控
L.skyDome(THREE, { r, top, bottom }) // → { mesh, mat }，mat.uniforms.night 0..1 做昼夜
L.glowTexture(THREE, color, soft) / L.glowSprite(THREE, color, size, { soft, opacity })
```

### 相机 / 灯光 / 渲染器

```js
const camPath = L.camPath(THREE, [
  { t: 0,  pos: [3, 1.3, 4], look: [0, .3, 0], fov: 32 },
  { t: 6,  pos: [5, 2.5, 7], look: [0, .6, 0], fov: 40 },
]);
camPath(camera, t);                       // 纯 t 的相机运动，段间 easeInOut

const rig = L.lightRig(THREE, scene, { key: 2.6, hemi: .75, shadowSize: 9, shadowMap: 2048 });
// → { hemi, key, rim }；黄昏时把 key 降、rim 升（rim 是暖色补光，别一起降）

const renderer = L.makeRenderer(THREE, canvas, { width: 1920, height: 1080 });
```

## 美术方向速查（默认「微缩模型」风格，按需改）

| 项 | 默认 | 说明 |
|---|---|---|
| 画幅 | 1920×1080 / 60fps | 竖版改 1080×1920，相机 fov 与构图重排 |
| 调色 | 1 强调色 + 泥土/草/石/木 | 强调色只给"变化"用（新长出来的、被点亮的） |
| 光 | 一盏主平行光 + 半球补光 + 冷/暖轮廓 | 影子的方向就是叙事方向（光从哪来） |
| 材质 | `flat: true` 平直着色，roughness .85–1 | 不要金属/塑料感，除非那是叙事点 |
| 景深 | 可选：自写 depth-of-field 后处理 | 成本高，只在"桌面/宏观"段落值得 |
| 暗角 | 全屏 radial 渐变 | 让画面像一张照片，不是一张图 |

## 性能预算（1080p）

| 指标 | 目标 | 怎么做 |
|---|---|---|
| draw call | < 150 | 合并体素（`L.Vox`）、实例化（`InstancedMesh`）、共用材质 |
| 单帧 JS | < 8ms | 只更新矩阵/材质标量；不要每帧新建几何或材质 |
| 阴影 | 1 张 2048 | 阴影相机正好框住场景；`normalBias` 0.2–0.4 消 stripes |
| 粒子/光点 | 用 `Points` 一张 | 不要用 N 个 sprite |
| 实测 | 1080p60 ≈ 140ms/帧 | 64 秒 ≈ 9 分钟；30 秒 ≈ 4 分钟 |

## 常见坑

- **`castShadow` 给大地形**：地面自阴影会在大平面上出现条纹（acne）。地面只 `receiveShadow`。
- **`scale.y = 0`**：会得到退化矩阵（NaN 法线）。用 `Math.max(0.001, k)`。
- **实例矩阵忘记 `needsUpdate`**：所有实例停在第一帧。
- **材质缓存被改**：`L.mat()` 返回共享实例；要点亮某个物体用 `L.ownMat()`。
- **相机 + fov 一起插值**：`fov` 变了必须 `updateProjectionMatrix()`（`L.camPath` 已处理）。
