// ============================================================
//  POST /api/upload-image —— 本地开发用的图片上传路由
//  与 Vercel 版共用 lib/supabaseStorage.js 的上传逻辑。
// ============================================================

import { json } from "../../lib/http.js";
import { handleUploadImage } from "../../lib/supabaseStorage.js";
import { handleImportImages } from "../../lib/importImages.js";

export async function uploadRouter(req, res, url, ctx) {
  if (url.pathname === "/api/upload-image") {
    return handleUploadImage(req, res);
  }
  if (url.pathname === "/api/import-xhs-images") {
    return handleImportImages(req, res);
  }
  return json(res, 404, { error: "接口不存在" });
}
