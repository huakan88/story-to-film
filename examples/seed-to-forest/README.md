# 示例工程：一颗种子，一座森林（18 秒）

这是本仓库的样板片，**完整源码**，可以直接当模板改：

```bash
om still . --at 1,6,12,17      # 四个关键时刻
om check .                     # 0 errors 再继续
om render . --fps 60           # → out/seed-to-forest-v1.mp4
```

- 分镜与 8 拍：`story.md`（先看这个，再看代码）
- 世界与时间线：`index.html` 的 `STORY` 块（beats + camera keys）
- 2D 层（字幕卡）：`ui.js` 的 `TIMING`
- 美术层：`world-kit.js`（调色板 / 角色工厂 / 松树 / 地面 / 天空 / 相机轨迹 / 灯光）

## 这个故事是怎么落到代码上的

| 拍 | 代码位置 | 一句话 |
|---|---|---|
| 种子落下 | `draw()` 里 `stage 3a` | 一个 sphere 用 `seg()` 从 3.6 落到地面 |
| 顶出 + 展开 | `stage 1` | `sprout.scale.y` 用 `K.spring()` 拉起；两片叶依次 `scale` |
| 土 → 草绿 | `stage 3b` | `groundTop.material.color.copy(SOIL).lerp(GRASS, gk)` |
| 冒出 / 成林 | `stage 3c` | 两个 `InstancedMesh`（树干 + 树冠），每株一个 `birth`，按离种子远近错时 |
| 点亮 | `stage 2` 之后 | `glow.material.opacity` + 树冠高度 |
| 字幕 | `ui.js` `TIMING` | 下三分之一卡片，14.4s 进、18s 走完 |

## 抄这个工程时最常见的三个坑

1. **时长两处要一致**：`index.html` 的 `data-duration` 和 `STORY.duration`。
2. **材质是共享的**：想给某个物体单独改颜色，先 `material.clone()`（`K.mat()` 有缓存）。
3. **相机不要钻进林子里**：本例在生成森林时留了一条朝向相机的"空道"（`CAM_AZ`），否则树会糊在镜头上。
