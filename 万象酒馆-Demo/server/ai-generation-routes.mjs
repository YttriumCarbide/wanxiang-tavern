import { randomUUID } from 'node:crypto';
import { REQUEST_TIMEOUT_MS, createRequestScope } from '../src/ai/request-policy.js';
import { normalizeUsage } from '../src/ai/usage.js';
import { readRequestJson } from './request-json.mjs';
import { redactDiagnostic } from './generation-result.mjs';
import { API_KINDS } from './ai-settings.mjs';

const GENERATION_PATH =
  /^(generate|models)\/(character|script|chat|quick-chat|summary|creation|map)$/;
const MAX_ACTIVE = 2;
const MAX_PENDING_WORLD_STATES = 20;
const MAX_CONTENT_LENGTH = 2000000;
const MAX_MODELS = 300;
const MAX_MODEL_LENGTH = 1000;
const ABORT_MESSAGE = '请求已取消或超过15分钟，请检查服务后重试';
const BUSY_MESSAGE = '已有生成任务在进行，请稍候';
const TICKET_MESSAGE = '请求已取消、过期或已接受，请重新生成';

export function normalizeRequestObject(value, field = '请求正文') {
  if (value == null) return {};
  if (typeof value === 'object' && !Array.isArray(value)) {
    const prototype = Object.getPrototypeOf(value);
    if (prototype === Object.prototype || prototype === null) return value;
  }
  throw Object.assign(new TypeError(`${field}必须是对象`), {
    code: 'AI_INVALID_REQUEST',
    status: 400,
  });
}

export async function readAiRequest(req, limit, signal) {
  return normalizeRequestObject(await readRequestJson(req, limit, signal));
}

export function publicErrorCode(failure, settings) {
  const { code } = failure;
  if (typeof code !== 'string' || !/^[A-Z][A-Z0-9_]{0,63}$/.test(code)) return undefined;
  for (const kind of API_KINDS) {
    if (redactDiagnostic(code, settings.get(kind).apiKey) !== code) return undefined;
  }
  return code;
}

export function publicErrorStatus(failure) {
  const { status } = failure;
  if (Number.isInteger(status) && status >= 400 && status <= 599) return status;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateBrowserResult(models, result) {
  if (!isPlainObject(result)) throw Error('模型返回格式无效');
  if (!models) {
    if (
      typeof result.content !== 'string' ||
      result.content.length > MAX_CONTENT_LENGTH ||
      (result.rawContent !== undefined &&
        (typeof result.rawContent !== 'string' || result.rawContent.length > MAX_CONTENT_LENGTH))
    )
      throw Error('模型正文无效或超过容量');
  } else if (
    !Array.isArray(result.models) ||
    result.models.length > MAX_MODELS ||
    result.models.some((model) => typeof model !== 'string' || model.length > MAX_MODEL_LENGTH)
  ) {
    throw Error('模型列表无效');
  }
  return { ...result, usage: normalizeUsage(result.usage) };
}

function buildRequestReport(requestId, prepared) {
  if (!prepared) return null;
  return {
    id: requestId,
    messages: prepared.messages,
    tokens: prepared.tokens,
    worldInfo: prepared.worldInfo,
    warnings: prepared.warnings,
    sampling: prepared.sampling,
    transport: prepared.transport,
  };
}

function registerPendingWorldState(pendingWorldStates, requestId, kind, prepared) {
  if (!prepared?.nextWorldState) return;
  if (pendingWorldStates.size >= MAX_PENDING_WORLD_STATES)
    pendingWorldStates.delete(pendingWorldStates.keys().next().value);
  pendingWorldStates.set(requestId, {
    kind,
    nextState: prepared.nextWorldState,
    expectedStep: prepared.nextWorldState.step - 1,
  });
}

function publicProfile(profile) {
  const { apiKey: _secret, ...rest } = profile;
  return rest;
}

export function createAiGenerationRoutes({
  settings,
  promptSource,
  pipeline,
  antiRoute,
  fetchImpl,
  send,
  openGenerationIds = new Set(),
}) {
  const { buildRequest, acceptResult, completionOptions, pendingWorldStates } = pipeline;
  const tickets = new Map();
  const completing = new Map();
  let active = 0;

  function discardTicket(ticket) {
    if (tickets.delete(ticket)) {
      pendingWorldStates.delete(ticket);
      openGenerationIds.delete(ticket);
    }
  }

  function expireTickets() {
    const now = Date.now();
    for (const [id, job] of tickets) {
      if (now >= job.expiresAt) discardTicket(id);
    }
  }

  async function prepareJob(match, input, profile, signal) {
    const kind = match[2],
      models = match[1] === 'models';
    const source = models ? null : await promptSource.get(kind);
    signal.throwIfAborted();
    const prepared = models ? null : await buildRequest(kind, input, source);
    signal.throwIfAborted();
    const requestId = randomUUID();
    return {
      input,
      kind,
      models,
      profile,
      source,
      prepared,
      messages: prepared?.messages || [],
      requestId,
      requestReport: buildRequestReport(requestId, prepared),
    };
  }

  function registerJob(job) {
    registerPendingWorldState(pendingWorldStates, job.requestId, job.kind, job.prepared);
    openGenerationIds.add(job.requestId);
  }

  async function prepareDirect(input, signal) {
    const requestInput = normalizeRequestObject(input.input, 'input');
    const match = GENERATION_PATH.exec(input.path);
    if (!match) throw Error('接口不存在');
    const profile = settings.get(match[2]);
    if (profile.requestMode !== 'browser') throw Error('当前接口未选择浏览器直连');
    const visible = publicProfile(profile);
    const job = await prepareJob(match, requestInput, { ...visible, apiKey: '' }, signal);
    signal.throwIfAborted();
    const result = {
      ticket: job.requestId,
      profile: visible,
      messages: job.messages,
      request: job.requestReport,
      options: completionOptions(job),
    };
    registerJob(job);
    tickets.set(job.requestId, { ...job, expiresAt: Date.now() + REQUEST_TIMEOUT_MS });
    return result;
  }

  async function completeDirect(input, scope) {
    const { ticket } = input;
    const { signal } = scope;
    const job = tickets.get(ticket);
    if (!job) throw Error(TICKET_MESSAGE);
    tickets.delete(ticket);
    completing.set(ticket, scope.abort);
    active++;
    try {
      let result;
      try {
        result = validateBrowserResult(job.models, input.result);
      } catch (failure) {
        pendingWorldStates.delete(job.requestId);
        throw failure;
      }
      const reply = await acceptResult(job, result, signal);
      signal.throwIfAborted();
      return reply;
    } catch (caught) {
      const failure = signal.aborted ? signal.reason : caught;
      if (signal.aborted) pendingWorldStates.delete(job.requestId);
      if (failure?.diagnostic) {
        failure.diagnostic.kind = job.kind;
        failure.diagnostic.request = job.requestReport;
      }
      throw failure;
    } finally {
      completing.delete(ticket);
      openGenerationIds.delete(ticket);
      active--;
    }
  }

  async function generate(req, res, match, input, signal) {
    const profile = settings.get(match[2]);
    const job = await prepareJob(match, input, profile, signal);
    signal.throwIfAborted();
    const live =
      ['chat', 'quick-chat'].includes(job.kind) &&
      !job.models &&
      job.prepared.transport.stream &&
      req.headers.accept?.includes('text/event-stream');
    const event = (value) => {
      if (!res.destroyed && !res.writableEnded)
        res.write('data: ' + JSON.stringify(value) + '\n\n');
    };
    registerJob(job);
    try {
      if (live) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-store',
          Connection: 'keep-alive',
        });
        event({ type: 'request', request: job.requestReport });
      }
      if (profile.tokenField === 'none') profile.maxTokens = 0;
      const result = await antiRoute.request(profile, job.messages, {
        signal,
        fetchImpl,
        ...completionOptions(job),
        onDelta: live ? (delta) => event({ type: 'delta', delta }) : undefined,
      });
      signal.throwIfAborted();
      const reply = await acceptResult(job, result, signal);
      signal.throwIfAborted();
      if (!live) return send(res, 200, reply);
      event({ type: 'complete', result: reply });
      if (!res.destroyed) res.end();
    } catch (caught) {
      const failure = signal.aborted
        ? signal.reason
        : caught instanceof Error
          ? caught
          : Error('生成未能完成');
      if (signal.aborted || failure.name === 'AbortError') {
        pendingWorldStates.delete(job.requestId);
      }
      if (failure.diagnostic) {
        failure.diagnostic.kind = job.kind;
        failure.diagnostic.request = job.requestReport;
      }
      for (const kind of API_KINDS) {
        const key = settings.get(kind).apiKey;
        failure.message = redactDiagnostic(failure.message, key);
        failure.diagnostic = redactDiagnostic(failure.diagnostic, key);
      }
      if (!live || !res.headersSent) throw failure;
      event({
        type: 'error',
        error: failure.name === 'AbortError' ? ABORT_MESSAGE : failure.message,
        code: publicErrorCode(failure, settings),
        status: publicErrorStatus(failure),
        diagnostic: failure.diagnostic,
      });
      if (!res.destroyed) res.end();
    } finally {
      openGenerationIds.delete(job.requestId);
    }
  }

  return async function route(req, res, url) {
    if (req.method !== 'POST' || !url.startsWith('/api/ai/')) return false;
    const routePath = url.slice('/api/ai/'.length);
    const match = GENERATION_PATH.exec(routePath);
    const transport = routePath.startsWith('transport/');
    expireTickets();
    if (!match && !transport) return false;
    const action = transport ? routePath.slice('transport/'.length) : null;
    const reserving = !!(match || action === 'prepare');
    if (reserving && active + tickets.size >= MAX_ACTIVE) {
      send(res, 429, { error: BUSY_MESSAGE, code: 'AI_BUSY', status: 429 }, !req.complete);
      return true;
    }
    if (reserving) active++;
    const scope = createRequestScope();
    const cancel = () => {
      if (!res.writableFinished) scope.abort();
    };
    res.once('close', cancel);
    if (res.destroyed) cancel();
    try {
      scope.signal.throwIfAborted();
      const input = await readAiRequest(req, undefined, scope.signal);
      scope.signal.throwIfAborted();
      expireTickets();
      if (match) await generate(req, res, match, input, scope.signal);
      else if (action === 'prepare') {
        const payload = await prepareDirect(input, scope.signal);
        function cleanup() {
          res.off('finish', cleanup);
          res.off('close', dropped);
        }
        function dropped() {
          cleanup();
          discardTicket(payload.ticket);
        }
        try {
          scope.signal.throwIfAborted();
          res.once('close', dropped);
          res.once('finish', cleanup);
          send(res, 200, payload);
        } catch (failure) {
          dropped();
          throw failure;
        }
      } else if (action === 'complete') {
        const payload = await completeDirect(input, scope);
        scope.signal.throwIfAborted();
        send(res, 200, payload);
      } else if (action === 'cancel') {
        discardTicket(input.ticket);
        completing.get(input.ticket)?.();
        send(res, 200, { cancelled: true });
      } else throw Error('接口不存在');
      return true;
    } finally {
      res.off('close', cancel);
      scope.close();
      if (reserving) active--;
    }
  };
}
