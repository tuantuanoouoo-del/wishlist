# 🚀 部署到 Vercel + Supabase（共享心愿单）

这套方案 = **Vercel（免费静态托管 + 无服务器函数）** + **Supabase（免费云端数据库）**。
部署后家人/朋友打开同一个网址，**共同看、共同改**同一份心愿单，你无需维护任何服务器。

> ⚠️ 前提：Vercel / Supabase 都在境外，国内访问需要开代理（v2rayN 等）。你已确认会一直开代理。

---

## 一、准备三个免费账号（各 5 分钟）

1. [GitHub](https://github.com) 账号（Vercel 用它登录 + 自动部署）
2. [Supabase](https://supabase.com) 账号（免费）
3. [Vercel](https://vercel.com) 账号（免费，可用 GitHub 直接登录）

---

## 二、Supabase：建数据库（约 5 分钟）

1. 登录 Supabase → **New project**；
2. 填项目名（如 `wishlist`）、设置**数据库密码**（自己记牢，后面可能用）、Region 选**离你近的**（如 `Southeast Asia (Singapore)` 或 `Northeast Asia (Tokyo)`）；
3. 建好后进入项目 → 左侧 **SQL Editor** → **New query**；
4. 把本项目 `supabase/schema.sql` 的**全部内容**粘贴进去 → 点 **Run**（看到成功提示即可）；
5. 左侧 **Project Settings → API**，记下两个值（**下一步要填进 Vercel**）：
   - **Project URL**（形如 `https://xxxx.supabase.co`）
   - **anon public** key（以 `eyJ...` 开头的很长一串）

---

## 三、部署到 Vercel（约 10 分钟）

### 方式 A：GitHub 自动部署（推荐，之后改代码自动上线）

1. 在 GitHub 新建一个仓库（**私有**即可），把本项目整个目录推上去：

```bash
# 在本项目根目录执行
git init
git add .
git commit -m "wishlist"
git branch -M main
git remote add origin https://github.com/你的用户名/你的仓库名.git
git push -u origin main
```

> 没装 git 的话先到 <https://git-scm.com> 装一下；或用「方式 B」跳过 git。

2. Vercel 控制台 → **Add New → Project** → 授权并选择刚才的仓库 → **Import**；
3. **Framework Preset** 选 `Other`；**Build Command / Output Directory 留空**（本项目无需构建）；直接 **Deploy**；
4. 部署中（或部署后）进 **Settings → Environment Variables**，添加三个变量并保存 → 再 **Redeploy**：

| 变量名 | 值 |
|---|---|
| `RAWG_API_KEY` | 你的 RAWG Key（`.env` 里那个） |
| `SUPABASE_URL` | 第二步记下的 Project URL |
| `SUPABASE_ANON_KEY` | 第二步记下的 anon public key |

### 方式 B：Vercel CLI（不用 git）

```bash
# 在本项目根目录，用「命令提示符 cmd」或 PowerShell 执行：
npm.cmd i -g vercel      # 全局装 Vercel CLI（用 npm.cmd 避免 PowerShell 执行策略报错）
vercel login             # 浏览器授权登录
vercel                   # 一路回车，部署到临时预览地址
vercel --prod            # 正式上线，拿到 https://xxx.vercel.app
```

> 环境变量用命令加（或在 Vercel 后台加）：
> `vercel env add RAWG_API_KEY` / `vercel env add SUPABASE_URL` / `vercel env add SUPABASE_ANON_KEY`

---

## 四、验证

1. 打开 Vercel 给的网址（`https://xxx.vercel.app`）；
2. 搜索一个游戏 → 加入心愿单 → **刷新页面**，看数据还在不在；
3. 换个浏览器（或手机、发给家人）打开同一网址，确认看到同一份、且能加/改。

---

## 五、数据与维护

- **数据存在哪**：Supabase 的 `wishlist_state` 表（`id=1` 那一行的 `items` 字段）。
- **备份**：Supabase 后台 → Table Editor → `wishlist_state` → 导出 CSV/JSON；或定期在 SQL Editor 执行 `select items from wishlist_state;` 复制结果。
- **Supabase 免费档注意**：约 **7 天无访问会暂停**，去 Supabase 后台点 **Restore/Resume** 即可恢复（数据不丢）。
- **无登录**：知道网址 + anon key 的人都能读写，仅限家庭/朋友使用，别公开传播网址。
- **改代码**：本地改完 push 到 GitHub（方式 A）会自动重新部署；方式 B 重新跑 `vercel --prod`。

---

## 六、本地开发 vs 线上

- 本地开发仍用 `node start.js`（数据存本地 `data/wishlist.json`）；
- 线上用 Vercel + Supabase（数据存云端）。
- 两套**互不影响**：本地走 `server/`，线上走 `api/` + `lib/`，前端同一份代码。
