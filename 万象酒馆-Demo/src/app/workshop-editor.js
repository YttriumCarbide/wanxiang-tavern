import { escapeText } from '../ui.js';
import { html } from '../shared/html.js';
import { createEventScope } from '../shared/events.js';
import { WORKSHOP_CATALOG } from '../content/workshop-catalog.js';
import {
  WORKSHOP_DRAFT_KEY,
  validateWorkshopCatalog,
  workshopReferences,
} from '../workshop/catalog.js';
import { workshopLayout, workshopEdges } from '../workshop/layout.js';

/** Local authoring tool. Drafts never alter the playable rules until Apply passes validation. */
export function createWorkshopEditor({
  context,
  getCatalog,
  applyCatalog,
  getState,
  changeState,
  advance,
}) {
  const e = escapeText,
    events = createEventScope();
  const dialog = document.createElement('dialog');
  dialog.id = 'workshop-editor';
  dialog.setAttribute('aria-label', '星隙工坊修改器');
  dialog.innerHTML = html`<header class="ws-header">
      <div class="ws-brand">
        <small>本地制作工具 · 独立草稿</small>
        <h1>工坊修改器</h1>
      </div>
      <div class="ws-header-actions">
        <button data-we-undo>撤销</button><button data-we-redo>重做</button
        ><button data-we-import>导入</button><button data-we-export>导出</button
        ><button data-we-apply class="ws-primary">应用到游戏</button
        ><button data-we-close>关闭</button>
      </div>
    </header>
    <div class="we-toolbar">
      <select data-we-type aria-label="编辑类别">
        <option value="items">物资与配方</option>
        <option value="stations">生产设施</option>
        <option value="research">工艺研修</option>
        <option value="core">炉心升级</option>
        <option value="progress">存档调试</option></select
      ><button data-we-add>新增</button><button data-we-copy>复制</button
      ><button data-we-delete>删除</button><button data-we-reset>恢复默认草稿</button
      ><span>拖动节点调整蓝图位置</span>
    </div>
    <div class="we-body">
      <aside class="we-list"></aside>
      <div class="we-map"><div class="we-graph"></div></div>
      <form class="we-fields" autocomplete="off"></form>
    </div>
    <footer class="ws-footer">
      <p data-we-status role="status">修改后先保存节点，再应用到游戏。草稿自动保存在此设备。</p>
      <button data-we-chain>批量创建产线</button>
    </footer>
    <input type="file" data-we-file accept="application/json,.json" hidden />`;
  document.body.append(dialog);
  let draft = null,
    type = 'items',
    selected = '',
    past = [],
    future = [],
    drag = null,
    disposed = false;
  const fields = dialog.querySelector('.we-fields'),
    map = dialog.querySelector('.we-map');
  function allowed() {
    return context.session.ai.generationOptions.developerMode === true;
  }
  function status(text) {
    dialog.querySelector('[data-we-status]').textContent = text;
  }
  function stash() {
    context.storage.setItem(WORKSHOP_DRAFT_KEY, JSON.stringify(draft));
    void context.storage.flush?.();
  }
  function edit(operation) {
    if (!allowed()) return;
    const before = structuredClone(draft);
    try {
      operation();
      draft = validateWorkshopCatalog(draft);
      past.push(before);
      if (past.length > 40) past.shift();
      future = [];
      stash();
      render();
      status('草稿已保存，点击“应用到游戏”使改动生效。');
    } catch (error) {
      draft = before;
      status(error.message);
    }
  }
  const input = (label, key, value, kind = 'text') =>
    `<label>${label}<input data-we-field="${key}" type="${kind}" value="${e(String(value ?? ''))}" ${kind === 'number' ? 'step="any" min="0"' : 'maxlength="300"'}></label>`;
  const json = (label, key, value) =>
    `<label>${label}<textarea data-we-field="${key}" data-json rows="4" spellcheck="false">${e(JSON.stringify(value, null, 2))}</textarea></label>`;
  function recipe(label, key, value, refType = 'items') {
    return `<fieldset data-we-table="${key}" data-ref="${refType}"><legend>${label}</legend>${Object.entries(
      value,
    )
      .map(
        ([id, n]) =>
          `<div class="we-recipe-row"><select aria-label="${label}条目">${draft[refType].map((entry) => `<option value="${e(entry.id)}" ${id === entry.id ? 'selected' : ''}>${e(entry.name)}</option>`).join('')}</select><input aria-label="${label}数量" type="number" min="1" max="1000000000000" value="${n}"><button type="button" data-we-remove-row>移除</button></div>`,
      )
      .join('')}<button type="button" data-we-row="${key}">添加条目</button></fieldset>`;
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
    if (type === 'progress') {
      dialog.querySelector('.we-list').innerHTML =
        '<h3>存档调试</h3><p>仅影响星隙工坊，不修改角色、金币、密钥或主线。</p>';
      dialog.querySelector('.we-graph').innerHTML =
        '<div class="we-debug-note"><small>制作与平衡测试</small><h2>让验证更直接。</h2><p>所有时间推进仍使用正式生产引擎。<br>关闭修改器后，正常生产继续运行。</p></div>';
      fields.innerHTML = html`<h2>进度调试</h2>
        <label
          >物资<select data-we-grant-id>
            ${draft.items.map((item) => `<option value="${e(item.id)}">${e(item.name)}</option>`).join('')}
          </select></label
        ><label
          >增加数量<input
            data-we-grant-number
            type="number"
            value="100"
            min="1"
            max="1000000000000" /></label
        ><button type="button" data-we-grant>给予物资</button
        ><label
          >工坊券<input data-we-coins type="number" min="0" value="${getState().coins}" /></label
        ><button type="button" data-we-set-coins>设置工坊券</button
        ><label
          >设施<select data-we-station>
            ${draft.stations.map((s) => `<option value="${e(s.id)}">${e(s.name)}</option>`).join('')}
          </select></label
        ><label>建造数量<input data-we-built type="number" value="1" min="0" max="1000" /></label
        ><button type="button" data-we-set-station>设置设施数量</button
        ><label
          >研修<select data-we-tech>
            ${draft.research.map((t) => `<option value="${e(t.id)}">${e(t.name)}</option>`).join('')}
          </select></label
        ><label>等级<input data-we-level type="number" min="0" value="1" /></label
        ><button type="button" data-we-set-tech>设置研修等级</button
        ><label
          >炉心等级<input
            data-we-core
            type="number"
            min="0"
            max="${draft.core.length}"
            value="${getState().core}" /></label
        ><button type="button" data-we-set-core>设置炉心等级</button
        ><label
          >推进秒数<input data-we-seconds type="number" value="60" min="1" max="28800" /></label
        ><button type="button" data-we-advance>推进生产</button
        ><button type="button" data-we-clear-progress>重置工坊进度</button>`;
      return;
    }
    if (type === 'core') {
      dialog.querySelector('.we-list').innerHTML =
        '<h3>炉心升级</h3><p>材料、工坊券、速率加成、奖励物资和解锁项均可逐级设置。</p>';
      dialog.querySelector('.we-graph').innerHTML = draft.core
        .map(
          (step, index) =>
            `<div class="we-core-card"><small>炉心 ${index + 1}</small><h3>生产 +${step.production}%</h3><p>手作额外 +${step.manual}%</p></div>`,
        )
        .join('');
      fields.innerHTML = `<h2>炉心升级表</h2>${json('按数组顺序升级（materials / price / production / manual / items / unlocks）', 'core', draft.core)}<button class="ws-primary" type="submit">保存升级表</button>`;
      return;
    }
    const entries = draft[type];
    if (!entries.some((entry) => entry.id === selected)) selected = entries[0]?.id || '';
    dialog.querySelector('.we-list').innerHTML = entries
      .map(
        (entry) =>
          `<button data-we-select="${e(entry.id)}" aria-pressed="${entry.id === selected}">${e(entry.name)}<small>${e(entry.id)}</small></button>`,
      )
      .join('');
    const layout =
      type === 'stations'
        ? new Map(
            entries.map((entry, index) => [
              entry.id,
              entry.position || { x: 32 + (index % 3) * 250, y: 30 + Math.floor(index / 3) * 160 },
            ]),
          )
        : workshopLayout(entries, type);
    const width = Math.max(850, ...[...layout.values()].map((p) => p.x + 250)),
      height = Math.max(600, ...[...layout.values()].map((p) => p.y + 170));
    const paths = type === 'stations' ? [] : workshopEdges(entries, layout, type);
    dialog.querySelector('.we-graph').innerHTML =
      `<div style="width:${width}px;height:${height}px" class="we-sheet"><svg class="ws-connections" width="${width}" height="${height}" aria-hidden="true">${paths.map((d) => `<path d="${d}"/>`).join('')}</svg>${entries
        .map((entry) => {
          const p = layout.get(entry.id);
          return `<button class="we-node ${entry.id === selected ? 'selected' : ''}" data-we-node="${e(entry.id)}" style="left:${p.x}px;top:${p.y}px"><small>${e(entry.id)}</small><strong>${e(entry.name)}</strong><span>${type === 'items' ? entry.seconds + ' 秒' : type === 'research' ? entry.costs.length + ' 级研修' : '自动生产设施'}</span></button>`;
        })
        .join('')}</div>`;
    const entry = entries.find((item) => item.id === selected);
    if (!entry) {
      fields.innerHTML = '<p>点击新增创建条目。</p>';
      return;
    }
    let body =
      input('稳定 ID（引用不会自动改名）', 'id', entry.id) + input('显示名称', 'name', entry.name);
    if (type === 'items')
      body +=
        input('制作秒数', 'seconds', entry.seconds, 'number') +
        input('交付单价（券）', 'value', entry.value, 'number') +
        input('说明', 'description', entry.description) +
        recipe('配方原料', 'inputs', entry.inputs) +
        json('显现规则', 'visibility', entry.visibility);
    if (type === 'stations')
      body +=
        input('建造工坊券', 'price', entry.price, 'number') +
        input('数量上限', 'max', entry.max, 'number') +
        input('线性涨价比例', 'multiplier', entry.multiplier, 'number') +
        input('转为指数涨价的数量', 'exponentialAt', entry.exponentialAt, 'number') +
        input('指数涨价倍数', 'exponential', entry.exponential, 'number') +
        recipe('建造材料', 'materials', entry.materials) +
        recipe('每座每周期产出', 'outputs', entry.outputs) +
        recipe('前置研修', 'requires', entry.requires, 'research') +
        json('前置设施 ID 数组', 'stations', entry.stations) +
        json('显现规则', 'visibility', entry.visibility);
    if (type === 'research')
      body +=
        input('说明', 'description', entry.description) +
        input('需要设施 ID（可为空）', 'station', entry.station) +
        recipe('前置研修', 'requires', entry.requires, 'research') +
        `<label>前置逻辑<select data-we-field="logic"><option ${entry.logic === 'and' ? 'selected' : ''}>and</option><option ${entry.logic === 'or' ? 'selected' : ''}>or</option></select></label>` +
        json('每级物资费用（数组）', 'costs', entry.costs) +
        json('效果：item/station，speed/parallel', 'effects', entry.effects) +
        json('解锁规则（type / id / level）', 'unlocks', entry.unlocks);
    fields.innerHTML = `<h2>${e(entry.name)}</h2>${body}<button class="ws-primary" type="submit">保存节点</button>`;
  }
  function readFields() {
    const values = {};
    for (const field of fields.querySelectorAll('[data-we-field]'))
      values[field.dataset.weField] = field.hasAttribute('data-json')
        ? JSON.parse(field.value)
        : field.type === 'number'
          ? Number(field.value)
          : field.value;
    for (const table of fields.querySelectorAll('[data-we-table]')) {
      const pairs = [...table.querySelectorAll('.we-recipe-row')].map((row) => [
        row.querySelector('select').value,
        Number(row.querySelector('input').value),
      ]);
      if (new Set(pairs.map(([id]) => id)).size !== pairs.length)
        throw Error('同一数量表存在重复条目');
      values[table.dataset.weTable] = Object.fromEntries(pairs);
    }
    return values;
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
  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = '星隙工坊-配置.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  events.on(fields, 'submit', (event) => {
    event.preventDefault();
    try {
      const values = readFields();
      edit(() => {
        if (type === 'core') draft.core = values.core;
        else {
          if (values.id !== selected && workshopReferences(draft, type, selected).length)
            throw Error('该ID已被引用，请保留ID，只改显示名称');
          Object.assign(
            draft[type].find((entry) => entry.id === selected),
            values,
          );
          selected = values.id;
        }
      });
    } catch (error) {
      status(error.message);
    }
  });
  events.on(dialog, 'change', async (event) => {
    if (event.target.hasAttribute('data-we-type')) {
      type = event.target.value;
      selected = '';
      render();
    }
    if (event.target.hasAttribute('data-we-file')) {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        if (file.size > 2e6) throw Error('配置文件超过2MB');
        const value = JSON.parse(await file.text());
        if (disposed || !allowed()) return;
        edit(() => {
          draft = validateWorkshopCatalog(value);
        });
      } catch (error) {
        status(error.message);
      }
      event.target.value = '';
    }
  });
  events.on(dialog, 'click', (event) => {
    if (!allowed()) {
      dialog.close();
      return;
    }
    const button = event.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-we-close')) dialog.close();
    if (button.dataset.weSelect) {
      selected = button.dataset.weSelect;
      render();
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
    if (button.hasAttribute('data-we-export')) download();
    if (button.hasAttribute('data-we-reset'))
      edit(() => {
        draft = structuredClone(WORKSHOP_CATALOG);
      });
    if (button.hasAttribute('data-we-apply')) {
      try {
        applyCatalog(validateWorkshopCatalog(draft));
        status('已应用到游戏并持久保存；正在进行的生产保留合法进度。');
      } catch (error) {
        status(error.message);
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
        if (button.hasAttribute('data-we-add') && type === 'items') {
          entry.inputs = {};
          entry.visibility.mode = 'always';
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
    if (button.dataset.weRow) {
      const table = button.closest('fieldset');
      const first = draft[table.dataset.ref][0];
      if (!first) {
        status('先创建可引用的条目');
        return;
      }
      const container = document.createElement('div');
      container.innerHTML = recipe('', table.dataset.weTable, { [first.id]: 1 }, table.dataset.ref);
      table.insertBefore(container.querySelector('.we-recipe-row'), button);
    }
    if (button.hasAttribute('data-we-chain')) {
      fields.innerHTML =
        '<h2>批量创建产线</h2><p>按先后顺序输入1～8个物资名，后一级消耗前一级，设施可随后单独创建。</p><label>物资名称（每行一个）<textarea data-we-chain-names rows="9"></textarea></label><button type="button" data-we-create-chain class="ws-primary">创建产线草稿</button>';
    }
    if (button.hasAttribute('data-we-create-chain'))
      edit(() => {
        const names = fields
          .querySelector('[data-we-chain-names]')
          .value.split(/\n|，|,/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (!names.length || names.length > 8) throw Error('请输入1～8个名称');
        let previous = '';
        for (const name of names) {
          const entry = structuredClone(WORKSHOP_CATALOG.items[0]);
          entry.id = freshId('material');
          entry.name = name;
          entry.inputs = previous ? { [previous]: 1 } : {};
          entry.seconds = previous ? 5 : 3;
          entry.description = '星隙工坊自制产线物资。';
          entry.value = 1;
          entry.visibility.mode = previous ? 'base_materials' : 'always';
          draft.items.push(entry);
          previous = entry.id;
        }
        type = 'items';
        selected = previous;
      });
    if (type !== 'progress') return;
    const read = (key) => fields.querySelector(`[data-we-${key}]`).value;
    try {
      const state = getState();
      if (button.hasAttribute('data-we-grant')) {
        const id = read('grant-id');
        changeState({
          items: { ...state.items, [id]: (state.items[id] || 0) + Number(read('grant-number')) },
        });
      }
      if (button.hasAttribute('data-we-set-coins')) changeState({ coins: Number(read('coins')) });
      if (button.hasAttribute('data-we-set-core')) changeState({ core: Number(read('core')) });
      if (button.hasAttribute('data-we-set-station')) {
        const id = read('station'),
          n = Number(read('built'));
        changeState({ stations: { ...state.stations, [id]: { count: n, active: n, jobs: {} } } });
      }
      if (button.hasAttribute('data-we-set-tech'))
        changeState({ research: { ...state.research, [read('tech')]: Number(read('level')) } });
      if (button.hasAttribute('data-we-advance'))
        advance(Math.max(0, Math.min(28800, Number(read('seconds')) || 0)));
      if (button.hasAttribute('data-we-clear-progress'))
        changeState({
          items: {},
          known: [],
          discovered: [],
          stations: {},
          research: {},
          manual: {},
          core: 0,
          coins: 0,
          delivered: 0,
        });
      status('调试操作已执行并保存。');
    } catch (error) {
      status(error.message);
    }
  });
  events.on(map, 'pointerdown', (event) => {
    const node = event.target.closest('[data-we-node]');
    if (!node || event.button !== 0 || !allowed()) return;
    selected = node.dataset.weNode;
    drag = {
      id: selected,
      node,
      x: event.clientX,
      y: event.clientY,
      left: parseFloat(node.style.left),
      top: parseFloat(node.style.top),
      moved: false,
    };
    map.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  events.on(map, 'pointermove', (event) => {
    if (!drag) return;
    const x = event.clientX - drag.x,
      y = event.clientY - drag.y;
    if (Math.abs(x) + Math.abs(y) > 4) drag.moved = true;
    drag.node.style.left = Math.max(0, drag.left + x) + 'px';
    drag.node.style.top = Math.max(0, drag.top + y) + 'px';
  });
  events.on(map, 'pointerup', () => {
    if (!drag) return;
    const record = drag;
    drag = null;
    if (record.moved)
      edit(() => {
        draft[type].find((entry) => entry.id === record.id).position = {
          x: parseFloat(record.node.style.left),
          y: parseFloat(record.node.style.top),
        };
      });
    else render();
  });
  events.on(map, 'pointercancel', () => {
    drag = null;
    render();
  });
  return {
    open() {
      if (!allowed() || disposed) return;
      draft = structuredClone(getCatalog());
      try {
        const saved = context.storage.getItem(WORKSHOP_DRAFT_KEY);
        if (saved) draft = validateWorkshopCatalog(JSON.parse(saved));
      } catch {
        /* Keep the valid live catalog when a draft is damaged. */
      }
      past = [];
      future = [];
      render();
      if (!dialog.open) dialog.showModal();
    },
    dispose() {
      disposed = true;
      events.dispose();
      dialog.remove();
    },
  };
}
