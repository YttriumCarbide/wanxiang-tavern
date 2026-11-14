/** 容器酒饮、食材与星辉能量（group: vessel / food / arcane）。 */
export const SUPPLY_ICONS = [
  {
    id: 'barrel',
    name: '酒桶',
    group: 'vessel',
    tint: 'earth',
    tags: ['酒桶', '木桶', '橡木桶', '陈酿', '容器'],
    art: `
      <ellipse class="sh" cx="32" cy="57" rx="18" ry="3.5"/>
      <path d="M18 12 Q10 32 18 52 L46 52 Q54 32 46 12 Z"/>
      <path class="l n" d="M24 14 Q19 32 24 50 L31 50 Q27 32 31 14 Z"/>
      <ellipse class="l" cx="32" cy="12" rx="14" ry="4"/>
      <path class="iron" d="M14 21 L50 21 L51 26 L13 26 Z"/>
      <path class="iron" d="M13 38 L51 38 L50 43 L14 43 Z"/>
      <circle class="d" cx="32" cy="32" r="3"/>
    `,
  },
  {
    id: 'crate',
    name: '木箱',
    group: 'vessel',
    tint: 'earth',
    tags: ['木箱', '货箱', '箱子', '板条箱', '仓储'],
    art: `
      <ellipse class="sh" cx="32" cy="57" rx="20" ry="3.5"/>
      <rect x="12" y="14" width="40" height="40" rx="3"/>
      <rect class="l" x="17" y="19" width="30" height="30" rx="1"/>
      <path class="d" d="M17 44 L44 19 L47 19 L47 22 L20 49 L17 49 Z"/>
      <rect class="d" x="12" y="31" width="40" height="6"/>
      <circle class="iron" cx="16" cy="18" r="1.8"/>
      <circle class="iron" cx="48" cy="18" r="1.8"/>
      <circle class="iron" cx="16" cy="50" r="1.8"/>
      <circle class="iron" cx="48" cy="50" r="1.8"/>
    `,
  },
  {
    id: 'sack',
    name: '麻袋',
    group: 'vessel',
    tint: 'wheat',
    tags: ['麻袋', '粮袋', '袋子', '面粉袋'],
    art: `
      <ellipse class="sh" cx="32" cy="57" rx="19" ry="3.5"/>
      <path d="M24 12 L28 19 L36 19 L40 12 L34 14 L32 10 L30 14 Z"/>
      <path d="M22 20 Q11 30 14 46 Q16 54 32 54 Q48 54 50 46 Q53 30 42 20 Z"/>
      <path class="l n" d="M24 23 Q17 31 19 44 Q21 49 29 50 Q24 37 28 23 Z"/>
      <rect class="wood" x="21" y="18" width="22" height="5" rx="2.5"/>
      <path class="hi" d="M22 28 Q19 35 21 42 L24 41 Q22 35 25 29 Z"/>
    `,
  },
  {
    id: 'pouch',
    name: '小布袋',
    group: 'vessel',
    tint: 'rose',
    tags: ['布袋', '香囊', '钱袋', '锦囊', '小袋'],
    art: `
      <ellipse class="sh" cx="32" cy="57" rx="16" ry="3.5"/>
      <path class="l" d="M23 14 L27 22 L37 22 L41 14 L35 16 L32 11 L29 16 Z"/>
      <path d="M24 22 C13 27, 13 48, 24 52 L40 52 C51 48, 51 27, 40 22 Z"/>
      <path class="l n" d="M25 25 C19 29, 19 45, 26 49 L31 49 C25 43, 25 31, 29 25 Z"/>
      <rect class="wood-l" x="22" y="20" width="20" height="4" rx="2"/>
      <circle class="hi" cx="25" cy="34" r="3"/>
    `,
  },
  {
    id: 'jar',
    name: '陶罐',
    group: 'vessel',
    tint: 'earth',
    tags: ['陶罐', '酒坛', '陈酿引子', '罐子', '密封罐'],
    art: `
      <ellipse class="sh" cx="32" cy="57" rx="18" ry="3.5"/>
      <path d="M21 20 C11 27, 12 47, 22 53 L42 53 C52 47, 53 27, 43 20 Z"/>
      <path class="l n" d="M23 23 C17 29, 17 44, 24 50 L29 50 C23 43, 23 30, 28 23 Z"/>
      <rect class="d" x="20" y="15" width="24" height="6" rx="2"/>
      <path class="l" d="M18 11 L46 11 L43 17 L21 17 Z"/>
      <rect class="l" x="25" y="31" width="14" height="12" rx="2"/>
      <path class="hi" d="M21 28 L24 28 L23 38 L20 38 Z"/>
    `,
  },
  {
    id: 'bottle',
    name: '酒瓶',
    group: 'vessel',
    tint: 'jade',
    tags: ['酒瓶', '瓶子', '佳酿', '玻璃瓶'],
    art: `
      <ellipse class="sh" cx="32" cy="57" rx="15" ry="3.5"/>
      <rect class="wood" x="28" y="7" width="8" height="6" rx="1.5"/>
      <path class="glass" d="M27 12 L37 12 L38 22 L46 30 L46 53 L18 53 L18 30 L26 22 Z"/>
      <path d="M20 33 L44 33 L44 51 L20 51 Z"/>
      <rect class="l" x="23" y="36" width="18" height="10" rx="1.5"/>
      <path class="hi" d="M21 29 L24 29 L24 49 L21 49 Z"/>
    `,
  },
  {
    id: 'flask',
    name: '烧瓶',
    group: 'vessel',
    tint: 'azure',
    tags: ['烧瓶', '澄清液', '净化液', '药剂', '琥珀净化液'],
    art: `
      <ellipse class="sh" cx="32" cy="57" rx="18" ry="3.5"/>
      <rect class="wood" x="27" y="8" width="10" height="6" rx="2"/>
      <path class="glass" d="M26 13 L38 13 L38 24 L50 45 A6 6 0 0 1 45 54 L19 54 A6 6 0 0 1 14 45 L26 24 Z"/>
      <path d="M21 36 L43 36 L48 45 A4 4 0 0 1 44 51 L20 51 A4 4 0 0 1 16 45 Z"/>
      <ellipse class="l" cx="32" cy="36" rx="11" ry="3"/>
      <path class="hi" d="M25 28 L28 28 L21 44 L18 43 Z"/>
    `,
  },
  {
    id: 'vial',
    name: '试管',
    group: 'vessel',
    tint: 'violet',
    tags: ['试管', '精华', '麦芽精华', '析香液', '小瓶', '试剂'],
    art: `
      <ellipse class="sh" cx="32" cy="57" rx="14" ry="3.5"/>
      <rect class="wood" x="25" y="8" width="14" height="6" rx="2"/>
      <rect class="iron" x="23" y="13" width="18" height="4" rx="2"/>
      <path class="glass" d="M24 17 L40 17 L40 44 A8 8 0 0 1 24 44 Z"/>
      <path d="M26 28 L38 28 L38 44 A6 6 0 0 1 26 44 Z"/>
      <ellipse class="l" cx="32" cy="28" rx="6" ry="2"/>
      <path class="hi" d="M27 20 L30 20 L30 45 L27 45 Z"/>
    `,
  },
  {
    id: 'mug',
    name: '啤酒杯',
    group: 'vessel',
    tint: 'amber',
    tags: ['酒杯', '啤酒杯', '麦酒', '木杯', '饮品'],
    art: `
      <ellipse class="sh" cx="30" cy="57" rx="18" ry="3.5"/>
      <path class="line" d="M44 26 L52 26 A5 5 0 0 1 57 31 L57 41 A5 5 0 0 1 52 46 L44 46"/>
      <rect class="glass" x="14" y="20" width="30" height="34" rx="4"/>
      <rect x="17" y="24" width="24" height="27" rx="2"/>
      <path class="l n" d="M19 26 L25 26 L25 49 L19 49 Z"/>
      <path class="hi" d="M13 18 Q13 11 21 13 Q26 8 33 12 Q41 9 44 16 Q47 22 41 23 L16 23 Q12 22 13 18 Z"/>
      <path class="line" d="M13 18 Q13 11 21 13 Q26 8 33 12 Q41 9 44 16 Q47 22 41 23 L16 23 Z"/>
    `,
  },
  {
    id: 'goblet',
    name: '高脚杯',
    group: 'vessel',
    tint: 'ruby',
    tags: ['高脚杯', '圣杯', '葡萄酒', '酒盅', '品酒'],
    art: `
      <ellipse class="sh" cx="32" cy="57" rx="16" ry="3.5"/>
      <path class="iron-l" d="M20 52 L44 52 L40 48 L35 48 L35 36 L29 36 L29 48 L24 48 Z"/>
      <path class="glass" d="M16 12 L48 12 Q48 36 32 36 Q16 36 16 12 Z"/>
      <path d="M19 19 L45 19 Q44 33 32 33 Q20 33 19 19 Z"/>
      <ellipse class="l" cx="32" cy="19" rx="13" ry="3"/>
      <path class="hi" d="M21 15 L25 15 Q25 27 29 30 L26 31 Q21 27 21 15 Z"/>
    `,
  },
  {
    id: 'bucket',
    name: '水桶',
    group: 'vessel',
    tint: 'azure',
    tags: ['水桶', '木桶', '提桶', '打水'],
    art: `
      <ellipse class="sh" cx="32" cy="57" rx="18" ry="3.5"/>
      <path class="line" d="M16 22 A16 14 0 0 1 48 22"/>
      <path class="wood" d="M14 20 L50 20 L45 53 L19 53 Z"/>
      <path class="iron" d="M15 28 L49 28 L48 33 L16 33 Z"/>
      <path class="iron" d="M17 42 L47 42 L46 47 L18 47 Z"/>
      <ellipse cx="32" cy="20" rx="18" ry="5"/>
      <ellipse class="l" cx="32" cy="20" rx="13" ry="3"/>
    `,
  },
  {
    id: 'teapot',
    name: '茶壶',
    group: 'vessel',
    tint: 'teal',
    tags: ['茶壶', '壶', '酒壶', '冲泡'],
    art: `
      <ellipse class="sh" cx="32" cy="57" rx="19" ry="3.5"/>
      <path d="M44 28 Q56 22 56 16 L51 15 Q49 20 42 22 Z"/>
      <path class="line" d="M20 26 C10 26, 10 42, 20 42"/>
      <ellipse cx="32" cy="36" rx="16" ry="14"/>
      <ellipse class="l" cx="29" cy="34" rx="11" ry="9"/>
      <ellipse class="l" cx="32" cy="21" rx="9" ry="3.5"/>
      <circle class="d" cx="32" cy="16" r="3.5"/>
      <path class="hi" d="M23 29 A9 8 0 0 1 32 25 L32 28 A6 5 0 0 0 25 31 Z"/>
    `,
  },
  {
    id: 'bread',
    name: '面包',
    group: 'food',
    tint: 'wheat',
    tags: ['面包', '麦饼', '烘培', '主食', '干粮'],
    art: `
      <ellipse class="sh" cx="32" cy="56" rx="22" ry="4"/>
      <path d="M10 38 C10 20, 22 16, 32 16 C42 16, 54 20, 54 38 C54 47, 46 50, 32 50 C18 50, 10 47, 10 38 Z"/>
      <path class="l n" d="M16 34 C16 23, 24 20, 32 20 C39 20, 46 23, 46 32 C36 30, 24 31, 16 34 Z"/>
      <path class="d" d="M22 22 Q26 28 24 34 M32 20 Q36 26 34 32 M42 22 Q45 28 43 34"/>
      <path class="hi" d="M18 27 Q23 22 28 22 L27 25 Q22 25 19 29 Z"/>
    `,
  },
  {
    id: 'cheese',
    name: '奶酪',
    group: 'food',
    tint: 'gold',
    tags: ['奶酪', '干酪', '乳酪', '食材'],
    art: `
      <ellipse class="sh" cx="32" cy="56" rx="22" ry="4"/>
      <path class="l" d="M10 30 L38 14 L54 26 L10 30 Z"/>
      <path d="M10 30 L54 26 L54 48 L10 50 Z"/>
      <circle class="d" cx="22" cy="39" r="4"/>
      <circle class="d" cx="36" cy="35" r="3"/>
      <circle class="d" cx="44" cy="43" r="4.5"/>
      <path class="hi" d="M16 28 L37 17 L41 19 L20 28 Z"/>
    `,
  },
  {
    id: 'drumstick',
    name: '烤腿肉',
    group: 'food',
    tint: 'amber',
    tags: ['肉', '烤肉', '鸡腿', '兽肉', '食材'],
    art: `
      <ellipse class="sh" cx="32" cy="57" rx="19" ry="3.5"/>
      <path class="ivory" d="M38 38 L50 48 A4 4 0 1 1 46 53 A4 4 0 1 1 41 49 L32 42 Z"/>
      <path d="M14 18 C8 26, 14 42, 26 44 C36 46, 44 38, 42 28 C40 16, 22 10, 14 18 Z"/>
      <path class="l n" d="M18 20 C14 26, 18 36, 27 38 C33 39, 37 34, 36 27 C34 19, 23 15, 18 20 Z"/>
      <ellipse class="hi" cx="24" cy="24" rx="5" ry="3" transform="rotate(-25 24 24)"/>
    `,
  },
  {
    id: 'honeycomb',
    name: '蜂巢',
    group: 'food',
    tint: 'amber',
    tags: ['蜂巢', '蜂蜜', '蜜蜡', '甜味'],
    art: `
      <ellipse class="sh" cx="32" cy="57" rx="19" ry="3.5"/>
      <polygon d="M24,12 32,8 40,12 40,22 32,26 24,22" points="24,12 32,8 40,12 40,22 32,26 24,22"/>
      <polygon class="l" points="14,24 22,20 30,24 30,34 22,38 14,34"/>
      <polygon points="30,24 38,20 46,24 46,34 38,38 30,34"/>
      <polygon points="22,36 30,32 38,36 38,46 30,50 22,46"/>
      <path class="l" d="M42 36 Q46 46 42 52 Q38 52 39 44 Z"/>
      <circle class="hi" cx="22" cy="27" r="2.5"/>
    `,
  },
  {
    id: 'egg',
    name: '蛋',
    group: 'food',
    tint: 'ivory',
    tags: ['蛋', '鸟蛋', '龙蛋', '禽蛋', '食材'],
    art: `
      <ellipse class="sh" cx="32" cy="57" rx="16" ry="3.5"/>
      <path d="M32 10 C20 10, 14 28, 14 40 C14 50, 22 54, 32 54 C42 54, 50 50, 50 40 C50 28, 44 10, 32 10 Z"/>
      <path class="l n" d="M30 14 C22 15, 18 29, 18 39 C18 46, 23 50, 29 50 C25 44, 24 26, 30 14 Z"/>
      <circle class="d" cx="38" cy="30" r="3"/>
      <circle class="d" cx="34" cy="42" r="2"/>
      <ellipse class="hi" cx="25" cy="24" rx="3" ry="5" transform="rotate(18 25 24)"/>
    `,
  },
  {
    id: 'fish',
    name: '鱼',
    group: 'food',
    tint: 'azure',
    tags: ['鱼', '河鲜', '海鲜', '银鱼', '水产'],
    art: `
      <ellipse class="sh" cx="32" cy="56" rx="20" ry="3.5"/>
      <path class="d" d="M26 22 L34 12 L38 22 Z"/>
      <path d="M46 32 L58 20 L55 32 L58 44 Z"/>
      <path d="M8 32 C14 18, 34 18, 48 32 C34 46, 14 46, 8 32 Z"/>
      <path class="l n" d="M12 33 C18 41, 32 41, 43 33 C32 36, 20 36, 12 33 Z"/>
      <circle class="ink" cx="17" cy="29" r="2.5"/>
      <path class="line thin" d="M23 25 Q26 32 23 39"/>
      <path class="hi" d="M18 23 Q28 20 36 25 L34 27 Q27 23 19 25 Z"/>
    `,
  },
  {
    id: 'sparkle',
    name: '星点',
    group: 'arcane',
    tint: 'gold',
    tags: ['星尘', '散逸星火', '星光', '星点', '微光'],
    art: `
      <path d="M28 8 L33 23 L48 28 L33 33 L28 48 L23 33 L8 28 L23 23 Z"/>
      <path class="l n" d="M28 13 L31 25 L43 28 L31 31 L28 43 L25 31 L13 28 L25 25 Z"/>
      <path class="l" d="M48 10 L50 16 L56 18 L50 20 L48 26 L46 20 L40 18 L46 16 Z"/>
      <path class="l" d="M44 38 L46 44 L52 46 L46 48 L44 54 L42 48 L36 46 L42 44 Z"/>
      <circle class="hi" cx="28" cy="28" r="4"/>
    `,
  },
  {
    id: 'star',
    name: '星辰',
    group: 'arcane',
    tint: 'gold',
    tags: ['星', '五角星', '星辰', '星辉'],
    art: `
      <polygon d="M32,8 39,23 56,25 43,37 47,54 32,45 17,54 21,37 8,25 25,23" points="32,8 39,23 56,25 43,37 47,54 32,45 17,54 21,37 8,25 25,23"/>
      <polygon class="l n" points="32,13 37,25 49,26 40,35 42,47 32,41 22,47 24,35 15,26 27,25"/>
      <circle class="hi" cx="29" cy="28" r="4"/>
    `,
  },
  {
    id: 'orb',
    name: '光球',
    group: 'arcane',
    tint: 'violet',
    tags: ['光球', '法球', '宝珠', '能量球', '水晶球'],
    art: `
      <ellipse class="sh" cx="32" cy="57" rx="16" ry="3.5"/>
      <circle cx="32" cy="32" r="20"/>
      <circle class="l n" cx="30" cy="30" r="14"/>
      <path class="line thin" d="M10 34 C18 44, 46 44, 54 30"/>
      <ellipse class="hi" cx="24" cy="22" rx="5" ry="3.5" transform="rotate(-30 24 22)"/>
      <circle class="hi" cx="38" cy="38" r="2"/>
    `,
  },
  {
    id: 'flame',
    name: '火焰',
    group: 'arcane',
    tint: 'ember',
    tags: ['火', '火焰', '星火', '炉火', '热能'],
    art: `
      <ellipse class="sh" cx="32" cy="57" rx="16" ry="3.5"/>
      <path d="M32 8 C42 18, 50 28, 48 40 C46 50, 38 54, 32 54 C24 54, 16 48, 16 38 C16 30, 22 24, 24 18 C25 24, 28 24, 32 8 Z"/>
      <path class="l" d="M33 22 C39 29, 42 35, 40 43 C39 48, 35 51, 31 51 C26 51, 23 47, 23 41 C23 35, 28 31, 33 22 Z"/>
      <ellipse class="hi" cx="31" cy="43" rx="4" ry="6"/>
    `,
  },
  {
    id: 'moon',
    name: '弯月',
    group: 'arcane',
    tint: 'frost',
    tags: ['月', '清辉', '月光', '弯月', '夜'],
    art: `
      <path d="M40 10 A22 22 0 1 0 52 44 A17 17 0 1 1 40 10 Z"/>
      <path class="l n" d="M34 15 A19 19 0 0 0 24 44 A16 16 0 0 1 34 15 Z"/>
      <circle class="l" cx="44" cy="22" r="3"/>
      <circle class="hi" cx="22" cy="28" r="2.5"/>
    `,
  },
  {
    id: 'sun',
    name: '太阳',
    group: 'arcane',
    tint: 'gold',
    tags: ['日', '太阳', '日曜', '光辉', '白昼'],
    art: `
      <polygon class="d" points="32,6 37,16 48,11 46,22 57,26 49,34 56,44 45,45 44,56 34,50 26,58 22,47 11,48 16,38 7,30 17,24 14,13 25,17"/>
      <circle cx="32" cy="32" r="14"/>
      <circle class="l n" cx="31" cy="31" r="10"/>
      <circle class="hi" cx="27" cy="27" r="3.5"/>
    `,
  },
  {
    id: 'lightning',
    name: '雷电',
    group: 'arcane',
    tint: 'gold',
    tags: ['雷', '闪电', '电弧', '充能', '脉冲'],
    art: `
      <polygon d="M36,6 14,34 29,34 22,58 50,26 34,26" points="36,6 14,34 29,34 22,58 50,26 34,26"/>
      <polygon class="l n" points="34,12 19,32 31,32 26,49 44,28 32,28"/>
      <path class="hi" d="M32 14 L22 29 L27 29 Z"/>
    `,
  },
  {
    id: 'mist',
    name: '雾气',
    group: 'arcane',
    tint: 'frost',
    tags: ['雾', '云', '蒸汽', '香气', '烟雾'],
    art: `
      <path class="d" d="M18 28 A8 8 0 0 1 32 22 A10 10 0 0 1 48 28 A7 7 0 0 1 48 42 L18 42 A7 7 0 0 1 18 28 Z"/>
      <path d="M14 34 A9 9 0 0 1 29 27 A11 11 0 0 1 46 33 A8 8 0 0 1 46 49 L14 49 A8 8 0 0 1 14 34 Z"/>
      <path class="l n" d="M18 35 A7 7 0 0 1 29 30 A9 9 0 0 1 42 35 L42 44 L18 44 Z"/>
      <path class="line" d="M14 55 L42 55 M24 59 L50 59"/>
    `,
  },
  {
    id: 'bubble',
    name: '气泡',
    group: 'arcane',
    tint: 'teal',
    tags: ['气泡', '泡沫', '发酵', '沸腾', '反应'],
    art: `
      <circle cx="26" cy="36" r="16"/>
      <circle class="l n" cx="24" cy="34" r="11"/>
      <circle class="l" cx="46" cy="20" r="9"/>
      <circle cx="46" cy="46" r="6"/>
      <ellipse class="hi" cx="20" cy="28" rx="4" ry="2.5" transform="rotate(-30 20 28)"/>
      <circle class="hi" cx="43" cy="17" r="2.2"/>
    `,
  },
  {
    id: 'rune',
    name: '符文石',
    group: 'arcane',
    tint: 'teal',
    tags: ['符文', '刻石', '铭文', '秘石', '印记'],
    art: `
      <ellipse class="sh" cx="32" cy="57" rx="18" ry="3.5"/>
      <polygon class="stone" points="22,10 42,10 52,26 46,52 18,52 12,26"/>
      <polygon class="stone-l n" points="24,13 38,13 28,49 20,49 15,26"/>
      <polygon class="l" points="32,18 41,31 32,44 23,31"/>
      <circle class="hi" cx="32" cy="31" r="3"/>
    `,
  },
  {
    id: 'core',
    name: '能量核心',
    group: 'arcane',
    tint: 'violet',
    tags: ['核心', '恒动芯', '星隙恒动芯', '炉心', '源核'],
    art: `
      <ellipse class="sh" cx="32" cy="58" rx="18" ry="3"/>
      <polygon class="iron" points="32,6 54,19 54,45 32,58 10,45 10,19"/>
      <polygon class="ink" points="32,12 48,22 48,42 32,52 16,42 16,22"/>
      <polygon d="M32,14 46,32 32,50 18,32" points="32,14 46,32 32,50 18,32"/>
      <polygon class="l n" points="32,19 41,32 32,45 23,32"/>
      <circle class="hi" cx="32" cy="32" r="4"/>
    `,
  },
  {
    id: 'heart',
    name: '心核',
    group: 'arcane',
    tint: 'ruby',
    tags: ['心', '心核', '生命', '结晶核', '灵魂'],
    art: `
      <ellipse class="sh" cx="32" cy="57" rx="16" ry="3.5"/>
      <path d="M32 52 L12 32 A11 11 0 0 1 32 18 A11 11 0 0 1 52 32 Z"/>
      <path class="l n" d="M32 46 L17 31 A8 8 0 0 1 31 22 L32 25 Z"/>
      <ellipse class="hi" cx="22" cy="24" rx="3.5" ry="2" transform="rotate(-30 22 24)"/>
    `,
  },
  {
    id: 'spark-jar',
    name: '星火瓶',
    group: 'arcane',
    tint: 'amber',
    tags: ['束缚星火', '星火瓶', '荧光瓶', '封存星火', '提灯瓶'],
    art: `
      <ellipse class="sh" cx="32" cy="57" rx="17" ry="3.5"/>
      <rect class="wood" x="23" y="8" width="18" height="6" rx="2"/>
      <rect class="iron" x="21" y="13" width="22" height="4" rx="2"/>
      <rect class="glass" x="17" y="17" width="30" height="36" rx="7"/>
      <path d="M32 22 L36 31 L45 35 L36 39 L32 48 L28 39 L19 35 L28 31 Z"/>
      <circle class="l n" cx="32" cy="35" r="5"/>
      <circle class="hi" cx="32" cy="35" r="2.5"/>
    `,
  },
  {
    id: 'comet',
    name: '彗星',
    group: 'arcane',
    tint: 'azure',
    tags: ['彗星', '流星', '星轨', '天体', '坠星'],
    art: `
      <path class="d" d="M52 10 C38 12, 22 22, 12 36 L26 28 L20 44 L36 34 L28 52 C42 42, 52 26, 52 10 Z"/>
      <circle cx="42" cy="22" r="12"/>
      <circle class="l n" cx="42" cy="22" r="8"/>
      <circle class="hi" cx="40" cy="20" r="3.5"/>
    `,
  },
];
