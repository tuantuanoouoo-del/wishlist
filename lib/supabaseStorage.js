// ============================================================
//  图片存储（Supabase Storage）：上传并返回公开 URL
// ------------------------------------------------------------
//  - 供 Vercel（api/upload-image.js）与本地开发（server/routes/upload.js）共用
//  - 桶名 wishlist-images，需先在 Supabase 后台建桶（见 supabase/schema.sql）
// ============================================================

import { getConfig } from "./config.js";
import { json, readBody } from "./http.js";

const BUCKET = "wishlist-images";
const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // 单张图片上限 3MB

function authHeaders(cfg) {
  return {
    apikey: cfg.supabaseAnonKey,
    Authorization: `Bearer ${cfg.supabaseAnonKey}`,
  };
}

/** 从原始文件名提取安全的扩展名，未知则按 MIME 回退 */
function pickExtension(filename, contentType) {
  const fromName = String(filename || "").match(/\.([a-zA-Z0-9]{2,5})$/)?.[1]?.toLowerCase();
  if (fromName && /^(png|jpe?g|webp|gif|avif)$/.test(fromName)) return fromName;
  const mime = String(contentType || "");
  const map = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/avif": "avif",
  };
  return map[mime] || "jpg";
}

/** 上传一张图片（dataBase64 为纯 base64，不含 data: 前缀），返回公开 URL */
export async function uploadImage({ filename, contentType, dataBase64 }) {
  const cfg = getConfig();
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    throw new Error("未配置 Supabase（SUPABASE_URL / SUPABASE_ANON_KEY）");
  }
  const ext = pickExtension(filename, contentType);
  const safeName = `xhs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const buf = Buffer.from(dataBase64, "base64");

  const url = `${cfg.supabaseUrl}/storage/v1/object/${BUCKET}/${safeName}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...authHeaders(cfg),
      "Content-Type": contentType || "application/octet-stream",
      "x-upsert": "false",
    },
    body: buf,
  });
  if (!res.ok) {
    let detail = "";
    try { detail = await res.text(); } catch { /* ignore */ }
    throw new Error(`图片上传失败（${res.status}）${detail}`);
  }
  return `${cfg.supabaseUrl}/storage/v1/object/public/${BUCKET}/${safeName}`;
}

/**
 * 处理一次图片上传请求（JSON：{ filename, contentType, data(base64) }）。
 * 返回后直接结束响应；供 Vercel 与本地路由复用。
 */
export async function handleUploadImage(req, res) {
  if (req.method !== "POST") {
    return json(res, 404, { error: "接口不存在" });
  }

  let body;
  try {
    body = await readBody(req, 10 * 1024 * 1024);
  } catch {
    return json(res, 413, { error: "数据过大" });
  }

  let payload;
  try {
    payload = JSON.parse(body || "{}");
  } catch {
    return json(res, 400, { error: "数据格式错误" });
  }

  const { filename, contentType, data } = payload || {};
  if (!data || typeof data !== "string") {
    return json(res, 400, { error: "缺少图片数据" });
  }

  const b64 = data.replace(/^data:[^;]+;base64,/, "");
  const approxBytes = Math.floor((b64.length * 3) / 4);
  if (approxBytes > MAX_IMAGE_BYTES) {
    return json(res, 413, { error: "单张图片不能超过 3MB" });
  }

  try {
    const url = await uploadImage({ filename, contentType, dataBase64: b64 });
    return json(res, 200, { url });
  } catch (err) {
    console.error("[upload-image] 上传失败", err);
    return json(res, 502, { error: `图片上传失败（${err?.message || err}）` });
  }
}
