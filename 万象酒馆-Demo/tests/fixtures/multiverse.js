import { DEFINITIONS } from '../../src/data.js';
import { ENEMY_ATTACKS } from '../../src/combat-art.js';
export function worldFixture() {
  const base = Object.values(DEFINITIONS).find((enemy) => enemy.speed && !enemy.boss);
  return {
    id: 'world-lantern', name: '潮灯之国', map: 'metropolis',
    background: '潮灯港由三座浮桥连接，守灯人正准备重开夜航。东码头的失踪案留下了真实的货单，南侧的钟楼停止鸣响，北边的旧议会决定封锁灯塔。来访者可以寻找旧货单、调查被切断的钟索，与守灯人的工会谈判，让三条道路逐步汇入被围困的灯塔。每次旅途都能取得新的证据，改变这个港口的局势。',
    landmarks: ['东码头：调查被调换的货单。', '钟楼：寻找截断钟索的人。', '旧议会：说服守卫开放灯塔。'],
    enemyIds: [],
    enemies: ['scout', 'guard', 'warden'].map((name, index) => ({
      id: 'enemy-lantern-' + name, name: ['潮灯斥候', '灯塔卫兵', '夜港执政官'][index],
      portrait: base.portrait, color: '#78afbc', hp: index === 2 ? 200 : 120, speed: 1,
      attackStyle: ENEMY_ATTACKS[0], boss: index === 2,
      intents: [{ name: '巡灯', text: '对左位造成1伤害', slots: [0], effects: [{ type: 'damage', value: 1 }] }],
    })),
  };
}
