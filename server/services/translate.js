// ============================================================
//  简介翻译服务：把 RAWG 的英文简介机翻成中文
// ------------------------------------------------------------
//  - 使用 Google 免费翻译接口（无需 Key），结果缓存到内存。
//  - 失败时返回空串，由调用方回退到英文原文，绝不影响主流程。
//  - 注意：翻译质量仅供参考，UI 会标注「机器翻译」。
// ============================================================

const cache = new Map();
const CACHE_MAX = 300;

function hashKey(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return `${h}:${text.length}`;
}

/** HTML 简介 → 纯文本（保留段落/换行），便于翻译 */
export function htmlToText(html) {
  return String(html || "")
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/\s*p\s*>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&rsquo;/gi, "'")
    .replace(/&ldquo;/gi, '"')
    .replace(/&rdquo;/gi, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * 英文 → 简体中文。成功返回译文，失败返回空串。
 * @param {string} text 纯文本英文
 * @returns {Promise<string>}
 */
export async function translateEnToZh(text) {
  const t = (text || "").trim();
  if (!t) return "";

  const key = hashKey(t);
  if (cache.has(key)) return cache.get(key);

  const url =
    "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q=" +
    encodeURIComponent(t);

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return "";
    const data = await res.json();
    const segments = Array.isArray(data?.[0]) ? data[0] : [];
    const out = segments.map((s) => s?.[0]).filter(Boolean).join("").trim();
    if (!out) return "";

    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(key, out);
    return out;
  } catch (e) {
    return "";
  }
}
