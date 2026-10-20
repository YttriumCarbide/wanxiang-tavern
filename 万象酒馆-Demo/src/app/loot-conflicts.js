import { itemConflicts, resolveItemConflict } from '../archives.js';
import { html } from '../shared/html.js';
import { escapeText } from '../ui.js';

/** Settlement waits for a deliberate choice; rendering cannot change loot values. */
export function createLootConflicts(context) {
  const panel = document.createElement('dialog');
  panel.id = 'loot-conflicts';
  document.body.append(panel);
  let active = null;
  function render() {
    const library = context.session.ai.library;
    const current = itemConflicts(library, active.runId)[0];
    if (!current) {
      const done = active.done;
      active = null;
      panel.close();
      done(true);
      return;
    }
    active.id = current.id;
    const old = library.archives.items.find((item) => item.id === current.conflictWith);
    panel.innerHTML = html`<small>ARCHIVE / DISCOVERY</small>
      <h2>同名物品，新的发现</h2>
      <p>「${escapeText(current.name)}」已有不同记录，请决定这次收获的归档方式。</p>
      <div class="loot-comparison">
        <article>
          <h3>旧记录</h3>
          <p>${escapeText(old.description)}</p>
          <b>${old.value} 以太</b>
        </article>
        <article>
          <h3>本次发现</h3>
          <p>${escapeText(current.description)}</p>
          <b>${current.value} 以太</b>
        </article>
      </div>
      <div class="loot-choices">
        <button data-loot-choice="old">采用旧记录</button
        ><button data-loot-choice="new">采用本次记录</button>
      </div>
      <label
        >改名后共存<input id="loot-rename" maxlength="30" placeholder="填写新的物品名称"
      /></label>
      <div class="loot-choices">
        <button data-loot-choice="rename-new">给新物品改名</button
        ><button data-loot-choice="rename-old">给旧物品改名</button>
      </div>
      <p id="loot-conflict-error" role="status"></p>`;
  }
  context.events.on(panel, 'cancel', (event) => event.preventDefault());
  context.events.on(panel, 'click', (event) => {
    const button = event.target.closest('[data-loot-choice]');
    if (!button || !active) return;
    try {
      resolveItemConflict(
        context.session.ai.library,
        active.id,
        button.dataset.lootChoice,
        panel.querySelector('#loot-rename').value,
      );
      context.generation.save();
      render();
    } catch (error) {
      panel.querySelector('#loot-conflict-error').textContent = error.message;
    }
  });
  return {
    resolve(runId) {
      if (!itemConflicts(context.session.ai.library, runId).length) return Promise.resolve(true);
      return new Promise((done) => {
        active = { runId, done };
        render();
        panel.showModal();
      });
    },
    dispose() {
      if (active) active.done(false);
      active = null;
      panel.remove();
    },
  };
}
