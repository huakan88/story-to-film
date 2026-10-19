# 骨架子工程（8 秒）

复制这个目录（或用 `node scripts/new-film.mjs 你的片名`）就能开拍。四个文件，各管一件事：

| 文件 | 改什么 |
|---|---|
| `index.html` | **STORY 块**：`beats`（每个动词的起止秒）+ `camera`（机位关键帧）+ 场景标签/音效打点 |
| `world-kit.js` | 美术层 `window.WORLD_KIT`：调色板、`rand(seed)`、`seg/lerp/ease/spring`、`mascot`、`pine/bush`、`ground/skyDome/sunOrMoon/stars/clouds`、`camPath/lightRig/makeRenderer`、`glowSprite` |
| `ui.js` | 2D 层，一个纯函数 `UI.frame(t)`；`TIMING` 里是字幕/标签的进出秒 |
| `ui.css` | 字幕卡、HUD、暗角、淡入的样式（只动 opacity/transform） |

## 依赖怎么来（默认零配置）

- **three.js**：优先用本目录自带的 `three/`（两文件，MIT，离线可渲），缺失时按
  jsDelivr → unpkg → npmmirror 的顺序并行兜底。
- **GSAP**：先 CDN（钉 3.12.5），再本地 `vendor/gsap.min.js`。
- 想彻底离线 / 可复现（推荐在正式渲染前跑一次）：

```bash
node scripts/vendor-three.mjs .    # 落地 vendor/three.* + vendor/gsap.min.js
```

跑完之后页面只读本地文件，不再发网络请求。

## 跑

```bash
om still . --at 0.5,2,5,7.5   # 四张关键帧
om check .                    # 结构/脚本/运动/文字检查（0 errors 才继续）
om render . --fps 60          # → out/skeleton-v1.mp4
```

## 规矩

- 每一帧都必须是 `t` 的纯函数：不用 `Date.now`、不用 `Math.random`（用 `WORLD_KIT.rand(seed)`）、不跨帧累加。
- 时长只改 `index.html` 的 `data-duration` 与 `STORY.duration`（两处一致）。
- 换主角：让 `WORLD_KIT.mascot` 返回同样的 `{ group, pose }`，场景代码不用动。
- 字幕卡在下三分之一：`#cap` 默认 `display:none`，由 `UI.frame(t)` 按时间开关（透明但存在的文字框会被排版检查判为低对比度）。
- `om check` 在这个模板上会留 2 条 `low-contrast` 警告，指向字幕的占位文案（0.00s，字幕此时并未显示）：视频上不可见，可以忽略。
