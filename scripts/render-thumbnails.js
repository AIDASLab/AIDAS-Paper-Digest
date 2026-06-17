#!/usr/bin/env node

// Renders the first page of each arXiv paper's PDF into a small JPEG thumbnail and
// commits it under papers/thumbs/<id>.jpg, then links it from papers.json. This is the
// reliable, self-hosted route (no fragile external image URLs). It is incremental
// (skips papers that already have a thumbnail) and capped per run so CI stays fast and
// arXiv is not hammered. Requires poppler-utils (`pdftoppm`).

const fs = require("fs/promises");
const path = require("path");
const os = require("os");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileP = promisify(execFile);

const ROOT = path.resolve(__dirname, "..");
const PAPERS_FILE = path.join(ROOT, "papers", "papers.json");
const THUMB_DIR = path.join(ROOT, "papers", "thumbs");
const THUMB_WIDTH = 420;
const PER_RUN_LIMIT = Number(process.env.THUMB_LIMIT || 60);
const ARXIV_RE = /^\d{4}\.\d{4,5}$/;

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function renderThumb(id) {
  const pdfPath = path.join(os.tmpdir(), `aidas-${id}.pdf`);
  const outPrefix = path.join(os.tmpdir(), `aidas-${id}-thumb`);
  const finalPath = path.join(THUMB_DIR, `${id}.jpg`);

  const response = await fetch(`https://arxiv.org/pdf/${id}`, {
    redirect: "follow",
    headers: { "User-Agent": "aidas-paper-digest/1.0 (thumbnails)" },
  });
  if (!response.ok) throw new Error(`pdf http ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.subarray(0, 4).toString("latin1") !== "%PDF") throw new Error("not a pdf");
  await fs.writeFile(pdfPath, buffer);

  try {
    await execFileP("pdftoppm", [
      "-jpeg",
      "-jpegopt",
      "quality=82",
      "-f",
      "1",
      "-l",
      "1",
      "-scale-to-x",
      String(THUMB_WIDTH),
      "-scale-to-y",
      "-1",
      "-singlefile",
      pdfPath,
      outPrefix,
    ]);
    await fs.rename(`${outPrefix}.jpg`, finalPath);
  } finally {
    await fs.unlink(pdfPath).catch(() => {});
  }
  return finalPath;
}

async function main() {
  const raw = JSON.parse(await fs.readFile(PAPERS_FILE, "utf8"));
  const papers = Array.isArray(raw) ? raw : raw.papers || [];
  await fs.mkdir(THUMB_DIR, { recursive: true });

  let rendered = 0;
  let linked = 0;
  for (const paper of papers) {
    const id = String(paper.id || "");
    if (!ARXIV_RE.test(id)) continue;
    const finalPath = path.join(THUMB_DIR, `${id}.jpg`);

    if (!(await exists(finalPath)) && rendered < PER_RUN_LIMIT) {
      try {
        await renderThumb(id);
        rendered += 1;
        console.log(`[thumb] rendered ${id}`);
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        console.warn(`[thumb] skip ${id}: ${error.message}`);
        continue;
      }
    }

    if (await exists(finalPath)) {
      paper.thumbnail = `./thumbs/${id}.jpg`;
      linked += 1;
    }
  }

  await fs.writeFile(PAPERS_FILE, JSON.stringify(raw, null, 2) + "\n");
  console.log(`[thumb] rendered=${rendered} linked=${linked} (limit=${PER_RUN_LIMIT})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
