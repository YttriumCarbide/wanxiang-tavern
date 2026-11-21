import {
  normalizeQuestLead,
  normalizeQuestCharacter,
  normalizeSocialQuest,
  QUEST_TYPES,
  questRecruitmentReady,
} from '../tavern-quests.js';
import {
  claimGuildBountyReward,
  GUILD_BOUNTIES,
  isBountyReadyToClaim,
  recordGuildCombatProgress,
} from '../guild.js';
import { OUTING_SCENES } from '../daily.js';
import { overlandOrigin, OVERLAND_STOPS } from '../overland-travel.js';
import { ATLAS_PLACES } from '../content/atlas-geography.js';
import { REGIONS } from '../content/regions.js';
import { archiveOverlandLoot } from '../archives.js';
import { compileEquipmentDesign } from '../equipment-generation.js';
import { grantEquipment } from '../equipment.js';
import { gameTime } from '../memory.js';
import { restoreGrowth } from '../growth.js';
import { UNKNOWN_CARD, UNKNOWN_STANDING } from '../portraits.js';
import { escapeText } from '../ui.js';
import { createPlayerIntentPrompt } from './player-intent.js';

const SCENES = Object.freeze(
  Object.fromEntries([
    ['tavern', '万象酒馆'],
    ...Object.entries(OUTING_SCENES).filter(
      ([id]) => !id.startsWith('road-') || OVERLAND_STOPS.some((stop) => stop.id === id),
    ),
  ]),
);

const SKYRIM_DIVIDER_SVG =
  '<svg class="skyrim-divider-svg" viewBox="0 0 360 22" aria-hidden="true"><path d="M12 11H158M202 11H348" stroke="currentColor" stroke-width="1" stroke-opacity=".55"/><path d="M180 2L192 11L180 20L168 11Z" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M180 6L185 11L180 16L175 11Z" fill="currentColor" fill-opacity=".8"/><circle cx="158" cy="11" r="2" fill="currentColor"/><circle cx="202" cy="11" r="2" fill="currentColor"/></svg>';

export function createTavernQuests(context) {
  const { session, events } = context;
  const library = () => session.ai.library;
  const dialog = document.createElement('dialog');
  dialog.id = 'tavern-quests';
  dialog.className = 'skyrim-quests-dialog';
  dialog.setAttribute('aria-label', '任务日志');
  document.body.append(dialog);

  const banner = document.createElement('div');
  banner.id = 'skyrim-quest-banner';
  banner.className = 'skyrim-quest-banner';
  banner.setAttribute('role', 'status');
  banner.hidden = true;
  document.body.append(banner);
  let bannerTimer = null;

  const intent = createPlayerIntentPrompt(events, 'quest-intent');
  let pending = null;
  let reading = false;
  let focused = '';
  let inspected = '';

  const active = () => library().tavernQuests.filter(({ status }) => status === 'active');
  const scene = () => context.daily?.scene() || 'tavern';
  const availableScenes = () => ({
    ...SCENES,
    ...Object.fromEntries(library().atlasDiscoveries.map(({ id, name }) => [id, name])),
    ...Object.fromEntries(Object.entries(REGIONS).map(([id, region]) => [id, region.name])),
  });

  function showBanner(kicker, title, detail = '') {
    clearTimeout(bannerTimer);
    banner.innerHTML = `<div class="skyrim-banner-inner">
      <span class="skyrim-banner-kicker">${escapeText(kicker)}</span>
      <strong class="skyrim-banner-title">${escapeText(title)}</strong>
      ${detail ? `<small class="skyrim-banner-detail">${escapeText(detail)}</small>` : ''}
      ${SKYRIM_DIVIDER_SVG}
    </div>`;
    banner.hidden = false;
    banner.dataset.show = 'true';
    bannerTimer = setTimeout(() => {
      banner.dataset.show = 'false';
      banner.hidden = true;
    }, 3200);
  }

  function step(quest) {
    if (quest.type === 'social') return quest.plan?.acts[quest.index || 0];
    if (quest.type === 'character') return quest.plan;
    return null;
  }

  function current() {
    return active().find(({ id }) => id === focused) || active()[0];
  }

  function questLocation(quest) {
    if (quest.type === 'bounty') {
      const names = (quest.targetMaps || []).map((id) => REGIONS[id]?.name || id).filter(Boolean);
      if (names.length) return names.join(' / ');
      return quest.targetKind === 'any-road' ? '大地图官道 / 断垣戍堡' : '帝国辖境';
    }
    return (
      availableScenes()[step(quest)?.scene] ||
      (quest.discovery &&
        library().atlasDiscoveries.find(({ id }) => id === quest.discovery)?.name) ||
      availableScenes()[quest.origin] ||
      ''
    );
  }

  function arrived(id) {
    const quest = active().find((entry) => step(entry)?.scene === id);
    if (quest) focused = quest.id;
    return Boolean(quest);
  }

  function save() {
    if (!context.generation.save()) throw Error('任务进度保存失败');
    context.daily?.refresh();
    if (dialog.open) render();
  }

  function claimBounty(questId) {
    const outcome = claimGuildBountyReward(library(), questId);
    if (!outcome.ok) {
      context.shell.toast(outcome.reason);
      return;
    }
    save();
    showBanner(
      'BOUNTY COMPLETED · 悬赏交付',
      outcome.quest.title,
      `获得 ${outcome.rewards.gold} 金币 · ${outcome.rewards.ether} 以太 · +${outcome.rewards.merit} 公会功勋${
        outcome.rankedUp ? ` · 公会晋升 ${outcome.rankedUp.rank} 级` : ''
      }`,
    );
    context.shell.toast(
      `交付悬赏：金币 +${outcome.rewards.gold} · 以太 +${outcome.rewards.ether} · 功勋 +${outcome.rewards.merit}`,
    );
  }

  function renderObjectives(quest) {
    if (quest.type === 'bounty') {
      const label = GUILD_BOUNTIES.find((bounty) => bounty.id === quest.bountyId)?.objectiveLabel;
      return (quest.objectives || [])
        .map((obj) => {
          const done = (obj.current || 0) >= (obj.target || 1);
          return `<li class="skyrim-obj ${done ? 'is-done' : ''}">
            <span class="skyrim-obj-diamond" aria-hidden="true">${done ? '◆' : '◇'}</span>
            <span>${escapeText(obj.id === 'bounty-main' ? label || obj.label : obj.label)}</span>
            <em>${obj.current || 0} / ${obj.target || 1}</em>
          </li>`;
        })
        .join('');
    }
    if (quest.type === 'social') {
      if (quest.status === 'offered') {
        return `<li class="skyrim-obj"><span class="skyrim-obj-diamond">◇</span><span>接取委托以生成五幕连贯故事线索</span></li>`;
      }
      const total = quest.plan?.acts?.length || 5;
      return (quest.plan?.acts || [])
        .map((act, index) => {
          const done = quest.status === 'completed' || index < (quest.index || 0);
          const cur = quest.status === 'active' && index === (quest.index || 0);
          const place = availableScenes()[act.scene] || act.scene;
          return `<li class="skyrim-obj ${done ? 'is-done' : cur ? 'is-current' : ''}">
            <span class="skyrim-obj-diamond">${done ? '◆' : '◇'}</span>
            <span>第 ${index + 1}/${total} 幕 · ${escapeText(act.title)}（${escapeText(place)}）</span>
            <em>${done ? '已完成' : cur ? '当前目标' : '未至'}</em>
          </li>`;
        })
        .join('');
    }
    if (quest.type === 'character') {
      const place = questLocation(quest) || '酒馆外';
      const metDone = Boolean(quest.met || quest.status === 'completed');
      const req = quest.plan?.requirements;
      return `<li class="skyrim-obj ${quest.status !== 'offered' ? 'is-done' : ''}">
          <span class="skyrim-obj-diamond">${quest.status !== 'offered' ? '◆' : '◇'}</span>
          <span>整理人物传闻与去向</span>
        </li>
        <li class="skyrim-obj ${metDone ? 'is-done' : quest.status === 'active' ? 'is-current' : ''}">
          <span class="skyrim-obj-diamond">${metDone ? '◆' : '◇'}</span>
          <span>前往 ${escapeText(place)} 会面${req ? `（需求：酒馆 ${req.tavern} 阶 · 好感 ${req.affection} 级 · 队伍 Lv.${req.partyLevel}）` : ''}</span>
        </li>`;
    }
    const targetName = questLocation(quest) || '未知秘境';
    const done = quest.status === 'completed';
    return `<li class="skyrim-obj ${done ? 'is-done' : 'is-current'}">
      <span class="skyrim-obj-diamond">${done ? '◆' : '◇'}</span>
      <span>前往泛生界大地图抵达「${escapeText(targetName)}」并完成探索</span>
    </li>`;
  }

  function renderRewards(quest) {
    if (quest.type === 'bounty' && quest.rewards) {
      return `<div class="skyrim-reward-box">
        <small>GUILD REWARD · 悬赏报酬</small>
        <p>金币 ${quest.rewards.gold} · 以太 ${quest.rewards.ether} · 公会功勋 +${quest.rewards.merit}</p>
      </div>`;
    }
    if (quest.type === 'social' && quest.plan?.reward) {
      return `<div class="skyrim-reward-box">
        <small>UNIQUE RELIC · 完结赠礼</small>
        <p>${escapeText(quest.plan.reward.name)} — ${escapeText(quest.plan.reward.description)}</p>
      </div>`;
    }
    return '';
  }

  function renderRow(quest, selectedId) {
    const isSelected = quest.id === selectedId;
    const isTracked = quest.status === 'active' && quest.id === current()?.id;
    const readyClaim = isBountyReadyToClaim(quest);
    const pickLabel =
      quest.status === 'offered'
        ? '接取'
        : readyClaim
          ? '领奖'
          : quest.status === 'active'
            ? '追踪'
            : quest.type === 'social'
              ? '续章'
              : '';
    const icon = isTracked ? '◆' : readyClaim ? '★' : quest.status === 'completed' ? '✓' : '◇';
    return `<div class="skyrim-quest-item ${isSelected ? 'is-selected' : ''} ${readyClaim ? 'is-ready' : ''}" data-status="${escapeText(quest.status)}" data-quest-select="${escapeText(quest.id)}">
      <button type="button" class="skyrim-quest-tab" data-quest-select="${escapeText(quest.id)}">
        <span class="skyrim-pointer" aria-hidden="true">${icon}</span>
        <span class="skyrim-item-copy">
          <strong>${escapeText(quest.title)}</strong>
          <small>${escapeText(QUEST_TYPES[quest.type] || '委托')} · Lv.${quest.level || 1}${readyClaim ? ' · 可交付' : ''}</small>
        </span>
      </button>
      ${
        pickLabel
          ? `<button type="button" class="skyrim-quick-pick" data-quest-pick="${escapeText(quest.id)}" ${pending ? 'disabled' : ''}>${pickLabel}</button>`
          : ''
      }
    </div>`;
  }

  function render() {
    const entries = [...library().tavernQuests].reverse();
    const activeList = entries.filter((q) => q.status === 'active');
    const offeredList = entries.filter((q) => q.status === 'offered');
    const completedList = entries.filter((q) => q.status === 'completed');
    const ordered = [...offeredList, ...activeList, ...completedList];
    const selected =
      ordered.find((q) => q.id === inspected) ||
      offeredList[0] ||
      activeList.find((q) => q.id === focused) ||
      activeList[0] ||
      completedList[0] ||
      null;
    inspected = selected?.id || '';

    const location = selected ? questLocation(selected) : '';
    const readyClaim = selected ? isBountyReadyToClaim(selected) : false;
    const statusText = selected
      ? { offered: '待接取', active: readyClaim ? '目标已达成' : '进行中', completed: '已完成' }[
          selected.status
        ]
      : '';

    dialog.innerHTML = `<header class="skyrim-head">
        <div class="skyrim-head-title">
          <small>JOURNAL OF ELDLAND · 任务日志</small>
          <h2>冒险与委托手记</h2>
        </div>
        <div class="skyrim-head-meta">
          <span class="skyrim-count-pill">进行中 ${activeList.length} · 可接 ${offeredList.length} · 已完结 ${completedList.length}</span>
          <button type="button" class="skyrim-guild-jump" data-quest-open-guild>⚜ 冒险者公会</button>
          <form method="dialog"><button class="quests-close" aria-label="关闭">×</button></form>
        </div>
      </header>
      <div class="skyrim-journal-grid">
        <aside class="skyrim-index-col" aria-label="任务目录">
          ${
            offeredList.length
              ? `<div class="skyrim-group"><h3 class="skyrim-group-label">新线索 · 可接取 (${offeredList.length})</h3>${offeredList
                  .map((q) => renderRow(q, inspected))
                  .join('')}</div>`
              : ''
          }
          ${
            activeList.length
              ? `<div class="skyrim-group"><h3 class="skyrim-group-label">当前目标 · 进行中 (${activeList.length})</h3>${activeList
                  .map((q) => renderRow(q, inspected))
                  .join('')}</div>`
              : ''
          }
          ${
            completedList.length
              ? `<div class="skyrim-group is-completed-group"><h3 class="skyrim-group-label">归档记录 · 已完成 (${completedList.length})</h3>${completedList
                  .map((q) => renderRow(q, inspected))
                  .join('')}</div>`
              : ''
          }
          ${!ordered.length ? '<p class="quests-empty">眼前暂无委托记录。可在「冒险者公会」接取帝国悬赏，或在闲聊中打听传闻。</p>' : ''}
        </aside>
        <section class="skyrim-folio-col" aria-label="任务详情">
          ${
            selected
              ? `<article class="skyrim-folio">
                  <div class="skyrim-folio-badges">
                    <span>${escapeText(QUEST_TYPES[selected.type] || '委托')}</span>
                    ${selected.rank ? `<span>${escapeText(selected.rank)} 级悬赏</span>` : ''}
                    <span>建议 Lv.${selected.level || 1}</span>
                    <em>${escapeText(statusText)}</em>
                  </div>
                  <h3 class="skyrim-folio-title">${escapeText(selected.title)}</h3>
                  ${SKYRIM_DIVIDER_SVG}
                  <p class="skyrim-folio-desc">${escapeText(selected.description)}</p>
                  ${location ? `<p class="skyrim-folio-where"><strong>目标地点：</strong>${escapeText(location)}</p>` : ''}
                  <h4 class="skyrim-obj-heading">行动目标</h4>
                  <ul class="skyrim-obj-list">${renderObjectives(selected)}</ul>
                  ${renderRewards(selected)}
                  <footer class="skyrim-folio-actions">
                    ${
                      readyClaim
                        ? `<button type="button" class="skyrim-primary-btn" data-quest-claim="${escapeText(selected.id)}">交付并领取悬赏奖励</button>`
                        : selected.status === 'offered'
                          ? `<button type="button" class="skyrim-primary-btn" data-quest-folio-pick="${escapeText(selected.id)}" ${pending ? 'disabled' : ''}>接取该委托</button>`
                          : selected.status === 'active'
                            ? `<button type="button" class="skyrim-secondary-btn" data-quest-folio-pick="${escapeText(selected.id)}">设为屏幕追踪</button>`
                            : selected.type === 'social'
                              ? `<button type="button" class="skyrim-primary-btn" data-quest-folio-pick="${escapeText(selected.id)}" ${pending ? 'disabled' : ''}>继续后续章节</button>`
                              : ''
                    }
                    ${
                      selected.status !== 'completed'
                        ? '<button type="button" class="skyrim-secondary-btn" data-quest-open-atlas>在大地图查看</button>'
                        : ''
                    }
                  </footer>
                </article>`
              : `<div class="skyrim-folio-empty">
                  <p>左侧目录中选择一条委托，或前往冒险者公会接取契约。</p>
                  <button type="button" class="skyrim-primary-btn" data-quest-open-guild>前往冒险者公会</button>
                </div>`
          }
        </section>
      </div>`;
  }

  function open(focusQuestId = '') {
    if (focusQuestId) inspected = focusQuestId;
    if (!dialog.open) {
      render();
      dialog.showModal();
    } else {
      render();
    }
  }

  function collect(raw, sourceId, place) {
    const lead = normalizeQuestLead(raw);
    if (!lead) return;
    const quests = library().tavernQuests;
    if (quests.filter(({ status }) => status !== 'completed').length >= 10) return;
    if (
      quests.some(
        (quest) =>
          quest.sourceId === sourceId ||
          quest.title.normalize('NFKC') === lead.title.normalize('NFKC'),
      )
    )
      return;
    quests.push({
      ...lead,
      id: crypto.randomUUID(),
      sourceId,
      origin: place || scene(),
      status: 'offered',
      offeredAt: gameTime(library().daily),
    });
    try {
      save();
      showBanner('NEW LEAD · 发现新线索', lead.title, QUEST_TYPES[lead.type]);
    } catch (failure) {
      quests.pop();
      context.shell.toast(failure.message);
    }
  }

  function archive(quest, lines) {
    const runId = `quest-${quest.id}-${quest.chapter || 1}`;
    if (library().history.some((record) => record.runId === runId)) return runId;
    library().history.push({
      kind: 'quest',
      runId,
      title: quest.title,
      complete: true,
      place: availableScenes()[scene()] || scene(),
      lines,
      finishedAt: Date.now(),
      gameTime: quest.gameTime || gameTime(library().daily),
    });
    return runId;
  }

  function questRoute(quest) {
    const at = Object.hasOwn(ATLAS_PLACES, quest.origin)
      ? quest.origin
      : overlandOrigin(quest.origin) || 'outskirts';
    return OVERLAND_STOPS.filter(({ id }) => id === at || id === 'outskirts')
      .sort((a, b) => Number(b.id === at) - Number(a.id === at))
      .map((stop) => ({ ...stop, level: quest.level }));
  }

  async function accept(quest) {
    if (pending || reading || session.runtime.mode !== 'inn') return;
    if (isBountyReadyToClaim(quest)) {
      claimBounty(quest.id);
      return;
    }
    const continuing = quest.status === 'completed';
    if (quest.status === 'active') {
      focused = quest.id;
      inspected = quest.id;
      dialog.close();
      return save();
    }
    dialog.close();
    const owner = library();
    const control = new AbortController();
    pending = control;
    try {
      const playerIntent = continuing
        ? await intent.ask('继续故事', '你希望这段故事接下来怎么发展？')
        : '';
      if (playerIntent === null || owner !== library()) return;
      const signal = control.signal;
      const hook = `${quest.title}\n${quest.description}\n${quest.hook}`;
      const scenes = availableScenes();
      if (quest.type === 'social') {
        const party = owner.characters
          .filter(({ id }) => owner.party.includes(id))
          .map(({ id, setting }) => ({
            id,
            name: setting.name,
            worldbook: setting.worldbook || '',
          }));
        const { quest: plan } = await context.apiClient.request(
          'generate/script',
          {
            brief:
              '生成一篇完整的五幕社交任务。沿已发生的故事承接人物与因果。每幕指定一个给定地点 ID，在该地点推进有意义的故事。不要代玩家决定。输出一组 <wanxiang_output>，JSON 为 {"acts":[{"scene":"地点ID","title":"幕名","story":"Gal正文"}],"reward":{"name":"不同名的新装备","description":"装备描述","value":12,"stat":"hp|mp|attack|skillDamage 四选一"}}。每篇恰好五幕，至少发放这一件新装备。',
            socialQuest: {
              hook,
              scenes,
              archives: owner.archives.items.slice(-40).map(({ name }) => ({ name })),
              previous: continuing
                ? {
                    reward: quest.plan.reward.name,
                    ending: quest.plan.acts.at(-1).story,
                  }
                : null,
            },
            party,
            playerIntent,
          },
          { signal, background: true },
        );
        if (owner !== library() || signal.aborted) return;
        quest.plan = normalizeSocialQuest(plan, scenes, owner.archives.items);
        quest.index = 0;
        quest.chapter = (quest.chapter || 0) + 1;
      } else if (quest.type === 'character') {
        const current = owner.characters.map(({ setting }) => ({ name: setting.name }));
        const { quest: plan } = await context.apiClient.request(
          'generate/script',
          {
            brief:
              '生成一个可招募角色任务小剧场。指定一个给定地点 ID，写出约500字初见小剧场，给出该角色Lv1完整人设与战斗数值、合理推荐等级，以及招募所需的酒馆进阶数、好感度等级、队伍等级、交涉难度（none/low/medium/high）与一句要求说明；20级以上人物的队伍等级至少不低于人物等级-10。只输出一组 <wanxiang_output> JSON。',
            characterQuest: {
              hook,
              scenes,
              current,
              archives: owner.archives.items.slice(-40).map(({ name }) => ({ name })),
            },
          },
          { signal, background: true },
        );
        if (owner !== library() || signal.aborted) return;
        const member = plan.member;
        if (!member?.setting || !member?.combat) throw Error('角色任务缺少招募人物');
        const normalized = normalizeQuestCharacter(plan, scenes);
        quest.plan = {
          ...normalized,
          member: {
            id: `quest-${quest.id}`,
            source: 'quest',
            growth: restoreGrowth(null, `quest-${quest.id}`),
            combat: { ...member.combat, id: `quest-${quest.id}`, emblemId: undefined },
            setting: member.setting,
          },
        };
      } else if (quest.type === 'battle') {
        const discovery = await context.mapExpansion.discover({
          title: quest.title,
          brief: hook,
          route: questRoute(quest),
          level: quest.level,
          acts: [{ story: hook }],
          worldPrompt: hook,
        });
        if (!discovery || owner !== library()) return;
        quest.discovery = discovery.id;
      }
      quest.status = 'active';
      quest.gameTime = gameTime(owner.daily);
      focused = quest.id;
      inspected = quest.id;
      save();
      showBanner('QUEST STARTED · 任务开始', quest.title, questLocation(quest));
    } catch (failure) {
      if (failure.name !== 'AbortError') context.shell.toast(failure.message);
    } finally {
      if (pending === control) pending = null;
    }
  }

  async function advance() {
    const quest = current();
    const act = quest && step(quest);
    if (!quest || reading || act?.scene !== scene()) return;
    const owner = library();
    reading = true;
    try {
      if (quest.type === 'character' && quest.met) {
        const ready = questRecruitmentReady(owner, quest);
        const answer = await intent.ask(
          ready ? '邀请加入' : '与对方交谈',
          ready ? '要正式邀请对方加入酒馆吗？' : '你想聊些什么，或尝试说服对方？',
        );
        if (answer === null || owner !== library()) return;
        const person = quest.plan.member;
        const { reply, negotiated } = await context.apiClient.request('generate/invitation', {
          member: { id: person.id, name: person.setting.name, setting: person.setting },
          relationship: { affection: quest.affection || 0, level: 0, label: '初识' },
          activity: { id: 'talk', name: '任务交涉', topic: quest.title },
          recent: owner.history
            .slice(-3)
            .map(({ title, place }) => `${place}·${title}`)
            .join('；'),
          playerIntent: answer,
          negotiate: {
            ready,
            negotiated: Boolean(quest.negotiated),
            difficulty: quest.plan.requirements.difficulty,
            requirements: quest.plan.requirements,
          },
        });
        if (owner !== library()) return;
        if (reply.affectionGain) {
          quest.affection = Math.min(3000, (quest.affection || 0) + reply.affectionGain);
        }
        if (negotiated) quest.negotiated = true;
        await context.gal.play(reply.story, {
          owner: 'tavern-quest',
          title: person.setting.name,
          mandatory: true,
          actors: [person.id],
          portraits: {
            [person.id]: {
              name: person.setting.name,
              card: UNKNOWN_CARD,
              standing: UNKNOWN_STANDING,
            },
          },
        });
        if (owner !== library()) return;
        if (questRecruitmentReady(owner, quest)) {
          if (owner.characters.length >= 100) throw Error('角色池已满');
          const member = quest.plan.member;
          if (!owner.characters.some(({ id }) => id === member.id)) owner.characters.push(member);
          (owner.relationships ||= {})[member.id] = {
            affection: quest.affection || 0,
            gains: 0,
            agreed: false,
          };
          quest.status = 'completed';
          void context.generation.syncCharacters();
          context.shell.renderParty();
          showBanner('COMPANION JOINED · 同伴入队', member.setting.name);
          context.shell.toast(member.setting.name + '已加入酒馆');
        }
      } else {
        const story = act.story;
        let finished = false;
        await context.gal.play(story, {
          owner: 'tavern-quest',
          title: act.title || quest.title,
          mandatory: true,
          actors: quest.type === 'character' ? [quest.plan.member.id] : owner.party.filter(Boolean),
          onComplete: () => {
            finished = true;
          },
        });
        if (!finished || owner !== library()) return;
        if (quest.type === 'character') {
          quest.met = true;
          archive(quest, [{ speaker: '旁白', text: story }]);
          void context.memory.autoSummarize();
        } else if (quest.index === 4) {
          if (owner.equipment.owned.length >= 1000) throw Error('装备背包已满，清理后领取本幕奖励');
          const runId = archive(
            quest,
            quest.plan.acts.map(({ story: text }) => ({ speaker: '旁白', text })),
          );
          const { reward } = quest.plan;
          const [source] = archiveOverlandLoot(owner, {
            runId,
            title: quest.title,
            leg: { id: 'social-quest', level: quest.level },
            items: [{ ...reward, stageId: 'social-quest' }],
          });
          const record =
            source || owner.archives.items.find((item) => item.source?.runId === runId);
          const template = compileEquipmentDesign(
            {
              name: reward.name,
              description: reward.description,
              design: { statFocus: [reward.stat], rules: [] },
            },
            record,
          );
          if (!owner.equipment.catalog.some(({ id }) => id === template.id))
            owner.equipment.catalog.push(template);
          grantEquipment(owner, template.id, 'reward-' + runId);
          record.converted = true;
          quest.index++;
          quest.status = 'completed';
          showBanner('QUEST COMPLETED · 任务完结', quest.title, '获得装备 · ' + reward.name);
          context.shell.toast('获得装备 · ' + reward.name);
          void context.memory.autoSummarize();
        } else {
          quest.index++;
          showBanner(
            'OBJECTIVE UPDATED · 进展推进',
            quest.title,
            `下一目标：第 ${quest.index + 1} 幕`,
          );
        }
      }
      if (owner === library()) save();
    } catch (failure) {
      context.shell.toast(failure.message);
    } finally {
      reading = false;
    }
  }

  function battleWon(exploration) {
    const owner = library();
    const discoveryQuest = active().find(
      ({ discovery }) => discovery && discovery === exploration?.world?.id,
    );
    if (discoveryQuest && !exploration.replay) {
      discoveryQuest.status = 'completed';
      showBanner('QUEST COMPLETED · 秘境克复', discoveryQuest.title);
    }
    const map = exploration?.world?.id || exploration?.map;
    const result = recordGuildCombatProgress(owner, { kind: 'dungeon', map });
    if (result.readyQuests.length) {
      const first = result.readyQuests[0];
      showBanner('BOUNTY OBJECTIVE · 悬赏可交付', first.title, '前往公会或任务日志领取报酬');
    }
    save();
  }

  function skirmishWon(nodeId) {
    const owner = library();
    const result = recordGuildCombatProgress(owner, { kind: 'skirmish', nodeId });
    if (result.readyQuests.length) {
      const first = result.readyQuests[0];
      showBanner('BOUNTY OBJECTIVE · 悬赏可交付', first.title, '前往公会或任务日志领取报酬');
    }
    save();
  }

  events.on(dialog, 'click', (event) => {
    const claimId = event.target.closest('[data-quest-claim]')?.dataset.questClaim;
    if (claimId) {
      claimBounty(claimId);
      return;
    }
    const pickId =
      event.target.closest('[data-quest-pick]')?.dataset.questPick ||
      event.target.closest('[data-quest-folio-pick]')?.dataset.questFolioPick;
    if (pickId) {
      const quest = library().tavernQuests.find((entry) => entry.id === pickId);
      if (quest) void accept(quest);
      return;
    }
    const selectId = event.target.closest('[data-quest-select]')?.dataset.questSelect;
    if (selectId) {
      inspected = selectId;
      render();
      return;
    }
    if (event.target.closest('[data-quest-open-guild]')) {
      dialog.close();
      context.guild?.open('bounties');
      return;
    }
    if (event.target.closest('[data-quest-open-atlas]')) {
      dialog.close();
      context.daily?.openAtlas?.();
    }
  });

  return {
    open,
    arrived,
    collect,
    advance,
    battleWon,
    skirmishWon,
    showBanner,
    focusQuest(id) {
      focused = id;
      inspected = id;
    },
    actors: () =>
      active()
        .filter((quest) => quest.type === 'character' && quest.plan.scene === scene())
        .map(({ plan }) => ({
          id: plan.member.id,
          name: plan.member.setting.name,
          sprite: UNKNOWN_STANDING,
          fullSprite: true,
          npc: true,
        })),
    status() {
      const quest = current();
      if (!quest) return null;
      if (quest.type === 'bounty') {
        const obj = quest.objectives?.[0];
        const ready = isBountyReadyToClaim(quest);
        return {
          title: quest.title,
          location: questLocation(quest),
          action: ready ? '可交付悬赏' : `${obj?.current || 0}/${obj?.target || 1}`,
        };
      }
      const act = step(quest);
      const location =
        availableScenes()[act?.scene] ||
        library().atlasDiscoveries.find(({ id }) => id === quest.discovery)?.name;
      return {
        title: quest.title,
        location,
        action:
          act?.scene !== scene()
            ? ''
            : quest.type === 'social'
              ? `第 ${quest.index + 1} 幕`
              : !quest.met
                ? '见面'
                : questRecruitmentReady(library(), quest)
                  ? '招募'
                  : '交谈',
      };
    },
    dispose() {
      clearTimeout(bannerTimer);
      pending?.abort();
      dialog.remove();
      banner.remove();
      intent.dispose();
    },
  };
}
