// ============================================================
//  餐厅心愿单模块（自包含）：HTML 渲染 + 业务操作 + 菜名识别
// ------------------------------------------------------------
//  与 NS 卡带（游戏）模块解耦，避免互相影响。
//  只依赖：utils / api / ui（DOM 原语）/ wishlist（领域核心）。
//  通过 ctx 接收应用上下文（state / persist / render），不反向依赖 app.js。
// ============================================================

import { escapeHtml } from "./utils.js";
import { api } from "./api.js";
import { showToast, openModal, closeModal } from "./ui.js";
import { createWishlistItem, updateItem } from "./wishlist.js";

// ---------- 菜名识别（基于规则，结果需人工核对） ----------

// 菜名常见结尾字（以这些字结尾的词，大概率是菜/食物）
const DISH_TAIL =
  "肉鱼虾蟹贝螺鸡鸭鹅牛羊猪面饭汤锅饺包粉饼煲羹汁翅爪肠丸骨排糕酥卷串片丝丁块条粥茶酒奶冰露酪冻菜烧烤腿脚脖蛋腐豆翅头筋胗肝肚腰柳腱";

// 非菜名停用词（直接排除）
const STOP = new Set([
  "这个", "那个", "这家", "这家店", "他们", "我们", "我", "你", "他", "她", "它", "你们", "咱们",
  "是", "的", "了", "很", "真的", "超级", "超", "巨", "特别", "非常", "也", "都", "还", "就", "有", "和", "跟", "与", "等",
  "好吃", "好喝", "推荐", "必点", "招牌", "点了", "吃", "喝", "点", "去", "来", "还有", "以及", "等等",
  "一共", "人均", "服务", "环境", "味道", "排队", "位置", "性价比", "价格", "菜品", "老板", "店员", "门口", "附近",
  "地铁", "开车", "停车", "预约", "订位", "营业", "周末", "工作日", "中午", "晚上", "朋友", "闺蜜", "家人",
  "一个", "一份", "两个", "元", "块", "块钱", "左右", "大概", "记得", "觉得", "感觉", "可以", "不错", "值得",
  "下次", "还会", "回购", "打卡", "探店", "好吃到", "必去", "最爱",
]);

function cleanToken(raw) {
  let s = String(raw || "").trim();
  s = s.replace(/^(的|了|很|真的|超级|超|巨|特别|非常|也|都|还|就|是|有|和|跟|与|点|吃)+/, "");
  s = s.replace(/(的|了|很|真|超|巨|好|吃|喝|点|啦|呢|啊|哦|呀|吧|～|~|!|！)+$/, "");
  return s.trim();
}

function looksLikeDish(t) {
  if (!t || t.length < 2 || t.length > 6) return false;
  if (STOP.has(t)) return false;
  if (!/^[\u4e00-\u9fa5]+$/.test(t)) return false;
  if (DISH_TAIL.includes(t[t.length - 1])) return true;
  return /[肉鱼虾蟹鸡鸭鹅牛羊猪面饭汤锅饺包粉饼羹汁翅爪肠丸骨排糕酥卷串]/.test(t);
}

/** 从正文里提取候选菜名（去重、保序，最多 20 个） */
export function extractDishes(body) {
  const text = String(body || "");
  if (!text) return [];

  const out = [];
  const seen = new Set();
  const add = (raw) => {
    const t = cleanToken(raw);
    if (!looksLikeDish(t)) return;
    if (seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };

  let m;

  // 1) 关键词 + 冒号 + 列表：推荐菜：烤鸭、虾饺、杨枝甘露
  const colonRe =
    /(?:推荐菜|招牌菜|特色菜|必点|推荐|招牌|点了|点的|主食|甜品|饮品|小吃|凉菜|热菜)[：:]\s*([^。！？；;\n]{1,80})/g;
  while ((m = colonRe.exec(text))) {
    m[1].split(/[、，,]/).forEach(add);
  }

  // 2) 顿号列举：烤鸭、虾饺、杨枝甘露
  const dunRe = /[\u4e00-\u9fa5]{2,6}(?:[、][\u4e00-\u9fa5]{2,6})+/g;
  while ((m = dunRe.exec(text))) {
    m[0].split("、").forEach(add);
  }

  // 3) 关键词紧跟菜名：推荐烤鸭 / 招牌虾饺 / 必点杨枝甘露
  const kwRe = /(?:推荐|招牌|必点|强推|安利|点了|最爱|必吃|招牌是)([\u4e00-\u9fa5]{2,6})/g;
  while ((m = kwRe.exec(text))) {
    add(m[1]);
  }

  return out.slice(0, 20);
}

// ---------- 餐厅卡片 ----------

export function restaurantCardHTML(item) {
  const d = item.data || {};
  const images = Array.isArray(d.images) ? d.images : [];
  const cover = images[0] || "";
  const doneClass = item.completed ? "game-card--bought" : "";
  const xhsOk = /^https?:\/\//i.test(d.xhs_url || "");
  const meta = [
    ["区域", d.area],
    ["菜系", d.cuisine],
    ["人均", d.price_per_person != null && d.price_per_person !== "" ? `¥${d.price_per_person}` : ""],
    ["推荐", d.dishes],
  ].filter(([, v]) => v);

  return `
  <article class="game-card ${doneClass}" data-id="${escapeHtml(item.id)}" data-action="detail">
    <div class="cover">
      ${
        cover
          ? `<img src="${escapeHtml(cover)}" alt="" loading="lazy"
                 data-action="lightbox" data-url="${escapeHtml(cover)}"
                 onerror="this.parentElement.classList.add('cover--empty')">`
          : ""
      }
      <span class="cover__placeholder">🍜 暂无图片</span>
      ${item.completed ? '<span class="badge badge--bought">✓ 已去过</span>' : ""}
      ${images.length > 1 ? `<span class="badge badge--count">${images.length} 图</span>` : ""}
    </div>
    <div class="game-card__body">
      <h3 class="game-card__title" title="${escapeHtml(item.title)}">${escapeHtml(item.title || "未命名餐厅")}</h3>
      ${meta
        .map(([label, value]) => `<p class="game-card__meta"><span class="meta-label">${escapeHtml(label)}</span>${escapeHtml(value)}</p>`)
        .join("")}
      ${
        xhsOk
          ? `<p class="game-card__meta"><a class="meta-link" href="${escapeHtml(d.xhs_url)}" target="_blank" rel="noopener">🔗 小红书笔记</a></p>`
          : ""
      }
      <div class="game-card__actions">
        <button class="btn btn--ghost btn--sm" data-action="detail" data-id="${escapeHtml(item.id)}" type="button">查看</button>
        <button class="btn btn--ghost btn--sm" data-action="edit" data-id="${escapeHtml(item.id)}" type="button">编辑</button>
        <button class="btn btn--ghost btn--sm" data-action="toggle" data-id="${escapeHtml(item.id)}" type="button">
          ${item.completed ? "标为未去" : "标为已去过"}
        </button>
        <button class="btn btn--danger btn--sm" data-action="delete" data-id="${escapeHtml(item.id)}" type="button">删除</button>
      </div>
    </div>
  </article>`;
}

// ---------- 餐厅编辑 / 添加表单 ----------

export function restaurantEditFormHTML(item) {
  const d = item.data || {};
  const images = Array.isArray(d.images) ? d.images : [];
  const priceVal = d.price_per_person != null ? d.price_per_person : "";

  return `
  <form class="edit-form" id="editForm">
    <div class="field">
      <label for="restName">店名</label>
      <input id="restName" name="title" type="text" value="${escapeHtml(item.title)}" maxlength="100" placeholder="例如：老北京涮肉">
    </div>
    <div class="field-row">
      <div class="field">
        <label for="restArea">区域 / 商圈</label>
        <input id="restArea" name="area" type="text" value="${escapeHtml(d.area || "")}" maxlength="100" placeholder="例如：三里屯">
      </div>
      <div class="field">
        <label for="restCuisine">菜系</label>
        <input id="restCuisine" name="cuisine" type="text" value="${escapeHtml(d.cuisine || "")}" maxlength="100" placeholder="例如：粤菜 / 火锅">
      </div>
    </div>
    <div class="field">
      <label for="restDishes">推荐菜</label>
      <div class="url-row">
        <input id="restDishes" name="dishes" type="text" value="${escapeHtml(d.dishes || "")}" maxlength="200" placeholder="例如：烤鸭、虾饺、杨枝甘露">
        <button class="btn btn--ghost btn--sm" data-action="extract-dishes" type="button">✨ 提取</button>
      </div>
      <p class="hint">点「提取」从备注正文自动猜菜名（结果供核对，可手动改）。</p>
    </div>
    <div class="field-row">
      <div class="field">
        <label for="restPrice">人均（元）</label>
        <input id="restPrice" name="price_per_person" type="number" min="0" step="0.01"
               value="${escapeHtml(String(priceVal))}" placeholder="例如 80">
      </div>
      <div class="field">
        <label for="restUrl">小红书链接</label>
        <div class="url-row">
          <input id="restUrl" name="xhs_url" type="text" inputmode="url" value="${escapeHtml(d.xhs_url || "")}" maxlength="500" placeholder="https://www.xiaohongshu.com/explore/…">
          <button class="btn btn--ghost btn--sm" data-action="import-xhs" type="button">🔗 一键导入</button>
        </div>
        <p class="hint">粘贴链接后点「一键导入」→ 自动打开笔记 → 在笔记页点「回填到心愿单」，标题/正文/图片会自动填进来。</p>
      </div>
    </div>
    <div class="field">
      <label id="imgCount">图片（${images.length} 张）</label>
      <div class="img-grid" id="imgGrid">
        ${images
          .map(
            (u) => `
          <div class="img-thumb img-thumb--existing" data-url="${escapeHtml(u)}">
            <button class="img-thumb__view" data-action="lightbox" data-url="${escapeHtml(u)}" type="button" aria-label="查看大图">
              <img src="${escapeHtml(u)}" alt="" loading="lazy" onerror="this.parentElement.classList.add('cover--empty')">
            </button>
            <button class="img-thumb__remove" data-action="img-remove" type="button" aria-label="移除图片">✕</button>
          </div>`
          )
          .join("")}
      </div>
      <div class="img-grid img-grid--new" id="imgGridNew"></div>
      <label class="btn btn--ghost btn--sm img-add" for="restFileInput">＋ 添加图片</label>
      <input id="restFileInput" type="file" multiple accept="image/*" hidden>
      <p class="hint">图片存到 Supabase，全家共享；单张不超过 3MB。</p>
    </div>
    <div class="field">
      <label for="restNote">备注</label>
      <textarea id="restNote" name="note" rows="2" maxlength="500" placeholder="例如：需提前订位 / 周末排队久">${escapeHtml(item.note)}</textarea>
    </div>
    <label class="switch-row">
      <input type="checkbox" id="restCompleted" name="completed" ${item.completed ? "checked" : ""}>
      <span>已去过</span>
    </label>
  </form>`;
}

// ---------- 餐厅详情 ----------

export function restaurantDetailHTML(item) {
  const d = item.data || {};
  const images = Array.isArray(d.images) ? d.images : [];
  const cover = images[0] || "";
  const xhsOk = /^https?:\/\//i.test(d.xhs_url || "");
  const metaRows = [
    ["区域", d.area],
    ["菜系", d.cuisine],
    ["人均", d.price_per_person != null && d.price_per_person !== "" ? `¥${d.price_per_person}` : ""],
    ["推荐菜", d.dishes],
  ].filter(([, v]) => v);

  return `
  <div class="detail" data-id="${escapeHtml(item.id)}">
    <div class="detail__hero">
      <div class="detail__cover cover">
        ${cover ? `<img src="${escapeHtml(cover)}" alt="" onerror="this.parentElement.classList.add('cover--empty')">` : ""}
        <span class="cover__placeholder">🍜 暂无图片</span>
      </div>
      <div class="detail__titleblock">
        <h2>${escapeHtml(item.title || "未命名餐厅")}</h2>
        ${item.completed ? '<p class="detail__sub">✓ 已去过</p>' : ""}
        <div class="detail__footer-actions">
          <button class="btn btn--ghost" data-action="edit-wish" type="button">编辑</button>
          <button class="btn btn--ghost" data-action="toggle" data-id="${escapeHtml(item.id)}" type="button">
            ${item.completed ? "标为未去" : "标为已去过"}
          </button>
          <button class="btn btn--danger" data-action="delete" data-id="${escapeHtml(item.id)}" type="button">删除</button>
          ${xhsOk ? `<a class="btn btn--accent" href="${escapeHtml(d.xhs_url)}" target="_blank" rel="noopener">🔗 打开小红书笔记</a>` : ""}
        </div>
      </div>
    </div>

    <div class="detail-meta">
      ${metaRows
        .map(
          ([label, value]) => `
        <div class="detail-meta__item">
          <span class="detail-meta__label">${escapeHtml(label)}</span>
          <span class="detail-meta__value">${escapeHtml(value)}</span>
        </div>`
        )
        .join("")}
    </div>

    ${item.note ? `<section class="detail-section"><h3>备注</h3><div class="detail-desc">${escapeHtml(item.note)}</div></section>` : ""}

    <section class="detail-section">
      <h3>图片（${images.length}）</h3>
      ${
        images.length
          ? `<div class="screenshot-grid">
              ${images
                .map(
                  (u) => `
                <button class="screenshot" data-action="lightbox" data-url="${escapeHtml(u)}" type="button" aria-label="查看大图">
                  <img src="${escapeHtml(u)}" alt="" loading="lazy" onerror="this.parentElement.classList.add('cover--empty')">
                  <span class="cover__placeholder">🍜</span>
                </button>`
                )
                .join("")}
            </div>`
          : `<p class="muted">暂无图片</p>`
      }
    </section>
  </div>`;
}

// ---------- 操作 ----------

function parsePrice(v) {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** 打开「添加餐厅」表单 */
export function openAddRestaurant(ctx) {
  ctx.state.editItemId = null;
  ctx.state.editCategory = "restaurant";
  ctx.state.pendingFiles = [];
  const blank = createWishlistItem({ category: "restaurant", title: "" });
  document.getElementById("editContent").innerHTML = restaurantEditFormHTML(blank);
  const titleEl = document.querySelector("#editModal .modal__title");
  if (titleEl) titleEl.textContent = "添加餐厅";
  openModal("editModal");
}

/** 渲染待上传图片预览 */
export function renderPendingImages(ctx) {
  const grid = document.getElementById("imgGridNew");
  if (!grid) return;
  grid.innerHTML = (ctx.state.pendingFiles || [])
    .map(
      (f, i) => `
      <div class="img-thumb img-thumb--new">
        <img src="${URL.createObjectURL(f)}" alt="">
        <button class="img-thumb__remove" data-action="img-remove-new" data-index="${i}" type="button" aria-label="移除">✕</button>
      </div>`
    )
    .join("");
}

/** 保存餐厅（新建或更新） */
export async function saveRestaurant(ctx, form, itemId) {
  const title = form.title.value.trim();
  if (!title) {
    showToast("店名不能为空", "warn");
    return;
  }

  // 保留未删除的已有图片
  const kept = [...document.querySelectorAll("#imgGrid .img-thumb--existing")]
    .map((el) => el.dataset.url)
    .filter(Boolean);

  // 上传新选择的图片
  const pending = ctx.state.pendingFiles || [];
  let uploaded = [];
  if (pending.length) {
    showToast(`正在上传 ${pending.length} 张图片…`, "info");
    try {
      uploaded = await Promise.all(pending.map((f) => api.uploadImage(f)));
    } catch (err) {
      showToast(`图片上传失败：${err.message}`, "error");
      return;
    }
  }

  const data = {
    area: form.area.value.trim(),
    cuisine: form.cuisine.value.trim(),
    dishes: form.dishes.value.trim(),
    price_per_person: parsePrice(form.price_per_person.value),
    xhs_url: form.xhs_url.value.trim(),
    images: [...kept, ...uploaded],
  };
  const note = form.note.value.trim();
  const completed = form.completed.checked;

  if (itemId) {
    ctx.state.items = updateItem(ctx.state.items, itemId, { title, note, completed, data });
  } else {
    const item = createWishlistItem({ category: "restaurant", title, note, data });
    ctx.state.items = [item, ...ctx.state.items];
  }

  ctx.persist();
  ctx.render();
  closeModal("editModal");
  ctx.state.editItemId = null;
  ctx.state.editCategory = "ns_game";
  ctx.state.pendingFiles = [];
  showToast("已保存", "success");
}

/** 把已转存好的图片 URL 追加到表单图片网格（作为「已有图片」参与保存） */
export function appendExistingImages(urls) {
  const grid = document.getElementById("imgGrid");
  if (!grid) return;
  for (const u of urls) {
    if (!u) continue;
    const div = document.createElement("div");
    div.className = "img-thumb img-thumb--existing";
    div.dataset.url = u;

    const view = document.createElement("button");
    view.className = "img-thumb__view";
    view.type = "button";
    view.dataset.action = "lightbox";
    view.dataset.url = u;
    view.setAttribute("aria-label", "查看大图");
    const img = document.createElement("img");
    img.src = u;
    img.alt = "";
    img.loading = "lazy";
    view.appendChild(img);

    const rm = document.createElement("button");
    rm.className = "img-thumb__remove";
    rm.type = "button";
    rm.dataset.action = "img-remove";
    rm.setAttribute("aria-label", "移除图片");
    rm.textContent = "✕";

    div.appendChild(view);
    div.appendChild(rm);
    grid.appendChild(div);
  }
  const n = document.querySelectorAll("#imgGrid .img-thumb--existing").length;
  const label = document.getElementById("imgCount");
  if (label) label.textContent = `图片（${n} 张）`;
}

/** 接收篡改猴脚本回传的笔记内容，回填到餐厅表单 */
export async function handleXhsNote(ctx, data) {
  const form = document.getElementById("editForm");
  if (!form || ctx.state.editCategory !== "restaurant") return;

  const title = data.title || "";
  const body = data.body || "";
  const cover = data.cover || null;

  // 店名用标题作为起点（用户可改）；正文填到备注
  if (title && !form.title.value.trim()) form.title.value = title;
  if (body && !form.note.value.trim()) form.note.value = body;

  // 自动从正文提取菜名，填到「推荐菜」（用户可再核对/修改）
  if (body && !form.dishes.value.trim()) {
    const dishes = extractDishes(body);
    if (dishes.length) form.dishes.value = dishes.join("、");
  }

  if (cover && cover.data) {
    showToast("正在保存封面图…", "info");
    try {
      const url = await api.uploadImageData(cover);
      appendExistingImages([url]);
      showToast("封面图已保存", "success");
    } catch (err) {
      showToast(`封面图保存失败：${err.message}`, "warn");
    }
  } else {
    showToast("已回填标题与正文（这条笔记没抓到封面图）", "success");
  }
}
