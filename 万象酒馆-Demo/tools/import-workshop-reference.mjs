import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Read only registered resources. Source scripts, pictures and player saves are not imported.
const itemNames = [
  ['sand', 'stardust', '星尘'],
  ['dew', 'spring-water', '净泉'],
  ['grain', 'barley', '麦粒'],
  ['essence', 'malt-extract', '麦芽精华'],
  ['blank', 'fitting', '铜木构件'],
  ['notes', 'brewing-notes', '调酿手记'],
  ['pattern', 'blueprint', '工坊蓝图'],
  ['pivot', 'clockwork-heart', '工坊机芯'],
  ['raw_fire_spirit_ore', 'ember-charcoal', '余温炭'],
  ['raw_water_spirit_ore', 'moon-sand', '清辉晶砂'],
  ['raw_wood_spirit_ore', 'scented-chips', '酿香木屑'],
  ['raw_gold_spirit_ore', 'brass-grit', '黄铜矿粒'],
  ['raw_earth_spirit_ore', 'kiln-clay', '窑泥'],
  ['refined_fire_spirit_ore', 'hearth-brick', '温炉芯砖'],
  ['refined_water_spirit_ore', 'filter-crystal', '滤泉晶片'],
  ['refined_wood_spirit_ore', 'scented-wood', '香木条'],
  ['refined_gold_spirit_ore', 'brass-ingot', '黄铜锭'],
  ['refined_earth_spirit_ore', 'fireproof-tile', '耐火陶片'],
  ['spirit_polymer', 'sealant', '封桶胶'],
  ['forging_catalyst', 'flux', '助熔粉'],
  ['free_spirit_particle', 'loose-spark', '散逸星火'],
  ['item_diy_mu5az6du8p4', 'bottled-spark', '束缚星火'],
  ['item_diy_mu5bqebromp', 'oak-shoot', '香木嫩枝'],
  ['item_diy_mu5brhk9wu2', 'rich-soil', '沃酿土'],
  ['item_diy_mu5btdyj3e2', 'aged-oak', '陈酿橡木'],
  ['item_diy_mu5buhl29k7', 'oak-pipe', '铜木导管'],
  ['item_diy_mu5bvjwgtga', 'echo-heart', '回响机芯'],
  ['item_diy_mu5twjmhmtb', 'mist-crystal', '雾蓝原晶'],
  ['item_diy_mu5tzc2mbvq', 'clarifier', '澄清液'],
  ['item_diy_mu5u77acz73', 'tasting-crystal', '醒味晶'],
  ['item_mu5u8atb8l8', 'thermal-crystal', '稳温晶'],
  ['item_mu5u948m5d9', 'amber-stone', '酒光原石'],
  ['item_diy_mu5uigh2357', 'condensed-dew', '凝露滴'],
  ['item_diy_mu5uigxq48p', 'clay-crystal', '陶土结晶'],
  ['item_diy_mu5ul3czuo1', 'aroma-extract', '析香液'],
  ['item_diy_mu5uvpz507o', 'rough-amber', '粗酿琥珀'],
  ['item_diy_mu5uxndpmip', 'aging-starter', '陈酿引子'],
  ['item_diy_mu5v0ixtu32', 'wine-amber', '酒光琥珀'],
  ['item_diy_mu5v175lv4p', 'amber-purifier', '琥珀净化液'],
  ['item_diy_mu5v35tpr4z', 'clear-amber', '澄辉琥珀'],
  ['item_diy_mu5v41mlci3', 'amber-conduit', '琥珀导流管'],
  ['item_diy_mu5v51di9vq', 'spark-regulator', '星火限流环'],
  ['item_diy_mu5v5vg7wux', 'perpetual-heart', '星隙恒动芯'],
];
const stationNames = [
  ['core', 'collector', '星尘收集台'],
  ['spring', 'well', '净泉井'],
  ['field', 'barley-bed', '麦圃'],
  ['garden', 'malthouse', '麦芽坊'],
  ['forge', 'fitting-bench', '构件台'],
  ['study', 'brewing-desk', '调酿桌'],
  ['archive', 'drawing-desk', '绘图台'],
  ['ward', 'heart-bench', '机芯装配台'],
  ['wuxing_quarry', 'material-mine', '异材采集站'],
  ['smelter', 'refinery', '精炼炉'],
  ['polymerization_plant', 'sealant-house', '封桶胶坊'],
  ['refining_lab', 'flux-bench', '助熔工台'],
  ['spirit_gathering_net', 'spark-net', '星火捕集网'],
  ['station_diy_mu5bscmxmdf', 'soil-vat', '堆酿池'],
  ['station_diy_mu5nked0oam', 'nursery', '枝芽温床'],
  ['station_diy_mu5notgmg4k', 'oak-shop', '橡木作坊'],
  ['station_diy_mu5nrlke7sf', 'pipe-mill', '导管轧机'],
  ['station_diy_mu5ns2zyqaf', 'echo-assembler', '回响装配架'],
  ['station_diy_mu5tox0jlau', 'spark-bottler', '星火封装台'],
  ['station_diy_mu5txvn0ltq', 'mist-well', '雾晶井'],
  ['station_diy_mu5u16igrpn', 'clarifier-vat', '澄清釜'],
  ['station_diy_mu5ua5jlm3f', 'crystal-sorter', '晶砂分选台'],
  ['station_diy_mu5unyun44m', 'aroma-mixer', '析香调配台'],
  ['station_diy_mu5us8p19zy', 'dew-extractor', '凝晶萃取台'],
  ['station_diy_mu5uu7kgcml', 'amber-extractor', '琥珀萃取台'],
];
const researchNames = [
  '净泉流速',
  '麦圃育种',
  '麦芽精酿',
  '构件工艺',
  '调酿入门',
  '蓝图绘制',
  '机芯并装',
  '星尘采集',
  '星火捕集',
  '封桶工艺',
  '助熔提炼',
  '异材精炼',
  '多程封装',
  '异材开采',
  '沃土堆酿',
  '枝芽培育',
  '橡木养护',
  '导管轧制',
  '回响组装',
  '星火封存',
  '澄清反应',
  '晶砂分选',
  '醒味调校',
  '稳温调校',
  '酒光调校',
  '析香调配',
];

export function resourceFields(text) {
  const body = text.slice(text.lastIndexOf('[resource]') + 10);
  const matches = [...body.matchAll(/^(\w+)\s*=\s*/gm)];
  return Object.fromEntries(
    matches.map((match, index) => {
      let value = body
        .slice(match.index + match[0].length, matches[index + 1]?.index ?? body.length)
        .trim();
      if (/^Array\[Dictionary\]\(/.test(value)) value = value.slice(value.indexOf('(') + 1, -1);
      if (/^Packed\w+Array\(/.test(value))
        value = '[' + value.slice(value.indexOf('(') + 1, -1) + ']';
      try {
        value = JSON.parse(value);
      } catch {
        // Three source records contain orphaned duplicate dictionary lines. Read the
        // complete first dictionary; never import the broken tail as a string.
        if (value.startsWith('{')) {
          const end = value.indexOf('\n');
          if (end > 0) value = JSON.parse(value.slice(0, end));
        }
      }
      return [match[1], value];
    }),
  );
}

export async function importWorkshopReference(root) {
  const text = await readFile(path.join(root, 'data/config/cave/洞府目录.tres'), 'utf8');
  const references = new Map(
    [...text.matchAll(/\[ext_resource[^\n]*path="res:\/\/([^"]+)"[^\n]*id="([^"]+)"/g)].map(
      (match) => [match[2], match[1]],
    ),
  );
  async function registered(kind) {
    const line = text.match(new RegExp('^' + kind + ' = (.*)$', 'm'))?.[1] || '';
    const files = [...line.matchAll(/ExtResource\("([^"]+)"\)/g)]
      .map((match) => references.get(match[1]))
      .filter((file) => file?.includes('/' + kind + '/'));
    return Promise.all(
      files.map(async (file) => resourceFields(await readFile(path.join(root, file), 'utf8'))),
    );
  }
  const [items, stations, research] = await Promise.all(
    ['items', 'stations', 'research'].map(registered),
  );
  if (
    items.length !== itemNames.length ||
    stations.length !== stationNames.length ||
    research.length !== researchNames.length
  )
    throw Error('参考注册表已变化，请核对完整命名映射');
  const itemMap = new Map(itemNames.map(([id, next]) => [id, next]));
  const stationMap = new Map(stationNames.map(([id, next]) => [id, next]));
  const researchMap = new Map(
    research.map((entry, index) => [
      entry.research_id,
      'tech-' + String(index + 1).padStart(2, '0'),
    ]),
  );
  const rename = (value, map) => {
    if (!map.has(value)) throw Error('没有对应名称：' + value);
    return map.get(value);
  };
  const quantities = (value = {}, map = itemMap) =>
    Object.fromEntries(Object.entries(value).map(([id, count]) => [rename(id, map), count]));
  function visibility(entry) {
    return {
      mode: entry.visibility_mode || 'always',
      logic: entry.visibility_logic || 'and',
      permanent: entry.unlock_permanently !== false,
      items: quantities(entry.visibility_items),
      research: quantities(entry.visibility_research, researchMap),
      core: entry.visibility_core_level || 0,
      rules: (entry.composite_rules || []).map((rule) => ({
        ...rule,
        item_id: rule.item_id ? rename(rule.item_id, itemMap) : undefined,
        research_id: rule.research_id ? rename(rule.research_id, researchMap) : undefined,
      })),
    };
  }
  const products = items.map((entry) => ({
    id: rename(entry.item_id, itemMap),
    name: itemNames.find(([id]) => id === entry.item_id)[2],
    inputs: quantities(entry.inputs),
    seconds: entry.duration_seconds || 3,
    visibility: visibility(entry),
    position: null,
  }));
  function valueOf(id, seen = new Set()) {
    if (seen.has(id)) throw Error('参考物资配方形成循环：' + id);
    const entry = products.find((item) => item.id === id);
    const next = new Set([...seen, id]);
    return Math.max(
      1,
      Math.ceil(
        Object.entries(entry.inputs).reduce(
          (sum, [input, count]) => sum + valueOf(input, next) * count,
          0,
        ) +
          entry.seconds / 3,
      ),
    );
  }
  for (const entry of products) {
    // These products are ingredients of their own first producer. Reveal hand
    // recipes when inputs exist, avoiding the source's first-build softlock.
    if (['tasting-crystal', 'thermal-crystal', 'amber-stone'].includes(entry.id)) {
      entry.visibility.mode = 'base_materials';
    }
    entry.value = valueOf(entry.id);
    entry.description = Object.keys(entry.inputs).length
      ? `以${Object.entries(entry.inputs)
          .map(([id, count]) => products.find((item) => item.id === id).name + '×' + count)
          .join('、')}制作，供后续工序和设施建设使用。`
      : '酒馆工坊的基础物资，可手工收集或交由设施持续产出。';
  }
  const facilities = stations.map((entry) => ({
    id: rename(entry.station_id, stationMap),
    name: stationNames.find(([id]) => id === entry.station_id)[2],
    outputs: {
      ...(entry.output_id ? { [rename(entry.output_id, itemMap)]: entry.output_amount || 1 } : {}),
      ...quantities(entry.outputs),
    },
    materials: quantities(entry.build_materials),
    price: Math.max(
      1,
      Math.ceil(entry.build_stones * (entry.build_currency === 'middle_stones' ? 10 : 0.001)),
    ),
    max: entry.max_count || 100,
    multiplier: entry.cost_multiplier ?? 0.2,
    exponentialAt: entry.exp_cost_threshold || 20,
    exponential: entry.exp_cost_growth || 1.2,
    requires: quantities(
      entry.required_research_id
        ? { [entry.required_research_id]: entry.required_research_level || 1 }
        : {},
      researchMap,
    ),
    stations: (entry.required_stations || []).map((id) => rename(id, stationMap)),
    visibility: visibility(entry),
  }));
  const technologies = research.map((entry, index) => ({
    id: rename(entry.research_id, researchMap),
    name: researchNames[index],
    description: '改进工坊生产工艺；各级效果按累计值生效。',
    costs: (entry.costs_by_level?.length
      ? entry.costs_by_level
      : (entry.costs || []).map((count) => ({ [entry.cost_item_id]: count }))
    ).map((cost) => quantities(cost)),
    requires: quantities(entry.prerequisites, researchMap),
    logic: entry.prerequisites_logic || 'and',
    station: entry.required_station_id ? rename(entry.required_station_id, stationMap) : '',
    effects: (entry.targets || []).map((target) => ({
      type: target.type,
      id: rename(target.target_id, target.type === 'station' ? stationMap : itemMap),
      speed: {
        mode: target.speed_bonus_type || 'none',
        growth: target.speed_growth || 0,
        levels: target.custom_speed || target.custom_levels || {},
      },
      parallel: {
        mode: target.parallel_bonus_type || 'none',
        growth: target.parallel_growth || 0,
        levels: target.custom_parallel || {},
      },
    })),
    unlocks: (entry.unlock_rules || []).map((rule) => ({
      type: rule.type,
      id: rename(rule.target_id, rule.type === 'station' ? stationMap : itemMap),
      level: rule.level || 1,
    })),
    position: null,
  }));
  const core = resourceFields(text);
  const upgrades = (core.core_upgrades || []).map((step) => ({
    materials: quantities(step.materials),
    price: Math.ceil(
      (step.currencies?.stones || 0) * 0.001 + (step.currencies?.middle_stones || 0) * 10,
    ),
    production: step.rewards?.production_percent || 0,
    manual: step.rewards?.cultivation_percent || 0,
    items: quantities(step.rewards?.items),
    unlocks: (step.rewards?.unlock_items || []).map((id) => rename(id, itemMap)),
  }));
  return {
    version: 1,
    name: '星隙工坊',
    currency: '工坊券',
    researchKey: 'clockwork-heart',
    items: products,
    stations: facilities,
    research: technologies,
    core: upgrades,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  if (!process.argv[2]) throw Error('请传入参考Godot项目目录');
  const catalog = await importWorkshopReference(process.argv[2]);
  await writeFile(
    new URL('../src/content/workshop-catalog.js', import.meta.url),
    'export const WORKSHOP_CATALOG = ' + JSON.stringify(catalog, null, 2) + ';\n',
  );
  console.log(
    JSON.stringify({
      items: catalog.items.length,
      stations: catalog.stations.length,
      research: catalog.research.length,
      coreLevels: catalog.core.length,
    }),
  );
}
