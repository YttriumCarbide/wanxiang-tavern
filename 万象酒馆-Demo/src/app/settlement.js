import { html } from '../shared/html.js';
import { escapeText } from '../ui.js';
import { portraitUrl } from '../portraits.js';
import { GROWTH_LABELS, restoreGrowth, xpToNext } from '../growth.js';
import { levelLines } from '../content/level-dialogue.js';
import { chooseRest } from '../expedition.js';
import { createDialogue } from './dialogue.js';
import { ITEMS } from '../content/items.js';

/** Presentation consumes already-awarded experience and the engine's recovery changes. */
export function createSettlement(context) {
  const { session, events } = context;
  const panel = document.querySelector('#result');
  const dialogue = createDialogue(events, 'level-dialogue', context.gal);
  let release = null;
  let disposed = false;
  let presenting = false;
  events.on(panel, 'cancel', (event) => {
    if (presenting) event.preventDefault();
  });
  const members = () =>
    (session.journey.expedition.partyIds || session.ai.library.party)
      .filter(Boolean)
      .map((id) => session.ai.library.characters.find((member) => member.id === id))
      .filter(Boolean);
  function totals(awards) {
    const grouped = new Map();
    for (const award of awards) {
      const current = grouped.get(award.id);
      if (!current) grouped.set(award.id, structuredClone(award));
      else {
        current.amount += award.amount;
        current.after = award.after;
        current.levels.push(...award.levels);
        current.level = award.level;
      }
    }
    return grouped;
  }
  async function levelDialogues(awards) {
    for (const award of awards.values()) {
      const member = session.ai.library.characters.find((entry) => entry.id === award.id);
      if (!member) continue;
      for (const level of award.levels) {
        if (disposed) return;
        const lines = levelLines(member);
        await new Promise((resolve) => {
          release = resolve;
          dialogue.show(
            [
              {
                speaker: `${member.setting.name} · Lv.${level.level}`,
                portrait: portraitUrl(member.combat),
                text: lines[Math.floor(Math.random() * lines.length)],
                bonuses: Object.entries(level.gains).map(
                  ([key, value]) => `${GROWTH_LABELS[key]} +${value}`,
                ),
              },
            ],
            resolve,
          );
        });
        release = null;
      }
    }
  }
  async function experience(awards) {
    await Promise.all(
      members().map(async (member) => {
        const award = awards.get(member.id);
        if (!award) return;
        const row = [...panel.querySelectorAll('[data-experience]')].find(
          (row) => row.dataset.experience === member.id,
        );
        const bar = row.querySelector('i');
        const label = row.querySelector('[data-level]');
        const numbers = row.querySelector('[data-xp]');
        const start = award.before || restoreGrowth(member.growth, member.id);
        const end = award.after || restoreGrowth(member.growth, member.id);
        for (let level = start.level; level <= end.level; level++) {
          if (disposed || !panel.open) return;
          const from = level === start.level ? start.xp : 0;
          const to = level === end.level ? end.xp : xpToNext(level);
          const maximum = xpToNext(level);
          label.textContent = `Lv.${level}`;
          numbers.textContent = `${to} / ${maximum} EXP`;
          const animation = bar.animate(
            [{ width: `${(from / maximum) * 100}%` }, { width: `${(to / maximum) * 100}%` }],
            { duration: 520, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' },
          );
          await animation.finished.catch(() => {});
          bar.style.width = `${(to / maximum) * 100}%`;
          animation.cancel();
          if (disposed || !panel.open) return;
          if (level < end.level) {
            context.audio.play('shield');
            row.dataset.experienceState = 'level-up';
            label.textContent = `Lv.${level + 1}`;
            const badge = row.querySelector('[data-level-up]');
            badge.hidden = false;
            const flash = row.animate(
              [
                { backgroundColor: '#d4b65e00', boxShadow: '0 0 0 #ead37d00' },
                { backgroundColor: '#d4b65e35', boxShadow: '0 0 22px #ead37d80', offset: 0.4 },
                { backgroundColor: '#d4b65e00', boxShadow: '0 0 0 #ead37d00' },
              ],
              { duration: 380, easing: 'ease-out' },
            );
            await flash.finished.catch(() => {});
            badge.hidden = true;
          }
          row.dataset.experienceState = 'filling';
        }
        row.dataset.experienceState = 'complete';
      }),
    );
  }
  function experienceRows(awards) {
    return members()
      .map((member) => {
        const award = awards.get(member.id);
        const growth = award?.before || restoreGrowth(member.growth, member.id);
        return html`<article
          class="experience-row"
          data-experience="${member.id}"
          data-experience-state="${award ? 'filling' : 'complete'}"
        >
          <img src="${portraitUrl(member.combat)}" alt="${escapeText(member.setting.name)}" />
          <div>
            <header>
              <strong>${escapeText(member.setting.name)}</strong><b data-level>Lv.${growth.level}</b
              ><small>+${award?.amount || 0} EXP</small>
            </header>
            <div class="experience-track">
              <i style="width:${(growth.xp / xpToNext(growth.level)) * 100}%"></i>
            </div>
            <small data-xp>${growth.xp} / ${xpToNext(growth.level)} EXP</small>
            <span class="experience-level-up" data-level-up hidden>↑ LEVEL UP</span>
          </div>
        </article>`;
      })
      .join('');
  }
  async function rest(onward) {
    panel.querySelector('.result-buttons').hidden = true;
    const area = document.createElement('section');
    area.className = 'rest-choices';
    area.innerHTML =
      '<h3>旅途休整</h3><div><button data-rest="sleep"><span>☾</span><strong>睡眠</strong><small>恢复已损失hp的60%</small></button><button data-rest="meal"><span>♨</span><strong>用餐</strong><small>恢复已损失sp的60%</small></button></div>';
    panel.append(area);
    for (const button of area.querySelectorAll('[data-rest]'))
      button.onclick = async () => {
        for (const choice of area.querySelectorAll('button')) choice.disabled = true;
        const changes = chooseRest(session.journey.expedition, button.dataset.rest);
        context.generation.save();
        context.checkpoint.saveNow();
        context.audio.play('heal');
        const recovery = panel.querySelector('.experience-list');
        recovery.replaceChildren();
        recovery.classList.add('rest-recovery');
        area.innerHTML = '<h3>休整中</h3>';
        for (const [index, change] of changes.entries()) {
          const member =
            session.ai.library.characters.find(
              (entry) =>
                entry.id ===
                session.journey.expedition.partyIds?.[
                  Object.keys(session.journey.expedition.heroDefinitions).indexOf(change.id)
                ],
            ) || members()[index];
          const before = button.dataset.rest === 'sleep' ? change.before : change.beforeMp;
          const after = button.dataset.rest === 'sleep' ? change.after : change.mp;
          const max = button.dataset.rest === 'sleep' ? change.maxHp : change.maxMp;
          recovery.insertAdjacentHTML(
            'beforeend',
            html`<article class="recovery-row ${button.dataset.rest}">
              <img src="${portraitUrl(member.combat)}" alt="${escapeText(member.setting.name)}" />
              <div>
                <strong>${escapeText(member.setting.name)}</strong
                ><span><i style="width:${(before / Math.max(1, max)) * 100}%"></i></span
                ><small>${before} → ${after} / ${max}</small>
              </div>
            </article>`,
          );
        }
        await Promise.all(
          [...recovery.querySelectorAll('i')].map(async (bar, index) => {
            const change = changes[index];
            const after =
              button.dataset.rest === 'sleep'
                ? change.after / change.maxHp
                : change.mp / Math.max(1, change.maxMp);
            await bar
              .animate([{ width: bar.style.width }, { width: `${after * 100}%` }], {
                duration: 1100,
                easing: 'ease-out',
                fill: 'forwards',
              })
              .finished.catch(() => {});
          }),
        );
        if (disposed) return;
        const done = document.createElement('button');
        done.className = 'primary';
        done.id = 'rest-continue';
        done.textContent = '继续旅途';
        done.onclick = onward;
        area.append(done);
      };
  }
  async function show({
    won,
    complete,
    encounter,
    rewards,
    ether,
    loot,
    awards,
    onward,
    back,
    journal,
    retreat,
  }) {
    const grouped = totals(awards);
    if (disposed || session.runtime.mode !== 'battle') return;
    const reward = (icon, count, label, cls = '') =>
      count
        ? html`<span
            class="reward-token ${cls}"
            aria-label="${label} ${count}"
            data-tooltip="${label}"
            ><img src="./assets/icons/${icon}.svg" alt="${label}" /><b>${count}</b></span
          >`
        : '';
    panel.innerHTML = html`<h2>
        ${won ? `第 ${encounter + 1} 场通过${complete ? ' · 副本完成' : ''}` : '本次旅途结束'}
      </h2>
      <div class="battle-rewards">
        ${reward('gold', rewards?.gold || 0, '金币')}${reward('summon-contract', rewards?.summonContracts || 0, '召唤契约')}${reward('ether', ether, '以太', 'ether-reward')}
        ${Object.entries(rewards?.items || {})
          .map(
            ([id, count]) =>
              html`<span title="${escapeText(ITEMS[id].name)}"
                ><img src="${ITEMS[id].icon}" alt="${escapeText(ITEMS[id].name)}" /><b
                  >${count}</b
                ></span
              >`,
          )
          .join('')}
      </div>
      <div class="experience-list">${experienceRows(grouped)}</div>
      ${
        loot.length
          ? html`<section class="result-loot">
              <h3>获取道具</h3>
              ${loot
                .map(
                  (item) =>
                    html`<article>
                      <span>✧</span>
                      <div>
                        <strong>${escapeText(item.name)}</strong
                        ><small>${escapeText(item.description)}</small>
                      </div>
                      <b>${item.value} <img src="./assets/icons/ether.svg" alt="以太" /></b>
                    </article>`,
                )
                .join('')}
            </section>`
          : ''
      }
      <div class="result-buttons">
        ${journal ? '<button id="result-journal">路途手记</button>' : ''}${won && !complete ? `<button id="continue" class="primary">${session.journey.expedition.restPending ? '休整' : '下一场'}</button>` : ''}<button
          id="result-back"
          ${won && !complete && !retreat ? 'hidden' : ''}
        >
          返回酒馆
        </button>
      </div>`;
    panel.querySelector('#result-back').onclick = back;
    const next = panel.querySelector('#continue');
    if (next)
      next.onclick = () => (session.journey.expedition.restPending ? void rest(onward) : onward());
    const story = panel.querySelector('#result-journal');
    if (story) story.onclick = journal;
    panel.showModal();
    presenting = true;
    const buttons = [...panel.querySelectorAll('.result-buttons button')];
    buttons.forEach((button) => {
      button.disabled = true;
    });
    try {
      await experience(grouped);
      if (disposed || !panel.open || session.runtime.mode !== 'battle') return;
      await levelDialogues(grouped);
    } finally {
      presenting = false;
      if (!disposed)
        buttons.forEach((button) => {
          button.disabled = false;
        });
    }
  }
  return {
    show,
    dispose() {
      disposed = true;
      panel.getAnimations({ subtree: true }).forEach((animation) => animation.cancel());
      release?.();
      dialogue.dispose();
    },
  };
}
