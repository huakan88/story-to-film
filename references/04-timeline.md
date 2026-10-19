# 04 · 时间线契约（确定性）

一句话：**整片 = 一条暂停的时间线 + 一个 `draw(t)`。** 任何一帧都能单独算出来。

## 结构

```js
// 1) 建世界（一次，确定性：播种随机）
const scene = buildWorld();

// 2) 一个纯函数：把世界摆成 t 时刻的样子
function draw(t) { /* 所有位置/缩放/材质/相机/DOM 都由 t 算 */ renderer.render(scene, camera); }

// 3) 一条暂停的 GSAP 时间线，只驱动 t
const tl = gsap.timeline({ paused: true });
const proxy = { t: 0 };
Object.defineProperty(proxy, 't', { get: () => proxy._t || 0, set: (v) => { proxy._t = v; draw(v); } });
tl.fromTo(proxy, { t: 0 }, { t: DURATION, duration: DURATION, ease: 'none', immediateRender: false }, 0);
draw(0);

window.__timelines = window.__timelines || {};
window.__timelines[compositionId] = tl;
```

为什么用 proxy 而不是 `onUpdate`：`tl.seek(t)` 会**抑制回调**，但会**执行属性 setter**。
所以只要写进 setter，任意 seek 都会重画那一帧。

## 挂到 huashu-motion（om）上

```html
<div id="film" data-composition-id="my-film" data-width="1920" data-height="1080"
     data-fps="60" data-duration="32">
```

- `data-duration` = 片子长度（秒）。**必须写**，否则渲染器不知道要抓多长。
- `window.__timelines["my-film"]` 的 key 必须等于 `data-composition-id`。
- 依赖是异步的（CDN import）时，把 boot promise 注册进 `window.__hf.buildReady`，渲染器会等它：

```js
window.__hf = window.__hf || {};
window.__hf.buildReady = window.__hf.buildReady || {};
window.__hf.buildReady['deps'] = boot;      // boot: Promise
if (window.OM && window.OM.ready) window.OM.ready(boot);
```

## 没装 om 也能渲染

页面暴露一个通用接口，任何能"seek + 截图"的无头浏览器都能用：

```js
window.film = {
  duration: DURATION,
  seek(t) { tl.pause(); tl.seek(t, false); draw(t); },
  draw,
  ready: true,
};
```

循环 `t = 0 … duration`，每帧 `seek(t)` → 截图 → 按帧号命名，再用 ffmpeg 合成：

```bash
ffmpeg -framerate 60 -i frames/%06d.png -i audio.wav -c:v libx264 -crf 18 -pix_fmt yuv420p out.mp4
```

## 五条确定性规则（违反任何一条，审片和成片就会不一致）

1. **不用 `Date.now()` / `performance.now()` / `requestAnimationFrame` 驱动画面。** 时间只有一个来源：`t`。
2. **不用 `Math.random()`。** 用 `L.rand(seed)`；同 seed 同结果。
3. **不保留跨帧状态。** 不要 `x += v * dt`，要 `x = f(t)`。累积在顺序播放时对，seek 时错。
4. **不用"上一帧的值"当起点。** `tl.fromTo(el, {x: el.x}, …)` 这种会被判 `history-dependent`：
   播放时对，跳帧时错。起点必须写成常量或由 t 算。
5. **循环要有限。** `repeat: -1` 只在有 `data-duration` 的片子里可接受；否则用 `count: n`。

## 场景标签（可选，但强烈建议）

```js
tl.addLabel('scene:hook', 0)
  .addLabel('scene:build', 3.5)
  .addLabel('scene:burst', 12)
  .addLabel('scene:end', 26);
```

标签是 om 的音乐分段（`OM.music({ energy: { hook: 0.4, build: 0.7, ... } })`），
也是你自查"节奏对不对"的骨架。

## 排查：seek 出来和渲染不一样

| 现象 | 原因 | 修法 |
|---|---|---|
| 某个时刻跳过去是空的，播放时有内容 | 跨帧累积 / 回调里写状态 | 改成纯 `f(t)` |
| `om check` 报 `history-dependent` | tween 起点来自另一个 tween | 起点写常量 |
| 第一帧黑屏 | 依赖没加载完就开始抓帧 | `__hf.buildReady` 注册 boot |
| 静态帧（连续 1s 没变化） | 镜头/物体在某段没动 | 加微呼吸（1–2% 的缓慢变化） |
| 物体闪一下消失 | `scale` 到 0 后又被另一个 keyframe 拉回 | 用 `visible = k > 0.002` 兜底 |
| 渲染器 15s 后报 `the composition's ready promises did not finish` | **把 GSAP 时间线当成 promise 的返回值**（`tl` 是 thenable，Promise 会等它"播完"，而它是暂停的 → 永不 resolve） | 回调里 `return true`，绝不把 `tl` 返回进 promise 链 |
| 首帧要等 10s+ 才出来 | CDN 兜底链**串行**尝试，等待被乘以源数量 | 三源 `Promise.any` 并行竞速；每源 8–12s 超时；本地 `vendor/` 放第一位 |


## 时长与帧率怎么选

| 目标 | 建议 |
|---|---|
| 短视频/信息流 | 1080×1920，30s，60fps（手机屏更吃帧率） |
| 横版叙事/官网 | 1920×1080，45–70s，60fps |
| 快速迭代 | 先 30fps 出片看节奏，定稿再 60fps |
| 极短（<10s） | 30fps 也够，把预算花在动作上 |

渲染成本参考：1080p60 ≈ 140ms/帧。30 秒 = 1800 帧 ≈ 4 分钟；90 秒 ≈ 13 分钟。
加运动模糊（多子帧平均）会 ×4–8，只在极快运动时才值得。
