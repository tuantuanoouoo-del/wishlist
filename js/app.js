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
  extractDishes,
  restaurantCardHTML,
  restaurantDetailHTML,
  restaurantEditFormHTML,
  openAddRestaurant,
  renderPendingImages,
  saveRestaurant,
  handleXhsNote,
} from "./restaurant.js";
import {
  categoryChipsHTML,
  statusTabsHTML,
  priorityTabsHTML,
  prioritySelectHTML,
  priorityBadgeHTML,
  priceFieldHTML,
  priceInputHTML,
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

const CATEGORY = "ns_game"; // 游戏分类（餐厅走 restaurant.js 模块）

const state = {
  items: [],
  activeCategory: "ns_game",
  statusFilter: "uncompleted",
  priorityFilter: "all",
  sortBy: "priority",
  sortOrder: "desc",
  searchResults: [],
  searchQuery: "",
  searchLoading: false,
  searchError: "",
  releases: [],
  releasesLoading: false,
  releasesError: "",
  detailContext: { game: null, itemId: null, inWishlist: false },
  editItemId: null,
  editCategory: "ns_game",
  pendingFiles: [],
};

// 餐厅模块上下文：注入 state / persist / render，避免餐厅模块反向依赖 app.js
const restaurantCtx = { state, persist, render };

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

function findDiscoveryGame(gameId) {
  return (
    state.searchResults.find((g) => (g.id || g.external_id) === gameId) ||
    state.releases.find((g) => (g.id || g.external_id) === gameId)
  );
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
  const counts = {};
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
  getEl("statusTabs").innerHTML = statusTabsHTML(state.statusFilter, stats, state.activeCategory);
  const doneWord = state.activeCategory === "restaurant" ? "已去过" : "已购买";
  getEl("statsLine").textContent = `共 ${stats.total} 个心愿 · ${doneWord} ${stats.completed}`;
}

/** 按当前分类切换顶部区域显示（游戏搜索 vs 餐厅添加按钮），保证两页互不串场 */
function syncSections() {
  const isRestaurant = state.activeCategory === "restaurant";
  getEl("discoverySection").hidden = isRestaurant;      // 游戏搜索/新上架仅游戏页显示
  getEl("priorityToolbar").hidden = isRestaurant;       // 购买优先度仅游戏页显示
  getEl("addRestaurantBtn").hidden = !isRestaurant;     // 添加餐厅仅餐厅页显示
  getEl("syncFeishuBtn").hidden = !isRestaurant;        // 同步飞书仅餐厅页显示
  const titles = {
    ns_game: "我的 NS 卡带心愿",
    restaurant: "我的餐厅心愿",
  };
  getEl("wishlistTitle").textContent = titles[state.activeCategory] || "我的心愿";
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
  syncSections();

  const items = visibleItems();
  const grid = getEl("wishlistGrid");
  const empty = getEl("wishlistEmpty");

  if (items.length === 0) {
    grid.innerHTML = "";
    const isFiltered = state.items.length > 0;
    let emptyHTML;
    if (isFiltered) {
      emptyHTML = emptyStateHTML("🔍", "没有符合条件的心愿", "试试切换筛选或分类。");
    } else if (state.activeCategory === "restaurant") {
      emptyHTML = emptyStateHTML("🍜", "还没有收藏餐厅", "点右上角「＋ 添加餐厅」开始记录。");
    } else {
      emptyHTML = emptyStateHTML("🎮", "还没有心愿", "在上方搜索游戏，点击「加入心愿单」开始收集。");
    }
    empty.innerHTML = emptyHTML;
    empty.hidden = false;
  } else {
    empty.hidden = true;
    grid.innerHTML = items
      .map((it) => (it.category === "restaurant" ? restaurantCardHTML(it) : wishlistCardHTML(it)))
      .join("");
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

function renderReleases() {
  const section = getEl("releasesSection");
  const body = getEl("releasesBody");
  const line = getEl("releasesLine");

  if (state.releasesLoading) {
    section.hidden = false;
    line.textContent = "";
    body.innerHTML = '<div class="search-loading"><div class="spinner"></div><p>正在加载新上架…</p></div>';
    return;
  }
  if (state.releasesError) {
    section.hidden = false;
    line.textContent = "";
    body.innerHTML = messageHTML(state.releasesError, "error");
    return;
  }
  if (state.releases.length === 0) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  line.textContent = `近 90 天共 ${state.releases.length} 款新游`;
  body.innerHTML = state.releases
    .map((g) => searchResultCardHTML(g, isInWishlist(g)))
    .join("");
}

async function loadReleases() {
  state.releasesLoading = true;
  state.releasesError = "";
  renderReleases();
  try {
    const data = await api.releases();
    state.releases = data.results || [];
  } catch (err) {
    state.releasesError = err.message || "新游信息获取失败";
  } finally {
    state.releasesLoading = false;
    renderReleases();
  }
}

function render() {
  renderWishlist();
  renderSearchResults();
  renderReleases();
  syncSortUI();
}

/** 各分类可用的排序键，避免游戏字段串到餐厅页 */
function sortOptionsFor(category) {
  if (category === "restaurant") {
    return [
      { value: "created_at", label: "添加时间" },
      { value: "title", label: "店名" },
      { value: "price_per_person", label: "人均" },
    ];
  }
  if (category === "ns_game") {
    return [
      { value: "priority", label: "优先度" },
      { value: "created_at", label: "添加时间" },
      { value: "title", label: "游戏名称" },
      { value: "release_date", label: "发售日期" },
      { value: "price", label: "参考价格" },
    ];
  }
  // all（全部心愿）：只保留通用排序键
  return [
    { value: "created_at", label: "添加时间" },
    { value: "title", label: "名称" },
  ];
}

/** 各分类默认排序键：卡带按优先度（S→A→B→C 在前），餐厅按添加时间 */
function defaultSortFor(category) {
  return category === "restaurant" ? "created_at" : "priority";
}

function syncSortUI() {
  const select = getEl("sortSelect");
  const options = sortOptionsFor(state.activeCategory);
  if (!options.some((o) => o.value === state.sortBy)) {
    state.sortBy = options[0].value;
  }
  select.innerHTML = options
    .map((o) => `<option value="${o.value}">${o.label}</option>`)
    .join("");
  select.value = state.sortBy;
  getEl("sortOrderBtn").textContent = state.sortOrder === "asc" ? "升序 ↑" : "降序 ↓";
}

// ---------- 详情 / 编辑弹窗 ----------

function setDetailContent(html) {
  getEl("detailContent").innerHTML = html;
}

function setDetailTitle(text) {
  const el = document.querySelector("#detailModal .modal__title");
  if (el) el.textContent = text;
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
  setDetailTitle("游戏详情");
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

  // 餐厅：本地数据即可渲染详情，无需请求外部接口
  if (item.category === "restaurant") {
    state.detailContext = { game: null, itemId, inWishlist: true };
    setDetailTitle("餐厅详情");
    openModal("detailModal");
    setDetailContent(restaurantDetailHTML(item));
    return;
  }

  const baseGame = item.data || { id: itemId, external_id: itemId, title: item.title };
  state.detailContext = { game: baseGame, itemId, inWishlist: true };
  setDetailTitle("游戏详情");
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

async function addFromDiscovery(gameId) {
  const game = findDiscoveryGame(gameId);
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
  state.editCategory = item.category;
  state.pendingFiles = [];
  getEl("editContent").innerHTML =
    item.category === "restaurant" ? restaurantEditFormHTML(item) : editModalHTML(item);
  setEditModalTitle(item.category === "restaurant" ? "编辑餐厅" : "编辑心愿");
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

function setEditModalTitle(text) {
  const el = document.querySelector("#editModal .modal__title");
  if (el) el.textContent = text;
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

function openPrioritySelect(badge) {
  const field = badge.closest(".priority-field");
  if (!field) return;
  const item = state.items.find((i) => i.id === field.dataset.id);
  if (!item) return;
  field.innerHTML = prioritySelectHTML(item.priority, item.id);
  const select = field.querySelector("select");
  if (select) {
    select.focus();
    if (typeof select.showPicker === "function") {
      try { select.showPicker(); } catch (_) {}
    }
  }
}

function closePrioritySelect(select) {
  const field = select.closest(".priority-field");
  if (!field) return; // 已替换为徽章或已脱离 DOM
  const item = state.items.find((i) => i.id === field.dataset.id);
  if (!item) return;
  field.innerHTML = priorityBadgeHTML(item.priority, item.id);
}

function openPriceInput(button) {
  const field = button.closest(".price-field");
  if (!field) return;
  const item = state.items.find((i) => i.id === field.dataset.id);
  if (!item) return;
  field.innerHTML = priceInputHTML(item.id, item.data?.price);
  const input = field.querySelector("input");
  if (input) {
    input.focus();
    input.select();
  }
}

function closePriceInput(input) {
  const field = input.closest(".price-field");
  if (!field) return; // 已替换为文本或已脱离 DOM
  const item = state.items.find((i) => i.id === field.dataset.id);
  if (!item) return;
  field.innerHTML = priceFieldHTML(item);
}

async function saveEdit(form) {
  if (state.editCategory === "restaurant") {
    return saveRestaurant(restaurantCtx, form, state.editItemId);
  }
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
  const nowCompleted = !item.completed;
  state.items = updateItem(state.items, itemId, { completed: nowCompleted });
  persist();
  render();
  closeModal("detailModal"); // 若从餐厅详情里操作，关闭详情避免展示旧状态
  const isRestaurant = item.category === "restaurant";
  showToast(
    nowCompleted
      ? isRestaurant ? "已标记为已去过" : "已标记为已购买"
      : isRestaurant ? "已标记为未去" : "已标记为未购买",
    "success"
  );
}

function deleteItem(itemId) {
  const item = state.items.find((i) => i.id === itemId);
  if (!item) return;
  if (!window.confirm(`确定删除「${item.title}」吗？此操作不可撤销。`)) return;
  state.items = removeItem(state.items, itemId);
  persist();
  render();
  closeModal("detailModal"); // 若从餐厅详情里删除，关闭详情
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
    // 链接只负责跳转，不触发热区（避免点「小红书链接」时同时打开详情）
    if (e.target.closest("a[href]")) return;
    const target = e.target.closest("[data-action]");
    if (!target) return;
    const action = target.dataset.action;

    switch (action) {
      case "category":
        state.activeCategory = target.dataset.category;
        // 餐厅页无「购买优先度」概念：切到餐厅时清掉残留的优先度筛选，避免串场
        if (state.activeCategory === "restaurant") state.priorityFilter = "all";
        // 切分类时回到该分类的默认排序（卡带=优先度 S→A→B→C，餐厅=添加时间）
        state.sortBy = defaultSortFor(state.activeCategory);
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

      case "priority-edit":
        openPrioritySelect(target);
        break;

      case "price-edit":
        openPriceInput(target);
        break;

      case "sort-order":
        state.sortOrder = state.sortOrder === "asc" ? "desc" : "asc";
        renderWishlist();
        break;

      // 搜索结果
      case "detail": {
        const gameId = target.dataset.gameId;
        if (gameId) {
          const game = findDiscoveryGame(gameId);
          openDetail(game || gameId);
        } else if (target.dataset.id) {
          // 心愿卡片上的「查看」
          openDetailForItem(target.dataset.id);
        }
        break;
      }

      case "add":
        addFromDiscovery(target.dataset.gameId);
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

      // 餐厅：添加 / 图片移除 / 一键导入
      case "add-restaurant":
        openAddRestaurant(restaurantCtx);
        break;

      case "sync-feishu": {
        const btn = target;
        setButtonLoading(btn, true, "同步中…");
        api
          .syncFeishu()
          .then(async (r) => {
            let msg = `已同步 ${r.pushed} 家到飞书`;
            if (r.imported > 0) {
              msg += `，从飞书新增 ${r.imported} 家`;
              state.items = await loadItems();
              render();
            }
            showToast(msg, "success");
          })
          .catch((err) => showToast(err.message || "同步失败", "error"))
          .finally(() => setButtonLoading(btn, false, "📤 同步到飞书"));
        break;
      }

      case "import-xhs": {
        const input = document.getElementById("restUrl");
        const url = ((input && input.value) || "").trim();
        if (!/^https?:\/\//i.test(url)) {
          showToast("请先在「小红书链接」里粘贴笔记链接", "warn");
          if (input) input.focus();
          break;
        }
        window.open(url, "_blank");
        showToast("已打开笔记，请在笔记页点「回填到心愿单」", "info");
        break;
      }

      case "extract-dishes": {
        const form = document.getElementById("editForm");
        const note = form && form.note ? form.note.value : "";
        const dishes = extractDishes(note);
        if (!dishes.length) {
          showToast("没从正文里识别出菜名，请手动填写", "warn");
        } else {
          form.dishes.value = dishes.join("、");
          showToast(`已提取 ${dishes.length} 个候选菜名，请核对`, "success");
        }
        break;
      }

      case "img-remove": {
        const thumb = target.closest(".img-thumb");
        if (thumb) thumb.remove();
        break;
      }

      case "img-remove-new": {
        const idx = Number(target.dataset.index);
        if (!Number.isNaN(idx) && idx >= 0 && idx < state.pendingFiles.length) {
          state.pendingFiles.splice(idx, 1);
          renderPendingImages(restaurantCtx);
        }
        break;
      }

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

  // 卡片上的优先度下拉：选择后保存并重渲染（更新等级、排序、标签计数）
  document.addEventListener("change", (e) => {
    const sel = e.target.closest('[data-action="priority-select"]');
    if (!sel) return;
    const item = state.items.find((i) => i.id === sel.dataset.id);
    if (!item) return;
    state.items = updateItem(state.items, item.id, { priority: sel.value });
    persist();
    renderWishlist();
  });

  // 餐厅表单：选择图片文件后加入待上传列表并预览
  document.addEventListener("change", (e) => {
    if (e.target && e.target.id === "restFileInput") {
      const files = [...(e.target.files || [])];
      const ok = [];
      let skipped = 0;
      for (const f of files) {
        if (f.size > 3 * 1024 * 1024) skipped += 1;
        else ok.push(f);
      }
      if (ok.length) {
        state.pendingFiles.push(...ok);
        renderPendingImages(restaurantCtx);
      }
      if (skipped > 0) showToast(`已跳过 ${skipped} 张超过 3MB 的图片`, "warn");
      e.target.value = "";
    }
  });

  // 接收篡改猴脚本从小红书标签页回传的笔记内容
  window.addEventListener("message", (e) => {
    const data = e.data;
    if (!data || data.type !== "XHS_NOTE") return;
    handleXhsNote(restaurantCtx, data);
  });

  // 优先度下拉失焦未选择 → 收回为徽章（不保存）
  document.addEventListener("focusout", (e) => {
    const sel = e.target.closest && e.target.closest('[data-action="priority-select"]');
    if (!sel) return;
    closePrioritySelect(sel);
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
      input.value = String(saved); // 还原，避免失焦误存
      closePriceInput(input);
    }
  });

  // 卡片参考价格：失焦自动保存并收回为文本
  document.addEventListener("focusout", (e) => {
    const input = e.target.closest && e.target.closest('[data-action="price-input"]');
    if (!input || !input.isConnected) return; // 已由 Enter/Esc 处理
    savePriceFromInput(input);
    closePriceInput(input);
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
  loadReleases(); // 打开页面自动加载近三个月新上架
}

init();
