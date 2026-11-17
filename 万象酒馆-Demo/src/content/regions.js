import { RUINS_ROUTES, RUINS_ENEMY_IDS } from './ruins-encounters.js';
import { FOREST_ROUTES } from './forest-encounters.js';
/** Existing art themes, fixed environment rules and six reusable exploration site families. */
export const REGIONS = Object.freeze({
  ruins: {
    name: '界隙遗迹',
    description: '断墙、石阶与尘封的回廊。故事中的具体遗址由本条路线逐次展开。',
    atmosphere: '干燥石尘，风化石壁，暖色火光。',
    sites: RUINS_ROUTES.map((route) => route.name),
    enemies: [...RUINS_ENEMY_IDS],
    boss: 'apepLamb',
    npcPool: [
      '守着遗迹外门的清扫老人（灰伯）：自称只是扫地老头，熟悉残垣门廊却隐瞒着深处秘辛。',
      '迷失在回廊暗影里的落单抄经人：携带残缺壁画摹本，能辨认古文字但畏惧机关石卫。',
      '驻扎废墟边哨的伤兵斥候：曾随公会前锋探查大厅断崖，手里握着半份残破渡崖索具记录。',
      '在迷宫风道旁拾荒的盲眼拾遗人：靠听风辨位穿梭地下通道，愿以情报交换纯净泉水与火油。',
    ],
    taskHooks: [
      {
        id: 'ruins-hook-0',
        title: '灰伯的旧回廊',
        boss: 'bossGate',
        bossName: '守门巨像',
        description: '清点遗迹外环回廊的反朝向壁画并清理盘踞魔物，解决阻拦入口的守门巨像。',
      },
      {
        id: 'ruins-hook-1',
        title: '门前旧约',
        boss: 'ruinsGate',
        bossName: '遗迹机关石门',
        description: '沿蛇与太阳壁画查明大厅门禁规律，突破强行封锁内门的遗迹机关石门。',
      },
      {
        id: 'ruins-hook-2',
        title: '两艘空船与深渊',
        boss: 'chasmBeast',
        bossName: '裂渊兽首',
        description: '借助鸟蛇木船渡过尘封大厅断崖，肃清盘踞在对岸裂口处的裂渊兽首。',
      },
      {
        id: 'ruins-hook-3',
        title: '中庭沉坑的铜钥',
        boss: 'brassColossus',
        bossName: '黄铜独眼巨像',
        description: '顺地下穿堂风定位隐藏石室，击败黄铜独眼巨像以夺回核心墓室的裂纹铜钥。',
      },
      {
        id: 'ruins-hook-4',
        title: '祭司的无声祷辞',
        boss: 'cinderPriest',
        bossName: '余烬祭司',
        description: '以铜钥开启核心墓室，平息因纹路断供而苏醒的余烬祭司并查清献祭对象。',
      },
      {
        id: 'ruins-hook-5',
        title: '灰的真相与诅咒显现',
        boss: 'apepLamb',
        bossName: '阿佩普的羔羊',
        description: '揭开遗迹献祭位面能量的真相，直面并解放身负诅咒化身的阿佩普的羔羊。',
      },
    ],
  },
  forest: {
    name: '月痕古林',
    description: '树根、苔藓与萤火。可复用为林中道路、废堡周边或其他森林主题地点。',
    atmosphere: '潮湿空气，遮蔽天光的树冠，苔石与萤火。',
    sites: FOREST_ROUTES.map((route) => route.name),
    enemies: [
      'livingVine',
      'moonMoth',
      'bogLeech',
      'fogSpore',
      'bogDrifter',
      'moonWorker',
      'hiveGuard',
      'honeyLarva',
      'scaleShield',
      'scaleWarrior',
      'scaleArcher',
      'twistedSapling',
      'rootHauler',
      'barkAcolyte',
      'rootSentry',
      'moonTendril',
    ],
    boss: 'moonEye',
    npcPool: [
      '背着草药篓的采药学徒：熟悉浅林药草分布与蜂针解毒偏方，但对月痕蓝瘴心怀忌惮。',
      '受伤掉队的搜救骑士：带着旧返程绳结，熟知古林树冠蜂巢与暗沼险地。',
      '守望月树外郭的蜥蜴人巡礼者：持古老木杖与月牙纹令牌，审视外来者是否守礼。',
    ],
    taskHooks: [
      {
        id: 'forest-hook-0',
        title: '药篓旁的异常足印',
        boss: 'mossGulon',
        bossName: '苔背巨蛙',
        description: '追踪蜂群与受惊兽类痕迹，制止失控冲撞林道的苔背巨蛙并探明蜂巢方向。',
      },
      {
        id: 'forest-hook-1',
        title: '重见清水与蓝瘴源头',
        boss: 'bogElemental',
        bossName: '瘴泥魔核',
        description: '疏通毒沼三处堵塞石渠减弱蓝瘴，击溃凝结在深窟中的瘴泥魔核。',
      },
      {
        id: 'forest-hook-2',
        title: '蜂鸣穹巢与旧钥齿',
        boss: 'moonQueen',
        bossName: '月痕蜂后',
        description: '追踪携带月痕碎片的蜂群深入蜂鸣穹巢，平息遭污染狂暴的月痕蜂后。',
      },
      {
        id: 'forest-hook-3',
        title: '月瞳古城的礼与刃',
        boss: 'scaleCaptain',
        bossName: '蜥蜴近卫队长',
        description: '穿过防卫森严的月树古城内廊，击败履行死命令守城的蜥蜴近卫队长。',
      },
      {
        id: 'forest-hook-4',
        title: '湿土铺道与主祭铜铃',
        boss: 'maskedForester',
        bossName: '林冠主祭',
        description: '截断湿土运送线令活树失步，击溃借助铜铃驱使林木的林冠主祭。',
      },
      {
        id: 'forest-hook-5',
        title: '月华门后的机械根系',
        boss: 'moonEye',
        bossName: '月痕母树',
        description: '越过月华门进入圣林最深处，瓦解月痕母树的冠层、虹膜与根系三处中枢。',
      },
    ],
  },
  frost: {
    name: '霜晶矿窟',
    description: '寒冷矿道、冰壁与晶簇，现有美术为冰雪矿窟，可承载雪地主题的探索。',
    atmosphere: '低温、霜雾、冰壁，旧矿轨与载矿车。',
    sites: ['废弃洞口', '中层矿道', '霜晶主脉', '废弃维修站', '深层钻探区', '钻探核心控制室'],
    enemies: [
      'rustMiner',
      'drillWorm',
      'railSpider',
      'frostBorer',
      'crystalMiner',
      'clingLarva',
      'oreMite',
      'shardSprite',
      'rogueArm',
      'partsCarrier',
      'lostWelder',
      'cargoCrawler',
      'insaneWorker',
      'scrapHound',
      'sentryDrone',
      'conduitWisp',
    ],
    boss: 'ares',
    npcPool: [
      '身穿改装外骨骼的独立机械师：带着旧工程终端，熟悉矿车轨道却不愿透露前雇主。',
      '电力将尽的古旧维修机：保存着矿脉封存前的交班日志与应急电池坐标。',
      '警戒外来勘探队的聚落守望工匠：对大公司标志极其敏感，掌握地下安全通路。',
    ],
    taskHooks: [
      {
        id: 'frost-hook-0',
        title: '轨道车与封矿旧令',
        boss: 'frostCrusher',
        bossName: '霜铁碾压者',
        description: '修复矿口手摇轨道车突破入口安保防线，击停失控重型矿机霜铁碾压者。',
      },
      {
        id: 'frost-hook-1',
        title: '中层信号灯与矿轨异响',
        boss: 'drillMatriarch',
        bossName: '深脉钻头母虫',
        description: '修复中层矿道信号灯定位异常振动，击败潜行轨底的深脉钻头母虫。',
      },
      {
        id: 'frost-hook-2',
        title: '霜晶回馈之谜',
        boss: 'crystalDevourer',
        bossName: '晶蚀暴君',
        description: '采集三处霜晶样本并截断供能导管，击败借晶簇不断再生的晶蚀暴君。',
      },
      {
        id: 'frost-hook-3',
        title: '维修站的销毁指令',
        boss: 'repairOverseer',
        bossName: '总控维修臂',
        description: '恢复废弃维修站维护回路并读取原始记录，击停封死深层通道的总控维修臂。',
      },
      {
        id: 'frost-hook-4',
        title: '地下聚落的防卫线',
        boss: 'settlementLeader',
        bossName: '衡尺守卫机',
        description: '清理失控安保残机并保护机械聚落，以解除武装与交涉平息衡尺守卫机。',
      },
      {
        id: 'frost-hook-5',
        title: '钻探核心的最终肃清令',
        boss: 'ares',
        bossName: '战神机兵阿瑞斯',
        description: '关闭控制室外围警戒网，正面迎战启动紧急肃清协议的战神机兵阿瑞斯。',
      },
    ],
  },
  forge: {
    name: '余烬铸坊',
    description: '锻锤、炉火与金属残件，复用为工业遗址及其相连地点。',
    atmosphere: '余热、飞火、熔沟和往复锻锤。',
    sites: ['灰炉前庭', '运料走道', '冷却工位', '锻锤下方', '废料库房', '主炉平台'],
    enemies: [
      'cinderImp',
      'pebble',
      'hound',
      'rustMiner',
      'partsCarrier',
      'warden',
      'crystalBeetle',
    ],
    boss: 'bossGate',
    npcPool: [
      '守着熄灭冷却池的老锻工：指节布满烫伤旧疤，能从锻锤节拍辨认炉区是否仍在超负荷运转。',
      '抱着废料清单穿行的机械学徒：背囊里装着半箱备用铜铆钉，正在寻找能重新校准运料轨的工具。',
      '蹲在废料库房外清点残件的退伍工兵：曾参与封炉撤离，记得哪条通风巷道能避开高温熔沟。',
    ],
    taskHooks: [
      {
        id: 'forge-hook-0',
        title: '熄火前庭的空锤声',
        boss: 'bossGate',
        bossName: '守门巨像',
        description: '沿灰炉前庭排查仍在空转的自动锻锤，突破守在主炉闸门前的守门巨像。',
      },
      {
        id: 'forge-hook-1',
        title: '主炉熔沟的封存件',
        boss: 'brassColossus',
        bossName: '黄铜独眼巨像',
        description: '穿过运料走道与冷却工位寻找封存配方，制服接管主炉平台的黄铜独眼巨像。',
      },
      {
        id: 'forge-hook-2',
        title: '锻坊深处的余烬核心',
        boss: 'returningCore',
        bossName: '归环之核',
        description: '查明废料库房地下传出的异常共振来源，停下持续吸收炉火能量的归环之核。',
      },
    ],
  },
  tide: {
    name: '潮汐星殿',
    description: '浅水、珊瑚与星象刻线，复用为星殿及其水域主题的后续地点。',
    atmosphere: '流动浅水、湿润石柱、潮灯与星盘。',
    sites: ['浅水阶梯', '珊瑚回廊', '潮灯水道', '星盘侧殿', '静水石桥', '司灯高台'],
    enemies: [
      'tideJelly',
      'pebble',
      'mossSlime',
      'sprout',
      'moonMoth',
      'crystalBeetle',
      'hollowSentry',
    ],
    boss: 'bossTide',
    npcPool: [
      '站在浅水阶梯边捞取浮标的水文记录员：随身带着潮汐刻度尺，熟知每次涨潮淹没石桥的时间差。',
      '在珊瑚回廊修补古星盘铜环的盲眼占星徒：靠指尖摸索星纹刻线辨位，知道哪几盏潮灯已被海雾熄灭。',
      '被浅滩漂流物困住的采珠潜行者：熟悉静水石桥下的暗流走向，却不敢靠近司灯高台附近的亮光。',
    ],
    taskHooks: [
      {
        id: 'tide-hook-0',
        title: '熄灯阶梯的涨潮时刻',
        boss: 'bossTide',
        bossName: '星潮司灯者',
        description: '顺浅水阶梯与潮灯水道重新点亮航标，登上司灯高台直面操控潮汐节律的星潮司灯者。',
      },
      {
        id: 'tide-hook-1',
        title: '珊瑚廊道的星环共振',
        boss: 'returningCore',
        bossName: '归环之核',
        description: '循珊瑚回廊水下的星象折光查探异常潮位，停下与星盘共鸣的归环之核。',
      },
      {
        id: 'tide-hook-2',
        title: '静水石桥彼端的裁定纹',
        boss: 'unmooredJudge',
        bossName: '无界裁定者',
        description: '横渡静水石桥进入星盘侧殿，解除依旧按古代星历执行清场的无界裁定者。',
      },
    ],
  },
  dynasty: {
    name: '朱阙宫庭',
    description: '朱墙、金瓦与石狮守着的旧宫庭院，适合承载王朝、官府与宫城故事。',
    atmosphere: '宫灯低垂，香炉浮烟，金漆在暗红廊柱间反光。',
    sites: ['丹墀前庭', '朱门回廊', '石狮侧阶', '香炉庭院', '金瓦偏殿', '宫墙深处'],
    enemies: ['warden', 'sprout', 'hound', 'pebble'],
    boss: 'bossGate',
  },
  xianxia: {
    name: '云海仙门',
    description: '浮岛、玉阶与云海之上的仙门，适合承载修真、门派与洞天故事。',
    atmosphere: '云气漫过石阶，玉灯与飞剑在雾中泛着青光。',
    sites: ['云海石阶', '玉柱山门', '浮岛剑台', '青灯云径', '月影洞天', '仙门高台'],
    enemies: ['crystalBeetle', 'tideJelly', 'mossSlime', 'sprout'],
    boss: 'bossTide',
  },
  castle: {
    name: '石堡校场',
    description: '石墙、塔楼与操练场组成的边境堡垒，适合承载骑士、佣兵与攻城故事。',
    atmosphere: '冷铁、干草和火炬的烟气混在石墙之间。',
    sites: ['堡门吊桥', '石墙马道', '操练场', '武器架旁', '箭靶后院', '塔楼阴影'],
    enemies: ['warden', 'hound', 'pebble', 'cinderImp'],
    boss: 'bossGate',
  },
  arcane: {
    name: '星辉秘庭',
    description: '紫晶、浮书与古老法阵围成的秘术庭院，适合承载法师塔与禁书故事。',
    atmosphere: '紫色符文在石板下呼吸，书页和晶尘悬在半空。',
    sites: ['秘庭门廊', '浮书回廊', '紫晶书库', '法阵中庭', '星辉祭坛', '禁书高台'],
    enemies: ['hexer', 'crystalBeetle', 'mossSlime', 'sprout'],
    boss: 'bossBloom',
  },
  metropolis: {
    name: '霓虹街口',
    description: '楼宇、路灯与霓虹招牌夹出的城市街口，适合承载现代都市与夜间追逐故事。',
    atmosphere: '潮湿柏油反着霓虹，远处车灯和自动售货机嗡嗡作响。',
    sites: ['霓虹路口', '便利店侧街', '公交站台', '地下车库', '天台边缘', '写字楼门厅'],
    enemies: ['hound', 'hexer', 'warden', 'pebble'],
    boss: 'bossGate',
  },
  nexus: {
    name: '量子舱室',
    description: '金属舱壁、反应堆与数据光栅围成的实验舱，适合承载科幻与失控设施故事。',
    atmosphere: '冷白灯带、低频震动和反应堆的青色脉冲填满舱室。',
    sites: ['舱门气闸', '服务器列阵', '反应堆外环', '观测舷窗', '无人机库', '核心控制台'],
    enemies: ['crystalBeetle', 'pebble', 'tideJelly', 'hexer'],
    boss: 'bossTide',
  },
  wasteland: {
    name: '荒原残站',
    description: '废弃加油站、锈车与铁丝网组成的荒原据点，适合承载末世与废土旅途故事。',
    atmosphere: '风卷着沙粒刮过铁皮，篝火和锈蚀金属散发干燥热气。',
    sites: ['残站入口', '锈车掩体', '油桶堆', '铁丝网缺口', '篝火空地', '旧站屋顶'],
    enemies: ['cinderImp', 'hound', 'pebble', 'mossSlime'],
    boss: 'bossBloom',
  },
  relic: {
    name: '黄沙神殿',
    description: '黄沙、方碑与被遗忘的神殿台阶，适合承载考古、沙漠与远古文明故事。',
    atmosphere: '沙粒覆着浮雕，方尖碑的影子在烈日下缓慢移动。',
    sites: ['神殿阶前', '方碑列道', '断柱回廊', '沙埋祭坛', '太阳门', '地宫入口'],
    enemies: ['pebble', 'warden', 'sprout', 'crystalBeetle'],
    boss: 'bossGate',
  },
  'moss-hollow': {
    name: '翠苔浅谷',
    biome: 'forest',
    tier: '低阶',
    level: 3,
    description:
      '星钟城西南草坡尽头的浅谷遗泽，野兽与初生苔藓魔物聚集其间，是新人冒险者最好的磨砺之地。',
    atmosphere: '湿润青草气里混着树汁清香，溪涧旁立着半倾的巡防木桩。',
    sites: ['牧道浅湾', '苔石饮水涧', '倒伏栎木阵', '野猪拱泥窝', '旧巡逻木亭', '谷底幽林坛'],
    enemies: ['mossSlime', 'sprout', 'pebble', 'hound'],
    boss: 'mossGulon',
    npcPool: ['驻守西南哨卡的老猎户：熟知浅谷野兽作息，正悬赏清理拱坏围栏的苔背巨蛙。'],
    taskHooks: [
      {
        id: 'moss-hollow-hook',
        title: '浅谷异动清剿',
        boss: 'mossGulon',
        bossName: '苔背巨蛙',
        description: '沿西南草坡清理暴走的林间魔物，驱逐霸占谷底水源的苔背巨蛙。',
      },
    ],
  },
  'border-watch': {
    name: '断垣戍堡',
    biome: 'castle',
    tier: '低阶',
    level: 7,
    description: '艾尔德兰西陲废弃的边防石堡，曾用于瞭望西岭关道，如今被野犬群与遗留哨卫傀儡盘踞。',
    atmosphere: '干草与旧铁锈味在矮墙间徘徊，断折旗杆在西风里吱呀作响。',
    sites: ['外壕断桥', '崩塌瓮城', '演武空场', '旧军械库', '垛口长廊', '瞭望主塔底'],
    enemies: ['pebble', 'hound', 'warden', 'mossSlime'],
    boss: 'ruinsGate',
    npcPool: ['路过的商队护卫长：愿意重金买下戌堡西侧官道的通行安稳。'],
    taskHooks: [
      {
        id: 'border-watch-hook',
        title: '疏通西境旧堡垒',
        boss: 'ruinsGate',
        bossName: '遗迹守门人',
        description: '清剿盘踞在断垣戍堡的游荡守卫与魔犬群，重开西境商道。',
      },
    ],
  },
  'whisper-grove': {
    name: '微光苔林',
    biome: 'forest',
    tier: '中阶',
    level: 11,
    description: '月痕古林外围被微弱荧光菌群照亮的静谧林区，难度介于星钟草坡与深处母树圣林之间。',
    atmosphere: '幽蓝微光点亮潮湿树根，雾孢子随着脚步无声浮起。',
    sites: ['菌灯林径', '藤蔓拱桥', '沉水树洞', '孢子空地', '古树树皮祠', '苍苔祭石坪'],
    enemies: ['livingVine', 'fogSpore', 'bogDrifter', 'hound'],
    boss: 'bogElemental',
    npcPool: ['采集夜光孢子的公会斥候：在林缘记录毒沼水位变化，警告旅人切勿深吸蓝雾。'],
    taskHooks: [
      {
        id: 'whisper-grove-hook',
        title: '清除荧光毒瘴源',
        boss: 'bogElemental',
        bossName: '瘴泥魔核',
        description: '压制微光苔林膨胀的孢子群，击碎凝结在水洼深处的瘴泥魔核。',
      },
    ],
  },
  'silver-cistern': {
    name: '旧都水窖',
    biome: 'castle',
    tier: '中阶',
    level: 16,
    description: '王城北侧山麓下的古老蓄水石室与地下防卫回廊，衔接帝国中游冒险战力与北境山隘。',
    atmosphere: '石穹下回荡着滴水与齿轮声，火把光在潮湿青砖上拉出长影。',
    sites: ['北麓暗闸口', '蓄水石拱室', '青砖巡检道', '旧水车机房', '暗渠分流口', '深井封存门'],
    enemies: ['warden', 'cinderImp', 'hexer', 'hound'],
    boss: 'bossGate',
    npcPool: ['银冠城水务监工：悬赏排查旧水窖失控机关与潜入其中的火妖。'],
    taskHooks: [
      {
        id: 'silver-cistern-hook',
        title: '水窖防线复核',
        boss: 'bossGate',
        bossName: '古代石门守卫',
        description: '深入银冠北麓旧水窖，镇压失控的守卫核心以保障王城供水。',
      },
    ],
  },
  'ash-foundry': {
    name: '灰烬古窑',
    biome: 'forge',
    tier: '高阶',
    level: 22,
    description:
      '帝国东境旧渠尽头荒废的冶炼高炉群，终年残留地热余烬与失控傀儡，是踏入余烬铸坊前的试金石。',
    atmosphere: '暗红炉渣映亮熏黑砖穹，空气中浮动着热浪与铜铁鸣响。',
    sites: ['冷灰斜坡', '碎砖鼓风机室', '半熔铁渣池', '锻锤旧轨', '灰烬烟道口', '主熔炉底座'],
    enemies: ['cinderImp', 'hollowSentry', 'brassSeeker', 'hexer'],
    boss: 'brassColossus',
    npcPool: ['寻找秘法锻材的矮人行商：需要护卫清理炉区最外围的黄铜巨像。'],
    taskHooks: [
      {
        id: 'ash-foundry-hook',
        title: '熄灭失控古炉',
        boss: 'brassColossus',
        bossName: '黄铜巨像',
        description: '穿过余烬灼热的古窑甬道，击毁守卫主熔炉的黄铜巨像。',
      },
    ],
  },
  'astral-sanctum': {
    name: '星陨古坛',
    biome: 'arcane',
    tier: '高阶',
    level: 27,
    description: '王城长堤东南悬崖上倾颓的古星象坛场，潮汐星殿前奏般的秘术能量在此剧烈交汇。',
    atmosphere: '悬空书页与紫晶碎屑随海风盘旋，石板法阵微光闪烁。',
    sites: ['星阶残廊', '悬石观星台', '断碑仪轨阵', '晶尘秘库', '海崖祈星柱', '终末天象坛'],
    enemies: ['crystalBeetle', 'tideJelly', 'hexer', 'hollowSentry'],
    boss: 'bossTide',
    npcPool: ['观测天象的星象学徒：恳请高阶冒险者在星象紊乱前稳定古坛中枢。'],
    taskHooks: [
      {
        id: 'astral-sanctum-hook',
        title: '平息星象坛共鸣',
        boss: 'bossTide',
        bossName: '深潮巨灵',
        description: '登上东南悬崖星陨古坛，击败被星潮唤醒的深潮巨灵。',
      },
    ],
  },
});

export const JACOBS_LADDER_CONFIG = Object.freeze({
  id: 'jacobs-ladder',
  name: '雅各布天梯',
  npcPool: [
    '追猎蚀鳞的龙裔巡游者（泛生界荒地交界）：利用天梯外溢龙压拦截逃窜的蚀鳞群，监视外围龙化魔物异动，对外来者戒心极强。',
    '曾登顶成功的退役老驿长（泛生界荒地驿站）：受外围龙化魔物亲近，在荒地边缘经营最后一座补给驿站，出售抗风沙物资与荒原情报。',
    '考据起源纪石门的古文字学者（泛生界岩石带）：研究半埋地下的残破石门铭文，毫无自保能力，急需雇佣护卫清理周边魔物。',
    '感知龙气潮汐的盲眼计时人（往生界入口营地）：替朝圣者计算“三天停留死限”，随时吹哨喝止企图在禁战区拔刀动武的闯入者。',
    '托付遗物的往生界落魄贵族（往生界入口营地）：携带泛生界古老家徽，愿以全部家当委托有实力登顶者带信前往泛生界寻亲。',
    '光柱营地的黑市换物商（往生界入口营地）：利用“绝对禁战”死规摆摊，只以物易物交换往生界奇珍与攀登者遗物。',
    '只为看一眼太阳的濒死老朝圣者（往生界入口营地）：寿元将尽的普通老人，只求在三天龙气耐受期内亲眼沐浴一次正午落下的神迹日光。',
    '卡在半途的岩棚拾遗人（攀升通道中下段）：距 65 级登顶门槛仅差一步的攀岩老手，在避风岩棚收集失败者遗物并传授禁飞攀岩技巧。',
    '困在背光暗窟的受伤挑战者（攀升通道中段）：冲击通道时被游移浮石砸伤、被迫躲入暗窟并遭阴影魔物围困的独行强者。',
    '寻亲的异乡武者（攀升通道断层石台）：为寻找失踪亲人硬闯通道、却因不熟浮石规律而困在断层石台上的固执旅人。',
  ],
  taskHooks: [
    {
      id: 'jacobs-hook-1',
      title: '荒地龙蜥暴走异变',
      boss: 'bicolorSingularityLizard',
      bossName: '双色奇点·猎蜥',
      description:
        '此地黑白龙气近期剧烈失衡，受龙力影响的荒地蜥蜴群出现狂暴异变并互相吞噬融合。队伍需在极昼极夜交替的荒原中追踪异变痕迹，拔除三处失控的龙气导流晶簇（对应Boss：双色奇点·猎蜥｜雅各布天梯出口外围）。',
    },
    {
      id: 'jacobs-hook-2',
      title: '日蚀石门的古礼裁定',
      boss: 'eclipseWatcher',
      bossName: '日蚀守望者',
      description:
        '歌谣指引之处的岩石带深处半埋着一座起源纪残破石门，门后传出沉重的机关共鸣。队伍需在荒地遗迹中集齐日、月双枚龙纹石钥开启门扉，并通过石门前的古礼铭文考验，才会唤醒守门的无主巨像进行最终裁定（对应Boss：日蚀守望者｜雅各布天梯出口）。',
    },
    {
      id: 'jacobs-hook-3',
      title: '暗窟深处的回响',
      boss: 'abyssDevourerSerpent',
      bossName: '噬渊巨蟒',
      description:
        '攀升通道中段一处被浮石半掩的背光深窟里，频繁传出吞石轰鸣，且连续有数十位攀登者失踪。队伍需趁游移浮石错开的间隙跳入暗窟，才会见到盘踞深渊的巨蟒（对应Boss：噬渊巨蟒｜攀升通道）。',
    },
    {
      id: 'jacobs-hook-4',
      title: '辉光试炼',
      boss: 'radiantDrake',
      bossName: '辉光亚龙',
      description:
        '只有在正午烈日笔直贯通井道、悬浮巨石受光热牵引短暂停稳成“光之阶梯”时，辉光亚龙才会降临通道高处的向阳岩台。队伍必须精确把握正午日照的时间窗口，在禁飞条件下沿浮石接力急攀登台，才能向这位天空霸主发起挑战（对应Boss：辉光亚龙｜攀升通道）。',
    },
    {
      id: 'jacobs-hook-5',
      title: '龙气的吞噬者',
      boss: 'dragonscaleSandworm',
      bossName: '龙鳞沙虫',
      description:
        '巨大的沙虫肆无忌惮地在外围吞噬龙气，随着力量不断扩大其活动范围也逐渐增大，逐渐靠近天梯最近的驿站，冒险者工会下令将其斩杀（对应Boss：龙鳞沙虫｜雅各布天梯外围）。',
    },
  ],
});

function isJacobsLadderExploration(exploration) {
  const name = `${exploration?.world?.name || ''} ${exploration?.world?.background || ''}`;
  return name.includes('雅各布天梯') || exploration?.location === '雅各布天梯';
}

export function regionTaskHookFor(exploration, bossId = null) {
  const worldHooks = Array.isArray(exploration?.world?.taskHooks)
    ? exploration.world.taskHooks
    : null;
  const hooks =
    worldHooks ||
    (isJacobsLadderExploration(exploration)
      ? JACOBS_LADDER_CONFIG.taskHooks
      : REGIONS[exploration?.map]?.taskHooks || []);
  if (!hooks.length) return null;
  if (exploration?.taskHookId) {
    const byId = hooks.find((hook) => hook.id === exploration.taskHookId);
    if (byId) return byId;
  }
  if (
    !exploration?.world &&
    Number.isInteger(exploration?.sequence) &&
    hooks[exploration.sequence]
  ) {
    return hooks[exploration.sequence];
  }
  if (bossId) {
    const byBoss = hooks.find((hook) => hook.boss === bossId);
    if (byBoss) return byBoss;
  }
  return hooks[0];
}

export function localNpcPoolFor(exploration) {
  if (Array.isArray(exploration?.world?.npcPool) && exploration.world.npcPool.length) {
    return exploration.world.npcPool;
  }
  if (isJacobsLadderExploration(exploration)) return JACOBS_LADDER_CONFIG.npcPool;
  return REGIONS[exploration?.map]?.npcPool || [];
}
