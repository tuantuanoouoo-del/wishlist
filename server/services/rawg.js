// ============================================================
//  RAWG API 客户端（薄封装）
// ------------------------------------------------------------
//  只负责 HTTP 请求与基础错误处理，不做业务数据转换。
//  业务数据转换在 normalize.js 中完成。
//  文档：https://rawg.io/apidocs  |  https://api.rawg.io/docs/
// ============================================================

export class NoApiKeyError extends Error {
  constructor() {
    super("尚未配置 RAWG API Key，请参考 README 配置后重启服务。");
    this.name = "NoApiKeyError";
  }
}

export class RawgError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = "RawgError";
    this.status = status;
  }
}

// Nintendo Switch 平台标识（slug 稳定，id 兜底）
const SWITCH_SLUG = "nintendo-switch";
const SWITCH_ID = 7;

/** 判断某个 RAWG 游戏对象是否包含 Nintendo Switch 平台 */
export function hasSwitchPlatform(raw) {
  return (raw?.platforms || []).some(
    (p) => p?.platform?.slug === SWITCH_SLUG || p?.platform?.id === SWITCH_ID
  );
}

export class RawgClient {
  constructor({ rawgApiKey, rawgBaseUrl }) {
    this.apiKey = rawgApiKey;
    this.baseUrl = (rawgBaseUrl || "https://api.rawg.io/api").replace(/\/+$/, "");
  }

  async request(path, params = {}) {
    if (!this.apiKey) throw new NoApiKeyError();

    const url = new URL(this.baseUrl + path);
    url.searchParams.set("key", this.apiKey);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") {
        url.searchParams.set(k, String(v));
      }
    }

    let res;
    try {
      res = await fetch(url, {
        headers: { "User-Agent": "wishlist-app/1.0" },
        signal: AbortSignal.timeout(15000),
      });
    } catch (err) {
      // 尽量暴露底层错误码，便于排查：
      //   ENOTFOUND / EAI_AGAIN = DNS 解析失败
      //   ETIMEDOUT          = 连接超时
      //   ECONNREFUSED       = 连接被拒
      //   ECONNRESET         = 连接被重置
      const cause = err?.cause;
      const detail = cause ? ` [${cause.code || cause.message || cause}]` : "";
      throw new RawgError(`网络请求失败：${err.message}${detail}`, 0);
    }

    if (res.status === 401 || res.status === 403) {
      throw new RawgError("API Key 无效或无权访问", res.status);
    }
    if (!res.ok) {
      throw new RawgError(`RAWG 返回 ${res.status}`, res.status);
    }
    try {
      return await res.json();
    } catch {
      throw new RawgError("RAWG 响应解析失败", 502);
    }
  }

  /** 搜索游戏，返回 results 数组 */
  async searchGames(query, { page = 1, pageSize = 40 } = {}) {
    const data = await this.request("/games", {
      search: query,
      page,
      page_size: pageSize,
    });
    return data?.results || [];
  }

  /** 近 N 天新上架游戏（按平台过滤、按发售日倒序） */
  async getRecentGames({ platformIds = [7], days = 90, pageSize = 24 } = {}) {
    const end = new Date();
    const start = new Date(Date.now() - days * 24 * 3600 * 1000);
    const fmt = (d) => d.toISOString().slice(0, 10);
    const data = await this.request("/games", {
      platforms: platformIds.join(","),
      dates: `${fmt(start)},${fmt(end)}`,
      ordering: "-released",
      page_size: pageSize,
    });
    return data?.results || [];
  }

  /** 获取单个游戏详情 */
  async getGame(id) {
    return this.request(`/games/${encodeURIComponent(id)}`);
  }

  /** 获取游戏截图，返回 results 数组 */
  async getScreenshots(id, { pageSize = 12 } = {}) {
    const data = await this.request(`/games/${encodeURIComponent(id)}/screenshots`, {
      page_size: pageSize,
    });
    return data?.results || [];
  }
}
