import { restoreBag } from './content/items.js';
export function restoreInventory(value) {
  const count = value?.summonContracts;
  return {
    bagUnlocked: value?.bagUnlocked === true,
    items: restoreBag(value?.items),
    summonContracts: Number.isSafeInteger(count) && count >= 0 ? Math.min(count, 999999) : 0,
    gold:
      Number.isSafeInteger(value?.gold) && value.gold >= 0 ? Math.min(value.gold, 999999999) : 0,
    ether:
      Number.isSafeInteger(value?.ether) && value.ether >= 0 ? Math.min(value.ether, 999999999) : 0,
  };
}

/** Victory is confirmed by the encounter engine; claiming the same result cannot mint items twice. */
export function claimBattleRewards(library, claimId, rewards) {
  if (typeof claimId !== 'string' || !claimId) throw Error('奖励结算标识无效');
  library.inventory ||= restoreInventory();
  library.rewardClaims ||= [];
  if (library.rewardClaims.includes(claimId)) return false;
  const count = rewards.summonContracts;
  const gold = rewards.gold ?? 0;
  if (!Number.isSafeInteger(count) || count < 0 || !Number.isSafeInteger(gold) || gold < 0)
    throw Error('奖励数量无效');
  library.inventory.summonContracts = Math.min(999999, library.inventory.summonContracts + count);
  library.inventory.gold = Math.min(999999999, (library.inventory.gold || 0) + gold);
  library.rewardClaims.push(claimId);
  library.rewardClaims = library.rewardClaims.slice(-2000);
  return true;
}
