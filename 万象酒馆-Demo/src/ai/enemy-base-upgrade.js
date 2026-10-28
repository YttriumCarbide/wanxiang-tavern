import { DEFINITIONS } from '../data.js';
import { ENEMY_DESIGN_LIMITS } from '../enemy-base-values.js';
import { enemyIntentText } from '../enemy-intent-text.js';
import { newWorldEntry } from './worldbook.js';

/** Update code-owned numeric references while retaining prose, switches and placement. */
export function upgradeEnemyBaseWorldbook(source) {
  if (
    Object.values(source.entries || {}).some(
      (entry) => entry.extensions?.wanxiang?.generationRule === 'enemy-base-values',
    )
  )
    return structuredClone(source);
  const book = structuredClone(source);
  book.entries ||= {};
  const guidance =
    '【现行敌人基础值】敌人的hp与意图damage已经包含本次平衡调整。直接按reference.enemies中的现行1级数据设计；不得除回旧倍率，不自行叠加全局hp倍率或固定伤害。等级成长由程序处理，AI不要预填成长。';
  for (const entry of Object.values(book.entries || {})) {
    const marker = entry.extensions?.wanxiang;
    if (marker?.generationRule === 'battle-balance')
      entry.content = entry.content.replace(/^普通敌人基础hp由代码乘[^\n]+/m, guidance);
    if (marker?.generationRule === 'map-output') {
      entry.content = entry.content
        .replaceAll('普通怪hp10～300，Boss10～900', '普通怪hp12～360，Boss12～1035')
        .replaceAll(
          '前四种value1～40',
          '普通敌人damage的value1～41，Boss damage的value1～40，heal/shield/mana的value1～40',
        )
        .replace(/"hp"\s*:\s*60(?=\s*[,}])/g, '"hp":72')
        .replace(/"value"\s*:\s*8(?=\s*[,}])/g, '"value":9');
      entry.content += '\n\n' + guidance;
    }
    if (marker?.generationRule === 'universal-enemies')
      entry.content = entry.content
        .split('\n\n')
        .map((paragraph) => {
          const matched = /^([a-zA-Z0-9-]+) \/ [^\n]+? \/ (\d+)hp /.exec(paragraph);
          const enemy = DEFINITIONS[matched?.[1]];
          if (!enemy || Number(matched[2]) === enemy.hp) return paragraph;
          const updated = paragraph.replace(' / ' + matched[2] + 'hp /', ' / ' + enemy.hp + 'hp /');
          return enemy.boss
            ? updated
            : updated.replace(
                /(\d+)((?:点)?伤害)/g,
                (_, value, suffix) => `${Number(value) + 1}${suffix}`,
              );
        })
        .join('\n\n');
    const enemy = DEFINITIONS[marker?.monsterId];
    if (enemy?.speed) {
      entry.content = entry.content.replace(/基础hp[：:]\s*\d+/g, '基础hp：' + enemy.hp);
      entry.content +=
        '\n\n【现行1级基础数值；替代旧数字】\nhp：' +
        enemy.hp +
        '；速度：' +
        enemy.speed +
        '\n' +
        [enemy.openingIntent, ...enemy.intents, ...(enemy.enragedIntents || [])]
          .filter(Boolean)
          .map((move) => move.name + '：' + enemyIntentText(move))
          .join('\n');
    }
  }
  const uid = Math.max(-1, ...Object.keys(book.entries).map(Number)) + 1;
  book.entries[uid] = {
    ...newWorldEntry(uid),
    comment: '敌人基础数值 · 已内置平衡调整',
    constant: true,
    ignoreBudget: true,
    preventRecursion: true,
    apiTargets: ['map', 'script', 'character', 'chat', 'quick-chat'],
    position: 4,
    depth: 0,
    role: 0,
    order: 9999,
    content:
      guidance +
      '\n地图API输出范围：普通怪hp12～360，Boss hp12～1035；普通敌人damage1～41，Boss damage1～40，治疗/护盾/回蓝1～40。范围是技术上限，不应全选上限；按官方同定位、目标数与控制效果分配强度。\n' +
      JSON.stringify(ENEMY_DESIGN_LIMITS),
    extensions: { wanxiang: { generationRule: 'enemy-base-values' } },
  };
  return book;
}
