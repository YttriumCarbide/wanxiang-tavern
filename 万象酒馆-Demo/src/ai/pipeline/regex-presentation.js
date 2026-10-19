/** Display-only replacements never modify saved lore, numeric data or future API context. */
export async function formatRegexPresentation(entry, kind, scripts, runRegexTasks) {
  const paths =
    kind === 'character'
      ? [['worldbook']]
      : entry.schemaVersion >= 3
        ? entry.story.map((_, index) => ['story', index])
        : [
            ['opening'],
            ...entry.scenes.flatMap((scene, index) => [
              ['scenes', index, 'opening'],
              ...['before', 'after', 'interlude'].flatMap((stage) =>
                scene[stage].map((_, line) => ['scenes', index, stage, line]),
              ),
            ]),
          ];
  const source = (path) => {
    if (kind === 'character') return entry.setting.worldbook;
    if (path[0] === 'story') return entry.story[path[1]];
    if (path.length === 1) return entry.opening;
    const scene = entry.scenes[path[1]];
    return path.length === 3 ? scene.opening : scene[path[2]][path[3]].text;
  };
  const displayScripts = scripts.filter((script) => script.markdownOnly);
  if (!displayScripts.length) return;
  const results = await runRegexTasks(
    displayScripts,
    paths.map((path) => ({
      text: source(path),
      placement: 2,
      options: { kind, isMarkdown: true },
    })),
  );
  entry.display = {};
  paths.forEach((path, index) => {
    let target = entry.display;
    for (let part = 0; part < path.length - 1; part++) target = target[path[part]] ||= {};
    target[path.at(-1)] = results[index].text;
  });
}
