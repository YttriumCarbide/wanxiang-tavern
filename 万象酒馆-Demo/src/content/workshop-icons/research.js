/** 研究（group: research）。 */
export const RESEARCH_ICONS = [
  {
    id: 'speed',
    name: '加速',
    group: 'research',
    tint: 'azure',
    tags: ['加速', '速度', '快', '箭头'],
    art: `
      <path class="d" d="M6 16 L22 16 L38 32 L22 48 L6 48 L22 32 Z"/>
      <path d="M24 12 L40 12 L60 32 L40 52 L24 52 L44 32 Z"/>
      <path class="hi" opacity=".7" d="M29 15 L39 15 L54 30 L50 30 Z"/>
    `,
  },
  {
    id: 'clock',
    name: '时钟',
    group: 'research',
    tint: 'gold',
    tags: ['时钟', '时间', '缩短', '计时'],
    art: `
      <rect class="d" x="27" y="4" width="10" height="8" rx="2"/>
      <circle cx="32" cy="35" r="23"/>
      <circle class="l" cx="32" cy="35" r="17"/>
      <path class="line thin" d="M32 20 v4 M32 46 v4 M17 35 h4 M43 35 h4"/>
      <path class="line" d="M32 35 L32 24 M32 35 L41 40"/>
      <circle class="d" cx="32" cy="35" r="3"/>
      <path class="hi" d="M17 30 A16 16 0 0 1 27 19 L28 22 A13 13 0 0 0 20 31 Z"/>
    `,
  },
  {
    id: 'hourglass',
    name: '沙漏',
    group: 'research',
    tint: 'amber',
    tags: ['沙漏', '时间', '等待', '计时'],
    art: `
      <path class="glass" d="M19 12 L45 12 C45 24 36 28 35 32 C36 36 45 40 45 52 L19 52 C19 40 28 36 29 32 C28 28 19 24 19 12 Z"/>
      <path class="n" d="M23 19 L41 19 C40 25 34 28 32 31 C30 28 24 25 23 19 Z"/>
      <path class="n" d="M31 30 h2 v10 h-2 z"/>
      <path class="n" d="M21.5 50.5 C23 43 29 41 32 39 C35 41 41 43 42.5 50.5 Z"/>
      <rect class="d" x="13" y="6" width="38" height="7" rx="2"/>
      <rect class="d" x="13" y="51" width="38" height="7" rx="2"/>
      <path class="hi" opacity=".7" d="M22 15 h3 C25 22 28 26 29 29 C25 26 22 22 22 15 Z"/>
    `,
  },
  {
    id: 'parallel',
    name: '并行',
    group: 'research',
    tint: 'teal',
    tags: ['并行', '多线', '同时', '层'],
    art: `
      <rect class="d" x="22" y="6" width="34" height="24" rx="4"/>
      <rect class="l n" x="28" y="11" width="14" height="4" rx="2"/>
      <rect x="15" y="20" width="34" height="24" rx="4"/>
      <rect class="l n" x="21" y="25" width="20" height="4" rx="2"/>
      <rect class="l" x="8" y="34" width="34" height="24" rx="4"/>
      <rect class="d n" x="14" y="39" width="24" height="4" rx="2"/>
      <rect class="hi" opacity=".7" x="12" y="50" width="14" height="3" rx="1.5"/>
    `,
  },
  {
    id: 'multiply',
    name: '倍增',
    group: 'research',
    tint: 'gold',
    tags: ['倍增', '翻倍', '产量', '分裂'],
    art: `
      <path class="d" d="M18 28 L28 28 L36 14 L42 14 L42 20 L38 20 L31 32 L38 44 L42 44 L42 50 L36 50 L28 36 L18 36 Z"/>
      <circle cx="13" cy="32" r="9"/>
      <circle class="l" cx="49" cy="15" r="9"/>
      <circle class="l" cx="49" cy="49" r="9"/>
      <circle class="hi" cx="10" cy="29" r="2.5"/>
      <circle class="hi" cx="46" cy="12" r="2.5"/>
      <circle class="hi" cx="46" cy="46" r="2.5"/>
    `,
  },
  {
    id: 'upgrade',
    name: '升级',
    group: 'research',
    tint: 'jade',
    tags: ['升级', '提升', '向上', '箭头'],
    art: `
      <path d="M32 4 L56 28 L42 28 L42 44 L22 44 L22 28 L8 28 Z"/>
      <path class="l n" d="M32 6.5 L11.5 26.8 L23.3 26.8 L23.3 42.8 L32 42.8 Z"/>
      <rect class="d" x="22" y="48" width="20" height="4" rx="1"/>
      <rect class="d" x="22" y="55" width="20" height="4" rx="1"/>
      <path class="hi" opacity=".7" d="M30 10 L16 24 L19 24 L30 13 Z"/>
    `,
  },
  {
    id: 'magnifier',
    name: '放大镜',
    group: 'research',
    tint: 'azure',
    tags: ['放大镜', '观察', '搜索', '细节'],
    art: `
      <path class="d" d="M38 44 L44 38 L58 52 Q60 54 58 56 L56 58 Q54 60 52 58 Z"/>
      <path class="l" d="M38 44 L44 38 L48 42 L42 48 Z"/>
      <circle cx="27" cy="27" r="20"/>
      <circle class="glass" cx="27" cy="27" r="14"/>
      <path class="hi" d="M16 25 A11 11 0 0 1 25 16 L25.5 19 A8 8 0 0 0 19 25.5 Z"/>
      <circle class="hi" opacity=".6" cx="33" cy="33" r="2"/>
    `,
  },
  {
    id: 'compass',
    name: '圆规',
    group: 'research',
    tint: 'ash',
    tags: ['圆规', '设计', '测量', '图纸'],
    art: `
      <rect class="d" x="29" y="4" width="6" height="10" rx="2"/>
      <path d="M28 16 L35 19 L17 55 L13 59 L13 53 Z"/>
      <path class="l" d="M36 16 L29 19 L47 55 L51 59 L51 53 Z"/>
      <path class="line" d="M22 40 Q32 45 42 40"/>
      <circle class="d" cx="32" cy="17" r="6"/>
      <circle class="hi" cx="30" cy="15" r="2"/>
    `,
  },
  {
    id: 'bulb',
    name: '灵感',
    group: 'research',
    tint: 'gold',
    tags: ['灵感', '点子', '灯泡', '创意'],
    art: `
      <path class="l" d="M9 5 L10.5 8.5 L14 10 L10.5 11.5 L9 15 L7.5 11.5 L4 10 L7.5 8.5 Z"/>
      <path class="l" d="M55 5 L56.5 8.5 L60 10 L56.5 11.5 L55 15 L53.5 11.5 L50 10 L53.5 8.5 Z"/>
      <path d="M32 6 C44 6 52 15 52 26 C52 34 46 38 43 44 L21 44 C18 38 12 34 12 26 C12 15 20 6 32 6 Z"/>
      <circle class="l n" cx="32" cy="27" r="11"/>
      <path class="line thin" d="M26 44 L26 34 L29 30 L32 34 L35 30 L38 34 L38 44"/>
      <rect class="iron" x="21" y="44" width="22" height="6" rx="2"/>
      <rect class="iron-l" x="23" y="50" width="18" height="5" rx="2"/>
      <path class="iron" d="M27 55 h10 l-2 4 h-6 z"/>
      <path class="hi" d="M18 23 C18 15 23 11 29 11 L29 14 C24 14 21 18 21 23 Z"/>
    `,
  },
  {
    id: 'quill',
    name: '羽毛笔',
    group: 'research',
    tint: 'ivory',
    tags: ['羽毛笔', '墨水', '记录', '书写'],
    art: `
      <path d="M20 36 C22 22 34 8 56 5 C54 20 44 32 26 36 Z"/>
      <path class="l n" d="M23 32 C27 22 37 12 52 8 C40 14 30 24 23 32 Z"/>
      <path class="line thin" d="M44 22 L50 20 M36 28 L42 27"/>
      <path class="line" d="M19 40 L48 12"/>
      <path class="glass" d="M8 40 h22 v16 q0 3 -3 3 h-16 q-3 0 -3 -3 z"/>
      <path class="ink n" d="M10 46 h18 v9 q0 2 -2 2 h-14 q-2 0 -2 -2 z"/>
      <rect class="d" x="12" y="33" width="14" height="7" rx="1.5"/>
      <rect class="hi" opacity=".7" x="12" y="43" width="3" height="10" rx="1.5"/>
    `,
  },
  {
    id: 'telescope',
    name: '望远镜',
    group: 'research',
    tint: 'night',
    tags: ['望远镜', '观测', '远见', '星空'],
    art: `
      <path class="l" d="M12 6 L13.8 10.2 L18 12 L13.8 13.8 L12 18 L10.2 13.8 L6 12 L10.2 10.2 Z"/>
      <path class="wood-l" d="M30 36 h4 v22 h-4 z"/>
      <path class="wood" d="M29 34 L33 35 L19 59 L14 58 Z"/>
      <path class="wood" d="M31 35 L35 34 L50 58 L45 59 Z"/>
      <g transform="rotate(-25 32 28)">
        <rect class="d" x="6" y="25" width="10" height="7" rx="1"/>
        <rect x="14" y="22" width="18" height="13" rx="2"/>
        <rect x="30" y="18" width="22" height="21" rx="2"/>
        <rect class="l" x="28" y="17" width="5" height="23" rx="1"/>
        <rect class="d" x="50" y="16" width="5" height="25" rx="1"/>
        <rect class="hi" opacity=".7" x="35" y="21" width="13" height="3" rx="1.5"/>
      </g>
    `,
  },
  {
    id: 'orbit',
    name: '星轨',
    group: 'research',
    tint: 'violet',
    tags: ['星轨', '轨道', '星辰', '天象'],
    art: `
      <g transform="rotate(-20 32 32)">
        <path class="l" fill-rule="evenodd" d="M5 32 A27 11 0 1 0 59 32 A27 11 0 1 0 5 32 Z M11 32 A21 7 0 1 0 53 32 A21 7 0 1 0 11 32 Z"/>
      </g>
      <circle cx="32" cy="32" r="14"/>
      <path class="d n" d="M44.5 26 A13 13 0 0 1 26 44.5 A15 15 0 0 0 44.5 26 Z"/>
      <g transform="rotate(-20 32 32)">
        <path class="l" d="M5 32 A27 11 0 0 0 59 32 L53 32 A21 7 0 0 1 11 32 Z"/>
      </g>
      <circle class="hi" cx="26" cy="25" r="3.5"/>
      <circle class="l" cx="52" cy="12" r="4"/>
    `,
  },
  {
    id: 'growth',
    name: '培育',
    group: 'research',
    tint: 'jade',
    tags: ['培育', '嫩芽', '成长', '种植'],
    art: `
      <path class="l" d="M50 4 L60 14 L54 14 L54 26 L46 26 L46 14 L40 14 Z"/>
      <path class="d" d="M30 48 C30 38 31 31 33 25 L36 26 C34 32 34 38 34 48 Z"/>
      <path d="M31 36 C22 38 11 32 9 21 C20 19 29 25 31 36 Z"/>
      <path d="M34 30 C34 20 42 14 52 16 C51 26 44 31 34 30 Z"/>
      <path class="line thin" d="M29 34 C23 31 18 27 14 23 M37 28 C41 25 44 22 48 19"/>
      <path class="wood" d="M10 58 C12 48 22 45 32 45 C42 45 52 48 54 58 Z"/>
      <path class="hi" opacity=".7" d="M13 23 C17 23 21 25 23 27 C19 27 16 26 13 23 Z"/>
    `,
  },
  {
    id: 'shield',
    name: '稳固',
    group: 'research',
    tint: 'azure',
    tags: ['稳固', '护盾', '防护', '稳定'],
    art: `
      <path d="M32 4 L54 11 C54 32 48 48 32 59 C16 48 10 32 10 11 Z"/>
      <path class="d n" d="M32 6.5 L32 56 C46 46 51.5 32 51.8 12.8 Z"/>
      <path class="l" d="M32 15 L44 19 C44 32 40 41 32 48 C24 41 20 32 20 19 Z"/>
      <path class="hi" opacity=".7" d="M14 13 L17.5 12 C17.5 28 20.5 38 26 46 C19 39 14 28 14 13 Z"/>
    `,
  },
  {
    id: 'thermometer',
    name: '温控',
    group: 'research',
    tint: 'ember',
    tags: ['温控', '温度', '火候', '调节'],
    art: `
      <path class="l" d="M8 22 L15 13 L22 22 Z"/>
      <path class="d" d="M8 29 L22 29 L15 38 Z"/>
      <path class="glass" d="M26 10 A6 6 0 0 1 38 10 V38 A11 11 0 1 1 26 38 Z"/>
      <rect class="n" x="29.5" y="22" width="5" height="22"/>
      <circle cx="32" cy="47" r="7"/>
      <path class="line thin" d="M42 12 h6 M42 19 h4 M42 26 h6 M42 33 h4"/>
      <rect class="hi" opacity=".7" x="28" y="9" width="2" height="24" rx="1"/>
      <circle class="hi" cx="30" cy="45" r="2"/>
    `,
  },
  {
    id: 'scale',
    name: '天平',
    group: 'research',
    tint: 'gold',
    tags: ['天平', '平衡', '配比', '称量'],
    art: `
      <rect class="d" x="29" y="14" width="6" height="38"/>
      <path class="d" d="M18 58 C18 52 24 50 32 50 C40 50 46 52 46 58 Z"/>
      <path class="line thin" d="M12 18 L6 36 M12 18 L18 36 M52 18 L46 36 M52 18 L58 36"/>
      <rect x="8" y="12" width="48" height="6" rx="3"/>
      <circle class="l" cx="32" cy="10" r="5"/>
      <path class="l" d="M4 36 h16 c0 6 -4 9 -8 9 c-4 0 -8 -3 -8 -9 z"/>
      <path class="l" d="M44 36 h16 c0 6 -4 9 -8 9 c-4 0 -8 -3 -8 -9 z"/>
      <rect class="hi" opacity=".7" x="12" y="13.5" width="14" height="2" rx="1"/>
    `,
  },
  {
    id: 'puzzle',
    name: '拼装',
    group: 'research',
    tint: 'teal',
    tags: ['拼装', '拼图', '组合', '模块'],
    art: `
      <path class="d" d="M13 21 L25 21 C23 17 25 11 31 11 C37 11 39 17 37 21 L49 21 L49 33 C53 31 59 33 59 39 C59 45 53 47 49 45 L49 57 L37 57 C39 53 37 49 31 49 C25 49 23 53 25 57 L13 57 L13 45 C17 47 21 45 21 39 C21 33 17 31 13 33 Z"/>
      <path d="M10 18 L22 18 C20 14 22 8 28 8 C34 8 36 14 34 18 L46 18 L46 30 C50 28 56 30 56 36 C56 42 50 44 46 42 L46 54 L34 54 C36 50 34 46 28 46 C22 46 20 50 22 54 L10 54 L10 42 C14 44 18 42 18 36 C18 30 14 28 10 30 Z"/>
      <path class="hi" opacity=".7" d="M13 21 h7 v3 h-4 v3 h-3 z"/>
      <circle class="hi" cx="26" cy="12" r="2"/>
    `,
  },
  {
    id: 'lock',
    name: '封存',
    group: 'research',
    tint: 'gold',
    tags: ['封存', '锁', '保存', '密封'],
    art: `
      <path class="d" d="M18 30 V20 A14 14 0 0 1 46 20 V30 H39 V20 A7 7 0 0 0 25 20 V30 Z"/>
      <rect x="10" y="28" width="44" height="30" rx="5"/>
      <path class="ink" d="M32 37 A5 5 0 0 1 35 46 L37 53 H27 L29 46 A5 5 0 0 1 32 37 Z"/>
      <rect class="hi" opacity=".6" x="14" y="32" width="4" height="20" rx="2"/>
    `,
  },
  {
    id: 'unlock',
    name: '解锁',
    group: 'research',
    tint: 'gold',
    tags: ['解锁', '开启', '新配方', '锁'],
    art: `
      <path class="l" d="M14 7 L15.8 12.2 L21 14 L15.8 15.8 L14 21 L12.2 15.8 L7 14 L12.2 12.2 Z"/>
      <path class="d" d="M32 32 V18 A12 12 0 0 1 56 18 V26 H49 V18 A5 5 0 0 0 39 18 V32 Z"/>
      <rect x="6" y="30" width="40" height="28" rx="5"/>
      <path class="ink" d="M26 38 A5 5 0 0 1 29 47 L31 53 H21 L23 47 A5 5 0 0 1 26 38 Z"/>
      <rect class="hi" opacity=".6" x="10" y="34" width="4" height="18" rx="2"/>
    `,
  },
  {
    id: 'target',
    name: '精准',
    group: 'research',
    tint: 'ruby',
    tags: ['精准', '靶心', '命中', '品质'],
    art: `
      <circle cx="30" cy="34" r="25"/>
      <circle class="l" cx="30" cy="34" r="18"/>
      <circle cx="30" cy="34" r="11"/>
      <circle class="d" cx="30" cy="34" r="4.5"/>
      <path class="wood" d="M29 33 L52 10 L55 13 L32 36 Z"/>
      <path class="l" d="M47 13 L50 5 L56 11 Z"/>
      <path class="l" d="M54 19 L60 14 L56 11 Z"/>
      <path class="hi" d="M10 28 A21 21 0 0 1 20 15 L21.5 17.5 A18 18 0 0 0 13 29 Z"/>
    `,
  },
  {
    id: 'cycle',
    name: '循环',
    group: 'research',
    tint: 'jade',
    tags: ['循环', '回收', '复用', '往复'],
    art: `
      <path d="M8.4 36.2 A24 24 0 0 1 52.8 20 L56.2 18 L53.4 30 L41.5 26.5 L45 24.5 A15 15 0 0 0 17.2 34.6 Z"/>
      <path class="l" d="M55.6 27.8 A24 24 0 0 1 11.2 44 L7.8 46 L10.6 34 L22.5 37.5 L19 39.5 A15 15 0 0 0 46.8 29.4 Z"/>
      <path class="hi" opacity=".7" d="M14 27 A20 20 0 0 1 26 14 L27 16.5 A17 17 0 0 0 17 28 Z"/>
    `,
  },
  {
    id: 'funnel',
    name: '过滤',
    group: 'research',
    tint: 'frost',
    tags: ['过滤', '漏斗', '提纯', '筛选'],
    art: `
      <path d="M6 12 L58 12 L37 32 L37 44 L27 50 L27 32 Z"/>
      <path class="line thin" d="M14 20 L50 20 M21 26 L43 26"/>
      <ellipse class="d" cx="32" cy="12" rx="26" ry="5"/>
      <ellipse class="sh" cx="32" cy="12.5" rx="21" ry="3"/>
      <path class="hi" opacity=".6" d="M13 18 L17 18 L29 31 L29 34 Z"/>
      <path class="l" d="M32 51 C34 54 35 55.5 35 57 A3 3 0 0 1 29 57 C29 55.5 30 54 32 51 Z"/>
    `,
  },
  {
    id: 'eye',
    name: '鉴别',
    group: 'research',
    tint: 'violet',
    tags: ['鉴别', '眼睛', '洞察', '辨识'],
    art: `
      <path class="line" d="M32 6 V12 M18 10 L21 15 M46 10 L43 15"/>
      <path class="l" d="M4 36 C14 20 50 20 60 36 C50 52 14 52 4 36 Z"/>
      <circle cx="32" cy="36" r="12"/>
      <circle class="ink" cx="32" cy="36" r="5"/>
      <circle class="hi" cx="28" cy="32" r="3"/>
    `,
  },
  {
    id: 'taste',
    name: '品鉴',
    group: 'research',
    tint: 'rose',
    tags: ['品鉴', '酒杯', '品味', '评级'],
    art: `
      <rect class="glass" x="28" y="30" width="4" height="20"/>
      <ellipse class="glass" cx="30" cy="54" rx="12" ry="4"/>
      <path class="glass" d="M14 6 L46 6 C46 22 40 30 30 30 C20 30 14 22 14 6 Z"/>
      <path class="n" d="M15.5 14 L44.5 14 C44 24 38 28.5 30 28.5 C22 28.5 16 24 15.5 14 Z"/>
      <path class="hi" opacity=".7" d="M18 9 h3 C21 16 22 21 25 25 C20 22 18 16 18 9 Z"/>
      <path class="l" d="M52 15 L54 20 L59 22 L54 24 L52 29 L50 24 L45 22 L50 20 Z"/>
      <path class="l" d="M54 40 L55.2 42.8 L58 44 L55.2 45.2 L54 48 L52.8 45.2 L50 44 L52.8 42.8 Z"/>
    `,
  },
  {
    id: 'sigil',
    name: '法阵',
    group: 'research',
    tint: 'teal',
    tags: ['法阵', '符文', '魔法', '附魔'],
    art: `
      <circle class="d" cx="32" cy="32" r="22"/>
      <path class="l" d="M32 12 L49.3 42 L14.7 42 Z"/>
      <path class="l" d="M32 52 L49.3 22 L14.7 22 Z"/>
      <circle cx="32" cy="32" r="6"/>
      <path fill-rule="evenodd" d="M4 32 A28 28 0 1 0 60 32 A28 28 0 1 0 4 32 Z M10 32 A22 22 0 1 0 54 32 A22 22 0 1 0 10 32 Z"/>
      <circle class="hi" cx="32" cy="7" r="1.8"/>
      <circle class="hi" cx="57" cy="32" r="1.8"/>
      <circle class="hi" cx="32" cy="57" r="1.8"/>
      <circle class="hi" cx="7" cy="32" r="1.8"/>
    `,
  },
  {
    id: 'medal',
    name: '勋章',
    group: 'research',
    tint: 'gold',
    tags: ['勋章', '荣誉', '成就', '奖励'],
    art: `
      <path class="d" d="M16 4 L28 4 L36 30 L26 32 Z"/>
      <path class="l" d="M48 4 L36 4 L28 30 L38 32 Z"/>
      <circle cx="32" cy="42" r="16"/>
      <circle class="l" cx="32" cy="42" r="11"/>
      <path d="M32 34 L34 39.25 L39.6 39.5 L35.2 43.05 L36.7 48.5 L32 45.4 L27.3 48.5 L28.8 43.05 L24.4 39.5 L30 39.25 Z"/>
      <path class="hi" d="M19 38 A13 13 0 0 1 26 29.5 L27 32 A10 10 0 0 0 22 38.5 Z"/>
    `,
  },
  {
    id: 'crown',
    name: '王冠',
    group: 'research',
    tint: 'gold',
    tags: ['王冠', '至尊', '大师', '顶级'],
    art: `
      <path d="M8 22 L20 34 L32 14 L44 34 L56 22 L52 50 L12 50 Z"/>
      <path class="l n" d="M32 18 L23 34 L20 46 L32 46 Z"/>
      <rect class="d" x="10" y="46" width="44" height="10" rx="2"/>
      <circle class="l" cx="22" cy="51" r="2.5"/>
      <circle class="l" cx="32" cy="51" r="2.5"/>
      <circle class="l" cx="42" cy="51" r="2.5"/>
      <circle class="l" cx="8" cy="20" r="4"/>
      <circle class="l" cx="32" cy="11" r="4"/>
      <circle class="l" cx="56" cy="20" r="4"/>
      <path class="hi" opacity=".7" d="M12 28 L15 31 L14 42 L13 42 Z"/>
    `,
  },
  {
    id: 'tome',
    name: '秘典',
    group: 'research',
    tint: 'violet',
    tags: ['秘典', '书', '知识', '典籍'],
    art: `
      <rect class="l" x="14" y="11" width="40" height="47" rx="3"/>
      <path class="line thin" d="M50 16 V54 M18 54 H50"/>
      <rect x="10" y="6" width="40" height="48" rx="4"/>
      <rect class="d" x="10" y="6" width="8" height="48" rx="3"/>
      <path class="l" d="M34 18 L41 29 L34 40 L27 29 Z"/>
      <rect class="d" x="42" y="24" width="15" height="10" rx="2"/>
      <rect class="iron-l" x="45" y="26" width="6" height="6" rx="1"/>
      <rect class="hi" opacity=".6" x="21" y="9" width="3" height="40" rx="1.5"/>
    `,
  },
  {
    id: 'checklist',
    name: '工序',
    group: 'research',
    tint: 'ivory',
    tags: ['工序', '清单', '流程', '步骤'],
    art: `
      <rect x="12" y="8" width="40" height="52" rx="3"/>
      <rect class="d" x="22" y="4" width="20" height="9" rx="2"/>
      <rect class="l" x="17" y="18" width="9" height="9" rx="1.5"/>
      <rect class="d n" x="31" y="20.5" width="16" height="4" rx="2"/>
      <rect class="l" x="17" y="32" width="9" height="9" rx="1.5"/>
      <rect class="d n" x="31" y="34.5" width="16" height="4" rx="2"/>
      <rect class="l" x="17" y="46" width="9" height="9" rx="1.5"/>
      <rect class="d n" x="31" y="48.5" width="12" height="4" rx="2"/>
      <path class="line" d="M18 21 L21.5 25.5 L28 16"/>
      <path class="line" d="M18 35 L21.5 39.5 L28 30"/>
    `,
  },
  {
    id: 'experiment',
    name: '实验',
    group: 'research',
    tint: 'teal',
    tags: ['实验', '烧瓶', '炼金', '研究'],
    art: `
      <path class="fire-l" d="M14 8 L15.8 12.2 L20 14 L15.8 15.8 L14 20 L12.2 15.8 L8 14 L12.2 12.2 Z"/>
      <path class="glass" d="M25 8 H39 V22 L51 46 C54 52 51 58 45 58 H19 C13 58 10 52 13 46 L25 22 Z"/>
      <path class="n" d="M18.6 38 L45.4 38 L49.5 47 C51.5 51 49 55.5 45 55.5 H19 C15 55.5 12.5 51 14.5 47 Z"/>
      <circle class="l" cx="27" cy="47" r="3"/>
      <circle class="l" cx="37" cy="51" r="2"/>
      <rect class="d" x="23" y="5" width="18" height="5" rx="2"/>
      <circle class="l" cx="45" cy="13" r="3.5"/>
      <circle class="l" cx="52" cy="6" r="2.5"/>
      <path class="hi" opacity=".6" d="M27 25 L21 36 L23.5 36 L29 26 Z"/>
    `,
  },
  {
    id: 'craft',
    name: '工艺',
    group: 'research',
    tint: 'copper',
    tags: ['工艺', '锤子', '锻造', '制作'],
    art: `
      <path class="wood" d="M11.5 49.5 L41.5 19.5 L46.5 24.5 L16.5 54.5 Z"/>
      <path d="M37.6 7.2 L58.8 28.4 L50.4 36.8 L29.2 15.6 Z"/>
      <path class="l" d="M56.2 25.7 L58.8 28.4 L50.4 36.8 L47.7 34.2 Z"/>
      <path class="d" d="M37.6 7.2 L40.3 9.8 L31.8 18.3 L29.2 15.6 Z"/>
      <path class="hi" opacity=".7" d="M41 12 L52 23 L50.5 24.5 L39.5 13.5 Z"/>
      <path class="fire-l" d="M50 41 L52 46 L57 48 L52 50 L50 55 L48 50 L43 48 L48 46 Z"/>
      <circle class="fire" cx="41" cy="54" r="2"/>
      <circle class="fire" cx="58" cy="57" r="1.8"/>
    `,
  },
  {
    id: 'refine',
    name: '精炼',
    group: 'research',
    tint: 'amber',
    tags: ['精炼', '精华', '萃取', '滴'],
    art: `
      <path class="d" d="M20 4 H44 V10 L38 16 H26 L20 10 Z"/>
      <path d="M32 18 C38 28 46 36 46 44 A14 14 0 0 1 18 44 C18 36 26 28 32 18 Z"/>
      <path class="l n" d="M33 27 C37 33 42 38 42 44 A10 10 0 0 1 34 54 C38 46 37 35 33 27 Z"/>
      <path class="hi" d="M23 42 A9 9 0 0 0 27 52 L26 54 A11 11 0 0 1 21 42 Z"/>
      <path class="l" d="M52 20 L53.5 24.5 L58 26 L53.5 27.5 L52 32 L50.5 27.5 L46 26 L50.5 24.5 Z"/>
      <path class="l" d="M11 28 L12.2 30.8 L15 32 L12.2 33.2 L11 36 L9.8 33.2 L7 32 L9.8 30.8 Z"/>
    `,
  },
  {
    id: 'harvest',
    name: '采收',
    group: 'research',
    tint: 'wheat',
    tags: ['采收', '镰刀', '麦穗', '收获'],
    art: `
      <path class="wood" d="M41 40 L47 36 L59 54 L53 58 Z"/>
      <path class="iron-l" d="M45 39 C34 35 30 22 36 12 C42 4 54 4 59 10 C50 8 43 12 42 20 C41 28 44 33 48 36 Z"/>
      <path class="d" d="M9 57 L27 21 L30 22 L12 58 Z"/>
      <ellipse cx="28" cy="17" rx="3.5" ry="6" transform="rotate(26 28 17)"/>
      <ellipse cx="20" cy="25" rx="3" ry="5.5" transform="rotate(-9 20 25)"/>
      <ellipse cx="17" cy="31" rx="3" ry="5.5" transform="rotate(-9 17 31)"/>
      <ellipse cx="14" cy="37" rx="3" ry="5.5" transform="rotate(-9 14 37)"/>
      <ellipse class="l" cx="29" cy="28" rx="3" ry="5.5" transform="rotate(61 29 28)"/>
      <ellipse class="l" cx="26" cy="34" rx="3" ry="5.5" transform="rotate(61 26 34)"/>
      <ellipse class="l" cx="23" cy="40" rx="3" ry="5.5" transform="rotate(61 23 40)"/>
    `,
  },
];
