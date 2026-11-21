import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

function number(value, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  return value.toFixed(digits);
}

function percent(value, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  return `${(value * 100).toFixed(digits)}%`;
}

function interval(value) {
  return Array.isArray(value) ? `[${percent(value[0])}, ${percent(value[1])}]` : '-';
}

function wilsonInterval95(successes, attempts) {
  if (!attempts) return null;
  const p = successes / attempts;
  const z = 1.959963984540054;
  const zSquared = z * z;
  const scale = 1 + zSquared / attempts;
  const center = (p + zSquared / (2 * attempts)) / scale;
  const margin = (z * Math.sqrt((p * (1 - p) + zSquared / (4 * attempts)) / attempts)) / scale;
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

function ratio(value) {
  return percent(value);
}

function json(value) {
  return JSON.stringify(value ?? null);
}

function key(row, fields) {
  return fields.map((field) => row[field]).join(':');
}

function weighted(rows, metric, denominator) {
  const total = rows.reduce((sum, row) => sum + (row.denominators?.[denominator] ?? 0), 0);
  if (!total) return null;
  return (
    rows.reduce(
      (sum, row) => sum + (row[metric] ?? 0) * (row.denominators?.[denominator] ?? 0),
      0,
    ) / total
  );
}

function aggregate(rows) {
  const attempts = rows.reduce((sum, row) => sum + row.attempts, 0);
  const successes = rows.reduce((sum, row) => sum + row.successes, 0);
  const casualties = rows.reduce(
    (sum, row) => sum + (row.casualtyRate ?? 0) * (row.denominators?.casualtyRate ?? 0),
    0,
  );
  const lowHp = rows.reduce(
    (sum, row) => sum + (row.lowHpRate ?? 0) * (row.denominators?.lowHpRate ?? 0),
    0,
  );
  const exhausted = rows.reduce(
    (sum, row) => sum + (row.exhaustedRate ?? 0) * (row.denominators?.exhaustedRate ?? 0),
    0,
  );
  const hp = rows.reduce(
    (sum, row) => sum + (row.meanHpSpendRatio ?? 0) * (row.denominators?.meanHpSpendRatio ?? 0),
    0,
  );
  const meanRound = weighted(rows, 'meanRounds', 'rounds');
  const bossWins = rows.reduce((sum, row) => sum + row.oneRoundBossWins, 0);
  const bossAction = rows.reduce((sum, row) => sum + row.bossWinsWithoutAction, 0);
  const bossMechanic = rows.reduce((sum, row) => sum + row.bossWinsWithoutMechanic, 0);
  return {
    attempts,
    successes,
    winRate: attempts ? successes / attempts : null,
    meanRounds: meanRound,
    casualtyRate: rows.reduce((sum, row) => sum + (row.denominators?.casualtyRate ?? 0), 0)
      ? casualties / rows.reduce((sum, row) => sum + (row.denominators?.casualtyRate ?? 0), 0)
      : null,
    lowHpRate: rows.reduce((sum, row) => sum + (row.denominators?.lowHpRate ?? 0), 0)
      ? lowHp / rows.reduce((sum, row) => sum + (row.denominators?.lowHpRate ?? 0), 0)
      : null,
    exhaustedRate: rows.reduce((sum, row) => sum + (row.denominators?.exhaustedRate ?? 0), 0)
      ? exhausted / rows.reduce((sum, row) => sum + (row.denominators?.exhaustedRate ?? 0), 0)
      : null,
    meanHpSpendRatio: rows.reduce((sum, row) => sum + (row.denominators?.meanHpSpendRatio ?? 0), 0)
      ? hp / rows.reduce((sum, row) => sum + (row.denominators?.meanHpSpendRatio ?? 0), 0)
      : null,
    oneRoundBossWins: bossWins,
    bossWinsWithoutAction: bossAction,
    bossWinsWithoutMechanic: bossMechanic,
  };
}

function markdownTable(headers, rows) {
  const line = (values) => `| ${values.join(' | ')} |`;
  return [line(headers), line(headers.map(() => '---')), ...rows.map(line)].join('\n');
}

function nodeRows(campaign) {
  return [...campaign.nodes].sort((a, b) =>
    key(a, ['mode', 'profile', 'map', 'sequence', 'tutorial', 'index']).localeCompare(
      key(b, ['mode', 'profile', 'map', 'sequence', 'tutorial', 'index']),
    ),
  );
}

function expeditionRows(campaign) {
  return [...campaign.expeditions].sort((a, b) =>
    key(a, ['mode', 'profile', 'map', 'sequence', 'tutorial']).localeCompare(
      key(b, ['mode', 'profile', 'map', 'sequence', 'tutorial']),
    ),
  );
}

function mapSummary(campaign) {
  const groups = new Map();
  for (const row of campaign.expeditions) {
    const id = key(row, ['mode', 'profile', 'map']);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(row);
  }
  return [...groups.entries()].map(([id, rows]) => {
    const summary = aggregate(rows);
    return {
      id,
      ...rows[0],
      ...summary,
      winInterval95: wilsonInterval95(summary.successes, summary.attempts),
    };
  });
}

function findDifficultyCliffs(campaign) {
  const groups = new Map();
  for (const row of campaign.expeditions) {
    const id = key(row, ['mode', 'profile', 'map']);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(row);
  }
  const cliffs = [];
  for (const rows of groups.values()) {
    const ordered = [...rows].sort((a, b) => a.sequence - b.sequence);
    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1];
      const current = ordered[index];
      const delta = current.winRate - previous.winRate;
      if (delta <= -0.2 || current.winRate < 0.8) {
        cliffs.push({ previous, current, delta });
      }
    }
  }
  return cliffs.sort((a, b) => a.delta - b.delta);
}

function findOverwater(campaign) {
  return expeditionRows(campaign)
    .filter((row) => row.attempts >= 8 && row.winRate >= 0.98 && (row.meanRounds ?? 99) <= 3)
    .slice(0, 20);
}

function stressCases(stress) {
  const results = stress.results ?? [];
  const first = (predicate) => results.find(predicate);
  const zero = results
    .filter((result) => (result.coverage?.zeroDamageRounds ?? 0) > 0)
    .sort((a, b) => (b.coverage.zeroDamageRounds ?? 0) - (a.coverage.zeroDamageRounds ?? 0))[0];
  const previews = [...results].sort(
    (a, b) => (b.coverage?.previews ?? 0) - (a.coverage?.previews ?? 0),
  )[0];
  return {
    victory: first((result) => result.outcome === 'victory'),
    defeat: first((result) => result.outcome === 'defeat'),
    roundLimit: first((result) => result.outcome === 'round-limit'),
    zeroDamage: zero,
    maxPreviews: previews,
  };
}

function caseLine(label, result) {
  if (!result) return `- ${label}: 未发现`;
  return `- ${label}: \`${result.caseId}\`，seed \`${result.seed}\`，outcome \`${result.outcome}\`，rounds ${result.rounds}，coverage ${json(result.coverage)}。`;
}

function buildReport({ campaign, stress, inputPath, stressPath }) {
  const options = campaign.options;
  const nodes = nodeRows(campaign.campaign);
  const expeditions = expeditionRows(campaign.campaign);
  const summaries = mapSummary(campaign.campaign);
  const cliffs = findDifficultyCliffs(campaign.campaign);
  const overwater = findOverwater(campaign.campaign);
  const cases = stressCases(stress.stress);
  const invariantViolations = stress.stress.violations?.length ?? 0;
  const zeroDamageCases = (stress.stress.results ?? []).filter(
    (result) => (result.coverage?.zeroDamageRounds ?? 0) > 0,
  ).length;
  const bossRows = nodes.filter((row) => row.type === 'boss');
  const bossAttempts = bossRows.reduce((sum, row) => sum + row.attempts, 0);
  const bossWins = bossRows.reduce((sum, row) => sum + row.successes, 0);
  const bossOneRound = bossRows.reduce((sum, row) => sum + row.oneRoundBossWins, 0);
  const bossNoAction = bossRows.reduce((sum, row) => sum + row.bossWinsWithoutAction, 0);
  const bossNoMechanic = bossRows.reduce((sum, row) => sum + row.bossWinsWithoutMechanic, 0);
  const careerRows = campaign.campaign.careers ?? [];
  const careerTable = markdownTable(
    ['mode', 'profile', 'attempts', 'complete', 'failure', 'rate', '95% CI'],
    careerRows.map((row) => [
      row.mode,
      row.profile,
      row.attempts,
      row.successes,
      row.defeats,
      percent(row.winRate),
      interval(row.winInterval95),
    ]),
  );
  const mapTable = markdownTable(
    [
      'mode',
      'profile',
      'map',
      'attempts',
      'win',
      '95% CI',
      'mean rounds',
      'net HP change',
      'casualty',
      'low HP',
      'exhausted',
    ],
    summaries.map((row) => [
      row.mode,
      row.profile,
      row.map,
      row.attempts,
      percent(row.winRate),
      interval(row.winInterval95),
      number(row.meanRounds),
      ratio(row.meanHpSpendRatio),
      percent(row.casualtyRate),
      percent(row.lowHpRate),
      percent(row.exhaustedRate),
    ]),
  );
  const expeditionTable = markdownTable(
    [
      'mode',
      'profile',
      'map',
      'seq',
      'tutorial',
      'attempts',
      'win',
      '95% CI',
      'mean/p50/p90 rounds',
      'net HP change',
      'casualty',
      'low HP',
      'exhausted',
      'boss 1R/no action/no mech',
    ],
    expeditions.map((row) => [
      row.mode,
      row.profile,
      row.map,
      row.sequence,
      row.tutorial,
      row.attempts,
      percent(row.winRate),
      interval(row.winInterval95),
      `${number(row.meanRounds)}/${row.p50Rounds ?? '-'}/${row.p90Rounds ?? '-'}`,
      ratio(row.meanHpSpendRatio),
      percent(row.casualtyRate),
      percent(row.lowHpRate),
      percent(row.exhaustedRate),
      `${row.oneRoundBossWins}/${row.bossWinsWithoutAction}/${row.bossWinsWithoutMechanic}`,
    ]),
  );
  const nodeTable = markdownTable(
    [
      'mode',
      'profile',
      'map',
      'seq',
      'node',
      'type',
      'attempts',
      'win',
      '95% CI',
      'rounds',
      'net HP change',
      'casualty',
      'low HP',
      'exhausted',
    ],
    nodes.map((row) => [
      row.mode,
      row.profile,
      row.map,
      row.sequence,
      row.index,
      row.type,
      row.attempts,
      percent(row.winRate),
      interval(row.winInterval95),
      `${number(row.meanRounds)}/${row.p50Rounds ?? '-'}/${row.p90Rounds ?? '-'} ${json(row.roundsHistogram)}`,
      ratio(row.meanHpSpendRatio),
      percent(row.casualtyRate),
      percent(row.lowHpRate),
      percent(row.exhaustedRate),
    ]),
  );
  const cliffTable = cliffs.length
    ? markdownTable(
        [
          'mode',
          'profile',
          'map',
          'from seq',
          'to seq',
          'from win',
          'to win',
          'delta',
          'to rounds',
        ],
        cliffs
          .slice(0, 30)
          .map(({ previous, current, delta }) => [
            current.mode,
            current.profile,
            current.map,
            previous.sequence,
            current.sequence,
            percent(previous.winRate),
            percent(current.winRate),
            percent(delta),
            number(current.meanRounds),
          ]),
      )
    : '未发现满足阈值（胜率下降至少 20 个百分点或低于 80%）的连续副本节点。';
  const overwaterTable = overwater.length
    ? markdownTable(
        ['mode', 'profile', 'map', 'seq', 'win', 'mean rounds', 'attempts'],
        overwater.map((row) => [
          row.mode,
          row.profile,
          row.map,
          row.sequence,
          percent(row.winRate),
          number(row.meanRounds),
          row.attempts,
        ]),
      )
    : '未发现满足阈值（至少 98% 胜率且平均不超过 3 回合）的过水副本。';
  const stressCoverage = Object.entries(stress.stress.bossCoverage ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([boss, coverage]) => [
      boss,
      coverage.appearances,
      coverage.actions,
      coverage.mechanics,
      coverage.charges,
      coverage.releases,
    ])
    .filter(([, appearances]) => appearances > 0);
  const coverageTable = markdownTable(
    ['boss', 'appearances', 'actions', 'mechanics', 'charges', 'releases'],
    stressCoverage,
  );
  const equipmentTable = markdownTable(
    ['affix', 'assigned', 'procs'],
    Object.entries(stress.stress.equipmentCoverage ?? {}).map(([affix, coverage]) => [
      affix,
      coverage.assigned,
      coverage.procs,
    ]),
  );
  return `# 战斗异常与玩家通关难度曲线体检报告

生成时间：${new Date().toISOString()}  
campaign 输入：\`${inputPath}\`  
stress 输入：\`${stressPath}\`

## 结论摘要

- 本报告只读取离线纯数据仿真结果；没有启动浏览器，没有改动 UI、剧情台词、\`flavorText\` 或正式战斗数值。
- stress 组合矩阵共 ${stress.stress.total} cases、${stress.stress.previews} 次预演，机制 invariant violation 为 ${invariantViolations}；round-limit ${stress.stress.outcomes['round-limit'] ?? 0}，zero-damage case ${zeroDamageCases}。
- campaign 参数：${options.seeds} seeds（${options.firstSeed}..${options.firstSeed + options.seeds - 1}）、${options.sites} sites、maxRounds ${options.maxRounds}、profiles ${options.profiles.join(', ')}、modes ${options.modes.join(', ')}。
- career 是从新档连续推进的自然开荒，目前仅模拟起始 mill 路线；cohort 为每张正式可解锁地图独立取样，并保留该地图解锁后的队伍/资源基线。两者不能直接当作同一条玩家路线相加。
- \`round-limit/stalled\` 是当前策略在上限内没有结束战斗的结果；它与引擎 invariant violation 分开统计，不能直接判作引擎错误。

## Engine invariant 与机制异常压测

维度：${stress.stress.dimensions.rosters.length} roster × ${stress.stress.dimensions.emblems.length} emblems × ${stress.stress.dimensions.affixes.length} affixes × ${stress.stress.dimensions.enemies.length} enemy definitions。

| outcome | cases |
| --- | ---: |
| victory | ${stress.stress.outcomes.victory ?? 0} |
| defeat | ${stress.stress.outcomes.defeat ?? 0} |
| round-limit | ${stress.stress.outcomes['round-limit'] ?? 0} |
| invariant violations | ${invariantViolations} |
| zero-damage cases | ${zeroDamageCases} |

装备触发覆盖：

${equipmentTable}

Boss 覆盖（仅列有实际 appearances 的定义）：

${coverageTable}

典型 stress case：

${caseLine('胜利', cases.victory)}
${caseLine('失败', cases.defeat)}
${caseLine('回合上限', cases.roundLimit)}
${caseLine('zero-damage 极值', cases.zeroDamage)}
${caseLine('预演次数最多', cases.maxPreviews)}

## 玩家画像与全流程结果

career 连续通关汇总：

${careerTable}

按地图汇总（expedition 样本，事件/战斗/休息节点的完整副本结算）：

${mapTable}

Boss 统计口径：Boss 节点 attempts ${bossAttempts}，胜利 ${bossWins}，一回合胜利 ${bossOneRound}，胜利但 Boss 未行动 ${bossNoAction}，胜利但未观察到 Boss mechanic ${bossNoMechanic}。这些计数只使用明确记录到的 Boss 节点观测。

## 每个副本与节点

副本级字段顺序为：attempts、winRate、Wilson 95% CI、回合 mean/p50/p90、净 HP 消耗率（战前总 HP 减战后总 HP，再除以最大 HP；治疗可使结果为负，表示净 HP 增加）、阵亡率、残血率（结束时 HP ≤ 25%）、资源枯竭率（MP ≤ 10% 且 supplies=0）、Boss 一回合/未行动/无机制计数。

${expeditionTable}

节点级明细：

${nodeTable}

## 难度曲线诊断

连续副本胜率断崖（阈值：相邻 sequence 下降至少 20 个百分点，或后节点胜率低于 80%）：

${cliffTable}

过水节点（阈值：至少 98% 胜率且平均不超过 3 回合）：

${overwaterTable}

断崖/过水阈值用于定位审查对象，不自动修改平衡数值。若要调难度，应结合对应 seed 的 replay、资源继承和事件选择逐 case 决策。

## 回归入口与审查边界

- 回归单测：\`tests/battle-sim.test.js\`，固化了高配纹章技能优先于补给品、两张地图 opener 不空转，以及统计分母/Wilson/CSV 行为。
- 运行入口：\`node tools/battle-sim.mjs --stress\`、\`node tools/battle-sim.mjs --campaign\`；本轮正式输入 JSON 由上方路径记录。
- 报告里的 caseId、seed、coverage 和前四个 trace 事件均可通过 \`--replay --seed N --profiles PROFILE --modes MODE --maps MAP\` 回放；stress case 可在 stress JSON 的 \`results\` 中按 caseId 查找。
- 本轮没有据报告直接修改怪物数值、战斗公式或正式内容。
`;
}

const { values } = parseArgs({
  options: {
    input: { type: 'string', default: '.runtime/tests/battle-sim/campaign.json' },
    stress: { type: 'string', default: '.runtime/tests/battle-sim/stress.json' },
    out: { type: 'string', default: 'tools/battle-sim-report.md' },
  },
});
const [campaignText, stressText] = await Promise.all([
  readFile(values.input, 'utf8'),
  readFile(values.stress, 'utf8'),
]);
const report = buildReport({
  campaign: JSON.parse(campaignText),
  stress: JSON.parse(stressText),
  inputPath: path.normalize(values.input),
  stressPath: path.normalize(values.stress),
});
await writeFile(values.out, report, 'utf8');
console.log(`Report written: ${path.resolve(values.out)}`);
