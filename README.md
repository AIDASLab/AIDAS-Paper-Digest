# AIDAS Paper Digest

A static, auto-updating board of high-signal AI research papers for AIDAS, with a live X (Twitter) feed of AI accounts.

**Live site:** https://kim-jake.github.io/AIDAS-Paper-Digest/

> Hosted on GitHub Pages. If the repo is transferred to another account/org, the URL becomes `https://<owner>.github.io/AIDAS-Paper-Digest/`.

## Features

- **Daily auto-ingest** — a GitHub Actions cron pulls fresh papers every morning (08:11 / 08:41 KST) from **Papers with Code, arXiv, Hugging Face Daily Papers, and alphaXiv trending** (no paper cap).
- **Paper thumbnails** — the first page of each arXiv PDF is rendered to an image; papers without a PDF get a designed title card, so every paper has a thumbnail.
- **Editorial card layout** — serif titles, thumbnail, authors (truncated when long), 2-line summary, colour-coded topic pills, and a "Hot" signal score.
- **Browse & search** — category tabs (with a total count on **All**), full-text search, time-window filter (7/30/90 days), and sort by AIDAS Rank / Comments / Hot / Newest / Title, paginated 20 per page.
- **Member interactions** (per name, synced via Supabase): **Upvote**, **Comments**, and **Saved** bookmarks with a dedicated Saved tab.
- **X Feed tab** — a merged, newest-first feed of curated AI / LLM / robotics accounts, rendered as native-style cards (avatar, verified badge, text, images/video, metrics), paginated 8 per page. Built from X's public syndication endpoint (no API key); edit the account list in `papers/supabase-config.js` → `xAccounts`.
- **Name-only access** — visitors just enter a display name (no password); it labels their votes/comments/bookmarks.

## Layout

| Path | What it is |
|------|------------|
| `papers/` | The site (`index.html`, `papers.js`, `papers.css`, `papers.json`, `twitter-feed.json`, `thumbs/`) |
| `papers/supabase-config.js` | Supabase URL + anon key, and the `xAccounts` list |
| `scripts/ingest-papers.js` | Pulls & ranks papers → `papers/papers.json` |
| `scripts/render-thumbnails.js` | Renders arXiv first-page thumbnails → `papers/thumbs/` |
| `scripts/ingest-xfeed.js` | Builds the X feed → `papers/twitter-feed.json` |
| `.github/workflows/ingest-papers.yml` | Daily cron that runs the scripts and commits the result |
| `docs/supabase-votes-setup.md` | SQL to create the votes / comments / saves tables |

## Setup notes

- **Supabase** (votes, comments, bookmarks): create a project, run `docs/supabase-votes-setup.md` in the SQL editor, then put the project URL + anon key in `papers/supabase-config.js`. The anon key is safe to publish (security is via RLS).
- **Pages**: enable GitHub Pages (Deploy from branch → `main`, root). The site is `papers/` (the root `index.html` redirects there).
