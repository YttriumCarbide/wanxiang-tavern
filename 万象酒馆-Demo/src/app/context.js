/**
 * Explicit controller ports; no module globals or circular ES module imports.
 * @typedef {Object} AppContext
 * @property {ReturnType<typeof import('./arcade.js').createArcade>} arcade
 * @property {ReturnType<typeof import('./generation-access.js').createGenerationAccess>} generationAccess
 * @property {ReturnType<typeof import('./emblems.js').createEmblems>} emblems
 * @property {Storage|ReturnType<typeof import('../storage/database.js').createGameStorage>} storage
 * @property {ReturnType<typeof import('../storage/checkpoint.js').createCheckpoint>} checkpoint
 * @property {ReturnType<typeof import('../ai/api-client.js').createApiClient>} apiClient
 * @property {ReturnType<typeof import('./session.js').createSession>} session
 * @property {ReturnType<typeof import('../shared/events.js').createEventScope>} events
 * @property {ReturnType<typeof import('./viewport.js').createViewport>} viewport
 * @property {ReturnType<typeof import('./audio.js').createAudio>} audio
 * @property {ReturnType<typeof import('./roster.js').createRoster>} roster
 * @property {ReturnType<typeof import('./generation.js').createGeneration>} generation
 * @property {ReturnType<typeof import('./destinations.js').createDestinations>} destinations
 * @property {ReturnType<typeof import('./shell.js').createShell>} shell
 * @property {ReturnType<typeof import('./journey.js').createJourney>} journey
 * @property {ReturnType<typeof import('./settlement.js').createSettlement>} settlement
 * @property {ReturnType<typeof import('./selection.js').createSelection>} selection
 * @property {ReturnType<typeof import('./planning.js').createPlanning>} planning
 * @property {ReturnType<typeof import('./details.js').createDetails>} details
 * @property {ReturnType<typeof import('./timeline.js').createTimeline>} timeline
 * @property {ReturnType<typeof import('./renderer.js').createRenderer>} renderer
 * @property {ReturnType<typeof import('./playback.js').createPlayback>} playback
 * @property {ReturnType<typeof import('./drag.js').createDrag>} drag
 * @property {ReturnType<typeof import('./saves.js').createSaveManager>} [saves]
 * @property {ReturnType<typeof import('./onboarding.js').createOnboarding>} onboarding
 * @property {ReturnType<typeof import('./first-run.js').createFirstRun>} firstRun
 * @property {ReturnType<typeof import('./shop.js').createShop>} shop
 * @property {ReturnType<typeof import('./loot-conflicts.js').createLootConflicts>} lootConflicts
 * @property {ReturnType<typeof import('./backpack.js').createBackpack>} backpack
 * @property {ReturnType<typeof import('./chat.js').createChat>} chat
 * @property {ReturnType<typeof import('./memory.js').createMemory>} memory
 * @property {ReturnType<typeof import('./bookshelf.js').createBookshelf>} bookshelf
 * @property {ReturnType<typeof import('./equipment.js').createEquipment>} equipment
 * @property {ReturnType<typeof import('./companion-events.js').createCompanionEvents>} companionEvents
 * @property {ReturnType<typeof import('./preset-extensions.js').createPresetExtensions>} extensions
 * @property {ReturnType<typeof import('./summoning.js').createSummoning>} summoning
 */
export {};
