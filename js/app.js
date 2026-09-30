// ============================================================
//  应用主控：状态管理 + 事件编排 + 渲染调度
// ============================================================

import { $, $$, isEmpty, isNumeric, formatPrice } from "./utils.js";
import { getEnabledCategories } from "./categories.js";
import { loadItems, saveItems, loadLegacyItems } from "./storage.js";
import {
  createWishlistItem,
  isDuplicate,
  getByExternalId,
  filterItems,
  sortItems,
  updateItem,
  removeItem,
  countStats,
  normalizePriority,
  PRIORITY_LEVELS,
} from "./wishlist.js";
import { api, ApiError } from "./api.js";
import {
  categoryChipsHTML,
  statusTabsHTML,
  priorityTabsHTML,
  wishlistCardHTML,
  searchResultCardHTML,
  detailModalHTML,
  editModalHTML,
  emptyStateHTML,
  messageHTML,
  openModal,
  closeModal,
  openLightbox,
  closeLightbox,
  showToast,
  setButtonLoading,
} from "./ui.js";

const CATEGORY = "ns_game"; // 第一阶段唯一启用的分类

const state = {
  items: [],
  activeCategory: "all",
  statusFilter: "all",
  priorityFilter: "all",
  sortBy: "created_at",
  sortOrder: "desc",
  searchResults: [],
  searchQuery: "",
  searchLoading: false,
  searchError: "",
  detailContext: { game: null, itemId: null, inWishlist: false },
  editItemId: null,
};

// ---------- 工具 ----------

const getEl = (id) => document.getElementById(id);

function persist() {
  saveItems(state.items).catch(() => {
    showToast("保存失败，请检查网络或稍后重试", "error");
  });
}

function isInWishlist(game) {
  const externalId = game?.external_id || game?.id;
  return !!getByExternalId(state.items, CATEGORY, externalId);
}

function visibleItems() {
  const filtered = filterItems(state.items, {
    category: state.activeCategory,
    status: state.statusFilter,
    priority: state.priorityFilter,
  });
  return sortItems(filtered, { by: state.sortBy, order: state.sortOrder });
}

// ---------- 渲染 ----------

function renderCategoryNav() {
  const counts = { all: state.items.length };
  for (const c of getEnabledCategories()) {
    counts[c.id] = state.items.filter((it) => it.category === c.id).length;
  }
  getEl("categoryNav").innerHTML = categoryChipsHTML(
    getEnabledCategories(),
    state.activeCategory,
    counts
  );
}

function renderToolbar() {
  const stats = countStats(state.items, { category: state.activeCategory });
  getEl("statusTabs").innerHTML = statusTabsHTML(state.statusFilter, stats);
  getEl("statsLine").textContent = `共 ${stats.total} 个心愿 · 已购买 ${stats.completed}`;
}

function priorityCounts() {
  const counts = { all: state.items.length, none: 0 };
  for (const lvl of PRIORITY_LEVELS) counts[lvl.id] = 0;
  for (const it of state.items) {
    const p = normalizePriority(it.priority);
    if (p) counts[p] += 1;
    else counts.none += 1;
  }
  return counts;
}

function renderPriorityTabs() {
  getEl("priorityTabs").innerHTML = priorityTabsHTML(state.priorityFilter, priorityCounts());
}

function renderWishlist() {
  renderCategoryNav();
  renderToolbar();
  renderPriorityTabs();

  const items = visibleItems();
  const grid = getEl("wishlistGrid");
  const empty = getEl("wishlistEmpty");

  if (items.length === 0) {
    grid.innerHTML = "";
    const isFiltered =
      state.statusFilter !== "all" ||
      state.activeCategory !== "all" ||
      state.priorityFilter !== "all";
    empty.innerHTML = isFiltered
      ? emptyStateHTML("🔍", "没有符合条件的心愿", "试试切换筛选或分类。")
      : emptyStateHTML("🎮", "还没有心愿", "在上方搜索游戏，点击「加入心愿单」开始收集。");
    empty.hidden = false;
  } else {
    empty.hidden = true;
    grid.innerHTML = items.map(wishlistCardHTML).join("");
  }
}

function renderSearchResults() {
  const section = getEl("searchResults");
  const body = getEl("searchResultsBody");
  const q = state.searchQuery.trim();

  if (!q) {
    section.hidden = true;
    return;
  }
  section.hidden = false;

  if (state.searchLoading) {
    body.innerHTML = '<div class="search-loading"><div class="spinner"></div><p>正在搜索…</p></div>';
    return;
  }
  if (state.searchError) {
    body.innerHTML = messageHTML(state.searchError, "error");
    return;
  }
  if (state.searchResults.length === 0) {
    body.innerHTML = messageHTML("没有找到对应游戏，可以尝试其他名称。", "empty");
    return;
  }

  body.innerHTML = state.searchResults
    .map((g) => searchResultCardHTML(g, isInWishlist(g)))
    .join("");
}

function render() {
  renderWishlist();
  renderSearchResults();
  syncSortUI();
}

function syncSortUI() {
  getEl("sortSelect").value = state.sortBy;
  getEl("sortOrderBtn").textContent = state.sortOrder === "asc" ? "升序 ↑" : "降序 ↓";
}

// ---------- 详情 / 编辑弹窗 ----------

function setDetailContent(html) {
  getEl("detailContent").innerHTML = html;
}

async function openDetail(source) {
  // source：标准化游戏对象，或游戏外部 ID 字符串
  let baseGame;
  let itemId = null;
  if (typeof source === "string") {
    baseGame = { id: source, external_id: source };
  } else {
    baseGame = source;
  }

  state.detailContext = { game: baseGame, itemId, inWishlist: isInWishlist(baseGame) };
  openModal("detailModal");
  setDetailContent(detailModalHTML(baseGame, { loading: true }));

  const externalId = baseGame.external_id || baseGame.id;
  try {
    const { game } = await api.getGame(externalId);
    state.detailContext.game = game;
    state.detailContext.inWishlist = isInWishlist(game);
    setDetailContent(detailModalHTML(game, { inWishlist: state.detailContext.inWishlist }));
    if (itemId) enrichStoredItem(itemId, game);
  } catch (err) {
    setDetailContent(
      detailModalHTML(baseGame, {
        inWishlist: state.detailContext.inWishlist,
        fetchError: true,
      })
    );
  }
}

/** 从心愿卡片打开详情：用已存数据渲染，成功后回填完整数据 */
async function openDetailForItem(itemId) {
  const item = state.items.find((i) => i.id === itemId);
  if (!item) return;
  const baseGame = item.data || { id: itemId, external_id: itemId, title: item.title };
  state.detailContext = { game: baseGame, itemId, inWishlist: true };
  openModal("detailModal");
  setDetailContent(detailModalHTML(baseGame, { inWishlist: true }));

  const externalId = baseGame.external_id || baseGame.id;
  try {
    const { game } = await api.getGame(externalId);
    state.detailContext.game = game;
    setDetailContent(detailModalHTML(game, { inWishlist: true }));
    enrichStoredItem(itemId, game);
  } catch (err) {
    setDetailContent(detailModalHTML(baseGame, { inWishlist: true, fetchError: true }));
  }
}

/** 用完整详情回填已存心愿（保留用户价格/备注） */
function enrichStoredItem(itemId, game) {
  const item = state.items.find((i) => i.id === itemId);
  if (!item) return;
  const merged = { ...game, price: item.data?.price };
  state.items = updateItem(state.items, itemId, { data: merged });
  persist();
  render();
}

// ---------- 心愿单操作 ----------

function addGameToWishlist(game) {
  const externalId = game?.external_id || game?.id;
  if (!externalId) {
    showToast("无法识别该游戏，加入失败。", "error");
    return null;
  }
  if (isDuplicate(state.items, CATEGORY, externalId)) {
    showToast("该游戏已在心愿单中", "warn");
    return null;
  }
  const item = createWishlistItem({
    category: CATEGORY,
    title: game.title || game.name_cn || game.name_en,
    data: { ...game },
  });
  state.items = [item, ...state.items];
  persist();
  render();
  showToast("已加入心愿单", "success");
  return item;
}

async function addFromSearch(gameId) {
  const game = state.searchResults.find((g) => (g.id || g.external_id) === gameId);
  if (!game) return;
  // 尝试获取完整详情（含截图/简介）再入库；失败则用列表数据
  let full = game;
  try {
    const r = await api.getGame(gameId);
    full = r.game;
  } catch (err) {
    /* 忽略，使用列表数据 */
  }
  addGameToWishlist(full);
}

function addFromDetail() {
  const game = state.detailContext.game;
  const item = addGameToWishlist(game);
  if (item) {
    state.detailContext.inWishlist = true;
    state.detailContext.itemId = item.id;
    setDetailContent(detailModalHTML(game, { inWishlist: true }));
    renderSearchResults();
  }
}

function openEdit(itemId) {
  const item = state.items.find((i) => i.id === itemId);
  if (!item) return;
  state.editItemId = itemId;
  getEl("editContent").innerHTML = editModalHTML(item);
  openModal("editModal");
}

function openEditForCurrentDetail() {
  const ctx = state.detailContext;
  let itemId = ctx.itemId;
  if (!itemId) {
    const item = getByExternalId(state.items, CATEGORY, ctx.game?.external_id || ctx.game?.id);
    if (!item) return;
    itemId = item.id;
  }
  closeModal("detailModal");
  openEdit(itemId);
}

function parsePrice(str) {
  if (isEmpty(str)) return null;
  const n = Number(str);
  return Number.isFinite(n) ? n : null;
}

function savePriceFromInput(input) {
  const item = state.items.find((i) => i.id === input.dataset.id);
  if (!item) return;
  const price = parsePrice(input.value);
  state.items = updateItem(state.items, item.id, { data: { price } });
  persist();
}

function saveEdit(form) {
  const itemId = state.editItemId;
  if (!itemId) return;
  const title = form.title.value.trim();
  const note = form.note.value.trim();
  const price = parsePrice(form.price.value);
  const completed = form.completed.checked;
  const priority = normalizePriority(form.priority.value);

  if (!title) {
    showToast("名称不能为空", "warn");
    return;
  }

  state.items = updateItem(state.items, itemId, {
    title,
    note,
    completed,
    priority,
    data: { price },
  });
  persist();
  render();
  closeModal("editModal");
  state.editItemId = null;
  showToast("已保存", "success");
}

function toggleCompleted(itemId) {
  const item = state.items.find((i) => i.id === itemId);
  if (!item) return;
  state.items = updateItem(state.items, itemId, { completed: !item.completed });
  persist();
  render();
}

function deleteItem(itemId) {
  const item = state.items.find((i) => i.id === itemId);
  if (!item) return;
  if (!window.confirm(`确定删除「${item.title}」吗？此操作不可撤销。`)) return;
  state.items = removeItem(state.items, itemId);
  persist();
  render();
  showToast("已删除", "info");
}

// ---------- 搜索 ----------

async function doSearch(q) {
  q = q.trim();
  if (!q) return;
  state.searchQuery = q;
  state.searchLoading = true;
  state.searchError = "";
  state.searchResults = [];
  renderSearchResults();
  setButtonLoading(getEl("searchButton"), true);

  try {
    const data = await api.searchGames(q);
    state.searchResults = data.results || [];
    if (state.searchResults.length === 0) {
      state.searchError = "没有找到对应游戏，可以尝试其他名称。";
    }
  } catch (err) {
    if (err instanceof ApiError && err.status === 503) {
      state.searchError = err.message; // 未配置 Key 等
    } else {
      state.searchError = "游戏信息获取失败，请检查网络或稍后重试。";
    }
  } finally {
    state.searchLoading = false;
    setButtonLoading(getEl("searchButton"), false);
    renderSearchResults();
  }
}

// ---------- 健康检查 ----------

async function checkHealth() {
  const banner = getEl("serverBanner");
  try {
    const h = await api.health();
    if (!h.keyConfigured) {
      banner.hidden = false;
      banner.textContent = "⚠️ 尚未配置 RAWG API Key：搜索不可用。请复制 .env.example 为 .env 并填写 Key 后重启服务。";
      banner.className = "banner banner--warn";
    }
  } catch (err) {
    banner.hidden = false;
    banner.textContent = "⚠️ 无法连接后端服务。请运行 `node server/server.js` 启动服务后刷新。";
    banner.className = "banner banner--error";
  }
}

// ---------- 事件绑定 ----------

function bindEvents() {
  // 全局点击委托：所有 data-action 按钮
  document.addEventListener("click", (e) => {
    const target = e.target.closest("[data-action]");
    if (!target) return;
    const action = target.dataset.action;

    switch (action) {
      case "category":
        state.activeCategory = target.dataset.category;
        renderWishlist();
        break;

      case "status":
        state.statusFilter = target.dataset.status;
        renderWishlist();
        break;

      case "priority":
        state.priorityFilter = target.dataset.priority || "all";
        renderWishlist();
        break;

      case "sort-order":
        state.sortOrder = state.sortOrder === "asc" ? "desc" : "asc";
        renderWishlist();
        break;

      // 搜索结果
      case "detail": {
        const gameId = target.dataset.gameId;
        if (gameId) {
          const game = state.searchResults.find((g) => (g.id || g.external_id) === gameId);
          openDetail(game || gameId);
        } else if (target.dataset.id) {
          // 心愿卡片上的「查看」
          openDetailForItem(target.dataset.id);
        }
        break;
      }

      case "add":
        addFromSearch(target.dataset.gameId);
        break;

      // 心愿卡片操作
      case "edit":
        openEdit(target.dataset.id);
        break;

      case "toggle":
        toggleCompleted(target.dataset.id);
        break;

      case "delete":
        deleteItem(target.dataset.id);
        break;

      // 详情弹窗
      case "add-wish":
        addFromDetail();
        break;

      case "edit-wish":
        openEditForCurrentDetail();
        break;

      // 编辑弹窗
      case "clear-price":
        getEl("editPrice").value = "";
        break;

      // 灯箱
      case "lightbox":
        openLightbox(target.dataset.url);
        break;

      // 简介中英文切换
      case "toggle-desc": {
        const section = target.closest(".detail-section");
        if (!section) break;
        const zh = section.querySelector('[data-desc="zh"]');
        const en = section.querySelector('[data-desc="en"]');
        if (zh && en) {
          const showingZh = !zh.hidden;
          zh.hidden = showingZh;
          en.hidden = !showingZh;
          target.textContent = showingZh ? "查看中文翻译" : "查看英文原文";
        }
        break;
      }

      // 关闭弹窗 / 灯箱
      case "modal-close":
        closeModal(target.dataset.modal || "detailModal");
        break;

      case "lightbox-close":
        closeLightbox();
        break;

      default:
        break;
    }
  });

  // 搜索表单
  getEl("searchForm").addEventListener("submit", (e) => {
    e.preventDefault();
    doSearch(getEl("searchInput").value);
  });

  // 排序选择
  getEl("sortSelect").addEventListener("change", (e) => {
    state.sortBy = e.target.value;
    renderWishlist();
  });

  // 卡片上的优先度下拉（委托监听 change）
  document.addEventListener("change", (e) => {
    const sel = e.target.closest('[data-action="priority-select"]');
    if (!sel) return;
    const item = state.items.find((i) => i.id === sel.dataset.id);
    if (!item) return;
    state.items = updateItem(state.items, item.id, { priority: sel.value });
    persist();
    renderWishlist();
  });

  // 卡片参考价格：回车确定 / Esc 放弃
  document.addEventListener("keydown", (e) => {
    const input = e.target.closest('[data-action="price-input"]');
    if (!input) return;
    if (e.key === "Enter") {
      e.preventDefault();
      savePriceFromInput(input);
      renderWishlist();
      showToast("价格已保存", "success");
    } else if (e.key === "Escape") {
      e.preventDefault();
      const item = state.items.find((i) => i.id === input.dataset.id);
      const saved = item?.data?.price != null ? item.data.price : "";
      input.value = String(saved); // 还原为已保存值
      input.blur();
    }
  });

  // 卡片参考价格：失焦自动保存（不重渲染，避免打断焦点）
  document.addEventListener("focusout", (e) => {
    const input = e.target.closest('[data-action="price-input"]');
    if (!input) return;
    savePriceFromInput(input);
  });

  // 编辑表单提交（editForm 由 JS 动态注入，需用事件委托）
  document.addEventListener("submit", (e) => {
    if (e.target && e.target.id === "editForm") {
      e.preventDefault();
      saveEdit(e.target);
    }
  });

  // ESC 关闭弹窗 / 灯箱
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (document.querySelector(".lightbox--open")) closeLightbox();
    else if (document.querySelector(".modal--open")) {
      document.querySelectorAll(".modal--open").forEach((m) => {
        const id = m.id;
        closeModal(id);
      });
    }
  });

  // 点击遮罩关闭弹窗
  document.querySelectorAll(".modal").forEach((modal) => {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal(modal.id);
    });
  });
}

// ---------- 启动 ----------

async function init() {
  let items = await loadItems();

  // 一次性迁移：早期 localStorage 版数据 → 服务器（仅当服务器为空时）
  if (items.length === 0) {
    const legacy = loadLegacyItems();
    if (legacy.length > 0) {
      items = legacy;
      persist();
    }
  }

  state.items = items;
  bindEvents();
  render();
  checkHealth();
}

init();
