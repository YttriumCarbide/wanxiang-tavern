import { newWorldEntry } from './worldbook.js';
import { BUFFS } from '../data.js';
import { EMBLEMS } from '../emblems.js';
import { officialStatReferences } from '../character-generation.js';

/** Append current rules without destroying custom story, injection settings or edited character lore. */
export function upgradeStatusEmblems(source) {
  const book = structuredClone(source);
  const uid = Math.max(-1, ...Object.keys(book.entries || {}).map(Number)) + 1;
  const marker = '【状态与纹章规则 v36】';
  const rules = [
    marker,
    '虚弱、易伤正常回合末各减1层，层数代表持续时间，倍率仍分别为减伤25%与受攻击增伤50%。先手阶段不衰减。纯减益技能常规至少2层，附带伤害、治疗或其他主要效果时可以1层。潘多拉王冠玩偶与长景月汐满月、入场易伤/虚弱固定为2层。',
    '力量、铁皮、守势、敏捷同场不衰减，敏捷最多增加2次行动；中毒、流血、再生在正常回合结束统一减1层，中毒/再生先结算再衰减，流血仍在每次行动前结算。生成这三类状态时给足层数，通常3～6层，强力专精可更高。不得凭空增加独立持续时间字段。再生不能设计成永久光环，应使用有次数限制的事件施加；旧持续再生按本场条件首次满足时获得一次、随后衰减处理。',
    '迟缓2层及以上正常回合末减1层，1层不衰减；敌方不能给我方迟缓。禁锢、超限最多1层。禁锢本回合末解除；超限下次角色技能消耗翻倍并额外释放一次，用后消耗，跨回合和结合结束不消失，跨战斗清除。',
    '剑姿——流星为7sp：2层力量、1层铁皮、1层敏捷，本场普攻额外攻击一次，不叠加额外次数。潘多拉入场自身受到5伤害，禁锢对位敌人，不对敌人造成5伤害。',
    '固定纹章士共五位，禁止AI另造纹章。除过载已有装备基础属性外，纹章战斗被动在结合期间生效。龙脉属于前场位置，换人仍保留，本场结束清除。城之祭的10%伤害只由其他队友承受，不伤本人；任意单位死亡为所有存活我方回复20%hp/sp，不复活。欺之牺吸收仅本场有效，献祭会使其他存活敌人回满hp，死亡的敌人不复活。',
    '纹章奖励由代码在Boss战开始时发放：遗迹第二关檀虹羽保持原教学；遗迹第三关水无月兰；遗迹第六关阿佩普的羔羊神威；树林第二关玖柒；树林第四关风在舞。用意外发现戒指及伊蒂丝/潘多拉/旁白的对话融入情节，不再写回酒馆命运桌领取的教学，不代替玩家说话。',
    ...Object.values(EMBLEMS).map(
      ({ emblem, skill }) =>
        `${emblem.title}·${emblem.name}：${emblem.text}\n${skill.name}：${skill.text}`,
    ),
    '实际状态：' +
      Object.entries(BUFFS)
        .map(([id, item]) => `${id}：${item.text}`)
        .join('；'),
  ].join('\n\n');
  const previous = Object.values(book.entries).find(
    (entry) => entry.extensions?.wanxiang?.generationRule === 'status-emblems',
  );
  if (previous) previous.content = rules;
  else
    book.entries[uid] = {
      ...newWorldEntry(uid),
      comment: '战斗状态衰减、角色与五枚纹章',
      constant: true,
      order: 9998,
      apiTargets: ['character', 'script', 'chat', 'quick-chat', 'map', 'creation'],
      content: rules,
      extensions: { wanxiang: { generationRule: 'status-emblems' } },
    };
  for (const entry of Object.values(book.entries)) {
    if (entry.extensions?.wanxiang?.generationRule === 'character-numeric-reference')
      entry.content =
        '下列均为官方角色1级、无装备基础数值；状态按v36规则结算。\n' +
        JSON.stringify(officialStatReferences(), null, 2);
  }
  return book;
}
