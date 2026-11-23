/** Pure 2D6 DC check prompt generation, response parsing, math reconciliation, rewards and Fail Forward penalties. */
import {
  DC_ATTRIBUTES,
  DC_DEFAULT_DIFFICULTY,
  calibrateDisplayCheck,
  adjustDcForProtagonist,
  computeMapDc,
  dcAttrLabel,
  dcOutcomeLabel,
  effectiveDcAttrs,
  evaluate2d6Check,
  isPassiveBypass,
  normalizeDcAttrKey,
  normalizeCheckDc,
  normalizeDcDifficulty,
  protagonistDcReduction,
  roll2d6,
} from './dc.js';
import { rollGemDrop } from './content/gems.js';
import { ITEMS } from './content/items.js';
import { HEROES } from './data.js';
import { claimBattleRewards } from './rewards.js';

export const DC_SPLIT_MARKER = '[[DC_CHECK]]';

const DC_REWARD_KINDS = Object.freeze([
  'none',
  'gold',
  'ether',
  'item',
  'gem',
  'mixed',
  'tactical',
  'protection',
  'voucher',
  'contract',
]);

const DC_SUPPLIES = Object.freeze({
  tactical: [
    'slow-potion',
    'strength-potion',
    'blind-scroll',
    'confusion-potion',
    'calamity-scroll',
  ],
  protection: ['artifact-potion', 'cleanse-scroll', 'flying-scroll'],
});

export const DC_REWARD_TIERS = Object.freeze({
  none: Object.freeze({ gold: [0, 0], ether: [0, 0], items: null, gemChance: 0 }),
  small: Object.freeze({
    gold: [8, 15],
    ether: [4, 7],
    items: ['health-potion', 'mana-potion', 'slow-potion', 'strength-potion'],
    gemChance: 0.04,
  }),
  medium: Object.freeze({
    gold: [16, 28],
    ether: [8, 13],
    items: Object.freeze([
      'health-potion',
      'mana-potion',
      'recovery-potion',
      ...DC_SUPPLIES.tactical,
      ...DC_SUPPLIES.protection,
    ]),
    gemChance: 0.08,
  }),
  high: Object.freeze({
    gold: [30, 48],
    ether: [14, 20],
    items: Object.freeze([
      'fine-health-potion',
      'fine-mana-potion',
      'fine-recovery-potion',
      'fine-strength-potion',
      'fine-slow-potion',
      'fine-artifact-potion',
      'fine-confusion-potion',
      'fine-blind-scroll',
      'calamity-scroll',
      'cleanse-scroll',
      'flying-scroll',
    ]),
    gemChance: 0.16,
  }),
});

export const DC_PENALTY_DEBUFFS = Object.freeze([
  'none',
  'weak',
  'vulnerable',
  'bleed',
  'poison',
  'slow',
]);

export const DC_DEBUFF_LABELS = Object.freeze({
  weak: '虚弱',
  vulnerable: '易伤',
  bleed: '流血',
  poison: '中毒',
  slow: '迟缓',
});

export function formatDcEffectSummary(reward, penalty) {
  const gains = [];
  const losses = [];
  if (reward) {
    if (reward.gold) gains.push(`${reward.gold} 金币`);
    if (reward.ether) gains.push(`${reward.ether} 以太`);
    if (reward.equipmentVouchers) gains.push(`装备兑换券 ×${reward.equipmentVouchers}`);
    if (reward.summonContracts) gains.push(`召唤契约 ×${reward.summonContracts}`);
    for (const [itemId, count] of Object.entries(reward.items || {})) {
      if (count > 0) gains.push(`${ITEMS[itemId]?.name || itemId} ×${count}`);
    }
    if (reward.gem) gains.push(`稀有发现 · ${reward.gem.name}`);
  }
  if (penalty) {
    if (penalty.hpLoss) losses.push(`生命 -${penalty.hpLoss}`);
    if (penalty.mpLoss) losses.push(`法力 -${penalty.mpLoss}`);
    if (penalty.debuff && penalty.debuff !== 'none') {
      losses.push(`陷入${DC_DEBUFF_LABELS[penalty.debuff] || penalty.debuff}`);
    }
    if (penalty.goldLoss) losses.push(`失落 ${penalty.goldLoss} 金币`);
    if (penalty.ambush) losses.push('惊动伏兵 · 触发战斗');
    if (penalty.summary) losses.push(penalty.summary);
  }
  const gainsText = gains.length ? `收获：${gains.join(' · ')}` : '';
  const lossesText = losses.length ? `损失/代价：${losses.join(' · ')}` : '';
  return {
    gains,
    losses,
    gainsText,
    lossesText,
    text: [gainsText, lossesText].filter(Boolean).join(' ｜ '),
  };
}

export const DC_RP_SYSTEM_RULES = `【2D6属性检定与剧场衔接规范】
1. 触发三铁律（仅用于自由行动/主动试探）：仅当行动面临明显阻力或不确定性、失败将产生切实后果、或行为显著超出角色日常舒适区时，才进行 DC 检定。
2. 绝对豁免与被动直通：
   - 常规闲聊、安全区移动、饮水歇脚、查探明面信息一律免检！
   - 若执行角色该项属性修正与宝石加值极高（满足「2 + 总修正 >= 难度」且难度<=10），直接跳过掷骰（passiveAutoPass），写明其从容不迫、轻描淡写完成，不要硬塞检定。
3. 一骰定音与不可重投：同一行动/同一轮最多判定一次，禁止反复刷骰或退回重试。
4. 触发方式（当确实发起检定，或处于固定选项的必判事件时）：
   - 先正常用 Gal 标记写上半段正文，直到最关键的出手瞬间或判定爆发句，**单独另起一行写出精确标记**：
     ${DC_SPLIT_MARKER}
   - 随后按成败结果（大成功/成功/失败/大失败）紧接着写下半段分支与后果正文。
   - 自由输入时你会收到代码预抽的 2D6 与各角色总值：请根据玩家本轮实际行动内容挑选最契合的角色与属性（勿总是套用同一属性），直接对比该总值决定成败（双6必大成功，双1必大失败）。
   - 固定选项事件中代码只告诉你是「大成功/成功/失败/大失败」结果文字，按该结果演出即可，绝不暴露具体骰点或数值！
5. Fail Forward 失败推进与奖惩同步（极重要）：
   - 成功/大成功时：若剧情涉及搜刮、收获或达成条件，在 reward 中填写与当前剧本和选择契合的档位与类型（small/medium/high）。场景明确限制奖惩时严格遵守：例如只允许好感变化时，照原协议填写好感变化，reward 用 none，禁止额外物资或货币。
   - 奖励不受限制时，根据行动与场景轮换奖励方向，参考最近的实际奖励；不要反复默认金币、以太、毛毛腿、生命或法力药水。可用 tactical（干扰、破阵或进攻类药水卷轴）、protection（人工制品、净化、飞行等防护补给）、item（通用补给）、gem（宝石发现）、voucher（装备兑换券，medium/high）、contract（召唤契约，仅 high 且与剧情相符）及 mixed。金币、以太用于确有关联的奖励。
   - 失败/大失败时：绝不能“无事发生”或隐瞒损失！必须在 penalty 中给出实在代价（掉血/耗蓝/负面状态/失落金币）并**务必填写具体清晰的 summary（写明失落了什么物品/金币或遭受了什么具体创伤代价）**；大失败或鲁莽惊动强敌时可将 ambush 设为 true 引来遭遇战。
   - **【DC成败与自由任务完成相互独立】**：在自由探索任务中，DC 检定失败只意味着过程受挫、需要付出代价或出现波折，**绝不代表任务就此完不成**！任务目标是否标为 completed 仅取决于剧情上玩家是否通过后续努力或承受代价后最终达成了目的。
6. 奖惩标签 <wanxiang_dc>：若本轮发生了检定或奖惩变化，请在 <wanxiang_output> 之外额外输出唯一一组 <wanxiang_dc>{...}</wanxiang_dc> JSON：
   - 格式：{"triggered":true,"actorId":"角色ID","attr":"str|dex|con|int|wis|cha","dc":8,"outcome":"crit|success|fail|fumble","reward":{"tier":"none|small|medium|high","kind":"none|gold|ether|item|gem|mixed|tactical|protection|voucher|contract"},"penalty":{"hpLoss":0,"mpLoss":0,"debuff":"none|weak|vulnerable|bleed|poison|slow","goldLoss":0,"affection":[{"id":"角色ID","delta":0}],"ambush":false,"summary":"明确写出失败失落/代价"}}
   - reward 只填档位与方向，禁止自编具体数量；hpLoss上限25，mpLoss上限12，goldLoss上限30，好感delta范围 -5~5。未触发检定且无奖惩时无需输出 <wanxiang_dc>。`;

function hashSeed(input) {
  let hash = 2166136261;
  for (const ch of String(input || 'dc-rp')) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRange(seed, min, max) {
  if (min >= max) return min;
  return min + (hashSeed(seed) % (max - min + 1));
}

/** Split narrative body around the trigger anchor so UI plays Part 1 -> Dice Animation -> Part 2. */
export function parseDcSplitProse(prose) {
  const raw = typeof prose === 'string' ? prose : '';
  const idx = raw.indexOf(DC_SPLIT_MARKER);
  if (idx < 0) {
    return { hasMarker: false, beforeText: raw, afterText: '' };
  }
  const beforeText = raw.slice(0, idx).replace(/\n+$/, '');
  const afterText = raw.slice(idx + DC_SPLIT_MARKER.length).replace(/^\n+/, '');
  return { hasMarker: true, beforeText, afterText };
}

/** Synthesize a clean midpoint split when a choice check response omits [[DC_CHECK]]. */
export function splitChoiceProseFallback(prose) {
  const parsed = parseDcSplitProse(prose);
  if (parsed.hasMarker) return parsed;
  const raw = parsed.beforeText.trim();
  if (!raw) return { hasMarker: false, beforeText: '', afterText: '' };
  const paragraphs = raw
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (paragraphs.length >= 2) {
    const mid = Math.max(1, Math.floor(paragraphs.length / 2));
    return {
      hasMarker: true,
      beforeText: paragraphs.slice(0, mid).join('\n'),
      afterText: paragraphs.slice(mid).join('\n'),
    };
  }
  const sentences = raw.split(/(?<=[。！？…」”])\s*/).filter(Boolean);
  if (sentences.length >= 2) {
    const mid = Math.max(1, Math.floor(sentences.length / 2));
    return {
      hasMarker: true,
      beforeText: sentences.slice(0, mid).join(''),
      afterText: sentences.slice(mid).join(''),
    };
  }
  return { hasMarker: true, beforeText: raw, afterText: '' };
}

/** Pre-roll 2D6 and pre-compute every present character's modifiers & totals for free AI checks. */
export function prepareFreeDcContext(
  library,
  characters = [],
  rng = Math.random,
  mapOrLevel = null,
) {
  const dice = roll2d6(rng);
  const diceSum = dice[0] + dice[1];
  const doubleSix = dice[0] === 6 && dice[1] === 6;
  const doubleOne = dice[0] === 1 && dice[1] === 1;
  const dcReduction = protagonistDcReduction(library);
  const baseDefaultDc = mapOrLevel != null ? computeMapDc(mapOrLevel, 1) : 8;
  const actors = (characters || []).map((member) => {
    const stats = effectiveDcAttrs(library, member);
    const attrs = {};
    for (const { key, label } of DC_ATTRIBUTES) {
      const entry = stats.mods[key];
      attrs[key] = {
        label,
        value: entry.value,
        mod: entry.mod,
        gemBonus: entry.gemBonus,
        total: diceSum + entry.mod,
      };
    }
    return {
      id: member.id,
      name: member.setting?.name || member.combat?.name || member.id,
      attrs,
    };
  });
  return {
    dice,
    diceSum,
    doubleSix,
    doubleOne,
    actors,
    ...(mapOrLevel != null ? { mapOrLevel } : {}),
    baseDefaultDc,
    defaultDc: normalizeCheckDc(baseDefaultDc - dcReduction),
    dcReduction,
  };
}

/** Compute fixed choice DC check on the client/engine before calling chat API (hiding raw numbers from AI). */
export function resolveFixedChoiceCheck({
  library,
  member,
  choice,
  seed = 'choice',
  rng = Math.random,
}) {
  const dcSpec = choice?.dcCheck || { attr: 'str', dc: DC_DEFAULT_DIFFICULTY };
  const stats = effectiveDcAttrs(library, member);
  const modEntry = stats.mods[dcSpec.attr] || { baseMod: 0, gemBonus: 0, mod: 0 };
  const dice = roll2d6(rng);
  const checked = evaluate2d6Check({
    dice,
    mod: modEntry.baseMod,
    bonus: modEntry.gemBonus,
    dc: adjustDcForProtagonist(library, dcSpec.dc),
  });
  return {
    choiceId: choice?.id || 'choice-1',
    choiceLabel: choice?.label || '',
    actorId: member?.id || 'character-qingyuan',
    actorName: member?.setting?.name || member?.combat?.name || '主角',
    attr: dcSpec.attr,
    attrLabel: dcAttrLabel(dcSpec.attr),
    ...checked,
    seed,
  };
}

export function freeDcPromptSummary(context) {
  if (!context?.actors?.length) return '';
  const actorLines = context.actors
    .map((actor) => {
      const cells = DC_ATTRIBUTES.map(({ key, label }) => {
        const s = actor.attrs[key];
        return `${label}(${key}):修正${s.mod >= 0 ? `+${s.mod}` : s.mod}/合计${s.total}`;
      }).join('，');
      return `- ${actor.name}（id:${actor.id}）：${cells}`;
    })
    .join('\n');
  const note = context.doubleSix
    ? '【注意】本轮预抽骰出了双6，若检定则必为大成功(crit)！'
    : context.doubleOne
      ? '【注意】本轮预抽骰出了双1，若检定则必为大失败(fumble)！'
      : '';
  return `【本轮 2D6 预抽判定池】本次基础 2D6 = ${context.dice[0]} + ${context.dice[1]} = ${context.diceSum}。当前情景基础 DC ${context.baseDefaultDc ?? context.defaultDc ?? 8}，主角等级优惠后的实际判定 DC ${context.defaultDc ?? 8}。请用实际判定 DC 对比总值判断成败；<wanxiang_dc> 中的 dc 请填写优惠前的基础 DC，游戏结算时会自动应用一次主角等级优惠。${note}\n各角色可用属性总值（含六维与宝石加成，可直接对比实际判定 DC 判断成败，或判断被动直通）：\n${actorLines}`;
}

export function fixedChoicePromptSummary(choiceCheck) {
  if (!choiceCheck) return '';
  return `【本轮固定选择 DC 判定结果（严禁在正文泄露数字与DC）】
- 所选方案：${choiceCheck.choiceLabel}
- 执行角色：${choiceCheck.actorName}（${choiceCheck.attrLabel}）
- 代码既定结果：**${choiceCheck.label}**（${choiceCheck.success ? '通过' : '未通过'}）
你必须在前段正文写到 ${choiceCheck.actorName} 尝试行动的关键时刻，单独另起一行插入 \`${DC_SPLIT_MARKER}\`，随后按「${choiceCheck.label}」写明具体后果：${choiceCheck.success ? '并在 <wanxiang_dc> 的 reward 中依据该方案与当前剧本给出契合的追加奖赏档位' : '并在 <wanxiang_dc> 的 penalty 给出实在代价与明确的 summary（说明失落了什么金币/物资或受到何种损伤）'}。`;
}

/** Validate and normalize AI <wanxiang_dc> JSON payload safely against code limits. */
export function normalizeDcTurnOutcome(
  raw,
  actors = [],
  fixedCheck = null,
  { mapOrLevel = null, dcReduction = 0 } = {},
) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw Error('<wanxiang_dc> 必须为 JSON 对象');
  }
  const triggered = Boolean(fixedCheck) || raw.triggered === true;
  const fallbackActorId = fixedCheck?.actorId || actors[0]?.id || 'character-qingyuan';
  const actorId =
    fixedCheck?.actorId ||
    (typeof raw.actorId === 'string' && actors.some((a) => a.id === raw.actorId)
      ? raw.actorId
      : fallbackActorId);
  const attr = fixedCheck?.attr || normalizeDcAttrKey(raw.attr) || 'str';
  const reduction = Number.isInteger(dcReduction) ? Math.max(0, Math.min(2, dcReduction)) : 0;
  let dc =
    fixedCheck?.dc ??
    normalizeCheckDc(normalizeDcDifficulty(raw.dc, DC_DEFAULT_DIFFICULTY) - reduction);
  if (!fixedCheck && mapOrLevel != null) {
    const minDc = normalizeCheckDc(computeMapDc(mapOrLevel, 0) - reduction);
    const maxDc = normalizeCheckDc(computeMapDc(mapOrLevel, 2) - reduction);
    dc = Math.min(maxDc, Math.max(minDc, dc));
  }
  const outcome =
    fixedCheck?.outcome ||
    (['crit', 'success', 'fail', 'fumble'].includes(raw.outcome) ? raw.outcome : 'success');

  const rawReward = raw.reward && typeof raw.reward === 'object' ? raw.reward : {};
  const tier = Object.hasOwn(DC_REWARD_TIERS, rawReward.tier) ? rawReward.tier : 'none';
  const kind = DC_REWARD_KINDS.includes(rawReward.kind)
    ? rawReward.kind
    : tier === 'none'
      ? 'none'
      : 'gold';

  const rawPen = raw.penalty && typeof raw.penalty === 'object' ? raw.penalty : {};
  const clampInt = (v, max) => (Number.isInteger(v) ? Math.min(max, Math.max(0, v)) : 0);
  const validIds = new Set(actors.map((a) => a.id));
  const affection = Array.isArray(rawPen.affection)
    ? rawPen.affection
        .filter(
          (entry) =>
            entry &&
            validIds.has(entry.id) &&
            Number.isInteger(entry.delta) &&
            entry.delta >= -5 &&
            entry.delta <= 5 &&
            entry.delta !== 0,
        )
        .slice(0, 6)
    : [];
  const debuff = DC_PENALTY_DEBUFFS.includes(rawPen.debuff) ? rawPen.debuff : 'none';
  const ambush =
    rawPen.ambush === true && (outcome === 'fumble' || outcome === 'fail') ? true : false;
  let hpLoss = clampInt(rawPen.hpLoss, 25);
  let mpLoss = clampInt(rawPen.mpLoss, 12);
  let goldLoss = clampInt(rawPen.goldLoss, 30);
  let summary = typeof rawPen.summary === 'string' ? rawPen.summary.trim().slice(0, 200) : '';
  if (
    triggered &&
    (outcome === 'fail' || outcome === 'fumble') &&
    hpLoss === 0 &&
    mpLoss === 0 &&
    goldLoss === 0 &&
    debuff === 'none' &&
    !ambush &&
    !summary
  ) {
    goldLoss = outcome === 'fumble' ? 8 : 5;
    hpLoss = outcome === 'fumble' ? 10 : 6;
    summary =
      outcome === 'fumble' ? '局面急转受创并遗落了部分盘缠' : '行动受挫耗损体力并失落少许金币';
  }

  return {
    triggered,
    actorId,
    attr,
    attrLabel: dcAttrLabel(attr),
    dc,
    outcome,
    label: dcOutcomeLabel(outcome),
    success: outcome === 'crit' || outcome === 'success',
    reward: { tier, kind },
    penalty: {
      hpLoss,
      mpLoss,
      debuff,
      goldLoss,
      affection,
      ambush,
      summary,
    },
  };
}

/** Reconcile AI prose outcome vs pre-rolled dice so animation UI never disagrees with story prose. */
export function buildDcDisplayCheck({
  library,
  member,
  dcOutcome,
  preRoll,
  fixedCheck,
  seed = 'dc',
}) {
  if (fixedCheck) return fixedCheck;
  if (!dcOutcome?.triggered) return null;
  const stats = member ? effectiveDcAttrs(library, member) : null;
  const modEntry = stats?.mods?.[dcOutcome.attr] || { baseMod: 0, gemBonus: 0 };
  const reconciled = calibrateDisplayCheck({
    dice: preRoll?.dice,
    mod: modEntry.baseMod,
    bonus: modEntry.gemBonus,
    dc: dcOutcome.dc,
    outcome: dcOutcome.outcome,
    seed,
  });
  return {
    actorId: member?.id || dcOutcome.actorId,
    actorName: member?.setting?.name || member?.combat?.name || dcOutcome.actorId,
    attr: dcOutcome.attr,
    attrLabel: dcAttrLabel(dcOutcome.attr),
    passiveBypass: isPassiveBypass({
      totalMod: modEntry.baseMod + modEntry.gemBonus,
      dc: dcOutcome.dc,
    }),
    ...reconciled,
  };
}

/** Convert qualitative AI reward tier into code-owned quantities and claim atomically. */
export function settleDcReward(library, claimId, rewardSpec, seed = claimId) {
  if (!rewardSpec || rewardSpec.tier === 'none' || rewardSpec.kind === 'none') return null;
  const spec = DC_REWARD_TIERS[rewardSpec.tier] || DC_REWARD_TIERS.small;
  const kind = rewardSpec.kind;
  const wantGold = ['gold', 'mixed'].includes(kind);
  const wantEther = ['ether', 'mixed'].includes(kind);
  if (
    (kind === 'contract' && rewardSpec.tier !== 'high') ||
    (kind === 'voucher' && rewardSpec.tier === 'small')
  )
    return null;
  const supplyPool = Object.hasOwn(DC_SUPPLIES, kind)
    ? DC_SUPPLIES[kind]
    : ['item', 'mixed'].includes(kind)
      ? spec.items
      : null;
  const wantGem = kind === 'gem' || (kind === 'mixed' && rewardSpec.tier === 'high');

  const gold = wantGold ? seededRange(`${seed}:gold`, spec.gold[0], spec.gold[1]) : 0;
  const ether = wantEther ? seededRange(`${seed}:ether`, spec.ether[0], spec.ether[1]) : 0;
  const items = {};
  if (supplyPool?.length) {
    const id = supplyPool[hashSeed(`${seed}:item`) % supplyPool.length];
    items[id] = 1;
  }
  const gemChance = wantGem ? Math.max(0.25, spec.gemChance) : spec.gemChance;
  const gem = wantGem ? rollGemDrop(`${seed}:gem`, gemChance) : null;
  const gems = gem ? [{ gemId: gem.id, instanceId: `gem-${claimId}` }] : [];

  const rewards = {
    summonContracts: Number(kind === 'contract'),
    ...(kind === 'voucher' ? { equipmentVouchers: 1 } : {}),
    gold,
    ether,
    items,
    gems,
  };
  const granted = claimBattleRewards(library, claimId, rewards);
  return granted ? { ...rewards, gem } : null;
}

/** Apply bounded DC failure/fumble penalties to save state & carried dungeon resources. */
export function applyDcPenalty(library, penalty, actorId, expedition = null) {
  if (!penalty || !library) return null;
  const applied = {
    hpLoss: 0,
    mpLoss: 0,
    debuff: null,
    goldLoss: 0,
    affectionChanges: [],
    ambush: Boolean(penalty.ambush),
    summary: penalty.summary || '',
  };
  if (penalty.goldLoss > 0 && library.inventory) {
    const actual = Math.min(library.inventory.gold || 0, penalty.goldLoss);
    library.inventory.gold = Math.max(0, (library.inventory.gold || 0) - actual);
    applied.goldLoss = actual;
  }
  if (Array.isArray(penalty.affection) && penalty.affection.length) {
    library.relationships ||= {};
    for (const { id, delta } of penalty.affection) {
      if (id === library.campaign?.protagonistId) continue;
      const before = library.relationships[id]?.affection || 0;
      const next = Math.max(-100, Math.min(100, before + delta));
      library.relationships[id] = { ...(library.relationships[id] || {}), affection: next };
      applied.affectionChanges.push({ id, delta: next - before, affection: next });
    }
  }
  if (expedition?.carried?.units) {
    const units = expedition.carried.units;
    const partyIds = expedition.partyIds || library.party;
    const slot = HEROES[partyIds?.indexOf(actorId)]?.id;
    const isAlly = (unit) => ['hero', 'player'].includes(unit?.side);
    const targetUnit = actorId
      ? units[slot || actorId]
      : Object.values(units).find((unit) => isAlly(unit) && unit.hp > 1);
    if (isAlly(targetUnit)) {
      if (penalty.hpLoss > 0 && targetUnit.hp > 1) {
        applied.hpLoss = Math.min(targetUnit.hp - 1, penalty.hpLoss);
        targetUnit.hp -= applied.hpLoss;
      }
      if (penalty.mpLoss > 0) {
        const nextMp = Math.max(0, targetUnit.mp - penalty.mpLoss);
        applied.mpLoss = targetUnit.mp - nextMp;
        targetUnit.mp = nextMp;
      }
      if (penalty.debuff && penalty.debuff !== 'none') {
        expedition.nextBattleDebuffs ||= {};
        const buffs = (expedition.nextBattleDebuffs[targetUnit.id || slot || actorId] ||= {});
        buffs[penalty.debuff] = Math.min(6, (buffs[penalty.debuff] || 0) + 2);
        applied.debuff = penalty.debuff;
      }
    }
  } else if (
    penalty.hpLoss > 0 ||
    penalty.mpLoss > 0 ||
    (penalty.debuff && penalty.debuff !== 'none')
  ) {
    applied.hpLoss = penalty.hpLoss || 0;
    applied.mpLoss = penalty.mpLoss || 0;
    if (penalty.debuff && penalty.debuff !== 'none') applied.debuff = penalty.debuff;
  }
  return applied;
}
