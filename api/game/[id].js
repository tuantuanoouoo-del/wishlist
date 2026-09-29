// ============================================================
//  /api/game/[id] —— 游戏详情（Vercel Serverless Function）
// ============================================================

import { json } from "../../lib/http.js";
import { getConfig } from "../../lib/config.js";
import { RawgClient } from "../../server/services/rawg.js";
import { normalizeGame } from "../../server/services/normalize.js";
import { translateEnToZh, htmlToText } from "../../server/services/translate.js";

export default async function handler(req, res) {
  const cfg = getConfig();
  if (!cfg.rawgApiKey) {
    return json(res, 503, { error: "尚未配置 RAWG API Key。" });
  }

  const url = new URL(req.url, "http://localhost");
  const match = url.pathname.match(/^\/api\/game\/([^/]+)$/);
  if (!match) return json(res, 404, { error: "接口不存在" });
  const id = decodeURIComponent(match[1]);

  const rawg = new RawgClient(cfg);

  try {
    // 并行请求详情与截图（截图失败不影响整体）
    const [raw, screenshots] = await Promise.all([
      rawg.getGame(id),
      rawg.getScreenshots(id).catch(() => []),
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
