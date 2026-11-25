import { buyItem } from '../content/items.js';
import { buyIngredient, sellIngredient } from '../dining.js';
import {
  acceptGuildBounty,
  buyGuildSkillManual,
  claimGuildBountyReward,
  unlockGuildIntel,
} from '../guild.js';

const actions = Object.freeze({
  item: buyItem,
  ingredient(draft, id) {
    buyIngredient(draft, id);
    return { ok: true };
  },
  ingredientSale: sellIngredient,
  accept: acceptGuildBounty,
  claim: claimGuildBountyReward,
  intel: unlockGuildIntel,
  learn: buyGuildSkillManual,
});
const reload = '存档状态未能确认，请重新载入后继续。';

// Record only this trade's cells so rollback preserves live object and array references.
function setField(undo, target, key, value) {
  const before = target[key];
  if (Object.is(before, value)) return;
  const had = Object.hasOwn(target, key);
  undo.push(() => {
    if (Object.is(target[key], value)) {
      if (had) target[key] = before;
      else delete target[key];
    } else if ([before, value, target[key]].every(Number.isSafeInteger)) {
      target[key] += before - value;
    }
  });
  target[key] = value;
}

function append(undo, list, value) {
  list.push(value);
  undo.push(() => {
    const index = list.indexOf(value);
    if (index !== -1) list.splice(index, 1);
  });
}

function replaceEntry(undo, list, index, value) {
  const previous = list[index];
  if (previous === value) return previous;
  list[index] = value;
  undo.push(() => {
    const current = list.indexOf(value);
    if (current !== -1) list[current] = previous;
  });
  return previous;
}

function tradeDraft(owner, action) {
  const draft = { ...owner };
  if (owner.inventory) {
    draft.inventory = { ...owner.inventory };
    if (owner.inventory.items && typeof owner.inventory.items === 'object')
      draft.inventory.items = { ...owner.inventory.items };
  }
  if (action === 'item' && owner.campaign) draft.campaign = { ...owner.campaign };
  if (['ingredient', 'ingredientSale'].includes(action) && owner.dining)
    draft.dining = structuredClone(owner.dining);
  if (['claim', 'intel', 'learn'].includes(action) && owner.guild)
    draft.guild = structuredClone(owner.guild);
  if (['accept', 'claim'].includes(action) && Array.isArray(owner.tavernQuests))
    draft.tavernQuests = owner.tavernQuests.map((quest) => structuredClone(quest));
  if (action === 'learn' && Array.isArray(owner.learnedSkills))
    draft.learnedSkills = [...owner.learnedSkills];
  return draft;
}

function commitDining(undo, owner, draft, id) {
  if (!owner.dining) {
    setField(undo, owner, 'dining', draft.dining);
    return;
  }
  const current = owner.dining;
  const next = draft.dining;
  setField(undo, current, 'seed', next.seed);
  setField(undo, current, 'tutorial', next.tutorial);
  if (!current.inventory || typeof current.inventory !== 'object') {
    setField(undo, current, 'inventory', { ...next.inventory });
  } else {
    setField(undo, current.inventory, id, next.inventory[id]);
  }
  if (!Array.isArray(current.stock)) {
    setField(
      undo,
      current,
      'stock',
      next.stock.map((entry) => ({ ...entry })),
    );
  } else {
    for (const entry of next.stock) {
      const previous = current.stock.find((stock) => stock.id === entry.id);
      if (previous) setField(undo, previous, 'left', entry.left);
      else append(undo, current.stock, { ...entry });
    }
  }
}

function commitGuild(undo, owner, draft, action, result) {
  if (!['claim', 'intel'].includes(action)) return;
  if (!owner.guild) {
    setField(undo, owner, 'guild', draft.guild);
    return;
  }
  if (action === 'claim') {
    setField(undo, owner.guild, 'merit', draft.guild.merit);
    setField(undo, owner.guild, 'completedBounties', draft.guild.completedBounties);
    return;
  }
  if (!Array.isArray(owner.guild.unlockedIntel)) {
    setField(undo, owner.guild, 'unlockedIntel', [...draft.guild.unlockedIntel]);
  } else if (!owner.guild.unlockedIntel.includes(result.item.id)) {
    append(undo, owner.guild.unlockedIntel, result.item.id);
  }
}

function commitQuests(undo, owner, draft, action, result) {
  if (!['accept', 'claim'].includes(action)) return null;
  const quests = owner.tavernQuests;
  if (!Array.isArray(quests)) {
    setField(undo, owner, 'tavernQuests', draft.tavernQuests);
    return null;
  }
  if (action === 'accept') {
    const previous = quests.find((quest) => quest.bountyId === result.quest.bountyId);
    if (previous?.status === 'completed') {
      replaceEntry(undo, quests, quests.indexOf(previous), result.quest);
    } else {
      append(undo, quests, result.quest);
    }
    for (const draftQuest of draft.tavernQuests) {
      const current = quests.find((quest) => quest.id === draftQuest.id);
      if (current && current !== result.quest)
        setField(undo, current, 'tracked', draftQuest.tracked);
    }
    return null;
  }
  const previous = quests.find((quest) => quest.id === result.quest.id);
  if (!previous) throw Error('悬赏状态已变化，请重新查看告示板。');
  const index = quests.indexOf(previous);
  replaceEntry(undo, quests, index, result.quest);
  return () => {
    previous.status = result.quest.status;
    previous.claimed = result.quest.claimed;
    const current = quests.indexOf(result.quest);
    if (current !== -1) quests[current] = previous;
    result.quest = previous;
  };
}

function applyTrade(owner, action, id, undo) {
  const draft = tradeDraft(owner, action);
  const result = actions[action](draft, id);
  if (!result?.ok) throw Error(result?.reason || result?.message || '交易未能完成。');

  if (draft.inventory && owner.inventory) {
    setField(undo, owner.inventory, 'gold', draft.inventory.gold);
    if (action === 'claim') setField(undo, owner.inventory, 'ether', draft.inventory.ether);
    if (action === 'item')
      setField(undo, owner.inventory, 'bagUnlocked', draft.inventory.bagUnlocked);
    if (action === 'item') {
      const itemId = result.item.id;
      if (owner.inventory.items && typeof owner.inventory.items === 'object')
        setField(undo, owner.inventory.items, itemId, draft.inventory.items[itemId]);
      else setField(undo, owner.inventory, 'items', draft.inventory.items);
      if (owner.campaign)
        setField(undo, owner.campaign, 'shopPurchased', draft.campaign.shopPurchased);
    }
  }
  if (['ingredient', 'ingredientSale'].includes(action)) commitDining(undo, owner, draft, id);
  if (action === 'learn') {
    if (Array.isArray(owner.learnedSkills)) {
      if (!owner.learnedSkills.includes(result.skill.id))
        append(undo, owner.learnedSkills, result.skill.id);
    } else {
      setField(undo, owner, 'learnedSkills', draft.learnedSkills);
    }
  }
  commitGuild(undo, owner, draft, action, result);
  const confirm = commitQuests(undo, owner, draft, action, result);
  return { result, confirm };
}

function refreshTradeViews(context) {
  for (const refresh of [
    () => context.summoning?.refresh?.(),
    () => context.shell?.syncInnVisitors?.(),
  ]) {
    try {
      refresh();
    } catch {
      // A view error must not make a confirmed write look retryable.
    }
  }
}

async function persist(context) {
  if ((await context.generation.save({ refresh: false })) === false)
    throw Error('当前存档保存失败，请重试。');
  if ((await context.storage.flush?.()) === false) throw Error('存档写入未能确认，请重试。');
}

export function cityTradePending(context) {
  return context.session.runtime.cityTrade === 'pending';
}

export async function commitCityTrade(context, action, id) {
  const { ai, runtime } = context.session;
  const owner = ai.library;
  if (runtime.cityTrade === 'blocked') throw Error(reload);
  if (cityTradePending(context)) throw Error('正在保存存档，请稍候。');
  if (!Object.hasOwn(actions, action)) throw Error('未知的交易操作');
  if (!owner || runtime.disposed) throw Error('存档未就绪');

  function assertCurrentOwner() {
    if (
      runtime.disposed ||
      context.session.runtime !== runtime ||
      context.session.ai.library !== owner
    ) {
      throw Error(reload);
    }
  }

  runtime.cityTrade = 'pending';
  const undo = [];
  let saveAttempted = false;
  let settled = false;
  try {
    const { result, confirm } = applyTrade(owner, action, id, undo);
    saveAttempted = true;
    await persist(context);
    assertCurrentOwner();
    confirm?.();
    settled = true;
    return result;
  } catch (failure) {
    try {
      for (const revert of undo.reverse()) revert();
      if (saveAttempted) {
        // Restore the original owner's cells, but never save them into a different library.
        assertCurrentOwner();
        await persist(context);
        assertCurrentOwner();
        settled = true;
      }
    } catch (rollbackFailure) {
      runtime.cityTrade = 'blocked';
      throw Error(reload, { cause: rollbackFailure });
    }
    throw failure;
  } finally {
    if (settled) refreshTradeViews(context);
    if (runtime.cityTrade === 'pending') delete runtime.cityTrade;
  }
}
