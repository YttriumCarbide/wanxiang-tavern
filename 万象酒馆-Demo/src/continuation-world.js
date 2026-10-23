import { BASE_WORLDS } from './worlds.js';

export function needsContinuationWorld(library, node) {
  return (
    !!node &&
    BASE_WORLDS.includes(node.map) &&
    node.sequence >= 6 &&
    !(library.worlds || []).some((world) => world.id === node.map && world.continuationPrepared)
  );
}

export function continuationInput(library, map) {
  const stories = (library.history || [])
    .filter((record) => record.complete && record.map === map)
    .map((record) => ({
      record,
      book: library.scripts.find((book) => book.id === record.scriptId),
    }))
    .filter(
      ({ book, record }) =>
        (book?.exploration?.sequence ??
          library.exploration[map]?.cleared.find((node) => node.id === record.nodeId)?.sequence ??
          6) < 6,
    )
    .map(({ record, book }) => ({
      sequence:
        book?.exploration?.sequence ??
        library.exploration[map].cleared.find((node) => node.id === record.nodeId)?.sequence,
      title: record.title,
      story: (record.lines || [])
        .filter((line) => line.stage !== 'combat')
        .map((line) => line.text)
        .join('\n\n'),
    }))
    .sort((a, b) => a.sequence - b.sequence);
  return {
    map,
    completedStories: stories,
    instruction:
      '这是原世界六关后的首次继续探索准备。参考所附前六关实际经历，承接其人物和结果；为后续旅途引入至少三个互不相同、可以立即行动的新目标，并新增一组敌人和至少一个全新Boss。输出goals数组（至少3项），每项说明目标、目的地/人物与第一步行动；background/landmarks铺设新地区、势力与冲突。不要复述六关或在旧敌人处打转，不改写既有历史。',
  };
}
