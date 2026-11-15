import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(await readFile(path.join(root, 'public/catalog.json'), 'utf8'));
const missions = JSON.parse(await readFile(path.join(root, 'public/missions.json'), 'utf8'));
const farmIds = new Set(catalog.farms.map(farm => farm.id));
const missionIds = new Set(missions.map(mission => mission.id));
assert.equal(missions.length, 20);
for (const cow of catalog.cows) {
  assert(farmIds.has(cow.farmId));
  for (const id of cow.missions) assert(missionIds.has(id), `Missing mission ${id}`);
  await readFile(path.join(root, 'public', cow.photo));
}
for (const product of catalog.products) {
  assert(farmIds.has(product.farmId));
  assert(Number.isSafeInteger(product.price) && product.price >= 0);
  assert(Number.isSafeInteger(product.shipping) && product.shipping >= 0);
  if (!product.sample && catalog.mode === 'live') assert(/^https:\/\//.test(product.checkoutUrl), `Missing checkout URL ${product.id}`);
}
for (const file of ['public/app.js', 'src/worker.js', 'worker.js']) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}
const { default: worker } = await import(path.join(root, 'worker.js'));
for (const [url, type] of [['/', 'text/html'], ['/app.js', 'javascript'], ['/style.css', 'text/css'], ['/catalog.json', 'application/json'], ['/assets/cow-0.jpg', 'image/jpeg']]) {
  const response = await worker.fetch(new Request('https://test.invalid' + url));
  assert.equal(response.status, 200, url);
  assert(response.headers.get('Content-Type').includes(type));
  assert((await response.arrayBuffer()).byteLength > 0);
}
const head = await worker.fetch(new Request('https://test.invalid/assets/cow-0.jpg', { method: 'HEAD' }));
assert.equal((await head.text()).length, 0);
assert.equal((await worker.fetch(new Request('https://test.invalid/missing.js'))).status, 404);
const event = { type: 'shop_outbound', id: 'milk-set', variant: 'B' };
const eventRequest = (body, origin = 'https://test.invalid') => new Request('https://test.invalid/api/events', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
assert.equal((await worker.fetch(eventRequest(event))).status, 202);
assert.equal((await worker.fetch(eventRequest(event, 'https://other.invalid'))).status, 403);
assert.equal((await worker.fetch(eventRequest({ ...event, type: 'purchase' }))).status, 400);
let boundValues;
const DB = { prepare: () => ({ bind: (...values) => { boundValues = values; return { run: async () => ({ success: true }) }; } }) };
assert.equal((await worker.fetch(eventRequest(event), { DB })).status, 201);
assert.deepEqual(boundValues, ['shop_outbound', 'milk-set', 'B']);
assert.equal((await worker.fetch(eventRequest({ ...event, id: 'x'.repeat(2000) }))).status, 413);
console.log('Passed content integrity, syntax, bundled assets, API validation and optional D1 checks.');
