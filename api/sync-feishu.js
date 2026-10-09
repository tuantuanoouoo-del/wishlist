// ============================================================
//  POST /api/sync-feishu —— 把餐厅心愿同步到飞书多维表格
// ============================================================

import { getConfig } from "../lib/config.js";
import { getWishlistItems } from "../lib/supabaseStore.js";
import { handleSyncFeishu } from "../lib/feishu.js";

export default async function handler(req, res) {
  return handleSyncFeishu(req, res, getWishlistItems, getConfig());
}
