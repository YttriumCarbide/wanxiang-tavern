import { FINAL_ENCOUNTER } from './content/journey-rules.js';

export function tutorialTasks(campaign) {
  return (campaign.tasks ||= {});
}

/** Inspect only engine events; tutorial gates never recompute damage or resource gains. */
export function demonstrated(result, name) {
  const events = result.events || [];
  if (name === 'opening') return events.some((event) => ['hero', 'item'].includes(event.type));
  if (name === 'dodge')
    return events.some(
      (event, index) =>
        event.type === 'swap' &&
        !event.targets.some(Boolean) &&
        events.slice(index + 1).some((later) => later.type === 'enemy' && !later.targets.length),
    );
  if (name === 'vulnerable')
    return events.some(
      (event) =>
        event.type === 'hero' &&
        event.targets.includes('cinderImp') &&
        event.after.units.cinderImp?.buffs.vulnerable &&
        event.logs.some((line) => line.includes('→') && line.includes('伤害')),
    );
  if (name === 'slow')
    return events.some(
      (event, index) =>
        event.type === 'item' &&
        event.skill === 'slow-potion' &&
        event.targets.includes('warden') &&
        event.after.units.warden?.buffs.slow >= 1 &&
        !events
          .slice(0, index)
          .some((earlier) => earlier.type === 'enemy' && earlier.actor === 'warden') &&
        events.slice(index + 1).some((later) => later.type === 'enemy' && later.actor === 'warden'),
    );
  if (name === 'mana')
    return events.some(
      (event) =>
        event.type === 'item' &&
        event.skill === 'mana-potion' &&
        event.logs.some((line) => /回复[1-9]\d*法力/u.test(line)),
    );
  if (name === 'armour')
    return events.some(
      (event, index) =>
        event.type === 'enemy' &&
        event.actor === 'bossGate' &&
        event.after.units[event.actor]?.block >
          (index ? events[index - 1].after.units[event.actor]?.block || 0 : 0),
    );
  return false;
}

export function tutorialCommitIssue(library, state, forecast) {
  const campaign = library.campaign;
  if (!campaign || campaign.completed) return '';
  const tasks = tutorialTasks(campaign);
  const index = state.encounter;
  const victory = state.enemyIds.every((id) => forecast.final.units[id].hp <= 0);
  if (index === 0 && state.phase === 'opening' && !demonstrated(forecast, 'opening'))
    return '先在◇先手格编排并执行一次行动。';
  if (index === 0 && state.phase !== 'opening') {
    if (!tasks.intent) return '先点击敌方时间格，查看敌人的意图。';
    if (!tasks.journal) return '先手动打开一次路途手记，再关闭继续。';
    if (!tasks.dodge && !demonstrated(forecast, 'dodge'))
      return '请在敌人行动前移到空位，让攻击落空后再结算。';
  }
  if (
    index === 0 &&
    victory &&
    !(tasks.intent && tasks.journal && (tasks.dodge || demonstrated(forecast, 'dodge')))
  )
    return '先完成查看意图、打开手记和换位躲避的教学。';
  if (
    index === 1 &&
    !tasks.vulnerable &&
    (state.phase !== 'opening' || victory) &&
    !demonstrated(forecast, 'vulnerable')
  )
    return '先用一次伤害攻击命中带有易伤的灰炉小偶，观察增伤。';
  if (index === 2 && !tasks.slow) {
    if (state.phase === 'opening' && forecast.events.some((event) => event.skill === 'slow-potion'))
      return '先结算先手，迟缓药水请在正式回合、石卫行动之前使用。';
    if ((state.phase !== 'opening' || victory) && !demonstrated(forecast, 'slow'))
      return '打开背包，选择迟缓药水并点选石卫，排在它行动之前，再确认结算。';
  }
  if (index === 3 && !tasks.crossfire && state.phase !== 'opening')
    return '先点敌方时间格，一起查看两名敌人的意图。';
  if (
    index === FINAL_ENCOUNTER &&
    !tasks.mana &&
    forecast.events.some((event) => event.skill === 'mana-potion') &&
    !demonstrated(forecast, 'mana')
  )
    return '魔力药水需要实际回复法力。先施法消耗法力，再安排药水。';
  if (index === FINAL_ENCOUNTER && victory) {
    if (!tasks.mana && !demonstrated(forecast, 'mana'))
      return '先使用魔力药水，为一名队友实际回复法力，再完成最终战。';
    if (!tasks.armour && !demonstrated(forecast, 'armour'))
      return '先观察一次巨像行动后的护盾，再完成最终战。';
  }
  return '';
}

export function recordTutorialResult(campaign, opening, result) {
  const tasks = tutorialTasks(campaign);
  for (const name of ['dodge', 'vulnerable', 'slow', 'mana', 'armour'])
    if (demonstrated(result, name)) tasks[name] = true;
  if (opening && demonstrated(result, 'opening')) tasks.opening = true;
}
