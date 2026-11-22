import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { text } from 'node:stream/consumers';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const worker = fileURLToPath(new URL('../tools/ai-worker.mjs', import.meta.url));

async function invoke(command, input, cwd, baseUrl) {
  const child = spawn(process.execPath, [worker, '--cli', command, '--stdin'], {
    cwd,
    env: {
      ...process.env,
      AI_WORKER_BASE_URL: baseUrl,
      AI_WORKER_MODEL: 'mock-model',
      AI_WORKER_API_KEY: 'mock-key',
    },
  });
  const exited = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  child.stdin.end(JSON.stringify(input));
  const [code, stdout, stderr] = await Promise.all([
    exited,
    text(child.stdout),
    text(child.stderr),
  ]);
  return { code, stdout, stderr };
}

test('development AI worker sends prompts and safely replaces valid JSON output', async (t) => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'wanxiang-ai-worker-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const requests = [];
  const replies = ['收到', '{"summary":"通过"}', '无效 JSON'];
  const server = createServer(async (request, response) => {
    if (request.method !== 'POST') {
      response.writeHead(405).end();
      return;
    }
    const body = await text(request);
    const content = replies[requests.length];
    requests.push({ url: request.url, authorization: request.headers.authorization, body });
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }] }));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;

  const ask = await invoke('ai_ask', { prompt: '请确认收到' }, cwd, baseUrl);
  assert.deepEqual(ask, { code: 0, stdout: '收到\n', stderr: '' });
  assert.equal(requests[0].url, '/v1/chat/completions');
  assert.equal(requests[0].authorization, 'Bearer mock-key');
  const askRequest = JSON.parse(requests[0].body);
  assert.equal(askRequest.model, 'mock-model');
  assert.deepEqual(askRequest.messages, [{ role: 'user', content: '请确认收到' }]);

  const source = '第一行\n第二行';
  await writeFile(path.join(cwd, '输入.txt'), source);
  const output = path.join(cwd, '输出.json');
  await writeFile(output, '{}');
  const task = {
    instruction: '提取摘要',
    input_files: ['输入.txt'],
    output_file: '输出.json',
    json_mode: true,
  };
  const success = await invoke('ai_file_worker', task, cwd, baseUrl);
  assert.equal(success.code, 0, success.stderr);
  assert.deepEqual(JSON.parse(success.stdout), { output_file: task.output_file });
  const fileRequest = JSON.parse(requests[1].body);
  assert.deepEqual(fileRequest.response_format, { type: 'json_object' });
  assert.ok(fileRequest.messages[0].content.includes(JSON.stringify(source)));
  assert.equal(await readFile(output, 'utf8'), replies[1]);

  const failure = await invoke('ai_file_worker', task, cwd, baseUrl);
  assert.equal(failure.code, 1);
  assert.equal(failure.stdout, '');
  assert.match(failure.stderr, /有效的 JSON 对象/);
  assert.equal(await readFile(output, 'utf8'), replies[1]);
});
