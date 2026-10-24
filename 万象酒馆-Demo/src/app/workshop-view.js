import { escapeText } from '../ui.js';
import { html } from '../shared/html.js';
import {
  workshopVisible,
  workshopRate,
  workshopBuildCost,
  workshopParallel,
} from '../workshop/engine.js';
import { workshopLayout, workshopEdges } from '../workshop/layout.js';

export const workshopNumber = (n) =>
  new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: 1,
    notation: n >= 100000 ? 'compact' : 'standard',
  }).format(n || 0);
const e = escapeText;

export function workshopMaterials(cost, catalog, state) {
  return Object.entries(cost)
    .map(
      ([id, n]) =>
        `<span data-ws-cost="${e(id)}" data-required="${n}" class="ws-cost ${state.items[id] >= n ? 'enough' : ''}">${e(catalog.items.find((i) => i.id === id)?.name || id)} <b>${workshopNumber(state.items[id])}/${workshopNumber(n)}</b></span>`,
    )
    .join('');
}

export function workshopGraph(state, catalog, tab, selected, search = '') {
  const type = tab === 'research' ? 'research' : 'item';
  const entries = (type === 'research' ? catalog.research : catalog.items).filter((entry) =>
    workshopVisible(state, catalog, type, entry),
  );
  const layout = workshopLayout(entries, type === 'research' ? 'research' : 'items');
  const width = Math.max(900, ...[...layout.values()].map((p) => p.x + 250));
  const height = Math.max(600, ...[...layout.values()].map((p) => p.y + 170));
  const paths = workshopEdges(entries, layout, type === 'research' ? 'research' : 'items');
  return html`<div class="ws-blueprint" style="width:${width}px;height:${height}px">
    <svg class="ws-connections" width="${width}" height="${height}" aria-hidden="true">
      ${paths.map((path) => `<path d="${path}"/>`).join('')}
    </svg>
    ${entries
      .map((entry, index) => {
        const p = layout.get(entry.id);
        const dim = search && !entry.name.includes(search);
        const tech = type === 'research';
        const level = state.research[entry.id] || 0;
        const busy = !tech && state.manual[entry.id]?.active;
        return html`<article
          class="ws-node ${selected === entry.id ? 'selected' : ''} ${dim ? 'dim' : ''}"
          data-ws-node="${e(entry.id)}"
          style="left:${p.x}px;top:${p.y}px"
        >
          <button
            class="ws-node-select"
            data-ws-select="${e(entry.id)}"
            aria-label="查看${e(entry.name)}"
          >
            <small>${tech ? '研修案卷' : '物资档案'} / ${String(index + 1).padStart(2, '0')}</small
            ><strong>${e(entry.name)}</strong
            ><span data-ws-quantity="${e(entry.id)}"
              >${tech ? `Lv.${level} / ${entry.costs.length}` : workshopNumber(state.items[entry.id])}</span
            >
          </button>
          <div class="ws-node-meter"><i data-ws-progress="${e(entry.id)}"></i></div>
          <button
            class="ws-node-action"
            data-ws-action="${tech ? 'research' : 'craft'}"
            data-id="${e(entry.id)}"
            ${busy || (tech && level === entry.costs.length) ? 'disabled' : ''}
          >
            ${tech ? (level === entry.costs.length ? '研修完成' : '研修') : busy ? '手作中…' : Object.keys(entry.inputs).length ? '手作一份' : '收集一份'}
          </button>
        </article>`;
      })
      .join('')}
    ${entries.length <= 3 ? '<div class="ws-first-note"><small>写给初来工坊的旅人</small><h3>让微光<br>成为日常。</h3><p>先收集星尘、净泉与麦粒。<br>交付物资换取工坊券，建起第一条产线。<br>新的配方会随原料逐步显现。</p><span>手作 · 建造 · 研修 · 自动生产</span></div>' : ''}
    ${!entries.length ? '<div class="ws-empty"><h3>研修尚未开启</h3><p>制作出工坊机芯后，新的工艺将在这里展开。</p></div>' : ''}
  </div>`;
}

export function workshopInspector(state, catalog, tab, selected) {
  if (selected === 'core') {
    const step = catalog.core[state.core];
    return html`<small class="ws-overline">工坊的心脏</small>
      <h2>星隙炉心</h2>
      <div class="ws-core-dial">
        <b>${state.core}</b><span>炉心等级 / ${catalog.core.length}</span>
      </div>
      <p>温暖每一条产线，让手中的工艺走得更远。</p>
      ${step ? `<h4>下一级</h4><p>生产速率 +${step.production}% · 手作额外 +${step.manual}%</p><div class="ws-costs">${workshopMaterials(step.materials, catalog, state)}${step.price ? `<span class="ws-cost">工坊券 ${step.price}</span>` : ''}</div><button class="ws-primary" data-ws-action="core">升级炉心</button>` : '<p>炉心已臻完满。</p>'}`;
  }
  if (tab === 'research') {
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
      <h2>${e(tech.name)}</h2>
      <p>${e(tech.description)}</p>
      ${effect}${tech.unlocks.map((u) => `<p>Lv.${u.level} 解锁 ${(u.type === 'item' ? catalog.items : catalog.stations).find((i) => i.id === u.id)?.name ? e((u.type === 'item' ? catalog.items : catalog.stations).find((i) => i.id === u.id).name) : ''}</p>`).join('')}${tech.station ? `<p>需要设施：${e(catalog.stations.find((s) => s.id === tech.station).name)}</p>` : ''}${level < tech.costs.length ? `<h4>研修所需</h4><div class="ws-costs">${workshopMaterials(tech.costs[level], catalog, state)}</div><button class="ws-primary" data-ws-action="research" data-id="${e(tech.id)}">研修至 Lv.${level + 1}</button>` : '<p>全部等级已完成。</p>'}`;
  }
  const item = catalog.items.find((entry) => entry.id === selected);
  if (!item) return '<h2>星隙工坊</h2><p>选择物资，查看配方与生产设施。</p>';
  const job = state.manual[item.id];
  const producers = catalog.stations.filter(
    (station) => station.outputs[item.id] && workshopVisible(state, catalog, 'station', station),
  );
  return html`<small class="ws-overline">物资与产线</small>
    <h2>${e(item.name)}</h2>
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
      <h4>交付给酒馆 <span>${workshopNumber(item.value)} 券 / 份</span></h4>
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
            .map((station) => {
              const record = state.stations[station.id] || { count: 0, active: 0 };
              const cost = workshopBuildCost(state, station);
              return html`<section class="ws-facility">
                <strong>${e(station.name)}</strong
                ><span>${record.active} / ${record.count} 运转</span>
                <div class="ws-costs">
                  ${workshopMaterials(cost.materials, catalog, state)}<span
                    class="ws-cost ${state.coins >= cost.coins ? 'enough' : ''}"
                    >工坊券 <b>${workshopNumber(cost.coins)}</b></span
                  >
                </div>
                <button
                  data-ws-action="build"
                  data-id="${e(station.id)}"
                  ${record.count >= station.max ? 'disabled' : ''}
                >
                  ${record.count >= station.max ? '已达上限' : '建造一座'}</button
                >${record.count ? `<label class="ws-active">运转数量 <input aria-label="${e(station.name)}运转数量" type="range" min="0" max="${record.count}" value="${record.active}" data-ws-active="${e(station.id)}"><output>${record.active}</output></label><p>每 ${(item.seconds / workshopRate(state, catalog, item.id, station.id)).toFixed(1)} 秒产出 ${workshopParallel(state, catalog, station, item.id)} 份</p>` : ''}
              </section>`;
            })
            .join('')
        : '<p>对应生产设施尚未解锁，先通过手作推进工艺。</p>'
    }`;
}

export function workshopInventory(state, catalog) {
  const entries = catalog.items.filter(
    (item) => state.known.includes(item.id) || (state.items[item.id] || 0) > 0,
  );
  return `<div class="ws-inventory"><div class="ws-inventory-heading"><small>酒馆物资簿</small><h2>每一份积累，都有去处。</h2><p>交付物资换取工坊券，用于扩建产线。</p></div>${entries.map((item) => `<button data-ws-select="${e(item.id)}" class="ws-inventory-row"><strong>${e(item.name)}</strong><b data-ws-inventory-quantity="${e(item.id)}">${workshopNumber(state.items[item.id])}</b><span>${workshopNumber(item.value)} 券 / 份</span></button>`).join('') || '<p>收集到的物资会记在这里。</p>'}</div>`;
}
