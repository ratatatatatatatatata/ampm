import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test('compiled Vercel entry resolves JavaScript dependencies and runs without TypeScript sources', async (t) => {
  const output = await mkdtemp(join(tmpdir(), 'ampm-email-packaging-'));
  t.after(() => rm(output, { recursive: true, force: true }));
  const entry = 'api/process-order-notifications.ts';
  const config = JSON.parse(await readFile(join(root, 'vercel.json'), 'utf8'));
  assert.ok(config.functions[entry]);

  // Match @vercel/node's closest-config lookup and emitted import rewriting.
  const configPath = ts.findConfigFile(join(root, 'api'), ts.sys.fileExists);
  assert.equal(configPath, join(root, 'api/tsconfig.json'));
  const loaded = ts.readConfigFile(configPath, ts.sys.readFile);
  assert.equal(loaded.error, undefined);
  const parsed = ts.parseJsonConfigFileContent(loaded.config, ts.sys, dirname(configPath));
  const program = ts.createProgram([join(root, entry)], {
    ...parsed.options,
    rootDir: root, outDir: output, noEmit: false,
    rewriteRelativeImportExtensions: true,
  });
  const errors = ts.getPreEmitDiagnostics(program).filter((item) => item.category === ts.DiagnosticCategory.Error);
  assert.deepEqual(errors.map((item) => ts.flattenDiagnosticMessageText(item.messageText, '\n')), []);
  assert.equal(program.emit().emitSkipped, false);
  const compiledEntry = join(output, 'api/process-order-notifications.js');
  const source = await readFile(compiledEntry, 'utf8');
  assert.ok(source.includes('../server/order-notifications.js'));
  assert.ok(source.includes('../server/order-notification-store.js'));
  assert.equal(source.includes('.ts\''), false);
  assert.equal((await readdir(join(output, 'server'))).some((name) => name.endsWith('.ts')), false);
  await writeFile(join(output, 'package.json'), JSON.stringify({ type: 'module' }));
  await symlink(join(root, 'node_modules'), join(output, 'node_modules'), 'dir');

  const { createProcessOrderNotificationsHandler } = await import(pathToFileURL(compiledEntry).href);
  let accessed = false;
  const handler = createProcessOrderNotificationsHandler({
    env: (name) => ({ CRON_SECRET: 'packaging-test', AMPM_EMAIL_ENABLED: 'false' })[name],
    createStore: () => { accessed = true; throw new Error('Unexpected database access'); },
    fetchImpl: async () => { throw new Error('Unexpected network access'); },
  });
  const response = {
    code: 0, body: null,
    setHeader() {}, status(code) { this.code = code; return this; },
    json(body) { this.body = body; },
  };
  await handler({ method: 'GET', headers: { authorization: 'Bearer packaging-test' } }, response);
  assert.equal(response.code, 200);
  assert.deepEqual(response.body, { ok: true, paused: true, claimed: 0, accepted: 0, failed: 0 });
  assert.equal(accessed, false);
  await handler({ method: 'GET', headers: {} }, response);
  assert.equal(response.code, 401);
});
