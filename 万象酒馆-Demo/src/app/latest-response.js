import { createRawResponse } from './raw-response.js';
import { API_LABELS } from './first-run-rules.js';

/** The latest received model response belongs to this page, never saves or AI context. */
export function createLatestResponse(context) {
  const button = document.querySelector('#generation-review');
  const home = document.createComment('Latest response button');
  button.before(home);
  const viewer = createRawResponse(context.events, 'latest-api-response', '上次 API 返回');
  let latest = null;
  button.hidden = false;
  button.disabled = false;
  button.textContent = '原始返回';
  button.title = '查看最近一次 API 回复';
  context.events.on(button, 'click', () => {
    viewer.show(
      latest || {
        message: '本页尚未收到 API 回复。',
        diagnostic: { rawText: '暂无返回。调用 API 后，这里会显示最近一次收到的回复。' },
      },
    );
  });
  const stage = document.querySelector('#gal-stage');
  const place = () => {
    const host = stage.hidden ? home.parentNode : stage.querySelector('.gal-controls');
    if (button.parentNode !== host) {
      if (stage.hidden) home.after(button);
      else host.append(button);
    }
  };
  const observer = new MutationObserver(place);
  observer.observe(stage, { attributes: true, attributeFilter: ['hidden'] });
  return {
    record(kind, result, failure = null) {
      if (context.session.runtime.disposed) return;
      const diagnostic = (failure || result)?.diagnostic;
      const raw = diagnostic?.rawText || result?.rawText;
      const body = raw || result?.content;
      latest = {
        message: `${API_LABELS[kind] || kind} · ${failure ? '调用失败' : '已收到回复'}${raw ? '' : '（接口未提供模型原文，以下为实际返回的数据）'}${failure ? `\n${failure.message}` : ''}`,
        diagnostic: {
          rawText: body || (failure ? failure.message : JSON.stringify(result, null, 2)),
        },
      };
      button.title = `查看上次${API_LABELS[kind] || kind}返回`;
    },
    dispose() {
      observer.disconnect();
      home.after(button);
      home.remove();
      viewer.dispose();
      latest = null;
    },
  };
}
