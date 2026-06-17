# X/Twitter setup

There are two independent pieces: the **X Feed tab** (what you see) and the optional
**ingest signals** (used to nudge paper ranking).

## X Feed tab — native embedded timeline

The "X Feed" tab embeds X's official timeline widget, so posts render natively (images,
video, avatars, badges). X does **not** expose the personal "For you" feed to any third
party, so point the tab at a **public X List** you control:

1. On X: create a List, add the accounts you want, and set it to **Public**.
   Suggested seeds from the current feed: `@kevin_y_wu`, `@notmahi`, `@chris_j_paxton`,
   `@litian_liang`, `@gabriberton`, `@vai_viswanathan`, `@plastic_gear`,
   `@lukas_m_ziegler`, `@minchoi`, `@googlegemma`, `@tzedonn`.
2. Copy the list URL, e.g. `https://twitter.com/<you>/lists/<id>`.
3. Paste it into `papers/supabase-config.js` → `xTimeline`.

A profile (`https://twitter.com/<handle>`) or search URL works too. Until `xTimeline` is set,
the tab shows setup instructions.

## Optional ingest signals — X API user-context auth

This part is only for ranking signals (boosting papers linked from tweets), not the feed
display. Use official X API user-context auth. Do not scrape browser cookies or reuse a
logged-in browser session.

## Recommended: OAuth 1.0a read-only user token

1. Create an X Developer account and app.
2. Set the app permissions to read-only.
3. Generate user access tokens for your account.
4. Add these GitHub repository secrets:
   - `X_USER_ID`: your numeric X user id
   - `X_API_KEY`: app API key
   - `X_API_SECRET`: app API key secret
   - `X_ACCESS_TOKEN`: user access token
   - `X_ACCESS_TOKEN_SECRET`: user access token secret
5. Run the `Ingest papers` GitHub Action manually once.

The ingest script calls:

```text
GET https://api.x.com/2/users/:id/timelines/reverse_chronological
```

It stores sanitized feed metadata in `papers/twitter-feed.json`, which is shown in the
**X Feed** tab of the board (your home timeline), and also uses arXiv links found in tweets
as ranking signals for `papers/papers.json`.

> The feed is refreshed by the daily ingest job (not live), and `papers/twitter-feed.json`
> is committed to this public repository — so the captured timeline is publicly readable.
> The `reverse_chronological` home-timeline endpoint also requires an X API tier that grants it.

## OAuth 2 alternative

You can set `X_USER_ACCESS_TOKEN` and `X_USER_ID`, but OAuth 2 access tokens expire. For a scheduled GitHub Action, OAuth 1.0a user tokens are simpler unless you also implement refresh-token rotation.
