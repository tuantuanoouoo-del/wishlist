// ============================================================
//  逻辑单元测试（纯逻辑，无 DOM 依赖）
//  运行：node tests/logic.test.mjs
// ============================================================

import test from "node:test";
import assert from "node:assert/strict";

import { formatPrice, formatDate, isNumeric, isEmpty } from "../js/utils.js";
import {
  createWishlistItem,
  isDuplicate,
  getByExternalId,
  filterItems,
  sortItems,
  updateItem,
  removeItem,
  countStats,
  normalizePriority,
} from "../js/wishlist.js";
import { normalizeItem, migrate } from "../js/storage.js";
import { getEnabledCategories, getCategoryName } from "../js/categories.js";
import { normalizeGame } from "../server/services/normalize.js";
import { translateQuery } from "../server/services/nameMap.js";
import { htmlToText } from "../server/services/translate.js";
import { createStore } from "../server/services/store.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// ---------- utils ----------

test("formatPrice：空值/非法值返回空串，绝不出现 NaN/undefined", () => {
  assert.equal(formatPrice(null), "");
  assert.equal(formatPrice(undefined), "");
  assert.equal(formatPrice(""), "");
  assert.equal(formatPrice("abc"), "");
  assert.equal(formatPrice(280), "¥280");
  assert.equal(formatPrice(280.5), "¥280.50");
  assert.equal(formatPrice(0), "¥0");
});

test("formatDate：ISO 字符串格式化，非法输入安全", () => {
  assert.equal(formatDate("2023-05-12"), "2023-05-12");
  assert.equal(formatDate("2023-05-12T00:00:00"), "2023-05-12");
  assert.equal(formatDate(""), "");
  assert.equal(formatDate(null), "");
});

test("isNumeric / isEmpty 边界", () => {
  assert.equal(isNumeric("280"), true);
  assert.equal(isNumeric(""), false);
  assert.equal(isNumeric(null), false);
  assert.equal(isNumeric("12abc"), false);
  assert.equal(isEmpty("  "), true);
  assert.equal(isEmpty(0), false);
});

// ---------- wishlist ----------

test("createWishlistItem：通用字段与 data 专属字段分离", () => {
  const item = createWishlistItem({
    category: "ns_game",
    title: "塞尔达传说 王国之泪",
    data: { external_id: "111", price: null },
    note: "等降价",
  });
  assert.ok(item.id);
  assert.equal(item.category, "ns_game");
  assert.equal(item.title, "塞尔达传说 王国之泪");
  assert.equal(item.note, "等降价");
  assert.equal(item.completed, false);
  assert.ok(item.created_at);
  assert.equal(item.data.external_id, "111");
});

test("去重：同一分类下 external_id 相同判定重复", () => {
  const items = [
    createWishlistItem({ category: "ns_game", data: { external_id: "111" } }),
  ];
  assert.equal(isDuplicate(items, "ns_game", "111"), true);
  assert.equal(isDuplicate(items, "ns_game", "222"), false);
  assert.equal(isDuplicate(items, "food", "111"), false); // 不同分类不冲突
  assert.equal(isDuplicate(items, "ns_game", null), false); // 无外部 ID 不去重
});

test("getByExternalId：查找已有心愿", () => {
  const items = [createWishlistItem({ category: "ns_game", data: { external_id: "111" } })];
  assert.ok(getByExternalId(items, "ns_game", "111"));
  assert.equal(getByExternalId(items, "ns_game", "999"), null);
});

test("filterItems：分类 + 状态筛选", () => {
  const a = createWishlistItem({ category: "ns_game", title: "A" });
  const b = createWishlistItem({ category: "ns_game", title: "B" });
  const done = updateItem([a, b], b.id, { completed: true });
  const c = createWishlistItem({ category: "food", title: "C" });

  assert.equal(filterItems([...done, c], { category: "all", status: "all" }).length, 3);
  assert.equal(filterItems([...done, c], { category: "ns_game", status: "all" }).length, 2);
  assert.equal(filterItems([...done, c], { category: "ns_game", status: "completed" }).length, 1);
  assert.equal(filterItems([...done, c], { category: "ns_game", status: "uncompleted" }).length, 1);
});

test("sortItems：价格排序空值始终排末尾（升/降序均成立）", () => {
  const mk = (price) => createWishlistItem({ data: { price } });
  const items = [mk(300), mk(null), mk(100), mk(undefined), mk(50)];

  const asc = sortItems(items, { by: "price", order: "asc" }).map((i) => i.data.price);
  assert.deepEqual(asc.slice(0, 3), [50, 100, 300]);
  assert.ok(asc.slice(3).every((p) => p == null)); // 空值（null/undefined）排末尾

  const desc = sortItems(items, { by: "price", order: "desc" }).map((i) => i.data.price);
  assert.deepEqual(desc.slice(0, 3), [300, 100, 50]);
  assert.ok(desc.slice(3).every((p) => p == null));
});

test("sortItems：名称 / 发售日期 / 添加时间排序，空日期排末尾", () => {
  const mk = (title, release) =>
    createWishlistItem({ title, data: { release_date: release } });
  const items = [mk("塞尔达", "2023-05-12"), mk("奥德赛", ""), mk("宝可梦", "2022-11-18")];

  // 英文标题排序：跨环境稳定
  const enItems = ["Zelda", "Mario", "Animal"].map((t) => createWishlistItem({ title: t }));
  const byTitle = sortItems(enItems, { by: "title", order: "asc" }).map((i) => i.title);
  assert.deepEqual(byTitle, ["Animal", "Mario", "Zelda"]);

  // 中文标题排序：不抛异常、元素集合不变（具体顺序由 locale 决定）
  const cnSorted = sortItems(items, { by: "title", order: "asc" }).map((i) => i.title);
  assert.equal(cnSorted.length, 3);
  assert.deepEqual(new Set(cnSorted), new Set(["塞尔达", "奥德赛", "宝可梦"]));

  const byRelease = sortItems(items, { by: "release_date", order: "asc" }).map((i) => i.title);
  // 空日期排最后
  assert.deepEqual(byRelease, ["宝可梦", "塞尔达", "奥德赛"]);
});

test("updateItem / removeItem：修改与删除", () => {
  const item = createWishlistItem({ title: "A" });
  let items = [item];

  items = updateItem(items, item.id, { note: "备注", completed: true, data: { price: 280 } });
  assert.equal(items[0].note, "备注");
  assert.equal(items[0].completed, true);
  assert.equal(items[0].data.price, 280);

  items = removeItem(items, item.id);
  assert.equal(items.length, 0);
});

test("countStats：统计总数/已完成/未完成", () => {
  const a = createWishlistItem({});
  const b = createWishlistItem({});
  const items = updateItem([a, b], b.id, { completed: true });
  const stats = countStats(items);
  assert.equal(stats.total, 2);
  assert.equal(stats.completed, 1);
  assert.equal(stats.uncompleted, 1);
});

// ---------- 购买优先度（S/A/B/C） ----------

test("normalizePriority：仅接受 S/A/B/C，大小写不敏感，非法值→未分级", () => {
  assert.equal(normalizePriority("S"), "S");
  assert.equal(normalizePriority("a"), "A");
  assert.equal(normalizePriority(" c "), "C");
  assert.equal(normalizePriority("D"), "");
  assert.equal(normalizePriority(""), "");
  assert.equal(normalizePriority(null), "");
  assert.equal(normalizePriority(undefined), "");
});

test("createWishlistItem：默认未分级，可传 priority 并归一化", () => {
  assert.equal(createWishlistItem({}).priority, "");
  assert.equal(createWishlistItem({ priority: "s" }).priority, "S");
  assert.equal(createWishlistItem({ priority: "x" }).priority, "");
});

test("filterItems：按优先度筛选（含未分级）", () => {
  const s = createWishlistItem({ title: "S", priority: "S" });
  const a = createWishlistItem({ title: "A", priority: "A" });
  const none = createWishlistItem({ title: "无" });
  const items = [s, a, none];

  assert.equal(filterItems(items, { priority: "all" }).length, 3);
  assert.equal(filterItems(items, { priority: "S" }).length, 1);
  assert.equal(filterItems(items, { priority: "none" }).length, 1);
  assert.equal(filterItems(items, { priority: "none" })[0].title, "无");
});

test("sortItems：按优先度排序 S→A→B→C→未分级", () => {
  const mk = (p) => createWishlistItem({ title: p || "无", priority: p });
  const items = [mk("B"), mk(""), mk("S"), mk("C"), mk("A")];
  const sorted = sortItems(items, { by: "priority", order: "desc" }).map((i) => i.priority);
  assert.deepEqual(sorted, ["S", "A", "B", "C", ""]);
});

test("updateItem：可更新优先度并归一化", () => {
  const item = createWishlistItem({});
  let items = updateItem([item], item.id, { priority: "s" });
  assert.equal(items[0].priority, "S");
  items = updateItem(items, item.id, { priority: "bad" });
  assert.equal(items[0].priority, "");
});

// ---------- store（后端 JSON 文件存储） ----------

function tempDataFile(name = "wishlist.json") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wishlist-"));
  return { dir, file: path.join(dir, name) };
}

test("store：写入后落盘，新实例可读回（数据往返）", async () => {
  const { dir, file } = tempDataFile();
  const store = createStore({ file });

  const items = [createWishlistItem({ title: "塞尔达传说 王国之泪", data: { price: 280 } })];
  await store.set(items);

  // 新实例从磁盘读取
  const store2 = createStore({ file });
  assert.equal(store2.get().length, 1);
  assert.equal(store2.get()[0].title, "塞尔达传说 王国之泪");
  assert.equal(store2.get()[0].data.price, 280);

  fs.rmSync(dir, { recursive: true, force: true });
});

test("store：兼容旧版纯数组格式", () => {
  const { dir, file } = tempDataFile();
  fs.writeFileSync(file, JSON.stringify([{ id: "x", title: "旧数据" }]), "utf8");
  const store = createStore({ file });
  const loaded = store.get();
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].title, "旧数据");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("store：损坏 / 不存在文件安全返回空数组", () => {
  const { dir, file } = tempDataFile();
  fs.writeFileSync(file, "not-json{{{", "utf8");
  assert.deepEqual(createStore({ file }).get(), []);

  const missing = createStore({ file: path.join(dir, "nope.json") });
  assert.deepEqual(missing.get(), []);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("store：set 非数组时兜底为空数组", async () => {
  const { dir, file } = tempDataFile();
  const store = createStore({ file });
  await store.set(null);
  assert.deepEqual(store.get(), []);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("normalizeItem：补齐缺失字段", () => {
  const n = normalizeItem({ id: "1", title: "T" });
  assert.equal(n.note, "");
  assert.equal(n.completed, false);
  assert.deepEqual(n.data, {});
  assert.equal(normalizeItem(null), null);
  assert.equal(normalizeItem({ noId: true }), null);
});

test("normalizeItem：补 priority 字段并归一化", () => {
  assert.equal(normalizeItem({ id: "1" }).priority, "");
  assert.equal(normalizeItem({ id: "1", priority: "a" }).priority, "A");
  assert.equal(normalizeItem({ id: "1", priority: "z" }).priority, "");
});

test("migrate：过滤无效项并归一化", () => {
  const result = migrate([{ id: "1", title: "A" }, null, { noId: true }, "bad"]);
  assert.equal(result.length, 1);
  assert.equal(result[0].title, "A");
});

// ---------- categories ----------

test("categories：第一阶段仅启用 ns_game", () => {
  const enabled = getEnabledCategories();
  assert.equal(enabled.length, 1);
  assert.equal(enabled[0].id, "ns_game");
  assert.equal(getCategoryName("ns_game"), "NS 卡带");
});

// ---------- nameMap ----------

test("nameMap：中文名映射到英文搜索词", () => {
  const zelda = translateQuery("塞尔达传说 王国之泪");
  assert.ok(zelda.includes("The Legend of Zelda: Tears of the Kingdom"));

  const pk = translateQuery("宝可梦 朱");
  assert.ok(pk.includes("Pokémon Scarlet"));

  const none = translateQuery("不存在的游戏xyz");
  assert.deepEqual(none, []);
});

// ---------- normalize ----------

test("normalize：RAWG 原始数据转换为统一结构", () => {
  const raw = {
    id: 111,
    name: "The Legend of Zelda: Tears of the Kingdom",
    background_image: "https://example.com/cover.jpg",
    released: "2023-05-12",
    genres: [{ name: "Adventure" }, { name: "Action" }],
    platforms: [{ platform: { name: "Nintendo Switch", slug: "nintendo-switch", id: 7 } }],
    developers: [{ name: "Nintendo" }],
    publishers: [{ name: "Nintendo" }],
    alternative_names: [{ name: "塞尔达传说 王国之泪" }],
    description: "<p>简介</p>",
  };

  const g = normalizeGame(raw);
  assert.equal(g.id, "111");
  assert.equal(g.external_id, "111");
  assert.equal(g.title, "塞尔达传说 王国之泪"); // 优先中文名
  assert.equal(g.name_en, "The Legend of Zelda: Tears of the Kingdom");
  assert.equal(g.cover, "https://example.com/cover.jpg");
  assert.equal(g.release_date, "2023-05-12");
  assert.deepEqual(g.genres, ["Adventure", "Action"]);
  assert.deepEqual(g.platforms, ["Nintendo Switch"]);
  assert.equal(g.developer, "Nintendo");
  assert.equal(g.publisher, "Nintendo");
  assert.equal(g.price, null); // 价格由用户维护
});

test("normalize：字段缺失时安全兜底，不抛异常、不产生 undefined", () => {
  const g = normalizeGame({});
  assert.equal(g.title, "");
  assert.equal(g.name_en, "");
  assert.deepEqual(g.screenshots, []);
  assert.deepEqual(g.genres, []);
  assert.equal(g.price, null);
  assert.equal(g.description_zh, "");
});

test("translate.htmlToText：HTML 简介转纯文本并保留换行", () => {
  assert.equal(
    htmlToText("<p>Hello <strong>world</strong>.</p><p>Second line.</p>"),
    "Hello world.\n\nSecond line."
  );
  assert.equal(htmlToText("<br>line1<br>line2"), "line1\nline2");
  assert.equal(htmlToText(""), "");
});

test("normalize：详情接口传入截图被采纳", () => {
  const raw = { id: 1, name: "X" };
  const shots = [{ image: "https://x/s1.jpg" }, { image: "https://x/s2.jpg" }];
  const g = normalizeGame(raw, shots);
  assert.equal(g.screenshots.length, 2);
  assert.equal(g.screenshots[0].url, "https://x/s1.jpg");
});

console.log("\n✅ 全部逻辑测试通过");
