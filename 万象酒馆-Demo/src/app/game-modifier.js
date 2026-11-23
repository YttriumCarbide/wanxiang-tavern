import {
  modifierCharacterSections,
  modifierResourceFields,
  modifyCharacter,
  modifyResources,
  restoreModifiedCharacter,
  undoResourceModification,
} from '../game-modifier.js';
import { html } from '../shared/html.js';
import { escapeText } from '../ui.js';
import { query as $ } from './dom.js';

function fieldMarkup(field, values = {}) {
  const value = values[field.key] ?? field.value;
  return html`<label class="modifier-field">
    <span>${escapeText(field.label)}</span>
    <input
      name="${escapeText(field.key)}"
      type="number"
      inputmode="numeric"
      autocomplete="off"
      required
      value="${value}"
      data-original="${value}"
      min="${field.min}"
      max="${field.max}"
    />
  </label>`;
}

function readChanges(form) {
  return Object.fromEntries(
    Array.from(form.querySelectorAll('input[type="number"]')).flatMap((input) =>
      input.valueAsNumber !== Number(input.dataset.original)
        ? [[input.name, input.valueAsNumber]]
        : [],
    ),
  );
}

const hasChanges = (member) => Object.keys(member.modifierValues || {}).length > 0;

export function createGameModifier(context) {
  const { session, events } = context;
  const entry = $('#game-modifier-open');
  const dialog = $('#game-modifier');
  const status = dialog.querySelector('[data-modifier-status]');
  const panels = [...dialog.querySelectorAll('[data-modifier-panel]')];
  let tab = 'resources';
  let memberId = null;
  let busy = false;

  const enabled = () => session.ai.generationOptions.developerMode;
  const ready = () =>
    enabled() &&
    !session.runtime.disposed &&
    !session.runtime.needsStart &&
    session.runtime.mode === 'inn' &&
    !session.ai.busy;

  function renderResources(library) {
    const fields = modifierResourceFields(library.inventory);
    const history = library.modifierResourceHistory || [];
    const last = history.at(-1) || {};
    const changes = fields
      .filter(({ key }) => Object.hasOwn(last, key))
      .map(({ key, label }) => `${label} ${last[key] > 0 ? '+' : ''}${last[key]}`);
    return html`<form data-modifier-form="resources" novalidate>
      <div class="modifier-heading">
        <h3>余额与背包</h3>
        <p>填写想要的数量，一次应用记为一笔。撤回会保留之后正常获得或消耗的资源。</p>
      </div>
      <div class="modifier-actions">
        <button type="submit" class="modifier-primary">应用资源修改</button>
        <button
          type="button"
          class="modifier-warning"
          data-modifier-action="undo-resources"
          ${history.length ? '' : 'disabled'}
        >
          撤回上一次
        </button>
      </div>
      <p class="modifier-summary">
        ${history.length ? escapeText(`最近一笔　${changes.join('、')}`) : ''}
      </p>
      <div class="modifier-fields">${fields.map((field) => fieldMarkup(field)).join('')}</div>
    </form>`;
  }

  function renderCharacters(library) {
    const members = library.characters;
    const member = members.find(({ id }) => id === memberId) || members[0];
    if (!member) return '<p class="modifier-empty">当前存档还没有角色。</p>';
    memberId = member.id;
    const count = members.filter(hasChanges).length;
    const { stats, skills } = modifierCharacterSections(member);
    const values = member.modifierValues || {};
    return html`<form data-modifier-form="characters" novalidate>
      <label class="modifier-selection">
        <span>角色</span>
        <select data-modifier-member>
          ${members
            .map(
              (item) =>
                html`<option
                  value="${escapeText(item.id)}"
                  ${item.id === memberId ? 'selected' : ''}
                >
                  ${escapeText(item.setting.name)}${hasChanges(item) ? ' · 已修改' : ''}
                </option>`,
            )
            .join('')}
        </select>
      </label>
      <div class="modifier-actions">
        <button type="submit" class="modifier-primary">应用角色修改</button>
        <button
          type="button"
          class="modifier-warning"
          data-modifier-action="restore-member"
          ${hasChanges(member) ? '' : 'disabled'}
        >
          恢复此角色
        </button>
        <button
          type="button"
          class="modifier-warning"
          data-modifier-action="confirm-all"
          ${count ? '' : 'disabled'}
        >
          恢复全部角色${count ? `（${count}）` : ''}
        </button>
      </div>
      <div class="modifier-confirm" data-modifier-confirm></div>
      <div class="modifier-heading">
        <h3>基础属性</h3>
        <p>改动存入当前档，成长和装备加成会参与实战计算。</p>
      </div>
      <div class="modifier-fields">
        ${stats.map((field) => fieldMarkup(field, values)).join('')}
      </div>
      <div class="modifier-heading">
        <h3>技能数值</h3>
        <p>修改已有技能的基础数值，下次进入战斗时生效。</p>
      </div>
      <div class="modifier-skill-grid">
        ${skills
          .map(
            ({ key, label, fields }) =>
              html`<fieldset class="modifier-skill">
                <legend>${escapeText(label)}</legend>
                ${fields.map((field) => fieldMarkup(field, values)).join('')}
                <button
                  type="button"
                  class="modifier-warning"
                  data-modifier-action="restore-skill"
                  data-modifier-skill="${escapeText(key)}"
                  ${fields.some((field) => Object.hasOwn(values, field.key)) ? '' : 'disabled'}
                >
                  恢复此技能
                </button>
              </fieldset>`,
          )
          .join('')}
      </div>
    </form>`;
  }

  function render() {
    for (const button of dialog.querySelectorAll('[data-modifier-tab]'))
      button.setAttribute('aria-pressed', String(button.dataset.modifierTab === tab));
    for (const panel of panels) {
      panel.hidden = panel.dataset.modifierPanel !== tab;
      const content = panel.querySelector('[data-modifier-content]');
      const library = session.ai.library;
      content.innerHTML = panel.hidden
        ? ''
        : tab === 'resources'
          ? renderResources(library)
          : renderCharacters(library);
    }
  }

  async function update(change, message) {
    if (busy) return;
    if (!ready()) {
      status.textContent = '请在酒馆空闲时修改当前档。';
      return;
    }
    busy = true;
    const previous = session.ai.library;
    let next;
    try {
      next = change(previous);
      if (next === previous) {
        status.textContent = '没有需要保存的改动。';
        return;
      }
      session.ai.library = next;
      if (!context.generation.save()) throw Error('当前存档保存失败，请重试。');
      await context.storage.flush?.();
      context.shell.renderParty();
      context.ledger?.sync();
      render();
      status.textContent = message;
    } catch (error) {
      if (next && session.ai.library === next) {
        session.ai.library = previous;
        context.generation.save();
      }
      status.textContent = error.message;
    } finally {
      busy = false;
    }
  }

  function updateMembers(change, message, all = false) {
    return update(
      (library) => ({
        ...library,
        characters: library.characters.map((member) =>
          all || member.id === memberId ? change(member) : member,
        ),
      }),
      message,
    );
  }

  events.on(entry, 'click', () => {
    if (!ready()) {
      context.shell.toast('请在酒馆空闲时打开游戏修改器。');
      return;
    }
    render();
    status.textContent = '';
    dialog.showModal();
  });
  events.on(dialog, 'change', (event) => {
    if (!event.target.matches('[data-modifier-member]') || busy) return;
    memberId = event.target.value;
    render();
  });
  events.on(dialog, 'submit', (event) => {
    event.preventDefault();
    const form = event.target;
    const values = readChanges(form);
    if (!Object.keys(values).length) {
      status.textContent = '请先修改需要调整的数值。';
      return;
    }
    if (form.dataset.modifierForm === 'resources')
      void update((library) => modifyResources(library, values), '资源修改已保存。');
    else void updateMembers((member) => modifyCharacter(member, values), '角色修改已保存。');
  });
  events.on(dialog, 'click', (event) => {
    if (busy) return;
    const target = event.target.closest('button');
    if (!target) return;
    if (target.hasAttribute('data-modifier-close')) dialog.close();
    if (target.dataset.modifierTab && target.dataset.modifierTab !== tab) {
      tab = target.dataset.modifierTab;
      status.textContent = '';
      render();
      target.focus();
    }
    switch (target.dataset.modifierAction) {
      case 'undo-resources':
        void update(undoResourceModification, '已撤回最近一笔资源修改。');
        break;
      case 'restore-member':
        void updateMembers(restoreModifiedCharacter, '已恢复此角色的修改器数值。');
        break;
      case 'restore-skill':
        void updateMembers(
          (member) => restoreModifiedCharacter(member, target.dataset.modifierSkill),
          '已恢复此技能的数值。',
        );
        break;
      case 'confirm-all':
        dialog.querySelector('[data-modifier-confirm]').innerHTML =
          `<span>恢复所有角色的属性和技能修改？</span>
          <button type="button" class="modifier-warning" data-modifier-action="restore-all">确认恢复</button>
          <button type="button" data-modifier-action="cancel-all">取消</button>`;
        dialog.querySelector('[data-modifier-action="cancel-all"]').focus();
        break;
      case 'cancel-all':
        dialog.querySelector('[data-modifier-confirm]').replaceChildren();
        dialog.querySelector('[data-modifier-action="confirm-all"]').focus();
        break;
      case 'restore-all':
        void updateMembers(restoreModifiedCharacter, '已恢复全部角色的修改器数值。', true);
        break;
    }
  });
  return {
    sync() {
      if (!enabled() && dialog.open) dialog.close();
    },
    dispose() {
      if (dialog.open) dialog.close();
    },
  };
}
