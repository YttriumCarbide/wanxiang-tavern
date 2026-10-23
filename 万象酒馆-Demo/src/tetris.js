const SHAPES = Object.freeze([
  [[1, 1, 1, 1]],
  [
    [1, 1],
    [1, 1],
  ],
  [
    [0, 1, 0],
    [1, 1, 1],
  ],
  [
    [0, 1, 1],
    [1, 1, 0],
  ],
  [
    [1, 1, 0],
    [0, 1, 1],
  ],
  [
    [1, 0, 0],
    [1, 1, 1],
  ],
  [
    [0, 0, 1],
    [1, 1, 1],
  ],
]);
export const TETRIS_REWARDS = Object.freeze([0, 1, 3, 6, 10]);

function random(state) {
  state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0;
  return state.seed / 4294967296;
}
function next(state) {
  if (!state.bag.length) {
    state.bag = [0, 1, 2, 3, 4, 5, 6];
    for (let index = 6; index > 0; index--) {
      const swap = Math.floor(random(state) * (index + 1));
      [state.bag[index], state.bag[swap]] = [state.bag[swap], state.bag[index]];
    }
  }
  const type = state.bag.pop();
  const cells = structuredClone(SHAPES[type]);
  state.piece = { type, cells, x: Math.floor((10 - cells[0].length) / 2), y: 0 };
  if (!fits(state, state.piece)) state.status = 'over';
}
export function newTetris(seed = 17371) {
  const state = {
    version: 1,
    seed: seed >>> 0,
    board: Array.from({ length: 20 }, () => Array(10).fill(0)),
    bag: [],
    piece: null,
    status: 'paused',
    lines: 0,
    score: 0,
    earned: 0,
  };
  next(state);
  return state;
}
function fits(state, piece) {
  return piece.cells.every((row, y) =>
    row.every(
      (cell, x) =>
        !cell ||
        (piece.x + x >= 0 &&
          piece.x + x < 10 &&
          piece.y + y >= 0 &&
          piece.y + y < 20 &&
          !state.board[piece.y + y][piece.x + x]),
    ),
  );
}
export function restoreTetris(raw) {
  try {
    if (
      raw?.version !== 1 ||
      !Number.isInteger(raw.seed) ||
      !Array.isArray(raw.board) ||
      raw.board.length !== 20 ||
      raw.board.some(
        (row) =>
          !Array.isArray(row) ||
          row.length !== 10 ||
          row.some((cell) => !Number.isInteger(cell) || cell < 0 || cell > 7),
      ) ||
      !Array.isArray(raw.bag) ||
      raw.bag.length > 7 ||
      new Set(raw.bag).size !== raw.bag.length ||
      raw.bag.some((type) => !Number.isInteger(type) || type < 0 || type > 6) ||
      !['paused', 'playing', 'over'].includes(raw.status) ||
      ['lines', 'score', 'earned'].some((key) => !Number.isSafeInteger(raw[key]) || raw[key] < 0) ||
      !Number.isInteger(raw.piece?.type) ||
      raw.piece.type < 0 ||
      raw.piece.type > 6 ||
      !Number.isInteger(raw.piece.x) ||
      raw.piece.x < 0 ||
      raw.piece.x > 9 ||
      !Number.isInteger(raw.piece.y) ||
      raw.piece.y < 0 ||
      raw.piece.y > 19 ||
      !Array.isArray(raw.piece.cells) ||
      raw.piece.cells.length > 4 ||
      !raw.piece.cells.length ||
      raw.piece.cells.some(
        (row) =>
          !Array.isArray(row) ||
          row.length < 1 ||
          row.length > 4 ||
          row.some((cell) => cell !== 0 && cell !== 1),
      )
    )
      throw Error();
    const expected = SHAPES[raw.piece.type].flat().filter(Boolean).length;
    if (
      raw.piece.cells.some((row) => row.length !== raw.piece.cells[0].length) ||
      raw.piece.x + raw.piece.cells[0].length > 10 ||
      raw.piece.y + raw.piece.cells.length > 20 ||
      raw.piece.cells.flat().filter(Boolean).length !== expected ||
      (raw.status !== 'over' && !fits(raw, raw.piece))
    )
      throw Error();
    return { ...structuredClone(raw), status: raw.status === 'over' ? 'over' : 'paused' };
  } catch {
    return newTetris();
  }
}
function lock(state, events) {
  const piece = state.piece;
  for (const [y, row] of piece.cells.entries())
    for (const [x, cell] of row.entries())
      if (cell) state.board[y + piece.y][x + piece.x] = piece.type + 1;
  const rows = state.board
    .map((row, index) => (row.every(Boolean) ? index : -1))
    .filter((row) => row >= 0);
  state.board = state.board.filter((_, index) => !rows.includes(index));
  while (state.board.length < 20) state.board.unshift(Array(10).fill(0));
  if (rows.length) {
    const ether = TETRIS_REWARDS[rows.length];
    state.lines += rows.length;
    state.score += [0, 100, 300, 500, 800][rows.length];
    state.earned += ether;
    events.push({ type: 'clear', rows, count: rows.length, ether });
  }
  next(state);
  events.push({ type: 'lock' });
}
/** Pure simulation: the same settled clear event drives currency and the visual feedback. */
export function tetrisStep(input, action) {
  const state = structuredClone(input),
    events = [];
  if (action === 'new')
    return { state: { ...newTetris((state.seed + 7919) >>> 0), status: 'playing' }, events };
  if (action === 'pause') {
    if (state.status === 'playing') state.status = 'paused';
    return { state, events };
  }
  if (action === 'play') {
    if (state.status === 'paused') state.status = 'playing';
    return { state, events };
  }
  if (state.status !== 'playing') return { state, events };
  const piece = state.piece;
  if (action === 'rotate') {
    const cells = piece.cells[0].map((_, x) => piece.cells.map((row) => row[x]).reverse());
    for (const offset of [0, -1, 1, -2, 2]) {
      const candidate = { ...piece, cells, x: piece.x + offset };
      if (fits(state, candidate)) {
        state.piece = candidate;
        break;
      }
    }
  } else if (['left', 'right'].includes(action)) {
    const candidate = { ...piece, x: piece.x + (action === 'left' ? -1 : 1) };
    if (fits(state, candidate)) state.piece = candidate;
  } else if (action === 'drop') {
    while (fits(state, { ...piece, y: piece.y + 1 })) piece.y++;
    lock(state, events);
  } else if (['down', 'tick'].includes(action)) {
    if (fits(state, { ...piece, y: piece.y + 1 })) piece.y++;
    else lock(state, events);
  }
  return { state, events };
}
export function tetrisDisplay(state) {
  const cells = state.board.map((row) => [...row]);
  const ghost = { ...state.piece };
  while (fits(state, { ...ghost, y: ghost.y + 1 })) ghost.y++;
  for (const [y, row] of ghost.cells.entries())
    for (const [x, cell] of row.entries())
      if (cell && !cells[y + ghost.y]?.[x + ghost.x]) cells[y + ghost.y][x + ghost.x] = -1;
  for (const [y, row] of state.piece.cells.entries())
    for (const [x, cell] of row.entries())
      if (cell && cells[y + state.piece.y]?.[x + state.piece.x] !== undefined)
        cells[y + state.piece.y][x + state.piece.x] = state.piece.type + 1;
  return cells;
}
