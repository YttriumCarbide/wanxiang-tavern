import {
  EQUIPMENT_QUALITIES,
  ascendCost,
  ascendEquipment,
  blacksmithSaleFits,
  blacksmithSaleGold,
  equipmentInstanceView,
  maxUnlockedEquipmentLevel,
  reforgeCost,
  reforgeEquipment,
  resolveEquipmentQuality,
  resolveEquipmentTemplate,
  sellEquipmentToBlacksmith,
  temperCost,
  temperEquipment,
} from '../equipment.js';
import { html } from '../shared/html.js';
import { equipmentDescription } from '../skill-text.js';
import { escapeText } from '../ui.js';
import { cityServiceArt } from './city-service-art.js';
import { equipmentArt } from './equipment-art.js';
import { createEquipmentFeedback } from './equipment-feedback.js';

const SERVICES = Object.freeze([
  {
    id: 'reforge',
    label: '重铸',
    description: '重新随机此件装备的基础属性，结果可能提高或降低。',
    cost: reforgeCost,
    apply: reforgeEquipment,
  },
  {
    id: 'temper',
    label: '淬炼',
    description: '提高此件装备的等级。',
    cost: temperCost,
    apply: temperEquipment,
  },
  {
    id: 'ascend',
    label: '升阶',
    description: '提升此件装备的品质并重新计算基础属性。',
    cost: ascendCost,
    apply: ascendEquipment,
  },
  {
    id: 'sell',
    label: '出售',
    description: '交出此件装备并收到金币。',
    cost: blacksmithSaleGold,
    apply: sellEquipmentToBlacksmith,
  },
]);

function smithQuote(service, { instance, template, wearer }, library) {
  const price = service.cost(template, instance);
  let unavailable = '';
  if (service.id === 'sell') {
    if (wearer) unavailable = '请先卸下装备';
    else if (!blacksmithSaleFits(library, template)) unavailable = '金币将超过持有上限';
  } else if (template.category === 'gem') unavailable = '宝石不可强化';
  else if (service.id === 'temper') {
    const limit = maxUnlockedEquipmentLevel(library);
    if (instance.level >= limit) unavailable = `已达淬炼上限 Lv.${limit}`;
  }
  if (service.id === 'ascend' && !unavailable && !price) unavailable = '已达最高品质';
  if (service.id !== 'sell' && !unavailable && (library.inventory.gold || 0) < price)
    unavailable = '金币不足';
  return { price, unavailable };
}

export function createBlacksmith(context, commitEquipment, refreshEquipment) {
  const { events, session } = context;
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = new URL('../../styles/blacksmith.css', import.meta.url).href;
  document.head.append(stylesheet);

  const dialog = document.createElement('dialog');
  dialog.id = 'city-blacksmith';
  dialog.className = 'city-service-dialog';
  dialog.setAttribute('aria-labelledby', 'blacksmith-title');
  dialog.innerHTML = html`<header class="city-service-head">
      <div class="blacksmith-heading">
        <svg class="blacksmith-mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
          <path d="m7 5 7 7-3 3-7-7m8 8 9-9 6 6-9 9m-8-5-6 10h17l-3-7m-8-3-3 3" />
          <path d="M7 26h20" />
        </svg>
        <h2 id="blacksmith-title">铁匠铺</h2>
      </div>
      <span data-smith-wallet></span>
      <form method="dialog"><button type="submit" aria-label="离开铁匠铺">×</button></form>
    </header>
    <div class="blacksmith-floor">
      <div class="blacksmith-rack" aria-label="装备架"></div>
      <div class="blacksmith-workbench">
        <div class="blacksmith-stage" data-forge-reserve="true" aria-hidden="true">
          <div class="blacksmith-workpiece"></div>
        </div>
        <section class="blacksmith-anvil" aria-label="待加工装备"></section>
      </div>
    </div>
    <p class="city-service-status" role="status" aria-live="polite"></p>`;
  document.body.append(dialog);
  const rack = dialog.querySelector('.blacksmith-rack');
  const anvil = dialog.querySelector('.blacksmith-anvil');
  const status = dialog.querySelector('[role="status"]');
  const stage = dialog.querySelector('.blacksmith-stage');
  const workpiece = stage.querySelector('.blacksmith-workpiece');
  const feedback = createEquipmentFeedback(stage, events);
  const getLibrary = () => session.ai.library;
  let selected = '';
  let busy = false;
  let visit = 0;

  function setStatus(state = '', message = '') {
    dialog.dataset.smithState = state;
    status.textContent = message;
  }

  function inventoryRows() {
    const library = getLibrary();
    const wearers = new Map();
    for (const member of library.characters) {
      for (const id of member.equipment || []) if (id) wearers.set(id, member.setting.name);
    }
    return library.equipment.owned.flatMap((instance) => {
      const template = resolveEquipmentTemplate(library, instance.templateId);
      if (!template) return [];
      const view = equipmentInstanceView(template, instance, library.equipment.affixesByTemplate);
      return [{ instance, template, view, wearer: wearers.get(instance.id) || '' }];
    });
  }

  function render() {
    const library = getLibrary();
    const rows = inventoryRows();
    const row = rows.find(({ instance }) => instance.id === selected) || rows[0];
    selected = row?.instance.id || '';
    dialog.querySelector('[data-smith-wallet]').textContent = `金币 ${library.inventory.gold || 0}`;
    rack.innerHTML = rows
      .map(({ instance, template, view, wearer }) => {
        const quality = resolveEquipmentQuality(view.quality, template.price);
        return html`<button
          type="button"
          data-smith-pick="${escapeText(instance.id)}"
          data-smith-category="${escapeText(template.category)}"
          aria-pressed="${instance.id === selected}"
        >
          ${equipmentArt(view, quality)}
          <span
            ><strong>${escapeText(template.name)}</strong
            ><small
              >Lv.${instance.level} ·
              ${escapeText(wearer || EQUIPMENT_QUALITIES[quality].name)}</small
            ></span
          >
        </button>`;
      })
      .join('');
    if (!row) {
      workpiece.replaceChildren();
      anvil.innerHTML = '<p>行囊中没有装备。</p>';
      return;
    }
    const quality = resolveEquipmentQuality(row.view.quality, row.template.price);
    workpiece.innerHTML = equipmentArt(row.view, quality);
    anvil.innerHTML = html`<div class="blacksmith-item">
        <div>
          <h3>${escapeText(row.template.name)}</h3>
          <span
            >Lv.${row.instance.level} · ${EQUIPMENT_QUALITIES[quality].name} · 极品度
            ${row.instance.rollPercent ?? 100}%</span
          >
        </div>
      </div>
      <p>${escapeText(equipmentDescription(row.view))}</p>
      ${row.wearer ? html`<p>${escapeText(row.wearer)}穿戴中</p>` : ''}
      <div class="blacksmith-tools">
        ${SERVICES.map((service) => {
          const { price, unavailable } = smithQuote(service, row, library);
          const amount = `${service.id === 'sell' ? '+' : ''}${price} 金币`;
          return html`<button
            type="button"
            data-smith-service="${service.id}"
            ${busy || unavailable ? 'disabled' : ''}
          >
            ${service.label} <small>${escapeText(unavailable || amount)}</small>
          </button>`;
        }).join('')}
      </div>`;
  }

  events.on(dialog, 'click', async (event) => {
    if (busy) return;
    const pick = event.target.closest('[data-smith-pick]');
    if (pick) {
      selected = pick.dataset.smithPick;
      setStatus();
      render();
      rack.querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true });
      return;
    }
    const action = event.target.closest('[data-smith-service]');
    const id = action?.dataset.smithService;
    const service = SERVICES.find((item) => item.id === id);
    if (!service || session.runtime.mode !== 'inn') return;
    const row = inventoryRows().find(({ instance }) => instance.id === selected);
    if (!row) return;
    const library = getLibrary();
    const { price, unavailable } = smithQuote(service, row, library);
    if (unavailable) return;
    busy = true;
    setStatus();
    const currentVisit = visit;
    const canShowResult = () =>
      !session.runtime.disposed &&
      dialog.open &&
      currentVisit === visit &&
      library === getLibrary() &&
      session.runtime.mode === 'inn';
    let receipt = '';
    try {
      const approved = await feedback.confirm({
        title: `${service.label} · ${row.template.name}`,
        cost: `${id === 'sell' ? '收到' : '支付'} ${price} 金币`,
        description: service.description,
      });
      if (!approved || !canShowResult()) return;
      const freshRow = inventoryRows().find(({ instance }) => instance.id === row.instance.id);
      if (!freshRow) throw Error('未持有该装备实例');
      const quote = smithQuote(service, freshRow, library);
      if (quote.unavailable) throw Error(quote.unavailable);
      if (quote.price !== price) throw Error('报价已更新，请重新确认');
      setStatus('pending', '正在保存交易…');
      const updated = await commitEquipment((draft) => service.apply(draft, row.instance.id));
      if (session.runtime.disposed || library !== getLibrary()) return;
      receipt =
        id === 'sell' ? `已出售 · 金币 +${updated}` : `${service.label}完成 · 金币 −${price}`;
    } catch (failure) {
      if (canShowResult()) setStatus('error', failure.message);
    } finally {
      busy = false;
      if (dialog.open && !session.runtime.disposed) {
        const hadActionFocus = document.activeElement === action;
        render();
        if (hadActionFocus) {
          const nextAction = dialog.querySelector(`[data-smith-service="${id}"]:enabled`);
          (
            nextAction ||
            rack.querySelector('[aria-pressed="true"]') ||
            dialog.querySelector('button')
          )?.focus({ preventScroll: true });
        }
        if (receipt && canShowResult()) {
          setStatus(id === 'sell' ? 'sold' : 'forged', receipt);
          if (id !== 'sell') feedback.play(id, '', workpiece.querySelector('.equipment-art'));
          context.audio.play('exchange');
        }
      }
    }
    if (receipt) {
      context.shell.renderParty?.();
      refreshEquipment();
    }
  });

  return {
    open(cityId) {
      const { name } = cityServiceArt(cityId, context.daily?.scene?.());
      dialog.querySelector('#blacksmith-title').textContent = `${name} · 铁匠铺`;
      if (!dialog.open) {
        visit += 1;
        setStatus();
      }
      render();
      if (!dialog.open) dialog.showModal();
    },
    dispose() {
      feedback.dispose();
      dialog.remove();
      stylesheet.remove();
    },
  };
}
