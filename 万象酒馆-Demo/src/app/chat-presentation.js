import { CHAT_PLACES } from '../chat.js';
import { portraitUrl } from '../portraits.js';
import { escapeText } from '../ui.js';
import { html } from '../shared/html.js';
import { query as $ } from './dom.js';
import { appendChatMessage } from './chat-message.js';
import { relationship } from '../relationships.js';
import { readableGalText } from '../gal.js';

/** Portraits and speaker labels are presentation data, never added to model history. */
export function createChatPresentation(session) {
  const library = () => session.ai.library;
  const protagonist = () =>
    library().characters.find((member) => member.id === library().campaign?.protagonistId) ||
    library().characters[0];
  function portrait(member, className = '') {
    return html`<img
      class="${className}"
      src="${escapeText(portraitUrl(member.combat))}"
      alt="${escapeText(member.setting.name)}的立绘"
    />`;
  }
  function speaker(role, ids = []) {
    const members =
      role === 'user'
        ? [protagonist()].filter(Boolean)
        : ids.map((id) => library().characters.find((member) => member.id === id)).filter(Boolean);
    return {
      speakerIds: members.map((member) => member.id),
      speakerName: members.map((member) => member.setting.name).join('、') || '酒馆来客',
    };
  }
  function append(container, message) {
    const actors = library().characters.map((member) => ({
      id: member.id,
      name: member.setting.name,
    }));
    if (typeof message.content === 'string' && message.content.includes('【'))
      message = {
        ...message,
        content: readableGalText(message.content, actors, library().campaign?.protagonistId),
        display: readableGalText(
          message.display ?? message.content,
          actors,
          library().campaign?.protagonistId,
        ),
      };
    const identities = message.speakerIds?.length
      ? message.speakerIds
      : message.role === 'user'
        ? speaker('user').speakerIds
        : [];
    const members = identities
      .map((id) => library().characters.find((member) => member.id === id))
      .filter(Boolean);
    const article = appendChatMessage(container, message, {
      name:
        message.speakerName ||
        members.map((member) => member.setting.name).join('、') ||
        '酒馆来客',
      portraits: members
        .slice(0, 3)
        .map((member) => ({ src: portraitUrl(member.combat), name: member.setting.name })),
    });
    const retry = article.querySelector('[data-chat-retry]');
    if (retry) retry.disabled = session.ai.chat.sending === true;
    return article;
  }
  function conversation(place) {
    $('#chat-place-select').value = place;
    $('#chat-participants').innerHTML = library()
      .characters.filter((member) => member.id !== library().campaign?.protagonistId)
      .map(
        (member) =>
          html`<label class="chat-person"
            ><input
              type="checkbox"
              value="${escapeText(member.id)}"
              ${session.ai.chat.selected.includes(member.id) ? 'checked' : ''}
            />${portrait(member)}<span
              ><strong>${escapeText(member.setting.name)}</strong
              ><small
                >好感 ${relationship(library(), member.id).affection} ·
                ${relationship(library(), member.id).gains}/3</small
              ></span
            ></label
          >`,
      )
      .join('');
    $('#chat-scene').textContent = CHAT_PLACES[place].environment;
    const player = protagonist();
    $('#chat-player').innerHTML = player
      ? `${portrait(player)}<span><strong>${escapeText(player.setting.name)}</strong><small>写下此刻的言语与行动</small></span>`
      : '<span>写下此刻的言语与行动</span>';
  }
  function history(kind = 'chat') {
    const log = $(kind === 'chat' ? '#chat-messages' : '#quick-chat-log');
    log.replaceChildren();
    const messages = kind === 'chat' ? library().tavernChat || [] : session.ai.chat.quick;
    for (const message of messages) {
      message.id ||= crypto.randomUUID();
      append(log, message);
      const failure = session.ai.chat.responseErrors?.[message.id];
      if (failure) append(log, failure);
    }
    if (!log.children.length && kind === 'chat')
      log.innerHTML =
        '<div class="chat-empty"><span>✦</span><h3>故事，从一句话开始</h3><p>倒一杯饮料，问候一声，或只是坐近一点。</p></div>';
  }
  return { append, speaker, conversation, history };
}
