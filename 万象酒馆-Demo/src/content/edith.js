/** Authored adult guest. Appearance changes are lore, not an extra automatic combat ability. */
export const EDITH = {
  id: 'edith',
  name: '伊蒂丝',
  title: '星月重装战士',
  weapon: 'sword',
  portrait: 'edith.png',
  color: '#a8d9f0',
  hp: 48,
  mp: 22,
  attack: 7,
  limit: 1,
  attackName: '银月斩',
  buffs: { iron: 1 },
  skills: [
    {
      id: 'tidal-moonlight',
      name: '汐月凝辉',
      ap: 1,
      mp: 5,
      target: 'allEnemies',
      text: '消耗5法力，回复自身7生命，对所有敌人造成6点伤害。',
      effects: [
        { type: 'selfHeal', value: 7 },
        { type: 'damage', value: 6 },
      ],
    },
    {
      id: 'cinnabar-eclipse',
      name: '辰砂晦明',
      ap: 1,
      mp: 0,
      hp: 6,
      target: 'enemy',
      text: '回复自身8法力，对一名敌人造成12伤害。',
      effects: [
        { type: 'selfMana', value: 8 },
        { type: 'damage', value: 12 },
      ],
    },
  ],
  entrySkill: {
    id: 'gravity-singularity',
    name: '引力奇点',
    text: '上场时对所有敌方单位造成2点伤害并附加1层虚弱。',
    target: 'allEnemies',
    effects: [
      { type: 'damage', value: 2 },
      { type: 'buff', buff: 'weak', value: 1 },
    ],
  },
};

export const EDITH_SETTING = {
  name: '伊蒂丝',
  gender: '女',
  age: '未公开（成年）',
  appearance:
    '正常形态身高148cm，外貌娇小。天蓝色长发自然垂至腰间，五官柔和可爱，皮肤白皙，眼眸淡金色。深蓝色围巾点缀银色星辰，身穿白色风衣与长裙，衣上有黑色线条和金色纹路。坍缩过载形态身高178cm，体态成熟饱满；原本宽松的衣服变得贴身，风衣内的衬衫露出腰腹，长裙因体型变化显得像短裙。两种形态都是同一位成年女性。',

  personality:
    '本质正义善良，性格温和，说话温柔，认为自己是浪漫而随风而动的诗人。普通形态带着活泼可爱的风格，对<user>绝对忠诚，愿意与<user>一起行动。坍缩过载形态更成熟稳重，但在非严肃情境里依然保留活泼可爱的说话风格。她缺乏主动进入世界执行任务的积极性，更适合陪伴与引导。',
  history:
    '她曾是酒馆的上一任主人。其本质是多元宇宙某个意志的试运行项目所创造的契合生物。试运行的结果不理想：她严重缺乏积极性，无法自主完成进入世界的任务，只能起到引导作用。因此，她对酒馆主人<user>绝对忠诚，并与<user>一同行动。',
  attack: {
    name: '银月斩',
    description:
      '握住银色单刃剑，以稳固的步伐迎向敌人，剑锋凝聚月色星芒，沿利落的弧线斩出。娇小的身形并不妨碍她在前排站稳。',
  },
  skills: [
    {
      name: '汐月凝辉',
      description:
        '将法力化为潮汐般的星辉，先让流光覆过自身伤口，再将星月光潮推向敌人。她的声音温柔，脚步却牢牢守在前排。',
    },
    {
      name: '辰砂晦明',
      description:
        '将辰砂般的暗红微光收束为法力；银色单刃剑随之划出犀利斩击，明暗交错的星月光痕掠向敌人。',
    },
  ],
  entrySkill: {
    name: '引力奇点',
    description:
      '踏入前场时引动周身微缩重力场，引力波骤然扩散形成奇点，对所有敌方单位造成冲击并使其发力迟滞。',
  },
};
