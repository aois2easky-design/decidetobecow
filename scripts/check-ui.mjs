import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import worker from '../worker.js';

// Exercise the real application routes and state transitions without a browser.
const elements = new Map();
function element(selector) {
  if (!elements.has(selector)) elements.set(selector, {
    innerHTML: '', textContent: '', value: '', open: false, hidden: false,
    dataset: {}, style: {}, classList: { add() {}, remove() {} },
    addEventListener() {}, focus() {}, showModal() { this.open = true; }, close() { this.open = false; }
  });
  return elements.get(selector);
}
const storage = new Map();
const context = vm.createContext({
  document: { querySelector: element, body: element('body'), addEventListener() {} },
  location: { hash: '#home', search: '' },
  window: { scrollTo() {}, addEventListener() {}, scrollY: 0 },
  localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
  fetch: async (url, options = {}) => worker.fetch(new Request('https://test.invalid' + url, options)),
  crypto, console, URL, URLSearchParams, Intl, Date, Blob,
  setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}
});
const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
vm.runInContext(source.replace(/\ninit\(\);\s*$/, ''), context);
await vm.runInContext('init()', context);
const catalog = JSON.parse(await readFile(new URL('../public/catalog.json', import.meta.url), 'utf8'));
const routes = ['home', 'cows', 'experience', 'shop', 'my', 'about', 'gallery', 'learn',
  ...catalog.cows.map(c => 'cow/' + c.id),
  ...catalog.products.map(p => 'product/' + p.id),
  ...catalog.farms.map(f => 'farm/' + f.id),
  ...catalog.knowledge.map(n => 'learn/' + n.id)];
for (const route of routes) {
  context.location.hash = '#' + route;
  vm.runInContext('render()', context);
  const html = element('main').innerHTML;
  assert(html.includes('<h1'), 'Missing page heading on ' + route);
  assert(!/undefined|NaN|そのページが見つかりません/.test(html), 'Invalid route content: ' + route);
  for (const [, asset] of html.matchAll(/src="(\/assets\/[^"?]+)"/g)) {
    assert.equal((await worker.fetch(new Request('https://test.invalid' + asset))).status, 200, asset);
  }
}
context.location.hash = '#cows';
vm.runInContext("chooseFavorite('kurumi')", context);
assert.equal(JSON.parse(storage.get('cow-companion-v2')).favorite, 'kurumi');
context.location.hash = '#home';
vm.runInContext('render()', context);
assert(element('main').innerHTML.includes('くるみに会いにいく'));
vm.runInContext("actions['cow-filter']({dataset:{id:'のんびり屋さん'}})", context);
context.location.hash = '#cows';
vm.runInContext('render()', context);
assert(!element('main').innerHTML.includes('data-id="hana"'));
vm.runInContext("actions.photo({dataset:{id:'photo-2'}})", context);
assert(element('#modal').open);
assert(element('#modal-body').innerHTML.includes('Public domain'));
vm.runInContext("actions['add-list']({dataset:{id:'milk-set'}})", context);
assert(JSON.parse(storage.get('cow-companion-v2')).list.includes('milk-set'));
vm.runInContext("missionModal('rest','kurumi')", context);
assert(element('#modal-body').innerHTML.includes('出典：'));
element('#mission-note').value = '<script>unsafe</script>';
vm.runInContext("completeMission('rest','kurumi')", context);
assert.equal(JSON.parse(storage.get('cow-companion-v2')).completed.length, 1);
context.location.hash = '#my';
vm.runInContext('render()', context);
assert(element('main').innerHTML.includes('&lt;script&gt;unsafe&lt;/script&gt;'));
console.log(`Passed ${routes.length} app routes, image references, favorite/filter, gallery, shopping list, mission and journal checks.`);
