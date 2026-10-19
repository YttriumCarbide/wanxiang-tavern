import assert from 'node:assert/strict';
import { readFile, access, readdir } from 'node:fs/promises';
import path from 'node:path';
import postcss from 'postcss';
import { lexer } from 'css-tree';
import { parse } from 'espree';
import { projectRoot as root, command } from './runtime.mjs';

async function scripts(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await scripts(file)));
    else if (/\.(js|mjs|cjs)$/.test(file)) files.push(file);
  }
  return files;
}
async function contracts() {
  for (const folder of [root, path.dirname(root)]) {
    for (const name of ['一键启动.cmd', '一键关闭.cmd']) {
      const bytes = await readFile(path.join(folder, name));
      assert(
        bytes.every((byte) => byte < 128),
        `${name} must contain ASCII commands`,
      );
      assert(!/(?<!\r)\n/.test(bytes.toString()), `${name} must use CRLF`);
    }
  }
  const sourceFiles = await scripts(path.join(root, 'src'));
  const files = [
    ...sourceFiles,
    ...(await scripts(path.join(root, 'tools'))),
    ...(await scripts(path.join(root, 'tests'))),
  ];
  const graph = new Map();
  for (const file of files) {
    const ast = parse(await readFile(file, 'utf8'), {
      ecmaVersion: 'latest',
      sourceType: file.endsWith('.cjs') ? 'script' : 'module',
    });
    const imports = [];
    for (const node of ast.body) {
      assert(
        !sourceFiles.includes(file) ||
          !(node.type === 'VariableDeclaration' && node.kind === 'let'),
        `${file}: mutable state needs an explicit owner`,
      );
      if (
        !['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(
          node.type,
        ) ||
        !node.source?.value.startsWith('.')
      )
        continue;
      const dependency = path.resolve(path.dirname(file), node.source.value);
      await access(dependency);
      imports.push(dependency);
    }
    function inspect(node) {
      if (
        node.type === 'ImportExpression' &&
        typeof node.source.value === 'string' &&
        node.source.value.startsWith('.')
      )
        imports.push(path.resolve(path.dirname(file), node.source.value));
      for (const value of Object.values(node))
        for (const child of Array.isArray(value) ? value : [value])
          if (child && typeof child.type === 'string') inspect(child);
    }
    inspect(ast);
    await Promise.all(imports.map((file) => access(file)));
    graph.set(file, imports);
  }
  function visit(file, stack = []) {
    assert(!stack.includes(file), `Circular source dependency: ${[...stack, file].join(' -> ')}`);
    for (const dependency of graph.get(file) || []) visit(dependency, [...stack, file]);
  }
  for (const file of files) visit(file);
  for (const page of [
    'index.html',
    'tavern.html',
    'corridor.html',
    'guest-room.html',
    'master-bedroom.html',
    'artbook.html',
  ]) {
    const html = await readFile(path.join(root, page), 'utf8');
    assert(!/<style[>\s]/.test(html), `${page}: inline style block`);
    assert(!/<script type="module">/.test(html), `${page}: inline executable module`);
    for (const match of html.matchAll(/(?:src|href)="(\.\/[^"?#]+)[^"]*"/g))
      await access(path.resolve(root, match[1]));
  }
  for (const name of [
    'inn',
    'corridor',
    'guest-room-a',
    'guest-room-b',
    'master-bedroom',
    'battle',
    'forest',
    'dynasty',
    'xianxia',
    'castle',
    'arcane',
    'metropolis',
    'nexus',
    'wasteland',
    'relic',
    'preview-dynasty',
    'preview-xianxia',
    'preview-castle',
    'preview-arcane',
    'preview-metropolis',
    'preview-nexus',
    'preview-wasteland',
    'preview-relic',
  ])
    await access(path.join(root, 'assets', `${name}.glb`));
  await access(path.join(root, 'launch.ps1'));
  const packageFile = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
  assert.deepEqual(lock.packages[''].devDependencies, packageFile.devDependencies);
  assert.deepEqual(lock.packages[''].dependencies, packageFile.dependencies);
  return { sourceModules: files.length, circularImports: 0, inlineCode: 0, asciiLaunchers: 4 };
}
async function styles() {
  let declarations = 0;
  for (const name of await readdir(path.join(root, 'styles'))) {
    if (!name.endsWith('.css')) continue;
    const file = path.join(root, 'styles', name);
    const tree = postcss.parse(await readFile(file, 'utf8'), { from: file });
    const imports = [];
    tree.walkAtRules('import', (rule) =>
      imports.push(path.resolve(path.dirname(file), rule.params.match(/['"]([^'"]+)['"]/)[1])),
    );
    await Promise.all(imports.map((file) => access(file)));
    tree.walkDecls((declaration) => {
      declarations++;
      if (!declaration.prop.startsWith('--'))
        assert(
          lexer.getProperty(declaration.prop),
          `${name}: unknown property ${declaration.prop}`,
        );
    });
    tree.walkRules((rule) => {
      const seen = new Set();
      for (const declaration of rule.nodes.filter((node) => node.type === 'decl')) {
        const key = `${declaration.prop}:${Boolean(declaration.important)}`;
        assert(!seen.has(key), `${name}: repeated ${declaration.prop} in ${rule.selector}`);
        seen.add(key);
      }
    });
  }
  return { declarations, duplicateProperties: 0 };
}
export async function quality() {
  const operations = [
    ['eslint', () => command(process.execPath, ['node_modules/eslint/bin/eslint.js', '.'])],
    [
      'format',
      () =>
        command(process.execPath, [
          'node_modules/prettier/bin/prettier.cjs',
          '--check',
          'src',
          'tests',
          'tools',
          'styles',
          '*.html',
          '*.cjs',
          '*.mjs',
          '*.json',
          '*.md',
        ]),
    ],
    ['contracts', contracts],
    ['styles', styles],
  ];
  const results = await Promise.allSettled(
    operations.map(async ([name, operation]) => ({ name, detail: await operation() })),
  );
  const errors = results.flatMap((result, index) =>
    result.status === 'rejected' ? [`${operations[index][0]}: ${result.reason.message}`] : [],
  );
  assert.deepEqual(errors, [], 'All quality failures are collected together');
  return results.map((result) => result.value);
}
