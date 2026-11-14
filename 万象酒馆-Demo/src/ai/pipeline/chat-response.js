import { chatRegexScripts } from './chat-request.js';
import { readOutputTags } from '../output-tags.js';
import { validateTaskReply } from '../../adventure/state.js';
import { normalizeInvitationTurn } from '../../invitation.js';
import { BODY_TAGS, OUTPUT_TAG } from '../output-protocol.js';
import { normalizeQuestLead } from '../../tavern-quests.js';

export async function chatResponse(kind, content, scripts, input = {}, runRegexTasks) {
  scripts = chatRegexScripts(kind, scripts);
  let text = content;
  let actions = { affection: [], agreeToAdventure: [] };
  let adventure;
  let invitation;
  let dialogue;
  let quest;
  let questNegotiation;
  const invalidAdventure = [];
  if (kind === 'quick-chat' || kind === 'chat') {
    const sections = readOutputTags(content, [
      ...BODY_TAGS.map((tag) => ({ tag })),
      { tag: 'wanxiang_actions', json: true },
      { tag: 'wanxiang_invitation', json: true },
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
    const bodies = sections.filter((section) => BODY_TAGS.includes(section.tag));
    if (bodies.length !== 1) throw Error(`回复正文需要唯一一组${OUTPUT_TAG}标签`);
    const body = bodies[0];
    if (!body.content.trim()) throw Error(`${OUTPUT_TAG}标签内的正文不能为空`);
    text = body.content.trim();
    if (input.questOffer) {
      try {
        const leads = readOutputTags(content, [{ tag: 'wanxiang_quest', json: true }]);
        if (leads.length === 1 && leads[0].start >= body.end)
          quest = normalizeQuestLead(JSON.parse(leads[0].content));
      } catch {
        // A malformed optional lead does not discard the dialogue.
      }
    }
    if (input.questNegotiation) {
      const response = readOutputTags(content, [{ tag: 'wanxiang_negotiation', json: true }]);
      const score = response.length === 1 ? JSON.parse(response[0].content).score : null;
      if (!Number.isInteger(score) || score < 0 || score > 5) throw Error('缺少有效的交涉评分');
      questNegotiation = score;
    }
    if (input.dialogueScenes?.length) {
      try {
        const section = readOutputTags(content, [{ tag: 'wanxiang_dialogue', json: true }])[0];
        const changes = section?.start >= body.end && JSON.parse(section.content);
        if (Array.isArray(changes) && changes.length <= 30) dialogue = changes;
      } catch {
        // Dialogue edits are optional data. The accepted chat body stays available.
      }
    }
    if (kind === 'quick-chat' && input.invitation) {
      const section = sections.find((item) => item.tag === 'wanxiang_invitation');
      if (!section) throw Error('缺少约见评分，已确认进度保留');
      invitation = normalizeInvitationTurn(JSON.parse(section.content), input.invitation);
    }
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
        if (input.dialogueScenes?.length) adventure.patches = [];
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
    ...(invitation ? { invitation } : {}),
    ...(dialogue ? { dialogue } : {}),
    ...(quest ? { quest } : {}),
    ...(questNegotiation !== undefined ? { questNegotiation } : {}),
  };
}
