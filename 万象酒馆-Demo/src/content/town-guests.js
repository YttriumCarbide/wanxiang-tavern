import { NEGATIVE_STATUSES } from '../status-rules.js';

/** Authored text is retained verbatim; only skill motion and missing resource costs are added. */
export const TOWN_GUESTS = {
  libet: {
    combat: {
      id: 'libet',
      name: '莉贝特',
      title: '失忆的天使',
      hp: 32,
      mp: 34,
      attack: 8,
      attackName: '羽动',
      limit: 1,
      weapon: 'staff',
      portrait: 'sunflower-angel-v1.png',
      color: '#a8d3ec',
      buffs: {},
      skills: [
        {
          id: 'angel-song',
          name: '天使之音',
          ap: 1,
          mp: 6,
          target: 'self',
          adjacentAllies: true,
          text: '为同排左右紧邻的存活队友各回复9hp；站在中位时同时治疗两侧，不治疗自己。',
          effects: [{ type: 'heal', value: 9 }],
        },
        {
          id: 'guardian-wings',
          name: '守护之翼',
          ap: 1,
          mp: 8,
          target: 'self',
          adjacentAllies: true,
          includeSelf: true,
          text: '自身与同排左右紧邻的存活队友各获得9护盾，并清除负面效果。',
          effects: [
            { type: 'shield', value: 9 },
            { type: 'cleanse', buffs: [...NEGATIVE_STATUSES] },
          ],
        },
      ],
      entrySkill: {
        id: 'angel-arrival',
        name: '羽光相送',
        target: 'allAllies',
        mechanic: 'libet-entry',
        text: '为被换到后场的队友回复9hp，为场上所有存活队友各施加5护盾。',
        effects: [
          { type: 'heal', value: 9 },
          { type: 'shield', value: 5 },
        ],
      },
    },
    setting: {
      name: '莉贝特',
      gender: '女',
      age: '成年',
      appearance:
        '长相可爱，拥有一头金色披肩长发，背后是一对洁白无瑕的翅膀，头戴花朵头饰，头顶有一轮小巧的天使光环，身穿白色露肩长袖外袍搭配宽大的蓝色翻边与袖口，胸前系大蝴蝶结；内穿深蓝贴身胸衣，以金色交叉系带和行星形腰饰点缀。下装前短后长，白色荷叶边内裙与蓝白长衣摆交叠，两侧垂落柔软缎带。赤足，脚踝系蓝色蝴蝶结',
      personality: '性格温柔内向，内心细腻，在众人面前表现得腼腆，在朋友面前才会放的开一些',
      history:
        '失去了记忆的失足少女，被好心人所救，在其养父母的悉心照料下得以幸福成长，拥有着与众不同的翅膀与光环，导致收到了周围人的偏见。擅长小提琴，失忆的她第一次拿到小提琴就能演奏出优美的音乐',
      attack: {
        name: '羽动',
        description:
          '微微侧身，让洁白的双翼向后蓄势，再朝目标方向轻快挥动。羽尖掠起一道收束的气流，击中后立即收翼，不让扬起的风妨碍身旁的同伴。',
      },
      skills: [
        {
          name: '天使之音',
          description:
            '轻按胸前的蝴蝶结，先小声吸气，再唱出清澈柔和的旋律。白羽随歌声微微舒展，温润的光沿左右相邻同伴的伤处流过；站在中间时，歌声同时照顾两侧。',
        },
        {
          name: '守护之翼',
          description:
            '将双翼向身前拢起，再缓缓展开，把柔和的羽光铺在自己和左右相邻同伴的周围。羽光凝成薄而稳定的护层，轻轻拂去附着在身上的不良术式与侵蚀。',
        },
      ],
      entrySkill: {
        name: '羽光相送',
        description:
          '接过前场位置时，先朝退到后方的同伴伸出手，让一缕羽光抚平其伤口，随后展开双翼，将薄薄的护光送到场上每位同伴身边。',
      },
    },
  },
  lumi: {
    combat: {
      id: 'lumi',
      name: '露弥',
      title: '夜游的旅人',
      hp: 44,
      mp: 24,
      attack: 7,
      attackName: '啄击',
      limit: 1,
      weapon: 'staff',
      portrait: 'lumi-v1.png',
      color: '#b99a85',
      buffs: {},
      skills: [
        {
          id: 'wind-assault',
          name: '风袭术',
          ap: 1,
          mp: 10,
          target: 'allEnemies',
          text: '对所有敌人造成9伤害，自身获得1层飞行。',
          effects: [
            { type: 'damage', value: 9 },
            { type: 'buff', buff: 'flying', value: 1, target: 'self' },
          ],
        },
        {
          id: 'keen-sight',
          name: '视觉敏锐',
          passive: true,
          location: '全战斗',
          mechanic: 'keen-sight',
          text: '若有敌人位于本回合时间轴最开始或最末尾，回合开始、敌人行动前，自身获得5护盾；每回合至多触发一次。',
        },
      ],
      entrySkill: {
        id: 'owl-pounce',
        name: '扑击',
        target: 'opposite',
        text: '给予正对位敌人1层致盲。',
        effects: [{ type: 'buff', buff: 'blind', value: 1 }],
      },
    },
    setting: {
      name: '露弥',
      gender: '女',
      age: '28',
      appearance:
        '身穿象牙白缎面交叉挂颈胸衣，贴跨斜裁高开叉长裙，裸腿，走着及腰褐色象牙白双色卷发，单侧佩戴深紫刺绣长手套，腰侧以琥珀扣、羽形金工和少量垂链连接',
      personality:
        '交谈中是开朗大姐姐类型，实际上却喜欢暗中观察别人，白天昏昏欲睡，夜晚却十分精神，对小镇周边的事情极为了解，喜欢给别人讲解夜晚的事情',
      history:
        '本体为猫头鹰化形，昼伏夜出，能够化作猫头鹰侦查四周，夜晚喜欢飞在小镇周围观察情况，偶尔会长时间待在家中不出门，实际上是飞出去旅行了，对历史和旅行感兴趣',
      attack: {
        name: '啄击',
        description:
          '身形在一阵柔风中收拢为猫头鹰，贴近目标迅捷掠过，以尖喙完成短促的啄击。落回原位时重新化作人形，长发与裙摆随着余风缓缓垂下。',
      },
      skills: [
        {
          name: '风袭术',
          description:
            '大陆广泛流传的风系魔法，露弥掌握的出神入化。她抬手辨认气流，指尖向前轻划，让几股风沿不同弧线同时袭向敌阵；随后借回卷的上升气流轻盈离地，以飞行姿态避开部分冲击。',
        },
        {
          name: '视觉敏锐',
          description:
            '在交锋展开前，金色眼睛先扫过敌人的步伐与发力姿态。察觉对手会抢先出手或留到最后一刻，她便提前调整重心，让一层收束的气流护在身前。',
        },
      ],
      entrySkill: {
        name: '扑击',
        description:
          '化成猫头鹰从换位空隙低掠入场，朝正对面的敌人骤然扑近，再用急促的羽风扰乱其视线，落定时恢复人形。',
      },
    },
  },
  'yuto-nakashi': {
    combat: {
      id: 'yuto-nakashi',
      name: '悠托-纳卡希',
      title: '旅行的吟游诗人',
      hp: 39,
      mp: 34,
      attack: 2,
      attackName: '时序小调',
      attackTarget: 'allEnemies',
      basicAttackInjuredMark: true,
      mechanicMark: { name: '悠扬', icon: 'melody', uncapped: true },
      limit: 1,
      weapon: 'staff',
      portrait: 'yuto-nakashi-v1.png',
      color: '#9cbba6',
      buffs: {},
      skills: [
        {
          id: 'star-trace-variation',
          name: '星痕变奏',
          ap: 1,
          mp: 6,
          target: 'enemy',
          consumeMarkCount: 1,
          text: '对一名敌人造成10伤害，消耗自身1层悠扬，使其获得3层虚弱和1层易伤；没有悠扬时仍可使用。',
          effects: [
            { type: 'damage', value: 10 },
            { type: 'buff', buff: 'weak', value: 3 },
            { type: 'buff', buff: 'vulnerable', value: 1 },
          ],
        },
        {
          id: 'amber-song',
          name: '琥珀之歌',
          ap: 1,
          mp: 11,
          target: 'allAllies',
          text: '为所有存活队友回复等同于自身悠扬层数的hp，并给予2层力量；不消耗悠扬。',
          effects: [
            { type: 'heal', value: 0, perMark: 1 },
            { type: 'buff', buff: 'strength', value: 2 },
          ],
        },
      ],
      entrySkill: {
        id: 'feather-downbeat',
        name: '轻羽落拍',
        target: 'allAllies',
        mechanic: 'melody-entry',
        text: '自身获得等同于存活友方角色人数的悠扬，并为所有存活前场队友各施加5护盾。',
        effects: [{ type: 'shield', value: 5 }],
      },
    },
    setting: {
      name: '悠托-纳卡希',
      gender: '女',
      age: '31',
      appearance:
        '暮蓝渐变绿色短发，几缕碎发垂在颊边和眼睛中间，戴着翠绿色软边吟游诗人帽，帽侧插着一根长长的白羽。眼睛是淡紫色，常在笑，却像总在看很远的地方。斗篷是深绿色绣着不显眼的星纹，里面穿象牙白束腰长衣和深棕皮靴。身材单薄修长，腰间别着深褐色陶笛，袖口沾着一点墨痕。',
      personality:
        '彬彬有礼，温柔和善，想法大胆而有趣。平时得体大方，但是遭遇突发事情会完全害羞和不知所措。总是不经意间做出大胆的事，比如战斗中和喜欢的人突然接吻，大胆莫名的告白等等',
      history:
        '来自艾尔德兰，曾去过游历各个地方的吟游诗人。她出生于一个骑士家族，因为不是长女和喜欢旅行，独自选择了外面的世界。希望找到诗意的灵感，和进行有趣的创作。因为缺乏个人战斗力，旅行往往作为冒险者接取任务和商队同行。',
      attack: {
        name: '时序小调',
        description:
          '取下陶笛贴近唇边，以指尖轻快开合吹出一串短小的旋律。音波同时掠过敌阵，每个实际受伤的敌人都在她心中留下一个延续的拍点，汇成悠扬。',
      },
      skills: [
        {
          name: '星痕变奏',
          description:
            '从延续的旋律中抽出一个拍点，忽然改变陶笛的指法，把变奏收成一束清晰的音流送向目标。余音在命中处迟迟不散，使对手的发力与防护都难以衔接。',
        },
        {
          name: '琥珀之歌',
          description:
            '将积累的拍点串成温暖舒展的乐句，向同伴轻轻点头，再把旋律完整吹响。每一层悠扬都化为一分抚平伤口的暖意，收尾的重拍让大家重新握紧武器。',
        },
      ],
      entrySkill: {
        name: '轻羽落拍',
        description:
          '接替前场位置时，以轻巧的步子踩住节拍，视线逐一掠过仍站着的同伴，把他们的呼吸接入旋律。帽侧白羽轻晃，前列同伴身前随之凝起薄薄的音律护层。',
      },
    },
  },
};
