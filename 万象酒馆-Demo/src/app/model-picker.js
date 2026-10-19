import { query as $ } from './dom.js';

/** A visible selectable model list, plus an independent manual ID field. */
export function createModelPicker({ events, api, saveProfile, status }) {
  const list = $('#ai-model-list');
  function clear() {
    list.replaceChildren();
    $('#ai-model-picker').hidden = true;
  }
  events.on($('#ai-models'), 'click', async () => {
    const button = $('#ai-models');
    button.disabled = true;
    try {
      await saveProfile();
      const result = await api(`models/${$('#ai-kind').value}`, {});
      const models = [...new Set(result.models)].sort((a, b) => a.localeCompare(b));
      list.replaceChildren(...models.map((id) => new Option(id, id)));
      list.value = $('#ai-model').value;
      $('#ai-model-picker').hidden = false;
      $('#ai-model-count').textContent = `${models.length} 个可用模型`;
      status(
        models.length
          ? '点击列表中的模型即可选用，也可在上方填写自定义模型 ID。'
          : '接口返回了空模型列表，可手动填写模型 ID。',
      );
    } catch (failure) {
      status(failure.message);
    } finally {
      button.disabled = false;
    }
  });
  events.on(list, 'change', () => {
    $('#ai-model').value = list.value;
    status(`已选择模型：${list.value}，保存连接即可记住。`);
  });
  events.on($('#ai-model'), 'input', () => {
    list.value = $('#ai-model').value;
  });
  return { clear };
}
