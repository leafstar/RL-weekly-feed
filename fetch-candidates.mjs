// Fetch RL "phenomenon-signal" candidates from arXiv — DUAL QUOTA (筛选补丁 v1 · ①).
// Stream (a) classic-RL = first-class; stream (b) LLM-RL = capped to <= half.
// Phenomenon-signal words match title+abstract. No LLM/scoring — Claude does ②/⑤ in-session
// (see .claude/skills/monthly-brief).
//   node fetch-candidates.mjs [--max=150] [--since=YYYY-MM-DD]
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1] ?? d;
const maxResults = Number.parseInt(arg("max", "150"), 10);
const since = arg("since", "");

const PHENO = ["rethinking", "revisiting", "surprising", "counterintuitive", "paradox", "phenomenon", "illusion", "pitfall", "myth", "demystify", "mirage"];
const CATS = ["cs.LG", "cs.AI", "stat.ML", "cs.DC"];
// (a) classic RL — first-class stream
const CLASSIC = ['abs:"temporal difference"', 'abs:"actor-critic"', 'abs:"policy gradient"', 'abs:"off-policy"', 'abs:"function approximation"', 'abs:"value estimation"', 'abs:"stochastic approximation"', "abs:exploration"];
// (b) LLM-RL — capped stream
const LLM = ["abs:RLVR", "abs:RLHF", 'abs:"policy optimization"'];

const phenoClause = "(" + PHENO.flatMap((w) => [`ti:${w}`, `abs:${w}`]).join(" OR ") + ")";
const strip = (s) => (s || "")
  .replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, " ").trim();
const tag = (e, t) => strip((e.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`, "i")) || [])[1]);

async function fetchStream(topic, max, stream) {
  const q = `(${CATS.map((c) => `cat:${c}`).join(" OR ")}) AND (${topic.join(" OR ")}) AND ${phenoClause}`;
  const url = `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(q)}&start=0&max_results=${max}&sortBy=submittedDate&sortOrder=descending`;
  const res = await fetch(url, { headers: { "user-agent": "arxiv-rl-brief/1.0 (monthly digest)" } });
  if (!res.ok) { console.error(`${stream}: arXiv ${res.status} ${res.statusText}`); return []; }
  const xml = await res.text();
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => m[1]).map((e) => {
    const idRaw = tag(e, "id");
    return {
      id: idRaw.split("/abs/")[1] || idRaw, stream,
      title: tag(e, "title"), published: tag(e, "published").slice(0, 10),
      authors: [...e.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>/g)].map((a) => strip(a[1])),
      comment: tag(e, "arxiv:comment"), summary: tag(e, "summary"),
    };
  });
}

const classic = await fetchStream(CLASSIC, maxResults, "classic-rl");
const llm = await fetchStream(LLM, Math.floor(maxResults / 2), "llm-rl");

const byId = new Map();
for (const p of classic) byId.set(p.id, p);      // classic wins on dedupe
for (const p of llm) if (!byId.has(p.id)) byId.set(p.id, p);
let papers = [...byId.values()];
if (since) papers = papers.filter((p) => p.published >= since);
papers.sort((a, b) => (a.published < b.published ? 1 : -1));

const stamp = new Date().toISOString().slice(0, 10);
const out = join(__dirname, "data", "briefs", `candidates-${stamp}.json`);
await writeFile(out, JSON.stringify({ classicQuery: CLASSIC, llmQuery: LLM, phenoClause, fetchedAt: new Date().toISOString(), counts: { classic: classic.length, llm: llm.length, merged: papers.length }, papers }, null, 2), "utf8");
console.log(`wrote ${out} — classic ${classic.length} + llm ${llm.length} → ${papers.length} merged (newest ${papers[0]?.published ?? "n/a"})`);
