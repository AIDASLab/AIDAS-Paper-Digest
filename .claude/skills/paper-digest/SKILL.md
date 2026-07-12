---
name: paper-digest
description: >
  Build or adapt an auto-updating research "digest" board like AIDAS Paper Digest — a
  static GitHub Pages site that ingests papers on a daily GitHub Actions cron (Papers with
  Code, arXiv, Hugging Face Daily Papers, alphaXiv), renders arXiv first-page thumbnails,
  shows an editorial card UI (categories, search, sort, pagination) with name-based votes /
  comments / bookmarks via Supabase, and a native X (Twitter) feed built from X's public
  syndication endpoint (no API key). Use when the user wants a new topic digest — e.g. a
  robotics, LLM, or vision paper board — or wants to change sources, categories, X accounts,
  branding, or fix/extend an existing digest of this shape.
---

# Research digest board

This skill reproduces and adapts the **AIDAS Paper Digest** architecture. The reference
implementation lives in this repo (`papers/`, `scripts/`, `.github/workflows/`); the fastest
way to start a new digest is to copy it and change the **customization points** below.

## Architecture (no build step)

- **Static site** in `papers/` served by **GitHub Pages** (root `index.html` redirects to
  `papers/`). Plain HTML/CSS/JS — no bundler.
- **Data is committed JSON.** A **GitHub Actions cron** runs Node scripts that fetch + rank
  data and commit the output:
  - `scripts/ingest-papers.js` → `papers/papers.json` (papers)
  - `scripts/render-thumbnails.js` → `papers/thumbs/<arxivId>.jpg` (PDF first pages)
  - `scripts/ingest-xfeed.js` → `papers/twitter-feed.json` (X feed)
- **Supabase** holds interactions only (votes / comments / bookmarks), keyed by the visitor's
  display **name**. Anon key is public; security is via RLS (soft — internal use).
- **No real auth**: a name-only gate labels votes/comments/bookmarks. Same name = shared.

## Create a new digest (checklist)

1. **Copy the repo** (or `papers/` + `scripts/` + `.github/workflows/ingest-papers.yml` +
   `docs/`). Rename branding in `papers/index.html` (`<title>`, hero text) and README.
2. **Retarget the topic** (see customization points) — categories, source queries, X accounts.
3. **New Supabase project** → run `docs/supabase-votes-setup.md` SQL → put URL + anon key in
   `papers/supabase-config.js`.
4. **Push to a repo**, enable **Pages** (Deploy from branch → `main`, root).
5. **Seed data once**: run `node scripts/ingest-papers.js`, `node scripts/render-thumbnails.js`,
   `node scripts/ingest-xfeed.js` locally (needs `poppler-utils` for thumbnails) and commit,
   or trigger the Action manually. The cron keeps it fresh daily.

## Customization points

| Want to change | Edit |
|----------------|------|
| Topic / search terms | `PWC_QUERIES` and `ARXIV_QUERIES` in `scripts/ingest-papers.js` |
| Categories + how papers are classified | `CATEGORIES`, `CATEGORY_RULES` in `scripts/ingest-papers.js`; `categories` + `CATEGORY_STYLE` (colour/icon) in `papers/papers.js` |
| Sources on/off | `main()` in `scripts/ingest-papers.js` (`ingestPwc/ingestArxiv/ingestHfDaily/ingestAlphaxiv`) |
| Paper cap | `MAX_PAPERS` env in the workflow (`0` = no cap) |
| X feed accounts | `xAccounts` in `papers/supabase-config.js` |
| Cron time | `schedule:` cron in `.github/workflows/ingest-papers.yml` (UTC; KST = +9) |
| Branding / colours | `papers/index.html` + `:root` vars and `--grad-*` in `papers/papers.css` |

## How the pieces work

- **Sources** (all in `scripts/ingest-papers.js`): Papers with Code API, arXiv export API
  (per-category keyword queries), Hugging Face Daily Papers (HTML scrape), and **alphaXiv Hot**
  trending (scrape the homepage `/abs/<id>` cards — this is the only way to get non-arXiv
  native reports like GLM-5.2). Everything is merged + deduped by arXiv id / title, scored,
  and accumulated (the previous `papers.json` is the seed).
- **Thumbnails** (`scripts/render-thumbnails.js`): downloads `arxiv.org/pdf/<id>` and renders
  page 1 to a small JPEG with `pdftoppm` (poppler). Incremental, capped per run, retries on
  429. Papers without a PDF fall back to a designed title card in the UI.
- **X feed** (`scripts/ingest-xfeed.js`): fetches each account's recent posts from
  `syndication.twitter.com/srv/timeline-profile/screen-name/<handle>` (the data behind X's
  embed widget — **embedded timeline widgets no longer render on external sites**, so we build
  our own cards). Merges + sorts newest-first, drops posts older than 30 days, and **rotates
  the starting account by day** because the endpoint rate-limits (~20 accounts/IP/run).
- **UI** (`papers/papers.js`): categories, full-text search, publication time-window filter,
  sort (newest / rank / comments / hot / title), 20/page pagination, and a Supabase-backed
  vote/comment/bookmark layer with a `localStorage` cache fallback.

## Gotchas / lessons learned

- **Sticky sidebar**: `overflow-x: hidden` on `html/body` silently breaks `position: sticky`.
  Use `overflow-x: clip` instead.
- **arXiv authors**: parse each `<author><name>…</name>` independently — a regex expecting
  `</name></author>` adjacency leaks the whole author XML block when `<arxiv:affiliation>` is
  present. Truncate long author lists in the byline.
- **Two-cron push race**: primary + backup cron runs can both push and one gets rejected. Add
  `concurrency:` and make the commit step rebase + not fail on a lost push race.
- **Scheduled runs are delayed** by GitHub (often 1–2h past the cron); a backup cron helps.
- **X syndication** is cached (~a few days stale for some accounts) and rate-limited — coverage
  is best-effort and cycles over several daily runs. There is no free way to get a real-time /
  "For you" feed on a static site.
- **Supabase**: the anon key is safe to publish; never commit the DB connection string /
  service-role key. Run the full setup SQL (incl. `paper_saves`) on any new project.

## Deploy summary

- Pages: Settings → Pages → `main` / root.
- Secrets: none required (thumbnails + X feed use no keys). Optional legacy `X_*` secrets only
  feed a ranking-signal path.
- Trigger manually: Actions → **Ingest papers** → Run workflow.
