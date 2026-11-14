import { escapeText } from '../ui.js';
import { html } from '../shared/html.js';
import {
  workshopVisible,
  workshopRate,
  workshopBuildCost,
  workshopParallel,
} from '../workshop/engine.js';
import { workshopBoardNodes, workshopLayout, WORKSHOP_TILE } from '../workshop/layout.js';
import { workshopEntryIcon } from '../workshop/icons.js';

export const workshopNumber = (n) =>
  new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: 1,
    notation: n >= 100000 ? 'compact' : 'standard',
  }).format(n || 0);
const e = escapeText;
const KIND_TYPES = Object.freeze({ item: 'items', station: 'stations', research: 'research' });

function itemIcon(catalog, id) {
  return workshopEntryIcon(
    'items',
    catalog.items.find((item) => item.id === id),
  );
}

export function workshopMaterials(cost, catalog, state) {
  return Object.entries(cost)
    .map(
      ([id, n]) =>
        `<span data-ws-cost="${e(id)}" data-required="${n}" class="ws-cost ${state.items[id] >= n ? 'enough' : ''}">${itemIcon(catalog, id)}${e(catalog.items.find((i) => i.id === id)?.name || id)} <b>${workshopNumber(state.items[id])}/${workshopNumber(n)}</b></span>`,
    )
    .join('');
}

function workshopBoard(catalog, tab) {
  const nodes = workshopBoardNodes(catalog, tab);
  const positions = workshopLayout(nodes);
  return nodes.map(({ type, entry, key }) => ({
    kind: type === 'research' ? 'research' : type === 'items' ? 'item' : 'station',
    entry,
    position: positions.get(key),
  }));
}

export function workshopHome(catalog, state, tab) {
  const nodes = workshopBoard(catalog, tab);
  const visible = nodes.filter(({ kind, entry }) => workshopVisible(state, catalog, kind, entry));
  const group = (visible.length ? visible : nodes).slice(0, 3).map(({ position }) => position);
  if (!group.length) return { x: 0, y: 0 };
  const xs = group.map(({ x }) => x);
  const ys = group.map(({ y }) => y);
  return {
    x: (Math.min(...xs) + Math.max(...xs) + WORKSHOP_TILE.width) / 2,
    y: (Math.min(...ys) + Math.max(...ys) + WORKSHOP_TILE.height) / 2,
  };
}

function workshopTile(kind, entry, position, state) {
  const research = kind === 'research';
  const station = kind === 'station';
  const level = state.research[entry.id] || 0;
  const record = state.stations[entry.id];
  const busy = kind === 'item' && state.manual[entry.id]?.active;
  const complete = research ? level >= entry.costs.length : station && record?.count >= entry.max;
  const action = research ? 'research' : station ? 'build' : 'craft';
  const label = research ? '研修' : station ? '建造' : '手作';
  const symbol = workshopEntryIcon(KIND_TYPES[kind], entry);
  const amount = research
    ? `Lv.${level}/${entry.costs.length}`
    : station
      ? `${record?.active || 0}/${record?.count || 0} 运转`
      : workshopNumber(state.items[entry.id]);
  return html`<article
    class="ws-node"
    data-ws-node="${e(entry.id)}"
    data-kind="${kind}"
    style="left:${position.x}px;top:${position.y}px"
  >
    <button
      class="ws-node-action"
      data-ws-action="${action}"
      data-id="${e(entry.id)}"
      aria-label="${label}${e(entry.name)}"
      ${busy || complete ? 'disabled' : ''}
    >
      <span class="ws-node-symbol" aria-hidden="true">${symbol}</span>
      ${kind === 'item' ? `<span class="ws-node-meter" aria-hidden="true"><i data-ws-progress="${e(entry.id)}"></i></span>` : ''}
    </button>
    <button
      class="ws-node-select"
      data-ws-select="${e(entry.id)}"
      data-kind="${kind}"
      aria-label="查看${e(entry.name)}"
    >
      <strong>${e(entry.name)}</strong>
      <span ${kind === 'item' ? `data-ws-quantity="${e(entry.id)}"` : ''}>${amount}</span>
    </button>
  </article>`;
}

export function workshopGraph(state, catalog, tab) {
  return workshopBoard(catalog, tab)
    .filter(({ kind, entry }) => workshopVisible(state, catalog, kind, entry))
    .map(({ kind, entry, position }) => workshopTile(kind, entry, position, state))
    .join('');
}

function walletCosts(cost, wallet) {
  return [
    ['gold', '金币'],
    ['ether', '以太'],
  ]
    .filter(([key]) => cost[key] > 0)
    .map(
      ([key, label]) =>
        `<span class="ws-cost ${wallet[key] >= cost[key] ? 'enough' : ''}">${label} <b>${workshopNumber(cost[key])}</b></span>`,
    )
    .join('');
}

function facilityControls(state, catalog, station, items, wallet) {
  const record = state.stations[station.id] || { count: 0, active: 0 };
  const cost = workshopBuildCost(state, station);
  return html`<section class="ws-facility">
    <strong>${e(station.name)}</strong><span>${record.active} / ${record.count} 运转</span>
    <div class="ws-costs">
      ${workshopMaterials(cost.materials, catalog, state)} ${walletCosts(cost, wallet)}
    </div>
    ${station.cycle && Object.keys(station.inputs).length ? `<div class="ws-costs">整轮投入 ${workshopMaterials(station.inputs, catalog, state)}</div>` : ''}
    <button
      data-ws-action="build"
      data-id="${e(station.id)}"
      ${record.count >= station.max ? 'disabled' : ''}
    >
      ${record.count >= station.max ? '已达上限' : '建造一座'}
    </button>
    ${record.count ? `<label class="ws-active">运转数量 <input aria-label="${e(station.name)}运转数量" type="range" min="0" max="${record.count}" value="${record.active}" data-ws-active="${e(station.id)}"><output>${record.active}</output></label>` : ''}
    ${items.map((item) => `<p>${e(item.name)} · 每 ${((station.cycle || station.period || item.seconds) / workshopRate(state, catalog, station.cycle ? '' : item.id, station.id)).toFixed(1)} 秒产出 ${workshopParallel(state, catalog, station, item.id)} 份</p>`).join('')}
  </section>`;
}

export function workshopInspector(state, catalog, kind, selected, wallet = {}) {
  if (kind === 'core') {
    const step = catalog.core[state.core];
    return html` <h2>星隙炉心</h2>
      <div class="ws-core-dial">
        <b>${state.core}</b><span>炉心等级 / ${catalog.core.length}</span>
      </div>

      ${step ? `<h4>下一级</h4><p>生产速率 +${step.production}% · 手作额外 +${step.manual}%</p>${step.goldReward || step.etherReward ? `<p>奖励 ${workshopNumber(step.goldReward)} 金币 · ${workshopNumber(step.etherReward)} 以太</p>` : ''}<div class="ws-costs">${workshopMaterials(step.materials, catalog, state)}${walletCosts({ gold: step.price, ether: step.ether }, wallet)}</div><button class="ws-primary" data-ws-action="core">升级炉心</button>` : '<p>炉心已臻完满。</p>'}`;
  }
  if (kind === 'research') {
    const tech = catalog.research.find((entry) => entry.id === selected);
    if (!tech) return '<h2>工艺研修</h2><p>选择一份案卷，查看下一等级的费用与改进。</p>';
    const level = state.research[tech.id] || 0;
    const effect = tech.effects
      .map((part) => {
        const target = (part.type === 'item' ? catalog.items : catalog.stations).find(
          (entry) => entry.id === part.id,
        );
        const phrases = [
          part.speed.mode !== 'none'
            ? `速率 ${part.speed.mode === 'add' ? '+' + part.speed.growth + '% / 级' : part.speed.mode + ' ' + part.speed.growth}`
            : '',
          part.parallel.mode !== 'none' ? `并行 +${part.parallel.growth} / 级` : '',
        ].filter(Boolean);
        return phrases.length ? `<p>${e(target.name)}<br><b>${e(phrases.join(' · '))}</b></p>` : '';
      })
      .join('');
    return html`<small class="ws-overline">工艺研修 · Lv.${level}/${tech.costs.length}</small>
      <h2>${workshopEntryIcon('research', tech, 'ws-title-icon')}${e(tech.name)}</h2>
      <p>${e(tech.description)}</p>
      ${effect}${tech.unlocks.map((u) => `<p>Lv.${u.level} 解锁 ${(u.type === 'item' ? catalog.items : catalog.stations).find((i) => i.id === u.id)?.name ? e((u.type === 'item' ? catalog.items : catalog.stations).find((i) => i.id === u.id).name) : ''}</p>`).join('')}${tech.station ? `<p>需要设施：${e(catalog.stations.find((s) => s.id === tech.station).name)}</p>` : ''}${level < tech.costs.length ? `<h4>研修所需</h4><div class="ws-costs">${workshopMaterials(tech.costs[level], catalog, state)}</div><button class="ws-primary" data-ws-action="research" data-id="${e(tech.id)}">研修至 Lv.${level + 1}</button>` : '<p>全部等级已完成。</p>'}`;
  }
  if (kind === 'station') {
    const station = catalog.stations.find((entry) => entry.id === selected);
    if (!station) return '';
    const items = catalog.items.filter((item) => station.outputs[item.id]);
    return html`<h2>
        ${workshopEntryIcon('stations', station, 'ws-title-icon')}${e(station.name)}
      </h2>
      ${facilityControls(state, catalog, station, items, wallet)}`;
  }
  const item = catalog.items.find((entry) => entry.id === selected);
  if (!item) return '<h2>星隙工坊</h2><p>选择物资，查看配方与生产设施。</p>';
  const job = state.manual[item.id];
  const producers = catalog.stations.filter(
    (station) => station.outputs[item.id] && workshopVisible(state, catalog, 'station', station),
  );
  return html` <h2>${workshopEntryIcon('items', item, 'ws-title-icon')}${e(item.name)}</h2>
    <div class="ws-stock">
      <b data-ws-stock>${workshopNumber(state.items[item.id])}</b><span>库存</span>
    </div>
    <p>${e(item.description || '')}</p>
    <h4>
      手作配方 <span>${(item.seconds / workshopRate(state, catalog, item.id)).toFixed(1)} 秒</span>
    </h4>
    <div class="ws-costs">
      ${Object.keys(item.inputs).length ? workshopMaterials(item.inputs, catalog, state) : '<span>直接收集，无需原料</span>'}
    </div>
    <button
      class="ws-primary"
      data-ws-action="craft"
      data-id="${e(item.id)}"
      ${job?.active ? 'disabled' : ''}
    >
      ${job?.active ? '正在制作…' : '手作一份'}
    </button>
    <div class="ws-delivery">
      <h4>交付给酒馆 <span>${workshopNumber(item.value)} 金币 / 份</span></h4>
      <div>
        <input
          aria-label="交付数量"
          data-ws-sell-count
          type="number"
          min="1"
          max="1000000000000"
          value="1"
        /><button data-ws-action="sell" data-id="${e(item.id)}">交付</button
        ><button data-ws-action="sell-all" data-id="${e(item.id)}">全部</button>
      </div>
    </div>
    <h4>自动生产</h4>
    ${
      producers.length
        ? producers
            .map((station) => facilityControls(state, catalog, station, [item], wallet))
            .join('')
        : '<p>对应生产设施尚未解锁，先通过手作推进工艺。</p>'
    }`;
}

export function workshopInventory(state, catalog) {
  const entries = catalog.items.filter(
    (item) => state.known.includes(item.id) || (state.items[item.id] || 0) > 0,
  );
  return `<div class="ws-inventory">${entries.map((item) => `<button data-ws-select="${e(item.id)}" data-kind="item" class="ws-inventory-row">${workshopEntryIcon('items', item)}<strong>${e(item.name)}</strong><b data-ws-inventory-quantity="${e(item.id)}">${workshopNumber(state.items[item.id])}</b><span>${workshopNumber(item.value)} 金币 / 份</span></button>`).join('') || '<p>收集到的物资会记在这里。</p>'}</div>`;
}
