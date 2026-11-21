import { DISHES } from './content/dining.js';
import { SERVICE_MENU, SERVICE_BASIC_MENU } from './content/tavern-service.js';
import { SERVICE_SPECIALS, serviceSpecial } from './service-specials.js';
import { effectiveDcAttrs } from './dc.js';
export const SERVICE_TIERS = Object.freeze([
  {
    lv: 1,
    name: '星炉初灯旅店',
    en: 'STARLIGHT INN',
    repReq: 0,
    tables: 3,
    stoves: 2,
    maxReg: 3,
    maxSig: 2,
    priceMult: 1,
  },
  {
    lv: 2,
    name: '暖炉麦香旅舍',
    en: 'HEARTH & BARLEY',
    repReq: 80,
    tables: 4,
    stoves: 2,
    maxReg: 4,
    maxSig: 3,
    priceMult: 1.08,
  },
  {
    lv: 3,
    name: '银杯冒险酒馆',
    en: 'SILVER FLAGON',
    repReq: 240,
    tables: 4,
    stoves: 3,
    maxReg: 4,
    maxSig: 3,
    priceMult: 1.18,
  },
  {
    lv: 4,
    name: '金穗商路名店',
    en: 'GOLDEN SHEAF',
    repReq: 520,
    tables: 5,
    stoves: 3,
    maxReg: 5,
    maxSig: 4,
    priceMult: 1.28,
  },
  {
    lv: 5,
    name: '绯月王都沙龙',
    en: 'CRIMSON SALON',
    repReq: 950,
    tables: 6,
    stoves: 4,
    maxReg: 5,
    maxSig: 5,
    priceMult: 1.38,
  },
  {
    lv: 6,
    name: '万象传奇大酒馆',
    en: 'ARCANE LEGEND HALL',
    repReq: 1500,
    tables: 6,
    stoves: 4,
    maxReg: 6,
    maxSig: 6,
    priceMult: 1.5,
  },
]);

export const SERVICE_FACILITIES = Object.freeze([
  {
    id: 'stove',
    name: '秘银魔导灶',
    sub: 'ARCANE STOVE',
    maxLv: 5,
    baseCost: 40,
    costScale: 1.55,
    color: '#ff7a4d',
    desc: (lv) => `烹饪提速 +${lv * 12}% · 特色菜火候 2D6 +${Math.floor((lv + 1) / 2)}`,
  },
  {
    id: 'table',
    name: '橡木雕花桌椅',
    sub: 'CARVED OAK',
    maxLv: 5,
    baseCost: 35,
    costScale: 1.55,
    color: '#e9c46a',
    desc: (lv) => `客人耐心 +${lv * 2} 秒 · 结账小费 +${lv * 6}%`,
  },
  {
    id: 'barrel',
    name: '矮人精酿酒桶',
    sub: 'DWARVEN KEG',
    maxLv: 5,
    baseCost: 40,
    costScale: 1.55,
    color: '#f4a261',
    desc: (lv) => `敬酒回耐心并获 +${6 + lv * 3} 金币 · 连击维持 +${(lv * 0.7).toFixed(1)} 秒`,
  },
  {
    id: 'lamp',
    name: '星辉琉璃吊灯',
    sub: 'STARLIGHT LAMP',
    maxLv: 5,
    baseCost: 45,
    costScale: 1.6,
    color: '#58d4e8',
    desc: (lv) => `知名度获取 +${lv * 12}% · 贵客到访率 +${lv * 4}%`,
  },
  {
    id: 'dice',
    name: '命运占星骰盘',
    sub: 'FATE TRAY',
    maxLv: 5,
    baseCost: 55,
    costScale: 1.6,
    color: '#a78bfa',
    desc: (lv) => `每晚营业可重掷 ${1 + Math.floor((lv + 1) / 2)} 次 · 极品菜收益 +${lv * 6}%`,
  },
]);

export const SERVICE_WEATHERS = Object.freeze([
  {
    id: 'w_hearth',
    name: '晴朗星夜',
    badge: '✦',
    hotTags: ['肉食', '酒香'],
    tagBonus: 0.25,
    desc: '旅途顺遂的夜晚，【肉食/酒香】料理售价 +25%',
    patienceDelta: 0,
    vipBonus: 0,
    dcDelta: 0,
  },
  {
    id: 'w_frost',
    name: '霜降寒潮',
    badge: '❖',
    hotTags: ['浓香', '菌菇'],
    tagBonus: 0.35,
    desc: '夜风微凉，【浓香/菌菇】暖胃菜肴售价 +35%',
    patienceDelta: 2,
    vipBonus: 0.04,
    dcDelta: 0,
  },
  {
    id: 'w_lantern',
    name: '星灯祈愿夜',
    badge: '★',
    hotTags: ['甜味', '果香'],
    tagBonus: 0.3,
    desc: '灯火漫天，【甜味/果香】小食格外抢手（售价 +30%）',
    patienceDelta: 2,
    vipBonus: 0.1,
    dcDelta: 0,
  },
  {
    id: 'w_harbor',
    name: '河畔渔市夜',
    badge: '◈',
    hotTags: ['鱼鲜', '清淡'],
    tagBonus: 0.3,
    desc: '鲜货刚靠岸，【鱼鲜/清淡】风味售价 +30%',
    patienceDelta: 1,
    vipBonus: 0.05,
    dcDelta: 0,
  },
  {
    id: 'w_market',
    name: '丰收麦香节',
    badge: '✦',
    hotTags: ['谷物', '蛋奶'],
    tagBonus: 0.3,
    desc: '商队云集，【谷物/蛋奶】主食与点心售价 +30%',
    patienceDelta: 1,
    vipBonus: 0.06,
    dcDelta: 0,
  },
  {
    id: 'w_critic',
    name: '食客品鉴夜',
    badge: '♛',
    hotTags: ['浓香', '果香'],
    tagBonus: 0.35,
    desc: '贵客率显著提升，火候 DC +1，热销风味售价 +35%',
    patienceDelta: 0,
    vipBonus: 0.18,
    dcDelta: 1,
  },
  {
    id: 'w_rain',
    name: '听雨微醺夜',
    badge: '♪',
    hotTags: ['酒香', '清淡'],
    tagBonus: 0.28,
    desc: '宾客从容慢饮（耐心 +4 秒），火候 DC -1',
    patienceDelta: 4,
    vipBonus: 0.06,
    dcDelta: -1,
  },
  {
    id: 'w_guild',
    name: '冒险者庆功夜',
    badge: '⚔',
    hotTags: ['肉食', '甜味'],
    tagBonus: 0.35,
    desc: '小队凯旋包场，【肉食/甜味】售价 +35%',
    patienceDelta: 1,
    vipBonus: 0.12,
    dcDelta: 0,
  },
]);

export const SERVICE_PATRONS = Object.freeze([
  {
    id: 'p_adv',
    name: '见习冒险者',
    likes: ['肉食', '谷物'],
    patience: 26,
    tipRate: 0.12,
    color: '#5b8def',
    glyph: '剑',
    quote: '刚从外头回来，挑道实在的！',
  },
  {
    id: 'p_guard',
    name: '商队护卫',
    likes: ['浓香', '肉食'],
    patience: 25,
    tipRate: 0.15,
    color: '#e2605a',
    glyph: '盾',
    quote: '夜巡刚换岗，来份热腾腾的！',
  },
  {
    id: 'p_elf',
    name: '林野旅人',
    likes: ['清淡', '果香'],
    patience: 28,
    tipRate: 0.15,
    color: '#6fcf8a',
    glyph: '叶',
    quote: '听说店里的薄荷与果点很出名。',
  },
  {
    id: 'p_scribe',
    name: '星塔抄书人',
    likes: ['甜味', '蛋奶'],
    patience: 28,
    tipRate: 0.16,
    color: '#58c4e0',
    glyph: '星',
    quote: '甜食最能赶走夜读的倦意了。',
  },
  {
    id: 'p_dwarf',
    name: '工坊锻匠',
    likes: ['酒香', '浓香'],
    patience: 24,
    tipRate: 0.18,
    color: '#e08a45',
    glyph: '锤',
    quote: '手艺不输发条炉火的才叫好菜！',
  },
  {
    id: 'p_merchant',
    name: '远行行商',
    likes: ['鱼鲜', '菌菇'],
    patience: 26,
    tipRate: 0.2,
    color: '#f4a261',
    glyph: '商',
    quote: '走过十座驿站，就惦记这一口鲜。',
  },
  {
    id: 'p_vip_critic',
    name: '金匙食评官',
    vip: true,
    likes: ['菌菇', '鲜香', '浓香', '清淡'],
    patience: 26,
    tipRate: 0.4,
    color: '#ffd166',
    glyph: '匙',
    quote: '推荐一道合我口味的招牌料理吧？',
  },
  {
    id: 'p_vip_noble',
    name: '绯月小姐',
    vip: true,
    likes: ['甜味', '果香', '蛋奶'],
    patience: 24,
    tipRate: 0.45,
    color: '#ff8fb3',
    glyph: '冠',
    quote: '想要精致香甜的茶点，可别让我失望。',
  },
  {
    id: 'p_vip_captain',
    name: '守备骑士',
    vip: true,
    likes: ['肉食', '酒香', '谷物'],
    patience: 26,
    tipRate: 0.42,
    color: '#60a5fa',
    glyph: '徽',
    quote: '带队巡城归来，给推荐一道压阵大菜！',
  },
]);

export const SERVICE_LIVE_EVENTS = Object.freeze([
  {
    id: 'le_brawl',
    title: '微醺冒险者起哄',
    badge: '◆',
    color: '#ff7a4d',
    desc: '两桌刚结算完任务的佣兵拍案比腕力，眼看就要震翻酒盏！',
    opts: [
      {
        label: '沉稳按住桌面稳场',
        attr: 'str',
        post: 'clean',
        dc: 8,
        winText: '桌纹稳如磐石，佣兵笑着乖乖掏出双倍酒水赏钱！',
        loseText: '洒了半壶麦酒，周围客人稍显惊扰。',
        reward: { gold: 24, rep: 8, fever: 25 },
        penalty: { patience: -3 },
      },
      {
        label: '打趣敬酒化解尴尬',
        attr: 'cha',
        post: 'front',
        dc: 7,
        winText: '几句俏皮话引来满堂笑声，顺势多卖出两轮小食！',
        loseText: '嗓门被笑声盖了过去，只得赔一杯解酒茶。',
        reward: { gold: 18, rep: 10, calm: 5 },
        penalty: { gold: -6 },
      },
    ],
  },
  {
    id: 'le_critic',
    title: '隐姓老饕盲品挑战',
    badge: '★',
    color: '#ffd166',
    desc: '吧台角落的旅人轻叩瓷碟：「能辨出这碗高汤少了一味什么香草吗？」',
    opts: [
      {
        label: '凭嗅觉现研精准香料',
        attr: 'wis',
        post: 'cook',
        dc: 9,
        winText: '老饕抚掌叹服，留下丰厚金镑与赞誉口碑！',
        loseText: '差了半分层次感，老饕笑言改日再来指教。',
        reward: { gold: 34, rep: 14 },
        penalty: { rep: -2 },
      },
      {
        label: '详述地方风味典故',
        attr: 'int',
        post: 'front',
        dc: 8,
        winText: '学识让老饕频频点头，当场在手记里写下推荐！',
        loseText: '产地记岔了一站，场面略有一丝局促。',
        reward: { gold: 22, rep: 16 },
        penalty: { patience: -2 },
      },
    ],
  },
  {
    id: 'le_bard',
    title: '流浪琴师邀约合奏',
    badge: '♪',
    color: '#58d4e8',
    desc: '酒馆窗边响起鲁特琴弦音，琴师向柜台后挥手致意，邀大家伴唱一曲！',
    opts: [
      {
        label: '高歌一曲《星灯夜行》',
        attr: 'cha',
        post: 'front',
        dc: 8,
        winText: '歌声瞬间点燃气氛！狂欢槽大涨，宾客耐心全数回暖！',
        loseText: '高音微哑，大家善意拍手助威。',
        reward: { gold: 20, rep: 10, fever: 45, calm: 6 },
        penalty: { rep: -1 },
      },
      {
        label: '花式摇盏打起节拍',
        attr: 'dex',
        post: 'server',
        dc: 8,
        winText: '银杯翻飞滴酒不漏，沿途食客纷纷投下小费！',
        loseText: '撞响了托盘边角，溅出少许茶水。',
        reward: { gold: 30, rep: 8 },
        penalty: { gold: -6 },
      },
    ],
  },
  {
    id: 'le_flare',
    title: '炉灶旺火骤窜',
    badge: '✦',
    color: '#fb923c',
    desc: '肉汁滴落助燃炭火，金红火苗瞬间窜高半尺，满屋锅气逼人！',
    opts: [
      {
        label: '顺势快翻锁住焦香',
        attr: 'dex',
        post: 'cook',
        dc: 9,
        winText: '绝佳锅气惊艳四座！狂欢热情骤升并收获额外赏金！',
        loseText: '微烟冒出后厨，食客多等了一会儿。',
        reward: { gold: 28, rep: 12, fever: 38 },
        penalty: { patience: -3 },
      },
      {
        label: '沉稳压低风门控温',
        attr: 'con',
        post: 'cook',
        dc: 7,
        winText: '稳妥控住火候，安稳出锅赢得一桌食客喝彩！',
        loseText: '手忙脚乱调小风门，耽搁了片刻。',
        reward: { gold: 18, rep: 8, calm: 4 },
        penalty: { patience: -2 },
      },
    ],
  },
  {
    id: 'le_peddler',
    title: '夜行菜贩急售鲜货',
    badge: '◈',
    color: '#a78bfa',
    desc: '后巷推来一车带露的晨采食材：「城门快落锁了，懂货的半价全收！」',
    opts: [
      {
        label: '逐筐验看新鲜成色',
        attr: 'wis',
        post: 'clean',
        dc: 8,
        winText: '挑中成色上乘的好货！冰窖额外入账稀有食材与金币回扣！',
        loseText: '夜色太暗没看真切，只好作罢。',
        reward: { randIng: true, gold: 14, rep: 6 },
        penalty: { gold: -8 },
      },
      {
        label: '熟练议价整筐盘下',
        attr: 'cha',
        post: 'server',
        dc: 8,
        winText: '几轮还价拿下好价，冰窖多添数份新鲜食材！',
        loseText: '摊主嘴皮更利索，少赚了些差价。',
        reward: { randIng: true, gold: 18, rep: 5 },
        penalty: { gold: -10 },
      },
    ],
  },
  {
    id: 'le_convoy',
    title: '商旅夜班加急点茶',
    badge: '❖',
    color: '#ff8fb3',
    desc: '城门哨卡换防的骑士快步入内：「同伴在外候着，急需热饮点心！」',
    opts: [
      {
        label: '敏捷穿梭闪电装盘',
        attr: 'dex',
        post: 'server',
        dc: 9,
        winText: '眨眼送齐两份热茶与点心，队长赞不绝口付了重赏！',
        loseText: '茶盏略洒几滴，只结了常规茶资。',
        reward: { gold: 36, rep: 12 },
        penalty: { patience: -2 },
      },
      {
        label: '巧搭醒神香草蜜方',
        attr: 'int',
        post: 'cook',
        dc: 8,
        winText: '香气驱散夜寒，骑士约定下回带队常来光顾！',
        loseText: '时间紧来不及多加蜂蜜，反响平平。',
        reward: { gold: 28, rep: 14 },
        penalty: { rep: -1 },
      },
    ],
  },
]);

const DISH_GLYPH_FALLBACK = Object.freeze([
  '#e07a5f',
  '#6fcf8a',
  '#ffd166',
  '#58c4e0',
  '#f4a261',
  '#a78bfa',
  '#ff8fb3',
]);

function inferRegularTags(item) {
  const dish = DISHES[item.artId];
  if (dish?.tags?.length) return [...dish.tags];
  const tags = [];
  if (/茶|酒/.test(item.name)) tags.push('酒香', '清淡');
  if (/鸡|牛|肉/.test(item.name)) tags.push('肉食', '浓香');
  if (/鱼|鳗/.test(item.name)) tags.push('鱼鲜', '清淡');
  if (/菇|蕈/.test(item.name)) tags.push('菌菇', '蛋奶');
  if (/奶|蛋|布丁/.test(item.name)) tags.push('蛋奶', '甜味');
  if (/饼|派|包|塔/.test(item.name)) tags.push('谷物', '甜味');
  if (/根|菜|沙拉/.test(item.name)) tags.push('清淡', '蔬菜');
  return tags.length ? [...new Set(tags)].slice(0, 3) : ['谷物', '清淡'];
}

export const SERVICE_CATALOG = Object.freeze(
  SERVICE_MENU.map((item, idx) => {
    const isSig = Object.hasOwn(SERVICE_SPECIALS, item.id);
    const dish = DISHES[item.artId];
    return {
      id: item.id,
      index: idx,
      name: item.name,
      kind: isSig ? 'signature' : 'regular',
      basePrice: isSig ? SERVICE_SPECIALS[item.id] : item.price,
      activity: item.activity,
      artId: item.artId,
      tags: inferRegularTags(item),
      recipe: isSig ? dish?.recipe || null : null,
      dc: isSig
        ? Math.min(
            11,
            7 + Math.floor(Object.values(dish?.recipe || {}).reduce((a, b) => a + b, 0) / 3),
          )
        : 0,
      color: DISH_GLYPH_FALLBACK[idx % DISH_GLYPH_FALLBACK.length],
      glyph: item.name.at(-1) || '菜',
    };
  }),
);

export const SERVICE_CATALOG_MAP = Object.freeze(
  Object.fromEntries(SERVICE_CATALOG.map((item) => [item.id, item])),
);

export function serviceFacilityCost(facility, level) {
  return Math.round(facility.baseCost * Math.pow(facility.costScale, level));
}

export function liveServiceTier(reputation = 0) {
  let current = SERVICE_TIERS[0];
  let next = SERVICE_TIERS[1] || null;
  for (let i = 0; i < SERVICE_TIERS.length; i++) {
    if (reputation >= SERVICE_TIERS[i].repReq) {
      current = SERVICE_TIERS[i];
      next = SERVICE_TIERS[i + 1] || null;
    }
  }
  return { current, next };
}

export function liveWeatherForDay(day = 1) {
  return SERVICE_WEATHERS[Math.max(0, (day - 1) % SERVICE_WEATHERS.length)];
}

export function liveFacilities(growth) {
  const raw = growth?.facilities || {};
  return {
    stove: raw.stove || 0,
    table: raw.table || 0,
    barrel: raw.barrel || 0,
    lamp: raw.lamp || 0,
    dice: raw.dice || 0,
  };
}

export function defaultHubMenus(growth, inventory = {}) {
  const tier = liveServiceTier(growth?.reputation || 0).current;
  const regDefault = SERVICE_BASIC_MENU.slice(0, tier.maxReg).map((idx) => SERVICE_MENU[idx].id);
  const regMenu = growth?.regMenu?.length
    ? growth.regMenu
        .filter((id) => SERVICE_CATALOG_MAP[id]?.kind === 'regular')
        .slice(0, tier.maxReg)
    : regDefault;
  const sigMenu = growth?.sigMenu?.length
    ? growth.sigMenu
        .filter((id) => SERVICE_CATALOG_MAP[id]?.kind === 'signature')
        .slice(0, tier.maxSig)
    : SERVICE_CATALOG.filter((d) => d.kind === 'signature' && liveCraftableCount(d, inventory) > 0)
        .slice(0, tier.maxSig)
        .map((d) => d.id);
  return {
    regMenu: regMenu.length ? regMenu : regDefault,
    sigMenu,
  };
}

export function liveCraftableCount(dish, inventory = {}) {
  if (!dish?.recipe) return 999;
  return Math.min(
    ...Object.entries(dish.recipe).map(([id, n]) => Math.floor((inventory[id] || 0) / n)),
  );
}

export function calcLiveDishPrice(dish, { growth, day = 1 } = {}) {
  const weather = liveWeatherForDay(day);
  const tier = liveServiceTier(growth?.reputation || 0).current;
  const sold = growth?.specialties?.[dish.id] || 0;
  const base =
    dish.kind === 'signature'
      ? serviceSpecial(dish.id, growth)?.price || dish.basePrice
      : dish.basePrice;
  const isHot = dish.tags.some((t) => weather.hotTags.includes(t));
  const weatherMult = isHot ? 1 + weather.tagBonus : 1;
  const starMult = 1 + Math.min(4, Math.floor(sold / 8)) * 0.05;
  const price = Math.max(4, Math.round(base * tier.priceMult * weatherMult * starMult));
  return { price, isHot };
}

export function liveHubFateTokens(library, growth, staff) {
  const fac = liveFacilities(growth);
  const cookId = staff?.cook;
  const member = library?.characters?.find((c) => c.id === cookId) || library?.characters?.[0];
  const mods = member ? effectiveDcAttrs(library, member).mods : {};
  const bestSoft = Math.max(mods.wis?.mod || 0, mods.cha?.mod || 0);
  return Math.min(4, 1 + Math.floor((fac.dice + 1) / 2) + (bestSoft >= 2 ? 1 : 0));
}

export function upgradeLiveFacility(library, facilityId) {
  const facDef = SERVICE_FACILITIES.find((f) => f.id === facilityId);
  if (!facDef) throw Error('未知酒馆设施');
  const growth = library.daily.serviceGrowth;
  growth.facilities ||= { stove: 0, table: 0, barrel: 0, lamp: 0, dice: 0 };
  const lv = growth.facilities[facilityId] || 0;
  if (lv >= facDef.maxLv) throw Error('该设施已满级');
  const cost = serviceFacilityCost(facDef, lv);
  if ((library.inventory.gold || 0) < cost) throw Error(`金币不足（需 ${cost} 金币）`);
  library.inventory.gold -= cost;
  growth.facilities[facilityId] = lv + 1;
  return { cost, newLevel: lv + 1 };
}

export function toggleLiveHubDish(library, dishId) {
  const dish = SERVICE_CATALOG_MAP[dishId];
  if (!dish) return false;
  const growth = library.daily.serviceGrowth;
  const tier = liveServiceTier(growth.reputation).current;
  const menus = defaultHubMenus(growth, library.dining.inventory);
  if (dish.kind === 'regular') {
    const has = menus.regMenu.includes(dishId);
    if (has && menus.regMenu.length <= 1) throw Error('至少保留一道基础菜');
    growth.regMenu = has
      ? menus.regMenu.filter((id) => id !== dishId)
      : [...menus.regMenu, dishId].slice(-tier.maxReg);
  } else {
    const has = menus.sigMenu.includes(dishId);
    growth.sigMenu = has
      ? menus.sigMenu.filter((id) => id !== dishId)
      : [...menus.sigMenu, dishId].slice(-tier.maxSig);
  }
  return true;
}

export function autoFillLiveHubMenu(library) {
  const growth = library.daily.serviceGrowth;
  const day = library.daily.day || 1;
  const tier = liveServiceTier(growth.reputation).current;
  const inv = library.dining.inventory || {};
  const score = (d) => {
    const { price, isHot } = calcLiveDishPrice(d, { growth, day });
    return price + (isHot ? 15 : 0);
  };
  growth.regMenu = SERVICE_CATALOG.filter((d) => d.kind === 'regular')
    .sort((a, b) => score(b) - score(a))
    .slice(0, tier.maxReg)
    .map((d) => d.id);
  growth.sigMenu = SERVICE_CATALOG.filter(
    (d) => d.kind === 'signature' && liveCraftableCount(d, inv) > 0,
  )
    .sort((a, b) => score(b) - score(a))
    .slice(0, tier.maxSig)
    .map((d) => d.id);
  return { regMenu: growth.regMenu, sigMenu: growth.sigMenu };
}
