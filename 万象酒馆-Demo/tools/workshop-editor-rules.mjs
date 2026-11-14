import { WORKSHOP_VISIBILITY } from '../src/workshop/catalog.js';
import { escapeText as e } from '../src/ui.js';

const LOGIC = [
  ['and', '全部满足（且）'],
  ['or', '任一满足（或）'],
];
const TARGETS = [
  ['item', '物资'],
  ['station', '设施'],
];
const MODIFIERS = [
  ['none', '无'],
  ['add', '逐级相加'],
  ['mul', '逐级相乘'],
  ['pow', '乘方'],
];
const COMPOSITE = ['always', 'passive', 'base_materials', 'research', 'core_level'];
const captions = {
  prices: '添加指定造价',
  costs: '添加研修等级',
  effects: '添加加成目标',
  unlocks: '添加解锁目标',
  core: '添加炉心等级',
  pages: '添加分页',
};

function choices(options, selected) {
  return options
    .map(
      ([value, name]) =>
        `<option value="${e(value)}" ${value === selected ? 'selected' : ''}>${e(name)}</option>`,
    )
    .join('');
}

function select(label, field, options, value) {
  return `<label>${label}<select data-rule-value="${field}">${choices(options, value)}</select></label>`;
}

function number(label, field, value, min = 0, optional = false) {
  return `<label>${label}<input data-rule-value="${field}" type="number" min="${min}" step="any" ${optional ? '' : 'required'} value="${value ?? ''}"></label>`;
}

function check(label, field, value, checked) {
  return `<label class="we-check"><input type="checkbox" data-rule-check="${field}" value="${e(value)}" ${checked ? 'checked' : ''}>${e(label)}</label>`;
}

function names(entries) {
  return entries.map(({ id, name }) => [id, name]);
}

function targets(catalog, type) {
  return names(type === 'station' ? catalog.stations : catalog.items);
}

function disclosure(title, body, open = false) {
  return `<details class="we-rule-panel" ${open ? 'open' : ''}><summary>${title}</summary>${body}</details>`;
}

function ruleList(kind, rows, catalog, recipe) {
  return `<div data-rule-list="${kind}">${rows.map((row) => ruleRow(kind, row, catalog, recipe)).join('')}
    <button type="button" data-rule-add="${kind}">＋ ${captions[kind]}</button></div>`;
}

function priceFields(cost, recipe) {
  return `<div class="we-pair">${number('金币（留空沿用）', 'gold', cost?.gold, 0, true)}
    ${number('以太（留空沿用）', 'ether', cost?.ether, 0, true)}</div>
    ${check('指定建材', 'hasMaterials', 'yes', Boolean(cost?.materials))}
    ${recipe('建造材料', 'materials', cost?.materials || {})}`;
}

function modifier(label, key, raw) {
  const value = raw || { mode: 'none', growth: 0, levels: {} };
  const rows = Object.entries(value.levels)
    .map(([level, amount]) => overrideRow(level, amount))
    .join('');
  return `<fieldset data-rule-modifier="${key}"><legend>${label}</legend><div class="we-pair">
    ${select('计算方式', 'mode', MODIFIERS, value.mode)}
    ${number('每级数值', 'growth', value.growth)}</div>
    <div data-rule-overrides>${rows}<button type="button" data-rule-add-override>＋ 指定某级数值</button></div></fieldset>`;
}

function overrideRow(level, amount) {
  return `<div class="we-pair" data-rule-override>${number('等级', 'level', level, 1)}
    ${number('生效数值', 'amount', amount)}<button type="button" data-rule-remove-override>移除此等级</button></div>`;
}

function ruleRow(kind, row, catalog, recipe) {
  let body;
  if (kind === 'prices') {
    body = number('现有设施数量', 'owned', row.owned) + priceFields(row, recipe);
  } else if (kind === 'costs') {
    body = recipe('研修所需物资', 'cost', row);
  } else if (kind === 'core') {
    body = `<div class="we-pair">${number('消耗金币', 'price', row.price)}${number('消耗以太', 'ether', row.ether || 0)}
      ${number('生产加成 %', 'production', row.production)}${number('手作额外加成 %', 'manual', row.manual)}
      ${number('奖励金币', 'goldReward', row.goldReward || 0)}${number('奖励以太', 'etherReward', row.etherReward || 0)}</div>
      ${recipe('升级材料', 'materials', row.materials)}${recipe('奖励物资', 'items', row.items)}
      ${recipe('解锁物资', 'unlocks', Object.fromEntries(row.unlocks.map((id) => [id, 1])), 'items', true)}`;
  } else if (kind === 'pages') {
    body = `<label>分页 ID<input data-rule-value="id" required value="${e(row.id)}"></label>
      <label>分页名称<input data-rule-value="name" required value="${e(row.name)}"></label>`;
  } else {
    body = `<div class="we-pair">${select('目标类别', 'type', TARGETS, row.type)}
      ${select('目标名称', 'id', targets(catalog, row.type), row.id)}</div>`;
    body +=
      kind === 'unlocks'
        ? number('解锁等级', 'level', row.level, 1)
        : modifier('产速加成 %', 'speed', row.speed) +
          modifier('每座并行份数', 'parallel', row.parallel);
  }
  return `<section class="we-rule-row" data-rule-row="${kind}">${body}
    <button type="button" data-rule-remove>移除</button></section>`;
}

export function workshopRuleGroups(catalog, type, entry, recipe) {
  if (type === 'core' || type === 'pages') return ruleList(type, catalog[type], catalog, recipe);
  if (type === 'research') {
    return (
      disclosure(
        '研修前置',
        select('条件逻辑', 'researchLogic', LOGIC, entry.logic) +
          select(
            '需要设施',
            'researchStation',
            [['', '无'], ...names(catalog.stations)],
            entry.station,
          ) +
          recipe('前置研修', 'requires', entry.requires, 'research'),
        true,
      ) +
      disclosure('逐级费用', ruleList('costs', entry.costs, catalog, recipe)) +
      disclosure('逐级解锁物资与设施', ruleList('unlocks', entry.unlocks, catalog, recipe), true) +
      disclosure('产速与并行加成', ruleList('effects', entry.effects, catalog, recipe))
    );
  }
  const v = entry.visibility;
  const station = type === 'stations';
  const linked = catalog.research.flatMap((tech) =>
    tech.unlocks
      .filter((rule) => rule.type === (station ? 'station' : 'item') && rule.id === entry.id)
      .map(
        ({ level }) =>
          `<button type="button" data-we-jump="${tech.id}" data-we-category="research">${e(tech.name)} Lv.${level}</button>`,
      ),
  );
  const unlock = station
    ? disclosure(
        '设施解锁与前置',
        `
    ${check('建造前须发现所有基础建材', 'materialPrerequisite', 'yes', entry.materialPrerequisite)}
    ${recipe('前置设施（必须全部建成）', 'stations', Object.fromEntries(entry.stations.map((id) => [id, 1])), 'stations', true)}
    ${recipe('解锁所需研修', 'requires', entry.requires, 'research')}
    ${linked.length ? `<p>研修解锁来源</p><div class="we-related">${linked.join('')}</div>` : ''}`,
        true,
      )
    : '';
  const visible = disclosure(
    '可见性规则',
    `
    ${select('显示方式', 'visibilityMode', Object.entries(WORKSHOP_VISIBILITY), v.mode)}
    ${select('条件逻辑（含研修解锁）', 'visibilityLogic', LOGIC, v.logic)}
    ${check('发现后永久可见', 'permanent', 'yes', v.permanent)}
    <div data-rule-when="composite" ${v.mode === 'composite' ? '' : 'hidden'}>
      ${COMPOSITE.map((mode) =>
        check(
          WORKSHOP_VISIBILITY[mode],
          'visibilityRules',
          mode,
          (v.rules.length ? v.rules : ['base_materials', 'core_level']).includes(mode),
        ),
      ).join('')}
    </div>
    <div data-rule-when="base_materials composite" ${['base_materials', 'composite'].includes(v.mode) ? '' : 'hidden'}>
      ${recipe('可见性材料（留空采用基础原料或建材）', 'visibleItems', v.items)}
    </div>
    <div data-rule-when="research composite" ${['research', 'composite'].includes(v.mode) ? '' : 'hidden'}>
      ${recipe('可见性研修', 'visibleResearch', v.research, 'research')}
    </div>
    <div data-rule-when="core_level composite" ${['core_level', 'composite'].includes(v.mode) ? '' : 'hidden'}>
      ${number('炉心等级', 'visibilityCore', v.core)}
    </div>`,
    true,
  );
  if (!station) return visible;
  const prices = Object.entries(entry.construction).map(([owned, cost]) => ({ owned, ...cost }));
  return (
    unlock +
    visible +
    disclosure(
      '增建与指定造价',
      `<section class="we-rule-row" data-rule-row="repeat">${priceFields(entry.repeat, recipe)}</section>` +
        ruleList('prices', prices, catalog, recipe),
    )
  );
}

function field(parent, name) {
  return parent.querySelector(`[data-rule-value="${name}"]`);
}

function checked(parent, name) {
  return [...parent.querySelectorAll(`[data-rule-check="${name}"]:checked`)].map(
    ({ value }) => value,
  );
}

function recordList(form, name) {
  return [...form.querySelectorAll(`[data-rule-row="${name}"]`)];
}

function readPrice(row, quantities) {
  const cost = {};
  for (const key of ['gold', 'ether'])
    if (field(row, key).value !== '') cost[key] = field(row, key).valueAsNumber;
  if (checked(row, 'hasMaterials').length) cost.materials = quantities(row, 'materials');
  return cost;
}

function uniqueMap(entries, message) {
  const result = Object.fromEntries(entries);
  if (Object.keys(result).length !== entries.length) throw Error(message);
  return result;
}

export function readWorkshopRules(form, type, entry, quantities) {
  const value = (name) => field(form, name).value;
  if (type === 'pages') {
    return {
      pages: recordList(form, 'pages').map((row) => ({
        id: field(row, 'id').value,
        name: field(row, 'name').value,
      })),
    };
  }
  if (type === 'core') {
    return {
      core: recordList(form, 'core').map((row) => ({
        ...Object.fromEntries(
          ['price', 'ether', 'production', 'manual', 'goldReward', 'etherReward'].map((name) => [
            name,
            field(row, name).valueAsNumber,
          ]),
        ),
        materials: quantities(row, 'materials'),
        items: quantities(row, 'items'),
        unlocks: Object.keys(quantities(row, 'unlocks')),
      })),
    };
  }
  if (type === 'research') {
    function readModifier(row, kind) {
      const group = row.querySelector(`[data-rule-modifier="${kind}"]`);
      return {
        mode: field(group, 'mode').value,
        growth: field(group, 'growth').valueAsNumber,
        levels: uniqueMap(
          [...group.querySelectorAll('[data-rule-override]')].map((row) => [
            field(row, 'level').valueAsNumber,
            field(row, 'amount').valueAsNumber,
          ]),
          '同一等级存在重复加成',
        ),
      };
    }
    return {
      station: value('researchStation'),
      logic: value('researchLogic'),
      requires: quantities(form, 'requires'),
      costs: recordList(form, 'costs').map((row) => quantities(row, 'cost')),
      unlocks: recordList(form, 'unlocks').map((row) => ({
        type: field(row, 'type').value,
        id: field(row, 'id').value,
        level: field(row, 'level').valueAsNumber,
      })),
      effects: recordList(form, 'effects').map((row) => ({
        type: field(row, 'type').value,
        id: field(row, 'id').value,
        speed: readModifier(row, 'speed'),
        parallel: readModifier(row, 'parallel'),
      })),
    };
  }
  const mode = value('visibilityMode');
  const rules = checked(form, 'visibilityRules');
  if (mode === 'composite' && !rules.length) throw Error('请勾选至少一项组合条件');
  const visibility = {
    ...entry.visibility,
    mode,
    logic: value('visibilityLogic'),
    permanent: checked(form, 'permanent').length > 0,
    items: quantities(form, 'visibleItems'),
    research: quantities(form, 'visibleResearch'),
    core: Number(value('visibilityCore')),
    rules: mode === 'composite' ? rules : entry.visibility.rules,
  };
  if (type === 'items') return { visibility };
  const repeat = readPrice(recordList(form, 'repeat')[0], quantities);
  return {
    visibility,
    materialPrerequisite: checked(form, 'materialPrerequisite').length > 0,
    stations: Object.keys(quantities(form, 'stations')),
    requires: quantities(form, 'requires'),
    repeat: Object.keys(repeat).length ? repeat : null,
    construction: uniqueMap(
      recordList(form, 'prices').map((row) => [
        field(row, 'owned').valueAsNumber,
        readPrice(row, quantities),
      ]),
      '同一拥有数量存在重复造价',
    ),
  };
}

export function changeWorkshopRule(control, catalog) {
  if (control.dataset.ruleValue === 'visibilityMode') {
    for (const group of control.closest('details').querySelectorAll('[data-rule-when]'))
      group.hidden = !group.dataset.ruleWhen.split(' ').includes(control.value);
  } else if (control.dataset.ruleValue === 'type' && control.closest('[data-rule-row]')) {
    field(control.closest('[data-rule-row]'), 'id').innerHTML = choices(
      targets(catalog, control.value),
    );
  }
}

export function editWorkshopRule(button, catalog, recipe) {
  if (button.hasAttribute('data-rule-remove')) button.closest('[data-rule-row]').remove();
  if (button.hasAttribute('data-rule-remove-override'))
    button.closest('[data-rule-override]').remove();
  if (button.hasAttribute('data-rule-add-override')) {
    const levels = [...button.parentElement.querySelectorAll('[data-rule-value="level"]')].map(
      (input) => input.valueAsNumber,
    );
    button.insertAdjacentHTML('beforebegin', overrideRow(Math.max(0, ...levels) + 1, 0));
  }
  const kind = button.dataset.ruleAdd;
  if (!kind) return;
  const previous = [...button.parentElement.querySelectorAll('[data-rule-value="owned"]')].map(
    (input) => input.valueAsNumber,
  );
  const defaults = {
    prices: { owned: previous.length ? Math.max(...previous) + 1 : 1 },
    costs: {},
    effects: { type: 'station', id: catalog.stations[0]?.id },
    unlocks: { type: 'station', id: catalog.stations[0]?.id, level: 1 },
    core: { price: 0, production: 0, manual: 0, materials: {}, items: {}, unlocks: [] },
    pages: { id: '', name: '' },
  };
  button.insertAdjacentHTML('beforebegin', ruleRow(kind, defaults[kind], catalog, recipe));
}
