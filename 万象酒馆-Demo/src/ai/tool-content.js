/** A tool is a text carrier here; no action, script, or additional model call is executed. */
export function readToolContent(message, outputTool) {
  if (isKeminiTool(outputTool)) {
    let best = typeof message?.content === 'string' ? message.content : '';
    let failure = null;
    for (const call of message?.tool_calls || []) {
      if (!/^emit_complete_response_[\w]+$/u.test(call.function?.name?.split(':').at(-1) || ''))
        continue;
      try {
        const text = decodeArguments(call.function.arguments, outputTool.name);
        if (text.length > best.length) best = text;
      } catch (error) {
        failure = error;
      }
    }
    if (best.trim()) return best;
    throw failure || Error('Kemini未返回正文工具内容或普通正文');
  }
  const calls = message?.tool_calls;
  if (!Array.isArray(calls) || calls.length !== 1)
    throw Error(`模型需要通过唯一一次${outputTool.name}工具调用返回正文；请确认API支持工具调用`);
  const call = calls[0];
  if (call?.type !== 'function' || call.function?.name !== outputTool.name)
    throw Error(`模型返回了未声明的工具；本次只接收${outputTool.name}正文`);
  return decodeArguments(call.function.arguments, outputTool.name);
}

function decodeArguments(argumentsText, name) {
  let value;
  try {
    value = JSON.parse(argumentsText);
  } catch {
    throw Error(`${name}工具参数不是完整JSON，原文已保留`);
  }
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== 1 ||
    !Object.hasOwn(value, 'content') ||
    typeof value.content !== 'string' ||
    !value.content.trim() ||
    value.content.length > 2000000
  )
    throw Error(`${name}工具参数需要唯一且非空的content文字字段`);
  return value.content;
}

export function isKeminiTool(outputTool) {
  return /^emit_complete_response_[a-f0-9]{24}$/u.test(outputTool?.name || '');
}

/** Read only the completed prefix of the content string; never guess an unfinished escape. */
function partialContent(argumentsText) {
  const opening = argumentsText.match(/^\s*\{\s*"content"\s*:\s*"/u);
  if (!opening) return '';
  let text = '';
  for (let index = opening[0].length; index < argumentsText.length; index++) {
    const char = argumentsText[index];
    if (char === '"') break;
    if (char !== '\\') {
      const code = char.charCodeAt(0);
      if (code < 32 || (code >= 0xd800 && code <= 0xdbff && index + 1 === argumentsText.length))
        break;
      text += char;
      continue;
    }
    const escape = argumentsText[++index];
    if (!escape) break;
    const simple = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
    if (Object.hasOwn(simple, escape)) {
      text += simple[escape];
      continue;
    }
    if (escape !== 'u') break;
    const hex = argumentsText.slice(index + 1, index + 5);
    if (!/^[0-9a-f]{4}$/iu.test(hex)) break;
    const code = Number.parseInt(hex, 16);
    const next = argumentsText.slice(index + 5);
    if (code >= 0xd800 && code <= 0xdbff && (!next || /^\\(?:u[0-9a-f]{0,3})?$/iu.test(next)))
      break;
    text += String.fromCharCode(code);
    index += 4;
  }
  return text;
}

export function createToolContentStream(outputTool, onDelta) {
  if (isKeminiTool(outputTool)) return createKeminiStream(outputTool, onDelta);
  let call = null;
  let emitted = '';
  function emit(text) {
    if (!text.startsWith(emitted)) throw Error('工具正文流式内容不连续');
    if (text.length > emitted.length) onDelta(text.slice(emitted.length));
    emitted = text;
  }
  return {
    push(deltas) {
      if (!Array.isArray(deltas)) throw Error('工具调用流式数据格式无效');
      for (const delta of deltas) {
        if ((delta.index ?? 0) !== 0 || (delta.type && delta.type !== 'function'))
          throw Error('正文只允许唯一一次函数工具调用');
        call ||= { type: 'function', function: { name: '', arguments: '' } };
        if (delta.id) {
          if (call.id && call.id !== delta.id) throw Error('正文工具调用ID发生变化');
          call.id = delta.id;
        }
        if (typeof delta.function?.name === 'string') call.function.name += delta.function.name;
        if (typeof delta.function?.arguments === 'string')
          call.function.arguments += delta.function.arguments;
        if (call.function.arguments.length > 2000000) throw Error('工具参数返回内容过大');
      }
      if (call?.function.name === outputTool.name) emit(partialContent(call.function.arguments));
    },
    finish() {
      const text = readToolContent({ tool_calls: call ? [call] : [] }, outputTool);
      emit(text);
      return text;
    },
    raw: () => call?.function.arguments || '',
  };
}

function createKeminiStream(outputTool, onDelta) {
  const calls = new Map();
  let plain = '',
    emitted = '';
  function emit(text) {
    if (text.startsWith(emitted) && text.length > emitted.length) {
      onDelta(text.slice(emitted.length));
      emitted = text;
    }
  }
  return {
    push(deltas) {
      for (const delta of deltas) {
        const index = delta.index ?? 0;
        if (!Number.isInteger(index) || index < 0 || index > 99) throw Error('Kemini工具索引无效');
        if (!calls.has(index))
          calls.set(index, { type: 'function', function: { name: '', arguments: '' } });
        const call = calls.get(index);
        if (delta.function?.name) call.function.name += delta.function.name;
        if (delta.function?.arguments) call.function.arguments += delta.function.arguments;
        if (call.function.arguments.length > 2000000) throw Error('Kemini工具参数过大');
      }
      const known = [...calls.values()].filter((call) =>
        /^emit_complete_response_[\w]+$/u.test(call.function.name.split(':').at(-1)),
      );
      if (!plain && known.length === 1) emit(partialContent(known[0].function.arguments));
    },
    plain(text) {
      plain += text;
    },
    finish() {
      const text = readToolContent({ content: plain, tool_calls: [...calls.values()] }, outputTool);
      emit(text);
      return text;
    },
    raw: () => JSON.stringify({ content: plain, tool_calls: [...calls.values()] }),
  };
}
