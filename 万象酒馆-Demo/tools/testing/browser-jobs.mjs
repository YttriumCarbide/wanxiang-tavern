import path from 'node:path';

/** Jobs share one browser, but the scheduler gives each job a separate service and output folder. */
export function browserJobs(scopes, results, root) {
  const jobs = [];
  const add = (name, operation, after = [], browserOnly = false) => {
    if (scopes.has(name)) jobs.push({ name, operation, after, browserOnly });
  };
  const simple = (name, file, method, after = [], browserOnly = false) =>
    add(
      name,
      async (options) => {
        const module = await import(`../../tests/browser/${file}.mjs`);
        return module[method](options);
      },
      after,
      browserOnly,
    );
  simple('battle-controls', 'battle-controls', 'battleControlChecks');
  simple('ring-gallery', 'ring-gallery', 'ringGalleryChecks');
  simple('gal', 'gal', 'galChecks');
  simple('equipment', 'equipment', 'equipmentChecks');
  simple('enemy-progression', 'enemy-progression', 'enemyProgressionChecks');
  simple('mobile', 'mobile', 'mobileChecks');
  simple('forest', 'forest', 'forestChecks');
  simple('frost', 'frost', 'frostChecks');
  simple('workshop', 'workshop', 'workshopChecks', [], true);
  simple('universal-enemies', 'universal-enemies', 'universalEnemyChecks');
  simple('developer-mode', 'developer-mode', 'developerModeChecks');
  simple('status-emblems', 'status-emblems', 'statusEmblemChecks', [], true);
  simple('arcade', 'arcade', 'arcadeChecks');
  simple('generation-experience', 'generation-experience', 'generationExperienceChecks');
  simple('battle-markers', 'battle-markers', 'battleMarkerChecks');
  simple(
    'credential-persistence',
    'credential-persistence',
    'credentialPersistenceChecks',
    [],
    true,
  );
  simple('vertex-portraits', 'vertex-portraits', 'vertexPortraitChecks');
  simple('tutorial-revision', 'tutorial-revision', 'tutorialRevisionChecks');
  simple('enemy-portraits', 'enemy-portraits', 'enemyPortraitChecks');
  simple('humanoid-enemies', 'humanoid-enemies', 'humanoidEnemyChecks');
  simple('worlds-emblems', 'worlds-emblems', 'worldsEmblemsChecks');
  simple('opencode', 'opencode', 'opencodeBrowserChecks');
  simple('onboarding', 'onboarding', 'onboardingChecks');
  add('settings', async (options) => {
    const { apiSettingsChecks } = await import('../../tests/browser/api-settings.mjs');
    const { equipmentChecks } = await import('../../tests/browser/equipment.mjs');
    const { generationOptionsChecks } = await import('../../tests/browser/generation-options.mjs');
    return {
      ...(await apiSettingsChecks(options)),
      generationOptions: await generationOptionsChecks(options),
      equipment: await equipmentChecks(options),
    };
  });
  simple('chat', 'chat', 'chatChecks');
  add('preparation', async (options) => {
    const { preparationChecks } = await import('../../tests/browser/preparation.mjs');
    const { settlementChecks } = await import('../../tests/browser/settlement.mjs');
    const { storyFeedChecks } = await import('../../tests/browser/story-feed.mjs');
    const { journeyRefreshChecks } = await import('../../tests/browser/journey-refresh.mjs');
    return {
      preparation: await preparationChecks(options),
      story: await storyFeedChecks(options),
      settlement: await settlementChecks(options),
      refresh: await journeyRefreshChecks(options),
    };
  });
  const environment = ['environment', 'artbook', 'rooms'].find((name) => scopes.has(name));
  if (environment)
    add(environment, async (options) => {
      const { artbookChecks } = await import('../../tests/browser/artbook.mjs');
      const { guestRoomChecks } = await import('../../tests/browser/guest-room.mjs');
      const { roomChatChecks } = await import('../../tests/browser/room-chat.mjs');
      const checked = await Promise.allSettled([
        scopes.has('environment') || scopes.has('artbook') ? artbookChecks(options) : null,
        scopes.has('environment') || scopes.has('rooms') ? guestRoomChecks(options) : null,
        scopes.has('environment') || scopes.has('rooms') ? roomChatChecks(options) : null,
      ]);
      const errors = checked.filter((item) => item.status === 'rejected');
      if (errors.length)
        throw new AggregateError(
          errors.map((item) => item.reason),
          errors.map((item) => item.reason.stack).join('\n'),
        );
      return { artbook: checked[0].value, rooms: checked[1].value, chat: checked[2].value };
    });
  simple('ai', 'generation', 'generationChecks');
  simple('audio', 'audio', 'battleMusicChecks');
  add('layout', async (options) => {
    const { layout } = await import('../../tests/browser/layout.mjs');
    return layout({ ...options, fixture: path.join(root, 'tests/fixtures/layout.json') });
  });
  add(
    'ui',
    async (options) => {
      const failed = results.find(
        (result) => ['settings', environment].includes(result.name) && !result.passed,
      );
      if (failed)
        throw Error(`Prerequisite ${failed.name} failed; fix that result before rerunning UI`);
      const { smoke } = await import('../../tests/browser/smoke.mjs');
      return smoke({
        ...options,
        settingsChecked: results.find((result) => result.name === 'settings' && result.passed)
          ?.detail,
        environmentChecked: results.find(
          (result) => ['environment', 'rooms', 'artbook'].includes(result.name) && result.passed,
        )?.detail,
      });
    },
    ['settings', environment].filter((name) => name && scopes.has(name)),
  );
  for (const [name, file, method, field] of [
    ['summoning', 'summoning', 'summoningChecks', 'summoning'],
    ['death-effects', 'card-death', 'cardDeathChecks', 'cardDeaths'],
    ['intents', 'enemy-intents', 'enemyIntentChecks', 'enemyIntents'],
    ['destinations', 'destination-pager', 'destinationPagerChecks', 'destinationPager'],
  ])
    add(
      name,
      async (options) => {
        const checked = results.find((result) => result.name === 'ui' && result.passed)?.detail?.[
          field
        ];
        if (checked) return checked;
        const module = await import(`../../tests/browser/${file}.mjs`);
        return module[method](options);
      },
      scopes.has('ui') ? ['ui'] : [],
    );
  return jobs;
}
