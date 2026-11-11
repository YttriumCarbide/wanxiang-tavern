import { HEROES, DEFINITIONS } from '../data.js';
import { GAL_NPC_PORTRAITS } from '../content/gal-npc-portraits.js';

export const CHAPTER_ID = 'starbell';
export const CHAPTER_TITLE = '星灯未熄';
export const CHAPTER_NPCS = {
  eirin: {
    name: '艾琳',
    scene: 'rampart',
    card: './assets/exploration/npc-cards/eirin.png',
    portrait: GAL_NPC_PORTRAITS.guardWoman,
    archetype: 'aegis',
    description:
      '城卫副队长，女。她把每个新兵的家书都收在巡防册里，最怕的不是上战场，而是回城时少了一个报到的人。语气干脆，担忧时反而说得更短。',
    request: '核对换防表并找回哨塔值勤簿',
    bonus: 'shield',
  },
  novi: {
    name: '诺薇',
    scene: 'market',
    card: './assets/exploration/npc-cards/novi.png',
    portrait: GAL_NPC_PORTRAITS.villagerWoman,
    archetype: 'lyria',
    description:
      '成年女灯匠学徒，随身带着一只永远点不亮的旧星灯。她想在今年第一次独立挂灯，让远行未归的母亲认得自家的屋檐；话多又嘴硬，紧张时会数灯扣。',
    request: '整理灯架，再把备用灯送往城墙',
    bonus: 'attack',
  },
  mirei: {
    name: '米蕾',
    scene: 'market',
    card: './assets/exploration/npc-cards/mirei.png',
    portrait: GAL_NPC_PORTRAITS.merchant,
    archetype: 'serin',
    description:
      '成年女旅行医师，药箱里总放着两双大小不同的旧手套。她早已结束寻人的旅行，却仍会向每个求诊者问起沿途见闻；语气温和，拒绝无谓牺牲时很坚决。',
    request: '整理药箱，再在哨塔找到失联药包',
    bonus: 'mp',
  },
};

export { CHAPTER_LINES } from './starbell-dialogue.js';

export function chapterCompanion(key) {
  const npc = CHAPTER_NPCS[key];
  if (!npc) throw Error('未知城市角色');
  const combat = structuredClone(HEROES.find((hero) => hero.id === npc.archetype));
  combat.name = npc.name;
  combat.title = { eirin: '守城之盾', novi: '未熄的灯', mirei: '旅途医师' }[key];
  combat.portrait = { eirin: 'guardian', novi: 'swordswoman', mirei: 'healer' }[key];
  combat.customPortrait = npc.card;
  combat.customStanding = npc.portrait;
  return {
    id: `starbell-${key}`,
    source: 'chapter',
    archetype: npc.archetype,
    combat,
    setting: {
      name: npc.name,
      title: combat.title,
      worldbook: `姓名：${npc.name}\n${npc.description}\n经历：星钟城星灯祭前与酒馆旅人相识。因共同完成${npc.request}而建立信任，自愿作为同伴加入。`,
      formatVersion: 3,
    },
  };
}

/** Local people are offered in the shared selector without adding them to the player's library. */
export function chapterSceneCharacters(state, scene) {
  const people = Object.keys(CHAPTER_NPCS)
    .filter((key) => CHAPTER_NPCS[key].scene === scene)
    .map(chapterCompanion);
  if (scene === 'rampart' && ['day2', 'day2done', 'day3', 'won'].includes(state?.phase))
    people.push({
      id: 'starbell-mayor',
      source: 'npc',
      setting: {
        name: '村长',
        title: '星钟城村长',
        worldbook:
          '姓名：村长\n星钟城的地方负责人，负责协调农庄、商队与守备。他刚从城外返回，愿意核实证据，但不会仅凭陌生人的断言改变整座城的安排。只知道当前已发生的事。',
      },
      combat: {
        name: '村长',
        customPortrait: './assets/exploration/npc-cards/mayor.png',
        customStanding: GAL_NPC_PORTRAITS.scholar,
      },
    });
  return people;
}

export function chapterBattleSpec(key) {
  const configs = {
    scout: {
      name: '林边踪迹',
      map: 'forest',
      templates: ['greyProwler', 'greyProwler'],
      names: ['蚀鳞猎兽', '蚀鳞幼兽'],
      hp: [30, 26],
      level: 1,
    },
    elite: {
      name: '哨塔夺还',
      map: 'forest',
      templates: ['hollowSentry', 'greyProwler'],
      names: ['蚀鳞先锋', '蚀鳞猎兽'],
      hp: [70, 38],
      level: 2,
    },
    boss: {
      name: '星灯城门 · 暗鳞督军',
      map: 'ruins',
      templates: ['manyShellBeast', 'greyProwler', 'greyProwler'],
      names: ['暗鳞督军', '蚀鳞猎兽', '蚀鳞猎兽'],
      hp: [140, 24, 24],
      level: 3,
    },
  };
  const config = configs[key];
  if (!config) throw Error('未知章节战斗');
  const enemyDefinitions = {};
  const enemyIds = config.templates.map((template, index) => {
    const id = `starbell-${key}-${index}`;
    const enemy = structuredClone(DEFINITIONS[template]);
    enemy.id = id;
    enemy.name = config.names[index];
    enemy.hp = config.hp[index];
    enemy.level = config.level;
    if (key === 'boss')
      for (const intent of [...enemy.intents, ...(enemy.enragedIntents || [])]) {
        intent.text = '';
        for (const effect of intent.effects) {
          if (effect.type === 'damage') effect.value = Math.max(1, Math.round(effect.value * 0.8));
          if (effect.type === 'buff' && effect.buff === 'bleed')
            effect.value = Math.ceil(effect.value / 2);
        }
      }
    enemy.description =
      '从城外兽径袭来的蚀鳞。暗色甲鳞层层交叠，沿途破坏警戒与道路，受首领的低吼驱使。';
    enemyDefinitions[id] = enemy;
    return id;
  });
  return { ...config, boss: key === 'boss', enemyIds, enemyDefinitions };
}
