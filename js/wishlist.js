// ============================================================
//  Wishlist 领域逻辑（纯函数，不依赖 DOM，可在 Node 中测试）
// ------------------------------------------------------------
//  通用心愿单核心：只关心「心愿」本身，不关心具体分类。
//  分类专属数据统一放在 item.data 中，由分类自行解释。
// ============================================================

import { uid } from "./utils.js";

// ---------- 购买优先度（S/A/B/C 等级） ----------

export const PRIORITY_LEVELS = [
  { id: "S", label: "S", full: "S 级 · 最高优先" },
  { id: "A", label: "A", full: "A 级 · 高优先" },
  { id: "B", label: "B", full: "B 级 · 中优先" },
  { id: "C", label: "C", full: "C 级 · 低优先" },
];

export const PRIORITY_ORDER = PRIORITY_LEVELS.map((p) => p.id); // ["S","A","B","C"]

/** 归一化等级：仅接受 S/A/B/C（大小写不敏感），其余为空串（未分级） */
export function normalizePriority(v) {
  const p = String(v ?? "").trim().toUpperCase();
  return PRIORITY_ORDER.includes(p) ? p : "";
}

/** 等级排序权重：S=0 … C=3，未分级=4（始终排最后） */
export function priorityRank(v) {
  const p = normalizePriority(v);
  if (p === "") return 4;
  return PRIORITY_ORDER.indexOf(p);
}

/** 创建一条心愿 */
export function createWishlistItem({ category, title, data = {}, note = "", createdAt, priority = "" } = {}) {
  const ts = createdAt || new Date().toISOString();
  return {
    id: uid(),
    category: category || "ns_game",
    title: title || "",
    note: note || "",
    created_at: typeof ts === "string" ? ts : ts.toISOString(),
    completed: false,
    priority: normalizePriority(priority),
    data: { ...data },
  };
}

/**
 * 去重判断：同一分类下，external_id 相同则视为重复。
 * 仅当外部 ID 存在时才判定，避免误伤手动添加的心愿。
 */
export function isDuplicate(items, category, externalId) {
  if (!externalId) return false;
  return items.some(
    (it) => it.category === category && String(it.data?.external_id) === String(externalId)
  );
}

/** 按外部 ID 查找已有心愿 */
export function getByExternalId(items, category, externalId) {
  if (!externalId) return null;
  return (
    items.find(
      (it) => it.category === category && String(it.data?.external_id) === String(externalId)
    ) || null
  );
}

/**
 * 筛选。
 * category: "all" 或具体分类 id
 * status: "all" | "uncompleted" | "completed"
 * priority: "all" | "none"（未分级） | "S" | "A" | "B" | "C"
 */
export function filterItems(items, { category = "all", status = "all", priority = "all" } = {}) {
  return items.filter((it) => {
    if (category !== "all" && it.category !== category) return false;
    if (status === "uncompleted" && it.completed) return false;
    if (status === "completed" && !it.completed) return false;
    if (priority !== "all") {
      const p = normalizePriority(it.priority);
      if (priority === "none" ? p !== "" : p !== priority) return false;
    }
    return true;
  });
}

function isEmptyPrice(v) {
  return v === null || v === undefined || v === "" || Number.isNaN(Number(v));
}

/**
 * 排序。
 * by: "created_at" | "title" | "release_date" | "price"
 * order: "asc" | "desc"
 * 价格/日期为空时始终排到末尾，绝不产生 NaN/undefined。
 */
export function sortItems(items, { by = "created_at", order = "desc" } = {}) {
  const dir = order === "asc" ? 1 : -1;
  const arr = [...items];

  if (by === "priority") {
    arr.sort((a, b) => {
      const ra = priorityRank(a.priority);
      const rb = priorityRank(b.priority);
      if (ra !== rb) return (ra - rb) * dir; // desc=高优先在前(S→A→B→C→无)
      return String(b.created_at || "").localeCompare(String(a.created_at || ""));
    });
    return arr;
  }

  const keyFor = (it) => {
    switch (by) {
      case "title":
        return it.title || "";
      case "release_date":
        return it.data?.release_date || "";
      case "price":
        return it.data?.price;
      case "created_at":
      default:
        return it.created_at || "";
    }
  };

  arr.sort((a, b) => {
    const ka = keyFor(a);
    const kb = keyFor(b);

    if (by === "price") {
      const ea = isEmptyPrice(ka);
      const eb = isEmptyPrice(kb);
      if (ea && eb) return 0;
      if (ea) return 1; // 空价格排最后
      if (eb) return -1;
      return (Number(ka) - Number(kb)) * dir;
    }

    if (by === "title") {
      return String(ka).localeCompare(String(kb), "zh-Hans-CN") * dir;
    }

    // 日期 / 创建时间：ISO 字符串可字典序比较；空值排最后
    const ea = !ka;
    const eb = !kb;
    if (ea && eb) return 0;
    if (ea) return 1;
    if (eb) return -1;
    return String(ka).localeCompare(String(kb)) * dir;
  });

  return arr;
}

/** 更新单条心愿的通用字段或 data 字段 */
export function updateItem(items, id, patch = {}) {
  return items.map((it) => {
    if (it.id !== id) return it;
    const next = { ...it };
    if ("title" in patch) next.title = patch.title;
    if ("note" in patch) next.note = patch.note;
    if ("completed" in patch) next.completed = patch.completed;
    if ("category" in patch) next.category = patch.category;
    if ("priority" in patch) next.priority = normalizePriority(patch.priority);
    if ("data" in patch) next.data = { ...it.data, ...patch.data };
    return next;
  });
}

/** 删除单条心愿 */
export function removeItem(items, id) {
  return items.filter((it) => it.id !== id);
}

/** 统计：总数、已完成数 */
export function countStats(items, { category = "all" } = {}) {
  const list = filterItems(items, { category, status: "all" });
  return {
    total: list.length,
    completed: list.filter((it) => it.completed).length,
    uncompleted: list.filter((it) => !it.completed).length,
  };
}
