// ============================================================
//  POST /api/sync-feishu —— 与飞书多维表格双向同步餐厅心愿
// ============================================================

import { getConfig } from "../lib/config.js";
import { getWishlistItems, setWishlistItems } from "../lib/supabaseStore.js";
import { handleSyncFeishu } from "../lib/feishu.js";

export default async function handler(req, res) {
  return handleSyncFeishu(req, res, getWishlistItems, setWishlistItems, getConfig());
}
