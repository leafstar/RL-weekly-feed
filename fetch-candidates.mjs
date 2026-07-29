// Fetch the RL "phenomenon-signal" candidate pool from arXiv (no LLM, no scoring).
// Claude reads the output in-session and does the scoring / 精读 / selection.
//   node fetch-candidates.mjs                 # newest ~120 phenomenon-signal RL papers
//   node fetch-candidates.mjs --max=200 --since=2026-06-01
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1] ?? d;
const maxResults = Number.parseInt(arg("max", "120"), 10);
const since = arg("since", ""); // optional YYYY-MM-DD lower bound on published date

const PHENO = ["rethinking", "revisiting", "surprising", "counterintuitive", "paradox", "phenomenon", "illusion", "pitfall", "myth", "demystify", "mirage"];
const CATS = ["cs.LG", "cs.AI", "stat.ML"];
const RL = ['abs:"reinforcement learning"', "abs:RLHF", "abs:RLVR", 'abs:"policy optimization"'];

const query = `(${CATS.map((c) => `cat:${c}`).join(" OR ")}) AND (${RL.join(" OR ")}) AND (${PHENO.map((w) => `ti:${w}`).join(" OR ")})`;
const url = `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(query)}&start=0&max_results=${maxResults}&sortBy=submittedDate&sortOrder=descending`;

const strip = (s) => (s || "")
  .replace(/<[^>]*>/g, "")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/\s+/g, " ").trim();
const tag = (entry, t) => strip((entry.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`, "i")) || [])[1]);

const res = await fetch(url, { headers: { "user-agent": "arxiv-rl-brief/1.0 (monthly digest)" } });
if (!res.ok) {
  console.error(`arXiv API returned ${res.status} ${res.statusText}`);
  process.exit(1);
}
const xml = await res.text();
const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => m[1]);

let papers = entries.map((e) => {
  const idRaw = tag(e, "id");
  return {
    id: idRaw.split("/abs/")[1] || idRaw,
    title: tag(e, "title"),
    published: tag(e, "published").slice(0, 10),
    authors: [...e.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>/g)].map((a) => strip(a[1])),
    comment: tag(e, "arxiv:comment"),
    summary: tag(e, "summary"),
  };
});
if (since) papers = papers.filter((p) => p.published >= since);

const stamp = new Date().toISOString().slice(0, 10);
const out = join(__dirname, "data", "briefs", `candidates-${stamp}.json`);
await writeFile(out, JSON.stringify({ query, fetchedAt: new Date().toISOString(), count: papers.length, papers }, null, 2), "utf8");
console.log(`wrote ${out} — ${papers.length} papers (newest ${papers[0]?.published ?? "n/a"})`);
