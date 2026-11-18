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
  const breakLayers = def?.breakLayersByPhase?.[s - 1] ?? (s >= 3 ? 3 : 2);
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
      breakLayers,
      regularActions,
      bombSeconds,
      shield: 0,
      strengthBonus: 0,
      artifactBonus: 0,
      title: '',
      subtitle: '',
    };
  }
  if (s === 2) {
    return {
      stage: 2,
      toughness,
      breakLayers,
      regularActions,
      bombSeconds,
      shield: def?.phaseShields?.[1] ?? 12,
      strengthBonus: 0,
      artifactBonus: def?.artifactByPhase?.[1] ?? 1,
      title: '',
      subtitle: '',
    };
  }
  return {
    stage: 3,
    toughness,
    breakLayers,
    regularActions,
    bombSeconds,
    shield: def?.phaseShields?.[2] ?? 16,
    strengthBonus: 1,
    artifactBonus: def?.artifactByPhase?.[2] ?? 1,
    title: '',
    subtitle: '',
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
    rankLabel: '磨坊阁楼 · 失控炼金造物',
    entrance: Object.freeze([
      '咔、咔哒……三十年了……终于又有活人，踩响阁楼的木梯了……',
      '胸口这枚【怀表】还在走字……在指针停下之前，谁也别想从齿轮底下走出去！',
    ]),
    domainLock:
      '咔哒……阁楼的门闩落锁了。不管是【退路】、【账簿】还是外面的按钮，在发条停转前全都别想碰！',
    phase2: '嘎吱——！背上的发条彻底崩脱了……听见了吗？【怀表】跳得更快了，两只手都停不下来了……！',
    phase3: '滋滋……瓷面裂开了，炉心要化掉了……只剩最后几声【滴答】了，全都留下来陪葬吧！！',
    bombArmed: (targetName) =>
      `滴答、滴答……滚烫的【炼金怀表】落进${targetName}怀里了——引信烧尽前，来得及出手吗？`,
    bombDetonate: (targetName, damage) =>
      `滴答——归零了！怀表在【${targetName}】胸口炸裂，轰出【${damage}】点炼金冲击！`,
    bombDefuse: (targetName) =>
      `切……赶在引信烧完前按住了簧片吗？别松气，【${targetName}】，下一枚已经在弦上了。`,
    broken: '嘎吱——！！齿轮被硬生生砸卡住了……连【怀表】都扔不出去……别过来……！',
    chargeStart:
      '咔、咔咔……背上的逆重发条拧到底了！胸口炉心正在坍缩聚能——不想被轰成焦炭的话，就来砸碎这具炉壳试试看！',
    breakShatter: '嘎吱——！！炉心的元素回路被硬生生击穿了……蓄好的炼金焰全散了……连手脚都动不了……！',
    pageReload: Object.freeze([
      '咔哒……刚才按下了【刷新网页】对吧？哪怕把整张页面重新载入一遍，阁楼怀表记下的指针也一秒都不会少！',
      '滴答……又【刷新】了一次？别白费工夫了——只要还没分出死活，这具发条躯壳就会顺着浏览器一直盯着你！',
    ]),
    reenterAfterReload: '咔哒……刚才靠【刷新】退回酒馆喘气的人，终究还是推开阁楼的门回来了！',
    defeat: '滴答……发条……终于松开了……三十年的怪响……可以停下了吗……',
    sealedButtons: Object.freeze({
      saves: '想趁现在翻开【存档】逃出阁楼？炉心没凉透之前，时间只往一个方向走！',
      settings: '想翻开【系统设置】改掉阁楼的规则吗？省省力气，盯着眼前跳动的指针吧！',
      ledger: '算盘跟【账簿】都锁死在柜台后了——现在要算清的，是你手里还剩几口气！',
      story: '别急着翻【路途手记】！是活下来还是化作炉灰，等打完这一轮自己看！',
      retreat: '通往楼下的木梯已经被逆重发条扯断——现在想【返回酒馆】可没人替你开门！',
      party: '阁楼的铁门已经焊死了，站在外头的人此刻可换不进来！',
      review: '废纸和残稿早被炉灰烧穿了——你只需要看清眼前抡过来的铁钳！',
      default: '别乱碰棋盘外面的开关……阁楼的发条可不会替你停下来喘气！',
    }),
  }),
});

export function overlordSealedBark(overlordId, buttonKey = 'default') {
  const pack = OVERLORD_DIALOGUES[overlordId] || OVERLORD_DIALOGUES.alchemicalPuppet;
  const map = pack.sealedButtons || {};
  return map[buttonKey] || map.default;
}

export function overlordReloadBark(overlordId, reloadCount = 1) {
  const pack = OVERLORD_DIALOGUES[overlordId] || OVERLORD_DIALOGUES.alchemicalPuppet;
  const lines = pack.pageReload;
  if (Array.isArray(lines) && lines.length) {
    const idx = Math.min(lines.length - 1, Math.max(0, (Number(reloadCount) || 1) - 1));
    return lines[idx];
  }
  return pack.domainLock || '咔哒……就算刷新网页，阁楼里的怀表也从未停转。';
}
