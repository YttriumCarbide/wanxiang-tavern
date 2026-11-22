import { readFile, readdir } from 'node:fs/promises';
import { extname, join, posix, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse, tokenize } from 'espree';
import { collectSiblingAssetEvidence } from './assets-supporting.js';

const DEFAULT_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const HOLE = '\0';
const JS_OPTIONS = Object.freeze({ ecmaVersion: 'latest', sourceType: 'module', range: true });
const MEDIA =
  /\.(?:apng|avif|bmp|gif|ico|jpe?g|png|svg|webp|ktx2?|dds|glb|gltf|bin|mp[34]|m4[av]|ogg|oga|opus|wav|webm|flac|aac|woff2?|ttf|otf|eot)$/i;
const CATALOG_FILE = /(?:^|\/)asset-catalog(?:[.-]generated)?\.(?:[cm]?js|json)$/i;
const SOURCE_FILE = /\.(?:[cm]?js|css|html?|json)$/i;
const ARTBOOK_FILE = /(?:^|\/)artbook\.(?:[cm]?js|html?)$/i;

function compare(a, b) {
  for (let i = 0, j = 0; i < a.length && j < b.length;) {
    const x = a.codePointAt(i);
    const y = b.codePointAt(j);
    if (x !== y) return x - y;
    i += x > 0xffff ? 2 : 1;
    j += y > 0xffff ? 2 : 1;
  }
  return a.length - b.length;
}

function ordered(items, fields) {
  const unique = new Map(
    items.map((item) => [JSON.stringify(fields.map((field) => item[field])), item]),
  );
  return [...unique.values()].sort((a, b) => {
    for (const field of fields) {
      const order = compare(a[field], b[field]);
      if (order) return order;
    }
    return 0;
  });
}

function locator(source, file) {
  const starts = [0];
  for (const match of source.matchAll(/\r\n|[\n\r\u2028\u2029]/g)) {
    starts.push(match.index + match[0].length);
  }
  return (offset) => {
    let low = 0;
    let high = starts.length;
    while (high - low > 1) {
      const mid = (low + high) >>> 1;
      if (starts[mid] <= offset) low = mid;
      else high = mid;
    }
    return `${file}:${low + 1}:${offset - starts[low] + 1}`;
  };
}

function issue(code, location, detail) {
  return { code: `asset.${code}`, location, detail };
}

function externalType(value) {
  if (/^data:/i.test(value)) return 'data';
  if (/^(?:[a-z][a-z\d+.-]*:)?[/\\]{2}/i.test(value) || /^(?:https?|ftp|blob):/i.test(value)) {
    return 'remote';
  }
  return null;
}

function urlParts(value) {
  const hash = value.indexOf('#');
  return {
    pathname: (hash < 0 ? value : value.slice(0, hash)).split('?')[0],
    fragment: hash < 0 ? '' : value.slice(hash + 1),
  };
}

function normalizedUrl(value, { base = '', owner = '', mode = 'js' } = {}) {
  const input = value.trim();
  const skipped = externalType(input);
  if (skipped) return { skipped };
  const { pathname, fragment } = urlParts(input);
  let decoded;
  let id;
  try {
    decoded = decodeURIComponent(pathname).replace(/\\/g, '/');
    id = decodeURIComponent(fragment);
  } catch {
    return { error: 'invalid-url', detail: `Invalid URL escape: ${input}` };
  }
  // eslint-disable-next-line no-control-regex -- Intentionally reject control characters in asset URLs.
  if (/[\u0000-\u001f\u007f]/.test(decoded) || /^[a-z][a-z\d+.-]*:/i.test(decoded)) {
    return { error: 'invalid-url', detail: `Invalid local URL: ${input}` };
  }
  if (!decoded) return owner && id ? { path: owner, fragment: id } : {};
  if (/^[/\\]{2}/.test(decoded)) {
    return { error: 'invalid-url', detail: `Encoded network path: ${input}` };
  }

  const bareModel = mode === 'js' && !decoded.includes('/') && /\.glb$/i.test(decoded);
  const local = bareModel ? `assets/${decoded}` : decoded;
  const parts = local.startsWith('/') ? [] : base.split('/').filter(Boolean);
  for (const part of local.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!parts.length || (parts.length === 1 && /^assets$/i.test(parts[0]))) {
        return { error: 'traversal', detail: `URL leaves its asset or project root: ${input}` };
      }
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  if (local.endsWith('/') && mode !== 'container') return {};
  return { path: parts.join('/'), fragment: id };
}

function assetSpelling(value) {
  let pathname = urlParts(value.trim()).pathname;
  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    // Keep recognizable asset paths so malformed escapes are diagnosed.
  }
  return pathname.replace(/\\/g, '/');
}

function hasAssetPrefix(pathname) {
  return /(?:^|\/)assets\//i.test(pathname);
}

function looksLikeUrl(value, mode, force = false) {
  const input = value.trim();
  if (!input || /[\r\n<>]/.test(input) || input.startsWith(HOLE + ' ')) return false;
  if (mode === 'container' || force) return true;
  if (/^(?:mailto|tel|javascript|about):/i.test(input)) return false;
  const name = assetSpelling(input);
  if (externalType(input)) {
    return (
      mode !== 'js' ||
      MEDIA.test(name) ||
      hasAssetPrefix(name) ||
      /^data:(?:image|audio|video|font|model)\//i.test(input)
    );
  }
  if (hasAssetPrefix(name) && !/^[^\s/]+\s+\.?\/?assets\//i.test(name)) return true;
  if (mode === 'catalog') return MEDIA.test(name) || /\.[a-z\d]{1,12}$/i.test(name);
  if (mode === 'js')
    return /^[^/]+\s*\.glb$/i.test(name) || (!name.includes('/') && /\.glb$/i.test(name));
  return MEDIA.test(name);
}

function localReference(value, location, kind, options) {
  const result = normalizedUrl(value, options);
  if (result.path) return { ...result, location, kind };
  if (result.error) return { ...result, path: value.trim(), location, kind };
  return result;
}

function publicReferences(references) {
  return ordered(
    references.map(({ path, location, kind }) => ({ path, location, kind })),
    ['path', 'location', 'kind'],
  );
}

function inventoryIndex(assetPaths) {
  const exact = new Set(assetPaths);
  const folded = new Map();
  for (const path of [...exact].sort(compare)) {
    const lower = path.toLowerCase();
    if (!folded.has(lower)) folded.set(lower, []);
    folded.get(lower).push(path);
  }
  return { exact, folded };
}

function pathIssue(reference, inventory, prefix = '') {
  if (reference.error)
    return issue(`${prefix}${reference.error}`, reference.location, reference.detail);
  if (inventory.exact.has(reference.path)) return null;
  const matches = inventory.folded.get(reference.path.toLowerCase());
  if (matches) {
    return issue(
      `${prefix}case-mismatch`,
      reference.location,
      `${reference.path} has different casing on disk: ${matches.join(', ')}`,
    );
  }
  return issue(`${prefix}missing`, reference.location, reference.path);
}

export function validateAssetReferences(references, assetPaths) {
  const inventory = inventoryIndex(assetPaths);
  const issues = [];
  for (const reference of references) {
    const path = reference.path;
    const source = reference.location.replace(/:\d+(?::\d+)?$/, '');
    const mode = /\.css$/i.test(source) ? 'css' : /\.html?$/i.test(source) ? 'html' : 'js';
    const base = mode === 'js' ? '' : posix.dirname(source);
    // Collector paths are already decoded and rooted at the project.
    const candidate =
      inventory.exact.has(path) || (/^assets\//i.test(path) && !/[?#%]/.test(path)) ? path : null;
    const normalized = localReference(candidate ?? path, reference.location, reference.kind, {
      mode,
      base: candidate ? '' : base === '.' ? '' : base,
    });
    if (candidate && inventory.exact.has(candidate)) {
      normalized.path = candidate;
      delete normalized.error;
    }
    if (!normalized.path) continue;
    const problem = pathIssue(normalized, inventory);
    if (problem) issues.push(problem);
  }
  return ordered(issues, ['code', 'location', 'detail']);
}

function decodeEntities(text) {
  return text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (original, name) => {
    if (name.startsWith('#')) {
      const hex = name[1].toLowerCase() === 'x';
      const value = Number.parseInt(name.slice(hex ? 2 : 1), hex ? 16 : 10);
      return value > 0 && value <= 0x10ffff && !(value >= 0xd800 && value <= 0xdfff)
        ? String.fromCodePoint(value)
        : original;
    }
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' }[name.toLowerCase()];
  });
}

function cssUnescape(value) {
  return value.replace(
    /\\(?:([\da-f]{1,6})(?:\r\n|[\t\n\f\r ])?|(\r\n|[\s\S]))/gi,
    (_, hex, escaped) => {
      if (!hex) return /[\r\n\f]/.test(escaped) ? '' : escaped;
      const code = Number.parseInt(hex, 16);
      return code && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
        ? String.fromCodePoint(code)
        : '\ufffd';
    },
  );
}

function cssUrls(source, emit) {
  let i = 0;
  while (i < source.length) {
    if (source.startsWith('/*', i)) {
      const end = source.indexOf('*/', i + 2);
      i = end < 0 ? source.length : end + 2;
      continue;
    }
    if (source[i] === '"' || source[i] === "'") {
      const quote = source[i++];
      while (i < source.length && source[i] !== quote) i += source[i] === '\\' ? 2 : 1;
      i++;
      continue;
    }
    if (!/[-\w\\]/.test(source[i - 1] ?? '') && source.slice(i, i + 4).toLowerCase() === 'url(') {
      i += 4;
      while (/\s/.test(source[i] ?? '')) i++;
      const quote = /['"]/.test(source[i] ?? '') ? source[i++] : '';
      const start = i;
      while (i < source.length && source[i] !== (quote || ')')) {
        i += source[i] === '\\' ? 2 : 1;
      }
      const end = i;
      if (quote && source[i] === quote) {
        i++;
        while (/\s/.test(source[i] ?? '')) i++;
      }
      if (source[i] === ')') emit(cssUnescape(source.slice(start, end).trim()), start);
      i++;
      continue;
    }
    i++;
  }
}

function srcsetUrls(text, emit) {
  let i = 0;
  while (i < text.length) {
    while (/[\s,]/.test(text[i] ?? '')) i++;
    if (i === text.length) return;
    const start = i;
    const data = text.slice(i, i + 5).toLowerCase() === 'data:';
    while (i < text.length && !/\s/.test(text[i]) && (data || text[i] !== ',')) i++;
    const token = text.slice(start, i);
    const url = token.replace(/,+$/, '');
    if (url) emit(url, start);
    if (token !== url) continue;
    let depth = 0;
    while (i < text.length) {
      const c = text[i++];
      if (c === ',' && depth === 0) break;
      if (c === '(') depth++;
      if (c === ')' && depth) depth--;
    }
  }
}

function markupTag(text, start, xml = false) {
  const head = /^<(\/?)([A-Za-z_\u0080-\uffff][\w.:\u0080-\uffff-]*)/.exec(text.slice(start));
  if (!head) return null;
  const [, close, name] = head;
  const attributes = [];
  const names = new Set();
  let cursor = start + head[0].length;
  while (cursor < text.length) {
    const previous = cursor;
    while (/\s/.test(text[cursor] ?? '')) cursor++;
    if (text[cursor] === '>') {
      return { name, close: Boolean(close), self: false, attributes, end: cursor + 1 };
    }
    if (!close && text.startsWith('/>', cursor)) {
      return { name, close: false, self: true, attributes, end: cursor + 2 };
    }
    if (close || (xml && previous === cursor)) return null;
    const key = /^[^\s<>'"=/]+/.exec(text.slice(cursor))?.[0];
    if (!key || (xml && !/^[A-Za-z_\u0080-\uffff][\w.:\u0080-\uffff-]*$/.test(key))) return null;
    cursor += key.length;
    const afterName = cursor;
    while (/\s/.test(text[cursor] ?? '')) cursor++;
    if (text[cursor] !== '=') {
      if (xml) return null;
      attributes.push({ key, value: '', offset: cursor });
      cursor = afterName;
      continue;
    }
    cursor++;
    while (/\s/.test(text[cursor] ?? '')) cursor++;
    const quote = text[cursor];
    let offset = cursor;
    let end;
    if (quote === '"' || quote === "'") {
      offset++;
      end = text.indexOf(quote, offset);
      if (end < 0) return null;
      cursor = end + 1;
    } else {
      if (xml) return null;
      const value = /^[^\s>]+/.exec(text.slice(cursor))?.[0];
      if (!value) return null;
      end = cursor += value.length;
    }
    const raw = text.slice(offset, end);
    if (xml && (names.has(key) || raw.includes('<'))) return null;
    names.add(key);
    attributes.push({ key, value: decodeEntities(raw), offset });
  }
  return null;
}

function htmlUrls(source, emit, script) {
  const tags = /<!--|<[A-Za-z_]/g;
  let match;
  while ((match = tags.exec(source))) {
    if (match[0] === '<!--') {
      const end = source.indexOf('-->', tags.lastIndex);
      tags.lastIndex = end < 0 ? source.length : end + 3;
      continue;
    }
    const tag = markupTag(source, match.index);
    if (!tag) continue;
    const name = tag.name.toLowerCase();
    tags.lastIndex = tag.end;
    for (const { key, value, offset } of tag.attributes) {
      const attribute = key.toLowerCase();
      if (attribute === 'srcset' || attribute === 'imagesrcset') {
        srcsetUrls(value, (url, index) => emit(url, offset + index, true));
      } else if (attribute === 'src' || attribute === 'href' || attribute === 'xlink:href') {
        const imageSlot = /^(?:img|image|audio|video|source|track|embed|use)$/.test(name);
        emit(value, offset, imageSlot);
      } else if (attribute === 'style') {
        cssUrls(value, (url, index) => emit(url, offset + index, false));
      }
    }
    if (!tag.self && /^(?:script|style|textarea|title|xmp|iframe)$/.test(name)) {
      const closing = new RegExp(`</${name}\\s*>`, 'gi');
      closing.lastIndex = tag.end;
      const end = closing.exec(source);
      const body = source.slice(tag.end, end?.index ?? source.length);
      if (name === 'style') cssUrls(body, (url, i) => emit(url, tag.end + i, false));
      if (name === 'script' && script) {
        const type = tag.attributes.find(({ key }) => key.toLowerCase() === 'type')?.value.trim();
        const src = tag.attributes.some(({ key }) => key.toLowerCase() === 'src');
        if (
          !src &&
          (!type || /^(?:module|(?:application|text)\/(?:java|ecma)script)$/i.test(type))
        ) {
          script(body, tag.end);
        }
      }
      tags.lastIndex = end ? closing.lastIndex : source.length;
    }
  }
}

function childNodes(node) {
  const children = [];
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child.type === 'string') children.push(child);
      }
    } else if (value && typeof value.type === 'string') {
      children.push(value);
    }
  }
  return children;
}

function staticKey(node) {
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  return null;
}

function propertyKey(node) {
  if (node.type !== 'Property' || (node.computed && node.key.type !== 'Literal')) return null;
  return staticKey(node.key);
}

function parseJavaScript(source) {
  try {
    return parse(source, JS_OPTIONS);
  } catch (error) {
    try {
      return parse(source, {
        ...JS_OPTIONS,
        sourceType: 'script',
        ecmaFeatures: { globalReturn: true },
      });
    } catch {
      throw error;
    }
  }
}

function bindingsFor(ast) {
  const scopes = new WeakMap();

  function declare(pattern, scope, init = null) {
    if (!pattern) return;
    switch (pattern.type) {
      case 'Identifier':
        scope.names.set(pattern.name, init);
        break;
      case 'RestElement':
        declare(pattern.argument, scope);
        break;
      case 'AssignmentPattern':
        declare(pattern.left, scope);
        break;
      case 'ArrayPattern':
        for (const item of pattern.elements) declare(item, scope);
        break;
      case 'ObjectPattern':
        for (const item of pattern.properties) declare(item.value ?? item.argument, scope);
        break;
    }
  }

  function visit(node, parent, outer) {
    const isFunction = /^(?:Function(?:Declaration|Expression)|ArrowFunctionExpression)$/.test(
      node.type,
    );
    const block = /^(?:BlockStatement|CatchClause|For(?:In|Of)?Statement|SwitchStatement)$/.test(
      node.type,
    );
    const scope = !outer || isFunction || block ? { outer, names: new Map() } : outer;
    scopes.set(node, scope);

    if (node.type === 'VariableDeclarator') {
      declare(
        node.id,
        scope,
        parent.kind === 'const' && node.id.type === 'Identifier' ? node.init : null,
      );
    }
    if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') {
      declare(node.id, outer ?? scope);
    }
    if (isFunction) {
      declare(node.id, scope);
      for (const param of node.params) declare(param, scope);
    }
    if (node.type === 'ImportDeclaration') {
      for (const item of node.specifiers) declare(item.local, scope);
    }
    if (node.type === 'CatchClause') declare(node.param, scope);
    for (const child of childNodes(node)) visit(child, node, scope);
  }

  visit(ast, null, null);
  return (identifier) => {
    for (let scope = scopes.get(identifier); scope; scope = scope.outer) {
      if (scope.names.has(identifier.name)) return scope.names.get(identifier.name);
    }
    return null;
  };
}

function joinSketches(left, right) {
  if (left.length * right.length > 64) {
    // Preserve the outside context of large alternatives without inventing paths.
    const prefix = left[0].split(HOLE)[0];
    const suffix = right[0].split(HOLE).at(-1);
    return [prefix + HOLE + suffix];
  }
  return [...new Set(left.flatMap((a) => right.map((b) => a + b)))];
}

function stringSketches(node, binding, seen = new Set()) {
  if (!node || seen.has(node)) return [HOLE];
  seen.add(node);
  let result;
  switch (node.type) {
    case 'Literal':
      result =
        !node.regex && ['string', 'number', 'boolean'].includes(typeof node.value)
          ? [String(node.value)]
          : [HOLE];
      break;
    case 'Identifier':
      result = stringSketches(binding(node), binding, seen);
      break;
    case 'AuditDomain':
      result = node.values;
      break;
    case 'TemplateLiteral': {
      result = [''];
      for (let i = 0; i < node.quasis.length; i++) {
        const quasi = node.quasis[i].value;
        result = joinSketches(result, [quasi.cooked ?? quasi.raw]);
        if (i < node.expressions.length) {
          result = joinSketches(result, stringSketches(node.expressions[i], binding, seen));
        }
      }
      break;
    }
    case 'BinaryExpression':
      result =
        node.operator === '+'
          ? joinSketches(
              stringSketches(node.left, binding, seen),
              stringSketches(node.right, binding, seen),
            )
          : [HOLE];
      break;
    case 'ConditionalExpression':
      result = [
        ...new Set([
          ...stringSketches(node.consequent, binding, seen),
          ...stringSketches(node.alternate, binding, seen),
        ]),
      ];
      break;
    default:
      result = [HOLE];
  }
  seen.delete(node);
  return result;
}

function expressionKey(source) {
  return JSON.stringify(tokenize(source, JS_OPTIONS).map(({ type, value }) => [type, value]));
}

function reviewedRules() {
  const rules = new Map();
  function add(file, domain, sites) {
    const entries = new Map();
    for (const [owner, ...expressions] of sites) {
      for (const expression of expressions) {
        entries.set(`${owner}:${expressionKey(expression)}`, domain);
      }
    }
    rules.set(file, entries);
  }

  add('src/exploration/scenes.js', 'scenes', [
    ['/var:sideScenes/var:art', '`./assets/exploration/town-side-places/${id}`'],
    ['/var:sideScenes', '`${art}.png`', '`${art}-night.png`'],
    ['/var:roadScenes/var:art', '`./assets/exploration/overland-road/${id}-wide`'],
    ['/var:roadScenes', '`${art}.png`', '`${art}-night.png`'],
    [
      '/var:capitalScenes',
      '`./assets/exploration/silver-crown/${id}.png`',
      '`./assets/exploration/silver-crown/${id}-night.png`',
    ],
    ['/var:eternalCityScenes', '`./assets/exploration/eternal-city/${place.art || id}.png`'],
    ['/var:eternalRoadScenes', '`./assets/exploration/eternal-city/${id}.png`'],
    ['/var:crossroadArtScenes', '`./assets/exploration/overland-road/${imageId}-wide.png`'],
    ['/var:imperialLandmarkScenes', '`./assets/exploration/overland-road/${artName}.png`'],
  ]);
  add('src/portraits.js', 'portraits', [
    [
      '/fn:portraitUrl',
      "`./assets/portraits/${name}${/\\.(svg|png|jpe?g|webp|avif)$/i.test(name) ? '' : '.svg'}`",
    ],
  ]);
  add('src/content/rp-backgrounds.js', 'events', [
    ['/fn:rpBackground', "`./assets/events/${region}-${node === 1 ? 'event' : 'quest'}.png`"],
  ]);
  add('src/content/gal-npc-portraits.js', 'gal', [
    ['/fn:galNpcPortrait', 'directory + portraits[npc.galPortrait]', 'directory + file'],
    ['/var:GAL_NPC_PORTRAITS', 'directory + file'],
  ]);
  add('src/content/portrait-templates.js', 'content', [
    ['/var:PORTRAIT_TEMPLATES', '`template-${weapon}-${gender}.webp`'],
  ]);
  add('src/exploration/atlas-geography.js', 'atlas-symbols', [
    ['/fn:populateRelief/var:href', '`${SILVER_ROAD_ART}#${symbol}`'],
  ]);
  add('src/content/tavern-visitors.js', 'standing', [
    ['/fn:standingSprite', '`./assets/tavern-visitors/${definition.id}-full-v1.png`'],
  ]);
  add('src/audio/sfx.js', 'sfx', [['/var:SFX', '`./assets/audio/sfx/${name}.wav`']]);
  add('src/content/city-center.js', 'content', [
    ['/var:CITY_CENTER', '`./assets/exploration/city-center-${direction}-v1.png`'],
  ]);
  add('src/content/common-adversaries.js', 'content', [
    ['/fn:commonMob', '`${art}.glb`'],
    ['/fn:commonBoss', '`${art}.glb`'],
  ]);
  add('src/content/enemy-templates.js', 'content', [
    ['/var:HUMANOID_ENEMY_TEMPLATES', '`enemy-humanoid-${weapon}-${gender}.glb`'],
  ]);
  add('src/content/forest-adversaries.js', 'content', [['/fn:creature', "portrait + '.glb'"]]);
  add('src/content/frost-adversaries.js', 'content', [['/fn:enemy', "appearance + '.glb'"]]);
  add('src/content/items.js', 'content', [
    ['/fn:potion', "'./assets/items/' + art + '.svg'", "'./assets/items/' + art"],
  ]);
  add('src/content/ladder-adversaries.js', 'content', [
    ['/fn:ladderMob', '`${art}.glb`'],
    ['/fn:ladderBoss', '`${art}.glb`'],
  ]);
  add('src/content/mill-adversaries.js', 'content', [
    ['/fn:adversary', '`${config.portrait}.glb`'],
  ]);
  add('src/content/starbell-scenes.js', 'content', [
    [
      '/var:art',
      '`./assets/exploration/${id}-panorama-v2.png`',
      '`./assets/exploration/${id}-band-v1.png`',
      '`./assets/exploration/${id}-${direction}-v2.png`',
    ],
  ]);
  add('src/content/starlamp-street.js', 'content', [
    [
      '/var:STARLAMP_STREET',
      "`./assets/exploration/starlamp-corner-${direction}-${{ front: 'v5', left: 'v4' }[direction] || 'v3'}.png`",
    ],
  ]);
  add('src/content/universal-adversaries.js', 'content', [
    ['/fn:creature', "id.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase()) + '.glb'"],
  ]);
  add('src/exploration/street-scene.js', 'standing', [
    ['/fn:createStreetScene/var:mesh', '`./assets/tavern-visitors/${portrait.id}-full-v1.png`'],
  ]);
  add('src/destination-preview.js', 'biomes', [
    [
      '/fn:createDestinationPreview/fn:loadModelWithFallback/var:candidates',
      '`./assets/preview-${biome}.glb`',
      '`./assets/${assetName}.glb`',
    ],
    ['/fn:createDestinationPreview/fn:loadModelWithFallback', '`/${assetName}.glb`'],
  ]);
  add('src/scene.js', 'biomes', [
    ['/fn:createBattleView/var:asset', '`./assets/${theme.asset}.glb`'],
  ]);
  add('src/overlord-registry.js', 'content', [
    ['/fn:overlordAssetUrls', '`./assets/${def.model}`'],
  ]);
  add('src/overlord-models.js', 'content', [
    ['/fn:createOverlordModels/var:url', '`./assets/${def.model}`'],
  ]);
  add('src/artbook.js', 'creatures', [['/fn:creatureView/var:model', '`./assets/${id}.glb`']]);
  add('src/app/archive-model-stage.js', 'content', [
    ['/fn:createArchiveModelStage/fn:mount', '`./assets/${file}`'],
  ]);
  return rules;
}

function literalDomain(node) {
  if (!node) return undefined;
  if (node.type === 'Literal' && !node.regex) return node.value;
  if (node.type === 'ArrayExpression') return node.elements.map(literalDomain);
  if (node.type === 'ObjectExpression') {
    return Object.fromEntries(
      node.properties.flatMap((property) => {
        const key = propertyKey(property);
        return key === null ? [] : [[key, literalDomain(property.value)]];
      }),
    );
  }
  if (
    node.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' &&
    !node.callee.computed &&
    node.callee.object.name === 'Object' &&
    node.callee.property.name === 'freeze'
  ) {
    return literalDomain(node.arguments[0]);
  }
  return undefined;
}

function creatureIds(value) {
  const ids = [];
  if (Array.isArray(value)) {
    for (const row of value) {
      const id = typeof row === 'string' ? row : Array.isArray(row) ? row[0] : row?.id;
      if (typeof id === 'string') ids.push(id);
    }
  } else if (value && typeof value === 'object') {
    for (const [key, row] of Object.entries(value)) ids.push(row?.id ?? key);
  }
  return [...new Set(ids.filter((id) => typeof id === 'string' && /^[\w-]+$/.test(id)))].sort(
    compare,
  );
}

function portraitLiteral(name) {
  if (hasAssetPrefix(assetSpelling(name))) return name;
  const suffix = /\.(svg|png|jpe?g|webp|avif)$/i.test(name) ? '' : '.svg';
  return `./assets/portraits/${name || 'guardian'}${suffix}`;
}

function sourceReferences(source, file, kind, rules) {
  const references = [];
  const dynamic = [];
  const creatures = [];
  const skipped = { remote: 0, data: 0 };
  const locate = locator(source, file);
  const ext = extname(file).toLowerCase();
  const catalog = kind === 'catalog';
  const directory = posix.dirname(file);
  const base = directory === '.' ? '' : directory;

  function add(value, location, mode, force = false) {
    if (!looksLikeUrl(value, mode, force)) return;
    const path =
      mode === 'catalog' && !hasAssetPrefix(assetSpelling(value)) && !externalType(value)
        ? `assets/${value.replace(/^\.\/|^\//, '')}`
        : value;
    const entry = localReference(path, location, kind, {
      mode,
      base:
        mode === 'module' || mode === 'css' || (mode === 'html' && !/\.[cm]?js$/i.test(file))
          ? base
          : '',
    });
    if (entry.skipped) skipped[entry.skipped]++;
    if (entry.path) references.push(entry);
  }

  function javascript(text, offset = 0) {
    const ast = parseJavaScript(text);
    const lexicalBinding = bindingsFor(ast);
    const parameterValues = new Map();
    if (file === 'src/app/settlement.js') {
      let reward;
      walkValues(ast, '', (node) => {
        if (node?.type === 'VariableDeclarator' && node.id.name === 'reward') reward = node.init;
      });
      if (reward?.type === 'ArrowFunctionExpression' && reward.params[0]?.type === 'Identifier') {
        const values = new Set();
        walkValues(ast, '', (node) => {
          if (node?.type !== 'CallExpression' || lexicalBinding(node.callee) !== reward) return;
          for (const value of stringSketches(node.arguments[0], lexicalBinding)) values.add(value);
        });
        parameterValues.set(reward, {
          type: 'AuditDomain',
          values: values.size ? [...values] : [HOLE],
        });
      }
    }
    const binding = (identifier) => {
      for (const [fn, domain] of parameterValues) {
        if (
          identifier.name === fn.params[0].name &&
          identifier.range[0] >= fn.range[0] &&
          identifier.range[1] <= fn.range[1]
        )
          return domain;
      }
      return lexicalBinding(identifier);
    };
    const location = (node) => locate(offset + node.range[0]);

    function inspect(node, parent, absorbed = false, owner = '') {
      if (node.type === 'VariableDeclarator') owner += `/var:${node.id.name ?? ''}`;
      if (node.type === 'FunctionDeclaration') owner += `/fn:${node.id?.name ?? ''}`;
      if (node.type === 'FunctionExpression' && node.id) owner += `/expr:${node.id.name}`;

      if (
        ARTBOOK_FILE.test(file) &&
        node.type === 'VariableDeclarator' &&
        node.id.type === 'Identifier' &&
        node.id.name === 'CREATURES'
      ) {
        for (const id of creatureIds(literalDomain(node.init)))
          creatures.push({ id, location: location(node) });
      }

      const literal = node.type === 'Literal' && typeof node.value === 'string' && !node.regex;
      const template = node.type === 'TemplateLiteral';
      const binary = node.type === 'BinaryExpression' && node.operator === '+';
      const construction = binary || (template && node.expressions.length > 0);
      const urlBase =
        parent?.type === 'NewExpression' &&
        parent.callee.type === 'Identifier' &&
        parent.callee.name === 'URL' &&
        parent.arguments[0] === node
          ? parent.arguments[1]
          : null;
      const moduleRelative =
        urlBase?.type === 'MemberExpression' &&
        (urlBase.computed
          ? urlBase.property.type === 'Literal' && urlBase.property.value === 'url'
          : urlBase.property.name === 'url') &&
        urlBase.object.type === 'MetaProperty' &&
        urlBase.object.meta.name === 'import' &&
        urlBase.object.property.name === 'meta';
      let takesParts = absorbed || moduleRelative;

      if (!absorbed && (literal || template || binary || moduleRelative)) {
        const key = parent?.value === node ? propertyKey(parent) : null;
        const propertyName = parent?.key === node && !parent.computed;
        const mode = moduleRelative ? 'module' : catalog ? 'catalog' : 'js';
        const evidence = { asset: false, unknown: false, constructed: false };

        function inspectValue(value, valueMode, forceDynamic = false) {
          const trimmed = value.trim();
          if (trimmed.startsWith('#')) return;

          if (forceDynamic && trimmed === HOLE) {
            evidence.asset = true;
            evidence.unknown = true;
            return;
          }

          const external = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(trimmed);
          const spelling = assetSpelling(trimmed);
          const probe = trimmed.replaceAll(HOLE, 'wx-audit-slot');
          const probeSpelling = assetSpelling(probe);
          if (external) {
            if (!looksLikeUrl(probe, valueMode)) return;
            if (trimmed.includes(HOLE)) {
              evidence.asset = true;
              evidence.unknown = true;
              return;
            }
            add(value, location(node), valueMode, moduleRelative);
            evidence.asset = true;
            return;
          }
          if (!external && !hasAssetPrefix(probeSpelling) && !MEDIA.test(probeSpelling)) return;

          const unknown = (external ? trimmed : spelling).includes(HOLE);
          const mode = moduleRelative || (unknown && valueMode === 'js') ? 'module' : valueMode;
          if (!looksLikeUrl(probe, mode)) return;

          if (unknown) {
            evidence.unknown = true;
            evidence.constructed = true;
          } else {
            const reference = !external && trimmed.includes(HOLE) ? spelling : value;
            add(reference, location(node), valueMode, moduleRelative);
          }
          evidence.asset = true;
        }

        if (!propertyName || catalog) {
          for (const value of stringSketches(node, binding)) {
            if (!moduleRelative && /<(?:[a-z!])/i.test(value)) {
              htmlUrls(value, (url, _index, force) => inspectValue(url, 'html', force));
              continue;
            }
            if (!catalog && key === 'portrait' && !value.includes(HOLE) && !externalType(value)) {
              if (
                value === '' ||
                /^[\w./-]+$/u.test(value) ||
                hasAssetPrefix(assetSpelling(value))
              ) {
                inspectValue(portraitLiteral(value), 'js');
              }
              continue;
            }
            if (
              file === 'src/portraits.js' &&
              literal &&
              parent?.type === 'VariableDeclarator' &&
              parent.id.name === 'UNKNOWN_CARD'
            ) {
              inspectValue(portraitLiteral(value), 'js');
              continue;
            }
            inspectValue(value, mode);
          }
        }

        if (evidence.asset && (construction || (moduleRelative && evidence.unknown))) {
          const expression = text.slice(...node.range);
          const domain = evidence.unknown
            ? rules.get(file)?.get(`${owner}:${expressionKey(expression)}`)
            : null;
          dynamic.push({
            location: location(node),
            expression,
            status:
              evidence.unknown && !domain
                ? evidence.constructed
                  ? 'unresolved'
                  : 'runtime-input'
                : 'resolved',
            domain,
          });
          takesParts = true;
        }
      }

      for (const child of childNodes(node)) {
        const sameExpression =
          binary ||
          template ||
          ((absorbed || moduleRelative) &&
            (node.type === 'ConditionalExpression' || node.type === 'LogicalExpression'));
        const isControl = node.type === 'ConditionalExpression' && child === node.test;
        inspect(child, node, takesParts && sameExpression && !isControl, owner);
      }
    }

    inspect(ast, null);
  }

  if (ext === '.css') {
    cssUrls(source, (url, offset) => add(url, locate(offset), 'css'));
  } else if (ext === '.html' || ext === '.htm') {
    htmlUrls(source, (url, offset) => add(url, locate(offset), 'html'), javascript);
  } else if (ext === '.json') {
    const content = JSON.parse(source.replace(/^\ufeff/, ''));
    walkValues(
      content,
      file,
      (value, location) => {
        if (typeof value === 'string') add(value, location, catalog ? 'catalog' : 'js');
      },
      catalog,
    );
  } else {
    javascript(source);
  }
  return { references, dynamic, creatures, skipped };
}

export function findAssetReferences(source, { file = 'fixture.js', kind = 'runtime' } = {}) {
  const name = file.replace(/\\/g, '/').replace(/^\.\//, '');
  const result = sourceReferences(source, name, kind, reviewedRules());
  return {
    references: publicReferences(result.references),
    dynamic: ordered(
      result.dynamic.map(({ location, expression, status }) => ({
        location,
        expression,
        status,
      })),
      ['location', 'expression', 'status'],
    ),
  };
}

function walkValues(value, location, visit, includeKeys = false, seen = new Set()) {
  visit(value, location);
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (value instanceof Map) {
    let index = 0;
    for (const [key, child] of value) {
      walkValues(key, `${location}.key[${index}]`, visit, includeKeys, seen);
      walkValues(child, `${location}.value[${index++}]`, visit, includeKeys, seen);
    }
  } else if (value instanceof Set) {
    let index = 0;
    for (const child of value) {
      walkValues(child, `${location}[${index++}]`, visit, includeKeys, seen);
    }
  } else {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of Object.keys(descriptors).sort(compare)) {
      const descriptor = descriptors[key];
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) continue;
      const child = Array.isArray(value) ? `${location}[${key}]` : `${location}.${key}`;
      if (includeKeys) visit(key, child);
      walkValues(descriptor.value, child, visit, includeKeys, seen);
    }
  }
}

function xmlDeclarationEnd(text, start) {
  let brackets = 0;
  let quote = '';
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (quote) {
      if (char === quote) quote = '';
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '[') {
      brackets++;
    } else if (char === ']') {
      brackets--;
    } else if (char === '>' && brackets === 0) {
      return i + 1;
    }
  }
  return -1;
}

function svgDocument(text, emit) {
  const stack = [];
  const ids = new Set();
  let root = false;
  let doctype = false;
  let index = 0;

  function textContent(value, offset, cdata = false) {
    if (!stack.length && (cdata || value.trim()))
      throw Error(`Content outside the SVG root at offset ${offset}`);
    if (stack.at(-1)?.split(':').at(-1) === 'style') {
      cssUrls(value, (url, at) => emit(url, offset + at));
    }
  }

  while (index < text.length) {
    const next = text.indexOf('<', index);
    if (next < 0) {
      textContent(text.slice(index), index);
      break;
    }
    textContent(text.slice(index, next), index);
    index = next;

    if (text.startsWith('<!--', index)) {
      const end = text.indexOf('-->', index + 4);
      if (end < 0 || text.slice(index + 4, end).includes('--')) throw Error('Invalid XML comment');
      index = end + 3;
      continue;
    }
    if (text.startsWith('<?', index)) {
      const end = text.indexOf('?>', index + 2);
      if (end < 0) throw Error('Unterminated XML processing instruction');
      index = end + 2;
      continue;
    }
    if (text.startsWith('<!DOCTYPE', index)) {
      if (root || doctype) throw Error('Misplaced SVG doctype');
      doctype = true;
      index = xmlDeclarationEnd(text, index + 9);
      if (index < 0) throw Error('Unterminated SVG doctype');
      continue;
    }
    if (text.startsWith('<![CDATA[', index)) {
      const offset = index + 9;
      const end = text.indexOf(']]>', offset);
      if (end < 0) throw Error('Unterminated SVG CDATA section');
      textContent(text.slice(offset, end), offset, true);
      index = end + 3;
      continue;
    }

    const tag = markupTag(text, index, true);
    if (!tag) throw Error(`Invalid XML tag at offset ${index}`);
    index = tag.end;
    if (tag.close) {
      if (stack.pop() !== tag.name) throw Error(`Mismatched closing tag: ${tag.name}`);
      continue;
    }
    if (!stack.length) {
      if (root || tag.name.split(':').at(-1) !== 'svg')
        throw Error('Expected one SVG root element');
      root = true;
    }
    if (!tag.self) stack.push(tag.name);
    for (const { key, value, offset } of tag.attributes) {
      if (key === 'id' || key === 'xml:id') ids.add(value);
      if (key === 'href' || key === 'xlink:href') {
        if (value.trim()) emit(value, offset);
      } else if (!/^xmlns(?::|$)/.test(key)) {
        cssUrls(value, (url, at) => emit(url, offset + at));
      }
    }
  }
  if (!root || stack.length) throw Error('Missing or unclosed SVG root');
  return ids;
}

function glbDocument(bytes, emit) {
  const JSON_CHUNK = 0x4e4f534a;
  const BIN_CHUNK = 0x004e4942;
  if (bytes.length < 20 || bytes.readUInt32LE(0) !== 0x46546c67) throw Error('Invalid GLB header');
  if (bytes.readUInt32LE(4) !== 2) throw Error('Expected GLB version 2');
  if (bytes.readUInt32LE(8) !== bytes.length) throw Error('GLB length does not match the file');

  let document;
  let chunk = 0;
  for (let offset = 12; offset < bytes.length; chunk++) {
    if (offset + 8 > bytes.length) throw Error('Truncated GLB chunk header');
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + length;
    if (length % 4 || end > bytes.length) throw Error('Invalid GLB chunk length or padding');
    if (chunk === 0 && type !== JSON_CHUNK) throw Error('First GLB chunk must be JSON');
    if (type === JSON_CHUNK) {
      if (chunk !== 0) throw Error('GLB has more than one JSON chunk');
      document = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(start, end)),
      );
    }
    if (type === BIN_CHUNK && chunk !== 1) throw Error('BIN must be the second GLB chunk');
    offset = end;
  }

  if (
    !document ||
    typeof document !== 'object' ||
    Array.isArray(document) ||
    document.asset?.version !== '2.0'
  ) {
    throw Error('Expected a glTF 2.0 asset object in the JSON chunk');
  }
  for (const collection of ['buffers', 'images']) {
    if (!Object.hasOwn(document, collection)) continue;
    const entries = document[collection];
    if (!Array.isArray(entries)) throw Error(`Expected an array for ${collection}`);
    for (const [index, entry] of entries.entries()) {
      const field = `${collection}[${index}]`;
      if (!entry || typeof entry !== 'object' || Array.isArray(entry))
        throw Error(`Invalid ${field}`);
      if (!Object.hasOwn(entry, 'uri')) continue;
      if (typeof entry.uri !== 'string' || !entry.uri.trim()) throw Error(`Invalid ${field}.uri`);
      emit(entry.uri, `${field}.uri`);
    }
  }
}

async function readDirectory(root, relative, issues) {
  try {
    const entries = await readdir(join(root, relative), { withFileTypes: true });
    return entries.sort((a, b) => compare(a.name, b.name));
  } catch (error) {
    issues.push(issue('read-directory', relative || '.', error.code ?? error.message));
    return [];
  }
}

async function listFiles(root, relative, issues, excluded = new Set()) {
  const files = [];
  const entries = await readDirectory(root, relative, issues);
  for (const entry of entries) {
    const path = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isFile()) files.push(path);
    else if (entry.isDirectory() && !excluded.has(entry.name)) {
      files.push(...(await listFiles(root, path, issues, excluded)));
    } else if (entry.isSymbolicLink() && /^assets\//i.test(path)) {
      issues.push(
        issue('inventory-entry', path, 'Symbolic link is outside the regular file inventory'),
      );
    }
  }
  return files;
}

function rootSourceKind(path) {
  if (/\b(?:config|lock)\./i.test(path) || /^(?:package|manifest)\.json$/i.test(path)) return null;
  return /^(?:server|local-server|test|tests|tool|tools)(?:[.-]|$)/i.test(path)
    ? 'supporting'
    : 'runtime';
}

function registerSceneIds(modules) {
  const known = new Set(['street', 'city-center']);
  const probes = new Set();
  const maps = new Set([
    'STARBELL_SCENES',
    'TOWN_SIDE_PLACES',
    'SILVER_CROWN_PLACES',
    'ETERNAL_CITY_PLACES',
    'ETERNAL_CITY_STOPS',
  ]);
  const lists = new Set([
    'OVERLAND_ROAD',
    'IMPERIAL_CROSSROADS',
    'IMPERIAL_DUNGEONS',
    'IMPERIAL_FORTS',
  ]);
  function add(target, value) {
    if (typeof value === 'string' && value) target.add(value);
  }

  for (const [file, module] of modules) {
    if (!file.startsWith('src/content/')) continue;
    for (const [name, value] of Object.entries(module)) {
      if (maps.has(name) && value && typeof value === 'object') {
        for (const key of Object.keys(value)) known.add(key);
        for (const definition of Object.values(value)) add(known, definition?.id);
      } else if (lists.has(name) && Array.isArray(value)) {
        for (const definition of value) add(known, definition?.id);
      } else if (name === 'SILVER_CROWN_GATE') {
        add(known, value);
      }
      if (!/map|scene|city|road|landmark|places|stops|routes|biome/i.test(name)) continue;
      if (
        /^[A-Z][A-Z\d_]*$/.test(name) &&
        value &&
        !Array.isArray(value) &&
        typeof value === 'object'
      ) {
        for (const key of Object.keys(value)) add(probes, key);
      }
      walkValues(value, name, (child) => {
        if (Array.isArray(child)) {
          for (const item of child) add(probes, item);
        } else if (child && typeof child === 'object') {
          add(probes, child.id);
        }
      });
    }
  }
  return { known, probes };
}

async function collectDomains(root, sources, runtime, previews, creatures, issues, skipped) {
  const modules = new Map();
  const completed = new Set();
  const moduleFiles = sources.filter(
    ({ file, kind }) =>
      kind === 'runtime' &&
      (/^src\/content\/.*\.js$/.test(file) ||
        /(?:^|\/)data\.js$/.test(file) ||
        /^src\/(?:audio\/(?:config|sfx)|exploration\/scenes|portraits)\.js$/.test(file)),
  );
  for (const { file } of moduleFiles) {
    try {
      modules.set(file, await import(pathToFileURL(join(root, file)).href));
    } catch (error) {
      issues.push(issue('import', file, error.message));
    }
  }

  function add(value, location, force = false) {
    if (typeof value !== 'string' || !looksLikeUrl(value, 'js', force)) return;
    const entry = localReference(value, location, 'runtime', { mode: 'js' });
    if (entry.skipped) skipped[entry.skipped]++;
    if (entry.path) runtime.push(entry);
  }

  const portraitUrl = modules.get('src/portraits.js')?.portraitUrl;

  function collect(value, location) {
    walkValues(value, location, (child, at) => {
      if (typeof child === 'string') {
        if (!/\.(?:portrait|customPortrait)$/.test(at)) add(child, at);
        return;
      }
      if (!child || typeof child !== 'object' || !portraitUrl) return;
      if (Object.hasOwn(child, 'portrait') || Object.hasOwn(child, 'customPortrait')) {
        // Saved custom portraits are user data. Audit registered URLs, without
        // consulting browser storage or trying to enumerate arbitrary remote URLs.
        const direct = child.customPortrait || child.portrait;
        add(
          hasAssetPrefix(assetSpelling(direct || '')) ? direct : portraitUrl(child),
          `${at}.portraitUrl`,
          true,
        );
      }
    });
  }

  for (const [file, exports] of modules) {
    collect(exports, file);
  }
  if (moduleFiles.every(({ file }) => modules.has(file))) completed.add('content');
  const atlasFile = 'src/exploration/atlas-geography.js';
  const atlasConstants = new Map();
  walkValues(parseJavaScript(await readFile(join(root, atlasFile), 'utf8')), '', (node) => {
    if (
      node?.type === 'VariableDeclarator' &&
      ['TERRAIN_ART', 'SILVER_ROAD_ART'].includes(node.id.name)
    )
      atlasConstants.set(node.id.name, literalDomain(node.init));
  });
  const terrainArt = atlasConstants.get('TERRAIN_ART');
  const terrainPath = atlasConstants.get('SILVER_ROAD_ART');
  if (terrainArt && typeof terrainPath === 'string') {
    for (const symbol of Object.values(terrainArt))
      add(`${terrainPath}#${symbol}`, `${atlasFile}:TERRAIN_ART.${symbol}`, true);
    completed.add('atlas-symbols');
  } else {
    issues.push(issue('domain', atlasFile, 'Cannot resolve finite terrain symbol declarations'));
  }
  if (portraitUrl) {
    add(portraitUrl({}), 'src/portraits.js:portraitUrl(default)', true);
    completed.add('portraits');
  }

  const scenes = modules.get('src/exploration/scenes.js')?.explorationScene;
  if (scenes) {
    const { known, probes } = registerSceneIds(modules);
    let complete = true;
    for (const id of [...new Set([...known, ...probes])].sort(compare)) {
      const location = `src/exploration/scenes.js:explorationScene(${id})`;
      try {
        const scene = scenes(id);
        if (scene?.id === id || (id === 'street' && scene?.id === 'starlamp-street')) {
          collect(scene, location);
        } else if (known.has(id)) {
          complete = false;
          issues.push(
            issue('scene-id', location, `Returned ${JSON.stringify(scene?.id)} for ${id}`),
          );
        }
      } catch (error) {
        complete = false;
        issues.push(issue('domain', location, error.message));
      }
    }
    if (complete) completed.add('scenes');
  }

  const biomes = modules.get('src/content/biomes.js')?.BIOMES;
  const eventsFile = 'src/content/rp-backgrounds.js';
  const rpBackground = modules.get(eventsFile)?.rpBackground;
  if (biomes && typeof biomes === 'object') {
    for (const id of Object.keys(biomes).sort(compare)) {
      const model = biomes[id]?.asset;
      const location = `src/content/biomes.js:BIOMES.${id}`;
      if (typeof model !== 'string' || !model) {
        issues.push(issue('domain', location, 'Biome does not declare an asset'));
      } else {
        const fallback = `assets/${model.endsWith('.glb') ? model : `${model}.glb`}`;
        add(fallback, `${location}.asset`, true);
        previews.push({
          path: `assets/preview-${id}.glb`,
          location: `${location}.preview`,
          fallback,
          fragment: '',
          kind: 'runtime',
        });
      }
      if (rpBackground) {
        for (const node of [1, 2]) {
          add(rpBackground(id, node), `${eventsFile}:rpBackground(${id}, ${node})`, true);
        }
      }
    }
    completed.add('biomes');
    if (rpBackground) completed.add('events');
  }

  const visitorsFile = 'src/content/tavern-visitors.js';
  const visitors = modules.get(visitorsFile);
  if (typeof visitors?.standingSprite === 'function' && Array.isArray(visitors.TAVERN_VISITORS)) {
    for (const visitor of visitors.TAVERN_VISITORS) {
      add(visitors.standingSprite(visitor), `${visitorsFile}:standingSprite(${visitor.id})`, true);
    }
    completed.add('standing');
  }

  if (modules.get('src/content/gal-npc-portraits.js')?.GAL_NPC_PORTRAITS) completed.add('gal');
  if (modules.get('src/audio/sfx.js')?.SFX) completed.add('sfx');
  for (const { id, location } of creatures) add(`assets/${id}.glb`, location, true);
  if (creatures.length) completed.add('creatures');

  return {
    contentModules: moduleFiles.filter(
      ({ file }) => file.startsWith('src/content/') && modules.has(file),
    ).length,
    completed,
  };
}

async function collectContainers(root, assetPaths, issues, skipped) {
  const edges = new Map();
  const svgIds = new Map();
  let svgFiles = 0;
  let glbFiles = 0;
  for (const file of assetPaths) {
    const ext = extname(file).toLowerCase();
    if (ext !== '.svg' && ext !== '.glb') continue;
    if (ext === '.svg') svgFiles++;
    else glbFiles++;

    const references = [];
    edges.set(file, references);
    const add = (value, location) => {
      const entry = localReference(value, location, 'container', {
        base: posix.dirname(file),
        owner: file,
        mode: 'container',
      });
      if (entry.skipped) skipped[entry.skipped]++;
      if (entry.path) references.push(entry);
    };
    try {
      const bytes = await readFile(join(root, file));
      if (ext === '.svg') {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        const locate = locator(text, file);
        svgIds.set(
          file,
          svgDocument(text, (url, offset) => add(url, locate(offset))),
        );
      } else {
        glbDocument(bytes, (url, field) => add(url, `${file}:${field}`));
      }
    } catch (error) {
      issues.push(issue(ext === '.svg' ? 'malformed-svg' : 'malformed-glb', file, error.message));
    }
  }
  return { edges, svgIds, svgFiles, glbFiles };
}

function svgFragmentIssue(reference, svgIds) {
  const { fragment, path, location } = reference;
  if (!fragment || !svgIds.has(path) || /^svgView\(/.test(fragment)) return null;
  if (svgIds.get(path).has(fragment)) return null;
  return issue('missing-svg-fragment', location, `${path}#${fragment}`);
}

function reachableAssets(roots, edges, inventory) {
  const assets = new Set();
  const references = [...roots];
  for (let i = 0; i < references.length; i++) {
    const { path, error } = references[i];
    if (error || !inventory.exact.has(path) || assets.has(path)) continue;
    assets.add(path);
    for (const reference of edges.get(path) ?? []) references.push(reference);
  }
  return { assets, references };
}

export async function auditAssets({ root = DEFAULT_ROOT } = {}) {
  const project = resolve(root);
  const issues = [];
  const runtime = [];
  const supporting = [];
  const catalog = [];
  const dynamics = [];
  const creatures = [];
  const previews = [];
  const skipped = { remote: 0, data: 0 };
  const assetPaths = [];
  const sources = [];
  const rules = reviewedRules();
  const excluded = new Set(['node_modules', '.git', 'dist', 'coverage', '.venv', 'venv']);
  const entries = await readDirectory(project, '', issues);

  function source(file, kind) {
    if (file.startsWith('tests/topology/') || /^tests\/content-topology.*\.test\.js$/.test(file))
      return;
    if (!SOURCE_FILE.test(file) || !kind) return;
    sources.push({ file, kind: CATALOG_FILE.test(file) ? 'catalog' : kind });
  }

  for (const entry of entries) {
    const name = entry.name;
    if (entry.isFile()) {
      source(name, rootSourceKind(name));
    } else if (entry.isDirectory() && /^assets$/i.test(name)) {
      const files = await listFiles(project, name, issues);
      assetPaths.push(...files);
      for (const file of files) {
        if (CATALOG_FILE.test(file)) source(file, 'catalog');
      }
    } else if (entry.isDirectory() && /^(?:src|styles|tests?|tools?|server|scripts)$/.test(name)) {
      const kind = name === 'src' || name === 'styles' ? 'runtime' : 'supporting';
      for (const file of await listFiles(project, name, issues, excluded)) source(file, kind);
    }
  }

  sources.sort((a, b) => compare(a.file, b.file));
  assetPaths.sort(compare);
  const inventory = inventoryIndex(assetPaths);

  for (const { file, kind } of sources) {
    try {
      const result = sourceReferences(
        await readFile(join(project, file), 'utf8'),
        file,
        kind,
        rules,
      );
      const target = kind === 'supporting' ? supporting : kind === 'catalog' ? catalog : runtime;
      for (const reference of result.references) target.push(reference);
      for (const entry of result.dynamic)
        dynamics.push(
          kind === 'runtime' ? entry : { ...entry, domain: null, status: 'supporting' },
        );
      for (const entry of result.creatures) creatures.push(entry);
      skipped.remote += result.skipped.remote;
      skipped.data += result.skipped.data;
    } catch (error) {
      const location = error.lineNumber ? `${file}:${error.lineNumber}:${error.column}` : file;
      issues.push(issue('source', location, error.message));
    }
  }

  const { contentModules, completed } = await collectDomains(
    project,
    sources,
    runtime,
    previews,
    creatures,
    issues,
    skipped,
  );
  for (const preview of previews) {
    if (inventory.exact.has(preview.path) || inventory.folded.has(preview.path.toLowerCase())) {
      runtime.push(preview);
    } else {
      issues.push(
        issue('preview-fallback', preview.location, `${preview.path} → ${preview.fallback}`),
      );
    }
  }
  const dynamic = ordered(
    dynamics.map(({ location, expression, status, domain }) => ({
      location,
      expression,
      status: domain && !completed.has(domain) ? 'unresolved' : status,
    })),
    ['location', 'expression', 'status'],
  );
  const unresolved = dynamic.filter(({ status }) => status === 'unresolved');
  for (const { location, expression } of unresolved) {
    issues.push(issue('unresolved-dynamic', location, expression));
  }

  const { edges, svgIds, svgFiles, glbFiles } = await collectContainers(
    project,
    assetPaths,
    issues,
    skipped,
  );
  const missing = new Set();
  const caseMismatches = new Set();
  function validate(reference, isCatalog = false) {
    const problem = pathIssue(reference, inventory, isCatalog ? 'catalog-' : '');
    if (problem) {
      issues.push(problem);
      if (problem.code === 'asset.missing') missing.add(reference.path);
      if (
        problem.code === 'asset.case-mismatch' ||
        problem.code === 'asset.catalog-case-mismatch'
      ) {
        caseMismatches.add(reference.path);
      }
    } else if (!isCatalog) {
      const symbolProblem = svgFragmentIssue(reference, svgIds);
      if (symbolProblem) issues.push(symbolProblem);
    }
  }

  for (const reference of runtime) validate(reference);
  for (const references of edges.values()) {
    for (const reference of references) validate(reference);
  }
  for (const reference of catalog) validate(reference, true);

  const siblingEvidence = await collectSiblingAssetEvidence(project);
  supporting.push(...siblingEvidence.references);
  const reachable = reachableAssets(runtime, edges, inventory);
  const orphans = assetPaths.filter((path) => !reachable.assets.has(path));
  const supportReachable = reachableAssets(supporting, edges, inventory);
  const supportOnlyAssets = orphans.filter((path) => supportReachable.assets.has(path));
  const unreferencedAssets = orphans.filter((path) => !supportReachable.assets.has(path));
  const orphanMedia = orphans.filter((path) => MEDIA.test(path));
  const orphanMetadata = orphans.filter((path) => !MEDIA.test(path));
  return {
    issues: ordered(issues, ['code', 'location', 'detail']),
    stats: {
      scannedFiles: sources.length + siblingEvidence.sources.length,
      runtimeAndDemoSources: sources.length,
      siblingSupportingSources: siblingEvidence.sources.length,
      contentModules,
      totalAssets: assetPaths.length,
      requiredPaths: new Set(
        reachable.references.filter(({ error }) => !error).map(({ path }) => path),
      ).size,
      missingPaths: missing.size,
      caseMismatches: caseMismatches.size,
      orphanAssets: orphans.length,
      orphanMedia: orphanMedia.length,
      orphanMetadata: orphanMetadata.length,
      supportOnlyAssets: supportOnlyAssets.length,
      unreferencedAssets: unreferencedAssets.length,
      dynamicExpressions: dynamic.length,
      unresolvedDynamicExpressions: unresolved.length,
      svgFiles,
      glbFiles,
      skippedRemoteUrls: skipped.remote,
      skippedDataUrls: skipped.data,
    },
    orphans,
    runtimeOrphans: orphans,
    orphanMedia,
    orphanMetadata,
    supportOnlyAssets,
    unreferencedAssets,
    references: publicReferences(reachable.references),
    supportingReferences: publicReferences(supporting),
    supportingScanRoots: siblingEvidence.roots,
    supportingUnresolved: siblingEvidence.unresolved,
    dynamic,
  };
}
