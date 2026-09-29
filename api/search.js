// ============================================================
//  /api/search —— 游戏搜索（Vercel Serverless Function）
//  复用 server/services 的 RAWG 客户端与中文别名映射。
// ============================================================

import { json } from "../lib/http.js";
import { getConfig } from "../lib/config.js";
import { RawgClient, hasSwitchPlatform } from "../server/services/rawg.js";
import { normalizeGame } from "../server/services/normalize.js";
import { translateQuery } from "../server/services/nameMap.js";

export default async function handler(req, res) {
  const cfg = getConfig();
  if (!cfg.rawgApiKey) {
    return json(res, 503, { error: "尚未配置 RAWG API Key。" });
  }

  const url = new URL(req.url, "http://localhost");
  const query = (url.searchParams.get("q") || "").trim();
  if (!query) return json(res, 400, { error: "请输入搜索关键词" });

  const rawg = new RawgClient(cfg);

  // 搜索策略：原词 → 中文别名翻译词，逐个尝试，合并去重
  const terms = [query];
  for (const en of translateQuery(query)) {
    if (!terms.includes(en)) terms.push(en);
  }

  const results = [];
  const seen = new Set();
  const MAX_RESULTS = 20;
  let anySucceeded = false; // 是否至少有一次请求真正到达 RAWG

  for (const term of terms) {
    if (results.length >= MAX_RESULTS) break;
    let list;
    try {
      list = await rawg.searchGames(term, { pageSize: 40 });
      anySucceeded = true;
    } catch (err) {
      console.warn(`[search] 关键词 "${term}" 搜索失败：${err.message}`);
      continue;
    }

    for (const raw of list) {
      if (results.length >= MAX_RESULTS) break;
      if (!hasSwitchPlatform(raw)) continue; // 只保留 NS 平台
      const game = normalizeGame(raw);
      if (!game.id || seen.has(game.id)) continue;
      seen.add(game.id);
      results.push(game);
    }
  }

  // 所有请求都失败（网络异常等）→ 返回错误，而不是误导性地显示「没有结果」
  if (!anySucceeded) {
    return json(res, 502, { error: "游戏信息获取失败，请检查网络或稍后重试。" });
  }

  return json(res, 200, {
    query,
    translated: terms.slice(1),
    count: results.length,
    results,
  });
}
