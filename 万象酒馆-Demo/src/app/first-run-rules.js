export const API_LABELS = Object.freeze({
  character: '角色生成',
  script: '副本剧本',
  chat: '酒馆交流',
  'quick-chat': '快速闲聊',
  summary: '记忆总结',
  creation: '以太造物',
  map: '地图构筑',
});
export const PROMPT_KINDS = Object.freeze([
  'character',
  'script',
  'chat',
  'quick-chat',
  'map',
  'creation',
]);
export const CONNECTION_KINDS = Object.freeze(
  Object.keys(API_LABELS).filter((kind) => kind !== 'quick-chat'),
);

export function missingSetup(status, stage) {
  const kinds = stage === 'connections' ? CONNECTION_KINDS : PROMPT_KINDS;
  return kinds.filter((kind) => !status[kind]?.[stage === 'connections' ? 'connection' : 'prompt']);
}
