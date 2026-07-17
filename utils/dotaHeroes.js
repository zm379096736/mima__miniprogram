const IMAGE_BASE = 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/';

const HEROES = [
  {
    "id": 1,
    "name": "敌法师",
    "slug": "antimage"
  },
  {
    "id": 2,
    "name": "斧王",
    "slug": "axe"
  },
  {
    "id": 3,
    "name": "祸乱之源",
    "slug": "bane"
  },
  {
    "id": 4,
    "name": "血魔",
    "slug": "bloodseeker"
  },
  {
    "id": 5,
    "name": "水晶室女",
    "slug": "crystal_maiden"
  },
  {
    "id": 6,
    "name": "卓尔游侠",
    "slug": "drow_ranger"
  },
  {
    "id": 7,
    "name": "撼地者",
    "slug": "earthshaker"
  },
  {
    "id": 8,
    "name": "主宰",
    "slug": "juggernaut"
  },
  {
    "id": 9,
    "name": "米拉娜",
    "slug": "mirana"
  },
  {
    "id": 10,
    "name": "变体精灵",
    "slug": "morphling"
  },
  {
    "id": 11,
    "name": "影魔",
    "slug": "nevermore"
  },
  {
    "id": 12,
    "name": "幻影长矛手",
    "slug": "phantom_lancer"
  },
  {
    "id": 13,
    "name": "帕克",
    "slug": "puck"
  },
  {
    "id": 14,
    "name": "帕吉",
    "slug": "pudge"
  },
  {
    "id": 15,
    "name": "雷泽",
    "slug": "razor"
  },
  {
    "id": 16,
    "name": "沙王",
    "slug": "sand_king"
  },
  {
    "id": 17,
    "name": "风暴之灵",
    "slug": "storm_spirit"
  },
  {
    "id": 18,
    "name": "斯温",
    "slug": "sven"
  },
  {
    "id": 19,
    "name": "小小",
    "slug": "tiny"
  },
  {
    "id": 20,
    "name": "复仇之魂",
    "slug": "vengefulspirit"
  },
  {
    "id": 21,
    "name": "风行者",
    "slug": "windrunner"
  },
  {
    "id": 22,
    "name": "宙斯",
    "slug": "zuus"
  },
  {
    "id": 23,
    "name": "昆卡",
    "slug": "kunkka"
  },
  {
    "id": 25,
    "name": "莉娜",
    "slug": "lina"
  },
  {
    "id": 26,
    "name": "莱恩",
    "slug": "lion"
  },
  {
    "id": 27,
    "name": "暗影萨满",
    "slug": "shadow_shaman"
  },
  {
    "id": 28,
    "name": "斯拉达",
    "slug": "slardar"
  },
  {
    "id": 29,
    "name": "潮汐猎人",
    "slug": "tidehunter"
  },
  {
    "id": 30,
    "name": "巫医",
    "slug": "witch_doctor"
  },
  {
    "id": 31,
    "name": "巫妖",
    "slug": "lich"
  },
  {
    "id": 32,
    "name": "力丸",
    "slug": "riki"
  },
  {
    "id": 33,
    "name": "谜团",
    "slug": "enigma"
  },
  {
    "id": 34,
    "name": "修补匠",
    "slug": "tinker"
  },
  {
    "id": 35,
    "name": "狙击手",
    "slug": "sniper"
  },
  {
    "id": 36,
    "name": "瘟疫法师",
    "slug": "necrolyte"
  },
  {
    "id": 37,
    "name": "术士",
    "slug": "warlock"
  },
  {
    "id": 38,
    "name": "兽王",
    "slug": "beastmaster"
  },
  {
    "id": 39,
    "name": "痛苦女王",
    "slug": "queenofpain"
  },
  {
    "id": 40,
    "name": "剧毒术士",
    "slug": "venomancer"
  },
  {
    "id": 41,
    "name": "虚空假面",
    "slug": "faceless_void"
  },
  {
    "id": 42,
    "name": "冥魂大帝",
    "slug": "skeleton_king"
  },
  {
    "id": 43,
    "name": "死亡先知",
    "slug": "death_prophet"
  },
  {
    "id": 44,
    "name": "幻影刺客",
    "slug": "phantom_assassin"
  },
  {
    "id": 45,
    "name": "帕格纳",
    "slug": "pugna"
  },
  {
    "id": 46,
    "name": "圣堂刺客",
    "slug": "templar_assassin"
  },
  {
    "id": 47,
    "name": "冥界亚龙",
    "slug": "viper"
  },
  {
    "id": 48,
    "name": "露娜",
    "slug": "luna"
  },
  {
    "id": 49,
    "name": "龙骑士",
    "slug": "dragon_knight"
  },
  {
    "id": 50,
    "name": "戴泽",
    "slug": "dazzle"
  },
  {
    "id": 51,
    "name": "发条技师",
    "slug": "rattletrap"
  },
  {
    "id": 52,
    "name": "拉席克",
    "slug": "leshrac"
  },
  {
    "id": 53,
    "name": "自然先知",
    "slug": "furion"
  },
  {
    "id": 54,
    "name": "噬魂鬼",
    "slug": "life_stealer"
  },
  {
    "id": 55,
    "name": "黑暗贤者",
    "slug": "dark_seer"
  },
  {
    "id": 56,
    "name": "克林克兹",
    "slug": "clinkz"
  },
  {
    "id": 57,
    "name": "全能骑士",
    "slug": "omniknight"
  },
  {
    "id": 58,
    "name": "魅惑魔女",
    "slug": "enchantress"
  },
  {
    "id": 59,
    "name": "哈斯卡",
    "slug": "huskar"
  },
  {
    "id": 60,
    "name": "暗夜魔王",
    "slug": "night_stalker"
  },
  {
    "id": 61,
    "name": "育母蜘蛛",
    "slug": "broodmother"
  },
  {
    "id": 62,
    "name": "赏金猎人",
    "slug": "bounty_hunter"
  },
  {
    "id": 63,
    "name": "编织者",
    "slug": "weaver"
  },
  {
    "id": 64,
    "name": "杰奇洛",
    "slug": "jakiro"
  },
  {
    "id": 65,
    "name": "蝙蝠骑士",
    "slug": "batrider"
  },
  {
    "id": 66,
    "name": "陈",
    "slug": "chen"
  },
  {
    "id": 67,
    "name": "幽鬼",
    "slug": "spectre"
  },
  {
    "id": 68,
    "name": "远古冰魄",
    "slug": "ancient_apparition"
  },
  {
    "id": 69,
    "name": "末日使者",
    "slug": "doom_bringer"
  },
  {
    "id": 70,
    "name": "熊战士",
    "slug": "ursa"
  },
  {
    "id": 71,
    "name": "裂魂人",
    "slug": "spirit_breaker"
  },
  {
    "id": 72,
    "name": "矮人直升机",
    "slug": "gyrocopter"
  },
  {
    "id": 73,
    "name": "炼金术士",
    "slug": "alchemist"
  },
  {
    "id": 74,
    "name": "祈求者",
    "slug": "invoker"
  },
  {
    "id": 75,
    "name": "沉默术士",
    "slug": "silencer"
  },
  {
    "id": 76,
    "name": "殁境神蚀者",
    "slug": "obsidian_destroyer"
  },
  {
    "id": 77,
    "name": "狼人",
    "slug": "lycan"
  },
  {
    "id": 78,
    "name": "酒仙",
    "slug": "brewmaster"
  },
  {
    "id": 79,
    "name": "暗影恶魔",
    "slug": "shadow_demon"
  },
  {
    "id": 80,
    "name": "独行德鲁伊",
    "slug": "lone_druid"
  },
  {
    "id": 81,
    "name": "混沌骑士",
    "slug": "chaos_knight"
  },
  {
    "id": 82,
    "name": "米波",
    "slug": "meepo"
  },
  {
    "id": 83,
    "name": "树精卫士",
    "slug": "treant"
  },
  {
    "id": 84,
    "name": "食人魔魔法师",
    "slug": "ogre_magi"
  },
  {
    "id": 85,
    "name": "不朽尸王",
    "slug": "undying"
  },
  {
    "id": 86,
    "name": "拉比克",
    "slug": "rubick"
  },
  {
    "id": 87,
    "name": "干扰者",
    "slug": "disruptor"
  },
  {
    "id": 88,
    "name": "司夜刺客",
    "slug": "nyx_assassin"
  },
  {
    "id": 89,
    "name": "娜迦海妖",
    "slug": "naga_siren"
  },
  {
    "id": 90,
    "name": "光之守卫",
    "slug": "keeper_of_the_light"
  },
  {
    "id": 91,
    "name": "艾欧",
    "slug": "wisp"
  },
  {
    "id": 92,
    "name": "维萨吉",
    "slug": "visage"
  },
  {
    "id": 93,
    "name": "斯拉克",
    "slug": "slark"
  },
  {
    "id": 94,
    "name": "美杜莎",
    "slug": "medusa"
  },
  {
    "id": 95,
    "name": "巨魔战将",
    "slug": "troll_warlord"
  },
  {
    "id": 96,
    "name": "半人马战行者",
    "slug": "centaur"
  },
  {
    "id": 97,
    "name": "马格纳斯",
    "slug": "magnataur"
  },
  {
    "id": 98,
    "name": "伐木机",
    "slug": "shredder"
  },
  {
    "id": 99,
    "name": "钢背兽",
    "slug": "bristleback"
  },
  {
    "id": 100,
    "name": "巨牙海民",
    "slug": "tusk"
  },
  {
    "id": 101,
    "name": "天怒法师",
    "slug": "skywrath_mage"
  },
  {
    "id": 102,
    "name": "亚巴顿",
    "slug": "abaddon"
  },
  {
    "id": 103,
    "name": "上古巨神",
    "slug": "elder_titan"
  },
  {
    "id": 104,
    "name": "军团指挥官",
    "slug": "legion_commander"
  },
  {
    "id": 105,
    "name": "工程师",
    "slug": "techies"
  },
  {
    "id": 106,
    "name": "灰烬之灵",
    "slug": "ember_spirit"
  },
  {
    "id": 107,
    "name": "大地之灵",
    "slug": "earth_spirit"
  },
  {
    "id": 108,
    "name": "孽主",
    "slug": "abyssal_underlord"
  },
  {
    "id": 109,
    "name": "恐怖利刃",
    "slug": "terrorblade"
  },
  {
    "id": 110,
    "name": "凤凰",
    "slug": "phoenix"
  },
  {
    "id": 111,
    "name": "神谕者",
    "slug": "oracle"
  },
  {
    "id": 112,
    "name": "寒冬飞龙",
    "slug": "winter_wyvern"
  },
  {
    "id": 113,
    "name": "天穹守望者",
    "slug": "arc_warden"
  },
  {
    "id": 114,
    "name": "齐天大圣",
    "slug": "monkey_king"
  },
  {
    "id": 119,
    "name": "邪影芳灵",
    "slug": "dark_willow"
  },
  {
    "id": 120,
    "name": "石鳞剑士",
    "slug": "pangolier"
  },
  {
    "id": 121,
    "name": "天涯墨客",
    "slug": "grimstroke"
  },
  {
    "id": 123,
    "name": "森海飞霞",
    "slug": "hoodwink"
  },
  {
    "id": 126,
    "name": "虚无之灵",
    "slug": "void_spirit"
  },
  {
    "id": 128,
    "name": "电炎绝手",
    "slug": "snapfire"
  },
  {
    "id": 129,
    "name": "玛尔斯",
    "slug": "mars"
  },
  {
    "id": 131,
    "name": "百戏大王",
    "slug": "ringmaster"
  },
  {
    "id": 135,
    "name": "破晓辰星",
    "slug": "dawnbreaker"
  },
  {
    "id": 136,
    "name": "玛西",
    "slug": "marci"
  },
  {
    "id": 137,
    "name": "獸",
    "slug": "primal_beast"
  },
  {
    "id": 138,
    "name": "琼英碧灵",
    "slug": "muerta"
  },
  {
    "id": 145,
    "name": "凯",
    "slug": "kez"
  },
  {
    "id": 155,
    "name": "朗戈",
    "slug": "largo"
  }
];

const HERO_BY_ID = Object.fromEntries(HEROES.map((hero) => [String(hero.id), hero]));

function heroById(value) {
  const id = Number(value || 0);
  const hero = HERO_BY_ID[String(id)];
  if (!hero) return { id, name: `未知英雄 #${id}`, slug: '', imageUrl: '' };
  return { ...hero, imageUrl: `${IMAGE_BASE}${hero.slug}.png` };
}

function decorateHero(target = {}) {
  const hero = heroById(target.heroId);
  return { ...target, heroName: hero.name, heroImage: hero.imageUrl };
}

module.exports = { HEROES, heroById, decorateHero };
