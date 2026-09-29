// ============================================================
//  启动器：读取 .env 中的代理配置，注入环境变量后，
//  以 --use-env-proxy 启动服务。
// ------------------------------------------------------------
//  为什么需要它：Node 的 fetch 默认不读系统代理；而 --use-env-proxy
//  只在进程「启动时」读取 HTTP_PROXY / HTTPS_PROXY 环境变量。
//  本启动器在启动子进程前，把 .env 里的代理配置写入环境变量，
//  让你只需在 .env 填一行代理，跑 `node start.js`（或 npm start）即可。
// ============================================================

import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.dirname(fileURLToPath(import.meta.url));

function loadEnvFile() {
  const out = {};
  const file = path.join(ROOT, ".env");
  if (!existsSync(file)) return out;
  const content = readFileSync(file, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

const cfg = loadEnvFile();
const env = { ...process.env };

// 把 .env 中的代理配置注入子进程环境（已有同名环境变量时不覆盖）
for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY"]) {
  if (cfg[key] && !env[key]) env[key] = cfg[key];
}

const child = spawn(process.execPath, ["--use-env-proxy", "server/server.js"], {
  cwd: ROOT,
  env,
  stdio: "inherit",
});

child.on("exit", (code) => process.exit(code ?? 0));
child.on("error", (err) => {
  console.error("[start] 启动失败：", err);
  process.exit(1);
});
