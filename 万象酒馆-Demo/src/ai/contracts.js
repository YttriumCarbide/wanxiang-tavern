import { resourceText } from '../resource-text.js';
import { defaultCharacterPortrait } from '../content/portrait-templates.js';
import { ENCOUNTER_COUNT } from '../content/journey-rules.js';
import { stripRetiredFields, stripRetiredLore } from './retired-abilities.js';
import { MAP_IDS } from '../content/biomes.js';
import { HEROES, BUFFS } from '../data.js';
import { characterInputSchema } from './character-schema.js';
import { checkOutputSchema } from './schema-check.js';
import { normalizeRules } from '../triggers.js';
import {
  normalizeCharacterSetting,
  formatCharacterSetting,
  characterDataFromSetting,
} from './character-setting.js';

const fail = (message) => {
  throw Error(`生成数据不符合约定：${message}`);
};
const object = (value, label) =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : fail(label);
const text = (value, label, max = 2000) =>
  typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : fail(label);
const integer = (value, min, max, label) =>
  Number.isInteger(value) && value >= min && value <= max ? value : fail(label);
const choice = (value, choices, label) => (choices.includes(value) ? value : fail(label));
const tags = (value) =>
  Array.isArray(value) && value.length <= 12
    ? value.map((tag) => text(tag, '标签', 30))
    : fail('标签列表');

export function parseGeneratedJSON(content) {
  const value =
    typeof content === 'string'
      ? content
          .trim()
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/\s*```$/, '')
      : '';
  try {
    return object(JSON.parse(value), '根节点必须为JSON对象');
  } catch {
    return fail('需要完整JSON对象，不能包含解释文字或截断内容');
  }
}
const display = (value) => value.replaceAll('<', '‹').replaceAll('>', '›');

/** Fresh character calls use strict two-layer JSON; old stored prose remains readable. */
export function parseCharacterOutput(content) {
  const raw = stripRetiredFields(parseGeneratedJSON(content));
  checkOutputSchema(raw, characterInputSchema(), 'character');
  if (raw.schemaVersion !== 3) fail('角色schemaVersion必须为3，根节点为schemaVersion/setting/data');
  if (
    Object.keys(raw).some(
      (key) =>
        !['schemaVersion', 'setting', 'data', 'arrivalDialogue', 'levelUpLines'].includes(key),
    )
  )
    fail('角色根节点存在未规定字段');
  const setting = normalizeCharacterSetting(raw.setting);
  raw.setting.personality = setting.personality;
  object(raw.data, 'data数据层');
  return raw;
}

export function characterWorldbook(entry) {
  return (
    entry.setting.worldbook ||
    ['name', 'title', 'appearance', 'personality', 'background', 'speechStyle', 'motivation']
      .map((key) => entry.setting[key])
      .filter(Boolean)
      .join('\n\n')
  );
}
function effects(list, path = 'effects') {
  if (!Array.isArray(list) || !list.length || list.length > 4) fail(`${path}需要1～4项效果`);
  return list.map((effect) => {
    object(effect, '技能效果');
    const type = choice(
      effect.type,
      ['damage', 'heal', 'shield', 'buff', 'cleanse', 'selfHeal', 'selfMana', 'selfShield'],
      '效果类型',
    );
    if (type === 'cleanse') {
      if (!Array.isArray(effect.buffs) || !effect.buffs.length || effect.buffs.length > 9)
        fail('净化状态列表');
      return {
        type,
        buffs: effect.buffs.map((key) => choice(key, Object.keys(BUFFS), '净化状态')),
      };
    }
    return {
      type,
      value: integer(effect.value, 1, type === 'buff' ? 6 : 32, '效果数值'),
      ...(type === 'buff' ? { buff: choice(effect.buff, Object.keys(BUFFS), '状态ID') } : {}),
      ...(effect.target ? { target: effect.target } : {}),
    };
  });
}
function skill(value, id, allowPassive = true, strict = false) {
  object(value, `${id}技能对象`);
  const common = {
    id,
    name: display(text(value.name, '技能名', 30)),
    text: resourceText(display(text(value.text, '技能说明', 300))),
  };
  if (value.passive === true && allowPassive) {
    if (value.rules)
      return { ...common, passive: true, location: '全战斗', rules: normalizeRules(value.rules) };
    const location = choice(value.location, ['前场', '后场', '全战斗', '战斗外'], '被动位置');
    const result = { ...common, passive: true, location };
    if (strict && (value.buff || value.teamFrontBuff)) {
      choice(
        value.buff || value.teamFrontBuff,
        ['strength', 'guard', 'iron'],
        `${id}被动只支持力量、守势、铁皮`,
      );
      if (location === '战斗外') fail(`${id}战斗外只支持bonusMp`);
    }
    if (value.buff) {
      result.buff = choice(value.buff, Object.keys(BUFFS), '被动状态');
      result.value = integer(value.value, 1, 3, '被动层数');
    } else if (value.teamFrontBuff) {
      result.teamFrontBuff = choice(value.teamFrontBuff, Object.keys(BUFFS), '前场光环');
      result.value = integer(value.value, 1, 2, '光环层数');
    } else if (location === '后场' && value.endHeal)
      result.endHeal = integer(value.endHeal, 1, 3, '后场治疗');
    else if (location === '战斗外' && value.bonusMp)
      result.bonusMp = integer(value.bonusMp, 1, 6, '整备蓝量');
    else fail('被动必须有一个代码支持的效果');
    return result;
  }
  return {
    ...common,
    ap: integer(value.ap, 1, 2, `${id}.ap需要数字1或2`),
    mp: integer(value.mp, 0, 10, `${id}.mp需要0～10整数`),
    ...(value.hp === undefined ? {} : { hp: integer(value.hp, 1, 20, `${id}.hp需要1～20整数`) }),
    target: choice(value.target, ['enemy', 'ally', 'self', 'allAllies', 'allEnemies'], '技能目标'),
    effects: effects(value.effects, `${id}.effects`),
  };
}
export function normalizeCharacter(raw, id) {
  raw = stripRetiredFields(raw);
  object(raw, '角色');
  if (![1, 2, 3].includes(raw.schemaVersion)) fail('角色schemaVersion无效');
  const sourceSetting = object(raw.setting, '设定层');
  const setting =
    raw.schemaVersion === 3 ? normalizeCharacterSetting(sourceSetting) : sourceSetting;
  const sourceData = object(raw.data, '数据层');
  const data = raw.schemaVersion === 3 ? characterDataFromSetting(setting, sourceData) : sourceData;
  const base = HEROES.find((hero) => hero.id === data.archetype);
  if (!base) fail('职业模板');
  const lore =
    raw.schemaVersion === 3
      ? {
          name: setting.name,
          title: setting.profession.name,
          worldbook: formatCharacterSetting(setting),
          formatVersion: 3,
        }
      : raw.schemaVersion === 2
        ? {
            name: text(setting.name, '姓名', 30),
            title: text(setting.title, '称号', 30),
            worldbook: stripRetiredLore(text(setting.worldbook, '人物世界书正文', 24000)),
            ...(setting.entrySkill ? { entrySkill: setting.entrySkill } : {}),
            ...(setting.formatVersion === 3 ? { formatVersion: 3 } : {}),
          }
        : Object.fromEntries(
            [
              'name',
              'title',
              'appearance',
              'personality',
              'background',
              'speechStyle',
              'motivation',
            ].map((key) => [
              key,
              text(setting[key], key, key === 'name' || key === 'title' ? 30 : 2000),
            ]),
          );
  if (raw.schemaVersion === 1) lore.tags = tags(setting.tags);
  if (!Array.isArray(data.skills) || data.skills.length !== 2) fail('角色需要两个技能槽');
  const combat = {
    id,
    name: display(lore.name),
    title: display(lore.title),
    color: base.color,
    portrait: defaultCharacterPortrait(
      data.weapon,
      setting.gender || lore.worldbook?.match(/^性别[：:]\s*([^\n]+)/m)?.[1],
    ),
    hp: integer(data.hp, 20, 80, '生命'),
    mp: integer(data.mp, 8, 40, '蓝量'),
    attack: integer(data.attack, 3, 14, '普攻'),
    attackName: display(text(data.attackName, '普攻名', 30)),
    weapon: choice(data.weapon, ['sword', 'staff', 'bow'], '武器'),
    limit: integer(data.limit, 1, 2, '行动次数'),
    buffs: {},
    skills: data.skills.map((item, index) =>
      skill(item, `generated-${index + 1}`, true, raw.schemaVersion === 3),
    ),
  };
  if (data.entrySkill || setting.entrySkill) {
    const entryData = data.entrySkill || {};
    const entrySetting = setting.entrySkill || {};
    combat.entrySkill = {
      id: `${id}-entry`,
      name: display(text(entrySetting.name || entryData.name || '入场技', '入场技名', 30)),
      text: resourceText(text(entrySetting.description || entryData.text || '', '入场技说明', 300)),
      target: choice(
        entryData.target || 'opposite',
        ['opposite', 'enemy', 'allEnemies', 'allAllies', 'lowestAlly', 'lowestEnemy', 'self'],
        '入场技目标',
      ),
      effects: Array.isArray(entryData.effects)
        ? effects(entryData.effects, `${id}.entrySkill.effects`)
        : [{ type: 'damage', value: 2 }],
    };
  }
  if (raw.schemaVersion !== 3 && combat.entrySkill && !lore.entrySkill) {
    lore.entrySkill = {
      name: combat.entrySkill.name,
      description: combat.entrySkill.text,
    };
  }
  return {
    id,
    source: 'generated',
    setting: lore,
    combat,
    archetype: base.id,
    ...(raw.levelUpLines
      ? { levelUpLines: raw.levelUpLines.map((line) => text(line, '升级台词', 300)) }
      : {}),
  };
}
/** v3 stores free prose once and compiles the unchanged metadata out of its wrapper. */
function normalizeNovelScript(raw, id, encounterCount) {
  const data = object(raw.data || raw, '剧本数据层');
  if (!Array.isArray(raw.story) || raw.story.length !== encounterCount)
    fail(`剧本正文需要${encounterCount}段文字`);
  const story = raw.story.map((part, index) => text(part, `story[${index}]`, 24000));
  const modern = raw.schemaVersion === 4;
  const npcs =
    Array.isArray(data.npcs) && data.npcs.length <= (modern ? 12 : 3)
      ? data.npcs.map((npc, index) => ({
          id: `npc-${index + 1}`,
          name: text(npc.name, 'NPC名', 30),
          ...(modern && !npc.setting
            ? {
                appearance: text(npc.appearance, 'NPC外貌', 800),
                history: text(npc.history, 'NPC经历', 800),
                encounter: integer(npc.encounter, 0, encounterCount - 1, 'NPC初次出现章节'),
              }
            : { setting: text(npc.setting, 'NPC设定', 2000), encounter: npc.encounter ?? 0 }),
        }))
      : fail('NPC列表');
  const hook = object(data.nextHook, '下章引子');
  return {
    id,
    schemaVersion: raw.schemaVersion,
    story,
    ...(data.encounters ? { encounters: structuredClone(data.encounters) } : {}),
    title: text(data.title, '剧本名', 60),
    synopsis: modern ? '' : text(data.synopsis, '概要', 2000),
    setting: modern ? '' : text(data.setting, '世界设定', 4000),
    tags: tags(data.tags),
    npcs,
    ...(modern
      ? {
          items: (data.items || []).map((item) => ({
            name: text(typeof item === 'string' ? item : item.name, '道具名', 30),
            ...(typeof item === 'string' ||
            item.reference === true ||
            (item.description === undefined && item.value === undefined)
              ? { reference: true }
              : {
                  description: text(item.description, '道具描述', 20),
                  value: integer(item.value, 0, 10000, '以太价值'),
                }),
            encounter: integer(
              typeof item === 'string' ? encounterCount - 1 : item.encounter,
              0,
              encounterCount - 1,
              '收集章节',
            ),
          })),
        }
      : {}),
    nextHook: {
      setting: modern && !hook.setting ? '' : text(hook.setting, '下章伏笔', 2000),
      ...(hook.phase
        ? { phase: choice(hook.phase, ['起', '承1', '承2', '转1', '转2', '合'], '伏笔阶段') }
        : {}),
      ...(modern
        ? {}
        : {
            map: choice(hook.map, MAP_IDS, '下章基础场景'),
            artNodes:
              Array.isArray(hook.artNodes) && hook.artNodes.length <= 6
                ? hook.artNodes.map((node) => text(node, '美术节点', 60))
                : fail('美术节点'),
          }),
    },
  };
}

export function normalizeScript(raw, id, partyIds = [], { encounterCount = ENCOUNTER_COUNT } = {}) {
  object(raw, '剧本');
  if ([3, 4].includes(raw.schemaVersion)) return normalizeNovelScript(raw, id, encounterCount);
  if (![1, 2].includes(raw.schemaVersion)) fail('剧本schemaVersion必须为3（旧存档兼容1/2）');
  const structured = raw.schemaVersion === 2;
  const npcs =
    Array.isArray(raw.npcs) && raw.npcs.length <= 8
      ? raw.npcs.map((npc, index) => ({
          id: `npc-${index + 1}`,
          name: text(npc.name, 'NPC名', 30),
          setting: text(npc.setting, 'NPC设定', 2000),
        }))
      : fail('NPC列表');
  const speakers = ['narrator', ...partyIds, ...npcs.map((npc) => npc.id)];
  const lines = (value, minimum, label) => {
    if (!Array.isArray(value) || value.length < minimum || value.length > 8)
      fail(`${label}需要${minimum}～8段正文`);
    return value.map((line) => {
      const speaker = choice(line.speaker, speakers, `${label}说话人ID`);
      if (!structured) return { speaker, text: text(line.text, '台词', 600) };
      const action = text(line.action, `${label}.action动作/场面描写`, 600);
      if (typeof line.dialogue !== 'string' || line.dialogue.length > 600)
        fail(`${label}.dialogue必须是文字`);
      const dialogue = line.dialogue.trim();
      return { speaker, action, dialogue, text: action + (dialogue ? `\n“${dialogue}”` : '') };
    });
  };
  if (
    !Array.isArray(raw.scenes) ||
    raw.scenes.length !== encounterCount ||
    (!structured && raw.scenes.some((scene, index) => scene.encounter !== index))
  )
    fail(`剧本必须按0～${encounterCount - 1}顺序提供${encounterCount}场剧情`);
  const hook = object(raw.nextHook, '下章引子');
  const scenes = raw.scenes.map((scene, index) => ({
    encounter: index,
    ...(structured ? { opening: text(scene.opening, '每场开场', 600) } : {}),
    before: lines(scene.before, structured ? 0 : 1, `第${index + 1}场before`),
    after: lines(scene.after, structured ? 0 : 1, `第${index + 1}场after`),
    ...(structured ? { interlude: lines(scene.interlude, 0, `第${index + 1}场interlude`) } : {}),
  }));
  return {
    id,
    schemaVersion: raw.schemaVersion,
    title: text(raw.title, '剧本名', 60),
    synopsis: text(raw.synopsis, '概要', 2000),
    setting: text(raw.setting, '世界设定', 4000),
    ...(structured ? { opening: text(raw.opening, '副本总开场', 1800) } : {}),
    tags: tags(raw.tags),
    npcs,
    scenes,
    nextHook: {
      setting: text(hook.setting, '下章伏笔', 2000),
      map: choice(hook.map, MAP_IDS, '下章基础场景'),
      artNodes:
        Array.isArray(hook.artNodes) && hook.artNodes.length <= 6
          ? hook.artNodes.map((node) => text(node, '美术节点', 60))
          : fail('美术节点'),
    },
  };
}

export function settingOnly(entry) {
  return {
    id: entry.id,
    name: entry.setting.name,
    title: entry.setting.title,
    worldbook: characterWorldbook(entry),
    ...(Array.isArray(entry.setting.tags) ? { tags: entry.setting.tags } : {}),
  };
}
