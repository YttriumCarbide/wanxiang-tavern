export const allScopes = [
  'enemy-progression',
  'mobile',
  'forest',
  'workshop',
  'universal-enemies',
  'developer-mode',
  'status-emblems',
  'arcade',
  'generation-experience',
  'battle-markers',
  'credential-persistence',
  'humanoid-enemies',
  'vertex-portraits',
  'quality',
  'tutorial-revision',
  'enemy-portraits',
  'provider-live',
  'opencode',
  'battle-controls',
  'worlds-emblems',
  'static',
  'environment',
  'rooms',
  'artbook',
  'chat',
  'settings',
  'preparation',
  'summoning',
  'core',
  'ui',
  'layout',
  'server',
  'launcher',
  'expedition',
  'ai',
  'models',
  'death-effects',
  'intents',
  'destinations',
  'audio',
  'onboarding',
];
export function selectScopes(args) {
  const scopes = new Set();
  const option = (name) => {
    const index = args.indexOf(name);
    if (index < 0) return null;
    if (!args[index + 1] || args[index + 1].startsWith('--')) throw Error(`${name} needs a value`);
    return args[index + 1];
  };
  for (const arg of args.filter((arg) => arg.startsWith('--')))
    if (!['--scope', '--changed'].includes(arg)) throw Error(`Unknown option: ${arg}`);
  const explicit = option('--scope');
  if (explicit) explicit.split(',').forEach((scope) => scopes.add(scope.trim()));
  const changed = option('--changed');
  if (changed) {
    scopes.add('quality');
    for (const original of changed.split(',')) {
      const file = original.replaceAll('\\', '/');
      if (/建模工具|\.py$|requirements/.test(file)) scopes.add('models');
      else if (
        /src\/ai\/|server\/|src\/app\/(?:generation|generation-diagnostics|story|ai-presets|worldbook-editor|worldbook-fields|request-preview)\.js|tests\/browser\/generation|prompts\//.test(
          file,
        )
      ) {
        scopes.add('core');
        scopes.add('server');
        scopes.add('ai');
      } else if (/tests\/browser\/expedition\./.test(file)) scopes.add('expedition');
      else if (
        /src\/(engine|data|expedition|validation|turn-flow)\.js|tests\/[^/]+\.test\.js|tests\/planner/.test(
          file,
        )
      )
        scopes.add('core');
      else if (/server\.cjs|tools\/testing\/server\.mjs/.test(file)) scopes.add('server');
      else if (/\.(cmd|ps1)$/.test(file)) scopes.add('launcher');
      else if (/tests\/browser\/layout|styles\//.test(file)) scopes.add('ui');
      else if (/src\/|tests\/browser\/|\.css$|\.html$|assets\//.test(file)) scopes.add('ui');
      else if (/tools\/(test\.mjs|testing\/runtime\.mjs)/.test(file)) {
        scopes.add('server');
        scopes.add('launcher');
      }
    }
  }
  if (!scopes.size) scopes.add('core');
  if (scopes.delete('all')) allScopes.forEach((scope) => scopes.add(scope));
  if (scopes.has('ui')) scopes.add('layout');
  for (const scope of scopes)
    if (!allScopes.includes(scope)) throw Error(`Unknown scope: ${scope}`);
  return scopes;
}
