/** Small validator for our fixed output schemas; no dynamic code or model-defined schemas. */
export function checkOutputSchema(value, schema, path = 'output') {
  const fail = (message) => {
    const failure = Error(`生成格式不符：${path}${message}`);
    failure.path = path;
    throw failure;
  };
  if (schema.anyOf) {
    const errors = [];
    for (const candidate of schema.anyOf) {
      try {
        checkOutputSchema(value, candidate, path);
        return;
      } catch (failure) {
        errors.push(failure.message);
      }
    }
    fail(`不符合任何允许结构；${errors.slice(0, 2).join('；')}`);
  }
  if (Object.hasOwn(schema, 'const') && value !== schema.const)
    fail(`必须为${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value)) fail(`必须取${schema.enum.join('/')}`);
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('必须是对象');
    for (const key of schema.required || []) if (!Object.hasOwn(value, key)) fail(`.${key}缺失`);
    for (const key of Object.keys(value)) {
      if (!Object.hasOwn(schema.properties, key)) fail(`.${key}不是规定字段`);
      checkOutputSchema(value[key], schema.properties[key], `${path}.${key}`);
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(value)) fail('必须是数组');
    if (value.length < schema.minItems || value.length > schema.maxItems)
      fail(`需要${schema.minItems}～${schema.maxItems}项`);
    value.forEach((item, index) => checkOutputSchema(item, schema.items, `${path}[${index}]`));
  } else if (schema.type === 'string') {
    if (typeof value !== 'string') fail('必须是文字');
    if (value.length < schema.minLength || value.length > schema.maxLength)
      fail(`文字长度需要${schema.minLength}～${schema.maxLength}`);
  } else if (schema.type === 'integer') {
    if (!Number.isInteger(value)) fail('必须是整数');
    if (value < schema.minimum || value > schema.maximum)
      fail(`范围需要${schema.minimum}～${schema.maximum}`);
  } else if (schema.type === 'boolean' && typeof value !== 'boolean') fail('必须是布尔值');
}

/** Collect independent field failures so one local edit can address them together. */
export function outputSchemaIssues(value, schema, path = 'output') {
  if (schema.anyOf) {
    const alternatives = schema.anyOf.map((candidate) =>
      outputSchemaIssues(value, candidate, path),
    );
    return alternatives.sort((a, b) => a.length - b.length)[0];
  }
  if (schema.type === 'object' && value && typeof value === 'object' && !Array.isArray(value)) {
    const issues = [];
    for (const key of schema.required || []) {
      if (!Object.hasOwn(value, key))
        issues.push({ path: `${path}.${key}`, message: '缺少必填字段' });
    }
    for (const [key, item] of Object.entries(value)) {
      const child = schema.properties[key];
      if (!child) issues.push({ path: `${path}.${key}`, message: '不是规定字段' });
      else issues.push(...outputSchemaIssues(item, child, `${path}.${key}`));
    }
    return issues;
  }
  if (schema.type === 'array' && Array.isArray(value)) {
    const issues = [];
    if (value.length < schema.minItems || value.length > schema.maxItems)
      issues.push({ path, message: `需要${schema.minItems}～${schema.maxItems}项` });
    value.forEach((item, index) =>
      issues.push(...outputSchemaIssues(item, schema.items, `${path}[${index}]`)),
    );
    return issues;
  }
  try {
    checkOutputSchema(value, schema, path);
    return [];
  } catch (failure) {
    return [{ path: failure.path || path, message: failure.message }];
  }
}
