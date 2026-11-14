/** 天然原料与矿物晶石（group: nature / mineral）。 */
export const NATURE_ICONS = [
  {
    id: 'grain',
    name: '麦穗',
    group: 'nature',
    tint: 'wheat',
    tags: ['麦', '谷物', '粮食', '农作物'],
    art: `
      <ellipse class="sh" cx="32" cy="58" rx="12" ry="2.5"/>
      <path class="d" d="M30 58 L30 36 Q30 26 32 18 L34 18 Q33 26 33 36 L33 58 Z"/>
      <path class="d" d="M31 50 C24 50 18 46 14 40 C22 40 28 44 31 50 Z"/>
      <ellipse cx="24" cy="38" rx="4.5" ry="7.5" transform="rotate(-28 24 38)"/>
      <ellipse cx="40" cy="38" rx="4.5" ry="7.5" transform="rotate(28 40 38)"/>
      <ellipse cx="24" cy="28" rx="4.5" ry="7.5" transform="rotate(-28 24 28)"/>
      <ellipse cx="40" cy="28" rx="4.5" ry="7.5" transform="rotate(28 40 28)"/>
      <ellipse cx="25" cy="18" rx="4.2" ry="7" transform="rotate(-25 25 18)"/>
      <ellipse cx="39" cy="18" rx="4.2" ry="7" transform="rotate(25 39 18)"/>
      <ellipse class="l" cx="32" cy="12" rx="4.5" ry="7.5"/>
      <ellipse class="hi" cx="30.5" cy="10" rx="1.4" ry="3"/>
      <ellipse class="hi" cx="22.5" cy="26" rx="1.3" ry="2.8" transform="rotate(-28 22.5 26)"/>
    `,
  },
  {
    id: 'seed',
    name: '种子',
    group: 'nature',
    tint: 'earth',
    tags: ['种子', '籽', '播种', '农作物'],
    art: `
      <ellipse class="sh" cx="32" cy="56" rx="20" ry="3.5"/>
      <path d="M34 6 C48 14 52 34 44 48 C40 55 28 56 23 50 C14 38 18 16 34 6 Z"/>
      <path class="d n" d="M35 8 C40 22 40 40 33 54 C38 54 42 52 44 48 C52 34 48 14 35 8 Z"/>
      <path class="line thin" d="M34 9 C39 22 39 38 33 52"/>
      <path class="line" d="M34 6 C48 14 52 34 44 48 C40 55 28 56 23 50 C14 38 18 16 34 6 Z"/>
      <path class="hi" d="M26 18 C22 26 21 34 23 40 C26 33 27 25 26 18 Z"/>
      <path class="l" d="M8 52 C6 46 10 40 16 40 C21 42 22 50 18 54 C14 57 10 56 8 52 Z"/>
      <path class="hi" d="M10 49 C10 46 12 44 14 43 C13 46 12 48 12 50 Z"/>
    `,
  },
  {
    id: 'sapling',
    name: '嫩枝',
    group: 'nature',
    tint: 'jade',
    tags: ['幼苗', '树苗', '嫩芽', '植物'],
    art: `
      <ellipse class="sh" cx="32" cy="57" rx="18" ry="3"/>
      <path class="d" d="M30 54 Q27 38 33 18 L36 19 Q31 38 34 54 Z"/>
      <path d="M31 38 C22 40 10 34 8 22 C20 20 30 26 31 38 Z"/>
      <path class="l" d="M33 30 C40 32 52 28 56 16 C44 13 35 20 33 30 Z"/>
      <path class="l" d="M34 20 C28 14 30 6 37 4 C42 10 40 17 34 20 Z"/>
      <path class="line thin" d="M30 36 C24 32 18 28 12 23"/>
      <path class="line thin" d="M34 29 C40 26 46 22 52 17"/>
      <path class="wood" d="M16 56 C20 46 44 46 48 56 Z"/>
      <path class="wood-l n" d="M22 50 C26 48 32 47 36 48 C32 49 26 50 22 52 Z"/>
      <path class="hi" d="M14 24 C18 23 22 25 25 28 C20 27 17 26 14 24 Z"/>
    `,
  },
  {
    id: 'leaf',
    name: '叶片',
    group: 'nature',
    tint: 'jade',
    tags: ['叶子', '树叶', '植物', '草'],
    art: `
      <path d="M12 52 C8 30 24 10 54 8 C56 36 38 56 12 52 Z"/>
      <path class="d n" d="M14 51 C28 40 42 26 53 10 C55 36 38 55 14 51 Z"/>
      <path class="line" d="M12 52 C8 30 24 10 54 8 C56 36 38 56 12 52 Z"/>
      <path class="line" d="M7 59 L14 50 C26 40 40 26 51 11"/>
      <path class="line thin" d="M21 42 L19 30 M29 35 L28 23 M37 27 L38 17 M21 42 L33 45 M29 35 L41 37 M37 27 L47 28"/>
      <path class="hi" d="M16 40 C16 30 22 20 32 15 C26 22 21 30 19 40 Z"/>
    `,
  },
  {
    id: 'herb',
    name: '草药束',
    group: 'nature',
    tint: 'moss',
    tags: ['草药', '药草', '香草', '药材', '植物'],
    art: `
      <ellipse class="sh" cx="32" cy="58" rx="12" ry="2.5"/>
      <path class="d" d="M29 58 L30 40 L34 40 L35 58 Z"/>
      <path class="d" d="M30 42 C20 36 10 24 12 8 C24 14 31 26 30 42 Z"/>
      <path class="d" d="M34 42 C44 36 54 24 52 8 C40 14 33 26 34 42 Z"/>
      <ellipse class="l" cx="16" cy="22" rx="3.5" ry="6" transform="rotate(-35 16 22)"/>
      <ellipse class="l" cx="48" cy="22" rx="3.5" ry="6" transform="rotate(35 48 22)"/>
      <path d="M32 44 C23 32 25 14 32 4 C39 14 41 32 32 44 Z"/>
      <path class="line thin" d="M32 8 L32 40 M32 18 L27 14 M32 18 L37 14 M32 28 L26 23 M32 28 L38 23"/>
      <rect class="wood-l" x="26" y="40" width="12" height="6" rx="2"/>
      <path class="hi" d="M28 16 C28 22 28 28 30 34 C26 30 26 22 28 16 Z"/>
    `,
  },
  {
    id: 'flower',
    name: '花朵',
    group: 'nature',
    tint: 'rose',
    tags: ['花', '花瓣', '植物', '花卉'],
    art: `
      <path class="leaf" d="M30 58 L30 34 L34 34 L34 58 Z"/>
      <path class="leaf" d="M32 50 C24 52 16 48 12 42 C20 40 28 44 32 50 Z"/>
      <path class="leaf-l" d="M33 46 C40 46 46 42 50 36 C42 35 36 40 33 46 Z"/>
      <ellipse class="d" cx="37.9" cy="32.1" rx="7" ry="9.5" transform="rotate(144 37.9 32.1)"/>
      <ellipse class="d" cx="26.1" cy="32.1" rx="7" ry="9.5" transform="rotate(216 26.1 32.1)"/>
      <ellipse cx="41.5" cy="21" rx="7" ry="9.5" transform="rotate(72 41.5 21)"/>
      <ellipse cx="22.5" cy="21" rx="7" ry="9.5" transform="rotate(288 22.5 21)"/>
      <ellipse class="l" cx="32" cy="14" rx="7" ry="9.5"/>
      <circle class="fire-l" cx="32" cy="24" r="6.5"/>
      <circle class="fire n" cx="33.5" cy="25.5" r="2.5"/>
      <ellipse class="hi" cx="30" cy="11" rx="2" ry="4"/>
    `,
  },
  {
    id: 'mushroom',
    name: '蘑菇',
    group: 'nature',
    tint: 'ruby',
    tags: ['蘑菇', '菌', '菇', '真菌'],
    art: `
      <ellipse class="sh" cx="32" cy="57" rx="18" ry="3.5"/>
      <path class="wood-l" d="M24 56 C25 46 26 38 26 32 L38 32 C38 38 39 46 40 56 C36 58 28 58 24 56 Z"/>
      <path class="sh" d="M34 34 L38 34 C38 40 39 48 40 55 C38 56 36 56 35 56 C35 48 35 40 34 34 Z"/>
      <path d="M6 34 C6 18 18 8 32 8 C46 8 58 18 58 34 C50 39 14 39 6 34 Z"/>
      <path class="d n" d="M8 33 C20 37 44 37 56 33 C56 30 55 28 54 26 C46 31 18 31 10 26 C9 28 8 30 8 33 Z"/>
      <path class="line" d="M6 34 C6 18 18 8 32 8 C46 8 58 18 58 34 C50 39 14 39 6 34 Z"/>
      <circle class="hi" cx="22" cy="20" r="4.5"/>
      <circle class="hi" cx="38" cy="15" r="3"/>
      <circle class="hi" cx="46" cy="26" r="3"/>
      <circle class="hi" cx="30" cy="29" r="2.2"/>
      <circle class="hi" cx="14" cy="29" r="2"/>
    `,
  },
  {
    id: 'fruit',
    name: '果实',
    group: 'nature',
    tint: 'ruby',
    tags: ['水果', '果子', '苹果', '食物'],
    art: `
      <ellipse class="sh" cx="32" cy="57" rx="18" ry="3.5"/>
      <path d="M32 18 C24 12 9 14 9 31 C9 46 20 58 32 54 C44 58 55 46 55 31 C55 14 40 12 32 18 Z"/>
      <path class="d n" d="M45 22 C53 27 54 42 46 50 C41 55 35 54 32 54 C44 51 50 39 45 22 Z"/>
      <path class="line" d="M32 18 C24 12 9 14 9 31 C9 46 20 58 32 54 C44 58 55 46 55 31 C55 14 40 12 32 18 Z"/>
      <path class="wood" d="M30 20 C30 14 32 9 35 5 L38 7 C35 10 34 15 34 20 Z"/>
      <path class="leaf" d="M35 13 C40 4 50 4 55 8 C49 15 41 16 35 13 Z"/>
      <ellipse class="hi" cx="19" cy="28" rx="3.5" ry="6.5" transform="rotate(20 19 28)"/>
      <circle class="hi" cx="21" cy="40" r="1.8"/>
    `,
  },
  {
    id: 'berries',
    name: '浆果串',
    group: 'nature',
    tint: 'violet',
    tags: ['浆果', '葡萄', '果子', '食物'],
    art: `
      <path class="wood" d="M30 16 C30 11 29 8 26 5 L29 4 C32 7 33 11 33 16 Z"/>
      <path class="leaf" d="M32 9 C38 3 48 4 52 9 C46 14 38 14 32 9 Z"/>
      <circle class="d" cx="15" cy="32" r="6"/>
      <circle class="d" cx="49" cy="32" r="6"/>
      <circle cx="32" cy="46" r="7.5"/>
      <circle cx="25" cy="35" r="7.5"/>
      <circle cx="39" cy="35" r="7.5"/>
      <circle class="l" cx="20" cy="23" r="7.5"/>
      <circle class="l" cx="32" cy="22" r="7.5"/>
      <circle class="l" cx="44" cy="23" r="7.5"/>
      <circle class="hi" cx="29.5" cy="19.5" r="2"/>
      <circle class="hi" cx="17.5" cy="20.5" r="1.8"/>
      <circle class="hi" cx="41.5" cy="20.5" r="1.8"/>
      <circle class="hi" cx="22.5" cy="32.5" r="1.6"/>
      <circle class="hi" cx="36.5" cy="32.5" r="1.6"/>
      <circle class="hi" cx="29.5" cy="43.5" r="1.6"/>
    `,
  },
  {
    id: 'log',
    name: '原木',
    group: 'nature',
    tint: 'earth',
    tags: ['木头', '木材', '树干', '原木'],
    art: `
      <ellipse class="sh" cx="34" cy="55" rx="24" ry="3.5"/>
      <path d="M34 22 L36 10 L44 10 L44 22 Z"/>
      <ellipse class="l" cx="40" cy="10" rx="4" ry="2"/>
      <path d="M14 20 L48 20 A8 15 0 0 1 48 50 L14 50 Z"/>
      <path class="d n" d="M16 44 L54.4 44 C53 47 51 49 48 50 L16 50 Z"/>
      <path class="line" d="M14 20 L48 20 A8 15 0 0 1 48 50 L14 50 Z"/>
      <path class="line thin" d="M24 27 L42 27 M28 37 L48 37 M22 44 L36 44"/>
      <ellipse class="l" cx="14" cy="35" rx="8" ry="15"/>
      <ellipse class="line thin" cx="14" cy="35" rx="5" ry="10"/>
      <ellipse class="d thin" cx="14" cy="35" rx="2" ry="4"/>
      <path class="hi" d="M22 23 L44 23 L44 25 L22 25 Z"/>
    `,
  },
  {
    id: 'twig',
    name: '枝条',
    group: 'nature',
    tint: 'earth',
    tags: ['树枝', '木枝', '柴', '木材'],
    art: `
      <ellipse class="sh" cx="32" cy="57" rx="18" ry="3"/>
      <path d="M27 38 L20 18 L25 16 L32 34 Z"/>
      <path d="M38 28 L54 26 L55 31 L40 33 Z"/>
      <path class="leaf" d="M21 17 C14 14 11 8 12 4 C18 6 22 11 21 17 Z"/>
      <path class="leaf-l" d="M54 27 C56 21 60 18 60 18 C61 24 58 28 54 29 Z"/>
      <path d="M8 54 L46 10 L52 15 L14 58 Z"/>
      <path class="hi" d="M11 53 L45 13 L46.5 14.2 L12.5 54.2 Z"/>
      <ellipse class="d thin" cx="30" cy="34" rx="2" ry="1.4" transform="rotate(-49 30 34)"/>
      <path class="d" d="M45 10 L48 7 L53 11 L51 15 Z"/>
    `,
  },
  {
    id: 'soil',
    name: '土堆',
    group: 'nature',
    tint: 'earth',
    tags: ['泥土', '土壤', '土', '沃土'],
    art: `
      <ellipse class="sh" cx="32" cy="56" rx="27" ry="4"/>
      <path d="M6 54 C7 45 13 39 19 37 C21 29 29 23 37 26 C45 26 51 33 51 40 C57 43 59 49 58 54 Z"/>
      <path class="d n" d="M7 54 C14 48 50 47 57 54 Z"/>
      <path class="l n" d="M21 37 C23 31 29 27 36 28 C31 30 27 33 25 38 Z"/>
      <path class="l n" d="M44 31 C47 33 49 36 49 39 C47 37 45 35 42 34 Z"/>
      <path class="line" d="M6 54 C7 45 13 39 19 37 C21 29 29 23 37 26 C45 26 51 33 51 40 C57 43 59 49 58 54 Z"/>
      <path class="line thin" d="M19 37 C22 40 24 44 23 48 M51 40 C47 42 44 46 44 50"/>
      <circle class="d" cx="36" cy="40" r="3"/>
      <circle class="d" cx="14" cy="48" r="2.5"/>
      <ellipse class="stone" cx="48" cy="49" rx="3.5" ry="2.5"/>
      <circle class="l" cx="30" cy="47" r="2.5"/>
    `,
  },
  {
    id: 'droplet',
    name: '水滴',
    group: 'nature',
    tint: 'azure',
    tags: ['水', '液体', '露水', '水滴'],
    art: `
      <ellipse class="sh" cx="32" cy="58" rx="12" ry="2.5"/>
      <path d="M32 5 C40 18 50 28 50 39 C50 49 42 56 32 56 C22 56 14 49 14 39 C14 28 24 18 32 5 Z"/>
      <path class="d n" d="M44 31 C49 40 47 50 36 54 C43 48 46 40 44 31 Z"/>
      <path class="hi" d="M21 38 C21 31 25 25 29 20 C27 28 26 33 27 40 C26 44 21 43 21 38 Z"/>
      <circle class="hi" cx="25" cy="47" r="2"/>
    `,
  },
  {
    id: 'cotton',
    name: '棉絮',
    group: 'nature',
    tint: 'ivory',
    tags: ['棉花', '棉', '绒', '纤维'],
    art: `
      <ellipse class="sh" cx="32" cy="57" rx="16" ry="3"/>
      <path class="wood" d="M18 44 L22 56 L32 50 L42 56 L46 44 Z"/>
      <circle cx="22" cy="24" r="10"/>
      <circle cx="42" cy="24" r="10"/>
      <circle cx="32" cy="16" r="10"/>
      <circle cx="18" cy="38" r="9"/>
      <circle cx="46" cy="38" r="9"/>
      <circle cx="32" cy="38" r="11"/>
      <circle class="n" cx="22" cy="24" r="10"/>
      <circle class="n" cx="42" cy="24" r="10"/>
      <circle class="n" cx="32" cy="16" r="10"/>
      <circle class="n" cx="18" cy="38" r="9"/>
      <circle class="n" cx="46" cy="38" r="9"/>
      <circle class="n" cx="32" cy="38" r="11"/>
      <path class="d n" d="M14 44 C20 48 26 49 32 49 C40 49 46 47 52 42 C50 46 46 48 32 50 C22 50 16 48 14 44 Z"/>
      <path class="line thin" d="M24 32 C27 29 30 28 33 28 M37 30 C40 31 42 33 43 36 M22 30 C20 28 18 28 16 30"/>
      <circle class="hi" cx="28" cy="12" r="3"/>
      <circle class="hi" cx="17" cy="21" r="2.2"/>
    `,
  },
  {
    id: 'feather',
    name: '羽毛',
    group: 'nature',
    tint: 'frost',
    tags: ['羽毛', '羽', '翎', '禽'],
    art: `
      <path d="M16 50 C11 34 23 13 48 6 C52 26 43 44 18 52 Z"/>
      <path class="l n" d="M17 49 C13 34 24 15 47 8 C32 21 22 36 17 49 Z"/>
      <path class="d n" d="M48 8 C51 26 42 43 19 51 C32 40 42 26 48 8 Z"/>
      <path class="line" d="M16 50 C11 34 23 13 48 6 C52 26 43 44 18 52 Z"/>
      <path class="line thin" d="M44 26 L49 22 M38 36 L44 33 M20 32 L26 34 M26 22 L31 25"/>
      <path class="line" d="M9 59 C18 42 30 24 47 8"/>
      <path class="hi" d="M19 38 C22 28 28 20 35 14 C30 22 25 30 21 40 Z"/>
    `,
  },
  {
    id: 'bone',
    name: '骨头',
    group: 'nature',
    tint: 'ivory',
    tags: ['骨', '骨头', '兽骨', '骨材'],
    art: `
      <ellipse class="sh" cx="32" cy="57" rx="20" ry="3"/>
      <circle cx="11" cy="45" r="6.5"/>
      <circle cx="19" cy="53" r="6.5"/>
      <circle cx="45" cy="11" r="6.5"/>
      <circle cx="53" cy="19" r="6.5"/>
      <path d="M13.2 45.2 L45.2 13.2 L50.8 18.8 L18.8 50.8 Z"/>
      <circle class="n" cx="11" cy="45" r="6.5"/>
      <circle class="n" cx="19" cy="53" r="6.5"/>
      <circle class="n" cx="45" cy="11" r="6.5"/>
      <circle class="n" cx="53" cy="19" r="6.5"/>
      <path class="n" d="M13.2 45.2 L45.2 13.2 L50.8 18.8 L18.8 50.8 Z"/>
      <path class="d n" d="M17 51 L49 19 L51 21 C47 26 26 46 20 51 Z"/>
      <path class="d n" d="M14 58 C18 60 24 58 25 54 C23 56 18 57 14 58 Z"/>
      <path class="d n" d="M49 25 C54 27 59 23 59 19 C57 22 53 24 49 25 Z"/>
      <path class="hi" d="M15 44 L43 16 L45 17.5 L17 45.5 Z"/>
      <circle class="hi" cx="43" cy="8" r="2"/>
      <circle class="hi" cx="8" cy="42" r="2"/>
    `,
  },
  {
    id: 'shell',
    name: '贝壳',
    group: 'nature',
    tint: 'rose',
    tags: ['贝壳', '贝', '海螺', '海'],
    art: `
      <ellipse class="sh" cx="32" cy="56" rx="20" ry="3.5"/>
      <path class="d" d="M21 54 L19 45 L45 45 L43 54 Z"/>
      <path d="M32 51 L8 30 Q8 22 13 18 Q16 12 22 11 Q26 7 32 8 Q38 7 42 11 Q48 12 51 18 Q56 22 56 30 Z"/>
      <path class="l n" d="M32 50 L13 19 Q16 13 22 12 Z"/>
      <path class="l n" d="M32 50 L32 9 Q38 8 41 12 Z"/>
      <path class="d n" d="M32 50 L51 19 Q55 23 55 30 Z"/>
      <path class="line" d="M32 51 L8 30 Q8 22 13 18 Q16 12 22 11 Q26 7 32 8 Q38 7 42 11 Q48 12 51 18 Q56 22 56 30 Z"/>
      <path class="line thin" d="M32 50 L13 18 M32 50 L22 11 M32 50 L32 8 M32 50 L42 11 M32 50 L51 18"/>
      <path class="hi" d="M17 22 C19 18 22 16 25 15 C23 18 21 21 20 25 Z"/>
    `,
  },
  {
    id: 'ice',
    name: '冰块',
    group: 'mineral',
    tint: 'frost',
    tags: ['冰', '冰块', '寒冰', '冰晶'],
    art: `
      <ellipse class="sh" cx="32" cy="57" rx="24" ry="3.5"/>
      <path class="l" d="M32 8 L56 20 L32 32 L8 20 Z"/>
      <path d="M8 20 L32 32 L32 56 L8 44 Z"/>
      <path class="d" d="M32 32 L56 20 L56 44 L32 56 Z"/>
      <path class="hi" d="M13 26 L17 28 L17 42 L13 40 Z"/>
      <path class="hi" d="M28 13 L36 17 L32 19 L24 15 Z" opacity="0.8"/>
      <path class="line thin" d="M44 30 L41 38 L46 42 M41 38 L36 40"/>
    `,
  },
  {
    id: 'stone',
    name: '石块',
    group: 'mineral',
    tint: 'ash',
    tags: ['石头', '石块', '岩石', '石料'],
    art: `
      <ellipse class="sh" cx="32" cy="56" rx="25" ry="4"/>
      <path d="M8 50 C5 40 10 30 18 24 C24 15 37 13 45 19 C53 23 59 34 57 46 C56 52 51 55 45 55 L16 55 C11 55 9 53 8 50 Z"/>
      <path class="l n" d="M18 24 C24 15 37 13 45 19 C40 24 31 26 25 32 C21 30 18 27 18 24 Z"/>
      <path class="d n" d="M45 19 C53 23 59 34 57 46 C56 52 51 55 45 55 L38 55 C44 44 46 30 45 19 Z"/>
      <path class="line thin" d="M25 32 L18 40 M25 32 L40 34 L45 19 M40 34 L38 55"/>
      <path class="line" d="M8 50 C5 40 10 30 18 24 C24 15 37 13 45 19 C53 23 59 34 57 46 C56 52 51 55 45 55 L16 55 C11 55 9 53 8 50 Z"/>
      <path class="hi" d="M24 22 C28 18 33 17 37 18 C32 20 29 22 26 25 Z"/>
    `,
  },
  {
    id: 'ore',
    name: '矿石',
    group: 'mineral',
    tint: 'copper',
    tags: ['矿石', '矿', '原矿', '金属'],
    art: `
      <ellipse class="sh" cx="32" cy="56" rx="26" ry="4"/>
      <path class="stone" d="M6 48 L11 28 L25 15 L42 13 L56 26 L58 46 L50 55 L14 55 Z"/>
      <path class="stone-l n" d="M11 28 L25 15 L42 13 L36 23 L19 30 Z"/>
      <path class="line thin" d="M19 30 L14 44 M36 23 L50 30 M30 40 L44 44"/>
      <path d="M15 40 L23 32 L31 37 L27 47 L18 48 Z"/>
      <path d="M33 28 L42 21 L50 29 L44 37 L36 36 Z"/>
      <path d="M35 47 L43 41 L51 46 L47 53 L38 53 Z"/>
      <path class="l n" d="M17 39 L23 34 L28 37 L22 39 Z"/>
      <path class="l n" d="M35 28 L42 23 L47 28 L40 30 Z"/>
      <path class="l n" d="M38 47 L43 43 L48 46 L42 48 Z"/>
      <path class="line" d="M6 48 L11 28 L25 15 L42 13 L56 26 L58 46 L50 55 L14 55 Z"/>
      <path class="hi" d="M19 23 L26 18 L33 17 L24 22 Z"/>
    `,
  },
  {
    id: 'nugget',
    name: '矿粒',
    group: 'mineral',
    tint: 'gold',
    tags: ['矿粒', '金块', '颗粒', '金属'],
    art: `
      <ellipse class="sh" cx="32" cy="56" rx="25" ry="3.5"/>
      <path d="M21 30 C20 22 28 17 35 19 C42 17 47 25 45 32 C43 39 25 39 21 30 Z"/>
      <path d="M7 47 C5 39 12 33 20 34 C28 33 32 41 28 49 C24 56 11 56 7 47 Z"/>
      <path d="M35 47 C33 39 39 33 47 35 C55 35 59 43 55 50 C51 57 39 56 35 47 Z"/>
      <path class="d n" d="M9 50 C14 55 24 55 27 49 C22 52 15 53 9 50 Z"/>
      <path class="d n" d="M37 50 C42 56 52 55 55 49 C50 52 43 53 37 50 Z"/>
      <path class="l" d="M23 53 C22 47 27 44 32 45 C37 45 39 50 37 54 C34 58 25 58 23 53 Z"/>
      <path class="l n" d="M25 27 C26 23 30 21 34 22 C30 23 28 25 27 28 Z"/>
      <circle class="hi" cx="14" cy="40" r="2.5"/>
      <circle class="hi" cx="42" cy="40" r="2.5"/>
      <circle class="hi" cx="28" cy="25" r="2"/>
      <circle class="hi" cx="28" cy="49" r="1.6"/>
    `,
  },
  {
    id: 'crystal',
    name: '晶簇',
    group: 'mineral',
    tint: 'azure',
    tags: ['晶', '矿', '原石', '晶簇', '水晶'],
    art: `
      <ellipse class="sh" cx="32" cy="57" rx="25" ry="3.5"/>
      <path d="M9 54 L7 32 L13 21 L22 29 L24 54 Z"/>
      <path class="l n" d="M8.5 52 L7 32 L13 21 L15 32 L16 52 Z"/>
      <path d="M40 54 L42 28 L50 16 L57 28 L55 54 Z"/>
      <path class="d n" d="M49 30 L50 16 L57 28 L55 54 L49 54 Z"/>
      <path d="M22 54 L22 20 L32 5 L42 20 L42 54 Z"/>
      <path class="l n" d="M23.2 20 L32 6.5 L30 22 L30 53 L23.2 53 Z"/>
      <path class="d n" d="M36 22 L41 20 L41 53 L36 53 Z"/>
      <path class="line thin" d="M32 5 L30 22 L30 54 M22 20 L30 22 L36 22 L42 20 M36 22 L36 54"/>
      <path class="line" d="M22 54 L22 20 L32 5 L42 20 L42 54 Z"/>
      <path class="l" d="M16 56 L16 44 L21 38 L27 44 L27 56 Z"/>
      <path class="stone" d="M5 57 C6 51 13 49 20 51 L44 51 C51 49 58 51 59 57 Z"/>
      <path class="hi" d="M25 24 L28 20 L28 44 L25 44 Z"/>
      <path class="hi" d="M17 47 L19 44.5 L19 52 L17 52 Z"/>
    `,
  },
  {
    id: 'shard',
    name: '晶片',
    group: 'mineral',
    tint: 'teal',
    tags: ['晶片', '碎片', '水晶', '晶'],
    art: `
      <ellipse class="sh" cx="32" cy="58" rx="16" ry="2.5"/>
      <path d="M22 54 L13 30 L36 4 L51 22 L42 50 Z"/>
      <path class="l n" d="M14.5 30 L35.5 6 L32 30 Z"/>
      <path class="d n" d="M50 23 L42 49 L32 30 Z"/>
      <path class="line thin" d="M13 30 L32 30 L36 4 M32 30 L42 50 M32 30 L51 22"/>
      <path class="line" d="M22 54 L13 30 L36 4 L51 22 L42 50 Z"/>
      <path class="l" d="M50 47 L56 40 L59 48 L53 53 Z"/>
      <path class="d" d="M8 46 L12 42 L14 48 L10 50 Z"/>
      <path class="hi" d="M20 28 L32 13 L30 20 L23 28 Z"/>
    `,
  },
  {
    id: 'gem',
    name: '宝石',
    group: 'mineral',
    tint: 'ruby',
    tags: ['宝石', '钻石', '珠宝', '切面'],
    art: `
      <ellipse class="sh" cx="32" cy="58" rx="16" ry="2.5"/>
      <path d="M18 12 L46 12 L58 26 L32 56 L6 26 Z"/>
      <path class="l n" d="M24 13 L40 13 L44 26 L20 26 Z"/>
      <path class="d n" d="M40 13 L46 13 L57 26 L44 26 Z"/>
      <path class="l n" d="M7 26 L20 26 L32 55 Z"/>
      <path class="d n" d="M44 26 L57 26 L32 55 Z"/>
      <path class="line thin" d="M6 26 L58 26 M24 12 L20 26 L32 56 L44 26 L40 12"/>
      <path class="line" d="M18 12 L46 12 L58 26 L32 56 L6 26 Z"/>
      <path class="hi" d="M26 16 L36 16 L34 19 L27 19 Z"/>
      <path class="hi" d="M52 4 L53.5 8.5 L58 10 L53.5 11.5 L52 16 L50.5 11.5 L46 10 L50.5 8.5 Z"/>
    `,
  },
  {
    id: 'amber',
    name: '琥珀',
    group: 'mineral',
    tint: 'amber',
    tags: ['琥珀', '树脂', '化石', '宝石'],
    art: `
      <ellipse class="sh" cx="32" cy="56" rx="21" ry="3.5"/>
      <path d="M14 46 C8 36 12 20 24 14 C36 8 52 14 54 28 C56 40 50 52 38 54 C28 56 18 52 14 46 Z"/>
      <path class="l n" opacity="0.7" d="M20 42 C16 34 20 22 30 20 C40 18 48 26 46 36 C44 44 36 48 28 48 C24 48 22 46 20 42 Z"/>
      <path class="d n" d="M51 30 C53 42 46 51 36 52 C44 46 49 38 51 30 Z"/>
      <ellipse class="ink n" opacity="0.6" cx="34" cy="35" rx="4" ry="2.5" transform="rotate(-30 34 35)"/>
      <path class="line thin" opacity="0.6" d="M31 33 L28 30 M33 38 L31 41 M37 32 L40 29 M37 37 L40 40"/>
      <path class="hi" d="M19 27 C23 20 29 17 36 17 C30 20 26 24 23 31 Z"/>
      <circle class="hi" cx="20" cy="35" r="1.8"/>
    `,
  },
  {
    id: 'coal',
    name: '炭块',
    group: 'mineral',
    tint: 'ink',
    tags: ['煤', '炭', '木炭', '燃料'],
    art: `
      <ellipse class="sh" cx="32" cy="56" rx="25" ry="3.5"/>
      <path d="M10 52 L7 34 L20 19 L36 17 L45 30 L40 53 Z"/>
      <path class="l n" d="M8.5 34 L20 20.5 L35.5 18.5 L26 30 Z"/>
      <path class="d n" d="M26 30 L44 30 L39.5 52 L28 52 Z"/>
      <path class="line thin" d="M7 34 L26 30 L36 17 M26 30 L44 30 M26 30 L28 53"/>
      <path class="line" d="M10 52 L7 34 L20 19 L36 17 L45 30 L40 53 Z"/>
      <path d="M37 54 L35 40 L46 32 L57 38 L58 53 Z"/>
      <path class="l n" d="M36.5 40 L46 33.5 L55.5 38.5 L46 42 Z"/>
      <path class="line thin" d="M35 40 L46 42 L57 38 M46 42 L47 54"/>
      <path class="line" d="M37 54 L35 40 L46 32 L57 38 L58 53 Z"/>
      <path class="hi" d="M14 31 L20 24 L24 23 L17 31 Z"/>
      <path class="hi" d="M41 39 L46 36 L48 37 L43 40 Z"/>
    `,
  },
  {
    id: 'clay',
    name: '泥块',
    group: 'mineral',
    tint: 'earth',
    tags: ['黏土', '泥', '陶土', '泥块'],
    art: `
      <ellipse class="sh" cx="32" cy="56" rx="25" ry="3.5"/>
      <path d="M8 30 C8 26 12 24 16 24 L48 22 C53 22 56 25 56 29 L56 48 C56 52 53 54 49 54 L15 54 C11 54 8 52 8 48 Z"/>
      <path class="d n" d="M9.2 46 C20 48 44 48 54.8 45 L54.8 48 C54.8 51 52 52.8 49 52.8 L15 52.8 C12 52.8 9.2 51 9.2 48 Z"/>
      <path class="line" d="M8 30 C8 26 12 24 16 24 L48 22 C53 22 56 25 56 29 L56 48 C56 52 53 54 49 54 L15 54 C11 54 8 52 8 48 Z"/>
      <path class="l" d="M8 30 C8 25 12 21 18 20 L46 18 C52 18 56 22 56 29 C56 32 52 34 48 34 L14 36 C10 36 8 33 8 30 Z"/>
      <ellipse class="d" cx="26" cy="27" rx="5" ry="3"/>
      <ellipse class="d" cx="41" cy="26" rx="4" ry="2.5"/>
      <path class="line thin" d="M14 43 C24 41 36 45 50 41"/>
      <path class="hi" d="M14 26 C16 23 20 22 24 22 C20 24 17 26 15 29 Z"/>
    `,
  },
  {
    id: 'sand',
    name: '砂堆',
    group: 'mineral',
    tint: 'wheat',
    tags: ['沙', '砂', '沙子', '砂堆'],
    art: `
      <ellipse class="sh" cx="32" cy="56" rx="27" ry="4"/>
      <path d="M5 55 C14 48 22 21 32 19 C42 21 50 48 59 55 Z"/>
      <path class="d n" d="M33 20 C42 23 50 48 58 54 L40 54 C40 42 38 28 33 20 Z"/>
      <path class="l n" d="M31 21 C25 25 18 40 14 50 C20 42 26 30 31 21 Z"/>
      <path class="line" d="M5 55 C14 48 22 21 32 19 C42 21 50 48 59 55 Z"/>
      <circle class="d n" cx="24" cy="44" r="1.5"/>
      <circle class="d n" cx="30" cy="36" r="1.3"/>
      <circle class="d n" cx="34" cy="48" r="1.5"/>
      <circle class="d n" cx="22" cy="51" r="1.3"/>
      <circle class="l n" cx="44" cy="44" r="1.3"/>
      <circle class="l n" cx="48" cy="51" r="1.3"/>
      <circle class="l n" cx="38" cy="32" r="1.2"/>
      <circle cx="10" cy="49" r="1.8"/>
      <circle cx="55" cy="47" r="1.6"/>
      <path class="hi" d="M28 25 C25 30 22 36 20 42 C21 35 24 29 28 25 Z"/>
    `,
  },
  {
    id: 'geode',
    name: '晶洞',
    group: 'mineral',
    tint: 'violet',
    tags: ['晶洞', '晶石', '矿', '紫晶'],
    art: `
      <ellipse class="sh" cx="32" cy="57" rx="23" ry="3.5"/>
      <path class="stone" d="M7 34 C7 18 19 8 34 9 C48 10 58 22 57 36 C56 50 45 56 32 56 C18 56 7 48 7 34 Z"/>
      <path class="stone-l" d="M13 34 C13 22 22 14 33 14 C44 14 52 23 51 35 C50 46 42 51 32 51 C21 51 13 44 13 34 Z"/>
      <path class="d" d="M18 34 C18 25 25 19 33 19 C41 19 47 26 46 35 C45 42 39 47 32 47 C24 47 18 41 18 34 Z"/>
      <path class="thin" d="M27 20 L37 20 L32 29 Z"/>
      <path class="l thin" d="M39 21 L45 28 L36 31 Z"/>
      <path class="thin" d="M46 30 L46 40 L37 35 Z"/>
      <path class="l thin" d="M44 41 L38 46 L35 38 Z"/>
      <path class="thin" d="M37 47 L27 47 L32 38 Z"/>
      <path class="l thin" d="M25 46 L19 41 L28 38 Z"/>
      <path class="thin" d="M18 39 L18 29 L27 34 Z"/>
      <path class="l thin" d="M19 27 L25 21 L28 30 Z"/>
      <path class="hi" d="M15 24 C18 19 23 16 28 15 C24 18 20 21 17 26 Z"/>
      <path class="hi" d="M32 30 L33 33 L36 34 L33 35 L32 38 L31 35 L28 34 L31 33 Z"/>
    `,
  },
  {
    id: 'pearl',
    name: '珍珠',
    group: 'mineral',
    tint: 'ivory',
    tags: ['珍珠', '珠', '海', '宝石'],
    art: `
      <ellipse class="sh" cx="32" cy="56" rx="24" ry="3.5"/>
      <circle cx="30" cy="33" r="20"/>
      <path class="d n" d="M44 19 C52 28 50 44 40 50 C32 54 22 53 15 46 C24 52 36 50 42 42 C48 34 48 26 44 19 Z"/>
      <circle class="line" cx="30" cy="33" r="20"/>
      <ellipse class="hi" cx="22" cy="24" rx="6" ry="4.5" transform="rotate(-35 22 24)"/>
      <circle class="hi" cx="31" cy="19" r="1.8"/>
      <circle class="l" cx="48" cy="49" r="7"/>
      <circle class="hi" cx="46" cy="46.5" r="2"/>
      <circle cx="14" cy="52" r="5"/>
      <circle class="hi" cx="12.5" cy="50.5" r="1.4"/>
      <path class="hi" d="M53 6 L54.3 10.2 L58.5 11.5 L54.3 12.8 L53 17 L51.7 12.8 L47.5 11.5 L51.7 10.2 Z"/>
    `,
  },
];
