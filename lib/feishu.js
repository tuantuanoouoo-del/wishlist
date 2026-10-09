// ============================================================
//  飞书多维表格（Bitable）双向同步
// ------------------------------------------------------------
//  - 用企业自建应用 tenant_access_token 调开放平台接口。
//  - 支持两种「多维表格 ID」来源：
//      1) 独立多维表格：地址栏 base/ 后面那串（直接是 app_token）
//      2) 知识库里的多维表格：地址栏 wiki/ 后面那串（节点 token，自动解析成 app_token）
//  - 同步策略：合并式（以「ID」字段为关联键，双向同步）：
//      · 心愿单 → 飞书：新增/更新飞书行（网页是已有数据的权威来源）
//      · 飞书 → 心愿单：ID 为空的手动新增行，反向导入成餐厅卡片
//  - 写入前先读取表字段类型，按实际类型自适应（文本/数字/链接兼容）。
//  - 字段映射（字段名需与表内一致，缺失字段会被跳过）：
//      店名 区域 菜系 人均 推荐菜 备注 小红书链接 ID(文本，关联键)
// ============================================================

import { json } from "./http.js";

const FEISHU_OPEN = "https://open.feishu.cn/open-apis";

// 飞书字段类型（数值）
const FIELD_NUMBER = 2;
const FIELD_URL = 15;

const ID_FIELD = "ID";

let _tokenCache = { token: "", expireAt: 0 };

async function getToken(cfg) {
  if (_tokenCache.token && Date.now() < _tokenCache.expireAt) return _tokenCache.token;

  const res = await fetch(`${FEISHU_OPEN}/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: cfg.feishuAppId, app_secret: cfg.feishuAppSecret }),
  });
  const data = await res.json().catch(() => ({}));
  if (!data || data.code !== 0) {
    throw new Error(`获取飞书 token 失败（${data?.code || res.status} ${data?.msg || ""}）`);
  }
  _tokenCache = {
    token: data.tenant_access_token,
    expireAt: Date.now() + ((data.expire || 7200) - 60) * 1000,
  };
  return _tokenCache.token;
}

function recordsUrl(appToken, tableId) {
  return `${FEISHU_OPEN}/bitable/v1/apps/${appToken}/tables/${tableId}/records`;
}

/**
 * 拿到真正的多维表格 app_token。
 * 若配置的 token 其实是「知识库节点」（wiki/ 后面那串），
 * 用 wiki 接口解析出底层多维表格的 app_token；解析失败则按原样使用。
 */
async function resolveAppToken(cfg, tenantToken) {
  const raw = cfg.feishuBitableAppToken;
  try {
    const res = await fetch(
      `${FEISHU_OPEN}/wiki/v2/spaces/get_node?token=${encodeURIComponent(raw)}`,
      { headers: { Authorization: `Bearer ${tenantToken}` } }
    );
    const data = await res.json().catch(() => ({}));
    if (data && data.code === 0 && data.data?.node?.obj_token) {
      return data.data.node.obj_token;
    }
  } catch {
    /* 不是知识库节点，忽略，按原 token 使用 */
  }
  return raw;
}

/** 读取表内字段名 -> 类型 的映射 */
async function getFieldTypes(appToken, tableId, token) {
  const url = `${FEISHU_OPEN}/bitable/v1/apps/${appToken}/tables/${tableId}/fields?page_size=100`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json().catch(() => ({}));
  if (!data || data.code !== 0) {
    throw new Error(`读取飞书表字段失败（${data?.code || res.status} ${data?.msg || ""}）`);
  }
  const map = new Map();
  for (const f of data.data?.items || []) {
    if (f.field_name) map.set(f.field_name, f.type);
  }
  return map;
}

/** 分页读取全部记录（含 record_id 与 fields） */
async function listAllRecords(appToken, tableId, token) {
  const records = [];
  let pageToken = "";
  for (;;) {
    const url = `${recordsUrl(appToken, tableId)}?page_size=500${pageToken ? `&page_token=${encodeURIComponent(pageToken)}` : ""}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json().catch(() => ({}));
    if (!data || data.code !== 0) {
      throw new Error(`读取飞书表失败（${data?.code || res.status} ${data?.msg || ""}）`);
    }
    for (const it of data.data?.items || []) {
      records.push({ record_id: it.record_id, fields: it.fields || {} });
    }
    if (!data.data?.has_more) break;
    pageToken = data.data?.page_token || "";
  }
  return records;
}

async function batchCreate(appToken, tableId, token, records) {
  if (!records.length) return;
  const res = await fetch(`${recordsUrl(appToken, tableId)}/batch_create`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ records }),
  });
  const data = await res.json().catch(() => ({}));
  if (!data || data.code !== 0) {
    throw new Error(`写入飞书表失败（${data?.code || res.status} ${data?.msg || ""}）`);
  }
}

async function batchUpdate(appToken, tableId, token, records) {
  if (!records.length) return;
  const res = await fetch(`${recordsUrl(appToken, tableId)}/batch_update`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ records }),
  });
  const data = await res.json().catch(() => ({}));
  if (!data || data.code !== 0) {
    throw new Error(`更新飞书表失败（${data?.code || res.status} ${data?.msg || ""}）`);
  }
}

/** 心愿单条目 → 飞书行字段（按实际类型自适应；含「ID」关联键） */
function toFields(item, types) {
  const d = item.data || {};
  const fields = {};
  const has = (name) => types.has(name);
  const setText = (name, v) => {
    if (!has(name)) return;
    if (v !== "" && v != null && v !== undefined) fields[name] = String(v);
  };

  setText("店名", item.title);
  setText("区域", d.area);
  setText("菜系", d.cuisine);
  setText("推荐菜", d.dishes);
  setText("备注", item.note);
  setText(ID_FIELD, item.id);

  // 人均：数字字段发数字，其它类型发字符串（容错）
  if (has("人均") && d.price_per_person != null && d.price_per_person !== "") {
    const n = Number(d.price_per_person);
    if (Number.isFinite(n)) {
      fields["人均"] = types.get("人均") === FIELD_NUMBER ? n : String(n);
    }
  }

  // 小红书链接：链接字段发 {link,text}，其它类型发字符串（容错）
  if (has("小红书链接") && d.xhs_url) {
    const url = String(d.xhs_url);
    fields["小红书链接"] = types.get("小红书链接") === FIELD_URL ? { link: url, text: url } : url;
  }

  return fields;
}

/** 从飞书字段里提取 URL（兼容 字符串 / {link,text} / 数组） */
function extractUrl(v) {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return extractUrl(v[0]);
  if (typeof v === "object") return v.link || v.text || "";
  return String(v);
}

/** 飞书行字段 → 心愿单餐厅条目；既无店名也无链接则视为空行，返回 null */
function fromFields(fields, recordId) {
  const g = (k) => fields[k];
  const rawTitle = g("店名");
  const title = rawTitle != null ? String(rawTitle).trim() : "";
  const xhsUrl = extractUrl(g("小红书链接"));
  if (!title && !xhsUrl) return null;

  const price = g("人均");
  const priceN = price != null && price !== "" ? Number(price) : NaN;

  return {
    id: String(recordId),
    category: "restaurant",
    title: title || "待整理餐厅",
    note: String(g("备注") || ""),
    completed: false,
    priority: null,
    created_at: Date.now(),
    data: {
      area: String(g("区域") || ""),
      cuisine: String(g("菜系") || ""),
      dishes: String(g("推荐菜") || ""),
      price_per_person: Number.isFinite(priceN) ? priceN : null,
      xhs_url: xhsUrl,
      images: [],
    },
  };
}

export async function syncRestaurantsToFeishu(items, cfg) {
  const restaurants = (Array.isArray(items) ? items : []).filter((it) => it.category === "restaurant");
  const token = await getToken(cfg);
  const appToken = await resolveAppToken(cfg, token);
  const tableId = cfg.feishuBitableTableId;

  const types = await getFieldTypes(appToken, tableId, token);
  if (!types.has(ID_FIELD)) {
    throw new Error("飞书表缺少「ID」字段：请在多维表格里新增一个文本字段，命名为「ID」");
  }

  const feishuRecords = await listAllRecords(appToken, tableId, token);
  const wishlistById = new Map(restaurants.map((it) => [String(it.id), it]));
  const feishuById = new Map();
  const newRows = []; // 飞书里手动新增、ID 为空的行

  for (const rec of feishuRecords) {
    const idVal = rec.fields[ID_FIELD];
    const idStr = idVal != null ? String(idVal).trim() : "";
    if (idStr) feishuById.set(idStr, rec);
    else newRows.push(rec);
  }

  // 心愿单 → 飞书：已有则更新，没有则新建
  const createOps = [];
  const updateOps = [];
  for (const it of restaurants) {
    const rec = feishuById.get(String(it.id));
    if (rec) updateOps.push({ record_id: rec.record_id, fields: toFields(it, types) });
    else createOps.push({ fields: toFields(it, types) });
  }

  // 飞书 → 心愿单：导入 ID 为空的新行，并回填「ID」= 该行的 record_id
  const importedItems = [];
  const importedWriteOps = [];
  for (const rec of newRows) {
    const item = fromFields(rec.fields, rec.record_id);
    if (!item) continue;
    importedItems.push(item);
    importedWriteOps.push({ record_id: rec.record_id, fields: { [ID_FIELD]: rec.record_id } });
  }

  for (let i = 0; i < createOps.length; i += 100) {
    await batchCreate(appToken, tableId, token, createOps.slice(i, i + 100));
  }
  const allUpdates = updateOps.concat(importedWriteOps);
  for (let i = 0; i < allUpdates.length; i += 100) {
    await batchUpdate(appToken, tableId, token, allUpdates.slice(i, i + 100));
  }

  return {
    pushed: createOps.length + updateOps.length,
    imported: importedItems.length,
    importedItems,
  };
}

/** HTTP 处理器：供 Vercel 函数与本地 server 复用。
 *  itemsProvider: () => Promise<items[]>；itemsSaver: (items) => Promise
 *  cfg 已含飞书配置。 */
export async function handleSyncFeishu(req, res, itemsProvider, itemsSaver, cfg) {
  if (req.method !== "POST") {
    return json(res, 404, { error: "接口不存在" });
  }

  const need = [
    cfg?.feishuAppId,
    cfg?.feishuAppSecret,
    cfg?.feishuBitableAppToken,
    cfg?.feishuBitableTableId,
  ];
  if (need.some((v) => !v)) {
    return json(res, 400, {
      error:
        "未配置飞书（FEISHU_APP_ID / FEISHU_APP_SECRET / FEISHU_BITABLE_APP_TOKEN / FEISHU_BITABLE_TABLE_ID）",
    });
  }

  try {
    const items = (await itemsProvider()) || [];
    const result = await syncRestaurantsToFeishu(items, cfg);

    // 把从飞书导入的新餐厅写回心愿单
    if (result.importedItems.length) {
      const merged = items.concat(result.importedItems);
      await itemsSaver(merged);
    }

    return json(res, 200, { ok: true, pushed: result.pushed, imported: result.imported });
  } catch (err) {
    console.error("[sync-feishu] 失败", err);
    return json(res, 502, { error: `同步失败（${err?.message || err}）` });
  }
}
