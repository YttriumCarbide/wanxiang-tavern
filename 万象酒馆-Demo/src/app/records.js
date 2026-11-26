import { DEFINITIONS } from '../data.js';
import { portraitUrl } from '../portraits.js';
import { mergedArchiveItems } from '../archives.js';
import { REGIONS } from '../content/regions.js';
import { ARENA_ARCHIVE_DEFINITIONS } from '../content/arena-adversaries.js';
import { ARENA_QUALIFIER_ARCHIVE_DEFINITIONS } from '../content/arena-qualifier-adversaries.js';
import { SILVER_CROWN_SYNDICATE_ARCHIVE_DEFINITIONS } from '../content/silver-crown-syndicate-adversaries.js';
import {
  ENEMY_ARCHIVE_TIERS,
  buildEnemyArchiveEntries,
  buildEnemyArchiveExport,
  enemyArchiveIntentText,
  filterEnemyArchiveBuckets,
} from '../archive-enemies.js';
import { ENEMY_ARCHIVE_CATEGORIES } from '../enemy-taxonomy.js';
import { createArchiveModelStage } from './archive-model-stage.js';
import { TAVERN_MANUAL_SECTIONS } from './bookshelf.js';
import { query as $ } from './dom.js';
import { developerOption } from '../generation-options.js';
import { enemyDropTable } from '../enemy-drops.js';
import { DAMAGE_TYPES } from '../damage-types.js';
import { resolveEnemyBreakProfile } from '../octopath.js';
import { INGREDIENTS } from '../content/dining.js';
import { ITEMS } from '../content/items.js';
import { dungeonMemoryText, restoredSummary } from '../memory.js';
import { ADVENTURE_NODE_LABELS } from '../adventure/definition.js';
import { escapeText } from '../ui.js';
import { exportJsonFile } from '../storage/export-file.js';

const SKYRIM_DIVIDER_SVG =
  '<svg class="skyrim-divider-svg" viewBox="0 0 360 22" aria-hidden="true"><path d="M12 11H158M202 11H348" stroke="currentColor" stroke-width="1" stroke-opacity=".55"/><path d="M180 2L192 11L180 20L168 11Z" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M180 6L185 11L180 16L175 11Z" fill="currentColor" fill-opacity=".8"/><circle cx="158" cy="11" r="2" fill="currentColor"/><circle cx="202" cy="11" r="2" fill="currentColor"/></svg>';

const MOON_PART_ROLES = {
  moonCrown: '左翼冠层 · 瘟疫与生机',
  moonEye: '中央核心 · 破坏射线',
  moonRoot: '右翼根脉 · 扫击与修复',
};

/** Unified Skyrim-styled Codex hosting NPC/Item/Enemy archives, Journey Records, Memory Summaries, and the Tavern Manual. */
export function createRecords(context) {
  let selectedRecord = -1;
  let editingRecord = false;
  let tab = 'npcs';
  let enemyTier = 'minion';
  let enemyCategory = 'all';
  const categoryPreferenceKey = 'wanxiang.codex.enemy-categories-expanded.v1';
  const preferenceStorage = context.storage || globalThis.localStorage;
  let enemyCategoriesExpanded = true;
  let enemyCategoriesActivated = false;
  try {
    const savedCategoryPreference = preferenceStorage?.getItem(categoryPreferenceKey) ?? null;
    enemyCategoriesExpanded = savedCategoryPreference !== 'false';
    enemyCategoriesActivated = savedCategoryPreference !== null;
  } catch {
    // Ignore storage access errors in restricted contexts and fall back to defaults.
  }
  let archiveEditing = false;
  let selectedIndex = 0;

  const library = () => context.session.ai.library;

  const archive = document.createElement('dialog');
  archive.id = 'archive-dialog';
  archive.className = 'skyrim-archive-dialog';
  archive.setAttribute('aria-label', '图鉴');
  archive.innerHTML =
    `<header>` +
    `<div class="records-title"><small>CODEX / ARCHIVES · 典藏卷宗</small><h2>图鉴</h2></div>` +
    `<nav class="records-actions">` +
    `<div class="archive-tabs">` +
    `<button type="button" data-archive-tab="npcs">NPC</button>` +
    `<button type="button" data-archive-tab="items">道具</button>` +
    `<button type="button" data-archive-tab="enemies">敌人</button>` +
    `<button type="button" data-archive-tab="records">记录</button>` +
    `<button type="button" data-archive-tab="memory">总结</button>` +
    `<button type="button" data-archive-tab="manual">酒馆手册</button>` +
    `</div>` +
    `<button type="button" id="archive-close" aria-label="关闭图鉴">×</button>` +
    `</nav>` +
    `</header>` +
    `<div class="records-body">` +
    `<div class="archive-index-col">` +
    `<div class="archive-codex-progress" hidden></div>` +
    `<nav class="archive-enemy-tiers" aria-label="敌人阶级" hidden></nav>` +
    `<button type="button" class="archive-enemy-category-toggle" data-enemy-category-toggle aria-controls="archive-enemy-categories" aria-expanded="true" hidden>` +
    `<span>小怪种类筛选</span><span data-category-toggle-label aria-hidden="true">收起⌃</span></button>` +
    `<nav id="archive-enemy-categories" class="archive-enemy-categories" aria-label="敌人类别" hidden></nav>` +
    `<nav id="archive-list"></nav>` +
    `<div class="archive-enemy-export" hidden>` +
    `<button type="button" id="archive-enemy-export" title="导出六类已解锁敌人，不受当前筛选限制">导出图鉴 JSON</button>` +
    `<p role="status"></p>` +
    `</div>` +
    `<nav id="records-list" hidden></nav>` +
    `<nav id="memory-index" hidden></nav>` +
    `<nav class="memory-pages" aria-label="摘要预览分页" hidden>` +
    `<button type="button" id="memory-prev">上一页</button>` +
    `<span id="memory-page"></span>` +
    `<button type="button" id="memory-next">下一页</button>` +
    `</nav>` +
    `</div>` +
    `<div class="archive-content-col">` +
    `<article id="archive-text"></article>` +
    `<article id="records-text" hidden></article>` +
    `<section id="memory-pane" hidden>` +
    `<div class="skyrim-folio-head">` +
    `<div class="skyrim-folio-badges"><span>MEMORY / SUMMARY · 记忆总结</span><span>长程上下文压缩</span></div>` +
    `<h3 class="skyrim-folio-title">把经历留在记忆里</h3>` +
    `<div class="skyrim-archive-divider">${SKYRIM_DIVIDER_SVG}</div>` +
    `</div>` +
    `<p id="memory-count"></p>` +
    `<div id="memory-items"></div>` +
    `<p id="memory-status" role="status"></p>` +
    `<footer class="memory-pane-footer">` +
    `<button type="button" id="memory-generate">全部总结</button>` +
    `<button type="button" id="memory-cancel" hidden>取消请求</button>` +
    `<button type="button" id="memory-accept" class="primary" disabled>确认使用摘要</button>` +
    `</footer>` +
    `</section>` +
    `</div>` +
    `</div>`;
  document.body.append(archive);

  const modelStage = createArchiveModelStage();
  const enemyExport = archive.querySelector('.archive-enemy-export');
  const enemyExportButton = enemyExport.querySelector('button');
  const enemyExportStatus = enemyExport.querySelector('[role="status"]');

  function field(label, value, multiline = false) {
    const wrapper = document.createElement('label');
    wrapper.className = 'archive-field';
    wrapper.textContent = label;
    const input = document.createElement(multiline ? 'textarea' : 'input');
    input.value = value || '';
    wrapper.append(input);
    return { wrapper, input };
  }

  function emptyState(area, title, hint) {
    const wrapper = document.createElement('div');
    wrapper.className = 'records-empty';
    const icon = document.createElement('span');
    icon.textContent = '✧';
    const heading = document.createElement('h3');
    heading.textContent = title;
    const caption = document.createElement('p');
    caption.textContent = hint;
    wrapper.append(icon, heading, caption);
    area.append(wrapper);
  }

  function buildDividerNode() {
    const holder = document.createElement('div');
    holder.className = 'skyrim-archive-divider';
    holder.innerHTML = SKYRIM_DIVIDER_SVG;
    return holder;
  }

  function buildBadgeRow(badges) {
    const row = document.createElement('div');
    row.className = 'skyrim-folio-badges';
    for (const text of badges.filter(Boolean)) {
      const span = document.createElement('span');
      span.textContent = text;
      row.append(span);
    }
    return row;
  }

  function buildListItemButton({ active, titleText, metaText = '', dataset }) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'skyrim-archive-item';
    Object.assign(button.dataset, dataset);
    button.setAttribute('aria-pressed', String(active));
    const pointer = document.createElement('span');
    pointer.className = 'skyrim-pointer';
    pointer.setAttribute('aria-hidden', 'true');
    pointer.textContent = active ? '◆' : '◇';
    const copy = document.createElement('span');
    copy.className = 'skyrim-archive-item-copy';
    const titleEl = document.createElement('strong');
    titleEl.textContent = titleText;
    copy.append(titleEl);
    if (metaText) {
      const metaEl = document.createElement('small');
      metaEl.textContent = metaText;
      copy.append(metaEl);
    }
    button.append(pointer, copy);
    return button;
  }

  function syncModePanes() {
    archive.querySelectorAll('[data-archive-tab]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.archiveTab === tab));
    });
    const listNav = archive.querySelector('#archive-list');
    const recordsNav = archive.querySelector('#records-list');
    const memoryNav = archive.querySelector('#memory-index');
    const memoryPages = archive.querySelector('.memory-pages');
    const archiveArticle = archive.querySelector('#archive-text');
    const recordsArticle = archive.querySelector('#records-text');
    const memoryPane = archive.querySelector('#memory-pane');

    const isRecords = tab === 'records';
    const isMemory = tab === 'memory';
    listNav.hidden = isRecords || isMemory;
    recordsNav.hidden = !isRecords;
    memoryNav.hidden = !isMemory;
    memoryPages.hidden = !isMemory;
    archiveArticle.hidden = isRecords || isMemory;
    recordsArticle.hidden = !isRecords;
    memoryPane.hidden = !isMemory;
    enemyExport.hidden = tab !== 'enemies';
  }

  function buildIntentSection(titleText, moves) {
    if (!moves?.length) return null;
    const section = document.createElement('section');
    section.className = 'skyrim-intent-section';
    const heading = document.createElement('h4');
    heading.className = 'skyrim-obj-heading';
    heading.textContent = titleText;
    const listEl = document.createElement('ul');
    listEl.className = 'skyrim-obj-list';
    for (const move of moves) {
      const item = document.createElement('li');
      item.className = 'skyrim-obj skyrim-archive-intent';
      const diamond = document.createElement('span');
      diamond.className = 'skyrim-obj-diamond';
      diamond.setAttribute('aria-hidden', 'true');
      diamond.textContent = '◇';
      const body = document.createElement('span');
      const strong = document.createElement('strong');
      strong.textContent = `${move.name}：`;
      body.append(strong, enemyArchiveIntentText(move));
      item.append(diamond, body);
      listEl.append(item);
    }
    section.append(heading, listEl);
    return section;
  }

  function buildStatStrip(entry) {
    const strip = document.createElement('div');
    strip.className = 'skyrim-archive-stats';
    const breakProfile = resolveEnemyBreakProfile(entry, 1);
    const weaknesses = entry.weaknesses?.length ? entry.weaknesses : breakProfile.weaknesses;
    const weaknessNames = weaknesses.map((type) => DAMAGE_TYPES[type]?.name || type).join('、');
    const stats = [
      ['行动速度', String(entry.speed)],
      ...(weaknessNames ? [['弱点属性', weaknessNames]] : []),
      ...(breakProfile.hasBreak
        ? [['破绽韧性', `${breakProfile.maxToughness} 层（限时窗口）`]]
        : []),
      ...(entry.phaseThreshold ? [['狂暴阈值', `${Math.round(entry.phaseThreshold * 100)}%`]] : []),
      ...(entry.actions ? [['每回合行动', `${entry.actions} 次`]] : []),
    ];
    for (const [label, value] of stats) {
      const box = document.createElement('div');
      box.className = 'skyrim-stat-chip';
      const small = document.createElement('small');
      small.textContent = label;
      const strong = document.createElement('strong');
      strong.textContent = value;
      box.append(small, strong);
      strip.append(box);
    }
    return strip;
  }

  function enemyDropSummary(entry) {
    const table = enemyDropTable(entry);
    const dropName = (id) => ITEMS[id]?.name || INGREDIENTS[id]?.name || id;
    const summary = document.createElement('p');
    summary.className = 'archive-sources archive-enemy-drops';
    summary.textContent = `可能掉落：${dropName(table.primary)}（${Math.round(table.primaryChance * 100)}%）、${dropName(table.extra)}（${Math.round(table.extraChance * 100)}%）及随机宝石。`;
    return summary;
  }

  function appendUnitMoves(container, entry, regularTitle = '行动意图') {
    if (entry.openingIntent) {
      const opening = buildIntentSection('开场先手', [entry.openingIntent]);
      if (opening) container.append(opening);
    }
    const regular = buildIntentSection(regularTitle, entry.intents || []);
    if (regular) container.append(regular);
    if (entry.enragedIntents?.length) {
      const enraged = buildIntentSection('狂暴阶段', entry.enragedIntents);
      if (enraged) container.append(enraged);
    }
  }

  function renderEnemyFolio(area, item) {
    const tierInfo = ENEMY_ARCHIVE_TIERS.find((entry) => entry.id === item.tier);
    if (item.overlord) {
      const header = document.createElement('div');
      header.className = 'skyrim-folio-head';
      header.append(
        buildBadgeRow([
          tierInfo?.badge || '灾厄霸主',
          ENEMY_ARCHIVE_CATEGORIES.find(({ id }) => id === item.category)?.label || '其他',
          item.baseSpecies,
          item.isComposite ? '三位一体 · 同台建模' : '高精度非体素雕塑',
          item.sources,
        ]),
      );
      const heading = document.createElement('h3');
      heading.className = 'skyrim-folio-title';
      heading.textContent = item.name;
      header.append(heading);
      if (item.subtitle) {
        const sub = document.createElement('p');
        sub.className = 'skyrim-overlord-subtitle';
        sub.textContent = item.subtitle;
        header.append(sub);
      }
      header.append(buildDividerNode());

      const stage = document.createElement('div');
      stage.className = 'archive-overlord-stage';
      area.append(header, stage);
      if (item.description) {
        const desc = document.createElement('p');
        desc.className = 'skyrim-folio-desc';
        desc.textContent = item.description;
        area.append(desc);
      }

      if (item.isComposite) {
        const partsWrap = document.createElement('div');
        partsWrap.className = 'skyrim-overlord-parts';
        for (const part of item.parts) {
          const card = document.createElement('section');
          card.className = 'skyrim-overlord-part';
          const partHead = document.createElement('div');
          partHead.className = 'skyrim-part-head';
          const role = document.createElement('small');
          role.textContent = MOON_PART_ROLES[part.id] || '霸主部位';
          const name = document.createElement('h4');
          name.textContent = part.name;
          const meta = document.createElement('span');
          meta.textContent = `速度 ${part.speed}`;
          partHead.append(role, name, meta);
          card.append(partHead);
          if (part.description) {
            const partDesc = document.createElement('p');
            partDesc.className = 'skyrim-part-desc';
            partDesc.textContent = part.description;
            card.append(partDesc);
          }
          card.append(enemyDropSummary(part));
          appendUnitMoves(card, part, '部位行动');
          partsWrap.append(card);
        }
        area.append(partsWrap);
      } else {
        if (item.entry.speed) area.append(buildStatStrip(item.entry));
        area.append(enemyDropSummary(item.entry));
        appendUnitMoves(area, item.entry);
      }

      void modelStage.mount(stage, item);
      return;
    }

    const entry = item.entry;
    const header = document.createElement('div');
    header.className = 'skyrim-folio-head';
    header.append(
      buildBadgeRow([
        tierInfo?.badge || '敌人情报',
        ENEMY_ARCHIVE_CATEGORIES.find(({ id }) => id === item.category)?.label || '其他',
        item.baseSpecies,
        item.sources,
      ]),
    );
    const heading = document.createElement('h3');
    heading.className = 'skyrim-folio-title';
    heading.textContent = entry.name;
    header.append(heading, buildDividerNode());

    const showcase = document.createElement('div');
    showcase.className = 'skyrim-enemy-showcase';
    const frame = document.createElement('div');
    frame.className = 'skyrim-enemy-portrait-frame';
    const picture = document.createElement('img');
    picture.className = 'skyrim-enemy-portrait';
    picture.src = portraitUrl(entry);
    picture.width = 120;
    picture.alt = entry.name;
    frame.append(picture);

    const summary = document.createElement('div');
    summary.className = 'skyrim-enemy-summary';
    if (entry.title && entry.title !== entry.name) {
      const moniker = document.createElement('p');
      moniker.className = 'skyrim-enemy-moniker';
      moniker.textContent = entry.title;
      summary.append(moniker);
    }
    if (entry.description) {
      const desc = document.createElement('p');
      desc.className = 'skyrim-folio-desc';
      desc.textContent = entry.description;
      summary.append(desc);
    }
    summary.append(buildStatStrip(entry));
    showcase.append(frame, summary);
    area.append(header, showcase);
    appendUnitMoves(area, entry);
  }

  function renderManual(index = 0) {
    const tierBar = archive.querySelector('.archive-enemy-tiers');
    const categoryToggle = archive.querySelector('[data-enemy-category-toggle]');
    const categoryBar = archive.querySelector('.archive-enemy-categories');
    const progressBar = archive.querySelector('.archive-codex-progress');
    tierBar.hidden = true;
    categoryToggle.hidden = true;
    categoryBar.hidden = true;
    progressBar.hidden = false;
    progressBar.innerHTML = `<span class="archive-codex-label">酒馆手册 · 机制百科</span><strong class="archive-codex-count">${TAVERN_MANUAL_SECTIONS.length} 卷</strong>`;
    archive.classList.remove('is-empty');

    const activeIndex = Math.max(0, Math.min(index, TAVERN_MANUAL_SECTIONS.length - 1));
    selectedIndex = activeIndex;
    $('#archive-list').replaceChildren(
      ...TAVERN_MANUAL_SECTIONS.map((section, sectionIndex) =>
        buildListItemButton({
          active: sectionIndex === activeIndex,
          titleText: section.title,
          metaText: section.badge,
          dataset: { archiveIndex: sectionIndex },
        }),
      ),
    );

    const section = TAVERN_MANUAL_SECTIONS[activeIndex];
    const area = $('#archive-text');
    area.replaceChildren();
    const header = document.createElement('div');
    header.className = 'skyrim-folio-head';
    header.append(buildBadgeRow([section.badge, section.subtitle]));
    const heading = document.createElement('h3');
    heading.className = 'skyrim-folio-title';
    heading.textContent = section.title;
    header.append(heading, buildDividerNode());
    area.append(header);

    const desc = document.createElement('p');
    desc.className = 'skyrim-folio-desc manual-folio-summary';
    desc.textContent = section.summary;
    area.append(desc);

    if (section.chips?.length) {
      const strip = document.createElement('div');
      strip.className = 'skyrim-archive-stats manual-chip-strip';
      for (const chip of section.chips) {
        const box = document.createElement('div');
        box.className = 'skyrim-stat-chip';
        const small = document.createElement('small');
        small.textContent = chip.label;
        const strong = document.createElement('strong');
        strong.textContent = chip.value;
        box.append(small, strong);
        strip.append(box);
      }
      area.append(strip);
    }

    const rulesSection = document.createElement('section');
    rulesSection.className = 'skyrim-intent-section manual-rules-section';
    const subHeading = document.createElement('h4');
    subHeading.className = 'skyrim-obj-heading';
    subHeading.textContent = '规则细则与实战要点';
    const listEl = document.createElement('ul');
    listEl.className = 'skyrim-obj-list manual-rule-list';
    for (const item of section.items) {
      const li = document.createElement('li');
      li.className = 'skyrim-obj skyrim-archive-intent manual-rule-card';
      const diamond = document.createElement('span');
      diamond.className = 'skyrim-obj-diamond';
      diamond.setAttribute('aria-hidden', 'true');
      diamond.textContent = '◆';
      const body = document.createElement('div');
      body.className = 'manual-rule-copy';
      const strong = document.createElement('strong');
      strong.textContent = item.title;
      const para = document.createElement('p');
      para.textContent = item.detail;
      body.append(strong, para);
      li.append(diamond, body);
      listEl.append(li);
    }
    rulesSection.append(subHeading, listEl);
    area.append(rulesSection);
    area.scrollTop = 0;
  }

  function renderRecordsList() {
    const history = library().history;
    archive.classList.toggle('is-empty', !history.length);
    $('#records-list').replaceChildren(
      ...history
        .map((record, index) => {
          const summarized = restoredSummary(record.summary, dungeonMemoryText(record));
          const meta = [
            `第 ${index + 1} 篇`,
            record.complete ? '完成' : '未完结',
            ...(summarized ? ['已总结'] : []),
          ].join(' · ');
          return buildListItemButton({
            active: index === selectedRecord,
            titleText: record.title || `旅途记录 #${index + 1}`,
            metaText: meta,
            dataset: { record: index },
          });
        })
        .reverse(),
    );
  }

  function renderRecordOriginal(record, area) {
    for (
      let part = 0;
      part <= Math.max(0, ...(record.lines || []).map((line) => line.encounter ?? 0));
      part++
    ) {
      const lines = (record.lines || []).filter(
        (line) => (line.encounter ?? 0) === part && line.stage !== 'combat',
      );
      if (!lines.length) continue;
      const heading = document.createElement('h4');
      heading.textContent =
        record.adventureVersion === 1
          ? `第 ${part + 1} 阶段 · ${ADVENTURE_NODE_LABELS[part] || '旅途经历'}`
          : `第 ${part + 1} 战`;
      area.append(heading);
      for (const line of lines) {
        const paragraph = document.createElement('p');
        paragraph.textContent =
          line.speaker && line.speaker !== '旁白' ? `${line.speaker}：${line.text}` : line.text;
        area.append(paragraph);
      }
    }
    if (!area.children.length) area.append('这趟旅程还没有展示正文。');
  }

  function selectRecord(index, view) {
    const history = library().history;
    selectedRecord = history.length ? Math.max(0, Math.min(index, history.length - 1)) : -1;
    editingRecord = false;
    renderRecordsList();

    const tierBar = archive.querySelector('.archive-enemy-tiers');
    const categoryToggle = archive.querySelector('[data-enemy-category-toggle]');
    const categoryBar = archive.querySelector('.archive-enemy-categories');
    const progressBar = archive.querySelector('.archive-codex-progress');
    tierBar.hidden = true;
    categoryToggle.hidden = true;
    categoryBar.hidden = true;
    progressBar.hidden = !history.length;
    progressBar.innerHTML = `<span class="archive-codex-label">旅途记录 · 篇章</span><strong class="archive-codex-count">${history.length} 篇</strong>`;

    const record = selectedRecord >= 0 ? history[selectedRecord] : null;
    const area = $('#records-text');
    area.replaceChildren();
    if (!record) {
      emptyState(area, '旅程尚未落笔', '已走过的副本故事会保存在这里。');
      return;
    }

    const original = dungeonMemoryText(record);
    const summary = restoredSummary(record.summary, original);
    const keywords = (summary?.keywords || record.tags || []).filter(Boolean).join('、') || '无';

    const header = document.createElement('div');
    header.className = 'skyrim-folio-head';
    header.append(
      buildBadgeRow([
        record.gameTime || '泛生界纪事',
        record.complete ? '已完结剧本' : '探索记录',
        summary ? 'AI 上下文使用总结' : '尚未总结',
      ]),
    );
    const title = document.createElement('h3');
    title.className = 'skyrim-folio-title';
    title.textContent = record.title;
    const sub = document.createElement('p');
    sub.className = 'skyrim-overlord-subtitle';
    sub.textContent = `关键词：${keywords}`;
    header.append(title, sub, buildDividerNode());
    area.append(header);

    const toolbar = document.createElement('div');
    toolbar.className = 'records-folio-toolbar';
    const editBtn = document.createElement('button');
    editBtn.id = 'records-edit';
    editBtn.type = 'button';
    editBtn.textContent = '编辑';
    const deleteBtn = document.createElement('button');
    deleteBtn.id = 'records-delete';
    deleteBtn.type = 'button';
    deleteBtn.textContent = '删除';
    toolbar.append(editBtn, deleteBtn);

    const showingSummary = !!summary && view !== 'original';
    const information = document.createElement('p');
    information.className = 'records-memory-status';
    const count = (value) => Array.from(value.replace(/\s/gu, '')).length;
    information.textContent = summary
      ? `原文 ${count(original)} 字 · 总结 ${count(summary.text)} 字 · AI上下文使用总结`
      : `${record.summary ? '总结已过期 · ' : '尚未总结 · '}原文 ${count(original)} 字 · AI上下文使用原文`;
    toolbar.prepend(information);
    area.append(toolbar);

    if (summary) {
      const controls = document.createElement('nav');
      controls.className = 'records-reading-tabs';
      controls.setAttribute('aria-label', '记录阅读方式');
      for (const [mode, label] of [
        ['summary', '总结后'],
        ['original', '原文'],
      ]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.recordsView = mode;
        button.textContent = label;
        button.setAttribute('aria-pressed', String((mode === 'summary') === showingSummary));
        controls.append(button);
      }
      area.append(controls);
    }

    const content = document.createElement('section');
    content.className = 'records-reading-content';
    area.append(content);
    if (showingSummary) {
      const paragraph = document.createElement('p');
      paragraph.textContent = summary.text;
      content.append(paragraph);
    } else {
      renderRecordOriginal(record, content);
    }
    area.scrollTop = 0;
  }

  function startEditingRecord() {
    if (editingRecord) return;
    const record = library().history[selectedRecord];
    if (!record) return;
    editingRecord = true;
    const title = field('标题', record.title);
    const tags = field('关键词（用逗号分隔）', (record.tags || []).join('，'));
    const lines = record.lines
      .filter((line) => line.stage !== 'combat')
      .map((line) => ({ line, ...field(`第 ${line.encounter + 1} 战`, line.text, true) }));
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'primary';
    save.textContent = '保存记录';
    save.addEventListener(
      'click',
      () => {
        record.title = title.input.value.trim() || record.title;
        record.tags = tags.input.value
          .split(/[,，、]/)
          .map((tag) => tag.trim())
          .filter(Boolean);
        const book = library().scripts.find((item) => item.id === record.scriptId);
        if (book) {
          book.title = record.title;
          book.tags = [...record.tags];
        }
        for (const { line, input } of lines) {
          if (line.text === input.value) continue;
          const previous = line.text;
          line.text = input.value;
          delete line.summary;
          delete record.summary;
          for (const route of Object.values(library().exploration || {})) {
            for (const item of route.history || []) {
              if (item.runId !== record.runId) continue;
              item.title = record.title;
              item.tags = [...record.tags];
              for (const event of item.confirmedEvents || [])
                if (event.text === previous && event.encounter === line.encounter) {
                  event.text = line.text;
                  delete event.summary;
                }
            }
          }
          if (book?.schemaVersion >= 3 && !['tavern-prelude', 'quick-chat'].includes(line.stage)) {
            book.story[line.encounter] = line.text;
            if (book.display?.story) book.display.story[line.encounter] = line.text;
            const active = context.session.ai.activeScript;
            if (active?.runId === record.runId) {
              active.story[line.encounter] = line.text;
              if (active.display?.story) active.display.story[line.encounter] = line.text;
              for (const paragraph of context.session.ai.storyView.pages[line.encounter])
                if (paragraph.stage === line.stage) paragraph.text = line.text;
            }
          }
        }
        context.generation.save();
        selectRecord(selectedRecord);
      },
      { once: true },
    );
    $('#records-text').replaceChildren(
      title.wrapper,
      tags.wrapper,
      ...lines.map((line) => line.wrapper),
      save,
    );
  }

  function deleteSelectedRecord() {
    const record = library().history[selectedRecord];
    if (!record) return;
    if (
      context.session.runtime.mode === 'battle' &&
      context.session.ai.activeScript?.runId === record.runId
    ) {
      context.shell.toast('当前副本进行中，结束后可以删除记录。');
      return;
    }
    library().history.splice(selectedRecord, 1);
    library().scripts = library().scripts.filter((book) => book.id !== record.scriptId);
    for (const route of Object.values(library().exploration || {}))
      route.history = (route.history || []).filter((item) => item.runId !== record.runId);
    context.generation.save();
    selectRecord(Math.min(selectedRecord, library().history.length - 1));
  }

  function enemyArchiveState() {
    const { worlds, seenMonsters } = library();
    return {
      buckets: buildEnemyArchiveEntries(
        {
          ...DEFINITIONS,
          ...ARENA_ARCHIVE_DEFINITIONS,
          ...ARENA_QUALIFIER_ARCHIVE_DEFINITIONS,
          ...SILVER_CROWN_SYNDICATE_ARCHIVE_DEFINITIONS,
        },
        worlds,
      ),
      access: {
        seenMonsters,
        unlockAll: developerOption(context.session.ai.generationOptions, 'unlockAllCodex'),
      },
    };
  }

  async function exportEnemyArchive() {
    if (!archive.open || tab !== 'enemies' || enemyExportButton.hasAttribute('aria-disabled'))
      return;
    enemyExportButton.setAttribute('aria-disabled', 'true');
    enemyExportStatus.textContent = '正在导出…';
    try {
      const { buckets, access } = enemyArchiveState();
      const data = buildEnemyArchiveExport(buckets, access);
      const { method } = await exportJsonFile(
        JSON.stringify(data, null, 2),
        'wanxiang-enemy-codex.json',
      );
      enemyExportStatus.textContent = method === 'native' ? '图鉴已导出' : '已开始下载';
    } catch (failure) {
      enemyExportStatus.textContent =
        failure.code === 'cancelled' ? '已取消导出' : `导出失败：${failure.message}`;
    } finally {
      enemyExportButton.removeAttribute('aria-disabled');
    }
  }

  function renderArchive(index = 0) {
    modelStage.unmount();
    syncModePanes();

    if (tab === 'records') {
      const fallbackIndex =
        selectedRecord >= 0 && selectedRecord < library().history.length
          ? selectedRecord
          : library().history.length - 1;
      selectRecord(fallbackIndex);
      return;
    }

    if (tab === 'memory') {
      const tierBar = archive.querySelector('.archive-enemy-tiers');
      const categoryToggle = archive.querySelector('[data-enemy-category-toggle]');
      const categoryBar = archive.querySelector('.archive-enemy-categories');
      tierBar.hidden = true;
      categoryToggle.hidden = true;
      categoryBar.hidden = true;
      archive.classList.remove('is-empty');
      void context.memory?.syncPanel?.();
      return;
    }

    if (tab === 'manual') {
      renderManual(index);
      return;
    }

    const tierBar = archive.querySelector('.archive-enemy-tiers');
    const categoryToggle = archive.querySelector('[data-enemy-category-toggle]');
    const categoryBar = archive.querySelector('.archive-enemy-categories');
    const progressBar = archive.querySelector('.archive-codex-progress');

    if (tab === 'enemies') {
      const { buckets, access } = enemyArchiveState();
      const { unlockAll } = access;
      const { visibleBuckets, totalCount, unlockedCount, tierStats, categoryStats } =
        filterEnemyArchiveBuckets(buckets, { ...access, category: enemyCategory });
      const listEntries = visibleBuckets[enemyTier] || [];
      const activeIndex = listEntries.length
        ? Math.max(0, Math.min(index, listEntries.length - 1))
        : -1;
      selectedIndex = Math.max(0, activeIndex);
      archive.classList.remove('is-empty');
      progressBar.hidden = false;
      progressBar.innerHTML = `<span class="archive-codex-label">魔物图鉴 · 已解锁</span><strong class="archive-codex-count">${unlockedCount} / ${totalCount}</strong>${unlockAll ? '<em class="archive-codex-dev">开发者全开</em>' : ''}`;
      tierBar.hidden = false;
      tierBar.innerHTML = ENEMY_ARCHIVE_TIERS.map(
        ({ id, label }) =>
          `<button type="button" data-enemy-tier="${id}" aria-pressed="${String(id === enemyTier)}">${escapeText(label)}<span>${tierStats[id].unlocked}/${tierStats[id].total}</span></button>`,
      ).join('');
      const showCategories = enemyTier === 'minion' && enemyCategoriesActivated;
      categoryToggle.hidden = !showCategories;
      categoryToggle.setAttribute('aria-expanded', String(enemyCategoriesExpanded));
      categoryToggle.querySelector('[data-category-toggle-label]').textContent =
        enemyCategoriesExpanded ? '收起⌃' : '展开⌄';
      categoryBar.hidden = !showCategories || !enemyCategoriesExpanded;
      categoryBar.innerHTML = [
        { id: 'all', label: '全部', stats: categoryStats.all },
        ...ENEMY_ARCHIVE_CATEGORIES.map(({ id, label }) => ({
          id,
          label,
          stats: categoryStats[id],
        })),
      ]
        .map(
          ({ id, label, stats }) =>
            `<button type="button" data-enemy-category="${id}" aria-pressed="${String(id === enemyCategory)}">${escapeText(label)}<span>${stats.unlocked}/${stats.total}</span></button>`,
        )
        .join('');
      $('#archive-list').replaceChildren(
        ...listEntries.map((item, itemIndex) =>
          buildListItemButton({
            active: activeIndex === itemIndex,
            titleText: item.name,
            metaText: item.isComposite
              ? '三位一体 · 3 部位'
              : [
                  ENEMY_ARCHIVE_CATEGORIES.find(({ id }) => id === item.category)?.label || '其他',
                  item.baseSpecies,
                ]
                  .filter(Boolean)
                  .join(' · '),
            dataset: { archiveIndex: itemIndex },
          }),
        ),
      );
      const area = $('#archive-text');
      area.replaceChildren();
      const selectedItem = activeIndex >= 0 ? listEntries[activeIndex] : null;
      if (!selectedItem) {
        emptyState(
          area,
          '当前筛选下暂无已解锁魔物',
          `当前已解锁 ${unlockedCount} / ${totalCount} 种魔物；遭遇符合筛选条件的新敌人后将自动收录于此。`,
        );
        return;
      }
      renderEnemyFolio(area, selectedItem);
      area.scrollTop = 0;
      return;
    }

    progressBar.hidden = true;
    tierBar.hidden = true;
    categoryToggle.hidden = true;
    categoryBar.hidden = true;
    const entries =
      tab === 'items' ? mergedArchiveItems(library().archives.items) : library().archives[tab];
    const activeIndex = entries.length ? Math.max(0, Math.min(index, entries.length - 1)) : -1;
    selectedIndex = Math.max(0, activeIndex);
    archive.classList.toggle('is-empty', !entries.length);
    $('#archive-list').replaceChildren(
      ...entries.map((entry, entryIndex) =>
        buildListItemButton({
          active: activeIndex === entryIndex,
          titleText: entry.name,
          dataset: { archiveIndex: entryIndex },
        }),
      ),
    );
    const entry = activeIndex >= 0 ? entries[activeIndex] : null;
    const area = $('#archive-text');
    area.replaceChildren();
    if (!entry) {
      emptyState(
        area,
        tab === 'npcs' ? '尚未结识新的旅人' : '行囊里尚无收藏',
        tab === 'npcs' ? '探索中遇见的人物将收录于此。' : '探索中收集的物品将收录于此。',
      );
      return;
    }
    const header = document.createElement('div');
    header.className = 'skyrim-folio-head';
    header.append(
      buildBadgeRow([
        tab === 'npcs' ? '旅人名录 · CHARACTER' : '奇物收藏 · RELIC',
        ...(tab === 'items' && entry.level ? [`Lv.${entry.level}`] : []),
      ]),
      buildDividerNode(),
    );
    const name = field('姓名 / 名称', entry.name);
    const content = field(
      tab === 'npcs' ? '外貌与经历' : '描述（20字以内）',
      entry.content || entry.description,
      true,
    );
    if (tab === 'items') content.input.maxLength = 20;
    const keywords = field('关键词（用逗号分隔）', (entry.keywords || [entry.name]).join('，'));
    const sources = document.createElement('p');
    sources.className = 'archive-sources';
    sources.textContent = (entry.sources || [entry.source])
      .filter(Boolean)
      .map(
        (source) =>
          `来自《${source.title}》· 地图 ${REGIONS[source.map || entry.map || 'ruins']?.name || source.map || entry.map || '遗迹'} · ${Number.isInteger(source.encounter) ? `第 ${source.encounter + 1} 战` : '城外行程'}`,
      )
      .join('\n');
    if (tab === 'items') {
      const qual =
        { common: '普通', uncommon: '精良', rare: '稀有', epic: '史诗', legendary: '传说' }[
          entry.quality
        ] || '';
      const meta = [entry.level ? `Lv.${entry.level}` : '', qual].filter(Boolean).join(' · ');
      sources.textContent += `\n${meta ? meta + ' · ' : ''}价值 ${entry.value} 以太 · ${entry.converted ? '已折算' : '未折算'}`;
    }
    const save = document.createElement('button');
    save.textContent = '保存修改';
    const allowed =
      archiveEditing && developerOption(context.session.ai.generationOptions, 'editArchives');
    for (const input of [name.input, content.input, keywords.input]) input.readOnly = !allowed;
    save.hidden = !allowed;
    const edit = document.createElement('button');
    edit.textContent = '调整设定';
    edit.hidden = !developerOption(context.session.ai.generationOptions, 'editArchives');
    edit.addEventListener(
      'click',
      () => {
        archiveEditing = !archiveEditing;
        renderArchive(activeIndex);
      },
      { once: true },
    );
    save.addEventListener(
      'click',
      () => {
        if (!developerOption(context.session.ai.generationOptions, 'editArchives')) return;
        entry.name = name.input.value.trim() || entry.name;
        if (tab === 'npcs') {
          entry.content = content.input.value;
          entry.keywords = keywords.input.value
            .split(/[,，、]/)
            .map((key) => key.trim())
            .filter(Boolean);
          const key = (value) => value.normalize('NFKC').trim().toLowerCase();
          const duplicate = entries.find(
            (other) => other !== entry && key(other.name) === key(entry.name),
          );
          if (duplicate) {
            if (!duplicate.content.includes(entry.content))
              duplicate.content += `\n\n${entry.content}`;
            duplicate.keywords = [...new Set([...duplicate.keywords, ...entry.keywords])];
            for (const source of entry.sources)
              if (
                !duplicate.sources.some(
                  (other) => other.runId === source.runId && other.encounter === source.encounter,
                )
              )
                duplicate.sources.push(source);
            entries.splice(activeIndex, 1);
          }
        } else {
          entry.description = content.input.value.slice(0, 20);
          for (const item of library().archives.items)
            if (entry.archiveIds.includes(item.id)) {
              item.name = entry.name;
              item.description = entry.description;
            }
        }
        context.generation.save();
        renderArchive(Math.min(activeIndex, entries.length - 1));
      },
      { once: true },
    );
    area.append(header, name.wrapper, content.wrapper);
    if (tab === 'npcs') area.append(keywords.wrapper);
    const actions = document.createElement('div');
    actions.className = 'archive-edit-actions';
    actions.append(edit, save);
    area.append(sources, actions);
    area.scrollTop = 0;
  }

  function openTab(nextTab = 'npcs') {
    const valid = ['npcs', 'items', 'enemies', 'records', 'memory', 'manual'];
    tab = valid.includes(nextTab) ? nextTab : 'npcs';
    archiveEditing = false;
    if (tab === 'records') selectedRecord = library().history.length - 1;
    renderArchive(tab === 'manual' ? 0 : selectedIndex);
    if (!archive.open) archive.showModal();
  }

  const archivesBtn = $('#archives-open');
  if (archivesBtn) context.events.on(archivesBtn, 'click', () => openTab('npcs'));
  const recordsBtn = $('#records-open');
  if (recordsBtn) context.events.on(recordsBtn, 'click', () => openTab('records'));

  context.events.on(enemyExportButton, 'click', () => void exportEnemyArchive());
  context.events.on($('#archive-close'), 'click', () => {
    modelStage.unmount();
    archive.close();
  });
  context.events.on(archive, 'close', () => {
    // A queued close event can arrive after a rapid reopen has mounted a new model.
    if (!archive.open) modelStage.unmount();
  });
  context.events.on(archive, 'click', (event) => {
    if (event.target.closest('#records-edit')) return startEditingRecord();
    if (event.target.closest('#records-delete')) return deleteSelectedRecord();
    const viewBtn = event.target.closest('[data-records-view]');
    if (viewBtn) return selectRecord(selectedRecord, viewBtn.dataset.recordsView);
    const recBtn = event.target.closest('[data-record]');
    if (recBtn) return selectRecord(Number(recBtn.dataset.record));
    const type = event.target.closest('[data-archive-tab]');
    const tierButton = event.target.closest('[data-enemy-tier]');
    const categoryToggle = event.target.closest('[data-enemy-category-toggle]');
    const categoryButton = event.target.closest('[data-enemy-category]');
    const item = event.target.closest('[data-archive-index]');
    if (categoryToggle) {
      enemyCategoriesActivated = true;
      enemyCategoriesExpanded = !enemyCategoriesExpanded;
      try {
        preferenceStorage?.setItem(categoryPreferenceKey, String(enemyCategoriesExpanded));
      } catch {
        // Ignore storage write errors when persisting UI preferences.
      }
      renderArchive(selectedIndex);
    } else if (type) {
      tab = type.dataset.archiveTab;
      if (tab === 'records') selectedRecord = library().history.length - 1;
      renderArchive(0);
    } else if (tierButton) {
      enemyTier = tierButton.dataset.enemyTier;
      if (enemyTier === 'minion') enemyCategoriesActivated = true;
      else enemyCategory = 'all';
      renderArchive(0);
    } else if (categoryButton) {
      enemyCategory = categoryButton.dataset.enemyCategory;
      renderArchive(0);
    } else if (item) {
      renderArchive(Number(item.dataset.archiveIndex));
    }
  });

  return {
    openTab,
    close() {
      modelStage.unmount();
      if (archive.open) archive.close();
    },
    closeIfTab(target) {
      if (archive.open && tab === target) {
        modelStage.unmount();
        archive.close();
      }
    },
    refreshArchive() {
      if (archive.open) renderArchive(tab === 'records' ? selectedRecord : selectedIndex);
    },
    dispose() {
      modelStage.dispose();
      archive.remove();
    },
  };
}
