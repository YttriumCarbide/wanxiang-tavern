import { newWorldEntry } from './worldbook.js';
import { UNIVERSAL_ENEMIES, UNIVERSAL_BOSSES } from '../content/universal-adversaries.js';

/** New additive canon; existing world prose, toggles and map entries are preserved. */
export function upgradeUniversalEnemies(source) {
  const book = structuredClone(source);
  const old = Object.values(book.entries || {}).find(
    (entry) => entry.extensions?.wanxiang?.generationRule === 'universal-enemies',
  );
  const uid = old?.uid ?? Math.max(-1, ...Object.keys(book.entries || {}).map(Number)) + 1;
  const content = [
    '【通用敌人与Boss】下列无所属生物、旅人与构装体不绑定某个种族、时代或专属势力；可按当前世界赋予合理的当地称呼与来源。地图生成优先按剧情需要挑选，不要把全部敌人强塞到同一个世界；主线旧关卡不会因此替换敌人。',
    '直接在enemyIds引用已有ID即可沿用完整数值、外貌、战术和第二阶段；不必重复生成定义。若仅借用portrait新建敌人，仍须按地图输出协议填写数值与意图，不要生成tactic、adjacent或任意代码字段。Boss可使用任意敌方外貌，不能借用队友立绘。',
    '官方通用敌人的战术由程序在每个回合规划开始时选择并锁定，意图和位置提前展示。本回合中的换位不会让敌人暗中改瞄准，仍可利用空位闪避。治疗与护盾只给予敌方自身/同伴，不给玩家；禁止给玩家迟缓。',
    ...[...UNIVERSAL_ENEMIES, ...UNIVERSAL_BOSSES].map(
      (entry) =>
        `${entry.id} / ${entry.name} / ${entry.boss ? 'Boss' : '小怪'} / ${entry.hp}hp / 速度${entry.speed} / ${entry.tactic.role}\n${entry.description}\n外貌：${entry.portrait}\n常态：${entry.intents.map((move) => move.name + '：' + move.text).join('；')}${entry.boss ? '\nhp不高于50%后的第二阶段：' + entry.enragedIntents.map((move) => move.name + '：' + move.text).join('；') : ''}`,
    ),
  ].join('\n\n');
  book.entries[uid] = {
    ...newWorldEntry(uid),
    ...old,
    uid,
    comment: '通用敌人库：十名小怪与三位Boss',
    constant: true,
    apiTargets: ['map', 'script'],
    content,
    extensions: {
      ...old?.extensions,
      wanxiang: { ...old?.extensions?.wanxiang, generationRule: 'universal-enemies' },
    },
  };
  return book;
}
