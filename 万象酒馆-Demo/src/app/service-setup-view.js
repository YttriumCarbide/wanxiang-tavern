import { DISHES, INGREDIENTS } from '../content/dining.js';
import { portraitUrl } from '../portraits.js';
import {
  SERVICE_ROLES,
  serviceAutoChance,
  serviceProficiency,
  serviceWaitBonus,
} from '../service-progression.js';
import {
  SERVICE_CATALOG,
  SERVICE_FACILITIES,
  calcLiveDishPrice,
  defaultHubMenus,
  liveCraftableCount,
  liveFacilities,
  liveHubFateTokens,
  liveServiceTier,
  liveWeatherForDay,
  serviceFacilityCost,
} from '../service-live.js';
import { DC_ATTRIBUTES, effectiveDcAttrs, formatMod } from '../dc.js';
import { tavernPromotion } from '../daily.js';
import { escapeText } from '../ui.js';
import { foodArt } from './food-art.js';

function dishArt(dish) {
  const dining = dish?.artId && DISHES[dish.artId];
  return dining ? foodArt(dining) : `<span>${escapeText(dish?.glyph || '菜')}</span>`;
}

function chefModText(library, staff, facilities) {
  const chef = library.characters.find((c) => c.id === staff.cook) || library.characters[0];
  const wisMod = chef ? (effectiveDcAttrs(library, chef).mods.wis?.mod ?? 0) : 0;
  return formatMod(wisMod + Math.floor(((facilities?.stove || 0) + 1) / 2));
}

function leftAside({ library, growth, staff, day, pantryCount }) {
  const { current: tier, next } = liveServiceTier(growth.reputation);
  const weather = liveWeatherForDay(day);
  const fac = liveFacilities(growth);
  const fateTokens = liveHubFateTokens(library, growth, staff);
  const repTarget = next ? next.repReq : tier.repReq || 1500;
  const repPct = next
    ? Math.min(100, Math.round((growth.reputation / Math.max(1, repTarget)) * 100))
    : 100;
  const cookMod = chefModText(library, staff, fac);
  const promo = tavernPromotion(library.daily, library.workshop);

  return `<aside class="tv-side tv-panel">
    <div class="tv-crest-card">
      <div class="tv-crest-top">
        <div class="tv-rank-gem"><span><small>LV</small>${tier.lv}</span></div>
        <div class="tv-crest-title">
          <small>${tier.en}</small>
          <h3>${escapeText(tier.name)}</h3>
          <div class="tv-crest-meta">${tier.tables} 桌 · ${Math.max(tier.stoves, 2 + Math.floor(fac.stove / 2))} 灶 · 售价 ×${tier.priceMult.toFixed(2)}</div>
        </div>
      </div>
      <div class="tv-rep-row">
        <span>${next ? `晋升 Lv.${next.lv} 知名度` : '已达最高接待等级'}</span>
        <b>${growth.reputation}${next ? ` / ${next.repReq}` : ''}</b>
      </div>
      <div class="tv-bar"><i style="width:${repPct}%"></i></div>
      ${promo.ready ? '<button type="button" class="tv-promo-pill" data-service-open-promo>✦ 酒馆阶位晋升就绪 · 点击前往！</button>' : ''}
    </div>

    <div class="tv-day-card">
      <div class="tv-day-head">
        <span class="tv-day-badge">DAY ${day}</span>
        <strong>${weather.badge} ${escapeText(weather.name)}</strong>
        <div class="tv-hot-tags">${weather.hotTags.map((t) => `<span class="tv-tag hot">${escapeText(t)}↑</span>`).join('')}</div>
      </div>
      <p class="tv-day-desc">${escapeText(weather.desc)}</p>
      <p class="tv-pantry-hint">魔物食材（库存 ${pantryCount}）：由野外遭遇战、副本探索与市场获得</p>
    </div>

    <div class="tv-wallet-card">
      <div><small>持有金币</small><b class="tv-gold">${library.inventory.gold || 0} G</b></div>
      <div><small>主厨火候</small><b>2D6 ${escapeText(cookMod)}</b></div>
      <div title="仅可在酒馆营业突发事件或火候检定失败时重掷"><small>今夜命运骰</small><b class="tv-fate">${fateTokens}</b></div>
    </div>
  </aside>`;
}

function menuTabMarkup({ library, growth, menus, day, menuTab, tutorial }) {
  const { current: tier } = liveServiceTier(growth.reputation);
  const weather = liveWeatherForDay(day);
  const inventory = library.dining?.inventory || {};
  const list = SERVICE_CATALOG.filter((d) => d.kind === menuTab);
  const slotIds = [
    ...menus.sigMenu.map((id) => [id, true]),
    ...menus.regMenu.map((id) => [id, false]),
  ];

  return `<div class="tv-pane">
    <div class="tv-tonight">
      <div class="tv-tonight-head">
        <span>◆ 今夜挂牌菜单：特色菜 <b>${menus.sigMenu.length}/${tier.maxSig}</b> · 基础菜 <b>${menus.regMenu.length}/${tier.maxReg}</b></span>
        ${tutorial ? '<small>试营业仅供应基础菜品</small>' : '<button type="button" class="tv-mini-btn" data-service-autofill>✦ 一键应季配菜</button>'}
      </div>
      <div class="tv-tonight-slots">
        ${slotIds
          .map(([id, isSig]) => {
            const dish = SERVICE_CATALOG.find((d) => d.id === id);
            if (!dish) return '';
            const cnt = isSig ? liveCraftableCount(dish, inventory) : 999;
            const { price, isHot } = calcLiveDishPrice(dish, { growth, day });
            return `<button type="button" class="tv-mslot ${isSig ? 'sig' : ''} ${cnt <= 0 ? 'out' : ''}" data-service-dish="${dish.id}" title="点击从菜单撤下">
              <span class="tv-mslot-art">${dishArt(dish)}</span>
              <span class="tv-mslot-body"><b>${isHot ? '★' : ''}${escapeText(dish.name)}</b><span>${price}G ${isSig ? `· 余${cnt}` : ''}</span></span>
            </button>`;
          })
          .join('')}
      </div>
    </div>

    <div class="tv-menu-bar">
      <button type="button" class="tv-filter-btn ${menuTab === 'signature' ? 'on' : ''}" data-service-menutab="signature" ${tutorial ? 'disabled' : ''}>特色菜 · 消耗库存食材 (${SERVICE_CATALOG.filter((d) => d.kind === 'signature').length})</button>
      <button type="button" class="tv-filter-btn ${menuTab === 'regular' ? 'on' : ''}" data-service-menutab="regular">基础菜 · 无限供应 (${SERVICE_CATALOG.filter((d) => d.kind === 'regular').length})</button>
    </div>

    <div class="tv-recipe-grid">
      ${list
        .map((dish) => {
          const isSig = dish.kind === 'signature';
          const equipped = (isSig ? menus.sigMenu : menus.regMenu).includes(dish.id);
          const { price, isHot } = calcLiveDishPrice(dish, { growth, day });
          const effDc = isSig ? Math.max(5, Math.min(12, dish.dc + weather.dcDelta)) : 0;
          const reqMarkup =
            isSig && dish.recipe
              ? Object.entries(dish.recipe)
                  .map(([ingId, n]) => {
                    const have = inventory[ingId] || 0;
                    return `<span class="tv-ing-pill ${have < n ? 'lack' : ''}">${escapeText(INGREDIENTS[ingId]?.name || ingId)} ${have}/${n}</span>`;
                  })
                  .join('')
              : '<span class="tv-ing-pill free">基础食材 · 无限供应</span>';
          return `<button type="button" class="tv-rcard ${equipped ? 'on' : ''}" data-service-dish="${dish.id}">
            ${equipped ? '<span class="tv-equip-badge">已挂牌</span>' : ''}
            <div class="tv-rcard-top">
              <span class="tv-dish-art">${dishArt(dish)}</span>
              <div class="tv-rcard-title">
                <b>${isHot ? '<em>★应季 </em>' : ''}${escapeText(dish.name)}</b>
                <small>${dish.tags.map(escapeText).join(' / ')}</small>
              </div>
              <div class="tv-rcard-price"><b>${price}G</b>${isSig ? `<small>DC ${effDc}</small>` : ''}</div>
            </div>
            <div class="tv-rcard-bot">${reqMarkup}</div>
          </button>`;
        })
        .join('')}
    </div>
  </div>`;
}

function staffTabMarkup({ library, growth, members, staff, slot }) {
  const activeRole = Object.hasOwn(SERVICE_ROLES, slot) ? slot : 'cook';
  const posts = Object.entries(SERVICE_ROLES)
    .map(([role, label]) => {
      const member = members.find((m) => m.id === staff[role]);
      const lv = serviceProficiency(growth, member?.id, role);
      const wait = serviceWaitBonus(lv);
      const auto = serviceAutoChance(lv);
      const thumb = member ? portraitUrl(member.combat) : '';
      return `<button type="button" class="tv-pcard ${activeRole === role ? 'sel' : ''}" data-daily-role="${role}">
        <div class="tv-pcard-bg">${thumb ? `<img src="${escapeText(thumb)}" alt="">` : '<span class="tv-empty-ava">＋</span>'}</div>
        <div class="tv-pcard-info">
          <span class="tv-role-tag">${escapeText(label)}</span>
          <strong>${escapeText(member?.setting.name || '未指派')}</strong>
          <div class="tv-pcard-stats"><span>熟练 <b>${lv}</b></span><span>+${wait}s</span><span>自动 ${auto}%</span></div>
        </div>
      </button>`;
    })
    .join('');

  const roster = members
    .map((m) => {
      const curPost = Object.keys(SERVICE_ROLES).find((r) => staff[r] === m.id);
      const lv = serviceProficiency(growth, m.id, activeRole);
      const mods = effectiveDcAttrs(library, m).mods;
      const topAttr = [...DC_ATTRIBUTES].sort(
        (a, b) => (mods[b.key]?.mod || 0) - (mods[a.key]?.mod || 0),
      )[0];
      return `<button type="button" class="tv-rchar ${curPost === activeRole ? 'on' : ''}" data-daily-person="${escapeText(m.id)}">
        <img src="${escapeText(portraitUrl(m.combat))}" alt="">
        <div>
          <div class="tv-rchar-top"><b>${escapeText(m.setting.name)}</b>${curPost ? `<span>${escapeText(SERVICE_ROLES[curPost])}</span>` : ''}</div>
          <small>${escapeText(SERVICE_ROLES[activeRole])}熟练 ${lv} · 擅长 ${escapeText(topAttr.label)} ${escapeText(formatMod(mods[topAttr.key]?.mod || 0))}</small>
        </div>
      </button>`;
    })
    .join('');

  return `<div class="tv-pane">
    <div class="tv-posts-row">${posts}</div>
    <p class="tv-roster-hint">点击下方角色指派或互换至【${escapeText(SERVICE_ROLES[activeRole])}】 · 完成营业当班熟练提升、好感 +2</p>
    <div class="tv-roster-grid">${roster}</div>
  </div>`;
}

function upgradeTabMarkup({ library, growth }) {
  const gold = library.inventory.gold || 0;
  const fac = liveFacilities(growth);
  const promo = tavernPromotion(library.daily, library.workshop);

  const tierSteps = Array.from({ length: 5 }, (_, i) => {
    const done = i <= library.daily.rank;
    return `<div class="tv-tstep ${done ? 'done' : ''} ${i === library.daily.rank ? 'cur' : ''}"><span>Lv.${i}</span></div>`;
  }).join('');

  return `<div class="tv-pane">
    <div class="tv-tier-banner">
      <div>
        <small>TAVERN PROMOTION · 公会与工坊协同阶位</small>
        <h4>酒馆阶位 Lv.${library.daily.rank} → Lv.${library.daily.rank + 1}</h4>
        <p>已完整营业 ${promo.shifts} / 2 班 · 发条核心 ${promo.cores} / 10（条件与现有工坊互通不变）</p>
        <div class="tv-tier-steps">${tierSteps}</div>
      </div>
      <button type="button" class="tv-mini-btn" data-service-open-promo>${promo.ready ? '✦ 前往阶位晋升' : '查看晋升条件'}</button>
    </div>

    <div class="tv-fac-grid">
      ${SERVICE_FACILITIES.map((f) => {
        const lv = fac[f.id] || 0;
        const full = lv >= f.maxLv;
        const cost = serviceFacilityCost(f, lv);
        const bars = Array.from(
          { length: f.maxLv },
          (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`,
        ).join('');
        return `<div class="tv-fcard" style="--c:${f.color}">
          <div class="tv-fcard-head"><strong>${escapeText(f.name)}</strong><span>Lv.${lv}/${f.maxLv}</span></div>
          <div class="tv-lv-bars">${bars}</div>
          <p>${escapeText(lv > 0 ? f.desc(lv) : `下一级：${f.desc(1)}`)}</p>
          <button type="button" class="tv-mini-btn" data-service-fac="${f.id}" ${full || gold < cost ? 'disabled' : ''}>
            ${full ? '✦ 已臻满级' : `金币升级 · ${cost} G`}
          </button>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

export function serviceSetupView({
  library,
  growth,
  members,
  staff,
  slot,
  selection = {},
  tutorial,
}) {
  const tab = ['menu', 'staff', 'upgrade'].includes(selection.tab) ? selection.tab : 'menu';
  const menuTab = tutorial || selection.menuTab !== 'signature' ? 'regular' : 'signature';
  const day = library.daily?.day || 1;
  const inventory = library.dining?.inventory || {};
  const pantryCount = Object.values(inventory).reduce((s, n) => s + (n > 0 ? n : 0), 0);
  const menus = defaultHubMenus(growth, inventory);

  let body;
  if (tab === 'staff') {
    body = staffTabMarkup({ library, growth, members, staff, slot });
  } else if (tab === 'upgrade') {
    body = upgradeTabMarkup({ library, growth });
  } else {
    body = menuTabMarkup({ library, growth, menus, day, menuTab, tutorial });
  }

  return `<div class="tv-hub">
    ${leftAside({ library, growth, staff, day, pantryCount })}
    <section class="tv-main tv-panel">
      <nav class="tv-subnav" role="tablist" aria-label="酒馆筹备分页">
        <button type="button" role="tab" class="tv-subtab ${tab === 'menu' ? 'on' : ''}" aria-selected="${tab === 'menu'}" data-service-tab="menu">今夜菜单</button>
        <button type="button" role="tab" class="tv-subtab ${tab === 'staff' ? 'on' : ''}" aria-selected="${tab === 'staff'}" data-service-tab="staff">当班排班</button>
        <button type="button" role="tab" class="tv-subtab ${tab === 'upgrade' ? 'on' : ''}" aria-selected="${tab === 'upgrade'}" data-service-tab="upgrade">设施扩建</button>
      </nav>
      ${body}
    </section>
  </div>`;
}
