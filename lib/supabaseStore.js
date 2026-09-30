// ============================================================
//  共享心愿单存储（Supabase）：通过 REST 读写单行 JSON
// ------------------------------------------------------------
//  表结构见 supabase/schema.sql：wishlist_state(id=1, items jsonb)
//  用 anon key + 开放 RLS（无登录的共享清单，见部署文档）。
// ============================================================

import { getConfig } from "./config.js";

const ROW_ID = 1;
const TABLE = "wishlist_state";

function authHeaders(cfg) {
  return {
    apikey: cfg.supabaseAnonKey,
    Authorization: `Bearer ${cfg.supabaseAnonKey}`,
  };
}

export async function getWishlistItems() {
  const cfg = getConfig();
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    throw new Error("未配置 Supabase（SUPABASE_URL / SUPABASE_ANON_KEY）");
  }
  const url = `${cfg.supabaseUrl}/rest/v1/${TABLE}?id=eq.${ROW_ID}&select=items`;
  const res = await fetch(url, { headers: authHeaders(cfg) });
  if (!res.ok) {
    let detail = "";
    try { detail = await res.text(); } catch { /* ignore */ }
    throw new Error(`Supabase 读取失败（${res.status}）${detail}`);
  }
  const rows = await res.json();
  const items = rows?.[0]?.items;
  return Array.isArray(items) ? items : [];
}

export async function setWishlistItems(items) {
  const cfg = getConfig();
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    throw new Error("未配置 Supabase（SUPABASE_URL / SUPABASE_ANON_KEY）");
  }
  const url = `${cfg.supabaseUrl}/rest/v1/${TABLE}?id=eq.${ROW_ID}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      ...authHeaders(cfg),
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ items: Array.isArray(items) ? items : [] }),
  });
  if (!res.ok) {
    let detail = "";
    try { detail = await res.text(); } catch { /* ignore */ }
    throw new Error(`Supabase 写入失败（${res.status}）${detail}`);
  }
  return true;
}
