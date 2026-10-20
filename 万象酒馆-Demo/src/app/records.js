import { DEFINITIONS } from '../data.js';
import { portraitUrl } from '../portraits.js';
import { mergedArchiveItems } from '../archives.js';
import { REGIONS } from '../content/regions.js';
import { query as $ } from './dom.js';
import { developerOption } from '../generation-options.js';

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
          button.textContent = `${index + 1} · ${record.title}${record.complete ? ' · 完成' : ''}`;
          return button;
        })
        .reverse(),
    );
  }
  function select(index) {
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
    tags.textContent = `关键词：${(record.tags || []).join('、') || '无'}`;
    area.append(tags);
    for (
      let part = 0;
      part <= Math.max(0, ...(record.lines || []).map((line) => line.encounter ?? 0));
      part++
    ) {
      const lines = (record.lines || []).filter(
        (line) => line.encounter === part && line.stage !== 'combat',
      );
      if (!lines.length) continue;
      const heading = document.createElement('h4');
      heading.textContent = `第 ${part + 1} 战`;
      area.append(heading);
      for (const line of lines) {
        const paragraph = document.createElement('p');
        paragraph.textContent =
          line.speaker && line.speaker !== '旁白' ? `${line.speaker}：${line.text}` : line.text;
        area.append(paragraph);
      }
    }
    if (area.children.length === 2) area.append('这趟旅程还没有展示正文。');
    area.scrollTop = 0;
    $('#records-list')
      .querySelectorAll('button')
      .forEach((button) =>
        button.setAttribute('aria-pressed', String(Number(button.dataset.record) === index)),
      );
  }
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
          if (book?.schemaVersion >= 3) {
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
  const archive = document.createElement('dialog');
  archive.id = 'archive-dialog';
  archive.innerHTML =
    '<header><div class="records-title"><small>JOURNEY / COLLECTION</small><h2>旅途归档</h2></div><nav class="records-actions"><div class="archive-tabs"><button data-archive-tab="npcs">NPC</button><button data-archive-tab="items">道具</button><button data-archive-tab="enemies">敌人</button></div><button id="archive-close" aria-label="关闭归档">×</button></nav></header><div class="records-body"><nav id="archive-list"></nav><article id="archive-text"></article></div>';
  document.body.append(archive);
  let tab = 'npcs';
  let archiveEditing = false;
  function renderArchive(index = 0) {
    const entries =
      tab === 'enemies'
        ? Object.values({
            ...DEFINITIONS,
            ...Object.assign(
              {},
              ...(library().worlds || []).map((world) => world.enemyDefinitions),
            ),
          }).filter((entry) => entry.speed)
        : tab === 'items'
          ? mergedArchiveItems(library().archives.items)
          : library().archives[tab];
    archive.classList.toggle('is-empty', !entries.length);
    archive.querySelectorAll('[data-archive-tab]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.archiveTab === tab));
    });
    $('#archive-list').replaceChildren(
      ...entries.map((entry, entryIndex) => {
        const button = document.createElement('button');
        button.dataset.archiveIndex = entryIndex;
        button.textContent = entry.name;
        button.setAttribute('aria-pressed', String(index === entryIndex));
        return button;
      }),
    );
    const entry = entries[index];
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
    if (tab === 'enemies') {
      const picture = document.createElement('img');
      picture.src = portraitUrl(entry);
      picture.width = 96;
      picture.alt = entry.name;
      const heading = document.createElement('h3');
      heading.textContent = entry.name + (entry.boss ? ' · Boss' : '');
      const stats = document.createElement('p');
      stats.textContent = `生命 ${entry.hp} · 速度 ${entry.speed}`;
      const source = document.createElement('p');
      source.textContent =
        (library().worlds || [])
          .filter((world) => world.enemyIds.includes(entry.id))
          .map((world) => world.name)
          .join('、') || '官方敌人';
      area.append(picture, heading, stats, source);
      for (const move of [...entry.intents, ...(entry.enragedIntents || [])]) {
        const line = document.createElement('p');
        line.textContent = `${move.name}：${move.text}`;
        area.append(line);
      }
      return;
    }
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
          `来自《${source.title}》· 地图 ${REGIONS[source.map || entry.map || 'ruins']?.name || source.map || entry.map || '遗迹'} · 第 ${source.encounter + 1} 战`,
      )
      .join('\n');
    if (tab === 'items')
      sources.textContent += `\n价值 ${entry.value} 以太 · ${entry.converted ? '已折算' : '未折算'}`;
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
        renderArchive(index);
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
            entries.splice(index, 1);
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
        renderArchive(Math.min(index, entries.length - 1));
      },
      { once: true },
    );
    area.append(name.wrapper, content.wrapper);
    if (tab === 'npcs') area.append(keywords.wrapper);
    const actions = document.createElement('div');
    actions.className = 'archive-edit-actions';
    actions.append(edit, save);
    area.append(sources, actions);
  }
  context.events.on($('#archives-open'), 'click', () => {
    archiveEditing = false;
    renderArchive();
    if (!archive.open) archive.showModal();
  });
  context.events.on($('#archive-close'), 'click', () => archive.close());
  context.events.on(archive, 'click', (event) => {
    const type = event.target.closest('[data-archive-tab]');
    const item = event.target.closest('[data-archive-index]');
    if (type) {
      tab = type.dataset.archiveTab;
      renderArchive();
    } else if (item) renderArchive(Number(item.dataset.archiveIndex));
  });
  return {
    dispose() {
      dialog.remove();
      archive.remove();
    },
  };
}
