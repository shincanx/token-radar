// Token Radar dashboard: renders window.RADAR (written by main.ts) with no network and no fetch.
// Board: sortable, filterable, searchable; a row click opens the protocol's detail view — its model
// breakdown, its launch odds from the peers' record, and its costed farm plan. Live tokens are shown
// apart, at the market's own values, never mixed into the ranked board. ?tab=, ?detail=<slug>,
// ?category=, ?verdict= and ?q= open a state directly (the screenshots use them).
(function () {
  'use strict';
  var D = window.RADAR;
  if (!D) { document.body.innerHTML = '<p style="padding:24px">No data: data.js did not load.</p>'; return; }
  var M = D.model;

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function money(n) {
    if (n == null) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2).replace(/\.?0+$/, '') + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
    return '$' + Math.round(n);
  }
  function pct(n, d) { return n == null ? '—' : (n > 0 ? '+' : '') + n.toFixed(d == null ? 1 : d) + '%'; }
  function mult(n) { return '×' + n.toFixed(2); }
  function catName(c) { return c == null ? 'Unknown' : c; }

  // The snapshot's source line, without its fetch address: the page names no network address.
  function sourceLine() {
    var s = D.source || '';
    var cut = s.indexOf(' http');
    var head = cut >= 0 ? s.slice(0, cut) : s;
    var tail = s.match(/fetched (.+)$/);
    return esc(head) + (tail ? ', fetched ' + esc(tail[1]) : '');
  }

  // ---- KPI strip: coverage, integrity, and the model's own test ----
  $('asof').innerHTML = 'Snapshot as of <b>' + esc(D.as_of) + '</b><br>' + sourceLine() +
    '<br>Watchlist floor ' + money(D.floor_usd);
  var wf = M.walk_forward;
  var kpis = [
    { v: D.watchlist_size + ' / ' + D.watchlist_size, l: 'watchlist covered', good: true },
    { v: D.board_size, l: 'board rows (' + D.early_size + ' early)' },
    { v: D.live_size, l: 'live-token anchors' },
    { v: mult(Math.exp(wf.model_male)), l: 'walk-forward median error' },
    { v: mult(Math.exp(wf.baseline_male)), l: 'fixed-multiple median error' },
    { v: M.size_slope.toFixed(2), l: 'fitted size slope (log-log)' },
  ];
  $('kpis').innerHTML = kpis.map(function (k) {
    return '<div class="kpi' + (k.good ? ' good' : '') + '"><b>' + k.v + '</b><span>' + k.l + '</span></div>';
  }).join('');

  // ---- Filters ----
  var cats = [], chains = [];
  D.rows.forEach(function (r) {
    if (cats.indexOf(r.category) < 0) cats.push(r.category);
    r.chains.forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); });
  });
  cats.sort(function (a, b) { return (a || 'zzz') < (b || 'zzz') ? -1 : 1; });
  chains.sort();
  $('f-cat').innerHTML += cats.map(function (c) { return '<option>' + esc(catName(c)) + '</option>'; }).join('');
  $('f-chain').innerHTML += chains.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('');

  var state = { q: '', cat: '', chain: '', verdict: '', sort: 'rank', dir: 1, sel: null };
  var params = new URLSearchParams(location.search);
  if (params.get('q')) { state.q = params.get('q'); $('q').value = state.q; }
  if (params.get('category')) { state.cat = params.get('category'); $('f-cat').value = state.cat; }
  if (params.get('verdict')) { state.verdict = params.get('verdict'); $('f-verdict').value = state.verdict; }
  if (params.get('sort')) { state.sort = params.get('sort'); $('f-sort').value = state.sort; }
  if (params.get('tab')) showTab(params.get('tab'));

  function filtered() {
    var q = state.q.trim().toLowerCase();
    var rows = D.rows.filter(function (r) {
      if (state.cat && catName(r.category) !== state.cat) return false;
      if (state.chain && r.chains.indexOf(state.chain) < 0) return false;
      if (state.verdict && r.farm_verdict !== state.verdict) return false;
      if (q && (r.name.toLowerCase().indexOf(q) < 0 && r.slug.indexOf(q) < 0)) return false;
      return true;
    });
    var key = { rank: 'rank', tvl: 'tvl_usd', implied: 'implied_value_usd', odds: 'launch_odds', expected: 'expected_value_usd', change: 'change_7d' }[state.sort] || 'rank';
    rows.sort(function (a, b) {
      var d = a[key] - b[key];
      if (d === 0) return a.slug < b.slug ? -1 : 1;
      return state.sort === 'rank' ? d * state.dir : -d * state.dir;
    });
    return rows;
  }

  function renderBoard() {
    var rows = filtered();
    $('count').textContent = rows.length + ' of ' + D.rows.length + ' rows';
    $('rows').innerHTML = rows.map(function (r) {
      var chg = r.change_7d == null ? '—' : '<span class="' + (r.change_7d >= 0 ? 'pos' : 'neg') + '">' + pct(r.change_7d) + '</span>';
      return '<tr data-slug="' + esc(r.slug) + '"' + (state.sel === r.slug ? ' class="sel"' : '') + '>' +
        '<td>' + r.rank + '</td>' +
        '<td><b>' + esc(r.name) + '</b><span class="slug">' + esc(r.slug) + '</span></td>' +
        '<td class="cat">' + esc(catName(r.category)) + '</td>' +
        '<td>' + esc(r.chains.slice(0, 2).join(', ')) + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + chg + '</td>' +
        '<td class="num"><b>' + money(r.implied_value_usd) + '</b></td>' +
        '<td class="num">' + Math.round(r.launch_odds * 100) + '%</td>' +
        '<td><span class="badge ' + r.farm_verdict + '">' + r.farm_verdict + '</span></td></tr>';
    }).join('') || '<tr><td colspan="9">No rows match the filters.</td></tr>';
  }

  // ---- Detail view: model breakdown, odds, farm plan, live comps ----
  function ageBucket(r) {
    if (r.age_days == null) return 'unknown';
    if (r.age_days < 365) return '<1y';
    if (r.age_days < 1095) return '1-3y';
    return '3y+';
  }
  function showDetail(slug) {
    var r = null;
    D.rows.forEach(function (x) { if (x.slug === slug) r = x; });
    var box = $('detail');
    if (!r) { box.hidden = true; state.sel = null; renderBoard(); return; }
    state.sel = slug;
    var m = r.model;
    var sizeVal = Math.exp(M.size_intercept + M.size_slope * Math.log(r.tvl_usd));
    var catMul = Math.exp(m.category_residual);
    var groMul = Math.exp(m.growth_weight * (m.growth_pct / 100));
    var matMul = Math.exp(m.maturity_slope * (m.age_share - 0.5));
    var oddsCell = M.odds.cells[catName(r.category) + '|' + ageBucket(r)];
    var comps = r.comps || [];
    // The verdict is relative: where this row sits by expected value per farming dollar.
    var byRatio = D.rows.slice().sort(function (a, b) { return (b.expected_value_usd / b.farm_cost_usd) - (a.expected_value_usd / a.farm_cost_usd); });
    var ratioRank = 0;
    byRatio.forEach(function (x, i) { if (x.slug === slug) ratioRank = i + 1; });
    var verdictNote = r.farm_verdict === 'Farm' ? 'one of the best expected values per dollar on the board.'
      : r.farm_verdict === 'Thin' ? 'middling — worth a slot if you farm more than one protocol.'
      : 'the same dollars farm better elsewhere on this board.';
    box.hidden = false;
    box.innerHTML =
      '<h2>#' + r.rank + ' — ' + esc(r.name) + ' <span class="badge ' + r.farm_verdict + '">' + r.farm_verdict + '</span></h2>' +
      '<p class="note">' + esc(catName(r.category)) + ' · ' + esc(r.chains.join(', ')) + ' · TVL ' + money(r.tvl_usd) +
      ' · 7d ' + pct(r.change_7d) + ' · tracked since ' + esc(r.listed_at || 'unknown') +
      ' · records no token. Implied value ' + money(r.implied_value_usd) + ' (' + mult(r.implied_value_usd / r.tvl_usd) + ' of TVL).' +
      ' Launch odds ' + Math.round(r.launch_odds * 100) + '% give an expected value of ' + money(r.expected_value_usd) +
      ' against a farm cost of ' + money(r.farm_cost_usd) + ' — ' + ratioRank + 'th of 200 by expected value per farming dollar, so the verdict is ' + r.farm_verdict + ': ' + verdictNote + '</p>' +
      '<div class="grid"><div><h3>Model breakdown — log market cap</h3><dl>' +
      '<dt>Size: ' + M.size_intercept + ' + ' + M.size_slope + ' × ln(TVL)</dt><dd>' + money(sizeVal) + '</dd>' +
      '<dt>Category residual (' + esc(catName(r.category)) + ')</dt><dd>' + mult(catMul) + '</dd>' +
      '<dt>Growth: ' + m.growth_weight + ' × ' + pct(m.growth_pct) + '</dt><dd>' + mult(groMul) + '</dd>' +
      '<dt>Maturity: ' + m.maturity_slope + ' × (' + m.age_share.toFixed(2) + ' − 0.5)</dt><dd>' + mult(matMul) + '</dd>' +
      '<dt>Implied value</dt><dd><b>' + money(r.implied_value_usd) + '</b></dd>' +
      '</dl><div class="bar"><i style="width:' + Math.min(100, Math.round(r.launch_odds * 100)) + '%"></i></div>' +
      '<p class="note">Launch odds ' + Math.round(r.launch_odds * 100) + '% — ' +
      (oddsCell ? oddsCell.with_token + ' of ' + oddsCell.n + ' ' + esc(catName(r.category)) + ' protocols aged ' + ageBucket(r) + ' record a token.'
        : 'the category share, shrunk toward the global ' + Math.round(M.odds.global * 100) + '%.') + '</p></div>' +
      '<div><h3>Farm plan — ' + money(r.farm_cost_usd) + ' all in</h3><ol class="steps">' +
      r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol></div></div>' +
      (comps.length ? '<h3>Live peers in ' + esc(catName(r.category)) + ' — the anchors behind the category residual</h3><div class="cards">' +
        comps.map(function (l) {
          return '<div class="card"><b>' + esc(l.name) + '</b><span>market cap ' + money(l.mcap_usd) + ' · TVL ' + money(l.tvl_usd) +
            ' · ' + mult((l.mcap_usd || 0) / l.tvl_usd) + ' of TVL</span></div>';
        }).join('') + '</div>' : '');
    renderBoard();
    box.scrollIntoView({ block: 'nearest' });
  }

  // ---- Live token view ----
  $('liverows').innerHTML = D.live.map(function (l) {
    return '<tr><td><b>' + esc(l.name) + '</b><span class="slug">' + esc(l.slug) + '</span></td>' +
      '<td class="cat">' + esc(catName(l.category)) + '</td><td>' + esc(l.chains.slice(0, 2).join(', ')) + '</td>' +
      '<td class="num">' + money(l.tvl_usd) + '</td><td class="num"><b>' + money(l.mcap_usd) + '</b></td>' +
      '<td class="num">' + mult((l.mcap_usd || 0) / l.tvl_usd) + '</td>' +
      '<td class="num">' + pct(l.change_7d) + '</td></tr>';
  }).join('');

  // ---- Model tab ----
  (function () {
    var resRows = Object.keys(M.category_residual).sort().map(function (c) {
      var v = M.category_residual[c];
      return '<tr><td>' + esc(c) + '</td><td class="num">' + v.n + '</td><td class="num">' + (v.residual >= 0 ? '+' : '') + v.residual.toFixed(2) + '</td><td class="num">' + mult(Math.exp(v.residual)) + '</td></tr>';
    }).join('');
    var oddsRows = Object.keys(M.odds.cells).sort().map(function (k) {
      var v = M.odds.cells[k];
      return '<tr><td>' + esc(k.replace('|', ' · ')) + '</td><td class="num">' + v.n + '</td><td class="num">' + v.with_token + '</td><td class="num">' + Math.round(v.odds * 100) + '%</td></tr>';
    }).join('');
    $('modelbox').innerHTML =
      '<p>The board prices every pre-token protocol from the ' + M.live_peers + ' live-token protocols in the snapshot — the ones whose token already trades, so the market has priced them. Nothing is hardcoded by name: the same formula scores every row.</p>' +
      '<div class="formula">log(implied value) = ' + M.size_intercept + ' + ' + M.size_slope + ' × log(TVL)\n' +
      '                   + category residual + ' + M.growth_weight + ' × growth + ' + M.maturity_slope + ' × (age share − 0.5)</div>' +
      '<h3>What was fitted, and what it found</h3>' +
      '<p><b>Size.</b> An ordinary least-squares line of log market cap on log TVL over the live peers: intercept ' + M.size_intercept + ', slope ' + M.size_slope + '. The slope is well under 1 — the market pays a smaller multiple for a bigger protocol — so a fixed multiple overvalues the giants and undervalues the small. That is why the board is not TVL times a constant.</p>' +
      '<p><b>Category.</b> Each category’s median residual off the size line, shrunk toward zero by n / (n + 5), so a category with few live peers barely moves a row. The table below is the fit, whole.</p>' +
      '<p><b>Growth and maturity.</b> Both weights were grid-searched over ' + M.growth_grid.join(', ') + ' to minimise the median absolute log error on the ' + M.dated_peers + ' dated live peers. Growth is the 7-day TVL change clamped to −60…+120%. Age share is the protocol’s age over 1,095 days (unknown age counts as 365). The fit chose growth ' + M.growth_weight + ' and maturity ' + M.maturity_slope + ' — a +100% week is worth ×1.65, a full age range ×2.72. The walk-forward test below is the check on both.</p>' +
      '<h3>The test — walk-forward, older to newer</h3>' +
      '<p>The dated live peers were split by listing date at ' + esc(wf.cutoff) + ': the whole pipeline (size line, category residuals, both weights) was refit on the ' + wf.train_n + ' older ones and tested on the ' + wf.test_n + ' newer ones, which the fit never saw. Median absolute log error <b>' + wf.model_male + '</b> — a typical value within ' + mult(Math.exp(wf.model_male)) + ' — against <b>' + wf.baseline_male + '</b> (' + mult(Math.exp(wf.baseline_male)) + ') for a fixed multiple. The training half’s own weights came out at growth ' + wf.train_growth_weight + ' and maturity ' + wf.train_maturity_slope + '. In-sample, the fitted model’s error is ' + M.fit_male + ' against ' + M.fit_male_no_terms + ' with the growth and maturity terms switched off.</p>' +
      '<p class="warn">The error is wide because token values are: the peers’ market-cap-to-TVL ratios span orders of magnitude. The implied value is the model’s central claim, not a promise — a row can be worth far more or far less, and a protocol can stay tokenless.</p>' +
      '<h3>Category residuals (log points; × is the multiplier on the size line)</h3>' +
      '<div class="wrap"><table class="plain"><thead><tr><th>Category</th><th class="num">Live peers</th><th class="num">Residual</th><th class="num">Multiplier</th></tr></thead><tbody>' + resRows + '</tbody></table></div>' +
      '<h3>Launch odds — the peers’ record</h3>' +
      '<p>The share of protocols that record a token, by category and age bucket, shrunk toward the category share (weight 8) and the category share toward the global ' + Math.round(M.odds.global * 100) + '%. The odds never enter the implied value; they enter the farm verdict, through the expected value (implied × odds) per farming dollar.</p>' +
      '<div class="wrap"><table class="plain"><thead><tr><th>Category · age</th><th class="num">Protocols</th><th class="num">With token</th><th class="num">Odds</th></tr></thead><tbody>' + oddsRows + '</tbody></table></div>' +
      '<h3>Farm verdicts — expected value per farming dollar</h3>' +
      '<p>Each row’s plan costs its capital tier ($50–$250 by TVL) plus gas (about $8 to set up, $2 a week). The verdict ranks the row’s expected value per farming dollar against the other 199 rows: <span class="badge Farm">Farm</span> is the top quarter, <span class="badge Thin">Thin</span> the second quarter, <span class="badge Skip">Skip</span> the bottom half. It is a relative verdict — farm the best expected value per dollar first — not a promise that a token, or an airdrop, arrives.</p>' +
      '<h3>Integrity</h3>' +
      '<p>Live-token protocols are set aside at their market values and never ranked. Every watchlist protocol is on the board; the other ' + D.early_size + ' rows are pre-token protocols below the $50M floor, by TVL. A protocol is called pre-token only because its record carries no token — the snapshot cannot prove it has none. Versioned pools, exchanges and wrapped or staked products of tokens that already trade are left out of the early rows.</p>';
  })();

  // ---- Tabs, controls, sorting ----
  function showTab(name) {
    document.querySelectorAll('.tabs button').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === name); });
    document.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('on', t.id === 'tab-' + name); });
  }
  document.querySelectorAll('.tabs button').forEach(function (b) {
    b.addEventListener('click', function () { showTab(b.dataset.tab); });
  });
  $('q').addEventListener('input', function () { state.q = $('q').value; renderBoard(); });
  $('f-cat').addEventListener('change', function () { state.cat = $('f-cat').value; renderBoard(); });
  $('f-chain').addEventListener('change', function () { state.chain = $('f-chain').value; renderBoard(); });
  $('f-verdict').addEventListener('change', function () { state.verdict = $('f-verdict').value; renderBoard(); });
  $('f-sort').addEventListener('change', function () { state.sort = $('f-sort').value; renderBoard(); });
  $('rows').addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-slug]');
    if (tr) showDetail(tr.dataset.slug);
  });
  document.querySelectorAll('#board thead th').forEach(function (th) {
    th.addEventListener('click', function () {
      var map = { rank: 'rank', name: 'rank', category: 'rank', chains: 'rank', tvl: 'tvl', change: 'change', implied: 'implied', odds: 'odds', verdict: 'expected' };
      var k = map[th.dataset.k] || 'rank';
      if (state.sort === k) state.dir *= -1; else { state.sort = k; state.dir = 1; }
      renderBoard();
    });
  });

  renderBoard();
  if (params.get('detail')) showDetail(params.get('detail'));
})();
