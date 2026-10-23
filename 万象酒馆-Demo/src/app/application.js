import { createRequestControls } from './request-controls.js';
import { createGenerationAccess } from './generation-access.js';
import { createBookshelf } from './bookshelf.js';
import { createEmblems } from './emblems.js';
import { mountDisplay } from './display.js';
import { createCheckpoint } from '../storage/checkpoint.js';
import { createApiClient } from '../ai/api-client.js';
import { createShop } from './shop.js';
import { createLootConflicts } from './loot-conflicts.js';
import { createBackpack } from './backpack.js';
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
import { createDebugAPI } from './debug.js';
import { createEventScope } from '../shared/events.js';
import { mountTooltips } from '../ui.js';
import { assertGameData } from '../validation.js';
import { createGeneration } from './generation.js';
import { createRoster } from './roster.js';
import { createAudio } from './audio.js';
import { createDestinations } from './destinations.js';
import { createSaveManager } from './saves.js';
import { createRecords } from './records.js';
import { createOnboarding } from './onboarding.js';
import { createFirstRun } from './first-run.js';
import { createChat } from './chat.js';
import { createPresetExtensions } from './preset-extensions.js';
import { createSummoning } from './summoning.js';
import { createMemory } from './memory.js';
import { createEquipment } from './equipment.js';
import { createSettlement } from './settlement.js';
import { createCompanionEvents } from './companion-events.js';

/** Composition root: wiring only, with one explicit application lifetime. */
export function createApplication({
  storage = globalThis.localStorage,
  apiClient = createApiClient(),
} = {}) {
  assertGameData();
  const context = /** @type {import('./context.js').AppContext} */ ({
    session: createSession(storage),
    storage,
    events: createEventScope(),
    apiClient,
  });
  context.apiClient = createRequestControls(apiClient, () => context.session.ai.generationOptions);
  context.generationAccess = createGenerationAccess(context);
  context.roster = createRoster(context);
  context.viewport = createViewport(context);
  context.audio = createAudio(context);
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
  context.onboarding = createOnboarding(context);
  context.firstRun = createFirstRun(context);
  context.summoning = createSummoning(context);
  context.extensions = createPresetExtensions(context);
  context.chat = createChat(context);
  context.memory = createMemory(context);
  context.bookshelf = createBookshelf(context);
  context.shop = createShop(context);
  context.lootConflicts = createLootConflicts(context);
  context.equipment = createEquipment(context);
  context.emblems = createEmblems(context);
  context.companionEvents = createCompanionEvents(context);
  context.settlement = createSettlement(context);

  const records = createRecords(context);
  for (const field of document.querySelectorAll('input, textarea, form'))
    field.setAttribute('autocomplete', 'off');
  mountInput(context);
  mountDisplay(context);
  const disposeTooltips = mountTooltips();
  context.checkpoint = createCheckpoint(context);
  const checkpoint = context.checkpoint.pending();
  if (checkpoint) void context.journey.resume(checkpoint);
  else {
    context.journey.returnInn();
    context.onboarding.init();
  }
  context.shell.renderParty();
  context.generationAccess.refresh();

  function dispose() {
    const runtime = context.session.runtime;
    if (runtime.disposed) return;
    runtime.disposed = true;
    runtime.token++;
    clearTimeout(runtime.toastTimer);
    clearTimeout(runtime.resizeTimer);
    context.events.dispose();
    context.generationAccess.dispose();
    context.checkpoint.dispose();
    context.apiClient.dispose();
    context.audio.dispose();
    context.generation.dispose();
    context.destinations.dispose();
    context.saves?.dispose?.();
    context.onboarding.dispose();
    context.firstRun.dispose();
    context.backpack.dispose();
    context.shop.dispose();
    context.lootConflicts.dispose();
    context.equipment.dispose();
    context.companionEvents.dispose();
    context.emblems.dispose();
    context.settlement.dispose();
    context.summoning.dispose();
    context.chat.dispose();
    context.memory.dispose();
    context.bookshelf.dispose();
    context.extensions.dispose();
    records.dispose();
    document.querySelectorAll('#round-start,#round-banner').forEach((el) => {
      el.getAnimations().forEach((a) => a.cancel());
      if (el.id === 'round-start') el.hidden = true;
    });
    runtime.view?.dispose();
    disposeTooltips?.();
    document.querySelectorAll('.card-flight,.ui-exit').forEach((element) => element.remove());
  }
  context.events.on(window, 'pagehide', dispose, { once: true });
  return { api: createDebugAPI(context), dispose };
}
