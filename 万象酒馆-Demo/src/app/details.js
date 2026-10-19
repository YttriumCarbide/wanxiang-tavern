import { effectiveBuff } from '../engine.js';
import { html } from '../shared/html.js';
import { resourceBars, statusIcons, escapeText } from '../ui.js';
import { query as $ } from './dom.js';
import { portraitUrl } from '../catalog.js';

/** @param {import('./context.js').AppContext} context */
export function createDetails(context) {
  const { session } = context;
  function renderDetails(s) {
    if (!session.selection.selected) {
      $('#details').innerHTML =
        '<div class="empty-character"><span>行动</span><p>选择角色查看技能</p></div>';
      return;
    }
    const d = context.roster.get(session.selection.selected),
      u = s.units[session.selection.selected],
      f = session.battle.forecast.final.units[session.selection.selected],
      disabled =
        !context.viewport.canPlan() ||
        u.hp <= 0 ||
        !session.battle.forecast.final.formation.slice(0, 3).includes(session.selection.selected);
    const limit = d.limit + effectiveBuff(session.battle.forecast.final, d.id, 'haste');
    const buffIcons = statusIcons(
      s,
      session.selection.selected,
      session.battle.forecast.final,
      session.battle.playing ? [] : session.battle.forecast.events,
    );
    const skillButton = (a) =>
      html`<button
        class="ability ${session.selection.pending?.skill === a.id && session.selection.pending?.actor === session.selection.selected ? 'active' : ''} ${session.selection.interactionStep === 'skill' && !disabled ? 'skill-targetable' : ''}"
        data-skill="${a.id}"
        data-tooltip="${escapeText(`${a.text || `造成${d.attack}基础伤害`}\n消耗 ${a.ap} AP · ${a.mp} 蓝量${a.hp ? ` · ${a.hp} 生命` : ''}`)}"
        draggable="${!disabled}"
        ${disabled ? 'disabled' : ''}
      >
        <strong>${a.name}</strong
        ><small>${a.ap} AP${a.mp ? ` · ${a.mp} 蓝` : ''}${a.hp ? ` · ${a.hp} 生命` : ''}</small>
      </button>`;
    $('#details').innerHTML = html`<div class="hero-heading">
        <img src="${portraitUrl(d)}" alt="" />
        <div>
          <h2 style="color:${d.color}">${d.name}</h2>
          <p>${d.title}${u.hp === 0 ? ' · 濒死' : ''}</p>
        </div>
      </div>
      <div class="hero-resources">${resourceBars(u, f)}</div>
      <div class="detail-buffs">${buffIcons}</div>
      <div class="details-label">
        行动
        <span data-tooltip="本回合技能出手 ${f.used}/${limit}；交换阵型不计入角色技能次数"
          >${f.used}/${limit}</span
        >
      </div>
      ${skillButton(context.roster.ability(session.selection.selected, 'attack'))}${d.skills.map((a) => (a.passive ? html`<button class="ability passive-ability" data-passive="${a.id}" data-tooltip="${escapeText(`${a.location}被动：${a.text}`)}"><strong>${escapeText(a.name)}</strong><small>被动 · ${escapeText(a.location)}</small></button>` : skillButton(a))).join('')}`;
    $('#details')
      .querySelectorAll('[data-passive]')
      .forEach((button) => {
        button.onclick = () => {
          const ability = d.skills.find((item) => item.id === button.dataset.passive);
          context.shell.toast(`${ability.name} · ${ability.location}：${ability.text}`);
        };
      });
    $('#details')
      .querySelectorAll('[data-skill]')
      .forEach((b) => {
        b.onclick = () => context.selection.pickSkill(b.dataset.skill);
        b.ondragstart = (e) => {
          const a = context.roster.ability(session.selection.selected, b.dataset.skill);
          e.dataTransfer.setData(
            'application/json',
            JSON.stringify({
              kind: 'new-skill',
              actor: session.selection.selected,
              skill: a.id,
              target: a.target === 'ally' ? session.selection.selected : session.selection.target,
            }),
          );
        };
      });
  }
  return { renderDetails };
}
