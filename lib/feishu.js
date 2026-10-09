// ============================================================
//  飞书多维表格（Bitable）同步
// ------------------------------------------------------------
//  - 用企业自建应用 tenant_access_token 调开放平台接口。
//  - 支持两种「多维表格 ID」来源：
//      1) 独立多维表格：地址栏 base/ 后面那串（直接是 app_token）
//      2) 知识库里的多维表格：地址栏 wiki/ 后面那串（节点 token，自动解析成 app_token）
//  - 同步策略：覆盖式（先清空表内旧记录，再批量写入当前餐厅清单），
//    适合「手机端只读查看」的场景；飞书表里的手动修改会被下次同步覆盖。
//  - 字段映射（需与用户在多维表格里建的字段名一致）：
//      店名(文本) 区域(文本) 菜系(文本) 人均(数字)
//      推荐菜(文本) 备注(文本) 小红书链接(链接/URL)
// ============================================================

import { json } from "./http.js";

const FEISHU_OPEN = "https://open.feishu.cn/open-apis";

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

async function listAllRecordIds(appToken, tableId, token) {
  const ids = [];
  let pageToken = "";
  for (;;) {
    const url = `${recordsUrl(appToken, tableId)}?page_size=500${pageToken ? `&page_token=${encodeURIComponent(pageToken)}` : ""}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json().catch(() => ({}));
    if (!data || data.code !== 0) {
      throw new Error(`读取飞书表失败（${data?.code || res.status} ${data?.msg || ""}）`);
    }
    for (const it of data.data?.items || []) ids.push(it.record_id);
    if (!data.data?.has_more) break;
    pageToken = data.data?.page_token || "";
  }
  return ids;
}

async function batchDelete(appToken, tableId, token, ids) {
  if (!ids.length) return;
  const res = await fetch(`${recordsUrl(appToken, tableId)}/batch_delete`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ records: ids }),
  });
  const data = await res.json().catch(() => ({}));
  if (!data || data.code !== 0) {
    throw new Error(`清空飞书表失败（${data?.code || res.status} ${data?.msg || ""}）`);
  }
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

function toFields(item) {
  const d = item.data || {};
  const fields = {};
  const set = (k, v) => {
    if (v !== "" && v != null && v !== undefined) fields[k] = v;
  };

  set("店名", item.title);
  set("区域", d.area);
  set("菜系", d.cuisine);
  set("推荐菜", d.dishes);
  set("备注", item.note);

  if (d.price_per_person != null && d.price_per_person !== "") {
    const n = Number(d.price_per_person);
    if (Number.isFinite(n)) set("人均", n);
  }
  if (d.xhs_url) {
    const url = String(d.xhs_url);
    set("小红书链接", { link: url, text: url });
  }
  return fields;
}

export async function syncRestaurantsToFeishu(items, cfg) {
  const list = Array.isArray(items) ? items : [];
  const token = await getToken(cfg);
  const appToken = await resolveAppToken(cfg, token);
  const tableId = cfg.feishuBitableTableId;

  // 1. 清空旧记录（分页取 record_id 后批量删除）
  const existing = await listAllRecordIds(appToken, tableId, token);
  for (let i = 0; i < existing.length; i += 100) {
    await batchDelete(appToken, tableId, token, existing.slice(i, i + 100));
  }

  // 2. 批量写入
  const records = list.map((it) => ({ fields: toFields(it) }));
  for (let i = 0; i < records.length; i += 100) {
    await batchCreate(appToken, tableId, token, records.slice(i, i + 100));
  }

  return records.length;
}

/** HTTP 处理器：供 Vercel 函数与本地 server 复用。
 *  itemsProvider: () => Promise<items[]>；cfg 已含飞书配置。 */
export async function handleSyncFeishu(req, res, itemsProvider, cfg) {
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
    const restaurants = items.filter((it) => it.category === "restaurant");
    const count = await syncRestaurantsToFeishu(restaurants, cfg);
    return json(res, 200, { ok: true, count });
  } catch (err) {
    console.error("[sync-feishu] 失败", err);
    return json(res, 502, { error: `同步失败（${err?.message || err}）` });
  }
}
