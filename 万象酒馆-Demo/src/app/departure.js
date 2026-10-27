import { assignParty } from '../campaign.js';
import { rearUnlocked } from '../formation-access.js';
import { portraitUrl } from '../portraits.js';
import { escapeText } from '../ui.js';
import { html } from '../shared/html.js';

/** Choose identities before generation; equipment preparation never changes that snapshot. */
export function createDeparture(context) {
  const { session, events } = context;
  const panel = document.createElement('dialog');
  panel.id = 'departure-party';
  panel.setAttribute('aria-labelledby', 'departure-title');
  panel.innerHTML = html`<header>
      <div>
        <small>出发 / 01</small>
        <h2 id="departure-title">选择本场同行者</h2>
      </div>
      <button data-departure="cancel">取消</button>
    </header>
    <p>先选位置，再点角色。确认后才生成剧本；接下来只能调整装备。</p>
    <div class="departure-layout">
      <section>
        <h3>本场编队</h3>
        <div class="departure-slots"></div>
        <button data-departure="remove">清空选中位置</button>
      </section>
      <section>
        <h3>酒馆来客</h3>
        <div class="departure-roster"></div>
      </section>
    </div>
    <footer>
      <small class="departure-status" role="status"></small
      ><button class="primary" data-departure="confirm">确认编队 · 继续</button>
    </footer>`;
  document.body.append(panel);
  let selected = 0;
  let resolveChoice = null;
  let draft = [];
  const library = () => session.ai.library;
  function render() {
    const memberButton = (id, index) => {
      const member = library().characters.find((entry) => entry.id === id);
      return html`<button data-departure-slot="${index}" aria-pressed="${index === selected}">
        <small>${index < 3 ? '前场' : '后场'} ${(index % 3) + 1}</small>
        ${member ? `<img src="${escapeText(portraitUrl(member.combat))}" alt=""/><strong>${escapeText(member.setting.name)}</strong>` : '<strong>空位 ＋</strong>'}
      </button>`;
    };
    panel.querySelector('.departure-slots').innerHTML = draft
      .slice(0, rearUnlocked(library()) ? 6 : 3)
      .map(memberButton)
      .join('');
    panel.querySelector('.departure-roster').innerHTML = library()
      .characters.map(
        (member) =>
          html`<button
            data-departure-hero="${escapeText(member.id)}"
            aria-pressed="${draft.includes(member.id)}"
          >
            <img src="${escapeText(portraitUrl(member.combat))}" alt="" /><span
              >${escapeText(member.setting.name)}</span
            >
          </button>`,
      )
      .join('');
  }
  function finish(confirmed) {
    if (!resolveChoice) return;
    const resolve = resolveChoice;
    resolveChoice = null;
    panel.close();
    resolve(confirmed);
  }
  events.on(panel, 'cancel', (event) => {
    event.preventDefault();
    finish(false);
  });
  events.on(panel, 'click', (event) => {
    const slot = event.target.closest('[data-departure-slot]');
    const hero = event.target.closest('[data-departure-hero]');
    const action = event.target.closest('[data-departure]')?.dataset.departure;
    if (slot) selected = Number(slot.dataset.departureSlot);
    if (hero) {
      const previous = draft.indexOf(hero.dataset.departureHero);
      if (previous >= 0) [draft[previous], draft[selected]] = [draft[selected], draft[previous]];
      else draft[selected] = hero.dataset.departureHero;
    }
    if (action === 'remove') draft[selected] = null;
    if (action === 'cancel') return finish(false);
    if (action === 'confirm') {
      try {
        const candidate = { ...library(), party: [...draft] };
        const count = rearUnlocked(library()) ? 6 : 3;
        if (library().campaign?.protagonistId && !draft.includes(library().campaign.protagonistId))
          throw Error('主角必须出战');
        for (let index = 0; index < count; index++)
          assignParty(candidate, index, draft[index] || null);
        if (!draft.slice(0, 3).some(Boolean)) throw Error('前场至少需要一位角色');
        library().party = [...candidate.party];
        context.generation.save();
        context.shell.renderParty();
        return finish(true);
      } catch (failure) {
        panel.querySelector('.departure-status').textContent = failure.message;
      }
    }
    render();
  });
  return {
    choose() {
      if (resolveChoice) return Promise.resolve(false);
      draft = [...library().party];
      selected = 0;
      panel.querySelector('.departure-status').textContent = '';
      render();
      panel.showModal();
      return new Promise((resolve) => {
        resolveChoice = resolve;
      });
    },
    equip() {
      session.ai.formationLocked = true;
      context.shell.renderParty();
      const preparation = document.querySelector('#party-panel');
      const done = document.querySelector('#prepare-done');
      const close = document.querySelector('#prepare-close');
      document.querySelector('#prepare-title').textContent = '出发 / 02 · 调整装备';
      done.textContent = '整备完成 · 出发';
      const closeLabel = close.innerHTML;
      close.textContent = '取消出发';
      preparation.showModal();
      context.onboarding?.preparationOpened();
      return new Promise((resolve) => {
        let confirmed = false;
        const confirm = () => {
          confirmed = true;
        };
        done.addEventListener('click', confirm, { capture: true });
        preparation.addEventListener(
          'close',
          () => {
            session.ai.formationLocked = false;
            document.querySelector('#prepare-title').textContent = '战阵整备';
            document.querySelector('#prepare-done').textContent = '准备完成';
            close.innerHTML = closeLabel;
            done.removeEventListener('click', confirm, { capture: true });
            resolve(confirmed);
          },
          { once: true },
        );
      });
    },
    dispose() {
      finish(false);
      panel.remove();
    },
  };
}
