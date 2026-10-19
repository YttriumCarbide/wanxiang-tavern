import { ENCOUNTER_COUNT, FINAL_ENCOUNTER } from './journey-rules.js';
export function tutorialSpec(index = 0) {
  if (!Number.isInteger(index) || index < 0 || index >= ENCOUNTER_COUNT)
    throw Error('教学战斗序号无效');
  const enemies = [
    ['mossSlime'],
    ['cinderImp', 'sprout'],
    ['warden'],
    ['hound', 'sprout'],
    ['bossGate'],
  ];
  return {
    name: ['旧阶初遇', '苔径微光', '石隙回声', '廊下交错', '沉睡的守门者'][index],
    map: 'ruins',
    enemyIds: [...enemies[index]],
    hpScale: index === 0 ? 1.875 : 0.975,
    bossHpScale: 0.85,
    enemyDamageScale: 1,
    occupiedOpeningTarget: index === 1,
    initialEnemyBuffs: index === 1 ? { cinderImp: { vulnerable: 1 } } : {},
    boss: index === FINAL_ENCOUNTER,
    environment: { shield: 2, regen: 1 },
    description: '界隙遗迹的首次探索，敌人稀少，适合学习时间轴。',
  };
}
