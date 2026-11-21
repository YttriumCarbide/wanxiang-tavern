import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const forbiddenSegment =
  /(?:^|\/)(?:存档|个人角色|AI角色|ai-characters|generated-characters)(?:\/|$)/i;
const fixtureSuffix = '-character.json';

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function walkFixtures(dir) {
  const found = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return found;
    throw error;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await walkFixtures(full)));
    else if (entry.isFile() && entry.name.endsWith(fixtureSuffix)) found.push(full);
  }
  return found;
}

export async function characterPrivacy(root, command) {
  const repository = path.dirname(root);
  const output = await command('git', [
    '-C',
    repository,
    'ls-files',
    '-z',
    '--cached',
    '--others',
    '--exclude-standard',
  ]);
  const tracked = output.split('\0').filter(Boolean);
  let checked = 0;
  for (const relative of tracked) {
    if (!(await exists(path.join(repository, relative)))) continue;
    const normalized = relative.split(path.sep).join('/');
    if (forbiddenSegment.test(normalized)) {
      assert.fail(`禁止提交个人AI角色导出或存档：${normalized}`);
    }
    if (/(?:^|\/)tests\/fixtures\//.test(normalized) && normalized.endsWith(fixtureSuffix)) {
      assert.fail(`禁止提交角色导出 fixture：${normalized}，请复用官设JS fixture`);
    }
    checked += 1;
  }
  const leaked = await walkFixtures(path.join(root, 'tests', 'fixtures'));
  assert.equal(
    leaked.length,
    0,
    `tests/fixtures 下禁止出现 ${fixtureSuffix}，请复用官设JS fixture`,
  );
  const release = JSON.parse(await readFile(path.join(root, '发布资产划分.json'), 'utf8'));
  for (const folder of ['存档', '个人角色', 'AI角色', 'ai-characters', 'generated-characters']) {
    assert(
      release.staticExcludes.some((pattern) =>
        new RegExp(pattern).test(`assets/${folder}/export.json`),
      ),
      `公开构建必须排除个人资料目录：${folder}`,
    );
  }
  return { checked, fixtures: 0 };
}
