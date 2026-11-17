import { chatRegexScripts } from './chat-request.js';
import { readOutputTags } from '../output-tags.js';
import { validateTaskReply } from '../../adventure/state.js';
import { normalizeInvitationTurn } from '../../invitation.js';
import { BODY_TAGS, OUTPUT_TAG } from '../output-protocol.js';
import { normalizeQuestLead } from '../../tavern-quests.js';
import {
  DC_SPLIT_MARKER,
  normalizeDcTurnOutcome,
  parseDcSplitProse,
  splitChoiceProseFallback,
} from '../../dc-rp.js';

const ATTR_KEYWORDS = Object.freeze([
  ['str', /打|砸|推|撞|扛|举|摔|揍|踢|拳|砍|劈|力|强拆|撬/],
  ['dex', /偷|溜|潜|躲|爬|闪|翻|跳|绕|悄|阴影|灵巧|拆解/],
  ['con', /忍|撑|喝|等|熬|憋|硬抗|蹲守|扛住|耐|抵/],
  ['int', /魔|法术|咒|读|想|分析|计算|推理|炼|幻|阵|符文|机关|修复|研究/],
  ['wis', /看|观察|听|找|搜|察|闻|盯|规律|直觉|辨认|感应/],
  ['cha', /说|骗|劝|假装|贿赂|唱|谈|哄|吓|装|聊|送|请|夸|交涉|安抚/],
]);

function inferFallbackAttr(text, turnIndex = 0) {
  const str = String(text || '');
  const matched = ATTR_KEYWORDS.find(([, re]) => re.test(str));
  if (matched) return matched[0];
  const order = ['wis', 'int', 'cha', 'str', 'dex', 'con'];
  let hash = Math.abs(Math.trunc(turnIndex));
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  return order[hash % order.length];
}

function stripDcSplitMarker(text) {
  return String(text || '')
    .replace(
      new RegExp(`\\r?\\n?${DC_SPLIT_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\r?\\n?`, 'g'),
      '\n',
    )
    .trim();
}

export async function chatResponse(kind, content, scripts, input = {}, runRegexTasks) {
  scripts = chatRegexScripts(kind, scripts);
  let text = content;
  let actions = { affection: [], agreeToAdventure: [] };
  let adventure;
  let invitation;
  let dialogue;
  let quest;
  let questNegotiation;
  let dcOutcome;
  const invalidAdventure = [];
  const fixedCheck =
    input.dcContext?.choiceCheck ||
    (input.adventure?.mode === 'event' ? input.adventure.choiceCheck : null);
  const allowDc = Boolean(fixedCheck) || kind !== 'quick-chat' || input.dcContext?.mode === 'free';
  if (kind === 'quick-chat' || kind === 'chat') {
    const sections = readOutputTags(content, [
      ...BODY_TAGS.map((tag) => ({ tag })),
      { tag: 'wanxiang_actions', json: true },
      { tag: 'wanxiang_invitation', json: true },
      { tag: 'wanxiang_dc', json: true },
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
    const forcedFree = Boolean(input.dcContext?.mode === 'free' && input.dcContext?.forced);
    const dcMeta = { mapOrLevel: input.dcContext?.mapOrLevel ?? null };
    const dcTag = allowDc ? sections.find((section) => section.tag === 'wanxiang_dc') : null;
    if (dcTag) {
      let parsedDc;
      try {
        parsedDc = JSON.parse(dcTag.content);
      } catch {
        throw Error('DC检定JSON格式错误');
      }
      const payload =
        forcedFree && parsedDc?.triggered !== true ? { ...parsedDc, triggered: true } : parsedDc;
      dcOutcome = normalizeDcTurnOutcome(payload, input.characters || [], fixedCheck, dcMeta);
    } else if (fixedCheck) {
      dcOutcome = normalizeDcTurnOutcome(
        { triggered: true },
        input.characters || [],
        fixedCheck,
        dcMeta,
      );
    } else if (forcedFree) {
      const turnSeed = (input.history?.length || 0) + (input.adventure?.responses?.length || 0);
      const inferredAttr = inferFallbackAttr(input.text, turnSeed);
      const fallbackDc = input.dcContext?.defaultDc || 8;
      const contextActors = input.dcContext?.actors || [];
      const bestActor = [...contextActors].sort(
        (a, b) => (b.attrs?.[inferredAttr]?.mod ?? 0) - (a.attrs?.[inferredAttr]?.mod ?? 0),
      )[0];
      const mod = bestActor?.attrs?.[inferredAttr]?.mod ?? 0;
      const total = (input.dcContext?.diceSum ?? 7) + mod;
      dcOutcome = normalizeDcTurnOutcome(
        {
          triggered: true,
          actorId: bestActor?.id || input.characters?.[0]?.id,
          attr: inferredAttr,
          dc: fallbackDc,
          outcome: input.dcContext?.doubleSix
            ? 'crit'
            : input.dcContext?.doubleOne
              ? 'fumble'
              : total >= fallbackDc
                ? 'success'
                : 'fail',
        },
        input.characters || [],
        null,
        dcMeta,
      );
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
              item.delta < -5 ||
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
  const forceSplit = Boolean(
    fixedCheck || (input.dcContext?.mode === 'free' && input.dcContext?.forced),
  );
  const processedSplit = forceSplit
    ? splitChoiceProseFallback(processed.text)
    : parseDcSplitProse(processed.text);
  const displaySplit = forceSplit
    ? splitChoiceProseFallback(display.text)
    : parseDcSplitProse(display.text);
  const finalContent = parseDcSplitProse(processed.text).hasMarker
    ? stripDcSplitMarker(processed.text)
    : processed.text;
  const finalDisplay = parseDcSplitProse(display.text).hasMarker
    ? stripDcSplitMarker(display.text)
    : display.text;
  const includeDcSplit = allowDc && processedSplit.hasMarker && processedSplit.beforeText;
  return {
    content: finalContent,
    display: finalDisplay,
    ...(kind === 'chat' ? { actions } : {}),
    ...(adventure ? { adventure } : {}),
    ...(invitation ? { invitation } : {}),
    ...(dialogue ? { dialogue } : {}),
    ...(quest ? { quest } : {}),
    ...(questNegotiation !== undefined ? { questNegotiation } : {}),
    ...(allowDc && dcOutcome ? { dcOutcome } : {}),
    ...(allowDc && Array.isArray(input.dcContext?.dice)
      ? { dcPreRoll: { dice: input.dcContext.dice } }
      : {}),
    ...(includeDcSplit
      ? {
          dcSplit: {
            beforeText: processedSplit.beforeText,
            afterText: processedSplit.afterText,
            displayBeforeText: displaySplit.hasMarker
              ? displaySplit.beforeText
              : processedSplit.beforeText,
            displayAfterText: displaySplit.hasMarker
              ? displaySplit.afterText
              : processedSplit.afterText,
          },
        }
      : {}),
  };
}
