---
name: monthly-brief
description: Generate the monthly RL "experimental-phenomena → theory-directions" brief (fetch arXiv phenomenon-signal papers, score/精读 in-session, write JSON+MD, render HTML). Use when running or scheduling the RL monthly brief for the arxiv-app project.
---

# Monthly RL brief — procedure

Audience is an **RL theory researcher hunting project directions**: papers reporting a **stable, reproducible, counterintuitive experimental phenomenon that still lacks a theoretical explanation** (the Wang 2025 → Labbi 2026 "Wang" position). Theory papers are a *frontier map*, not the target. Do the scoring/精读 yourself — there is no code→LLM pipeline.

Run everything from the project root: `/Users/muxingwang/Documents/Codex/2026-05-25/arxiv-app`. Set `MONTH=YYYY-MM` (the month being produced).

**Environment fallback (no `node`):** if `node` isn't on PATH in this session (common when Claude runs the skill directly), don't block —
- Step 1 (fetch): instead of `node fetch-candidates.mjs`, hit the same query against `https://export.arxiv.org/api/query` in the browser (or WebFetch) and parse the feed in-session. The query is defined in `fetch-candidates.mjs` (phenomenon-signal terms + RL cats).
- Step 7 (render): instead of `node brief-render.mjs`, produce `$MONTH.html` by replacing the `<script type="application/json" id="brief-data">…</script>` block in `brief.template.html` with `$MONTH.json` (do it with `python3` or write the file directly), then refresh `index.html` to list all `data/briefs/*.html`. (`python3` is available even when `node` is not.)

## Steps

1. **Fetch candidates** (deterministic, no LLM):
   `node fetch-candidates.mjs --max=150`
   → writes `data/briefs/candidates-<date>.json`. Read it. (Add `--since=YYYY-MM-01` to window; phenomenon-signal papers are sparse, so a wide recall sorted newest-first is fine.)

2. **Triage / score** each candidate against this picture (title+abstract):
   > 报告了一个稳定、可复现的实验现象，且与主流解释矛盾，或揭示了现有理论工具（收敛性/方差分解/样本复杂度/泛化界…）尚未覆盖的效应。典型：大家以为某设计是关键，消融显示真正起作用的是另一个被忽视的因素。
   Keep the strongest phenomena. **Drop**: pure theory (→ Section II instead), pure SOTA/application, benchmark/survey, and "phenomenon = my method works" papers.

3. **Partition** the kept phenomena: **A** = top-venue main track; **B** = workshop / 预印本 (venue is a SOFT signal — do NOT drop good phenomena for being workshop/preprint). Parse `comment` for venue; `workshop` in comment → B. Aim ≤ ~9 total in Section I.

4. **精读** each finalist (fetch fuller text if useful: `https://arxiv.org/abs/<id>` or `/html/<id>`). Write, **in your own words (never paraphrase the abstract)**: `phenomenon` / `why`(反常识+消融稳健) / `theory`(理论现状) / `entry`(可建模切入点). Collect leftover theory papers into **Section II**, grouped by tool (收敛性/SA · 样本复杂度/bandit · 方差&PG · offline-OPE · 博弈-MARL); mark `star:true` if a theory paper directly addresses an empirical phenomenon.

5. **Theory-gap check** (`theory` field + Section III) = forward-citation, **not memory**. Prefer Semantic Scholar with `S2_API_KEY` (env) for coverage; else OpenAlex keyless:
   - find id: `https://api.openalex.org/works?search=<title>&per-page=1`
   - citing works: `https://api.openalex.org/works?filter=cites:<openalexId>&select=title,publication_year&per-page=100`
   - **read citing abstracts** to judge if the phenomenon was theorized (don't regex titles). Fresh 2025-26 papers: citation data too sparse → default `open`. This check really matters for the Section III backlog.

6. **Write outputs** (match the schema of `data/briefs/2026-07.json` exactly):
   - `data/briefs/$MONTH.json` — structured brief (fields: month, title, generatedAt, sub, notes[], sectionI{A[],B[],alsoScanned[]}, sectionII[{group,items[]}], sectionIII[]). Entry statuses: `open`/`partial`/`filled`. venueClass: `main`/`ws`/`pre`.
   - `data/briefs/$MONTH.md` — plain-text version (Unicode math only, no raw LaTeX).

7. **Render HTML**: `node brief-render.mjs --month=$MONTH` → `data/briefs/$MONTH.html` + refreshed `index.html`.

8. **Report** (and, when scheduled, this is the notification): month, #phenomena (A/B), #theory, #backlog, anything new vs last month, and the file paths. **On any failure (fetch error, empty pool, node error), say so loudly with the error** — never silently produce nothing.

## 筛选补丁 v1（优先级最高，覆盖 ①②⑤，③ 微调）
目的：堵假阳性——经验现象常是经典 RL 理论的 LLM/领域 costume，或在最小模型里消失。

**① 召回（双配额，分开跑，互不挤占）**
- 经典 RL 流（一等公民，不靠"手动补"）：TD / temporal difference / actor-critic / policy gradient / off-policy / function approximation / value estimation / stochastic approximation / exploration。
- LLM-RL 流（RLVR / RLHF / policy optimization）：限额 ≤ 一半。
- 现象信号词在 **title+abstract** 都匹配（不再只 title）；"是不是现象论文"下放到 ②。

**② 每篇产出【结构化论证】，四项缺一即弃**（不做数值评分/阈值）
1) 现象陈述（可复现、非"我方法更好"）；2) 最小经典模型（剥掉 LLM/领域外衣的最小 MDP/bandit/优化模型）；3) 存活性（现象在最小模型里还在吗？反例：tabular 令梯度干涉消失 ⇒ 假设承重 ⇒ 弃）；4) lane & tractability（补的理论落在 RL/优化/SA 且 tractable-but-unfilled？若"要分析真实巨网+verifier" ⇒ 弃）。
- "论文自称尚无理论/留待未来"只当**软先验**，不作 gap 证据（经典版常已有）。

**⑤ 理论现状（核心重做）：默认"疑似已被经典覆盖/costume"，主动搜经典空手而归才判 open**
- 前向引用只作**必要不充分**信号（填坑理论常是前辈/兄弟工作，不前向引用它）。
- **主动搜索（决定性）**：用 ② 的最小模型机制关键词搜经典（经验+理论两侧），对照下方【锚点表】强制交叉核；命中即"已填"。不靠模型记忆。
- 判 open 充要（全满足才算真 gap）：(i) 稳定可复现反直觉现象；(ii) 最小模型里存活；(iii) 搜索+锚点表后经典层面确无干净理论；(iv) 缺失理论在用户 lane 且 tractable。
- **【按用户要求：不删 costume】** 命中经典的**不移出主体**，而是在「理论现状(theory 字段)」写出归约到的经典结果 + 覆盖判定，并置 status：`filled`=经典已覆盖 / `partial`=半覆盖 / `open`=真 gap。

**【经典锚点表】**（命中现象类型即强制查对应结果，并记"查了什么、结论"）
- 梯度对齐/干涉/冲突 → Bengio 2020 (TD interference), PCGrad/CAGrad, Du et al.(transfer)
- 表示受限/misspecification → Du–Kakade–Wang–Yang, realizability 下界
- 方差/baseline/control variate → Greensmith–Bartlett–Baxter, Konda–Tsitsiklis
- 探索/coverage/分布错配 → concentrability, sufficient exploration
- 可塑性/capacity loss → Lyle, Nikishin, Dohare
- softmax PG 慢/entropy → Mei, Li–Wei–Chi–Chen, Cen
- actor-critic timescale → Chen–Zhao, Wu, Xu
- value 高估/maximization bias → Thrun–Schwartz 1993, Double-Q(van Hasselt), Clipped-Double-Q(TD3)/Maxmin/REDQ
- 腐蚀/噪声偏好下学 reward → R³M(ℓ1-outlier), Symmetric losses/SymPO, Robust RLHF from Corrupted Feedback(NeurIPS'24)
- 预训练数据序/basin 选择 → critical learning periods, data-ordering→basin selection（多为半覆盖）
（表可扩：每新增一条经典归约就登记。）

**③ 分区/上限（微调）**：维持 5–8 封顶、venue 软信号、允许某月为 0；⑤ 收紧后主体缩水是**预期**，宁 0–2 不放水。质量下限（多 seed/单变量隔离）在 ④ 精读核，不在摘要阶段判。

**自检**：若含 "RLVR Unlearnability" 类 ⇒ ⑤ 应判"已被 Bengio 2020 + Du–Kakade–Wang–Yang 覆盖"（status=filled），不得标 open。

**venue 诚信规则**：每条 venue 必须逐字取自 arXiv `comment` 字段（export API 的 `arxiv:comment`）；comment 为空 ⇒ 标「预印本」，**绝不从相邻论文/提交月份推断**。（2026-07 曾误把 2607.23364、2607.23679 两篇预印本标成 ICML 2026，被用户抓到——记此为戒。）

## Acceptance
- Section I ≤ ~8–9, each ≤ ~150 字, no abstract-paraphrase sentences.
- Each entry's 现象/理论现状/切入点 names concrete mechanisms, not "提出了一种新方法".
- Reading Section I takes ~3–5 min.

See memory `arxiv-brief-redesign` and `user-rl-theorist-empirical-hunt` for full rationale.
