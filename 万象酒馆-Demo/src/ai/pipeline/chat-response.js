import { chatRegexScripts } from './chat-request.js';
import { readOutputTags } from '../output-tags.js';
import { validateTaskReply } from '../../adventure/state.js';

export async function chatResponse(kind, content, scripts, input = {}, runRegexTasks) {
  scripts = chatRegexScripts(kind, scripts);
  let text = content;
  let actions = { affection: [], agreeToAdventure: [] };
  let adventure;
  const invalidAdventure = [];
  if (kind === 'quick-chat' || kind === 'chat') {
    const sections = readOutputTags(content, [
      { tag: 'wanxiang_chat' },
      { tag: 'wanxiang_actions', json: true },
      {
        tag: 'wanxiang_adventure',
        json: true,
        accept(value) {
          if (kind !== 'quick-chat' || input.adventure?.mode !== 'quest') return false;
          try {
            validateTaskReply(JSON.parse(value), input.adventure);
            return true;
          } catch (failure) {
            invalidAdventure.push(failure.message);
            return false;
          }
        },
      },
    ]);
    const body = sections.find((section) => section.tag === 'wanxiang_chat');
    if (!body?.content.trim()) throw Error('回复正文需要唯一一组wanxiang_chat标签');
    text = body.content.trim();
    if (kind === 'quick-chat' && input.adventure?.mode === 'quest') {
      const section = sections.find((item) => item.tag === 'wanxiang_adventure');
      if (!section)
        throw Error(
          invalidAdventure.length
            ? `任务数据无效：${invalidAdventure[0]}。可在原始返回中核对；已确认进度保留。`
            : '缺少任务状态，已确认进度保留，请重试本次回应',
        );
      try {
        adventure = validateTaskReply(JSON.parse(section.content), input.adventure);
      } catch (failure) {
        throw Error('任务数据无效：' + failure.message, { cause: failure });
      }
    }
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
    ...(adventure ? { adventure } : {}),
  };
}
