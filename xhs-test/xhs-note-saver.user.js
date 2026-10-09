// ==UserScript==
// @name         小红书笔记提取（自用·餐厅收藏）
// @namespace    wishlist-restaurant
// @version      0.3.0
// @description  仅读取当前打开笔记页面上可见的标题/正文/图片，可下载图片；从心愿单打开时可一键回填标题/正文/封面图。只连小红书自己的图片服务器抓封面，不登录、不读 Cookie、无自动更新。
// @match        *://www.xiaohongshu.com/explore/*
// @match        *://www.xiaohongshu.com/discovery/item/*
// @match        *://www.rednote.com/explore/*
// @match        *://www.rednote.com/discovery/item/*
// @grant        GM_download
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      xhscdn.com
// @connect      rednotecdn.com
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  // ============ 提取逻辑（只读当前页面可见内容）============

  function getTitle() {
    // 1) og:title 元标签
    const og = document.querySelector('meta[property="og:title"]');
    if (og && og.content && og.content.trim()) return og.content.trim();
    // 2) 页面标题，去掉“ - 小红书”等后缀
    let t = (document.title || '').replace(/\s*[-|–—·]\s*(小红书|RedNote|rednote).*$/i, '').trim();
    return t;
  }

  function getBody() {
    // 1) meta description / og:description
    const md = document.querySelector('meta[name="description"], meta[property="og:description"]');
    if (md && md.content && md.content.trim()) return md.content.trim();
    // 2) 常见正文容器选择器（多个兜底）
    const sels = [
      '#detail-desc',
      '.desc',
      '[class*="note-text"]',
      '[class*="desc"]',
      '[class*="content"]',
    ];
    for (const s of sels) {
      const el = document.querySelector(s);
      if (el && el.innerText && el.innerText.trim()) return el.innerText.trim();
    }
    return '';
  }

  function cleanImgUrl(u) {
    if (!u) return '';
    return u.split('#')[0].trim();
  }

  function parseImgUrl(u) {
    const base = u.split('?')[0];
    const m = u.match(/\/w\/(\d+)/i);
    return { base, w: m ? parseInt(m[1], 10) : 0 };
  }

  function collectImages() {
    const best = new Map(); // base -> {url, w}，同一张图只保留最大尺寸
    const consider = (u) => {
      if (!u || !/xhscdn\.com|rednotecdn\.com|sns-img|sns-webpic/i.test(u)) return;
      if (/avatar/i.test(u)) return; // 排除头像
      const { base, w } = parseImgUrl(u);
      const prev = best.get(base);
      if (!prev || w > prev.w) best.set(base, { url: cleanImgUrl(u), w });
    };

    // og:image 是笔记自身的图，最可靠，全部收入
    document.querySelectorAll('meta[property="og:image"]').forEach(m => consider(m.content));

    // 页面里的小红书 CDN 图片：只收「正文大图」。
    // 正文图通常远大于作者头像和相关笔记缩略图，所以取页面最大宽度后，
    // 只收宽度「接近最大值」的图（自适应，避免固定阈值误判）。
    const candidates = [...document.querySelectorAll('img')]
      .map(img => {
        const src = img.currentSrc || img.src || img.getAttribute('data-src') || img.getAttribute('src');
        if (!src || !/xhscdn\.com|rednotecdn\.com|sns-img|sns-webpic/i.test(src)) return null;
        const w = img.naturalWidth || parseImgUrl(src).w || 0;
        return { src, w };
      })
      .filter(Boolean);

    const maxW = candidates.reduce((m, c) => Math.max(m, c.w), 0);
    const threshold = Math.max(640, Math.floor(maxW * 0.65));

    candidates.forEach(c => {
      if (c.w >= threshold) consider(c.src);
    });

    return [...best.values()].map(v => v.url);
  }

  // ============ 封面抓取（在浏览器里下，带 Referer，稳定） ============

  function fetchCover(url) {
    return new Promise((resolve) => {
      if (!url) return resolve(null);
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        headers: { Referer: 'https://www.xiaohongshu.com/' },
        responseType: 'blob',
        timeout: 15000,
        onload: (res) => {
          try {
            if (res.status < 200 || res.status >= 300) return resolve(null);
            const blob = res.response;
            if (!blob || !blob.size) return resolve(null);
            if (blob.size > 3 * 1024 * 1024) return resolve(null); // 超过 3MB 放弃
            const type = blob.type || 'image/jpeg';
            const ext = /png/.test(type) ? 'png' : /webp/.test(type) ? 'webp' : /gif/.test(type) ? 'gif' : 'jpg';
            const reader = new FileReader();
            reader.onloadend = () => {
              const data = String(reader.result || '').split(',')[1] || '';
              resolve(data ? { filename: 'cover.' + ext, contentType: type, data } : null);
            };
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
          } catch (e) {
            resolve(null);
          }
        },
        onerror: () => resolve(null),
        ontimeout: () => resolve(null),
      });
    });
  }

  // ============ 下载 ============

  function pickExt(u) {
    const m = u.match(/format=(\w+)/i);
    return m ? m[1].toLowerCase() : 'jpg';
  }

  function downloadImages(urls) {
    if (!urls.length) return;
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    urls.forEach((u, i) => {
      const ext = pickExt(u);
      const name = `xhs_${stamp}_${String(i + 1).padStart(2, '0')}.${ext}`;
      try {
        GM_download(u, name);
      } catch (e) {
        console.warn('GM_download 失败:', u, e);
      }
    });
  }

  // ============ 面板 UI ============

  function buildPanel() {
    const panel = document.createElement('div');
    panel.id = 'xhs-note-saver-panel';
    panel.style.cssText = [
      'position:fixed;top:16px;right:16px;z-index:2147483000;width:340px;max-height:80vh;',
      'background:#fff;border:1px solid #e5e5e5;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.18);',
      'font:13px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#222;',
      'display:flex;flex-direction:column;overflow:hidden;',
    ].join('');

    const head = document.createElement('div');
    head.style.cssText = 'padding:10px 12px;font-weight:600;background:#fafafa;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;';
    head.innerHTML = '<span>笔记提取</span>';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = 'border:0;background:none;font-size:18px;cursor:pointer;color:#999;line-height:1;';
    closeBtn.onclick = () => panel.remove();
    head.appendChild(closeBtn);
    panel.appendChild(head);

    const body = document.createElement('div');
    body.style.cssText = 'padding:12px;overflow:auto;';

    // 标题
    const titleLabel = document.createElement('div');
    titleLabel.style.cssText = 'font-weight:600;margin-bottom:4px;';
    titleLabel.textContent = '标题';
    const titleBox = document.createElement('div');
    titleBox.style.cssText = 'margin-bottom:10px;';
    titleBox.textContent = getTitle() || '（未读取到标题）';
    body.appendChild(titleLabel);
    body.appendChild(titleBox);

    // 正文（可编辑，方便手动补全）
    const bodyLabel = document.createElement('div');
    bodyLabel.style.cssText = 'font-weight:600;margin-bottom:4px;';
    bodyLabel.textContent = '正文';
    const bodyArea = document.createElement('textarea');
    bodyArea.style.cssText = 'width:100%;min-height:90px;resize:vertical;border:1px solid #ddd;border-radius:8px;padding:8px;box-sizing:border-box;margin-bottom:10px;';
    bodyArea.value = getBody() || '（未读取到正文，可在此手动粘贴）';
    body.appendChild(bodyLabel);
    body.appendChild(bodyArea);

    // 图片
    const imgLabel = document.createElement('div');
    imgLabel.style.cssText = 'font-weight:600;margin-bottom:6px;';
    const images = collectImages();
    imgLabel.textContent = `图片（${images.length} 张）`;
    body.appendChild(imgLabel);

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:12px;';
    images.forEach(u => {
      const a = document.createElement('a');
      a.href = u;
      a.target = '_blank';
      a.rel = 'noopener';
      const img = document.createElement('img');
      img.src = u;
      img.style.cssText = 'width:100%;aspect-ratio:3/4;object-fit:cover;border-radius:6px;background:#f0f0f0;display:block;';
      img.title = u;
      a.appendChild(img);
      grid.appendChild(a);
    });
    body.appendChild(grid);

    // 按钮区
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';
    const mkBtn = (text, primary, onClick) => {
      const b = document.createElement('button');
      b.textContent = text;
      b.style.cssText = [
        'flex:1;min-width:90px;padding:8px 10px;border-radius:8px;cursor:pointer;border:1px solid #ddd;',
        primary ? 'background:#ff2442;color:#fff;border-color:#ff2442;' : 'background:#fff;color:#333;',
      ].join('');
      b.onclick = onClick;
      return b;
    };

    const dlBtn = mkBtn('下载全部图片', true, () => {
      const n = downloadImages(images);
      dlBtn.textContent = '已触发下载';
    });

    const copyTextBtn = mkBtn('复制标题+正文', false, () => {
      const text = `标题：${getTitle()}\n\n正文：\n${bodyArea.value}`;
      navigator.clipboard.writeText(text).then(() => {
        copyTextBtn.textContent = '已复制';
        setTimeout(() => (copyTextBtn.textContent = '复制标题+正文'), 1200);
      });
    });

    const copyImgBtn = mkBtn('复制图片链接', false, () => {
      navigator.clipboard.writeText(images.join('\n')).then(() => {
        copyImgBtn.textContent = '已复制';
        setTimeout(() => (copyImgBtn.textContent = '复制图片链接'), 1200);
      });
    });

    // 从心愿单打开时（存在 opener），提供「回填到心愿单」
    const win = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window);
    if (win.opener) {
      const sendBtn = document.createElement('button');
      sendBtn.textContent = '回填到心愿单';
      sendBtn.style.cssText = 'flex:1;min-width:90px;padding:8px 10px;border-radius:8px;cursor:pointer;border:1px solid #16a34a;background:#16a34a;color:#fff;';
      sendBtn.onclick = async () => {
        try {
          sendBtn.textContent = '抓封面中…';
          const cover = await fetchCover(images[0]);
          win.opener.postMessage(
            { type: 'XHS_NOTE', title: getTitle(), body: bodyArea.value, cover },
            '*'
          );
          sendBtn.textContent = cover ? '已回填 ✓' : '已回填(无图)';
          setTimeout(() => (sendBtn.textContent = '回填到心愿单'), 1500);
        } catch (e) {
          sendBtn.textContent = '回填失败';
        }
      };
      btnRow.appendChild(sendBtn);
    }

    btnRow.appendChild(dlBtn);
    btnRow.appendChild(copyTextBtn);
    btnRow.appendChild(copyImgBtn);
    body.appendChild(btnRow);

    panel.appendChild(body);
    document.body.appendChild(panel);
  }

  // ============ 悬浮开关 ============

  function buildToggle() {
    const btn = document.createElement('button');
    btn.textContent = '提取笔记';
    btn.style.cssText = [
      'position:fixed;top:16px;right:16px;z-index:2147483000;',
      'background:#ff2442;color:#fff;border:0;border-radius:20px;padding:9px 16px;cursor:pointer;',
      'font:13px/1 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;box-shadow:0 4px 14px rgba(255,36,66,.4);',
    ].join('');
    btn.onclick = () => {
      if (document.getElementById('xhs-note-saver-panel')) {
        document.getElementById('xhs-note-saver-panel').remove();
      } else {
        buildPanel();
      }
    };
    document.body.appendChild(btn);
  }

  // 等页面就绪再挂载（内容可能在登录弹窗关闭后才可见，用户手动关闭即可）
  function init() {
    if (document.body) {
      buildToggle();
    } else {
      setTimeout(init, 300);
    }
  }
  init();
})();
