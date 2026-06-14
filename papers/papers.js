const categories = [
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

const state = {
  category: "All",
  newest: "all",
  page: 1,
  query: "",
  saved: new Set(JSON.parse(localStorage.getItem("paper-board-saved") || "[]")),
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
};

const aidasGate = document.querySelector("#aidasGate");
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

function paperUrl(paper) {
  if (paper.paper) return paper.paper;
  if (paper.url_abs) return paper.url_abs;
  if (paper.id && /^\d{4}\.\d+/.test(paper.id)) return `https://arxiv.org/abs/${paper.id}`;
  return paper.source || "#";
}

function sourceUrl(paper) {
  return paper.source || paperUrl(paper);
}

function saveState() {
  localStorage.setItem("paper-board-saved", JSON.stringify([...state.saved]));
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
  localStorage.setItem(localFeedbackKey(), JSON.stringify(state.feedback.slice(0, 20)));
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
  feedbackList.innerHTML = state.feedback
    .slice(0, 8)
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
    .join("");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
    .limit(20);
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
  state.comments.set(paperId, [item, ...current].slice(0, 20));
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
  state.feedback = [item, ...state.feedback].slice(0, 20);
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

function matchesPaper(paper) {
  const categories = categoriesFor(paper);
  const categoryMatch = state.category === "All" || categories.includes(state.category);
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
    return parseDate(b) - parseDate(a) || (b.score || 0) - (a.score || 0);
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
      const count =
        category === "All"
          ? state.papers.length
          : state.papers.filter((paper) => categoriesFor(paper).includes(category)).length;
      return `
        <button class="tab" type="button" aria-pressed="${state.category === category}" data-category="${category}">
          ${category} · ${count}
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
      const categoryPills = categoriesFor(paper)
        .map((category) => `<span class="category-pill">${category}</span>`)
        .join("");
      const votes = voteCount(paper.id);
      const voted = state.voted.has(paper.id);
      const comments = state.comments.get(paper.id) || [];
      const commentsOpen = state.openComments.has(paper.id);
      const commentTotal = commentCount(paper.id);
      const commentPage = commentPageFor(paper.id, comments.length);
      const commentPageCount = Math.max(1, Math.ceil(comments.length / COMMENTS_PAGE_SIZE));
      const commentStart = (commentPage - 1) * COMMENTS_PAGE_SIZE;
      const visibleComments = comments.slice(commentStart, commentStart + COMMENTS_PAGE_SIZE);
      return `
        <article class="paper-card">
          <div class="paper-body">
            <div class="card-head">
              <div class="category-row">${categoryPills}</div>
              <button class="save-button" type="button" data-save="${paper.id}" aria-pressed="${saved}" aria-label="${saved ? "Unsave" : "Save"} ${paper.title}">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M19 21 12 17 5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16Z"></path>
                </svg>
              </button>
            </div>
            <h3><a href="${paperUrl(paper)}" target="_blank" rel="noopener noreferrer">${paper.title}</a></h3>
            <div class="meta">
              ${paper.org ? `<span>${paper.org}</span>` : ""}
              <span>${paper.published || ""}</span>
              <span>${paper.authors || ""}</span>
            </div>
            <p class="summary">${paper.summary || ""}</p>
            <div class="tag-row">
              ${(paper.matchedBy || []).map((tag) => `<span class="tag">${tag}</span>`).join("")}
            </div>
            <div class="card-footer">
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
        </article>
      `;
    })
    .join("");
  renderPagination(visible.length);
}

function render() {
  updateMemberPanel();
  setView(state.view);
  renderTabs();
  renderPapers();
}

async function loadPapers() {
  paperGrid.innerHTML = `<div class="empty">Loading papers...</div>`;
  const response = await fetch("./papers.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to load papers.json (${response.status})`);
  const data = await response.json();
  state.papers = (Array.isArray(data) ? data : data.papers || []).map((paper) => ({
    ...paper,
    category: categoryFor(paper),
    categories: categoriesFor(paper),
  }));
  await loadVotes();
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
  const id = button.dataset.save;
  if (state.saved.has(id)) {
    state.saved.delete(id);
  } else {
    state.saved.add(id);
  }
  saveState();
  renderPapers();
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
