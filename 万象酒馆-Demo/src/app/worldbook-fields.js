/** The ST entry fields are editable directly; plugin metadata is retained in full JSON too. */
export const WORLD_FIELD_GROUPS = [
  [
    '正文与触发',
    [
      ['comment', '标题 / 备忘', 'text'],
      ['key', '主要关键字', 'list'],
      ['keysecondary', '可选过滤器', 'list'],
      ['disable', '禁用条目', 'checkbox'],
      ['constant', '🔵 常驻', 'checkbox'],
      ['vectorized', '向量化标记（需外部向量插件）', 'checkbox'],
      ['selective', '启用次关键词条件', 'checkbox'],
      ['selectiveLogic', '逻辑', 'select', ['AND ANY', 'NOT ALL', 'NOT ANY', 'AND ALL']],
      ['addMemo', '标题作为备注元数据', 'checkbox'],
      ['content', '内容', 'textarea'],
    ],
  ],
  [
    '位置与概率',
    [
      [
        'position',
        '注入位置',
        'select',
        [
          '角色定义之前',
          '角色定义之后',
          '作者注释之前',
          '作者注释之后',
          '插入深度 @D',
          '示例消息之前',
          '示例消息之后',
          'Outlet',
        ],
      ],
      ['depth', '深度 @D', 'number'],
      ['role', '消息角色', 'select', ['SYSTEM · 系统', 'USER · 用户', 'ASSISTANT · AI']],
      ['order', '顺序', 'number'],
      ['outletName', 'Outlet名称（预设中用{{outlet::名称}}）', 'text'],
      ['useProbability', '启用概率', 'checkbox'],
      ['probability', '触发概率 %', 'number'],
      ['ignoreBudget', '忽略预算', 'checkbox'],
    ],
  ],
  [
    '扫描与递归',
    [
      ['scanDepth', '扫描深度（空=全局）', 'nullableNumber'],
      ['caseSensitive', '区分大小写', 'tri'],
      ['matchWholeWords', '完整单词匹配', 'tri'],
      ['excludeRecursion', '递归时不扫描本条', 'checkbox'],
      ['preventRecursion', '本条不触发其他条目的递归', 'checkbox'],
      ['delayUntilRecursion', '延迟至递归层级（0=不延迟）', 'number'],
      ['matchPersonaDescription', '扫描玩家设定', 'checkbox'],
      ['matchCharacterDescription', '扫描角色正文', 'checkbox'],
      ['matchCharacterPersonality', '扫描角色性格（本游戏来自同一份正文）', 'checkbox'],
      ['matchCharacterDepthPrompt', '扫描角色备注', 'checkbox'],
      ['matchScenario', '扫描场景', 'checkbox'],
      ['matchCreatorNotes', '扫描作者备注', 'checkbox'],
      ['triggers', '生成触发类型（normal/character/script等）', 'list'],
    ],
  ],
  [
    '互斥组与时间效果',
    [
      ['group', '互斥组（逗号分隔）', 'text'],
      ['groupOverride', '组内优先', 'checkbox'],
      ['groupWeight', '组内权重', 'number'],
      ['useGroupScoring', '组内按关键词得分', 'tri'],
      ['sticky', '黏性：持续几次成功生成', 'nullableNumber'],
      ['cooldown', '冷却：几次成功生成', 'nullableNumber'],
      ['delay', '延迟：第几次成功生成起', 'nullableNumber'],
      ['automationId', 'Automation ID（元数据，不执行脚本）', 'text'],
    ],
  ],
];
export const WORLD_GLOBAL_FIELDS = [
  ['depth', '扫描深度', 'number'],
  ['minActivations', '最少激活数', 'number'],
  ['minActivationsDepthMax', '为最少激活扩展的最大深度（0=全部）', 'number'],
  ['contextSize', '上下文容量（预算基数）', 'number'],
  ['budget', '世界书预算 %', 'number'],
  ['budgetCap', '世界书token上限（0=不限）', 'number'],
  ['recursive', '递归扫描', 'checkbox'],
  ['maxRecursionSteps', '最多递归步数（0=自动上限）', 'number'],
  ['includeNames', '扫描时包含说话人名', 'checkbox'],
  ['caseSensitive', '全局区分大小写', 'checkbox'],
  ['matchWholeWords', '全局完整单词', 'checkbox'],
  ['useGroupScoring', '全局组内评分', 'checkbox'],
  ['overflowAlert', '显示预算溢出提示', 'checkbox'],
  [
    'characterStrategy',
    '角色书 / 全局书优先级',
    'select',
    ['混合按顺序', '角色书优先', '全局书优先'],
  ],
  ['persona', '玩家设定（Persona）', 'textarea'],
  ['characterNotes', '角色深度备注（扫描用）', 'textarea'],
  ['creatorNotes', '创作备注（扫描用）', 'textarea'],
  ['authorNote', '作者注释（位于作者注释前/后条目之间）', 'textarea'],
];

/** Comma-separated ST keywords; commas inside slash-delimited regex stay in the expression. */
export function parseWorldKeywords(text) {
  if (!text.trim()) return [];
  if (/^\[\s*(?:"|\])/.test(text.trim())) {
    const values = JSON.parse(text);
    if (!Array.isArray(values) || values.some((item) => typeof item !== 'string'))
      throw Error('关键字需要文字列表');
    return values;
  }
  const result = [];
  let word = '',
    regex = false,
    escaped = false,
    bracket = false;
  for (const char of text) {
    if (!escaped && char === '/' && (!word.trim() || (regex && !bracket))) regex = !regex;
    if (regex && !escaped && char === '[') bracket = true;
    if (regex && !escaped && char === ']') bracket = false;
    if (!regex && [',', '，', '\n'].includes(char)) {
      if (word.trim()) result.push(word.trim());
      word = '';
    } else word += char;
    escaped = char === '\\' && !escaped;
  }
  if (word.trim()) result.push(word.trim());
  return [...new Set(result)];
}
