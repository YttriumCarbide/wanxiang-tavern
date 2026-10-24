import { resourceText } from '../resource-text.js';
import { EMBLEMS } from '../emblems.js';
import { effectiveBuff } from '../engine.js';
import { html } from '../shared/html.js';
import { resourceBars, statusIcons, escapeText } from '../ui.js';
import { query as $ } from './dom.js';
import { portraitUrl } from '../catalog.js';
import { finalPassiveText } from '../skill-text.js';

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
      u = s.units?.[session.selection.selected],
      f = session.battle.forecast?.final?.units?.[session.selection.selected] || u;
    if (!d || !u || !f) {
      $('#details').innerHTML =
        '<div class="empty-character"><span>行动</span><p>选择角色查看技能</p></div>';
      return;
    }
    const emblemDef = EMBLEMS[d.emblemId],
      emblemSkill = emblemDef?.skill,
      disabled =
        !context.viewport.canPlan() ||
        u.hp <= 0 ||
        !session.battle.forecast?.final?.formation
          ?.slice(0, 3)
          .includes(session.selection.selected);
    const limit = d.limit + effectiveBuff(session.battle.forecast.final, d.id, 'haste');
    const buffIcons = statusIcons(
      s,
      session.selection.selected,
      session.battle.forecast.final,
      session.battle.playing ? [] : session.battle.forecast.events,
    );
    const isCombined = !!(u.combined || f.combined);
    const combineUsed = !!(u.combineSkillUsed || f.combineSkillUsed);
    const canUseCombine = isCombined && !combineUsed;
    const combineTooltip = !emblemSkill
      ? ''
      : !isCombined
        ? `${emblemSkill.name}（结合技 · 需结合后解锁）\n${emblemSkill.text}\n消耗 ${emblemSkill.ap} AP · ${emblemSkill.mp} sp`
        : combineUsed
          ? `${emblemSkill.name}（结合技 · 本轮结合已使用）\n${emblemSkill.text}\n消耗 ${emblemSkill.ap} AP · ${emblemSkill.mp} sp`
          : `${emblemSkill.text}\n消耗 ${emblemSkill.ap} AP · ${emblemSkill.mp} sp`;
    const skillButton = (a, isCombine = false) => {
      const isCombineDisabled = isCombine && !canUseCombine;
      const isDisabled = disabled || isCombineDisabled;
      const tooltip = isCombine
        ? combineTooltip
        : `${a.text || `造成${d.attack}基础伤害`}\n消耗 ${a.ap} AP · ${a.mp} sp${a.hp ? ` · ${a.hp} hp` : ''}`;
      return html`<button
        class="ability ${session.selection.pending?.skill === a.id && session.selection.pending?.actor === session.selection.selected ? 'active' : ''} ${session.selection.interactionStep === 'skill' && !isDisabled ? 'skill-targetable' : ''} ${isCombineDisabled ? 'combine-disabled' : ''}"
        data-skill="${a.id}"
        data-tooltip="${escapeText(resourceText(tooltip))}"
        draggable="${!isDisabled && !matchMedia('(pointer: coarse) and (max-width: 1100px)').matches}"
        ${isDisabled ? 'disabled' : ''}
      >
        <strong>${a.name}</strong
        ><small>${a.ap} AP${a.mp ? ` · ${a.mp} sp` : ''}${a.hp ? ` · ${a.hp} hp` : ''}</small>
      </button>`;
    };
    $('#details').innerHTML = html`<div class="hero-heading">
        <img src="${portraitUrl(d)}" alt="" />
        <div>
          <h2 style="color:${d.color}">${d.name}</h2>
          <p>${d.title}${u.hp === 0 ? ' · 濒死' : ''}</p>
        </div>
        <span class="battle-character-level">Lv.${d.level || 1}</span>
      </div>
      <div class="hero-resources">${resourceBars(u, f)}</div>
      <div class="detail-buffs">${buffIcons}</div>
      <div class="details-label">
        行动
        <span data-tooltip="本回合技能出手 ${f.used}/${limit}；交换阵型不计入角色技能次数"
          >${f.used}/${limit}</span
        >
      </div>
      <div class="details-actions-scroll">
        <div class="action-category">
          <div class="action-category-title">普通攻击</div>
          ${skillButton(context.roster.ability(session.selection.selected, 'attack'))}
        </div>
        <div class="action-category">
          <div class="action-category-title">角色技能</div>
          ${d.skills
            .filter((a) => !a.passive)
            .map((a) => skillButton(a))
            .join('')}
        </div>
        <div class="action-category">
          <div class="action-category-title">结合技</div>
          ${emblemSkill ? skillButton(emblemSkill, true) : '<div class="action-empty-note">未配戴纹章士</div>'}
        </div>
        <div class="action-category">
          <div class="action-category-title">入场技</div>
          ${(() => {
            const entrySkill = d.entrySkill || d.combat?.entrySkill || d.setting?.entrySkill;
            if (!entrySkill) return html`<div class="action-empty-note">无入场技</div>`;
            const isRear = (session.battle.forecast?.final?.formation || s.formation)
              .slice(3)
              .includes(session.selection.selected);
            const isReady = Boolean(u?.entryReady && entrySkill);
            const statusBadge = !isRear
              ? '换入自动触发'
              : isReady
                ? '已激活 · 换入触发'
                : '蓄势中 · 待满整回合';
            return html`<div
              class="ability-card entry-card ${isReady && isRear ? 'entry-ready' : ''}"
              data-tooltip="${escapeText(resourceText(`入场技 · ${entrySkill.name}\n${entrySkill.description || entrySkill.text || '在后排待满一个完整回合后换入前排自动触发（不耗AP/行动点）。'}`))}"
            >
              <strong>${escapeText(entrySkill.name)}</strong><small>${statusBadge}</small>
              <p>${escapeText(resourceText(entrySkill.description || entrySkill.text || ''))}</p>
            </div>`;
          })()}
        </div>
        <div class="action-category">
          <div class="action-category-title">被动特质</div>
          ${d.skills
            .filter((a) => a.passive)
            .map(
              (a) =>
                html`<button
                  class="ability passive-ability"
                  data-passive="${a.id}"
                  data-tooltip="${escapeText(finalPassiveText(a, d.mechanicMark?.name))}"
                >
                  <strong>${escapeText(a.name)}</strong
                  ><small>被动 · ${escapeText(a.location)}</small>
                  <p>${escapeText(finalPassiveText(a, d.mechanicMark?.name))}</p>
                </button>`,
            )
            .join('')}${
            emblemDef?.emblem
              ? html`<div
                  class="ability-card passive-card emblem-passive ${isCombined ? 'emblem-passive-active' : 'emblem-passive-inactive'}"
                  data-emblem-passive
                  aria-label="${isCombined ? '结合被动生效' : '未结合'}"
                  data-tooltip="${escapeText(resourceText(`${emblemDef.emblem.title}：${emblemDef.emblem.text}`))}"
                >
                  <strong>${escapeText(emblemDef.emblem.name)}</strong><small>纹章被动</small>
                  <p>${escapeText(resourceText(emblemDef.emblem.text))}</p>
                </div>`
              : ''
          }
        </div>
      </div>`;
    $('#details')
      .querySelectorAll('[data-passive]')
      .forEach((button) => {
        button.onclick = () => {
          const ability = d.skills.find((item) => item.id === button.dataset.passive);
          context.shell.toast(
            `${ability.name}：${finalPassiveText(ability, d.mechanicMark?.name)}`,
          );
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
              target:
                a.target === 'ally' || a.target === 'self'
                  ? session.selection.selected
                  : session.selection.target,
            }),
          );
        };
      });
  }
  return { renderDetails };
}
