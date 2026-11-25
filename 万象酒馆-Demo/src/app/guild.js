import {
  GUILD_RANKS,
  GUILD_TRIALS,
  guildIntelList,
  guildBountyBoard,
  guildRankInfo,
  guildSkillCatalog,
  isBountyReadyToClaim,
} from '../guild.js';
import { finalSkillText } from '../skill-text.js';
import { DEFINITIONS } from '../data.js';
import { REGIONS } from '../content/regions.js';
import { escapeText } from '../ui.js';
import { LEARNABLE_SKILL_CATEGORIES } from '../content/learnable-skills.js';
import {
  DAMAGE_TYPES,
  DAMAGE_TYPE_IDS,
  SUPPORT_TYPE,
  damageTypeChip,
  damageTypeIcon,
  inferDamageType,
} from '../damage-types.js';
import { cityServiceArt } from './city-service-art.js';
import { commitCityTrade } from './city-trade.js';

const TABS = Object.freeze([
  { id: 'bounties', label: '悬赏板' },
  { id: 'intel', label: '查情报' },
  { id: 'skills', label: '学特技' },
  { id: 'trials', label: '切磋' },
]);

/** Adventurer's Guild dialog: Bounties, regional intel, specialty manuals and AI-free sparring. */
export function createGuild(context) {
  const { session, events } = context;
  const dialog = document.createElement('dialog');
  dialog.id = 'guild-dialog';
  dialog.className = 'guild-dialog';
  dialog.classList.add('city-service-dialog');
  dialog.setAttribute('aria-label', '冒险者公会');
  document.body.append(dialog);

  let activeTab = 'bounties';
  let activeSkillCategory = 'all';
  let activeSkillType = 'all';
  let launching = false;
  let city = cityServiceArt();

  const library = () => session.ai.library;

  async function transact(action, id, onSuccess) {
    try {
      const result = await commitCityTrade(context, action, id);
      onSuccess?.(result);
    } catch (failure) {
      context.shell.toast(failure.message);
    }
    render();
  }

  function renderBounties() {
    const lib = library();
    const rank = guildRankInfo(lib.guild?.merit || 0).current;
    const scale = 1 + (rank.bonusPct || 0) / 100;
    const quests = lib.tavernQuests || [];
    return `<div class="guild-cards guild-notice-board" aria-label="每日悬赏告示">
      ${guildBountyBoard(lib)
        .map((bounty) => {
          const existing = quests.find((q) => q.bountyId === bounty.id);
          const isActive = existing?.status === 'active';
          const isReady = existing && isBountyReadyToClaim(existing);
          const targets = bounty.targetMaps.map((id) => REGIONS[id]?.name).filter(Boolean);
          if (bounty.targetKind === 'any-road') targets.unshift('大地图游荡敌群');
          const current = isActive ? existing.objectives?.[0]?.current || 0 : 0;
          const gold = Math.round(bounty.gold * scale);
          const ether = Math.round(bounty.ether * scale);
          return `<article data-bounty-id="${escapeText(bounty.id)}" class="guild-card guild-notice ${isReady ? 'is-ready' : isActive ? 'is-active' : ''}">
          <div class="guild-card-top">
            <span class="guild-rank-seal">${escapeText(bounty.rank)}</span>
            <div class="guild-card-meta">
              <small>${escapeText(bounty.tier)} · 推荐 Lv.${bounty.level}</small>
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
          <p class="guild-card-obj">◆ ${escapeText(targets.join(' / '))} <b>${current}/${bounty.targetCount}</b></p>
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
        })
        .join('')}
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
                  : `<p class="guild-intel-masked">该区卷宗尚未调阅。解锁后可查阅敌群编制、镇守首领与行动线索。</p>`
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

  function renderSkills() {
    const catalog = guildSkillCatalog(library());
    const filtered = catalog.filter((item) => {
      if (activeSkillCategory !== 'all' && item.category !== activeSkillCategory) return false;
      if (activeSkillType !== 'all') {
        const dt = inferDamageType(item) || SUPPORT_TYPE;
        if (dt !== activeSkillType) return false;
      }
      return true;
    });
    const catFilters = [
      `<button type="button" class="guild-filter-btn ${activeSkillCategory === 'all' ? 'is-selected' : ''}" data-guild-cat-filter="all">全部分类</button>`,
      ...Object.entries(LEARNABLE_SKILL_CATEGORIES).map(
        ([catId, label]) =>
          `<button type="button" class="guild-filter-btn ${activeSkillCategory === catId ? 'is-selected' : ''}" data-guild-cat-filter="${catId}">${escapeText(label)}</button>`,
      ),
    ].join('');
    const typeFilters = [
      `<button type="button" class="guild-filter-btn ${activeSkillType === 'all' ? 'is-selected' : ''}" data-guild-type-filter="all">全部属性</button>`,
      ...DAMAGE_TYPE_IDS.map((typeId) => {
        const meta = DAMAGE_TYPES[typeId];
        return `<button type="button" class="guild-filter-btn is-type ${activeSkillType === typeId ? 'is-selected' : ''}" data-guild-type-filter="${typeId}" style="--dmg-color:${meta.color}">${damageTypeIcon(typeId, { size: 12, tint: false })}<span>${escapeText(meta.short)}</span></button>`;
      }),
      `<button type="button" class="guild-filter-btn is-type ${activeSkillType === SUPPORT_TYPE ? 'is-selected' : ''}" data-guild-type-filter="${SUPPORT_TYPE}" style="--dmg-color:#6ecfa3">${damageTypeIcon(SUPPORT_TYPE, { size: 12, tint: false })}<span>增幅</span></button>`,
    ].join('');
    const cardsHtml = filtered.length
      ? filtered
          .map((item) => {
            const effectDesc = finalSkillText(item);
            const costLine = item.learned
              ? '已在全队特技库解锁'
              : item.discountedCost < item.price
                ? `<s>${item.price}</s> ${item.discountedCost} 金币`
                : `${item.discountedCost} 金币`;
            const meritNote = item.meritReq ? ` · 需功勋 ${item.meritReq}` : ' · 全阶可学';
            const dmgType = inferDamageType(item);
            return `<article class="guild-card ${item.learned ? 'is-ready' : ''}">
          <div class="guild-card-top">
            <span class="guild-rank-seal">${escapeText(item.rank)}</span>
            <div class="guild-card-meta">
              <small>${escapeText(item.categoryLabel)}${escapeText(meritNote)} · ${item.ap} AP${item.mp ? ` · ${item.mp} SP` : ''}${item.hp ? ` · ${item.hp} HP` : ''}</small>
              <h3 class="guild-skill-heading">${damageTypeChip(dmgType, { size: 15 })}<span>${escapeText(item.name)}</span></h3>
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
                  ? '<button type="button" disabled>已收录至特技库</button>'
                  : `<button type="button" class="guild-btn-gold" data-guild-learn="${escapeText(item.id)}" ${item.unlockedByMerit ? '' : 'disabled'}>研习秘籍</button>`
              }
            </div>
          </footer>
        </article>`;
          })
          .join('')
      : '<div class="guild-empty-note">当前筛选条件下没有特技</div>';
    return `<div class="guild-skill-filters" role="region" aria-label="特技筛选">
        <div class="guild-filter-row">${catFilters}</div>
        <div class="guild-filter-row is-types">${typeFilters}</div>
      </div>
      <div class="guild-cards">${cardsHtml}</div>`;
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
          : activeTab === 'skills'
            ? renderSkills()
            : renderTrials();

    dialog.innerHTML = `<header class="guild-head">
        <div class="guild-crest-badge" aria-hidden="true">
          <span>${escapeText(info.current.rank)}</span>
        </div>
        <div class="guild-head-info">
          <h2>${city.name} · 冒险者公会</h2>
          <div class="guild-merit-row">
            <div class="guild-merit-bar"><i style="width:${info.pct}%"></i></div>
            <span>功勋 ${info.currentMerit}${info.next ? ` / ${info.next.minMerit} (${info.next.rank})` : ' · 最高阶'}</span>
            <div class="guild-rank-pips">${rankList}</div>
          </div>
        </div>
        <div class="guild-head-right">
          <div class="guild-wallet">金币 <b>${gold}</b> · 以太 <b>${ether}</b></div>
          <div class="guild-perks">悬赏 +${info.current.bonusPct}% · 秘籍 −${Math.round(info.current.discount * 100)}%</div>
        </div>
        <form method="dialog"><button class="guild-close" aria-label="关闭冒险者公会">×</button></form>
      </header>
      <nav class="guild-tabs" role="tablist" aria-label="公会事务分区">
        ${TABS.map(
          (tab) =>
            `<button type="button" role="tab" aria-selected="${tab.id === activeTab}" data-guild-tab="${tab.id}">
              ${tab.label}
            </button>`,
        ).join('')}
      </nav>
      <div class="guild-body">${content}</div>`;
  }

  function open(tab = 'bounties', { cityId } = {}) {
    if (session.runtime.mode !== 'inn' || session.ai.busy) return;
    city = cityServiceArt(cityId, context.daily?.scene?.());
    dialog.style.setProperty('--guild-scene', `url("${new URL(city.guild, document.baseURI)}")`);
    activeTab = TABS.some((t) => t.id === tab) ? tab : 'bounties';
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

  events.on(dialog, 'click', async (event) => {
    const tabBtn = event.target.closest('[data-guild-tab]');
    if (tabBtn) {
      activeTab = tabBtn.dataset.guildTab;
      render();
      return;
    }
    const catFilter = event.target.closest('[data-guild-cat-filter]');
    if (catFilter) {
      activeSkillCategory = catFilter.dataset.guildCatFilter;
      render();
      return;
    }
    const typeFilter = event.target.closest('[data-guild-type-filter]');
    if (typeFilter) {
      activeSkillType = typeFilter.dataset.guildTypeFilter;
      render();
      return;
    }
    const acceptId = event.target.closest('[data-guild-accept]')?.dataset.guildAccept;
    if (acceptId) {
      await transact('accept', acceptId, (outcome) => {
        context.quests?.focusQuest?.(outcome.quest.id);
        context.daily?.refresh?.();
        context.quests?.showBanner?.('BOUNTY ACCEPTED · 悬赏已接取', outcome.quest.title);
        context.shell.toast(`已接取公会悬赏：${outcome.quest.title}`);
      });
      return;
    }
    const claimId = event.target.closest('[data-guild-claim]')?.dataset.guildClaim;
    if (claimId) {
      await transact('claim', claimId, (outcome) => {
        context.daily?.refresh?.();
        context.quests?.showBanner?.(
          'BOUNTY COMPLETED · 悬赏完成',
          outcome.quest.title,
          `+${outcome.rewards.gold} 金币 · +${outcome.rewards.ether} 以太 · +${outcome.rewards.merit} 功勋`,
        );
        context.shell.toast(
          `领奖成功：金币 +${outcome.rewards.gold}，功勋 +${outcome.rewards.merit}`,
        );
      });
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
      await transact('intel', intelId, (outcome) => {
        context.shell.toast(`已调阅「${outcome.item.name}」探索卷宗`);
      });
      return;
    }
    const mapId = event.target.closest('[data-guild-map]')?.dataset.guildMap;
    if (mapId) {
      dialog.close();
      context.daily?.openAtlas?.();
      return;
    }
    const learnId = event.target.closest('[data-guild-learn]')?.dataset.guildLearn;
    if (learnId) {
      await transact('learn', learnId, (outcome) => {
        context.shell.toast(`已研习特技「${outcome.skill.name}」（-${outcome.cost} 金币）`);
      });
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
