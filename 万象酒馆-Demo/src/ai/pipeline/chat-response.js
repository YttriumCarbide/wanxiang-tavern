import { chatRegexScripts } from './chat-request.js';
import { readOutputTags } from '../output-tags.js';

export async function chatResponse(kind, content, scripts, input = {}, runRegexTasks) {
  scripts = chatRegexScripts(kind, scripts);
  let text = content;
  let actions = { affection: [], agreeToAdventure: [] };
  if (kind === 'quick-chat' || kind === 'chat') {
    const sections = readOutputTags(content, [
      { tag: 'wanxiang_chat' },
      { tag: 'wanxiang_actions', json: true },
    ]);
    const body = sections.find((section) => section.tag === 'wanxiang_chat');
    if (!body?.content.trim()) throw Error('回复正文需要唯一一组wanxiang_chat标签');
    text = body.content.trim();
    if (kind === 'chat') {
      const actionTag = sections.find((section) => section.tag === 'wanxiang_actions');
      if (actionTag) {
        try {
          actions = JSON.parse(actionTag.content);
        } catch {
          throw Error('交流指令JSON格式错误');
        }
        const ids = new Set((input.characters || []).map((item) => item.id));
        if (
          !actions ||
          typeof actions !== 'object' ||
          !Array.isArray(actions.affection) ||
          !Array.isArray(actions.agreeToAdventure) ||
          actions.affection.length > 100 ||
          actions.agreeToAdventure.length > 100 ||
          actions.affection.some(
            (item) =>
              !item ||
              !ids.has(item.id) ||
              !Number.isInteger(item.delta) ||
              item.delta < 0 ||
              item.delta > 5,
          ) ||
          actions.agreeToAdventure.some((id) => !ids.has(id))
        )
          throw Error('好感度或同行指令无效');
      }
    }
  }
  const processed = (
    await runRegexTasks(scripts, [{ text, placement: 2, options: { kind: 'script' } }])
  )[0];
  const display = (
    await runRegexTasks(scripts, [
      { text: processed.text, placement: 2, options: { kind: 'script', isMarkdown: true } },
    ])
  )[0];
  return {
    content: processed.text,
    display: display.text,
    ...(kind === 'chat' ? { actions } : {}),
  };
}
