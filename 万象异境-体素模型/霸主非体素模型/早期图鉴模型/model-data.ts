export type EnemyId = 'apep-lamb' | 'moon-eye' | 'ares' | 'radiant-wyvern';

type MoveTiming = { duration: number };

type ModelDefinition = {
  id: EnemyId;
  number: string;
  name: string;
  color: string;
  parts: { name: string }[];
  moves: [MoveTiming, MoveTiming, MoveTiming];
  alternate?: MoveTiming;
};

export const enemies: ModelDefinition[] = [
  {
    id: 'apep-lamb',
    number: '001',
    name: '阿佩普的羔羊',
    color: '#b899d6',
    parts: [{ name: '诅咒羊首' }, { name: '异化触须' }, { name: '黑泥幼体' }],
    moves: [{ duration: 2.4 }, { duration: 4.8 }, { duration: 5.6 }],
  },
  {
    id: 'moon-eye',
    number: '002',
    name: '母树之魔眼',
    color: '#82c6b5',
    parts: [{ name: '母树之魔眼' }, { name: '月蚀树冠' }, { name: '月痕树根' }],
    moves: [{ duration: 2.8 }, { duration: 4.4 }, { duration: 6.0 }],
  },
  {
    id: 'ares',
    number: '003',
    name: '战斗机兵·阿瑞斯',
    color: '#b8c58d',
    parts: [{ name: '阿瑞斯主机' }, { name: '左浮游炮' }, { name: '右浮游炮' }],
    moves: [{ duration: 3.0 }, { duration: 4.2 }, { duration: 5.4 }],
  },
  {
    id: 'radiant-wyvern',
    number: '004',
    name: '辉光亚龙',
    color: '#e7c47c',
    parts: [{ name: '耀光龙翼' }, { name: '白金鳞甲' }, { name: '辉光龙爪' }],
    moves: [{ duration: 2.6 }, { duration: 4.6 }, { duration: 6.0 }],
    alternate: { duration: 3.2 },
  },
];
