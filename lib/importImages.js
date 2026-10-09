// ============================================================
//  图片导入：把小红书 CDN 图片链接下载并转存到 Supabase Storage
// ------------------------------------------------------------
//  - 图片链接由用户浏览器（篡改猴脚本）从「已打开的笔记页面」读取，
//    这里只负责把这几张公开 CDN 图转存到自己的 Supabase 桶，保证长期可用。
//  - 不登录、不读 Cookie、不抓取笔记数据，只下载已知图片链接。
// ============================================================

import { json, readBody } from "./http.js";
import { uploadImage } from "./supabaseStorage.js";

const ALLOWED_HOSTS = /(xhscdn\.com|rednotecdn\.com)$/i;
const MAX_IMAGES = 20;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function isValidUrl(u) {
  try {
    const url = new URL(u);
    if (!/^https?:$/.test(url.protocol)) return false;
    if (!ALLOWED_HOSTS.test(url.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

function nameFromUrl(u) {
  try {
    const path = new URL(u).pathname;
    return path.split("/").pop() || "image.jpg";
  } catch {
    return "image.jpg";
  }
}

/** 下载并转存图片，返回新的公开 URL 列表（失败/超限的自动跳过） */
export async function importImagesFromUrls(urls) {
  const list = (Array.isArray(urls) ? urls : []).filter((u) => typeof u === "string").slice(0, MAX_IMAGES);
  const results = [];

  for (const u of list) {
    if (!isValidUrl(u)) continue;

    let res;
    try {
      res = await fetch(u, { headers: { "User-Agent": BROWSER_UA } });
    } catch {
      continue;
    }
    if (!res.ok) continue;

    let buf;
    try {
      buf = Buffer.from(await res.arrayBuffer());
    } catch {
      continue;
    }
    if (!buf.length || buf.length > MAX_IMAGE_BYTES) continue;

    const contentType = res.headers.get("content-type") || "image/jpeg";
    try {
      const url = await uploadImage({ filename: nameFromUrl(u), contentType, dataBase64: buf.toString("base64") });
      results.push(url);
    } catch (e) {
      console.warn("[import-images] 单张转存失败", e);
    }
  }

  return results;
}

/** 处理一次图片导入请求（JSON：{ urls: [...] }），返回后直接结束响应 */
export async function handleImportImages(req, res) {
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

  const urls = Array.isArray(payload?.urls) ? payload.urls.filter((u) => typeof u === "string") : [];
  if (!urls.length) {
    return json(res, 400, { error: "缺少图片链接" });
  }

  try {
    const imported = await importImagesFromUrls(urls);
    return json(res, 200, { urls: imported });
  } catch (err) {
    console.error("[import-images] 失败", err);
    return json(res, 502, { error: `图片导入失败（${err?.message || err}）` });
  }
}
