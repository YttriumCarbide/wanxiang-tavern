import { REQUEST_TIMEOUT_MS } from '../src/ai/request-policy.js';
import { createAiPipeline } from '../src/ai/pipeline/runtime.js';
import { importRemotePortrait } from './portrait-images.mjs';
import { createPortraitStore } from './portrait-store.mjs';
import { createRegexStore } from './regex-store.mjs';
import { presetRegexScripts } from '../src/ai/regex.js';
import { runRegexTasks } from './regex-runtime.mjs';
import { formatRegexPresentation } from './regex-presentation.mjs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { compatibleRequest } from './compatible.mjs';
import { summaryPlan } from './summary-request.mjs';
import { creationPlan } from './creation-request.mjs';
import { createHelperStorage } from './helper-storage.mjs';
import { createCharacterReader, createWorldbookCounter } from './character-reader.mjs';
import { createWorldbookStore } from './worldbook-store.mjs';
import { createAiSettings, API_KINDS } from './ai-settings.mjs';
import { createPromptStore } from './prompt-store.mjs';
import { readGenerationResult, redactDiagnostic } from './generation-result.mjs';

export async function createAiApi({
  root,
  port,
  fetchImpl = fetch,
  settingsFile = process.env.AI_CONFIG_FILE || path.join(root, '.runtime/ai-config.json'),
  promptsDirectory = process.env.AI_PROMPTS_DIR || path.join(root, 'prompts/presets'),
  worldInfoDirectory = process.env.AI_WORLDINFO_DIR ||
    path.join(path.dirname(settingsFile), path.basename(settingsFile, '.json') + '-world-info'),
}) {
  const settings = await createAiSettings(settingsFile);
  const helperStorage = await createHelperStorage(
    path.join(path.dirname(settingsFile), 'helper-storage.json'),
  );
  const portraits = await createPortraitStore(path.join(path.dirname(settingsFile), 'portraits'));
  const prompts = await createPromptStore(promptsDirectory);
  const worlds = await createWorldbookStore(worldInfoDirectory);
  const regexStore = await createRegexStore(path.join(path.dirname(settingsFile), 'regex.json'));
  const countTokens = createWorldbookCounter();
  const readCharacter = createCharacterReader();
  const { buildRequest, commitWorldState, acceptResult, completionOptions, pendingWorldStates } =
    createAiPipeline({
      settings,
      prompts,
      worlds,
      regexStore,
      helperStorage,
      countTokens,
      readCharacter,
      runRegexTasks,
      readText: (name) => readFile(new URL('../prompts/' + name, import.meta.url), 'utf8'),
    });
  const directRequests = new Map();
  function expireDirectRequests() {
    for (const [id, job] of directRequests) {
      if (Date.now() <= job.expiresAt) continue;
      directRequests.delete(id);
      pendingWorldStates.delete(id);
    }
  }
  async function prepareDirect(path, input) {
    expireDirectRequests();
    if (active + directRequests.size >= 2) throw Error('已有生成任务在进行，请稍候');
    const match =
      /^(generate|models)\/(character|script|chat|quick-chat|summary|creation|map)$/.exec(path);
    if (!match) throw Error('接口不存在');
    const kind = match[2],
      models = match[1] === 'models';
    const profile = settings.get(kind);
    if (profile.requestMode !== 'browser') throw Error('当前接口未选择浏览器直连');
    const source =
      models || kind === 'summary' ? null : (await prompts.get(profile.promptPresetId)).preset;
    const prepared = models ? null : await buildRequest(kind, input, source);
    if (active + directRequests.size >= 2) throw Error('已有生成任务在进行，请稍候');
    const requestId = randomUUID();
    const messages = prepared?.messages || [];
    const requestReport = prepared
      ? {
          id: requestId,
          messages,
          tokens: prepared.tokens,
          worldInfo: prepared.worldInfo,
          warnings: prepared.warnings,
          sampling: prepared.sampling,
          transport: prepared.transport,
          regex: prepared.regex,
        }
      : null;
    if (prepared?.nextWorldState) {
      if (pendingWorldStates.size >= 20)
        pendingWorldStates.delete(pendingWorldStates.keys().next().value);
      pendingWorldStates.set(requestId, {
        kind,
        nextState: prepared.nextWorldState,
        expectedStep: prepared.nextWorldState.step - 1,
      });
    }
    const { apiKey: _secret, ...publicProfile } = profile;
    // Do not retain a service credential in a browser request ticket.
    const job = {
      input,
      kind,
      models,
      profile: { ...publicProfile, apiKey: '' },
      source,
      prepared,
      messages,
      requestId,
      requestReport,
      expiresAt: Date.now() + REQUEST_TIMEOUT_MS,
    };
    directRequests.set(requestId, job);
    return {
      ticket: requestId,
      profile: publicProfile,
      messages,
      request: requestReport,
      options: completionOptions(job),
    };
  }
  let active = 0;
  const send = (res, status, body) => {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify(body));
  };
  async function body(req) {
    if (!req.headers['content-type']?.startsWith('application/json'))
      throw Error('请求需要application/json');
    let value = '';
    for await (const chunk of req) {
      value += chunk;
      if (Buffer.byteLength(value) > 10000000) throw Error('请求内容过长');
    }
    return JSON.parse(value);
  }
  return async function handle(req, res, url) {
    if (!url.startsWith('/api/ai/')) return false;
    const origin = req.headers.origin;
    if (origin && ![`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(origin)) {
      send(res, 403, { error: '仅允许当前游戏页面调用' });
      return true;
    }
    try {
      if (url.startsWith('/api/ai/transport/') && req.method === 'POST') {
        const input = await body(req);
        expireDirectRequests();
        if (url === '/api/ai/transport/prepare')
          send(res, 200, await prepareDirect(input.path, input.input || {}));
        else if (url === '/api/ai/transport/cancel') {
          if (directRequests.delete(input.ticket)) pendingWorldStates.delete(input.ticket);
          send(res, 200, { cancelled: true });
        } else if (url === '/api/ai/transport/complete') {
          const job = directRequests.get(input.ticket);
          if (!job) throw Error('请求已取消、过期或已接受，请重新生成');
          directRequests.delete(input.ticket);
          const result = input.result;
          if (!result || typeof result !== 'object') throw Error('模型返回格式无效');
          if (
            !job.models &&
            (typeof result.content !== 'string' ||
              result.content.length > 2000000 ||
              (result.rawContent !== undefined &&
                (typeof result.rawContent !== 'string' || result.rawContent.length > 2000000)))
          )
            throw Error('模型正文无效或超过容量');
          if (
            job.models &&
            (!Array.isArray(result.models) ||
              result.models.length > 300 ||
              result.models.some((model) => typeof model !== 'string' || model.length > 1000))
          )
            throw Error('模型列表无效');
          result.usage = { input: 0, output: 0, ...result.usage };
          if (
            !['input', 'output'].every(
              (key) => Number.isFinite(result.usage[key]) && result.usage[key] >= 0,
            )
          )
            throw Error('模型用量格式无效');
          try {
            send(res, 200, await acceptResult(job, result));
          } catch (failure) {
            if (failure.diagnostic) {
              failure.diagnostic.kind = job.kind;
              failure.diagnostic.request = job.requestReport;
            }
            throw failure;
          }
        } else throw Error('接口不存在');
        return true;
      }
      if (url === '/api/ai/portrait/save' && req.method === 'POST') {
        send(res, 200, await portraits.save((await body(req)).dataUrl));
        return true;
      }
      const portraitRoute = url.match(
        /^\/api\/ai\/portraits\/([a-f0-9]{64}\.(?:png|jpg|webp|gif|avif))$/,
      );
      if (portraitRoute && req.method === 'GET') {
        try {
          const image = await portraits.read(portraitRoute[1]);
          res.writeHead(200, {
            'Content-Type': image.mime,
            'Cache-Control': 'public, max-age=31536000, immutable',
            'X-Content-Type-Options': 'nosniff',
          });
          res.end(image.bytes);
        } catch (failure) {
          if (failure.code !== 'ENOENT') throw failure;
          send(res, 404, { error: '立绘文件不存在，请重新导入原图' });
        }
        return true;
      }
      if (url === '/api/ai/portrait' && req.method === 'POST') {
        const input = await body(req);
        send(res, 200, await importRemotePortrait(input.url));
        return true;
      }
      if (url === '/api/ai/tokens' && req.method === 'POST') {
        const { texts } = await body(req);
        if (
          !Array.isArray(texts) ||
          texts.length > 1000 ||
          texts.some((text) => typeof text !== 'string' || text.length > 100000)
        )
          throw Error('Token统计需要文字列表');
        send(res, 200, { counts: texts.map(countTokens), tokenizer: 'o200k_base' });
        return true;
      }
      if (url === '/api/ai/config' && req.method === 'GET') {
        send(res, 200, settings.visible());
        return true;
      }
      if (url === '/api/ai/summary/plan' && req.method === 'POST') {
        send(res, 200, await summaryPlan(await body(req), settings.get('summary'), countTokens));
        return true;
      }
      if (url === '/api/ai/creation/plan' && req.method === 'POST') {
        send(res, 200, creationPlan(await body(req), settings.get('creation'), countTokens));
        return true;
      }
      const helperRoute = url.match(/^\/api\/ai\/helper-storage\/([a-z0-9-]+)$/);
      if (helperRoute) {
        if (req.method === 'GET') send(res, 200, { storage: helperStorage.get(helperRoute[1]) });
        else if (req.method === 'POST')
          send(res, 200, await helperStorage.save(helperRoute[1], (await body(req)).storage));
        else send(res, 405, { error: '请求方法无效' });
        return true;
      }
      if (url === '/api/ai/config' && req.method === 'POST') {
        send(res, 200, await settings.saveProfile(await body(req)));
        return true;
      }
      if (url === '/api/ai/presets') {
        if (req.method === 'GET') send(res, 200, { presets: settings.listPresets() });
        else if (req.method === 'POST') send(res, 200, await settings.preset(await body(req)));
        else send(res, 405, { error: '请求方法无效' });
        return true;
      }
      if (url === '/api/ai/regex') {
        if (req.method === 'GET') send(res, 200, { scripts: regexStore.get() });
        else if (req.method === 'POST') send(res, 200, await regexStore.save(await body(req)));
        else send(res, 405, { error: '请求方法无效' });
        return true;
      }
      if (url === '/api/ai/regex-test' && req.method === 'POST') {
        const { scripts, text, placement = 2, options = {} } = await body(req);
        const { normalizeRegexScripts } = await import('../src/ai/regex.js');
        send(
          res,
          200,
          (
            await runRegexTasks(normalizeRegexScripts(scripts), [
              { text: String(text || '').slice(0, 100000), placement, options },
            ])
          )[0],
        );
        return true;
      }
      if (url === '/api/ai/worldbooks' && req.method === 'GET') {
        send(res, 200, await worlds.visible());
        return true;
      }
      const worldRoute = url.match(/^\/api\/ai\/worldbooks\/([a-z0-9-]+)$/);
      if (worldRoute) {
        const action = worldRoute[1];
        if (req.method === 'GET') send(res, 200, await worlds.get(action));
        else if (req.method === 'POST') {
          const input = await body(req);
          if (action === 'save') send(res, 200, await worlds.save(input));
          else if (action === 'settings')
            send(res, 200, { settings: await worlds.configure(input.settings) });
          else if (action === 'delete') {
            await worlds.delete(input.id);
            send(res, 200, await worlds.visible());
          } else send(res, 404, { error: '世界书操作不存在' });
        } else send(res, 405, { error: '请求方法无效' });
        return true;
      }
      if (url === '/api/ai/prompts' && req.method === 'GET') {
        const formats = Object.fromEntries(
          await Promise.all(
            ['character', 'script', 'map', 'creation'].map(async (kind) => [
              kind,
              await readFile(new URL(`../prompts/${kind}.system.md`, import.meta.url), 'utf8'),
            ]),
          ),
        );
        send(res, 200, { presets: await prompts.list(), formats });
        return true;
      }
      const promptRoute = url.match(/^\/api\/ai\/prompts\/([a-z0-9-]+)$/);
      if (promptRoute) {
        const action = promptRoute[1];
        if (req.method === 'GET') send(res, 200, await prompts.get(action));
        else if (req.method === 'POST') {
          const input = await body(req);
          if (action === 'save') send(res, 200, await prompts.save(input));
          else if (action === 'select') {
            await prompts.get(input.id);
            send(res, 200, await settings.selectPrompt(input.kind, input.id));
          } else if (action === 'delete') {
            for (const [kind, profile] of Object.entries(settings.visible()))
              if (profile.promptPresetId === input.id)
                await settings.selectPrompt(kind, `${kind}-default`);
            await prompts.delete(input.id);
            send(res, 200, { deleted: true });
          } else if (action === 'preview') {
            const source =
              input.preset || (await prompts.get(settings.get(input.kind).promptPresetId)).preset;
            const { nextWorldState: _state, ...preview } = await buildRequest(
              input.kind,
              input.input,
              source,
              input.worldInfoOverride,
            );
            send(res, 200, preview);
          } else send(res, 404, { error: '提示词操作不存在' });
        } else send(res, 405, { error: '请求方法无效' });
        return true;
      }
      const validate = url.match(/^\/api\/ai\/validate\/(character|script)$/);
      if (validate && req.method === 'POST') {
        const { content, input = {}, requestId } = await body(req);
        if (typeof content !== 'string' || content.length > 1000000)
          throw Error('待校验正文必须是文字且不超过100万字符');
        const result = readGenerationResult(validate[1], content, input, readCharacter);
        const preset = (await prompts.get(settings.get(validate[1]).promptPresetId)).preset;
        await formatRegexPresentation(result.entry, validate[1], [
          ...regexStore.get(),
          ...presetRegexScripts(preset),
        ]);
        await commitWorldState(requestId, validate[1]);
        result.diagnostic = redactDiagnostic(result.diagnostic, settings.get(validate[1]).apiKey);
        send(res, 200, result);
        return true;
      }
      const match = url.match(
        /^\/api\/ai\/(generate|models)\/(character|script|chat|quick-chat|summary|creation|map)$/,
      );
      if (!match || req.method !== 'POST') {
        send(res, 404, { error: '接口不存在' });
        return true;
      }
      expireDirectRequests();
      if (active + directRequests.size >= 2) {
        send(res, 429, { error: '已有生成任务在进行，请稍候' });
        return true;
      }
      const input = await body(req),
        kind = match[2],
        models = match[1] === 'models';
      const profile = settings.get(kind);
      const chatting = ['chat', 'quick-chat'].includes(kind);
      const summarizing = kind === 'summary';
      const source =
        models || summarizing ? null : (await prompts.get(profile.promptPresetId)).preset;
      const prepared = models ? null : await buildRequest(kind, input, source);
      const messages = prepared?.messages || [];
      const requestId = randomUUID();
      const requestReport = prepared
        ? {
            id: requestId,
            messages,
            tokens: prepared.tokens,
            worldInfo: prepared.worldInfo,
            warnings: prepared.warnings,
            sampling: prepared.sampling,
            transport: prepared.transport,
            regex: prepared.regex,
          }
        : null;
      if (prepared?.nextWorldState) {
        if (pendingWorldStates.size >= 20)
          pendingWorldStates.delete(pendingWorldStates.keys().next().value);
        pendingWorldStates.set(requestId, {
          kind,
          nextState: prepared.nextWorldState,
          expectedStep: prepared.nextWorldState.step - 1,
        });
      }
      expireDirectRequests();
      if (active + directRequests.size >= 2) {
        send(res, 429, { error: '已有生成任务在进行，请稍候' });
        return true;
      }
      const controller = new AbortController(),
        timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      const cancel = () => {
        if (!res.writableEnded) controller.abort();
      };
      res.on('close', cancel);
      active++;
      const live =
        chatting &&
        !models &&
        prepared.transport.stream &&
        req.headers.accept?.includes('text/event-stream');
      const event = (value) => res.write(`data: ${JSON.stringify(value)}\n\n`);
      try {
        if (live) {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-store',
            Connection: 'keep-alive',
          });
          event({ type: 'request', request: requestReport });
        }
        if (profile.tokenField === 'none') profile.maxTokens = 0;
        const result = await compatibleRequest(profile, messages, {
          signal: controller.signal,
          fetchImpl,
          ...completionOptions({ kind, models, prepared, input }),
          onDelta: live ? (delta) => event({ type: 'delta', delta }) : undefined,
        });
        const reply = await acceptResult(
          { input, kind, models, profile, source, prepared, messages, requestId, requestReport },
          result,
        );
        if (live) {
          event({ type: 'complete', result: reply });
          res.end();
        } else send(res, 200, reply);
      } catch (failure) {
        if (failure.diagnostic) failure.diagnostic.kind = kind;
        if (failure.diagnostic && requestReport) failure.diagnostic.request = requestReport;
        failure.diagnostic = redactDiagnostic(failure.diagnostic, profile.apiKey);
        if (live) {
          event({
            type: 'error',
            error:
              failure.name === 'AbortError'
                ? '请求已取消或超过15分钟，请检查服务后重试'
                : redactDiagnostic(failure.message, profile.apiKey),
            diagnostic: failure.diagnostic,
          });
          res.end();
          return true;
        }
        throw failure;
      } finally {
        active--;
        clearTimeout(timer);
        res.off('close', cancel);
      }
    } catch (failure) {
      if (!res.destroyed) {
        let report = {
          error:
            failure.name === 'AbortError'
              ? '请求已取消或超过15分钟，请检查服务后重试'
              : failure.message,
          diagnostic: failure.diagnostic,
        };
        for (const kind of API_KINDS) report = redactDiagnostic(report, settings.get(kind).apiKey);
        send(res, 400, report);
      }
    }
    return true;
  };
}
