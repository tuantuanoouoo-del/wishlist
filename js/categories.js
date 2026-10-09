// ============================================================
//  Category 分类注册表 —— 通用心愿单的扩展入口
// ------------------------------------------------------------
//  未来新增心愿类型（食物/书籍/旅行等）时，只需：
//    1. 在 CATEGORIES 中添加一项（enabled: true 即自动出现在首页分类区）；
//    2. （可选）在 data 中放入该类型的专属字段即可，无需改动 Wishlist 核心。
//  首页分类区由本注册表动态渲染，不写死在 HTML 中。
// ============================================================

export const CATEGORIES = [
  {
    id: "ns_game",
    name: "NS 卡带",
    icon: "🎮",
    enabled: true,
    // 该分类专属数据字段说明（供未来表单/详情渲染扩展）
    fields: {
      price: { label: "参考价格", type: "price" },
    },
  },
  {
    id: "restaurant",
    name: "餐厅",
    icon: "🍜",
    enabled: true,
    fields: {
      price_per_person: { label: "人均", type: "price" },
    },
  },
];

// —— 未来分类示例（暂未启用，架构已预留）——
// 启用方法：把对应项移到 CATEGORIES，并将 enabled 设为 true。
export const FUTURE_CATEGORIES = [
  { id: "food", name: "想吃的东西", icon: "🍜", enabled: false },
  { id: "shopping", name: "想购买的东西", icon: "🛒", enabled: false },
  { id: "book", name: "想买的书", icon: "📚", enabled: false },
  { id: "movie", name: "想看的电影", icon: "🎬", enabled: false },
  { id: "travel", name: "想去的地方", icon: "✈️", enabled: false },
  { id: "activity", name: "想体验的活动", icon: "🎯", enabled: false },
];

export function getCategory(id) {
  return CATEGORIES.find((c) => c.id === id) || null;
}

export function getEnabledCategories() {
  return CATEGORIES.filter((c) => c.enabled);
}

export function getCategoryIcon(id) {
  return getCategory(id)?.icon || "📦";
}

export function getCategoryName(id) {
  return getCategory(id)?.name || "未分类";
}
