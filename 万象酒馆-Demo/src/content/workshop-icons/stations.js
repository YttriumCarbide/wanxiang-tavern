/** 建筑设施（group: station）。 */
export const STATION_ICONS = [
  {
    id: 'workbench',
    name: '工作台',
    group: 'station',
    tint: 'earth',
    tags: ['工作台', '构件台', '木工台', '手工台', '作坊'],
    art: `
      <ellipse class="sh" cx="32" cy="58" rx="22" ry="3.5"/>
      <rect class="wood" x="14" y="32" width="6" height="24"/>
      <rect class="wood" x="44" y="32" width="6" height="24"/>
      <rect class="wood-l" x="14" y="42" width="36" height="5"/>
      <rect x="8" y="24" width="48" height="9" rx="2"/>
      <rect class="l n" x="11" y="26" width="42" height="3"/>
      <path class="iron" d="M22 14 L34 14 L32 24 L24 24 Z"/>
      <rect class="wood" x="26" y="10" width="4" height="14"/>
    `,
  },
  {
    id: 'desk',
    name: '绘图桌',
    group: 'station',
    tint: 'azure',
    tags: ['绘图台', '书桌', '设计台', '案台', '制图'],
    art: `
      <ellipse class="sh" cx="32" cy="58" rx="22" ry="3.5"/>
      <rect class="wood" x="12" y="34" width="6" height="22"/>
      <rect class="wood" x="46" y="34" width="6" height="22"/>
      <polygon class="wood-l" points="8,32 56,22 56,34 8,36"/>
      <polygon d="M14,29 48,21 52,29 18,34" points="14,29 48,21 52,29 18,34"/>
      <path class="line thin" d="M22 28 L44 24"/>
      <circle class="l" cx="44" cy="15" r="4"/>
    `,
  },
  {
    id: 'anvil',
    name: '铁砧',
    group: 'station',
    tint: 'ash',
    tags: ['铁砧', '锻造台', '助熔工台', '打铁', '金工'],
    art: `
      <ellipse class="sh" cx="32" cy="58" rx="22" ry="3.5"/>
      <rect class="wood" x="16" y="42" width="32" height="14" rx="2"/>
      <path d="M18 42 L24 32 L40 32 L46 42 Z"/>
      <path class="l" d="M8 22 L22 18 L54 18 L50 28 L38 28 L38 32 L24 32 L24 26 Z"/>
      <path class="hi" d="M22 20 L48 20 L46 23 L22 23 Z"/>
    `,
  },
  {
    id: 'furnace',
    name: '熔炉',
    group: 'station',
    tint: 'ember',
    tags: ['熔炉', '精炼炉', '高炉', '冶炼', '火炉'],
    art: `
      <ellipse class="sh" cx="32" cy="58" rx="22" ry="3.5"/>
      <rect class="stone" x="24" y="8" width="16" height="12" rx="2"/>
      <path class="stone" d="M12 56 L16 18 L48 18 L52 56 Z"/>
      <rect class="iron" x="14" y="18" width="36" height="5" rx="2"/>
      <path class="ink" d="M20 56 L20 36 A12 12 0 0 1 44 36 L44 56 Z"/>
      <path d="M24 56 C22 44, 28 36, 32 32 C36 36, 42 44, 40 56 Z"/>
      <path class="l n" d="M28 56 C27 48, 30 42, 32 39 C34 42, 37 48, 36 56 Z"/>
    `,
  },
  {
    id: 'kiln',
    name: '窑炉',
    group: 'station',
    tint: 'copper',
    tags: ['窑', '砖窑', '陶窑', '炭窑', '焙烧'],
    art: `
      <ellipse class="sh" cx="32" cy="58" rx="23" ry="3.5"/>
      <path d="M10 54 A22 26 0 0 1 54 54 Z"/>
      <path class="l n" d="M16 48 A18 20 0 0 1 32 26 L32 48 Z"/>
      <rect x="27" y="10" width="10" height="12" rx="2"/>
      <path class="ink" d="M22 54 L22 40 A10 10 0 0 1 42 40 L42 54 Z"/>
      <ellipse class="fire" cx="32" cy="48" rx="6" ry="5"/>
      <ellipse class="fire-l n" cx="32" cy="49" rx="3" ry="3"/>
    `,
  },
  {
    id: 'well',
    name: '水井',
    group: 'station',
    tint: 'azure',
    tags: ['井', '净泉井', '雾晶井', '水井', '泉眼'],
    art: `
      <ellipse class="sh" cx="32" cy="58" rx="22" ry="3.5"/>
      <rect class="wood" x="16" y="18" width="5" height="22"/>
      <rect class="wood" x="43" y="18" width="5" height="22"/>
      <polygon points="8,20 32,8 56,20"/>
      <polygon class="l n" points="14,19 32,10 32,19"/>
      <rect class="stone" x="12" y="38" width="40" height="18" rx="3"/>
      <ellipse cx="32" cy="38" rx="16" ry="4"/>
      <ellipse class="l n" cx="32" cy="38" rx="11" ry="2.2"/>
    `,
  },
  {
    id: 'field',
    name: '田圃',
    group: 'station',
    tint: 'wheat',
    tags: ['麦圃', '农田', '菜园', '种植', '田垄'],
    art: `
      <ellipse class="sh" cx="32" cy="58" rx="23" ry="3.5"/>
      <rect class="wood" x="10" y="34" width="44" height="20" rx="3"/>
      <path class="wood-l" d="M14 38 L50 38 L50 50 L14 50 Z"/>
      <path d="M20 38 L20 18 M32 38 L32 14 M44 38 L44 18"/>
      <ellipse class="l" cx="20" cy="20" rx="4" ry="7"/>
      <ellipse class="l" cx="32" cy="16" rx="4.5" ry="8"/>
      <ellipse class="l" cx="44" cy="20" rx="4" ry="7"/>
    `,
  },
  {
    id: 'greenhouse',
    name: '温室',
    group: 'station',
    tint: 'jade',
    tags: ['温室', '花房', '玻璃房', '育苗房'],
    art: `
      <ellipse class="sh" cx="32" cy="58" rx="23" ry="3.5"/>
      <polygon class="glass" points="12,30 32,12 52,30 52,54 12,54"/>
      <path class="line" d="M32 12 L32 54 M12 30 L52 30"/>
      <path d="M32 48 C22 46, 20 34, 30 32 C28 24, 36 22, 34 32 C44 34, 42 46, 32 48 Z"/>
      <rect class="wood" x="10" y="50" width="44" height="6" rx="2"/>
    `,
  },
  {
    id: 'windmill',
    name: '风车磨坊',
    group: 'station',
    tint: 'wheat',
    tags: ['风车', '磨坊', '碾磨', '风力'],
    art: `
      <ellipse class="sh" cx="32" cy="58" rx="20" ry="3.5"/>
      <polygon class="stone" points="20,56 24,24 40,24 44,56"/>
      <polygon class="d" points="18,24 32,14 46,24"/>
      <polygon class="l" points="32,26 12,8 18,6 34,22"/>
      <polygon class="l" points="32,26 52,44 46,46 30,30"/>
      <polygon class="l" points="32,26 50,6 52,12 36,28"/>
      <polygon class="l" points="32,26 14,46 12,40 28,24"/>
      <circle class="wood" cx="32" cy="26" r="4"/>
    `,
  },
  {
    id: 'waterwheel',
    name: '水车',
    group: 'station',
    tint: 'azure',
    tags: ['水车', '水力', '水磨', '汲水'],
    art: `
      <ellipse class="sh" cx="32" cy="58" rx="22" ry="3.5"/>
      <circle class="wood" cx="32" cy="28" r="18"/>
      <circle class="ink" cx="32" cy="28" r="11"/>
      <path class="wood-l" d="M32 10 L32 46 M14 28 L50 28 M19 15 L45 41 M45 15 L19 41"/>
      <circle class="iron" cx="32" cy="28" r="4"/>
      <path d="M8 46 Q20 40 32 46 Q44 52 56 46 L56 56 L8 56 Z"/>
      <path class="l n" d="M12 49 Q22 45 32 49 Q42 53 52 49 L52 53 L12 53 Z"/>
    `,
  },
  {
    id: 'vat',
    name: '发酵池',
    group: 'station',
    tint: 'amber',
    tags: ['麦芽坊', '堆酿池', '发酵桶', '大桶', '酒槽'],
    art: `
      <ellipse class="sh" cx="32" cy="58" rx="22" ry="3.5"/>
      <path class="wood" d="M12 22 L52 22 L48 54 L16 54 Z"/>
      <rect class="iron" x="12" y="30" width="40" height="5"/>
      <rect class="iron" x="14" y="43" width="36" height="5"/>
      <ellipse cx="32" cy="22" rx="20" ry="6"/>
      <ellipse class="l n" cx="32" cy="22" rx="15" ry="4"/>
      <circle class="hi" cx="26" cy="21" r="2.5"/>
      <circle class="hi" cx="37" cy="23" r="2"/>
    `,
  },
  {
    id: 'cauldron',
    name: '坩埚',
    group: 'station',
    tint: 'violet',
    tags: ['坩埚', '澄清釜', '封桶胶坊', '大锅', '熬制'],
    art: `
      <ellipse class="sh" cx="32" cy="58" rx="20" ry="3.5"/>
      <path class="iron" d="M18 48 L14 56 L20 56 L23 50 Z"/>
      <path class="iron" d="M46 48 L50 56 L44 56 L41 50 Z"/>
      <path class="iron" d="M14 22 C10 38, 16 52, 32 52 C48 52, 54 38, 50 22 Z"/>
      <rect class="iron-l" x="12" y="18" width="40" height="6" rx="3"/>
      <ellipse cx="32" cy="20" rx="16" ry="4"/>
      <circle class="l" cx="26" cy="14" r="4"/>
      <circle class="l" cx="37" cy="12" r="3"/>
    `,
  },
  {
    id: 'still',
    name: '蒸馏器',
    group: 'station',
    tint: 'copper',
    tags: ['蒸馏器', '萃取台', '凝晶萃取台', '琥珀萃取台', '提纯'],
    art: `
      <ellipse class="sh" cx="32" cy="58" rx="22" ry="3.5"/>
      <path d="M12 42 C12 28, 34 28, 34 42 L34 54 L12 54 Z"/>
      <path class="l n" d="M16 42 C16 33, 25 33, 25 42 L25 51 L16 51 Z"/>
      <path d="M20 30 L20 18 Q20 12 28 12 L46 18 L46 34 L40 34 L40 22 L26 18 L26 30 Z"/>
      <rect class="glass" x="36" y="34" width="16" height="20" rx="4"/>
      <rect class="l" x="39" y="42" width="10" height="10" rx="2"/>
    `,
  },
  {
    id: 'press',
    name: '压榨机',
    group: 'station',
    tint: 'earth',
    tags: ['压榨机', '橡木作坊', '榨汁', '冲压', '成型'],
    art: `
      <ellipse class="sh" cx="32" cy="58" rx="22" ry="3.5"/>
      <rect class="wood" x="12" y="12" width="6" height="44"/>
      <rect class="wood" x="46" y="12" width="6" height="44"/>
      <rect class="wood-l" x="10" y="10" width="44" height="7" rx="2"/>
      <rect class="iron" x="29" y="17" width="6" height="14"/>
      <rect class="iron-l" x="20" y="28" width="24" height="6" rx="1"/>
      <rect x="18" y="34" width="28" height="18" rx="2"/>
      <rect class="l n" x="22" y="37" width="10" height="12"/>
    `,
  },
  {
    id: 'mine',
    name: '矿洞',
    group: 'station',
    tint: 'ash',
    tags: ['矿洞', '异材采集站', '矿场', '采石场', '坑道'],
    art: `
      <ellipse class="sh" cx="32" cy="58" rx="24" ry="3.5"/>
      <path class="stone" d="M6 54 L14 16 L32 10 L50 16 L58 54 Z"/>
      <path class="ink" d="M18 54 L20 26 L44 26 L46 54 Z"/>
      <rect class="wood" x="16" y="22" width="32" height="6" rx="1"/>
      <rect class="wood" x="17" y="26" width="5" height="28"/>
      <rect class="wood" x="42" y="26" width="5" height="28"/>
      <polygon class="l" points="28,50 32,36 37,50"/>
      <polygon points="35,52 40,40 43,52"/>
    `,
  },
  {
    id: 'drill',
    name: '钻机',
    group: 'station',
    tint: 'copper',
    tags: ['钻机', '导管轧机', '轧机', '机床', '穿孔'],
    art: `
      <ellipse class="sh" cx="32" cy="58" rx="22" ry="3.5"/>
      <rect class="iron" x="12" y="48" width="40" height="8" rx="2"/>
      <rect class="iron" x="14" y="14" width="8" height="34"/>
      <rect x="22" y="14" width="26" height="14" rx="3"/>
      <rect class="l n" x="25" y="17" width="18" height="5"/>
      <polygon class="iron-l" points="30,28 42,28 36,48"/>
      <path class="line thin" d="M32 33 L40 36 M33 40 L39 42"/>
    `,
  },
  {
    id: 'net',
    name: '捕集网',
    group: 'station',
    tint: 'gold',
    tags: ['捕集网', '星火捕集网', '网', '捕星', '收集网'],
    art: `
      <ellipse class="sh" cx="32" cy="58" rx="20" ry="3.5"/>
      <rect class="wood" x="12" y="16" width="5" height="40" rx="2"/>
      <rect class="wood" x="47" y="16" width="5" height="40" rx="2"/>
      <path class="glass" d="M17 20 Q32 28 47 20 L45 46 Q32 52 19 46 Z"/>
      <path class="line thin" d="M25 22 L23 47 M32 24 L32 49 M39 22 L41 47 M18 32 L46 32 M19 40 L45 40"/>
      <path class="l" d="M32 18 L35 26 L43 29 L35 32 L32 40 L29 32 L21 29 L29 26 Z"/>
    `,
  },
  {
    id: 'collector',
    name: '收集塔',
    group: 'station',
    tint: 'azure',
    tags: ['收集台', '星尘收集台', '聚能塔', '感应塔', '信标'],
    art: `
      <ellipse class="sh" cx="32" cy="58" rx="20" ry="3.5"/>
      <polygon class="stone" points="16,56 24,30 40,30 48,56"/>
      <rect class="iron" x="20" y="26" width="24" height="6" rx="2"/>
      <polygon d="M32,6 44,20 32,32 20,20" points="32,6 44,20 32,32 20,20"/>
      <polygon class="l n" points="32,10 39,20 32,28 25,20"/>
      <circle class="hi" cx="32" cy="19" r="3"/>
    `,
  },
  {
    id: 'sorter',
    name: '分选筛',
    group: 'station',
    tint: 'ash',
    tags: ['分选台', '晶砂分选台', '筛床', '过滤台', '洗矿'],
    art: `
      <ellipse class="sh" cx="32" cy="58" rx="22" ry="3.5"/>
      <rect class="wood" x="12" y="28" width="5" height="28"/>
      <rect class="wood" x="47" y="34" width="5" height="22"/>
      <polygon class="wood-l" points="10,20 54,28 52,38 8,30"/>
      <circle class="l" cx="22" cy="22" r="4"/>
      <circle cx="32" cy="24" r="4.5"/>
      <circle class="l" cx="42" cy="26" r="3.5"/>
      <circle cx="28" cy="48" r="3"/>
      <circle class="l" cx="38" cy="50" r="3"/>
    `,
  },
  {
    id: 'conveyor',
    name: '传送带',
    group: 'station',
    tint: 'ash',
    tags: ['传送带', '流水线', '运输带', '物流'],
    art: `
      <ellipse class="sh" cx="32" cy="56" rx="24" ry="3.5"/>
      <rect class="iron" x="8" y="34" width="48" height="14" rx="7"/>
      <circle class="iron-l" cx="16" cy="41" r="4"/>
      <circle class="iron-l" cx="32" cy="41" r="4"/>
      <circle class="iron-l" cx="48" cy="41" r="4"/>
      <rect x="16" y="18" width="14" height="16" rx="2"/>
      <rect class="l" x="34" y="22" width="12" height="12" rx="2"/>
    `,
  },
  {
    id: 'tower',
    name: '观星塔',
    group: 'station',
    tint: 'violet',
    tags: ['观星塔', '天文台', '高塔', '尖塔', '瞭望'],
    art: `
      <ellipse class="sh" cx="32" cy="58" rx="20" ry="3.5"/>
      <polygon class="stone" points="18,56 22,28 42,28 46,56"/>
      <path d="M18 28 A14 14 0 0 1 46 28 Z"/>
      <path class="l n" d="M22 26 A10 10 0 0 1 32 16 L32 26 Z"/>
      <rect class="iron" x="36" y="12" width="14" height="6" rx="2" transform="rotate(-25 43 15)"/>
      <rect class="ink" x="28" y="38" width="8" height="12" rx="4"/>
    `,
  },
  {
    id: 'warehouse',
    name: '仓库',
    group: 'station',
    tint: 'earth',
    tags: ['仓库', '库房', '货栈', '粮仓', '储藏室'],
    art: `
      <ellipse class="sh" cx="32" cy="58" rx="24" ry="3.5"/>
      <polygon class="stone" points="10,26 32,12 54,26 54,56 10,56"/>
      <polygon d="M6,28 32,10 58,28 54,32 32,17 10,32" points="6,28 32,10 58,28 54,32 32,17 10,32"/>
      <rect class="wood" x="20" y="32" width="24" height="24" rx="2"/>
      <path class="line" d="M32 32 L32 56 M20 44 L44 44"/>
    `,
  },
  {
    id: 'cart',
    name: '推车',
    group: 'station',
    tint: 'earth',
    tags: ['矿车', '推车', '板车', '货车', '运载'],
    art: `
      <ellipse class="sh" cx="32" cy="58" rx="22" ry="3.5"/>
      <polygon class="l" points="16,26 24,14 34,24 44,16 50,26"/>
      <polygon d="M10,24 54,24 48,44 16,44" points="10,24 54,24 48,44 16,44"/>
      <rect class="iron" x="10" y="22" width="44" height="5" rx="2"/>
      <circle class="iron" cx="22" cy="50" r="6"/>
      <circle class="iron" cx="42" cy="50" r="6"/>
      <circle class="ink" cx="22" cy="50" r="2"/>
      <circle class="ink" cx="42" cy="50" r="2"/>
    `,
  },
  {
    id: 'shelf',
    name: '货架',
    group: 'station',
    tint: 'earth',
    tags: ['货架', '酒架', '陈列架', '书架', '展示架'],
    art: `
      <ellipse class="sh" cx="32" cy="58" rx="22" ry="3.5"/>
      <rect class="wood" x="12" y="10" width="5" height="46"/>
      <rect class="wood" x="47" y="10" width="5" height="46"/>
      <rect class="wood-l" x="10" y="26" width="44" height="5"/>
      <rect class="wood-l" x="10" y="46" width="44" height="5"/>
      <rect x="19" y="14" width="10" height="12" rx="2"/>
      <circle class="l" cx="39" cy="20" r="6"/>
      <rect class="l" x="19" y="34" width="12" height="12" rx="2"/>
      <rect x="35" y="32" width="9" height="14" rx="2"/>
    `,
  },
  {
    id: 'altar',
    name: '法阵台',
    group: 'station',
    tint: 'teal',
    tags: ['封装台', '星火封装台', '祭坛', '法阵台', '仪式台'],
    art: `
      <ellipse class="sh" cx="32" cy="58" rx="22" ry="3.5"/>
      <rect class="stone" x="10" y="48" width="44" height="8" rx="2"/>
      <rect class="stone-l" x="16" y="40" width="32" height="8" rx="2"/>
      <rect class="stone" x="14" y="22" width="6" height="18"/>
      <rect class="stone" x="44" y="22" width="6" height="18"/>
      <circle cx="32" cy="24" r="10"/>
      <circle class="l n" cx="32" cy="24" r="6"/>
      <circle class="hi" cx="30" cy="22" r="2.5"/>
    `,
  },
  {
    id: 'pump',
    name: '抽水泵',
    group: 'station',
    tint: 'azure',
    tags: ['泵', '水泵', '增压', '阀站', '导流'],
    art: `
      <ellipse class="sh" cx="32" cy="58" rx="20" ry="3.5"/>
      <rect class="iron" x="18" y="48" width="28" height="8" rx="2"/>
      <rect x="22" y="22" width="20" height="26" rx="3"/>
      <rect class="l n" x="25" y="25" width="6" height="20"/>
      <path class="iron" d="M42 28 L52 28 L52 38 L46 38 L46 34 L42 34 Z"/>
      <path class="wood" d="M30 22 L30 12 L14 8 L14 14 L50 18 L50 12"/>
    `,
  },
  {
    id: 'loom',
    name: '织机',
    group: 'station',
    tint: 'rose',
    tags: ['织机', '纺车', '纺织', '织布'],
    art: `
      <ellipse class="sh" cx="32" cy="58" rx="22" ry="3.5"/>
      <rect class="wood" x="12" y="10" width="6" height="46"/>
      <rect class="wood" x="46" y="10" width="6" height="46"/>
      <rect class="wood-l" x="10" y="12" width="44" height="6" rx="2"/>
      <rect class="wood-l" x="10" y="46" width="44" height="6" rx="2"/>
      <rect x="20" y="18" width="24" height="28"/>
      <rect class="l n" x="23" y="22" width="18" height="10"/>
      <rect class="wood" x="16" y="30" width="32" height="5" rx="2"/>
    `,
  },
  {
    id: 'lab',
    name: '炼金台',
    group: 'station',
    tint: 'teal',
    tags: ['调酿桌', '析香调配台', '实验台', '炼金台', '药剂台'],
    art: `
      <ellipse class="sh" cx="32" cy="58" rx="23" ry="3.5"/>
      <rect class="wood" x="8" y="42" width="48" height="7" rx="2"/>
      <rect class="wood" x="12" y="49" width="6" height="7"/>
      <rect class="wood" x="46" y="49" width="6" height="7"/>
      <path class="glass" d="M18 16 L24 16 L24 24 L32 38 L10 38 L18 24 Z"/>
      <path d="M13 31 L29 31 L31 36 L11 36 Z"/>
      <rect class="glass" x="38" y="18" width="12" height="24" rx="5"/>
      <rect class="l" x="40" y="28" width="8" height="12" rx="3"/>
    `,
  },
  {
    id: 'nursery',
    name: '苗床',
    group: 'station',
    tint: 'jade',
    tags: ['枝芽温床', '苗床', '育苗盆', '温床', '花盆'],
    art: `
      <ellipse class="sh" cx="32" cy="58" rx="22" ry="3.5"/>
      <polygon class="wood" points="10,36 54,36 48,54 16,54"/>
      <rect class="wood-l" x="8" y="32" width="48" height="6" rx="2"/>
      <rect class="iron" x="30" y="18" width="4" height="16"/>
      <path d="M32 30 C20 30, 16 18, 28 16 C30 22, 32 26, 32 30 Z"/>
      <path class="l" d="M32 26 C44 26, 48 14, 36 12 C34 18, 32 22, 32 26 Z"/>
    `,
  },
  {
    id: 'beehive',
    name: '蜂箱',
    group: 'station',
    tint: 'amber',
    tags: ['蜂箱', '蜂房', '养蜂', '蜜源'],
    art: `
      <ellipse class="sh" cx="32" cy="58" rx="20" ry="3.5"/>
      <rect class="wood" x="20" y="48" width="5" height="8"/>
      <rect class="wood" x="39" y="48" width="5" height="8"/>
      <ellipse cx="32" cy="44" rx="20" ry="6"/>
      <ellipse class="l" cx="32" cy="34" rx="18" ry="6"/>
      <ellipse cx="32" cy="24" rx="15" ry="6"/>
      <ellipse class="l" cx="32" cy="15" rx="10" ry="5"/>
      <circle class="ink" cx="32" cy="36" r="4"/>
    `,
  },
  {
    id: 'tent',
    name: '帐篷',
    group: 'station',
    tint: 'ruby',
    tags: ['帐篷', '摊位', '营帐', '集市', '商铺'],
    art: `
      <ellipse class="sh" cx="32" cy="58" rx="24" ry="3.5"/>
      <polygon d="M6,52 32,12 58,52" points="6,52 32,12 58,52"/>
      <polygon class="l n" points="10,50 32,16 32,50"/>
      <polygon class="ink" points="24,52 32,32 40,52"/>
      <path class="wood" d="M32 8 L32 16"/>
      <polygon class="l" points="32,8 44,11 32,15"/>
    `,
  },
  {
    id: 'assembler',
    name: '装配架',
    group: 'station',
    tint: 'gold',
    tags: ['机芯装配台', '回响装配架', '组装台', '机械臂', '龙门架'],
    art: `
      <ellipse class="sh" cx="32" cy="58" rx="22" ry="3.5"/>
      <rect class="iron" x="10" y="10" width="6" height="46"/>
      <rect class="iron" x="48" y="10" width="6" height="46"/>
      <rect class="iron-l" x="8" y="10" width="48" height="6" rx="2"/>
      <rect class="iron" x="29" y="16" width="6" height="10"/>
      <path class="iron-l" d="M22 26 L42 26 L44 34 L38 34 L38 30 L26 30 L26 34 L20 34 Z"/>
      <circle cx="32" cy="40" r="9"/>
      <circle class="l n" cx="32" cy="40" r="5"/>
      <rect class="iron" x="10" y="50" width="44" height="6" rx="2"/>
    `,
  },
];
