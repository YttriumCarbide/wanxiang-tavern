import { INGREDIENTS, foodBonusText } from '../content/dining.js';
import { SERVICE_BASIC_MENU, SERVICE_MENU } from '../content/tavern-service.js';
import { portraitUrl } from '../portraits.js';
import {
  expectedServiceTables,
  serviceAutoChance,
  servicePriceBonus,
  serviceProficiency,
  serviceWaitBonus,
  SERVICE_ROLES,
  SERVICE_REPUTATION_MAX,
  SERVICE_REPUTATION_STEP,
  SERVICE_MAX_TABLES,
} from '../service-progression.js';
import { serviceSpecial, serviceSpecialCapacity, SERVICE_SPECIALS } from '../service-specials.js';
import { escapeText } from '../ui.js';
import { foodArt } from './food-art.js';

function skillValues(level, tutorial) {
  return `<span class="setup-skill">Lv.${level}</span><span>${tutorial ? '—' : `+${serviceWaitBonus(level)}秒`}</span><span>${tutorial ? '—' : `${serviceAutoChance(level)}%`}</span>`;
}

function proficiencyDeltaTag(candidateLevel, currentLevel) {
  const diff = candidateLevel - currentLevel;
  if (diff > 0) return `<em class="setup-delta up">+${diff}</em>`;
  if (diff < 0) return `<em class="setup-delta down">${diff}</em>`;
  return '';
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
              const candLevel = serviceProficiency(growth, candidate.id, role);
              const hint =
                from === role ? '当前安排' : from ? `与${SERVICE_ROLES[from]}互换` : '可安排';
              return `<button class="setup-roster-row" type="button" data-daily-person="${escapeText(candidate.id)}" aria-current="${from === role}">
              <span class="setup-person"><img src="${escapeText(portraitUrl(candidate.combat))}" alt=""><span><strong>${escapeText(candidate.setting.name)}${from !== role ? proficiencyDeltaTag(candLevel, level) : ''}</strong><small>${hint}</small></span></span>${skillValues(candLevel, tutorial)}</button>`;
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

function specialShowcase(special, inventory, markup, selection) {
  if (!special) {
    return `<div class="setup-empty-card">
      <strong>未挂牌招牌菜</strong>
      <small>本班仅供应酒馆基础菜单，挑选招牌菜可消耗余粮赚取额外溢价收入。</small>
    </div>`;
  }
  const unitPrice = special.price + Math.floor((special.price * markup) / 100);
  const totalRevenue = unitPrice * (selection.portions || 1);
  const bonusLabel = foodBonusText(special.dish.bonus);
  const tags = (special.dish.tags || [])
    .map((tag) => `<span class="setup-tag">${escapeText(tag)}</span>`)
    .join('');
  const masteryPct = special.next
    ? Math.max(6, Math.min(100, Math.round((special.sold / special.next) * 100)))
    : 100;
  return `<div class="setup-dish-showcase">
    <div class="setup-dish-head">
      ${foodArt(special.dish)}
      <div>
        <div class="setup-dish-title-row">
          <strong>${escapeText(special.dish.name)}</strong>
          ${tags}
        </div>
        <small>单份 ${unitPrice} 金币 · 预计增收 +${totalRevenue} 金币</small>
        ${bonusLabel ? `<small class="setup-dish-bonus">美食增益：${escapeText(bonusLabel)}</small>` : ''}
      </div>
    </div>
    <dl class="setup-stock">${Object.entries(special.dish.recipe)
      .map(([id, amount]) => {
        const have = inventory[id] || 0;
        const canMake = Math.floor(have / amount);
        return `<div data-shortage="${have < amount}">
          <dt>${escapeText(INGREDIENTS[id].name)} ×${amount}</dt>
          <dd>库存 ${have}（可做 ${canMake} 份）</dd>
        </div>`;
      })
      .join('')}</dl>
    <div class="setup-mastery-box">
      <div class="setup-mastery-head">
        <span>招牌熟练 ${special.mastery} 阶</span>
        <small>累计售出 ${special.sold} 份${special.next ? ` / 下一阶 ${special.next} 份` : '（已满阶）'}</small>
      </div>
      <div class="setup-meter"><span style="width:${masteryPct}%"></span></div>
    </div>
  </div>`;
}

function pantry(selection, inventory, markup, tutorial, growth) {
  const special = serviceSpecial(selection.id, growth);
  const capacity = serviceSpecialCapacity(special, inventory);
  const selected = specialShowcase(special, inventory, markup, selection);
  const portions = special
    ? `<div class="setup-portions"><button type="button" data-service-portion="-1" aria-label="减少一份" ${selection.portions <= 1 ? 'disabled' : ''}>−</button><span>备货 <strong>${selection.portions} / ${capacity}</strong> 份</span><button type="button" data-service-portion="1" aria-label="增加一份" ${selection.portions >= capacity ? 'disabled' : ''}>＋</button></div>`
    : '';
  const choices = selection.menu
    ? `<div class="setup-dish-choices" id="setup-special-choices">${Object.keys(SERVICE_SPECIALS)
        .map((id) => {
          const item = serviceSpecial(id, growth);
          const count = serviceSpecialCapacity(item, inventory);
          const unitPrice = item.price + Math.floor((item.price * markup) / 100);
          const missing = Object.entries(item.dish.recipe)
            .filter(([key, amount]) => (inventory[key] || 0) < amount)
            .map(([key]) => INGREDIENTS[key].name);
          return `<button type="button" data-service-recipe="${id}" data-selected="${selection.id === id}" ${count ? '' : 'disabled'}>
            ${foodArt(item.dish)}
            <span>
              <strong>${escapeText(item.dish.name)} · ${unitPrice}金/份</strong>
              <small>${count ? `当前最多可备 ${count} 份 · 熟练 ${item.mastery} 阶` : `缺少：${missing.join('、')}`}</small>
            </span>
          </button>`;
        })
        .join(
          '',
        )}<button type="button" data-service-recipe="" data-selected="${!selection.id}"><span><strong>不挂招牌菜</strong><small>仅供应酒馆基础菜单</small></span></button></div>`
    : '';
  const available = tutorial
    ? '<p class="setup-empty-dish">正式营业后可挂牌招牌菜，本班先体验基础营业流程。</p>'
    : `${selected}<div class="setup-special-actions">${portions}<button type="button" data-service-recipes aria-expanded="${selection.menu}" ${selection.menu ? 'aria-controls="setup-special-choices"' : ''}>${selection.menu ? '收起菜谱' : special ? '更换招牌菜' : '挑选招牌菜'}</button></div>${choices}<p class="setup-pantry-note">开班时先按备货预留食材，客人点单后核销，打烊时未售余料全额退回。</p>`;
  return `<section class="setup-pantry" aria-labelledby="setup-pantry-title"><h3 id="setup-pantry-title">招牌菜与备货 <small>可选加成</small></h3>${available}
    <details class="setup-basic-menu" ${selection.basic ? 'open' : ''}><summary>酒馆基础菜单 <small>${SERVICE_BASIC_MENU.length} 道 · 无需耗材</small></summary><ul>${SERVICE_BASIC_MENU.map((index) => `<li><span>${escapeText(SERVICE_MENU[index].name)}</span><em>${SERVICE_MENU[index].price} 金</em></li>`).join('')}</ul></details></section>`;
}

export function serviceSetupView({ growth, members, staff, slot, selection, inventory, tutorial }) {
  const reputation = growth.reputation;
  const levels = Object.fromEntries(
    Object.keys(SERVICE_ROLES).map((role) => [role, serviceProficiency(growth, staff[role], role)]),
  );
  const shopMarkup = servicePriceBonus({}, reputation);
  const markup = servicePriceBonus(levels, reputation);
  const totalSkill = Object.values(levels).reduce((sum, lv) => sum + lv, 0);
  const nextTier = (Math.floor(reputation / SERVICE_REPUTATION_STEP) + 1) * SERVICE_REPUTATION_STEP;
  const repPct = Math.max(
    4,
    Math.min(100, Math.round((reputation / SERVICE_REPUTATION_MAX) * 100)),
  );
  const tables = tutorial ? 3 : expectedServiceTables(reputation);
  return `<section class="setup-forecast" aria-label="营业预估">
      <div class="setup-kpi">
        <div class="setup-kpi-label"><span>酒馆知名度</span><em>${reputation} / ${SERVICE_REPUTATION_MAX}</em></div>
        <strong>${reputation}<small> 声望</small></strong>
        <div class="setup-meter"><span style="width:${repPct}%"></span></div>
        <small>${expectedServiceTables(reputation) < SERVICE_MAX_TABLES ? `再升至 ${nextTier} 解锁 +1 桌客流` : '已达酒馆最高客流档位'}</small>
      </div>
      <div class="setup-kpi">
        <div class="setup-kpi-label"><span>预计客流</span><em>${tutorial ? '新店试营业' : '常规接待'}</em></div>
        <strong>${tables}<small> 桌</small></strong>
        <small>${tutorial ? '试营业固定接待 3 桌宾客' : `当前上限 ${SERVICE_MAX_TABLES} 桌 · 随知名度提升`}</small>
      </div>
      <div class="setup-kpi">
        <div class="setup-kpi-label"><span>本班溢价</span><em>全队总熟练 ${totalSkill}</em></div>
        <strong>+${tutorial ? 0 : markup}%</strong>
        <small>${tutorial ? '试营业期间全菜品原价供应' : `声望加成 +${shopMarkup}% · 班底协同 +${markup - shopMarkup}%`}</small>
      </div>
    </section>
    <div class="setup-spread"><section class="setup-staffing" aria-labelledby="setup-staffing-title"><div class="setup-section-head"><h3 id="setup-staffing-title">四岗排班</h3><small>点击岗位切换或互换人手</small></div>
      <div class="setup-roster-labels" aria-hidden="true"><span>岗位与角色</span><span>熟练</span><span>等候</span><span>自动</span></div>
      ${staffRows(members, staff, slot, growth, tutorial)}
      <p class="setup-pantry-note">在岗位上妥善接待、调饮、出菜或清洁均可累积该岗专属熟练度。</p></section>
      ${pantry(selection, inventory, markup, tutorial, growth)}
    </div>`;
}
