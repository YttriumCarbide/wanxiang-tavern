export const DEFAULT_LEVEL_LINES = Object.freeze([
  '我变得更强了！',
  '力量正在源源不断地涌出。',
  '嗯……',
  '这份力量，我记住了。',
  '比刚才更熟练了一点。',
  '状态不错，可以继续前进。',
  '身体逐渐适应了。',
  '又掌握了一些诀窍。',
  '接下来也能派上用场。',
  '继续积累下去吧。',
]);
export const OFFICIAL_LEVEL_LINES = Object.freeze({
  'official-pandora': [
    '主人……潘多拉变得更强了……',
    '为了守护大家，我一定要更加努力！',
    '眼睛的力量变得更加充沛了呢。',
    '小熊，你也变得更强了呢，真好！',
    '我不要再当漂流的残次品了，我也有……家了……',
  ],
  'official-edith': [
    '这种感觉很奇妙，像是在宇宙种下了一颗新的星辰。',
    '星光看上去很冷，但是律动的恒星本身，如同这股能量，炽热得过分。',
    '群星，蕴含着“引力”的权柄，足够强大，神秘。但是只有引力，是不够的。',
    '每个人都会有希望被人保护、被人所爱的时刻……那么你呢？你也会有那一刻吗？',
    '宇宙很大，但是世界更大，旅途还很遥远，继续前进吧。',
  ],
});
export function levelLines(member) {
  return member.levelUpLines?.length
    ? member.levelUpLines
    : OFFICIAL_LEVEL_LINES[member.id] || DEFAULT_LEVEL_LINES;
}
