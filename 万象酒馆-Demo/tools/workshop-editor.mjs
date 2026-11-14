import {
  readLocalWorkshopCatalog,
  writeLocalWorkshopCatalog,
} from '../src/workshop/local-catalog.js';
import { escapeText } from '../src/ui.js';
import { html } from '../src/shared/html.js';
import { createEventScope } from '../src/shared/events.js';
import {
  changeWorkshopRule,
  editWorkshopRule,
  readWorkshopRules,
  workshopRuleGroups,
} from './workshop-editor-rules.mjs';
import { WORKSHOP_CATALOG } from '../src/content/workshop-catalog.js';
import {
  WORKSHOP_DRAFT_KEY,
  validateWorkshopCatalog,
  workshopReferences,
} from '../src/workshop/catalog.js';
import {
  WORKSHOP_BOARD,
  WORKSHOP_TILE,
  workshopBoardNodes,
  workshopCell,
  workshopCellKey,
  workshopEdges,
  workshopLayout,
  workshopNodeKey,
  workshopPosition,
  workshopWire,
} from '../src/workshop/layout.js';
import {
  WORKSHOP_ICON_GROUPS,
  WORKSHOP_ICON_MAP,
  WORKSHOP_ICONS,
  WORKSHOP_TINTS,
  suggestWorkshopIcon,
  workshopEntryIcon,
  workshopIconOf,
  workshopIconSvg,
} from '../src/workshop/icons.js';

/** Local authoring tool. Drafts never alter the playable rules until Apply passes validation. */
function createWorkshopEditor(dialog, current) {
  const e = escapeText;
  const events = createEventScope();
  dialog.innerHTML = html`<header class="ws-header">
      <div class="ws-brand"><h1>工坊修改器</h1></div>
      <div class="ws-header-actions">
        <button data-we-undo>撤销</button><button data-we-redo>重做</button
        ><button data-we-import>导入</button><button data-we-export>导出</button
        ><button data-we-preview>配置预览</button
        ><button data-we-apply class="ws-primary">应用到游戏</button
        ><button data-we-read>重读游戏配置</button>
      </div>
    </header>
    <div class="we-toolbar">
      <select data-we-type aria-label="编辑类别">
        <option value="items">物资与配方</option>
        <option value="stations">生产设施</option>
        <option value="research">工艺研修</option>
        <option value="core">炉心升级</option>
        <option value="pages">工坊分页</option></select
      ><button data-we-add>新增</button><button data-we-copy>复制</button
      ><button data-we-delete>删除</button><button data-we-reset>恢复默认草稿</button
      ><button data-we-reset-view>蓝图归位</button>
      <button data-we-map-only aria-pressed="false">展开画布</button>
      <select data-we-page aria-label="蓝图分页"></select>
      <input data-we-search type="search" placeholder="搜索节点" aria-label="搜索节点" />
      <button data-we-trace>定位上下游</button>
      <select data-we-arrange-mode aria-label="排布方向">
        <option value="grid">网格排布</option>
        <option value="row">横向排布</option>
        <option value="column">纵向排布</option>
      </select>
      <button data-we-arrange>排列节点</button>
      <button data-we-wires aria-pressed="true">连线</button>
      <button data-we-batch>批量改设施</button>
      <select data-we-preset aria-label="快捷蓝图">
        <option value="">快捷蓝图</option>
        <option value="essence">十份精酿原液</option>
        <option value="crystal">五份晶化机芯</option>
        <option value="speed">全线周期改为 1 秒</option>
      </select>
    </div>
    <div class="we-body">
      <aside class="we-list"></aside>
      <div class="we-map" tabindex="0" aria-label="工坊蓝图">
        <div class="we-graph"></div>
        <div class="we-ruler we-ruler-columns" aria-hidden="true"></div>
        <div class="we-ruler we-ruler-rows" aria-hidden="true"></div>
        <output class="we-map-position"></output>
      </div>
      <form class="we-fields" autocomplete="off" novalidate></form>
    </div>
    <footer class="ws-footer">
      <p data-we-status role="status">拖空白平移 · 滚轮缩放 · Shift 框选</p>
      <button data-we-chain>快捷产线</button>
    </footer>
    <input type="file" data-we-file accept="application/json,.json" hidden />
    <dialog class="we-preview" aria-label="配置预览">
      <header>
        <h2>配置预览</h2>
        <form method="dialog"><button>关闭</button></form>
      </header>
      <textarea aria-label="将写入游戏的配置" readonly spellcheck="false"></textarea>
    </dialog>`;
  let draft = validateWorkshopCatalog(current.catalog),
    type = 'items',
    selected = '',
    search = '',
    boardPage = 'production',
    iconGroup = 'all',
    iconSearch = '',
    past = [],
    future = [],
    drag = null,
    zoom = 1,
    showWires = true,
    traced = '',
    pan = { x: 0, y: 0 },
    boardNodes = [],
    layout = new Map(),
    boardSize = { width: 0, height: 0 },
    busy = false;
  const selection = new Set();
  const fields = dialog.querySelector('.we-fields'),
    map = dialog.querySelector('.we-map');
  const preview = dialog.querySelector('.we-preview');
  const graph = map.querySelector('.we-graph');
  const mapPosition = map.querySelector('.we-map-position');
  const columnsRuler = map.querySelector('.we-ruler-columns');
  const rowsRuler = map.querySelector('.we-ruler-rows');
  function status(text) {
    dialog.querySelector('[data-we-status]').textContent = text;
  }
  function stash() {
    globalThis.localStorage.setItem(WORKSHOP_DRAFT_KEY, JSON.stringify(draft));
  }
  function edit(operation) {
    if (busy) return;
    const before = structuredClone(draft);
    const selectionBefore = { type, selected, boardPage };
    try {
      operation();
      draft = validateWorkshopCatalog(draft);
      if (JSON.stringify(before) === JSON.stringify(draft)) return true;
      past.push(before);
      if (past.length > 40) past.shift();
      future = [];
      stash();
      render();
      status('草稿已保存，点击“应用到游戏”使改动生效。');
      return true;
    } catch (error) {
      draft = before;
      ({ type, selected, boardPage } = selectionBefore);
      renderBoard();
      status(error.message);
      return false;
    }
  }
  const input = (label, key, value, kind = 'text') =>
    `<label>${label}<input data-we-field="${key}" type="${kind}" value="${e(String(value ?? ''))}" ${kind === 'number' ? 'step="any" min="0"' : 'maxlength="300"'}></label>`;
  function recipe(label, key, value, refType = 'items', idOnly = false) {
    const available = draft[refType].filter(({ id }) => key !== 'stations' || id !== selected);
    return `<fieldset data-we-table="${key}" data-ref="${refType}" data-id-only="${idOnly}"><legend>${label}</legend>${Object.entries(
      value,
    )
      .map(
        ([id, n]) =>
          `<div class="we-recipe-row" data-id-only="${idOnly}"><select aria-label="${e(label || key)}条目">${available.map((entry) => `<option value="${e(entry.id)}" ${id === entry.id ? 'selected' : ''}>${e(entry.name)}</option>`).join('')}</select>${idOnly ? '' : `<input aria-label="${e(label || key)}数量" type="number" required min="1" max="1000000000000" value="${n}">`}<button type="button" data-we-remove-row aria-label="移除条目">×</button></div>`,
      )
      .join(
        '',
      )}<button type="button" data-we-row="${key}" ${available.length ? '' : 'disabled'}>＋ 添加条目</button></fieldset>`;
  }
  function filteredIcons() {
    const query = iconSearch.trim().toLowerCase();
    return WORKSHOP_ICONS.filter((item) => {
      if (iconGroup !== 'all' && item.group !== iconGroup) return false;
      if (!query) return true;
      return (
        item.id.toLowerCase().includes(query) ||
        item.name.toLowerCase().includes(query) ||
        item.tags.some((tag) => tag.toLowerCase().includes(query))
      );
    });
  }
  function renderIconGrid(activeIconId, activeTint) {
    const list = filteredIcons();
    if (!list.length) return '<p class="we-icon-empty">没有匹配的图标，换个关键词或分组试试。</p>';
    return list
      .map(
        (item) =>
          `<button type="button" class="we-icon-cell ${item.id === activeIconId ? 'selected' : ''}" data-we-pick-icon="${e(item.id)}" title="${e(item.name)}（${e(item.id)}）">${workshopIconSvg(item.id, activeTint)}<span>${e(item.name)}</span></button>`,
      )
      .join('');
  }
  function iconPicker(entry) {
    const { icon, tint } = workshopIconOf(type, entry);
    const tintInfo = WORKSHOP_TINTS[tint] || WORKSHOP_TINTS.gold;
    const groupOptions = [
      `<option value="all" ${iconGroup === 'all' ? 'selected' : ''}>全部图标（${WORKSHOP_ICONS.length}）</option>`,
      ...Object.entries(WORKSHOP_ICON_GROUPS).map(
        ([id, label]) =>
          `<option value="${e(id)}" ${iconGroup === id ? 'selected' : ''}>${e(label)}（${WORKSHOP_ICONS.filter((i) => i.group === id).length}）</option>`,
      ),
    ].join('');
    const swatches = Object.entries(WORKSHOP_TINTS)
      .map(
        ([id, info]) =>
          `<button type="button" class="we-tint-swatch ${id === tint ? 'selected' : ''}" data-we-pick-tint="${e(id)}" title="${e(info.name)}（${e(id)}）" style="--swatch:${info.colors[1]};--swatch-l:${info.colors[0]}"><span>${e(info.name)}</span></button>`,
      )
      .join('');
    return `<details class="we-icon-picker"><summary>图标与色调</summary>
      <input type="hidden" data-we-field="icon" value="${e(icon.id)}">
      <input type="hidden" data-we-field="tint" value="${e(tint)}">
      <div class="we-icon-current">
        <span class="we-icon-preview" data-we-icon-preview>${workshopIconSvg(icon.id, tint)}</span>
        <div>
          <strong data-we-icon-label>${e(icon.name)} · ${e(tintInfo.name)}色</strong>
          <small data-we-icon-code>${e(icon.id)} / ${e(tint)} · 点击下方色调或图标即可选用</small>
        </div>
        <button type="button" data-we-auto-icon>按名称推荐</button>
      </div>
      <div class="we-tint-bar" role="group" aria-label="图标色调">${swatches}</div>
      <div class="we-icon-filter">
        <select data-we-icon-group aria-label="图标分组">${groupOptions}</select>
        <input type="search" data-we-icon-search aria-label="搜索图标" placeholder="搜名称或标签：晶、瓶、齿轮、炉…" value="${e(iconSearch)}">
      </div>
      <div class="we-icon-grid" data-we-icon-grid></div>
    </details>`;
  }
  function applyIconSelection(nextIconId, nextTintId) {
    const entry = draft[type]?.find((item) => item.id === selected);
    if (!entry) return;
    const currentChoice = workshopIconOf(type, entry);
    const icon = WORKSHOP_ICON_MAP.get(nextIconId) || currentChoice.icon;
    const tint = Object.hasOwn(WORKSHOP_TINTS, nextTintId ?? '') ? nextTintId : currentChoice.tint;
    const tintInfo = WORKSHOP_TINTS[tint] || WORKSHOP_TINTS.gold;
    entry.icon = icon.id;
    entry.tint = tint;
    stash();
    const iconField = fields.querySelector('[data-we-field="icon"]');
    const tintField = fields.querySelector('[data-we-field="tint"]');
    if (iconField) iconField.value = icon.id;
    if (tintField) tintField.value = tint;
    const preview = fields.querySelector('[data-we-icon-preview]');
    if (preview) preview.innerHTML = workshopIconSvg(icon.id, tint);
    const titleIcon = fields.querySelector('h2 .ws-icon');
    if (titleIcon) titleIcon.outerHTML = workshopIconSvg(icon.id, tint, 'ws-title-icon');
    const label = fields.querySelector('[data-we-icon-label]');
    if (label) label.textContent = `${icon.name} · ${tintInfo.name}色`;
    const code = fields.querySelector('[data-we-icon-code]');
    if (code) code.textContent = `${icon.id} / ${tint} · 点击下方色调或图标即可选用`;
    for (const swatch of fields.querySelectorAll('[data-we-pick-tint]'))
      swatch.classList.toggle('selected', swatch.dataset.wePickTint === tint);
    const grid = fields.querySelector('[data-we-icon-grid]');
    if (grid) {
      const scrollTop = grid.scrollTop;
      grid.innerHTML = renderIconGrid(icon.id, tint);
      grid.scrollTop = scrollTop;
    }
    const listIcon = dialog.querySelector(`.we-list [data-we-select="${selected}"] .ws-icon`);
    if (listIcon) listIcon.outerHTML = workshopEntryIcon(type, entry);
    const nodeIcon = map.querySelector(
      `[data-we-key="${workshopNodeKey(type, selected)}"] .ws-icon`,
    );
    if (nodeIcon) nodeIcon.outerHTML = workshopEntryIcon(type, entry);
    status(`已选用图标「${icon.name}（${tintInfo.name}色）」，可继续编辑或点击“应用到游戏”。`);
  }
  function pageForBoard() {
    return type === 'research' ? 'research' : boardPage;
  }
  function paintViewport() {
    const minX = Math.min(0, map.clientWidth - boardSize.width * zoom);
    const minY = Math.min(0, map.clientHeight - boardSize.height * zoom);
    pan.x = Math.max(minX, Math.min(0, pan.x));
    pan.y = Math.max(minY, Math.min(0, pan.y));
    graph.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;
    if (!map.querySelector('.we-sheet')) return;
    const { column, row } = workshopCell({ x: -pan.x / zoom, y: -pan.y / zoom });
    mapPosition.textContent = `列 ${column + 1} · 行 ${row + 1}　${Math.round(zoom * 100)}%`;
    paintRuler(
      columnsRuler,
      pan.x + WORKSHOP_TILE.x * zoom,
      WORKSHOP_TILE.width * zoom,
      map.clientWidth,
      'left',
    );
    paintRuler(
      rowsRuler,
      pan.y + WORKSHOP_TILE.y * zoom,
      WORKSHOP_TILE.height * zoom,
      map.clientHeight,
      'top',
    );
  }
  function paintRuler(element, start, size, span, edge) {
    const step = size < 38 ? 5 : 1;
    const first = Math.max(0, Math.floor(-start / size / step) * step);
    const ticks = [];
    for (let index = first; start + index * size < span; index += step) {
      const position = start + (index + 0.5) * size;
      if (position >= 22 && position <= span - 10)
        ticks.push(`<span style="${edge}:${position}px">${index + 1}</span>`);
    }
    element.innerHTML = ticks.join('');
  }
  function renderBoard() {
    if (!['items', 'stations', 'research'].includes(type)) {
      boardNodes = [];
      layout = new Map();
      graph.style.transform = '';
      mapPosition.textContent = '';
      columnsRuler.replaceChildren();
      rowsRuler.replaceChildren();
      return;
    }
    boardNodes = workshopBoardNodes(draft, pageForBoard());
    layout = workshopLayout(boardNodes);
    const { width, height, x, y } = WORKSHOP_TILE;
    boardSize = {
      width: Math.min(
        x + WORKSHOP_BOARD.maxColumns * width,
        Math.max(
          x + WORKSHOP_BOARD.columns * width,
          ...[...layout.values()].map((p) => p.x + 5 * width),
        ),
      ),
      height: Math.min(
        y + WORKSHOP_BOARD.maxRows * height,
        Math.max(
          y + WORKSHOP_BOARD.rows * height,
          ...[...layout.values()].map((p) => p.y + 5 * height),
        ),
      ),
    };
    const edges = workshopEdges(boardNodes).filter(
      ([from, to]) => layout.has(from) && layout.has(to),
    );
    const highlighted = new Set();
    if (traced) {
      for (const direction of [0, 1]) {
        const reached = new Set([traced]);
        const pending = [traced];
        for (const key of pending) {
          for (const edge of edges) {
            if (edge[direction] !== key) continue;
            highlighted.add(edge);
            const next = edge[1 - direction];
            if (!reached.has(next)) {
              reached.add(next);
              pending.push(next);
            }
          }
        }
      }
    }
    const wires = edges
      .map((edge) => {
        const [from, to] = edge;
        return `<path class="${highlighted.has(edge) ? 'we-flow' : ''}" data-we-from="${from}" data-we-to="${to}" d="${workshopWire(layout.get(from), layout.get(to))}"/>`;
      })
      .join('');
    graph.innerHTML = `<div class="we-sheet" style="width:${boardSize.width}px;height:${boardSize.height}px;--cell-w:${width}px;--cell-h:${height}px;--grid-x:${x}px;--grid-y:${y}px"><svg class="ws-connections" ${showWires ? '' : 'hidden'} width="${boardSize.width}" height="${boardSize.height}" aria-hidden="true">${wires}</svg>${boardNodes
      .map(({ type: kind, entry, key }) => {
        const p = layout.get(key);
        const active = key === workshopNodeKey(type, selected) || selection.has(key);
        const note =
          kind === 'items'
            ? entry.seconds + ' 秒'
            : kind === 'stations'
              ? '生产设施'
              : entry.costs.length + ' 级研修';
        return `<button class="we-node ${active ? 'selected' : ''}" data-we-node="${entry.id}" data-we-key="${key}" data-we-kind="${kind}" style="left:${p.x}px;top:${p.y}px">${workshopEntryIcon(kind, entry)}<strong>${e(entry.name)}</strong><span>${note}</span></button>`;
      })
      .join('')}</div>`;
    paintViewport();
  }
  function placementsForPage(catalog, page) {
    const nodes = workshopBoardNodes(catalog, page);
    const positions = workshopLayout(nodes);
    for (const { key, entry } of nodes) entry.position = positions.get(key);
  }
  function render() {
    dialog.querySelector('[data-we-type]').value = type;
    dialog.querySelector('[data-we-undo]').disabled = !past.length;
    dialog.querySelector('[data-we-redo]').disabled = !future.length;
    for (const key of ['add', 'copy', 'delete'])
      dialog.querySelector(`[data-we-${key}]`).disabled = ![
        'items',
        'stations',
        'research',
      ].includes(type);
    for (const key of ['trace', 'arrange', 'batch'])
      dialog.querySelector(`[data-we-${key}]`).disabled = true;
    const pagePicker = dialog.querySelector('[data-we-page]');
    const pages = [{ id: 'production', name: '生产' }, ...draft.pages];
    if (!pages.some((page) => page.id === boardPage)) boardPage = 'production';
    pagePicker.hidden = !['items', 'stations'].includes(type);
    pagePicker.innerHTML = pages
      .map(({ id, name }) => `<option value="${id}">${e(name)}</option>`)
      .join('');
    pagePicker.value = boardPage;
    if (type === 'pages') {
      dialog.querySelector('.we-list').innerHTML = '<p>固定分页：生产、研修、物资簿。</p>';
      dialog.querySelector('.we-graph').replaceChildren();
      renderBoard();
      fields.innerHTML = `<h2>工坊分页</h2>${workshopRuleGroups(draft, type, null, recipe)}<button class="ws-primary" type="submit">保存分页</button>`;
      return;
    }
    if (type === 'core') {
      dialog.querySelector('.we-list').innerHTML =
        '<h3>炉心升级</h3><p>材料、金币、以太、速率加成、奖励物资和解锁项均可逐级设置。</p>';
      dialog.querySelector('.we-graph').innerHTML = draft.core
        .map(
          (step, index) =>
            `<div class="we-core-card"><small>炉心 ${index + 1}</small><h3>生产 +${step.production}%</h3><p>手作额外 +${step.manual}%</p></div>`,
        )
        .join('');
      renderBoard();
      fields.innerHTML = `<h2>炉心升级</h2>${workshopRuleGroups(draft, type, null, recipe)}<button class="ws-primary" type="submit">保存升级表</button>`;
      return;
    }
    const entries = draft[type];
    if (
      !entries.some(
        (entry) => entry.id === selected && (type === 'research' || entry.page === boardPage),
      )
    )
      selected = entries.find((entry) => type === 'research' || entry.page === boardPage)?.id || '';
    const matches = entries.filter(
      (entry) =>
        (type === 'research' || entry.page === boardPage || search) &&
        `${entry.name} ${entry.id}`.toLowerCase().includes(search),
    );
    dialog.querySelector('[data-we-batch]').disabled =
      type !== 'stations' || !selectedEntries().length;
    for (const key of ['trace', 'arrange'])
      dialog.querySelector(`[data-we-${key}]`).disabled = !selected;
    dialog.querySelector('.we-list').innerHTML = entries
      .filter((entry) => matches.includes(entry))
      .map(
        (entry) =>
          `<button data-we-select="${e(entry.id)}" aria-pressed="${entry.id === selected}">${workshopEntryIcon(type, entry)}<div><span>${e(entry.name)}</span><small>${e(entry.id)}</small></div></button>`,
      )
      .join('');
    renderBoard();
    const entry = entries.find(
      (item) => item.id === selected && (type === 'research' || item.page === boardPage),
    );
    if (!entry) {
      fields.innerHTML = '<p>点击新增创建条目。</p>';
      return;
    }
    const position = layout.get(workshopNodeKey(type, selected));
    const cell = position && workshopCell(position);
    let body =
      input('稳定 ID（引用不会自动改名）', 'id', entry.id) +
      input('显示名称', 'name', entry.name) +
      (cell
        ? `<div class="we-pair">${input('列', 'column', cell.column + 1, 'number')}${input('行', 'row', cell.row + 1, 'number')}</div>`
        : '') +
      iconPicker(entry);
    if (type !== 'research')
      body += `<label>显示分页<select data-we-field="page">${[{ id: 'production', name: '生产' }, ...draft.pages].map((page) => `<option value="${e(page.id)}" ${entry.page === page.id ? 'selected' : ''}>${e(page.name)}</option>`).join('')}</select></label>`;
    if (type === 'items')
      body +=
        input('制作秒数', 'seconds', entry.seconds, 'number') +
        input('交付单价（金币）', 'value', entry.value, 'number') +
        input('说明', 'description', entry.description) +
        recipe('配方原料', 'inputs', entry.inputs);
    if (type === 'stations')
      body +=
        input('建造金币', 'price', entry.price, 'number') +
        input('建造以太', 'ether', entry.ether, 'number') +
        input('设施生产周期（秒，0 为各产物单独计时）', 'cycle', entry.cycle || 0, 'number') +
        input('逐产物周期覆盖（秒，0 沿用配方）', 'period', entry.period || 0, 'number') +
        recipe('整轮投入', 'inputs', entry.inputs || {}) +
        input('开局已有设施', 'initial', entry.initial, 'number') +
        input('数量上限', 'max', entry.max, 'number') +
        input('线性涨价比例', 'multiplier', entry.multiplier, 'number') +
        input('转为指数涨价的数量', 'exponentialAt', entry.exponentialAt, 'number') +
        input('指数涨价倍数', 'exponential', entry.exponential, 'number') +
        recipe('建造材料', 'materials', entry.materials) +
        recipe('每座每周期产出', 'outputs', entry.outputs);
    if (type === 'research') body += input('说明', 'description', entry.description);
    body += workshopRuleGroups(draft, type, entry, recipe);
    fields.innerHTML = `<h2>${workshopEntryIcon(type, entry, 'ws-title-icon')}${e(entry.name)}</h2>${body}<button class="ws-primary" type="submit">保存节点</button>`;
  }
  function readFields() {
    const values = {};
    for (const field of fields.querySelectorAll('[data-we-field]'))
      values[field.dataset.weField] = field.type === 'number' ? Number(field.value) : field.value;
    for (const table of fields.querySelectorAll('[data-we-table]')) {
      if (table.closest('.we-rule-panel, [data-rule-row]')) continue;
      values[table.dataset.weTable] = readQuantities(fields, table.dataset.weTable);
    }
    return {
      ...values,
      ...readWorkshopRules(
        fields,
        type,
        draft[type]?.find((entry) => entry.id === selected),
        readQuantities,
      ),
    };
  }
  function formValues() {
    if (!fields.querySelector('button[type="submit"]')) return null;
    const invalid = fields.querySelector(':invalid');
    if (invalid) {
      for (
        let parent = invalid.parentElement;
        parent && parent !== fields;
        parent = parent.parentElement
      )
        if (parent.tagName === 'DETAILS') parent.open = true;
      invalid.reportValidity();
      throw Error('请检查检查器中标出的字段');
    }
    return readFields();
  }
  function readQuantities(parent, key) {
    const table = parent.querySelector(`[data-we-table="${key}"]`);
    const pairs = [...table.querySelectorAll('.we-recipe-row')].map((row) => [
      row.querySelector('select').value,
      row.querySelector('input')?.valueAsNumber ?? 1,
    ]);
    if (new Set(pairs.map(([id]) => id)).size !== pairs.length)
      throw Error('同一数量表存在重复条目');
    return Object.fromEntries(pairs);
  }
  function freshId(prefix) {
    let n = 1;
    while (
      draft.items
        .concat(draft.stations, draft.research)
        .some((entry) => entry.id === prefix + '-' + n)
    )
      n++;
    return prefix + '-' + n;
  }
  function normalizedDraft() {
    const catalog = validateWorkshopCatalog(draft);
    for (const page of ['production', 'research', ...catalog.pages.map(({ id }) => id)])
      placementsForPage(catalog, page);
    return catalog;
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(normalizedDraft(), null, 2)], { type: 'application/json' }),
    );
    const link = globalThis.document.createElement('a');
    link.href = url;
    link.download = '星隙工坊-配置.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  function focusNode(id) {
    const position = layout.get(workshopNodeKey(type, id));
    if (!position) return;
    pan = {
      x: map.clientWidth / 2 - (position.x + WORKSHOP_TILE.width / 2) * zoom,
      y: map.clientHeight / 2 - (position.y + WORKSHOP_TILE.height / 2) * zoom,
    };
    paintViewport();
  }
  function selectedEntries() {
    return (draft[type] || []).filter((entry) =>
      selection.size ? selection.has(workshopNodeKey(type, entry.id)) : entry.id === selected,
    );
  }
  function selectBoardNode(nextType, id) {
    type = nextType;
    selected = id;
    if (type !== 'research')
      boardPage = draft[type].find((entry) => entry.id === id)?.page || 'production';
  }
  function savePositions(moves) {
    placementsForPage(draft, pageForBoard());
    for (const { type: kind, id, position } of moves) {
      draft[kind].find((entry) => entry.id === id).position = position;
    }
  }
  function showRelated() {
    const entry = draft[type]?.find((item) => item.id === selected);
    if (!entry) return;
    const categories = ['items', 'stations', 'research'];
    const upstream = new Set([
      ...Object.keys(entry.inputs || {}),
      ...Object.keys(entry.materials || {}),
      ...Object.keys(entry.requires || {}),
      ...(entry.stations || []),
      ...(entry.station ? [entry.station] : []),
    ]);
    const downstream = new Set(workshopReferences(draft, type, selected));
    const buttons = (match) =>
      categories
        .flatMap((category) =>
          draft[category]
            .filter(match)
            .map(
              (node) =>
                `<button type="button" data-we-jump="${node.id}" data-we-category="${category}">${e(node.name)}</button>`,
            ),
        )
        .join('') || '<p>没有关联节点</p>';
    fields.innerHTML = `<h2>${e(entry.name)}</h2><h3>前置与投入</h3><div class="we-related">${buttons((node) => upstream.has(node.id))}</div><h3>产出与引用</h3><div class="we-related">${buttons((node) => downstream.has(node.name) || Object.hasOwn(entry.outputs || {}, node.id))}</div>`;
  }
  function arrangeEntries() {
    const group = selection.size ? boardNodes.filter(({ key }) => selection.has(key)) : boardNodes;
    if (!group.length) return;
    const points = group.map(({ key }) => workshopCell(layout.get(key)));
    const column = Math.min(...points.map((p) => p.column));
    const row = Math.min(...points.map((p) => p.row));
    const keys = new Set(group.map(({ key }) => key));
    const occupied = new Set(
      [...layout]
        .filter(([key]) => !keys.has(key))
        .map(([, position]) => workshopCellKey(position)),
    );
    const mode = dialog.querySelector('[data-we-arrange-mode]').value;
    const columns =
      mode === 'row' ? group.length : mode === 'column' ? 1 : Math.ceil(Math.sqrt(group.length));
    let offset = 0;
    const moves = group.map(({ type, entry }) => {
      let position;
      do {
        position = workshopPosition(
          column + (offset % columns),
          row + Math.floor(offset / columns),
        );
        offset++;
      } while (occupied.has(workshopCellKey(position)));
      return { type, id: entry.id, position };
    });
    savePositions(moves);
  }
  function showBatch() {
    const entries = selectedEntries();
    fields.innerHTML = `<h2>批量修改 ${entries.length} 种设施</h2><p>${entries.map(({ name }) => e(name)).join('、')}</p>
      ${[
        ['price', '建造金币'],
        ['ether', '建造以太'],
        ['cycle', '生产周期'],
        ['max', '数量上限'],
        ['multiplier', '涨价比例'],
      ]
        .map(
          ([key, label]) =>
            `<label>${label}<input type="number" min="0" step="any" data-we-batch-field="${key}" placeholder="留空保留原值"></label>`,
        )
        .join(
          '',
        )}<button type="button" class="ws-primary" data-we-save-batch>保存批量修改</button>`;
  }
  function showChain() {
    const source = type === 'items' ? selected : '';
    const page = boardPage;
    fields.innerHTML = `<h2>快捷产线</h2>
      <label>首段原料<select data-we-chain-input><option value="">无原料</option>${draft.items
        .map(
          ({ id, name }) =>
            `<option value="${id}" ${id === source ? 'selected' : ''}>${e(name)}</option>`,
        )
        .join('')}</select></label>
      <label>产物名称（每行一段，最多八段）<textarea data-we-chain-names rows="5"></textarea></label>
      <label>设施名称后缀<input data-we-chain-suffix value="作坊"></label>
      <div class="we-pair">
        <label>每段投入<input data-we-chain-amount type="number" min="1" value="1"></label>
        <label>每座产出<input data-we-chain-output type="number" min="1" value="1"></label>
        <label>周期秒数<input data-we-chain-seconds type="number" min="0.5" step="any" value="5"></label>
        <label>建造金币<input data-we-chain-gold type="number" min="0" value="3"></label>
        <label>建造以太<input data-we-chain-ether type="number" min="0" value="0"></label>
        <label>蓝图分页<select data-we-chain-page>${[
          { id: 'production', name: '生产' },
          ...draft.pages,
        ]
          .map(
            ({ id, name }) =>
              `<option value="${id}" ${id === page ? 'selected' : ''}>${e(name)}</option>`,
          )
          .join('')}</select></label>
      </div>
      <output data-we-chain-preview></output>
      <button type="button" data-we-create-chain class="ws-primary">生成到画布</button>`;
    updateChainPreview();
  }
  function saveInspector() {
    const values = formValues();
    if (!values) return;
    if (type === 'core') draft.core = values.core;
    else if (type === 'pages') {
      draft.pages = values.pages;
      const pages = new Set(['production', ...draft.pages.map((page) => page.id)]);
      for (const entry of [...draft.items, ...draft.stations])
        if (!pages.has(entry.page)) entry.page = 'production';
    } else {
      const { column, row, ...updates } = values;
      if (values.id !== selected && workshopReferences(draft, type, selected).length)
        throw Error('该ID已被引用，请保留ID，只改显示名称');
      const targetPage = type === 'research' ? 'research' : values.page;
      const key = workshopNodeKey(type, selected);
      if (column != null && row != null) {
        if (!Number.isInteger(column) || !Number.isInteger(row) || column < 1 || row < 1)
          throw Error('行列须填写从 1 开始的整数');
        const target = workshopPosition(column - 1, row - 1);
        const positions = workshopLayout(workshopBoardNodes(draft, targetPage));
        if (
          [...positions].some(
            ([other, p]) => other !== key && workshopCellKey(p) === workshopCellKey(target),
          )
        )
          throw Error('该格已有节点');
        const previous = layout.get(key);
        if (
          targetPage !== pageForBoard() ||
          workshopCellKey(target) !== workshopCellKey(previous)
        ) {
          placementsForPage(draft, targetPage);
          updates.position = target;
        }
      }
      Object.assign(
        draft[type].find((entry) => entry.id === selected),
        updates,
      );
      selected = values.id;
      if (targetPage !== 'research') boardPage = targetPage;
    }
  }
  function chainInput() {
    const input = (key) => fields.querySelector(`[data-we-chain-${key}]`);
    return {
      names: input('names')
        .value.split(/\n|，|,/)
        .map((name) => name.trim())
        .filter(Boolean),
      source: input('input').value,
      suffix: input('suffix').value.trim(),
      amount: input('amount').valueAsNumber,
      output: input('output').valueAsNumber,
      seconds: input('seconds').valueAsNumber,
      gold: input('gold').valueAsNumber,
      ether: input('ether').valueAsNumber,
      page: input('page').value,
    };
  }
  function updateChainPreview() {
    const { names, source, suffix, amount, output, seconds } = chainInput();
    const start = draft.items.find((item) => item.id === source)?.name;
    fields.querySelector('[data-we-chain-preview]').innerHTML = names
      .slice(0, 8)
      .map((name, index) => {
        const previous = names[index - 1] || start;
        return `<p>${previous ? e(previous) + ' × ' + amount : '直接采集'} → ${e(name)} × ${output} · ${seconds} 秒<br>${e(name + suffix)}</p>`;
      })
      .join('');
  }
  function addChain() {
    const model = chainInput();
    const { names, suffix, amount, output, seconds, gold, ether, page } = model;
    if (!names.length || names.length > 8) throw Error('请输入 1～8 个产物名称');
    if (![amount, output].every((n) => Number.isInteger(n) && n > 0))
      throw Error('投入与产出须为正整数');
    if (
      !Number.isFinite(seconds) ||
      seconds < 0.5 ||
      ![gold, ether].every((n) => Number.isFinite(n) && n >= 0)
    )
      throw Error('请输入有效的周期与造价');
    placementsForPage(draft, page);
    const old = workshopBoardNodes(draft, page);
    const row = Math.max(-1, ...old.map(({ entry }) => workshopCell(entry.position).row)) + 1;
    let previous = model.source;
    names.forEach((name, column) => {
      const inputs = previous ? { [previous]: amount } : {};
      const item = {
        ...structuredClone(WORKSHOP_CATALOG.items[0]),
        ...suggestWorkshopIcon('items', name, draft.items.length),
        id: freshId('material'),
        name,
        page,
        inputs,
        seconds,
        value: 1,
        description: '',
        position: workshopPosition(column, row),
      };
      item.visibility.mode = previous ? 'base_materials' : 'always';
      draft.items.push(item);
      const stationName = name + suffix;
      draft.stations.push({
        ...structuredClone(WORKSHOP_CATALOG.stations[0]),
        ...suggestWorkshopIcon('stations', stationName, draft.stations.length),
        id: freshId('facility'),
        name: stationName,
        page,
        inputs,
        cycle: seconds,
        price: gold,
        ether,
        materials: {},
        outputs: { [item.id]: output },
        position: workshopPosition(column, row + 1),
        visibility: { ...item.visibility },
      });
      previous = item.id;
    });
    selectBoardNode('items', previous);
    selection.clear();
  }
  function applyPreset(preset) {
    if (preset === 'speed') {
      for (const station of draft.stations) {
        if (station.cycle) station.cycle = 1;
        else station.period = 1;
      }
      return;
    }
    const essence = preset === 'essence';
    const name = essence ? '精酿原液' : '晶化机芯';
    const inputs = essence ? { stardust: 1 } : { 'malt-extract': 1, fitting: 1 };
    const item = {
      ...structuredClone(WORKSHOP_CATALOG.items[0]),
      ...suggestWorkshopIcon('items', name, draft.items.length),
      id: freshId('material'),
      name,
      inputs,
      page: boardPage,
      position: null,
      seconds: essence ? 1 : 3,
      description: '',
    };
    for (const id of Object.keys(inputs)) {
      if (!draft.items.some((entry) => entry.id === id)) throw Error('缺少预设使用的基础物资');
    }
    item.visibility.mode = 'base_materials';
    draft.items.push(item);
    const stationName = name + (essence ? '泉台' : '锻台');
    draft.stations.push({
      ...structuredClone(WORKSHOP_CATALOG.stations[0]),
      ...suggestWorkshopIcon('stations', stationName, draft.stations.length),
      id: freshId('facility'),
      name: stationName,
      page: boardPage,
      position: null,
      cycle: item.seconds,
      inputs,
      materials: {},
      max: 50,
      price: essence ? 1 : 100,
      outputs: { [item.id]: essence ? 10 : 5 },
      visibility: { ...item.visibility, items: inputs },
    });
    selectBoardNode('items', item.id);
    selection.clear();
  }
  events.on(fields, 'submit', (event) => {
    event.preventDefault();
    edit(saveInspector);
  });
  events.on(fields, 'input', (event) => {
    if (fields.querySelector('[data-we-chain-preview]')) updateChainPreview();
    if (event.target.hasAttribute('data-we-icon-search')) {
      iconSearch = event.target.value;
      const iconId = fields.querySelector('[data-we-field="icon"]')?.value;
      const tintId = fields.querySelector('[data-we-field="tint"]')?.value;
      const grid = fields.querySelector('[data-we-icon-grid]');
      if (grid) grid.innerHTML = renderIconGrid(iconId, tintId);
    }
  });
  events.on(
    fields,
    'toggle',
    (event) => {
      if (!event.target.matches('.we-icon-picker') || !event.target.open) return;
      const grid = event.target.querySelector('[data-we-icon-grid]');
      if (!grid.childElementCount) {
        grid.innerHTML = renderIconGrid(
          fields.querySelector('[data-we-field="icon"]').value,
          fields.querySelector('[data-we-field="tint"]').value,
        );
      }
    },
    true,
  );
  events.on(dialog.querySelector('[data-we-search]'), 'input', (event) => {
    search = event.target.value.trim().toLowerCase();
    render();
  });
  events.on(dialog, 'change', async (event) => {
    changeWorkshopRule(event.target, draft);
    if (event.target.hasAttribute('data-we-preset') && event.target.value) {
      const preset = event.target.value;
      event.target.value = '';
      edit(() => applyPreset(preset));
      if (preset !== 'speed') focusNode(selected);
    }
    if (event.target.hasAttribute('data-we-type')) {
      type = event.target.value;
      selection.clear();
      traced = '';
      selected = '';
      render();
      focusNode(selected);
    }
    if (event.target.hasAttribute('data-we-page')) {
      boardPage = event.target.value;
      selection.clear();
      selected = draft[type].find((entry) => entry.page === boardPage)?.id || '';
      render();
      focusNode(selected);
    }
    if (event.target.hasAttribute('data-we-icon-group')) {
      iconGroup = event.target.value;
      const iconId = fields.querySelector('[data-we-field="icon"]')?.value;
      const tintId = fields.querySelector('[data-we-field="tint"]')?.value;
      const grid = fields.querySelector('[data-we-icon-grid]');
      if (grid) grid.innerHTML = renderIconGrid(iconId, tintId);
    }
    if (event.target.hasAttribute('data-we-file')) {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        if (file.size > 2e6) throw Error('配置文件超过2MB');
        const value = JSON.parse(await file.text());
        if (busy) return;
        edit(() => {
          draft = validateWorkshopCatalog(value);
        });
      } catch (error) {
        status(error.message);
      }
      event.target.value = '';
    }
  });
  events.on(dialog, 'click', async (event) => {
    const button = event.target.closest('button');
    if (!button || busy) return;
    if (button.dataset.weSelect) {
      selectBoardNode(type, button.dataset.weSelect);
      selection.clear();
      render();
      focusNode(selected);
    }
    if (button.dataset.weJump) {
      selectBoardNode(button.dataset.weCategory, button.dataset.weJump);
      selection.clear();
      render();
      focusNode(selected);
    }
    if (button.dataset.weKey && event.detail === 0) {
      selectBoardNode(button.dataset.weKind, button.dataset.weNode);
      selection.clear();
      render();
    }
    if (button.hasAttribute('data-we-map-only')) {
      const expanded = dialog.classList.toggle('we-full-map');
      button.setAttribute('aria-pressed', String(expanded));
      button.textContent = expanded ? '显示面板' : '展开画布';
      paintViewport();
    }
    if (button.hasAttribute('data-we-trace')) {
      traced = traced === workshopNodeKey(type, selected) ? '' : workshopNodeKey(type, selected);
      if (traced) {
        showWires = true;
        dialog.querySelector('[data-we-wires]').setAttribute('aria-pressed', 'true');
        showRelated();
        renderBoard();
      } else render();
    }
    if (button.hasAttribute('data-we-wires')) {
      showWires = !showWires;
      button.setAttribute('aria-pressed', String(showWires));
      renderBoard();
    }
    if (button.hasAttribute('data-we-arrange')) edit(arrangeEntries);
    if (button.hasAttribute('data-we-batch')) showBatch();
    if (button.hasAttribute('data-we-save-batch'))
      edit(() => {
        for (const input of fields.querySelectorAll('[data-we-batch-field]')) {
          if (input.value === '') continue;
          for (const entry of selectedEntries())
            entry[input.dataset.weBatchField] = input.valueAsNumber;
        }
      });
    if (button.dataset.wePickIcon) {
      const tintId = fields.querySelector('[data-we-field="tint"]')?.value;
      applyIconSelection(button.dataset.wePickIcon, tintId);
    }
    if (button.dataset.wePickTint) {
      const iconId = fields.querySelector('[data-we-field="icon"]')?.value;
      applyIconSelection(iconId, button.dataset.wePickTint);
    }
    if (button.hasAttribute('data-we-auto-icon')) {
      const nameValue = fields.querySelector('[data-we-field="name"]')?.value || '';
      const suggested = suggestWorkshopIcon(type, nameValue, draft[type]?.length || 0);
      applyIconSelection(suggested.icon, suggested.tint);
    }
    if (button.hasAttribute('data-we-undo') && past.length) {
      future.push(draft);
      draft = past.pop();
      stash();
      render();
    }
    if (button.hasAttribute('data-we-redo') && future.length) {
      past.push(draft);
      draft = future.pop();
      stash();
      render();
    }
    if (button.hasAttribute('data-we-import')) dialog.querySelector('[data-we-file]').click();
    if (button.hasAttribute('data-we-export') && edit(saveInspector)) download();
    if (button.hasAttribute('data-we-preview')) {
      if (!edit(saveInspector)) return;
      preview.querySelector('textarea').value = JSON.stringify(normalizedDraft(), null, 2);
      preview.showModal();
    }
    if (button.hasAttribute('data-we-reset'))
      edit(() => {
        draft = structuredClone(WORKSHOP_CATALOG);
      });
    if (button.hasAttribute('data-we-read')) {
      busy = true;
      button.disabled = true;
      try {
        current = await readLocalWorkshopCatalog();
        busy = false;
        edit(() => {
          draft = validateWorkshopCatalog(current.catalog);
        });
        status('已重读游戏正在使用的工坊配置。');
      } catch (error) {
        status(error.message);
      } finally {
        busy = false;
        button.disabled = false;
      }
    }
    if (button.hasAttribute('data-we-apply')) {
      if (!edit(saveInspector)) return;
      busy = true;
      button.disabled = true;
      try {
        current = await writeLocalWorkshopCatalog(normalizedDraft(), current.revision);
        status('已写入游戏配置。下次打开星隙工坊时生效。');
      } catch (error) {
        status(error.message);
      } finally {
        busy = false;
        button.disabled = false;
      }
    }
    if (button.hasAttribute('data-we-add') || button.hasAttribute('data-we-copy'))
      edit(() => {
        const source = button.hasAttribute('data-we-copy')
          ? draft[type].find((entry) => entry.id === selected)
          : WORKSHOP_CATALOG[type][0];
        const entry = structuredClone(source);
        entry.id = freshId(
          type === 'items' ? 'material' : type === 'stations' ? 'facility' : 'research',
        );
        entry.name = button.hasAttribute('data-we-copy')
          ? source.name + ' 副本'
          : '新' + { items: '物资', stations: '设施', research: '研修' }[type];
        entry.position = null;
        if (type !== 'research') entry.page = boardPage;
        if (button.hasAttribute('data-we-add')) {
          Object.assign(entry, suggestWorkshopIcon(type, entry.name, draft[type].length));
          if (type === 'items') {
            entry.inputs = {};
            entry.visibility.mode = 'always';
          }
        }
        draft[type].push(entry);
        selected = entry.id;
      });
    if (button.hasAttribute('data-we-delete'))
      edit(() => {
        const references = workshopReferences(draft, type, selected);
        if (references.length) throw Error('不能删除，仍被引用：' + references.join('、'));
        draft[type] = draft[type].filter((entry) => entry.id !== selected);
      });
    if (button.hasAttribute('data-we-remove-row')) button.closest('.we-recipe-row').remove();
    editWorkshopRule(button, draft, recipe);
    if (button.dataset.weRow) {
      const table = button.closest('fieldset');
      const used = new Set(
        [...table.querySelectorAll('.we-recipe-row select')].map((field) => field.value),
      );
      const first = draft[table.dataset.ref].find(
        ({ id }) => !used.has(id) && (table.dataset.weTable !== 'stations' || id !== selected),
      );
      if (!first) {
        status('先创建可引用的条目');
        return;
      }
      const container = globalThis.document.createElement('div');
      container.innerHTML = recipe(
        table.querySelector('legend').textContent,
        table.dataset.weTable,
        { [first.id]: 1 },
        table.dataset.ref,
        table.dataset.idOnly === 'true',
      );
      table.insertBefore(container.querySelector('.we-recipe-row'), button);
    }
    if (button.hasAttribute('data-we-chain')) showChain();
    if (button.hasAttribute('data-we-create-chain')) {
      edit(addChain);
      focusNode(selected);
    }
  });
  events.on(map, 'pointerdown', (event) => {
    const node = event.target.closest('[data-we-node]');
    if (busy || !map.querySelector('.we-sheet') || drag) return;
    if (!node || event.button !== 0) {
      if (event.shiftKey && event.button === 0) {
        selection.clear();
        const rectangle = globalThis.document.createElement('div');
        rectangle.className = 'we-marquee';
        dialog.append(rectangle);
        drag = { x: event.clientX, y: event.clientY, rectangle, pointer: event.pointerId };
        map.setPointerCapture(event.pointerId);
        event.preventDefault();
        return;
      }
      drag = {
        x: event.clientX,
        y: event.clientY,
        pan: { ...pan },
        pointer: event.pointerId,
      };
      map.setPointerCapture(event.pointerId);
      map.classList.add('panning');
      event.preventDefault();
      return;
    }
    const previous = workshopNodeKey(type, selected);
    const { weKey: key, weNode: id, weKind: kind } = node.dataset;
    selectBoardNode(kind, id);
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      if (!selection.size && layout.has(previous) && previous !== key) selection.add(previous);
      if (selection.has(key)) selection.delete(key);
      else selection.add(key);
      const first = boardNodes.find((item) => selection.has(item.key));
      if (!selection.has(key) && first) selectBoardNode(first.type, first.entry.id);
      render();
      return;
    }
    if (!selection.has(key)) selection.clear();
    const group = [...map.querySelectorAll('[data-we-node]')]
      .filter((tile) => tile === node || selection.has(tile.dataset.weKey))
      .map((tile) => ({
        node: tile,
        key: tile.dataset.weKey,
        type: tile.dataset.weKind,
        id: tile.dataset.weNode,
        original: layout.get(tile.dataset.weKey),
      }));
    const keys = new Set(group.map((tile) => tile.key));
    drag = {
      group,
      occupied: new Set(
        [...layout]
          .filter(([key]) => !keys.has(key))
          .map(([, position]) => workshopCellKey(position)),
      ),
      wires: [...map.querySelectorAll('[data-we-from]')].filter(
        (wire) => keys.has(wire.dataset.weFrom) || keys.has(wire.dataset.weTo),
      ),
      x: event.clientX,
      y: event.clientY,
      pointer: event.pointerId,
      dx: 0,
      dy: 0,
      valid: true,
    };
    map.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  events.on(map, 'pointermove', (event) => {
    if (drag?.pointer !== event.pointerId) return;
    const x = event.clientX - drag.x,
      y = event.clientY - drag.y;
    if (drag.rectangle) {
      Object.assign(drag.rectangle.style, {
        left: Math.min(drag.x, event.clientX) + 'px',
        top: Math.min(drag.y, event.clientY) + 'px',
        width: Math.abs(x) + 'px',
        height: Math.abs(y) + 'px',
      });
      return;
    }
    if (!drag.group) {
      pan = { x: drag.pan.x + x, y: drag.pan.y + y };
      paintViewport();
      return;
    }
    const { width, height } = WORKSHOP_TILE;
    const dx = Math.round(x / zoom / width) * width;
    const dy = Math.round(y / zoom / height) * height;
    if (dx === drag.dx && dy === drag.dy) return;
    drag.dx = dx;
    drag.dy = dy;
    const positions = new Map(
      drag.group.map(({ key, original }) => [key, { x: original.x + dx, y: original.y + dy }]),
    );
    drag.valid = [...positions.values()].every(
      (position) =>
        position.x >= WORKSHOP_TILE.x &&
        position.y >= WORKSHOP_TILE.y &&
        position.x + width <= boardSize.width &&
        position.y + height <= boardSize.height &&
        !drag.occupied.has(workshopCellKey(position)),
    );
    for (const { node, key } of drag.group) {
      const position = positions.get(key);
      node.style.left = position.x + 'px';
      node.style.top = position.y + 'px';
      node.classList.toggle('invalid-cell', !drag.valid);
    }
    for (const wire of drag.wires) {
      const { weFrom, weTo } = wire.dataset;
      wire.setAttribute(
        'd',
        workshopWire(
          positions.get(weFrom) || layout.get(weFrom),
          positions.get(weTo) || layout.get(weTo),
        ),
      );
    }
  });
  events.on(map, 'pointerup', (event) => {
    if (drag?.pointer !== event.pointerId) return;
    const record = drag;
    drag = null;
    map.classList.remove('panning');
    if (record.rectangle) {
      const box = record.rectangle.getBoundingClientRect();
      const viewport = map.getBoundingClientRect();
      for (const node of map.querySelectorAll('[data-we-node]')) {
        const tile = node.getBoundingClientRect();
        if (
          Math.min(box.right, viewport.right) > tile.left &&
          Math.max(box.left, viewport.left) < tile.right &&
          Math.min(box.bottom, viewport.bottom) > tile.top &&
          Math.max(box.top, viewport.top) < tile.bottom
        )
          selection.add(node.dataset.weKey);
      }
      record.rectangle.remove();
      const first = boardNodes.find((item) => selection.has(item.key));
      if (first) selectBoardNode(first.type, first.entry.id);
      render();
      return;
    }
    if (!record.group) return;
    if (!record.valid) {
      render();
      status('目标格被占用或超出画布。');
    } else if (record.dx || record.dy) {
      edit(() =>
        savePositions(
          record.group.map(({ type, id, original }) => ({
            type,
            id,
            position: { x: original.x + record.dx, y: original.y + record.dy },
          })),
        ),
      );
    } else render();
  });
  events.on(map, 'pointercancel', (event) => {
    if (drag?.pointer !== event.pointerId) return;
    drag?.rectangle?.remove();
    drag = null;
    map.classList.remove('panning');
    render();
  });
  events.on(map, 'contextmenu', (event) => {
    if (map.querySelector('.we-sheet')) event.preventDefault();
  });
  events.on(dialog, 'keydown', (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.target.matches('input, textarea, select'))
      return;
    const key = event.key.toLowerCase();
    if (!['y', 'z'].includes(key)) return;
    event.preventDefault();
    dialog
      .querySelector(key === 'y' || event.shiftKey ? '[data-we-redo]' : '[data-we-undo]')
      .click();
  });
  events.on(
    map,
    'wheel',
    (event) => {
      if (!map.querySelector('.we-sheet') || drag) return;
      event.preventDefault();
      const before = zoom;
      zoom = Math.min(2, Math.max(0.12, zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12)));
      const bounds = map.getBoundingClientRect();
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;
      pan = {
        x: x - ((x - pan.x) * zoom) / before,
        y: y - ((y - pan.y) * zoom) / before,
      };
      paintViewport();
    },
    { passive: false },
  );
  events.on(dialog.querySelector('[data-we-reset-view]'), 'click', () => {
    zoom = 1;
    pan = { x: 0, y: 0 };
    if (layout.has(workshopNodeKey(type, selected))) focusNode(selected);
    else paintViewport();
  });
  events.on(map, 'keydown', (event) => {
    if (event.target !== map || !layout.size) return;
    const direction = {
      ArrowLeft: [1, 0],
      ArrowRight: [-1, 0],
      ArrowUp: [0, 1],
      ArrowDown: [0, -1],
    }[event.key];
    if (!direction) return;
    event.preventDefault();
    pan.x += direction[0] * WORKSHOP_TILE.width * zoom;
    pan.y += direction[1] * WORKSHOP_TILE.height * zoom;
    paintViewport();
  });
  events.on(globalThis, 'resize', () => {
    if (layout.size) paintViewport();
  });
  try {
    const saved = globalThis.localStorage.getItem(WORKSHOP_DRAFT_KEY);
    if (saved) draft = validateWorkshopCatalog(JSON.parse(saved));
  } catch {
    /* The local draft can be discarded without affecting the game catalog. */
  }
  render();
  focusNode(selected);
  status('已读取游戏配置。拖空白平移 · 滚轮缩放 · Shift 框选');
}

const editor = globalThis.document.getElementById('workshop-editor');
readLocalWorkshopCatalog()
  .then((current) => createWorkshopEditor(editor, current))
  .catch((failure) => {
    editor.querySelector('[role="status"]').textContent = failure.message;
  });
