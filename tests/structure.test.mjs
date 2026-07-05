import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import test from 'node:test';

test('package metadata exposes source modules and declarations', async () => {
  const pkg = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.name, 'ddys-lark-bot');
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.exports['.'].import, './src/index.js');
  assert.equal(pkg.exports['.'].types, './index.d.ts');
  assert.equal(pkg.exports['./lark-api'].import, './src/lark-api.js');
  assert.equal(pkg.exports['./security'].import, './src/security.js');
  assert.equal(pkg.scripts.test.includes('node --test'), true);
});

test('examples wire Cloudflare Worker and Node entry points', async () => {
  const worker = await fs.readFile(new URL('../examples/basic-worker/src/index.js', import.meta.url), 'utf8');
  const node = await fs.readFile(new URL('../examples/basic-node/src/server.js', import.meta.url), 'utf8');
  const workerConfig = await fs.readFile(new URL('../examples/basic-worker/wrangler.jsonc', import.meta.url), 'utf8');
  assert.equal(worker.includes('createDdysLarkBot'), true);
  assert.equal(node.includes('createServer'), true);
  assert.equal(node.includes('duplex'), true);
  assert.equal(workerConfig.includes('"compatibility_date": "2026-07-05"'), true);
  assert.equal(workerConfig.includes('"DDYS_LARK_EVENTS_PATH": "/lark/events"'), true);
});
