// ============================================================
//  中文 ↔ 英文 游戏名映射表（搜索兜底用）
// ------------------------------------------------------------
//  RAWG 对中文名称的覆盖有限：直接用中文搜索可能命中率不高。
//  因此搜索流程为：
//    1) 先用用户原始输入（中文）直接搜索；
//    2) 若候选不足，用本表把常见中文游戏名翻译成英文名再次搜索；
//    3) 只保留 Nintendo Switch 平台的候选，交给用户选择。
//
//  注意：本表只是「翻译别名」，用于帮助定位到真实游戏；
//  所有游戏数据（封面/截图/简介/厂商/日期等）仍来自 RAWG，不伪造数据。
// ============================================================

export const NAME_MAP = [
  // 塞尔达传说系列
  ["塞尔达传说 王国之泪", "The Legend of Zelda: Tears of the Kingdom"],
  ["塞尔达传说 旷野之息", "The Legend of Zelda: Breath of the Wild"],
  ["塞尔达传说 织梦岛", "The Legend of Zelda: Link's Awakening"],
  ["塞尔达传说 梦见岛", "The Legend of Zelda: Link's Awakening"],
  ["塞尔达传说 御天之剑", "The Legend of Zelda: Skyward Sword"],
  ["塞尔达传说", "The Legend of Zelda"],
  ["旷野之息", "Breath of the Wild"],
  ["王国之泪", "Tears of the Kingdom"],

  // 马力欧 / 马里奥系列
  ["超级马力欧 奥德赛", "Super Mario Odyssey"],
  ["超级马里奥 奥德赛", "Super Mario Odyssey"],
  ["超级马力欧兄弟 惊奇", "Super Mario Bros. Wonder"],
  ["超级马力欧", "Super Mario"],
  ["马力欧赛车8 豪华版", "Mario Kart 8 Deluxe"],
  ["马力欧卡丁车8 豪华版", "Mario Kart 8 Deluxe"],
  ["马力欧赛车", "Mario Kart"],
  ["马里奥赛车", "Mario Kart"],
  ["马力欧派对", "Mario Party"],
  ["超级马力欧派对", "Super Mario Party"],
  ["纸片马力欧 折纸国王", "Paper Mario: The Origami King"],
  ["纸片马力欧", "Paper Mario"],
  ["路易吉洋馆", "Luigi's Mansion"],
  ["马力欧", "Mario"],
  ["马里奥", "Mario"],

  // 宝可梦系列
  ["宝可梦 朱", "Pokémon Scarlet"],
  ["宝可梦 紫", "Pokémon Violet"],
  ["宝可梦 剑", "Pokémon Sword"],
  ["宝可梦 盾", "Pokémon Shield"],
  ["宝可梦传说 阿尔宙斯", "Pokémon Legends: Arceus"],
  ["宝可梦 明亮珍珠", "Pokémon Brilliant Diamond"],
  ["宝可梦 晶灿钻石", "Pokémon Brilliant Diamond"],
  ["宝可梦 朱/紫", "Pokémon Scarlet"],
  ["精灵宝可梦", "Pokémon"],
  ["宝可梦", "Pokémon"],
  ["口袋妖怪", "Pokémon"],

  // 其他任天堂第一方
  ["集合啦！动物森友会", "Animal Crossing: New Horizons"],
  ["集合啦 动物森友会", "Animal Crossing: New Horizons"],
  ["动物森友会", "Animal Crossing"],
  ["异度神剑", "Xenoblade Chronicles"],
  ["火焰纹章", "Fire Emblem"],
  ["星之卡比 探索发现", "Kirby and the Forgotten Land"],
  ["星之卡比", "Kirby"],
  ["斯普拉遁", "Splatoon"],
  ["喷射战士", "Splatoon"],
  ["密特罗德", "Metroid"],
  ["银河战士", "Metroid"],
  ["任天堂明星大乱斗", "Super Smash Bros. Ultimate"],
  ["大乱斗", "Super Smash Bros. Ultimate"],
  ["健身环大冒险", "Ring Fit Adventure"],
  ["有氧拳击", "Fitness Boxing"],
  ["任天堂Switch运动", "Nintendo Switch Sports"],
  ["瓦力欧制造", "WarioWare"],

  // 第三方热门
  ["猎天使魔女", "Bayonetta"],
  ["真女神转生", "Shin Megami Tensei"],
  ["女神异闻录", "Persona"],
  ["勇者斗恶龙", "Dragon Quest"],
  ["最终幻想", "Final Fantasy"],
  ["王国之心", "Kingdom Hearts"],
  ["逆转裁判", "Ace Attorney"],
  ["怪物猎人", "Monster Hunter"],
  ["胡闹厨房", "Overcooked"],
  ["双人成行", "It Takes Two"],
  ["巫师3 狂猎", "The Witcher 3: Wild Hunt"],
  ["巫师3", "The Witcher 3"],
  ["荒野大镖客 救赎", "Red Dead Redemption"],
  ["暗黑破坏神", "Diablo"],
  ["舞力全开", "Just Dance"],
  ["文明", "Sid Meier's Civilization"],
  ["歧路旅人", "Octopath Traveler"],
  ["八方旅人", "Octopath Traveler"],
  ["空洞骑士", "Hollow Knight"],
  ["哈迪斯", "Hades"],
  ["星露谷物语", "Stardew Valley"],
  ["旷野之息", "Breath of the Wild"],
];

// 去除中文输入中的空白，便于做包含匹配（用户可能写成「塞尔达传说 王国之泪」或「塞尔达传说王国之泪」）
function normalizeCn(s) {
  return String(s || "").replace(/\s+/g, "").toLowerCase();
}

// 根据中文关键词，返回对应的英文搜索词（最多 3 个，按匹配关键词长度从长到短优先）
export function translateQuery(query) {
  const q = normalizeCn(query);
  if (!q) return [];

  const matches = [];
  for (const [cn, en] of NAME_MAP) {
    const c = normalizeCn(cn);
    if (!c) continue;
    // 双向包含：既支持「王国之泪」匹配「塞尔达传说 王国之泪」，也支持完整输入匹配短关键词
    if (q.includes(c) || c.includes(q)) {
      matches.push({ cn, en, score: c.length });
    }
  }

  matches.sort((a, b) => b.score - a.score);

  const out = [];
  const seen = new Set();
  for (const m of matches) {
    if (seen.has(m.en)) continue;
    seen.add(m.en);
    out.push(m.en);
    if (out.length >= 3) break;
  }
  return out;
}
