import { fetchArxiv } from "./server.mjs";

const args = new Map();
for (const arg of process.argv.slice(2)) {
  const [key, value = ""] = arg.replace(/^--/, "").split("=");
  args.set(key, value);
}

const days = Number.parseInt(args.get("days") || "7", 10);
const maxResults = Number.parseInt(args.get("max") || "80", 10);
const keywords = (args.get("keywords") || [
  "reinforcement learning",
  "policy gradient",
  "q-learning",
  "actor critic",
  "offline rl",
  "rlhf",
  "reward model",
  "markov decision process"
].join(","))
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const categories = (args.get("categories") || "cs.LG,cs.AI,cs.RO,stat.ML")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

function formatDate(dateString) {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(new Date(dateString));
}

function shortAuthors(authors) {
  return authors.slice(0, 5).join(", ") + (authors.length > 5 ? " et al." : "");
}

let payload;
try {
  payload = await fetchArxiv({ days, maxResults, keywords, categories });
} catch (error) {
  console.log("# arXiv 强化学习论文周报");
  console.log("");
  console.log(`生成失败：${error.message}`);
  if (error.status === 429) {
    console.log("arXiv API 正在限流，可以稍后重试。");
  }
  if (error.searchUrl) {
    console.log(`备用搜索链接：${error.searchUrl}`);
  }
  process.exitCode = 1;
  process.exit();
}

const papers = payload.papers;
const topicCounts = new Map();

for (const paper of papers) {
  for (const topic of paper.topics) {
    topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
  }
}

const topicLine = [...topicCounts.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 8)
  .map(([topic, count]) => `${topic} ${count}`)
  .join(" / ");

const lines = [
  "# arXiv 强化学习论文周报",
  "",
  `时间范围：${formatDate(payload.meta.startDate)} - ${formatDate(payload.meta.endDate)}`,
  `匹配论文：${papers.length} 篇`,
  `主要主题：${topicLine || "暂无"}`,
  "",
  "## 值得优先看",
  ""
];

for (const [index, paper] of papers.slice(0, 12).entries()) {
  lines.push(`${index + 1}. **${paper.title}**`);
  lines.push(`   - 作者：${shortAuthors(paper.authors)}`);
  lines.push(`   - 主题：${paper.topics.join(", ")}；提交：${formatDate(paper.published)}`);
  lines.push(`   - 摘要：${paper.highlight}`);
  lines.push(`   - 链接：${paper.absUrl}`);
  lines.push("");
}

if (!papers.length) {
  lines.push("本周没有匹配到论文。", "");
}

lines.push("## 检索设置");
lines.push(`关键词：${keywords.join(", ")}`);
lines.push(`分类：${categories.join(", ")}`);
lines.push(`生成时间：${formatDate(payload.meta.generatedAt)}`);

console.log(lines.join("\n"));
