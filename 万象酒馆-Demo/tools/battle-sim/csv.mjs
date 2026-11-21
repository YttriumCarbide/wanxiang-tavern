const COLUMNS = [
  'mode',
  'profile',
  'map',
  'sequence',
  'tutorial',
  'index',
  'type',
  'attempts',
  'successes',
  'defeats',
  'winRate',
  'winInterval95',
  'meanRounds',
  'p50Rounds',
  'p90Rounds',
  'roundsHistogram',
  'meanHpSpendRatio',
  'casualtyRate',
  'lowHpRate',
  'exhaustedRate',
  'meanEndingHpRatio',
  'meanEndingMpRatio',
  'oneRoundBossWins',
  'bossWinsWithoutAction',
  'bossWinsWithoutMechanic',
  'denominators',
  'outcomes',
];

function formatCell(value) {
  if (value === null || value === undefined) {
    return '';
  }
  let text;
  if (typeof value === 'object') {
    text = JSON.stringify(value);
  } else {
    text = String(value);
  }
  if (/["\r\n,]/.test(text)) {
    return '"' + text.replace(/"/g, '""') + '"';
  }
  return text;
}

export function nodeRowsCsv(rows) {
  const lines = [COLUMNS.join(',')];
  for (const row of rows) {
    const cells = COLUMNS.map((column) => formatCell(row[column]));
    lines.push(cells.join(','));
  }
  return lines.join('\r\n') + '\r\n';
}
