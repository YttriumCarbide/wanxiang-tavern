import { ITEMS } from './content/items.js';

export function createAuxiliaryActions({
  work,
  definitions,
  invalid,
  movedToFront,
  log,
  record,
  effects,
  trigger,
  bleed,
  clearRearPlagueSeals,
  triggerEntrySkill,
  rear,
  onFormationChanged,
}) {
  function item(a) {
    const item = ITEMS[a.item];
    const unit = work.units[a.target];
    const count = work.items?.[a.item] || 0;
    const error = !unit || unit.hp <= 0 ? '道具目标已濒死' : count < 1 ? '道具数量不足' : '';
    if (error) {
      invalid.push({ id: a.id, message: error });
      record('invalid', null, error, [], a.id);
      return;
    }
    work.items[a.item]--;
    log(`使用${item.name} → ${definitions[a.target].name}（1 AP）`);
    effects(null, [a.target], item.effects);
    trigger('itemUsed', null, { targets: [a.target] });
    record('item', null, item.name, [a.target], a.id, a.item);
  }

  function reposition(a) {
    if (a.a === a.b || ![a.a, a.b].every((x) => Number.isInteger(x) && x >= 0 && x < 6)) {
      invalid.push({ id: a.id, message: '交换位置无效' });
      record('invalid', null, '交换位置无效', [], a.id);
      return;
    }
    const first = work.formation[a.a],
      second = work.formation[a.b];
    if (bleed(first)) {
      record('skip', first, '流血致死 · 换位取消', [], a.id);
      return;
    }
    [work.formation[a.a], work.formation[a.b]] = [second, first];
    clearRearPlagueSeals();
    onFormationChanged?.();
    if (a.a < 3 !== a.b < 3) {
      for (const [id, destination] of [
        [first, a.b],
        [second, a.a],
      ]) {
        if (id) {
          if (destination < 3) movedToFront.add(id);
          trigger(destination < 3 ? 'enterFront' : 'enterRear', id, { targets: [id] });
          if (destination < 3)
            triggerEntrySkill(id, a.id, destination, id === first ? second : first);
        }
      }
    }
    log(
      `${definitions[first]?.name || '空位'}与${definitions[second]?.name || '空位'}调整站位（1 AP）`,
    );
    record('swap', first || second, '调整站位', [second], a.id);
  }

  function swap(a) {
    const outgoing = work.formation[a.slot],
      incoming = work.units[a.incoming];
    if (!incoming || incoming.hp <= 0 || !rear(work).includes(a.incoming)) {
      invalid.push({ id: a.id, message: '换入角色必须是存活的后场角色' });
      record('invalid', outgoing, '替换无效', [], a.id);
      return;
    }
    if (bleed(outgoing || a.incoming)) {
      record('skip', outgoing || a.incoming, '流血致死 · 替换取消', [], a.id);
      return;
    }
    const back = work.formation.indexOf(a.incoming);
    [work.formation[a.slot], work.formation[back]] = [a.incoming, outgoing];
    clearRearPlagueSeals();
    onFormationChanged?.();
    movedToFront.add(a.incoming);
    trigger('enterFront', a.incoming, { targets: [a.incoming] });
    if (outgoing) trigger('enterRear', outgoing, { targets: [outgoing] });
    const incDef = definitions[a.incoming];
    const hasEntry = incoming.entryReady && incDef?.entrySkill;
    log(
      hasEntry
        ? `${incDef.name}换入 · ${incDef.entrySkill.name}`
        : `${incDef.name}换入${['左', '中', '右'][a.slot]}位，${definitions[outgoing]?.name || '空位'}退到后场`,
    );
    record(
      'swap',
      a.incoming,
      hasEntry ? `换入 · ${incDef.entrySkill.name}` : '替换前场',
      [outgoing],
      a.id,
    );
    triggerEntrySkill(a.incoming, a.id, a.slot, outgoing);
  }

  return { item, reposition, swap };
}
