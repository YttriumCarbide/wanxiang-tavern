import { isBountyReadyToClaim } from '../guild.js';
import { QUEST_TYPES } from '../tavern-quests.js';
import { escapeText } from '../ui.js';

// The game has no Skyrim faction key, so use the source journal's side-quest ornament.
const QUEST_WING = `<path d="M10 24 C25 24, 35 14.5, 52 14.5 C69 14.5, 76 33.5, 93 33.5 C109 33.5, 118 19.5, 131 24" stroke="var(--quest-wing-stroke)" stroke-width="1.3" fill="none" />
  <path d="M10 24 C25 24, 35 33.5, 52 33.5 C69 33.5, 76 14.5, 93 14.5 C109 14.5, 118 28.5, 131 24" stroke="var(--quest-wing-stroke)" stroke-width="1.3" fill="none" />
  <path d="M74 13.5 C90 5.5, 109 6.5, 124 17" stroke="var(--quest-wing-subtle)" stroke-width="1" fill="none" />
  <path d="M74 34.5 C90 42.5, 109 41.5, 124 31" stroke="var(--quest-wing-subtle)" stroke-width="1" fill="none" />
  <polygon points="52,20 56.5,24 52,28 47.5,24" fill="var(--quest-wing-fill)" opacity="0.86" />
  <polygon points="93,19.5 98,24 93,28.5 88,24" fill="var(--quest-wing-fill)" />
  <polygon points="127,24 131.5,21.2 135.5,24 131.5,26.8" fill="var(--quest-wing-fill)" />
  <polygon points="2,24 11,21.2 13,24 11,26.8" fill="var(--quest-wing-fill)" opacity="0.82" />`;

const SCROLL_ARROW = `<svg width="10" height="6" viewBox="0 0 10 6" aria-hidden="true">
  <path d="M5 .6L9.4 5.4H.6Z" fill="currentColor"/>
</svg>`;

function questRule(kind) {
  const title = kind === 'title';
  const diamond = title ? '9,1 16,5 9,9 2,5' : '5,0.6 9.4,5 5,9.4 0.6,5';
  return `<div class="ow-quest-rule is-${kind}" aria-hidden="true">
    <svg viewBox="${title ? '0 0 18 10' : '0 0 10 10'}"><polygon points="${diamond}" fill="currentColor"/></svg>
  </div>`;
}

function scrollCap(direction) {
  const label = direction === 'up' ? '向上滚动任务列表' : '向下滚动任务列表';
  return `<button class="ow-quest-scroll" type="button" tabindex="-1" data-quest-scroll="${direction}"
    aria-label="${label}" aria-controls="tavern-quest-list">${SCROLL_ARROW}</button>`;
}

function crestWing(mirrored = false) {
  return `<svg class="ow-quest-wing${mirrored ? ' is-mirrored' : ''}" viewBox="0 0 138 48"
    fill="none" aria-hidden="true">${QUEST_WING}</svg>`;
}

function trackingMark(tracked) {
  return `<svg class="ow-quest-marker" viewBox="0 0 28 24" aria-hidden="true" fill="none">
    ${
      tracked
        ? `<polygon points="1.8,12 8.2,8.4 6.7,12 8.2,15.6" fill="#eae8e3"/>
           <polygon points="26.2,12 19.8,8.4 21.3,12 19.8,15.6" fill="#eae8e3"/>
           <polygon points="14,2.2 19.1,12 14,21.8 8.9,12" fill="#f4f3f1" stroke="#dbd8d1" stroke-width=".55"/>
           <polygon points="14,3.4 14,12 9.8,12" fill="#f1f0f0" fill-opacity=".45"/>
           <polygon points="14,12 18.2,12 14,20.6" fill="#aaa9a5" fill-opacity=".22"/>
           <polygon points="14,6.4 16.7,12 14,17.6 11.3,12" stroke="#2a2822" stroke-opacity=".24" stroke-width=".55"/>`
        : `<polygon points="2.5,12 8,9 6.9,12 8,15" stroke="#d2d0cc" stroke-width=".85"/>
           <polygon points="25.5,12 20,9 21.1,12 20,15" stroke="#d2d0cc" stroke-width=".85"/>
           <polygon points="14,3.2 18.6,12 14,20.8 9.4,12" fill="#f2f1ee" fill-opacity=".06" stroke="#e7e6e1" stroke-width="1.05"/>`
    }
  </svg>`;
}

function objectiveMark(done) {
  return `<svg class="ow-quest-objective-mark" viewBox="0 0 26 22" aria-hidden="true" fill="none">
    ${
      done
        ? `<g opacity=".68">
          <polygon points="13,3.2 19.2,11 13,18.8 6.8,11" fill="#aaa8a2" fill-opacity=".56" stroke="#c8c6c0" stroke-opacity=".72" stroke-width="1"/>
          <polygon points="13,6.6 16.3,11 13,15.4 9.7,11" fill="#deddda" fill-opacity=".42"/>
        </g>`
        : `<polygon points="13,3 19.4,11 13,19 6.6,11" fill="#f2f1ee" fill-opacity=".03" stroke="#edebe7" stroke-width="1.25"/>
           <polygon points="13,6.6 16.4,11 13,15.4 9.6,11" stroke="#edebe7" stroke-opacity=".34" stroke-width=".7"/>`
    }
  </svg>`;
}

function questRow(quest, selectedId, trackedId, claimingId) {
  const id = escapeText(quest.id);
  const title = escapeText(quest.title);
  const selected = quest.id === selectedId;
  const tracked = quest.id === trackedId;
  return `<li class="skyrim-quest-item${selected ? ' is-selected' : ''}" data-status="${quest.status}">
    ${selected ? '<span class="skyrim-focus-tick" aria-hidden="true"></span>' : ''}
    ${
      quest.status === 'active'
        ? `<button class="ow-quest-mark-button" type="button" tabindex="-1" data-quest-track="${id}"
          aria-label="追踪：${title}" aria-pressed="${tracked}" title="${tracked ? '取消追踪' : '追踪任务'}">
          ${trackingMark(tracked)}
        </button>`
        : '<span class="ow-quest-mark-slot" aria-hidden="true"></span>'
    }
    <button class="skyrim-quest-tab" type="button" data-quest-select="${id}"
      data-quest-focus="row:${id}" tabindex="${selected ? '0' : '-1'}"
      aria-current="${selected}" aria-controls="tavern-quest-detail" title="${title}">${title}</button>
    ${quest.status === 'offered' ? '<small class="ow-quest-row-state">待接取</small>' : ''}
    ${
      isBountyReadyToClaim(quest)
        ? `<button class="skyrim-quick-pick" type="button" data-quest-pick="${id}" ${claimingId ? 'disabled' : ''}
          tabindex="${selected ? '0' : '-1'}" data-quest-focus="quick:${id}" aria-label="领取悬赏奖励：${title}">${quest.id === claimingId ? '交付中…' : '领奖'}</button>`
        : ''
    }
  </li>`;
}

function questRewards(quest) {
  if (quest.type === 'bounty' && quest.rewards) {
    const { gold, ether, merit } = quest.rewards;
    return `<p class="ow-quest-reward">报酬：金币 ${escapeText(gold)} · 以太 ${escapeText(ether)} · 公会功勋 +${escapeText(merit)}</p>`;
  }
  if (quest.type === 'social' && quest.plan?.reward) {
    const { name, description } = quest.plan.reward;
    return `<p class="ow-quest-reward">完结赠礼：${escapeText(name)} — ${escapeText(description)}</p>`;
  }
  return '';
}

function questDetail(quest, location, objectives) {
  if (!quest) return '';
  const completed = quest.status === 'completed';
  const ordered = [
    ...objectives.filter(({ done }) => !done),
    ...objectives.filter(({ done }) => done),
  ];
  const type = QUEST_TYPES[quest.type] || '委托';
  const status = completed ? '' : quest.status === 'offered' ? ' · 待接取' : '';
  return `<article class="skyrim-folio${completed ? ' is-completed' : ''}" data-quest-detail="${escapeText(quest.id)}">
    <div class="ow-quest-crest">
      ${crestWing()}
      <h3 class="skyrim-folio-title">${escapeText(quest.title)}</h3>
      ${crestWing(true)}
    </div>
    ${questRule('title')}
    ${completed ? '<p class="ow-quest-seal"><i aria-hidden="true"></i>已完成<i aria-hidden="true"></i></p>' : ''}
    <p class="ow-quest-meta">${escapeText(type)}${quest.rank ? ` · ${escapeText(quest.rank)} 级` : ''} · 建议 Lv.${escapeText(quest.level || 1)}${status}</p>
    <p class="skyrim-folio-desc">${escapeText(quest.description)}</p>
    ${location ? `<p class="ow-quest-location">目标地点：${escapeText(location)}</p>` : ''}
    ${
      ordered.length
        ? `${questRule('objectives')}<ul class="ow-quest-objectives" aria-label="任务目标">${ordered
            .map(
              ({ label, done, detail }) => `<li${done ? ' class="is-done"' : ''}>
                ${objectiveMark(done)}
                <span>${escapeText(label)}</span>
                ${detail || done ? `<small>${escapeText(detail || '已完成')}</small>` : ''}
              </li>`,
            )
            .join('')}</ul>`
        : ''
    }
    ${questRewards(quest)}
  </article>`;
}

function journalCommands(quest, trackedId, { claimingId, accepting, acceptDisabled }) {
  if (!quest) return '';
  const id = escapeText(quest.id);
  const tracked = quest.id === trackedId;
  const active = quest.status === 'active';
  let primary = '';
  if (isBountyReadyToClaim(quest)) {
    primary = `<button type="button" class="ow-quest-primary" data-quest-claim="${id}" ${claimingId ? 'disabled' : ''}
      data-quest-focus="claim">${quest.id === claimingId ? '交付中…' : '交付并领取悬赏奖励'}</button>`;
  } else if (
    quest.status === 'offered' ||
    (quest.status === 'completed' && quest.type === 'social')
  ) {
    primary = `<button type="button" class="ow-quest-primary" data-quest-folio-pick="${id}" ${acceptDisabled ? 'disabled' : ''}
      data-quest-focus="accept">${accepting ? '接取中…' : quest.status === 'offered' ? '接取该委托' : '继续后续章节'}</button>`;
  }
  const track = active
    ? `<button type="button" data-quest-track="${id}" data-quest-focus="track" aria-label="追踪任务" aria-pressed="${tracked}">
        <kbd aria-hidden="true">Enter</kbd>${tracked ? '取消追踪' : '追踪任务'}
      </button>`
    : '';
  const map =
    quest.status !== 'completed'
      ? `<button type="button" data-quest-open-atlas data-quest-focus="atlas" aria-keyshortcuts="M">
        <kbd aria-hidden="true">M</kbd>打开大地图
      </button>`
      : '';
  return `${primary}${track}${map}`;
}

export function renderQuestJournal({
  groups,
  selected,
  trackedId,
  location,
  objectives,
  accepting,
  acceptDisabled,
  claimingId,
}) {
  const rows = groups
    .filter(({ entries }) => entries.length)
    .map(
      ({ entries, label, archived }) =>
        `<ul class="ow-quest-group${archived ? ' is-archive' : ''}" aria-label="${label}">${entries
          .map((quest) => questRow(quest, selected?.id, trackedId, claimingId))
          .join('')}</ul>`,
    )
    .join('');
  return `<header class="skyrim-head">
      <h2 id="tavern-quests-title">任务日志</h2>
      <button type="button" class="quests-close" data-quest-focus="close" aria-label="关闭任务日志">×</button>
    </header>
    <div class="skyrim-journal-grid">
      <aside class="skyrim-index-col" aria-label="任务目录">
        ${rows ? scrollCap('up') : ''}
        <div id="tavern-quest-list" class="ow-quest-list">${rows}</div>
        ${rows ? scrollCap('down') : ''}
      </aside>
      <section id="tavern-quest-detail" class="skyrim-folio-col" aria-label="任务详情"
        ${selected ? 'tabindex="0" data-quest-focus="detail"' : ''}>${selected ? questDetail(selected, location, objectives) : '<p class="skyrim-quest-empty" role="status">暂无任务记录</p>'}</section>
    </div>
    <footer class="skyrim-keybar">
      <button type="button" data-quest-open-guild data-quest-focus="guild">冒险者公会</button>

      ${selected ? '<span class="ow-quest-keyhint" aria-hidden="true"><kbd>↑/↓ · W/S</kbd> 选择</span>' : ''}
      <div class="ow-quest-commands">${journalCommands(selected, trackedId, { claimingId, accepting, acceptDisabled })}</div>
    </footer>`;
}
