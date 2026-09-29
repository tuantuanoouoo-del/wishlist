// ============================================================
//  数据标准化层（normalizeGameData）
// ------------------------------------------------------------
//  把第三方 API（RAWG）的原始数据转换成统一的 Game 结构。
//  UI 与 Wishlist 只依赖这里定义的结构，绝不直接接触 RAW 原始数据。
//  未来更换 API 时，只需修改 rawg.js + 本文件。
// ============================================================

const HAN_RE = /[\u3400-\u4dbf\u4e00-\u9fff]/; // 汉字
const KANA_RE = /[\u3040-\u30ff\u31f0-\u31ff]/; // 日文假名（平假名/片假名）

function toStr(v) {
  return v == null ? "" : String(v).trim();
}

function pick(list, mapper) {
  const out = [];
  for (const item of list || []) {
    const v = mapper(item);
    if (v) out.push(v);
  }
  return out;
}

// 备用名称统一为字符串数组
function altNames(raw) {
  return pick(raw?.alternative_names, (n) => (typeof n === "string" ? n : n?.name));
}

// 在候选名里找第一个含汉字的名字 → 作为中文名
function findHan(names) {
  return (names || []).find((n) => HAN_RE.test(n)) || "";
}

// 找第一个「只含假名（不含汉字）」的名字 → 作为日文名
function findKana(names) {
  return (names || []).find((n) => KANA_RE.test(n) && !HAN_RE.test(n)) || "";
}

// 找第一个纯拉丁字母的名字 → 作为英文名
function findLatin(name, nameOriginal, names) {
  const candidates = [name, nameOriginal, ...(names || [])];
  return candidates.find((n) => n && !HAN_RE.test(n) && !KANA_RE.test(n)) || "";
}

/**
 * 标准化单个游戏。
 * @param {object} raw RAWG 原始游戏对象
 * @param {Array|null} screenshots 详情接口返回的截图结果（可选）；缺省时用列表里的 short_screenshots
 * @returns {object} 统一 Game 结构
 */
export function normalizeGame(raw, screenshots = null) {
  raw = raw || {};
  const names = altNames(raw);
  const name = toStr(raw.name);
  const nameOriginal = toStr(raw.name_original);

  const name_cn = findHan(names);
  const name_en = findLatin(name, nameOriginal, names);
  const name_jp = findKana(names);

  // 截图：优先详情接口传入的完整截图，其次列表里的缩略截图
  let shotList;
  if (Array.isArray(screenshots)) {
    shotList = screenshots.map((s) => ({ url: toStr(s?.image) })).filter((s) => s.url);
  } else {
    shotList = pick(raw.short_screenshots, (s) => s?.image).map((url) => ({ url }));
  }

  return {
    id: toStr(raw.id), // 平台内唯一 ID
    external_id: toStr(raw.id), // 去重键：category + external_id
    source: "rawg",

    // 展示标题：优先中文名，其次英文名，最后原始名
    title: name_cn || name_en || name,

    name_cn,
    name_en: name_en || name,
    name_jp,

    cover: toStr(raw.background_image), // 封面/主图（RAWG 为横版宣传图）
    background: toStr(raw.background_image_additional || raw.background_image),
    artworks: [toStr(raw.background_image_additional)].filter(Boolean),
    screenshots: shotList,

    description: toStr(raw.description), // 英文简介（RAWG 原始）
    description_zh: "", // 中文简介（由翻译服务填充；空表示未翻译）

    developer: pick(raw.developers, (d) => d?.name).join(" / "),
    publisher: pick(raw.publishers, (p) => p?.name).join(" / "),
    release_date: toStr(raw.released),

    genres: pick(raw.genres, (g) => g?.name),
    platforms: pick(raw.platforms, (p) => p?.platform?.name),
    players: "", // RAWG 不提供玩家人数；预留字段，前端显示「暂无资料」

    rating: raw.rating ?? null,
    metacritic: raw.metacritic ?? null,

    // 用户手动维护的参考价格（由心愿单层维护，不从 API 获取）
    price: null,
  };
}
