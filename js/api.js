// ============================================================
//  前端 API 层：统一封装对后端代理的调用
// ------------------------------------------------------------
//  - UI 只通过这里的 api.* 方法与服务端通信，不接触第三方 API。
//  - 未来若要切换到「无 Key 直连」或「更换后端」，只需改动本文件。
// ============================================================

export class ApiError extends Error {
  constructor(message, status = 0, payload = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(path, options);
  } catch (err) {
    throw new ApiError("网络异常，请检查服务是否已启动。", 0);
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* 非 JSON 响应 */
  }

  if (!res.ok) {
    const msg = data?.error || `请求失败（${res.status}）`;
    throw new ApiError(msg, res.status, data);
  }
  return data;
}

export const api = {
  /** 健康检查：确认后端与 Key 状态 */
  health: () => request("/api/health"),

  /** 搜索游戏（q 为中文或英文名称） */
  searchGames: (q) => request(`/api/search?q=${encodeURIComponent(q)}`),

  /** 近三个月 Switch 新上架游戏/DLC */
  releases: () => request("/api/releases"),

  /** 获取游戏完整详情（含截图/简介） */
  getGame: (id) => request(`/api/game/${encodeURIComponent(id)}`),

  /** 读取共享心愿单 */
  getWishlist: () => request("/api/wishlist"),

  /** 整体保存共享心愿单（items 为完整列表） */
  saveWishlist: (items) =>
    request("/api/wishlist", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(items),
    }),

  /** 上传一张图片到 Supabase Storage，返回公开 URL */
  uploadImage: (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || "");
        const m = dataUrl.match(/^data:([^;]+);base64,(.*)$/s);
        const contentType = m?.[1] || file.type || "image/jpeg";
        const data = m ? m[2] : dataUrl.split(",")[1];
        request("/api/upload-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name || "image.jpg",
            contentType,
            data,
          }),
        })
          .then((res) => resolve(res.url))
          .catch(reject);
      };
      reader.onerror = () => reject(new ApiError("读取图片失败", 0));
      reader.readAsDataURL(file);
    }),

  /** 上传一张图片（data 为纯 base64 或 dataURL），返回公开 URL */
  uploadImageData: ({ filename, contentType, data }) =>
    request("/api/upload-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: filename || "image.jpg",
        contentType: contentType || "image/jpeg",
        data: String(data || "").replace(/^data:[^;]+;base64,/, ""),
      }),
    }).then((res) => res.url),

  /** 把小红书图片链接转存到 Supabase，返回新的公开 URL 列表 */
  importXhsImages: (urls) =>
    request("/api/import-xhs-images", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls: Array.isArray(urls) ? urls : [] }),
    }),
};
