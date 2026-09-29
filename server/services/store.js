// ============================================================
//  共享心愿单存储：内存缓存 + JSON 文件持久化（零依赖）
// ------------------------------------------------------------
//  - 数据存于服务器上的 data/wishlist.json，所有人共享同一份。
//  - 并发写采用「最后写入生效」（适合家庭/小团队，非高并发场景）。
//  - 写操作串行化 + 原子写入（先写 .tmp 再 rename），避免文件损坏。
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_FILE = path.resolve(__dirname, "../../data/wishlist.json");

export function createStore({ file = DEFAULT_FILE } = {}) {
  let cache = null; // 内存中的共享列表（null 表示尚未从磁盘加载）
  let writeQueue = Promise.resolve(); // 串行化落盘，避免交叉写

  const dir = path.dirname(file);

  function loadFromDisk() {
    try {
      const raw = fs.readFileSync(file, "utf8");
      const parsed = JSON.parse(raw);
      // 兼容两种格式：纯数组，或 { version, items }
      if (Array.isArray(parsed)) return parsed;
      if (parsed && Array.isArray(parsed.items)) return parsed.items;
      return [];
    } catch (e) {
      return []; // 文件不存在或损坏
    }
  }

  function persist(items) {
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const tmp = file + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify({ version: 1, items }, null, 2), "utf8");
      fs.renameSync(tmp, file);
    } catch (e) {
      console.error("[store] 写入失败：", e);
    }
  }

  return {
    /** 读取共享列表 */
    get() {
      if (cache === null) cache = loadFromDisk();
      return cache;
    },
    /** 整体替换共享列表，返回「写盘完成」的 Promise（便于测试/确认） */
    set(items) {
      cache = Array.isArray(items) ? items : [];
      const snapshot = cache;
      const p = writeQueue.then(() => persist(snapshot));
      writeQueue = p.catch(() => {}); // 队列永不中断
      return p;
    },
    /** 重新从磁盘加载（维护/测试用） */
    reload() {
      cache = loadFromDisk();
      return cache;
    },
  };
}
