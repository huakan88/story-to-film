# 05 · 声音：配乐、音效、旁白

声音是半条命。默认**要有声音**；只有在做片头循环或纯动效时才静音。

## 两条路线

| 路线 | 适合 | 代价 |
|---|---|---|
| **A. `om sound` 自动生成**（推荐） | 90% 的情况：按场景能量自动作曲 + 音效打点 | 需要装 huashu-motion |
| **B. 自带音频文件** | 有版权曲库 / 客户给了音乐 / 没装 om | 时间轴对齐靠手调，音效要自己找 |

## 路线 A：写"声明"，不摆音轨

在 `index.html` 里声明，`om sound` 会把它们渲染成 `assets/sound.wav`：

```js
if (window.OM && window.OM.music) {
  window.OM.music({
    product: 'explainer',      // 曲风产品向：explainer / devtool / ai / cute / calm …
    style: 'mallet',           // 具体风格：mallet / pulse / piano / ambient / chiptune …
    bpm: 96,
    drop: 'burst',             // 音乐最高点落在哪个场景标签上
    ending: 'ring',
    energy: { hook: 0.4, build: 0.7, burst: 0.95, dark: 0.35, end: 0.5 },
  });
  [[0.55, 'whoosh'], [1.15, 'thud'], [2.62, 'boing'], [10.6, 'hit', { gain: 1.2 }]]
    .forEach(([t, name, o]) => window.OM.sfx(name, t, o));
}
```

**打点原则：动作落地的同一行写音效。** 让音效跟着代码走，不要事后对齐。

可用音效（`om sound --list` 看全量）：`pop tick click whoosh whip thud impact paper stamp
ding chime sparkle count riser draw type boing slide hit subdrop reverse glitch shutter`。

节奏建议：30 秒里 8–15 个音效；每个"长得出来/亮得起来"的动作都要有一声。

## 场景能量（直接决定音乐轮廓）

```js
energy: { hook: 0.35, build: 0.6, burst: 0.95, dark: 0.3, end: 0.5 }
```

- `dark`（暗拍）必须明显低：它是后面的"亮"值钱的原因。
- `burst` 必须明显高：整片只有一个最高点。
- 落点（end）不要拉满：留一口气。

## 旁白（可选）

```bash
om voice . --text script.txt          # 生成 assets/voice.wav + 字级时间码 + .srt
```

- 口播要**人感停顿**：句间留 0.25–0.5 秒，关键句后更长。
- 旁白时长定了之后，**回头把画面节奏对齐到词**（`OM.cue('词')`），不要反过来硬塞。
- 读不准的专有名词，TTS 前做替换（音频用替换词，字幕仍用原文）。

## 路线 B：自带音频

```html
<audio id="om-sound" src="assets/music.mp3" data-start="0" data-duration="32" data-volume="1"></audio>
```

- **必须给 `id`**，否则混音器找不到它，成片会静音。
- `data-start` / `data-duration` / `data-volume` 都是可寻址的；渲染时会被 seek，不要自己 `play()`。
- 音效跟音乐共用一条轨就够；要分开就再加一个 `<audio>`，各自设 `data-volume`。

## 响度与交付

| 项 | 目标 |
|---|---|
| 整体响度 | −14 LUFS 左右（`om sound` 默认就落在附近） |
| 峰值 | ≤ −1 dBFS |
| 音乐与人声 | 人声时音乐自动压低（ducking），不要靠手调 |
| 自检 | 静音看一遍画面；再闭眼听一遍，听不清口播就降 BGM 或重录 |

## 没装 om 时怎么出带声的片子

1. 先渲染无声视频（`--silent`，或用任意帧渲染器）。
2. 用 ffmpeg 把音频混进去：

```bash
ffmpeg -i video.mp4 -i music.wav -c:v copy -c:a aac -b:a 192k -shortest out.mp4
```

3. 音效对齐：把每个音效的触发秒数记在 `story.md` 里，用一条 ffmpeg `adelay` 链叠上去。
