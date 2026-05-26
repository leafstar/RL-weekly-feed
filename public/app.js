const keywordBank = [
  "reinforcement learning",
  "world model",
  "model-based reinforcement learning",
  "robot learning",
  "exoskeleton",
  "wearable robot",
  "locomotion",
  "human-robot interaction",
  "sim-to-real",
  "offline reinforcement learning",
  "policy gradient",
  "reward model",
  "rlhf",
  "preference optimization"
];

const defaultSelectedKeywords = new Set([
  "reinforcement learning",
  "world model",
  "model-based reinforcement learning",
  "robot learning",
  "exoskeleton",
  "wearable robot",
  "locomotion",
  "offline reinforcement learning",
  "policy gradient",
  "reward model"
]);

const state = {
  papers: [],
  saved: new Set(JSON.parse(localStorage.getItem("savedPapers") || "[]")),
  selectedKeywords: new Set(JSON.parse(localStorage.getItem("selectedKeywords") || "null") || [...defaultSelectedKeywords]),
  savedOnly: false,
  meta: null
};

const els = {
  refreshButton: document.querySelector("#refreshButton"),
  copyDigestButton: document.querySelector("#copyDigestButton"),
  daysSelect: document.querySelector("#daysSelect"),
  maxSelect: document.querySelector("#maxSelect"),
  activeKeywordChips: document.querySelector("#activeKeywordChips"),
  suggestedKeywordChips: document.querySelector("#suggestedKeywordChips"),
  keywordInput: document.querySelector("#keywordInput"),
  addKeywordButton: document.querySelector("#addKeywordButton"),
  topicSelect: document.querySelector("#topicSelect"),
  sortSelect: document.querySelector("#sortSelect"),
  paperCount: document.querySelector("#paperCount"),
  savedCount: document.querySelector("#savedCount"),
  generatedAt: document.querySelector("#generatedAt"),
  systemBannerText: document.querySelector("#systemBannerText"),
  sourceNotice: document.querySelector("#sourceNotice"),
  digestOutput: document.querySelector("#digestOutput"),
  savedOnlyButton: document.querySelector("#savedOnlyButton"),
  status: document.querySelector("#status"),
  paperList: document.querySelector("#paperList"),
  template: document.querySelector("#paperTemplate")
};

function saveSavedPapers() {
  localStorage.setItem("savedPapers", JSON.stringify([...state.saved]));
}

async function loadSavedPapers() {
  try {
    const response = await fetch("/api/saved");
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.detail || payload.error || "读取收藏失败");
    const persisted = Array.isArray(payload.savedPapers) ? payload.savedPapers : [];
    const local = JSON.parse(localStorage.getItem("savedPapers") || "[]");
    state.saved = new Set([...persisted, ...local]);
    saveSavedPapers();
    if (local.length && !persisted.length) await persistSavedPapers();
  } catch (error) {
    console.warn("Could not load saved papers from local file.", error);
  }
}

async function persistSavedPapers() {
  const response = await fetch("/api/saved", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ savedPapers: [...state.saved] })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.detail || payload.error || "保存收藏失败");
  state.saved = new Set(payload.savedPapers || []);
  saveSavedPapers();
}

function saveSelectedKeywords() {
  localStorage.setItem("selectedKeywords", JSON.stringify([...state.selectedKeywords]));
}

function getSelectedKeywords() {
  return [...state.selectedKeywords].map((keyword) => keyword.trim()).filter(Boolean);
}

function addKeyword(keyword) {
  const clean = keyword.trim();
  if (!clean) return false;
  state.selectedKeywords.add(clean);
  saveSelectedKeywords();
  renderKeywordChips();
  return true;
}

function renderKeywordChips() {
  const activeKeywords = getSelectedKeywords();
  const suggestedKeywords = keywordBank.filter((keyword) => !state.selectedKeywords.has(keyword));
  els.activeKeywordChips.innerHTML = "";
  els.suggestedKeywordChips.innerHTML = "";

  for (const keyword of activeKeywords) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "keyword-chip active";
    chip.setAttribute("aria-label", `移除关键词 ${keyword}`);
    chip.textContent = `${keyword} ×`;
    chip.disabled = activeKeywords.length === 1;
    chip.addEventListener("click", () => {
      if (state.selectedKeywords.size === 1) return;
      state.selectedKeywords.delete(keyword);
      saveSelectedKeywords();
      renderKeywordChips();
      loadPapers();
    });
    els.activeKeywordChips.append(chip);
  }

  for (const keyword of suggestedKeywords) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "keyword-chip suggested";
    chip.setAttribute("aria-label", `添加关键词 ${keyword}`);
    chip.textContent = `${keyword} +`;
    chip.addEventListener("click", () => {
      state.selectedKeywords.add(keyword);
      saveSelectedKeywords();
      renderKeywordChips();
      loadPapers();
    });
    els.suggestedKeywordChips.append(chip);
  }
}

function formatDate(dateString) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric"
  }).format(new Date(dateString));
}

function formatTimestamp(dateString) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(dateString));
}

function getAllTopics() {
  return [...new Set(state.papers.flatMap((paper) => paper.topics))].sort((a, b) => a.localeCompare(b));
}

function updateTopicOptions() {
  const currentValue = els.topicSelect.value;
  const topics = getAllTopics();
  els.topicSelect.innerHTML = '<option value="all">全部主题</option>';
  for (const topic of topics) {
    const option = document.createElement("option");
    option.value = topic;
    option.textContent = topic;
    els.topicSelect.append(option);
  }
  els.topicSelect.value = topics.includes(currentValue) ? currentValue : "all";
}

function getFilteredPapers() {
  const topic = els.topicSelect.value;
  const papers = state.papers
    .filter((paper) => !state.savedOnly || state.saved.has(paper.id))
    .filter((paper) => topic === "all" || paper.topics.includes(topic));

  if (els.sortSelect.value === "score") {
    return papers.toSorted((a, b) => b.score - a.score || new Date(b.published) - new Date(a.published));
  }

  if (els.sortSelect.value === "saved") {
    return papers.toSorted((a, b) => {
      const savedDelta = Number(state.saved.has(b.id)) - Number(state.saved.has(a.id));
      return savedDelta || new Date(b.published) - new Date(a.published);
    });
  }

  return papers.toSorted((a, b) => new Date(b.published) - new Date(a.published));
}

function buildDigest(papers) {
  const meta = state.meta;
  if (!meta) return "";

  const start = new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(new Date(meta.startDate));
  const end = new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(new Date(meta.endDate));
  const savedPapers = papers.filter((paper) => state.saved.has(paper.id));
  const topPapers = (savedPapers.length ? savedPapers : papers).slice(0, 12);
  const topicCounts = new Map();
  for (const paper of papers) {
    for (const topic of paper.topics) {
      topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
    }
  }

  const topicLine = [...topicCounts.entries()]
    .toSorted((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([topic, count]) => `${topic} ${count}`)
    .join(" / ");

  const lines = [
    `# arXiv 强化学习论文周报`,
    ``,
    `时间范围：${start} - ${end}`,
    `匹配论文：${meta.totalResults ?? papers.length} 篇`,
    `当前显示：${papers.length} 篇`,
    `主要主题：${topicLine || "暂无"}`,
    ``,
    `## 值得优先看`,
    ``
  ];

  if (!topPapers.length) {
    lines.push(`本周没有匹配到论文。`);
  }

  for (const [index, paper] of topPapers.entries()) {
    lines.push(`${index + 1}. **${paper.title}**`);
    lines.push(`   - 作者：${paper.authors.slice(0, 5).join(", ")}${paper.authors.length > 5 ? " et al." : ""}`);
    lines.push(`   - 主题：${paper.topics.join(", ")}；提交：${formatDate(paper.published)}`);
    lines.push(`   - 摘要：${paper.highlight}`);
    lines.push(`   - 链接：${paper.absUrl}`);
    lines.push(``);
  }

  lines.push(`## 检索设置`);
  lines.push(`关键词：${meta.keywords.join(", ")}`);
  lines.push(`分类：${meta.categories.join(", ")}`);
  lines.push(`生成时间：${formatTimestamp(meta.generatedAt)}`);
  return lines.join("\n");
}

function renderSummary(papers) {
  const total = state.meta?.totalResults;
  els.paperCount.textContent = total && total > papers.length ? `${papers.length}/${total}` : String(papers.length);
  els.savedCount.textContent = String(state.saved.size);
  els.generatedAt.textContent = state.meta ? formatTimestamp(state.meta.generatedAt) : "--";
  els.systemBannerText.textContent = state.meta
    ? `System status: ${els.paperCount.textContent} RL entries analyzed. ${state.saved.size} saved. Source: ${state.meta.source}.`
    : "System status: waiting for arXiv sync.";
  renderSourceNotice();
  els.digestOutput.value = buildDigest(papers);
  els.savedOnlyButton.textContent = state.savedOnly ? "显示全部" : "只看收藏";
}

function renderSourceNotice() {
  if (!state.meta) {
    els.sourceNotice.hidden = true;
    els.sourceNotice.textContent = "";
    els.sourceNotice.className = "source-notice";
    return;
  }

  if (state.meta.source === "arxiv-api") {
    els.sourceNotice.hidden = true;
    els.sourceNotice.textContent = "";
    els.sourceNotice.className = "source-notice";
    return;
  }

  els.sourceNotice.hidden = false;
  els.sourceNotice.className = "source-notice warning";
  const sourceLabel = state.meta.source === "arxiv-category" ? "分类列表备用源" : "搜索页备用源";
  els.sourceNotice.textContent = `当前使用 ${sourceLabel}，arXiv API 暂时不可用；结果会更保守，但仍可复制周报。`;
}

function renderPapers() {
  const papers = getFilteredPapers();
  els.paperList.innerHTML = "";

  if (!papers.length) {
    els.status.textContent = state.papers.length ? "当前筛选下没有论文。" : "没有匹配到论文。";
    els.status.className = "status visible";
    renderSummary(papers);
    return;
  }

  els.status.className = "status";
  for (const paper of papers) {
    const node = els.template.content.firstElementChild.cloneNode(true);
    const isSaved = state.saved.has(paper.id);
    node.classList.toggle("saved", isSaved);
    node.querySelector(".date").textContent = formatDate(paper.published);
    node.querySelector(".score").textContent = `相关度 ${paper.score}`;
    node.querySelector(".title").textContent = paper.title;
    node.querySelector(".authors").textContent = paper.authors.slice(0, 8).join(", ") + (paper.authors.length > 8 ? " et al." : "");
    const abstract = node.querySelector(".abstract");
    const abstractToggle = node.querySelector(".abstract-toggle");
    abstract.textContent = paper.summary?.replace(/\s+/g, " ").trim() || paper.highlight;
    abstractToggle.setAttribute("aria-expanded", "false");
    abstractToggle.setAttribute("aria-label", `展开完整摘要：${paper.title}`);
    abstractToggle.addEventListener("click", () => {
      const expanded = node.classList.toggle("abstract-expanded");
      abstractToggle.textContent = expanded ? "收起摘要" : "展开摘要";
      abstractToggle.setAttribute("aria-expanded", String(expanded));
      abstractToggle.setAttribute("aria-label", `${expanded ? "收起" : "展开"}完整摘要：${paper.title}`);
    });
    node.querySelector(".abs-link").href = paper.absUrl;
    node.querySelector(".pdf-link").href = paper.pdfUrl;
    node.querySelector(".save-button").textContent = isSaved ? "★ 已收藏" : "☆ 收藏";

    const topics = node.querySelector(".topics");
    for (const topic of paper.topics) {
      const pill = document.createElement("span");
      pill.className = "topic-pill";
      pill.textContent = topic;
      topics.append(pill);
    }

    node.querySelector(".save-button").addEventListener("click", async () => {
      const wasSaved = state.saved.has(paper.id);
      if (state.saved.has(paper.id)) {
        state.saved.delete(paper.id);
      } else {
        state.saved.add(paper.id);
      }
      saveSavedPapers();
      renderPapers();
      try {
        await persistSavedPapers();
        renderPapers();
      } catch (error) {
        if (wasSaved) {
          state.saved.add(paper.id);
        } else {
          state.saved.delete(paper.id);
        }
        saveSavedPapers();
        renderPapers();
        els.status.textContent = `保存收藏失败：${error.message}`;
        els.status.className = "status visible error";
      }
    });

    els.paperList.append(node);
  }

  renderSummary(papers);
}

async function loadPapers() {
  const params = new URLSearchParams({
    days: els.daysSelect.value,
    max: els.maxSelect.value,
    keywords: getSelectedKeywords().join(",")
  });

  els.status.textContent = "正在载入 arXiv 论文...";
  els.status.className = "status visible";
  els.refreshButton.disabled = true;

  try {
    const response = await fetch(`/api/papers?${params}`);
    const payload = await response.json();
    if (!response.ok) {
      const error = new Error(payload.detail || payload.error || "请求失败");
      error.searchUrl = payload.searchUrl;
      error.status = payload.status;
      throw error;
    }
    state.papers = payload.papers;
    state.meta = payload.meta;
    updateTopicOptions();
    renderPapers();
  } catch (error) {
    els.status.innerHTML = "";
    const message = document.createElement("span");
    message.textContent = error.status === 429
      ? "arXiv 现在正在限流。可以稍等几分钟后刷新，或先打开同样条件的 arXiv 搜索。"
      : `载入失败：${error.message}`;
    els.status.append(message);
    if (error.searchUrl) {
      els.status.append(" ");
      const link = document.createElement("a");
      link.href = error.searchUrl;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = "打开 arXiv 搜索";
      els.status.append(link);
    }
    els.status.className = "status visible error";
    state.papers = [];
    state.meta = null;
    renderSummary([]);
  } finally {
    els.refreshButton.disabled = false;
  }
}

async function copyDigest() {
  const text = els.digestOutput.value;
  if (!text.trim()) return;
  await navigator.clipboard.writeText(text);
  const previous = els.copyDigestButton.textContent;
  els.copyDigestButton.textContent = "已复制";
  window.setTimeout(() => {
    els.copyDigestButton.textContent = previous;
  }, 1400);
}

els.refreshButton.addEventListener("click", loadPapers);
els.copyDigestButton.addEventListener("click", copyDigest);
els.daysSelect.addEventListener("change", loadPapers);
els.maxSelect.addEventListener("change", loadPapers);
els.addKeywordButton.addEventListener("click", () => {
  if (addKeyword(els.keywordInput.value)) {
    els.keywordInput.value = "";
    loadPapers();
  }
});
els.keywordInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  if (addKeyword(els.keywordInput.value)) {
    els.keywordInput.value = "";
    loadPapers();
  }
});
els.topicSelect.addEventListener("change", renderPapers);
els.sortSelect.addEventListener("change", renderPapers);
els.savedOnlyButton.addEventListener("click", () => {
  state.savedOnly = !state.savedOnly;
  renderPapers();
});

renderKeywordChips();
await loadSavedPapers();
loadPapers();
