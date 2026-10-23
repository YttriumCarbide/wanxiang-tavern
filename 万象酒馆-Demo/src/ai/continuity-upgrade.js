import { upgradeTutorialRevision } from './tutorial-revision.js';

export function upgradeContinuityRules(source) {
  const book = upgradeTutorialRevision(source);
  for (const entry of Object.values(book.entries || {})) {
    const rule = entry.extensions?.wanxiang?.generationRule;
    if (rule === 'map-output' && !entry.content.includes('【已有敌人ID优先】'))
      entry.content +=
        '\n\n【已有敌人ID优先】优先通过enemyIds引用已知敌人。若新敌人重复已有ID，程序保留游戏已有定义并丢弃本次同ID的新定义，不覆盖原数值、名称或行为；不要依赖同ID覆写敌人。';
    if (rule === 'script-definition' && !entry.content.includes('【本次NPC互动要求】'))
      entry.content +=
        '\n\n【本次NPC互动要求】程序为每次新剧本独立决定是否必须出现NPC，概率20%。当request.npcInteraction.required为true时，必须在正文安排至少一名非队伍NPC与主角团实际互动，并同步填写data.npcs。其他时候按剧情自然安排，不能把队伍成员重复当NPC；不因该要求更改已经发生的事实。';
  }
  return book;
}
