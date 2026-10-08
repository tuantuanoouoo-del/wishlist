// ============================================================
//  /api/releases —— 近三个月 Switch 新上架游戏/DLC（Vercel Serverless Function）
// ============================================================

import { json } from "../lib/http.js";
import { getConfig } from "../lib/config.js";
import { RawgClient, hasSwitchPlatform } from "../server/services/rawg.js";
import { normalizeGame } from "../server/services/normalize.js";

export default async function handler(req, res) {
  const cfg = getConfig();
  if (!cfg.rawgApiKey) {
    return json(res, 503, { error: "尚未配置 RAWG API Key。" });
  }

  const rawg = new RawgClient(cfg);

  try {
    // 近 90 天、Nintendo Switch（平台 id=7）、按发售日倒序
    const list = await rawg.getRecentGames({ platformIds: [7], days: 90, pageSize: 24 });

    const results = [];
    const seen = new Set();
    for (const raw of list) {
      if (!hasSwitchPlatform(raw)) continue; // 只保留 NS 平台（兜底）
      const game = normalizeGame(raw);
      if (!game.id || seen.has(game.id)) continue;
      seen.add(game.id);
      results.push(game);
    }

    return json(res, 200, { count: results.length, results });
  } catch (err) {
    if (err.name === "NoApiKeyError") {
      return json(res, 503, { error: err.message });
    }
    if (err.name === "RawgError") {
      return json(res, err.status || 502, { error: "新游信息获取失败，请稍后重试。" });
    }
    console.error("[releases] 未预期错误", err);
    return json(res, 502, { error: "新游信息获取失败，请稍后重试。" });
  }
}
