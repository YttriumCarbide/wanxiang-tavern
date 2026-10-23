/** Authored companion; pool identity is independent from the six battle slot IDs. */
export const PANDORA = {
  id: 'pandora',
  name: '潘多拉',
  title: '星钟引路人',
  weapon: 'staff',
  portrait: 'pandora.png',
  color: '#cbb3ed',
  hp: 42,
  mp: 36,
  attack: 8,
  limit: 2,
  attackName: '星芒法术',
  skills: [
    {
      id: 'crowned-doll',
      name: '王冠玩偶',
      ap: 1,
      mp: 3,
      target: 'enemy',
      text: '玩偶变大扑向敌人，造成14伤害，施加2层虚弱。',
      effects: [
        { type: 'damage', value: 14 },
        { type: 'buff', buff: 'weak', value: 2 },
      ],
    },
    {
      id: 'clock-bind',
      name: '停驻的刻度',
      ap: 1,
      mp: 10,
      target: 'enemy',
      text: '表盘跳动，禁锢目标，取消其本回合尚未执行的行动。回合结束解除。',
      effects: [{ type: 'buff', buff: 'bind', value: 1 }],
    },
  ],
  entrySkill: {
    id: 'entry-pandora',
    name: '魔偶时停扑击',
    text: '换入时自身受到5伤害，禁锢正对位敌人，取消其本回合尚未执行的行动。',
    target: 'opposite',
    selfDamage: 5,
    effects: [{ type: 'buff', buff: 'bind', value: 1 }],
  },
};

export const PANDORA_SETTING = {
  name: '潘多拉',
  gender: '女',
  age: '19',
  appearance:
    '紫色长发垂落肩背，额前有细碎刘海。皮肤白皙，容貌娇弱美丽，像一个瓷娃娃。一只眼睛闪耀金色星芒，另一只眼睛浮现精密表盘。身穿黑、白、紫相间的洛丽塔，头戴繁复的蕾丝头饰与星月吊坠，手中始终抱着一只戴王冠的玩偶。',
  profession: {
    name: '星钟引路人',
    description:
      '诞生自多元宇宙意志，使命是召唤并忠心辅佐<user>。能借助法杖引动星芒，驱使王冠玩偶保护主人，也能通过眼中的表盘令敌人的动作短暂停驻。',
  },
  personality:
    '不善交际，软弱而害羞，内心缺乏自信，总担心自己做得不够好。接到使命后虽然害怕，却也带着几分期待。对<user>绝对忠诚，称呼<user>为“主人”。善于观察细节，常能发现旁人忽略的线索，但害怕说错，不敢当众公布，只会靠近主人，偷偷告诉主人自己的发现。说话轻而迟疑，必要时会鼓起勇气保护主人。',
  history:
    '多元宇宙意志赋予潘多拉形体与使命，让她守候在裂隙间的万象酒馆。她独自检查召唤之门，反复练习见面时该说的话。门扉终于亮起，她抱紧玩偶，看着<user>从白光中出现。只一眼，她便确认，这就是值得自己辅佐一生的主人。',
  attack: {
    name: '星芒法术',
    description:
      '抬起法杖，杖端的星芒聚成一束明亮的光，飞向敌人。施法后她会下意识看向主人，确认自己没有妨碍主人的安排。',
  },
  skills: [
    {
      name: '王冠玩偶',
      description:
        '轻轻松开怀里的玩偶。玩偶自行奔向敌人，身体膨大数倍，用柔软却沉重的双臂扑击，将敌人的发力打乱。潘多拉在后方捏紧裙边，目光始终追着玩偶。',
    },
    {
      name: '停驻的刻度',
      description:
        '表盘眼中的刻度跳动一次。她凝视的敌人如同被钉在一瞬间，动作骤然停住，未能完成这一次出手。刻度的微光随这个回合的结束散去。',
    },
  ],
  entrySkill: {
    name: '魔偶时停扑击',
    description:
      '换入前场时自身受到5伤害，眼眸表盘跳动，禁锢正对位敌人，取消其本回合尚未执行的行动。',
  },
};
