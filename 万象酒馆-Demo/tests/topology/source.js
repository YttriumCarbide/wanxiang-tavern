import { readdir, readFile, stat } from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as espree from 'espree';

function children(node) {
  return Object.entries(node).flatMap(([key, value]) => {
    if (key === 'loc' || key === 'range') return [];
    if (Array.isArray(value)) return value.filter((item) => item?.type);
    return value?.type ? [value] : [];
  });
}

function walk(node, visit) {
  if (!node) return;
  visit(node);
  for (const child of children(node)) walk(child, visit);
}

function names(pattern) {
  if (!pattern) return [];
  if (pattern.type === 'Identifier') return [pattern.name];
  if (pattern.type === 'RestElement') return names(pattern.argument);
  if (pattern.type === 'AssignmentPattern') return names(pattern.left);
  if (pattern.type === 'ArrayPattern') return pattern.elements.flatMap(names);
  if (pattern.type === 'ObjectPattern') {
    return pattern.properties.flatMap((property) => names(property.value ?? property.argument));
  }
  return [];
}

function parseModule(source, file) {
  const module = {
    file,
    ast: null,
    nodes: [],
    bindings: new Map(),
    imports: new Map(),
    exports: new Map(),
    stars: [],
    dependencies: [],
    links: new Map(),
    fields: new Set(),
    unresolved: new Map(),
    error: null,
  };
  try {
    const json = path.extname(file).toLowerCase() === '.json';
    if (json) JSON.parse(source);
    module.ast = espree.parse(json ? `(${source}\n)` : source, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      loc: true,
      range: true,
    });
    walk(module.ast, (node) => {
      if (json) {
        node.range = node.range.map((offset) => Math.max(0, offset - 1));
        for (const position of [node.loc.start, node.loc.end]) {
          if (position.line === 1) position.column = Math.max(0, position.column - 1);
        }
      }
      module.nodes.push(node);
      if (
        ['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(
          node.type,
        ) &&
        node.source
      ) {
        module.dependencies.push({ from: file, source: node.source.value, node, target: null });
      } else if (node.type === 'ImportExpression' && typeof node.source?.value === 'string') {
        module.dependencies.push({ from: file, source: node.source.value, node, target: null });
      }
    });
    if (json) {
      module.exports.set('default', { expression: module.ast.body[0].expression });
      return module;
    }
    for (const statement of module.ast.body) {
      const declaration = statement.declaration ?? statement;
      if (declaration.type === 'VariableDeclaration') {
        for (const item of declaration.declarations) {
          for (const name of names(item.id)) {
            const initializer = item.id.type === 'Identifier' ? item.init : item;
            module.bindings.set(name, declaration.kind === 'const' ? initializer : null);
          }
        }
      } else if (declaration.type === 'FunctionDeclaration' && declaration.id) {
        module.bindings.set(declaration.id.name, declaration);
      } else if (declaration.type === 'ClassDeclaration' && declaration.id) {
        module.bindings.set(declaration.id.name, null);
      }
      if (statement.type === 'ImportDeclaration') {
        for (const item of statement.specifiers) {
          const imported =
            item.type === 'ImportDefaultSpecifier'
              ? 'default'
              : item.type === 'ImportNamespaceSpecifier'
                ? '*'
                : (item.imported.name ?? item.imported.value);
          module.imports.set(item.local.name, { source: statement.source.value, imported });
        }
      }
      if (statement.type === 'ExportDefaultDeclaration') {
        module.exports.set(
          'default',
          declaration.type === 'Identifier'
            ? { local: declaration.name }
            : { expression: declaration },
        );
      }
      if (statement.type === 'ExportAllDeclaration') {
        if (statement.exported) {
          module.exports.set(statement.exported.name ?? statement.exported.value, {
            source: statement.source.value,
            imported: '*',
          });
        } else module.stars.push(statement.source.value);
      }
      if (statement.type !== 'ExportNamedDeclaration') continue;
      if (statement.declaration) {
        const exported =
          declaration.type === 'VariableDeclaration'
            ? declaration.declarations.flatMap((item) => names(item.id))
            : names(declaration.id);
        for (const name of exported) module.exports.set(name, { local: name });
      }
      for (const item of statement.specifiers) {
        module.exports.set(
          item.exported.name ?? item.exported.value,
          statement.source
            ? { source: statement.source.value, imported: item.local.name ?? item.local.value }
            : { local: item.local.name ?? item.local.value },
        );
      }
    }
  } catch (error) {
    const offset = Number(/position (\d+)/.exec(error.message)?.[1] ?? 0);
    module.error = {
      code: 'PARSE_ERROR',
      location: `${file}:${error.lineNumber ?? source.slice(0, offset).split('\n').length}`,
      detail:
        path.extname(file).toLowerCase() === '.json'
          ? 'Invalid JSON syntax'
          : 'Invalid module syntax',
    };
    module.ast = null;
    module.nodes = [];
  }
  return module;
}

function analyze(modules, initialIssues = []) {
  const unknown = Symbol('unknown');
  const issues = new Map();
  const memo = new Map();
  const busy = new Set();
  const registrySites = new Set();
  const checkedHelpers = new WeakMap();
  let evaluation = null;
  const location = (module, node) => `${module.file}:${node?.loc?.start.line ?? 1}`;
  function addIssue(module, node, code, detail) {
    const issue = { code, location: location(module, node), detail };
    issues.set(JSON.stringify(issue), issue);
  }
  function unresolved(module, node, detail) {
    if (evaluation) evaluation.diagnostics += 1;
    const site = { location: location(module, node), detail };
    module.unresolved.set(JSON.stringify(site), site);
  }
  function exportedNames(module, visited = new Set()) {
    if (!module || visited.has(module.file)) return new Set();
    const next = new Set(visited).add(module.file);
    const result = new Set(module.exports.keys());
    for (const source of module.stars) {
      for (const name of exportedNames(modules.get(module.links.get(source)), next)) {
        if (name !== 'default') result.add(name);
      }
    }
    return result;
  }
  function importedValue(module, source, name, data) {
    const target = modules.get(module.links.get(source));
    if (!target) return unknown;
    if (name !== '*') return exportValue(target, name, data);
    return {
      kind: 'object',
      registry: false,
      entries: new Map(
        [...exportedNames(target)].sort().map((key) => [key, exportValue(target, key, data)]),
      ),
    };
  }
  function exportValue(module, name, data = true) {
    const token = `export:${module.file}:${name}`;
    if (busy.has(token)) return unknown;
    busy.add(token);
    try {
      const entry = module.exports.get(name);
      if (entry?.source) return importedValue(module, entry.source, entry.imported, data);
      if (entry?.local) return bindingValue(module, entry.local, data);
      if (entry?.expression) return evaluate(entry.expression, module, undefined, data);
      if (name === 'default') return unknown;
      const providers = module.stars
        .map((source) => modules.get(module.links.get(source)))
        .filter((target) => target && exportedNames(target).has(name));
      const values = providers.map((target) => exportValue(target, name, data));
      return values.length && values.every((value) => value === values[0]) ? values[0] : unknown;
    } finally {
      busy.delete(token);
    }
  }
  function bindingValue(module, name, data = true) {
    const token = `binding:${module.file}:${name}`;
    const memoKey = `${token}:${data}`;
    if (memo.has(memoKey)) return memo.get(memoKey);
    if (busy.has(token)) return unknown;
    busy.add(token);
    try {
      const imported = module.imports.get(name);
      const initializer = module.bindings.get(name);
      const result = imported
        ? importedValue(module, imported.source, imported.imported, data)
        : evaluate(initializer, module, undefined, data);
      const value =
        initializer?.type === 'VariableDeclarator' && result?.kind === 'object'
          ? result.entries.get(name)
          : result;
      if (!evaluation?.limited) memo.set(memoKey, value);
      return value;
    } finally {
      busy.delete(token);
    }
  }
  function scalar(value) {
    return value !== unknown && (value === null || typeof value !== 'object');
  }
  function propertyKey(property, module, environment, data = false) {
    const value = property.computed
      ? evaluate(property.key, module, environment, data)
      : property.key.type === 'Identifier'
        ? property.key.name
        : property.key.value;
    return scalar(value) ? String(value) : unknown;
  }
  function constantKey(node) {
    if (node.type === 'Literal') return !node.regex;
    if (node.type === 'TemplateLiteral') return node.expressions.every(constantKey);
    return (
      [
        'UnaryExpression',
        'BinaryExpression',
        'LogicalExpression',
        'ConditionalExpression',
      ].includes(node.type) && children(node).every(constantKey)
    );
  }
  function duplicateProperties(node, module, keys) {
    const groups = new Map();
    for (const property of node.properties) {
      if (property.type !== 'Property') continue;
      const key = keys
        ? keys.get(property)
        : !property.computed || constantKey(property.key)
          ? propertyKey(property, module)
          : unknown;
      if (key === unknown) continue;
      module.fields.add(key);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(property);
    }
    for (const [key, properties] of groups) {
      const paired =
        properties.length >= 2 &&
        new Set(properties.slice(0, 2).map((property) => property.kind)).size === 2 &&
        properties.slice(0, 2).every((property) => ['get', 'set'].includes(property.kind));
      if (properties.length < 2 || (paired && properties.length === 2)) continue;
      addIssue(
        module,
        properties[paired ? 2 : 1],
        'DUPLICATE_OBJECT_KEY',
        `Repeated object key ${JSON.stringify(key)}`,
      );
    }
  }
  function spend(count = 1) {
    if (evaluation.limited || count > evaluation.remaining) {
      evaluation.limited = true;
      return false;
    }
    evaluation.remaining -= count;
    return true;
  }
  const arrayValue = (items) => ({ kind: 'array', items });

  function iterable(value) {
    if (value?.kind === 'array') return value.items;
    if (typeof value === 'string' && spend(value.length)) return Array.from(value);
    return null;
  }
  function appendSpread(items, value) {
    const source = iterable(value);
    if (!source || !spend(source.length)) return false;
    for (const item of source) items.push(item);
    return true;
  }
  function argumentsValue(nodes, read) {
    const args = [];
    for (const node of nodes) {
      if (node.type !== 'SpreadElement') args.push(read(node));
      else if (!appendSpread(args, read(node.argument))) return null;
    }
    return args;
  }
  function ownPairs(value) {
    if (value?.kind === 'object') {
      if (!spend(value.entries.size)) return null;
      return Object.entries(Object.fromEntries(value.entries));
    }
    if (value?.kind === 'array' || typeof value === 'string') {
      const source = typeof value === 'string' ? value : value.items;
      return spend(source.length) ? Object.entries(source) : null;
    }
    return scalar(value) || value?.kind === 'map' ? [] : null;
  }
  function memberValue(value, key) {
    if (!scalar(key)) return unknown;
    const name = String(key);
    if (value?.kind === 'object') {
      if (value.entries.has(name)) return value.entries.get(name);
      return value.partial || name in Object.prototype ? unknown : undefined;
    }
    if (value?.kind === 'array' || typeof value === 'string') {
      const isString = typeof value === 'string';
      const source = isString ? value : value.items;
      if (name === 'length') return source.length;
      if (Object.hasOwn(source, name)) return source[name];
      return name in (isString ? String.prototype : Array.prototype) ? unknown : undefined;
    }
    return unknown;
  }
  function obscureEntries(entries) {
    if (!spend(entries.size)) return false;
    for (const key of entries.keys()) entries.set(key, unknown);
    return true;
  }
  function bindPattern(pattern, value, module, scope, data, depth = 0) {
    if (!spend() || depth >= 96) {
      evaluation.limited = true;
      return false;
    }
    const bind = (part, item) => bindPattern(part, item, module, scope, data, depth + 1);
    if (pattern.type === 'Identifier') {
      scope.set(pattern.name, value);
      return true;
    }
    if (pattern.type === 'AssignmentPattern') {
      return bind(
        pattern.left,
        value === undefined ? evaluate(pattern.right, module, scope, data) : value,
      );
    }
    if (pattern.type === 'ArrayPattern') {
      const items = iterable(value);
      if (!items && value !== unknown) return false;
      for (const [index, part] of pattern.elements.entries()) {
        if (!part) continue;
        if (part.type === 'RestElement') {
          if (items && !spend(Math.max(0, items.length - index))) return false;
          return bind(part.argument, items ? arrayValue(Array.from(items.slice(index))) : unknown);
        }
        if (!bind(part, items ? items[index] : unknown)) return false;
      }
      return true;
    }
    if (pattern.type === 'ObjectPattern') {
      if (value === null || value === undefined) return false;
      const used = new Set();
      for (const property of pattern.properties) {
        if (property.type === 'RestElement') {
          const pairs = used.has(unknown) ? null : ownPairs(value);
          return bind(
            property.argument,
            pairs
              ? {
                  kind: 'object',
                  entries: new Map(pairs.filter(([key]) => !used.has(key))),
                  registry: value?.kind === 'object' && value.registry,
                  partial: value?.kind === 'object' && value.partial,
                }
              : unknown,
          );
        }
        const key = propertyKey(property, module, scope, data);
        used.add(key);
        if (!bind(property.value, memberValue(value, key))) return false;
      }
      return true;
    }
    return false;
  }
  function helperValue(node, module, environment) {
    return node.async || node.generator ? unknown : { kind: 'helper', node, module, environment };
  }
  function simpleExpressions(node, depth = 0) {
    if (!spend() || depth >= 96) return false;
    if (/Function/.test(node.type)) return true;
    if (
      [
        'AssignmentExpression',
        'UpdateExpression',
        'ImportExpression',
        'AwaitExpression',
        'YieldExpression',
        'ThisExpression',
        'ClassExpression',
      ].includes(node.type) ||
      (node.type === 'UnaryExpression' && node.operator === 'delete')
    )
      return false;
    return children(node).every((child) => simpleExpressions(child, depth + 1));
  }
  function simpleHelperBranch(node, depth = 0) {
    if (!node) return true;
    if (!spend() || depth >= 96) return false;
    const check = (child) => simpleHelperBranch(child, depth + 1);
    if (node.type === 'BlockStatement') return node.body.every(check);
    if (node.type === 'IfStatement') {
      return simpleExpressions(node.test) && check(node.consequent) && check(node.alternate);
    }
    const assignment = node.type === 'ExpressionStatement' ? node.expression : null;
    return (
      assignment?.type === 'AssignmentExpression' &&
      assignment.operator === '=' &&
      assignment.left.type === 'Identifier' &&
      simpleExpressions(assignment.right)
    );
  }
  function applyHelperBranch(node, module, scope, writable, data, uncertain = false) {
    if (!node) return true;
    if (!spend()) return false;
    const apply = (child, maybe = uncertain) =>
      applyHelperBranch(child, module, scope, writable, data, maybe);
    if (node.type === 'BlockStatement') return node.body.every((child) => apply(child));
    if (node.type === 'IfStatement') {
      const test = uncertain ? unknown : evaluate(node.test, module, scope, data);
      if (test === unknown) {
        // Invalidate possible writes without evaluating either branch's right-hand sides.
        return apply(node.consequent, true) && apply(node.alternate, true);
      }
      return apply(test ? node.consequent : node.alternate);
    }
    const { left, right } = node.expression;
    if (!writable.has(left.name)) {
      if (data) unresolved(module, node, 'Helper assignment must target an initialized local let');
      return false;
    }
    scope.set(left.name, uncertain ? unknown : evaluate(right, module, scope, data));
    return !evaluation.limited;
  }
  function invoke(helper, args, data) {
    if (helper?.kind !== 'helper') return unknown;
    const { node, module, environment } = helper;
    const { body, params } = node;
    if (!spend(1 + environment.size + params.length)) return unknown;
    const statements = body.type === 'BlockStatement' ? body.body : null;
    const result = statements?.at(-1);
    const locals = statements?.slice(0, -1) ?? [];
    const reject = (site, detail = 'Helper syntax cannot be resolved statically') => {
      if (data && !evaluation.limited) unresolved(module, site, detail);
      return unknown;
    };
    if (statements && result?.type !== 'ReturnStatement') return reject(result ?? body);
    let unsupported = checkedHelpers.get(node);
    if (unsupported === undefined) {
      unsupported = params.find((parameter) => !simpleExpressions(parameter));
      if (!unsupported && statements) {
        unsupported = locals.find((statement) => {
          if (statement.type === 'FunctionDeclaration') return false;
          if (statement.type === 'IfStatement') return !simpleHelperBranch(statement);
          return (
            statement.type !== 'VariableDeclaration' ||
            !['const', 'let'].includes(statement.kind) ||
            !simpleExpressions(statement)
          );
        });
      }
      const returned = statements ? result : body;
      unsupported ??= simpleExpressions(returned) ? null : returned;
      if (!evaluation.limited) checkedHelpers.set(node, unsupported);
    }
    if (evaluation.limited) return unknown;
    if (unsupported) return reject(unsupported);

    const parameters = new Map(environment);
    if (node.type !== 'ArrowFunctionExpression') parameters.set('arguments', unknown);
    if (node.type === 'FunctionExpression' && node.id) parameters.set(node.id.name, helper);
    for (const parameter of params) {
      for (const name of names(parameter)) parameters.set(name, unknown);
    }
    for (const [index, parameter] of params.entries()) {
      if (parameter.type === 'RestElement') {
        if (!spend(Math.max(0, args.length - index))) return unknown;
        if (
          !bindPattern(parameter.argument, arrayValue(args.slice(index)), module, parameters, data)
        ) {
          return reject(parameter, 'Helper parameter cannot be bound statically');
        }
      } else if (!bindPattern(parameter, args[index], module, parameters, data)) {
        return reject(parameter, 'Helper parameter cannot be bound statically');
      }
    }
    if (!statements) return evaluate(body, module, parameters, data);

    if (!spend(parameters.size + locals.length)) return unknown;
    const scope = new Map(parameters);
    for (const statement of locals) {
      if (statement.type === 'FunctionDeclaration') {
        scope.set(statement.id.name, helperValue(statement, module, scope));
      } else if (statement.type === 'VariableDeclaration') {
        for (const item of statement.declarations) {
          for (const name of names(item.id)) scope.set(name, unknown);
        }
      }
    }
    const writable = new Set();
    for (const statement of locals) {
      if (statement.type === 'IfStatement') {
        if (!applyHelperBranch(statement, module, scope, writable, data)) return unknown;
        continue;
      }
      if (statement.type !== 'VariableDeclaration') continue;
      for (const item of statement.declarations) {
        const value = item.init ? evaluate(item.init, module, scope, data) : undefined;
        if (!bindPattern(item.id, value, module, scope, data)) {
          return reject(item, 'Helper local cannot be bound statically');
        }
        if (statement.kind === 'let') {
          for (const name of names(item.id)) writable.add(name);
        }
      }
    }
    return result.argument ? evaluate(result.argument, module, scope, data) : undefined;
  }
  function mapArray(source, callback, flat, data) {
    if (callback?.kind !== 'helper' || !spend(source.items.length)) return unknown;
    const items = flat ? [] : new Array(source.items.length);
    for (let index = 0; index < source.items.length; index += 1) {
      if (!Object.hasOwn(source.items, index)) continue;
      const value = invoke(callback, [source.items[index], index, source], data);
      if (evaluation.limited) return unknown;
      if (!flat) items[index] = value;
      else if (value === unknown) return unknown;
      else if (value?.kind === 'array') {
        if (!spend(value.items.length)) return unknown;
        for (const key of Object.keys(value.items)) items.push(value.items[key]);
      } else items.push(value);
    }
    return arrayValue(items);
  }
  function replaceString(text, args, data) {
    if (args.length !== 2) return unknown;
    const [search, replacement] = args;
    const pattern = search?.kind === 'uppercasePattern' ? /[A-Z]/g : search;
    if (!(search?.kind === 'uppercasePattern' || typeof search === 'string')) return unknown;
    const callback = replacement?.kind === 'helper';
    if (!callback && (!scalar(replacement) || String(replacement).includes('$'))) return unknown;
    if (!spend(text.length + (typeof pattern === 'string' ? pattern.length : 0))) return unknown;
    let failed = false;
    const result = text.replace(pattern, (match, offset) => {
      if (failed) return '';
      const value = callback ? invoke(replacement, [match, offset, text], data) : replacement;
      if (!scalar(value) || !spend(1 + String(value).length)) {
        failed = true;
        return '';
      }
      return String(value);
    });
    return failed ? unknown : result;
  }
  function registryValue(tuples, node, module, mapConstructor, data) {
    if (data) registrySites.add(`${module.file}:${node.range[0]}`);
    if (tuples?.kind !== 'array') {
      if (data) unresolved(module, node, 'Registry entries cannot be resolved statically');
      return unknown;
    }
    if (!spend(tuples.items.length)) return unknown;
    const entries = new Map();
    let partial = false;
    for (const tuple of tuples.items) {
      const key = memberValue(tuple, '0');
      if (key === unknown || !['array', 'object'].includes(tuple?.kind)) {
        if (data) unresolved(module, node, 'Registry entry key cannot be resolved statically');
        if (!obscureEntries(entries)) return unknown;
        partial = true;
        continue;
      }
      const normalized = mapConstructor ? key : String(key);
      if (data && entries.has(normalized)) {
        addIssue(
          module,
          node,
          'DUPLICATE_REGISTRY_KEY',
          `Repeated registry key ${JSON.stringify(String(key))}`,
        );
      }
      entries.set(normalized, memberValue(tuple, '1'));
    }
    return { kind: mapConstructor ? 'map' : 'object', entries, registry: true, partial };
  }
  function evaluate(node, module, environment = new Map(), data = true, reportUnknown = true) {
    if (!node) return unknown;
    const root = evaluation === null;
    if (root) evaluation = { remaining: 250000, depth: 0, limited: false, diagnostics: 0 };
    try {
      if (!spend() || evaluation.depth >= 96) {
        evaluation.limited = true;
        return unknown;
      }
      evaluation.depth += 1;
      try {
        const diagnostics = evaluation.diagnostics;
        const value = evaluateNode(node, module, environment, data);
        if (
          data &&
          reportUnknown &&
          value === unknown &&
          !evaluation.limited &&
          evaluation.diagnostics === diagnostics &&
          !/Function/.test(node.type)
        ) {
          unresolved(module, node, `Data expression cannot be resolved statically (${node.type})`);
        }
        return evaluation.limited ? unknown : value;
      } finally {
        evaluation.depth -= 1;
      }
    } finally {
      if (root) {
        if (data && evaluation.limited) unresolved(module, node, 'Static evaluation limit reached');
        evaluation = null;
      }
    }
  }
  function evaluateNode(node, module, environment, data) {
    const read = (child) => evaluate(child, module, environment, data);
    switch (node.type) {
      case 'Literal':
        if (node.regex) {
          return node.regex.pattern === '[A-Z]' && node.regex.flags === 'g'
            ? { kind: 'uppercasePattern' }
            : unknown;
        }
        if (typeof node.value === 'bigint') return unknown;
        return typeof node.value !== 'string' || spend(node.value.length) ? node.value : unknown;
      case 'Identifier':
        if (environment.has(node.name)) return environment.get(node.name);
        if (module.bindings.has(node.name) || module.imports.has(node.name)) {
          return bindingValue(module, node.name, data);
        }
        return node.name === 'undefined' ? undefined : unknown;
      case 'FunctionDeclaration':
      case 'FunctionExpression':
      case 'ArrowFunctionExpression':
        return helperValue(node, module, environment);
      case 'VariableDeclarator': {
        const value = read(node.init);
        const scope = new Map(names(node.id).map((name) => [name, unknown]));
        return bindPattern(node.id, value, module, scope, data)
          ? { kind: 'object', entries: scope, registry: false }
          : unknown;
      }
      case 'ChainExpression':
        return read(node.expression);
      case 'TemplateLiteral': {
        const chunks = [];
        for (const [index, part] of node.quasis.entries()) {
          const text = part.value.cooked;
          const value = index < node.expressions.length ? read(node.expressions[index]) : '';
          if (text === null || !scalar(value) || !spend(text.length + String(value).length))
            return unknown;
          chunks.push(text, String(value));
        }
        return chunks.join('');
      }
      case 'UnaryExpression': {
        const value = read(node.argument);
        if (value === unknown) return unknown;
        if (node.operator === '!') return !value;
        if (node.operator === 'void') return undefined;
        if (!scalar(value)) return unknown;
        if (node.operator === '-') return -value;
        if (node.operator === '+') return +value;
        if (node.operator === '~') return ~value;
        return unknown;
      }
      case 'BinaryExpression': {
        const left = read(node.left);
        const right = read(node.right);
        if (!scalar(left) || !scalar(right)) return unknown;
        if (node.operator === '+') {
          const sum = left + right;
          return typeof sum !== 'string' || spend(sum.length) ? sum : unknown;
        }
        if (node.operator === '-') return left - right;
        if (node.operator === '*') return left * right;
        if (node.operator === '/') return left / right;
        if (node.operator === '%') return left % right;
        if (node.operator === '<') return left < right;
        if (node.operator === '<=') return left <= right;
        if (node.operator === '>') return left > right;
        if (node.operator === '>=') return left >= right;
        if (node.operator === '===') return left === right;
        if (node.operator === '!==') return left !== right;
        return unknown;
      }
      case 'LogicalExpression': {
        const left = read(node.left);
        if (left === unknown) return unknown;
        if (node.operator === '||') return left || read(node.right);
        if (node.operator === '&&') return left && read(node.right);
        if (node.operator === '??') return left ?? read(node.right);
        return unknown;
      }
      case 'ConditionalExpression': {
        const test = read(node.test);
        return test === unknown ? unknown : read(test ? node.consequent : node.alternate);
      }
      case 'ArrayExpression': {
        if (!spend(node.elements.length)) return unknown;
        const items = [];
        for (const element of node.elements) {
          if (!element) items.length += 1;
          else if (element.type !== 'SpreadElement') items.push(read(element));
          else {
            const value = evaluate(element.argument, module, environment, data, false);
            if (!appendSpread(items, value)) {
              if (data && !evaluation.limited) {
                unresolved(module, element, 'Array spread cannot be resolved statically');
              }
              return unknown;
            }
          }
        }
        return arrayValue(items);
      }
      case 'ObjectExpression': {
        if (!spend(node.properties.length)) return unknown;
        const entries = new Map();
        const origins = new Map();
        const keys = new Map();
        const collisions = [];
        let inheritedRegistry = false;
        let partial = false;
        function insert(key, value, site, spread) {
          const previous = origins.get(key);
          if (previous && (spread || previous.spread)) collisions.push({ key, site });
          origins.set(key, { spread });
          entries.set(key, value);
        }
        for (const property of node.properties) {
          if (property.type === 'SpreadElement') {
            const value = read(property.argument);
            const pairs = ownPairs(value);
            if (!pairs || (value?.kind === 'object' && value.partial)) {
              if (data) unresolved(module, property, 'Data spread cannot be resolved statically');
              if (!obscureEntries(entries)) return unknown;
              partial = true;
            }
            if (!pairs) continue;
            inheritedRegistry ||= value?.kind === 'object' && value.registry === true;
            for (const [key, item] of pairs) insert(key, item, property, true);
          } else {
            const key = propertyKey(property, module, environment, data);
            keys.set(property, key);
            if (key === unknown) {
              if (data)
                unresolved(module, property, 'Computed data key cannot be resolved statically');
              if (!obscureEntries(entries)) return unknown;
              partial = true;
            }
            const value = property.kind === 'init' ? read(property.value) : unknown;
            if (key === unknown) continue;
            if (
              key === '__proto__' &&
              !property.computed &&
              !property.shorthand &&
              !property.method &&
              property.kind === 'init'
            )
              return unknown;
            insert(key, value, property, false);
          }
        }
        duplicateProperties(node, module, keys);
        const entity = entries.has('id') && scalar(entries.get('id'));
        const registry =
          !entity &&
          (inheritedRegistry ||
            (entries.size > 0 &&
              [...entries.values()].every((value) => ['object', 'array'].includes(value?.kind))));
        if (data && registry) {
          registrySites.add(`${module.file}:${node.range[0]}`);
          for (const collision of collisions) {
            addIssue(
              module,
              collision.site,
              'DUPLICATE_REGISTRY_KEY',
              `Registry spread overwrites key ${JSON.stringify(collision.key)}`,
            );
          }
        }
        return { kind: 'object', entries, registry, partial };
      }
      case 'MemberExpression': {
        const object = read(node.object);
        if (node.optional && (object === null || object === undefined)) return undefined;
        const key = node.computed ? read(node.property) : node.property.name;
        return memberValue(object, key);
      }
      case 'CallExpression':
      case 'NewExpression': {
        const { callee } = node;
        const call = node.type === 'CallExpression';
        const member = callee.type === 'MemberExpression';
        const unshadowed = (name) =>
          !environment.has(name) && !module.bindings.has(name) && !module.imports.has(name);
        const globalObject =
          call &&
          member &&
          callee.object.type === 'Identifier' &&
          callee.object.name === 'Object' &&
          unshadowed('Object');
        const mapConstructor =
          !call && callee.type === 'Identifier' && callee.name === 'Map' && unshadowed('Map');
        const receiver = member && !globalObject ? read(callee.object) : unknown;
        if (member && callee.optional && (receiver === null || receiver === undefined))
          return undefined;
        const key = member
          ? callee.computed
            ? read(callee.property)
            : callee.property.name
          : unknown;
        const method = scalar(key) ? String(key) : unknown;
        const target = member
          ? memberValue(receiver, key)
          : call
            ? evaluate(callee, module, environment, data, false)
            : unknown;
        const unsupportedCall = () => {
          if (data && !evaluation.limited) {
            const label = method === unknown ? '' : ` to ${JSON.stringify(method)}`;
            unresolved(module, node, `Data call${label} cannot be resolved statically`);
          }
          return unknown;
        };
        if (node.optional && (target === null || target === undefined)) return undefined;
        const args = argumentsValue(node.arguments, read);
        if ((globalObject && method === 'fromEntries') || mapConstructor) {
          return registryValue(
            args?.length === 1 ? args[0] : unknown,
            node,
            module,
            mapConstructor,
            data,
          );
        }
        if (!call || !args) return unsupportedCall();
        if (globalObject) {
          if (method === 'hasOwn') {
            if (args.length !== 2 || !scalar(args[1])) return unknown;
            const [value, key] = args;
            const name = String(key);
            if (value?.kind === 'object') {
              if (value.entries.has(name)) return true;
              return value.partial ? unknown : false;
            }
            return value?.kind === 'array' ? Object.hasOwn(value.items, name) : unknown;
          }
          if (args.length !== 1) return unsupportedCall();
          if (method === 'freeze') return args[0];
          if (['keys', 'entries', 'values'].includes(method)) {
            const value = args[0];
            if (
              value === null ||
              value === undefined ||
              (value?.kind === 'object' && value.partial)
            ) {
              return unknown;
            }
            const pairs = ownPairs(value);
            if (!pairs) return unknown;
            return arrayValue(
              pairs.map((pair) =>
                method === 'keys' ? pair[0] : method === 'values' ? pair[1] : arrayValue(pair),
              ),
            );
          }
          return unsupportedCall();
        }
        if (receiver?.kind === 'array' && method === 'slice') {
          if (args.length > 2 || !args.every(scalar) || !spend(receiver.items.length))
            return unknown;
          return arrayValue(receiver.items.slice(args[0], args[1]));
        }
        if (receiver?.kind === 'array' && (method === 'map' || method === 'flatMap')) {
          return mapArray(receiver, args[0], method === 'flatMap', data);
        }
        if (typeof receiver === 'string') {
          if (method === 'replace') return replaceString(receiver, args, data);
          if (args.length === 0 && (method === 'toLowerCase' || method === 'toUpperCase')) {
            const result =
              method === 'toLowerCase' ? receiver.toLowerCase() : receiver.toUpperCase();
            return spend(result.length) ? result : unknown;
          }
        }
        return target?.kind === 'helper' ? invoke(target, args, data) : unsupportedCall();
      }
      default:
        return unknown;
    }
  }
  for (const issue of initialIssues) issues.set(JSON.stringify(issue), issue);
  for (const module of modules.values()) {
    if (module.error) issues.set(JSON.stringify(module.error), module.error);
    for (const node of module.nodes) {
      if (node.type === 'ObjectExpression') duplicateProperties(node, module);
    }
    for (const name of module.bindings.keys()) bindingValue(module, name);
    for (const statement of module.ast?.body ?? []) {
      const declaration = statement.declaration ?? statement;
      if (declaration.type === 'VariableDeclaration' && declaration.kind !== 'const') {
        for (const item of declaration.declarations) {
          if (item.init) {
            unresolved(
              module,
              item.init,
              'Mutable top-level initializer is not evaluated statically',
            );
          }
        }
      }
      if (
        statement.type === 'ExpressionStatement' &&
        statement.expression !== module.exports.get('default')?.expression
      ) {
        evaluate(statement.expression, module);
      }
    }
    for (const name of exportedNames(module)) exportValue(module, name);
  }

  const states = new Map();
  const active = [];
  const trail = [];
  function visitImports(file) {
    states.set(file, 1);
    active.push(file);
    const dependencies = modules
      .get(file)
      .dependencies.filter((edge) => modules.has(edge.target))
      .sort((a, b) =>
        a.target < b.target ? -1 : a.target > b.target ? 1 : a.node.range[0] - b.node.range[0],
      );
    for (const edge of dependencies) {
      if (!states.has(edge.target)) {
        trail.push(edge);
        visitImports(edge.target);
        trail.pop();
      } else if (states.get(edge.target) === 1) {
        const cycle = [...trail.slice(active.indexOf(edge.target)), edge];
        const labels = cycle.map((item) => location(modules.get(item.from), item.node));
        const rotations = labels
          .map((_, index) => ({
            index,
            text: [...labels.slice(index), ...labels.slice(0, index)].join(' -> '),
          }))
          .sort((a, b) => (a.text < b.text ? -1 : a.text > b.text ? 1 : 0));
        const first = cycle[rotations[0].index];
        addIssue(
          modules.get(first.from),
          first.node,
          'IMPORT_CYCLE',
          `Import cycle: ${rotations[0].text} -> ${first.from}`,
        );
      }
    }
    active.pop();
    states.set(file, 2);
  }
  for (const file of [...modules.keys()].sort()) {
    if (!states.has(file)) visitImports(file);
  }

  const orderedModules = [...modules.values()].sort((a, b) =>
    a.file < b.file ? -1 : a.file > b.file ? 1 : 0,
  );
  const coverage = orderedModules.map((module) => ({
    file: module.file,
    exports: [...exportedNames(module)].sort(),
    fieldKeys: [...module.fields].sort(),
    unresolved: [...module.unresolved.values()].sort((a, b) =>
      JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0,
    ),
  }));
  const nodes = orderedModules.flatMap((module) => module.nodes);
  return {
    issues: [...issues.values()].sort((a, b) => {
      const left = `${a.location}\0${a.code}\0${a.detail}`;
      const right = `${b.location}\0${b.code}\0${b.detail}`;
      return left < right ? -1 : left > right ? 1 : 0;
    }),
    stats: {
      files: modules.size,
      contentFiles: orderedModules.filter((module) => module.file.startsWith('src/content/'))
        .length,
      parsedFiles: orderedModules.filter((module) => module.ast).length,
      parseErrors: orderedModules.filter((module) => module.error).length,
      astNodes: nodes.length,
      objectExpressions: nodes.filter((node) => node.type === 'ObjectExpression').length,
      arrayExpressions: nodes.filter((node) => node.type === 'ArrayExpression').length,
      imports: orderedModules.reduce((sum, module) => sum + module.dependencies.length, 0),
      registries: registrySites.size,
      unresolvedSites: coverage.reduce((sum, entry) => sum + entry.unresolved.length, 0),
    },
    coverage,
  };
}

export function inspectSource(source, file = 'fixture.js') {
  const normalized = file.replaceAll('\\', '/');
  return analyze(new Map([[normalized, parseModule(source, normalized)]]));
}

export async function auditSource() {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const sourceRoot = path.join(root, 'src');
  const contentRoot = path.join(sourceRoot, 'content');
  const modules = new Map();
  const issues = [];
  const pending = [];
  const relative = (absolute) => path.relative(root, absolute).split(path.sep).join('/');
  const insideSource = (absolute) => {
    const local = path.relative(sourceRoot, absolute);
    return !path.isAbsolute(local) && local !== '..' && !local.startsWith(`..${path.sep}`);
  };
  async function enumerate(directory) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      issues.push({
        code: 'READ_ERROR',
        location: `${relative(directory)}:1`,
        detail: 'Cannot read directory',
      });
      return;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await enumerate(absolute);
      else if ((entry.isFile() || entry.isSymbolicLink()) && /\.(js|json)$/i.test(entry.name)) {
        pending.push(absolute);
      }
    }
  }
  async function resolveImport(from, specifier) {
    const base = path.resolve(path.dirname(from), specifier);
    const candidates = [base];
    if (!path.extname(base)) candidates.push(`${base}.js`, `${base}.json`);
    candidates.push(path.join(base, 'index.js'), path.join(base, 'index.json'));
    for (const candidate of candidates) {
      try {
        if ((await stat(candidate)).isFile()) return candidate;
      } catch {
        // Continue through the deterministic resolution candidates.
      }
    }
    return null;
  }

  await enumerate(contentRoot);
  const visited = new Set();
  for (let index = 0; index < pending.length; index += 1) {
    const absolute = pending[index];
    const file = relative(absolute);
    if (visited.has(file)) continue;
    visited.add(file);
    let source;
    try {
      source = await readFile(absolute, 'utf8');
    } catch {
      modules.set(file, parseModule('', file));
      issues.push({ code: 'READ_ERROR', location: `${file}:1`, detail: 'Cannot read source file' });
      continue;
    }
    const module = parseModule(source, file);
    modules.set(file, module);
    for (const dependency of module.dependencies) {
      if (!dependency.source.startsWith('./') && !dependency.source.startsWith('../')) continue;
      const target = await resolveImport(absolute, dependency.source);
      if (!target) {
        issues.push({
          code: 'MISSING_IMPORT',
          location: `${file}:${dependency.node.loc.start.line}`,
          detail: `Missing import ${JSON.stringify(dependency.source)} from ${file}:${dependency.node.loc.start.line}`,
        });
      } else if (insideSource(target)) {
        dependency.target = relative(target);
        module.links.set(dependency.source, dependency.target);
        pending.push(target);
      }
    }
  }
  return analyze(modules, issues);
}
