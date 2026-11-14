/** 加工构件与工具文书（group: crafted / tool）。 */
export const CRAFTED_ICONS = [
  {
    id: 'ingot',
    name: '金属锭',
    group: 'crafted',
    tint: 'gold',
    tags: ['锭', '金属', '块', '黄铜锭', '铁锭', '金锭'],
    art: `
      <ellipse class="sh" cx="32" cy="55" rx="22" ry="4.5"/>
      <path class="d" d="M10 44 L18 28 L46 28 L54 44 L48 52 L16 52 Z"/>
      <path d="M10 44 L18 28 L46 28 L38 44 Z"/>
      <path class="l" d="M18 28 L24 20 L50 20 L44 28 Z"/>
      <path class="d" d="M44 28 L50 20 L54 36 L48 44 Z"/>
      <path class="hi" d="M22 23 L45 23 L43 26 L20 26 Z"/>
    `,
  },
  {
    id: 'brick',
    name: '砖块',
    group: 'crafted',
    tint: 'copper',
    tags: ['砖', '芯砖', '耐火砖', '石砖', '砌块'],
    art: `
      <ellipse class="sh" cx="32" cy="56" rx="22" ry="4"/>
      <path class="d" d="M10 34 L34 44 L54 34 L54 48 L34 56 L10 46 Z"/>
      <path d="M10 34 L34 44 L34 56 L10 46 Z"/>
      <path class="l" d="M10 34 L30 24 L54 34 L34 44 Z"/>
      <circle class="d thin" cx="25" cy="33" r="2.2"/>
      <circle class="d thin" cx="34" cy="36.5" r="2.2"/>
      <circle class="d thin" cx="41" cy="33" r="2.2"/>
      <path class="hi" d="M14 34 L30 26.5 L32 27.5 L16 35 Z"/>
    `,
  },
  {
    id: 'tile',
    name: '陶片',
    group: 'crafted',
    tint: 'earth',
    tags: ['陶片', '瓦片', '瓷片', '耐火陶片', '板瓦'],
    art: `
      <ellipse class="sh" cx="32" cy="56" rx="20" ry="4"/>
      <path class="d" d="M14 40 Q26 30 38 40 L48 24 Q36 14 24 24 Z"/>
      <path d="M16 48 Q28 38 42 48 L52 30 Q38 20 26 30 Z"/>
      <path class="l" d="M20 44 Q30 36 40 44 L48 30 Q38 22 28 30 Z"/>
      <path class="line thin" d="M22 40 Q31 33 40 40"/>
      <path class="hi" d="M27 29 Q35 24 43 29 L41 32 Q34 27 26 32 Z"/>
    `,
  },
  {
    id: 'plank',
    name: '木板',
    group: 'crafted',
    tint: 'earth',
    tags: ['木板', '木条', '香木条', '板材', '木材'],
    art: `
      <ellipse class="sh" cx="32" cy="56" rx="22" ry="4"/>
      <path class="d" d="M10 42 L44 28 L54 34 L20 48 Z"/>
      <path class="d" d="M10 42 L20 48 L20 53 L10 47 Z"/>
      <path class="d" d="M20 48 L54 34 L54 39 L20 53 Z"/>
      <path d="M10 33 L44 19 L54 25 L20 39 Z"/>
      <path class="l" d="M14 31.5 L43 19.5 L50 23.5 L21 35.5 Z"/>
      <path d="M10 33 L20 39 L20 44 L10 38 Z"/>
      <path class="d" d="M20 39 L54 25 L54 30 L20 44 Z"/>
      <path class="line thin" d="M22 31 L42 23"/>
    `,
  },
  {
    id: 'gear',
    name: '齿轮',
    group: 'crafted',
    tint: 'copper',
    tags: ['齿轮', '齿盘', '机械', '传动', '零件'],
    art: `
      <ellipse class="sh" cx="32" cy="57" rx="18" ry="3.5"/>
      <path d="M28 8 L36 8 L38 15 L44 17 L50 13 L55 18 L51 24 L53 30 L60 32 L60 38 L53 40 L51 46 L55 52 L50 57 L44 53 L38 55 L36 60 L28 60 L26 55 L20 53 L14 57 L9 52 L13 46 L11 40 L4 38 L4 32 L11 30 L13 24 L9 18 L14 13 L20 17 L26 15 Z"/>
      <circle class="l" cx="32" cy="34" r="14"/>
      <circle class="d" cx="32" cy="34" r="7"/>
      <circle class="ink" cx="32" cy="34" r="3.5"/>
      <path class="hi" d="M22 25 A12 12 0 0 1 38 22 L36 25 A9 9 0 0 0 24 27 Z"/>
    `,
  },
  {
    id: 'mechanism',
    name: '机芯',
    group: 'crafted',
    tint: 'gold',
    tags: ['机芯', '发条', '回响机芯', '工坊机芯', '钟表', '核心零件'],
    art: `
      <ellipse class="sh" cx="32" cy="57" rx="20" ry="3.5"/>
      <circle class="d" cx="32" cy="32" r="22"/>
      <circle cx="32" cy="32" r="18"/>
      <circle class="ink" cx="32" cy="32" r="13"/>
      <circle class="iron" cx="25" cy="27" r="6"/>
      <circle class="l" cx="38" cy="36" r="7"/>
      <circle class="d" cx="38" cy="36" r="2.8"/>
      <path class="l" d="M29 6 L35 6 L35 11 L29 11 Z"/>
      <path class="line thin" d="M32 14 L32 18 M32 46 L32 50 M14 32 L18 32 M46 32 L50 32"/>
      <path class="hi" d="M19 20 A16 16 0 0 1 35 15 L34 18 A13 13 0 0 0 21 22 Z"/>
    `,
  },
  {
    id: 'spring',
    name: '弹簧',
    group: 'crafted',
    tint: 'ash',
    tags: ['弹簧', '发条簧', '螺旋', '缓冲'],
    art: `
      <ellipse class="sh" cx="32" cy="57" rx="16" ry="3.5"/>
      <ellipse class="d" cx="32" cy="48" rx="16" ry="5"/>
      <path d="M16 42 C16 36, 48 36, 48 42 C48 46, 16 46, 16 42 Z"/>
      <path class="l" d="M16 33 C16 27, 48 27, 48 33 C48 37, 16 37, 16 33 Z"/>
      <path d="M16 24 C16 18, 48 18, 48 24 C48 28, 16 28, 16 24 Z"/>
      <ellipse class="l" cx="32" cy="16" rx="16" ry="5"/>
      <ellipse class="ink" cx="32" cy="16" rx="8" ry="2.2"/>
    `,
  },
  {
    id: 'bolt',
    name: '螺栓',
    group: 'crafted',
    tint: 'ash',
    tags: ['螺栓', '螺丝', '螺母', '铆钉', '紧固件'],
    art: `
      <ellipse class="sh" cx="32" cy="57" rx="15" ry="3.5"/>
      <rect x="25" y="24" width="14" height="28" rx="3"/>
      <path class="d" d="M25 31 L39 34 M25 38 L39 41 M25 45 L39 48"/>
      <polygon class="l" points="16,18 24,11 40,11 48,18 40,25 24,25"/>
      <polygon class="d" points="16,18 24,25 40,25 48,18 48,24 40,29 24,29 16,24"/>
      <ellipse class="hi" cx="32" cy="16" rx="7" ry="2.5"/>
    `,
  },
  {
    id: 'pipe',
    name: '导管',
    group: 'crafted',
    tint: 'copper',
    tags: ['导管', '管道', '弯管', '铜木导管', '琥珀导流管'],
    art: `
      <ellipse class="sh" cx="32" cy="57" rx="20" ry="3.5"/>
      <path d="M14 18 L32 18 Q46 18 46 32 L46 50 L32 50 L32 34 Q32 30 28 30 L14 30 Z"/>
      <rect class="l" x="10" y="15" width="6" height="18" rx="2"/>
      <rect class="l" x="29" y="46" width="20" height="6" rx="2"/>
      <ellipse class="ink" cx="12" cy="24" rx="2" ry="6"/>
      <path class="hi" d="M18 21 L31 21 Q40 21 41 30 L38 30 Q37 24 30 24 L18 24 Z"/>
    `,
  },
  {
    id: 'ring',
    name: '金属环',
    group: 'crafted',
    tint: 'gold',
    tags: ['环', '限流环', '圆环', '星火限流环', '垫圈', '法环'],
    art: `
      <ellipse class="sh" cx="32" cy="57" rx="18" ry="3.5"/>
      <circle cx="32" cy="32" r="21"/>
      <circle class="l" cx="32" cy="31" r="17"/>
      <circle class="ink" cx="32" cy="32" r="11"/>
      <rect class="d" x="28" y="8" width="8" height="7" rx="2"/>
      <rect class="d" x="28" y="49" width="8" height="7" rx="2"/>
      <rect class="d" x="8" y="28" width="7" height="8" rx="2"/>
      <rect class="d" x="49" y="28" width="7" height="8" rx="2"/>
      <path class="hi" d="M19 20 A15 15 0 0 1 28 15 L29 18 A12 12 0 0 0 21 22 Z"/>
    `,
  },
  {
    id: 'rod',
    name: '金属棒',
    group: 'crafted',
    tint: 'ash',
    tags: ['棒', '杆', '轴', '金属棒', '铜棒'],
    art: `
      <ellipse class="sh" cx="32" cy="56" rx="20" ry="3.5"/>
      <path class="d" d="M12 42 L42 12 L52 22 L22 52 Z"/>
      <path d="M10 38 L40 8 L48 16 L18 46 Z"/>
      <ellipse class="l" cx="14" cy="42" rx="6" ry="4" transform="rotate(45 14 42)"/>
      <ellipse class="l" cx="19" cy="47" rx="6" ry="4" transform="rotate(45 19 47)"/>
      <path class="hi" d="M16 36 L40 12 L42 14 L18 38 Z"/>
    `,
  },
  {
    id: 'plate',
    name: '板材',
    group: 'crafted',
    tint: 'ash',
    tags: ['板材', '金属板', '铁板', '铜板', '护板'],
    art: `
      <ellipse class="sh" cx="32" cy="56" rx="20" ry="4"/>
      <rect class="d" x="16" y="18" width="36" height="34" rx="4"/>
      <rect x="12" y="12" width="36" height="34" rx="4"/>
      <rect class="l" x="16" y="16" width="28" height="26" rx="2"/>
      <circle class="d" cx="19" cy="19" r="2"/>
      <circle class="d" cx="41" cy="19" r="2"/>
      <circle class="d" cx="19" cy="39" r="2"/>
      <circle class="d" cx="41" cy="39" r="2"/>
      <path class="hi" d="M20 20 L36 20 L24 34 L20 34 Z"/>
    `,
  },
  {
    id: 'chain',
    name: '链条',
    group: 'crafted',
    tint: 'ash',
    tags: ['链条', '锁链', '铁链', '环链'],
    art: `
      <ellipse class="sh" cx="32" cy="57" rx="18" ry="3.5"/>
      <rect x="10" y="34" width="22" height="13" rx="6.5" transform="rotate(-35 21 40)"/>
      <rect class="ink" x="15" y="37" width="12" height="7" rx="3.5" transform="rotate(-35 21 40)"/>
      <rect class="l" x="21" y="24" width="22" height="13" rx="6.5" transform="rotate(25 32 30)"/>
      <rect class="ink" x="26" y="27" width="12" height="7" rx="3.5" transform="rotate(25 32 30)"/>
      <rect x="32" y="14" width="22" height="13" rx="6.5" transform="rotate(-35 43 20)"/>
      <rect class="ink" x="37" y="17" width="12" height="7" rx="3.5" transform="rotate(-35 43 20)"/>
    `,
  },
  {
    id: 'rope',
    name: '绳索',
    group: 'crafted',
    tint: 'wheat',
    tags: ['绳索', '麻绳', '缆绳', '藤绳'],
    art: `
      <ellipse class="sh" cx="32" cy="56" rx="19" ry="4"/>
      <ellipse class="d" cx="32" cy="36" rx="20" ry="15"/>
      <ellipse cx="32" cy="32" rx="18" ry="13"/>
      <ellipse class="l" cx="32" cy="29" rx="13" ry="9"/>
      <ellipse class="ink" cx="32" cy="29" rx="6" ry="4"/>
      <path d="M42 40 Q50 45 48 53 L41 52 Q43 46 37 43 Z"/>
      <path class="line thin" d="M18 28 L24 34 M28 40 L34 45 M40 24 L46 30"/>
    `,
  },
  {
    id: 'lens',
    name: '透镜',
    group: 'crafted',
    tint: 'frost',
    tags: ['透镜', '镜片', '滤晶', '晶镜', '光学'],
    art: `
      <ellipse class="sh" cx="32" cy="57" rx="18" ry="3.5"/>
      <circle class="wood" cx="32" cy="32" r="21"/>
      <circle cx="32" cy="32" r="16"/>
      <path class="l n" d="M20 22 A15 15 0 0 1 44 22 A15 15 0 0 1 20 42 Z"/>
      <path class="hi" d="M22 20 L30 20 L20 32 L18 26 Z"/>
      <path class="hi" d="M35 22 L39 22 L25 38 L22 38 Z"/>
    `,
  },
  {
    id: 'coil',
    name: '线圈',
    group: 'crafted',
    tint: 'copper',
    tags: ['线圈', '电磁', '铜线', '绕组', '感应'],
    art: `
      <ellipse class="sh" cx="32" cy="57" rx="18" ry="3.5"/>
      <rect class="iron" x="26" y="10" width="12" height="44" rx="3"/>
      <rect class="d" x="16" y="14" width="32" height="6" rx="3"/>
      <rect class="d" x="16" y="44" width="32" height="6" rx="3"/>
      <rect x="19" y="21" width="26" height="5" rx="2.5"/>
      <rect class="l" x="19" y="27" width="26" height="5" rx="2.5"/>
      <rect x="19" y="33" width="26" height="5" rx="2.5"/>
      <rect class="l" x="19" y="39" width="26" height="4" rx="2"/>
      <path class="hi" d="M22 22 L30 22 L30 41 L22 41 Z" opacity="0.35"/>
    `,
  },
  {
    id: 'frame',
    name: '木构件',
    group: 'crafted',
    tint: 'earth',
    tags: ['构件', '铜木构件', '木架', '榫卯', '支架'],
    art: `
      <ellipse class="sh" cx="32" cy="56" rx="20" ry="4"/>
      <rect class="wood" x="12" y="12" width="12" height="40" rx="2"/>
      <rect class="wood-l" x="12" y="36" width="40" height="12" rx="2"/>
      <path class="wood" d="M24 22 L42 36 L34 36 L24 28 Z"/>
      <path d="M10 12 L26 12 L26 22 L10 22 Z"/>
      <path class="l" d="M40 34 L52 34 L52 50 L40 50 Z"/>
      <rect class="d" x="12" y="36" width="14" height="12" rx="2"/>
      <circle class="hi" cx="19" cy="42" r="2"/>
    `,
  },
  {
    id: 'glue',
    name: '胶块',
    group: 'crafted',
    tint: 'amber',
    tags: ['胶', '封桶胶', '树脂', '粘合剂', '蜂蜡'],
    art: `
      <ellipse class="sh" cx="32" cy="56" rx="19" ry="4"/>
      <path class="wood" d="M14 44 L50 44 L46 53 L18 53 Z"/>
      <path d="M18 44 Q16 26 28 24 Q33 16 41 24 Q49 28 46 44 Z"/>
      <path class="l n" d="M22 42 Q21 29 30 27 Q34 21 39 27 Q43 31 41 42 Z"/>
      <path d="M24 44 Q24 52 28 52 Q32 52 32 44 Z"/>
      <ellipse class="hi" cx="28" cy="29" rx="4" ry="2.5" transform="rotate(-20 28 29)"/>
    `,
  },
  {
    id: 'powder',
    name: '粉末',
    group: 'crafted',
    tint: 'ivory',
    tags: ['粉', '木屑', '助熔粉', '酿香木屑', '灰烬', '盐'],
    art: `
      <ellipse class="sh" cx="32" cy="56" rx="22" ry="4"/>
      <path class="wood" d="M10 42 L54 42 L46 52 L18 52 Z"/>
      <path d="M14 42 Q22 20 32 18 Q42 20 50 42 Z"/>
      <path class="l n" d="M19 41 Q26 24 32 22 Q36 25 38 41 Z"/>
      <circle cx="20" cy="24" r="2"/>
      <circle class="l" cx="44" cy="26" r="2.2"/>
      <circle cx="32" cy="13" r="1.8"/>
      <path class="hi" d="M26 26 L31 23 L33 34 L25 34 Z"/>
    `,
  },
  {
    id: 'cloth',
    name: '布匹',
    group: 'crafted',
    tint: 'rose',
    tags: ['布', '丝绸', '织物', '滤布', '帆布'],
    art: `
      <ellipse class="sh" cx="32" cy="56" rx="21" ry="4"/>
      <path class="d" d="M14 24 L44 16 C50 16, 52 36, 46 38 L16 46 Z"/>
      <path d="M12 24 L42 16 C47 18, 47 34, 42 36 L12 44 Z"/>
      <ellipse class="l" cx="14" cy="34" rx="5" ry="10"/>
      <ellipse class="ink" cx="14" cy="34" rx="2" ry="4"/>
      <path class="l" d="M20 42 L48 34 L52 48 L24 54 Z"/>
      <path class="hi" d="M22 22 L38 18 L38 22 L22 26 Z"/>
    `,
  },
  {
    id: 'leather',
    name: '皮革',
    group: 'crafted',
    tint: 'earth',
    tags: ['皮革', '兽皮', '毛皮', '羊皮'],
    art: `
      <ellipse class="sh" cx="32" cy="57" rx="19" ry="3.5"/>
      <path d="M20 10 Q32 16 44 10 L52 20 Q44 30 50 44 L42 54 Q32 48 22 54 L14 44 Q20 30 12 20 Z"/>
      <path class="l n" d="M24 17 Q32 21 40 17 L44 23 Q39 31 43 41 L38 47 Q32 43 26 47 L21 41 Q25 31 20 23 Z"/>
      <path class="line thin" d="M28 26 L36 38 M36 26 L28 38"/>
    `,
  },
  {
    id: 'thread',
    name: '线轴',
    group: 'crafted',
    tint: 'violet',
    tags: ['线', '丝线', '纱线', '纺线', '线轴'],
    art: `
      <ellipse class="sh" cx="32" cy="57" rx="17" ry="3.5"/>
      <ellipse class="wood" cx="32" cy="50" rx="16" ry="5"/>
      <rect x="20" y="18" width="24" height="30" rx="4"/>
      <path class="l n" d="M22 20 L30 20 L30 46 L22 46 Z"/>
      <path class="line thin" d="M20 25 L44 25 M20 32 L44 32 M20 39 L44 39"/>
      <ellipse class="wood-l" cx="32" cy="16" rx="16" ry="5"/>
      <ellipse class="ink" cx="32" cy="16" rx="5" ry="1.8"/>
      <path class="line" d="M44 34 Q54 38 50 48"/>
    `,
  },
  {
    id: 'hammer',
    name: '锤子',
    group: 'tool',
    tint: 'ash',
    tags: ['锤', '锻锤', '木槌', '工具'],
    art: `
      <ellipse class="sh" cx="32" cy="57" rx="16" ry="3.5"/>
      <path class="wood" d="M29 22 L35 22 L37 54 L27 54 Z"/>
      <path class="wood-l n" d="M30 24 L32 24 L33 52 L29 52 Z"/>
      <path d="M12 12 L46 12 L52 18 L46 24 L12 24 Z"/>
      <rect class="l" x="10" y="10" width="10" height="16" rx="2"/>
      <path class="hi" d="M22 14 L42 14 L44 17 L22 17 Z"/>
    `,
  },
  {
    id: 'pickaxe',
    name: '镐',
    group: 'tool',
    tint: 'ash',
    tags: ['镐', '矿镐', '十字镐', '开采'],
    art: `
      <ellipse class="sh" cx="32" cy="57" rx="16" ry="3.5"/>
      <path class="wood" d="M29 18 L35 18 L36 54 L28 54 Z"/>
      <path d="M10 26 Q20 10 32 12 Q44 10 54 26 Q42 19 32 20 Q22 19 10 26 Z"/>
      <rect class="l" x="27" y="10" width="10" height="11" rx="2"/>
      <path class="hi" d="M16 20 Q24 14 27 14 L27 17 Q22 17 16 22 Z"/>
    `,
  },
  {
    id: 'wrench',
    name: '扳手',
    group: 'tool',
    tint: 'ash',
    tags: ['扳手', '钳子', '维修', '工具', '装配'],
    art: `
      <ellipse class="sh" cx="32" cy="57" rx="16" ry="3.5"/>
      <path d="M36 10 A12 12 0 1 0 50 24 L43 23 L39 17 L44 11 Z"/>
      <path d="M29 24 L38 29 L24 53 A5 5 0 1 1 15 47 Z"/>
      <circle class="ink" cx="20" cy="49" r="2.2"/>
      <path class="hi" d="M28 28 L32 30 L21 46 L18 44 Z"/>
    `,
  },
  {
    id: 'scroll',
    name: '卷轴',
    group: 'tool',
    tint: 'ivory',
    tags: ['卷轴', '羊皮卷', '配方', '契约', '文书'],
    art: `
      <ellipse class="sh" cx="32" cy="57" rx="18" ry="3.5"/>
      <rect class="wood" x="10" y="12" width="44" height="6" rx="3"/>
      <rect class="wood" x="10" y="48" width="44" height="6" rx="3"/>
      <rect x="15" y="16" width="34" height="34" rx="2"/>
      <path class="l n" d="M18 18 L30 18 L30 48 L18 48 Z"/>
      <path class="line thin" d="M22 25 L42 25 M22 32 L42 32 M22 39 L36 39"/>
      <circle class="d" cx="40" cy="41" r="4"/>
    `,
  },
  {
    id: 'book',
    name: '书本',
    group: 'tool',
    tint: 'azure',
    tags: ['书', '手记', '调酿手记', '笔记', '手册'],
    art: `
      <ellipse class="sh" cx="32" cy="57" rx="19" ry="3.5"/>
      <path class="d" d="M14 12 L46 10 L50 48 L18 52 Z"/>
      <path class="ivory" d="M18 48 L48 44 L50 51 L18 55 Z"/>
      <path d="M14 12 L46 10 L46 46 L14 50 Z"/>
      <path class="d" d="M14 12 L20 12 L20 50 L14 50 Z"/>
      <polygon class="l" points="31,20 35,28 43,29 37,35 38,43 31,39 24,43 25,35 19,29 27,28"/>
      <path class="hi" d="M22 15 L42 13.5 L42 16.5 L22 18 Z"/>
    `,
  },
  {
    id: 'blueprint',
    name: '蓝图',
    group: 'tool',
    tint: 'azure',
    tags: ['蓝图', '工坊蓝图', '图纸', '设计图', '海图'],
    art: `
      <ellipse class="sh" cx="32" cy="57" rx="22" ry="3.5"/>
      <rect x="10" y="14" width="44" height="36" rx="3"/>
      <ellipse class="l" cx="14" cy="32" rx="4" ry="18"/>
      <rect class="d" x="20" y="18" width="29" height="28" rx="1"/>
      <circle class="line thin" cx="34" cy="32" r="8"/>
      <path class="line thin" d="M24 24 L44 24 M24 40 L44 40 M34 20 L34 44"/>
      <path class="hi" d="M22 20 L46 20 L46 22 L22 22 Z"/>
    `,
  },
  {
    id: 'note',
    name: '纸页',
    group: 'tool',
    tint: 'ivory',
    tags: ['纸', '信件', '配方单', '便签', '文书'],
    art: `
      <ellipse class="sh" cx="32" cy="57" rx="17" ry="3.5"/>
      <path d="M16 10 L40 10 L50 20 L50 54 L16 54 Z"/>
      <path class="l n" d="M18 12 L38 12 L38 52 L18 52 Z"/>
      <path class="d" d="M40 10 L40 20 L50 20 Z"/>
      <path class="line thin" d="M22 26 L44 26 M22 34 L44 34 M22 42 L38 42"/>
    `,
  },
  {
    id: 'key',
    name: '钥匙',
    group: 'tool',
    tint: 'gold',
    tags: ['钥匙', '秘钥', '开启', '门禁'],
    art: `
      <ellipse class="sh" cx="32" cy="57" rx="18" ry="3.5"/>
      <circle cx="22" cy="24" r="12"/>
      <circle class="ink" cx="22" cy="24" r="5"/>
      <path d="M32 21 L54 21 L54 27 L50 27 L50 35 L44 35 L44 27 L40 27 L40 33 L35 33 L35 27 L32 27 Z"/>
      <path class="hi" d="M15 17 A9 9 0 0 1 26 15 L25 18 A6 6 0 0 0 17 19 Z"/>
    `,
  },
  {
    id: 'coin',
    name: '硬币',
    group: 'tool',
    tint: 'gold',
    tags: ['硬币', '金币', '银币', '铜币', '货币'],
    art: `
      <ellipse class="sh" cx="32" cy="57" rx="18" ry="3.5"/>
      <circle class="d" cx="32" cy="33" r="21"/>
      <circle cx="32" cy="31" r="20"/>
      <circle class="l" cx="32" cy="31" r="15"/>
      <polygon class="d" points="32,20 39,31 32,42 25,31"/>
      <path class="hi" d="M19 19 A16 16 0 0 1 34 14 L33 17 A13 13 0 0 0 21 21 Z"/>
    `,
  },
  {
    id: 'badge',
    name: '徽章',
    group: 'tool',
    tint: 'gold',
    tags: ['徽章', '纹章', '印记', '令牌'],
    art: `
      <ellipse class="sh" cx="32" cy="57" rx="16" ry="3.5"/>
      <path class="d" d="M22 36 L16 54 L26 49 L30 56 L32 38 Z"/>
      <path class="d" d="M42 36 L48 54 L38 49 L34 56 L32 38 Z"/>
      <path d="M14 12 L50 12 L48 30 Q48 44 32 48 Q16 44 16 30 Z"/>
      <path class="l" d="M20 17 L44 17 L43 29 Q43 39 32 42 Q21 39 21 29 Z"/>
      <circle class="hi" cx="27" cy="24" r="3"/>
    `,
  },
  {
    id: 'ticket',
    name: '票券',
    group: 'tool',
    tint: 'wheat',
    tags: ['券', '工坊券', '票券', '兑换券', '凭证'],
    art: `
      <ellipse class="sh" cx="32" cy="56" rx="22" ry="3.5"/>
      <path d="M8 20 L56 20 L56 27 A5 5 0 0 0 56 37 L56 44 L8 44 L8 37 A5 5 0 0 0 8 27 Z"/>
      <rect class="l" x="14" y="24" width="36" height="16" rx="2"/>
      <path class="line thin" d="M38 24 L38 40"/>
      <circle class="d" cx="26" cy="32" r="4"/>
      <path class="hi" d="M16 26 L34 26 L34 28 L16 28 Z"/>
    `,
  },
  {
    id: 'candle',
    name: '蜡烛',
    group: 'tool',
    tint: 'ivory',
    tags: ['蜡烛', '烛台', '照明', '香薰蜡'],
    art: `
      <ellipse class="sh" cx="32" cy="57" rx="18" ry="3.5"/>
      <ellipse class="iron" cx="32" cy="52" rx="16" ry="4"/>
      <rect x="23" y="26" width="18" height="26" rx="3"/>
      <path class="l" d="M23 28 Q28 36 30 32 Q34 40 37 32 L41 30 L41 26 L23 26 Z"/>
      <path class="fire" d="M32 8 Q40 16 36 23 Q32 26 28 23 Q24 16 32 8 Z"/>
      <path class="fire-l n" d="M32 13 Q36 18 34 22 Q32 24 30 22 Q28 18 32 13 Z"/>
    `,
  },
  {
    id: 'lantern',
    name: '灯笼',
    group: 'tool',
    tint: 'amber',
    tags: ['灯笼', '提灯', '矿灯', '星灯'],
    art: `
      <ellipse class="sh" cx="32" cy="58" rx="16" ry="3"/>
      <path class="line" d="M25 14 A7 7 0 0 1 39 14"/>
      <path class="iron" d="M18 18 L46 18 L42 13 L22 13 Z"/>
      <path class="glass" d="M20 18 L44 18 L41 46 L23 46 Z"/>
      <ellipse class="l" cx="32" cy="33" rx="7" ry="9"/>
      <ellipse class="hi" cx="32" cy="33" rx="3.5" ry="5"/>
      <rect class="iron" x="19" y="46" width="26" height="6" rx="2"/>
    `,
  },
];
