import { readFile } from 'node:fs/promises';
import { newWorldEntry } from '../src/ai/worldbook.js';
import { OUTPUT_OPEN, OUTPUT_CLOSE } from './output-envelope.mjs';

export async function characterGenerationSources() {
  const names = [
    'character-definition',
    'character-mechanics',
    'character-output',
    'growth-numbers',
  ];
  return {
    rules: Object.fromEntries(
      await Promise.all(
        names.map(async (name) => [
          name,
          await readFile(new URL(`../prompts/worldbook/${name}.md`, import.meta.url), 'utf8'),
        ]),
      ),
    ),
    reference: await readFile(
      new URL('../prompts/worldbook/character-example.json', import.meta.url),
      'utf8',
    ),
  };
}

function compactExample(value) {
  if (value?.schemaVersion === 3 && Array.isArray(value.story)) return value;
  if (value?.schemaVersion === 2 && Array.isArray(value.scenes)) {
    const copy = structuredClone(value);
    for (const scene of copy.scenes) delete scene.encounter;
    return copy;
  }
  if (!value?.data || value.schemaVersion !== 3) return value;
  const copy = structuredClone(value);
  for (const key of ['name', 'title', 'attackName']) delete copy.data[key];
  delete copy.setting.ultimate;
  delete copy.data.ultimate;
  delete copy.data.quest;
  for (const skill of copy.data.skills || [])
    if (skill && typeof skill === 'object') delete skill.name;
  return copy;
}

/** Split the two legacy instruction blobs once, preserving unrelated entries and user edits. */
export async function splitGenerationWorldbook(source) {
  const book = structuredClone(source);
  const manifest = JSON.parse(
    await readFile(new URL('../prompts/worldbook/entries.json', import.meta.url), 'utf8'),
  );
  let nextUid = Math.max(-1, ...Object.keys(book.entries).map(Number)) + 1;
  for (const kind of ['character', 'script']) {
    const oldName =
      kind === 'character' ? '角色生成 · 设定与数据要求' : '副本剧本 · 事件推进与篇幅';
    const header =
      kind === 'character' ? '【可编辑生成要求 / CHARACTER v3' : '【可编辑生成要求 / SCRIPT v2';
    const legacy = Object.values(book.entries).find(
      (entry) => entry.comment === oldName || entry.content.startsWith(header),
    );
    const original = (
      await readFile(new URL(`../prompts/worldbook/${kind}.md`, import.meta.url), 'utf8')
    ).trim();
    const common = {
      constant: true,
      preventRecursion: true,
      ignoreBudget: true,
      apiTargets: legacy?.apiTargets || [kind],
      disable: legacy?.disable || false,
    };
    if (legacy && legacy.content.trim() !== original) {
      const uid = nextUid++;
      const suffixOnly = legacy.content.trim().startsWith(original);
      book.entries[uid] = {
        ...structuredClone(legacy),
        uid,
        displayIndex: uid,
        content: suffixOnly ? legacy.content.trim().slice(original.length).trim() : legacy.content,
        comment: `${kind === 'character' ? '角色生成' : '副本剧本'} · ${suffixOnly ? '旧条目自定义补充' : '迁移前自定义原文（留存）'}`,
        disable: suffixOnly ? legacy.disable : true,
        extensions: {
          ...legacy.extensions,
          wanxiangMigration: { originalUid: legacy.uid, preserved: true },
        },
      };
    }
    for (const [index, definition] of manifest.filter((entry) => entry.kind === kind).entries()) {
      const uid = index === 0 && legacy ? legacy.uid : nextUid++;
      book.entries[uid] = {
        ...newWorldEntry(uid),
        ...common,
        comment: definition.name,
        content: await readFile(
          new URL(`../prompts/worldbook/${definition.id}.md`, import.meta.url),
          'utf8',
        ),
        position: definition.position,
        role: definition.role || 0,
        depth: definition.depth || 0,
        order: definition.order,
        extensions: {
          wanxiang: { generationRule: definition.id, apiTargets: [...common.apiTargets] },
        },
      };
    }
    const exampleName =
      kind === 'character' ? '角色生成 · 完整格式示例' : '副本剧本 · 六站格式示例';
    const example = Object.values(book.entries).find((entry) => entry.comment === exampleName);
    if (example)
      Object.assign(example, {
        comment: `${kind === 'character' ? '角色生成' : '副本剧本'} · JSON格式示例 @D`,
        position: 4,
        role: 2,
        depth: 1,
        order: 9998,
      });
  }
  return book;
}

/** Upgrade only owned protocol paragraphs/examples; keep user content, targets and placement. */
export async function tagGenerationWorldbook(source) {
  const book = structuredClone(source);
  for (const kind of ['character', 'script']) {
    const rule = Object.values(book.entries).find(
      (entry) => entry.extensions?.wanxiang?.generationRule === `${kind}-output`,
    );
    if (rule && !rule.content.includes(OUTPUT_OPEN)) {
      const template = await readFile(
        new URL(`../prompts/worldbook/${kind}-output.md`, import.meta.url),
        'utf8',
      );
      const instructions = template.split('\n').slice(1, 3).join('\n');
      const oldParagraph = /^(?:仅|只)输出一个完整JSON对象[^\r\n]*/m;
      rule.content = oldParagraph.test(rule.content)
        ? rule.content.replace(oldParagraph, instructions)
        : instructions + '\n\n' + rule.content;
    }
    const name = `${kind === 'character' ? '角色生成' : '副本剧本'} · JSON格式示例 @D`;
    for (const example of Object.values(book.entries).filter((entry) => entry.comment === name)) {
      if (example.content.includes(OUTPUT_OPEN)) continue;
      try {
        JSON.parse(example.content);
      } catch {
        // A user-written non-JSON example is preserved for manual editing.
        continue;
      }
      example.content = `${OUTPUT_OPEN}\n${example.content.trim()}\n${OUTPUT_CLOSE}`;
    }
  }
  return book;
}

/** Full worked examples are editor references, not the current task's completed answers. */
export async function retireGenerationExamples(source) {
  const book = structuredClone(source);
  for (const kind of ['character', 'script']) {
    const output = Object.values(book.entries).find(
      (entry) => entry.extensions?.wanxiang?.generationRule === `${kind}-output`,
    );
    if (output && !output.content.includes('【本次任务与示例边界】')) {
      const template = await readFile(
        new URL(`../prompts/worldbook/${kind}-output.md`, import.meta.url),
        'utf8',
      );
      const boundary = template.match(/【本次任务与示例边界】[\s\S]*?(?=\n\n|$)/)[0];
      output.content += '\n\n' + boundary;
    }
    const reference = JSON.parse(
      await readFile(new URL(`../prompts/worldbook/${kind}-example.json`, import.meta.url), 'utf8'),
    );
    const name = `${kind === 'character' ? '角色生成' : '副本剧本'} · JSON格式示例 @D`;
    for (const entry of Object.values(book.entries).filter((item) => item.comment === name)) {
      const text = entry.content.trim();
      const json =
        text.startsWith(OUTPUT_OPEN) && text.endsWith(OUTPUT_CLOSE)
          ? text.slice(OUTPUT_OPEN.length, -OUTPUT_CLOSE.length)
          : text;
      try {
        if (
          JSON.stringify(compactExample(JSON.parse(json))) !==
          JSON.stringify(compactExample(reference))
        )
          continue;
      } catch {
        continue;
      }
      entry.disable = true;
      entry.extensions = {
        ...entry.extensions,
        wanxiang: { ...entry.extensions?.wanxiang, generationExample: kind },
      };
    }
  }
  return book;
}

/** Remove duplicate generation instructions while preserving custom text and injection controls. */
export async function deduplicateGenerationWorldbook(source) {
  const book = structuredClone(source);
  const template = await readFile(
    new URL('../prompts/worldbook/character-output.md', import.meta.url),
    'utf8',
  );
  const dataRule = template.split('\n').find((line) => line.startsWith('data必须包含'));
  const reference = JSON.parse(
    await readFile(new URL('../prompts/worldbook/character-example.json', import.meta.url), 'utf8'),
  );
  const scriptTemplate = await readFile(
    new URL('../prompts/worldbook/script-output.md', import.meta.url),
    'utf8',
  );
  const scriptReference = JSON.parse(
    await readFile(new URL('../prompts/worldbook/script-example.json', import.meta.url), 'utf8'),
  );
  for (const entry of Object.values(book.entries)) {
    const rule = entry.extensions?.wanxiang?.generationRule;
    if (rule === 'character-output') {
      entry.content = /^data必须包含/m.test(entry.content)
        ? entry.content.replace(/^data必须包含[^\r\n]*/m, dataRule)
        : entry.content + '\n\n' + dataRule;
      entry.content = entry.content
        .replace(
          '主动技能与奥义仅含name/text/ap/mp/target/effects',
          '主动技能与奥义仅含text/ap/mp/target/effects',
        )
        .replace('两层名称对应', '技能槽位对应');
    }
    if (rule === 'character-mechanics' && !entry.content.includes('名称只在setting生成一次'))
      entry.content +=
        '\n\n名称只在setting生成一次，data不重复生成；技能按同序槽位对应，编译时由代码继承名称。';
    if (rule === 'script-output') {
      for (const prefix of ['根节点全部必填：', 'scenes恰好六项', 'speaker仅使用']) {
        const updated = scriptTemplate.split('\n').find((line) => line.startsWith(prefix));
        if (!updated) continue;
        const pattern = new RegExp('^' + prefix + '[^\\r\\n]*', 'm');
        entry.content = pattern.test(entry.content)
          ? entry.content.replace(pattern, updated)
          : entry.content + '\n' + updated;
      }
    }
    const exampleKind = entry.extensions?.wanxiang?.generationExample;
    if (!['character', 'script'].includes(exampleKind)) continue;
    const text = entry.content.trim();
    try {
      const raw = JSON.parse(
        text.startsWith(OUTPUT_OPEN) && text.endsWith(OUTPUT_CLOSE)
          ? text.slice(OUTPUT_OPEN.length, -OUTPUT_CLOSE.length)
          : text,
      );
      const compact = compactExample(raw);
      if (
        JSON.stringify(compact) !==
        JSON.stringify(exampleKind === 'character' ? reference : scriptReference)
      )
        continue;
      entry.content = `${OUTPUT_OPEN}\n${JSON.stringify(compact, null, 2)}\n${OUTPUT_CLOSE}`;
    } catch {
      // User-edited non-JSON examples remain untouched.
    }
  }
  return book;
}

/** Replace our old narrative constraints; retain their original text as inactive editor references. */
export async function relaxScriptWorldbook(source) {
  const book = structuredClone(source);
  const manifest = JSON.parse(
    await readFile(new URL('../prompts/worldbook/entries.json', import.meta.url), 'utf8'),
  );
  let uid = Math.max(-1, ...Object.keys(book.entries).map(Number)) + 1;
  for (const definition of manifest.filter((entry) => entry.kind === 'script')) {
    const content = await readFile(
      new URL(`../prompts/worldbook/${definition.id}.md`, import.meta.url),
      'utf8',
    );
    for (const entry of Object.values(book.entries).filter(
      (entry) => entry.extensions?.wanxiang?.generationRule === definition.id,
    )) {
      if (entry.content.trim() !== content.trim()) {
        book.entries[uid] = {
          ...structuredClone(entry),
          uid,
          displayIndex: uid,
          comment: `${entry.comment} · v3升级前留存（停用）`,
          disable: true,
          apiTargets: [],
          extensions: {
            wanxiangMigration: { originalUid: entry.uid, preserved: true, version: 8 },
          },
        };
        uid++;
      }
      entry.content = content;
      entry.comment = definition.name;
    }
  }
  return book;
}

/** Update only game integration entries; prose style and community presets remain user-owned. */
export async function adaptExplorationWorldbook(source) {
  const book = structuredClone(source);
  let uid = Math.max(-1, ...Object.keys(book.entries).map(Number)) + 1;
  for (const rule of ['script-output', 'script-definition', 'script-facts']) {
    const content = await readFile(
      new URL(`../prompts/worldbook/${rule}.md`, import.meta.url),
      'utf8',
    );
    for (const entry of Object.values(book.entries).filter(
      (entry) => entry.extensions?.wanxiang?.generationRule === rule,
    )) {
      if (entry.content.trim() === content.trim()) continue;
      book.entries[uid] = {
        ...structuredClone(entry),
        uid,
        displayIndex: uid,
        comment: `${entry.comment} · 1.1留存（停用）`,
        disable: true,
        apiTargets: [],
        extensions: { wanxiangMigration: { originalUid: entry.uid, preserved: true, version: 9 } },
      };
      uid++;
      entry.content = content;
    }
  }
  return book;
}
