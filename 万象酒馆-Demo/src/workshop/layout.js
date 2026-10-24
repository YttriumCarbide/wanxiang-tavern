/** Shared by the playable factory and its authoring canvas. */
export function workshopLayout(entries, type = 'items') {
  const placed = new Map(),
    rows = new Map();
  function depth(entry, trail = new Set()) {
    if (trail.has(entry.id)) return 0;
    const dependencies = Object.keys(type === 'research' ? entry.requires : entry.inputs || {});
    const parents = dependencies
      .map((id) => entries.find((item) => item.id === id))
      .filter(Boolean);
    return parents.length
      ? 1 + Math.max(...parents.map((parent) => depth(parent, new Set([...trail, entry.id]))))
      : 0;
  }
  for (const entry of entries) {
    const column = Math.min(20, depth(entry));
    const row = rows.get(column) || 0;
    rows.set(column, row + 1);
    placed.set(entry.id, entry.position || { x: 42 + column * 258, y: 38 + row * 166 });
  }
  return placed;
}

export function workshopEdges(entries, layout, type = 'items') {
  return entries.flatMap((entry) =>
    Object.keys(type === 'research' ? entry.requires : entry.inputs || {})
      .filter((id) => layout.has(id))
      .map((id) => {
        const a = layout.get(id),
          b = layout.get(entry.id);
        return `M ${a.x + 210} ${a.y + 62} C ${a.x + 238} ${a.y + 62}, ${b.x - 28} ${b.y + 62}, ${b.x} ${b.y + 62}`;
      }),
  );
}
