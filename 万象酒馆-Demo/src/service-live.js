import { DISHES, INGREDIENTS } from './content/dining.js';
import { SERVICE_BASIC_MENU, SERVICE_MENU } from './content/tavern-service.js';
import { SERVICE_SPECIALS, serviceSpecial } from './service-specials.js';
import {
  SERVICE_ROLES,
  serviceAutoChance,
  serviceProficiency,
  serviceSeed,
  serviceWaitBonus,
  settleServiceGrowth,
} from './service-progression.js';
import { applyServiceGesture, serviceActivity } from './service-gestures.js';
import { effectiveDcAttrs, evaluate2d6Check, isDcSuccess, roll2d6 } from './dc.js';

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

export function restoreLiveServiceShift(raw) {
  if (!raw || raw.mode !== 'live') return raw;
  return {
    ...structuredClone(raw),
    activeMiniGame: null,
    paused: false,
  };
}

function rngFloat(shift, salt = '') {
  shift.rngCounter = (shift.rngCounter || 0) + 1;
  return serviceSeed(`${shift.seed}:${salt}:${shift.rngCounter}`) / 4294967296;
}

export function chefCookModForShift(shift) {
  return (shift.staffMods?.cook?.wis ?? 0) + Math.floor(((shift.facilities?.stove || 0) + 1) / 2);
}

export function newLiveServiceShift({
  library,
  staff,
  day = 1,
  growth,
  tutorial = false,
  seed = Math.floor(Math.random() * 2 ** 32),
}) {
  const tier = liveServiceTier(growth?.reputation || 0).current;
  const fac = liveFacilities(growth);
  const menus = tutorial
    ? { regMenu: ['herb-chicken', 'mushroom-soup', 'berry-crepe'], sigMenu: [] }
    : defaultHubMenus(growth, library.dining.inventory);
  const staffMods = {};
  const staffLevels = {};
  for (const role of Object.keys(SERVICE_ROLES)) {
    const id = staff?.[role];
    const member = library.characters.find((c) => c.id === id);
    const mods = member ? effectiveDcAttrs(library, member).mods : {};
    staffMods[role] = Object.fromEntries(Object.entries(mods).map(([k, v]) => [k, v.mod || 0]));
    staffLevels[role] = serviceProficiency(growth, id, role);
  }
  const duration = tutorial ? 34 : 58;
  const tablesUnlocked = tutorial ? 3 : tier.tables;
  const stovesUnlocked = tutorial
    ? 2
    : Math.min(4, Math.max(tier.stoves, 2 + Math.floor(fac.stove / 2)));
  return {
    mode: 'live',
    version: 5,
    seed,
    rngCounter: 0,
    day,
    tutorial: Boolean(tutorial),
    duration,
    elapsed: 0,
    tablesUnlocked,
    stovesUnlocked,
    facilities: fac,
    weather: liveWeatherForDay(day),
    regMenu: menus.regMenu,
    sigMenu: menus.sigMenu,
    pantry: structuredClone(library.dining.inventory || {}),
    bonusIngredients: {},
    staff: { ...staff },
    staffMods,
    staffLevels,
    completedByRole: {},
    fateTokens: tutorial ? 1 : liveHubFateTokens(library, growth, staff),
    queue: [],
    tables: Array.from({ length: 6 }, (_, idx) => ({
      idx,
      unlocked: idx < tablesUnlocked,
      state: 'empty',
      patron: null,
      patience: 0,
      maxPatience: 0,
      recipeId: null,
      matchMult: 1,
      eatTimer: 0,
      billGold: 0,
      billRep: 0,
      quality: 'normal',
    })),
    stoves: Array.from({ length: 4 }, (_, idx) => ({
      idx,
      unlocked: idx < stovesUnlocked,
      status: 'idle',
      ticket: null,
      progress: 0,
      cookSec: 4.5,
      dcWait: 0,
    })),
    orders: [],
    plates: [],
    guestSeq: 0,
    guestsSpawned: 0,
    maxGuests: tutorial ? 3 : 6 + Math.min(5, tablesUnlocked),
    nextGuestAt: 0.4,
    kegCd: 0,
    combo: 0,
    comboTimer: 0,
    maxCombo: 0,
    fever: 0,
    feverLeft: 0,
    autoTimer: 2.2,
    lastAutoProc: null,
    eventTriggered: tutorial,
    activeEvent: null,
    activeCookDc: null,
    activeMiniGame: null,
    vipModalTableIdx: null,
    servedCount: 0,
    masterworkCount: 0,
    dcPassed: 0,
    vipsServed: 0,
    leftAngry: 0,
    earnedGold: 0,
    regGold: 0,
    sigGold: 0,
    tipGold: 0,
    eventGold: 0,
    repGain: 0,
    reputationSnapshot: growth?.reputation || 0,
    specialtiesSnapshot: structuredClone(growth?.specialties || {}),
    settled: false,
    finished: false,
  };
}

function isPaused(shift) {
  return Boolean(
    shift.finished ||
    shift.paused ||
    shift.activeEvent ||
    shift.activeCookDc ||
    shift.activeMiniGame ||
    shift.vipModalTableIdx !== null,
  );
}

function shiftGrowthProxy(shift) {
  return {
    reputation: shift.reputationSnapshot || 0,
    facilities: shift.facilities,
    specialties: shift.specialtiesSnapshot || {},
  };
}

function spawnGuest(shift) {
  const pool = shift.tutorial ? SERVICE_PATRONS.filter((p) => !p.vip) : SERVICE_PATRONS;
  const vipRate = shift.tutorial
    ? 0
    : Math.min(0.45, 0.14 + (shift.facilities?.lamp || 0) * 0.04 + (shift.weather?.vipBonus || 0));
  const wantVip = !shift.tutorial && rngFloat(shift, 'vip') < vipRate;
  const candidates = wantVip ? pool.filter((p) => p.vip) : pool.filter((p) => !p.vip);
  const patron = candidates[Math.floor(rngFloat(shift, 'patron') * candidates.length)] || pool[0];
  const frontWait = serviceWaitBonus(shift.staffLevels?.front || 0);
  const tableWait = (shift.facilities?.table || 0) * 2;
  const maxPatience = Math.max(
    18,
    patron.patience + frontWait + tableWait + (shift.weather?.patienceDelta || 0),
  );
  shift.queue.push({
    uid: ++shift.guestSeq,
    patron,
    patience: maxPatience,
    maxPatience,
  });
  shift.guestsSpawned++;
}

function consumeDishIngredients(shift, dish) {
  if (!dish?.recipe) return true;
  if (liveCraftableCount(dish, shift.pantry) <= 0) return false;
  for (const [ingId, n] of Object.entries(dish.recipe)) {
    shift.pantry[ingId] = Math.max(0, (shift.pantry[ingId] || 0) - n);
  }
  return true;
}

function pickGuestDish(shift, patron) {
  const stockedSigs = shift.sigMenu
    .map((id) => SERVICE_CATALOG_MAP[id])
    .filter((d) => d && liveCraftableCount(d, shift.pantry) > 0);
  const regs = shift.regMenu.map((id) => SERVICE_CATALOG_MAP[id]).filter(Boolean);
  const all = [...stockedSigs, ...regs];
  if (!all.length) return SERVICE_CATALOG_MAP['herb-chicken'];
  const scored = all
    .map((dish) => {
      const likes = dish.tags.filter((t) => patron.likes.includes(t)).length;
      const sigBias = dish.kind === 'signature' ? 1.5 : 0;
      return { dish, weight: 1 + likes * 2 + sigBias + rngFloat(shift, dish.id) };
    })
    .sort((a, b) => b.weight - a.weight);
  const picked = scored[0].dish;
  if (picked.kind === 'signature' && consumeDishIngredients(shift, picked)) return picked;
  return regs[Math.floor(rngFloat(shift, 'reg') * regs.length)] || picked;
}

function assignOrderToStove(shift) {
  while (shift.orders.length) {
    const stove = shift.stoves.find((s) => s.unlocked && s.status === 'idle');
    if (!stove) break;
    const ticket = shift.orders.shift();
    const cookSpd =
      1 + (shift.facilities?.stove || 0) * 0.12 + (shift.staffLevels?.cook || 0) * 0.004;
    const baseSec = SERVICE_CATALOG_MAP[ticket.recipeId]?.kind === 'signature' ? 4.8 : 3.8;
    stove.status = 'cooking';
    stove.ticket = ticket;
    stove.progress = 0;
    stove.cookSec = Math.max(2.2, baseSec / cookSpd);
    stove.dcWait = 0;
  }
}

function pushReadyPlate(shift, ticket, quality = 'normal') {
  shift.plates.push({
    uid: ++shift.guestSeq,
    tableIdx: ticket.tableIdx,
    recipeId: ticket.recipeId,
    quality,
    matchMult: ticket.matchMult || 1,
  });
}

export function seatLiveGuest(shift, guestUid = null, preferredTableIdx = null) {
  if (!shift.queue.length) return false;
  const gIdx = guestUid ? shift.queue.findIndex((g) => g.uid === guestUid) : 0;
  if (gIdx < 0) return false;
  const table =
    preferredTableIdx !== null &&
    shift.tables[preferredTableIdx]?.unlocked &&
    shift.tables[preferredTableIdx]?.state === 'empty'
      ? shift.tables[preferredTableIdx]
      : shift.tables.find((t) => t.unlocked && t.state === 'empty');
  if (!table) return false;
  const [guest] = shift.queue.splice(gIdx, 1);
  const maxPatience = guest.maxPatience;
  table.state = 'ordering';
  table.patron = guest.patron;
  table.patience = maxPatience;
  table.maxPatience = maxPatience;
  table.recipeId = null;
  table.matchMult = 1;
  table.quality = 'normal';
  shift.completedByRole.front = (shift.completedByRole.front || 0) + 1;
  return true;
}

export function queueLiveOrder(shift, table, dish, matchMult = 1) {
  table.state = 'waiting';
  table.recipeId = dish.id;
  table.matchMult = matchMult;
  table.patience = Math.min(table.maxPatience, table.patience + 4);
  shift.orders.push({
    uid: ++shift.guestSeq,
    tableIdx: table.idx,
    recipeId: dish.id,
    matchMult,
  });
  assignOrderToStove(shift);
  shift.completedByRole.server = (shift.completedByRole.server || 0) + 1;
  return true;
}

export function chooseLiveVipDish(shift, tableIdx, recipeId) {
  const table = shift.tables[tableIdx];
  const dish = SERVICE_CATALOG_MAP[recipeId];
  shift.vipModalTableIdx = null;
  if (!table || table.state !== 'ordering' || !dish) return false;
  if (dish.kind === 'signature' && !consumeDishIngredients(shift, dish)) return false;
  const hits = dish.tags.filter((t) => table.patron?.likes?.includes(t)).length;
  const matchMult = hits >= 2 ? 1.45 : hits === 1 ? 1.2 : 1;
  return queueLiveOrder(shift, table, dish, matchMult);
}

export function serveLivePlate(shift, plateUid) {
  const idx = shift.plates.findIndex((p) => p.uid === plateUid);
  if (idx < 0) return false;
  const plate = shift.plates[idx];
  const table = shift.tables[plate.tableIdx];
  if (!table || table.state !== 'waiting') {
    shift.plates.splice(idx, 1);
    return false;
  }
  shift.plates.splice(idx, 1);
  const dish = SERVICE_CATALOG_MAP[plate.recipeId];
  const { price } = calcLiveDishPrice(dish, { growth: shiftGrowthProxy(shift), day: shift.day });
  const qMult =
    plate.quality === 'divine'
      ? 1.75
      : plate.quality === 'great'
        ? 1.35 + (shift.facilities?.dice || 0) * 0.04
        : plate.quality === 'burnt'
          ? 0.8
          : 1;
  const comboMult = 1 + Math.min(0.6, shift.combo * 0.06);
  const feverMult = shift.feverLeft > 0 ? 1.35 : 1;
  const bill = Math.max(
    4,
    Math.round(price * qMult * (plate.matchMult || 1) * comboMult * feverMult),
  );
  const tipRate = (table.patron?.tipRate || 0.12) + (shift.facilities?.table || 0) * 0.05;
  const tip = Math.max(
    1,
    Math.round(
      bill * tipRate * (plate.quality === 'divine' || plate.quality === 'great' ? 1.25 : 1),
    ),
  );
  table.state = 'eating';
  table.eatTimer = 2.6;
  table.billGold = bill + tip;
  table.billRep = Math.round(
    (dish.kind === 'signature' ? 7 : 4) *
      (1 + (shift.facilities?.lamp || 0) * 0.12) *
      (plate.quality === 'divine' ? 1.5 : plate.quality === 'great' ? 1.25 : 1),
  );
  table.quality = plate.quality;
  table._tipPart = tip;
  table._kind = dish.kind;
  shift.completedByRole.server = (shift.completedByRole.server || 0) + 1;
  return true;
}

export function collectLiveTablePay(shift, tableIdx) {
  const table = shift.tables[tableIdx];
  if (!table || table.state !== 'pay') return null;
  const gold = table.billGold || 10;
  const rep = table.billRep || 4;
  const tip = table._tipPart || 1;
  const isSig = table._kind === 'signature';
  const quality = table.quality;
  if (table.patron?.vip) shift.vipsServed++;
  shift.servedCount++;
  if (quality === 'great' || quality === 'divine') shift.masterworkCount++;
  shift.combo++;
  shift.comboTimer = 9 + (shift.facilities?.barrel || 0) * 0.7;
  if (shift.combo > shift.maxCombo) shift.maxCombo = shift.combo;
  shift.fever = Math.min(100, shift.fever + (isSig ? 24 : 16));
  shift.earnedGold += gold;
  shift.tipGold += tip;
  if (isSig) shift.sigGold += gold - tip;
  else shift.regGold += gold - tip;
  shift.repGain += rep;
  shift.specialtiesSnapshot[table.recipeId] = (shift.specialtiesSnapshot[table.recipeId] || 0) + 1;
  shift.completedByRole.clean = (shift.completedByRole.clean || 0) + 1;
  table.state = 'empty';
  table.patron = null;
  table.recipeId = null;
  table.billGold = 0;
  table.billRep = 0;
  table.quality = 'normal';
  return { gold, rep };
}

export function clickLiveTable(shift, tableIdx) {
  const table = shift.tables[tableIdx];
  if (!table || !table.unlocked) return { action: 'none' };
  if (table.state === 'empty') {
    const ok = seatLiveGuest(shift, null, tableIdx);
    return { action: ok ? 'seat' : 'none' };
  }
  if (table.state === 'ordering') {
    if (table.patron?.vip) {
      shift.vipModalTableIdx = tableIdx;
      return { action: 'vip-modal' };
    }
    const dish = pickGuestDish(shift, table.patron);
    queueLiveOrder(shift, table, dish, 1);
    return { action: 'order', dishName: dish.name };
  }
  if (table.state === 'waiting') {
    const plate = shift.plates.find((p) => p.tableIdx === tableIdx);
    if (plate) {
      serveLivePlate(shift, plate.uid);
      return { action: 'serve' };
    }
    return { action: 'waiting' };
  }
  if (table.state === 'pay') {
    const res = collectLiveTablePay(shift, tableIdx);
    return { action: 'pay', ...res };
  }
  return { action: 'eating' };
}

export function openLiveCookDc(shift, stoveIdx) {
  const stove = shift.stoves[stoveIdx];
  if (!stove || stove.status !== 'dc_ready' || !stove.ticket) return null;
  const dish = SERVICE_CATALOG_MAP[stove.ticket.recipeId];
  const dc = Math.max(5, Math.min(12, (dish?.dc || 8) + (shift.weather?.dcDelta || 0)));
  const mod = chefCookModForShift(shift);
  const dice = roll2d6();
  const check = evaluate2d6Check({ dice, mod, dc });
  shift.activeCookDc = { stoveIdx, dish, dc, mod, check };
  return shift.activeCookDc;
}

export function rerollLiveCookDc(shift) {
  const modal = shift.activeCookDc;
  if (!modal || shift.fateTokens <= 0) return false;
  shift.fateTokens--;
  modal.check = evaluate2d6Check({ dice: roll2d6(), mod: modal.mod, dc: modal.dc });
  return true;
}

export function confirmLiveCookDc(shift) {
  const modal = shift.activeCookDc;
  if (!modal) return null;
  const stove = shift.stoves[modal.stoveIdx];
  shift.activeCookDc = null;
  if (!stove || !stove.ticket) return null;
  const out = modal.check.outcome;
  const quality =
    out === 'crit' ? 'divine' : out === 'success' ? 'great' : out === 'fumble' ? 'burnt' : 'normal';
  if (isDcSuccess(out)) shift.dcPassed++;
  pushReadyPlate(shift, stove.ticket, quality);
  stove.status = 'idle';
  stove.ticket = null;
  stove.progress = 0;
  stove.dcWait = 0;
  shift.completedByRole.cook = (shift.completedByRole.cook || 0) + 1;
  assignOrderToStove(shift);
  return { quality, outcome: out };
}

export function openLiveCookMiniGame(shift, stoveIdx) {
  const stove = shift.stoves[stoveIdx];
  if (!stove || stove.status !== 'cooking' || !stove.ticket) return null;
  const dish = SERVICE_CATALOG_MAP[stove.ticket.recipeId];
  const activity = serviceActivity(dish.activity, { cookSince: shift.elapsed }, shift.elapsed);
  shift.activeMiniGame = {
    stoveIdx,
    dish,
    kind: activity.kind,
    activity,
  };
  return shift.activeMiniGame;
}

export function inputLiveCookMiniGame(shift, input) {
  const mg = shift.activeMiniGame;
  if (!mg) return { valid: false };
  const res = applyServiceGesture(mg.activity, input);
  if (!res.valid) return { valid: false };
  mg.activity = { ...mg.activity, state: res.state };
  if (!res.done) return { valid: true, done: false, activity: mg.activity };
  const stove = shift.stoves[mg.stoveIdx];
  shift.activeMiniGame = null;
  if (stove && stove.ticket) {
    pushReadyPlate(shift, stove.ticket, 'great');
    stove.status = 'idle';
    stove.ticket = null;
    stove.progress = 0;
    stove.dcWait = 0;
    shift.completedByRole.cook = (shift.completedByRole.cook || 0) + 1;
    assignOrderToStove(shift);
  }
  return { valid: true, done: true };
}

export function closeLiveCookMiniGame(shift) {
  shift.activeMiniGame = null;
}

export function clickLiveStove(shift, stoveIdx) {
  const stove = shift.stoves[stoveIdx];
  if (!stove || !stove.unlocked) return { action: 'none' };
  if (stove.status === 'dc_ready') {
    openLiveCookDc(shift, stoveIdx);
    return { action: 'dc-modal' };
  }
  if (stove.status === 'cooking') {
    openLiveCookMiniGame(shift, stoveIdx);
    return { action: 'minigame' };
  }
  return { action: 'idle' };
}

export function boostLiveStove(shift, stoveIdx) {
  const stove = shift.stoves[stoveIdx];
  if (!stove || stove.status !== 'cooking' || !stove.ticket) return false;
  stove.progress = Math.min(1, stove.progress + 0.34);
  if (stove.progress >= 1) {
    if (shift.activeMiniGame?.stoveIdx === stoveIdx) shift.activeMiniGame = null;
    const dish = SERVICE_CATALOG_MAP[stove.ticket.recipeId];
    if (dish?.kind === 'signature') {
      stove.status = 'dc_ready';
      stove.dcWait = 0;
    } else {
      pushReadyPlate(shift, stove.ticket, 'normal');
      stove.status = 'idle';
      stove.ticket = null;
      stove.progress = 0;
      assignOrderToStove(shift);
    }
  }
  return true;
}

/** End an active live shift early so the midnight ledger modal opens cleanly. */
export function closeLiveShiftEarly(shift) {
  if (!shift) return;
  shift.finished = true;
  shift.activeEvent = null;
  shift.activeCookDc = null;
  shift.activeMiniGame = null;
  shift.vipModalTableIdx = null;
}

export function pickLiveEventOption(shift, optIndex) {
  const ev = shift.activeEvent;
  if (!ev || ev.roll) return null;
  const opt = ev.def.opts[optIndex];
  if (!opt) return null;
  const mod = shift.staffMods?.[opt.post]?.[opt.attr] ?? 0;
  const check = evaluate2d6Check({ dice: roll2d6(), mod, dc: opt.dc });
  ev.pickedIndex = optIndex;
  ev.mod = mod;
  ev.roll = check;
  return ev;
}

export function rerollLiveEventCheck(shift) {
  const ev = shift.activeEvent;
  if (!ev?.roll || shift.fateTokens <= 0) return false;
  shift.fateTokens--;
  const opt = ev.def.opts[ev.pickedIndex];
  ev.roll = evaluate2d6Check({ dice: roll2d6(), mod: ev.mod || 0, dc: opt.dc });
  return true;
}

export function confirmLiveEventCheck(shift) {
  const ev = shift.activeEvent;
  if (!ev?.roll) return null;
  const opt = ev.def.opts[ev.pickedIndex];
  const won = isDcSuccess(ev.roll.outcome);
  shift.activeEvent = null;
  const effects = won ? opt.reward : opt.penalty;
  const summary = { won, text: won ? opt.winText : opt.loseText, ingName: null };
  if (won) {
    shift.dcPassed++;
    if (effects.gold) {
      shift.earnedGold += effects.gold;
      shift.eventGold += effects.gold;
    }
    if (effects.rep) shift.repGain += effects.rep;
    if (effects.fever) shift.fever = Math.min(100, shift.fever + effects.fever);
    if (effects.calm) {
      for (const g of shift.queue) g.patience = Math.min(g.maxPatience, g.patience + effects.calm);
      for (const t of shift.tables) {
        if (t.state === 'ordering' || t.state === 'waiting')
          t.patience = Math.min(t.maxPatience, t.patience + effects.calm);
      }
    }
    if (effects.randIng) {
      const keys = Object.keys(INGREDIENTS);
      const picked = keys[Math.floor(rngFloat(shift, 'event-ing') * keys.length)] || 'wheat';
      shift.bonusIngredients[picked] = (shift.bonusIngredients[picked] || 0) + 1;
      summary.ingName = INGREDIENTS[picked]?.name || picked;
    }
    shift.completedByRole[opt.post] = (shift.completedByRole[opt.post] || 0) + 2;
  } else {
    if (effects.gold) {
      const delta = Math.max(-shift.earnedGold, effects.gold);
      shift.earnedGold += delta;
      shift.eventGold += delta;
    }
    if (effects.rep) shift.repGain = Math.max(0, shift.repGain + effects.rep);
    if (effects.patience) {
      for (const t of shift.tables) {
        if (t.state === 'ordering' || t.state === 'waiting')
          t.patience = Math.max(3, t.patience + effects.patience);
      }
    }
  }
  return summary;
}

export function pourLiveAle(shift) {
  if (shift.kegCd > 0) return null;
  const gold = 6 + (shift.facilities?.barrel || 0) * 3;
  shift.kegCd = 6;
  shift.earnedGold += gold;
  shift.tipGold += gold;
  const candidates = [
    ...shift.tables.filter((t) => t.state === 'ordering' || t.state === 'waiting'),
    ...shift.queue,
  ].sort((a, b) => a.patience - b.patience);
  if (candidates[0]) {
    candidates[0].patience = Math.min(candidates[0].maxPatience, candidates[0].patience + 7);
  }
  return { gold, targetName: candidates[0]?.patron?.name || null };
}

export function triggerLiveFever(shift) {
  if (shift.fever < 100 || shift.feverLeft > 0) return false;
  shift.fever = 0;
  shift.feverLeft = 10;
  return true;
}

function tryAutoTick(shift) {
  const tryRoll = (role, weight = 1) =>
    rngFloat(shift, role) * 100 < serviceAutoChance(shift.staffLevels?.[role] || 0) * weight;

  if (shift.queue.length && shift.tables.some((t) => t.unlocked && t.state === 'empty')) {
    if (tryRoll('front', 1.1)) {
      seatLiveGuest(shift, shift.queue[0].uid);
      shift.lastAutoProc = { role: 'front', note: '前台自动迎宾入座' };
      return;
    }
  }
  const orderingNormal = shift.tables.find(
    (t) => t.unlocked && t.state === 'ordering' && !t.patron?.vip,
  );
  if (orderingNormal && tryRoll('server', 1)) {
    const dish = pickGuestDish(shift, orderingNormal.patron);
    queueLiveOrder(shift, orderingNormal, dish, 1);
    shift.lastAutoProc = { role: 'server', note: `服务员自动接单「${dish.name}」` };
    return;
  }
  if (shift.plates.length && tryRoll('server', 1)) {
    const plate = shift.plates[0];
    serveLivePlate(shift, plate.uid);
    shift.lastAutoProc = { role: 'server', note: '服务员自动上菜' };
    return;
  }
  const payTable = shift.tables.find((t) => t.unlocked && t.state === 'pay');
  if (payTable && tryRoll('clean', 1.1)) {
    const res = collectLiveTablePay(shift, payTable.idx);
    shift.lastAutoProc = { role: 'clean', note: `保洁收银翻台 +${res?.gold || 0}G` };
  }
}

export function advanceLiveService(shift, rawSeconds) {
  const seconds = Math.min(0.25, Math.max(0, Number(rawSeconds) || 0));
  if (!seconds || isPaused(shift)) return;

  shift.elapsed = Math.min(shift.duration, shift.elapsed + seconds);
  if (shift.kegCd > 0) shift.kegCd = Math.max(0, shift.kegCd - seconds);
  if (shift.feverLeft > 0) shift.feverLeft = Math.max(0, shift.feverLeft - seconds);
  if (shift.comboTimer > 0) {
    shift.comboTimer = Math.max(0, shift.comboTimer - seconds);
    if (shift.comboTimer === 0) shift.combo = 0;
  }

  if (
    !shift.eventTriggered &&
    !shift.activeEvent &&
    shift.elapsed >= shift.duration * 0.35 &&
    shift.servedCount >= 1
  ) {
    shift.eventTriggered = true;
    const def =
      SERVICE_LIVE_EVENTS[Math.floor(rngFloat(shift, 'ev') * SERVICE_LIVE_EVENTS.length)] ||
      SERVICE_LIVE_EVENTS[0];
    shift.activeEvent = { def, ttl: 20, roll: null, pickedIndex: 0, mod: 0 };
    return;
  }

  if (
    shift.guestsSpawned < shift.maxGuests &&
    shift.elapsed >= shift.nextGuestAt &&
    shift.queue.length < 4 &&
    shift.elapsed < shift.duration - 4
  ) {
    spawnGuest(shift);
    shift.nextGuestAt = shift.elapsed + (shift.tutorial ? 5.5 : 4.2);
  }

  if (shift.feverLeft <= 0) {
    for (let i = shift.queue.length - 1; i >= 0; i--) {
      shift.queue[i].patience -= seconds;
      if (shift.queue[i].patience <= 0) {
        shift.queue.splice(i, 1);
        shift.leftAngry++;
      }
    }
  }

  for (const t of shift.tables) {
    if (!t.unlocked || t.state === 'empty') continue;
    if (t.state === 'eating') {
      t.eatTimer -= seconds;
      if (t.eatTimer <= 0) t.state = 'pay';
    } else if (t.state === 'ordering' || t.state === 'waiting') {
      if (shift.feverLeft <= 0) t.patience -= seconds;
      if (t.patience <= 0) {
        shift.orders = shift.orders.filter((o) => o.tableIdx !== t.idx);
        shift.plates = shift.plates.filter((p) => p.tableIdx !== t.idx);
        t.state = 'empty';
        t.patron = null;
        t.recipeId = null;
        shift.leftAngry++;
      }
    }
  }

  for (const s of shift.stoves) {
    if (!s.unlocked) continue;
    if (s.status === 'cooking' && s.ticket) {
      const feverBoost = shift.feverLeft > 0 ? 1.4 : 1;
      s.progress = Math.min(1, s.progress + (seconds * feverBoost) / s.cookSec);
      if (s.progress >= 1) {
        const dish = SERVICE_CATALOG_MAP[s.ticket.recipeId];
        if (dish?.kind === 'signature') {
          s.status = 'dc_ready';
          s.dcWait = 9;
        } else {
          pushReadyPlate(shift, s.ticket, 'normal');
          s.status = 'idle';
          s.ticket = null;
          s.progress = 0;
          assignOrderToStove(shift);
        }
      }
    } else if (s.status === 'dc_ready' && s.ticket) {
      s.dcWait -= seconds;
      if (s.dcWait <= 0) {
        pushReadyPlate(shift, s.ticket, 'normal');
        s.status = 'idle';
        s.ticket = null;
        s.progress = 0;
        assignOrderToStove(shift);
      }
    }
  }

  shift.autoTimer -= seconds;
  if (shift.autoTimer <= 0) {
    shift.autoTimer = 2.5;
    tryAutoTick(shift);
  }

  const floorBusy =
    shift.queue.length > 0 ||
    shift.tables.some((t) => t.unlocked && t.state !== 'empty') ||
    shift.stoves.some((s) => s.status !== 'idle') ||
    shift.plates.length > 0;
  if (
    (shift.elapsed >= shift.duration && !floorBusy) ||
    (shift.guestsSpawned >= shift.maxGuests && !floorBusy)
  ) {
    shift.finished = true;
  }
}

export function settleLiveServiceShift(library, shift) {
  shift.finished = true;
  if (shift.settled) {
    return {
      reputationChange: 0,
      trained: [],
      totalGold: shift.earnedGold,
      bonusIngredients: shift.bonusIngredients || {},
    };
  }
  shift.settled = true;
  library.inventory.gold = Math.min(
    999999999,
    (library.inventory.gold || 0) + (shift.earnedGold || 0),
  );
  for (const [id, amount] of Object.entries(shift.pantry || {})) {
    if (Object.hasOwn(INGREDIENTS, id)) library.dining.inventory[id] = Math.max(0, amount);
  }
  for (const [id, gain] of Object.entries(shift.bonusIngredients || {})) {
    if (Object.hasOwn(INGREDIENTS, id) && gain > 0) {
      library.dining.inventory[id] = Math.min(9999, (library.dining.inventory[id] || 0) + gain);
    }
  }
  const growth = library.daily.serviceGrowth;
  const previousRep = growth.reputation;
  const { trained } = settleServiceGrowth(growth, {
    staff: shift.staff,
    completedByRole: shift.completedByRole,
    served: shift.servedCount,
    missed: shift.leftAngry,
    special: null,
  });
  growth.reputation = Math.min(
    5000,
    Math.max(0, previousRep + Math.max(shift.repGain || 0, shift.servedCount)),
  );
  growth.specialties = { ...(growth.specialties || {}), ...(shift.specialtiesSnapshot || {}) };

  const seenIds = new Set();
  for (const id of Object.values(shift.staff || {})) {
    if (!id || seenIds.has(id)) continue;
    seenIds.add(id);
    const rel = library.relationships?.[id];
    if (rel) rel.affection = Math.min(100, (rel.affection || 0) + 2);
  }
  return {
    reputationChange: growth.reputation - previousRep,
    trained,
    totalGold: shift.earnedGold || 0,
    bonusIngredients: shift.bonusIngredients || {},
  };
}
