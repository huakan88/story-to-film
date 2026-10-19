# 08 · 提示词规格：先把片子"写成数据"，再开渲

前三页管"怎么讲"（01 骨架、07 配比）和"怎么拍"（02 动作、03 世界）。这一页管**在开渲之前就把片子定死**：
用一份 JSON 描述全片，交给 `scripts/spec-to-film.mjs` 解析。规格不合格，脚本拒绝出片。

**为什么必须先有规格**：没有规格的片子会单调。人会一趟一趟地加镜头，但每次只加"同一类"的东西——
因为脑子里没有一个"这一步该比上一步多什么"的清单。规格把清单变成可校验的字段。

## 一、规格长什么样（`films/*.spec.json`）

```json
{
  "id": "yugong", "title": "愚公移山",
  "duration": 38, "fps": 60, "aspect": "16:9", "genre": "story",
  "palette": ["#8a7a64", "#8dc45c", "#4a5a6a", "#b44a34"], "accent": "#ffd08a",
  "ladder": ["object", "cluster", "field", "world"],
  "cast": [{ "id": "hero", "kind": "figure", "opts": { "hat": true, "tool": "hoe" } }],
  "stages": [ { "id": "hook", "t": [0, 2], "role": "hook", "verb": "抬头看山", "scale": "world", ... } ]
}
```

每一段（stage）必须有这 8 个字段，缺一个就跑不过解析器：

| 字段 | 值 | 作用 |
|---|---|---|
| `id` | 短名 | 场景标签（`scene:<id>`），也是配乐分段名 |
| `t` | `[起, 止]` 秒 | 必须与上一段首尾相接，最后一段必须等于 `duration` |
| `role` | hook / setup / first-unit / accumulation / turn / cost / payoff / button | 对应 07 的八段 |
| `verb` | 一个可见动词 | 不能用心理词（"决定""意识到"） |
| `scale` | object / cluster / field / world | **本段在尺度阶梯上的位置** |
| `change` | `{kind, count, what}` | 这一段发生了什么、发生几次。`kind` ∈ none / increment / light-up / grow / transform / open / pause / reveal / hold |
| `camera` | `{from, to, look, fov}` | 段首与段尾的机位，中间自动补 easeInOut |
| `caption` | `{zh, en}` | 留空即无字幕；一行 ≤ 26 字 |
| `sfx` | `[[name, t], ...]` | 打点（`om sound` 会读页面的 `OM.sfx`，这里只做对账） |

## 二、被逆向出来的那条主线：**尺度阶梯**

参考片（`films/reference-city.spec.json`，键盘里的小世界，64 秒）之所以不单调，不是镜头多，
而是**每一段都比上一段大一级**：

| 段 | 秒 | scale | 变化 | 观众感觉 |
|---|---|---|---|---|
| 一盏灯 | 0–6 | object | light-up ×1 | 有一个点在亮 |
| 键盘 | 6–14 | cluster | light-up ×8 | 亮的不止一个，是一排排 |
| 键帽里长出树 | 14–22 | object | grow ×1 | 那个点里还有东西 |
| 一片键帽 | 22–32 | cluster | light-up ×12 | 每一格都有世界 |
| **城市亮灯** | 32–44 | field | light-up ×24 | 从一条街变成一座城 |
| 拉远 | 44–52 | world | reveal ×1 | 城只是桌上的一小块 |
| 全城最亮 | 52–58 | world | light-up ×60 | 峰值 |
| 标题 | 58–64 | world | hold | 收住 |

**"点亮"为什么好看**：它是一个可以无限分级的同一动作——1 个点 → 一排 → 一片 → 一座城。
成本不变（一个材质从暗到亮），信息量却每一级都翻倍。这就是"分阶段"的本质。

抄这条线的方法：

1. 先选一个**可分级**的动作（点亮 / 生长 / 建成 / 铺开 / 数人数）。
2. 给它排 4 个尺度级别，每级换一个**数量级**（1 → 8 → 24 → 60）。
3. 每一级配一次**镜头退后**（object 贴脸，cluster 中景，field 俯拍，world 大远景）。
4. 峰值放在第 3 级（field），第 4 级（world）用来"揭示这件事有多小"。

## 三、解析器会拦掉什么（这就是它存在的意义）

```bash
node scripts/spec-to-film.mjs films/yugong.spec.json          # 对账 + 打印表
node scripts/spec-to-film.mjs films/yugong.spec.json --emit   # 打印可直接粘的 STORY / CAPTIONS / SFX
node scripts/spec-to-film.mjs films/yugong.spec.json --table  # 打印分镜表（贴进 shotlist.md）
```

| 拦什么 | 为什么 |
|---|---|
| 段与段之间有空隙或重叠 | 时间轴一断，配乐分段全错位 |
| 一段 > 4.5 秒且 `change.kind = none` | 4.5 秒没变化 = 观众已经走神 |
| `increment` 的 `count` < 2 | 只出现一次，"越来越多"不成立 |
| 构建/混合片的 `scale` 从未离开 object | **单调的真正来源**：全片停在同一个数量级 |
| 缺 hook / setup / accumulation / payoff / button | 缺段 = 结构不成立 |
| 字幕一行 > 26 字 | 1080p 一行读不完 |

它只报警告、不拦的：`scale` 回落、字幕略长、`change` 与 `role` 不匹配。

## 四、写规格的顺序（照这个顺序写，返工最少）

1. **先写 8 行的段表**（id / role / t / verb），不写镜头。这一层错了，后面全白写。
2. **给每段填 scale 与 change**：逐段问"这一段比上一段多了什么、多了几个"。
3. **再填 camera**：按 scale 决定景别（object 贴脸 / cluster 中景 / field 俯拍 / world 大远景）。
4. **最后填 caption 与 sfx**：字幕只留"画面说不出的"，音效只打卡点。
5. `spec-to-film.mjs` 跑一遍，0 problem 再动手写 `index.html`；`--emit` 出来的 `STORY` 直接粘。

## 五、反例（这一页是因为它们才写的）

- **土堆没长**：规格里 `change` 写的是 `"重复搬运"`，没有 `count`。解析器现在会要求 `count ≥ 2`。
- **开场 4.6 秒风景**：规格里 hook 段 `change.kind = none` 且长 4.6 秒 → 直接报错。
- **全片都很平**：构建片 8 段里 `scale` 全是 `cluster` → 报"scale 从未离开 object"这一级别的病。
- **字幕念不完**：一段 32 字的字幕，1080p 下 3 秒读不完；规则把它压到 26 字以内。
