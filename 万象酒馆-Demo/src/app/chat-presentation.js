import { CHAT_PLACES } from '../chat.js';
import { portraitUrl } from '../portraits.js';
import { escapeText } from '../ui.js';
import { html } from '../shared/html.js';
import { query as $ } from './dom.js';
import { appendChatMessage } from './chat-message.js';
import { relationship } from '../relationships.js';

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
  function selectionCount() {
    const count = $('#chat-characters').querySelectorAll('input:checked').length;
    $('#chat-selection-count').textContent = count
      ? `已邀 ${count} 位来客 · 可多选`
      : '选择想交谈的来客，也可以先独坐片刻';
  }
  function show(stage) {
    $('#chat-dialog').dataset.stage = stage;
    $('#chat-choose').hidden = stage !== 'choose';
    $('#chat-conversation').hidden = stage !== 'conversation';
  }
  function choose(place, activities, characters) {
    $('#chat-place').textContent = CHAT_PLACES[place].name;
    $('#chat-environment').textContent = CHAT_PLACES[place].environment;
    $('#chat-characters').innerHTML = characters
      .map(
        (member, index) =>
          html` <label class="chat-guest">
            <input
              type="checkbox"
              value="${escapeText(member.id)}"
              ${session.ai.chat.selected.includes(member.id) ? 'checked' : ''}
              aria-label="邀请${escapeText(member.setting.name)}"
            />
            <div class="chat-guest-art">
              ${portrait(member)}<span class="chat-guest-number"
                >来客 / ${String(index + 1).padStart(2, '0')}</span
              >
            </div>
            <div class="chat-guest-copy">
              <strong>${escapeText(member.setting.name)}</strong
              ><small
                >${escapeText(member.setting.profession?.name || member.combat.title || '异界来客')}</small
              >
              <p>
                ${escapeText(activities.find((activity) => activity.id === member.id)?.text || '')}
              </p>
            </div>
          </label>`,
      )
      .join('');
    if (!characters.length)
      $('#chat-characters').innerHTML =
        '<p class="chat-no-guests">这里暂时很安静。先坐一会儿吧。</p>';
    selectionCount();
    show('choose');
  }
  function conversation(place) {
    $('#chat-place').textContent = CHAT_PLACES[place].name;
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
    show('conversation');
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
  return { append, speaker, choose, show, conversation, history, selectionCount };
}
