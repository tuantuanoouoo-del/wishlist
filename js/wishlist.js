// ============================================================
//  Wishlist 领域逻辑（纯函数，不依赖 DOM，可在 Node 中测试）
// ------------------------------------------------------------
//  通用心愿单核心：只关心「心愿」本身，不关心具体分类。
//  分类专属数据统一放在 item.data 中，由分类自行解释。
// ============================================================

import { uid } from "./utils.js";

/** 创建一条心愿 */
export function createWishlistItem({ category, title, data = {}, note = "", createdAt } = {}) {
  const ts = createdAt || new Date().toISOString();
  return {
    id: uid(),
    category: category || "ns_game",
    title: title || "",
    note: note || "",
    created_at: typeof ts === "string" ? ts : ts.toISOString(),
    completed: false,
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
 */
export function filterItems(items, { category = "all", status = "all" } = {}) {
  return items.filter((it) => {
    if (category !== "all" && it.category !== category) return false;
    if (status === "uncompleted" && it.completed) return false;
    if (status === "completed" && !it.completed) return false;
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
