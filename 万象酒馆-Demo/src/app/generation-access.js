import { skippingAi } from '../generation-options.js';

/** Disabled fieldsets preserve each controller's independent busy/validation state. */
export function createGenerationAccess(context) {
  const selector = [
    '#creation-generate',
    '#chat-send',
    '#quick-chat-send',
    '#script-rewrite',
    '#rewrite-help-confirm',
    '#memory-generate',
    '#forge-refine',
    '[data-world-submit]',
    '[data-chat-retry]',
    '[data-requires-ai="true"]',
  ].join(',');
  const wrappers = new Map();
  function refresh() {
    for (const button of document.querySelectorAll(selector)) {
      if (wrappers.has(button)) continue;
      const group = document.createElement('fieldset');
      group.className = 'ai-generation-control';
      button.before(group);
      group.append(button);
      wrappers.set(button, group);
    }
    const disabled = skippingAi(context.session.ai.generationOptions);
    for (const [button, group] of wrappers) {
      if (!group.isConnected) {
        wrappers.delete(button);
        continue;
      }
      group.disabled = disabled && button.matches(selector);
      group.title = group.disabled ? '开发者模式已开启“跳过AI生成”' : '';
    }
  }
  const observer = new MutationObserver(refresh);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-requires-ai'],
  });
  return {
    refresh,
    dispose() {
      observer.disconnect();
      for (const [button, group] of wrappers) group.replaceWith(button);
      wrappers.clear();
    },
  };
}
