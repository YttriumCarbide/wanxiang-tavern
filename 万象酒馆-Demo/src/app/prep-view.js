import { html } from '../shared/html.js';
import { escapeText } from '../ui.js';
import { portraitUrl } from '../portraits.js';
import { grownCombat } from '../growth.js';
import { affectionLabel, affectionRank, relationship } from '../relationships.js';
import { preparationEquipment } from './equipment.js';
import { finalPassiveText, finalSkillText } from '../skill-text.js';
import { EMBLEMS } from '../emblems.js';
import {
  LEARNABLE_SKILLS,
  LEARNABLE_SKILL_MAP,
  restoreEquippedSkills,
  restoreLearnedSkills,
} from '../learnable-skills.js';
import {
  DAMAGE_TYPES,
  SUPPORT_TYPE,
  damageTypeIcon,
  damageTypeMeta,
  inferDamageType,
  resolveBasicAttackType,
} from '../damage-types.js';
import { DC_ATTRIBUTES, dcSuccessProbability, effectiveDcAttrs, formatMod } from '../dc.js';
import {
  SERVICE_ROLES,
  serviceAutoChance,
  serviceProficiency,
  serviceWaitBonus,
} from '../service-progression.js';

const TABS = Object.freeze([
  ['status', '能力 · 装备'],
  ['skill', '技能'],
  ['job', '营业'],
  ['lore', '背景故事'],
]);

function positionLabel(party, id) {
  const index = party.indexOf(id);
  if (index < 0) return '待命席';
  const row = index < 3 ? '前场' : '后场';
  const col = ['左', '中', '右'][index % 3] || '';
  return `${row} · ${col}`;
}

function radarSvg(attrs) {
  const radius = 84;
  const cx = 140;
  const cy = 136;
  const point = (r, index) => {
    const angle = ((index * 60 - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  };
  const ring = (fraction) =>
    DC_ATTRIBUTES.map((_, i) => point(radius * fraction, i).join(',')).join(' ');
  const points = DC_ATTRIBUTES.map((attr, i) =>
    point(radius * Math.min(1, (attrs?.[attr.key] || 10) / 20), i),
  );
  const polygon = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return `<svg class="prepare-radar" viewBox="0 0 280 272" role="img" aria-label="六维属性雷达图">
    ${[0.25, 0.5, 0.75, 1]
      .map(
        (f) =>
          `<polygon points="${ring(f)}" fill="${f === 1 ? 'rgba(0,0,0,0.28)' : 'none'}" stroke="rgba(226,192,120,0.3)" stroke-width="${f === 1 ? 1.5 : 1}" />`,
      )
      .join('')}
    ${DC_ATTRIBUTES.map((_, i) => {
      const [x, y] = point(radius, i);
      return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="rgba(226,192,120,0.2)" />`;
    }).join('')}
    <polygon points="${polygon}" fill="rgba(231, 194, 120, 0.34)" stroke="#fff1c4" stroke-width="2" stroke-linejoin="round" />
    ${points
      .map(
        ([x, y]) =>
          `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.6" fill="#fff" stroke="#e2c078" stroke-width="1.8" />`,
      )
      .join('')}
    ${DC_ATTRIBUTES.map((attr, i) => {
      const [x, y] = point(radius + 25, i);
      const val = attrs[attr.key] ?? 10;
      return `<text x="${x.toFixed(1)}" y="${(y - 4).toFixed(1)}" text-anchor="middle">
        <tspan font-size="13" fill="#e2c078">${attr.label}</tspan>
        <tspan x="${x.toFixed(1)}" dy="15" font-size="13" font-weight="700" fill="#fff">${val}</tspan>
      </text>`;
    }).join('')}
  </svg>`;
}

const SKILL_PALETTE = Object.freeze({
  普攻: ['#d6d2e2', '#6a6f90', '⚔'],
  入场: ['#9fe0a8', '#3f8a5a', '⚑'],
  主动: ['#8fb8ff', '#3f5fd0', '✦'],
  通用战技: ['#6cecd6', '#218a7b', '✧'],
  被动: ['#fff1c4', '#c99b4a', '◈'],
  纹章主动: ['#ffb08a', '#d0503a', '⚡'],
  纹章被动: ['#ffd9a8', '#b87630', '♛'],
});

function skillColor(kind) {
  if (kind.startsWith('纹章主动')) return SKILL_PALETTE.纹章主动;
  if (kind.startsWith('纹章被动')) return SKILL_PALETTE.纹章被动;
  if (kind === '通用战技') return SKILL_PALETTE.通用战技;
  if (kind.startsWith('被动')) return SKILL_PALETTE.被动;
  if (kind.startsWith('主动')) return SKILL_PALETTE.主动;
  return SKILL_PALETTE[kind] || SKILL_PALETTE.主动;
}

function skillsMarkup(stats, member, library) {
  const learnedIds = restoreLearnedSkills(library?.learnedSkills);
  const learnedSet = new Set(learnedIds);
  const equippedSlots = restoreEquippedSkills(member.equippedSkills, learnedSet);
  const cards = [];
  const markName = stats.mechanicMark?.name || '标记';
  cards.push({
    kind: '普攻',
    name: member.setting?.attack?.name || '基础攻击',
    cost: '1 行动',
    damageType: resolveBasicAttackType(stats),
    text: stats.attackText || `对前方敌人造成 ${stats.attack} 点伤害。`,
  });
  if (stats.entrySkill) {
    cards.push({
      kind: '入场',
      name: stats.entrySkill.name || member.setting?.entrySkill?.name || '入场技',
      cost: '换入前场触发',
      damageType: inferDamageType(stats.entrySkill, stats) || SUPPORT_TYPE,
      text: stats.entrySkill.text || finalSkillText(stats.entrySkill, markName),
    });
  }
  (stats.skills || []).forEach((skill, idx) => {
    const isPassive = Boolean(skill.passive);
    cards.push({
      kind: skill.universal
        ? '通用战技'
        : isPassive
          ? `被动 · 技能${idx + 1}`
          : `主动 · 技能${idx + 1}`,
      name: skill.name || member.setting?.skills?.[idx]?.name || `技能 ${idx + 1}`,
      cost: isPassive
        ? '被动'
        : `${skill.ap || 1} 行动${skill.mp ? ` · ${skill.mp} SP` : ''}${skill.hp ? ` · ${skill.hp} HP` : ''}`,
      damageType: isPassive ? SUPPORT_TYPE : inferDamageType(skill, stats) || SUPPORT_TYPE,
      text: isPassive
        ? skill.text || finalPassiveText(skill)
        : skill.text || finalSkillText(skill, markName),
    });
  });
  const emblem = member.emblemId ? EMBLEMS[member.emblemId] : null;
  if (emblem?.emblem) {
    cards.push({
      kind: '纹章被动',
      name: `${emblem.emblem.title} · ${emblem.emblem.name}`,
      cost: '纹章戒指',
      damageType: SUPPORT_TYPE,
      text: emblem.emblem.text || '',
    });
  }
  if (emblem?.skill) {
    cards.push({
      kind: '纹章主动',
      name: emblem.skill.name || '纹章奥义',
      cost: `${emblem.skill.ap || 1} 行动${emblem.skill.mp ? ` · ${emblem.skill.mp} SP` : ''}`,
      damageType: inferDamageType(emblem.skill, stats) || SUPPORT_TYPE,
      text: emblem.skill.text || finalSkillText(emblem.skill, markName),
    });
  }
  const slotBar = html`<div class="prepare-universal-bar">
    <div class="prepare-universal-head">
      <strong>通用战技配装 · 每人至多 2 槽</strong>
      <small
        >公会「战技研习台」可解锁更多通用战技（已掌握
        ${learnedIds.length}/${LEARNABLE_SKILLS.length}）</small
      >
    </div>
    <div class="prepare-universal-slots">
      ${[0, 1]
        .map((slot) => {
          const currentId = equippedSlots[slot] || '';
          return `<label class="prepare-universal-slot">
            <span>通用槽位 ${slot + 1}</span>
            <select
              data-universal-skill-character="${escapeText(member.id)}"
              data-universal-skill-slot="${slot}"
              aria-label="通用战技槽 ${slot + 1}"
            >
              <option value="">— 未配装通用战技 —</option>
              ${learnedIds
                .map((id) => {
                  const blueprint = LEARNABLE_SKILL_MAP[id];
                  if (!blueprint) return '';
                  const typeTag = DAMAGE_TYPES[blueprint.damageType]?.short || '技';
                  return `<option value="${escapeText(id)}" ${id === currentId ? 'selected' : ''}>[${escapeText(typeTag)}] ${escapeText(blueprint.name)}（${blueprint.mp ? `${blueprint.mp}SP` : `${blueprint.hp || 0}HP`}）</option>`;
                })
                .join('')}
            </select>
          </label>`;
        })
        .join('')}
    </div>
  </div>`;
  return (
    slotBar +
    html`<div class="prepare-skills-grid">
      ${cards
        .map((card, i) => {
          const [k1, k2, glyph] = skillColor(card.kind);
          const typeMeta = damageTypeMeta(card.damageType);
          return `<article class="prepare-ability-item" style="--k1:${k1};--k2:${k2};--i:${i}">
          <div class="pp-skill-card-head">
            <div class="pp-skill-ico" aria-hidden="true">${glyph}</div>
            <span class="pp-skill-type-ico" title="${escapeText(typeMeta.name)}">${damageTypeIcon(card.damageType, { size: 14 })}</span>
          </div>
          <div>
            <div class="pp-skill-top"><u>${escapeText(card.kind)}</u><small>${escapeText(card.cost)}</small></div>
            <strong>${escapeText(card.name)}</strong>
            <p>${escapeText(card.text)}</p>
          </div>
        </article>`;
        })
        .join('')}
    </div>`
  );
}

function loreMarkup(member) {
  const raw = String(member.setting?.worldbook || '').trim();
  const paragraphs = raw
    ? raw
        .split(/\n{2,}/u)
        .map((line) => line.trim())
        .filter(Boolean)
    : ['暂无人物背景记录。'];
  return html`<article class="prepare-lore-card">
    <header>
      <strong>${escapeText(member.setting?.name || '')}</strong>
      ${member.setting?.title ? `<small>${escapeText(member.setting.title)}</small>` : ''}
    </header>
    <div class="prepare-lore-body">
      ${paragraphs.map((p) => `<p>${escapeText(p)}</p>`).join('')}
    </div>
  </article>`;
}

function serviceRank(p) {
  return p >= 80 ? 'S' : p >= 60 ? 'A' : p >= 40 ? 'B' : p >= 20 ? 'C' : 'D';
}

/** Sync the mobile formation-expand toggle label and ARIA state with `#party-panel`. */
export function syncLeftExpandControl(
  panel = typeof document !== 'undefined' ? document.querySelector('#party-panel') : null,
) {
  if (!panel) return;
  const expanded = panel.classList.contains('left-expanded');
  const button = panel.querySelector('#prepare-expand-left');
  if (!button) return;
  button.textContent = expanded ? '收起编队' : '放大编队';
  button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
}

/** Collapse the expanded left formation panel and reset scroll offset. */
export function resetLeftExpand(
  panel = typeof document !== 'undefined' ? document.querySelector('#party-panel') : null,
) {
  if (!panel) return;
  panel.classList.remove('left-expanded');
  const col = panel.querySelector('.prepare-formation-col');
  if (col) col.scrollTop = 0;
  syncLeftExpandControl(panel);
}

/** Ensure `#prepare-expand-left` exists in `.prepare-formation-col` and cleans up on close/confirm. */
export function ensureLeftExpandControl() {
  if (typeof document === 'undefined') return;
  const panel = document.querySelector('#party-panel');
  const head = panel?.querySelector('.prepare-formation-col > .prepare-col-head');
  if (!panel || !head) return;
  let button = head.querySelector('#prepare-expand-left');
  if (!button) {
    button = document.createElement('button');
    button.id = 'prepare-expand-left';
    button.type = 'button';
    button.className = 'prepare-expand-btn';
    button.setAttribute('aria-controls', 'prepare-slots prepare-pool');
    head.append(button);
    button.addEventListener('click', () => {
      const next = !panel.classList.contains('left-expanded');
      panel.classList.toggle('left-expanded', next);
      const col = panel.querySelector('.prepare-formation-col');
      if (col) col.scrollTop = 0;
      syncLeftExpandControl(panel);
    });
  }
  if (!panel.dataset.leftExpandBound) {
    panel.dataset.leftExpandBound = 'true';
    panel.addEventListener('close', () => resetLeftExpand(panel));
    panel.querySelector('#prepare-close')?.addEventListener('click', () => resetLeftExpand(panel));
    panel.querySelector('#prepare-done')?.addEventListener('click', () => resetLeftExpand(panel));
  }
  syncLeftExpandControl(panel);
}

/** Render center showcase & right 4-tab inspector inside `#prepare-detail`. */
export function prepDetailMarkup(library, inspected, activeTab = 'status') {
  ensureLeftExpandControl();
  const tab = TABS.some(([key]) => key === activeTab) ? activeTab : 'status';
  const stats = grownCombat(inspected);
  const dcStats = effectiveDcAttrs(library, inspected);
  const rel = relationship(library, inspected.id);
  const rank = affectionRank(rel.affection);
  const tone = inspected.combat?.color || '#5b8def';
  const enMark = String(inspected.combat?.id || inspected.id || 'HERO')
    .replace(/^official-/i, '')
    .toUpperCase()
    .slice(0, 10);
  const bestAttr = [...DC_ATTRIBUTES]
    .map((a) => ({ ...a, mod: dcStats.mods[a.key]?.mod ?? attrFallbackMod(dcStats.base[a.key]) }))
    .sort((a, b) => b.mod - a.mod)[0];
  const serviceRows = Object.entries(SERVICE_ROLES)
    .map(([id, name]) => {
      const level = serviceProficiency(library.daily.serviceGrowth, inspected.id, id);
      return `<tr><th>${escapeText(name)}</th><td><span class="prepare-prof-num">${level}</span><div class="prepare-prof-bar"><i style="width:${Math.min(100, level)}%"></i></div><u class="prepare-prof-grade">${serviceRank(level)}</u></td><td>+${serviceWaitBonus(level)} 秒</td><td>${serviceAutoChance(level)}%</td></tr>`;
    })
    .join('');

  return html`<section class="prepare-stage-col" style="--c:${escapeText(tone)}">
      <div class="pp-show-bg" aria-hidden="true"></div>
      <svg
        class="prepare-sigil"
        viewBox="0 0 540 540"
        fill="none"
        stroke="currentColor"
        aria-hidden="true"
      >
        <circle cx="270" cy="270" r="262" stroke-width="1.5" />
        <circle cx="270" cy="270" r="246" stroke-width="1" stroke-dasharray="3 12" />
        <circle cx="270" cy="270" r="190" stroke-width="1" />
        <polygon points="270,24 483,393 57,393" stroke-width="1" />
        <polygon points="270,516 57,147 483,147" stroke-width="1" />
      </svg>
      <div class="pp-en" aria-hidden="true">${escapeText(enMark)}</div>
      <span class="prepare-pos-badge"
        >${escapeText(positionLabel(library.party, inspected.id))}</span
      >
      <span class="prepare-lv-badge"
        ><span><small>LV</small>${stats.level}</span></span
      >
      <section class="prepare-portrait">
        <img
          src="${portraitUrl(inspected.combat)}"
          alt="${escapeText(inspected.setting.name)}的立绘"
        />
        <div class="prepare-stage-plate">
          <div class="prepare-stage-head">
            <h2 id="prepare-character-title">${escapeText(inspected.setting.name)}</h2>
            ${inspected.setting.title ? `<span>${escapeText(inspected.setting.title)}</span>` : ''}
          </div>
          ${
            inspected.id === library.campaign?.protagonistId
              ? `<p class="prepare-protagonist-core">★ 万象酒馆之主 · 契约核心</p>`
              : `<p class="prepare-affection">♥ ${escapeText(affectionLabel(rel.affection))}</p>
          <div class="prepare-aff-bar"><i style="width:${rank.progress}%"></i></div>`
          }
          <details class="prepare-portrait-tools">
            <summary>更换立绘</summary>
            <div>
              <button type="button" data-edit-portrait="${inspected.id}">自定义卡面 / 立绘</button>
              <button type="button" data-portrait-url="${inspected.id}">图床链接</button>
              <button type="button" data-reset-portrait="${inspected.id}">恢复默认</button>
            </div>
          </details>
        </div>
      </section>
    </section>
    <section class="prepare-inspector-col" style="--c:${escapeText(tone)}">
      <dl class="prepare-stat-grid">
        ${[
          ['等级', stats.level, '', '♛'],
          ['生命', stats.hp, 'hp', '♥'],
          ['法力', stats.mp, 'mp', '💧'],
          ['普攻', stats.attack, '', '⚔'],
          ['行动', stats.limit, '', '⚡'],
        ]
          .map(
            ([label, value, cls, bg]) =>
              `<div class="${cls}"><dt>${label}</dt><dd>${value ?? '—'}</dd><span class="pp-stat-bg" aria-hidden="true">${bg}</span></div>`,
          )
          .join('')}
      </dl>
      <nav class="prepare-tabs" role="tablist" aria-label="角色详情分页">
        ${TABS.map(
          ([key, label]) =>
            `<button type="button" role="tab" data-prepare-tab="${key}" aria-selected="${key === tab}" class="${key === tab ? 'on' : ''}">${label}</button>`,
        ).join('')}
      </nav>
      <div class="prepare-tabpanels">
        <div
          class="prepare-tabpanel"
          role="tabpanel"
          data-prepare-panel="status"
          ${tab !== 'status' ? 'hidden' : ''}
        >
          <div class="prepare-status-split">
            <div class="prepare-dc-pane">
              <div class="prepare-subhead">六维属性 <span>2D6 检定修正</span></div>
              ${radarSvg(dcStats.base)}
              <div class="prepare-attr-pills">
                ${DC_ATTRIBUTES.map((attr) => {
                  const mod = dcStats.mods[attr.key]?.mod ?? 0;
                  const gemBonus = dcStats.mods[attr.key]?.gemBonus ?? 0;
                  return `<div class="prepare-attr-pill" title="${attr.label} 检定修正 ${formatMod(mod)}${gemBonus ? `（含宝石+${gemBonus}）` : ''}">
                    <i>${attr.label.slice(0, 1)}</i>
                    <div><b>${dcStats.base[attr.key]}</b><span class="${mod < 0 ? 'neg' : ''}">${formatMod(mod)}</span></div>
                  </div>`;
                }).join('')}
              </div>
              <div class="prepare-best-check">
                <div>
                  <small>擅长检定</small><b>${bestAttr.label} ${formatMod(bestAttr.mod)}</b>
                </div>
                ${[6, 8, 10]
                  .map(
                    (dc) =>
                      `<span>难度 ${dc} <u>${dcSuccessProbability(bestAttr.mod, dc)}%</u></span>`,
                  )
                  .join('')}
              </div>
            </div>
            <div class="prepare-equip-pane">${preparationEquipment(library, inspected)}</div>
          </div>
        </div>
        <div
          class="prepare-tabpanel"
          role="tabpanel"
          data-prepare-panel="skill"
          ${tab !== 'skill' ? 'hidden' : ''}
        >
          ${skillsMarkup(stats, inspected, library)}
        </div>
        <div
          class="prepare-tabpanel"
          role="tabpanel"
          data-prepare-panel="job"
          ${tab !== 'job' ? 'hidden' : ''}
        >
          <div class="prepare-service">
            <div class="prepare-subhead">营业能力 <span>INN SERVICE</span></div>
            <table class="prepare-service-table">
              <thead>
                <tr>
                  <th>岗位</th>
                  <th>熟练度</th>
                  <th>等候</th>
                  <th>自动</th>
                </tr>
              </thead>
              <tbody>
                ${serviceRows}
              </tbody>
            </table>
          </div>
        </div>
        <div
          class="prepare-tabpanel"
          role="tabpanel"
          data-prepare-panel="lore"
          ${tab !== 'lore' ? 'hidden' : ''}
        >
          ${loreMarkup(inspected)}
        </div>
      </div>
    </section>`;
}

function attrFallbackMod(score = 10) {
  return Math.floor((score - 10) / 2);
}
