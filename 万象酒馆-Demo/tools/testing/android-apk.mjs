import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import {
  access,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { userInfo } from 'node:os';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = fileURLToPath(new URL('../..', import.meta.url)).replace(/[\\/]$/, '');
const TARGET_PACKAGE = 'app.wanxiang.tavern';
const TARGET_SDK = 35;
const SYSTEM_IMAGE_REL = path.join('system-images', 'android-35', 'google_apis', 'x86_64');
const SYSTEM_IMAGE_PACKAGE = 'system-images;android-35;google_apis;x86_64';
const DEVICE_SPEC = '1080x2280,440dpi,2G,api35 x86_64';
const DEFAULT_APK_REL = path.join(
  'native',
  'android',
  'build',
  'outputs',
  'apk',
  'debug',
  'WanxiangTavern-debug.apk',
);
const EXISTING_AVD_NAME = 'Wanxiang_QA_API35';
const EXISTING_AVD_DIR_REL = path.join(
  '.runtime',
  'native',
  'toolchains',
  'android-qa',
  'avd',
  EXISTING_AVD_NAME + '.avd',
);
const EXISTING_AVD_INI_REL = path.join(
  '.runtime',
  'native',
  'toolchains',
  'android-qa',
  'avd',
  EXISTING_AVD_NAME + '.ini',
);
const PROJECT_SDK_REL = path.join('.runtime', 'native', 'toolchains', 'android-qa', 'sdk');
const PRISTINE_DATA_MARKERS = [
  'userdata.img',
  'userdata.img.qcow2',
  path.join('data', 'empty_data_disk'),
];
const MAX_CAPTURE = 64 * 1024;
const ADB_TIMEOUT_MS = 120_000;
const EMULATOR_BOOT_TIMEOUT_MS = 300_000;
const UI_TIMEOUT_MS = 60_000;
const REPORT_SUBTREE_REL = path.join('.runtime', 'tests');

function nowIso() {
  return new Date().toISOString();
}

function redact(text) {
  if (typeof text !== 'string') return text;
  return text
    .replace(/([A-Za-z]:\\[^\s"']+)/g, '<path>')
    .replace(/(\/[^\s"']+)/g, '<path>')
    .replace(/\b[0-9a-f]{8,}\b/gi, '<hex>');
}

function truncate(text) {
  if (typeof text !== 'string') return text;
  if (text.length <= MAX_CAPTURE) return text;
  return text.slice(0, MAX_CAPTURE) + `\n…[truncated ${text.length - MAX_CAPTURE} chars]`;
}

function decodeXmlEntities(value) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, '&');
}

function parseBounds(raw) {
  const match = /^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$/.exec(raw || '');
  if (!match) return null;
  const [x1, y1, x2, y2] = match.slice(1).map(Number);
  return { x1, y1, x2, y2, width: x2 - x1, height: y2 - y1 };
}

function parseUiNodes(xml) {
  const nodes = [];
  const nodeRe = /<node\b([^>]*?)\/?>/g;
  let match;
  while ((match = nodeRe.exec(xml))) {
    const attrs = {};
    const attrRe = /([\w:-]+)="([^"]*)"/g;
    let attr;
    while ((attr = attrRe.exec(match[1]))) {
      attrs[attr[1]] = decodeXmlEntities(attr[2]);
    }
    nodes.push({
      text: attrs.text || '',
      contentDesc: attrs['content-desc'] || '',
      resourceId: attrs['resource-id'] || '',
      package: attrs.package || '',
      bounds: attrs.bounds || '',
      clickable: attrs.clickable || '',
      enabled: attrs.enabled || '',
      visibleToUser: attrs['visible-to-user'] || '',
      raw: attrs,
    });
  }
  return nodes;
}

function centerOf(bounds) {
  return {
    x: Math.round((bounds.x1 + bounds.x2) / 2),
    y: Math.round((bounds.y1 + bounds.y2) / 2),
  };
}

function intersects(a, b) {
  const x1 = Math.max(a.x1, b.x1);
  const y1 = Math.max(a.y1, b.y1);
  const x2 = Math.min(a.x2, b.x2);
  const y2 = Math.min(a.y2, b.y2);
  if (x2 <= x1 || y2 <= y1) return 0;
  return (x2 - x1) * (y2 - y1);
}

function area(bounds) {
  return Math.max(0, bounds.width) * Math.max(0, bounds.height);
}

function includesBounds(outer, inner) {
  return (
    outer.x1 <= inner.x1 && outer.y1 <= inner.y1 && outer.x2 >= inner.x2 && outer.y2 >= inner.y2
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pathExists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function lstatSafe(target) {
  try {
    return await lstat(target);
  } catch {
    return null;
  }
}

async function isInside(parent, child) {
  const parentReal = await realpath(parent).catch(() => path.resolve(parent));
  const childReal = await realpath(child).catch(() => path.resolve(child));
  const rel = path.relative(parentReal, childReal);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

async function assertNoSymlinkChain(root, target) {
  const rootResolved = path.resolve(root);
  const targetResolved = path.resolve(target);
  const rel = path.relative(rootResolved, targetResolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`路径不在允许子树内: ${targetResolved}`);
  }
  const segments = rel === '' ? [] : rel.split(path.sep);
  let current = rootResolved;
  const rootInfo = await lstatSafe(current);
  if (!rootInfo) throw new Error(`根路径不存在: ${current}`);
  if (rootInfo.isSymbolicLink()) throw new Error(`根路径是 symlink: ${current}`);
  for (const segment of segments) {
    current = path.join(current, segment);
    const info = await lstatSafe(current);
    if (!info) break;
    if (info.isSymbolicLink()) {
      throw new Error(`路径链含 symlink/junction: ${current}`);
    }
  }
}

async function resolveReportRunDir(outputDir) {
  const subtreeRoot = path.join(PROJECT_ROOT, REPORT_SUBTREE_REL);
  await mkdir(subtreeRoot, { recursive: true });
  const subtreeReal = await realpath(subtreeRoot);
  const requested = outputDir ? path.resolve(outputDir) : subtreeRoot;
  const lexicalRel = path.relative(path.resolve(subtreeRoot), requested);
  if (
    lexicalRel === '..' ||
    lexicalRel.startsWith(`..${path.sep}`) ||
    path.isAbsolute(lexicalRel)
  ) {
    throw new Error(`outputDir 必须位于 ${subtreeRoot} 之下`);
  }
  await assertNoSymlinkChain(subtreeRoot, requested);
  await mkdir(requested, { recursive: true });
  const requestedReal = await realpath(requested);
  const realRel = path.relative(subtreeReal, requestedReal);
  if (realRel === '..' || realRel.startsWith(`..${path.sep}`) || path.isAbsolute(realRel)) {
    throw new Error(`outputDir 必须位于 ${subtreeRoot} 之下`);
  }
  await assertNoSymlinkChain(subtreeRoot, requestedReal);
  const runName = `run-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomBytes(4).toString('hex')}`;
  const runDir = path.join(requestedReal, runName);
  await mkdir(runDir, { recursive: false });
  await assertNoSymlinkChain(subtreeRoot, runDir);
  return runDir;
}

function makeReport(outputDir) {
  return {
    schema: 'android-apk-report/v1',
    createdAt: nowIso(),
    status: 'running',
    phase: 'init',
    outputDir,
    deviceSpec: DEVICE_SPEC,
    scopedDimensions: 'simulator-only; physical-device-unverified',
    limitations: [
      '触控审核基于 accessibility bounds 代理，不是精准 hit testing。',
      '独立 ADB 端口和 AVD 不隔离 Windows 用户密钥/USB 自动枚举。',
      '未验证色彩、屏幕阅读器、真实设备行为。',
      '未调用任何真实 AI 接口，未读写真实存档。',
      '运行前必须处于隔离 Windows Profile、Sandbox 或 VM 中并禁用/断开实体设备；否则不要运行此范围。仅使用随机临时 AVD，不触碰用户既有 AVD。',
    ],
    environment: {
      platform: process.platform,
      node: process.version,
      projectRoot: PROJECT_ROOT,
    },
    sdk: { candidates: [], selected: null, checks: [] },
    apk: null,
    adb: { server: null, commands: [] },
    emulator: null,
    device: null,
    ui: { steps: [], boundsFindings: [], reentry: null, memory: null },
    artifacts: [],
    errors: [],
  };
}

async function writeReport(outputDir, report) {
  const reportPath = path.join(outputDir, 'android-apk-report.json');
  await mkdir(outputDir, { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
  return reportPath;
}

async function fail(outputDir, report, phase, message, extra = {}) {
  report.status = 'failed';
  report.phase = phase;
  report.finishedAt = nowIso();
  Object.assign(report, extra);
  report.errors.push({ phase, message, at: nowIso() });
  const reportPath = await writeReport(outputDir, report);
  const error = new Error(`${message} (report: ${reportPath})`);
  error.reportPath = reportPath;
  throw error;
}

function sdkCandidates() {
  const list = [];
  const push = (label, value) => {
    if (value) list.push({ label, path: path.resolve(value) });
  };
  push('ANDROID_HOME', process.env.ANDROID_HOME);
  push('ANDROID_SDK_ROOT', process.env.ANDROID_SDK_ROOT);
  if (process.env.LOCALAPPDATA) {
    push('LOCALAPPDATA/Android/Sdk', path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk'));
  }
  push('C:/Android/Sdk', 'C:/Android/Sdk');
  push('D:/Android/Sdk', 'D:/Android/Sdk');
  push(
    'project .runtime/native/toolchains/android-qa/sdk',
    path.join(PROJECT_ROOT, PROJECT_SDK_REL),
  );
  return list;
}

async function findCmdlineToolsVersion(sdkDir) {
  const base = path.join(sdkDir, 'cmdline-tools');
  const latest = path.join(base, 'latest', 'bin', 'avdmanager.bat');
  if (await pathExists(latest)) return { version: 'latest', avdmanager: latest };
  let entries;
  try {
    entries = await readdir(base, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === 'latest') continue;
    const candidate = path.join(base, entry.name, 'bin', 'avdmanager.bat');
    if (await pathExists(candidate)) return { version: entry.name, avdmanager: candidate };
  }
  return null;
}

async function findBuildToolsAapt(sdkDir) {
  const base = path.join(sdkDir, 'build-tools');
  let entries;
  try {
    entries = await readdir(base, { withFileTypes: true });
  } catch {
    return null;
  }
  const versions = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  for (const version of versions) {
    const candidate = path.join(base, version, 'aapt.exe');
    if (await pathExists(candidate)) return { version, aapt: candidate };
  }
  return null;
}

async function inspectSdk(sdkDir) {
  const checks = [];
  const record = async (name, target) => {
    const exists = await pathExists(target);
    checks.push({ name, path: target, exists });
    return exists;
  };
  const adb = path.join(sdkDir, 'platform-tools', 'adb.exe');
  const emulator = path.join(sdkDir, 'emulator', 'emulator.exe');
  const adbOk = await record('platform-tools/adb.exe', adb);
  const emulatorOk = await record('emulator/emulator.exe', emulator);
  const buildTools = await findBuildToolsAapt(sdkDir);
  checks.push({
    name: 'build-tools/*/aapt.exe',
    path: buildTools ? buildTools.aapt : path.join(sdkDir, 'build-tools'),
    exists: Boolean(buildTools),
    version: buildTools ? buildTools.version : null,
  });
  const cmdline = await findCmdlineToolsVersion(sdkDir);
  checks.push({
    name: 'cmdline-tools/(latest|version)/bin/avdmanager.bat',
    path: cmdline ? cmdline.avdmanager : path.join(sdkDir, 'cmdline-tools'),
    exists: Boolean(cmdline),
    version: cmdline ? cmdline.version : null,
  });
  const systemImageDir = path.join(sdkDir, SYSTEM_IMAGE_REL);
  const systemImg = path.join(systemImageDir, 'system.img');
  const systemOk = await record(
    'system-images/android-35/google_apis/x86_64/system.img',
    systemImg,
  );
  const complete = adbOk && emulatorOk && Boolean(buildTools) && Boolean(cmdline) && systemOk;
  return {
    sdkDir,
    complete,
    adb: adbOk ? adb : null,
    emulator: emulatorOk ? emulator : null,
    aapt: buildTools ? buildTools.aapt : null,
    avdmanager: cmdline ? cmdline.avdmanager : null,
    systemImageDir,
    checks,
  };
}

async function selectSdk(report) {
  const candidates = sdkCandidates();
  report.sdk.candidates = candidates.map((c) => ({ label: c.label, path: c.path }));
  for (const candidate of candidates) {
    const exists = await pathExists(candidate.path);
    if (!exists) {
      report.sdk.checks.push({ label: candidate.label, path: candidate.path, exists: false });
      continue;
    }
    const inspected = await inspectSdk(candidate.path);
    report.sdk.checks.push({ label: candidate.label, ...inspected });
    if (inspected.complete && !report.sdk.selected) {
      report.sdk.selected = { label: candidate.label, ...inspected };
    }
  }
  return report.sdk.selected;
}

async function checkPristineSeed(sdkDir) {
  const systemImageDir = path.join(sdkDir, SYSTEM_IMAGE_REL);
  const results = [];
  for (const name of PRISTINE_DATA_MARKERS) {
    const target = path.join(systemImageDir, name);
    const info = await lstatSafe(target);
    if (!info) {
      results.push({ name, exists: false, size: null });
      continue;
    }
    if (info.isSymbolicLink()) {
      results.push({ name, exists: true, size: null, symlink: true });
      continue;
    }
    await assertNoSymlinkChain(systemImageDir, target);
    results.push({ name, exists: info.isFile(), size: info.size });
  }
  const hasSeed = results.some((r) => r.exists && !r.symlink && r.size > 0);
  return { systemImageDir, results, hasSeed };
}

async function readPackageVersion() {
  const raw = await readFile(path.join(PROJECT_ROOT, 'package.json'), 'utf8');
  const parsed = JSON.parse(raw);
  return parsed.version;
}

async function sha256File(filePath) {
  const hash = createHash('sha256');
  const handle = await import('node:fs').then((m) => m.promises.open(filePath, 'r'));
  try {
    const buffer = Buffer.alloc(1024 * 1024);
    let position = 0;
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
      if (bytesRead <= 0) break;
      hash.update(buffer.subarray(0, bytesRead));
      position += bytesRead;
    }
  } finally {
    await handle.close();
  }
  return hash.digest('hex');
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve) => {
    const startedAt = nowIso();
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const binary = Boolean(options.binary);
    const stdoutChunks = [];
    let stdoutText = '';
    let stderr = '';
    let timedOut = false;
    const timer = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          try {
            child.kill();
          } catch {
            /* ignore */
          }
        }, options.timeoutMs)
      : null;
    child.stdout.on('data', (chunk) => {
      if (binary) {
        stdoutChunks.push(chunk);
      } else {
        stdoutText += chunk.toString('utf8');
      }
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    const finish = (code, signal, spawnError) => {
      if (timer) clearTimeout(timer);
      const stdout = binary ? Buffer.concat(stdoutChunks) : stdoutText;
      resolve({
        command,
        args,
        startedAt,
        finishedAt: nowIso(),
        code,
        signal,
        stdout,
        stderr: spawnError ? stderr + '\n' + spawnError : stderr,
        timedOut,
        spawnError: spawnError || null,
      });
    };
    child.on('error', (error) => finish(null, null, error.message));
    child.on('close', (code, signal) => finish(code, signal, null));
  });
}

function adbEnv(baseEnv, port, privateHome, sdkDir) {
  return {
    ...baseEnv,
    ANDROID_HOME: sdkDir,
    ANDROID_SDK_ROOT: sdkDir,
    ANDROID_ADB_SERVER_PORT: String(port),
    ADB_VENDOR_KEYS: '',
    ADB_MDNS_AUTO_CONNECT: '0',
    HOME: privateHome,
    USERPROFILE: privateHome,
    ANDROID_USER_HOME: path.join(privateHome, 'android-user'),
    ANDROID_EMULATOR_HOME: path.join(privateHome, 'android-emulator'),
    ANDROID_AVD_HOME: path.join(privateHome, 'android-avd'),
  };
}

async function findFreePort() {
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const port = 20000 + Math.floor(Math.random() * 45000);
    const free = await new Promise((resolve) => {
      const server = createServer();
      server.once('error', () => resolve(false));
      server.listen({ host: '127.0.0.1', port, exclusive: true }, () => {
        server.close(() => resolve(true));
      });
    });
    if (free) return port;
  }
  throw new Error('无法找到空闲 loopback 端口');
}

async function startAdbServer(sdk, report, privateHome) {
  const port = await findFreePort();
  const env = adbEnv(process.env, port, privateHome, sdk.sdkDir);
  const child = spawn(
    sdk.adb,
    [
      '-P',
      String(port),
      '-L',
      `tcp:127.0.0.1:${port}`,
      '--one-device',
      'wanxiang-qa-no-usb-' + randomBytes(16).toString('hex'),
      'server',
      'nodaemon',
    ],
    {
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString('utf8');
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString('utf8');
  });
  const server = {
    port,
    pid: child.pid,
    child,
    env,
    stdout: () => stdout,
    stderr: () => stderr,
    exitCode: null,
  };
  child.on('exit', (code) => {
    server.exitCode = code;
  });
  report.adb.server = {
    port,
    pid: child.pid,
    host: '127.0.0.1',
    isolatedHome: privateHome,
    sdkDir: sdk.sdkDir,
  };
  await sleep(1500);
  if (server.exitCode !== null) {
    throw new Error(`隔离 adb server 提前退出 code=${server.exitCode} stderr=${truncate(stderr)}`);
  }
  return server;
}

function assertAdbRouting(server, args, targetSerial) {
  const serialIndex = args.indexOf('-s');
  if (serialIndex >= 0) {
    const serial = args[serialIndex + 1];
    if (!targetSerial) {
      throw new Error(`目标 emulator 尚未启动，拒绝 adb -s ${redact(serial)}`);
    }
    if (serial !== targetSerial) {
      throw new Error(`拒绝 adb -s ${redact(serial)}，仅允许目标 ${redact(targetSerial)}`);
    }
    return;
  }
  const first = args[0];
  if (first !== 'devices') {
    throw new Error(`无 -s 的 adb 命令仅允许 devices，收到 ${redact(first)}`);
  }
}

async function adbCommand(sdk, server, args, report, options = {}) {
  assertAdbRouting(server, args, options.targetSerial || null);
  const fullArgs = ['-H', '127.0.0.1', '-P', String(server.port), ...args];
  const result = await runProcess(sdk.adb, fullArgs, {
    env: server.env,
    timeoutMs: options.timeoutMs ?? ADB_TIMEOUT_MS,
    binary: Boolean(options.binary),
  });
  const isBinary = Boolean(options.binary);
  const entry = {
    args: fullArgs,
    code: result.code,
    signal: result.signal,
    timedOut: result.timedOut,
    stdout: isBinary ? `<binary ${result.stdout.length} bytes>` : truncate(result.stdout),
    stderr: truncate(result.stderr),
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
  };
  report.adb.commands.push(entry);
  if (options.allowFailure) return result;
  if (result.code !== 0) {
    throw new Error(
      `adb ${args.join(' ')} 失败 code=${result.code} stderr=${truncate(result.stderr)}`,
    );
  }
  return result;
}

async function listDevices(sdk, server, report) {
  const result = await adbCommand(sdk, server, ['devices'], report);
  const lines = result.stdout
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.startsWith('List'));
  const devices = lines.map((line) => {
    const [serial, state] = line.trim().split(/\s+/);
    return { serial, state };
  });
  return devices;
}

async function ensureEmptyInventory(sdk, server, report) {
  const devices = await listDevices(sdk, server, report);
  if (devices.length > 0) {
    report.device = {
      unexpected: devices.map((d) => ({ serial: redact(d.serial), state: d.state })),
    };
    throw new Error(`隔离 adb inventory 非空，发现 ${devices.length} 个设备`);
  }
}

async function aaptBadging(sdk, apkPath, report) {
  // Keep the parent directory out of aapt's Windows path argument.
  const cwd = path.dirname(apkPath);
  const args = ['dump', 'badging', path.basename(apkPath)];
  const result = await runProcess(sdk.aapt, args, { cwd, timeoutMs: 60_000 });
  report.apk = report.apk || {};
  report.apk.badging = {
    command: sdk.aapt,
    args,
    cwd,
    code: result.code,
    stdout: truncate(result.stdout),
    stderr: truncate(result.stderr),
  };
  if (result.code !== 0) {
    throw new Error(`aapt dump badging 失败 code=${result.code}`);
  }
  const packageMatch = /package: name='([^']+)'/.exec(result.stdout);
  const versionMatch = /versionName='([^']+)'/.exec(result.stdout);
  const versionCodeMatch = /versionCode='([^']+)'/.exec(result.stdout);
  return {
    packageName: packageMatch ? packageMatch[1] : null,
    versionName: versionMatch ? versionMatch[1] : null,
    versionCode: versionCodeMatch ? versionCodeMatch[1] : null,
  };
}

async function createAvd(sdk, report, outputDir, privateHome, runName) {
  const avdRoot = path.join(outputDir, 'avd');
  const avdPath = path.join(avdRoot, `${runName}.avd`);
  const avdIni = path.join(avdRoot, `${runName}.ini`);
  const existingAvdDir = path.join(PROJECT_ROOT, EXISTING_AVD_DIR_REL);
  const existingAvdIni = path.join(PROJECT_ROOT, EXISTING_AVD_INI_REL);
  if (path.resolve(avdPath) === path.resolve(existingAvdDir)) {
    throw new Error('拒绝使用现有 AVD 路径');
  }
  if (path.resolve(avdIni) === path.resolve(existingAvdIni)) {
    throw new Error('拒绝使用现有 AVD ini 路径');
  }
  if (runName === EXISTING_AVD_NAME) {
    throw new Error('拒绝使用现有 AVD 名称');
  }
  const avdRootInfo = await lstatSafe(avdRoot);
  if (avdRootInfo && avdRootInfo.isSymbolicLink()) {
    throw new Error('AVD 根目录是 symlink，拒绝');
  }
  await mkdir(avdRoot, { recursive: true });
  if (!(await isInside(outputDir, avdRoot))) {
    throw new Error('AVD 根目录不在 outputDir 内');
  }
  if (await pathExists(avdPath)) throw new Error('目标 AVD 目录已存在');
  if (await pathExists(avdIni)) throw new Error('目标 AVD ini 已存在');

  const env = {
    ...adbEnv(process.env, 0, privateHome, sdk.sdkDir),
    ANDROID_AVD_HOME: avdRoot,
  };
  const args = [
    'create',
    'avd',
    '--name',
    runName,
    '--package',
    SYSTEM_IMAGE_PACKAGE,
    '--device',
    'pixel_4',
    '--path',
    avdPath,
  ];
  // Use the same Java entrypoint as the SDK's .bat, without cmd.exe path quoting.
  const tools = path.dirname(path.dirname(sdk.avdmanager));
  const java = env.JAVA_HOME ? path.join(env.JAVA_HOME, 'bin', 'java.exe') : 'java.exe';
  const cli = [
    '-Dcom.android.sdkmanager.toolsdir=' + tools,
    '-classpath',
    path.join(tools, 'lib', 'avdmanager-classpath.jar'),
    'com.android.sdklib.tool.AvdManagerCli',
    ...args,
  ];
  const result = await runProcess(java, cli, { env, timeoutMs: 120_000 });
  report.emulator = report.emulator || {};
  report.emulator.createAvd = {
    command: java,
    args: cli,
    code: result.code,
    stdout: truncate(result.stdout),
    stderr: truncate(result.stderr),
    avdPath,
    avdIni,
  };
  if (result.code !== 0) {
    throw new Error(`avdmanager create avd 失败 code=${result.code}`);
  }
  const avdPathReal = await realpath(avdPath);
  if (!(await isInside(outputDir, avdPathReal))) {
    throw new Error('新建 AVD 路径 realpath 不在 outputDir 内');
  }
  const iniInfo = await lstatSafe(avdIni);
  if (!iniInfo || iniInfo.isSymbolicLink()) {
    throw new Error('新建 AVD ini 缺失或为 symlink');
  }
  const iniContent = await readFile(avdIni, 'utf8');
  const pathLine = /^path=(.+)$/m.exec(iniContent);
  if (!pathLine) throw new Error('新建 AVD ini 缺少 path 行');
  const iniPathReal = await realpath(pathLine[1].trim());
  if (iniPathReal !== avdPathReal) {
    throw new Error('新建 AVD ini path 与预期不一致');
  }
  return { avdRoot, avdPath, avdIni, runName };
}

async function rewriteAvdConfig(avdPath, report) {
  const configPath = path.join(avdPath, 'config.ini');
  const info = await lstatSafe(configPath);
  if (!info || info.isSymbolicLink()) {
    throw new Error('新建 AVD config.ini 缺失或为 symlink');
  }
  const raw = await readFile(configPath, 'utf8');
  const overrides = {
    'hw.lcd.width': '1080',
    'hw.lcd.height': '2280',
    'hw.lcd.density': '440',
    'hw.ramSize': '2G',
    'hw.gpu.enabled': 'no',
    'hw.gpu.mode': 'swiftshader_indirect',
    'hw.keyboard': 'yes',
    'disk.dataPartition.size': '2G',
    'userdata.useQcow2': 'no',
  };
  const lines = raw.split(/\r?\n/);
  const seen = new Set();
  const out = lines.map((line) => {
    const eq = line.indexOf('=');
    if (eq < 0) return line;
    const key = line.slice(0, eq).trim();
    if (Object.prototype.hasOwnProperty.call(overrides, key)) {
      seen.add(key);
      return `${key}=${overrides[key]}`;
    }
    return line;
  });
  for (const [key, value] of Object.entries(overrides)) {
    if (!seen.has(key)) out.push(`${key}=${value}`);
  }
  await writeFile(configPath, out.join('\n'), 'utf8');
  report.emulator.configRewrite = { configPath, overrides };
}

async function startEmulator(sdk, report, outputDir, privateHome, avd, adbServer) {
  const consolePort = await findFreePort();
  const adbPort = await findFreePort();
  if (consolePort === adbPort) throw new Error('console/adb 端口冲突');
  const serial = `emulator-${consolePort}`;
  const dataDir = path.join(outputDir, 'private', 'data');
  await mkdir(dataDir, { recursive: true });
  if (!(await isInside(outputDir, dataDir))) {
    throw new Error('emulator datadir 不在 outputDir 内');
  }
  const env = {
    ...adbEnv(process.env, adbServer.port, privateHome, sdk.sdkDir),
    ANDROID_AVD_HOME: avd.avdRoot,
  };
  const args = [
    '-avd',
    avd.runName,
    '-ports',
    `${consolePort},${adbPort}`,
    '-datadir',
    dataDir,
    '-adb-path',
    sdk.adb,
    '-no-snapshot-load',
    '-no-snapshot-save',
    '-no-snapshot',
    '-no-boot-anim',
    '-no-audio',
    '-no-window',
    '-gpu',
    'swiftshader_indirect',
    '-accel',
    'off',
  ];
  const child = spawn(sdk.emulator, args, {
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString('utf8');
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString('utf8');
  });
  const emulator = {
    serial,
    consolePort,
    adbPort,
    pid: child.pid,
    child,
    args,
    dataDir,
    stdout: () => stdout,
    stderr: () => stderr,
    exitCode: null,
  };
  child.on('exit', (code) => {
    emulator.exitCode = code;
  });
  report.emulator = report.emulator || {};
  report.emulator.start = {
    command: sdk.emulator,
    serial,
    consolePort,
    adbPort,
    pid: child.pid,
    args,
    dataDir,
    env: {
      ANDROID_HOME: env.ANDROID_HOME,
      ANDROID_SDK_ROOT: env.ANDROID_SDK_ROOT,
      ANDROID_ADB_SERVER_PORT: env.ANDROID_ADB_SERVER_PORT,
      ANDROID_AVD_HOME: env.ANDROID_AVD_HOME,
      ANDROID_USER_HOME: env.ANDROID_USER_HOME,
      ANDROID_EMULATOR_HOME: env.ANDROID_EMULATOR_HOME,
      HOME: env.HOME,
      USERPROFILE: env.USERPROFILE,
    },
  };
  return emulator;
}

async function waitForBoot(sdk, server, emulator, report) {
  const deadline = Date.now() + EMULATOR_BOOT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (emulator.exitCode !== null) {
      throw new Error(`emulator 提前退出 code=${emulator.exitCode}`);
    }
    const devices = await listDevices(sdk, server, report);
    if (devices.length > 1) {
      throw new Error(`发现多个设备，拒绝继续: ${devices.map((d) => redact(d.serial)).join(',')}`);
    }
    if (devices.length === 1) {
      const [only] = devices;
      if (only.serial !== emulator.serial) {
        throw new Error(`设备 serial 不匹配: ${redact(only.serial)}`);
      }
      if (only.state === 'device') {
        const boot = await adbCommand(
          sdk,
          server,
          ['-s', emulator.serial, 'shell', 'getprop', 'sys.boot_completed'],
          report,
          { allowFailure: true, targetSerial: emulator.serial },
        );
        if (boot.code === 0 && boot.stdout.trim() === '1') return;
      }
    }
    await sleep(3000);
  }
  throw new Error('emulator 启动超时');
}

async function verifyGuestIdentity(sdk, server, emulator, report) {
  const props = {};
  for (const key of [
    'ro.boot.qemu.avd_name',
    'ro.build.version.sdk',
    'ro.kernel.qemu',
    'ro.product.model',
  ]) {
    const result = await adbCommand(
      sdk,
      server,
      ['-s', emulator.serial, 'shell', 'getprop', key],
      report,
      { targetSerial: emulator.serial },
    );
    props[key] = result.stdout.trim();
  }
  report.device = { serial: emulator.serial, props };
  if (props['ro.boot.qemu.avd_name'] !== emulator.avdName) {
    throw new Error(`guest AVD 名称不匹配: ${props['ro.boot.qemu.avd_name']}`);
  }
  if (props['ro.build.version.sdk'] !== String(TARGET_SDK)) {
    throw new Error(`guest SDK 不匹配: ${props['ro.build.version.sdk']}`);
  }
  if (props['ro.kernel.qemu'] !== '1') {
    throw new Error('guest 不是 qemu 模拟器');
  }
}

async function installApk(sdk, server, emulator, apkPath, report) {
  const result = await adbCommand(
    sdk,
    server,
    ['-s', emulator.serial, 'install', apkPath],
    report,
    { timeoutMs: 180_000, targetSerial: emulator.serial },
  );
  if (!/Success/.test(result.stdout)) {
    throw new Error(`APK 安装失败: ${truncate(result.stdout)}`);
  }
}

async function setOffline(sdk, server, emulator, report) {
  const serial = emulator.serial;
  const commands = [
    ['shell', 'svc', 'wifi', 'disable'],
    ['shell', 'svc', 'data', 'disable'],
    ['shell', 'settings', 'put', 'global', 'airplane_mode_on', '1'],
    [
      'shell',
      'am',
      'broadcast',
      '-a',
      'android.intent.action.AIRPLANE_MODE',
      '--ez',
      'state',
      'true',
    ],
  ];
  for (const args of commands) {
    await adbCommand(sdk, server, ['-s', serial, ...args], report, { targetSerial: serial });
  }
  const verify = await adbCommand(
    sdk,
    server,
    ['-s', serial, 'shell', 'settings', 'get', 'global', 'airplane_mode_on'],
    report,
    { targetSerial: serial },
  );
  if (verify.stdout.trim() !== '1') {
    throw new Error('airplane_mode_on 验证失败');
  }
}

async function getScreenSize(sdk, server, emulator, report) {
  const sizeResult = await adbCommand(
    sdk,
    server,
    ['-s', emulator.serial, 'shell', 'wm', 'size'],
    report,
    { targetSerial: emulator.serial },
  );
  const densityResult = await adbCommand(
    sdk,
    server,
    ['-s', emulator.serial, 'shell', 'wm', 'density'],
    report,
    { targetSerial: emulator.serial },
  );
  const sizeMatch =
    /^Override size:\s*(\d+)x(\d+)\s*$/im.exec(sizeResult.stdout) ||
    /^Physical size:\s*(\d+)x(\d+)\s*$/im.exec(sizeResult.stdout);
  const densityMatch =
    /^Override density:\s*(\d+)\s*$/im.exec(densityResult.stdout) ||
    /^Physical density:\s*(\d+)\s*$/im.exec(densityResult.stdout);
  if (!sizeMatch || !densityMatch) {
    throw new Error('无法读取屏幕尺寸/密度');
  }
  return {
    wmWidth: Number(sizeMatch[1]),
    wmHeight: Number(sizeMatch[2]),
    density: Number(densityMatch[1]),
    rawSize: sizeResult.stdout.trim(),
    rawDensity: densityResult.stdout.trim(),
  };
}

async function dumpUi(sdk, server, emulator, report, label) {
  const dumpPath = '/sdcard/window.xml';
  await adbCommand(sdk, server, ['-s', emulator.serial, 'shell', 'rm', '-f', dumpPath], report, {
    targetSerial: emulator.serial,
  });
  const dump = await adbCommand(
    sdk,
    server,
    ['-s', emulator.serial, 'shell', 'uiautomator', 'dump', dumpPath],
    report,
    { allowFailure: true, targetSerial: emulator.serial },
  );
  const dumpOutput = `${dump.stdout}\n${dump.stderr}`.trim();
  if (
    dump.code !== 0 ||
    !/^UI hier(?:archy|chary) dumped to:\s*\/sdcard\/window\.xml\s*$/m.test(dumpOutput)
  ) {
    throw new Error(
      `拒绝解析 UI dump ${label}: uiautomator 未确认成功 (code=${dump.code}; ${truncate(dumpOutput) || '无输出'})`,
    );
  }

  const result = await adbCommand(
    sdk,
    server,
    ['-s', emulator.serial, 'exec-out', 'cat', dumpPath],
    report,
    { targetSerial: emulator.serial },
  );
  const xml = result.stdout;
  const document = xml.replace(/^\uFEFF/, '').trim();
  const hierarchy = /^(?:<\?xml\b[\s\S]*?\?>\s*)?<hierarchy\b[^>]*>([\s\S]*)<\/hierarchy>$/.exec(
    document,
  );
  const hierarchyTags = document.match(/<\/?hierarchy\b[^>]*>/g) || [];
  if (!hierarchy || hierarchyTags.length !== 2) {
    throw new Error(`拒绝解析 UI dump ${label}: XML 缺少有效的 hierarchy 根结构`);
  }

  const rootNode = /<node\b([^>]*)\/?>/.exec(hierarchy[1]);
  const packageMatch = rootNode && /\bpackage="([^"]+)"/.exec(rootNode[1]);
  if (!rootNode || !packageMatch || packageMatch[1] !== TARGET_PACKAGE) {
    throw new Error(`拒绝解析 UI dump ${label}: XML 根节点包名不是目标应用 ${TARGET_PACKAGE}`);
  }
  if (!(await hasTargetActivityResumed(sdk, server, emulator, report))) {
    throw new Error(`拒绝解析 UI dump ${label}: 目标 MainActivity 未处于前台`);
  }

  const artifactPath = path.join(report.outputDir, 'artifacts', `${label}.xml`);
  await mkdir(path.dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, xml, 'utf8');
  report.artifacts.push({ label, type: 'xml', path: artifactPath });
  return { xml, artifactPath };
}

function parsePngHeader(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 24) return null;
  const signature = buffer.subarray(0, 8);
  const expected = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!signature.equals(expected)) return null;
  const chunkType = buffer.subarray(12, 16).toString('ascii');
  if (chunkType !== 'IHDR') return null;
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return { width, height };
}

async function screenshot(sdk, server, emulator, report, label) {
  const result = await adbCommand(
    sdk,
    server,
    ['-s', emulator.serial, 'exec-out', 'screencap', '-p'],
    report,
    { targetSerial: emulator.serial, binary: true },
  );
  const buffer = result.stdout;
  const header = parsePngHeader(buffer);
  if (!header) {
    throw new Error(`截图 ${label} 不是有效 PNG`);
  }
  const artifactPath = path.join(report.outputDir, 'artifacts', `${label}.png`);
  await mkdir(path.dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, buffer);
  report.artifacts.push({
    label,
    type: 'png',
    path: artifactPath,
    width: header.width,
    height: header.height,
    bytes: buffer.length,
  });
  return { artifactPath, width: header.width, height: header.height };
}

function findNodeByText(nodes, text) {
  const candidates = nodes.filter((node) => {
    if (node.package !== TARGET_PACKAGE || node.clickable !== 'true') return false;
    if (node.enabled === 'false') return false;
    if (node.visibleToUser === 'false') return false;
    const bounds = parseBounds(node.bounds);
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return false;
    const label = node.text || node.contentDesc || '';
    return label.length > 0;
  });
  const exact = candidates.filter(
    (node) => (node.text || '') === text || (node.contentDesc || '') === text,
  );
  if (exact.length) return exact.length === 1 ? exact[0] : null;
  const matching = candidates.filter(
    (node) => (node.text || '').includes(text) || (node.contentDesc || '').includes(text),
  );
  return matching.length === 1 ? matching[0] : null;
}

async function tapNode(sdk, server, emulator, node, report, label) {
  const bounds = parseBounds(node.bounds);
  if (!bounds) throw new Error(`节点 ${label} 缺少 bounds`);
  const { x, y } = centerOf(bounds);
  const result = await adbCommand(
    sdk,
    server,
    ['-s', emulator.serial, 'shell', 'input', 'tap', String(x), String(y)],
    report,
    { targetSerial: emulator.serial },
  );
  report.ui.steps.push({
    label,
    action: 'tap',
    point: { x, y },
    nodeText: node.text || '',
    nodeContentDesc: node.contentDesc || '',
    bounds,
    result: { code: result.code, stdout: truncate(result.stdout), stderr: truncate(result.stderr) },
  });
}

async function waitForNode(sdk, server, emulator, report, label, text, timeoutMs = UI_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const lastDump = await dumpUi(sdk, server, emulator, report, `${label}-wait`);
    const nodes = parseUiNodes(lastDump.xml);
    const node = findNodeByText(nodes, text);
    if (node) return { node, nodes, dump: lastDump };
    await sleep(1000);
  }
  throw new Error(`等待 UI 元素超时: ${text} (${label})`);
}

async function waitForAnyNode(
  sdk,
  server,
  emulator,
  report,
  label,
  texts,
  timeoutMs = UI_TIMEOUT_MS,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const lastDump = await dumpUi(sdk, server, emulator, report, `${label}-wait`);
    const nodes = parseUiNodes(lastDump.xml);
    for (const text of texts) {
      const node = findNodeByText(nodes, text);
      if (node) return { node, nodes, dump: lastDump, text };
    }
    await sleep(1000);
  }
  throw new Error(`等待 UI 元素超时: ${texts.join(' 或 ')} (${label})`);
}

function collectClickable(nodes, screen, targetPackage) {
  const findings = [];
  const clickable = [];
  let foreignCount = 0;
  let targetCount = 0;
  for (const node of nodes) {
    const pkg = node.package || '';
    if (pkg !== targetPackage) {
      foreignCount += 1;
      continue;
    }
    targetCount += 1;
    const bounds = parseBounds(node.bounds);
    if (node.clickable === 'true') {
      if (!bounds) {
        findings.push({
          kind: 'missing-bounds',
          text: node.text || '',
          contentDesc: node.contentDesc || '',
          resourceId: node.resourceId,
        });
        continue;
      }
      if (bounds.width <= 0 || bounds.height <= 0) {
        findings.push({
          kind: 'invalid-size',
          bounds,
          text: node.text || '',
          contentDesc: node.contentDesc || '',
        });
        continue;
      }
      if (bounds.x1 < 0 || bounds.y1 < 0 || bounds.x2 > screen.width || bounds.y2 > screen.height) {
        findings.push({
          kind: 'out-of-screen',
          bounds,
          text: node.text || '',
          contentDesc: node.contentDesc || '',
          screen,
        });
      }
      if (node.visibleToUser === 'false') {
        findings.push({
          kind: 'hidden-clickable',
          bounds,
          text: node.text || '',
          contentDesc: node.contentDesc || '',
        });
      }
      clickable.push({ node, bounds });
    }
  }
  for (let i = 0; i < clickable.length; i += 1) {
    for (let j = i + 1; j < clickable.length; j += 1) {
      const a = clickable[i];
      const b = clickable[j];
      if (includesBounds(a.bounds, b.bounds) || includesBounds(b.bounds, a.bounds)) continue;
      const overlap = intersects(a.bounds, b.bounds);
      if (overlap <= 0) continue;
      const smaller = Math.min(area(a.bounds), area(b.bounds));
      if (smaller > 0 && overlap / smaller > 0.5) {
        findings.push({
          kind: 'ax-overlap',
          note: 'AX边界重叠代理，非精准 hit testing',
          a: { text: a.node.text || '', contentDesc: a.node.contentDesc || '', bounds: a.bounds },
          b: { text: b.node.text || '', contentDesc: b.node.contentDesc || '', bounds: b.bounds },
          overlapRatio: overlap / smaller,
        });
      }
    }
  }
  return {
    findings,
    clickableCount: clickable.length,
    targetElementCount: targetCount,
    foreignElementCount: foreignCount,
  };
}

async function memorySample(sdk, server, emulator, report, label) {
  const result = await adbCommand(
    sdk,
    server,
    ['-s', emulator.serial, 'shell', 'dumpsys', 'meminfo', TARGET_PACKAGE],
    report,
    { targetSerial: emulator.serial },
  );
  const match = /^\s*TOTAL PSS:\s*(\d+)\b/m.exec(result.stdout);
  if (!match) throw new Error(`无法解析 meminfo (${label})`);
  return { label, totalPssKb: Number(match[1]) };
}

async function hasTargetActivityResumed(sdk, server, emulator, report) {
  const result = await adbCommand(
    sdk,
    server,
    ['-s', emulator.serial, 'shell', 'dumpsys', 'activity', 'activities'],
    report,
    { allowFailure: true, targetSerial: emulator.serial },
  );
  return (
    result.code === 0 &&
    result.stdout
      .split(/\r?\n/)
      .some(
        (line) =>
          /(?:mResumedActivity|topResumedActivity|ResumedActivity)\s*[:=]/.test(line) &&
          line.includes(TARGET_PACKAGE + '/.MainActivity'),
      )
  );
}

async function waitForResumed(sdk, server, emulator, report) {
  const deadline = Date.now() + UI_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await hasTargetActivityResumed(sdk, server, emulator, report)) {
      return;
    }
    await sleep(1000);
  }
  throw new Error('主 Activity 未进入 resumed');
}

async function runUiTest(sdk, server, emulator, report) {
  const wmInfo = await getScreenSize(sdk, server, emulator, report);
  report.ui.wm = wmInfo;
  await waitForResumed(sdk, server, emulator, report);

  const start = await waitForNode(sdk, server, emulator, report, 'step-01-start', '开启旅程');
  const first = start.dump;
  const firstShot = await screenshot(sdk, server, emulator, report, 'step-01-start');
  const screen = { width: firstShot.width, height: firstShot.height };
  report.ui.screen = { ...screen, source: 'screenshot-pixels', wm: wmInfo };
  await tapNode(sdk, server, emulator, start.node, report, '开启旅程');

  const wizard = await waitForNode(sdk, server, emulator, report, 'step-02-wizard', '自由配置');
  const secondShot = await screenshot(sdk, server, emulator, report, 'step-02-wizard');
  if (secondShot.width !== screen.width || secondShot.height !== screen.height) {
    throw new Error('wizard 截图尺寸与初始不一致');
  }
  await tapNode(sdk, server, emulator, wizard.node, report, '自由配置');

  const settings = await waitForNode(sdk, server, emulator, report, 'step-03-settings', '关闭设置');
  const thirdShot = await screenshot(sdk, server, emulator, report, 'step-03-settings');
  if (thirdShot.width !== screen.width || thirdShot.height !== screen.height) {
    throw new Error('settings 截图尺寸与初始不一致');
  }
  const beforeMemory = await memorySample(sdk, server, emulator, report, 'before-panel');
  await tapNode(sdk, server, emulator, settings.node, report, '关闭设置');

  const afterClose = await waitForNode(
    sdk,
    server,
    emulator,
    report,
    'step-04-after-close',
    '开启旅程',
  );
  const fourthShot = await screenshot(sdk, server, emulator, report, 'step-04-after-close');
  if (fourthShot.width !== screen.width || fourthShot.height !== screen.height) {
    throw new Error('after-close 截图尺寸与初始不一致');
  }
  const settingsEntry = findNodeByText(afterClose.nodes, '设置');
  const journeyEntry = findNodeByText(afterClose.nodes, '开启旅程');
  const reentry = settingsEntry || journeyEntry;
  if (!reentry) throw new Error('关闭后未找到“设置”或“开启旅程”入口');
  await tapNode(sdk, server, emulator, reentry, report, 'reentry');

  const reentryState = await waitForAnyNode(sdk, server, emulator, report, 'step-05-reentry', [
    '自由配置',
    '关闭设置',
  ]);
  const fifthShot = await screenshot(sdk, server, emulator, report, 'step-05-reentry');
  if (fifthShot.width !== screen.width || fifthShot.height !== screen.height) {
    throw new Error('reentry 截图尺寸与初始不一致');
  }
  const freeAgain = findNodeByText(reentryState.nodes, '自由配置');
  const reentryMode = freeAgain ? 'wizard' : 'settings-direct';
  if (freeAgain) await tapNode(sdk, server, emulator, freeAgain, report, '自由配置-二次');

  const reentrySettings = freeAgain
    ? await waitForNode(sdk, server, emulator, report, 'step-06-reentry-settings', '关闭设置')
    : reentryState;
  const sixthShot = await screenshot(sdk, server, emulator, report, 'step-06-reentry-settings');
  if (sixthShot.width !== screen.width || sixthShot.height !== screen.height) {
    throw new Error('reentry-settings 截图尺寸与初始不一致');
  }
  const afterMemory = await memorySample(sdk, server, emulator, report, 'after-reentry');
  await tapNode(sdk, server, emulator, reentrySettings.node, report, '关闭设置-二次');
  await waitForNode(sdk, server, emulator, report, 'step-07-closed', '开启旅程');
  const closedMemory = await memorySample(sdk, server, emulator, report, 'after-second-close');

  const boundsFindings = [];
  for (const [label, xml] of [
    ['step-01-start', first.xml],
    ['step-02-wizard', wizard.dump.xml],
    ['step-03-settings', settings.dump.xml],
    ['step-04-after-close', afterClose.dump.xml],
    ['step-05-reentry', reentryState.dump.xml],
    ['step-06-reentry-settings', reentrySettings.dump.xml],
  ]) {
    const nodes = parseUiNodes(xml);
    const collected = collectClickable(nodes, screen, TARGET_PACKAGE);
    boundsFindings.push({ label, screen, ...collected });
  }
  report.ui.steps.push(
    { label: 'start', xml: first.artifactPath, screenshot: firstShot.artifactPath },
    { label: 'wizard', xml: wizard.dump.artifactPath, screenshot: secondShot.artifactPath },
    { label: 'settings', xml: settings.dump.artifactPath, screenshot: thirdShot.artifactPath },
    {
      label: 'after-close',
      xml: afterClose.dump.artifactPath,
      screenshot: fourthShot.artifactPath,
    },
    { label: 'reentry', xml: reentryState.dump.artifactPath, screenshot: fifthShot.artifactPath },
    {
      label: 'reentry-settings',
      xml: reentrySettings.dump.artifactPath,
      screenshot: sixthShot.artifactPath,
    },
  );
  report.ui.boundsFindings = boundsFindings;
  report.ui.reentry = {
    firstClose: true,
    secondClose: true,
    entry: settingsEntry ? '设置' : '开启旅程',
    mode: reentryMode,
    note:
      reentryMode === 'settings-direct'
        ? '第二次未出现“自由配置”，已直接重新打开 settings，并确认可再次关闭'
        : '第二次经“自由配置”进入 settings，并确认可再次关闭',
  };
  report.ui.memory = {
    before: beforeMemory,
    after: afterMemory,
    closed: closedMemory,
    scope: 'app-process PSS snapshots; not a renderer or long-session leak test',
    deltaKb: afterMemory.totalPssKb - beforeMemory.totalPssKb,
  };
  const anyFinding = boundsFindings.some((f) => f.findings.length > 0);
  if (anyFinding) {
    throw new Error('bounds 检查发现遮挡/越界问题');
  }
}

async function stopChildren(emulator, adbServer, report) {
  const stopErrors = [];
  if (emulator && emulator.child && emulator.exitCode === null) {
    try {
      emulator.child.kill();
      report.emulator = report.emulator || {};
      report.emulator.stop = { pid: emulator.pid, signal: 'SIGTERM', requestedAt: nowIso() };
    } catch (error) {
      stopErrors.push({ target: 'emulator', pid: emulator.pid, message: error.message });
    }
  }
  if (adbServer && adbServer.child && adbServer.exitCode === null) {
    try {
      adbServer.child.kill();
      report.adb.server = report.adb.server || {};
      report.adb.server.stop = { pid: adbServer.pid, signal: 'SIGTERM', requestedAt: nowIso() };
    } catch (error) {
      stopErrors.push({ target: 'adb-server', pid: adbServer.pid, message: error.message });
    }
  }
  await sleep(1500);
  if (emulator) {
    report.emulator = report.emulator || {};
    report.emulator.stop = {
      ...(report.emulator.stop || {}),
      exitCode: emulator.exitCode,
      stdout: truncate(emulator.stdout()),
      stderr: truncate(emulator.stderr()),
    };
  }
  if (adbServer) {
    report.adb.server = report.adb.server || {};
    report.adb.server.stop = {
      ...(report.adb.server.stop || {}),
      exitCode: adbServer.exitCode,
      stdout: truncate(adbServer.stdout()),
      stderr: truncate(adbServer.stderr()),
    };
  }
  if (stopErrors.length > 0) {
    report.status = 'failed';
    report.errors.push({
      phase: 'stop',
      message: '无法结束子进程',
      details: stopErrors,
      at: nowIso(),
    });
  }
}

export async function androidApkChecks({ outputDir } = {}) {
  const runDir = await resolveReportRunDir(outputDir);
  const report = makeReport(runDir);
  let adbServer = null;
  let emulator = null;
  let reportPath;
  try {
    report.phase = 'sdk';
    const sdk = await selectSdk(report);
    if (!sdk) {
      await fail(runDir, report, 'sdk', '未找到完整 Android SDK');
    }

    report.phase = 'apk';
    const apkPath = process.env.ANDROID_TEST_APK
      ? path.resolve(process.env.ANDROID_TEST_APK)
      : path.join(PROJECT_ROOT, DEFAULT_APK_REL);
    if (!(await pathExists(apkPath))) {
      await fail(runDir, report, 'apk', `APK 不存在: ${apkPath}`);
    }
    const packageVersion = await readPackageVersion();
    const badging = await aaptBadging(sdk, apkPath, report);
    const apkHash = await sha256File(apkPath);
    const apkStat = await stat(apkPath);
    report.apk.path = apkPath;
    report.apk.size = apkStat.size;
    report.apk.sha256 = apkHash;
    report.apk.packageVersion = packageVersion;
    report.apk.badgingSummary = badging;
    if (badging.packageName !== TARGET_PACKAGE) {
      await fail(runDir, report, 'apk', `APK package 不匹配: ${badging.packageName}`);
    }
    if (badging.versionName !== packageVersion) {
      await fail(
        runDir,
        report,
        'apk',
        `APK 版本 ${badging.versionName} 与 package.json ${packageVersion} 不一致；请先 npm run build 然后 npm run build:android 后重跑`,
      );
    }

    report.phase = 'pristine-seed';
    const seed = await checkPristineSeed(sdk.sdkDir);
    report.sdk.pristineSeed = seed;
    if (!seed.hasSeed) {
      await fail(
        runDir,
        report,
        'pristine-seed',
        'SDK 镜像缺原厂 userdata 镜像或 data/empty_data_disk 标记，不能创建干净 AVD',
      );
    }

    report.phase = 'host-isolation';
    // Windows adb reads keys from the OS account profile, not the child HOME overrides.
    const dedicated = process.env.DEMO_ANDROID_QA_DEDICATED_PROFILE;
    if (
      !dedicated ||
      !path.isAbsolute(dedicated) ||
      path.relative(userInfo().homedir, dedicated) !== ''
    ) {
      await fail(
        runDir,
        report,
        'host-isolation',
        '未在已确认的专用系统账户/虚拟机中运行；未启动 ADB、模拟器或安装 APK。',
      );
    }
    report.phase = 'adb-server';
    const privateHome = path.join(runDir, 'private', 'home');
    await mkdir(privateHome, { recursive: true });
    if (!(await isInside(runDir, privateHome))) {
      await fail(runDir, report, 'adb-server', '私有 HOME 不在 runDir 内');
    }
    adbServer = await startAdbServer(sdk, report, privateHome);
    await ensureEmptyInventory(sdk, adbServer, report);

    report.phase = 'avd';
    const runName = `Wanxiang_QA_${randomBytes(4).toString('hex')}`;
    const avd = await createAvd(sdk, report, runDir, privateHome, runName);
    await rewriteAvdConfig(avd.avdPath, report);

    report.phase = 'emulator';
    emulator = await startEmulator(sdk, report, runDir, privateHome, avd, adbServer);
    emulator.avdName = runName;
    await waitForBoot(sdk, adbServer, emulator, report);
    await verifyGuestIdentity(sdk, adbServer, emulator, report);

    report.phase = 'install';
    await installApk(sdk, adbServer, emulator, apkPath, report);

    report.phase = 'offline';
    await setOffline(sdk, adbServer, emulator, report);

    report.phase = 'launch';
    await adbCommand(
      sdk,
      adbServer,
      ['-s', emulator.serial, 'shell', 'am', 'start', '-n', `${TARGET_PACKAGE}/.MainActivity`],
      report,
      { targetSerial: emulator.serial },
    );

    report.phase = 'ui';
    await runUiTest(sdk, adbServer, emulator, report);

    report.status = 'passed';
    report.phase = 'done';
  } catch (error) {
    if (report.status !== 'failed') {
      report.status = 'failed';
      report.errors.push({ phase: report.phase, message: error.message, at: nowIso() });
    }
    report.failure = { phase: report.phase, message: error.message };
  } finally {
    await stopChildren(emulator, adbServer, report);
    report.finishedAt = nowIso();
    reportPath = await writeReport(runDir, report);
  }
  if (report.status !== 'passed') {
    const error = new Error(
      `${report.failure ? report.failure.message : 'androidApkChecks 失败'} (report: ${reportPath})`,
    );
    error.reportPath = reportPath;
    throw error;
  }
  return { status: 'passed', reportPath, outputDir: runDir };
}
