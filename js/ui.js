// ============================================================
//  UI 渲染层：生成 HTML 字符串 + 少量 DOM 交互（弹窗/灯箱/提示）
// ------------------------------------------------------------
//  只负责「呈现」，业务逻辑由 app.js 编排、wishlist.js 承载。
//  所有用户/第三方数据均经 escapeHtml / sanitizeHtml 处理，防止注入。
// ============================================================

import {
  escapeHtml,
  sanitizeHtml,
  formatDate,
  formatPrice,
} from "./utils.js";
import { getCategoryIcon, getCategoryName } from "./categories.js";
import { PRIORITY_LEVELS, normalizePriority } from "./wishlist.js";

const NO_DATA = "暂无资料";
const NO_IMAGE = "暂无图片";

// ---------- 分类导航 ----------

export function categoryChipsHTML(categories, activeCategory, countsByCategory) {
  const all = [
    {
      id: "all",
      icon: "🗂️",
      label: "全部心愿",
      count: countsByCategory.all ?? 0,
    },
    ...categories.map((c) => ({
      id: c.id,
      icon: c.icon,
      label: c.name,
      count: countsByCategory[c.id] ?? 0,
    })),
  ];

  return all
    .map((c) => {
      const active = c.id === activeCategory ? "chip--active" : "";
      return `
        <button class="chip ${active}" data-action="category" data-category="${c.id}" type="button">
          <span class="chip__icon">${c.icon}</span>
          <span>${escapeHtml(c.label)}</span>
          <span class="chip__count">${c.count}</span>
        </button>`;
    })
    .join("");
}

// ---------- 状态筛选 / 排序 ----------

export function statusTabsHTML(activeStatus, stats) {
  const tabs = [
    { id: "uncompleted", label: "未购买", count: stats.uncompleted },
    { id: "completed", label: "已购买", count: stats.completed },
  ];
  return tabs
    .map(
      (t) => `
      <button class="tab ${activeStatus === t.id ? "tab--active" : ""}"
              data-action="status" data-status="${t.id}" type="button">
        ${t.label} <span class="tab__count">${t.count}</span>
      </button>`
    )
    .join("");
}

// ---------- 购买优先度筛选 ----------

export function priorityTabsHTML(activePriority, counts) {
  const tabs = [
    { id: "all", label: "全部", count: counts.all ?? 0, cls: "" },
    ...PRIORITY_LEVELS.map((p) => ({
      id: p.id,
      label: p.label,
      count: counts[p.id] ?? 0,
      cls: `tab--prio tab--prio-${p.id.toLowerCase()}`,
    })),
    { id: "none", label: "未分级", count: counts.none ?? 0, cls: "" },
  ];
  return tabs
    .map(
      (t) => `
      <button class="tab ${t.cls} ${activePriority === t.id ? "tab--active" : ""}"
              data-action="priority" data-priority="${t.id}" type="button"
              title="${escapeHtml(t.full || t.label)}">
        ${escapeHtml(t.label)} <span class="tab__count">${t.count}</span>
      </button>`
    )
    .join("");
}

// ---------- 心愿卡片 ----------

export function prioritySelectHTML(priority, itemId) {
  const p = normalizePriority(priority);
  const cls = `priority-select--${(p || "none").toLowerCase()}`;
  return `<select class="priority-select ${cls}" data-action="priority-select"
          data-id="${escapeHtml(itemId)}" aria-label="购买优先度" title="购买优先度">
    <option value="" ${p === "" ? "selected" : ""}>未分级</option>
    <option value="S" ${p === "S" ? "selected" : ""}>S</option>
    <option value="A" ${p === "A" ? "selected" : ""}>A</option>
    <option value="B" ${p === "B" ? "selected" : ""}>B</option>
    <option value="C" ${p === "C" ? "selected" : ""}>C</option>
  </select>`;
}

export function priorityBadgeHTML(priority, itemId) {
  const p = normalizePriority(priority);
  const label = p || "未分级";
  const cls = `priority-badge--${(p || "none").toLowerCase()}`;
  return `<button type="button" class="priority-badge ${cls}" data-action="priority-edit"
          data-id="${escapeHtml(itemId)}" title="点击设置优先度" aria-label="设置优先度">${label}</button>`;
}

export function priceFieldHTML(item) {
  const d = item.data || {};
  const formatted = formatPrice(d.price);
  const text = formatted || "未设置";
  const cls = formatted ? "" : "price-value--empty";
  return `<button type="button" class="price-value ${cls}" data-action="price-edit"
          data-id="${escapeHtml(item.id)}" title="点击设置价格" aria-label="设置参考价格">${text}</button>`;
}

export function priceInputHTML(itemId, price) {
  const v = price != null ? price : "";
  return `<div class="price-input-wrap">
    <span class="price-input__symbol">¥</span>
    <input class="price-input" type="text" inputmode="decimal"
           data-action="price-input" data-id="${escapeHtml(itemId)}"
           value="${escapeHtml(String(v))}" placeholder="未设置" aria-label="参考价格">
  </div>`;
}

export function wishlistCardHTML(item) {
  const d = item.data || {};
  const cover = d.cover || "";
  const genres = Array.isArray(d.genres) ? d.genres.join(" / ") : "";
  const release = formatDate(d.release_date);
  const boughtClass = item.completed ? "game-card--bought" : "";

  return `
  <article class="game-card ${boughtClass}" data-id="${escapeHtml(item.id)}"
           data-external-id="${escapeHtml(d.external_id || "")}">
    <div class="cover">
      ${
        cover
          ? `<img src="${escapeHtml(cover)}" alt="" loading="lazy"
                 onerror="this.parentElement.classList.add('cover--empty')">`
          : ""
      }
      <span class="cover__placeholder">${NO_IMAGE}</span>
      <div class="priority-field priority-field--cover" data-id="${escapeHtml(item.id)}">
        ${priorityBadgeHTML(item.priority, item.id)}
      </div>
      ${item.completed ? '<span class="badge badge--bought">✓ 已购买</span>' : ""}
    </div>
    <div class="game-card__body">
      <h3 class="game-card__title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</h3>
      <p class="game-card__meta"><span class="meta-label">发售</span>${escapeHtml(release || NO_DATA)}</p>
      <p class="game-card__meta"><span class="meta-label">类型</span>${escapeHtml(genres || NO_DATA)}</p>
      <div class="game-card__price">
        <span class="meta-label">参考价格</span>
        <div class="price-field" data-id="${escapeHtml(item.id)}">
          ${priceFieldHTML(item)}
        </div>
      </div>
      <div class="game-card__actions">
        <button class="btn btn--ghost btn--sm" data-action="detail" data-id="${escapeHtml(item.id)}" type="button">查看</button>
        <button class="btn btn--ghost btn--sm" data-action="edit" data-id="${escapeHtml(item.id)}" type="button">编辑</button>
        <button class="btn btn--ghost btn--sm" data-action="toggle" data-id="${escapeHtml(item.id)}" type="button">
          ${item.completed ? "标为未购买" : "标为已购买"}
        </button>
        <button class="btn btn--danger btn--sm" data-action="delete" data-id="${escapeHtml(item.id)}" type="button">删除</button>
      </div>
    </div>
  </article>`;
}

// ---------- 搜索结果卡片 ----------

export function searchResultCardHTML(game, inWishlist) {
  const genres = Array.isArray(game.genres) ? game.genres.join(" / ") : "";
  const release = formatDate(game.release_date);

  return `
  <article class="result-card" data-game-id="${escapeHtml(game.id || game.external_id)}">
    <div class="cover">
      ${
        game.cover
          ? `<img src="${escapeHtml(game.cover)}" alt="" loading="lazy"
                 onerror="this.parentElement.classList.add('cover--empty')">`
          : ""
      }
      <span class="cover__placeholder">${NO_IMAGE}</span>
    </div>
    <div class="result-card__body">
      <h3 class="result-card__title">${escapeHtml(game.title || game.name_cn || game.name_en)}</h3>
      ${game.name_en && game.name_en !== game.title ? `<p class="result-card__sub">${escapeHtml(game.name_en)}</p>` : ""}
      <p class="result-card__meta">发售：${escapeHtml(release || NO_DATA)}</p>
      <p class="result-card__meta">平台：${escapeHtml((game.platforms || []).join(" / ") || NO_DATA)}</p>
      <p class="result-card__meta">类型：${escapeHtml(genres || NO_DATA)}</p>
      <div class="result-card__actions">
        <button class="btn btn--primary btn--sm" data-action="detail" data-game-id="${escapeHtml(game.id || game.external_id)}" type="button">查看详情</button>
        ${
          inWishlist
            ? '<span class="in-wishlist">✓ 已在心愿单</span>'
            : `<button class="btn btn--accent btn--sm" data-action="add" data-game-id="${escapeHtml(game.id || game.external_id)}" type="button">＋ 加入心愿单</button>`
        }
      </div>
    </div>
  </article>`;
}

// ---------- 详情弹窗 ----------

function detailMetaRow(label, value) {
  return `
    <div class="detail-meta__item">
      <span class="detail-meta__label">${escapeHtml(label)}</span>
      <span class="detail-meta__value">${escapeHtml(value || NO_DATA)}</span>
    </div>`;
}

function descriptionSectionHTML(game) {
  const hasEn = !!game.description;
  const hasZh = !!game.description_zh;
  if (!hasEn && !hasZh) {
    return `<section class="detail-section"><h3>游戏介绍</h3><div class="detail-desc"><span class="muted">${NO_DATA}</span></div></section>`;
  }
  const zhBlock = hasZh
    ? `<div class="detail-desc detail-desc--zh" data-desc="zh">${escapeHtml(game.description_zh)}<p class="desc-note">（中文为机器翻译，仅供参考）</p></div>`
    : "";
  const enBlock = hasEn
    ? `<div class="detail-desc" data-desc="en" ${hasZh ? "hidden" : ""}>${sanitizeHtml(game.description)}</div>`
    : "";
  const toggle = hasEn && hasZh
    ? `<button class="btn btn--ghost btn--sm" data-action="toggle-desc" type="button">查看英文原文</button>`
    : "";
  return `
    <section class="detail-section">
      <div class="detail-section__head">
        <h3>游戏介绍</h3>
        ${toggle}
      </div>
      ${zhBlock}
      ${enBlock}
    </section>`;
}

export function detailModalHTML(game, { inWishlist = false, loading = false, fetchError = false } = {}) {
  if (loading) {
    return `
    <div class="detail detail--loading">
      <div class="spinner"></div>
      <p>正在加载游戏详情…</p>
    </div>`;
  }

  const screenshots = Array.isArray(game.screenshots) ? game.screenshots : [];
  const genres = Array.isArray(game.genres) ? game.genres.join(" / ") : "";
  const platforms = Array.isArray(game.platforms) ? game.platforms.join(" / ") : "";
  const rating = game.metacritic != null ? `${game.metacritic}（Metacritic）` : "";

  return `
  <div class="detail" data-game-id="${escapeHtml(game.id || game.external_id || "")}"
       data-external-id="${escapeHtml(game.external_id || game.id || "")}">
    <div class="detail__hero">
      <div class="detail__cover cover">
        ${
          game.cover
            ? `<img src="${escapeHtml(game.cover)}" alt=""
                   onerror="this.parentElement.classList.add('cover--empty')">`
            : ""
        }
        <span class="cover__placeholder">${NO_IMAGE}</span>
      </div>
      <div class="detail__titleblock">
        <h2>${escapeHtml(game.title || game.name_cn || game.name_en)}</h2>
        ${game.name_en ? `<p class="detail__sub">${escapeHtml(game.name_en)}</p>` : ""}
        ${
          game.name_jp
            ? `<p class="detail__sub detail__sub--jp">${escapeHtml(game.name_jp)}</p>`
            : ""
        }
        ${rating ? `<p class="detail__score">${escapeHtml(rating)}</p>` : ""}
        <div class="detail__footer-actions">
          ${
            inWishlist
              ? `<span class="in-wishlist">✓ 已加入心愿单</span>
                 <button class="btn btn--ghost" data-action="edit-wish" type="button">编辑价格 / 备注</button>`
              : `<button class="btn btn--accent" data-action="add-wish" type="button">＋ 加入心愿单</button>`
          }
        </div>
      </div>
    </div>

    ${fetchError ? '<p class="hint hint--warn">详情加载不完整：已展示缓存信息，图片/简介可能缺失。</p>' : ""}

    <div class="detail-meta">
      ${detailMetaRow("中文名", game.name_cn)}
      ${detailMetaRow("英文名", game.name_en)}
      ${detailMetaRow("日文名", game.name_jp)}
      ${detailMetaRow("发售日期", formatDate(game.release_date))}
      ${detailMetaRow("开发商", game.developer)}
      ${detailMetaRow("发行商", game.publisher)}
      ${detailMetaRow("游戏类型", genres)}
      ${detailMetaRow("平台", platforms)}
      ${detailMetaRow("玩家人数", game.players)}
    </div>

    ${descriptionSectionHTML(game)}

    <section class="detail-section">
      <h3>图片</h3>
      ${
        screenshots.length
          ? `<div class="screenshot-grid">
              ${screenshots
                .map(
                  (s, i) => `
                <button class="screenshot" data-action="lightbox" data-url="${escapeHtml(s.url)}" type="button"
                        aria-label="查看大图">
                  <img src="${escapeHtml(s.url)}" alt="" loading="lazy"
                       onerror="this.parentElement.classList.add('cover--empty')">
                  <span class="cover__placeholder">${NO_IMAGE}</span>
                </button>`
                )
                .join("")}
            </div>`
          : `<p class="muted">暂无截图</p>`
      }
    </section>
  </div>`;
}

// ---------- 编辑弹窗 ----------

export function editModalHTML(item) {
  const d = item.data || {};
  const priceValue = d.price != null ? d.price : "";
  const priority = normalizePriority(item.priority);
  return `
  <form class="edit-form" id="editForm">
    <div class="field">
      <label for="editTitle">名称</label>
      <input id="editTitle" name="title" type="text" value="${escapeHtml(item.title)}" maxlength="200">
    </div>
    <div class="field">
      <label for="editPriority">购买优先度</label>
      <select id="editPriority" name="priority" class="select">
        <option value="" ${priority === "" ? "selected" : ""}>未分级</option>
        <option value="S" ${priority === "S" ? "selected" : ""}>S · 最高优先</option>
        <option value="A" ${priority === "A" ? "selected" : ""}>A · 高优先</option>
        <option value="B" ${priority === "B" ? "selected" : ""}>B · 中优先</option>
        <option value="C" ${priority === "C" ? "selected" : ""}>C · 低优先</option>
      </select>
    </div>
    <div class="field">
      <label for="editPrice">参考价格（元）</label>
      <div class="price-row">
        <input id="editPrice" name="price" type="number" min="0" step="0.01"
               value="${escapeHtml(String(priceValue))}" placeholder="例如 280">
        <button class="btn btn--ghost btn--sm" data-action="clear-price" type="button">清空</button>
      </div>
    </div>
    <div class="field">
      <label for="editNote">备注</label>
      <textarea id="editNote" name="note" rows="3" maxlength="500"
                placeholder="例如：等 200 元以下再买">${escapeHtml(item.note)}</textarea>
    </div>
    <label class="switch-row">
      <input type="checkbox" id="editCompleted" name="completed" ${item.completed ? "checked" : ""}>
      <span>已购买</span>
    </label>
  </form>`;
}

// ---------- 空态 / 加载 / 错误 ----------

export function emptyStateHTML(icon, title, desc) {
  return `
  <div class="empty-state">
    <div class="empty-state__icon">${icon}</div>
    <p class="empty-state__title">${escapeHtml(title)}</p>
    <p class="empty-state__desc">${escapeHtml(desc)}</p>
  </div>`;
}

export function messageHTML(text, kind = "info") {
  return `<p class="message message--${kind}">${escapeHtml(text)}</p>`;
}

// ---------- DOM 交互（弹窗 / 灯箱 / 提示） ----------

export function openModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add("modal--open");
  document.body.classList.add("no-scroll");
}

export function closeModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove("modal--open");
  // 若没有其它打开的弹窗，恢复滚动
  if (!document.querySelector(".modal--open")) document.body.classList.remove("no-scroll");
}

export function openLightbox(url) {
  let box = document.getElementById("lightbox");
  if (!box) return;
  const img = box.querySelector(".lightbox__img");
  img.src = url;
  box.classList.add("lightbox--open");
  document.body.classList.add("no-scroll");
}

export function closeLightbox() {
  const box = document.getElementById("lightbox");
  if (!box) return;
  box.classList.remove("lightbox--open");
  box.querySelector(".lightbox__img")?.removeAttribute("src");
  document.body.classList.remove("no-scroll");
}

let toastTimer = null;
export function showToast(message, type = "info") {
  const container = document.getElementById("toast");
  if (!container) return;
  const el = document.createElement("div");
  el.className = `toast toast--${type}`;
  el.textContent = message;
  container.appendChild(el);

  requestAnimationFrame(() => el.classList.add("toast--show"));
  setTimeout(() => {
    el.classList.remove("toast--show");
    setTimeout(() => el.remove(), 300);
  }, 2600);
}

/** 搜索按钮加载态 */
export function setButtonLoading(btn, isLoading, loadingText = "搜索中…") {
  if (!btn) return;
  if (isLoading) {
    btn.dataset.origin = btn.textContent;
    btn.textContent = loadingText;
    btn.disabled = true;
  } else {
    btn.textContent = btn.dataset.origin || "搜索";
    btn.disabled = false;
  }
}
