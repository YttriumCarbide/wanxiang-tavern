import { APEP_ID } from '../apep-presentation.js';
import { html } from '../shared/html.js';

export const OVERLORD_TUTORIALS = Object.freeze({
  apepLamb: Object.freeze({
    id: 'apepLamb',
    bossName: '阿佩普的羔羊',
    rankLabel: '界隙深处 · 灰之疫胎',
    accent: '#e05e78',
    portrait: './assets/portraits/apep-lamb.svg',
    headline: '深渊沉疫与腐化换位格',
    intro:
      '阿佩普已将深渊精神污染铺满战场四缘。前排与后排如今承受同等沉疫伤害，但前排连续承受两轮侵蚀会被锁死一切回复与护盾手段！',
    keyTakeaway:
      '前排连承 2 回合【沉疫】触发禁盾/禁疗/禁回蓝；换回后场立刻解封！二三阶段用【换位】或【迟缓】应对腐化格。',
    diagramSvg: html`<svg viewBox="0 0 360 156" class="overlord-tut-svg" aria-hidden="true">
      <rect
        x="8"
        y="8"
        width="344"
        height="140"
        rx="10"
        fill="#130916"
        stroke="#c94b6c"
        stroke-width="2"
        stroke-dasharray="6 4"
      />
      <text x="180" y="24" text-anchor="middle" fill="#ff9eb4" font-size="10" font-weight="700">
        战场边缘沉疫灵压 · 前后场每回合承受同等伤害
      </text>
      <rect x="26" y="36" width="142" height="58" rx="6" fill="#2b1220" stroke="#e0647e" />
      <text x="97" y="55" text-anchor="middle" fill="#ffd9e2" font-size="11" font-weight="700">
        前场连续 2 回合
      </text>
      <text x="97" y="72" text-anchor="middle" fill="#ff92a8" font-size="10">触发【沉疫封锁】</text>
      <text x="97" y="86" text-anchor="middle" fill="#ffbdca" font-size="9">
        禁护盾 / 禁回血 / 禁回蓝
      </text>
      <path d="M174 65 L206 65" stroke="#7de8c2" stroke-width="2.5" marker-end="url(#apep-arrow)" />
      <rect x="212" y="36" width="122" height="58" rx="6" fill="#102724" stroke="#5bd4b0" />
      <text x="273" y="57" text-anchor="middle" fill="#b9ffea" font-size="11" font-weight="700">
        换至后场
      </text>
      <text x="273" y="75" text-anchor="middle" fill="#7ff0ce" font-size="10">
        封锁状态立刻解除
      </text>
      <rect x="26" y="104" width="308" height="32" rx="6" fill="#1e1129" stroke="#9e74f0" />
      <text x="180" y="124" text-anchor="middle" fill="#e2d1ff" font-size="10">
        二阶段每2回合 / 三阶段每回合出现【腐化换位格】：只许换位，或用【迟缓】逼Boss踩消
      </text>
      <defs>
        <marker
          id="apep-arrow"
          viewBox="0 0 10 10"
          refX="7"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto"
        >
          <path d="M0 1 L9 5 L0 9 Z" fill="#7de8c2" />
        </marker>
      </defs>
    </svg>`,
    mechanics: [
      {
        tag: '沉疫侵染',
        title: '前后同伤 · 前场两轮封锁',
        summary: '回合末前排与后排所有存活角色都会受到相同层数的沉疫伤害（不会因躲在后场暴涨）。',
        counter:
          '但若在前场连续两回合承受沉疫，角色会陷入【沉疫封锁】，期间无法获得护盾、治疗或回蓝；任意换位退回后场会立刻解封。',
      },
      {
        tag: '阶段格位',
        title: '二/三阶段腐化换位格',
        summary:
          '第1阶段不会生成腐化格；第2阶段每2回合显现1次，第3阶段每回合必现1个紫色墨纹时间格。',
        counter:
          '腐化格内只能编排换位或调整站位；也可抢在敌人行动前施加【迟缓】，把阿佩普挤上黑格直接反制消格！',
      },
      {
        tag: '日蚀蓄能',
        title: '限时破绽断大招',
        summary: '每 3 回合或切阶段时，阿佩普会咏唱「日蚀深渊」并亮起金色特殊破绽条与大/小弱点。',
        counter:
          '趁同一回合集中对应弱点（大弱点 -2 格）打空韧性触发 BREAK，可硬生生打断灭世吐息并令其受伤 +50%。',
      },
    ],
  }),
  alchemicalPuppet: Object.freeze({
    id: 'alchemicalPuppet',
    bossName: '失败的炼金傀偶',
    rankLabel: '绿蕨磨坊 · 失控炼金造物',
    accent: '#e2b95a',
    portrait: './assets/portraits/alchemical-puppet.svg',
    headline: '发条领域封锁与限时炼金炸弹',
    intro:
      '阁楼的主发条已经咬死。这尊失控傀偶会强行夺取时间轴第 1 格的「定式先制」，并将一颗实时倒计时的炼金怀表扣入我方衣领！',
    keyTakeaway:
      '看清头顶限时倒计时（40s→30s→20s）及时确认结算；切阶段时它会获得【人工制品】并蓄能暴走，记得用弱点打断！',
    diagramSvg: html`<svg viewBox="0 0 360 156" class="overlord-tut-svg" aria-hidden="true">
      <rect
        x="8"
        y="8"
        width="344"
        height="140"
        rx="10"
        fill="#17120c"
        stroke="#d8a852"
        stroke-width="1.5"
      />
      <rect x="22" y="24" width="96" height="48" rx="6" fill="#3b2610" stroke="#ffd273" />
      <text x="70" y="45" text-anchor="middle" fill="#ffe6a8" font-size="11" font-weight="700">
        第1格 · 定式先制
      </text>
      <text x="70" y="61" text-anchor="middle" fill="#e6c178" font-size="9">
        不受迟缓 · 必先出手
      </text>
      <rect x="132" y="24" width="102" height="48" rx="6" fill="#3a131a" stroke="#ff6c7a" />
      <text x="183" y="45" text-anchor="middle" fill="#ffd2d8" font-size="11" font-weight="700">
        ⏱ 定时炼金炸弹
      </text>
      <text x="183" y="61" text-anchor="middle" fill="#ff9ca6" font-size="9">
        40s / 30s / 20s 内交牌
      </text>
      <rect x="248" y="24" width="90" height="48" rx="6" fill="#182b2e" stroke="#62d9e6" />
      <text x="293" y="45" text-anchor="middle" fill="#ccf9ff" font-size="11" font-weight="700">
        人工制品护盾
      </text>
      <text x="293" y="61" text-anchor="middle" fill="#89e2ee" font-size="9">切阶段免疫负面</text>
      <rect x="22" y="88" width="316" height="44" rx="6" fill="#231c14" stroke="#c89e4e" />
      <text x="180" y="106" text-anchor="middle" fill="#ffe7ad" font-size="10" font-weight="700">
        破局关键：留意怀表超时倒计时 + 弱点破防
      </text>
      <text x="180" y="122" text-anchor="middle" fill="#d3c29c" font-size="9">
        炉心高热蓄力时配合「苍铭」结合技或大弱点猛攻，一举打断高压炉爆
      </text>
    </svg>`,
    mechanics: [
      {
        tag: '定式先制',
        title: '金色锁链 · 固定首动投弹',
        summary:
          '傀偶每回合固定占住时间轴第 1 格先手行动，并在我方策划阶段挂上 40s / 30s / 20s 倒计时炸弹。',
        counter:
          '炸弹计时结束会自动强制结算，且未及时安排好行动将被炸伤；先挑稳妥的关键招式，留意右上角确认按钮颜色变化！',
      },
      {
        tag: '阶段切换',
        title: '三段血线护盾与领域封锁',
        summary:
          '战局期间外部存档/设置/退避按键均被领域锁定；压入 66% 与 33% 血线会切阶段并震退我方剩余行动。',
        counter:
          '切阶段后傀偶会挂上可抵消负面的【人工制品】，需先用轻量异常消耗层数，再上主力减益或用「苍铭」直接剥盾压韧。',
      },
    ],
  }),
  moonEye: Object.freeze({
    id: 'moonEye',
    bossName: '月痕母树（冠 / 瞳 / 根）',
    rankLabel: '古林圣殿 · 苍白月瞳主干',
    accent: '#82d4d8',
    portrait: './assets/portraits/moon-eye.svg',
    headline: '三部协同共鸣与主干聚光循环',
    intro:
      '整株月痕母树被拆分为左冠、中瞳、右根三个独立行动目标，各自持有独立血条、弱点与每三回合一循环的连锁节奏。',
    keyTakeaway:
      '优先处理每 3 回合替全树回血 20% 的「月痕树根」，并在第 3 回合聚光蓄能时趁机集火或防御！',
    diagramSvg: html`<svg viewBox="0 0 360 156" class="overlord-tut-svg" aria-hidden="true">
      <rect
        x="8"
        y="8"
        width="344"
        height="140"
        rx="10"
        fill="#0d191e"
        stroke="#6ec2c8"
        stroke-width="1.5"
      />
      <rect x="20" y="24" width="98" height="64" rx="6" fill="#172c30" stroke="#76c4ba" />
      <text x="69" y="45" text-anchor="middle" fill="#d0fff7" font-size="11" font-weight="700">
        左 · 月痕树冠
      </text>
      <text x="69" y="63" text-anchor="middle" fill="#9bd8ce" font-size="9">全域干扰与虚弱</text>
      <text x="69" y="77" text-anchor="middle" fill="#9bd8ce" font-size="9">三部齐发先制</text>
      <rect x="131" y="24" width="98" height="64" rx="6" fill="#1b2638" stroke="#9ac6f0" />
      <text x="180" y="45" text-anchor="middle" fill="#e6f2ff" font-size="11" font-weight="700">
        中 · 月之魔眼
      </text>
      <text x="180" y="63" text-anchor="middle" fill="#b4d5f8" font-size="9">贯中激光每轮+50%</text>
      <text x="180" y="77" text-anchor="middle" fill="#b4d5f8" font-size="9">第3回合蓄能不攻</text>
      <rect x="242" y="24" width="98" height="64" rx="6" fill="#1d2c20" stroke="#8ad488" />
      <text x="291" y="45" text-anchor="middle" fill="#e1ffde" font-size="11" font-weight="700">
        右 · 月痕树根
      </text>
      <text x="291" y="63" text-anchor="middle" fill="#a8e4a4" font-size="9">第3回合全树回复</text>
      <text x="291" y="77" text-anchor="middle" fill="#a8e4a4" font-size="9">20% 最大生命！</text>
      <rect x="20" y="100" width="320" height="34" rx="6" fill="#122129" stroke="#e0c36c" />
      <text x="180" y="121" text-anchor="middle" fill="#ffe7ab" font-size="10" font-weight="700">
        提示：尽早拔除右根断绝群体奶量；魔眼激光递增前利用空位规避中路爆发
      </text>
    </svg>`,
    mechanics: [
      {
        tag: '三部协同',
        title: '根系再生威胁最高',
        summary:
          '树根第 3 回合会为所有存活母树部位按各自最大 HP 回复 20%，放任不管会令消耗战大幅拉长。',
        counter: '开局可用【均衡】或高单体爆发先拔除右根，再趁魔眼蓄能期逐个击破树冠与主干。',
      },
      {
        tag: '递增月光',
        title: '中位激光伤害逐轮暴涨',
        summary: '魔眼的「贯中月光」每次循环都会提升 50% 威力，专门狙击我方前排中位。',
        counter: '通过前后换位或把高坦度守护角色摆在中位举盾，即可稳妥化解激光爆发。',
      },
    ],
  }),
  ares: Object.freeze({
    id: 'ares',
    bossName: '战斗机兵 · 阿瑞斯',
    rankLabel: '极北冰渊 · 重装机枢',
    accent: '#63b4ff',
    portrait: './assets/portraits/ares.svg',
    headline: '固定先制穿甲锁定与过载狂暴',
    intro:
      '阿瑞斯的火控逻辑会实时锁定我方薄弱目标，半血以下进入过载维修与高速先制模式，双炮阵协同压制力极强。',
    keyTakeaway:
      '半血前保留爆发并注意【优先穿甲】锁定最低血量队友；提前抬高残血角色或用后场换位保命！',
    diagramSvg: html`<svg viewBox="0 0 360 156" class="overlord-tut-svg" aria-hidden="true">
      <rect
        x="8"
        y="8"
        width="344"
        height="140"
        rx="10"
        fill="#0d1724"
        stroke="#62b4ff"
        stroke-width="1.5"
      />
      <rect x="24" y="24" width="146" height="58" rx="6" fill="#14243a" stroke="#7bc3ff" />
      <text x="97" y="45" text-anchor="middle" fill="#daf0ff" font-size="11" font-weight="700">
        半血前 · 装甲压制
      </text>
      <text x="97" y="63" text-anchor="middle" fill="#9bc9f2" font-size="9">
        高额护盾 + 链锯清两侧
      </text>
      <rect x="190" y="24" width="146" height="58" rx="6" fill="#2f1522" stroke="#ff7a92" />
      <text x="263" y="45" text-anchor="middle" fill="#ffd9e0" font-size="11" font-weight="700">
        60%以下 · 过载狂暴
      </text>
      <text x="263" y="63" text-anchor="middle" fill="#ff9fb0" font-size="9">
        优先穿甲（无视迟缓）
      </text>
      <text x="263" y="76" text-anchor="middle" fill="#ff9fb0" font-size="9">
        自愈10% + 全前场轰炸
      </text>
      <rect x="24" y="96" width="312" height="36" rx="6" fill="#122130" stroke="#ffd273" />
      <text x="180" y="118" text-anchor="middle" fill="#ffe9ad" font-size="10" font-weight="700">
        破局关键：将低血量单位换至后场避开穿甲斩杀，叠加易伤速破护盾
      </text>
    </svg>`,
    mechanics: [
      {
        tag: '精准狙杀',
        title: '优先穿甲无视迟缓',
        summary:
          '进入第二阶段后，阿瑞斯的穿甲炮会无视【迟缓】抢占最先手，直接锁定前排当前 HP 最低的位置造成重创。',
        counter:
          '看到时间轴头顶预示「优先穿甲」时，立刻给残血核心补盾/回血，或将其换至后排躲过点杀。',
      },
      {
        tag: '重装维修',
        title: '紧急维修附带高盾回血',
        summary: '狂暴阶段还会一边全体扫射一边为自身叠加护盾与 10% 生命回复。',
        counter: '趁其亮起限时破绽时集中电/破甲输出触发 BREAK，一回合内清空维修护盾。',
      },
    ],
  }),
  radiantWyvern: Object.freeze({
    id: 'radiantWyvern',
    bossName: '炽光巨龙',
    rankLabel: '天阶圣坛之巅 · 真龙试炼',
    accent: '#ffb74d',
    portrait: './assets/portraits/radiant-wyvern.svg',
    headline: '真龙【飞行】半伤与三阶炽阳吐息',
    intro:
      '盘踞天阶圣坛的炽光巨龙自带【飞行】减伤护翼，并在 66% 与 33% 血线两次升阶护盾，每回合多动撕裂战线！',
    keyTakeaway:
      '飞行未散期间所有伤害减半，待回合衰减或借多段破防击穿炽阳蓄力；三阶段高流血注意及时净化或换人。',
    diagramSvg: html`<svg viewBox="0 0 360 156" class="overlord-tut-svg" aria-hidden="true">
      <rect
        x="8"
        y="8"
        width="344"
        height="140"
        rx="10"
        fill="#1d130a"
        stroke="#ffb852"
        stroke-width="1.5"
      />
      <rect x="22" y="24" width="150" height="58" rx="6" fill="#2e1d0d" stroke="#ffd479" />
      <text x="97" y="46" text-anchor="middle" fill="#fff0c9" font-size="11" font-weight="700">
        开局携带【飞行】
      </text>
      <text x="97" y="64" text-anchor="middle" fill="#f3c87b" font-size="9">
        受到伤害向下减半 · 逐轮衰减
      </text>
      <rect x="188" y="24" width="150" height="58" rx="6" fill="#3a1612" stroke="#ff7e5c" />
      <text x="263" y="46" text-anchor="middle" fill="#ffe1d6" font-size="11" font-weight="700">
        三阶段 2~3 次连动
      </text>
      <text x="263" y="64" text-anchor="middle" fill="#ffb09a" font-size="9">
        极昼炽阳蓄力 + 高额流血
      </text>
      <rect x="22" y="96" width="316" height="36" rx="6" fill="#241910" stroke="#7de8c2" />
      <text x="180" y="118" text-anchor="middle" fill="#d3fff0" font-size="10" font-weight="700">
        破局关键：用「平衡」摊伤/减伤 + 弱点打断吐息蓄力，留技能在非飞行窗口爆发
      </text>
    </svg>`,
    mechanics: [
      {
        tag: '真龙威压',
        title: '飞行减半与多段龙炎',
        summary: '巨龙在空中每回合可行动 2～3 次，搭配高伤害单体龙爪与全体日冕灼烧。',
        counter: '高流血角色在行动前就会掉血，务必先用护盾扛线或利用后场轮换保命。',
      },
      {
        tag: '炽阳坠落',
        title: '三阶段龙息必须打断',
        summary: '进入低血三阶段后会蓄势全屏炽阳坠落，伤害与负面叠加极高。',
        counter: '保留纹章结合与强破绽招式留到三阶段大招回合一举 BREAK。',
      },
    ],
  }),
  darkscaleWarlord: Object.freeze({
    id: 'darkscaleWarlord',
    bossName: '初生暗鳞督军',
    rankLabel: '灰岩旧采石场 · 裂隙霸主',
    accent: '#a970ff',
    portrait: './assets/portraits/darkscale-warlord.svg',
    headline: '裂隙暗鳞蓄甲、统御召尘与神威破鳞',
    intro:
      '左侧暗紫晶石炸裂孕出的初生暗鳞督军兼具【蚀鳞霸主】与【督军生物】双重特性：每回合无负面便蓄积硬鳞增伤，还会咆哮号令游离暗尘合围吞噬强化！',
    keyTakeaway:
      '用异常状态锁死【裂隙暗鳞】蓄甲、优先清掉游离暗尘断绝吞噬；战中右侧苍青晶石碎裂觉醒【神威】，用龙咒破鳞＋龙脉抗砸！',
    diagramSvg: html`<svg viewBox="0 0 360 156" class="overlord-tut-svg" aria-hidden="true">
      <rect
        x="8"
        y="8"
        width="344"
        height="140"
        rx="10"
        fill="#160f24"
        stroke="#a66eff"
        stroke-width="1.5"
      />
      <rect x="22" y="24" width="150" height="58" rx="6" fill="#24173c" stroke="#be92ff" />
      <text x="97" y="44" text-anchor="middle" fill="#efe2ff" font-size="11" font-weight="700">
        蚀鳞统一 · 裂隙暗鳞
      </text>
      <text x="97" y="60" text-anchor="middle" fill="#c7a9ff" font-size="9">
        无负面蓄铁皮+暗蚀增伤
      </text>
      <text x="97" y="74" text-anchor="middle" fill="#8df5db" font-size="9">
        ≥2负面震落 · BREAK清零
      </text>
      <rect x="188" y="24" width="150" height="58" rx="6" fill="#1d243b" stroke="#62b4ff" />
      <text x="263" y="44" text-anchor="middle" fill="#e0f0ff" font-size="11" font-weight="700">
        督军统一 · 统御召尘
      </text>
      <text x="263" y="60" text-anchor="middle" fill="#9bc9f2" font-size="9">
        每2回合召游离暗尘合围
      </text>
      <text x="263" y="74" text-anchor="middle" fill="#ffb899" font-size="9">
        暗气汲取吞尘转盾+力量
      </text>
      <rect x="22" y="96" width="316" height="36" rx="6" fill="#102724" stroke="#5cf2d6" />
      <text x="180" y="118" text-anchor="middle" fill="#c9fff4" font-size="10" font-weight="700">
        破局关键：战中觉醒「神威」→ 龙咒一击三负面震落暗鳞，龙脉中位+3铁皮硬扛崩枷重砸！
      </text>
    </svg>`,
    mechanics: [
      {
        tag: '蚀鳞机制',
        title: '裂隙暗鳞叠甲与负面破鳞',
        summary:
          '回合末若身上无任何负面状态，督军会叠加 1 层【铁皮】（上限 4 层）与护盾，且每层铁皮提供 8% 暗蚀增伤。',
        counter:
          '持续施加负面状态即可阻止其蓄鳞；同时挂上 ≥2 种负面可震落 2 层铁皮，触发弱点 BREAK 更是直接清空全层铁皮！',
      },
      {
        tag: '督军统御',
        title: '咆哮召游离暗尘与吞尘增幅',
        summary:
          '督军施放「督军咆哮」等统御招式会每 2 回合召出最多 2 只【游离暗尘】，随后借「暗气汲取」吞噬存活暗尘转化高额护盾与力量。',
        counter: '趁暗尘刚召出时用群体或轻击优先点杀，断绝督军吞尘叠加力量。',
      },
      {
        tag: '战中觉醒',
        title: '双晶碎裂 · 选择纹章士「神威」',
        summary:
          '交战震荡会震碎右侧苍青晶石并觉醒【神威】：结合期间首击「龙咒」自带易伤/虚弱/迟缓三负面。',
        counter:
          '一击破鳞兼压攻速，再刻下「结合技 · 龙脉」让中位高坦硬扛崩枷连击、左右两位稳健回血回蓝！',
      },
    ],
  }),
  banditSyndicateKing: Object.freeze({
    id: 'banditSyndicateKing',
    bossName: '暗巷匪王 · 黑鸦',
    rankLabel: '暗巷黑市 · 黑市霸主',
    accent: '#ef5b7d',
    portrait: './assets/portraits/bandit-syndicate-king.svg',
    headline: '回合暗器轮换、极速多动与玖柒反制',
    intro:
      '暗巷匪王黑鸦单身迎敌却拥有全游顶尖出手速度（3→4→5 动），每回合初无重复锁定一匣特制暗器，令本回合所有高频连袭全数附带对应负面状态！',
    keyTakeaway:
      '看清顶栏公示的本回合暗器（毒/血/虚/易）；战中夺戒觉醒【玖柒】后立刻结合，让黑鸦高速连击把自己反满 3 种负面，再用【月之瞳】直劈半血！',
    diagramSvg: html`<svg viewBox="0 0 360 156" class="overlord-tut-svg" aria-hidden="true">
      <rect
        x="8"
        y="8"
        width="344"
        height="140"
        rx="10"
        fill="#1e0d16"
        stroke="#ef5b7d"
        stroke-width="1.5"
      />
      <rect x="22" y="24" width="150" height="58" rx="6" fill="#321320" stroke="#ff829e" />
      <text x="97" y="44" text-anchor="middle" fill="#ffe1e8" font-size="11" font-weight="700">
        每回合暗器轮换
      </text>
      <text x="97" y="60" text-anchor="middle" fill="#f3a2b5" font-size="9">
        淬毒针·毒 / 裂血刃·血
      </text>
      <text x="97" y="74" text-anchor="middle" fill="#f3a2b5" font-size="9">
        麻痹镖·虚 / 破甲锥·易
      </text>
      <rect x="188" y="24" width="150" height="58" rx="6" fill="#2c1428" stroke="#f5b041" />
      <text x="263" y="44" text-anchor="middle" fill="#fff0d1" font-size="11" font-weight="700">
        三阶段极速单人连动
      </text>
      <text x="263" y="60" text-anchor="middle" fill="#ffd488" font-size="9">
        66% / 33% 血线切阶段
      </text>
      <text x="263" y="74" text-anchor="middle" fill="#ffd488" font-size="9">
        单回合 3 → 4 → 5 动压迫
      </text>
      <rect x="22" y="96" width="316" height="36" rx="6" fill="#171e3d" stroke="#93a6ff" />
      <text x="180" y="118" text-anchor="middle" fill="#fff0be" font-size="10" font-weight="700">
        破局关键：战中夺戒觉醒「玖柒」→ 万法归寂反弹高频暗器凑满3负面，一发「月之瞳」斩落半血！
      </text>
    </svg>`,
    mechanics: [
      {
        tag: '暗器换匣',
        title: '回合初锁定 4 选 1 暗器',
        summary:
          '每回合开始黑鸦会在淬毒针（中毒）、裂血刃（流血）、麻痹镖（虚弱）、破甲锥（易伤）之间不重复轮换锁定 1 种。',
        counter:
          '顶栏会明牌公示本回合装填的暗器；黑鸦每次命中仅加 1 层固定负面，但 3~5 连动下来极易叠满。',
      },
      {
        tag: '极速连影',
        title: '三阶段 3→4→5 动高频出手',
        summary:
          '黑鸦抢占极高速度与 66% / 33% 切阶段护盾，三阶段单回合连出 5 招配合「千鸦骤雨」覆盖全前场。',
        counter: '尽量利用黑鸦出手间隙换位保残血，并在其被反弹叠上流血后看准他高频自损扣血的窗口！',
      },
      {
        tag: '战中夺戒',
        title: '至高纹章士「玖柒」精准反制',
        summary:
          '交锋途中拍卖匣震翻、夺回冷月古戒唤醒【玖柒】：全队开启「万法归寂」免疫并把所有负面全部返还黑鸦本人。',
        counter:
          '黑鸦出手越快反而越快把自己反满流血/中毒/虚弱/易伤，凑足 3 种负面立即用「结合技 · 月之瞳」削去其当前一半生命！',
      },
    ],
  }),
});

export function normalizeTutorialBossId(id) {
  if (id === 'moonCrown' || id === 'moonRoot') return 'moonEye';
  return id;
}

/** Detect whether the active Overlord just unleashed/revealed its signature mechanic this round. */
export function detectOverlordTutorialTrigger(result, nextState) {
  if (!result || !nextState || ['victory', 'defeat'].includes(nextState.phase)) return null;
  const enemyIds = nextState.enemyIds || [];
  const events = result.events || [];

  for (const rawId of enemyIds) {
    const id = normalizeTutorialBossId(rawId);
    if (!OVERLORD_TUTORIALS[id]) continue;
    if (id === APEP_ID) {
      const triggered =
        Boolean(nextState.sinkingPlague?.source === APEP_ID) ||
        events.some(
          (e) =>
            (e.type === 'sinkingPlague' && e.actor === APEP_ID) ||
            (e.type === 'enemy' && e.actor === APEP_ID && e.clip === 'Apep_Plague'),
        );
      if (triggered) return id;
      continue;
    }
    if (id === 'alchemicalPuppet') {
      const triggered =
        Boolean(nextState.activeAlchemicalBomb) ||
        events.some(
          (e) =>
            e.overlordDomainLock ||
            e.chargeStarted ||
            (e.type === 'bossPhase' && e.actor === 'alchemicalPuppet') ||
            (e.type === 'enemy' && e.actor === 'alchemicalPuppet'),
        );
      if (triggered) return id;
      continue;
    }
    const actors = id === 'moonEye' ? ['moonCrown', 'moonEye', 'moonRoot'] : [id];
    const acted = events.some(
      (e) => (e.type === 'enemy' || e.type === 'bossPhase') && actors.includes(e.actor),
    );
    if (acted) return id;
  }
  return null;
}
