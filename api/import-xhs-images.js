// ============================================================
//  POST /api/import-xhs-images —— 把小红书图片链接转存到 Supabase
//  请求体 JSON：{ urls: ["https://…xhscdn.com/…", …] }
//  返回：{ urls: ["https://…/wishlist-images/xhs_….jpg", …] }
// ============================================================

import { handleImportImages } from "../lib/importImages.js";

export default async function handler(req, res) {
  return handleImportImages(req, res);
}
