// ============================================================
//  后端入口：零依赖 Node HTTP 服务器
// ------------------------------------------------------------
//  职责：
//   1. 加载配置（含 .env，API Key 只保存在服务端）
//   2. 提供 /api/* 代理路由（游戏搜索 / 详情）
//   3. 提供前端静态文件（index.html、css、js、assets）
//
//  启动：node server/server.js  （或 npm start）
// ============================================================

import http from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

import { loadConfig } from "./config.js";
import { RawgClient } from "./services/rawg.js";
import { apiRouter } from "./routes/games.js";
import { wishlistRouter } from "./routes/wishlist.js";
import { uploadRouter } from "./routes/upload.js";
import { createStore } from "./services/store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, ".."); // 项目根目录

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

// 仅允许对外暴露这些目录/文件，避免泄露 .env、server 源码、tests 等
const PUBLIC_DIRS = new Set(["css", "js", "assets"]);
const PUBLIC_FILES = new Set(["index.html", "favicon.ico", "robots.txt"]);

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function serveStatic(req, res, pathname) {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return sendText(res, 400, "Bad Request");
  }
  if (rel === "/") rel = "/index.html";

  const segments = rel.split("/").filter(Boolean);
  if (segments.length === 0) return sendText(res, 404, "404 Not Found");

  const head = segments[0];

  if (PUBLIC_FILES.has(head) && segments.length === 1) {
    return sendFile(res, path.join(ROOT, head));
  }
  if (PUBLIC_DIRS.has(head)) {
    return sendFile(res, path.join(ROOT, ...segments));
  }
  return sendText(res, 404, "404 Not Found");
}

function sendFile(res, filePath) {
  const resolved = path.resolve(filePath);
  // 路径穿越防护：确保文件位于项目根目录内
  if (resolved !== ROOT && !resolved.startsWith(ROOT + path.sep)) {
    return sendText(res, 404, "404 Not Found");
  }
  fs.readFile(resolved, (err, data) => {
    if (err) return sendText(res, 404, "404 Not Found");
    const ext = path.extname(resolved).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(data);
  });
}

/** 创建服务器（不监听）；便于测试时 import 而不启动 */
export function createServer() {
  const config = loadConfig();
  const rawg = new RawgClient(config);
  const store = createStore();
  const ctx = { config, rawg, store };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const { pathname } = url;

    if (pathname.startsWith("/api/")) {
      try {
        if (pathname.startsWith("/api/wishlist")) {
          await wishlistRouter(req, res, url, ctx);
        } else if (pathname.startsWith("/api/upload-image") || pathname.startsWith("/api/import-xhs-images")) {
          await uploadRouter(req, res, url, ctx);
        } else {
          await apiRouter(req, res, url, ctx);
        }
      } catch (err) {
        console.error("[api] 未捕获错误", err);
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ error: "服务器内部错误，请稍后重试。" }));
        }
      }
      return;
    }

    if (req.method === "GET" || req.method === "HEAD") {
      serveStatic(req, res, pathname);
    } else {
      sendText(res, 405, "405 Method Not Allowed");
    }
  });

  return { server, config };
}

// 仅当直接运行本文件时启动
const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const { server, config } = createServer();
  server.listen(config.port, config.host, () => {
    console.log("================================================");
    console.log("  个人心愿单 Wishlist 已启动");
    console.log(`  访问地址：http://localhost:${config.port}`);
    console.log(
      `  RAWG Key：${config.rawgApiKey ? "已配置 ✓" : "未配置（复制 .env.example 为 .env 并填写）"}`
    );
    console.log("  按 Ctrl+C 停止服务");
    console.log("================================================");
  });
  server.on("error", (err) => {
    console.error("[server] 启动失败", err);
    process.exit(1);
  });
}
