// ============================================================
//  POST /api/sync-feishu —— 本地开发用的飞书同步路由
//  与 Vercel 版共用 lib/feishu.js 的同步逻辑。
// ============================================================

import { json } from "../../lib/http.js";
import { handleSyncFeishu } from "../../lib/feishu.js";

export async function feishuRouter(req, res, url, ctx) {
  if (url.pathname === "/api/sync-feishu") {
    return handleSyncFeishu(req, res, () => Promise.resolve(ctx.store.get()), ctx.config);
  }
  return json(res, 404, { error: "接口不存在" });
}
