import { ENCOUNTER_COUNT } from './journey-rules.js';
/** Local story used when the player disables dungeon AI in game settings. */
export function combatTestScript(map = 'ruins') {
  return {
    schemaVersion: 3,
    story: Array(ENCOUNTER_COUNT).fill('◇ ── □ ── ◇\n［战斗测试占位剧本］'),
    data: {
      title: '战斗测试',
      synopsis: '本地占位文本，不请求剧本 API。',
      setting: '战斗测试期间，剧本暂用相同的占位符。',
      tags: [],
      npcs: [],
      nextHook: { setting: '◇ ── □ ── ◇', map, artNodes: [] },
    },
  };
}
