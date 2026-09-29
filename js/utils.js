// ============================================================
//  通用工具函数（无 DOM 依赖的部分可在 Node 中直接测试）
// ============================================================

/** 选择单个元素 */
export function $(sel, root = document) {
  return root.querySelector(sel);
}

/** 选择多个元素，返回数组 */
export function $$(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}

/** HTML 转义：安全渲染用户输入（备注、名称等） */
export function escapeHtml(str) {
  return String(str ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

/**
 * 轻量 HTML 白名单过滤：用于渲染第三方 API 返回的游戏简介。
 * 仅保留少量排版标签，移除所有属性与 script/style 等危险标签。
 */
export function sanitizeHtml(html) {
  if (!html) return "";
  const ALLOWED = new Set([
    "P", "BR", "STRONG", "EM", "B", "I", "U",
    "UL", "OL", "LI", "H3", "H4", "SPAN", "DIV", "A",
  ]);
  const doc = new DOMParser().parseFromString(String(html), "text/html");
  doc.querySelectorAll("script,style,iframe,object,embed,link,meta,form").forEach((n) => n.remove());

  const clean = (el) => {
    for (const node of Array.from(el.children)) {
      if (!ALLOWED.has(node.tagName)) {
        node.replaceWith(...Array.from(node.childNodes));
        continue;
      }
      for (const attr of Array.from(node.attributes)) node.removeAttribute(attr.name);
      clean(node);
    }
  };
  clean(doc.body);
  return doc.body.innerHTML;
}

/** 判断值是否为空（null / undefined / 空串 / 纯空白） */
export function isEmpty(v) {
  return v === null || v === undefined || String(v).trim() === "";
}

/** 是否为有效数字 */
export function isNumeric(v) {
  return v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));
}

/**
 * 格式化发售/创建日期。
 * ISO 字符串 "2023-05-12T00:00:00" → "2023-05-12"；空值返回 ""。
 * 绝不返回 undefined/null/NaN。
 */
export function formatDate(iso) {
  if (isEmpty(iso)) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * 格式化参考价格。空/非法 → ""；整数去掉小数，否则保留两位。
 * 例如：280 → "¥280"，280.5 → "¥280.50"。
 */
export function formatPrice(v) {
  if (!isNumeric(v)) return "";
  const n = Number(v);
  const text = Number.isInteger(n) ? String(n) : n.toFixed(2);
  return `¥${text}`;
}

/** 生成唯一 ID（优先 crypto.randomUUID） */
export function uid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 当前 ISO 时间戳 */
export function now() {
  return new Date().toISOString();
}

/** 防抖 */
export function debounce(fn, ms = 300) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
