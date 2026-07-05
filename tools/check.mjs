import { promises as fs } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const requiredFiles = [
  'README.md',
  'README.zh-CN.md',
  'LICENSE',
  '.gitignore',
  '.env.example',
  'package.json',
  'index.d.ts',
  'src/index.js',
  'src/config.js',
  'src/cache-store.js',
  'src/ddys-client.js',
  'src/lark-api.js',
  'src/format.js',
  'src/response.js',
  'src/security.js',
  'examples/basic-worker/package.json',
  'examples/basic-worker/wrangler.jsonc',
  'examples/basic-worker/src/index.js',
  'examples/basic-node/package.json',
  'examples/basic-node/src/server.js',
  'tests/structure.test.mjs',
  'tests/runtime.test.mjs',
  'tests/helpers.mjs',
  'tools/check.mjs',
  'tools/build-package.ps1'
];

for (const file of requiredFiles) await mustExist(file);
await checkEncoding();
await checkSyntax();
await checkPackage();
await checkRuntime();
await checkDocs();
await checkExamples();
await checkForbiddenFiles();
await checkForbiddenText();

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, files: (await listFiles(root)).length, package: 'ddys-lark-bot' }, null, 2));

async function checkSyntax() {
  for (const full of await listFiles(root)) {
    const rel = slash(path.relative(root, full));
    if (!/\.(js|mjs)$/i.test(rel)) continue;
    const result = spawnSync(process.execPath, ['--check', full], { stdio: 'inherit' });
    assert(result.status === 0, `${rel} failed node --check.`);
  }
}

async function checkPackage() {
  const pkg = JSON.parse(await read('package.json'));
  assert(pkg.name === 'ddys-lark-bot', 'package name mismatch.');
  assert(pkg.version === '0.1.2', 'package version mismatch.');
  assert(pkg.type === 'module', 'package must be ESM.');
  assert(pkg.exports?.['.']?.import === './src/index.js', 'package root export must point at source entry.');
  assert(pkg.exports?.['.']?.types === './index.d.ts', 'package root export must expose types.');
  assert(pkg.exports?.['./lark-api']?.import === './src/lark-api.js', 'package must expose Lark API helpers.');
  assert(pkg.exports?.['./security']?.import === './src/security.js', 'package must expose security helpers.');
  assert(pkg.scripts?.test?.includes('node --test'), 'test script must use Node test runner.');
  assert((await read('src/config.js')).includes(`VERSION = '${pkg.version}'`), 'runtime version must match package.json.');
  const buildScript = await read('tools/build-package.ps1');
  assert(buildScript.includes(`$Version = "${pkg.version}"`), 'build-package default version must match package.json.');
  assert(buildScript.includes('ddys-lark-bot-v{0}.zip'), 'build-package ZIP name must match package.');
  assert(buildScript.includes('Replace("\\", "/")'), 'build-package must write portable ZIP entry paths.');
}

async function checkRuntime() {
  const entry = await read('src/index.js');
  for (const fragment of [
    'createDdysLarkBot',
    'createLarkEventHandler',
    'handleLarkEvent',
    'handleLarkEventPayload',
    'verifyLarkRequest',
    'decodeLarkEventBody',
    'isLarkMessageEvent',
    'waitUntil',
    'process?.env',
    'replyMessage'
  ]) assert(entry.includes(fragment), `entry missing ${fragment}.`);

  const security = await read('src/security.js');
  for (const fragment of ['x-lark-signature', 'x-lark-request-timestamp', 'x-lark-request-nonce', 'SHA-256', 'AES-CBC', 'verification token', 'event_callback', 'isActorAllowed']) {
    assert(security.toLowerCase().includes(fragment.toLowerCase()), `security missing ${fragment}.`);
  }

  const format = await read('src/format.js');
  for (const fragment of ['im.message.receive_v1', 'interactive', 'lark_md', 'wide_screen_mode', 'parseLarkCommand', 'extractTextFromMessage', 'extractTextFromPostContent', 'clearcache']) {
    assert(format.includes(fragment), `format missing ${fragment}.`);
  }

  const config = await read('src/config.js');
  for (const fragment of ['DDYS_LARK_APP_ID', 'FEISHU_APP_ID', 'DDYS_LARK_VERIFICATION_TOKEN', 'DDYS_LARK_ENCRYPT_KEY', 'DDYS_LARK_ALLOWED_CHAT_IDS', 'DDYS_LARK_DEFER_REPLIES', 'parseIdSet']) {
    assert(config.includes(fragment), `config missing ${fragment}.`);
  }

  const api = await read('src/lark-api.js');
  for (const fragment of ['getTenantAccessToken', 'tenant_access_token', 'replyMessage', 'sendMessage', 'updateMessage', 'authorization']) {
    assert(api.includes(fragment), `Lark API helper missing ${fragment}.`);
  }

  const types = await read('index.d.ts');
  for (const fragment of ['DdysLarkConfig', 'createDdysLarkBot', 'handleLarkEvent', 'handleLarkEventPayload', 'verifyLarkRequest', 'decodeLarkEventBody', 'isLarkMessageEvent', 'extractTextFromPostContent', 'InteractionDeduper', 'replyMessage']) {
    assert(types.includes(fragment), `types missing ${fragment}.`);
  }
}

async function checkDocs() {
  const en = await read('README.md');
  const zh = await read('README.zh-CN.md');
  assert(en.includes('[中文](README.zh-CN.md)') && zh.includes('[English](README.md)'), 'READMEs must link to each other.');
  for (const fragment of ['ddys-lark-bot', 'X-Lark-Signature', 'X-Lark-Request-Timestamp', 'Encrypt Key', 'Verification Token', 'im.message.receive_v1', 'event_callback/message', 'post', 'message card', 'DDYS_LARK_APP_ID', 'DDYS_LARK_DEFER_REPLIES', 'FEISHU_APP_ID']) {
    assert(en.includes(fragment) && zh.includes(fragment), `READMEs missing ${fragment}.`);
  }
}

async function checkExamples() {
  const worker = await read('examples/basic-worker/src/index.js');
  assert(worker.includes('createDdysLarkBot'), 'Worker example must create DDYS Lark bot.');
  const workerConfig = JSON.parse(await read('examples/basic-worker/wrangler.jsonc'));
  assert(workerConfig.compatibility_date === '2026-07-05', 'Worker example must pin compatibility date.');
  assert(workerConfig.vars?.DDYS_LARK_EVENTS_PATH === '/lark/events', 'Worker example must set Lark events path.');
  const workerPkg = JSON.parse(await read('examples/basic-worker/package.json'));
  assert(workerPkg.dependencies?.['ddys-lark-bot'] === '^0.1.2', 'Worker example dependency must match package version.');
  const node = await read('examples/basic-node/src/server.js');
  assert(node.includes('createServer') && node.includes('duplex'), 'Node example must adapt incoming requests to Web Request.');
  const nodePkg = JSON.parse(await read('examples/basic-node/package.json'));
  assert(nodePkg.dependencies?.['ddys-lark-bot'] === '^0.1.2', 'Node example dependency must match package version.');
}

async function checkForbiddenFiles() {
  for (const full of await listFiles(root)) {
    const rel = slash(path.relative(root, full));
    assert(!/(^|\/)(node_modules|dist|coverage|package|\.wrangler)(\/|$)/.test(rel), `forbidden path: ${rel}`);
    assert(rel !== 'pnpm-lock.yaml' && rel !== 'package-lock.json' && rel !== 'yarn.lock', `forbidden lockfile: ${rel}`);
    assert(!/\.(log|bak|tmp|cache|tgz|zip)$/i.test(rel), `forbidden file: ${rel}`);
    assert(rel === '.env.example' || !/(^|\/)\.env(\.|$)/.test(rel), `forbidden env file: ${rel}`);
    assert(!/(^|\/)\.dev\.vars$/.test(rel), `forbidden local vars file: ${rel}`);
  }
}

async function checkForbiddenText() {
  const patterns = ['ghp_', 'github_pat_', 'npm_', '\uFFFD', 'replace-with-lark-app-secret'];
  for (const full of await listFiles(root)) {
    const rel = slash(path.relative(root, full));
    if (!isTextFile(rel) || rel === 'tools/check.mjs' || rel === '.env.example') continue;
    const text = await fs.readFile(full, 'utf8');
    for (const pattern of patterns) assert(!text.includes(pattern), `${rel} contains forbidden text pattern ${pattern}.`);
  }
}

async function checkEncoding() {
  for (const full of await listFiles(root)) {
    const rel = slash(path.relative(root, full));
    if (!isTextFile(rel)) continue;
    const buffer = await fs.readFile(full);
    assert(!(buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf), `${rel} has BOM.`);
    assert(!buffer.toString('utf8').includes('\uFFFD'), `${rel} has replacement char.`);
  }
}

async function mustExist(rel) {
  try {
    await fs.stat(path.join(root, rel));
  } catch {
    failures.push(`Missing required file: ${rel}`);
  }
}

async function read(rel) {
  return fs.readFile(path.join(root, rel), 'utf8');
}

async function listFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    if (['.git', 'node_modules', 'dist', 'coverage', 'package', '.wrangler'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await listFiles(full));
    else out.push(full);
  }
  return out;
}

function isTextFile(rel) {
  return /\.(js|mjs|json|jsonc|d\.ts|md|txt|ps1)$/i.test(rel) || rel === '.gitignore' || rel === 'LICENSE' || rel === '.env.example';
}

function slash(value) {
  return value.replace(/\\/g, '/');
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}
