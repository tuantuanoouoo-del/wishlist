// 集中配置：从 .env / 环境变量读取。
// 优先使用 Node 原生 process.loadEnvFile（Node >= 20.12），并提供手动解析兜底，
// 保证在任何受支持的 Node 版本上都能读取 .env。

import fs from "node:fs";
import path from "node:path";

function tryLoadEnv() {
  const file = path.resolve(process.cwd(), ".env");

  // 方式一：Node 原生加载
  if (typeof process.loadEnvFile === "function") {
    try {
      process.loadEnvFile(file);
      return;
    } catch (e) {
      // 文件不存在或加载失败，回退到手动解析
    }
  }

  // 方式二：手动解析简单的 KEY=VALUE（兼容旧版 Node）
  try {
    const content = fs.readFileSync(file, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let val = m[2];
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      // 不覆盖已有的环境变量
      if (process.env[m[1]] === undefined) process.env[m[1]] = val;
    }
  } catch (e) {
    // .env 不存在，忽略
  }
}

export function loadConfig() {
  tryLoadEnv();

  return {
    port: Number(process.env.PORT || 8787),
    host: process.env.HOST || "127.0.0.1",
    rawgApiKey: (process.env.RAWG_API_KEY || "").trim(),
    rawgBaseUrl: process.env.RAWG_BASE_URL || "https://api.rawg.io/api",
  };
}
