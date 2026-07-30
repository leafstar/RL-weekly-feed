// Render self-contained brief HTML from data/briefs/<month>.json using brief.template.html.
// The template is any previously-rendered brief page; we swap its inline JSON data block.
//   node brief-render.mjs                 # render every data/briefs/*.json + index.html
//   node brief-render.mjs --month=2026-07 # render one month
// No network, no LLM — pure templating.
import { readFile, writeFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const briefsDir = join(__dirname, "data", "briefs");
const templatePath = join(__dirname, "brief.template.html");

const DATA_RE = /<script type="application\/json" id="brief-data">[\s\S]*?<\/script>/;
const TITLE_RE = /<title>[\s\S]*?<\/title>/;

async function renderMonth(template, month) {
  const json = (await readFile(join(briefsDir, `${month}.json`), "utf8")).trim();
  const data = JSON.parse(json); // throws early on malformed data
  const block = `<script type="application/json" id="brief-data">\n${json}\n</script>`;
  // Use function replacers so `$` sequences in the JSON/title are inserted literally.
  let html = template.replace(DATA_RE, () => block);
  html = html.replace(TITLE_RE, () => `<title>${data.title || `RL 简报 · ${month}`}</title>`);
  if (!DATA_RE.test(template)) throw new Error("template is missing the brief-data script block");
  await writeFile(join(briefsDir, `${month}.html`), html, "utf8");
  console.log(`rendered ${month}.html`);
}

async function buildIndex() {
  const files = await readdir(briefsDir);
  const months = files
    .filter((f) => /^\d{4}-\d{2}\.html$/.test(f))
    .map((f) => f.replace(".html", ""))
    .sort()
    .reverse();
  const items = months.map((m) => `      <li><a href="./data/briefs/${m}.html">${m}</a></li>`).join("\n");
  const html = `<!doctype html>
<html lang="zh"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>RL 简报 · 目录</title>
<style>
  body{font-family:"Archivo Narrow","Arial Narrow",ui-sans-serif,system-ui,sans-serif;background:#fff8f7;color:#251818;margin:0;padding:44px}
  h1{font-family:Georgia,"Times New Roman",serif;font-weight:900;font-size:clamp(28px,4vw,46px)}
  ul{list-style:none;padding:0;max-width:560px}
  li{border:3px solid #201615;background:#fff;box-shadow:5px 5px 0 0 #201615;margin:0 0 14px}
  li a{display:block;padding:14px 18px;font-size:22px;color:#ae2f34;text-decoration:none}
  li a:hover{background:#ff6b6b;color:#fff}
</style></head>
<body><h1>RL 实验现象 · 月度简报</h1><ul>
${items}
</ul></body></html>`;
  await writeFile(join(__dirname, "index.html"), html, "utf8");
  console.log(`rendered root index.html (${months.length} months)`);
}

const template = await readFile(templatePath, "utf8");
const arg = process.argv.find((a) => a.startsWith("--month="));
let months;
if (arg) {
  months = [arg.split("=")[1]];
} else {
  const files = await readdir(briefsDir);
  months = files.filter((f) => /^\d{4}-\d{2}\.json$/.test(f)).map((f) => f.replace(".json", ""));
}
for (const m of months) await renderMonth(template, m);
await buildIndex();
