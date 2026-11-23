import { createRequestControls } from './request-controls.js';
import { createGenerationAccess } from './generation-access.js';
import { createBookshelf } from './bookshelf.js';
import { createWorkshop } from './workshop.js';
import { createEmblems } from './emblems.js';
import { mountDisplay } from './display.js';
import { createCheckpoint } from '../storage/checkpoint.js';
import { createApiClient } from '../ai/api-client.js';
import { createShop } from './shop.js';
import { createDining } from './dining.js';
import { createLootConflicts } from './loot-conflicts.js';
import { createBackpack } from './backpack.js';
import { createBattleReading } from './battle-reading.js';
import { createSession } from './session.js';
import { createViewport } from './viewport.js';
import { createShell } from './shell.js';
import { createJourney } from './journey.js';
import { createSelection } from './selection.js';
import { createPlanning } from './planning.js';
import { createDetails } from './details.js';
import { createTimeline } from './timeline.js';
import { createRenderer } from './renderer.js';
import { createPlayback } from './playback.js';
import { createDrag } from './drag.js';
import { mountInput } from './input.js';
import { createPortraitEditor } from './portrait-editor.js';
import { createDebugAPI } from './debug.js';
import { createEventScope } from '../shared/events.js';
import { mountTooltips } from '../ui.js';
import { assertGameData } from '../validation.js';
import { createGeneration } from './generation.js';
import { createDeparture } from './departure.js';
import { createRoster } from './roster.js';
import { createAudio } from './audio.js';
import { createDestinations } from './destinations.js';
import { createSaveManager } from './saves.js';
import { createRecords } from './records.js';
import { createOnboarding } from './onboarding.js';
import { createFirstRun } from './first-run.js';
import { createChat } from './chat.js';
import { createSummoning } from './summoning.js';
import { createMemory } from './memory.js';
import { createAdventure } from './adventure.js';
import { createEquipment } from './equipment.js';
import { createSettlement } from './settlement.js';
import { createCompanionEvents } from './companion-events.js';
import { createGalPlayer } from './gal.js';
import { createDiceStage } from './dice-stage.js';
import { createChapterTheater } from './chapter-theater.js';
import { createBattleBarks } from './battle-barks.js';
import { createOverlordBattle } from './overlord-battle.js';
import { createAssetStore } from '../shared/asset-store.js';
import { createPortraitPreloader } from './asset-preload.js';
import { createLatestResponse } from './latest-response.js';
import { createAntiRoutePanel } from './anti-route.js';
import { createDaily } from './daily.js';
import { createMapExpansion } from './map-expansion.js';
import { createTavernQuests } from './tavern-quests.js';
import { createGuild } from './guild.js';
import { createLedgerSidebar } from './ledger-sidebar.js';
import { createDeveloperTools } from './developer-tools.js';
import { createGameModifier } from './game-modifier.js';

/** Composition root: wiring only, with one explicit application lifetime. */
export function createApplication({
  storage = globalThis.localStorage,
  apiClient = createApiClient(),
  developerSandbox = false,
  contentUpdates,
} = {}) {
  assertGameData();
  const context = /** @type {import('./context.js').AppContext} */ ({
    session: createSession(storage),
    storage,
    events: createEventScope(),
    apiClient,
    contentUpdates,
    assets: createAssetStore(),
  });
  context.session.runtime.developerSandbox = developerSandbox;
  context.apiClient = createRequestControls(
    apiClient,
    () => context.session.ai.generationOptions,
    () => context.workshop,
    undefined,
    (kind, result, failure) => context.latestResponse?.record(kind, result, failure),
    () => context.session.ai.library,
    () => context.developer?.simulateRequest(),
  );
  context.generationAccess = createGenerationAccess(context);
  context.assetPreloader = createPortraitPreloader(context);
  context.roster = createRoster(context);
  context.viewport = createViewport(context);
  context.audio = createAudio(context);
  context.gal = createGalPlayer(context);
  context.dice = createDiceStage(context);
  context.chapterTheater = createChapterTheater(context);
  context.overlordBattle = createOverlordBattle(context);
  context.battleBarks = createBattleBarks(context);
  context.departure = createDeparture(context);
  context.generation = createGeneration(context);
  context.destinations = createDestinations(context);
  context.shell = createShell(context);
  context.saves = createSaveManager(context);
  context.journey = createJourney(context);
  context.selection = createSelection(context);
  context.planning = createPlanning(context);
  context.details = createDetails(context);
  context.timeline = createTimeline(context);
  context.renderer = createRenderer(context);
  context.playback = createPlayback(context);
  context.drag = createDrag(context);
  context.backpack = createBackpack(context);
  context.battleReading = createBattleReading(context);
  context.onboarding = createOnboarding(context);
  context.firstRun = createFirstRun(context);
  context.summoning = createSummoning(context);
  context.chat = createChat(context);
  const records = createRecords(context);
  context.records = records;
  context.memory = createMemory(context);
  context.mapExpansion = createMapExpansion(context);
  context.quests = createTavernQuests(context);
  context.guild = createGuild(context);
  context.adventure = createAdventure(context);
  context.bookshelf = createBookshelf(context);
  context.shop = createShop(context);
  context.dining = createDining(context);
  context.lootConflicts = createLootConflicts(context);
  context.equipment = createEquipment(context);
  context.emblems = createEmblems(context);
  context.companionEvents = createCompanionEvents(context);
  context.settlement = createSettlement(context);
  context.workshop = createWorkshop(context);
  context.daily = createDaily(context);
  context.latestResponse = createLatestResponse(context);
  context.ledger = createLedgerSidebar(context);
  const antiRoutePanel = createAntiRoutePanel(context);

  for (const field of document.querySelectorAll('input, textarea, form'))
    field.setAttribute('autocomplete', 'off');
  context.portraitEditor = createPortraitEditor(context);
  mountInput(context);
  mountDisplay(context);
  const disposeTooltips = mountTooltips();
  context.checkpoint = createCheckpoint(context);
  context.developer = createDeveloperTools(context);
  context.gameModifier = createGameModifier(context);
  const checkpoint = context.checkpoint.pending();
  if (checkpoint) void context.journey.resume(checkpoint);
  else {
    context.journey.returnInn();
    context.onboarding.init();
  }
  context.shell.renderParty();
  context.generationAccess.refresh();
  context.overlordBattle.checkReloadFourthWall();
  void contentUpdates?.start();

  function dispose() {
    const runtime = context.session.runtime;
    if (runtime.disposed) return;
    runtime.disposed = true;
    runtime.token++;
    clearTimeout(runtime.toastTimer);
    clearTimeout(runtime.resizeTimer);
    context.workshop.dispose();
    context.ledger.dispose();
    context.guild.dispose();
    context.daily.dispose();
    context.journey.dispose();
    context.departure.dispose();
    context.portraitEditor.dispose();
    context.shell.dispose();
    context.latestResponse.dispose();
    antiRoutePanel.dispose();
    context.assetPreloader.dispose();
    contentUpdates?.dispose();
    context.assets.dispose();
    context.events.dispose();
    context.generationAccess.dispose();
    context.checkpoint.dispose();
    context.developer.dispose();
    context.gameModifier.dispose();
    context.apiClient.dispose();
    context.audio.dispose();
    context.generation.dispose();
    context.destinations.dispose();
    context.dice.dispose();
    context.saves?.dispose?.();
    context.onboarding.dispose();
    context.firstRun.dispose();
    context.backpack.dispose();
    context.battleReading.dispose();
    context.shop.dispose();
    context.dining.dispose();
    context.lootConflicts.dispose();
    context.equipment.dispose();
    context.companionEvents.dispose();
    context.emblems.dispose();
    context.settlement.dispose();
    context.summoning.dispose();
    context.chat.dispose();
    context.battleBarks.dispose();
    context.overlordBattle.dispose();
    context.chapterTheater.dispose();
    context.gal.dispose();
    context.memory.dispose();
    context.mapExpansion.dispose();
    context.quests.dispose();
    context.adventure.dispose();
    context.bookshelf.dispose();
    records.dispose();
    document.querySelectorAll('#round-start,#round-banner').forEach((el) => {
      el.getAnimations().forEach((a) => a.cancel());
      if (el.id === 'round-start') el.hidden = true;
    });
    runtime.view?.dispose();
    disposeTooltips?.();
    document.querySelectorAll('.card-flight,.ui-exit').forEach((element) => element.remove());
  }
  context.events.on(window, 'pagehide', (event) => {
    if (!event.persisted) dispose();
  });
  return { api: createDebugAPI(context), dispose };
}
