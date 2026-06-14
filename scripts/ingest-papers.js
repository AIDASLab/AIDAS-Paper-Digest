#!/usr/bin/env node

const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "papers", "papers.json");
const X_OUT_FILE = path.join(ROOT, "papers", "twitter-feed.json");

const CATEGORIES = [
  "Language Modeling",
  "Frontier Training",
  "Vision/Multimodal",
  "Serving",
  "Data / Retrieval",
  "Benchmark",
  "Robotics",
];

const CATEGORY_PRIORITY = [
  "Serving",
  "Data / Retrieval",
  "Robotics",
  "Vision/Multimodal",
  "Benchmark",
  "Frontier Training",
  "Language Modeling",
];

const SOURCE_QUERIES = [
  "large language model reasoning reinforcement learning",
  "diffusion language model autoregressive language model",
  "frontier model technical report LLM VLM VLA world model",
  "vision language model multimodal 3D 4D Gaussian Splatting point cloud",
  "LLM serving KV cache sparse attention quantization compression inference",
  "retrieval augmented generation knowledge graph ontology vector database GraphRAG",
  "robotics VLA embodied AI manipulation navigation world model",
  "benchmark evaluation agent language model multimodal",
];

const PWC_QUERIES = [
  "language model",
  "reasoning",
  "diffusion",
  "frontier",
  "multimodal",
  "vision language",
  "gaussian splatting",
  "point cloud",
  "kv cache",
  "sparse attention",
  "quantization",
  "retrieval",
  "knowledge graph",
  "ontology",
  "robotics",
  "vla",
  "world model",
  "benchmark",
];

const ARXIV_QUERIES = [
  'cat:cs.CL AND (LLM OR "language model" OR reasoning OR reinforcement)',
  'cat:cs.LG AND ("diffusion language" OR "autoregressive" OR "post-training")',
  'cat:cs.AI AND ("technical report" OR "frontier" OR "world model")',
  'cat:cs.CV AND ("vision-language" OR multimodal OR "Gaussian Splatting" OR "point cloud" OR "3D")',
  'cat:cs.DC AND ("KV cache" OR serving OR inference OR compression OR quantization)',
  'cat:cs.IR AND (RAG OR retrieval OR "knowledge graph" OR ontology OR "vector database")',
  'cat:cs.RO AND (robot OR robotics OR manipulation OR navigation OR embodied)',
];

const CATEGORY_RULES = [
  {
    category: "Serving",
    terms: [
      "serving",
      "inference",
      "kv cache",
      "kv-cache",
      "pagedattention",
      "sparse attention",
      "speculative decoding",
      "quantization",
      "compression",
      "throughput",
      "prefill",
      "decode",
      "latency",
      "vllm",
      "sglang",
      "tensorrt",
    ],
  },
  {
    category: "Data / Retrieval",
    terms: [
      "retrieval",
      "rag",
      "graphrag",
      "knowledge graph",
      "ontology",
      "vector database",
      "indexing",
      "semantic cache",
      "database",
      "corpus",
      "data curation",
      "data mixture",
    ],
  },
  {
    category: "Robotics",
    terms: [
      "robot",
      "robotics",
      "manipulation",
      "embodied",
      "navigation",
      "vla",
      "physical ai",
      "drone",
      "uav",
      "dexterous",
      "locomotion",
    ],
  },
  {
    category: "Vision/Multimodal",
    terms: [
      "vision",
      "vlm",
      "mllm",
      "multimodal",
      "image",
      "video",
      "speech",
      "audio",
      "3d",
      "4d",
      "point cloud",
      "gaussian splatting",
      "visual",
      "segmentation",
      "object detection",
      "text-to-image",
      "text-to-video",
    ],
  },
  {
    category: "Benchmark",
    terms: [
      "benchmark",
      "leaderboard",
      "suite",
      "arena",
      "challenge",
      "testbed",
    ],
  },
  {
    category: "Frontier Training",
    terms: [
      "technical report",
      "frontier",
      "foundation model",
      "pre-training",
      "pretraining",
      "architecture",
      "mixture-of-experts",
      "moe",
      "transformer",
      "world model",
      "omnimodal",
      "native multimodal",
      "vla",
      "vlm",
      "llm",
    ],
  },
  {
    category: "Language Modeling",
    terms: [
      "language model",
      "llm",
      "reasoning",
      "reinforcement learning",
      "rl",
      "grpo",
      "distillation",
      "post-training",
      "autoregressive",
      "diffusion language",
      "agent",
      "tool",
      "verifier",
      "proof",
    ],
  },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripHtml(value) {
  return normalizeText(String(value || "").replace(/<[^>]+>/g, " "));
}

function decodeXml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function getArxivId(value) {
  const text = String(value || "");
  const match = text.match(/(?:arxiv\.org\/abs\/|arxiv:)?(\d{4}\.\d{4,6})(?:v\d+)?/i);
  return match ? match[1] : "";
}

function stableId(paper) {
  return getArxivId(paper.id) || getArxivId(paper.paper) || getArxivId(paper.source) || paper.id || paper.title;
}

function categoriesForText(text) {
  const lower = text.toLowerCase();
  const scores = new Map();
  for (const rule of CATEGORY_RULES) {
    const hits = rule.terms.filter((term) => lower.includes(term)).length;
    if (hits) scores.set(rule.category, hits);
  }
  const ranked = CATEGORY_PRIORITY.filter((category) => scores.has(category)).sort(
    (a, b) => scores.get(b) - scores.get(a) || CATEGORY_PRIORITY.indexOf(a) - CATEGORY_PRIORITY.indexOf(b),
  );
  const strongSingleHit = new Map([
    ["Serving", ["kv cache", "kv-cache", "pagedattention", "speculative decoding", "quantization", "compression"]],
    ["Data / Retrieval", ["graphrag", "knowledge graph", "ontology", "vector database"]],
    ["Robotics", ["robotics", "embodied", "physical ai", "manipulation", "navigation", "vla"]],
    ["Vision/Multimodal", ["multimodal", "gaussian splatting", "point cloud", "text-to-video", "text-to-image"]],
    ["Benchmark", ["benchmark", "leaderboard", "testbed"]],
    ["Frontier Training", ["technical report", "frontier", "foundation model", "omnimodal", "native multimodal"]],
    ["Language Modeling", ["language model", "reasoning", "post-training", "autoregressive", "diffusion language"]],
  ]);
  return ranked
    .filter((category) => {
      if ((scores.get(category) || 0) >= 2) return true;
      return (strongSingleHit.get(category) || []).some((term) => lower.includes(term));
    })
    .slice(0, 3);
}

function categoryTextFor(paper) {
  const categoryTags = new Set(CATEGORIES.map((category) => category.toLowerCase()));
  const matchedBy = (paper.matchedBy || []).filter((tag) => !categoryTags.has(String(tag).toLowerCase()));
  return [
    paper.title,
    paper.summary,
    paper.authors,
    paper.org,
    paper.source,
    paper.paper,
    ...matchedBy,
  ].join(" ");
}

function categoriesForPaper(paper) {
  const current = paper.category || paper.categories?.[0] || "";
  const text = categoryTextFor(paper);
  const categoryTags = new Set(CATEGORIES.map((category) => category.toLowerCase()));
  const matchedBy = (paper.matchedBy || []).filter((tag) => !categoryTags.has(String(tag).toLowerCase()));
  const titleAndTags = [paper.title, ...matchedBy].join(" ").toLowerCase();
  const inferred = categoriesForText(text).filter((category) => {
    if (category !== "Benchmark") return true;
    return /\b(benchmark|leaderboard|arena|challenge|testbed)\b/i.test(titleAndTags);
  });
  if (inferred.length) return inferred;
  if (Array.isArray(paper.categories) && paper.categories.some((category) => CATEGORIES.includes(category))) {
    return paper.categories.filter((category) => CATEGORIES.includes(category)).slice(0, 3);
  }
  if (CATEGORIES.includes(current)) return [current];
  return ["Language Modeling"];
}

function bestCategoryFor(paper) {
  return categoriesForPaper(paper)[0];
}

function classifyPaper(paper) {
  const categories = categoriesForPaper(paper);
  paper.category = categories[0];
  paper.categories = categories;
  paper.matchedBy = [...new Set([...(paper.matchedBy || []), ...categories.map((category) => category.toLowerCase())])].slice(0, 7);
  return paper;
}

function normalizePaper(paper, sourceName) {
  const id = stableId(paper);
  const title = normalizeText(paper.title);
  if (!id || !title) return null;
  const arxivId = getArxivId(id) || getArxivId(paper.paper) || getArxivId(paper.source);
  const normalized = classifyPaper({
    id: arxivId || String(id),
    title,
    authors: Array.isArray(paper.authors) ? paper.authors.join(", ") : normalizeText(paper.authors),
    org: normalizeText(paper.org),
    published: normalizeText(paper.published),
    score: Number.isFinite(Number(paper.score)) ? Number(paper.score) : 50,
    paper: paper.paper || paper.url_abs || (arxivId ? `https://arxiv.org/abs/${arxivId}` : ""),
    source: paper.source || paper.url_abs || (arxivId ? `https://arxiv.org/abs/${arxivId}` : ""),
    code: paper.code || "",
    project: paper.project || "",
    thumbnail: paper.thumbnail || paper.thumbnail_url || "",
    summary: normalizeText(paper.summary || paper.abstract),
    matchedBy: paper.matchedBy || [sourceName],
    sources: [...new Set([...(paper.sources || []), sourceName])],
  });
  return normalized;
}

function mergePapers(existing, incoming) {
  const byId = new Map();
  for (const paper of [...existing, ...incoming]) {
    const normalized = normalizePaper(paper, paper.sources?.[0] || "seed");
    if (!normalized) continue;
    const key = stableId(normalized);
    const prev = byId.get(key);
    if (!prev) {
      byId.set(key, normalized);
      continue;
    }
    byId.set(
      key,
      classifyPaper({
        ...prev,
        ...Object.fromEntries(Object.entries(normalized).filter(([, value]) => value !== "" && value != null)),
        score: Math.max(prev.score || 0, normalized.score || 0),
        categories: [...new Set([...(prev.categories || []), ...(normalized.categories || [])])],
        matchedBy: [...new Set([...(prev.matchedBy || []), ...(normalized.matchedBy || [])])].slice(0, 5),
        sources: [...new Set([...(prev.sources || []), ...(normalized.sources || [])])],
      }),
    );
  }
  return [...byId.values()];
}

function categoriesOf(paper) {
  return (paper.categories?.length ? paper.categories : [paper.category]).filter(Boolean);
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json,text/html,application/xhtml+xml",
      "user-agent": "AIDAS-Paper-Digest/1.0",
    },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      accept: "application/atom+xml,text/html,application/xhtml+xml",
      "user-agent": "AIDAS-Paper-Digest/1.0",
      ...(options.headers || {}),
    },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.text();
}

async function ingestPwc() {
  const papers = [];
  for (const query of PWC_QUERIES) {
    const url = `https://paperswithcode.co/api/v1/papers?page_size=30&search=${encodeURIComponent(
      query,
    )}&order_by=date_published&order_dir=desc&latest_only=true&include_resources=true`;
    try {
      const data = await fetchJson(url);
      for (const item of data.results || []) {
        const codeFromAbstract = item.abstract?.match(/https:\/\/github\.com\/[^\s).]+/i)?.[0] || "";
        const projectFromAbstract = item.abstract?.match(/https:\/\/(?!github\.com)[^\s).]+/i)?.[0] || "";
        papers.push(
          normalizePaper(
            {
              id: item.arxiv_id || `pwc-${item.id}`,
              title: item.title,
              authors: item.authors,
              published: item.published || item.proceeding || "",
              score: 60 + Math.min(35, Math.round((item.citation_count || 0) / 4)),
              paper: item.url_abs,
              source: item.arxiv_id ? `https://paperswithcode.co/paper/${item.arxiv_id}` : item.url_abs,
              code: codeFromAbstract,
              project: projectFromAbstract,
              thumbnail: item.thumbnail_url
                ? item.thumbnail_url.startsWith("http")
                  ? item.thumbnail_url
                  : `https://paperswithcode.co${item.thumbnail_url}`
                : "",
              summary: item.tldr || item.abstract,
              matchedBy: [
                "papers with code",
                ...(item.tasks || []).map((task) => task.name),
                ...(item.methods || []).map((method) => method.name),
              ].slice(0, 5),
            },
            "paperswithcode",
          ),
        );
      }
      await sleep(150);
    } catch (error) {
      console.warn(`[pwc] ${query}: ${error.message}`);
    }
  }
  return papers.filter(Boolean);
}

function parseArxivEntries(xml) {
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, entry]) => {
    const get = (tag) => decodeXml(entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`))?.[1] || "");
    const links = [...entry.matchAll(/<link[^>]+href="([^"]+)"/g)].map((match) => decodeXml(match[1]));
    const paper = links.find((link) => link.includes("/abs/")) || get("id");
    const id = getArxivId(paper);
    return normalizePaper(
      {
        id,
        title: get("title"),
        authors: [...entry.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>\s*<\/author>/g)]
          .map((match) => decodeXml(match[1]))
          .join(", "),
        published: get("published").slice(0, 10),
        score: 58,
        paper,
        source: paper,
        summary: stripHtml(decodeXml(get("summary"))),
        matchedBy: ["arxiv"],
      },
      "arxiv",
    );
  });
}

async function ingestArxiv() {
  const papers = [];
  for (const query of ARXIV_QUERIES) {
    const url = `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(
      query,
    )}&sortBy=submittedDate&sortOrder=descending&start=0&max_results=25`;
    try {
      const xml = await fetchText(url);
      papers.push(...parseArxivEntries(xml));
      await sleep(350);
    } catch (error) {
      console.warn(`[arxiv] ${query}: ${error.message}`);
    }
  }
  return papers.filter(Boolean);
}

async function ingestHfDaily() {
  try {
    const html = await fetchText("https://huggingface.co/papers");
    const matches = [...html.matchAll(/href="\/papers\/(\d{4}\.\d{4,6})"[\s\S]{0,500}?>([^<]+)<\/a>/g)];
    return matches
      .map((match) =>
        normalizePaper(
          {
            id: match[1],
            title: stripHtml(match[2]),
            score: 62,
            paper: `https://arxiv.org/abs/${match[1]}`,
            source: `https://huggingface.co/papers/${match[1]}`,
            matchedBy: ["hugging face daily"],
          },
          "huggingface",
        ),
      )
      .filter(Boolean);
  } catch (error) {
    console.warn(`[huggingface] ${error.message}`);
    return [];
  }
}

async function ingestTwitterSignals() {
  const userId = process.env.X_USER_ID;
  if (!userId) return { signals: [], boosts: new Map() };

  const url = new URL(`https://api.x.com/2/users/${userId}/timelines/reverse_chronological`);
  url.searchParams.set("max_results", "100");
  url.searchParams.set("tweet.fields", "created_at,entities,public_metrics");
  url.searchParams.set("expansions", "author_id");
  url.searchParams.set("user.fields", "username,name");

  try {
    const authorization = xAuthorizationHeader(url);
    if (!authorization) return { signals: [], boosts: new Map() };
    const data = JSON.parse(
      await fetchText(url.toString(), {
        headers: { authorization },
      }),
    );
    const users = new Map((data.includes?.users || []).map((user) => [user.id, user]));
    const boosts = new Map();
    const signals = (data.data || []).map((tweet) => {
      const author = users.get(tweet.author_id);
      const urls = tweet.entities?.urls || [];
      const expanded = urls.map((item) => item.expanded_url || item.unwound_url || item.url).filter(Boolean);
      const arxivIds = [...new Set([tweet.text, ...expanded].map(getArxivId).filter(Boolean))];
      for (const id of arxivIds) boosts.set(id, (boosts.get(id) || 0) + 8);
      return {
        id: tweet.id,
        author: author ? `@${author.username}` : tweet.author_id,
        createdAt: tweet.created_at,
        text: tweet.text,
        urls: expanded,
        arxivIds,
        metrics: tweet.public_metrics || {},
      };
    });
    await fs.writeFile(X_OUT_FILE, JSON.stringify({ generatedAt: new Date().toISOString(), signals }, null, 2) + "\n");
    return { signals, boosts };
  } catch (error) {
    console.warn(`[twitter] ${error.message}`);
    return { signals: [], boosts: new Map() };
  }
}

function xAuthorizationHeader(url) {
  if (process.env.X_USER_ACCESS_TOKEN) return `Bearer ${process.env.X_USER_ACCESS_TOKEN}`;

  const consumerKey = process.env.X_API_KEY;
  const consumerSecret = process.env.X_API_SECRET;
  const token = process.env.X_ACCESS_TOKEN;
  const tokenSecret = process.env.X_ACCESS_TOKEN_SECRET;
  if (!consumerKey || !consumerSecret || !token || !tokenSecret) return "";

  const oauth = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: token,
    oauth_version: "1.0",
  };

  const allParams = new URLSearchParams(url.searchParams);
  for (const [key, value] of Object.entries(oauth)) allParams.append(key, value);
  const normalized = [...allParams.entries()]
    .sort(([aKey, aValue], [bKey, bValue]) => (aKey === bKey ? aValue.localeCompare(bValue) : aKey.localeCompare(bKey)))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
  const baseUrl = `${url.origin}${url.pathname}`;
  const baseString = ["GET", encodeURIComponent(baseUrl), encodeURIComponent(normalized)].join("&");
  const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;
  oauth.oauth_signature = crypto.createHmac("sha1", signingKey).update(baseString).digest("base64");

  return `OAuth ${Object.entries(oauth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodeURIComponent(key)}="${encodeURIComponent(value)}"`)
    .join(", ")}`;
}

async function main() {
  const existing = await readJson(OUT_FILE, { papers: [] });
  const seed = Array.isArray(existing) ? existing : existing.papers || [];
  const [pwc, arxiv, hf, twitter] = await Promise.all([
    ingestPwc(),
    ingestArxiv(),
    ingestHfDaily(),
    ingestTwitterSignals(),
  ]);

  let papers = mergePapers(seed, [...pwc, ...arxiv, ...hf]);
  for (const paper of papers) {
    const boost = twitter.boosts.get(stableId(paper)) || 0;
    paper.score = Math.min(100, Math.round((paper.score || 50) + boost));
    if (boost) paper.matchedBy = [...new Set(["x signal", ...(paper.matchedBy || [])])].slice(0, 5);
  }

  papers = papers
    .map((paper) => classifyPaper(paper))
    .filter((paper) => categoriesOf(paper).some((category) => CATEGORIES.includes(category)))
    .sort((a, b) => (b.score || 0) - (a.score || 0) || a.title.localeCompare(b.title))
    .slice(0, Number(process.env.MAX_PAPERS || 180));

  const payload = {
    generatedAt: new Date().toISOString(),
    sourceStats: {
      seed: seed.length,
      paperswithcode: pwc.length,
      arxiv: arxiv.length,
      huggingface: hf.length,
      twitterSignals: twitter.signals.length,
      total: papers.length,
    },
    papers,
  };

  await fs.writeFile(OUT_FILE, JSON.stringify(payload, null, 2) + "\n");
  console.log(JSON.stringify(payload.sourceStats, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
