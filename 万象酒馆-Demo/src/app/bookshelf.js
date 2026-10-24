import { query as $ } from './dom.js';

const BOOKS = Object.freeze([
  {
    title: '酒馆手册',
    text: '召唤之门迎接新的同行者，副本之门通往异境。出发前可在整备中调整前后场、装备与纹章士。虚空售货机提供补给，以太凝聚器将旅途中归档的物品构筑为装备。',
  },
  {
    title: '战斗与站位',
    text: '把行动安排到时间格，再播放整回合。每位角色拥有自己的行动次数。前后场交换和道具也消耗AP；后场入场技就绪后换入前场会自动触发。对位没有敌人时，对位攻击会落空。',
  },
  {
    title: '纹章之书',
    text: '主动攻击积累一格纹章充能，后场角色每回合结束积累两格。常亮代表现有充能，闪烁代表本回合预计新增的充能。六格充满后可结合；结合最多持续三回合，结合技每次结合限用一次。',
  },
  {
    title: '旅途与记忆',
    text: '记录保留已经经历的副本正文，归档保存遇见的人物、物品与敌人。总结以一趟副本或一轮完整聊天为单位压缩记忆；原文仍然保留。继续探索会承接既有经历，扩展新目标与世界。',
  },
]);

export function createBookshelf(context) {
  const dialog = $('#bookshelf-dialog');
  function select(index) {
    const book = BOOKS[index];
    $('#bookshelf-text').replaceChildren();
    const title = document.createElement('h3');
    title.textContent = book.title;
    const text = document.createElement('p');
    text.textContent = book.text;
    $('#bookshelf-text').append(title, text);
    for (const button of $('#bookshelf-books').children)
      button.setAttribute('aria-pressed', String(Number(button.dataset.book) === index));
  }
  for (const [index, book] of BOOKS.entries()) {
    const button = document.createElement('button');
    button.textContent = book.title;
    button.dataset.book = index;
    $('#bookshelf-books').append(button);
  }
  context.events.on($('#bookshelf-books'), 'click', (event) => {
    const button = event.target.closest('[data-book]');
    if (button) select(Number(button.dataset.book));
  });
  context.events.on($('#bookshelf-close'), 'click', () => dialog.close());
  context.events.on(dialog.querySelector('.bookshelf-actions'), 'click', (event) => {
    if (event.target.closest('button')) dialog.close();
  });
  select(0);
  return {
    open(action) {
      if (context.session.runtime.mode !== 'inn') return;
      const entry = {
        archives: '#archives-open',
        records: '#records-open',
        memory: '#memory-open',
      }[action];
      if (entry) $(entry).click();
      else if (!dialog.open) dialog.showModal();
    },
    dispose() {
      dialog.close();
      $('#bookshelf-books').replaceChildren();
    },
  };
}
