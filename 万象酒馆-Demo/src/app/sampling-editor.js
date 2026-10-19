import { SAMPLING_FIELDS, samplingFromPreset } from '../ai/sampling.js';

export function renderSampling(container, preset) {
  container.replaceChildren();
  if (!preset) return;
  const values = samplingFromPreset(preset);
  for (const { key, label: text, min, max, step } of SAMPLING_FIELDS) {
    const label = document.createElement('label'),
      input = document.createElement('input');
    label.textContent = text;
    input.type = 'number';
    input.dataset.sampling = key;
    Object.assign(input, { min, max, step, value: values[key] ?? '', placeholder: '沿用接口设置' });
    label.append(input);
    container.append(label);
  }
  for (const [key, text, options] of [
    [
      'stream',
      '流式传输',
      [
        ['', '沿用接口设置'],
        ['true', '开启'],
        ['false', '关闭'],
      ],
    ],
    [
      'reasoning_effort',
      '推理强度',
      [
        ['', '自动 / 不发送'],
        ...['none', 'minimal', 'min', 'low', 'medium', 'high', 'xhigh', 'max'].map((value) => [
          value,
          value,
        ]),
      ],
    ],
  ]) {
    const label = document.createElement('label'),
      select = document.createElement('select');
    label.textContent = text;
    select.dataset.sampling = key;
    select.replaceChildren(...options.map(([value, text]) => new Option(text, value)));
    select.value = String(values[key] ?? '');
    label.append(select);
    container.append(label);
  }
}

export function captureSampling(container, preset) {
  for (const alias of [
    'openai_max_context',
    'max_context',
    'openai_max_tokens',
    'max_completion_tokens',
    'stream_openai',
    'should_stream',
  ])
    delete preset[alias];
  for (const field of container.querySelectorAll('[data-sampling]')) {
    const key = field.dataset.sampling;
    if (field.value === '') delete preset[key];
    else if (key === 'stream') preset[key] = field.value === 'true';
    else if (key === 'reasoning_effort') preset[key] = field.value;
    else preset[key] = Number(field.value);
  }
  samplingFromPreset(preset);
}
