/** Read the declared text-only tool without evaluating imported code or changing prompts. */
export function presetOutputTransport(preset) {
  const bindings = preset.extensions?.SPreset?.ToolBindings || {};
  const active = new Set(
    preset.prompt_order[0].order.filter((entry) => entry.enabled).map((entry) => entry.identifier),
  );
  let outputTool = null;
  for (const [identifier, binding] of Object.entries(bindings)) {
    if (!active.has(identifier) || binding?.enabled !== true) continue;
    const form = binding.form;
    if (
      form?.name !== 'game_content' ||
      !Array.isArray(form.parameters) ||
      form.parameters.length !== 1 ||
      form.parameters[0]?.name !== 'content' ||
      form.parameters[0]?.type !== 'string' ||
      form.parameters[0]?.required !== true
    )
      continue;
    const prompt = preset.prompts.find((entry) => entry.identifier === identifier);
    if (!prompt || prompt.marker) continue;
    if (outputTool) throw Error('同一请求只能启用一个game_content正文工具绑定');
    outputTool = {
      name: form.name,
      description: String(form.description || '你的全部输出应当在此工具的content字段内。').slice(
        0,
        4000,
      ),
      parameters: {
        type: 'object',
        properties: { content: { type: 'string' } },
        required: ['content'],
        additionalProperties: false,
      },
    };
  }
  if (!outputTool || preset.function_calling === false) return {};
  const forced = preset.extensions?.SPreset?.ForcedPostProcessing;
  return {
    outputTool,
    ...(forced?.enabled && ['', 'strict', 'merge_tools'].includes(forced.mode)
      ? { promptProcessing: forced.mode || 'none' }
      : {}),
  };
}

export function outputToolRequest(outputTool, contextTool = null) {
  if (!outputTool && !contextTool) return null;
  if (
    contextTool &&
    (contextTool.name !== 'context' || typeof contextTool.description !== 'string')
  )
    throw Error('未适配的上下文工具');
  const contextTools = contextTool
    ? [
        {
          type: 'function',
          function: {
            name: 'context',
            description: contextTool.description,
            parameters: { type: 'object', properties: {} },
          },
        },
      ]
    : [];
  if (!outputTool) return { tools: contextTools };
  const kemini = /^emit_complete_response_[a-f0-9]{24}$/u.test(outputTool.name);
  if (outputTool.name !== 'game_content' && !kemini) throw Error('未适配的正文工具');
  return {
    tools: [{ type: 'function', function: structuredClone(outputTool) }, ...contextTools],
    tool_choice: kemini ? 'auto' : { type: 'function', function: { name: outputTool.name } },
  };
}

export function presetOutputWarnings(preset) {
  return presetOutputTransport(preset).outputTool
    ? ['已启用game_content工具输出，保留预设原始提示词；正文从工具参数读取，API需要支持工具调用。']
    : [];
}
