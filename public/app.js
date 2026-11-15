'use strict';

const STORAGE_KEY = 'cow-companion-v2';
const NAV = [
  ['home', '⌂', 'ホーム'],
  ['cows', '♡', '推し牛を探す'],
  ['experience', '◷', '牛になる'],
  ['shop', '▱', '牧場のお店'],
  ['my', '☷', 'マイ牧場']
];
const main = document.querySelector('main');
const modal = document.querySelector('#modal');
let catalog;
let missions = [];
let filter = 'all';
let productFilter = 'all';
let missionFilter = 'recommended';
let timerInterval;
let toastTimeout;
let draftMood = 'のんびり';
let memoryOnly = false;

function emptyState() {
  return { version: 2, favorite: null, likes: [], reactions: [], read: [], completed: [], journal: [], list: [], events: [], experiment: ['A', 'B', 'C'][Math.floor(Math.random() * 3)] };
}

function loadState() {
  const defaults = emptyState();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!saved || saved.version !== 2) return defaults;
    for (const key of ['likes', 'reactions', 'read', 'completed', 'journal', 'list', 'events']) {
      if (Array.isArray(saved[key])) defaults[key] = saved[key];
    }
    defaults.favorite = typeof saved.favorite === 'string' ? saved.favorite : null;
    if (['A', 'B', 'C'].includes(saved.experiment)) defaults.experiment = saved.experiment;
    return defaults;
  } catch {
    return defaults;
  }
}

let state = loadState();

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    if (!memoryOnly) toast('このブラウザでは保存できません。現在の画面内で体験できます。');
    memoryOnly = true;
  }
  document.querySelector('#list-count').textContent = state.list.length;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

const e = escapeHtml;
const yen = value => new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(value);
const farmById = id => catalog.farms.find(farm => farm.id === id);
const cowById = id => catalog.cows.find(cow => cow.id === id);
const productById = id => catalog.products.find(product => product.id === id);
const favoriteCow = () => cowById(state.favorite);
const currentCow = () => favoriteCow() || catalog.cows[0];
const dayKey = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

function safeUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function imageUrl(value) {
  if (typeof value === 'string' && value.startsWith('/assets/')) return e(value);
  return e(safeUrl(value) || '/assets/cow-0.jpg');
}

function track(type, id = '') {
  const requestedVariant = new URLSearchParams(location.search).get('variant');
  const variant = catalog.mode === 'demo' && ['A', 'B', 'C'].includes(requestedVariant) ? requestedVariant : state.experiment;
  state.events.push({ type, id, at: new Date().toISOString(), variant });
  state.events = state.events.slice(-500);
  saveState();
  // This endpoint only stores events when the optional D1 binding is configured.
  fetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, id, variant })
  }).catch(() => {});
}

function toast(message) {
  const element = document.querySelector('#toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => element.classList.remove('show'), 3500);
}

function go(route) {
  if (location.hash === '#' + route) render();
  else location.hash = route;
}

function navMarkup(mobile) {
  const route = location.hash.slice(1).split('/')[0] || 'home';
  const active = { cow: 'cows', farm: 'shop', product: 'shop' }[route] || route;
  return NAV.map(([id, icon, label]) => `<a href="#${id}" class="${active === id ? 'active' : ''}" ${active === id ? 'aria-current="page"' : ''}>${mobile ? `<span aria-hidden="true">${icon}</span>` : ''}${label}</a>`).join('');
}

function cowCard(cow) {
  const farm = farmById(cow.farmId);
  const selected = state.favorite === cow.id;
  return `<article class="card cow-card">
    <button class="heart ${selected ? 'chosen' : ''}" data-action="favorite" data-id="${e(cow.id)}" aria-pressed="${selected}" aria-label="${e(cow.name)}を${selected ? '推し牛に選択済み' : '推し牛にする'}">${selected ? '♥' : '♡'}</button>
    <a class="cow-image" href="#cow/${e(cow.id)}"><img src="${imageUrl(cow.photo)}" alt="${e(cow.name)}のイメージ写真" loading="lazy"><span class="tag">${e(cow.personality)}</span></a>
    <div class="card-body"><span class="farm-label">${e(farm.name)} · ${e(farm.area)}</span><div class="name-row"><h3><a href="#cow/${e(cow.id)}">${e(cow.name)}</a></h3><span class="muted">↗</span></div><p>${e(cow.headline)}</p><a class="card-bottom" href="#cow/${e(cow.id)}"><span>この子をもっと知る</span><span>→</span></a></div>
  </article>`;
}

function productArt(product) {
  let drawing;
  if (product.kind === 'cheese') {
    drawing = '<ellipse cx="89" cy="132" rx="69" ry="12" fill="#c2b79d" opacity=".3"/><path d="M24 94 108 51 153 95 68 137 24 117Z" fill="#dfb95d"/><path d="m24 94 84-43 45 44-85 22Z" fill="#f6d77d"/><path d="M68 117v20l85-42v22Z" fill="#cba143"/><circle cx="78" cy="88" r="7" fill="#d5b253"/><circle cx="113" cy="91" r="4" fill="#d5b253"/><rect x="24" y="107" width="66" height="26" rx="3" fill="#fff8e7" transform="rotate(-27 24 107)"/><text x="36" y="117" font-size="8" fill="#315b45" transform="rotate(-27 36 117)">FARM CHEESE</text>';
  } else if (product.kind === 'yogurt') {
    drawing = '<ellipse cx="90" cy="142" rx="65" ry="9" fill="#c2b79d" opacity=".3"/><path d="M34 65h68l-8 73H42Z" fill="#fdfcf4" stroke="#d6d6c5"/><ellipse cx="68" cy="64" rx="36" ry="9" fill="#315b45"/><path d="M101 80h49l-7 58h-36Z" fill="#fdfcf4" stroke="#d6d6c5"/><ellipse cx="125" cy="79" rx="27" ry="7" fill="#8b9c71"/><text x="48" y="99" fill="#315b45" font-size="9">YOGURT</text><path d="M45 108h46v17H45Z" fill="#e2e8d6"/>';
  } else {
    drawing = '<ellipse cx="88" cy="146" rx="61" ry="9" fill="#c2b79d" opacity=".3"/><path d="M43 27h33v27l13 18v66q0 8-8 8H39q-8 0-8-8V72l12-18Z" fill="#fffdf3" stroke="#d6d6c5"/><rect x="40" y="24" width="39" height="12" rx="3" fill="#315b45"/><path d="M105 44h25v23l10 15v56q0 8-8 8h-29q-8 0-8-8V82l10-15Z" fill="#fffdf3" stroke="#d6d6c5"/><rect x="102" y="41" width="31" height="10" rx="3" fill="#8b9c71"/><rect x="31" y="83" width="58" height="42" fill="#e4ebd9"/><text x="44" y="103" font-size="12" fill="#315b45">MILK</text><text x="42" y="116" font-size="6" fill="#315b45">FROM THE FARM</text><rect x="96" y="93" width="44" height="31" fill="#e4ebd9"/>';
  }
  return `<div class="product-art" style="background:${product.kind === 'cheese' ? '#f0e4ca' : '#e6eadd'}"><span class="tag">${product.sample ? '商品例' : '牧場の商品'}</span><svg viewBox="0 0 180 170" role="img" aria-label="${e(product.name)}のイメージイラスト">${drawing}</svg></div>`;
}

function productCard(product) {
  const farm = farmById(product.farmId);
  return `<article class="card product-card"><a href="#product/${e(product.id)}">${productArt(product)}</a><div class="card-body"><span class="farm-label">${e(farm.name)}</span><h3><a href="#product/${e(product.id)}">${e(product.name)}</a></h3><p>${e(product.subtitle)}</p><div class="product-footer"><span class="price">${yen(product.price)}<small>税込${product.sample ? '・参考価格' : ''}</small></span><a class="text-link" href="#product/${e(product.id)}">商品を見る ↗</a></div></div></article>`;
}

function missionFeature(cow) {
  return `<div class="mission-feature"><div class="mission-visual"><img src="${imageUrl(cow.photo)}" alt="${e(cow.name)}のイメージ写真" loading="lazy"><div class="floating">「${e(cow.voice)}」<small style="display:block;margin-top:8px">${e(cow.name)}と過ごす、牛になる時間</small></div></div><div class="mission-copy"><span class="eyebrow">BECOME A COW, FEEL A LITTLE CLOSER.</span><h2>今日は、ちょっとだけ<br>${e(cow.name)}になってみる。</h2><p>ゆっくり食べる。ひと息つく。周りを見渡す。<br>牛の暮らしをヒントにした小さな体験から、<br>その一頭が、少し身近になるかもしれません。</p><a class="btn light" href="#experience/${e(cow.id)}">${e(cow.name)}と牛になる <span>→</span></a><div class="mission-chip">1日ひとつから / あなたのペースで / 無料</div></div></div>`;
}

function homePage() {
  const cow = currentCow();
  const farm = farmById(cow.farmId);
  const products = catalog.products.filter(product => product.farmId === cow.farmId);
  return `<section class="hero reveal"><div class="hero-copy"><span class="eyebrow">A LITTLE CLOSER TO YOUR COW.</span><h1>一頭を好きになる。<br><em>買いものに、</em><br><em>理由ができる。</em></h1><p>なんだか気になる、その表情。<br>一緒に「牛になる」時間を過ごしたら、<br>この子が暮らす牧場のことも、知りたくなった。</p><div class="btn-row"><a class="btn" href="#${favoriteCow() ? 'cow/' + e(cow.id) : 'cows'}">${favoriteCow() ? e(cow.name) + 'に会いにいく' : 'あなたの推し牛に出会う'} <span>→</span></a><a class="text-link" href="#about" style="align-self:center">どんな体験？</a></div><span class="hero-scroll">MEET / BECOME / CHOOSE</span></div><div class="hero-photo"><img src="${imageUrl(cow.photo)}" alt="こちらを見つめる牛のイメージ写真" fetchpriority="high"><span class="photo-note">${catalog.mode === 'demo' ? '体験用プロフィール・イメージ写真' : '牧場からの一枚'}</span><a class="photo-tag" href="#cow/${e(cow.id)}"><span class="tag">${favoriteCow() ? 'あなたの推し牛' : '今日、目が合ったのは。'}</span><div><strong>${e(cow.name)}</strong><small>${e(farm.name)}</small></div><p style="font-size:11px;margin-top:5px">${e(cow.headline)} <span class="arrow">↗</span></p></a></div></section>
  <div class="journey-strip"><div class="steps"><div class="step"><b>01</b><div><strong>一頭と出会う</strong><p>性格も、好きなことも、一頭ずつ。</p></div></div><div class="step"><b>02</b><div><strong>ちょっと、牛になる</strong><p>同じリズムで、少し近づく。</p></div></div><div class="step"><b>03</b><div><strong>その牧場を選ぶ</strong><p>好きな一頭から、いつもの食卓へ。</p></div></div></div></div>
  <section class="wrap section"><div class="section-head"><div><span class="eyebrow">FIND YOUR ONE.</span><h2>どの子が、気になる？</h2><p class="sub muted">「かわいい」も「なんだか好き」も、出会いの理由。</p></div><a class="text-link" href="#cows">みんなに会う ↗</a></div><div class="grid cow-grid">${catalog.cows.map(cowCard).join('')}</div></section>
  <section class="wrap" style="padding-bottom:65px">${missionFeature(cow)}</section>
  <section class="soft-section"><div class="wrap section"><div class="section-head"><div><span class="eyebrow">FROM THEIR FARM TO YOUR TABLE.</span><h2>${favoriteCow() ? e(cow.name) + 'の暮らす牧場から。' : '好きな一頭の、その先へ。'}</h2><p class="sub muted">この子が暮らす牧場の商品を、食卓へ。</p></div><a class="text-link" href="#shop">お店を見る ↗</a></div><div class="grid product-grid">${products.concat(catalog.products.filter(product => product.farmId !== cow.farmId)).slice(0, 3).map(productCard).join('')}</div><p class="inline-note">複数の牛の生乳が使われる商品があります。特定の一頭の牛乳を届ける仕組みではありません。</p></div></section>
  <section class="wrap section"><div class="belief"><span class="eyebrow">A CHOICE THAT STARTS WITH ONE COW.</span><h2>名前を知ったら、<br>遠かった牧場が、近くなる。</h2><p>一頭への愛着が、その牧場を選ぶきっかけになる。<br>そんな買いものを、少しずつ増やしていきたい。<br>購入が牧場の収益につながり、牛の暮らしに還元される仕組みを、販売者とともに育てていきます。</p><a class="text-link" href="#about">私たちが目指すこと ↗</a></div></section>`;
}

function cowsPage() {
  const cows = filter === 'all' ? catalog.cows : catalog.cows.filter(cow => cow.tags.includes(filter));
  const options = ['all', '好奇心いっぱい', 'のんびり屋さん', '観察好き'];
  return `<div class="wrap section reveal"><div class="page-intro"><span class="eyebrow">MEET YOUR COW.</span><h1>好きになる理由は、<br>一頭ずつ。</h1><p class="sub muted">表情、性格、小さな日常。気になる子に会いにいこう。</p></div><div class="filter-row" aria-label="性格で絞り込む">${options.map(value => `<button class="filter ${filter === value ? 'active' : ''}" data-action="cow-filter" data-id="${e(value)}" aria-pressed="${filter === value}">${value === 'all' ? 'みんなに会う' : e(value)}</button>`).join('')}</div><div class="grid cow-grid">${cows.map(cowCard).join('')}</div></div>`;
}

function cowPage(cow) {
  const farm = farmById(cow.farmId);
  const selected = state.favorite === cow.id;
  return `<div class="wrap reveal"><div class="breadcrumb"><a href="#cows">推し牛を探す</a> / ${e(cow.name)}</div><section class="detail-hero"><div class="detail-image"><img src="${imageUrl(cow.photo)}" alt="${e(cow.name)}のイメージ写真"><span class="photo-note">${catalog.mode === 'demo' ? '体験用プロフィール・写真はイメージ' : e(farm.name)}</span></div><div class="detail-copy"><span class="eyebrow">HELLO, I'M ${e(cow.id.toUpperCase())}.</span><a class="text-link" href="#farm/${e(farm.id)}">${e(farm.name)} ↗</a><h1>${e(cow.name)}</h1><p class="lead">${e(cow.headline)}</p><p>${e(cow.intro)}</p><div class="tags">${cow.tags.map(tag => `<span class="tag">${e(tag)}</span>`).join('')}</div><button class="btn full ${selected ? 'secondary' : ''}" data-action="favorite" data-id="${e(cow.id)}" aria-pressed="${selected}">${selected ? '♥ あなたの推し牛です' : '♡ ' + e(cow.name) + 'を推し牛にする'}</button><div class="fact-box"><strong>この子の、ここが好き。</strong>${e(cow.charm)}</div></div></section><section style="padding-bottom:65px">${missionFeature(cow)}</section><section class="section" style="padding-top:0"><div class="section-head"><div><span class="eyebrow">LITTLE MOMENTS.</span><h2>${e(cow.name)}の、いつもの日。</h2><p class="sub muted">一枚の写真から、暮らしをのぞいてみる。</p></div><span class="tag">${catalog.mode === 'demo' ? '近況サンプル' : '牧場からの更新'}</span></div><div class="two-col">${cow.moments.map(moment => `<article class="card moment-card"><img src="${imageUrl(moment.photo)}" alt="${e(cow.name)}の近況イメージ" loading="lazy"><div class="card-body"><small class="muted">${e(moment.label)}</small><h3>${e(moment.title)}</h3><p>${e(moment.body)}</p><div class="moment-actions"><button class="clap ${state.reactions.includes(moment.id) ? 'active' : ''}" data-action="reaction" data-id="${e(moment.id)}" aria-pressed="${state.reactions.includes(moment.id)}">${state.reactions.includes(moment.id) ? '♥ 気になるに追加済み' : '♡ この一枚、好き'}</button><button class="text-link" data-action="read" data-id="${e(moment.id)}">${state.read.includes(moment.id) ? '✓ 見守り済み' : '見守り記録をつける'}</button></div></div></article>`).join('')}</div></section><section class="section" style="padding-top:0"><div class="section-head"><div><span class="eyebrow">CHOOSE THEIR FARM.</span><h2>${e(cow.name)}が暮らす、<br>${e(farm.name)}のお店。</h2></div></div><div class="grid product-grid">${catalog.products.filter(product => product.farmId === cow.farmId).map(productCard).join('')}</div><div class="notice">牧場の商品には複数の牛の生乳が使われる場合があります。「${e(cow.name)}が暮らす牧場の商品」として紹介しています。</div><a class="btn secondary" href="#farm/${e(farm.id)}">牧場の暮らし・取り組みを知る →</a></section></div>`;
}

function doneToday(missionId, cowId) {
  return state.completed.some(item => item.missionId === missionId && item.cowId === cowId && item.day === dayKey());
}

function experiencePage(cow) {
  const ids = cow.missions;
  const recommended = missions.filter(mission => ids.includes(mission.id));
  const shown = missionFilter === 'all' ? missions : recommended;
  const count = recommended.filter(mission => doneToday(mission.id, cow.id)).length;
  return `<div class="wrap reveal"><div class="page-intro"><span class="eyebrow">BECOME A LITTLE CLOSER.</span><h1>今日、${e(cow.name)}になってみる。</h1><p class="sub muted">同じように過ごしてみたら、この子が少し身近になるかも。</p></div><div class="mission-layout"><aside class="companion"><img src="${imageUrl(cow.photo)}" alt="${e(cow.name)}のイメージ写真"><span class="eyebrow">YOUR COMPANION TODAY</span><h2>${e(cow.name)}</h2><p>「${e(cow.voice)}」</p><a class="text-link" href="#cow/${e(cow.id)}" style="margin-top:15px;display:inline-block">この子のことを知る ↗</a></aside><div><div class="filter-row"><button class="filter ${missionFilter === 'recommended' ? 'active' : ''}" data-action="mission-filter" data-id="recommended">${e(cow.name)}と楽しむ３つ</button><button class="filter ${missionFilter === 'all' ? 'active' : ''}" data-action="mission-filter" data-id="all">牛生活ミッション 全${missions.length}種</button></div><div class="notice" style="margin-top:0"><strong>今日のおすすめ ${count} / ${recommended.length}</strong><br>達成を急がず、ひとつから。体験のあとは、${e(cow.name)}の近況にも会いにいこう。<div class="progress-track"><span style="width:${recommended.length ? count / recommended.length * 100 : 0}%"></span></div></div>${shown.map((mission, index) => `<article class="mission-card ${doneToday(mission.id, cow.id) ? 'done' : ''}"><span class="mission-number">${String(index + 1).padStart(2, '0')}</span><div class="content"><span class="eyebrow" style="margin-bottom:3px">${e(mission.category)}</span><h3>${e(mission.title)}</h3><p>${e(mission.action)}</p></div><button class="btn small ${doneToday(mission.id, cow.id) ? 'secondary' : ''}" data-action="mission" data-id="${e(mission.id)}" data-cow="${e(cow.id)}">${doneToday(mission.id, cow.id) ? '✓ 今日の記録' : '体験する →'}</button></article>`).join('')}<p class="inline-note">牛の行動から着想した体験です。健康効果や、牛の気持ちの理解を保証するものではありません。ミッション達成に伴う支払いや寄付は発生しません。</p></div></div></div>`;
}

function shopPage() {
  const favorite = favoriteCow();
  const shown = productFilter === 'all' ? catalog.products : catalog.products.filter(product => product.farmId === productFilter);
  return `<div class="wrap section reveal"><div class="page-intro"><span class="eyebrow">CHOOSE A FARM YOU KNOW.</span><h1>この牧場だから、選びたい。</h1><p class="sub muted">好きな一頭の暮らしを思い浮かべて、食卓に迎える。</p></div>${favorite ? `<div class="notice">あなたの推し牛は <strong>${e(favorite.name)}</strong>。<a class="text-link" href="#farm/${e(favorite.farmId)}">${e(farmById(favorite.farmId).name)}を知る ↗</a></div>` : ''}<div class="filter-row"><button class="filter ${productFilter === 'all' ? 'active' : ''}" data-action="product-filter" data-id="all">すべての商品</button>${catalog.farms.map(farm => `<button class="filter ${productFilter === farm.id ? 'active' : ''}" data-action="product-filter" data-id="${e(farm.id)}">${e(farm.name)}</button>`).join('')}</div><div class="grid product-grid">${shown.map(productCard).join('')}</div><div class="notice">商品代金・送料・発送条件は販売元でご確認ください。現在のサンプル商品は注文・決済できません。実商品では、販売元のショップで購入を完了します。</div></div>`;
}

function productPage(product) {
  const farm = farmById(product.farmId);
  const cow = catalog.cows.find(item => item.farmId === farm.id && item.id === state.favorite) || catalog.cows.find(item => item.farmId === farm.id);
  const requestedVariant = new URLSearchParams(location.search).get('variant');
  const variant = catalog.mode === 'demo' && ['A', 'B', 'C'].includes(requestedVariant) ? requestedVariant : state.experiment;
  const isDemo = catalog.mode === 'demo' || product.sample;
  const hasCheckout = Boolean(safeUrl(product.checkoutUrl)) && !isDemo;
  const unavailable = product.stock === 0;
  const cowContext = cow && variant !== 'A' ? `<div class="fact-box"><div class="modal-cow" style="margin:0"><img src="${imageUrl(cow.photo)}" alt="${e(cow.name)}のイメージ写真"><div><strong>${e(cow.name)}が暮らす牧場の商品</strong><a class="text-link" href="#cow/${e(cow.id)}">${e(cow.name)}に会ってみる ↗</a></div></div></div>` : '';
  const careContext = variant === 'C' ? `<div class="notice"><strong>牛の暮らしへの取り組み</strong><br>${e(farm.care[0].title)}。${e(farm.care[0].text)}<br><a class="text-link" href="#farm/${e(farm.id)}">取り組みと確認状況を見る ↗</a></div>` : '';
  return `<div class="wrap reveal"><div class="breadcrumb"><a href="#shop">牧場のお店</a> / ${e(product.name)}</div><div class="product-layout"><div>${productArt(product)}<p class="inline-note">商品画像はイメージイラストです。${isDemo ? '実在の商品を販売するページではありません。' : ''}</p></div><div><a class="text-link" href="#farm/${e(farm.id)}">${e(farm.name)} ↗</a><h1>${e(product.name)}</h1><p class="muted">${e(product.subtitle)}</p><div class="price">${yen(product.price)}<small>税込${isDemo ? '・参考価格' : ''}</small></div><p class="shipping">送料の目安 ${yen(product.shipping)}${isDemo ? '（参考）' : ''} ／ 最終金額は販売元で確認</p><p class="sub">${e(product.description)}</p>${cowContext}${careContext}<div class="btn-row"><button class="btn orange full" data-action="checkout" data-id="${e(product.id)}" ${unavailable ? 'disabled' : ''}>${unavailable ? '売り切れ' : hasCheckout ? '販売元のショップで購入する ↗' : isDemo ? '購入前の確認を体験する →' : '販売開始の準備中'}</button><button class="btn secondary full" data-action="add-list" data-id="${e(product.id)}">${state.list.includes(product.id) ? '✓ お買いものリストに保存済み' : '♡ お買いものリストに保存'}</button></div><p class="inline-note">${isDemo ? '体験版です。請求・発送・牧場への送金は発生しません。' : '決済・配送・返品は販売元が対応します。リンク先の表示と条件をご確認ください。'}</p><dl class="specs"><div><dt>原材料</dt><dd>${e(product.ingredients)}</dd></div><div><dt>アレルゲン</dt><dd>${e(product.allergens)}</dd></div><div><dt>保存方法</dt><dd>${e(product.storage)}</dd></div><div><dt>賞味期限</dt><dd>${e(product.expiry)}</dd></div><div><dt>販売者</dt><dd>${e(product.seller)}</dd></div></dl></div></div><div class="notice">牧場の複数の牛の生乳が使われる場合があります。特定の一頭から搾った牛乳として販売するものではありません。${farm.improvement.allocationPerOrder > 0 ? `販売者との取り決めによる改善への配分額 ${yen(farm.improvement.allocationPerOrder)} / 対象注文。条件は牧場ページをご確認ください。` : '現在、この商品の購入に伴うウェルフェア改善費の配分は設定されていません。'}</div><section class="section" style="padding-top:25px"><h2 style="margin-bottom:25px">この牧場の一頭に、会いにいく。</h2><div class="grid cow-grid">${catalog.cows.filter(item => item.farmId === farm.id).map(cowCard).join('')}</div></section></div>`;
}

function farmPage(farm) {
  return `<div class="wrap reveal"><div class="breadcrumb"><a href="#shop">牧場のお店</a> / ${e(farm.name)}</div><div class="farm-hero"><span class="eyebrow">${e(farm.area)}</span><span class="tag">${catalog.mode === 'demo' ? '体験用の牧場' : '牧場の紹介'}</span><h1>${e(farm.name)}</h1><h2 style="font-size:23px;margin-bottom:20px">${e(farm.tagline)}</h2><p>${e(farm.description)}</p></div><section class="section" style="padding-top:20px"><span class="eyebrow">THEIR EVERYDAY CARE.</span><h2>牛たちの、暮らしのこと。</h2><div class="care-grid">${farm.care.map((care, index) => `<article class="care-card"><span class="eyebrow">CARE ${String(index + 1).padStart(2, '0')}</span><h3>${e(care.title)}</h3><p>${e(care.text)}</p></article>`).join('')}</div><div class="notice"><strong>情報の確認状況</strong><br>${farm.improvement.verified ? '確認済みの記録は以下の更新情報をご覧ください。' : '第三者による確認記録は未掲載です。'}${catalog.mode === 'demo' ? 'このページの取り組みはサンプルで、実在する牧場の実施状況を示していません。' : ''}</div><article class="care-card"><span class="tag warm">${e(farm.improvement.status)}</span><h3 style="margin-top:15px">${e(farm.improvement.title)}</h3><p>${e(farm.improvement.description)}</p><p style="margin-top:12px">改善への配分 ${farm.improvement.allocationPerOrder ? yen(farm.improvement.allocationPerOrder) + ' / 対象注文' : '未設定'} ／ 実施報告 ${farm.improvement.verified ? '確認済み' : '未掲載'}</p></article></section><section class="section" style="padding-top:0"><h2 style="margin-bottom:25px">この牧場の牛たち。</h2><div class="grid cow-grid">${catalog.cows.filter(cow => cow.farmId === farm.id).map(cowCard).join('')}</div></section><section class="section" style="padding-top:0"><h2 style="margin-bottom:25px">この牧場のお店。</h2><div class="grid product-grid">${catalog.products.filter(product => product.farmId === farm.id).map(productCard).join('')}</div></section></div>`;
}

function myPage() {
  const cow = favoriteCow();
  return `<div class="wrap section reveal"><div class="page-intro"><span class="eyebrow">YOUR LITTLE FARM.</span><h1>好きが、少しずつ増えていく。</h1><p class="sub muted">一緒に過ごした時間と、気になった一枚を残して。</p></div><div class="summary-row"><div><strong>${state.completed.length}</strong><span>牛になった体験</span></div><div><strong>${state.read.length}</strong><span>見守った近況</span></div><div><strong>${state.journal.length}</strong><span>残した日記</span></div></div>${cow ? `<div class="section-head"><div><span class="eyebrow">MY FAVORITE COW.</span><h2>あなたの推し牛。</h2></div><a class="text-link" href="#cows">ほかの子に会う ↗</a></div><div class="grid cow-grid">${cowCard(cow)}</div><div class="btn-row"><a class="btn" href="#experience/${e(cow.id)}">今日も${e(cow.name)}と牛になる →</a></div>` : `<div class="empty"><div class="big">♡</div><h2>あなたの推し牛を、見つけよう。</h2><p>一頭を選ぶと、ホームにもその子が登場します。</p><a class="btn" href="#cows">気になる一頭に会う →</a></div>`}<section class="section"><div class="section-head"><div><span class="eyebrow">LITTLE NOTES.</span><h2>牛になった日の、日記。</h2></div><button class="text-link" data-action="journal">今日を書く ＋</button></div>${state.journal.length ? state.journal.slice().reverse().map(entry => `<article class="journal-entry"><small>${e(entry.day)} ／ ${e(entry.cowName)}と ／ ${e(entry.mood)}</small><h3>${e(entry.title)}</h3><p>${e(entry.text || '言葉にしなくても、一緒に過ごした記録。')}</p><button class="text-link" data-action="edit-journal" data-id="${e(entry.id)}">編集する</button></article>`).join('') : `<div class="empty"><p>体験のあとに感じたことを、ひとこと。<br>保存した日記は、このブラウザで読めます。</p><button class="btn secondary" data-action="journal">今日の記録をつける →</button></div>`}</section>${state.reactions.length ? `<section style="padding-bottom:40px"><h2 style="margin-bottom:20px">気になった一枚。</h2><div class="two-col">${catalog.cows.flatMap(item => item.moments.filter(moment => state.reactions.includes(moment.id)).map(moment => `<article class="card moment-card"><a href="#cow/${e(item.id)}"><img src="${imageUrl(moment.photo)}" alt="${e(item.name)}のイメージ写真" loading="lazy"><div class="card-body"><small>${e(item.name)}</small><h3>${e(moment.title)}</h3></div></a></article>`)).join('')}</div></section>` : ''}<div class="notice">記録はこのブラウザに保存されます。別端末との同期はありません。端末を共有している場合は、日記の内容にご注意ください。</div><div class="btn-row"><button class="btn secondary small" data-action="export">記録を書き出す</button><button class="text-link" data-action="reset">記録の削除</button></div></div>`;
}

function aboutPage() {
  return `<div class="wrap section reveal"><div class="narrow"><div class="page-intro"><span class="eyebrow">WHY WE DO THIS.</span><h1>一頭への「好き」が、<br>牧場を選ぶ理由になる。</h1><p class="sub muted">「今世から牛になることにした。」が目指すこと。</p></div><article class="about-step"><h2>01 名前を知る。日常を知る。</h2><p>気になる一頭を選んで、その牛の近況や牧場を知る。牛の行動をヒントにした「牛になる」体験も、一頭を身近に感じる入口です。</p></article><article class="about-step"><h2>02 好きな一頭の暮らす牧場を、選ぶ。</h2><p>商品のおいしさや価格に加えて、「この牧場の商品を選びたい」という理由が生まれることを目指します。紹介するのはその牛が暮らす牧場の商品です。特定の一頭の生乳を分けて届ける仕組みではありません。</p></article><article class="about-step"><h2>03 牧場への利益と、牛の暮らしへ。</h2><p>サービスは、販売者と契約した対象商品の販売手数料を収益にするモデルです。手数料の対象・料率・計測方法は販売者と取り決めます。購入が牧場の追加利益を生むか、サービスの運用費を回収できるかを、実販売で検証します。</p></article><article class="about-step"><h2>04 改善したことまで、見えるように。</h2><p>ウェルフェア改善につながる資金配分は、販売者との合意後に、対象商品・配分額・使途・報告方法を掲載します。売上、設備への支出、牛の状態の変化をそれぞれ記録し、確認できる範囲を伝えます。</p></article><div class="notice warm"><strong>現在の提供状況</strong><br>${catalog.mode === 'demo' ? 'このサイトは体験版です。掲載する牛・牧場・近況・商品はサンプルです。実注文・決済・送金はありません。写真は実在の個体を特定するプロフィール写真として使っていません。' : '実商品の購入は販売元のショップで完了します。購入条件や販売者の表示をご確認ください。'}<br>購入の意思やショップへの遷移を、実購入の実績として数えません。</div><div class="btn-row"><a class="btn" href="#cows">一頭に会いにいく →</a>${safeUrl(catalog.contactUrl) ? `<a class="btn secondary" href="${e(safeUrl(catalog.contactUrl))}" target="_blank" rel="noopener noreferrer">牧場・販売者の方へ ↗</a>` : ''}</div></div></div>`;
}

function notFoundPage() {
  return `<div class="wrap section"><div class="empty"><h1 style="font-size:30px">そのページが見つかりません。</h1><p>掲載内容が変更されたか、リンクが異なる可能性があります。</p><a href="#home" class="btn">ホームへ戻る</a></div></div>`;
}

function render() {
  closeModal();
  const [route = 'home', id] = (location.hash.slice(1) || 'home').split('/');
  let html;
  switch (route) {
    case 'home': html = homePage(); break;
    case 'cows': html = cowsPage(); break;
    case 'cow': html = cowById(id) ? cowPage(cowById(id)) : notFoundPage(); break;
    case 'experience': html = (!id || cowById(id)) ? experiencePage(cowById(id) || currentCow()) : notFoundPage(); break;
    case 'shop': html = shopPage(); break;
    case 'product': html = productById(id) ? productPage(productById(id)) : notFoundPage(); break;
    case 'farm': html = farmById(id) ? farmPage(farmById(id)) : notFoundPage(); break;
    case 'my': html = myPage(); break;
    case 'about': html = aboutPage(); break;
    default: html = notFoundPage();
  }
  main.innerHTML = html;
  document.querySelector('.desktop-nav').innerHTML = navMarkup(false);
  document.querySelector('.mobile-nav').innerHTML = navMarkup(true);
  document.querySelector('#list-count').textContent = state.list.length;
  window.scrollTo({ top: 0, behavior: 'instant' });
  main.focus({ preventScroll: true });
  if (route === 'product' && productById(id)) track('product_view', id);
  if (route === 'cow' && cowById(id)) track('cow_view', id);
}

function openModal(html) {
  clearInterval(timerInterval);
  document.querySelector('#modal-body').innerHTML = html;
  if (!modal.open) modal.showModal();
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  clearInterval(timerInterval);
  if (modal.open) modal.close();
  document.body.style.overflow = '';
}

function refreshKeepingPosition() {
  const y = window.scrollY;
  render();
  window.scrollTo({ top: y, behavior: 'instant' });
}

function chooseFavorite(id) {
  const cow = cowById(id);
  if (!cow) return;
  state.favorite = id;
  if (!state.likes.includes(id)) state.likes.push(id);
  track('favorite', id);
  refreshKeepingPosition();
  toast(`${cow.name}が、あなたの推し牛になりました。`);
}

function missionModal(id, cowId) {
  const mission = missions.find(item => item.id === id);
  const cow = cowById(cowId);
  if (!mission || !cow) return;
  const complete = doneToday(id, cowId);
  openModal(`<div class="modal-cow"><img src="${imageUrl(cow.photo)}" alt=""><span>${e(cow.name)}と、牛になる時間</span></div><span class="eyebrow">${e(mission.category)}</span><h2 id="modal-title">${e(mission.title)}</h2><p>${e(mission.action)}</p><div class="notice"><strong>牛の暮らしを知るヒント</strong><br>${e(mission.fact)}</div>${complete ? '<p class="notice">✓ 今日の体験は記録済みです。同じ牛・同じミッションは１日１回記録します。</p>' : `<div class="timer" id="timer-display">01:00</div><button class="btn secondary full" data-action="timer">１分だけ、一緒に過ごす</button><p class="inline-note">１分の導入タイマーです。ミッションの時間は自分のペースで。ページを閉じるとタイマーは終了します。</p>`}<label for="mission-note">この子を思い浮かべて、どんな気分になった？</label><textarea id="mission-note" maxlength="1000" placeholder="ひとことでも、空欄でも大丈夫。"></textarea><button class="btn full" style="margin-top:8px" data-action="complete" data-id="${e(id)}" data-cow="${e(cow.id)}">${complete ? 'ひとことを日記に残す' : '体験を記録して、日記に残す'}</button>`);
}

function completeMission(id, cowId) {
  const mission = missions.find(item => item.id === id);
  const cow = cowById(cowId);
  if (!mission || !cow) return;
  const note = document.querySelector('#mission-note')?.value.trim() || '';
  const alreadyDone = doneToday(id, cowId);
  if (!alreadyDone) {
    state.completed.push({ missionId: id, cowId, day: dayKey() });
    track('mission_complete', id);
  }
  if (!alreadyDone || note) {
    state.journal.push({ id: crypto.randomUUID(), day: dayKey(), cowId, cowName: cow.name, title: mission.title, mood: '牛になった日', text: note });
  }
  saveState();
  openModal(`<div class="modal-cow"><img src="${imageUrl(cow.photo)}" alt=""><span>${e(cow.name)}と過ごした記録</span></div><h2 id="modal-title">少し、近づけたかな。</h2><p>牛の暮らしを思い浮かべたら、今度は${e(cow.name)}の日常に会いにいこう。</p><div class="btn-row"><a class="btn full" href="#cow/${e(cow.id)}">${e(cow.name)}の近況を見る →</a><a class="btn secondary full" href="#farm/${e(cow.farmId)}">暮らしている牧場を知る →</a></div><p class="inline-note">記録はこのブラウザに保存されました。ミッションに伴う支払いや寄付はありません。</p>`);
}

function journalModal(id) {
  const entry = id ? state.journal.find(item => item.id === id) : null;
  const cow = entry ? cowById(entry.cowId) || currentCow() : currentCow();
  draftMood = entry?.mood || 'のんびり';
  openModal(`<span class="eyebrow">${dayKey()} / ${e(cow.name)}と</span><h2 id="modal-title">今日の、牛日記。</h2><label>今日のきぶん</label><div class="journal-mood">${['のんびり', 'わくわく', 'ふつう', 'ひとやすみ'].map(mood => `<button data-action="mood" data-id="${e(mood)}" class="${draftMood === mood ? 'active' : ''}">${e(mood)}</button>`).join('')}</div><label for="journal-text">今日、気づいたこと</label><textarea id="journal-text" maxlength="1000" placeholder="この子のこと、自分のこと。ひとこと残してみよう。">${e(entry?.text || '')}</textarea><button class="btn full" data-action="save-journal" data-id="${e(entry?.id || '')}" data-cow="${e(cow.id)}">日記を保存する</button>`);
}

function listModal() {
  const products = state.list.map(productById).filter(Boolean);
  openModal(`<span class="eyebrow">YOUR SHOPPING NOTES.</span><h2 id="modal-title">お買いものリスト</h2>${products.length ? products.map(product => `<article class="list-item">${productArt(product)}<div><small>${e(farmById(product.farmId).name)}</small><h3>${e(product.name)}</h3><p>${yen(product.price)}（税込${product.sample ? '・参考' : ''}）</p><button data-action="remove-list" data-id="${e(product.id)}">リストから外す</button><br><a class="btn small secondary" href="#product/${e(product.id)}">商品を確認する →</a></div></article>`).join('') + `<div class="list-summary">商品参考合計・送料別<strong>${yen(products.reduce((sum, product) => sum + product.price, 0))}</strong></div><p class="inline-note">牧場ごとに送料・販売条件が異なります。各商品の販売元で購入を完了してください。このリストの内容は外部ショップに自動送信されません。</p>` : '<div class="empty"><p>気になる商品を保存すると、ここで見返せます。</p><a href="#shop" class="btn">牧場のお店へ →</a></div>'}`);
}

function checkoutModal(id) {
  const product = productById(id);
  if (!product || product.stock === 0) return;
  const demo = catalog.mode === 'demo' || product.sample;
  const url = safeUrl(product.checkoutUrl);
  if (!demo && !url) {
    toast('販売URLは準備中です。販売開始後にご案内します。');
    return;
  }
  track('checkout_intent', id);
  openModal(`<span class="eyebrow">${demo ? 'DEMO / NO PAYMENT' : 'BEFORE YOU GO'}</span><h2 id="modal-title">${demo ? '買う前に、確かめる。' : '販売元のショップへ進みます。'}</h2><p><strong>${e(product.name)}</strong><br>${e(farmById(product.farmId).name)} ／ ${e(product.subtitle)}</p><div class="list-summary">商品代金・税込<strong>${yen(product.price)}</strong><br>送料の目安<strong>${yen(product.shipping)}</strong><hr style="border:0;border-top:1px solid #bfcab5">参考合計<strong>${yen(product.price + product.shipping)}</strong></div><p>${demo ? 'これは購入導線の体験です。実際の商品・販売者・送料は未確定です。決済、注文受付、発送は発生しません。' : '実際のお支払い総額、在庫、配送日時、返品条件、販売者の特定商取引法に基づく表記は、リンク先でご確認ください。'}</p>${demo ? `<button class="btn full" style="margin-top:22px" data-action="demo-finish" data-id="${e(id)}">体験を終えて牧場を知る →</button>` : `<a class="btn orange full" style="margin-top:22px" href="${e(url)}" target="_blank" rel="noopener noreferrer" data-action="outbound" data-id="${e(id)}">販売元で商品を確認する ↗</a>`}<p class="inline-note">${demo ? 'この操作を購入実績として数えません。' : '外部ショップでの購入完了は、このサイト上では確認できません。'}</p>`);
}

const actions = {
  favorite: button => chooseFavorite(button.dataset.id),
  'cow-filter': button => { filter = button.dataset.id; render(); },
  'product-filter': button => { productFilter = button.dataset.id; render(); },
  'mission-filter': button => { missionFilter = button.dataset.id; refreshKeepingPosition(); },
  mission: button => missionModal(button.dataset.id, button.dataset.cow),
  complete: button => completeMission(button.dataset.id, button.dataset.cow),
  reaction: button => {
    const id = button.dataset.id;
    state.reactions = state.reactions.includes(id) ? state.reactions.filter(item => item !== id) : [...state.reactions, id];
    saveState();
    refreshKeepingPosition();
  },
  read: button => {
    if (!state.read.includes(button.dataset.id)) state.read.push(button.dataset.id);
    saveState();
    refreshKeepingPosition();
    toast('近況を見守った記録を残しました。');
  },
  timer: button => {
    if (button.disabled) return;
    button.disabled = true;
    button.textContent = '牛になる時間を過ごしています…';
    const end = Date.now() + 60000;
    timerInterval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      const display = document.querySelector('#timer-display');
      if (!display) return clearInterval(timerInterval);
      display.textContent = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
      if (!remaining) {
        clearInterval(timerInterval);
        button.textContent = '１分が過ぎました。自分のペースで続けよう。';
      }
    }, 250);
  },
  journal: () => journalModal(),
  'edit-journal': button => journalModal(button.dataset.id),
  mood: button => {
    draftMood = button.dataset.id;
    document.querySelectorAll('.journal-mood button').forEach(item => item.classList.toggle('active', item === button));
  },
  'save-journal': button => {
    const text = document.querySelector('#journal-text').value.trim();
    const cow = cowById(button.dataset.cow);
    if (!cow) return;
    const existing = state.journal.find(entry => entry.id === button.dataset.id);
    if (existing) Object.assign(existing, { mood: draftMood, text });
    else state.journal.push({ id: crypto.randomUUID(), day: dayKey(), cowId: cow.id, cowName: cow.name, title: '今日の牛日記', mood: draftMood, text });
    saveState();
    closeModal();
    go('my');
    toast('日記を保存しました。');
  },
  'add-list': button => {
    if (!productById(button.dataset.id)) return;
    if (!state.list.includes(button.dataset.id)) state.list.push(button.dataset.id);
    track('list_add', button.dataset.id);
    refreshKeepingPosition();
    toast('お買いものリストに保存しました。');
  },
  'remove-list': button => {
    state.list = state.list.filter(id => id !== button.dataset.id);
    saveState();
    listModal();
  },
  list: listModal,
  checkout: button => checkoutModal(button.dataset.id),
  outbound: button => track('shop_outbound', button.dataset.id),
  'demo-finish': button => {
    const product = productById(button.dataset.id);
    closeModal();
    go('farm/' + product.farmId);
    toast('購入の流れを体験しました。実注文はありません。');
  },
  close: closeModal,
  privacy: () => openModal('<span class="eyebrow">YOUR DATA.</span><h2 id="modal-title">保存とプライバシー</h2><p>推し牛・ミッション・日記・リストはこのブラウザのローカルストレージに保存します。日記の内容はサーバーに送信しません。端末間の同期はありません。</p><div class="notice">閲覧・お気に入り・体験完了・ショップ遷移などの行動イベントを、サービス改善と比較検証に使います。サーバー集計はD1接続時に有効です。送る項目はイベント種別、牛や商品のID、比較条件です。氏名・メールアドレス・日記本文は含めません。</div><p>決済や配送情報は、販売元のショップで入力します。外部サイトには各販売元のプライバシーポリシーが適用されます。</p><p class="inline-note">端末の記録はマイ牧場で書き出し・削除できます。運営者が実販売を始める際は、問い合わせ先と正式な方針を公開してください。</p>'),
  credits: () => openModal(`<span class="eyebrow">PHOTO CREDITS.</span><h2 id="modal-title">写真について</h2><p>体験版の写真はイメージです。架空のプロフィール・牧場・近況と、写真の撮影地や実在の牛との関連はありません。</p><div style="margin-top:20px">${catalog.credits.map(credit => `<p><a class="text-link" href="${e(safeUrl(credit.url))}" target="_blank" rel="noopener noreferrer">${e(credit.name)} ↗</a></p>`).join('')}</div><p class="inline-note">商品画像は本サイト用のイメージイラストです。</p>`),
  export: () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `my-cow-${dayKey()}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  reset: () => openModal('<h2 id="modal-title">このブラウザの記録を削除しますか？</h2><p>推し牛、日記、ミッション、リストが削除されます。必要な記録は先に書き出してください。</p><div class="btn-row"><button class="btn orange" data-action="confirm-reset">記録を削除する</button><button class="btn secondary" data-action="close">戻る</button></div>'),
  'confirm-reset': () => {
    state = emptyState();
    saveState();
    render();
    toast('このブラウザの記録を削除しました。');
  }
};

document.addEventListener('click', event => {
  if (event.target.closest('a[href="#main"]')) {
    event.preventDefault();
    main.focus();
    return;
  }
  const button = event.target.closest('[data-action]');
  if (button && !button.disabled && actions[button.dataset.action]) actions[button.dataset.action](button);
  // Same-route anchors do not dispatch hashchange; close overlays explicitly.
  const anchor = event.target.closest('a[href^="#"]');
  if (anchor && modal.open) closeModal();
});
modal.addEventListener('click', event => { if (event.target === modal) closeModal(); });
modal.addEventListener('close', () => { clearInterval(timerInterval); document.body.style.overflow = ''; });
window.addEventListener('hashchange', () => { if (catalog) render(); });

async function init() {
  try {
    const [catalogResponse, missionsResponse] = await Promise.all([fetch('/catalog.json'), fetch('/missions.json')]);
    if (!catalogResponse.ok || !missionsResponse.ok) throw new Error('Content unavailable');
    catalog = await catalogResponse.json();
    missions = await missionsResponse.json();
    if (!catalog.cows?.length || !catalog.farms?.length || !Array.isArray(catalog.products)) throw new Error('Invalid content');
    if (!catalog.experiment?.enabled) state.experiment = catalog.experiment?.defaultVariant || 'B';
    state.list = state.list.filter(id => productById(id));
    if (!cowById(state.favorite)) state.favorite = null;
    document.querySelector('#sample-banner').hidden = catalog.mode !== 'demo';
    saveState();
    render();
  } catch (error) {
    main.innerHTML = '<div class="error-state"><h1 style="font-size:26px">牧場の情報を読み込めませんでした。</h1><p>通信状況を確認して、もう一度お試しください。</p><button class="btn" id="retry">もう一度読み込む</button></div>';
    document.querySelector('#retry').addEventListener('click', init);
    console.error(error);
  }
}

init();
