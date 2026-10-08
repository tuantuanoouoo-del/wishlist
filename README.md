# 💝 个人心愿单 Wishlist

一个**通用个人心愿单** Web 应用。第一阶段聚焦 **🎮 Nintendo Switch 卡带** 心愿管理，但底层从第一天起就按「Wishlist → Category → 类型专属数据」的通用架构设计，未来可自然扩展为食物、书籍、电影、旅行等任何心愿类型。

游戏数据来自 [RAWG](https://rawg.io/apidocs)（免费、真实数据，不伪造）。

---

## ✨ 第一阶段功能（MVP）

- 输入**中文游戏名**搜索 Nintendo Switch 游戏（支持「塞尔达传说 王国之泪」「宝可梦 朱」等）
- 查看游戏**封面 / 截图 / 简介 / 开发商 / 发行商 / 发售日期 / 类型 / 平台**
- 截图网格展示，**点击放大**（灯箱）
- **加入心愿单**（自动去重，重复游戏显示「✓ 已在心愿单」）
- 手动填写**参考价格**（卡片上点击展开输入框、回车保存；也可在编辑弹窗里修改 / 清空）
- **购买优先度 S/A/B/C 分级**：封面左上角徽章显示等级，点击展开下拉选等级（S 最高 → A → B → C，另有「未分级」），顶部标签筛选
- 填写**备注**
- **标记已购买 / 未购买**，已购买有醒目视觉状态
- **删除**、**编辑**（名称 / 价格 / 备注 / 状态 / 优先度）
- **筛选**（未购买 / 已购买 + 等级 S/A/B/C/未分级）与**排序**（默认按优先度：S 最前 → A → B → C；空价格安全排末尾，**已购买自动排最后**）
- 心愿数据保存在**服务器**（共享模式：所有人看到同一份），**刷新 / 换设备不丢失**，带 schema 版本与迁移
- **近三个月 Switch 新上架**：每次打开页面自动展示近 90 天 Switch 新游/DLC（数据来自 RAWG，按发售日倒序），可直接「＋加入心愿单」
- 深色主题、卡片式 UI、响应式（PC 多列 / 平板减列 / 手机单~双列）

---

## 🧱 技术栈与架构

```
浏览器前端 (原生 HTML/CSS/JS，ES Module)
   │  /api/search   /api/game/:id
   ▼
Node 后端（零依赖：http + fetch）
   │  API Key 仅存于服务端 .env
   ▼
RAWG 第三方 API  ──→  normalizeGame()  ──→  统一 Game 结构  ──→  Wishlist ──→  UI
                      （数据标准化层）        （不直接暴露给 UI）
```

- **前端**：HTML + CSS + JavaScript（无框架、无构建步骤，浏览器原生 ES Module）
- **后端**：零依赖 Node HTTP 服务器（同时做「静态文件服务」和「RAWG 代理」）
- **存储**：服务器 JSON 文件（`server/services/store.js`，内存缓存 + 原子落盘，多人共享同一份）
- **为什么后端代理**：RAWG 需要 API Key；按安全要求，Key 不放前端，放服务端 `.env`。

> 选择 RAWG 的理由：免费额度充足（2 万次/月）、REST 简单（单一 Key，无 OAuth）、数据字段齐全（封面/截图/简介/厂商/日期/类型/平台/多语言备用名）、稳定成熟。
>
> 已知限制：RAWG 的封面是**横版宣传图**（无竖版卡带盒封面）、**不提供玩家人数**（该字段预留、显示「暂无资料」）。这些在数据结构中用独立字段隔离，未来可平滑切换 IGDB 等更专业的 API。

---

## 📁 目录结构

```
wishlist/
├── index.html                 # 单页入口
├── css/
│   └── style.css              # 深色主题、卡片、响应式
├── js/
│   ├── app.js                 # 主控：状态 + 事件编排 + 渲染调度
│   ├── api.js                 # 前端 API 层（封装对后端的调用）
│   ├── ui.js                  # UI 渲染（卡片/详情/编辑/弹窗/灯箱/提示）
│   ├── wishlist.js            # 心愿单领域逻辑（纯函数：增删改/筛选/排序/去重）
│   ├── storage.js             # 存储层（共享：读/写后端，含版本 + 迁移）
│   ├── categories.js          # Category 分类注册表（未来扩展入口）
│   └── utils.js               # 通用工具（格式化/转义/净化/防抖等）
├── server/
│   ├── server.js              # 后端入口：静态服务 + 路由装配
│   ├── config.js              # 配置（读取 .env）
│   ├── routes/
│   │   ├── games.js           # /api 路由：health/search/game
│   │   └── wishlist.js        # /api/wishlist：共享心愿单读/写
│   └── services/
│       ├── rawg.js            # RAWG 客户端（薄封装，仅 HTTP + 错误）
│       ├── normalize.js       # 数据标准化层（RAWG → 统一 Game 结构）
│       ├── nameMap.js         # 中文 ↔ 英文 游戏名映射（搜索兜底）
│       ├── translate.js       # 简介英译中（机器翻译，带缓存）
│       └── store.js           # 共享存储：内存缓存 + JSON 文件持久化
├── tests/
│   └── logic.test.mjs         # 逻辑单元测试
├── assets/                    # （预留）本地静态资源
├── data/                      # 运行时生成：共享心愿单数据（已 gitignore）
├── package.json
├── .env.example
├── .gitignore
└── README.md
```

---

## 🚀 快速开始

### 1. 准备 API Key

1. 打开 <https://rawg.io/apidocs> 免费注册并登录；
2. 获取你的 **API Key**（免费额度 20,000 次/月）；
3. 复制 `.env.example` 为 `.env` 并填入 Key：

```bash
# Windows
copy .env.example .env

# macOS / Linux
cp .env.example .env
```

编辑 `.env`：

```ini
RAWG_API_KEY=你的key
PORT=8787
HOST=127.0.0.1
```

> `.env` 已在 `.gitignore` 中，不会被提交到 Git。

### 2. 启动

```bash
node start.js
# 或：npm start
```

> `node start.js` 会额外读取 `.env` 里的代理配置（见下方「🌐 代理/VPN」）。
> 直连能用的环境，也可以直接 `node server/server.js`。

### 3. 打开

浏览器访问 <http://localhost:8787>

### 4. 代理 / VPN（可选，重要）

如果你在**中国内地**等需要代理才能访问 `api.rawg.io` 的网络环境（浏览器能上 rawg.io 通常是因为挂了代理/VPN），
**Node 的 fetch 默认不走系统代理**，直接启动会报 `fetch failed`。

解决办法（只需改 `.env`，无需命令行设环境变量）：

1. 查看你 VPN/代理客户端的 **HTTP 代理端口**（常见：Clash = `7890`，V2RayN = `10809`，以你客户端为准）；
2. 在 `.env` 里取消注释并填入：

```ini
HTTP_PROXY=http://127.0.0.1:7890
HTTPS_PROXY=http://127.0.0.1:7890
```

3. 用 `node start.js`（或 `npm start`）启动即可。

> 原理：`start.js` 在启动服务前，把 `.env` 里的代理写入环境变量，并以
> `node --use-env-proxy server/server.js` 启动，让 Node 的 fetch 走你的代理。

---

## 🔍 中文搜索机制

RAWG 对中文的覆盖有限，因此搜索流程为：

```
用户输入中文名
   ↓
① 先按原始中文直接搜索
   ↓
② 若候选不足，用 nameMap.js 中的「中文↔英文别名表」翻译成英文再搜
   ↓
③ 过滤出 Nintendo Switch 平台的候选
   ↓
④ 展示所有候选，由用户自己选择（绝不擅自挑选）
```

`server/services/nameMap.js` 内置了常见任天堂/热门第三方游戏的中英文对照（约 90 条）。它只是**翻译别名**，用来定位真实游戏；所有展示数据仍来自 RAWG。

---

## 🗂️ 数据结构

### Wishlist Item（通用字段）

```js
{
  id: "uuid",          // 本地唯一 ID
  category: "ns_game", // 分类 ID
  title: "塞尔达传说 王国之泪",
  note: "等降价",       // 备注
  created_at: "ISO 时间",
  completed: false,    // 是否已购买
  priority: "S",       // 购买优先度：S/A/B/C，空串 = 未分级
  data: { ... }        // 类型专属数据
}
```

### NS 游戏专属数据（放在 `data` 中）

```js
data: {
  external_id: "111",        // 平台内唯一 ID，用于去重
  title, name_cn, name_en, name_jp,
  cover, background, artworks, screenshots,
  description,
  developer, publisher, release_date,
  genres, platforms, players,
  rating, metacritic,
  price                       // 用户手动维护的参考价格
}
```

### Category 分类

```js
{ id: "ns_game", name: "NS 卡带", icon: "🎮", enabled: true }
```

---

## ➕ 如何扩展新分类（重点）

未来加「🍜 想吃的东西」等，只需**改一个文件** `js/categories.js`：

1. 把 `FUTURE_CATEGORIES` 中对应项移到 `CATEGORIES`，并设 `enabled: true`：

```js
export const CATEGORIES = [
  { id: "ns_game", name: "NS 卡带", icon: "🎮", enabled: true },
  { id: "food", name: "想吃的东西", icon: "🍜", enabled: true },
];
```

2. 首页分类区会**自动出现**该分类（由注册表动态渲染，不写死在 HTML）。

Wishlist 核心（`js/wishlist.js`）只关心 `category` 和 `data`，完全不感知具体类型 —— 新增分类**无需改动**增删改查、筛选、排序、存储等任何通用逻辑。

---

## 🔌 如何更换 / 增加数据 API

数据标准化层 `server/services/normalize.js` 把第三方原始数据转换成统一 Game 结构。更换 API 时：

1. 新增/替换 `server/services/` 下的客户端（对应 rawg.js）；
2. 在 `server/services/normalize.js` 中把新 API 的字段映射到统一结构；
3. 前端 `js/api.js` 与 UI **完全不用改**。

---

## 🧪 测试

```bash
node tests/logic.test.mjs
```

覆盖：价格/日期格式化（无 NaN/undefined）、心愿增删改查、去重、筛选、排序（空价格安全）、共享存储往返与旧格式兼容、分类注册、中文别名映射、RAWG 数据标准化与缺字段兜底。

---

## 🌐 部署给别人用（共享心愿单）

心愿数据保存在**服务器**的 `data/wishlist.json`，所有访问者共享同一份。要让家人/朋友也能用，把服务部署到一台公网可达的机器即可，大家打开同一网址：

**方式 A：自己有一台云服务器（VPS）**（最直接、最可控）

1. 上传项目到服务器（或用 `git clone`）；
2. 安装 Node.js（≥ 20.12）；
3. 复制 `.env.example` 为 `.env` 并填 `RAWG_API_KEY`，把 `HOST` 改为 `0.0.0.0`；
4. 用进程守护启动：`node start.js`（生产建议配合 `pm2` 或 `systemd` 常驻）；
5. 在云服务商防火墙放行端口（默认 8787）；
6. 家人访问 `http://你的服务器IP:8787`。

**方式 B：免费托管平台**（不用自己买服务器）

- [Railway](https://railway.app) / [Render](https://render.com) / [Fly.io](https://fly.io) 可直接跑 Node 长驻服务：启动命令填 `node start.js`，环境变量配 `RAWG_API_KEY`。
- 服务器部署在**境外**时通常无需代理；数据存在实例磁盘，免费额度重启后可能丢失，重要数据定期备份 `data/wishlist.json`。

**方式 C：局域网临时共享**（只给身边人，不出公网）

- `.env` 里 `HOST=0.0.0.0`，同一 WiFi 下用「你电脑的局域网 IP:8787」访问。

> ⚠️ 注意：共享模式**没有登录/鉴权**，知道网址的人都能看/改同一份数据，仅建议家庭/朋友小范围使用。若需要「每人独立账号」或「只读分享」，属于后续进阶功能。
>
> 从旧版（localStorage）升级时，应用会在**服务器为空**时自动把你浏览器里的旧数据一次性迁移到服务器。

> 📖 想用 **Vercel + Supabase**（免服务器、免费、多人共同编辑、云数据库）部署？见 **[DEPLOY_VERCEL.md](./DEPLOY_VERCEL.md)** 的分步指南（已含全部代码改造）。

---

## ❓ 常见问题

- **搜索提示「尚未配置 RAWG API Key」**：`.env` 没配置，或配置后未重启服务。
- **提示「无法连接后端服务」**：先用 `node start.js`（或 `npm start`）启动，再访问 <http://localhost:8787>。
- **搜索报 `fetch failed` / `ENOTFOUND` / `ETIMEDOUT`**：大概率是网络需要代理，见上文「🌐 代理/VPN」一节，在 `.env` 里配置 `HTTP_PROXY` 后重启。
- **搜索失败 / 没结果**：RAWG 中文覆盖有限，可尝试更短的关键词（如「塞尔达」而非全称），或直接用英文名。
- **想局域网/手机访问**：`.env` 中把 `HOST` 改为 `0.0.0.0`，用电脑局域网 IP 访问。
- **数据存在哪？**：服务器 `data/wishlist.json`（多人共享），备份该文件即备份全部心愿。
- **怎么发给别人用？**：见上文「🌐 部署给别人用」。

---

## 📝 变更记录（Changelog）

> 最新在前。

- **新增「近三个月 Switch 新上架」**：打开页面自动加载近 90 天 Switch 新游/DLC（数据来自 RAWG，按发售日倒序），卡片可直接「＋加入心愿单」或「查看详情」。
- **修复优先度排序方向**：现在正确按 S → A → B → C → 未分级 排列（此前方向反了，S 被排到了最后）。
- **默认只显示未购买**：状态筛选去掉「全部」页签，默认展示「未购买」游戏（已购买需切到「已购买」页签查看）。
- **参考价格点击式编辑**：卡片默认只显示价格文本（¥xxx / 未设置），点击展开输入框，回车或失焦保存，界面更清爽。
- **优先度徽章移到封面左上角**：等级直接显示在卡片封面左上角（更醒目），点击仍可展开下拉改等级。
- **优先度改点击式徽章**：卡片上只显示当前等级（S/A/B/C/未分级），点击后展开下拉选择，选完收回只显示等级，界面更清爽。
- **默认按优先度排序**：列表默认按优先度排列（S 最前 → A → B → C → 未分级），已购买永远排最后。
- **已购买自动排最后**：任何排序方式下，标记为「已购买」的游戏都会自动排到列表末尾，未购买的按所选排序规则正常排列。
- **购买优先度 S/A/B/C 分级**：卡片上直接下拉选等级（S 最高 → A → B → C，另有「未分级」）；心愿单顶部新增 `全部 / S / A / B / C / 未分级` 筛选标签；排序新增「优先度」。
- **参考价格卡片内联编辑**：卡片上直接输入价格，**回车保存**（Esc 取消、失焦自动保存）。
- **更清晰的错误信息**：心愿单读 / 写失败时返回具体原因（含 Supabase 状态码），便于排查。
- **Vercel + Supabase 部署支持**：云端共享数据库，多人共同编辑，详见 [DEPLOY_VERCEL.md](./DEPLOY_VERCEL.md)。
- **游戏简介英译中**：简介自动机器翻译为中文，失败自动回退英文原文。
- **共享心愿单存储**：从浏览器 localStorage 升级为服务器 / 云端共享存储，刷新、换设备不丢。
- **首个 MVP**：NS 卡带中文搜索、RAWG 真实数据、心愿单增删改查、筛选排序、深色响应式 UI。
