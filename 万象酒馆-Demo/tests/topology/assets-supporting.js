import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const EXCLUDED_DIRS = new Set([
  '.git',
  'node_modules',
  '.venv',
  'venv',
  '__pycache__',
  'backups',
  '.runtime',
]);

const CODE_EXTENSIONS = new Set(['.py', '.mjs', '.js', '.cjs', '.ps1', '.cmd', '.bat']);

const PROJECT_MARKER = '万象酒馆-Demo';
const ASSETS_SEGMENT = 'assets';

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function compareCodePoints(a, b) {
  const ai = Array.from(a);
  const bi = Array.from(b);
  const len = Math.min(ai.length, bi.length);
  for (let i = 0; i < len; i += 1) {
    const ca = ai[i].codePointAt(0);
    const cb = bi[i].codePointAt(0);
    if (ca !== cb) return ca - cb;
  }
  return ai.length - bi.length;
}

function sortUniqueByCodePoints(items, keyFn) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  result.sort((a, b) => compareCodePoints(keyFn(a), keyFn(b)));
  return result;
}

function isExcludedDirName(name) {
  return EXCLUDED_DIRS.has(name);
}

function hasCodeExtension(name) {
  return CODE_EXTENSIONS.has(path.extname(name).toLowerCase());
}

async function listDirSafe(dir) {
  return readdir(dir, { withFileTypes: true });
}

async function collectCodeFilesRecursive(dir, out) {
  const entries = await listDirSafe(dir);
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (isExcludedDirName(entry.name)) continue;
      await collectCodeFilesRecursive(full, out);
    } else if (entry.isFile()) {
      if (hasCodeExtension(entry.name)) out.push(full);
    }
  }
}

async function collectCandidateFiles(projectRoot) {
  const files = [];
  const roots = ['..'];
  const parent = path.dirname(projectRoot);

  if (parent && parent !== projectRoot) {
    const parentEntries = await listDirSafe(parent);
    for (const entry of parentEntries) {
      const full = path.join(parent, entry.name);
      if (entry.isDirectory()) {
        if (isExcludedDirName(entry.name)) continue;
        if (!entry.name.includes('体素') && entry.name !== '建模工具') continue;
        roots.push(toPosix(path.relative(projectRoot, full)));
        await collectCodeFilesRecursive(full, files);
      } else if (entry.isFile()) {
        if (hasCodeExtension(entry.name)) files.push(full);
      }
    }
  }

  return { files, roots };
}

function stripLineComment(line, ext) {
  const lowerExt = ext.toLowerCase();
  if (lowerExt === '.cmd' || lowerExt === '.bat') {
    const trimmed = line.replace(/^\s+/, '');
    if (/^rem(\s|$)/i.test(trimmed)) return '';
  }

  let inSingle = false;
  let inDouble = false;
  let result = '';
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === '\\' && (inSingle || inDouble)) {
      result += ch;
      if (i + 1 < line.length) {
        result += line[i + 1];
        i += 1;
      }
      continue;
    }

    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      result += ch;
      continue;
    }

    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      result += ch;
      continue;
    }

    if (!inSingle && !inDouble) {
      if (ch === '#' && lowerExt === '.py') {
        break;
      }
      if (ch === '/' && next === '/') {
        const before = result;
        if (/https?:$/i.test(before)) {
          result += ch;
          continue;
        }
        break;
      }
    }

    result += ch;
  }
  return result;
}

function stripPythonTripleQuoteBlocks(content) {
  const lines = content.split(/\r?\n/);
  const out = [];
  let inTriple = false;
  let tripleChar = '';
  for (const line of lines) {
    if (!inTriple) {
      const single = line.indexOf("'''");
      const double = line.indexOf('"""');
      let idx = -1;
      let marker = '';
      if (single !== -1 && (double === -1 || single < double)) {
        idx = single;
        marker = "'''";
      } else if (double !== -1) {
        idx = double;
        marker = '"""';
      }
      if (idx === -1) {
        out.push(line);
        continue;
      }
      const after = line.indexOf(marker, idx + 3);
      if (after === -1) {
        inTriple = true;
        tripleChar = marker;
        out.push(line.slice(0, idx));
      } else {
        out.push(line.slice(0, idx) + line.slice(after + 3));
      }
    } else {
      const end = line.indexOf(tripleChar);
      if (end === -1) {
        out.push('');
      } else {
        inTriple = false;
        tripleChar = '';
        out.push(line.slice(end + 3));
      }
    }
  }
  return out;
}

function normalizeSlashes(value) {
  return value.replace(/\\/g, '/');
}

function hasInterpolation(value) {
  return /\$\{/.test(value) || /\{[^}]*\}/.test(value);
}

function hasAssetExtension(value) {
  const base = value.split('/').pop() || '';
  const dot = base.lastIndexOf('.');
  if (dot <= 0 || dot === base.length - 1) return false;
  const ext = base.slice(dot + 1);
  return /^[A-Za-z0-9]+$/.test(ext);
}

function extractQuotedStrings(line) {
  const results = [];
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === "'" || ch === '"') {
      const quote = ch;
      let j = i + 1;
      let value = '';
      let closed = false;
      while (j < line.length) {
        const c = line[j];
        if (c === '\\') {
          value += c;
          if (j + 1 < line.length) {
            value += line[j + 1];
            j += 2;
            continue;
          }
          j += 1;
          continue;
        }
        if (c === quote) {
          closed = true;
          break;
        }
        value += c;
        j += 1;
      }
      if (closed) {
        results.push({ value, quote, start: i, end: j });
        i = j + 1;
        continue;
      }
      i += 1;
      continue;
    }
    i += 1;
  }
  return results;
}

function mapProjectAssetsPath(rawValue, projectRoot) {
  const normalized = normalizeSlashes(rawValue);
  const markerIndex = normalized.indexOf(`${PROJECT_MARKER}/${ASSETS_SEGMENT}/`);
  if (markerIndex !== -1) {
    const afterMarker = normalized.slice(markerIndex + PROJECT_MARKER.length + 1);
    if (afterMarker.startsWith(`${ASSETS_SEGMENT}/`)) {
      const rel = afterMarker.slice(ASSETS_SEGMENT.length + 1);
      if (rel && hasAssetExtension(rel)) {
        return toPosix(path.join(projectRoot, ASSETS_SEGMENT, rel));
      }
    }
    return null;
  }
  return null;
}

function resolveAbsoluteAsset(rawValue, projectRoot) {
  const normalized = normalizeSlashes(rawValue);
  if (!path.isAbsolute(normalized)) return null;
  const assetsRoot = path.resolve(projectRoot, ASSETS_SEGMENT);
  const resolved = path.resolve(normalized);
  const rel = path.relative(assetsRoot, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  if (!rel || !hasAssetExtension(rel)) return null;
  return toPosix(resolved);
}

function resolveRelativeAsset(rawValue, sourceDir, projectRoot) {
  const normalized = normalizeSlashes(rawValue);
  if (path.isAbsolute(normalized)) return null;
  const assetsRoot = path.resolve(projectRoot, ASSETS_SEGMENT);
  const resolved = path.resolve(sourceDir, normalized);
  const rel = path.relative(assetsRoot, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  if (!rel || !hasAssetExtension(rel)) return null;
  return toPosix(resolved);
}

function extractPythonJoinChain(line) {
  const results = [];
  const regex = /([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^\n#]+)/g;
  let match;
  while ((match = regex.exec(line)) !== null) {
    const varName = match[1];
    const expr = match[2];
    if (!/^[A-Z][A-Z0-9_]*$/.test(varName)) continue;
    const shape = expr.replace(/'[^']*'|"[^"]*"/g, 'Q').trim();
    if (!/^[\w.()[\]]+(?:\s*\/\s*Q)+\s*$/.test(shape)) continue;
    const parts = [];
    const partRegex = /'([^']*)'|"([^"]*)"/g;
    let pm;
    while ((pm = partRegex.exec(expr)) !== null) {
      parts.push(pm[1] !== undefined ? pm[1] : pm[2]);
    }
    if (parts.length === 0) continue;
    const joined = parts.join('/');
    if (joined.includes(`${PROJECT_MARKER}/${ASSETS_SEGMENT}`)) {
      results.push({ varName, parts, expr });
    }
  }
  return results;
}

function extractPythonJoinUsage(line, confirmedBases) {
  const results = [];
  for (const [varName, baseParts] of confirmedBases.entries()) {
    const regex = new RegExp(`\\b${varName}\\s*/\\s*(['"])([^'"]+)\\1`, 'g');
    let match;
    while ((match = regex.exec(line)) !== null) {
      const literal = match[2];
      if (hasInterpolation(literal)) continue;
      results.push({ baseParts, literal });
    }
  }
  return results;
}

function extractJsPathJoin(line) {
  const results = [];
  const regex = /path\.join\s*\(([^)]*)\)/g;
  let match;
  while ((match = regex.exec(line)) !== null) {
    const args = match[1];
    const tokens = args.split(',').map((part) => part.trim());
    const markerToken = tokens.findIndex((part) => part.includes(PROJECT_MARKER));
    if (
      markerToken < 0 ||
      tokens.slice(markerToken).some((part) => !/^(['"`])[^'"`]*\1$/.test(part))
    )
      continue;
    const parts = [];
    const partRegex = /'([^']*)'|"([^"]*)"|`([^`]*)`/g;
    let pm;
    let hasNonLiteral = false;
    while ((pm = partRegex.exec(args)) !== null) {
      const value = pm[1] !== undefined ? pm[1] : pm[2] !== undefined ? pm[2] : pm[3];
      if (hasInterpolation(value)) {
        hasNonLiteral = true;
        break;
      }
      parts.push(value);
    }
    if (hasNonLiteral || parts.length === 0) continue;
    const joined = parts.join('/');
    if (joined.includes(`${PROJECT_MARKER}/${ASSETS_SEGMENT}`)) {
      results.push({ parts, joined });
    }
  }
  return results;
}

function lineHasAssetsExpression(line) {
  return /assets/i.test(line);
}

async function processFile(filePath, projectRoot, state) {
  const content = await readFile(filePath, 'utf8');

  const ext = path.extname(filePath).toLowerCase();
  const sourceDir = path.dirname(filePath);
  const relSource = toPosix(path.relative(projectRoot, filePath));

  let rawLines = content.split(/\r?\n/);
  if (ext === '.py') {
    rawLines = stripPythonTripleQuoteBlocks(content);
  }

  const confirmedBases = new Map();
  const baseAssignments = new Map();
  if (ext === '.py') {
    for (const rawLine of rawLines) {
      const line = stripLineComment(rawLine, ext);
      const assignment = /^\s*([A-Z][A-Z0-9_]*)\s*=(?!=)/.exec(line);
      if (assignment)
        baseAssignments.set(assignment[1], (baseAssignments.get(assignment[1]) || 0) + 1);
    }
    for (const rawLine of rawLines) {
      for (const assignment of extractPythonJoinChain(stripLineComment(rawLine, ext))) {
        if (baseAssignments.get(assignment.varName) === 1)
          confirmedBases.set(assignment.varName, assignment.parts);
      }
    }
  }

  for (let lineIndex = 0; lineIndex < rawLines.length; lineIndex += 1) {
    const originalLine = rawLines[lineIndex];
    const stripped = stripLineComment(originalLine, ext);
    if (!stripped.trim()) continue;
    const lineNumber = lineIndex + 1;
    const location = `${relSource}:${lineNumber}`;

    const quoted = extractQuotedStrings(stripped);
    for (const q of quoted) {
      const value = q.value;
      if (hasInterpolation(value)) {
        if (lineHasAssetsExpression(value) || lineHasAssetsExpression(stripped)) {
          state.unresolved.push({
            location,
            expression: value,
            reason: 'interpolated-path',
          });
        }
        continue;
      }

      const mapped = mapProjectAssetsPath(value, projectRoot);
      if (mapped) {
        state.references.push({ path: mapped, location, kind: 'build-source' });
        state.sources.push(relSource);
        state.roots.push(toPosix(path.join(projectRoot, ASSETS_SEGMENT)));
        continue;
      }

      const abs = resolveAbsoluteAsset(value, projectRoot);
      if (abs) {
        state.references.push({ path: abs, location, kind: 'build-source' });
        state.sources.push(relSource);
        state.roots.push(toPosix(path.join(projectRoot, ASSETS_SEGMENT)));
        continue;
      }

      const rel = resolveRelativeAsset(value, sourceDir, projectRoot);
      if (rel) {
        state.references.push({ path: rel, location, kind: 'build-source' });
        state.sources.push(relSource);
        state.roots.push(toPosix(path.join(projectRoot, ASSETS_SEGMENT)));
        continue;
      }

      if (lineHasAssetsExpression(value)) {
        state.unresolved.push({
          location,
          expression: value,
          reason: 'unresolved-assets-path',
        });
      }
    }

    if (ext === '.py') {
      const usages = extractPythonJoinUsage(stripped, confirmedBases);
      for (const usage of usages) {
        const baseJoined = usage.baseParts.join('/');
        if (!baseJoined.includes(`${PROJECT_MARKER}/${ASSETS_SEGMENT}`)) continue;
        const literal = usage.literal;
        if (hasInterpolation(literal)) {
          state.unresolved.push({
            location,
            expression: literal,
            reason: 'interpolated-path',
          });
          continue;
        }
        const rel = literal.replace(/^\/+/, '');
        if (!hasAssetExtension(rel)) continue;
        const full = mapProjectAssetsPath(`${baseJoined}/${rel}`, projectRoot);
        if (!full) continue;
        state.references.push({ path: full, location, kind: 'build-source' });
        state.sources.push(relSource);
        state.roots.push(toPosix(path.join(projectRoot, ASSETS_SEGMENT)));
      }
    }

    if (ext === '.js' || ext === '.mjs' || ext === '.cjs') {
      const joins = extractJsPathJoin(stripped);
      for (const join of joins) {
        const markerIndex = join.joined.indexOf(`${PROJECT_MARKER}/${ASSETS_SEGMENT}/`);
        if (markerIndex === -1) continue;
        const after = join.joined.slice(markerIndex + PROJECT_MARKER.length + 1);
        if (!after.startsWith(`${ASSETS_SEGMENT}/`)) continue;
        const rel = after.slice(ASSETS_SEGMENT.length + 1);
        if (!rel || !hasAssetExtension(rel)) continue;
        const full = toPosix(path.join(projectRoot, ASSETS_SEGMENT, rel));
        state.references.push({ path: full, location, kind: 'build-source' });
        state.sources.push(relSource);
        state.roots.push(toPosix(path.join(projectRoot, ASSETS_SEGMENT)));
      }
    }
  }
}

export async function collectSiblingAssetEvidence(projectRoot) {
  const state = {
    references: [],
    sources: [],
    roots: [],
    unresolved: [],
  };

  const { files, roots: scannedRoots } = await collectCandidateFiles(projectRoot);
  const sortedFiles = files.slice().sort((a, b) => compareCodePoints(toPosix(a), toPosix(b)));

  for (const file of sortedFiles) {
    await processFile(file, projectRoot, state);
  }

  const normalizedReferences = state.references.flatMap((reference) => {
    const relative = toPosix(path.relative(projectRoot, reference.path));
    return relative.startsWith('assets/') ? [{ ...reference, path: relative }] : [];
  });
  const references = sortUniqueByCodePoints(
    normalizedReferences,
    (r) => `${r.path}\u0000${r.location}\u0000${r.kind}`,
  );
  const sources = sortUniqueByCodePoints(
    sortedFiles.map((file) => toPosix(path.relative(projectRoot, file))),
    (s) => s,
  );
  const roots = sortUniqueByCodePoints(scannedRoots, (r) => r);
  const unresolved = sortUniqueByCodePoints(
    state.unresolved,
    (u) => `${u.location}\u0000${u.expression}\u0000${u.reason}`,
  );

  return { references, sources, roots, unresolved };
}
