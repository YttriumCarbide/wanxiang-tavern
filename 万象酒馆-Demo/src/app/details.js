import { resourceText } from '../resource-text.js';
import { EMBLEMS } from '../emblems.js';
import { effectiveBuff } from '../engine.js';
import { resourceBars, statusIcons, escapeText } from '../ui.js';
import { query as $ } from './dom.js';
import { portraitUrl } from '../catalog.js';
import { finalPassiveText } from '../skill-text.js';
import { rulesFor, ruleAvailable } from '../triggers.js';
import { equipmentDescription } from './equipment.js';

export function createDetails(context) {
  const { session } = context;
  function renderDetails(s) {
    const id = session.selection.selected;
    const d = s.heroDefinitions?.[id] || context.roster.get(id);
    const u = s.units?.[id];
    const f = session.battle.forecast?.final?.units?.[id] || u;
    if (!id || !d || !u || !f) {
      $('#details').innerHTML =
        '<div class="empty-character"><span>行动</span><p>选择角色查看技能</p></div>';
      return;
    }
    const e = (value) => escapeText(resourceText(value || ''));
    const emblem = EMBLEMS[d.emblemId];
    const combined = Boolean(u.combined || f.combined);
    const combineUsed = Boolean(u.combineSkillUsed || f.combineSkillUsed);
    const formation = session.battle.forecast?.final?.formation || s.formation;
    const disabled =
      !context.viewport.canPlan() || u.hp <= 0 || !formation.slice(0, 3).includes(id);
    const limit = d.limit + effectiveBuff(session.battle.forecast.final, id, 'haste');
    const rules = rulesFor(d);
    function badge(title, text, active, tag, attributes = '') {
      return (
        '<div class="ability-card passive-card ' +
        (active ? 'effect-active' : 'effect-inactive') +
        '" ' +
        attributes +
        ' data-tooltip="' +
        e(text) +
        '"><strong>' +
        e(title) +
        '</strong><small>' +
        e(tag) +
        '</small><p>' +
        e(text) +
        '</p></div>'
      );
    }
    function skillButton(skill, combine = false) {
      const unavailable = combine && (!combined || combineUsed);
      const spent = skill.mechanic === 'soul-banquet' && Boolean(s.soulLoans?.[id]);
      const inactive = disabled || unavailable || spent;
      const selected =
        session.selection.pending?.actor === id && session.selection.pending?.skill === skill.id;
      const text =
        (skill.text || '造成' + d.attack + '基础伤害') +
        (combine
          ? '\n' + (!combined ? '需要结合后使用' : combineUsed ? '本次结合已使用' : '结合中可使用')
          : '');
      return (
        '<button class="ability ' +
        (selected ? 'active ' : '') +
        (inactive ? 'effect-inactive combine-disabled' : 'skill-targetable') +
        '" data-skill="' +
        escapeText(skill.id) +
        '" data-tooltip="' +
        e(
          text +
            '\n消耗 ' +
            skill.ap +
            ' AP' +
            (skill.mp ? ' · ' + skill.mp + ' sp' : '') +
            (skill.hp ? ' · ' + skill.hp + ' hp' : ''),
        ) +
        '" draggable="' +
        (!inactive && !matchMedia('(pointer: coarse) and (max-width: 1100px)').matches) +
        '"' +
        (inactive ? ' disabled' : '') +
        '><strong>' +
        e(skill.name) +
        '</strong><small>' +
        skill.ap +
        ' AP' +
        (skill.mp ? ' · ' + skill.mp + ' sp' : '') +
        (skill.hp ? ' · ' + skill.hp + ' hp' : '') +
        '</small>' +
        (skill.borrowedFrom
          ? '<span class="borrowed-skill-source">借自 ' + e(skill.borrowedFrom) + '</span>'
          : '') +
        '</button>'
      );
    }
    const passives = d.skills
      .filter((skill) => skill.passive)
      .map((skill) => {
        const own = rules.filter((rule) => rule.key.startsWith('passive:' + skill.id + ':'));
        const active =
          u.hp > 0 &&
          (skill.mechanic === 'luo-counter'
            ? !u.counterDisabled
            : own.length
              ? own.some((rule) => ruleAvailable(s, id, rule))
              : true);
        return badge(
          skill.name,
          finalPassiveText(skill, d.mechanicMark?.name),
          active,
          active ? '被动 · 生效中' : '被动 · 当前不生效',
          'data-passive="' + e(skill.id) + '"',
        );
      })
      .join('');
    const entry = d.entrySkill;
    const rear = formation.slice(3).includes(id);
    const entryActive = rear && Boolean(u.entryReady) && u.hp > 0;
    const equipment = (d.equipment || [])
      .map((item) => {
        const own = rules.filter((rule) => rule.key.startsWith('equipment:' + item.id + ':'));
        const active = u.hp > 0 && (!own.length || own.some((rule) => ruleAvailable(s, id, rule)));
        return badge(
          item.name,
          equipmentDescription(item),
          active,
          active ? '装备效果 · 可生效' : '条件未满足或触发次数已用完',
          'data-equipment-effect="' + e(item.id) + '"',
        );
      })
      .join('');
    const sectionLabel = (text) => '<h4 class="ability-section-label">' + text + '</h4>';
    const category = (title, contents) =>
      '<section class="action-category"><h3 class="action-category-title">' +
      title +
      '</h3>' +
      contents +
      '</section>';
    const characterSkills =
      sectionLabel('普攻') +
      skillButton(context.roster.ability(id, 'attack')) +
      sectionLabel('技能') +
      d.skills
        .filter((skill) => !skill.passive)
        .map((skill) => skillButton(skill))
        .join('') +
      (passives ? sectionLabel('被动技能') + passives : '') +
      sectionLabel('入场技能') +
      (entry
        ? badge(
            entry.name,
            entry.text || entry.description || '',
            entryActive,
            entryActive ? '已就绪 · 换入触发' : rear ? '蓄势中' : '换入前场时自动触发',
          )
        : '<div class="action-empty-note">无入场技</div>');
    const emblemSkills = emblem
      ? sectionLabel('结合技') +
        skillButton(emblem.skill, true) +
        sectionLabel('结合被动') +
        badge(
          emblem.emblem.name,
          emblem.emblem.text,
          combined,
          combined ? '结合中 · 生效' : '未结合',
          'data-emblem-passive aria-label="' + (combined ? '结合被动生效' : '未结合') + '"',
        )
      : '<div class="action-empty-note">未配戴纹章士</div>';
    $('#details').innerHTML =
      '<div class="hero-heading"><img src="' +
      portraitUrl(d) +
      '" alt="" /><div><h2 style="color:' +
      d.color +
      '">' +
      e(d.name) +
      '</h2>' +
      (u.hp === 0 ? '<p>濒死</p>' : '') +
      '</div><span class="battle-character-level">Lv.' +
      (d.level || 1) +
      '</span></div><div class="hero-resources">' +
      resourceBars(u, f) +
      '</div><div class="detail-buffs">' +
      statusIcons(
        s,
        id,
        session.battle.forecast.final,
        session.battle.playing ? [] : session.battle.forecast.events,
      ) +
      '</div><div class="details-label">行动<span>' +
      f.used +
      '/' +
      limit +
      '</span></div><div class="details-actions-scroll">' +
      category('角色技能', characterSkills) +
      category('结合技能', emblemSkills) +
      category('装备技能', equipment || '<div class="action-empty-note">未装备</div>') +
      '</div>';
    for (const button of $('#details').querySelectorAll('[data-skill]')) {
      button.onclick = () => context.selection.pickSkill(button.dataset.skill);
      button.ondragstart = (event) => {
        const skill = context.roster.ability(id, button.dataset.skill);
        event.dataTransfer.setData(
          'application/json',
          JSON.stringify({
            kind: 'new-skill',
            actor: id,
            skill: skill.id,
            target: ['ally', 'self'].includes(skill.target) ? id : session.selection.target,
          }),
        );
      };
    }
  }
  return { renderDetails };
}
