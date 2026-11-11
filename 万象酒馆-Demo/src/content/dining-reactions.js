/** Local menu previews; the actual dinner conversation still follows character settings. */
export const DEFAULT_DINING_REACTIONS = {
  喜欢: ['真不错，正合我的口味。', '这些菜能多留一份给我吗？', '闻着就很香，我很期待。'],
  一般: ['看起来还可以，尝尝吧。', '偶尔换换口味也不错。', '谢谢，给我一小份就好。'],
  讨厌: [
    '谢谢，这些菜我少尝一点就好。',
    '这些菜不太合口味，我尝一点就好。',
    '不用为我多盛，大家吃好就行。',
  ],
};

export const OFFICIAL_DINING_REACTIONS = {
  aegis: {
    喜欢: ['这些菜我喜欢。你也尝尝，别只顾着给我夹。', '嗯……很好吃。下回也一起吃吧。'],
    一般: ['还不错。坐下来慢慢吃，不着急。', '我都可以，你想吃什么就点什么。'],
    讨厌: ['这味道……我不太习惯。没关系，你喜欢就好。', '给我少盛一点吧，别浪费了。'],
  },
  edith: {
    喜欢: ['主人，眼光真好！这些菜我要认真期待一下。', '这一口值得写进诗里……先让我再尝一口。'],
    一般: ['今天的餐桌，也会是旅途里值得记住的一页。', '我来分盘吧。主人，先给你盛一点？'],
    讨厌: ['这些菜呀……我尝一小口，剩下的留给喜欢的人。', '主人不用替我添了，陪大家坐着就很好。'],
  },
  pandora: {
    喜欢: ['主人……这个真的可以给潘多拉吗？好开心。', '是喜欢的味道。潘多拉想慢慢吃完。'],
    一般: ['嗯，潘多拉会好好吃的。主人也要吃饱。', '大家一起吃的话，这样就很好了。'],
    讨厌: ['主人，潘多拉只要一点点……不是不领情。', '这个味道有些不习惯，不过潘多拉可以尝一口。'],
  },
  'luo-gongxu': {
    喜欢: ['此味甚合我意。能与你共席，更添几分滋味。', '火候与调味都好，容我再添一筷。'],
    一般: ['一饭一蔬，足慰行旅。诸位不必拘礼。', '味道尚可。吃饭时，就暂且不谈烦心事了。'],
    讨厌: ['此味于我稍重，浅尝便好，莫要为我另忙。', '各有所好，我取少许便是，诸位尽兴。'],
  },
  'silica-laps': {
    喜欢: ['呵，这口感真可爱。再来一份的代价是什么？', '嗯哼，舌尖都醒过来了。请把这一盘留给我。'],
    一般: [
      '不坏，只是还没有让我记住它的味道。',
      '普通的滋味也有价值。至少不用付出什么代价，对吧？',
    ],
    讨厌: ['哎呀，这口味可不值得我冒险。给我一点就够。', '真遗憾，它和我的舌头没能谈拢。你们请。'],
  },
};

export function diningReaction(member, taste, foodId, cycle) {
  const lines =
    (member.source === 'official' && OFFICIAL_DINING_REACTIONS[member.combat.id]?.[taste]) ||
    DEFAULT_DINING_REACTIONS[taste];
  let seed = Math.max(0, cycle);
  for (const character of `${member.id}:${foodId}`)
    seed = (seed * 31 + character.charCodeAt(0)) >>> 0;
  return lines[seed % lines.length];
}
