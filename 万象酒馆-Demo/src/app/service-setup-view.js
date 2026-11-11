import { INGREDIENTS } from '../content/dining.js';
import { SERVICE_BASIC_MENU, SERVICE_MENU } from '../content/tavern-service.js';
import { portraitUrl } from '../portraits.js';
import {
  expectedServiceTables,
  serviceAutoChance,
  servicePriceBonus,
  serviceProficiency,
  serviceWaitBonus,
  SERVICE_ROLES,
} from '../service-progression.js';
import { serviceSpecial, serviceSpecialCapacity, SERVICE_SPECIALS } from '../service-specials.js';
import { escapeText } from '../ui.js';
import { foodArt } from './food-art.js';

function skillValues(level, tutorial) {
  return `<span class="setup-skill">${level}</span><span>${tutorial ? '—' : `+${serviceWaitBonus(level)}秒`}</span><span>${tutorial ? '—' : `${serviceAutoChance(level)}%`}</span>`;
}

function staffRows(members, staff, selected, growth, tutorial) {
  return Object.entries(SERVICE_ROLES)
    .map(([role, label]) => {
      const member = members.find((candidate) => candidate.id === staff[role]);
      const level = serviceProficiency(growth, member?.id, role);
      const open = selected === role;
      const list = open
        ? `<div class="setup-candidates" id="setup-staff-candidates" aria-label="${label}候选人">
          ${members
            .map((candidate) => {
              const from = Object.keys(SERVICE_ROLES).find((key) => staff[key] === candidate.id);
              const hint =
                from === role ? '当前安排' : from ? `与${SERVICE_ROLES[from]}互换` : '可安排';
              return `<button class="setup-roster-row" type="button" data-daily-person="${escapeText(candidate.id)}" aria-current="${from === role}">
              <span class="setup-person"><span><strong>${escapeText(candidate.setting.name)}</strong><small>${hint}</small></span></span>${skillValues(serviceProficiency(growth, candidate.id, role), tutorial)}</button>`;
            })
            .join('')}
        </div>`
        : '';
      return `<button class="setup-roster-row" type="button" data-daily-role="${role}" aria-expanded="${open}" ${open ? 'aria-controls="setup-staff-candidates"' : ''}>
        <span class="setup-person">${member ? `<img src="${escapeText(portraitUrl(member.combat))}" alt="">` : '<span class="setup-empty-portrait" aria-hidden="true">＋</span>'}<span><strong>${label}</strong><small>${escapeText(member?.setting.name || '请选择角色')}</small></span></span>
        ${member ? skillValues(level, tutorial) : '<span>—</span><span>—</span><span>—</span>'}</button>${list}`;
    })
    .join('');
}

function pantry(selection, inventory, markup, tutorial) {
  const special = serviceSpecial(selection.id);
  const capacity = serviceSpecialCapacity(special, inventory);
  const selected = special
    ? `<div class="setup-dish-head">${foodArt(special.dish)}<div><strong>${special.dish.name}</strong><small>预计 ${special.price + Math.floor((special.price * markup) / 100)} 金币 / 份</small></div></div>
      <dl class="setup-stock">${Object.entries(special.dish.recipe)
        .map(
          ([id, amount]) =>
            `<div><dt>${INGREDIENTS[id].name} ×${amount}</dt><dd>库存 ${inventory[id] || 0}</dd></div>`,
        )
        .join('')}</dl>`
    : '<p class="setup-empty-dish">本班供应基础菜单</p>';
  const portions = special
    ? `<div class="setup-portions"><button type="button" data-service-portion="-1" aria-label="减少一份" ${selection.portions <= 1 ? 'disabled' : ''}>−</button><strong>${selection.portions} / ${capacity} 份</strong><button type="button" data-service-portion="1" aria-label="增加一份" ${selection.portions >= capacity ? 'disabled' : ''}>＋</button></div>`
    : '';
  const choices = selection.menu
    ? `<div class="setup-dish-choices" id="setup-special-choices">${Object.keys(SERVICE_SPECIALS)
        .map((id) => {
          const item = serviceSpecial(id);
          const count = serviceSpecialCapacity(item, inventory);
          const missing = Object.entries(item.dish.recipe)
            .filter(([key, amount]) => (inventory[key] || 0) < amount)
            .map(([key]) => INGREDIENTS[key].name);
          return `<button type="button" data-service-recipe="${id}" ${count ? '' : 'disabled'}><strong>${item.dish.name}</strong><small>${count ? `最多 ${count} 份` : `缺少${missing.join('、')}`}</small></button>`;
        })
        .join('')}<button type="button" data-service-recipe="">不挂招牌菜</button></div>`
    : '';
  const available = tutorial
    ? '<p class="setup-empty-dish">正式营业后可挂牌</p>'
    : `${selected}<div class="setup-special-actions">${portions}<button type="button" data-service-recipes aria-expanded="${selection.menu}" ${selection.menu ? 'aria-controls="setup-special-choices"' : ''}>${selection.menu ? '收起菜谱' : special ? '换菜' : '挑一道招牌菜'}</button></div>${choices}<p class="setup-pantry-note">开班预留，上桌扣料，未售返还。</p>`;
  return `<section class="setup-pantry" aria-labelledby="setup-pantry-title"><h3 id="setup-pantry-title">招牌菜 <small>可选</small></h3>${available}
    <details class="setup-basic-menu" ${selection.basic ? 'open' : ''}><summary>基础菜单 <small>${SERVICE_BASIC_MENU.length} 道</small></summary><ul>${SERVICE_BASIC_MENU.map((index) => `<li>${SERVICE_MENU[index].name}</li>`).join('')}</ul></details></section>`;
}

export function serviceSetupView({ growth, members, staff, slot, selection, inventory, tutorial }) {
  const reputation = growth.reputation;
  const levels = Object.fromEntries(
    Object.keys(SERVICE_ROLES).map((role) => [role, serviceProficiency(growth, staff[role], role)]),
  );
  const shopMarkup = servicePriceBonus({}, reputation);
  const markup = servicePriceBonus(levels, reputation);
  const nextTier = (Math.floor(reputation / 25) + 1) * 25;
  return `<section class="setup-forecast" aria-label="营业预估">
      <div><span>酒馆知名度</span><strong>${reputation}<small> / 100</small></strong><small>${nextTier <= 100 ? `到 ${nextTier} 后多 1 桌` : '已达最高客流'}</small></div>
      <div><span>预计来客</span><strong>${tutorial ? 3 : expectedServiceTables(reputation)}<small> 桌</small></strong><small>${tutorial ? '试营业' : '按当前知名度'}</small></div>
      <div><span>本班定价</span><strong>+${tutorial ? 0 : markup}%</strong><small>${tutorial ? '试营业原价' : `知名度 +${shopMarkup}% · 人手 +${markup - shopMarkup}%`}</small></div>
    </section>
    <div class="setup-spread"><section class="setup-staffing" aria-labelledby="setup-staffing-title"><h3 id="setup-staffing-title">四岗排班</h3>
      <div class="setup-roster-labels" aria-hidden="true"><span>岗位与角色</span><span>熟练</span><span>等候</span><span>自动</span></div>
      ${staffRows(members, staff, slot, growth, tutorial)}
      <p class="setup-pantry-note">完成任务会提高当前岗位熟练度。</p></section>
      ${pantry(selection, inventory, markup, tutorial)}
    </div>`;
}
