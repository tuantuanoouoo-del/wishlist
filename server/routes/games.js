// ============================================================
//  /api 路由：健康检查、游戏搜索、游戏详情
// ============================================================

import { normalizeGame } from "../services/normalize.js";
import { hasSwitchPlatform } from "../services/rawg.js";
import { translateQuery } from "../services/nameMap.js";
import { translateEnToZh, htmlToText } from "../services/translate.js";

function json(res, status, obj) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(obj));
}

export async function apiRouter(req, res, url, ctx) {
  const { pathname, searchParams } = url;
  const path = pathname.replace(/^\/api/, "") || "/";

  if (req.method === "GET" && path === "/health") {
    return json(res, 200, { ok: true, keyConfigured: Boolean(ctx.config.rawgApiKey) });
  }

  if (req.method === "GET" && path === "/search") {
    return handleSearch(searchParams, ctx, res);
  }

  const detailMatch = path.match(/^\/game\/([^/]+)$/);
  if (req.method === "GET" && detailMatch) {
    return handleDetail(decodeURIComponent(detailMatch[1]), ctx, res);
  }

  return json(res, 404, { error: "接口不存在" });
}

async function handleSearch(params, ctx, res) {
  const query = (params.get("q") || "").trim();
  if (!query) return json(res, 400, { error: "请输入搜索关键词" });
  if (!ctx.config.rawgApiKey) {
    return json(res, 503, { error: "尚未配置 RAWG API Key，请参考 README 配置后重启服务。" });
  }

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
      list = await ctx.rawg.searchGames(term, { pageSize: 40 });
      anySucceeded = true;
    } catch (err) {
      // 单个关键词失败不致命，继续尝试下一个
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
    translated: terms.slice(1), // 实际用到的翻译词（调试/展示用）
    count: results.length,
    results,
  });
}

async function handleDetail(id, ctx, res) {
  if (!ctx.config.rawgApiKey) {
    return json(res, 503, { error: "尚未配置 RAWG API Key，请参考 README 配置后重启服务。" });
  }

  try {
    // 并行请求详情与截图（截图失败不影响整体）
    const [raw, screenshots] = await Promise.all([
      ctx.rawg.getGame(id),
      ctx.rawg.getScreenshots(id).catch(() => []),
    ]);
    const game = normalizeGame(raw, screenshots);
    // 机翻简介（失败时 description_zh 保持为空，前端回退英文）
    if (game.description) {
      game.description_zh = await translateEnToZh(htmlToText(game.description));
    }
    return json(res, 200, { game });
  } catch (err) {
    if (err.name === "NoApiKeyError") {
      return json(res, 503, { error: err.message });
    }
    if (err.name === "RawgError") {
      return json(res, err.status || 502, { error: "游戏信息获取失败，请稍后重试。" });
    }
    console.error("[detail] 未预期错误", err);
    return json(res, 502, { error: "游戏信息获取失败，请稍后重试。" });
  }
}
