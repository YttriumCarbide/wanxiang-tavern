export const WORKSHOP_TILE = Object.freeze({ width: 96, height: 148, x: 28, y: 200 });
export const WORKSHOP_BOARD = Object.freeze({
  columns: 96,
  rows: 72,
  maxColumns: 500,
  maxRows: 500,
});
const { width, height, x, y } = WORKSHOP_TILE;

export function workshopCell(position) {
  return {
    column: Math.max(
      0,
      Math.min(WORKSHOP_BOARD.maxColumns - 1, Math.round((position.x - x) / width)),
    ),
    row: Math.max(0, Math.min(WORKSHOP_BOARD.maxRows - 1, Math.round((position.y - y) / height))),
  };
}

export function workshopPosition(column, row) {
  return { x: x + column * width, y: y + row * height };
}

export function workshopCellKey({ x, y }) {
  return x + ',' + y;
}

export function workshopNodeKey(type, id) {
  return type + ':' + id;
}

export function workshopBoardNodes(catalog, page) {
  const types = page === 'research' ? ['research'] : ['items', 'stations'];
  return types.flatMap((type) =>
    catalog[type]
      .filter((entry) => type === 'research' || (entry.page || 'production') === page)
      .map((entry) => ({ type, entry, key: workshopNodeKey(type, entry.id) })),
  );
}

/** Keep authored positions stable as a save discovers more of the production board. */
export function workshopLayout(nodes) {
  const layout = new Map();
  const occupied = new Set();
  let lastRow = -1;
  for (const { key, entry } of nodes) {
    if (!entry.position) continue;
    const { column, row } = workshopCell(entry.position);
    const position = workshopPosition(column, row);
    const cell = workshopCellKey(position);
    if (occupied.has(cell)) continue;
    occupied.add(cell);
    layout.set(key, position);
    lastRow = Math.max(lastRow, row);
  }
  let next = 0;
  for (const { key } of nodes) {
    if (layout.has(key)) continue;
    let position;
    do {
      const row = (lastRow + 1 + Math.floor(next / 12)) % WORKSHOP_BOARD.maxRows;
      position = workshopPosition(next % 12, row);
      next++;
    } while (occupied.has(workshopCellKey(position)));
    occupied.add(workshopCellKey(position));
    layout.set(key, position);
  }
  return layout;
}

export function workshopEdges(nodes) {
  return nodes.flatMap(({ type, entry, key }) => {
    if (type === 'research')
      return Object.keys(entry.requires).map((id) => [workshopNodeKey(type, id), key]);
    if (type === 'items')
      return Object.keys(entry.inputs).map((id) => [workshopNodeKey(type, id), key]);
    return [
      ...Object.keys(entry.inputs || {}).map((id) => [workshopNodeKey('items', id), key]),
      ...entry.stations.map((id) => [workshopNodeKey('stations', id), key]),
      ...Object.keys(entry.outputs).map((id) => [key, workshopNodeKey('items', id)]),
    ];
  });
}

export function workshopWire(a, b) {
  const inset = 4;
  if (a.y === b.y) {
    const right = b.x > a.x;
    const x1 = a.x + (right ? width - inset : inset);
    const x2 = b.x + (right ? inset : width - inset);
    return `M ${x1} ${a.y + height / 2} L ${x2} ${b.y + height / 2}`;
  }
  const x1 = a.x + width / 2;
  const x2 = b.x + width / 2;
  const upward = b.y < a.y;
  const y1 = a.y + (upward ? inset : height - inset);
  const y2 = b.y + (upward ? height - inset : inset);
  const mid = (y1 + y2) / 2;
  return `M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`;
}
