import {
  GUILD_BOUNTIES,
  GUILD_RANKS,
  GUILD_SUPPLIES,
  GUILD_TRIALS,
  acceptGuildBounty,
  buyGuildSkillManual,
  buyGuildSupply,
  claimGuildBountyReward,
  guildIntelList,
  guildRankInfo,
  guildSkillCatalog,
  isBountyReadyToClaim,
  supplyCostForLibrary,
  unlockGuildIntel,
} from '../guild.js';
import { finalSkillText } from '../skill-text.js';
import { DEFINITIONS } from '../data.js';
import { escapeText } from '../ui.js';

const TABS = Object.freeze([
  { id: 'bounties', label: '悬赏委托板', sub: 'BOUNTIES' },
  { id: 'intel', label: '区域情报台', sub: 'INTEL' },
  { id: 'supplies', label: '公会军需坊', sub: 'SUPPLIES' },
  { id: 'skills', label: '战技研习台', sub: 'GRIMOIRE' },
  { id: 'trials', label: '试炼切磋场', sub: 'TRIALS' },
]);

/** Adventurer's Guild dialog: Bounties (tied to Skyrim Quests), Regional Intel, Supplies & AI-free Sparring. */
export function createGuild(context) {
  const { session, events } = context;
  const dialog = document.createElement('dialog');
  dialog.id = 'guild-dialog';
  dialog.className = 'guild-dialog';
  dialog.setAttribute('aria-label', '冒险者公会');
  document.body.append(dialog);

  let activeTab = 'bounties';
  let launching = false;

  const library = () => session.ai.library;

  function renderBounties() {
    const lib = library();
    const rank = guildRankInfo(lib.guild?.merit || 0).current;
    const scale = 1 + (rank.bonusPct || 0) / 100;
    const quests = lib.tavernQuests || [];
    return `<div class="guild-cards">
      ${GUILD_BOUNTIES.map((bounty) => {
        const existing = quests.find((q) => q.bountyId === bounty.id);
        const isActive = existing?.status === 'active';
        const isReady = existing && isBountyReadyToClaim(existing);
        const progress = existing?.objectives?.[0];
        const gold = Math.round(bounty.gold * scale);
        const ether = Math.round(bounty.ether * scale);
        return `<article class="guild-card ${isReady ? 'is-ready' : isActive ? 'is-active' : ''}">
          <div class="guild-card-top">
            <span class="guild-rank-seal">${escapeText(bounty.rank)}</span>
            <div class="guild-card-meta">
              <small>${escapeText(bounty.tier)} · 推荐 Lv.${bounty.level}</small>
              <h3>${escapeText(bounty.title)}</h3>
            </div>
            ${
              isReady
                ? '<em class="guild-badge is-ready">待领奖</em>'
                : isActive
                  ? '<em class="guild-badge is-active">进行中</em>'
                  : existing?.status === 'completed'
                    ? '<em class="guild-badge is-done">曾完成</em>'
                    : ''
            }
          </div>
          <p class="guild-card-desc">${escapeText(bounty.description)}</p>
          <p class="guild-card-obj">◆ ${escapeText(bounty.objectiveLabel)}${
            isActive && progress ? `（<b>${progress.current}/${progress.target}</b>）` : ''
          }</p>
          <footer class="guild-card-foot">
            <span class="guild-reward-text">金币 ${gold} · 以太 ${ether} · 功勋 +${bounty.merit}</span>
            <div class="guild-card-btns">
              ${
                isReady
                  ? `<button type="button" class="guild-btn-gold" data-guild-claim="${escapeText(existing.id)}">交付领奖</button>`
                  : isActive
                    ? `<button type="button" data-guild-track="${escapeText(existing.id)}">任务日志查看</button>`
                    : `<button type="button" class="guild-btn-gold" data-guild-accept="${escapeText(bounty.id)}">${existing?.status === 'completed' ? '再次接取' : '接取悬赏'}</button>`
              }
            </div>
          </footer>
        </article>`;
      }).join('')}
    </div>`;
  }

  function renderIntel() {
    const items = guildIntelList(library());
    return `<div class="guild-intel-list">
      ${items
        .map((item) => {
          const enemyNames = item.enemies
            .map((id) => DEFINITIONS[id]?.name || id)
            .slice(0, 4)
            .join('、');
          return `<article class="guild-intel-row ${item.unlocked ? 'is-open' : ''}">
            <div class="guild-intel-left">
              <div class="guild-intel-title">
                <span class="guild-tier-tag" data-tier="${escapeText(item.tier)}">${escapeText(item.tier)}</span>
                <strong>${escapeText(item.name)}</strong>
                <small>推荐 Lv.${item.level}</small>
                ${item.visitedOnMap ? '<em class="guild-gate-chip">已入界门</em>' : '<em class="guild-gate-chip is-unvisited">待步行勘探</em>'}
              </div>
              ${
                item.unlocked
                  ? `<p class="guild-intel-detail"><b>出没魔物：</b>${escapeText(enemyNames)}${item.bossName ? ` ｜ <b>镇守首领：</b>${escapeText(item.bossName)}` : ''}</p>
                     <p class="guild-intel-note">${escapeText(item.hookTitle ? `「${item.hookTitle}」` : '')}${escapeText(item.hookDesc)}</p>`
                  : `<p class="guild-intel-masked">该区卷宗尚未调阅：解锁后可查阅敌群编制、首领弱点与大地图位置。</p>`
              }
            </div>
            <div class="guild-intel-actions">
              ${
                item.unlocked
                  ? `<button type="button" data-guild-map="${escapeText(item.id)}">查看大地图</button>`
                  : `<button type="button" class="guild-btn-gold" data-guild-intel="${escapeText(item.id)}">调阅卷宗 · ${item.cost} 金币</button>`
              }
            </div>
          </article>`;
        })
        .join('')}
    </div>`;
  }

  function renderSupplies() {
    const lib = library();
    const bag = lib.inventory?.items || {};
    return `<div class="guild-cards">
      ${GUILD_SUPPLIES.map((item) => {
        const cost = supplyCostForLibrary(lib, item);
        const owned = item.kind === 'item' ? bag[item.itemId] || 0 : lib.inventory?.ether || 0;
        const ownedLabel = item.kind === 'item' ? `背包持有 ${owned}` : `当前以太 ${owned}`;
        return `<article class="guild-card">
          <div class="guild-card-top">
            <span class="guild-supply-icon" aria-hidden="true">${item.kind === 'ether' ? '✦' : '⚗'}</span>
            <div class="guild-card-meta">
              <small>${ownedLabel}</small>
              <h3>${escapeText(item.name)}</h3>
            </div>
          </div>
          <p class="guild-card-desc">${escapeText(item.desc)}</p>
          <footer class="guild-card-foot">
            <span class="guild-reward-text">${cost < item.price ? `<s>${item.price}</s> ` : ''}${cost} 金币</span>
            <button type="button" class="guild-btn-gold" data-guild-buy="${escapeText(item.id)}">购入补给</button>
          </footer>
        </article>`;
      }).join('')}
    </div>`;
  }

  function renderSkills() {
    const catalog = guildSkillCatalog(library());
    return `<div class="guild-cards">
      ${catalog
        .map((item) => {
          const effectDesc = finalSkillText(item);
          const costLine = item.learned
            ? '已在全队战技库解锁'
            : item.discountedCost < item.price
              ? `<s>${item.price}</s> ${item.discountedCost} 金币`
              : `${item.discountedCost} 金币`;
          const meritNote = item.meritReq ? ` · 需功勋 ${item.meritReq}` : ' · 全阶可学';
          return `<article class="guild-card ${item.learned ? 'is-ready' : ''}">
          <div class="guild-card-top">
            <span class="guild-rank-seal">${escapeText(item.rank)}</span>
            <div class="guild-card-meta">
              <small>${escapeText(item.categoryLabel)}${escapeText(meritNote)} · ${item.ap} AP${item.mp ? ` · ${item.mp} SP` : ''}${item.hp ? ` · ${item.hp} HP` : ''}</small>
              <h3>${escapeText(item.name)}</h3>
            </div>
            ${
              item.learned
                ? '<em class="guild-badge is-active">已掌握 · 整备可配装</em>'
                : item.unlockedByMerit
                  ? '<em class="guild-badge is-ready">可研习</em>'
                  : '<em class="guild-badge is-done">功勋未达标</em>'
            }
          </div>
          <p class="guild-card-desc">${escapeText(item.summary)}</p>
          <p class="guild-card-obj">◆ ${escapeText(effectDesc)}</p>
          <footer class="guild-card-foot">
            <span class="guild-reward-text">${costLine}</span>
            <div class="guild-card-btns">
              ${
                item.learned
                  ? '<button type="button" disabled>已收录至战技库</button>'
                  : `<button type="button" class="guild-btn-gold" data-guild-learn="${escapeText(item.id)}" ${item.unlockedByMerit ? '' : 'disabled'}>研习秘籍</button>`
              }
            </div>
          </footer>
        </article>`;
        })
        .join('')}
    </div>`;
  }

  function renderTrials() {
    const canFight = session.runtime.mode === 'inn' && !launching;
    return `<div class="guild-cards">
      ${GUILD_TRIALS.map((trial) => {
        const names = trial.enemyIds.map((id) => DEFINITIONS[id]?.name || id).join(' + ');
        return `<article class="guild-card">
          <div class="guild-card-top">
            <span class="guild-rank-seal">⚔</span>
            <div class="guild-card-meta">
              <small>${escapeText(trial.tier)} · 推荐 Lv.${trial.level} · 零耗时免 API</small>
              <h3>${escapeText(trial.name)}</h3>
            </div>
          </div>
          <p class="guild-card-desc">${escapeText(trial.description)}</p>
          <p class="guild-card-obj">演练编制：${escapeText(names)}</p>
          <footer class="guild-card-foot">
            <span class="guild-reward-text">胜出奖励：功勋 +${trial.merit} · 金币 +${trial.gold}</span>
            <button type="button" class="guild-btn-gold" data-guild-trial="${escapeText(trial.id)}" ${canFight ? '' : 'disabled'}>开始切磋</button>
          </footer>
        </article>`;
      }).join('')}
    </div>`;
  }

  function render() {
    const lib = library();
    const info = guildRankInfo(lib.guild?.merit || 0);
    const gold = lib.inventory?.gold || 0;
    const ether = lib.inventory?.ether || 0;
    const rankList = GUILD_RANKS.map(
      (r) =>
        `<span class="guild-tier-pip ${r.rank === info.current.rank ? 'is-current' : ''}">${r.rank}</span>`,
    ).join('');

    const content =
      activeTab === 'bounties'
        ? renderBounties()
        : activeTab === 'intel'
          ? renderIntel()
          : activeTab === 'supplies'
            ? renderSupplies()
            : activeTab === 'skills'
              ? renderSkills()
              : renderTrials();

    dialog.innerHTML = `<header class="guild-head">
        <div class="guild-crest-badge" aria-hidden="true">
          <span>${escapeText(info.current.rank)}</span>
          <small>RANK</small>
        </div>
        <div class="guild-head-info">
          <small>ADVENTURER'S GUILD · 艾尔德兰冒险者公会</small>
          <h2>公会大厅 · ${escapeText(info.current.rank)} 级「${escapeText(info.current.title)}」</h2>
          <div class="guild-merit-row">
            <div class="guild-merit-bar"><i style="width:${info.pct}%"></i></div>
            <span>功勋 ${info.currentMerit}${info.next ? ` / ${info.next.minMerit} (${info.next.rank})` : ' · 最高阶'}</span>
            <div class="guild-rank-pips">${rankList}</div>
          </div>
        </div>
        <div class="guild-head-right">
          <div class="guild-wallet">金币 <b>${gold}</b> · 以太 <b>${ether}</b></div>
          <div class="guild-perks">悬赏 +${info.current.bonusPct}% · 补给 -${Math.round(info.current.discount * 100)}%</div>
        </div>
        <form method="dialog"><button class="guild-close" aria-label="关闭冒险者公会">×</button></form>
      </header>
      <nav class="guild-tabs" role="tablist" aria-label="公会事务分区">
        ${TABS.map(
          (tab) =>
            `<button type="button" role="tab" aria-selected="${tab.id === activeTab}" data-guild-tab="${tab.id}">
              <span>${tab.label}</span><small>${tab.sub}</small>
            </button>`,
        ).join('')}
      </nav>
      <div class="guild-body">${content}</div>`;
  }

  function open(tab = '') {
    if (TABS.some((t) => t.id === tab)) activeTab = tab;
    render();
    if (!dialog.open) dialog.showModal();
  }

  async function launchTrial(trialId) {
    const trial = GUILD_TRIALS.find((t) => t.id === trialId);
    if (!trial || launching || session.runtime.mode !== 'inn') return;
    launching = true;
    dialog.close();
    const returnScene = context.daily?.scene?.() || 'tavern';
    try {
      await context.journey.startOverlandBattle({
        sparringRun: {
          trialId: trial.id,
          name: trial.name,
          level: trial.level,
          merit: trial.merit,
          gold: trial.gold,
        },
        forceTransition: true,
        returnScene,
        spec: {
          name: trial.name,
          map: 'castle',
          enemyIds: [...trial.enemyIds],
          level: trial.level,
          boss: false,
          growthEntry: {
            level: trial.level,
            seed: 4200 + trial.level * 17,
            sequence: 0,
            map: 'castle',
          },
        },
      });
    } finally {
      launching = false;
    }
  }

  events.on(dialog, 'click', (event) => {
    const tabBtn = event.target.closest('[data-guild-tab]');
    if (tabBtn) {
      activeTab = tabBtn.dataset.guildTab;
      render();
      return;
    }
    const acceptId = event.target.closest('[data-guild-accept]')?.dataset.guildAccept;
    if (acceptId) {
      const outcome = acceptGuildBounty(library(), acceptId);
      if (!outcome.ok) {
        context.shell.toast(outcome.reason);
        return;
      }
      context.quests?.focusQuest?.(outcome.quest.id);
      context.generation.save();
      context.daily?.refresh?.();
      context.quests?.showBanner?.('BOUNTY ACCEPTED · 悬赏已接取', outcome.quest.title);
      context.shell.toast(`已接取公会悬赏：${outcome.quest.title}`);
      render();
      return;
    }
    const claimId = event.target.closest('[data-guild-claim]')?.dataset.guildClaim;
    if (claimId) {
      const outcome = claimGuildBountyReward(library(), claimId);
      if (!outcome.ok) {
        context.shell.toast(outcome.reason);
        return;
      }
      context.generation.save();
      context.daily?.refresh?.();
      context.quests?.showBanner?.(
        'BOUNTY COMPLETED · 悬赏完成',
        outcome.quest.title,
        `+${outcome.rewards.gold} 金币 · +${outcome.rewards.ether} 以太 · +${outcome.rewards.merit} 功勋`,
      );
      context.shell.toast(
        `领奖成功：金币 +${outcome.rewards.gold}，功勋 +${outcome.rewards.merit}`,
      );
      render();
      return;
    }
    const trackId = event.target.closest('[data-guild-track]')?.dataset.guildTrack;
    if (trackId) {
      dialog.close();
      context.quests?.open?.(trackId);
      return;
    }
    const intelId = event.target.closest('[data-guild-intel]')?.dataset.guildIntel;
    if (intelId) {
      const outcome = unlockGuildIntel(library(), intelId);
      if (!outcome.ok) {
        context.shell.toast(outcome.reason);
        return;
      }
      context.generation.save();
      context.shell.toast(`已调阅「${outcome.item.name}」探索卷宗`);
      render();
      return;
    }
    const mapId = event.target.closest('[data-guild-map]')?.dataset.guildMap;
    if (mapId) {
      dialog.close();
      context.daily?.openWorldAtlas?.();
      return;
    }
    const buyId = event.target.closest('[data-guild-buy]')?.dataset.guildBuy;
    if (buyId) {
      const outcome = buyGuildSupply(library(), buyId);
      if (!outcome.ok) {
        context.shell.toast(outcome.reason);
        return;
      }
      context.generation.save();
      context.shell.toast(`已购入 ${outcome.supply.name}（-${outcome.cost} 金币）`);
      render();
      return;
    }
    const learnId = event.target.closest('[data-guild-learn]')?.dataset.guildLearn;
    if (learnId) {
      const outcome = buyGuildSkillManual(library(), learnId);
      if (!outcome.ok) {
        context.shell.toast(outcome.reason);
        return;
      }
      context.generation.save();
      context.shell.toast(`已研习通用战技「${outcome.skill.name}」（-${outcome.cost} 金币）`);
      render();
      return;
    }
    const trialId = event.target.closest('[data-guild-trial]')?.dataset.guildTrial;
    if (trialId) {
      void launchTrial(trialId);
    }
  });

  return {
    open,
    isOpen: () => dialog.open,
    dispose() {
      dialog.remove();
    },
  };
}
