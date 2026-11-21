const hit = (value) => ({ type: 'damage', value });
const buff = (key, value, target = 'opponents') => ({ type: 'buff', buff: key, value, target });
const selfShieldEffect = (value) => ({ type: 'shield', target: 'self', value });
const move = (name, text, effects, extra = {}) => ({
  name,
  text,
  slot: 1,
  effects,
  ...extra,
});

/** Quarry Overlord entry for archive showcase and standard data compatibility. */
export const QUARRY_BOSSES = Object.freeze([
  {
    id: 'darkscaleWarlord',
    name: '初生暗鳞督军',
    title: '裂隙霸主 / 初生暗鳞统御者',
    boss: true,
    overlord: true,
    standOnCard: true,
    actions: 2,
    enragedActions: 2,
    splitActions: true,
    phaseMode: 'threshold',
    phaseThreshold: 0.5,
    color: '#9b5cf6',
    portrait: 'darkscale-warlord',
    model: 'darkscale-warlord.glb',
    attackStyle: 'void-collapse',
    attackType: 'dark',
    weaknesses: ['light', 'fire', 'spear', 'axe'],
    toughness: 8,
    hp: 314,
    mp: 0,
    speed: 4,
    limit: 1,
    buffs: { iron: 1 },
    phaseShields: Object.freeze([0, 14]),
    tactic: { target: 'fixed' },
    overlordTraits: Object.freeze(['eclipsescaleOverlord', 'warlord']),
    eclipsescaleConfig: Object.freeze({
      maxIronStacks: 4,
      gainIronOnCleanRoundEnd: 1,
      gainShieldOnCleanRoundEnd: 6,
      bonusDamagePercentPerIron: 8,
      shedIronOnMultiDebuff: 2,
      multiDebuffThreshold: 2,
      clearIronOnBreak: true,
    }),
    warlordCommand: Object.freeze({
      cadenceRounds: 2,
      summonId: 'riftDarkDust',
      summonName: '游离暗尘',
      summonCount: 2,
      maxAlive: 2,
      consumeShieldPerMinion: 8,
      consumeStrengthPerMinion: 1,
    }),
    description:
      '自灰岩旧采石场深层裂隙的暗紫晶石中破晶而出的初生蚀鳞霸主。周身覆满层叠黑曜龙鳞与灰岩骨脊，胸廓骨笼中搏动着裂隙暗核，右臂畸化为锋锐紫晶裂刃，左腕仍拖曳着崩断的采石铁枷，能借统御咆哮号令游离暗尘合围并不断自裂隙蓄积硬化暗鳞。',
    intents: [
      move(
        '暗鳞裂斩',
        '挥动紫晶畸化右刃斜劈中位10伤害，施加2层流血。',
        [hit(10), buff('bleed', 2)],
        {
          slot: 1,
          damageType: 'dark',
          clip: 'Normal_Attack',
        },
      ),
      move(
        '督军咆哮',
        '发出统御咆哮震伤全前场各6伤害、施加1层虚弱，并号令裂隙游离暗尘聚拢合围。',
        [hit(6), buff('weak', 1)],
        {
          slots: [0, 1, 2],
          damageType: 'dark',
          clip: 'Warlord_Roar',
          warlordRally: true,
        },
      ),
      move(
        '暗气汲取',
        '张开背脊晶鳍自岩缝汲取暗气并收束场上暗尘，获得14护盾与1层力量。',
        [selfShieldEffect(14), buff('strength', 1, 'self')],
        {
          slot: 1,
          clip: 'Special_Action',
          warlordConsume: true,
        },
      ),
    ],
    enragedIntents: [
      move(
        '裂隙碎岩重砸',
        '崩碎残枷高跃重砸矿岩，震伤全前场各7伤害并施加1层易伤。',
        [hit(7), buff('vulnerable', 1)],
        {
          slots: [0, 1, 2],
          enraged: true,
          damageType: 'dark',
          clip: 'Special_Attack',
        },
      ),
      move(
        '晶尾横扫',
        '甩动缀满暗晶棘刺的长尾横扫两翼各8伤害，施加2层流血。',
        [hit(8), buff('bleed', 2)],
        {
          slots: [0, 2],
          enraged: true,
          damageType: 'axe',
          clip: 'Warlord_Tail_Sweep',
        },
      ),
      move(
        '崩枷统御斩',
        '左腕断枷横砸接紫晶右刃重劈中位11伤害，获得10护盾并震荡裂隙再度召尘。',
        [hit(11), selfShieldEffect(10)],
        {
          slot: 1,
          enraged: true,
          damageType: 'dark',
          clip: 'Normal_Attack',
          warlordRally: true,
        },
      ),
    ],
  },
]);
