# arXiv RL Weekly

一个本地小网页，用来每周整理 arXiv 上新的强化学习相关论文。它会从 arXiv API 抓取最近 7/14/30 天论文，同时检查标题和摘要，按关键词和 arXiv 分类筛选，自动给出主题标签、短摘要、收藏状态和可复制的 Markdown 周报。

## 运行

```bash
node server.mjs
```

然后打开：

```text
http://localhost:4173
```

这个项目不需要 `npm install`，只依赖本机已有的 Node.js。

## 使用方式

- 默认检索最近 7 天的强化学习相关论文。
- 可以调整时间范围、最多显示数、关键词标签、主题和排序。
- 关键词是可点选标签，也可以临时添加自己的关键词。
- 点星标收藏论文后，左侧周报会优先使用收藏论文。
- 点「复制周报」会把 Markdown 周报复制到剪贴板。

## 默认检索设置

默认关键词：

```text
reinforcement learning, policy gradient, q-learning, actor critic, offline rl, rlhf, reward model, markov decision process
```

默认 arXiv 分类：

```text
cs.LG, cs.AI, cs.RO, stat.ML, eess.SY
```

默认关键词偏向强化学习、机器人学习、外骨骼和 world model：

```text
reinforcement learning, world model, model-based reinforcement learning, robot learning, exoskeleton, wearable robot, locomotion, offline reinforcement learning, policy gradient, reward model, rlhf
```

如果你关注方向更具体，可以在网页里的关键词标签区加入这些词：

```text
dexterous manipulation, prosthetics, gait assistance, sim-to-real, embodied AI, preference optimization
```

## 每周工作流

1. 每周一打开网页并刷新。
2. 快速浏览标题和短摘要，把真正想读的论文点星标。
3. 点击「复制周报」，粘贴到笔记、邮件或聊天工具。

## 命令行周报

如果不想打开网页，也可以直接生成 Markdown：

```bash
node weekly-digest.mjs
```

可选参数：

```bash
node weekly-digest.mjs --days=14 --max=120 --keywords="reinforcement learning,world model,exoskeleton,locomotion,robot learning"
```

如果你想要全自动版本，可以让 Codex 给这个目录加一个每周一自动运行的任务，生成周报并发回当前线程。
