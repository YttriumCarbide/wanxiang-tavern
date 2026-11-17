/** Identify units modeled as high-detail Overlords or wing-parts standing atop their battle card. */
export function shouldStandOnCard(definition) {
  return Boolean(definition && (definition.overlord || definition.standOnCard) && definition.model);
}

/** Collect deduplicated GLB asset URLs required for card-standing units in the active encounter. */
export function overlordAssetUrls(definitions) {
  const urls = new Set();
  for (const def of Object.values(definitions || {})) {
    if (shouldStandOnCard(def)) urls.add(`./assets/${def.model}`);
  }
  return [...urls];
}
