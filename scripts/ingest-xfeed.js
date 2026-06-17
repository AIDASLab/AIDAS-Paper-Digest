#!/usr/bin/env node

// Builds papers/twitter-feed.json — a merged, chronological feed of recent posts from the
// configured X accounts. X blocks third-party embedded timelines, so we use X's own public
// syndication endpoint (the data source behind the embed widget) to fetch each account's
// recent posts server-side, then render them as native-style cards in the UI. No API key,
// no login. Best-effort: any account that fails is skipped.

const fs = require("fs/promises");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const CONFIG_FILE = path.join(ROOT, "papers", "supabase-config.js");
const OUT_FILE = path.join(ROOT, "papers", "twitter-feed.json");
const MAX_ITEMS = Number(process.env.XFEED_MAX || 80);
const PER_ACCOUNT = Number(process.env.XFEED_PER_ACCOUNT || 4);
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readAccounts() {
  const source = await fs.readFile(CONFIG_FILE, "utf8");
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  const config = sandbox.window.AIDAS_SUPABASE_CONFIG || {};
  return Array.isArray(config.xAccounts) ? config.xAccounts : [];
}

function pickMedia(tweet) {
  const media = tweet.mediaDetails || tweet.extended_entities?.media || tweet.entities?.media || [];
  return media
    .map((item) => ({
      type: item.type || "photo",
      image: item.media_url_https || "",
      // For videos/gifs the image is the poster frame; playback opens the tweet.
    }))
    .filter((item) => item.image);
}

function cleanText(tweet) {
  let text = tweet.full_text || tweet.text || "";
  for (const url of tweet.entities?.urls || []) {
    if (url.url && url.display_url) text = text.split(url.url).join(url.display_url);
  }
  // Drop the trailing t.co link that points at the attached media.
  const media = tweet.extended_entities?.media || tweet.entities?.media || [];
  for (const item of media) {
    if (item.url) text = text.split(item.url).join("");
  }
  return text.replace(/\s+\n/g, "\n").trim();
}

async function fetchTimeline(handle) {
  const url = `https://syndication.twitter.com/srv/timeline-profile/screen-name/${encodeURIComponent(handle)}?showReplies=false`;
  // The syndication endpoint rate-limits bursts (429); back off and retry.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" } });
    if (response.ok) return response.text();
    if (response.status !== 429) throw new Error(`http ${response.status}`);
    await sleep(3000 * (attempt + 1));
  }
  throw new Error("http 429");
}

async function fetchAccount(handle) {
  const html = await fetchTimeline(handle);
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) throw new Error("no __NEXT_DATA__");
  const data = JSON.parse(match[1]);
  const entries = data?.props?.pageProps?.timeline?.entries || [];

  const items = [];
  for (const entry of entries) {
    const tweet = entry?.content?.tweet;
    if (!tweet || !tweet.id_str) continue;
    if (tweet.retweeted_status) continue; // skip pure retweets
    const user = tweet.user || {};
    items.push({
      id: tweet.id_str,
      handle: user.screen_name || handle,
      name: user.name || handle,
      avatar: user.profile_image_url_https || "",
      verified: Boolean(user.is_blue_verified || user.verified),
      text: cleanText(tweet),
      createdAt: tweet.created_at || "",
      permalink: tweet.permalink
        ? `https://twitter.com${tweet.permalink}`
        : `https://twitter.com/${user.screen_name || handle}/status/${tweet.id_str}`,
      media: pickMedia(tweet),
      metrics: {
        like_count: tweet.favorite_count || 0,
        retweet_count: tweet.retweet_count || 0,
        reply_count: tweet.reply_count || 0,
      },
      urls: (tweet.entities?.urls || [])
        .map((url) => url.expanded_url)
        .filter((value) => value && !/\/\/(t\.co|twitter\.com|x\.com)\//i.test(value)),
    });
    if (items.length >= PER_ACCOUNT) break;
  }
  return items;
}

async function main() {
  const accounts = await readAccounts();
  if (!accounts.length) {
    console.warn("[xfeed] no xAccounts configured");
    return;
  }

  const all = [];
  for (const handle of accounts) {
    try {
      const items = await fetchAccount(handle);
      all.push(...items);
      console.log(`[xfeed] ${handle}: ${items.length}`);
    } catch (error) {
      console.warn(`[xfeed] ${handle}: ${error.message}`);
    }
    await sleep(Number(process.env.XFEED_DELAY || 1500));
  }

  all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const signals = all.slice(0, MAX_ITEMS);

  await fs.writeFile(OUT_FILE, JSON.stringify({ generatedAt: new Date().toISOString(), signals }, null, 2) + "\n");
  console.log(`[xfeed] wrote ${signals.length} posts from ${accounts.length} accounts`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
