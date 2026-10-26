import { authoredGalContent } from '../gal.js';

/** One owned typewriter, shared by the opening prose and Edith's action-gated lessons. */
export function createDialogue(events, id = 'guide-dialogue', gal = null) {
  const panel = document.createElement('dialog');
  panel.id = id;
  panel.className = 'guide-dialogue';
  panel.innerHTML =
    '<div class="dialogue-bonuses"></div><img class="guide-portrait" hidden alt="" /><div class="dialogue-body"><small id="dialogue-speaker">伊蒂丝</small><p id="dialogue-text"></p><button id="dialogue-next">点击展开全文</button></div>';
  if (id !== 'guide-dialogue') {
    for (const element of panel.querySelectorAll('[id]')) element.id = id + '-' + element.id;
  }
  document.body.append(panel);
  const part = (name) =>
    panel.querySelector('[id="' + (id === 'guide-dialogue' ? '' : id + '-') + name + '"]');
  const text = part('dialogue-text');
  const next = part('dialogue-next');
  let timer = null,
    lines = [],
    index = 0,
    count = 0,
    done = null;
  function stop() {
    clearInterval(timer);
    timer = null;
  }
  function render() {
    stop();
    count = 0;
    const line = lines[index];
    const bonuses = panel.querySelector('.dialogue-bonuses');
    bonuses.replaceChildren(
      ...(line.bonuses || []).map((bonus, index) => {
        const badge = document.createElement('span');
        badge.textContent = bonus;
        badge.animate(
          [
            { opacity: 0, translate: '0 15px' },
            { opacity: 1, translate: '0 0' },
          ],
          { duration: 380, delay: index * 100, fill: 'backwards' },
        );
        return badge;
      }),
    );
    bonuses.hidden = !line.bonuses?.length;
    const opening = panel.classList.contains('opening-prose');
    panel.dataset.speaker = line.speaker;
    part('dialogue-speaker').textContent = opening ? line.speaker || '白光之后' : line.speaker;
    const portrait = panel.querySelector('.guide-portrait');
    portrait.hidden = !line.portrait;
    if (line.portrait) portrait.src = line.portrait;
    else portrait.removeAttribute('src');
    panel.classList.toggle('without-portrait', !line.portrait);
    panel.querySelector('.guide-portrait').alt = line.speaker;
    const letters = Array.from(line.text);
    text.textContent = '';
    next.textContent = '点击展开全文';
    panel.dataset.typing = 'true';
    timer = setInterval(() => {
      count = Math.min(letters.length, count + 2);
      text.textContent = letters.slice(0, count).join('');
      if (count === letters.length) reveal();
    }, 28);
  }
  function reveal() {
    stop();
    text.textContent = lines[index].text;
    panel.dataset.typing = 'false';
    next.textContent = index < lines.length - 1 ? '继续 ▾' : '知道了 ▾';
  }
  function advance() {
    if (timer) {
      reveal();
      return;
    }
    if (++index < lines.length) {
      render();
      return;
    }
    const callback = done;
    done = null;
    panel.close();
    callback?.();
  }
  events.on(panel, 'click', advance);
  events.on(panel, 'cancel', (event) => {
    event.preventDefault();
    advance();
  });
  return {
    get open() {
      return panel.open || gal?.owner === id;
    },
    show(content, callback, opening = false) {
      if (gal?.enabled) {
        stop();
        if (panel.open) panel.close();
        gal.cancel(id);
        void gal.play(authoredGalContent(content), {
          owner: id,
          onComplete: callback,
          mandatory: true,
          defaultSpeaker: '伊蒂丝',
          title: opening ? '白光之后 · 初至万象' : '万象酒馆',
        });
        return;
      }
      lines = content.map((line) =>
        typeof line === 'string'
          ? { text: line, speaker: '伊蒂丝', portrait: './assets/portraits/edith.png' }
          : {
              ...line,
              ...(line.speaker === '伊蒂丝'
                ? { portrait: './assets/portraits/edith.png' }
                : line.speaker === '长景月汐'
                  ? { portrait: './assets/portraits/changjing-yuexi.png' }
                  : {}),
            },
      );
      index = 0;
      done = callback;
      panel.classList.toggle('opening-prose', opening);
      if (!panel.open) panel.showModal();
      render();
    },
    close() {
      gal?.cancel(id);
      stop();
      done = null;
      panel.close();
    },
    dispose() {
      gal?.cancel(id);
      stop();
      panel.remove();
    },
  };
}
