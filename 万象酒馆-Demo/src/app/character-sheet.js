import { grownCombat, restoreGrowth, RARITIES, xpToNext } from '../growth.js';
import { BUFFS } from '../data.js';
import { characterPresentation } from '../ai/character-presentation.js';
import { escapeText } from '../ui.js';
import { html } from '../shared/html.js';
import { portraitUrl } from '../catalog.js';
import { applyEquipment } from '../equipment.js';

const targets = {
  enemy: '一名敌人',
  ally: '一名队友',
  self: '自身',
  allAllies: '全体队友',
  allEnemies: '全体敌人',
};
function effectText(effect) {
  if (effect.type === 'buff') return `${BUFFS[effect.buff].name} +${effect.value}层`;
  if (effect.type === 'cleanse')
    return `净化：${effect.buffs.map((key) => BUFFS[key].name).join('、')}`;
  return `${{ damage: '基础伤害', heal: '治疗', shield: '护盾', selfHeal: '自身治疗', selfMana: '自身回复法力' }[effect.type]} ${effect.value}`;
}
function passiveText(skill) {
  if (skill.buff) return `${BUFFS[skill.buff].name} +${skill.value}`;
  if (skill.teamFrontBuff) return `前场队伍：${BUFFS[skill.teamFrontBuff].name} +${skill.value}`;
  if (skill.endHeal) return `回合结束治疗 ${skill.endHeal}`;
  if (skill.bonusMp) return `整备时蓝量上限 +${skill.bonusMp}`;
  return skill.text;
}
function abilitySheet(skill, design, label) {
  const cost = skill.passive
    ? `被动 · ${skill.location}`
    : `${skill.ap} AP · ${skill.mp} 蓝${skill.hp ? ` · ${skill.hp} 生命` : ''}`;
  const effects = skill.passive ? [passiveText(skill)] : skill.effects.map(effectText);
  const motion = escapeText(design?.description || '这位来客的旧设定尚未记载具体动作。');
  return html`<details class="character-ability" data-character-ability="${escapeText(label)}">
    <summary>
      <span class="ability-kind">${label}</span><strong>${escapeText(skill.name)}</strong
      ><small>${escapeText(cost)}</small>
    </summary>
    <div class="ability-content">
      <div class="ability-mechanics">
        <span
          >${skill.passive ? escapeText(skill.location) : escapeText(targets[skill.target])}</span
        >${effects.map((text) => html`<b>${escapeText(text)}</b>`).join('')}
      </div>
      <p class="ability-motion">${motion}</p>
    </div>
  </details>`;
}

/** Presentation joins compiled values with readable lore; neither layer is modified. */
export function characterSheet(entry, equipment = [], options = {}) {
  const model = characterPresentation(
      typeof entry.display?.worldbook === 'string'
        ? { ...entry, setting: { ...entry.setting, worldbook: entry.display.worldbook } }
        : entry,
    ),
    combat = applyEquipment(grownCombat(entry), equipment);
  const growth = restoreGrowth(entry.growth, entry.id);
  const isPrep = options.mode === 'preparation';
  const attack = {
    name: combat.attackName,
    ap: 1,
    mp: 0,
    target: 'enemy',
    effects: [{ type: 'damage', value: combat.attack }],
  };

  const nextExp = xpToNext(growth.level);
  const expPercent = Math.min(100, Math.max(0, Math.round((growth.xp / nextExp) * 100)));

  const abilities = html`<section class="character-abilities">
    <h3>战斗方式 <small>${isPrep ? '战技数值、目标与消耗' : '展开查看数值与动作'}</small></h3>
    ${abilitySheet(attack, model.attack, '普攻')}${combat.skills.map((skill, index) => abilitySheet(skill, model.skills[index], skill.passive ? '被动' : '技能')).join('')}
  </section>`;

  const biography = html`<div class="character-biography">
    ${model.sections
      .map(
        (section) =>
          html`<section>
            <h3>${section.title}</h3>
            <p>${escapeText(section.text)}</p>
          </section>`,
      )
      .join('')}${
      model.fallback
        ? html`<section>
            <h3>来客设定</h3>
            <p>${escapeText(model.fallback)}</p>
          </section>`
        : ''
    }
  </div>`;

  const dossierContent = isPrep
    ? html`${options.equipmentMarkup || ''}${abilities}
        <details class="character-lore-fold">
          <summary class="lore-fold-summary">
            <span class="lore-summary-badge">📜 设定档案</span>
            <strong class="lore-summary-title">角色生平、外貌与世界书设定</strong>
            <span class="lore-summary-hint">点击展开详细设定 ▾</span>
          </summary>
          ${biography}
        </details>`
    : html`${biography}${abilities}`;

  return html`<div class="character-sheet">
    <aside class="character-identity">
      <div class="identity-art">
        <img src="${portraitUrl(combat)}" alt="${escapeText(model.name)}的立绘" /><span
          >异界来客</span
        >
      </div>
      <div class="identity-body">
        <h2>${escapeText(model.name)}</h2>
        <div class="identity-rank-line">
          <span class="identity-level-badge"
            ><small>LV.</small><strong>${growth.level}</strong></span
          >
          <span class="identity-rarity-tag rarity-${growth.rarity}"
            >${RARITIES[growth.rarity].name}</span
          >
          <span class="identity-profession-tag">${escapeText(model.profession)}</span>
        </div>
        <div class="identity-exp-widget" title="经验值：${growth.xp} / ${nextExp} EXP">
          <div class="exp-widget-labels">
            <span class="exp-title">EXP 经验进阶</span>
            <span class="exp-numbers">${growth.xp} / ${nextExp} (${expPercent}%)</span>
          </div>
          <div class="exp-track">
            <div class="exp-fill" style="width: ${expPercent}%"></div>
          </div>
        </div>
        <div class="identity-tags">
          <span>${escapeText(model.gender)}</span><span>${escapeText(model.age)}</span>
          ${model.traits.map((trait) => html`<span title="${escapeText(trait.label)}">${escapeText(trait.value)}</span>`).join('')}
        </div>
        <dl class="identity-stats">
          <div>
            <dt>生命</dt>
            <dd>${combat.hp}</dd>
          </div>
          <div>
            <dt>蓝量</dt>
            <dd>${combat.mp}</dd>
          </div>
          <div>
            <dt>普攻</dt>
            <dd>${combat.attack}</dd>
          </div>
          <div>
            <dt>行动次数</dt>
            <dd>${combat.limit}</dd>
          </div>
        </dl>
      </div>
    </aside>
    <div class="character-dossier">${dossierContent}</div>
  </div>`;
}
