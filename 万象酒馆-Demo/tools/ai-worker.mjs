import { readFile } from 'node:fs/promises';
import { text } from 'node:stream/consumers';
import { atomicWrite } from '../server/disk-store.mjs';
import { compatibleRequest } from '../src/ai/compatible.js';

const usage = '用法：node tools/ai-worker.mjs --cli ai_ask|ai_file_worker --stdin';

function requiredText(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw Error(`请填写 ${field}`);
  return value;
}

async function readTask(command) {
  const input = (await text(process.stdin)).replace(/^\uFEFF/, '');
  let task;
  try {
    task = JSON.parse(input);
  } catch {
    throw Error('标准输入必须是 UTF-8 JSON');
  }
  if (!task || typeof task !== 'object' || Array.isArray(task))
    throw Error('标准输入必须是 JSON 对象');
  if (task.json_mode !== undefined && typeof task.json_mode !== 'boolean')
    throw Error('json_mode 必须是布尔值');
  if (command === 'ai_ask')
    return { prompt: requiredText(task.prompt, 'prompt'), jsonMode: task.json_mode };

  const instruction = requiredText(task.instruction, 'instruction');
  const outputFile = requiredText(task.output_file, 'output_file');
  if (!Array.isArray(task.input_files) || !task.input_files.length)
    throw Error('input_files 必须包含至少一个输入文件');
  const paths = task.input_files.map((file) => requiredText(file, 'input_files 中的路径'));
  const files = await Promise.all(
    paths.map(async (path) => ({ path, content: await readFile(path, 'utf8') })),
  );
  return {
    prompt: `${instruction}\n\n以下 JSON 数组是供处理的输入文件。\n${JSON.stringify(files)}`,
    jsonMode: task.json_mode,
    outputFile,
  };
}

function validateJson(content) {
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return;
  } catch {
    // Report the format error without printing model output.
  }
  throw Error('模型输出不是有效的 JSON 对象');
}

async function main(args) {
  if (args.length === 1 && args[0] === '--help') {
    console.log(usage);
    return;
  }
  const [mode, command, source] = args;
  if (
    args.length !== 3 ||
    mode !== '--cli' ||
    !['ai_ask', 'ai_file_worker'].includes(command) ||
    source !== '--stdin'
  )
    throw Error(usage);

  const baseUrl = requiredText(process.env.AI_WORKER_BASE_URL, 'AI_WORKER_BASE_URL').trim();
  const model = requiredText(process.env.AI_WORKER_MODEL, 'AI_WORKER_MODEL').trim();
  const { prompt, jsonMode, outputFile } = await readTask(command);
  const content = jsonMode ? `${prompt}\n\n只返回一个有效的 JSON 对象。` : prompt;
  const result = await compatibleRequest(
    { baseUrl, model, apiKey: process.env.AI_WORKER_API_KEY || '', jsonMode, temperature: null },
    [{ role: 'user', content }],
    { signal: AbortSignal.timeout(180_000) },
  );
  if (jsonMode) validateJson(result.content);
  if (outputFile) {
    await atomicWrite(outputFile, result.content);
    console.log(JSON.stringify({ output_file: outputFile }));
  } else {
    console.log(result.content);
  }
}

try {
  await main(process.argv.slice(2));
} catch (error) {
  console.error(`AI 调用失败：${error.message}`);
  process.exitCode = 1;
}
