/** Preserve edited prose and injection switches while retiring the old teammate-art allowance. */
export function upgradeEnemyAppearanceRules(book) {
  const result = structuredClone(book);
  const guidance =
    '【敌人专用外貌】敌人的portrait只从本次reference.appearances列出的敌方外貌中选择，禁止使用队友默认立绘或官方角色图片。剑士、法师、游侠各男女的六套人形敌人体素模板可用于普通敌人及Boss；模板只决定外形，姓名、世界身份、数值和意图仍按剧本设计。';
  for (const entry of Object.values(result.entries || {})) {
    if (entry.extensions?.wanxiang?.generationRule !== 'map-output') continue;
    entry.content = entry.content.replace(
      '所有外貌只能从提供的appearances选择，包括默认队友图标。',
      '所有外貌只能从本次提供的appearances敌方模板中选择。',
    );
    entry.content = entry.content.replace(
      'Boss外貌可选任意已有怪物或角色图标，不必使用Boss图标。',
      'Boss外貌可选任意已有怪物或人形敌人体素模板，不必使用Boss图标，禁止使用队友立绘。',
    );
    if (!entry.content.includes('【敌人专用外貌】')) entry.content += '\n\n' + guidance;
  }
  return result;
}
