import test from 'node:test';
import assert from 'node:assert/strict';
import { compileRoster, newLibrary } from '../src/ai/library.js';
import { normalizeScript } from '../src/ai/contracts.js';
import { claimedEventRewardText } from '../src/adventure/rewards.js';
import {
  adventureResumeStage,
  adventureSnapshot,
  validAdventureSnapshot,
} from '../src/adventure/snapshot.js';
import {
  acceptAdventureReply,
  adventureTurnContext,
  createAdventureState,
} from '../src/adventure/state.js';
import { newCampaign } from '../src/campaign.js';
import { adventureTestScript } from '../src/content/generation-mode.js';
import { defaultProtagonist } from '../src/content/qingyuan.js';
import { applyDcPenalty } from '../src/dc-rp.js';
import { createJourney } from '../src/app/journey.js';
import {
  beginEncounter,
  completeAdventureNode,
  completeEncounter,
  newExpedition,
} from '../src/expedition.js';

function adventureFixture() {
  const book = normalizeScript(adventureTestScript(), 'audit-book');
  const expedition = newExpedition();
  expedition.adventure = createAdventureState(book, expedition.id);
  return { book, expedition };
}

test('RP losses land on the expedition member even after a battle formation swap', () => {
  const library = newCampaign(defaultProtagonist());
  const expedition = newExpedition('bossGate', compileRoster(library));
  expedition.partyIds = [...library.party];
  const battle = beginEncounter(expedition);
  const [first, second] = battle.formation;
  [battle.formation[0], battle.formation[1]] = [second, first];
  battle.units[second].hp = 20;
  battle.units[second].mp = 5;
  expedition.carried = battle;
  const teammate = structuredClone(battle.units[first]);
  const target = battle.units[second];

  const receipt = applyDcPenalty(library, { hpLoss: 6, mpLoss: 9 }, 'official-edith', expedition);
  assert.equal(target.hp, 14);
  assert.equal(target.mp, 0);
  assert.equal(receipt.hpLoss, 6);
  assert.equal(receipt.mpLoss, 5);
  assert.deepEqual(battle.units[first], teammate);

  target.hp = 0;
  const downed = applyDcPenalty(library, { hpLoss: 6 }, 'official-edith', expedition);
  assert.equal(target.hp, 0);
  assert.equal(downed.hpLoss, 0);
});

test('a stale Boss patch still accepts the goals and preserves both versions of the original scene', () => {
  const { book, expedition } = adventureFixture();
  expedition.index = 3;
  const original = '【登场:测试角色】\n【旁白】测试场景';
  book.story[4] = original;
  book.display = { story: [...book.story.slice(0, 4), `${original}\n【清场】`] };
  expedition.adventure = createAdventureState(book, expedition.id);
  const turn = adventureTurnContext(expedition, book);
  const goal = turn.goals.find(({ required }) => required);
  const receipt = acceptAdventureReply(
    {},
    expedition,
    book,
    turn,
    {
      content: '测试回应',
      adventure: {
        episodeId: expedition.id,
        revision: 999,
        tasks: [{ id: goal.id, status: 'completed', evidence: '测试依据' }],
        patches: [{ op: 'replace', id: 'boss-001', speaker: '旁白', text: '测试补丁' }],
      },
    },
    'response-1',
  );

  assert.equal(expedition.adventure.goals[goal.id].status, 'completed');
  assert.ok(receipt.warnings.length > 0);
  assert.equal(book.story[4], original);
  assert.equal(book.display.story[4], `${original}\n【清场】`);
});

test('an already claimed legacy event can display its seeded reward', () => {
  const { expedition } = adventureFixture();
  const expected = expedition.adventure.event.reward;
  expedition.adventure.event.rewardClaimed = true;
  delete expedition.adventure.event.reward;

  const text = claimedEventRewardText(expedition);
  assert.ok(text.length > 0);
  assert.deepEqual(expedition.adventure.event.reward, expected);
});

test('an RP status penalty survives a save and reaches only the next battle opening', () => {
  const { book, expedition } = adventureFixture();
  const preceding = beginEncounter(expedition);
  preceding.phase = 'victory';
  completeEncounter(expedition, preceding);
  const heroId = preceding.formation[0];
  const receipt = applyDcPenalty({}, { debuff: 'bleed' }, heroId, expedition);
  assert.equal(receipt.debuff, 'bleed');
  Object.assign(expedition.adventure.event, { choiceId: 'choice-1', resolved: true });
  completeAdventureNode(expedition, book);

  const restored = JSON.parse(JSON.stringify(expedition));
  const elite = beginEncounter(restored);
  assert.equal(elite.units[heroId].buffs.bleed, 2);
  elite.phase = 'victory';
  completeEncounter(restored, elite);
  restored.restPending = false;
  for (const goal of Object.values(restored.adventure.goals)) goal.status = 'completed';
  completeAdventureNode(restored, book);
  assert.equal(beginEncounter(restored).units[heroId].buffs.bleed, undefined);
});

test('a battle transition saves the prepared encounter and rejects the previous encounter state', () => {
  const { book, expedition } = adventureFixture();
  const battle = beginEncounter(expedition);
  battle.phase = 'victory';
  completeEncounter(expedition, battle);
  Object.assign(expedition.adventure.event, { choiceId: 'choice-1', resolved: true });
  completeAdventureNode(expedition, book);

  const session = {
    runtime: { mode: 'event' },
    journey: { expedition },
    ai: { activeScript: book, chat: { quick: [] } },
    battle: { state: battle, playing: false },
  };
  assert.equal(adventureSnapshot(session), null);

  session.runtime.mode = 'loading';
  session.runtime.adventureCheckpointLoading = true;
  session.battle.state = beginEncounter(expedition);
  const snapshot = adventureSnapshot(session);
  assert.ok(validAdventureSnapshot(snapshot));
  assert.equal(snapshot.state.encounter, 2);
  assert.equal(validAdventureSnapshot({ ...snapshot, state: battle }), false);
});

test('a chief battle interrupted during settlement resumes before granting rewards and presents them once', async () => {
  const { book, expedition } = adventureFixture();
  expedition.index = 4;
  const battle = beginEncounter(expedition);
  battle.phase = 'victory';
  book.runId = expedition.id;
  const library = newLibrary();
  const gold = library.inventory.gold;
  const session = {
    runtime: { mode: 'battle' },
    journey: { expedition },
    ai: {
      library,
      activeScript: book,
      generationOptions: {},
      chat: { quick: [] },
    },
    battle: { state: battle, playing: false },
  };
  const { promise, resolve } = Promise.withResolvers();
  const panels = [];
  const context = {
    session,
    generation: { showScene() {}, save() {} },
    audio: { play() {} },
    lootConflicts: { resolve: () => promise },
    settlement: { show: (result) => panels.push(result) },
  };
  const interrupted = createJourney(context).showResult();
  const snapshot = adventureSnapshot(session);
  assert.ok(validAdventureSnapshot(snapshot));
  assert.equal(adventureResumeStage(snapshot.journey.expedition, snapshot.state), 'settlement');
  assert.equal(library.inventory.gold, gold);

  session.journey = snapshot.journey;
  session.battle.state = snapshot.state;
  resolve(true);
  await interrupted;
  const resumed = createJourney(context);
  await resumed.showResult();
  assert.equal(library.inventory.gold, gold + 100);
  assert.ok(validAdventureSnapshot(adventureSnapshot(session)));
  await resumed.showResult();
  assert.equal(library.inventory.gold, gold + 100);
  assert.equal(panels.length, 2);
  assert.ok(panels.every((panel) => panel.complete));
});
