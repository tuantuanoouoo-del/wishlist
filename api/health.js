// /api/health —— 健康检查
import { json } from "../lib/http.js";
import { getConfig } from "../lib/config.js";

export default function handler(req, res) {
  const cfg = getConfig();
  json(res, 200, { ok: true, keyConfigured: Boolean(cfg.rawgApiKey) });
}
