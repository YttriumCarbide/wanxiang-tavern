import { BUFFS } from './data.js';
import { html } from './shared/html.js';
import { escapeText, icon } from './ui.js';

function hiddenWeaponBadge(state, id, definition) {
  const weapon = state.activeHiddenWeapons?.[id];
  if (!weapon) return '';
  const stacksPerHit = definition.hiddenWeaponMechanic?.stacksPerHit || 1;
  const buffName = BUFFS[weapon.buff]?.name ?? '';
  const accentStyle =
    typeof weapon.color === 'string' &&
    /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(weapon.color)
      ? ` style="--weapon-accent:${escapeText(weapon.color)}"`
      : '';
  return html`<span
    class="overlord-weapon-pill"
    data-weapon="${escapeText(weapon.id)}"
    title="${escapeText(`${weapon.name} · ${buffName}+${stacksPerHit}`)}"
    ${accentStyle}
  >
    <span class="overlord-weapon-pill-icon">${icon(weapon.buff)}</span>
    <span class="overlord-weapon-pill-name">${escapeText(weapon.name)}</span>
    <span class="overlord-weapon-pill-tag"
      >${escapeText(buffName)}+${escapeText(String(stacksPerHit))}</span
    >
  </span>`;
}

function darkscaleBadge(unit, definition) {
  const iron = unit.buffs?.iron || 0;
  const max = definition.eclipsescaleConfig?.maxIronStacks || 4;
  const shattered = unit.broken ? ' is-shattered' : '';
  let pips = '';
  for (let index = 0; index < max; index++) {
    const lit = index < iron ? ' is-lit' : '';
    pips += `<span class="overlord-darkscale-pip${lit}${shattered}" aria-hidden="true"></span>`;
  }
  const ironName = BUFFS.iron?.name ?? '';
  return html`<span
    class="overlord-darkscale-badge"
    data-iron="${escapeText(String(iron))}"
    aria-label="${escapeText(`${ironName}${iron}/${max}`)}"
  >
    <span class="overlord-darkscale-pips">${pips}</span>
    <span>${escapeText(ironName)}${escapeText(String(iron))}/${escapeText(String(max))}</span>
  </span>`;
}

export function overlordMechanicBadges(state, id, definition) {
  const unit = state.units?.[id];
  if (!unit || unit.hp <= 0) return '';
  let out = '';
  out += hiddenWeaponBadge(state, id, definition);
  if (definition.overlordTraits?.includes('eclipsescaleOverlord')) {
    out += darkscaleBadge(unit, definition);
  }
  return out;
}
