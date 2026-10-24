const battle = (enemyIds, reason) => ({ enemyIds, reason });
export const FOREST_ROUTES = Object.freeze([
  {
    id: 'forest-fringe',
    name: '古林外围',
    boss: 'mossGulon',
    battles: [
      battle(['livingVine'], '追踪拖拽痕迹，在活藤包围中救下月苓；胜利后交涉并获两瓶药剂。'),
      battle(
        ['moonMoth', 'livingVine'],
        '从药篓附近的荧屑和蓝光飞蛾确认月痕污染，与普通萤火区分。',
      ),
      battle(
        ['greyStinger', 'livingVine'],
        '蜂群有序搬运发光碎片，月苓说明会呼吸的根与树冠蜂巢传说。',
      ),
      battle(['moonMoth', 'greyStinger'], '月苓回附近公会取药剂，队伍沿蜂针和蛙足印追踪林中异动。'),
      battle(['mossGulon'], '苔背巨蛙惊逃而来；击败后发现蜂毒伤口，开放通往蜂巢必经的毒沼。'),
    ],
  },
  {
    id: 'forest-bog',
    name: '毒沼根窟',
    boss: 'bogElemental',
    battles: [
      battle(
        ['fogSpore', 'bogLeech'],
        '蓝瘴使魔物神志混乱，观察有序蜂群避开的低洼雾道，定位第一节点。',
      ),
      battle(['bogDrifter', 'greyStinger'], '沿蜂群绕行处找到第二毒沼节点，疏开堵住的排水石渠。'),
      battle(
        ['fogSpore', 'bogDrifter'],
        '清除第三节点的瘴囊和淤泥，通风后蓝瘴减弱，发现深处元素泥核。',
      ),
      battle(['bogLeech', 'bogDrifter'], '月苓带着公会寄存的药剂赶回，显露泥核通路并支援队伍。'),
      battle(
        ['bogElemental'],
        '与月苓配合击败泥核，取得通向蜂鸣穹巢的安全路线；Boss开战获得至高纹章士玖柒。',
      ),
    ],
  },
  {
    id: 'forest-hive',
    name: '蜂鸣穹巢',
    boss: 'moonQueen',
    battles: [
      battle(
        ['moonWorker', 'moonMoth'],
        '驱散倒地骑士周围的搬运蜂与荧蛾，月苓施药唤醒A级搜救骑士杜克。',
      ),
      battle(
        ['moonWorker', 'hiveGuard'],
        '杜克用返程标记与烟熏草带路，确认蜂群搬运月痕碎片的入口。',
      ),
      battle(
        ['honeyLarva', 'moonWorker'],
        '沿蜜囊管道查清碎片加工与蜂后感染，并找到杜克遗落的蜂蜡钥齿。',
      ),
      battle(
        ['hiveGuard', 'honeyLarva', 'moonWorker'],
        '打开蜂蜡内门，进入蜂后所在核心巢室，杜克承认活树林令其迷路中毒。',
      ),
      battle(
        ['hiveGuard', 'moonQueen', 'honeyLarva'],
        '击败受月痕感染的蜂后，实际胜利后取得完整蜂蜡钥齿并开启月树古城入口。',
      ),
    ],
  },
  {
    id: 'forest-root-city',
    name: '月树古城',
    boss: 'scaleCaptain',
    battles: [
      battle(
        ['scaleShield', 'scaleArcher'],
        '月苓观察陌生建筑，主角团讨论地外文明仅是猜测；闯入惊动有组织的守卫。',
      ),
      battle(
        ['scaleWarrior', 'scaleArcher'],
        '从交叉火力与军号观察蜥蜴人的明确分工，发现月牙形瞳孔。',
      ),
      battle(
        ['scaleShield', 'scaleWarrior'],
        '突破盾刃协防，从制式装备与居民遗迹确认古城拥有成熟文明。',
      ),
      battle(
        ['scaleShield', 'scaleArcher', 'scaleWarrior'],
        '穿过仍有能源运转的内城廊道，推断守卫在执行守城命令而非偶然变异。',
      ),
      battle(
        ['scaleShield', 'scaleCaptain', 'scaleArcher'],
        '击败近卫队长，取得通向地上圣林的路径；Boss开战获得假面纹章士风在舞。',
      ),
    ],
  },
  {
    id: 'forest-sanctum',
    name: '圣林',
    boss: 'maskedForester',
    battles: [
      battle(
        ['twistedSapling', 'rootHauler'],
        '回到地上认出杜克所说的活树，观察树根沿湿土留下的移动轨迹。',
      ),
      battle(
        ['rootHauler', 'barkAcolyte'],
        '发现古城石砖能阻断根须，疏开排水沟、移开旧铺路板，准备可通行的石路。',
      ),
      battle(
        ['twistedSapling', 'barkAcolyte'],
        '主祭用铜铃驱树包围；队伍退守石砖并拔断越过砖缝的根束，适用于任何队伍。',
      ),
      battle(
        ['twistedSapling', 'rootHauler', 'barkAcolyte'],
        '破坏驮土路线，让树群无法把湿土铺到石路，趁其受阻反包围侍徒。',
      ),
      battle(
        ['twistedSapling', 'maskedForester', 'rootHauler'],
        '主祭发起搏命围攻，利用已清出的退路逐步击败其指挥体系，表面恢复宁静。',
      ),
    ],
  },
  {
    id: 'forest-mother',
    name: '月痕母树',
    boss: 'moonEye',
    battles: [
      battle(
        ['twistedSapling', 'moonTendril'],
        '清剿溃散月树，发现根须在一扇月华门后仍有规律地抽动。',
      ),
      battle(
        ['rootSentry', 'moonTendril'],
        '穿门发现科技与活体组织结合的母树，清除从土中钻出的护卫。',
      ),
      battle(
        ['rootSentry', 'barkAcolyte'],
        '找到冠层培养囊、中央虹膜和根部修复管，确定三个部位的不同职责。',
      ),
      battle(
        ['rootSentry', 'moonTendril', 'rootHauler'],
        '拆除外层供能支路取得直接攻击三个核心部位的位置，不要求任何元素能力。',
      ),
      battle(
        ['moonCrown', 'moonEye', 'moonRoot'],
        '左冠、中眼、右根同时交战，行动顺序为冠、眼、根；击败全部部位后才结束灾源，留下森林复苏的实际征兆。',
      ),
    ],
  },
]);

export function forestEncounterSpec(sequence, index) {
  const route = FOREST_ROUTES[sequence];
  if (!route || !Number.isInteger(index) || index < 0 || index >= 5)
    throw Error('古林剧本或战斗序号无效');
  return {
    name: route.name,
    map: 'forest',
    enemyIds: [...route.battles[index].enemyIds],
    hpScale: 1,
    boss: index === 4,
    environment: {},
    description: route.battles[index].reason,
    ...(sequence === 0 && index === 0
      ? { itemRewards: { 'health-potion': 1, 'mana-potion': 1 } }
      : {}),
  };
}
