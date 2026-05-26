import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");
const dataDir = join(__dirname, "data");
const savedPapersPath = join(dataDir, "saved-papers.json");
const port = Number.parseInt(process.env.PORT || "4173", 10);
const host = process.env.HOST || "127.0.0.1";
const cache = new Map();

export const DEFAULT_KEYWORDS = [
  "reinforcement learning",
  "world model",
  "model-based reinforcement learning",
  "robot learning",
  "exoskeleton",
  "wearable robot",
  "locomotion",
  "offline reinforcement learning",
  "policy gradient",
  "reward model",
  "rlhf"
];

export const DEFAULT_CATEGORIES = ["cs.LG", "cs.AI", "cs.RO", "stat.ML", "eess.SY"];

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".ico": "image/x-icon"
};

function sendJson(res, status, body) {
  const text = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(text);
}

function sendText(res, status, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "content-type": contentType,
    "cache-control": "no-store"
  });
  res.end(body);
}

async function readJsonBody(req, limitBytes = 200_000) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > limitBytes) {
      const error = new Error("Request body is too large.");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  const body = Buffer.concat(chunks).toString("utf8").trim();
  return body ? JSON.parse(body) : {};
}

async function readSavedPaperIds() {
  try {
    const raw = await readFile(savedPapersPath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.savedPapers)
      ? parsed.savedPapers.map(String).filter(Boolean)
      : [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeSavedPaperIds(savedPapers) {
  const ids = [...new Set((savedPapers || []).map(String).map((id) => id.trim()).filter(Boolean))].sort();
  await mkdir(dataDir, { recursive: true });
  await writeFile(savedPapersPath, `${JSON.stringify({ savedPapers: ids }, null, 2)}\n`, "utf8");
  return ids;
}

function parseDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatArxivDate(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}0000`;
}

function formatInputDate(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function xmlDecode(text = "") {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&#x([a-f0-9]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replaceAll("&nbsp;", " ")
    .replaceAll("&ndash;", "-")
    .replaceAll("&mdash;", "-")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'");
}

function stripTags(text = "") {
  return xmlDecode(text.replace(/<[^>]*>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

function getTag(entry, tag) {
  const match = entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? stripTags(match[1]) : "";
}

function getAuthors(entry) {
  const authors = [];
  for (const match of entry.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>\s*<\/author>/gi)) {
    authors.push(stripTags(match[1]));
  }
  return authors;
}

function getCategories(entry) {
  const categories = [];
  for (const match of entry.matchAll(/<category[^>]*term="([^"]+)"/gi)) {
    categories.push(xmlDecode(match[1]));
  }
  return categories;
}

function getLinks(entry) {
  const links = {};
  for (const match of entry.matchAll(/<link([^>]+)>/gi)) {
    const attrs = match[1];
    const href = attrs.match(/href="([^"]+)"/i)?.[1];
    const rel = attrs.match(/rel="([^"]+)"/i)?.[1] || "alternate";
    const title = attrs.match(/title="([^"]+)"/i)?.[1] || "";
    if (!href) continue;
    if (title === "pdf") links.pdf = xmlDecode(href);
    if (rel === "alternate") links.abs = xmlDecode(href);
  }
  return links;
}

function parseArxivFeed(xml) {
  const entries = [];
  for (const match of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)) {
    const entry = match[1];
    const id = getTag(entry, "id");
    const arxivId = id.split("/abs/")[1] || id.split("/").pop() || id;
    const links = getLinks(entry);
    entries.push({
      id: arxivId,
      title: getTag(entry, "title"),
      summary: getTag(entry, "summary"),
      authors: getAuthors(entry),
      categories: getCategories(entry),
      published: getTag(entry, "published"),
      updated: getTag(entry, "updated"),
      absUrl: links.abs || id,
      pdfUrl: links.pdf || id.replace("/abs/", "/pdf/")
    });
  }
  return entries;
}

function parseArxivTotalResults(xml) {
  const total = stripTags(xml.match(/<opensearch:totalResults[^>]*>([\s\S]*?)<\/opensearch:totalResults>/i)?.[1] || "");
  const value = Number.parseInt(total, 10);
  return Number.isFinite(value) ? value : null;
}

function parseWebDate(text, fallbackDate) {
  const cleaned = stripTags(text)
    .replace(/^Submitted\s+/i, "")
    .replace(/;.*$/, "")
    .trim();
  const parsed = parseDate(`${cleaned} UTC`) || parseDate(cleaned);
  return (parsed || fallbackDate).toISOString();
}

function getWebResultChunks(html) {
  const chunks = [];
  for (const match of html.matchAll(/<li class="arxiv-result[^"]*">([\s\S]*?)<\/li>/gi)) {
    chunks.push(match[1]);
  }
  return chunks;
}

function getWebAuthors(chunk) {
  const authorsBlock = chunk.match(/<p class="authors[^"]*">([\s\S]*?)<\/p>/i)?.[1] || "";
  const authors = [...authorsBlock.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => stripTags(match[1]))
    .filter(Boolean);
  if (authors.length) return authors;

  const text = stripTags(authorsBlock).replace(/^Authors:\s*/i, "").trim();
  return text ? text.split(/\s*,\s*/).filter(Boolean) : [];
}

function getWebCategories(chunk) {
  return [...chunk.matchAll(/<span class="tag[^"]*"[^>]*>([\s\S]*?)<\/span>/gi)]
    .map((match) => stripTags(match[1]))
    .filter((tag) => /^(cs|stat|math|eess|q-bio|q-fin|econ|physics|cond-mat|astro-ph|hep-|nucl-)\./.test(tag));
}

function parseArxivSearchPage(html, fallbackDate) {
  return getWebResultChunks(html).map((chunk) => {
    const absUrl = xmlDecode(chunk.match(/href="(https:\/\/arxiv\.org\/abs\/[^"]+)"/i)?.[1] || "");
    const id = absUrl.split("/abs/")[1] || "";
    const title = stripTags(chunk.match(/<p class="title[^"]*">([\s\S]*?)<\/p>/i)?.[1] || "");
    const summaryHtml =
      chunk.match(/<span class="abstract-full[^"]*">([\s\S]*?)<\/span>/i)?.[1] ||
      chunk.match(/<span class="abstract-short[^"]*">([\s\S]*?)<\/span>/i)?.[1] ||
      "";
    const summary = stripTags(summaryHtml)
      .replace(/^Abstract:\s*/i, "")
      .replace(/\s*(△|▽)\s*(Less|More)\s*$/i, "")
      .trim();
    const submittedText = stripTags(chunk.match(/<p class="is-size-7">([\s\S]*?)<\/p>/i)?.[1] || "");

    return {
      id,
      title,
      summary,
      authors: getWebAuthors(chunk),
      categories: getWebCategories(chunk),
      published: parseWebDate(submittedText, fallbackDate),
      updated: parseWebDate(submittedText, fallbackDate),
      absUrl,
      pdfUrl: id ? `https://arxiv.org/pdf/${id}` : ""
    };
  }).filter((paper) => paper.id && paper.title);
}

function getCategoryDateMap(html) {
  const dateByIndex = new Map();
  let currentDate = null;
  const markerPattern = /<h3>([\s\S]*?)<\/h3>|<a name='item(\d+)'>/gi;

  for (const match of html.matchAll(markerPattern)) {
    if (match[1]) {
      currentDate = stripTags(match[1]).replace(/\s*\(.*$/, "").trim();
    } else if (match[2] && currentDate) {
      dateByIndex.set(match[2], currentDate);
    }
  }

  return dateByIndex;
}

function parseCategoryCodes(subjectText) {
  return [...subjectText.matchAll(/\(([a-z-]+\.[A-Z-]+)\)/g)]
    .map((match) => match[1])
    .filter(Boolean);
}

function parseArxivCategoryPage(html, fallbackDate) {
  const dateByIndex = getCategoryDateMap(html);
  const papers = [];
  const pairs = html.matchAll(/<dt>([\s\S]*?)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/gi);

  for (const match of pairs) {
    const dt = match[1];
    const dd = match[2];
    const item = dt.match(/<a name='item(\d+)'>/i)?.[1] || "";
    const id = dt.match(/id="([^"]+)"/i)?.[1] || dt.match(/arXiv:([0-9.]+)/i)?.[1] || "";
    const title = stripTags(dd.match(/<div class='list-title[^']*'>[\s\S]*?<span class='descriptor'>Title:<\/span>([\s\S]*?)<\/div>/i)?.[1] || "");
    const authors = [...(dd.match(/<div class='list-authors'>([\s\S]*?)<\/div>/i)?.[1] || "").matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi)]
      .map((authorMatch) => stripTags(authorMatch[1]))
      .filter(Boolean);
    const subjectsText = stripTags(dd.match(/<div class='list-subjects'>([\s\S]*?)<\/div>/i)?.[1] || "");
    const categories = parseCategoryCodes(subjectsText);
    const comments = stripTags(dd.match(/<div class='list-comments[^']*'>[\s\S]*?<span class='descriptor'>Comments:<\/span>([\s\S]*?)<\/div>/i)?.[1] || "");
    const submitted = dateByIndex.get(item) || "";

    if (!id || !title) continue;

    papers.push({
      id,
      title,
      summary: comments ? `Comments: ${comments}` : "",
      authors,
      categories,
      published: parseWebDate(submitted, fallbackDate),
      updated: parseWebDate(submitted, fallbackDate),
      absUrl: `https://arxiv.org/abs/${id}`,
      pdfUrl: `https://arxiv.org/pdf/${id}`
    });
  }

  return papers;
}

function parseAbstractPage(html, fallback) {
  const summary =
    stripTags(html.match(/<blockquote class="abstract[^"]*">([\s\S]*?)<\/blockquote>/i)?.[1] || "")
      .replace(/^Abstract:\s*/i, "")
      .trim();
  const published = parseWebDate(html.match(/<div class="dateline">([\s\S]*?)<\/div>/i)?.[1] || "", parseDate(fallback.published) || new Date());
  const categories = parseCategoryCodes(stripTags(html.match(/<td class="tablecell subjects">([\s\S]*?)<\/td>/i)?.[1] || ""));

  return {
    ...fallback,
    summary: summary || fallback.summary,
    published: published || fallback.published,
    updated: published || fallback.updated,
    categories: categories.length ? categories : fallback.categories
  };
}

function normalizeText(text = "") {
  return text
    .toLowerCase()
    .replace(/[‐-‒–—―]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function keywordRegex(keyword) {
  const clean = normalizeText(keyword).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!clean) return null;
  return new RegExp(`(^|[^a-z0-9])${clean}([^a-z0-9]|$)`, "g");
}

function countKeywordHits(text, keyword) {
  const regex = keywordRegex(keyword);
  if (!regex) return 0;
  return [...normalizeText(text).matchAll(regex)].length;
}

function keywordScore(paper, keywords) {
  const title = paper.title || "";
  const summary = paper.summary || "";
  const categoryText = paper.categories.join(" ");
  const base = keywords.reduce((score, keyword) => {
    const titleHits = countKeywordHits(title, keyword);
    const abstractHits = countKeywordHits(summary, keyword);
    const categoryHits = countKeywordHits(categoryText, keyword);
    return score + titleHits * 4 + abstractHits * 2 + categoryHits;
  }, 0);
  const text = normalizeText(`${title} ${summary}`);
  const rlContext = [
    "reinforcement learning",
    "rl",
    "policy",
    "reward",
    "markov decision process",
    "mdp",
    "actor-critic",
    "q-learning",
    "control"
  ].some((term) => countKeywordHits(text, term) > 0);
  return base + (rlContext ? 1 : 0);
}

function topicHitScore(text, terms) {
  return terms.reduce((score, term) => score + countKeywordHits(text, term), 0);
}

function classifyPaper(paper) {
  const text = `${paper.title} ${paper.summary}`;
  const topics = [
    ["World Models", ["world model", "world models", "world-modeling", "world modelling", "latent dynamics", "dynamics model", "dynamics models", "model-based reinforcement learning", "model-based rl", "dreamer"]],
    ["Robot Learning", ["robot learning", "robot", "robots", "robotic", "robotics", "manipulation", "sim-to-real", "embodied"]],
    ["Exoskeletons", ["exoskeleton", "exoskeletons", "wearable robot", "wearable robots", "assistive robot", "prosthetic", "prosthetics", "orthosis", "gait assistance"]],
    ["Locomotion", ["locomotion", "legged", "quadruped", "biped", "walking", "gait"]],
    ["Human-Robot Interaction", ["human-robot", "human robot", "human-in-the-loop", "shared autonomy", "teleoperation"]],
    ["Offline RL", ["offline reinforcement learning", "offline rl", "batch reinforcement", "conservative q-learning", "dataset"]],
    ["RLHF / Preference", ["rlhf", "preference optimization", "preference learning", "human feedback", "reward model"]],
    ["Policy Optimization", ["policy gradient", "actor-critic", "ppo", "sac", "policy optimization"]],
    ["Planning & Control", ["planning", "mpc", "optimal control", "trajectory optimization", "model predictive control"]],
    ["Multi-Agent RL", ["multi-agent", "multiagent", "multi agent", "coordination", "opponent"]],
    ["Exploration", ["exploration", "intrinsic reward", "curiosity", "uncertainty"]],
    ["Theory", ["regret", "sample complexity", "convergence", "bellman", "theory"]]
  ];

  const hits = topics
    .map(([topic, keywords]) => ({
      topic,
      score: topicHitScore(text, keywords)
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((item) => item.topic);

  return hits.length ? hits : ["General RL"];
}

function makeHighlight(paper) {
  const summary = paper.summary.replace(/\s+/g, " ").trim();
  const firstSentence = summary.match(/^(.+?[.!?])\s/)?.[1] || summary;
  const trimmed = firstSentence.length > 220 ? `${firstSentence.slice(0, 217).trim()}...` : firstSentence;
  return trimmed || "No abstract summary available.";
}

function enrichPapers(papers, keywords, startDate, endDate) {
  const exclusiveEndDate = addDays(endDate, 1);
  return papers
    .map((paper) => ({
      ...paper,
      score: keywordScore(paper, keywords),
      topics: classifyPaper(paper),
      highlight: makeHighlight(paper)
    }))
    .filter((paper) => {
      const published = parseDate(paper.published);
      const inDateRange = !published || (published >= startDate && published < exclusiveEndDate);
      return inDateRange && paper.score > 0;
    })
    .sort((a, b) => {
      const dateDelta = new Date(b.published).getTime() - new Date(a.published).getTime();
      return dateDelta || b.score - a.score;
    });
}

function buildQuery({ keywords, categories, startDate, endDate }) {
  const keywordParts = keywords.map((keyword) => {
    const clean = keyword.replace(/"/g, "").trim();
    if (!clean) return "";
    const titleTerm = clean.includes(" ") ? `ti:"${clean}"` : `ti:${clean}`;
    const abstractTerm = clean.includes(" ") ? `abs:"${clean}"` : `abs:${clean}`;
    return `(${titleTerm} OR ${abstractTerm})`;
  });
  const categoryParts = categories.map((category) => `cat:${category.trim()}`);
  const datePart = `submittedDate:[${formatArxivDate(startDate)} TO ${formatArxivDate(addDays(endDate, 1))}]`;
  return `(${keywordParts.filter(Boolean).join(" OR ")}) AND (${categoryParts.join(" OR ")}) AND ${datePart}`;
}

function buildSearchUrl({ keywords, startDate, endDate, maxResults }) {
  const webUrl = new URL("https://arxiv.org/search/");
  webUrl.searchParams.set("query", keywords.join(" OR "));
  webUrl.searchParams.set("searchtype", "all");
  webUrl.searchParams.set("abstracts", "show");
  webUrl.searchParams.set("order", "-announced_date_first");
  webUrl.searchParams.set("size", String(Math.min(maxResults, 200)));
  return webUrl.toString();
}

function buildAdvancedSearchUrl({ keywords, startDate, endDate, maxResults }) {
  const webUrl = new URL("https://arxiv.org/search/advanced");
  webUrl.searchParams.set("advanced", "");
  webUrl.searchParams.set("terms-0-operator", "AND");
  webUrl.searchParams.set("terms-0-term", keywords.join(" OR "));
  webUrl.searchParams.set("terms-0-field", "all");
  webUrl.searchParams.set("classification-computer_science", "y");
  webUrl.searchParams.set("classification-statistics", "y");
  webUrl.searchParams.set("date-filter_by", "date_range");
  webUrl.searchParams.set("date-from_date", formatInputDate(startDate));
  webUrl.searchParams.set("date-to_date", formatInputDate(endDate));
  webUrl.searchParams.set("date-date_type", "submitted_date");
  webUrl.searchParams.set("abstracts", "show");
  webUrl.searchParams.set("size", String(Math.min(maxResults, 200)));
  webUrl.searchParams.set("order", "-announced_date_first");
  return webUrl.toString();
}

function categoryToListPath(category) {
  return category;
}

function monthKeysBetween(startDate, endDate) {
  const keys = [];
  const cursor = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1));
  const last = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), 1));

  while (cursor <= last) {
    const year = String(cursor.getUTCFullYear()).slice(2);
    const month = String(cursor.getUTCMonth() + 1).padStart(2, "0");
    keys.push(`${year}${month}`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return keys;
}

function buildCategoryUrls(categories, days, startDate, endDate) {
  const categoryList = [...new Set(categories)].slice(0, 4);
  if (days <= 7) {
    return categoryList.map((category) => `https://arxiv.org/list/${categoryToListPath(category)}/pastweek?show=250`);
  }

  const months = monthKeysBetween(startDate, endDate);
  return categoryList.flatMap((category) => (
    months.map((month) => `https://arxiv.org/list/${categoryToListPath(category)}/${month}?show=2000`)
  ));
}

async function fetchWithRetry(url, options, attempts = 2) {
  let response;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      response = await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
    if (response.status !== 429 || attempt === attempts - 1) return response;

    const retryAfter = Number.parseInt(response.headers.get("retry-after") || "", 10);
    await delay(Number.isFinite(retryAfter) ? retryAfter * 1000 : 3500);
  }
  return response;
}

async function fetchHtml(url, searchUrl, label, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;

  try {
    response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 arxiv-rl-weekly/1.0 (local weekly digest app)",
        "accept": "text/html,application/xhtml+xml"
      }
    });
  } catch (cause) {
    throw makeArxivError(cause.name === "AbortError" ? `${label} request timed out` : cause.message, cause.name === "AbortError" ? 504 : 502, searchUrl, cause);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw makeArxivError(`${label} returned ${response.status} ${response.statusText}`, response.status, searchUrl);
  }

  return response.text();
}

function makeArxivError(message, status, searchUrl, cause) {
  const error = new Error(message);
  error.status = status;
  error.searchUrl = searchUrl;
  error.cause = cause;
  return error;
}

async function fetchApiPapers(apiUrl, searchUrl) {
  let response;
  try {
    response = await fetchWithRetry(apiUrl, {
      headers: {
        "user-agent": "arxiv-rl-weekly/1.0 (local weekly digest app)"
      }
    }, 1);
  } catch (cause) {
    throw makeArxivError(cause.name === "AbortError" ? "arXiv API request timed out" : cause.message, cause.name === "AbortError" ? 504 : 502, searchUrl, cause);
  }

  if (!response.ok) {
    throw makeArxivError(`arXiv API returned ${response.status} ${response.statusText}`, response.status, searchUrl);
  }

  const xml = await response.text();
  return {
    papers: parseArxivFeed(xml),
    totalResults: parseArxivTotalResults(xml)
  };
}

async function fetchWebPapers(searchUrl, fallbackDate) {
  let response;
  try {
    response = await fetchWithRetry(searchUrl, {
      headers: {
        "user-agent": "Mozilla/5.0 arxiv-rl-weekly/1.0 (local weekly digest app)",
        "accept": "text/html,application/xhtml+xml"
      }
    }, 1);
  } catch (cause) {
    throw makeArxivError(cause.name === "AbortError" ? "arXiv search page request timed out" : cause.message, cause.name === "AbortError" ? 504 : 502, searchUrl, cause);
  }

  if (!response.ok) {
    throw makeArxivError(`arXiv search page returned ${response.status} ${response.statusText}`, response.status, searchUrl);
  }

  return {
    papers: parseArxivSearchPage(await response.text(), fallbackDate),
    totalResults: null
  };
}

async function enrichAbstractsFromAbsPages(papers, searchUrl, limit) {
  const head = papers.slice(0, limit);
  const tail = papers.slice(limit);
  const enrichedHead = await Promise.all(head.map(async (paper) => {
    try {
      const html = await fetchHtml(paper.absUrl, searchUrl, "arXiv abstract page", 5000);
      return parseAbstractPage(html, paper);
    } catch {
      return paper;
    }
  }));

  return [...enrichedHead, ...tail];
}

async function fetchCategoryPapers({ categories, keywords, maxResults, searchUrl, fallbackDate, startDate, endDate, days }) {
  const byId = new Map();
  const results = await Promise.allSettled(buildCategoryUrls(categories, days, startDate, endDate).map(async (categoryUrl) => {
    const html = await fetchHtml(categoryUrl, searchUrl, "arXiv category page", 9000);
    return parseArxivCategoryPage(html, fallbackDate);
  }));
  const errors = results
    .filter((result) => result.status === "rejected")
    .map((result) => result.reason.message);

  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    for (const paper of result.value) {
      if (!byId.has(paper.id)) byId.set(paper.id, paper);
    }
  }

  const candidates = enrichPapers([...byId.values()], keywords, startDate, endDate)
    .filter((paper) => paper.score > 0)
    .slice(0, Math.max(maxResults, 25));

  if (!candidates.length && errors.length) {
    throw makeArxivError(errors.join("; "), 502, searchUrl);
  }

  const enriched = await enrichAbstractsFromAbsPages(candidates, searchUrl, Math.min(candidates.length, 12));
  return {
    papers: enriched,
    totalResults: null
  };
}

function buildPayload({ papers, totalResults, apiUrl, searchUrl, startDate, endDate, keywords, categories, source, fallbackReason }) {
  return {
    papers,
    meta: {
      count: papers.length,
      totalResults,
      apiUrl: apiUrl.toString(),
      searchUrl,
      source,
      fallbackReason,
      generatedAt: new Date().toISOString(),
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      keywords,
      categories
    },
    cached: false
  };
}

export async function fetchArxiv({ days, maxResults, keywords, categories }) {
  const today = new Date();
  const endDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const startDate = addDays(endDate, -days);
  const query = buildQuery({ keywords, categories, startDate, endDate });
  const apiUrl = new URL("https://export.arxiv.org/api/query");
  apiUrl.searchParams.set("search_query", query);
  apiUrl.searchParams.set("start", "0");
  apiUrl.searchParams.set("max_results", String(maxResults));
  apiUrl.searchParams.set("sortBy", "submittedDate");
  apiUrl.searchParams.set("sortOrder", "descending");
  const searchUrl = buildSearchUrl({ keywords, startDate, endDate, maxResults });

  const cacheKey = apiUrl.toString();
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.time < 15 * 60 * 1000) {
    return { ...cached.payload, cached: true };
  }

  let papers;
  let totalResults = null;
  let source = "arxiv-api";
  let fallbackReason = "";

  try {
    const result = await fetchApiPapers(apiUrl, searchUrl);
    papers = result.papers;
    totalResults = result.totalResults;
  } catch (apiError) {
    source = "arxiv-search";
    fallbackReason = apiError.message;
    try {
      const result = await fetchWebPapers(searchUrl, endDate);
      papers = result.papers;
      totalResults = result.totalResults;
    } catch (webError) {
      fallbackReason = `${fallbackReason}; search fallback failed: ${webError.message}`;
      source = "arxiv-category";
      try {
        const result = await fetchCategoryPapers({ categories, keywords, maxResults, searchUrl, fallbackDate: endDate, startDate, endDate, days });
        papers = result.papers;
        totalResults = result.totalResults;
      } catch (categoryError) {
        throw makeArxivError(`${apiError.message}; fallback also failed: ${webError.message}; category fallback also failed: ${categoryError.message}`, categoryError.status || webError.status || apiError.status || 502, searchUrl, categoryError);
      }
    }
  }

  const payload = buildPayload({
    papers: enrichPapers(papers, keywords, startDate, endDate).slice(0, maxResults),
    totalResults,
    apiUrl,
    searchUrl,
    startDate,
    endDate,
    keywords,
    categories,
    source,
    fallbackReason
  });
  cache.set(cacheKey, { time: Date.now(), payload });
  return payload;
}

async function serveStatic(req, res, pathname) {
  const safePath = normalize(pathname === "/" ? "/index.html" : pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicDir, safePath);
  if (!filePath.startsWith(publicDir)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  try {
    const file = await readFile(filePath);
    const contentType = MIME_TYPES[extname(filePath)] || "application/octet-stream";
    res.writeHead(200, {
      "content-type": contentType,
      "cache-control": "no-cache"
    });
    res.end(file);
  } catch (error) {
    if (error.code === "ENOENT") {
      sendText(res, 404, "Not found");
    } else {
      sendText(res, 500, "Could not read file");
    }
  }
}

export const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/api/saved") {
    try {
      if (req.method === "GET") {
        sendJson(res, 200, { savedPapers: await readSavedPaperIds() });
        return;
      }

      if (req.method === "PUT") {
        const body = await readJsonBody(req);
        sendJson(res, 200, { savedPapers: await writeSavedPaperIds(body.savedPapers) });
        return;
      }

      sendJson(res, 405, { error: "Method not allowed." });
    } catch (error) {
      sendJson(res, error.status || 500, {
        error: "Could not update saved papers.",
        detail: error.message
      });
    }
    return;
  }

  if (url.pathname === "/api/papers") {
    const days = Math.min(Math.max(Number.parseInt(url.searchParams.get("days") || "7", 10), 1), 60);
    const maxResults = Math.min(Math.max(Number.parseInt(url.searchParams.get("max") || "80", 10), 5), 200);
    const keywords = (url.searchParams.get("keywords") || DEFAULT_KEYWORDS.join(","))
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const categories = (url.searchParams.get("categories") || DEFAULT_CATEGORIES.join(","))
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    try {
      sendJson(res, 200, await fetchArxiv({ days, maxResults, keywords, categories }));
    } catch (error) {
      sendJson(res, 502, {
        error: "Could not fetch arXiv papers.",
        detail: error.message,
        status: error.status || 502,
        searchUrl: error.searchUrl
      });
    }
    return;
  }

  await serveStatic(req, res, decodeURIComponent(url.pathname));
});

if (import.meta.url === `file://${process.argv[1]}`) {
  server.listen(port, host, () => {
    console.log(`arXiv RL Weekly is running at http://${host}:${port}`);
  });
}
