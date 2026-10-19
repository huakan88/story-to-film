# 骨架子工程（8 秒）

复制这个目录就能开拍。四个文件，各管一件事：

| 文件 | 改什么 |
|---|---|
| `index.html` | **STORY 块**：`beats`（每个动词的起止秒）+ `camera`（机位关键帧）+ 场景标签/音效打点 |
| `world-kit.js` | 美术层 `window.WORLD_KIT`：调色板、`rand(seed)`、`seg/lerp/ease/spring`、`mascot`、`Vox`、`pine/bush/boxStack`、`ground/skyDome/sunOrMoon/stars/clouds`、`camPath/lightRig/makeRenderer`、`glowSprite` |
| `ui.js` | 2D 层，一个纯函数 `UI.frame(t)`；`TIMING` 里是字幕/标签的进出秒 |
| `ui.css` | 字幕、HUD、暗角、淡入黑幕的样式（只动 opacity/transform） |

## 起跑前（一次）

```bash
node scripts/vendor-three.mjs .    # 落地 vendor/gsap.min.js（three 仍从 CDN 取）
```

没跑这一步，页面会显示 `vendor/gsap.min.js missing — run: node scripts/vendor-three.mjs .`。

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
- three 的兜底链在 `index.html` 顶部：jsDelivr → unpkg → npmmirror → `./vendor/three.module.min.js`。
