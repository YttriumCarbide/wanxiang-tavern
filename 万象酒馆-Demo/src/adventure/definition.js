import { ITEMS } from '../content/items.js';

export const ADVENTURE_NODE_TYPES = Object.freeze(['battle', 'event', 'elite', 'quest', 'boss']);
export const ADVENTURE_NODE_LABELS = Object.freeze([
  '普通战',
  '旅途事件',
  '精英战',
  '自由探索',
  '首领战',
]);

function text(value, label, max = 2000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw Error(`${label}需要1～${max}字`);
  return value.trim();
}

/** v48 prose overviews remain readable as observations, without inferring solutions. */
export function normalizeSceneOverview(value, fallback = '') {
  if (Array.isArray(value)) {
    if (!value.length || value.length > 12) throw Error('场景观察需要1～12项');
    return value.map((item) => ({
      location: text(item?.location, '观察位置', 40),
      detail: text(item?.detail, '观察内容', 2000),
    }));
  }
  const prose = text(value ?? fallback, '场景概览', 2000);
  const sentences = prose.match(/[^。！？\n]+[。！？]?/gu) || [prose];
  if (sentences.length > 12)
    sentences.splice(11, sentences.length - 11, sentences.slice(11).join(''));
  return sentences.map((detail) => {
    const named = detail.trim().match(/^([^：:]{1,40})[:：]\s*(.+)$/u);
    return { location: named ? named[1] : '周围', detail: named ? named[2] : detail.trim() };
  });
}

/** Event rewards spend the original ordinary encounter's 20 gold budget. */
export function normalizeEventReward(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('事件奖励无效');
  if (Object.keys(value).some((key) => !['gold', 'items'].includes(key)))
    throw Error('事件不能创造新的奖励类型');
  const gold = value.gold ?? 0;
  if (!Number.isInteger(gold) || gold < 0 || gold > 20) throw Error('事件金币范围为0～20');
  if (!Array.isArray(value.items) || value.items.length > 2) throw Error('事件道具列表无效');
  const items = {};
  let cost = gold;
  for (const item of value.items) {
    if (!ITEMS[item.id] || item.count !== 1 || items[item.id]) throw Error('事件道具ID或数量无效');
    items[item.id] = 1;
    cost += ITEMS[item.id].price;
  }
  if (cost > 20) throw Error('事件奖励不能超过原普通战20金币的价值预算');
  return { summonContracts: 0, gold, items };
}

export function normalizeAdventureDefinition(value) {
  if (!value?.event || !value?.quest) throw Error('五节点剧本缺少第二节点事件或第四节点任务');
  const { event, quest } = value;
  if (!Array.isArray(event.choices) || event.choices.length < 2 || event.choices.length > 4)
    throw Error('事件需要2～4个选项');
  if (!Array.isArray(quest.goals) || quest.goals.length < 2 || quest.goals.length > 6)
    throw Error('第四节点需要2～6个目标');
  const goals = quest.goals.map((goal, index) => {
    if (typeof goal.required !== 'boolean') throw Error('任务必须标明是否必选');
    return {
      id: `goal-${index + 1}`,
      title: text(goal.objective ?? goal.title, '一句话目标', 180),
      description: text(goal.description ?? goal.objective ?? goal.title, '任务说明', 600),
      required: goal.required,
    };
  });
  if (!goals.some((goal) => goal.required)) throw Error('第四节点至少有一个必选目标');
  return {
    event: {
      id: 'event-2',
      title: text(event.title, '事件名', 60),
      description: text(event.description, '事件场景', 1000),
      choices: event.choices.map((choice, index) => ({
        id: `choice-${index + 1}`,
        label: text(choice.label, '选项', 180),
        detail: text(choice.detail, '选项说明', 500),
        reward: normalizeEventReward(choice.reward),
      })),
    },
    quest: {
      title: text(quest.title, '任务场景名', 60),
      description: text(quest.description, '情境与线索', 2000),
      overview: normalizeSceneOverview(quest.overview, quest.description),
      commonState: text(quest.commonState, '通往Boss的共同剧情状态', 1000),
      goals,
    },
  };
}

/** Existing books compile through the same normalizer after saving IDs and reward maps. */
export function savedAdventureInput(definition) {
  return {
    ...definition,
    event: {
      ...definition.event,
      choices: definition.event.choices.map((choice) => ({
        ...choice,
        reward: {
          gold: choice.reward.gold,
          items: Object.entries(choice.reward.items).map(([id, count]) => ({ id, count })),
        },
      })),
    },
  };
}

export function adventureDefinitionSchema() {
  const string = (maxLength) => ({ type: 'string', minLength: 1, maxLength });
  const object = (properties) => ({
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  });
  return object({
    event: object({
      title: string(60),
      description: string(1000),
      choices: {
        type: 'array',
        minItems: 2,
        maxItems: 4,
        items: object({
          label: string(180),
          detail: string(500),
          reward: object({
            gold: { type: 'integer', minimum: 0, maximum: 20 },
            items: {
              type: 'array',
              minItems: 0,
              maxItems: 2,
              items: object({
                id: {
                  type: 'string',
                  enum: Object.keys(ITEMS).filter((id) => ITEMS[id].price <= 20),
                },
                count: { type: 'integer', const: 1 },
              }),
            },
          }),
        }),
      },
    }),
    quest: object({
      title: string(60),
      description: string(2000),
      overview: {
        type: 'array',
        minItems: 1,
        maxItems: 12,
        items: object({ location: string(40), detail: string(240) }),
      },
      commonState: string(1000),
      goals: {
        type: 'array',
        minItems: 2,
        maxItems: 6,
        items: object({
          objective: string(180),
          required: { type: 'boolean' },
        }),
      },
    }),
  });
}
