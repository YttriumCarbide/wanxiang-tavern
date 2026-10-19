/** Both current script trees and older [type, payload] exports are accepted. */
export function presetHelperScripts(preset) {
  const result = [];
  function visit(value, inherited = true) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      if (value.length === 2 && typeof value[0] === 'string' && typeof value[1] === 'object')
        visit({ type: value[0], ...value[1] }, inherited);
      else value.forEach((child) => visit(child, inherited));
      return;
    }
    const enabled = inherited && value.enabled !== false;
    if (typeof value.content === 'string' && value.type !== 'folder') {
      if (value.content.length > 8000000) throw Error('酒馆助手脚本不能超过800万字符');
      result.push({
        id: String(value.id || `helper-${result.length}`),
        name: String(value.name || '预设脚本'),
        content: value.content,
        enabled,
        buttons: value.button?.buttons || value.buttons || [],
        data: value.data || {},
      });
    }
    for (const key of ['scripts', 'children', 'items']) if (value[key]) visit(value[key], enabled);
  }
  visit(
    preset?.extensions?.tavern_helper?.scripts ||
      preset?.extensions?.TavernHelper?.scripts ||
      preset?.tavern_helper?.scripts ||
      [],
  );
  if (result.length > 100) throw Error('一个预设最多100个酒馆助手脚本');
  return result;
}
