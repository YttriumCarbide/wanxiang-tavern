import {
  normalizeQuestLead,
  normalizeQuestCharacter,
  normalizeSocialQuest,
  QUEST_TYPES,
  questRecruitmentReady,
} from '../tavern-quests.js';
import { OUTING_SCENES } from '../daily.js';
import { overlandOrigin, OVERLAND_STOPS } from '../overland-travel.js';
import { ATLAS_PLACES } from '../content/atlas-geography.js';
import { archiveOverlandLoot } from '../archives.js';
import { compileEquipmentDesign } from '../equipment-generation.js';
import { grantEquipment } from '../equipment.js';
import { gameTime } from '../memory.js';
import { restoreGrowth } from '../growth.js';
import { UNKNOWN_CARD, UNKNOWN_STANDING } from '../portraits.js';
import { escapeText } from '../ui.js';
import { createPlayerIntentPrompt } from './player-intent.js';
import { RECRUITMENT_DIFFICULTY } from '../recruitment.js';

const SCENES = Object.freeze(
  Object.fromEntries([
    ['tavern', '万象酒馆'],
    ...Object.entries(OUTING_SCENES).filter(
      ([id]) => !id.startsWith('road-') || OVERLAND_STOPS.some((stop) => stop.id === id),
    ),
  ]),
);

export function createTavernQuests(context) {
  const { session, events } = context;
  const library = () => session.ai.library;
  const dialog = document.createElement('dialog');
  dialog.id = 'tavern-quests';
  dialog.setAttribute('aria-label', '任务');
  document.body.append(dialog);
  const intent = createPlayerIntentPrompt(events, 'quest-intent');
  let pending = null;
  let reading = false;
  let focused = '';
  const active = () => library().tavernQuests.filter(({ status }) => status === 'active');
  const scene = () => context.daily?.scene() || 'tavern';
  const availableScenes = () => ({
    ...SCENES,
    ...Object.fromEntries(library().atlasDiscoveries.map(({ id, name }) => [id, name])),
  });
  function step(quest) {
    if (quest.type === 'social') return quest.plan?.acts[quest.index || 0];
    if (quest.type === 'character') return quest.plan;
    return null;
  }
  function current() {
    return active().find(({ id }) => id === focused) || active()[0];
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
  function render() {
    dialog.innerHTML = `<header><h2>任务</h2><form method="dialog"><button aria-label="关闭">×</button></form></header>
      <div class="tavern-quest-list">${
        [...library().tavernQuests]
          .reverse()
          .map((quest) => {
            const location =
              availableScenes()[step(quest)?.scene] ||
              (quest.discovery &&
                library().atlasDiscoveries.find(({ id }) => id === quest.discovery)?.name);
            const status = { offered: '可接取', active: '进行中', completed: '已完成' }[
              quest.status
            ];
            const action =
              quest.status === 'offered'
                ? '接取'
                : quest.status === 'active'
                  ? '追踪'
                  : quest.type === 'social'
                    ? '继续故事'
                    : '';
            const recruit = quest.type === 'character' && quest.met && quest.status === 'active';
            const requirements = recruit ? quest.plan.requirements : null;
            return `<article><div><b>${escapeText(quest.title)}</b><span>${QUEST_TYPES[quest.type]} · ${status}</span></div>
          <p>${escapeText(quest.description)}</p>${location ? `<p>${escapeText(location)}</p>` : ''}
          ${requirements ? `<p>${escapeText(requirements.reason)} · 酒馆 ${requirements.tavern} 阶 · 好感 ${requirements.affection} 级 · 队伍 ${requirements.partyLevel} 级${requirements.difficulty !== 'none' ? ' · 交涉' + RECRUITMENT_DIFFICULTY[requirements.difficulty] : ''}</p>` : ''}
          ${action ? `<button data-quest-pick="${escapeText(quest.id)}" ${pending ? 'disabled' : ''}>${action}</button>` : ''}</article>`;
          })
          .join('') || '<p>暂无任务线索</p>'
      }</div>`;
  }
  function open() {
    if (dialog.open) return;
    render();
    dialog.showModal();
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
    const continuing = quest.status === 'completed';
    if (quest.status === 'active') {
      focused = quest.id;
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
        const { entry, questCharacter } = await context.apiClient.request(
          'generate/character',
          {
            brief: hook + '\n按身份和世界观决定人物强度、等级及招募门槛。',
            purpose: 'quest',
            questCharacter: { scenes, hook },
            existing: owner.characters.map(({ setting }) => setting),
          },
          { signal, background: true },
        );
        if (owner !== library() || signal.aborted) return;
        const plan = normalizeQuestCharacter(questCharacter, scenes);
        entry.questRecruit = true;
        entry.combat.portrait = UNKNOWN_CARD;
        entry.growth = restoreGrowth({ ...entry.growth, level: plan.level }, entry.id);
        quest.plan = { ...plan, member: entry };
      } else {
        const discovery = await context.mapExpansion.quest(questRoute(quest), hook);
        if (!discovery || owner !== library() || signal.aborted) return;
        quest.discovery = discovery.id;
      }
      quest.status = 'active';
      quest.gameTime = gameTime(owner.daily);
      focused = quest.id;
      save();
    } catch (failure) {
      if (failure.name !== 'AbortError') context.shell.toast('任务生成未完成 · ' + failure.message);
    } finally {
      if (pending === control) pending = null;
      if (dialog.open) render();
    }
  }
  async function negotiate(quest) {
    const owner = library();
    const answer = await intent.ask(
      quest.plan.member.setting.name,
      '说说你的来意，或继续聊聊彼此的经历。',
    );
    if (!answer || owner !== library()) return;
    const { member, requirements } = quest.plan;
    const result = await context.apiClient.request('generate/quick-chat', {
      text: answer,
      selected: [member.id],
      history: (quest.negotiation || []).flatMap(({ answer, reply }) => [
        { role: 'user', content: answer },
        { role: 'assistant', content: reply },
      ]),
      characters: [
        { id: member.id, name: member.setting.name, worldbook: member.setting.worldbook || '' },
      ],
      environment: availableScenes()[scene()] || scene(),
      questNegotiation: { title: quest.title, requirements, previous: quest.negotiation || [] },
    });
    if (owner !== library() || session.runtime.disposed) return;
    let complete = false;
    await context.gal.play(result.display || result.content, {
      owner: 'tavern-quest',
      title: quest.title,
      actors: [member.id],
      onComplete: () => {
        complete = true;
      },
    });
    if (!complete || owner !== library()) return;
    quest.negotiation = [...(quest.negotiation || []), { answer, reply: result.content }].slice(-6);
    const score = result.questNegotiation || 0;
    quest.affection = (quest.affection || 0) + score * 10;
    quest.negotiated ||= score >= { low: 2, medium: 3, high: 4, none: 0 }[requirements.difficulty];
    collect(result.quest, `${quest.id}:negotiation:${Date.now()}`, scene());
  }
  async function advance() {
    const quest = current();
    const act = quest && step(quest);
    if (
      !act ||
      act.scene !== scene() ||
      reading ||
      pending ||
      session.runtime.mode !== 'inn' ||
      context.daily?.overlandRun() ||
      context.daily?.onInvitation()
    )
      return;
    reading = true;
    const owner = library();
    try {
      if (quest.type === 'character' && quest.met) {
        if (!questRecruitmentReady(owner, quest)) await negotiate(quest);
        else {
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
          context.shell.toast('获得装备 · ' + reward.name);
          void context.memory.autoSummarize();
        } else quest.index++;
      }
      if (owner === library()) save();
    } catch (failure) {
      context.shell.toast(failure.message);
    } finally {
      reading = false;
    }
  }
  function battleWon(exploration) {
    const quest = active().find(
      ({ discovery }) => discovery && discovery === exploration?.world?.id,
    );
    if (!quest || exploration.replay) return;
    quest.status = 'completed';
    save();
  }
  events.on(dialog, 'click', (event) => {
    const id = event.target.closest('[data-quest-pick]')?.dataset.questPick;
    const quest = library().tavernQuests.find((entry) => entry.id === id);
    if (quest) void accept(quest);
  });
  return {
    open,
    arrived,
    collect,
    advance,
    battleWon,
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
      pending?.abort();
      dialog.remove();
      intent.dispose();
    },
  };
}
