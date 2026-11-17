import { DEFINITIONS } from '../data.js';
import { portraitUrl } from '../portraits.js';
import { mergedArchiveItems } from '../archives.js';
import { REGIONS } from '../content/regions.js';
import { ENEMY_ARCHIVE_TIERS, buildEnemyArchiveEntries } from '../archive-enemies.js';
import { createArchiveModelStage } from './archive-model-stage.js';
import { query as $ } from './dom.js';
import { developerOption } from '../generation-options.js';
import { enemyIntentText } from '../enemy-intent-text.js';
import { dungeonMemoryText, restoredSummary } from '../memory.js';
import { ADVENTURE_NODE_LABELS } from '../adventure/definition.js';
import { escapeText } from '../ui.js';

/** Only reached prose is editable here; future battles remain in the script. */
export function createRecords(context) {
  let selected = -1;
  let editing = false;
  const dialog = document.createElement('dialog');
  dialog.id = 'journey-records';
  dialog.innerHTML =
    '<header><div class="records-title"><small>JOURNEY / JOURNAL</small><h2>旅途记录</h2></div><nav class="records-actions"><button id="records-edit">编辑</button><button id="records-delete">删除</button><button id="records-close" aria-label="关闭记录">×</button></nav></header><div class="records-body"><nav id="records-list"></nav><article id="records-text"></article></div>';
  document.body.append(dialog);
  const library = () => context.session.ai.library;
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
  function list() {
    dialog.classList.toggle('is-empty', !library().history.length);
    $('#records-list').replaceChildren(
      ...library()
        .history.map((record, index) => {
          const button = document.createElement('button');
          button.dataset.record = index;
          const summarized = restoredSummary(record.summary, dungeonMemoryText(record));
          button.textContent = `${index + 1} · ${record.title}${record.complete ? ' · 完成' : ''}${summarized ? ' · 已总结' : ''}`;
          return button;
        })
        .reverse(),
    );
  }
  function select(index, view) {
    selected = index;
    editing = false;
    $('#records-edit').textContent = '编辑';
    const record = library().history[index];
    $('#records-edit').disabled = !record;
    $('#records-delete').disabled = !record;
    const area = $('#records-text');
    area.replaceChildren();
    if (!record) {
      emptyState(area, '旅程尚未落笔', '已走过的副本故事会保存在这里。');
      return;
    }
    const title = document.createElement('h3');
    title.textContent = record.title;
    area.append(title);
    const tags = document.createElement('small');
    const original = dungeonMemoryText(record);
    const summary = restoredSummary(record.summary, original);
    tags.textContent = `${record.gameTime ? record.gameTime + ' · ' : ''}关键词：${summary ? (summary.keywords || []).filter(Boolean).join('、') || '无' : '待总结'}`;
    area.append(tags);
    const showingSummary = !!summary && view !== 'original';
    const information = document.createElement('p');
    information.className = 'records-memory-status';
    const count = (value) => Array.from(value.replace(/\s/gu, '')).length;
    information.textContent = summary
      ? `原文 ${count(original)} 字 · 总结 ${count(summary.text)} 字 · AI上下文使用总结`
      : `${record.summary ? '总结已过期 · ' : '尚未总结 · '}原文 ${count(original)} 字 · AI上下文使用原文`;
    area.append(information);
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
    } else renderOriginal(record, content);
    area.scrollTop = 0;
    $('#records-list')
      .querySelectorAll('button')
      .forEach((button) =>
        button.setAttribute('aria-pressed', String(Number(button.dataset.record) === index)),
      );
  }
  function renderOriginal(record, area) {
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
  context.events.on($('#records-text'), 'click', (event) => {
    const button = event.target.closest('[data-records-view]');
    if (button) select(selected, button.dataset.recordsView);
  });
  context.events.on($('#records-open'), 'click', () => {
    list();
    select(library().history.length - 1);
    if (!dialog.open) dialog.showModal();
  });
  context.events.on($('#records-edit'), 'click', () => {
    if (editing) return;
    const record = library().history[selected];
    if (!record) return;
    editing = true;
    const title = field('标题', record.title);
    const tags = field('关键词（用逗号分隔）', (record.tags || []).join('，'));
    const lines = record.lines
      .filter((line) => line.stage !== 'combat')
      .map((line) => ({ line, ...field(`第 ${line.encounter + 1} 战`, line.text, true) }));
    const save = document.createElement('button');
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
        list();
        select(selected);
      },
      { once: true },
    );
    $('#records-text').replaceChildren(
      title.wrapper,
      tags.wrapper,
      ...lines.map((line) => line.wrapper),
      save,
    );
  });
  context.events.on($('#records-delete'), 'click', () => {
    const record = library().history[selected];
    if (!record) return;
    if (
      context.session.runtime.mode === 'battle' &&
      context.session.ai.activeScript?.runId === record.runId
    ) {
      context.shell.toast('当前副本进行中，结束后可以删除记录。');
      return;
    }
    library().history.splice(selected, 1);
    library().scripts = library().scripts.filter((book) => book.id !== record.scriptId);
    for (const route of Object.values(library().exploration || {}))
      route.history = (route.history || []).filter((item) => item.runId !== record.runId);
    context.generation.save();
    list();
    select(Math.min(selected, library().history.length - 1));
  });
  context.events.on($('#records-list'), 'click', (event) => {
    const button = event.target.closest('[data-record]');
    if (button) select(Number(button.dataset.record));
  });
  context.events.on($('#records-close'), 'click', () => dialog.close());
  const SKYRIM_DIVIDER_SVG =
    '<svg class="skyrim-divider-svg" viewBox="0 0 360 22" aria-hidden="true"><path d="M12 11H158M202 11H348" stroke="currentColor" stroke-width="1" stroke-opacity=".55"/><path d="M180 2L192 11L180 20L168 11Z" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M180 6L185 11L180 16L175 11Z" fill="currentColor" fill-opacity=".8"/><circle cx="158" cy="11" r="2" fill="currentColor"/><circle cx="202" cy="11" r="2" fill="currentColor"/></svg>';
  const MOON_PART_ROLES = {
    moonCrown: '左翼冠层 · 瘟疫与生机',
    moonEye: '中央核心 · 破坏射线',
    moonRoot: '右翼根脉 · 扫击与修复',
  };
  const archive = document.createElement('dialog');
  archive.id = 'archive-dialog';
  archive.className = 'skyrim-archive-dialog';
  archive.setAttribute('aria-label', '旅途归档');
  archive.innerHTML =
    '<header><div class="records-title"><small>CODEX / ARCHIVES · 典藏卷宗</small><h2>旅途归档</h2></div><nav class="records-actions"><div class="archive-tabs"><button type="button" data-archive-tab="npcs">NPC</button><button type="button" data-archive-tab="items">道具</button><button type="button" data-archive-tab="enemies">敌人</button></div><button type="button" id="archive-close" aria-label="关闭归档">×</button></nav></header><div class="records-body"><div class="archive-index-col"><nav class="archive-enemy-tiers" aria-label="敌人阶级" hidden></nav><nav id="archive-list"></nav></div><article id="archive-text"></article></div>';
  document.body.append(archive);
  const modelStage = createArchiveModelStage();
  let tab = 'npcs';
  let enemyTier = 'minion';
  let archiveEditing = false;

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
      body.append(strong, enemyIntentText(move));
      item.append(diamond, body);
      listEl.append(item);
    }
    section.append(heading, listEl);
    return section;
  }

  function buildStatStrip(entry) {
    const strip = document.createElement('div');
    strip.className = 'skyrim-archive-stats';
    const stats = [
      ['基础生命', String(entry.hp)],
      ['行动速度', String(entry.speed)],
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
          meta.textContent = `生命 ${part.hp} · 速度 ${part.speed}`;
          partHead.append(role, name, meta);
          card.append(partHead);
          if (part.description) {
            const partDesc = document.createElement('p');
            partDesc.className = 'skyrim-part-desc';
            partDesc.textContent = part.description;
            card.append(partDesc);
          }
          appendUnitMoves(card, part, '部位行动');
          partsWrap.append(card);
        }
        area.append(partsWrap);
      } else {
        area.append(buildStatStrip(item.entry));
        appendUnitMoves(area, item.entry);
      }

      void modelStage.mount(stage, item);
      return;
    }

    const entry = item.entry;
    const header = document.createElement('div');
    header.className = 'skyrim-folio-head';
    header.append(buildBadgeRow([tierInfo?.badge || '敌人情报', item.sources]));
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

  function renderArchive(index = 0) {
    modelStage.unmount();
    archive.querySelectorAll('[data-archive-tab]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.archiveTab === tab));
    });
    const tierBar = archive.querySelector('.archive-enemy-tiers');

    if (tab === 'enemies') {
      const buckets = buildEnemyArchiveEntries(DEFINITIONS, library().worlds || []);
      const listEntries = buckets[enemyTier] || [];
      const activeIndex = listEntries.length
        ? Math.max(0, Math.min(index, listEntries.length - 1))
        : -1;
      archive.classList.remove('is-empty');
      tierBar.hidden = false;
      tierBar.innerHTML = ENEMY_ARCHIVE_TIERS.map(
        ({ id, label }) =>
          `<button type="button" data-enemy-tier="${id}" aria-pressed="${String(id === enemyTier)}">${escapeText(label)}<span>${buckets[id].length}</span></button>`,
      ).join('');
      $('#archive-list').replaceChildren(
        ...listEntries.map((item, itemIndex) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'skyrim-archive-item';
          button.dataset.archiveIndex = itemIndex;
          button.setAttribute('aria-pressed', String(activeIndex === itemIndex));
          const pointer = document.createElement('span');
          pointer.className = 'skyrim-pointer';
          pointer.setAttribute('aria-hidden', 'true');
          pointer.textContent = activeIndex === itemIndex ? '◆' : '◇';
          const copy = document.createElement('span');
          copy.className = 'skyrim-archive-item-copy';
          const titleEl = document.createElement('strong');
          titleEl.textContent = item.name;
          const metaEl = document.createElement('small');
          metaEl.textContent = item.isComposite
            ? '三位一体 · 3 部位'
            : `生命 ${item.entry.hp} · 速 ${item.entry.speed}`;
          copy.append(titleEl, metaEl);
          button.append(pointer, copy);
          return button;
        }),
      );
      const area = $('#archive-text');
      area.replaceChildren();
      const selectedItem = activeIndex >= 0 ? listEntries[activeIndex] : null;
      if (!selectedItem) {
        emptyState(area, '此阶级尚无敌人记录', '推进副本与探索后会收录对应魔物情报。');
        return;
      }
      renderEnemyFolio(area, selectedItem);
      area.scrollTop = 0;
      return;
    }

    tierBar.hidden = true;
    const entries =
      tab === 'items' ? mergedArchiveItems(library().archives.items) : library().archives[tab];
    const activeIndex = entries.length ? Math.max(0, Math.min(index, entries.length - 1)) : -1;
    archive.classList.toggle('is-empty', !entries.length);
    $('#archive-list').replaceChildren(
      ...entries.map((entry, entryIndex) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'skyrim-archive-item';
        button.dataset.archiveIndex = entryIndex;
        button.setAttribute('aria-pressed', String(activeIndex === entryIndex));
        const pointer = document.createElement('span');
        pointer.className = 'skyrim-pointer';
        pointer.setAttribute('aria-hidden', 'true');
        pointer.textContent = activeIndex === entryIndex ? '◆' : '◇';
        const copy = document.createElement('span');
        copy.className = 'skyrim-archive-item-copy';
        const titleEl = document.createElement('strong');
        titleEl.textContent = entry.name;
        copy.append(titleEl);
        button.append(pointer, copy);
        return button;
      }),
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

  context.events.on($('#archives-open'), 'click', () => {
    archiveEditing = false;
    renderArchive();
    if (!archive.open) archive.showModal();
  });
  context.events.on($('#archive-close'), 'click', () => {
    modelStage.unmount();
    archive.close();
  });
  context.events.on(archive, 'close', () => modelStage.unmount());
  context.events.on(archive, 'click', (event) => {
    const type = event.target.closest('[data-archive-tab]');
    const tierButton = event.target.closest('[data-enemy-tier]');
    const item = event.target.closest('[data-archive-index]');
    if (type) {
      tab = type.dataset.archiveTab;
      renderArchive();
    } else if (tierButton) {
      enemyTier = tierButton.dataset.enemyTier;
      renderArchive();
    } else if (item) renderArchive(Number(item.dataset.archiveIndex));
  });
  return {
    dispose() {
      modelStage.dispose();
      dialog.remove();
      archive.remove();
    },
  };
}
