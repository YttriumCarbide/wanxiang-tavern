const battle = (enemyIds, reason) => ({ enemyIds, reason });
export const FROST_ROUTES = Object.freeze([
  {
    id: 'frost-yard',
    name: '废弃洞口',
    boss: 'frostCrusher',
    battles: [
      battle(['rustMiner'], '遇见外骨骼少女洛雨，交谈公司勘探身份与报酬，辨认旧采矿机危险。'),
      battle(['drillWorm', 'rustMiner'], '验证钻头虫追踪铁轨振动的规律，避开不停运的采矿装置。'),
      battle(
        ['frostBorer', 'scrapHound'],
        '击退精英凿岩虫并寻回手摇车零件，洛雨协助恢复轨道连接。',
      ),
      battle(['rustMiner', 'sentryDrone'], '修复手摇轨道车，突破入口安保线。'),
      battle(['frostCrusher'], '击停碾压者后，从胸甲取得主脉钻探计划紧急叫停的旧日志。'),
    ],
  },
  {
    id: 'frost-middle',
    name: '中层矿道',
    boss: 'drillMatriarch',
    battles: [
      battle(['railSpider'], '制服守着岔口的巡线机，接近维修机器人扳手-7，为它更换霜晶电池。'),
      battle(['railSpider', 'drillWorm'], '扳手-7标记安全路线，修好第一处信号灯。'),
      battle(
        ['cargoCrawler', 'drillWorm'],
        '轨道下传来重型残机与虫群震动，边清障边修好其余两处信号灯。',
      ),
      battle(['railSpider', 'sentryDrone'], '沿着轨道继续推进，让手摇车脱离大型钻探机的震动范围。'),
      battle(['drillMatriarch'], '击败钻头母虫，取得维修日志残页，抵达主脉。'),
    ],
  },
  {
    id: 'frost-vein',
    name: '霜晶主脉',
    boss: 'crystalDevourer',
    battles: [
      battle(['clingLarva'], '洛雨的外骨骼报警，交谈后得知她是独立机械师。'),
      battle(['clingLarva', 'shardSprite'], '解冻旧工程数据板，得知霜晶向运转机械回馈能量。'),
      battle(
        ['crystalMiner', 'shardSprite'],
        '击破精英重型采矿机并采集样本，发现管理层明知风险仍继续开采的记录。',
      ),
      battle(['clingLarva', 'sentryDrone'], '样本采集触发报警，定位共生钻探机的供能导管。'),
      battle(['crystalDevourer'], '破坏导管阻断回馈，击败晶噬者，取得完整样本与工程师数据板。'),
    ],
  },
  {
    id: 'frost-workshop',
    name: '废弃维修站',
    boss: 'repairOverseer',
    battles: [
      battle(['oreMite', 'shardSprite'], '洛雨修复终端，队伍抵挡被通电声惊动的矿虫与晶体生命。'),
      battle(['oreMite', 'clingLarva'], '接通终端的三个维护回路，保护修复作业。'),
      battle(
        ['rogueArm', 'lostWelder'],
        '终端恢复后击退重载吊臂，发现部分温和机械正向深处搬运零件。',
      ),
      battle(['partsCarrier', 'lostWelder'], '沿搬运路线深入，确认失控设备与无害搬运者并不相同。'),
      battle(['repairOverseer'], '击停封锁出口的总臂，播放封矿与销毁指令原始记录，进入深层区。'),
    ],
  },
  {
    id: 'frost-settlement',
    name: '深层钻探区',
    boss: 'settlementLeader',
    battles: [
      battle(
        ['oreMite', 'partsCarrier'],
        '清除聚落外围失控矿虫与迷航搬运机，发现有组织的采晶生活。',
      ),
      battle(
        ['scrapHound', 'sentryDrone'],
        '清理追猎居民的旧安保残机，居民仍畏惧勘探队的公司身份。',
      ),
      battle(['cargoCrawler', 'lostWelder'], '阻止重型货运残机冲入住宅区，注意保护有智慧的居民。'),
      battle(['partsCarrier', 'lostWelder'], '解除残留销毁指令控制的设施，双方紧张对峙。'),
      battle(
        ['settlementLeader'],
        '仅解除衡尺的防卫武装，不杀死它；交涉确认双方实力后达成和平，不能写成屠灭聚落。',
      ),
    ],
  },
  {
    id: 'frost-control',
    name: '钻探核心控制室',
    boss: 'ares',
    battles: [
      battle(
        ['scrapHound', 'oreMite'],
        '收下聚落提供的矿石与技术资料，承诺离开前清除外围失控残机。',
      ),
      battle(['sentryDrone', 'conduitWisp'], '洛雨感慨主角不像公司人员，主角请她保密。'),
      battle(
        ['insaneWorker', 'conduitWisp'],
        '击退暴走工兵并穿过损坏供能站，辨认工业居民与军用残机的不同。',
      ),
      battle(
        ['scrapHound', 'conduitWisp', 'sentryDrone'],
        '关闭控制室外围警戒系统，为对抗阿瑞斯作准备。',
      ),
      battle(
        ['aresCannonLeft', 'ares', 'aresCannonRight'],
        '阿瑞斯与两门浮游炮同时交战；按公开意图应对紧急肃清。实际胜利后离开，保留聚落动机与未来的不确定。',
      ),
    ],
  },
]);
export function frostEncounterSpec(sequence, index) {
  const route = FROST_ROUTES[sequence];
  if (!route || !Number.isInteger(index) || index < 0 || index >= 5)
    throw Error('矿窟剧本或战斗序号无效');
  return {
    name: route.name,
    map: 'frost',
    enemyIds: [...route.battles[index].enemyIds],
    hpScale: 1,
    boss: index === 4,
    environment: {},
    description: route.battles[index].reason,
  };
}
