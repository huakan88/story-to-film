# 示例工程：等不到的月亮（31 秒）

第二个示例，用来验证 skill 里"**给一段故事 → 出一条片**"这条路：
这一次不是在空场上造东西（构建片），而是**一个角色、一个愿望、一次失败、一次换办法**（故事片）。

```bash
om still . --at 2,8,13,16,20,24,29     # 七个关键时刻
om check .                             # 结构/脚本/运动/文字（0 errors）
om render . --fps 30                   # → out/moon-tree-v1.mp4
```

- 分镜与 8 拍：`story.md`（先看这个）
- 镜头表（每一行对应 `references/02-shot-grammar.md` 的一条）：`shotlist.md`
- 时间线与动画：`index.html` 的 `STORY` 块 + `draw(t)`
- 美术层：`world-kit.js`（未修改，直接复用）
- 音效/配乐：`om.js`（huashu-motion 运行时）+ `window.OM.music/sfx` 打点

## 故事是怎么落到代码上的

| 拍 | 实现位置 | 一句话 |
|---|---|---|
| 够不到 | 角色分支 `t < walkIn[0]` | `look` 转向月亮，两次起跳（正弦包络），`squash` 压扁 |
| 垒高 | 石头数组 | 每块石头有 `birth`，从 +2.4 高度落下（`1-drop²`），落地时 `scale.y` 压一下 |
| 踮脚 | `climb` / `tiptoe` 两段 | 抛物线跳上塔顶，再踮一次；相机把月亮和"手"放进同一格 |
| 塌 | 15.0 之后的石头分支 | 每块石头拿到播种随机的初速与自转，`y` 二次下落到地面 |
| 褪色 | `#grade` + 主光 | `mix-blend-mode: color` 的灰蓝层 0→0.55，主光同时压到 0.58 |
| 种下 | `seed` 网格 + 角色蹲 | 种子从"手里"滑进土里并缩小；角色 `squash` 0.78 蹲下 |
| 长高 | `trunk` + `BRANCHES` + `CROWN` | 树干 `scale.y` 弹簧；四组分枝各有时刻；五个树冠圆球依次弹出 |
| 落点 | `moon` 的 `lerpVectors` | 月亮从 (1.75, 6.4, −4.6) 滑到树梢 (0.15, 5.05, −1.3)，光晕同时增强 |

## 这个工程里 `world-kit.js` 没覆盖、我自己补的三件事

1. **一盏面向镜头的补光**：`lightRig` 只有 key / hemi / rim，逆光夜景下角色正面是黑的。
   我加了 `THREE.DirectionalLight(0x9fb6d8, 1.1)` 放在相机侧——`world-kit` 应该补一个 `fill` 参数。
2. **去饱和**：kit 没有调色能力。我用一层 `mix-blend-mode: color` 的 DOM 覆盖层 + 主光压暗近似，
   不是真调色（想真做得写后处理）。
3. **可坍缩的塔**：`boxStack` 是静态装饰堆，没有"每块独立出生 / 崩落"。我按层自己拼盒子，
   每块带 `birth`、初速、自转、落地压扁。

## 抄这个工程时最容易踩的坑

- **时长三处一致**：`data-duration`、`STORY.duration`、`UI.mount({ duration })`。
- **角色落在塔顶**：`pose()` 内部会写 `group.position.y`，所以要先 `pose()` 再 `group.position.set(...)`。
- **月亮"落在树梢"是透视问题**：月亮要放在树梢**后方**（z 更负）且大致落在同一射线上，
  否则相机一偏，它就"飘"到树旁边去了。
- **去饱和层压在字幕下面**：`#grade` 放在 `#cap` 之前的 DOM 顺序里，并 `pointer-events: none`。
