// ============================================================
//  POST /api/upload-image —— 上传一张图片到 Supabase Storage
//  请求体 JSON：{ filename, contentType, data(base64) }
//  返回：{ url }（公开访问地址）
// ============================================================

import { handleUploadImage } from "../lib/supabaseStorage.js";

export default async function handler(req, res) {
  return handleUploadImage(req, res);
}
