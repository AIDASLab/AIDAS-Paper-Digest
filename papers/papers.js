const categories = [
  "Added Today",
  "Saved",
  "All",
  "Benchmark",
  "Data / Retrieval",
  "Frontier Training",
  "Language Modeling",
  "Robotics",
  "Serving",
  "Vision/Multimodal",
];

const PAGE_SIZE = 20;
const COMMENTS_PAGE_SIZE = 10;
const FEEDBACK_PAGE_SIZE = 10;
const MAX_LOCAL_FEEDBACK = 1000;
const MAX_LOCAL_COMMENTS_PER_PAPER = 1000;
const MAX_REMOTE_FEEDBACK = 1000;

const state = {
  category: "All",
  newest: "all",
  page: 1,
  query: "",
  saved: new Set(),
  papers: [],
  sort: "aidas",
  supabase: null,
  unlocked: localStorage.getItem("aidas-paper-access") === "ok",
  view: "papers",
  voterName: localStorage.getItem("aidas-paper-voter") || "",
  commentCounts: new Map(),
  commentPages: new Map(),
  comments: new Map(),
  openComments: new Set(),
  voteCounts: new Map(),
  voted: new Set(),
  feedback: [],
  feedbackPage: 1,
  generatedAt: "",
};

const aidasGate = document.querySelector("#aidasGate");
const heroStats = document.querySelector("#heroStats");
const categoryTabs = document.querySelector("#categoryTabs");
const feedbackBoard = document.querySelector("#feedbackBoard");
const feedbackClose = document.querySelector("#feedbackClose");
const feedbackForm = document.querySelector("#feedbackForm");
const feedbackInput = document.querySelector("#feedbackInput");
const feedbackList = document.querySelector("#feedbackList");
const feedbackOpen = document.querySelector("#feedbackOpen");
const feedbackRefresh = document.querySelector("#feedbackRefresh");
const gateError = document.querySelector("#gateError");
const gateForm = document.querySelector("#gateForm");
const gateName = document.querySelector("#gateName");
const gatePassword = document.querySelector("#gatePassword");
const newestSelect = document.querySelector("#newestSelect");
const pagination = document.querySelector("#pagination");
const paperGrid = document.querySelector("#paperGrid");
const searchInput = document.querySelector("#searchInput");
const sortSelect = document.querySelector("#sortSelect");
const aidasChangeName = document.querySelector("#aidasChangeName");
const aidasMemberName = document.querySelector("#aidasMemberName");

const supabaseConfig = window.AIDAS_SUPABASE_CONFIG || {};

function categoryFor(paper) {
  return paper.category || paper.categories?.[0] || "Language Modeling";
}

function categoriesFor(paper) {
  const values = paper.categories?.length ? paper.categories : [categoryFor(paper)];
  return [...new Set(values)].filter(Boolean);
}

// Per-area accent colour, used for the coloured dot on topic pills and the tint of the
// thumbnail fallback. Keeps a light, editorial feel — no heavy gradient covers.
const CATEGORY_STYLE = {
  "Language Modeling": { color: "#2563eb" },
  "Vision/Multimodal": { color: "#7c3aed" },
  "Benchmark": { color: "#b7791f" },
  "Data / Retrieval": { color: "#0f9f6e" },
  "Frontier Training": { color: "#db2777" },
  "Robotics": { color: "#0891b2" },
  "Serving": { color: "#475569" },
};
const DEFAULT_STYLE = { color: "#64748b" };

function styleFor(paper) {
  const primary = categoriesFor(paper).find((category) => CATEGORY_STYLE[category]);
  return CATEGORY_STYLE[primary] || DEFAULT_STYLE;
}

function hasThumb(paper) {
  return typeof paper.thumbnail === "string" && paper.thumbnail.trim().length > 0;
}

// Every paper gets a thumbnail: the real rendered PDF first page when we have it,
// otherwise a designed "title card" (category label + serif title on the area's accent
// gradient) so the board never shows a bare placeholder.
function thumbCard(paper) {
  const category = categoriesFor(paper)[0] || "Paper";
  const title = (paper.title || "Untitled").trim();
  return `
    <span class="thumb-card" aria-hidden="true">
      <span class="thumb-card-cat">${escapeHtml(category)}</span>
      <span class="thumb-card-title">${escapeHtml(title)}</span>
    </span>
  `;
}

function thumbFor(paper) {
  const style = styleFor(paper);
  const img = hasThumb(paper)
    ? `<img src="${escapeHtml(paper.thumbnail)}" alt="" loading="lazy" decoding="async"
           onerror="this.closest('.row-thumb').classList.add('is-fallback')" />`
    : "";
  return `
    <span class="row-thumb${hasThumb(paper) ? "" : " is-fallback"}" style="--accent:${style.color}">
      ${img}
      ${thumbCard(paper)}
    </span>
  `;
}

function formatAuthors(authors, max = 3) {
  const raw = String(authors || "").trim();
  if (!raw) return "";
  const parts = raw.split(/\s*,\s*/).filter(Boolean);
  if (parts.length <= max + 1) return raw;
  return `${parts.slice(0, max).join(", ")}, …`;
}

function pillsFor(paper) {
  return categoriesFor(paper)
    .map((category) => {
      const color = (CATEGORY_STYLE[category] || DEFAULT_STYLE).color;
      return `<span class="category-pill" style="--accent:${color}">${escapeHtml(category)}</span>`;
    })
    .join("");
}

function parseAddedDate(paper) {
  const value = paper.firstSeenAt || paper.addedAt || "";
  const time = value ? new Date(value).getTime() : 0;
  return Number.isNaN(time) ? 0 : time;
}

function isSameLocalDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isAddedToday(paper) {
  const addedAt = parseAddedDate(paper);
  if (!addedAt) return false;
  return isSameLocalDay(new Date(addedAt), new Date());
}

function paperUrl(paper) {
  if (paper.paper) return paper.paper;
  if (paper.url_abs) return paper.url_abs;
  if (paper.id && /^\d{4}\.\d+/.test(paper.id)) return `https://arxiv.org/abs/${paper.id}`;
  return paper.source || "#";
}

function sourceUrl(paper) {
  return paper.source || paperUrl(paper);
}

function localSaveKey() {
  return `aidas-paper-saved:${state.voterName || "guest"}`;
}

function loadLocalSaves() {
  state.saved = new Set(JSON.parse(localStorage.getItem(localSaveKey()) || "[]"));
}

function saveLocalSaves() {
  localStorage.setItem(localSaveKey(), JSON.stringify([...state.saved]));
}

function initSupabase() {
  if (!supabaseConfig.url || !supabaseConfig.anonKey || !window.supabase) return null;
  return window.supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey);
}

function setGateVisible(visible) {
  aidasGate.hidden = !visible;
  document.body.classList.toggle("is-locked", visible);
  if (visible) {
    gateName.value = state.voterName;
    gatePassword.focus();
  }
}

function updateMemberPanel() {
  aidasMemberName.textContent = state.unlocked && state.voterName ? state.voterName : "Locked";
}

function setView(view) {
  state.view = view;
  const isFeedback = view === "feedback";
  feedbackBoard.hidden = !isFeedback;
  paperGrid.hidden = isFeedback;
  pagination.hidden = isFeedback;
  feedbackOpen.setAttribute("aria-pressed", String(isFeedback));
  if (isFeedback) loadFeedback();
}

function requireAccess() {
  if (state.unlocked && state.voterName) return true;
  setGateVisible(true);
  return false;
}

function voteCount(paperId) {
  return state.voteCounts.get(paperId) || 0;
}

function commentCount(paperId) {
  return state.commentCounts.get(paperId) || 0;
}

function commentPageFor(paperId, totalComments) {
  const totalPages = Math.max(1, Math.ceil(totalComments / COMMENTS_PAGE_SIZE));
  const current = state.commentPages.get(paperId) || 1;
  const page = Math.min(Math.max(1, current), totalPages);
  state.commentPages.set(paperId, page);
  return page;
}

function localVoteKey() {
  return `aidas-paper-local-votes:${state.voterName}`;
}

function loadLocalVotes() {
  state.voted = new Set(JSON.parse(localStorage.getItem(localVoteKey()) || "[]"));
  state.voteCounts = new Map([...state.voted].map((paperId) => [paperId, 1]));
}

function saveLocalVotes() {
  localStorage.setItem(localVoteKey(), JSON.stringify([...state.voted]));
}

function localFeedbackKey() {
  return "aidas-paper-feedback";
}

function loadLocalFeedback() {
  state.feedback = JSON.parse(localStorage.getItem(localFeedbackKey()) || "[]");
}

function saveLocalFeedback() {
  localStorage.setItem(localFeedbackKey(), JSON.stringify(state.feedback.slice(0, MAX_LOCAL_FEEDBACK)));
}

function localCommentsKey() {
  return "aidas-paper-comments";
}

function rebuildCommentCounts() {
  const counts = new Map();
  for (const [paperId, comments] of state.comments.entries()) {
    counts.set(paperId, comments.length);
  }
  state.commentCounts = counts;
}

function loadLocalComments() {
  const entries = JSON.parse(localStorage.getItem(localCommentsKey()) || "[]");
  state.comments = new Map(entries.map(([paperId, comments]) => [paperId, comments || []]));
  rebuildCommentCounts();
}

function saveLocalComments() {
  localStorage.setItem(localCommentsKey(), JSON.stringify([...state.comments.entries()]));
}

function isOwnItem(item) {
  return state.unlocked && state.voterName && (item.voter_name || item.name) === state.voterName;
}

function renderFeedback() {
  if (!state.feedback.length) {
    feedbackList.innerHTML = `<p class="feedback-empty">No feedback yet.</p>`;
    return;
  }
  const totalPages = Math.max(1, Math.ceil(state.feedback.length / FEEDBACK_PAGE_SIZE));
  state.feedbackPage = Math.min(Math.max(1, state.feedbackPage), totalPages);
  const start = (state.feedbackPage - 1) * FEEDBACK_PAGE_SIZE;
  const visibleFeedback = state.feedback.slice(start, start + FEEDBACK_PAGE_SIZE);
  feedbackList.innerHTML =
    visibleFeedback
    .map(
      (item) => `
        <article class="feedback-item">
          <p>${escapeHtml(item.message)}</p>
          <div>
            <strong>${escapeHtml(item.voter_name || item.name || "AIDAS")}</strong>
            <span>${formatFeedbackDate(item.created_at)}</span>
          </div>
          ${
            isOwnItem(item)
              ? `
                <div class="item-actions">
                  <button type="button" data-edit-feedback="${item.id}">Edit</button>
                  <button type="button" data-delete-feedback="${item.id}">Delete</button>
                </div>
              `
              : ""
          }
        </article>
      `,
    )
      .join("") +
    (state.feedback.length > FEEDBACK_PAGE_SIZE
      ? `
        <div class="feedback-pager">
          <span>${start + 1}-${Math.min(start + FEEDBACK_PAGE_SIZE, state.feedback.length)} of ${state.feedback.length}</span>
          <div>
            <button type="button" data-feedback-page="${state.feedbackPage - 1}" ${state.feedbackPage === 1 ? "disabled" : ""}>Prev</button>
            <strong>${state.feedbackPage} / ${totalPages}</strong>
            <button type="button" data-feedback-page="${state.feedbackPage + 1}" ${state.feedbackPage === totalPages ? "disabled" : ""}>Next</button>
          </div>
        </div>
      `
      : "");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function displayTags(paper) {
  return (paper.matchedBy || [])
    .map((tag) => String(tag || "").trim())
    .filter((tag) => tag && !/^https?:\/\//i.test(tag));
}

function formatFeedbackDate(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

async function loadFeedback() {
  if (!state.supabase) {
    loadLocalFeedback();
    renderFeedback();
    return;
  }
  const { data, error } = await state.supabase
    .from("feedback_posts")
    .select("id,message,voter_name,created_at")
    .order("created_at", { ascending: false })
    .limit(MAX_REMOTE_FEEDBACK);
  if (error) {
    console.warn("Unable to load feedback", error);
    return;
  }
  state.feedback = data || [];
  renderFeedback();
}

async function loadComments() {
  if (!state.supabase) {
    loadLocalComments();
    return;
  }

  const { data, error } = await state.supabase
    .from("paper_comments")
    .select("id,paper_id,message,voter_name,created_at")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) {
    console.warn("Unable to load paper comments", error);
    return;
  }

  const comments = new Map();
  for (const item of data || []) {
    const list = comments.get(item.paper_id) || [];
    list.push(item);
    comments.set(item.paper_id, list);
  }
  state.comments = comments;
  rebuildCommentCounts();
}

async function postComment(paperId, message) {
  if (!requireAccess()) return;
  const trimmed = message.trim();
  if (!trimmed) return;

  const item = {
    id: `${Date.now()}`,
    paper_id: paperId,
    message: trimmed,
    voter_name: state.voterName,
    created_at: new Date().toISOString(),
  };
  const current = state.comments.get(paperId) || [];
  state.comments.set(paperId, [item, ...current].slice(0, MAX_LOCAL_COMMENTS_PER_PAPER));
  state.commentCounts.set(paperId, commentCount(paperId) + 1);
  state.commentPages.set(paperId, 1);
  renderPapers();

  if (!state.supabase) {
    saveLocalComments();
    return;
  }

  const { data, error } = await state.supabase
    .from("paper_comments")
    .insert({ paper_id: paperId, message: trimmed, voter_name: state.voterName });
  if (error) {
    console.warn("Unable to post paper comment", error);
    await loadComments();
    renderPapers();
  }
}

async function editComment(paperId, commentId) {
  if (!requireAccess()) return;
  const comments = state.comments.get(paperId) || [];
  const comment = comments.find((item) => String(item.id) === String(commentId));
  if (!comment || !isOwnItem(comment)) return;
  const next = window.prompt("Edit comment", comment.message);
  if (next === null) return;
  const trimmed = next.trim();
  if (!trimmed) return;

  comment.message = trimmed;
  renderPapers();

  if (!state.supabase) {
    saveLocalComments();
    return;
  }

  const { error } = await state.supabase
    .from("paper_comments")
    .update({ message: trimmed })
    .eq("id", commentId)
    .eq("voter_name", state.voterName);
  if (error) {
    console.warn("Unable to edit paper comment", error);
    window.alert("Could not edit comment. Check Supabase update policy.");
  }
  await loadComments();
  renderPapers();
}

async function deleteComment(paperId, commentId) {
  if (!requireAccess()) return;
  const comments = state.comments.get(paperId) || [];
  const comment = comments.find((item) => String(item.id) === String(commentId));
  if (!comment || !isOwnItem(comment)) return;
  if (!window.confirm("Delete this comment?")) return;

  const next = comments.filter((item) => String(item.id) !== String(commentId));
  state.comments.set(paperId, next);
  rebuildCommentCounts();
  renderPapers();

  if (!state.supabase) {
    saveLocalComments();
    return;
  }

  const { error } = await state.supabase
    .from("paper_comments")
    .delete()
    .eq("id", commentId)
    .eq("voter_name", state.voterName);
  if (error) {
    console.warn("Unable to delete paper comment", error);
    window.alert("Could not delete comment. Check Supabase delete policy.");
  }
  await loadComments();
  renderPapers();
}

async function postFeedback(message) {
  if (!requireAccess()) return;
  const trimmed = message.trim();
  if (!trimmed) return;

  const item = {
    id: `${Date.now()}`,
    message: trimmed,
    voter_name: state.voterName,
    created_at: new Date().toISOString(),
  };
  state.feedbackPage = 1;
  state.feedback = [item, ...state.feedback].slice(0, MAX_LOCAL_FEEDBACK);
  renderFeedback();
  feedbackInput.value = "";

  if (!state.supabase) {
    saveLocalFeedback();
    return;
  }

  const { data, error } = await state.supabase
    .from("feedback_posts")
    .insert({ message: trimmed, voter_name: state.voterName });
  if (error) {
    console.warn("Unable to post feedback", error);
    await loadFeedback();
  }
}

async function editFeedback(feedbackId) {
  if (!requireAccess()) return;
  const feedback = state.feedback.find((item) => String(item.id) === String(feedbackId));
  if (!feedback || !isOwnItem(feedback)) return;
  const next = window.prompt("Edit feedback", feedback.message);
  if (next === null) return;
  const trimmed = next.trim();
  if (!trimmed) return;

  feedback.message = trimmed;
  renderFeedback();

  if (!state.supabase) {
    saveLocalFeedback();
    return;
  }

  const { error } = await state.supabase
    .from("feedback_posts")
    .update({ message: trimmed })
    .eq("id", feedbackId)
    .eq("voter_name", state.voterName);
  if (error) {
    console.warn("Unable to edit feedback", error);
    window.alert("Could not edit feedback. Check Supabase update policy.");
  }
  await loadFeedback();
}

async function deleteFeedback(feedbackId) {
  if (!requireAccess()) return;
  const feedback = state.feedback.find((item) => String(item.id) === String(feedbackId));
  if (!feedback || !isOwnItem(feedback)) return;
  if (!window.confirm("Delete this feedback?")) return;

  state.feedback = state.feedback.filter((item) => String(item.id) !== String(feedbackId));
  renderFeedback();

  if (!state.supabase) {
    saveLocalFeedback();
    return;
  }

  const { error } = await state.supabase
    .from("feedback_posts")
    .delete()
    .eq("id", feedbackId)
    .eq("voter_name", state.voterName);
  if (error) {
    console.warn("Unable to delete feedback", error);
    window.alert("Could not delete feedback. Check Supabase delete policy.");
  }
  await loadFeedback();
}

async function loadVotes() {
  if (!state.voterName) return;
  if (!state.supabase) {
    loadLocalVotes();
    return;
  }

  const { data, error } = await state.supabase.from("paper_votes").select("paper_id,voter_name");
  if (error) {
    console.warn("Unable to load AIDAS votes", error);
    return;
  }

  const counts = new Map();
  const voted = new Set();
  for (const vote of data || []) {
    counts.set(vote.paper_id, (counts.get(vote.paper_id) || 0) + 1);
    if (vote.voter_name === state.voterName) voted.add(vote.paper_id);
  }
  state.voteCounts = counts;
  state.voted = voted;
}

async function toggleVote(paperId) {
  if (!requireAccess()) return;
  const hasVote = state.voted.has(paperId);

  if (hasVote) {
    state.voted.delete(paperId);
    state.voteCounts.set(paperId, Math.max(0, voteCount(paperId) - 1));
  } else {
    state.voted.add(paperId);
    state.voteCounts.set(paperId, voteCount(paperId) + 1);
  }
  renderPapers();

  if (!state.supabase) {
    saveLocalVotes();
    return;
  }

  const request = hasVote
    ? state.supabase.from("paper_votes").delete().eq("paper_id", paperId).eq("voter_name", state.voterName)
    : state.supabase.from("paper_votes").insert({ paper_id: paperId, voter_name: state.voterName });
  const { error } = await request;
  if (error) {
    console.warn("Unable to update AIDAS vote", error);
    await loadVotes();
    renderPapers();
  }
}

async function loadSaves() {
  // Always seed from this member's local cache so bookmarks survive offline / before
  // the Supabase table exists, then overlay the remote set as the cross-device source.
  loadLocalSaves();
  if (!state.supabase || !state.voterName) return;

  const { data, error } = await state.supabase
    .from("paper_saves")
    .select("paper_id")
    .eq("voter_name", state.voterName);
  if (error) {
    // Table/policies not ready or offline: keep the local cache as-is.
    console.warn("Unable to load AIDAS saves (kept locally)", error);
    return;
  }

  const remote = new Set((data || []).map((row) => row.paper_id));
  if (remote.size === 0 && state.saved.size > 0) {
    // Remote is empty but this member has local bookmarks (e.g. saved before the
    // table existed). Keep them and push them up rather than wiping them.
    const rows = [...state.saved].map((paperId) => ({ paper_id: paperId, voter_name: state.voterName }));
    const { error: pushError } = await state.supabase.from("paper_saves").insert(rows);
    if (pushError) console.warn("Unable to back up local saves", pushError);
    return;
  }

  state.saved = remote;
  saveLocalSaves();
}

async function toggleSave(paperId) {
  if (!requireAccess()) return;
  const hasSave = state.saved.has(paperId);

  if (hasSave) {
    state.saved.delete(paperId);
  } else {
    state.saved.add(paperId);
  }
  saveLocalSaves();
  renderTabs();
  renderPapers();

  if (!state.supabase) return;

  const request = hasSave
    ? state.supabase.from("paper_saves").delete().eq("paper_id", paperId).eq("voter_name", state.voterName)
    : state.supabase.from("paper_saves").insert({ paper_id: paperId, voter_name: state.voterName });
  const { error } = await request;
  if (error) {
    // Keep the optimistic local state; the localStorage cache already persisted it.
    console.warn("Unable to sync AIDAS save (kept locally)", error);
  }
}

function matchesPaper(paper) {
  const categories = categoriesFor(paper);
  const categoryMatch =
    state.category === "All" ||
    (state.category === "Added Today" && isAddedToday(paper)) ||
    (state.category === "Saved" && state.saved.has(paper.id)) ||
    categories.includes(state.category);
  const newestMatch = isWithinNewestWindow(paper);
  const haystack = [
    paper.id,
    paper.title,
    ...categories,
    paper.authors,
    paper.org,
    paper.summary,
    paper.code || "",
    paper.project || "",
    paper.source || "",
    ...(paper.matchedBy || []),
  ]
    .join(" ")
    .toLowerCase();
  return categoryMatch && newestMatch && haystack.includes(state.query.toLowerCase().trim());
}

function parseDate(paper) {
  const value = paper.published || "";
  const match = String(value).match(/\d{4}-\d{2}-\d{2}/);
  return match ? new Date(`${match[0]}T00:00:00Z`).getTime() : 0;
}

function isWithinNewestWindow(paper) {
  if (state.newest === "all") return true;
  const publishedAt = parseDate(paper);
  if (!publishedAt) return false;
  const days = Number(state.newest);
  return Date.now() - publishedAt <= days * 24 * 60 * 60 * 1000;
}

function comparePapers(a, b) {
  if (state.sort === "aidas") {
    return (
      voteCount(b.id) - voteCount(a.id) ||
      (b.score || 0) - (a.score || 0) ||
      parseDate(b) - parseDate(a) ||
      a.title.localeCompare(b.title)
    );
  }
  if (state.sort === "newest") {
    return parseAddedDate(b) - parseAddedDate(a) || parseDate(b) - parseDate(a) || (b.score || 0) - (a.score || 0);
  }
  if (state.sort === "comments") {
    return (
      commentCount(b.id) - commentCount(a.id) ||
      voteCount(b.id) - voteCount(a.id) ||
      (b.score || 0) - (a.score || 0) ||
      parseDate(b) - parseDate(a) ||
      a.title.localeCompare(b.title)
    );
  }
  if (state.sort === "title") {
    return a.title.localeCompare(b.title);
  }
  return (b.score || 0) - (a.score || 0) || parseDate(b) - parseDate(a) || a.title.localeCompare(b.title);
}

function resetPage() {
  state.page = 1;
}

function renderTabs() {
  categoryTabs.innerHTML = categories
    .map((category) => {
      // Only the "All" tab carries a count (the total paper number).
      const badge = category === "All" ? `<span class="tab-count">${state.papers.length}</span>` : "";
      return `
        <button class="tab" type="button" aria-pressed="${state.category === category}" data-category="${category}">
          <span>${category}</span>${badge}
        </button>
      `;
    })
    .join("");
}

function renderPagination(totalItems) {
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  if (totalItems <= PAGE_SIZE || state.view === "feedback") {
    pagination.hidden = true;
    pagination.innerHTML = "";
    return;
  }

  pagination.hidden = false;
  const current = Math.min(state.page, totalPages);
  const start = (current - 1) * PAGE_SIZE + 1;
  const end = Math.min(current * PAGE_SIZE, totalItems);
  const pages = Array.from({ length: totalPages }, (_, index) => index + 1).filter(
    (page) => page === 1 || page === totalPages || Math.abs(page - current) <= 1,
  );
  const pageButtons = pages
    .map((page, index) => {
      const previous = pages[index - 1];
      const gap = previous && page - previous > 1 ? `<span class="page-gap">...</span>` : "";
      return `${gap}<button type="button" data-page="${page}" aria-current="${page === current ? "page" : "false"}">${page}</button>`;
    })
    .join("");

  pagination.innerHTML = `
    <span class="page-status">${start}-${end} of ${totalItems}</span>
    <div class="page-actions">
      <button type="button" data-page="${current - 1}" ${current === 1 ? "disabled" : ""}>Prev</button>
      ${pageButtons}
      <button type="button" data-page="${current + 1}" ${current === totalPages ? "disabled" : ""}>Next</button>
    </div>
  `;
}

function renderPapers() {
  const visible = state.papers.filter(matchesPaper).sort(comparePapers);
  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  state.page = Math.min(Math.max(1, state.page), totalPages);
  const pageStart = (state.page - 1) * PAGE_SIZE;
  const pageItems = visible.slice(pageStart, pageStart + PAGE_SIZE);

  if (!visible.length) {
    paperGrid.innerHTML = `<div class="empty">No papers match this filter.</div>`;
    renderPagination(0);
    return;
  }

  paperGrid.innerHTML = pageItems
    .map((paper) => {
      const saved = state.saved.has(paper.id);
      const projectLink = paper.project
        ? `<a href="${paper.project}" target="_blank" rel="noopener noreferrer">Project</a>`
        : "";
      const codeLink = paper.code
        ? `<a href="${paper.code}" target="_blank" rel="noopener noreferrer">Code</a>`
        : "";
      const summary = paper.summary || "TLDR pending.";
      const votes = voteCount(paper.id);
      const voted = state.voted.has(paper.id);
      const comments = state.comments.get(paper.id) || [];
      const commentsOpen = state.openComments.has(paper.id);
      const commentTotal = commentCount(paper.id);
      const commentPage = commentPageFor(paper.id, comments.length);
      const commentPageCount = Math.max(1, Math.ceil(comments.length / COMMENTS_PAGE_SIZE));
      const commentStart = (commentPage - 1) * COMMENTS_PAGE_SIZE;
      const visibleComments = comments.slice(commentStart, commentStart + COMMENTS_PAGE_SIZE);
      const score = Number(paper.score) || 0;
      const byline = [formatAuthors(paper.authors), paper.org, paper.published]
        .filter(Boolean)
        .map((part) => `<span>${escapeHtml(part)}</span>`)
        .join('<i aria-hidden="true">·</i>');
      return `
        <article class="paper-row${saved ? " is-saved" : ""}">
          <a class="row-thumb-link" href="${paperUrl(paper)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${escapeHtml(paper.title)}">
            ${thumbFor(paper)}
          </a>
          <div class="row-main">
            <h3><a href="${paperUrl(paper)}" target="_blank" rel="noopener noreferrer">${paper.title}</a></h3>
            <div class="byline">${byline}</div>
            <p class="summary">${escapeHtml(summary)}</p>
            <div class="pill-row">
              ${pillsFor(paper)}
              ${displayTags(paper).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}
            </div>
            <div class="action-row">
              <button class="vote-button" type="button" data-vote="${paper.id}" aria-pressed="${voted}" title="AIDAS member vote">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3m0 11V10l4-8a3 3 0 0 1 3 3v4h5a3 3 0 0 1 3 3l-1 7a3 3 0 0 1-3 3H7Z"></path>
                </svg>
                <span>Upvote</span>
                <strong>${votes}</strong>
              </button>
              <button class="comment-toggle" type="button" data-comments="${paper.id}" aria-expanded="${commentsOpen}">
                Comments <strong>${commentTotal}</strong>
              </button>
              <a href="${sourceUrl(paper)}" target="_blank" rel="noopener noreferrer">Source</a>
              ${projectLink}
              ${codeLink}
            </div>
            ${
              commentsOpen
                ? `
                  <section class="comment-panel" aria-label="Comments for ${escapeHtml(paper.title)}">
                    <form class="comment-form" data-comment-form="${paper.id}">
                      <textarea name="comment" rows="2" maxlength="500" placeholder="Add a comment..." aria-label="Add a comment"></textarea>
                      <button type="submit">Post</button>
                    </form>
                    <div class="comment-list">
                      ${
                        comments.length
                          ? visibleComments
                              .map(
                                (comment) => `
                                  <article class="comment-item">
                                    <p>${escapeHtml(comment.message)}</p>
                                    <div>
                                      <strong>${escapeHtml(comment.voter_name || comment.name || "AIDAS")}</strong>
                                      <span>${formatFeedbackDate(comment.created_at)}</span>
                                    </div>
                                    ${
                                      isOwnItem(comment)
                                        ? `
                                          <div class="item-actions">
                                            <button type="button" data-edit-comment="${comment.id}" data-paper-id="${paper.id}">Edit</button>
                                            <button type="button" data-delete-comment="${comment.id}" data-paper-id="${paper.id}">Delete</button>
                                          </div>
                                        `
                                        : ""
                                    }
                                  </article>
                                `,
                              )
                              .join("")
                          : `<p class="comment-empty">No comments yet.</p>`
                      }
                    </div>
                    ${
                      comments.length > COMMENTS_PAGE_SIZE
                        ? `
                          <div class="comment-pager">
                            <span>${commentStart + 1}-${Math.min(commentStart + COMMENTS_PAGE_SIZE, comments.length)} of ${comments.length}</span>
                            <div>
                              <button type="button" data-comment-page="${commentPage - 1}" data-paper-id="${paper.id}" ${commentPage === 1 ? "disabled" : ""}>Prev</button>
                              <strong>${commentPage} / ${commentPageCount}</strong>
                              <button type="button" data-comment-page="${commentPage + 1}" data-paper-id="${paper.id}" ${commentPage === commentPageCount ? "disabled" : ""}>Next</button>
                            </div>
                          </div>
                        `
                        : ""
                    }
                  </section>
                `
                : ""
            }
          </div>
          <div class="row-meta">
            <button class="save-button" type="button" data-save="${paper.id}" aria-pressed="${saved}" aria-label="${saved ? "Unsave" : "Save"} ${escapeHtml(paper.title)}">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M19 21 12 17 5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16Z"></path>
              </svg>
            </button>
            ${score ? `<div class="score-metric" title="Hot signal score"><strong>${score}</strong><span>Hot</span></div>` : ""}
          </div>
        </article>
      `;
    })
    .join("");
  renderPagination(visible.length);
}

function renderHeroStats() {
  if (!heroStats) return;
  const total = state.papers.length;
  if (!total) {
    heroStats.textContent = "";
    return;
  }
  const today = state.papers.filter(isAddedToday).length;
  const parts = [`${total} papers`];
  if (today) parts.push(`${today} added today`);
  if (state.generatedAt) {
    const updated = new Date(state.generatedAt);
    if (!Number.isNaN(updated.getTime())) {
      parts.push(`updated ${updated.toISOString().slice(0, 10)}`);
    }
  }
  heroStats.textContent = parts.join("  ·  ");
}

function render() {
  updateMemberPanel();
  setView(state.view);
  renderHeroStats();
  renderTabs();
  renderPapers();
}

async function loadPapers() {
  paperGrid.innerHTML = `<div class="empty">Loading papers...</div>`;
  const response = await fetch("./papers.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to load papers.json (${response.status})`);
  const data = await response.json();
  state.generatedAt = Array.isArray(data) ? "" : data.generatedAt || "";
  state.papers = (Array.isArray(data) ? data : data.papers || []).map((paper) => ({
    ...paper,
    category: categoryFor(paper),
    categories: categoriesFor(paper),
  }));
  await loadVotes();
  await loadSaves();
  await loadComments();
  await loadFeedback();
  render();
}

categoryTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  state.category = button.dataset.category;
  state.view = "papers";
  resetPage();
  render();
});

paperGrid.addEventListener("click", (event) => {
  const editCommentButton = event.target.closest("[data-edit-comment]");
  if (editCommentButton) {
    editComment(editCommentButton.dataset.paperId, editCommentButton.dataset.editComment);
    return;
  }

  const deleteCommentButton = event.target.closest("[data-delete-comment]");
  if (deleteCommentButton) {
    deleteComment(deleteCommentButton.dataset.paperId, deleteCommentButton.dataset.deleteComment);
    return;
  }

  const commentPageButton = event.target.closest("[data-comment-page]");
  if (commentPageButton && !commentPageButton.disabled) {
    state.commentPages.set(commentPageButton.dataset.paperId, Number(commentPageButton.dataset.commentPage));
    renderPapers();
    return;
  }

  const voteButton = event.target.closest("[data-vote]");
  if (voteButton) {
    toggleVote(voteButton.dataset.vote);
    return;
  }

  const commentsButton = event.target.closest("[data-comments]");
  if (commentsButton) {
    const paperId = commentsButton.dataset.comments;
    if (state.openComments.has(paperId)) {
      state.openComments.delete(paperId);
    } else {
      state.openComments.add(paperId);
    }
    renderPapers();
    return;
  }

  const button = event.target.closest("[data-save]");
  if (!button) return;
  toggleSave(button.dataset.save);
});

paperGrid.addEventListener("submit", (event) => {
  const form = event.target.closest("[data-comment-form]");
  if (!form) return;
  event.preventDefault();
  const paperId = form.dataset.commentForm;
  const textarea = form.querySelector("textarea[name='comment']");
  postComment(paperId, textarea.value);
});

searchInput.addEventListener("input", (event) => {
  state.query = event.target.value;
  resetPage();
  setView("papers");
  renderPapers();
});

newestSelect.addEventListener("change", (event) => {
  state.newest = event.target.value;
  resetPage();
  setView("papers");
  renderPapers();
});

sortSelect.addEventListener("change", (event) => {
  state.sort = event.target.value;
  resetPage();
  setView("papers");
  renderPapers();
});

pagination.addEventListener("click", (event) => {
  const button = event.target.closest("[data-page]");
  if (!button || button.disabled) return;
  state.page = Number(button.dataset.page);
  renderPapers();
  document.querySelector("#board")?.scrollIntoView({ block: "start", behavior: "smooth" });
});

feedbackOpen.addEventListener("click", () => {
  setView("feedback");
});

feedbackClose.addEventListener("click", () => {
  setView("papers");
});

feedbackForm.addEventListener("submit", (event) => {
  event.preventDefault();
  postFeedback(feedbackInput.value);
});

feedbackRefresh.addEventListener("click", () => {
  loadFeedback();
});

feedbackList.addEventListener("click", (event) => {
  const pageButton = event.target.closest("[data-feedback-page]");
  if (pageButton && !pageButton.disabled) {
    state.feedbackPage = Number(pageButton.dataset.feedbackPage);
    renderFeedback();
    return;
  }

  const editButton = event.target.closest("[data-edit-feedback]");
  if (editButton) {
    editFeedback(editButton.dataset.editFeedback);
    return;
  }

  const deleteButton = event.target.closest("[data-delete-feedback]");
  if (deleteButton) {
    deleteFeedback(deleteButton.dataset.deleteFeedback);
  }
});

gateForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = gatePassword.value;
  const name = gateName.value.trim();
  if (password !== supabaseConfig.sharedPassword || !name) {
    gateError.textContent = "Check password and name.";
    return;
  }
  state.unlocked = true;
  state.voterName = name;
  localStorage.setItem("aidas-paper-access", "ok");
  localStorage.setItem("aidas-paper-voter", name);
  gateError.textContent = "";
  setGateVisible(false);
  await loadVotes();
  await loadSaves();
  await loadComments();
  await loadFeedback();
  updateMemberPanel();
  renderPapers();
});

aidasChangeName.addEventListener("click", () => {
  gatePassword.value = "";
  gateError.textContent = "";
  setGateVisible(true);
});

state.supabase = initSupabase();
if (!state.unlocked || !state.voterName) setGateVisible(true);
updateMemberPanel();
loadFeedback();

loadPapers().catch((error) => {
  categoryTabs.innerHTML = "";
  paperGrid.innerHTML = `<div class="empty">${error.message}</div>`;
});
