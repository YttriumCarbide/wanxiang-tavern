import {
  normalizeQuestLead,
  normalizeQuestCharacter,
  normalizeSocialQuest,
  QUEST_TYPES,
  questRecruitmentReady,
} from '../tavern-quests.js';
import { GUILD_BOUNTIES, isBountyReadyToClaim, recordGuildCombatProgress } from '../guild.js';
import { OUTING_SCENES } from '../daily.js';
import { cityForScene } from '../city-directory.js';
import { overlandOrigin, OVERLAND_STOPS } from '../overland-travel.js';
import { ATLAS_PLACES } from '../content/atlas-geography.js';
import { REGIONS } from '../content/regions.js';
import { archiveOverlandLoot } from '../archives.js';
import { compileEquipmentDesign } from '../equipment-generation.js';
import { grantEquipment } from '../equipment.js';
import { gameTime } from '../memory.js';
import { restoreGrowth } from '../growth.js';
import { UNKNOWN_CARD, UNKNOWN_STANDING } from '../portraits.js';
import { activeModal, createPopoverSurface } from '../shared/top-layer.js';
import { escapeText } from '../ui.js';
import { cityTradePending, commitCityTrade } from './city-trade.js';
import { createPlayerIntentPrompt } from './player-intent.js';
import { renderQuestJournal } from './tavern-quest-view.js';

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
  const sessionRuntime = session.runtime;
  let disposed = false;
  const sessionIsAlive = () =>
    !disposed && session.runtime === sessionRuntime && !sessionRuntime.disposed;
  const dialog = document.createElement('dialog');
  dialog.id = 'tavern-quests';
  dialog.className = 'skyrim-quests-dialog';
  dialog.setAttribute('aria-labelledby', 'tavern-quests-title');
  document.body.append(dialog);

  const banner = document.createElement('div');
  banner.id = 'skyrim-quest-banner';
  banner.className = 'skyrim-quest-banner';
  banner.setAttribute('role', 'status');
  banner.hidden = true;
  document.body.append(banner);
  const bannerSurface = createPopoverSurface(banner);
  let bannerTimer = null;

  const intent = createPlayerIntentPrompt(events, 'quest-intent');
  let pending = null;
  let pendingClaim = null;
  let bannerExitTimer = null;
  let reading = false;
  let inspected = '';
  let returnFocusElement = null;

  const active = () => journalQuests().filter(({ status }) => status === 'active');
  const scene = () => context.daily?.scene() || 'tavern';
  const availableScenes = () => ({
    ...SCENES,
    ...Object.fromEntries(library().atlasDiscoveries.map(({ id, name }) => [id, name])),
    ...Object.fromEntries(Object.entries(REGIONS).map(([id, region]) => [id, region.name])),
  });

  function showBanner(kicker, title, detail = '') {
    if (!sessionIsAlive()) return;
    clearTimeout(bannerTimer);
    clearTimeout(bannerExitTimer);
    banner.innerHTML = `<div class="skyrim-banner-inner">
      <span class="skyrim-banner-kicker">${escapeText(kicker)}</span>
      <strong class="skyrim-banner-title">${escapeText(title)}</strong>
      ${detail ? `<small class="skyrim-banner-detail">${escapeText(detail)}</small>` : ''}
      ${SKYRIM_DIVIDER_SVG}
    </div>`;
    banner.hidden = false;
    bannerSurface.show();
    banner.dataset.show = 'false';
    void banner.offsetWidth;
    banner.dataset.show = 'true';
    bannerTimer = setTimeout(() => {
      if (!sessionIsAlive()) return;
      banner.dataset.show = 'false';
      bannerExitTimer = setTimeout(() => {
        if (!sessionIsAlive()) return;
        bannerSurface.hide();
        banner.hidden = true;
      }, 200);
    }, 3200);
  }

  function step(quest) {
    if (quest.type === 'social') return quest.plan?.acts[quest.index || 0];
    if (quest.type === 'character') return quest.plan;
    return null;
  }

  function journalQuests() {
    const owner = library();
    const quests = owner.tavernQuests;
    if (!pendingClaim?.quest || pendingClaim.owner !== owner) return quests;
    // The transaction stages a completed copy before its save is confirmed.
    const { quest: before } = pendingClaim;
    return quests.map((quest) => (quest.id === before.id ? before : quest));
  }

  function current(entries = journalQuests()) {
    const activeQuests = entries.filter(({ status }) => status === 'active');
    const tracked = activeQuests.find((quest) => quest.tracked === true);
    const optedOut =
      entries.some((quest) => quest.tracked === false) &&
      !entries.some((quest) => quest.tracked === true);
    return tracked || (optedOut ? undefined : activeQuests[0]);
  }

  function setTrackedQuest(questId, persist = false) {
    const quests = library().tavernQuests;
    const target = quests.find(({ id, status }) => id === questId && status === 'active');
    if (questId && !target) return false;
    if (persist && (cityTradePending(context) || sessionRuntime.cityTrade === 'blocked')) {
      throw Error('存档状态未就绪，暂时无法更改任务追踪。');
    }
    const changes = quests.filter((quest) => quest.tracked !== (quest === target));
    if (!changes.length) return true;
    const previous = changes.map((quest) => ({
      quest,
      tracked: quest.tracked,
      hadTracked: Object.hasOwn(quest, 'tracked'),
    }));
    changes.forEach((quest) => {
      quest.tracked = quest === target;
    });
    if (!persist) return true;
    try {
      if (!context.generation.save({ refresh: false })) throw Error('任务追踪状态保存失败。');
    } catch (failure) {
      for (const { quest, tracked, hadTracked } of previous) {
        if (hadTracked) quest.tracked = tracked;
        else delete quest.tracked;
      }
      throw failure;
    }
    context.daily?.refresh();
    return true;
  }

  function trackQuest(questId, focusKey) {
    try {
      setTrackedQuest(questId, true);
    } catch (failure) {
      context.shell.toast(failure?.message || '任务追踪状态保存失败。');
    }
    if (dialog.open) render(focusKey);
  }

  function focusQuest(id) {
    if (!sessionIsAlive()) return;
    inspected = id;
    if (id) trackQuest(id);
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
    if (quest) focusQuest(quest.id);
    return Boolean(quest);
  }

  function save() {
    if (!context.generation.save()) throw Error('任务进度保存失败');
    context.daily?.refresh();
    if (dialog.open) render();
  }

  async function claimBounty(questId) {
    if (pendingClaim || !sessionIsAlive()) return;
    const owner = library();
    const quest = owner.tavernQuests.find(({ id }) => id === questId);
    if (!isBountyReadyToClaim(quest)) return;
    inspected = questId;
    pendingClaim = { owner, quest };
    const canUpdate = () => sessionIsAlive() && library() === owner;

    let outcome;
    try {
      if (dialog.open) render();
      outcome = await commitCityTrade(context, 'claim', questId);
    } catch (failure) {
      if (canUpdate()) {
        context.shell.toast(failure?.message || '悬赏领取失败，请确认存档状态后重试。');
      }
      return;
    } finally {
      pendingClaim = null;
      if (canUpdate() && dialog.open) render();
    }

    if (!canUpdate()) return;
    try {
      context.daily?.refresh();
    } catch {
      // A confirmed trade stays successful even if its HUD refresh fails.
    }
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

  function questObjectives(quest) {
    if (!quest) return [];
    if (quest.type === 'bounty') {
      const label = GUILD_BOUNTIES.find((bounty) => bounty.id === quest.bountyId)?.objectiveLabel;
      return (quest.objectives || []).map((objective) => {
        const current = objective.current || 0;
        const target = objective.target || 1;
        return {
          label: objective.id === 'bounty-main' ? label || objective.label : objective.label,
          done: current >= target,
          detail: `${current} / ${target}`,
        };
      });
    }
    if (quest.type === 'social') {
      if (quest.status === 'offered') return [{ label: '接取委托以生成五幕故事线索' }];
      const acts = quest.plan?.acts || [];
      const scenes = availableScenes();
      return acts.map((act, index) => {
        const done = quest.status === 'completed' || index < (quest.index || 0);
        const current = quest.status === 'active' && index === (quest.index || 0);
        return {
          label: `第 ${index + 1}/${acts.length} 幕 · ${act.title}（${scenes[act.scene] || act.scene}）`,
          done,
          detail: current ? '当前目标' : done ? '已完成' : '未至',
        };
      });
    }
    if (quest.type === 'character') {
      const place = questLocation(quest) || '酒馆外';
      const done = Boolean(quest.met || quest.status === 'completed');
      const req = quest.plan?.requirements;
      const requirements = req
        ? `（需求：酒馆 ${req.tavern} 阶 · 好感 ${req.affection} 级 · 队伍 Lv.${req.partyLevel}）`
        : '';
      return [
        { label: '整理人物传闻与去向', done: quest.status !== 'offered' },
        { label: `前往 ${place} 会面${requirements}`, done },
      ];
    }
    return [
      {
        label: `前往泛生界大地图抵达「${questLocation(quest) || '未知秘境'}」并完成探索`,
        done: quest.status === 'completed',
      },
    ];
  }

  function selectedRow() {
    return dialog.querySelector('.skyrim-quest-tab[aria-current="true"]');
  }

  function keepRowVisible(list, row) {
    if (!list || typeof row?.closest !== 'function') return;
    const item = row.closest('.skyrim-quest-item');
    if (!item) return;
    const viewport = list.getBoundingClientRect();
    const bounds = item.getBoundingClientRect();
    if (bounds.top < viewport.top) list.scrollTop -= viewport.top - bounds.top;
    else if (bounds.bottom > viewport.bottom) list.scrollTop += bounds.bottom - viewport.bottom;
  }

  function focusJournal(key) {
    const targets = [...dialog.querySelectorAll('[data-quest-focus]')];
    const previous = targets.find((target) => target.dataset.questFocus === key);
    const target =
      previous && !previous.disabled && previous.getClientRects().length
        ? previous
        : selectedRow() || dialog.querySelector('.quests-close');
    target?.focus({ preventScroll: true });
  }

  function selectQuest(id) {
    inspected = id;
    render(`row:${id}`);
  }

  function render(focusKey = document.activeElement?.dataset.questFocus) {
    if (!sessionIsAlive()) return;
    const selectionBefore = dialog.querySelector('.skyrim-folio')?.dataset.questDetail;
    const listTop = dialog.querySelector('.ow-quest-list')?.scrollTop || 0;
    const detailTop = dialog.querySelector('.skyrim-folio-col')?.scrollTop || 0;
    const quests = journalQuests();
    const entries = [...quests].reverse();
    const tracked = current(quests);
    const groups = [
      { label: '进行中', entries: entries.filter(({ status }) => status === 'active') },
      { label: '待接取', entries: entries.filter(({ status }) => status === 'offered') },
      {
        label: '已完成',
        archived: true,
        entries: entries.filter(({ status }) => status === 'completed'),
      },
    ];
    const ordered = groups.flatMap((group) => group.entries);
    const selected = ordered.find(({ id }) => id === inspected) || tracked || ordered[0];
    inspected = selected?.id || '';
    dialog.innerHTML = renderQuestJournal({
      groups,
      selected,
      trackedId: tracked?.id,
      location: selected ? questLocation(selected) : '',
      objectives: questObjectives(selected),
      acceptDisabled: Boolean(pending || reading || sessionRuntime.mode !== 'inn'),
      accepting: Boolean(pending),
      claimingId: pendingClaim?.owner === library() ? pendingClaim.quest.id : '',
    });
    if (!dialog.open) return;
    const list = dialog.querySelector('.ow-quest-list');
    list.scrollTop = listTop;
    if (selectionBefore === inspected)
      dialog.querySelector('.skyrim-folio-col').scrollTop = detailTop;
    if (selectionBefore !== inspected || focusKey?.startsWith('row:')) {
      keepRowVisible(list, selectedRow());
    }
    if (focusKey) focusJournal(focusKey);
  }

  function open(focusQuestId = '') {
    if (!sessionIsAlive()) return;
    if (!dialog.open) returnFocusElement = document.activeElement;
    if (focusQuestId) inspected = focusQuestId;
    render(focusQuestId ? `row:${focusQuestId}` : undefined);
    if (!dialog.open) {
      dialog.showModal();
      keepRowVisible(dialog.querySelector('.ow-quest-list'), selectedRow());
      focusJournal();
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
    if (isBountyReadyToClaim(quest)) return claimBounty(quest.id);
    const continuing = quest.status === 'completed' && quest.type === 'social';
    if (quest.status !== 'offered' && !continuing) return;
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
      setTrackedQuest(quest.id);
      inspected = quest.id;
      save();
      showBanner('QUEST STARTED · 任务开始', quest.title, questLocation(quest));
    } catch (failure) {
      if (failure.name !== 'AbortError') context.shell.toast(failure.message);
    } finally {
      if (pending === control) {
        pending = null;
        if (dialog.open && owner === library()) render();
      }
    }
  }

  async function advance() {
    if (!sessionIsAlive() || reading) return;
    const quest = current();
    if (!quest) return;
    if (session.runtime.mode === 'inn' && isBountyReadyToClaim(quest)) {
      return claimBounty(quest.id);
    }
    const act = step(quest);
    if (act?.scene !== scene()) return;
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

  function questAtlasTarget(quest) {
    if (quest?.status !== 'active') return null;
    if (quest.type === 'bounty') {
      if (quest.targetKind !== 'dungeon' || isBountyReadyToClaim(quest)) return null;
      const maps = quest.targetMaps;
      return Array.isArray(maps) &&
        maps.length === 1 &&
        library().unlockedDungeons.includes(maps[0])
        ? maps[0]
        : null;
    }
    const id = step(quest)?.scene || quest.discovery;
    if (typeof id !== 'string') return null;
    if (
      Object.hasOwn(ATLAS_PLACES, id) ||
      library().atlasDiscoveries.some((entry) => entry.id === id)
    ) {
      return id;
    }
    // Interior venues share their registered city's world-map pin, not a guessed road point.
    return cityForScene(id) ? overlandOrigin(id) : null;
  }

  function openAtlas() {
    const quest = journalQuests().find(({ id }) => id === inspected);
    if (context.daily?.openAtlas?.(questAtlasTarget(quest))) dialog.close();
    else context.shell.toast('当前无法打开大地图。');
  }

  events.on(dialog, 'close', () => {
    if (dialog.open) return;
    const target = returnFocusElement;
    returnFocusElement = null;
    // The edge button can be hidden while modal; restore after the ledger resynchronizes.
    queueMicrotask(() => {
      if (!sessionIsAlive() || dialog.open || activeModal(document)) return;
      const focused = document.activeElement;
      if (focused !== document.body && !dialog.contains(focused)) return;
      if (target?.isConnected && !target.disabled && target.getClientRects().length) {
        target.focus({ preventScroll: true });
      }
    });
  });

  events.on(dialog, 'keydown', (event) => {
    if (!sessionIsAlive() || !dialog.open || event.defaultPrevented || event.isComposing) return;
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    const key = event.key.toLowerCase();
    if (key === 'm' && dialog.querySelector('[data-quest-open-atlas]')) {
      event.preventDefault();
      if (!event.repeat) openAtlas();
      return;
    }
    if (!event.target.matches('.skyrim-quest-tab')) return;
    const rows = [...dialog.querySelectorAll('.skyrim-quest-tab[data-quest-select]')];
    const index = rows.indexOf(event.target);
    let next;
    if (key === 'arrowdown' || key === 's') next = (index + 1) % rows.length;
    else if (key === 'arrowup' || key === 'w') next = (index + rows.length - 1) % rows.length;
    else if (key === 'home') next = 0;
    else if (key === 'end') next = rows.length - 1;
    else if (key === 'enter' || key === ' ') {
      event.preventDefault();
      if (!event.repeat) dialog.querySelector('[data-quest-focus="track"]')?.click();
      return;
    } else return;
    event.preventDefault();
    if (rows[next]) selectQuest(rows[next].dataset.questSelect);
  });

  events.on(dialog, 'click', (event) => {
    if (!sessionIsAlive()) return;
    const button =
      event.target.closest('button') ||
      event.target.closest('.skyrim-quest-item')?.querySelector('[data-quest-select]');
    if (!button || button.disabled) return;
    if (button.dataset.questFocus === 'close') {
      event.preventDefault();
      dialog.close();
      return;
    }
    const { questTrack, questClaim, questPick, questFolioPick, questSelect, questScroll } =
      button.dataset;
    if (questTrack) {
      inspected = questTrack;
      const focusKey = button.dataset.questFocus || `row:${questTrack}`;
      trackQuest(current()?.id === questTrack ? '' : questTrack, focusKey);
      return;
    }
    if (questClaim || questPick) return claimBounty(questClaim || questPick);
    if (questFolioPick) {
      const quest = journalQuests().find(({ id }) => id === questFolioPick);
      if (quest) return accept(quest);
      return;
    }
    if (questSelect) {
      const selected = inspected === questSelect && button.closest('[data-status="active"]');
      if (selected) trackQuest(current()?.id === questSelect ? '' : questSelect);
      else selectQuest(questSelect);
      return;
    }
    if (questScroll) {
      const list = dialog.querySelector('.ow-quest-list');
      list.scrollBy(0, (questScroll === 'up' ? -1 : 1) * Math.max(44, list.clientHeight * 0.66));
      return;
    }
    if (button.hasAttribute('data-quest-open-guild')) {
      dialog.close();
      context.guild?.open('bounties');
      return;
    }
    if (button.hasAttribute('data-quest-open-atlas')) openAtlas();
  });

  return {
    open,
    isOpen: () => dialog.open,
    arrived,
    collect,
    advance,
    battleWon,
    skirmishWon,
    showBanner,
    focusQuest,
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
      disposed = true;
      clearTimeout(bannerTimer);
      clearTimeout(bannerExitTimer);
      bannerSurface.hide();
      pending?.abort();
      dialog.remove();
      banner.remove();
      intent.dispose();
    },
  };
}
