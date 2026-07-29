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

## Acceptance
- Section I ≤ ~8–9, each ≤ ~150 字, no abstract-paraphrase sentences.
- Each entry's 现象/理论现状/切入点 names concrete mechanisms, not "提出了一种新方法".
- Reading Section I takes ~3–5 min.

See memory `arxiv-brief-redesign` and `user-rl-theorist-empirical-hunt` for full rationale.
