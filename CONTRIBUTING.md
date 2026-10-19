# Contributing

这个仓库有两类东西，改法不同。

## 1. 方法（`SKILL.md` + `references/`）

- **只写你验证过的东西。** 每条规则后面应该能追到一次真实的失败或一次冷审片意见；没证据的"最佳实践"不要加。
- 一个 reference 只回答一类问题（故事/分镜/世界/时间线/声音/审片）。超过 ~120 行就该拆。
- 新增一条"叙事动作 → 镜头"语法时，写清四列：**动作 / 实现 / 镜头 / 音效**，并给一个能在 `examples/` 里看到的例子。
- 反例同样重要：写清"什么情况下不要这么做"。

## 2. 代码（`assets/skeleton/`、`scripts/`、`examples/`）

改完必须过这三关：

```bash
node scripts/selfcheck.mjs          # 结构 / 引用 / 确定性（不联网，<1s）
om check assets/skeleton            # 0 errors（warnings 见 references/06-review.md 的误报说明）
om still assets/skeleton --at 1,4,7 # 真的看一眼这三帧
```

- **确定性是硬要求**：`Date.now()` / `performance.now()` / `Math.random()` 一律不行，
  随机用 `world-kit.js` 的 `K.rand(seed)`。`selfcheck.mjs` 会拦。
- **时长三处一致**：`data-duration`、`STORY.duration`、`UI.mount({ duration })`。
- **`world-kit.js` 改动要同步到所有工程**：`assets/skeleton/` 与每个 `examples/*/` 各有一份拷贝
  （工程要能被单独拷走运行）。改了 skeleton 的那份，就把同样的文件复制到各 example，然后跑一遍它们的 still。
- 不要提交：`out/`、`vendor/`、`.om/`、`_*` 临时图（`.gitignore` 已覆盖）。

## 3. 提交信息

一句话说清**改了什么、为什么**（"故事片示例发现 kit 缺 fill 光，补 lightRig.fill + rig.sync"）。
一个 PR 只做一件事：方法改动和代码改动分开。

## 4. 发布（本机特有）

这台机器的 `git push` 连不上 github.com（libcurl 不吃系统代理），所以用 REST API 发布：

```bash
node scripts/push-to-github.mjs --owner <you> --repo <repo> --message "…"   # 先加 --dry 看清单
```

脚本按"目录即真相"工作：本地没有的文件会在远端删掉，所以推送前先 `node scripts/selfcheck.mjs`。

## 5. 许可证

代码 MIT；`three.js` 是 MIT（已随骨架分发，见 `THIRD_PARTY.md`）；GSAP 不重分发，从 CDN 加载。
提交即表示同意以 MIT 发布你的贡献。
