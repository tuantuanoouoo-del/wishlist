// ============================================================
//  /api/wishlist 路由：共享心愿单的读取与整体保存
// ------------------------------------------------------------
//  GET /api/wishlist → { items: [...] }
//  PUT /api/wishlist → 请求体为完整 items 数组，整体替换并落盘
// ============================================================

function json(res, status, obj) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(obj));
}

function readBody(req, maxBytes = 10 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > maxBytes) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export async function wishlistRouter(req, res, url, ctx) {
  const { pathname } = url;
  const store = ctx.store;

  if (pathname === "/api/wishlist" && req.method === "GET") {
    return json(res, 200, { items: store.get() });
  }

  if (pathname === "/api/wishlist" && req.method === "PUT") {
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return json(res, 413, { error: "数据过大" });
    }
    let items;
    try {
      items = JSON.parse(body || "[]");
    } catch {
      return json(res, 400, { error: "数据格式错误" });
    }
    if (!Array.isArray(items)) {
      return json(res, 400, { error: "数据必须是数组" });
    }
    await store.set(items);
    return json(res, 200, { ok: true, count: items.length });
  }

  return json(res, 404, { error: "接口不存在" });
}
