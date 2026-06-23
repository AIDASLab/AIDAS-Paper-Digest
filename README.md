<div align="center">

# 📚 AIDAS Paper Digest

**An auto-updating board of high-signal AI research papers — with a live X feed of AI accounts.**

[![Open the site](https://img.shields.io/badge/%F0%9F%9A%80_Open_the_board-2563eb?style=for-the-badge)](https://kim-jake.github.io/AIDAS-Paper-Digest/)

`Papers with Code` · `arXiv` · `Hugging Face` · `alphaXiv` — refreshed every morning, no paper cap.

</div>

> **Live:** https://kim-jake.github.io/AIDAS-Paper-Digest/
> Hosted on GitHub Pages. After transferring the repo, the URL becomes `https://<owner>.github.io/AIDAS-Paper-Digest/`.

---

## ✨ Features

- 🔄 **Daily auto-ingest** — a GitHub Actions cron (08:11 / 08:41 KST) pulls fresh papers from four sources, ranks them, renders thumbnails, and commits the result. No paper cap.
- 🖼️ **Thumbnails for every paper** — first page of the arXiv PDF, or a designed title card when there's no PDF.
- 📰 **Editorial cards** — serif titles, thumbnail, authors (auto-truncated when long), 2-line summary, colour-coded topic pills, and a "Hot" signal score.
- 🔎 **Browse** — category tabs, full-text search, a publication time-window filter, sorting, and pagination (20 / page).
- 👍 **Member interactions** — upvote, comment, and bookmark papers (synced by name via Supabase).
- 🐦 **X Feed tab** — a merged, newest-first feed of curated AI / LLM / robotics accounts as native-style cards (avatar, badge, text, images/video, metrics), 8 / page.
- 🙋 **Name-only access** — just type a display name; no password.

---

## 📖 Usage guide

### Access
Type a **display name** on entry — that's it, no password. Your name labels everything you do (votes, comments, bookmarks). Use **Change** in the sidebar to switch names.

### 🔖 Bookmarks (Saved)
- Click the **bookmark icon** on a card to save it; the **Saved** tab lists everything you've saved.
- Bookmarks are stored **by your name** in Supabase (`paper_saves`), so the **same name on any device/browser sees the same bookmarks**. `localStorage` is only a local cache / offline fallback.
- ⚠️ Access is name-only (not real auth), so **anyone using the same name shares those bookmarks/votes**. Pick a unique name.

### ↕️ Sort options
| Sort | Orders by |
|------|-----------|
| **Newest** *(default)* | When the paper was first added to the board, then publication date |
| **AIDAS Rank** | Member **upvotes** first, then Hot score, then date |
| **Comments** | Number of discussion comments |
| **Hot** | Source/code/community **signal score** |
| **Title** | Alphabetical |

### 🎛️ Filters & search
- **Category tabs** — Added Today · Saved · All (with total count) · plus each research area.
- **Newest** dropdown — limit to papers **published** within 7 / 30 / 90 days (this is a *filter*, separate from the *sort*).
- **Search** — matches title, tags, lab/org, authors, and source.

---

## 🌐 Sources

| Source | Where | Used for |
|--------|-------|----------|
| Papers with Code | `paperswithcode.co/api/v1` | papers by topic query + code/task tags |
| arXiv | `export.arxiv.org/api` | newest in cs.CL / LG / AI / CV / DC / IR / RO |
| Hugging Face Daily Papers | `huggingface.co/papers` | trending daily papers |
| alphaXiv (Hot) | `alphaxiv.org` | trending incl. non-arXiv reports (e.g. GLM-5.2) |
| arXiv PDFs | `arxiv.org/pdf/<id>` | first-page thumbnails |
| X (Twitter) | `syndication.twitter.com` | the X Feed (per account, no API key) |

Edit the X Feed account list in [`papers/supabase-config.js`](papers/supabase-config.js) → `xAccounts`.

---

## 🗂️ Layout

| Path | What it is |
|------|------------|
| `papers/` | The site — `index.html`, `papers.js`, `papers.css`, `papers.json`, `twitter-feed.json`, `thumbs/` |
| `papers/supabase-config.js` | Supabase URL + anon key, and the `xAccounts` list |
| `scripts/ingest-papers.js` | Pulls & ranks papers → `papers/papers.json` |
| `scripts/render-thumbnails.js` | Renders arXiv first-page thumbnails → `papers/thumbs/` |
| `scripts/ingest-xfeed.js` | Builds the X feed → `papers/twitter-feed.json` |
| `.github/workflows/ingest-papers.yml` | Daily cron that runs the scripts and commits |
| `docs/supabase-votes-setup.md` | SQL for the votes / comments / saves tables |

---

## ⚙️ Setup

1. **Supabase** (votes, comments, bookmarks): create a project, run [`docs/supabase-votes-setup.md`](docs/supabase-votes-setup.md) in the SQL editor, then put the project **URL + anon key** in `papers/supabase-config.js`. The anon key is safe to publish — security is via RLS.
2. **GitHub Pages**: Settings → Pages → Deploy from branch → `main` / root. The root `index.html` redirects to `papers/`.
3. **Daily updates**: the `Ingest papers` Action runs on a cron; trigger it manually anytime via **Actions → Ingest papers → Run workflow**.
