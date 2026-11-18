/** Pure, zero-import Overlord combat rules, timer profiles, and boss dialogue catalog. */

export function overlordTargetStage(unit, def) {
  if (!unit || !def || !Array.isArray(def.overlordPhases) || def.overlordPhases.length < 2) {
    return unit?.enraged ? 2 : 1;
  }
  if (!(unit.maxHp > 0)) return 1;
  const [phase2Ratio, phase3Ratio] = def.overlordPhases;
  if (unit.hp <= Math.floor(unit.maxHp * phase3Ratio)) return 3;
  if (unit.hp <= Math.floor(unit.maxHp * phase2Ratio)) return 2;
  return 1;
}

export function overlordPhaseProfile(def, stage = 1) {
  const s = Math.max(1, Math.min(3, Number(stage) || 1));
  const bombSeconds =
    def?.fixedFirstSlot?.bombSecondsByPhase?.[s - 1] ?? (s === 3 ? 20 : s === 2 ? 30 : 40);
  const toughness =
    def?.toughnessByPhase?.[s - 1] ?? (s === 3 ? 10 : s === 2 ? 9 : def?.toughness || 7);
  const regularActions =
    s === 3
      ? (def?.finalPhaseActions ?? def?.enragedActions ?? 2)
      : s === 2
        ? (def?.enragedActions ?? 2)
        : (def?.actions ?? 1);
  if (s === 1) {
    return {
      stage: 1,
      toughness,
      regularActions,
      bombSeconds,
      shield: 0,
      strengthBonus: 0,
      title: '',
      subtitle: '',
    };
  }
  if (s === 2) {
    return {
      stage: 2,
      toughness,
      regularActions,
      bombSeconds,
      shield: def?.phaseShields?.[1] ?? 12,
      strengthBonus: 0,
      title: def?.phaseTitles?.[1] || '第二阶段 · 逆重发条失控',
      subtitle:
        def?.phaseSubtitles?.[1] ||
        `韧性重铸 ${toughness} · 定时炸弹缩至 ${bombSeconds} 秒 · 解锁二连行动`,
    };
  }
  return {
    stage: 3,
    toughness,
    regularActions,
    bombSeconds,
    shield: def?.phaseShields?.[2] ?? 16,
    strengthBonus: 1,
    title: def?.phaseTitles?.[2] || '第三阶段 · 破碎核心临爆',
    subtitle:
      def?.phaseSubtitles?.[2] ||
      `韧性重铸 ${toughness} · 定时炸弹缩至 ${bombSeconds} 秒 · 炉心狂暴增伤`,
  };
}

export function isFixedFirstSlot(state, slotList, index, def) {
  return Boolean(
    state && state.phase !== 'opening' && index === 0 && slotList?.[0] && def?.fixedFirstSlot,
  );
}

export function pickBombTarget(state, round = 1) {
  const units = state?.units || {};
  const formation = Array.isArray(state?.formation) ? state.formation : [];
  const livingFront = formation.slice(0, 3).filter((id) => units[id]?.hp > 0);
  const candidates = livingFront.length ? livingFront : formation.filter((id) => units[id]?.hp > 0);
  if (!candidates.length) return null;
  const seed = (Number(state?.seed) || 37) >>> 0;
  const hash = Math.imul(seed + Math.max(1, Number(round) || 1) * 131, 2654435761) >>> 0;
  return candidates[hash % candidates.length];
}

export function alchemicalBombDamage(targetUnit) {
  return Math.max(18, Math.round((targetUnit?.maxHp || 36) * 0.48));
}

export const OVERLORD_DIALOGUES = Object.freeze({
  alchemicalPuppet: Object.freeze({
    rankLabel: '♛ 阁楼霸主 · 实验残次品 NO.00',
    entrance: Object.freeze([
      '咔、咔哒……实验记录校准：检测到活体入侵者【六名】——清理程序启动。',
      '【定式铁则】已啮合。怀表发条开始走字……在引信烧尽前，交出你们的回合！',
    ]),
    domainLock: '……休想触碰【存档】、【设置】或【退路】——在核心熄灭前，整座屏幕都只属于这场死斗！',
    phase2: '咔——！反重力炉心偏转！发条过载——定时缩减至【30秒】，准备迎接【双倍砸击】！',
    phase3: '滋滋……裂隙突破临界！烧瓶温度暴走！最后【20秒】——看你们还能怎么逃出齿轮室！',
    bombArmed: (targetName, sec) =>
      `滴答、滴答……【${targetName}】已挂载定时炼金炸弹！限你在【${sec}秒】内确认结算——`,
    bombDetonate: (targetName, damage) =>
      `【00.0秒】——时间到了！炼金怀表在【${targetName}】怀中炸裂，造成【${damage}】点轰击！`,
    bombDefuse: (targetName) =>
      `切……赶在引信烧完前锁死了发条。算【${targetName}】运气好，下枚很快就会落下来。`,
    broken: '嘎吱……！重击卡死了发条齿轨……【金链定式】暂时碎裂！别趁机靠近炉心……！',
    defeat: '滴答……停、停下了……三十年后的实验评估……结果是……「不及格」吗……',
    sealedButtons: Object.freeze({
      saves: '……想读取【存档】逃避这枚正在倒数的人造太阳？这里没有读档的退路。',
      settings: '试图翻开【系统设置】关掉我的规则吗？在阁楼彻底坍塌前，专心看你的时间轴！',
      ledger: '掌柜的账簿已经合上了——今天唯一要结算的，只有怀表上的【剩余秒数】！',
      story: '别去翻【路途手记】了！下一行字是「全灭」还是「险胜」，只看你接下来几秒的选择！',
      retreat: '通往楼下的木梯已经被逆重发条扯断——现在【返回酒馆】可不算数！',
      party: '铁门焊死了，临阵可换不了阵外候补的装备与名册！',
      review: '实验原始日志已被炼金酸雾融毁——你只需要看清眼前跳动的数字！',
      default: '别乱点战盘之外的按钮……阁楼里的发条，可不会为了外面的窗口停下！',
    }),
  }),
});

export function overlordSealedBark(overlordId, buttonKey = 'default') {
  const pack = OVERLORD_DIALOGUES[overlordId] || OVERLORD_DIALOGUES.alchemicalPuppet;
  const map = pack.sealedButtons || {};
  return map[buttonKey] || map.default;
}
