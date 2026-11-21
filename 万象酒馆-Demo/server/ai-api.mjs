import { createAiPipeline } from '../src/ai/pipeline/runtime.js';
import { importRemotePortrait } from './portrait-images.mjs';
import { createPortraitStore } from './portrait-store.mjs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createAntiRouteService } from '../src/ai/anti-route-service.js';
import { creationPlan } from './creation-request.mjs';
import { createHelperStorage } from './helper-storage.mjs';
import { createCharacterReader, createWorldbookCounter } from './character-reader.mjs';
import { createWorldbookStore } from './worldbook-store.mjs';
import { createAiSettings, API_KINDS } from './ai-settings.mjs';
import { createPromptStore } from './prompt-store.mjs';
import { createBuiltinPromptSource } from '../src/ai/builtin-prompt.js';
import { readGenerationResult, redactDiagnostic } from './generation-result.mjs';
import { RequestBodyError } from './request-json.mjs';
import {
  createAiGenerationRoutes,
  normalizeRequestObject,
  publicErrorCode,
  publicErrorStatus,
  readAiRequest as body,
} from './ai-generation-routes.mjs';
import { createRequestScope } from '../src/ai/request-policy.js';

export async function createAiApi({
  root,
  port,
  fetchImpl = fetch,
  settingsFile = process.env.AI_CONFIG_FILE || path.join(root, '.runtime/ai-config.json'),
  promptsDirectory = process.env.AI_PROMPTS_DIR,
  worldInfoDirectory = process.env.AI_WORLDINFO_DIR ||
    path.join(path.dirname(settingsFile), path.basename(settingsFile, '.json') + '-world-info'),
}) {
  const settings = await createAiSettings(settingsFile);
  const antiRoute = createAntiRouteService({ settings, fetchImpl });
  const helperStorage = promptsDirectory
    ? await createHelperStorage(path.join(path.dirname(settingsFile), 'helper-storage.json'))
    : { get: () => ({}) };
  const portraits = await createPortraitStore(path.join(path.dirname(settingsFile), 'portraits'));
  const prompts = promptsDirectory ? await createPromptStore(promptsDirectory) : null;
  const readText = (name) => readFile(new URL('../prompts/' + name, import.meta.url), 'utf8');
  const promptSource = await createBuiltinPromptSource(readText, settings, prompts?.get);
  const worlds = await createWorldbookStore(worldInfoDirectory);
  const countTokens = createWorldbookCounter();
  const readCharacter = createCharacterReader();
  const pipeline = createAiPipeline({
    settings,
    worlds,
    helperStorage,
    countTokens,
    readCharacter,
    readText,
    promptSource,
  });
  const { buildRequest, commitWorldState } = pipeline;
  const send = (res, status, body, close = false) => {
    if (res.destroyed || res.writableEnded) return;
    const payload = JSON.stringify(body);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...(close ? { Connection: 'close' } : {}),
    });
    res.end(payload);
  };
  const openGenerationIds = new Set();
  const generation = createAiGenerationRoutes({
    settings,
    promptSource,
    pipeline,
    antiRoute,
    fetchImpl,
    send,
    openGenerationIds,
  });
  return async function handle(req, res, url) {
    if (!url.startsWith('/api/ai/')) return false;
    const { host, origin } = req.headers;
    const localPort = port || req.socket.localPort;
    if (
      ![`127.0.0.1:${localPort}`, `localhost:${localPort}`].includes(host) ||
      (origin !== undefined && origin !== `http://${host}`)
    ) {
      send(res, 403, { error: '仅允许当前游戏页面调用' }, !req.complete);
      return true;
    }
    try {
      if (url === '/api/ai/anti-route') {
        const scope = createRequestScope();
        const cancel = () => {
          if (!res.writableFinished) scope.abort();
        };
        res.once('close', cancel);
        if (res.destroyed) cancel();
        try {
          const input =
            req.method === 'POST' ? await body(req, undefined, scope.signal) : undefined;
          scope.signal.throwIfAborted();
          send(res, 200, await antiRoute.handle(input, scope.signal));
        } finally {
          res.off('close', cancel);
          scope.close();
        }
        return true;
      }
      if (await generation(req, res, url)) return true;
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
        send(res, 200, await pipeline.planSummary(await body(req)));
        return true;
      }
      if (url === '/api/ai/creation/plan' && req.method === 'POST') {
        send(res, 200, creationPlan(await body(req), settings.get('creation'), countTokens));
        return true;
      }
      const helperRoute = url.match(/^\/api\/ai\/helper-storage\/([a-z0-9-]+)$/);
      if (helperRoute && prompts) {
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
      if (url === '/api/ai/prompt-options') {
        const options =
          req.method === 'POST'
            ? await settings.savePromptOptions((await body(req)).options)
            : settings.promptOptions();
        send(res, 200, { options, attribution: promptSource.attribution });
        return true;
      }
      if (prompts && url === '/api/ai/prompts' && req.method === 'GET') {
        const formats = Object.fromEntries(
          await Promise.all(
            ['character', 'script', 'map', 'creation', 'summary'].map(async (kind) => [
              kind,
              await readFile(new URL(`../prompts/${kind}.system.md`, import.meta.url), 'utf8'),
            ]),
          ),
        );
        send(res, 200, { presets: await prompts.list(), formats });
        return true;
      }
      const promptRoute = url.match(/^\/api\/ai\/prompts\/([a-z0-9-]+)$/);
      if (promptRoute && (prompts || promptRoute[1] === 'preview')) {
        const action = promptRoute[1];
        if (req.method === 'GET' && prompts) send(res, 200, await prompts.get(action));
        else if (req.method === 'POST') {
          const input = await body(req);
          if (action === 'save') send(res, 200, await prompts.save(input));
          else if (prompts && action === 'select') {
            await prompts.get(input.id);
            send(res, 200, await settings.selectPrompt(input.kind, input.id));
          } else if (action === 'delete') {
            for (const [kind, profile] of Object.entries(settings.visible()))
              if (profile.promptPresetId === input.id)
                await settings.selectPrompt(kind, `${kind}-default`);
            await prompts.delete(input.id);
            send(res, 200, { deleted: true });
          } else if (action === 'preview') {
            const requestInput = normalizeRequestObject(input.input, 'input');
            const source = input.preset ?? (await promptSource.get(input.kind));
            const { nextWorldState: _state, ...preview } = await buildRequest(
              input.kind,
              requestInput,
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
        const request = await body(req);
        const { content, requestId } = request;
        const input = normalizeRequestObject(request.input, 'input');
        if (typeof content !== 'string' || content.length > 1000000)
          throw Error('待校验正文必须是文字且不超过100万字符');
        if (openGenerationIds.has(requestId)) {
          throw Object.assign(Error('请求仍在进行，请稍后再校验'), {
            code: 'AI_REQUEST_ACTIVE',
            status: 409,
          });
        }
        const result = readGenerationResult(validate[1], content, input, readCharacter);
        await commitWorldState(requestId, validate[1]);
        for (const kind of API_KINDS) {
          result.diagnostic = redactDiagnostic(result.diagnostic, settings.get(kind).apiKey);
        }
        send(res, 200, result);
        return true;
      }
      send(res, 404, { error: '接口不存在' });
    } catch (caught) {
      if (res.destroyed || res.writableEnded) return true;
      if (res.headersSent) {
        res.destroy();
        return true;
      }
      const failure = caught instanceof Error ? caught : Error('请求未能完成');
      const status = publicErrorStatus(failure) ?? 400;
      let report = {
        error:
          failure.name === 'AbortError'
            ? '请求已取消或超过15分钟，请检查服务后重试'
            : failure.message,
        code: publicErrorCode(failure, settings),
        status,
        diagnostic: failure.diagnostic,
      };
      for (const kind of API_KINDS) report = redactDiagnostic(report, settings.get(kind).apiKey);
      send(res, status, report, !req.complete || (failure instanceof RequestBodyError && status === 413));
    }
    return true;
  };
}
