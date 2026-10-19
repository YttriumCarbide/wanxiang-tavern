import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { selectScopes } from './scopes.mjs';

export function parseTestPlan(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.scopes) || !value.scopes.length)
    throw Error('检查清单需要非空的 scopes 数组');
  if (value.scopes.some((scope) => typeof scope !== 'string'))
    throw Error('检查范围必须是名称字符串');
  const scopes = selectScopes(['--scope', value.scopes.join(',')]);
  const coreFiles = value.coreFiles || [];
  if (
    !Array.isArray(coreFiles) ||
    coreFiles.some(
      (file) => typeof file !== 'string' || !/^tests\/[a-zA-Z0-9_-]+\.test\.js$/.test(file),
    )
  )
    throw Error('coreFiles 只能列出 tests/ 中的 .test.js 文件');
  const browserConcurrency = value.browserConcurrency ?? 2;
  if (![1, 2].includes(browserConcurrency)) throw Error('浏览器并行数只能为1或2');
  return { scopes, coreFiles: [...new Set(coreFiles)], browserConcurrency };
}

export async function loadTestPlan(args, root) {
  const remaining = [];
  let file = 'tools/testing/checklist.json';
  let explicit = false;
  let list = false;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--plan') {
      if (!args[index + 1] || args[index + 1].startsWith('--')) throw Error('--plan needs a file');
      file = args[++index];
      explicit = true;
    } else if (args[index] === '--list') list = true;
    else remaining.push(args[index]);
  }
  const planPath = path.resolve(root, file);
  // Legacy explicit scopes continue to work without inheriting unrelated checklist entries.
  const hasSelection = remaining.some((arg) => ['--scope', '--changed'].includes(arg));
  const usePlan = explicit || !hasSelection;
  const plan = usePlan
    ? parseTestPlan(JSON.parse(await readFile(planPath, 'utf8')))
    : { scopes: new Set(), coreFiles: [], browserConcurrency: 2 };
  return { ...plan, args: remaining, explicit, list, planPath: usePlan ? planPath : null };
}
