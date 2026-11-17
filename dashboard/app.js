// Token Launch Radar — the page's working parts. Everything renders from
// window.RADAR (data.js, written by main.ts from the same board the gate
// checks): what the screenshots show is what the code holds.
'use strict';

const R = window.RADAR;
const $ = (id) => document.getElementById(id);

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}
function money(n) {
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + Math.round(n);
}
function moneyFull(n) {
  return '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
function pct(n) {
  if (n === null || n === undefined) return '—';
  return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
}
function factor(n) { return '×' + n.toFixed(2); }
function years(days) {
  if (days === null || days === undefined) return '—';
  return (days / 365.25).toFixed(1) + 'y';
}

// State, seeded from the URL hash so a view can be linked (and shot):
// #slug=<slug>&cat=<category>&chain=<chain>&watch=1&view=live
const state = { view: 'board', q: '', cat: '', chain: '', watch: false, sort: 'rank', dir: 1, slug: null };
for (const pair of location.hash.replace(/^#/, '').split('&')) {
  const [k, v] = pair.split('=');
  if (!v) continue;
  const val = decodeURIComponent(v);
  if (k === 'slug') state.slug = val;
  if (k === 'cat') state.cat = val;
  if (k === 'chain') state.chain = val;
  if (k === 'q') state.q = val;
  if (k === 'watch') state.watch = val === '1';
  if (k === 'view' && val === 'live') state.view = 'live';
}

function stats() {
  const box = $('stats');
  const onBoard = R.rows.filter((r) => r.watchlist).length;
  const items = [
    [String(R.protocol_count), 'protocols in snapshot'],
    [String(R.pretoken_count), 'pre-token, ranked'],
    [`${onBoard}/${R.watchlist_count}`, 'watchlist on board'],
    [money(R.total_implied_usd), 'total implied value'],
    [money(R.total_airdrop_pool_usd), 'est. airdrop pools'],
  ];
  for (const [v, k] of items) {
    const card = el('div', 'stat');
    card.append(el('div', 'v', v), el('div', 'k', k));
    box.append(card);
  }
  $('as-of').textContent = R.as_of;
}

function filters() {
  const cat = $('cat');
  for (const c of R.categories) {
    const o = el('option', '', c); o.value = c; cat.append(o);
  }
  const chain = $('chain');
  for (const c of R.chains) {
    const o = el('option', '', c); o.value = c; chain.append(o);
  }
  cat.value = state.cat; chain.value = state.chain;
  $('q').value = state.q; $('watch').checked = state.watch;
  cat.onchange = () => { state.cat = cat.value; render(); };
  chain.onchange = () => { state.chain = chain.value; render(); };
  $('q').oninput = (e) => { state.q = e.target.value.toLowerCase(); render(); };
  $('watch').onchange = (e) => { state.watch = e.target.checked; render(); };
  $('tab-board').onclick = () => { state.view = 'board'; render(); };
  $('tab-live').onclick = () => { state.view = 'live'; render(); };
}

const BOARD_COLS = [
  ['rank', '#', 'num'], ['name', 'Protocol', ''], ['category', 'Category', ''],
  ['chains', 'Chains', ''], ['tvl_usd', 'TVL', 'num'], ['change_7d', '7d', 'num'],
  ['multiple', 'Mult.', 'num'],
  ['implied_value_usd', 'Implied value', 'num'],
];
const LIVE_COLS = [
  ['name', 'Protocol', ''], ['category', 'Category', ''],
  ['tvl_usd', 'TVL', 'num'], ['mcap_usd', 'Market cap', 'num'], ['multiple', 'Actual mult.', 'num'],
];

function visibleRows() {
  let rows = state.view === 'board' ? R.rows : R.live;
  if (state.view === 'board' && state.watch) rows = rows.filter((r) => r.watchlist);
  if (state.cat) rows = rows.filter((r) => (r.category ?? 'Uncategorised') === state.cat);
  // Launched rows carry no chain list, so the chain filter belongs to
  // the board; applying it here would silently empty the launched view.
  if (state.view === 'board' && state.chain) rows = rows.filter((r) => r.chains.includes(state.chain));
  if (state.q) rows = rows.filter((r) => r.name.toLowerCase().includes(state.q) || r.slug.includes(state.q));
  const key = state.sort;
  rows = [...rows].sort((a, b) => {
    const av = a[key], bv = b[key];
    if (av === null || av === undefined) return 1;
    if (bv === null || bv === undefined) return -1;
    if (typeof av === 'string') return state.dir * av.localeCompare(bv);
    if (Array.isArray(av)) return state.dir * (av.length - bv.length);
    return state.dir * (av - bv);
  });
  return rows;
}

function head(cols) {
  const tr = $('head');
  tr.textContent = '';
  for (const [key, label, cls] of cols) {
    const th = el('th', cls, label);
    if (state.sort === key) th.append(el('span', 'dir', state.dir === 1 ? ' ↑' : ' ↓'));
    th.onclick = () => {
      if (state.sort === key) state.dir *= -1;
      else { state.sort = key; state.dir = key === 'name' || key === 'category' ? 1 : -1; }
      render();
    };
    tr.append(th);
  }
}

function boardTable(rows) {
  head(BOARD_COLS);
  const body = $('body');
  body.textContent = '';
  const top = R.rows.length ? R.rows[0].implied_value_usd : 1;
  for (const r of rows.slice(0, 250)) {
    const tr = el('tr', r.slug === state.slug ? 'sel' : '');
    const rank = el('td', 'rank', String(r.rank));
    const name = el('td', 'name');
    name.append(document.createTextNode(r.name));
    if (r.watchlist) name.append(el('span', 'badge', 'Watchlist'));
    name.append(el('span', 'slug', r.slug));
    const ch = el('td', 'chains', r.chains.slice(0, 2).join(' · ') + (r.chains.length > 2 ? ` +${r.chains.length - 2}` : ''));
    const imp = el('td', 'num imp');
    imp.append(document.createTextNode(money(r.implied_value_usd)));
    const bar = el('div', 'bar');
    bar.style.width = Math.max(2, Math.round((r.implied_value_usd / top) * 100)) + '%';
    imp.append(bar);
    tr.append(
      rank, name,
      el('td', '', r.category ?? '—'), ch,
      el('td', 'num', money(r.tvl_usd)),
      el('td', 'num ' + (r.change_7d > 0 ? 'pos' : r.change_7d < 0 ? 'neg' : ''), pct(r.change_7d)),
      el('td', 'num', r.multiple.toFixed(2)),
      imp,
    );
    tr.onclick = () => { state.slug = r.slug; render(); };
    body.append(tr);
  }
}

function liveTable(rows) {
  head(LIVE_COLS);
  const body = $('body');
  body.textContent = '';
  for (const r of rows.slice(0, 250)) {
    const tr = el('tr', '');
    const name = el('td', 'name');
    name.append(document.createTextNode(r.name));
    name.append(el('span', 'slug', r.slug));
    tr.append(
      name, el('td', '', r.category ?? '—'),
      el('td', 'num', money(r.tvl_usd)),
      el('td', 'num', money(r.mcap_usd)),
      el('td', 'num', r.multiple.toFixed(2)),
    );
    body.append(tr);
  }
}

function detail() {
  const box = $('detail');
  box.textContent = '';
  if (state.view === 'live') {
    box.append(el('h2', '', 'Already launched'));
    const totalMcap = R.live.reduce((sum, x) => sum + x.mcap_usd, 0);
    box.append(el('p', 'hint',
      `${R.live.length} protocols already trade, ${money(totalMcap)} of combined market cap, so the radar ` +
      'does not rank them — it learns from them. Each one\'s market-cap/TVL ratio feeds the category ' +
      'multiples that price the pre-token board. The global median multiple across all of them is ×' +
      R.global_multiple.toFixed(2) + '.'));
    const h = el('h3', '', 'Category multiples (median, traded peers)');
    box.append(h);
    for (const c of R.category_multiples.slice(0, 12)) {
      const line = el('div', '');
      line.append(el('span', '', `${c.category} — ×${c.multiple.toFixed(2)} across ${c.comps} traded`));
      box.append(line);
    }
    box.append(el('h3', '', 'Screened out of the ranking'));
    box.append(el('p', 'hint',
      `${R.screened_count} protocols record no token but are not launch candidates: bridges and ` +
      'liquid-staking wrappers hold assets that already trade, and a wrapped product\'s launch is the ' +
      'underlying\'s. The largest few:'));
    for (const s of R.screened.slice(0, 6)) {
      const line = el('div', '');
      line.append(el('span', '', `${s.name} (${money(s.tvl_usd)}) — ${s.reason}`));
      box.append(line);
    }
    return;
  }
  const r = R.rows.find((x) => x.slug === state.slug) ?? R.rows[0];
  if (!r) { box.append(el('p', 'hint', 'Pick a protocol on the board.')); return; }
  state.slug = r.slug;
  const title = el('h2', '', r.name);
  if (r.watchlist) title.append(el('span', 'badge', 'Watchlist'));
  box.append(title);
  box.append(el('div', 'dslug', `${r.slug} · rank #${r.rank} of ${R.rows.length} pre-token protocols`));
  const kv = el('div', 'kv');
  const pairs = [
    ['TVL', moneyFull(r.tvl_usd)], ['7d change', pct(r.change_7d)],
    ['Chains', r.chains.join(', ')], ['Listed', r.listed_at ?? '—'],
    ['Age with no token', years(r.age_days)], ['Category', r.category ?? '—'],
  ];
  for (const [k, v] of pairs) {
    const cell = el('div', '');
    cell.append(el('div', 'k', k), el('div', 'v', v));
    kv.append(cell);
  }
  box.append(kv);

  box.append(el('h3', '', 'How the radar prices it'));
  const eq = el('div', 'eq');
  const lines = [
    ['TVL (snapshot)', moneyFull(r.tvl_usd), ''],
    ['× category multiple', factor(r.multiple), ''],
    ['= base value at traded-peer pricing', moneyFull(r.base_value_usd), 'base'],
    ['× 7-day momentum' + (r.change_7d === null ? '' : ` (TVL ${pct(r.change_7d)})`), factor(r.momentum_factor), ''],
    ['× age with no token' + (r.age_days === null ? '' : ` (${years(r.age_days)})`), factor(r.age_factor), ''],
    [`× chain breadth (${r.chains.length} ${r.chains.length === 1 ? 'chain' : 'chains'})`, factor(r.breadth_factor), ''],
  ];
  for (const [k, v, cls] of lines) {
    const line = el('div', 'line' + (cls ? ' ' + cls : ''));
    line.append(el('span', '', k), el('span', '', v));
    eq.append(line);
  }
  const total = el('div', 'line total');
  total.append(el('span', '', 'Implied launch value'), el('span', '', moneyFull(r.implied_value_usd)));
  eq.append(total);
  box.append(eq);
  const pricedByPeers = r.peer_count > 0 && r.category !== null;
  box.append(el('p', 'hint eq-note', pricedByPeers
    ? `The ${factor(r.multiple)} multiple is the median market-cap/TVL of the ${r.peer_count} traded ` +
      `${r.category} protocol${r.peer_count === 1 ? '' : 's'} in this snapshot, blended toward the global median ` +
      `(${factor(R.global_multiple)}) and capped at ×3.00.`
    : `No traded peers price this category in the snapshot, so it is priced at the global median ` +
      `multiple ${factor(R.global_multiple)}, taken from ${R.global_comps} traded protocols.`));

  box.append(el('h3', '', 'If it launches'));
  const pool = el('p', '',
    `At the model's ${(r.airdrop_pct * 100).toFixed(0)}% community-airdrop assumption for its category, ` +
    `the airdrop pool would be `);
  pool.append(el('span', 'pool', moneyFull(r.airdrop_pool_usd)));
  pool.append(document.createTextNode(
    ` — an illustrative ${moneyFull(r.per_farmer_usd)} per farmer if farmers scale with TVL. Estimates, not promises.`));
  box.append(pool);

  box.append(el('h3', '', 'Farm plan'));
  const ol = el('ol', 'steps');
  for (const s of r.farm_steps) ol.append(el('li', '', s));
  box.append(ol);
}

function render() {
  $('tab-board').className = 'tab' + (state.view === 'board' ? ' on' : '');
  $('tab-live').className = 'tab' + (state.view === 'live' ? ' on' : '');
  $('table').className = state.view === 'board' ? 'board-view' : 'live-view';
  const rows = visibleRows();
  if (state.view === 'board') boardTable(rows); else liveTable(rows);
  $('empty').hidden = rows.length > 0;
  $('count').textContent = rows.length + (state.view === 'board' ? ' pre-token protocols' : ' launched protocols');
  detail();
}

stats();
filters();
if (state.view === 'board') { state.sort = 'rank'; state.dir = 1; }
render();
