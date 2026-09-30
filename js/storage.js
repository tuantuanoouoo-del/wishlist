// ============================================================
//  Storage 存储层（共享模式：后端 JSON 存储）
// ------------------------------------------------------------
//  - 心愿数据统一从后端读写（服务端 data/wishlist.json），
//    所有访问者共享同一份数据，换设备/浏览器数据仍一致。
//  - 保留 normalizeItem / migrate 纯函数，兼容未来数据结构升级。
//  - 保留 loadLegacyItems：迁移早期 localStorage 版本的数据。
// ============================================================

import { api } from "./api.js";
import { normalizePriority } from "./wishlist.js";

export const SCHEMA_VERSION = 1;
export const LEGACY_KEY = "wishlist.items"; // 早期 localStorage 版遗留 key

/**
 * 归一化单条心愿数据：补齐缺失字段、兼容旧结构。
 * 无法识别（无 id / 非对象）时返回 null。
 */
export function normalizeItem(item) {
  if (!item || typeof item !== "object" || !item.id) return null;
  return {
    id: String(item.id),
    category: item.category || "ns_game",
    title: item.title || "",
    note: item.note || "",
    created_at: item.created_at || new Date().toISOString(),
    completed: Boolean(item.completed),
    priority: normalizePriority(item.priority),
    data: item.data && typeof item.data === "object" ? item.data : {},
  };
}

/**
 * 迁移入口：未来 SCHEMA_VERSION 升级时，在此按版本逐级迁移。
 * 当前版本为 1，无历史迁移，直接归一化返回。
 */
export function migrate(items, fromVersion = 1, toVersion = SCHEMA_VERSION) {
  let result = (items || []).map(normalizeItem).filter(Boolean);
  // 未来示例：
  // if (fromVersion < 2) result = result.map(migrateV1toV2);
  return result;
}

/** 从后端读取共享心愿列表（失败返回空数组，不抛错） */
export async function loadItems() {
  try {
    const data = await api.getWishlist();
    const items = Array.isArray(data?.items) ? data.items : [];
    return migrate(items);
  } catch (e) {
    console.warn("[storage] 读取共享心愿单失败：", e);
    return [];
  }
}

/** 将完整列表保存到后端 */
export async function saveItems(items) {
  return api.saveWishlist(Array.isArray(items) ? items : []);
}

/** 读取早期 localStorage 版遗留数据（用于一次性迁移到服务器） */
export function loadLegacyItems() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return [];
    const raw = window.localStorage.getItem(LEGACY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed) ? parsed : parsed?.items;
    return migrate(Array.isArray(items) ? items : []);
  } catch (e) {
    return [];
  }
}
