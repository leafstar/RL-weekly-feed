---
name: paper-read
description: Deep-read one paper into an anchored "skeleton" page (每点回指原文的章节/图/公式) so the user can cross-check fast. Use when the user says 精读/deep-read a specific paper, or clicks to read one from the RL brief.
---

# Paper deep-read → anchored skeleton

Goal: turn one paper into a scannable skeleton where **every point links back to the exact spot in the source**, so a theory reader skims the skeleton and clicks →原文 only where they want to verify. Output a page styled like the briefs.

Run from repo root: `/Users/muxingwang/Documents/Codex/2026-05-25/arxiv-app`.

## Steps
1. **Resolve** the arXiv id (from the user, or search title on arXiv/OpenAlex).
2. **Check HTML availability**: fetch `https://arxiv.org/html/<id>`. If the page says "No HTML for '<id>'" → **PDF fallback**: set `srcHtml:""`, anchor via PDF page fragments `#page=N` (`srcPdf` + `frag:"#page=6"`), and put §/Fig/Eq numbers in `loc`. Otherwise use the HTML.
3. **Extract REAL anchors** from the HTML (don't guess): sections `S1`,`S3.SS2`; equations `S3.E1`; figures `S5.F6`; tables `S3.T1`. (In-browser: query `section[id]`, `figure[id]`, `[id]` matching `\.E\d+`, and theorem/def/assumption ids.) Read the actual prose to state claims correctly and to pick short Ctrl-F keywords.
4. **Build the skeleton** (adaptive to paper type). Default blocks: 现象/hook · 设定&定义 · 证据/普遍性 · 被否的解释(消融) · 核心主张/机制 · 佐证&干预 · 局限 · **对你的理论切入点**. **For theory papers, add prominent blocks for 关键定义 / 假设(Assumptions) / 主定理(Thm N)** and anchor each to its Def/Assumption/Thm id — that's what a theory reader checks first. Each node in your own words; the last "切入点" block is marked `mine:true` + `tag:"简报观点（非论文原文）"` to separate speculation from paper facts.
5. **Copyright**: the pointing mechanism is the clickable anchor + section/figure/eq NUMBER (navigational, not reproduction). `kw` (Ctrl-F key) must be a **short 2–5 word phrase**, not a reproduced sentence. Never paste paragraphs of the paper.
6. **Write** `data/briefs/read-<id>.json` matching the schema of `data/briefs/read-2605.16787.json` exactly (id, title, authors, venue, briefMonth, srcAbs/srcPdf/srcHtml, hook, blocks[{h,nodes[{claim(html), loc, anchors[{label,frag}], kw, mine, tag}]}]).
7. If the paper is in a brief, set `"hasRead": true` on its Section-I entry in that month's JSON (adds the 📖 精读 button).
8. **Render**: `node brief-render.mjs` (renders every `read-*.json` → `read-<id>.html` via `read.template.html`, and regenerates the briefs + root index). If `node` is unavailable, swap the `<script id="read-data">` block of `read.template.html` with the JSON via python3 (see the brief pipeline).
9. Commit + push if the user wants it on Pages: `read-<id>.{json,html}` + the updated month JSON/HTML.

## Acceptance
- Every node has either a working →原文 anchor or a precise §/Fig/Eq locator.
- HTML anchors actually resolve (verify one, e.g. navigate to `…/html/<id>#S5.SS1` and confirm the heading lands at top).
- No full-sentence quotes; `kw` short.
- The 切入点 block is visibly separated as your view, not the paper's.

See memory `arxiv-brief-redesign` and `user-rl-theorist-empirical-hunt`.
