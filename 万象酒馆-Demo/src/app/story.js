import { ENCOUNTER_COUNT, FINAL_ENCOUNTER } from '../content/journey-rules.js';
import { query as $ } from './dom.js';
import { createEventScope } from '../shared/events.js';
import { archiveMilestone } from '../archives.js';
import { readableGalText } from '../gal.js';

/** Only confirmed milestones enter history; browsing pages never unlocks future prose. */
export function createStoryFeed(session, save, gal = null) {
  const events = createEventScope();
  const dialog = $('#story-feed');
  const toggle = $('#story-toggle');
  session.ai.storyView ||= {
    page: 0,
    latest: 0,
    pages: Array.from({ length: ENCOUNTER_COUNT }, () => []),
  };
  const view = () => session.ai.storyView;
  let closing = null;
  const waiters = new Set();
  let galCompletion = null;
  function render() {
    const recollection = !!session.ai.activeScript?.recollection;
    $('.quick-chat-heading').hidden = recollection;
    $('#quick-chat-body').hidden =
      recollection || $('#quick-chat-toggle').getAttribute('aria-expanded') === 'false';
    if (session.ai.activeScript) {
      toggle.hidden = false;
      document.body.classList.add('has-story');
    }
    const area = $('#story-lines');
    area.replaceChildren();
    for (const line of view().pages[view().page]) {
      const paragraph = document.createElement('article');
      paragraph.className = 'story-line';
      paragraph.dataset.stage = line.stage;
      if (line.speaker) {
        const name = document.createElement('strong');
        name.textContent = line.speaker;
        paragraph.append(name);
      }
      const prose = document.createElement('p');
      prose.textContent = readableGalText(
        line.text,
        gal?.actors() || [],
        session.ai.library.campaign?.protagonistId,
      );
      paragraph.append(prose);
      area.append(paragraph);
    }
    if (!area.children.length) {
      const empty = document.createElement('p');
      empty.className = 'story-empty';
      empty.textContent =
        view().page <= view().latest
          ? '这一场尚无新的手记。'
          : '尚未抵达这里，之后的旅程会记录在这一页。';
      area.append(empty);
    }
    area.scrollTop = 0;
    $('#story-pages').replaceChildren(
      ...Array.from({ length: ENCOUNTER_COUNT }, (_, index) => {
        const button = document.createElement('button');
        button.textContent = index === FINAL_ENCOUNTER ? '最终战' : `第 ${index + 1} 战`;
        button.dataset.storyPage = index;
        button.setAttribute('aria-pressed', String(index === view().page));
        if (view().pages[index].length) button.classList.add('recorded');
        return button;
      }),
    );
    $('#story-page-count').textContent = `${view().page + 1} / ${ENCOUNTER_COUNT}`;
    $('#story-prev').disabled = view().page === 0;
    $('#story-next').disabled = view().page === FINAL_ENCOUNTER;
  }
  function close(immediate = false) {
    gal?.cancel('script');
    if (dialog.open && !closing && !immediate) {
      closing = dialog.animate(
        [
          { opacity: 1, transform: 'translateY(0) scale(1)' },
          { opacity: 0, transform: 'translateY(8px) scale(.985)' },
        ],
        { duration: 160, easing: 'ease-in' },
      );
      const animation = closing;
      animation.finished
        .catch(() => {})
        .then(() => {
          if (closing !== animation) return;
          closing = null;
          if (dialog.open) dialog.close();
        });
    } else if (immediate && dialog.open) {
      closing?.cancel();
      closing = null;
      dialog.close();
    }
    toggle.setAttribute('aria-expanded', 'false');
    window.getSelection()?.removeAllRanges();
  }
  function append(speaker, text, stage, encounter) {
    view().pages[encounter].push({ speaker, text, stage });
  }
  function reset() {
    close(true);
    session.ai.storyView = {
      page: 0,
      latest: 0,
      pages: Array.from({ length: ENCOUNTER_COUNT }, () => []),
    };
    const book = session.ai.activeScript;
    toggle.hidden = !book;
    document.body.classList.toggle('has-story', !!book);
    $('#story-title').textContent = book?.title || '路途手记';
    render();
  }
  function showScene(index, stage) {
    const book = session.ai.activeScript;
    if (!book || session.runtime.disposed) return;
    if (book.recollection) {
      if (stage === 'before' && !view().pages[index].length) {
        view().latest = Math.max(view().latest, index);
        view().page = index;
        append('', book.story[index] || '无', stage, index);
        render();
      }
      return;
    }
    const key = `${book.id}-${index}-${stage}`;
    const record = session.ai.library.history.find((item) => item.runId === book.runId);
    if (!record || record.played.includes(key)) return;
    view().latest = Math.max(view().latest, index);
    if (book.schemaVersion >= 3) {
      const part = stage === 'before' ? index : -1;
      if (part < 0) {
        record.played.push(key);
        if (stage === 'after' && index === FINAL_ENCOUNTER) {
          record.complete = true;
          record.nextHook = book.nextHook;
          session.ai.library.chapter = Math.max(session.ai.library.chapter, book.chapter + 1);
        }
        save();
        return;
      }
      append('', book.display?.story?.[part] ?? book.story[part], stage, index);
      record.lines.push({ speaker: '旁白', text: book.story[part], encounter: index, stage });
    }
    if (book.schemaVersion === 2 && stage === 'before') {
      if (index === 0 && !record.played.includes('prologue')) {
        append('副本开场', book.display?.opening ?? book.opening, 'prologue', index);
        record.lines.push({ speaker: '旁白', text: book.opening, encounter: 0, stage: 'prologue' });
        record.played.push('prologue');
      }
      const opening = book.scenes[index].opening;
      append(
        `第${index + 1}程 · 开场`,
        book.display?.scenes?.[index]?.opening ?? opening,
        'scene-opening',
        index,
      );
      record.lines.push({
        speaker: '旁白',
        text: opening,
        encounter: index,
        stage: 'scene-opening',
      });
    }
    for (const [lineIndex, line] of (book.scenes?.[index]?.[stage] || []).entries()) {
      const speaker =
        book.party.find((entry) => entry.id === line.speaker)?.name ||
        book.npcs.find((entry) => entry.id === line.speaker)?.name ||
        '旁白';
      append(
        speaker,
        book.display?.scenes?.[index]?.[stage]?.[lineIndex] ?? line.text,
        stage,
        index,
      );
      record.lines.push({ speaker, text: line.text, encounter: index, stage });
    }
    if (!dialog.open) view().page = index;
    record.played.push(key);
    archiveMilestone(session.ai.library, book, record, index);
    if (stage === 'after' && index === FINAL_ENCOUNTER) {
      record.complete = true;
      record.nextHook = book.nextHook;
      session.ai.library.chapter = Math.max(session.ai.library.chapter, book.chapter + 1);
    }
    render();
    save();
  }
  function recordRound(result, state) {
    if (!session.ai.activeScript || session.ai.activeScript.recollection) return;
    const logs = result.events.flatMap((event) => event.logs || []).filter(Boolean);
    if (!logs.length) return;
    const title = state.phase === 'opening' ? '先手准备结束' : `第${state.round}回合`;
    const text = logs.join('。');
    if (session.ai.activeScript.schemaVersion < 3) {
      append(title, text, 'combat', state.encounter);
      render();
    }
    const record = session.ai.library.history.find(
      (item) => item.runId === session.ai.activeScript.runId,
    );
    record?.lines.push({ speaker: '战斗经过', text, encounter: state.encounter, stage: 'combat' });
    save();
  }
  function page(index) {
    view().page = Math.max(0, Math.min(FINAL_ENCOUNTER, index));
    render();
  }
  function openStory(automatic = false) {
    if (gal?.enabled) {
      if (!session.ai.activeScript || gal.owner === 'script') return;
      gal.cancel();
      const completion = gal.play(
        view().pages[view().page].map((line) => ({
          speaker: line.speaker,
          text: line.text,
        })),
        { owner: 'script', title: session.ai.activeScript.title || '路途手记' },
      );
      galCompletion = completion;
      void completion.then(() => {
        if (galCompletion === completion) galCompletion = null;
      });
      return;
    }
    if (!session.ai.activeScript || dialog.open) return;
    render();
    dialog.dataset.automatic = String(automatic === true);
    dialog.showModal();
    $('#story-lines').scrollTop = 0;
    dialog.animate(
      [
        { opacity: 0, transform: 'translateY(10px) scale(.98)' },
        { opacity: 1, transform: 'translateY(0) scale(1)' },
      ],
      { duration: 240, easing: 'cubic-bezier(.16,1,.3,1)' },
    );
    toggle.setAttribute('aria-expanded', 'true');
  }
  events.on(document, 'gal-open-script', () => openStory());
  events.on(toggle, 'click', () => {
    if (dialog.open) close();
    else openStory();
  });
  events.on($('#story-close'), 'click', () => close());
  events.on(dialog, 'cancel', (event) => {
    event.preventDefault();
    close();
  });
  events.on(dialog, 'close', () => {
    toggle.setAttribute('aria-expanded', 'false');
    for (const resolve of waiters) resolve();
    waiters.clear();
  });
  events.on(dialog, 'click', (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      close();
  });
  events.on($('#story-pages'), 'click', (event) => {
    const button = event.target.closest('[data-story-page]');
    if (button) page(Number(button.dataset.storyPage));
  });
  events.on($('#story-prev'), 'click', () => page(view().page - 1));
  events.on($('#story-next'), 'click', () => page(view().page + 1));
  events.on(dialog, 'keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    page(view().page + (event.key === 'ArrowLeft' ? -1 : 1));
  });
  return {
    render,
    reset,
    showScene,
    recordRound,
    openStory,
    storyClosed() {
      if (galCompletion) return galCompletion;
      return dialog.open ? new Promise((resolve) => waiters.add(resolve)) : Promise.resolve();
    },
    cancelScene() {
      close(true);
      toggle.hidden = true;
      document.body.classList.remove('has-story');
    },
    dispose() {
      close(true);
      events.dispose();
      document.body.classList.remove('has-story');
    },
  };
}
