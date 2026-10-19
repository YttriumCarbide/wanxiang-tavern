import { generationDiagnostic } from './generation-result.js';
import { readOutputTags } from '../output-tags.js';

export const OUTPUT_TAG = 'wanxiang_json';
export const OUTPUT_OPEN = `<${OUTPUT_TAG}>`;
export const OUTPUT_CLOSE = `</${OUTPUT_TAG}>`;

/** Read one explicit payload only. Braces and other tags outside it are never JSON candidates. */
export function extractGenerationEnvelope(kind, rawText) {
  const diagnostic = generationDiagnostic(kind, rawText, '', 'envelope');
  diagnostic.candidateText = '';
  const reject = (message) => {
    diagnostic.issues = [{ path: 'output.envelope', message }];
    const failure = Error(message);
    failure.diagnostic = diagnostic;
    throw failure;
  };
  let sections;
  try {
    sections = readOutputTags(rawText, [{ tag: OUTPUT_TAG, json: true }]);
  } catch (failure) {
    reject(failure.message);
  }
  const result = sections[0];
  if (!result) reject(`缺少 ${OUTPUT_OPEN} 输出标签；不会尝试读取标签外的JSON。`);
  const candidateText = result.content;
  if (!candidateText.trim()) reject(`${OUTPUT_OPEN} 标签内没有JSON内容。`);
  const ignoredCharacters = result.start + rawText.length - result.end;
  return {
    candidateText,
    envelope: { tag: OUTPUT_TAG, ignoredCharacters },
    repairs: [
      {
        message: `提取 ${OUTPUT_OPEN} 内的JSON；忽略标签外 ${ignoredCharacters} 个字符（原始返回保留）`,
      },
    ],
  };
}
