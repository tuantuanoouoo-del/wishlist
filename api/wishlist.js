// ============================================================
//  /api/wishlist —— 共享心愿单读/写（存 Supabase）
// ============================================================

import { json, readBody } from "../lib/http.js";
import { getWishlistItems, setWishlistItems } from "../lib/supabaseStore.js";

export default async function handler(req, res) {
  if (req.method === "GET") {
    try {
      const items = await getWishlistItems();
      return json(res, 200, { items });
    } catch (err) {
      console.error("[wishlist] 读取失败", err);
      return json(res, 502, { error: "心愿单读取失败，请稍后重试。" });
    }
  }

  if (req.method === "PUT") {
    let body;
    try {
      body = await readBody(req);
    } catch {
      return json(res, 413, { error: "数据过大" });
    }
    let items;
    try {
      items = JSON.parse(body || "[]");
    } catch {
      return json(res, 400, { error: "数据格式错误" });
    }
    if (!Array.isArray(items)) {
      return json(res, 400, { error: "数据必须是数组" });
    }

    try {
      await setWishlistItems(items);
      return json(res, 200, { ok: true, count: items.length });
    } catch (err) {
      console.error("[wishlist] 写入失败", err);
      return json(res, 502, { error: "心愿单保存失败，请稍后重试。" });
    }
  }

  return json(res, 404, { error: "接口不存在" });
}
