/* ============================================================
   Snow Pavilion — Trading Dashboard V4
   main.js — ONE FILE, all sections wired
   Port: 5004
   ============================================================ */

'use strict';

// ════════════════════════════════════════════════════════════
//  STATE
// ════════════════════════════════════════════════════════════
const STATE = {
  theme: localStorage.getItem('v4-theme') || 'dark',
  showBalance: localStorage.getItem('v4-showbal') !== 'false',
  autoRefresh: true,
  autoCountdown: 30,
  autoTimer: null,
  clockTimer: null,
  activeSection: 'overview',
  _newsLastFetch: 0,
  activeScreener: null,
  activeSmTab: 'liquidations',
  equityChart: null,
  smCollapsed: false,
  pin: null, // loaded from /api/bybit/status
  // News filters
  macroFilter: 'all',
  macroItems: [],
  // Calendar filters
  calRanges:     ['today'],  // default: today
  calImpacts:    [],         // empty = All impacts
  calCurrencies: ['USD'],  // V4.1 default: US only (region filter; toggle UK/Japan/etc. to add)
  calItems:      [],
  calAllCurrencies: false,
};

// ════════════════════════════════════════════════════════════
//  INIT
// ════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  // Migrate old lockscreen keys (lockscreen-{id}-{mode} → lockscreen-{id})
  ['snow','lotus','phoenix','bamboo','moon'].forEach(id => {
    const newKey = `v4-img-lockscreen-${id}`;
    if (!localStorage.getItem(newKey)) {
      const dark  = localStorage.getItem(`v4-img-lockscreen-${id}-dark`);
      const light = localStorage.getItem(`v4-img-lockscreen-${id}-light`);
      if (dark || light) localStorage.setItem(newKey, dark || light);
    }
  });
  applyTheme(STATE.theme);
  applyBalance(STATE.showBalance);
  startClock();
  startAutoRefresh();
  spawnSakura();
  setImages();
  loadAutosave();
  loadOverview();
  setDefaultDates();
  loadHistoryYears();
  startAlertPolling();       // Start price alert engine
  _startCalendarAlertTimer(); // Start calendar 30min/1hr countdown
  loadProfileList();          // Populate header avatar with active profile on boot

  // Request notification permission proactively
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  // greeting
  updateGreeting();
});

// ════════════════════════════════════════════════════════════
//  UTILITIES
// ════════════════════════════════════════════════════════════

// ── Toast notifications ─────────────────────────────────────
window.showToast = function(msg, type) {
  type = type || 'ok';
  var col = type === 'error' ? '#E05252'
          : type === 'warn'  ? '#c8a84b'
          : '#4CAF82';

  // Get or create container
  var box = document.getElementById('_toastBox');
  if (!box) {
    box = document.createElement('div');
    box.id = '_toastBox';
    box.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
    document.body.appendChild(box);
  }

  var t = document.createElement('div');
  t.style.cssText = 'padding:10px 16px;border-radius:10px;font-size:12px;font-weight:600;'
    + 'background:#1e1e32;border:1px solid ' + col + ';color:' + col + ';'
    + 'box-shadow:0 4px 20px rgba(0,0,0,.4);pointer-events:auto;'
    + 'max-width:340px;line-height:1.4;animation:toastIn .2s ease;';
  t.textContent = msg;
  box.appendChild(t);

  setTimeout(function() {
    t.style.opacity = '0';
    t.style.transition = 'opacity .3s';
    setTimeout(function() { t.remove(); }, 300);
  }, 3500);
};

async function api(url, opts = {}) {
  try {
    const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
    return await res.json();
  } catch (e) {
    console.warn('API error', url, e);
    return { status: 'error', message: String(e) };
  }
}

function fmt$(n, decimals = 2) {
  if (n == null || isNaN(n)) return '–';
  const v = parseFloat(n);
  return (v >= 0 ? '+' : '') + '$' + Math.abs(v).toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
function fmtUSD(n, decimals = 2) {
  if (n == null || isNaN(n)) return '–';
  const v = parseFloat(n);
  return '$' + Math.abs(v).toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
function fmtPct(n) {
  if (n == null || isNaN(n)) return '–';
  return (parseFloat(n) >= 0 ? '+' : '') + parseFloat(n).toFixed(2) + '%';
}
function pnlClass(n) { return parseFloat(n) >= 0 ? 'pnl-pos' : 'pnl-neg'; }
function sideTag(s) {
  const lower = (s || '').toLowerCase();
  if (lower === 'buy' || lower === 'long') return `<span class="tag long">LONG</span>`;
  return `<span class="tag short">SHORT</span>`;
}
function resultTag(r) {
  if (r === 'W' || r === 'P') return `<span class="tag profit">W</span>`;
  if (r === 'L') return `<span class="tag loss">L</span>`;
  if (r === 'BE') return `<span class="tag be">BE</span>`;
  return `<span class="tag" style="color:var(--text-3)">–</span>`;
}

// Auto-determine result from PnL for display purposes (when result is null)
function autoResult(pnl) {
  const v = parseFloat(pnl);
  if (isNaN(v)) return null;
  if (v > 0.5)  return 'W';
  if (v < -0.5) return 'L';
  return 'BE';
}
function truncate(str, n = 60) { return str && str.length > n ? str.slice(0, n) + '…' : (str || '–'); }

// ════════════════════════════════════════════════════════════
//  THEME
// ════════════════════════════════════════════════════════════
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  STATE.theme = t;
  localStorage.setItem('v4-theme', t);
}
function toggleTheme() {
  applyTheme(STATE.theme === 'dark' ? 'light' : 'dark');
  setImages();
}

// ════════════════════════════════════════════════════════════
//  BALANCE VISIBILITY
// ════════════════════════════════════════════════════════════
function applyBalance(show) {
  STATE.showBalance = show;
  localStorage.setItem('v4-showbal', show);
  document.body.classList.toggle('balance-hidden', !show);
  document.querySelectorAll('.kpi .value, #histTotalPnl').forEach(el => {
    el.classList.toggle('balance-val', true);
  });
}
function toggleBalance() { applyBalance(!STATE.showBalance); }

// ════════════════════════════════════════════════════════════
//  CLOCK
// ════════════════════════════════════════════════════════════
function startClock() {
  function tick() {
    const now = new Date();
    const wib = now.toLocaleTimeString('en-GB', { hour12: false, timeZone: 'Asia/Jakarta' }).slice(0,5);
    const utc = now.toLocaleTimeString('en-GB', { hour12: false, timeZone: 'UTC' }).slice(0,5);
    document.getElementById('clockWib').textContent = wib;
    document.getElementById('clockUtc').textContent = utc;
    // update greeting hour
    updateGreeting();
  }
  tick();
  STATE.clockTimer = setInterval(tick, 1000);
}

function updateGreeting() {
  const h = new Date().getHours();
  let en, zh;
  if (h < 5)       { en = 'Late night';      zh = '深夜好'; }
  else if (h < 11) { en = 'Good morning';    zh = '早上好'; }
  else if (h < 15) { en = 'Good afternoon';  zh = '下午好'; }
  else if (h < 19) { en = 'Good afternoon';  zh = '下午好'; }
  else if (h < 22) { en = 'Good evening';    zh = '晚上好'; }
  else             { en = 'Good night';       zh = '夜安'; }

  const dateStr = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const greetEl = document.getElementById('headerGreetEn');
  const zhEl    = document.getElementById('headerGreetZh');
  const dateEl  = document.getElementById('headerDate');
  if (greetEl) greetEl.innerHTML = `${en}, <strong>${(window.APP_CFG && window.APP_CFG.displayName) || 'Trader'}</strong>`;
  if (zhEl)    zhEl.textContent = zh;
  if (dateEl)  dateEl.textContent = dateStr;
}

// ════════════════════════════════════════════════════════════
//  AUTO REFRESH
// ════════════════════════════════════════════════════════════
function startAutoRefresh() {
  STATE.autoCountdown = 30;
  clearInterval(STATE.autoTimer);
  STATE.autoTimer = setInterval(() => {
    if (!STATE.autoRefresh) return;
    STATE.autoCountdown--;
    updateAutoRefreshPill();
    if (STATE.autoCountdown <= 0) {
      STATE.autoCountdown = 30;
      refreshCurrentSection();
    }
  }, 1000);
  updateAutoRefreshPill();
}

function updateAutoRefreshPill() {
  const dot = document.getElementById('autoRefreshDot');
  const lbl = document.getElementById('autoRefreshLabel');
  if (!lbl) return;
  if (STATE.autoRefresh) {
    const newsIn = Math.max(0, Math.ceil((_NEWS_REFRESH_MS - (Date.now() - STATE._newsLastFetch)) / 60000));
    lbl.textContent = STATE.activeSection === 'overview'
      ? `KPIs·${String(STATE.autoCountdown).padStart(2,'0')}s  News·${newsIn}m`
      : `AUTO · ${String(STATE.autoCountdown).padStart(2,'0')}s`;
    if (dot) dot.style.background = 'var(--jade)';
  } else {
    lbl.textContent = 'PAUSED';
    if (dot) dot.style.background = 'var(--muted)';
  }
}

function toggleAutoRefresh() {
  STATE.autoRefresh = !STATE.autoRefresh;
  updateAutoRefreshPill();
}

function manualRefresh() {
  const icon = document.getElementById('refreshIcon');
  if (icon) icon.classList.add('spinning');
  refreshCurrentSection();
  setTimeout(() => { if (icon) icon.classList.remove('spinning'); }, 1200);
  STATE.autoCountdown = 30;
}

// Universal refresh-button wrapper: shows spinning state for any ↻ button
function refreshBtn(btn, fn) {
  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinning" style="display:inline-block;">↻</span>';
  Promise.resolve(typeof fn === 'function' ? fn() : null)
    .finally(() => { btn.disabled = false; btn.innerHTML = orig; });
}

function refreshCurrentSection() {
  switch (STATE.activeSection) {
    case 'overview':  _autoRefreshOverview(); break;
    case 'screener':  break; // manual only
    case 'positions': loadPositions(); loadOrders(); loadAlerts(); loadAlertHistory(); break;
    case 'journal':   loadJournal(); break;
    case 'history':   loadYearStats(); break;
  }
}

// ════════════════════════════════════════════════════════════
//  SECTION NAVIGATION
// ════════════════════════════════════════════════════════════
function _mobileNavActive(btn) {
  document.querySelectorAll('.mobile-nav-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

function switchSection(id) {
  // hide all
  document.querySelectorAll('.page-frame').forEach(s => s.style.display = 'none');
  // show target
  const el = document.getElementById(`sec-${id}`);
  if (el) { el.style.display = ''; el.style.animation = 'none'; requestAnimationFrame(() => { el.style.animation = ''; }); }
  // update nav (desktop rail + mobile bottom nav)
  document.querySelectorAll('.rail-item').forEach(b => b.classList.toggle('active', b.dataset.section === id));
  document.querySelectorAll('.mobile-nav-btn').forEach(b => b.classList.toggle('active', b.dataset.section === id));
  STATE.activeSection = id;
  STATE.autoCountdown = 30;

  // lazy-load on first switch
  if (id === 'positions')     { loadPositions(); loadOrders(); loadAlerts(); loadAlertHistory(); loadBybitStatus(); loadSymbols(); }
  if (id === 'journal')       { populateJournalMonthFilter(); loadJournal(); }
  if (id === 'history')       { loadHistoryInit(); }
  // spot-screener loads on demand (Scan Now button)
}

// ════════════════════════════════════════════════════════════
//  IMAGES
// ════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════
//  IMAGE SWAP UI
// ════════════════════════════════════════════════════════════
const _IMG_BASE   = new URL('static/img/art/', document.baseURI).href;   // built-in art — all generated by scripts/make_art.py (original, SFW)
const _WP_BASE    = new URL('static/img/art/', document.baseURI).href;

const _LANDSCAPES_DARK = [
  { file: 'hero-dark.jpg',    label: 'Moon Pavilion' },
  { file: 'banner-dark.jpg',  label: 'Star River' },
  { file: 'ridges-dark.jpg',  label: 'Snow Ridges' },
];
const _LANDSCAPES_LIGHT = [
  { file: 'hero-light.jpg',   label: 'Dawn Pavilion' },
  { file: 'banner-light.jpg', label: 'Morning Mist' },
  { file: 'ridges-light.jpg', label: 'Ink Ridges' },
];

const _IMG_CATALOG = {
  hero:     { dark: _LANDSCAPES_DARK,  light: _LANDSCAPES_LIGHT },
  mascot: {
    dark:  [ { file: 'emblem-dark.jpg',  label: 'Moon Seal' }, { file: 'lock-moon.jpg', label: 'Full Moon' } ],
    light: [ { file: 'emblem-light.jpg', label: 'Ink Seal' },  { file: 'hero-light.jpg', label: 'Dawn' } ],
  },
  // Banner 2 — same landscape catalog as Hero
  portrait: { dark: [_LANDSCAPES_DARK[1], _LANDSCAPES_DARK[0], _LANDSCAPES_DARK[2]],
              light: [_LANDSCAPES_LIGHT[1], _LANDSCAPES_LIGHT[0], _LANDSCAPES_LIGHT[2]] },
  wallpaper: {
    dark: [
      { file: _WP_BASE + 'wallpaper-dark.jpg',             label: 'Snow Pavilion', full: true },
      { grad: 'linear-gradient(135deg,#1a1a2e 0%,#0d1b2a 40%,#1a1a2e 100%)',            label: '⬛ Pure Ink' },
      { grad: 'radial-gradient(ellipse at 20% 30%,#1e3a5f 0%,#0a0a1a 55%,#1a0a2e 100%)',label: '🌌 Midnight' },
      { grad: 'linear-gradient(135deg,#1a0a0a 0%,#2d0d0d 40%,#1a0505 100%)',            label: '🔴 Crimson Night' },
      { grad: 'linear-gradient(160deg,#0a1a0f 0%,#0d2416 45%,#071510 100%)',             label: '🌲 Forest Dark' },
      { grad: 'linear-gradient(135deg,#0d1a2e 0%,#0a2a1a 35%,#1a0d2e 70%,#0d1a2e 100%)',label: '🌠 Aurora' },
      { file: _WP_BASE + 'ridges-dark.jpg',                label: 'Snow Ridges',  full: true },
      { file: _WP_BASE + 'banner-dark.jpg',                label: 'Star River',   full: true },
    ],
    light: [
      { file: _WP_BASE + 'wallpaper-light.jpg',            label: 'Dawn Pavilion',full: true },
      { grad: 'linear-gradient(135deg,#FAF7F0 0%,#f0e8d8 50%,#ede0cc 100%)',            label: '📜 Parchment' },
      { grad: 'linear-gradient(160deg,#f0f4f8 0%,#d9e8d4 50%,#e8f0e4 100%)',            label: '🍃 Soft Jade' },
      { grad: 'linear-gradient(135deg,#fff0f3 0%,#fde0e8 45%,#f8d7e8 100%)',            label: '🌸 Rose Dawn' },
      { grad: 'linear-gradient(160deg,#e8f4fd 0%,#d0e8f7 50%,#c8e0f5 100%)',            label: '☁ Sky Blue' },
      { grad: 'linear-gradient(135deg,#fffbec 0%,#fef3c7 45%,#fde68a 100%)',            label: '🌅 Golden Hour' },
      { file: _WP_BASE + 'ridges-light.jpg',               label: 'Ink Ridges',   full: true },
      { file: _WP_BASE + 'banner-light.jpg',               label: 'Morning Mist', full: true },
    ],
  },
  // Lockscreen pavilion cards — all 5 slots share the same image pool; user customises per slot
  lockscreen: (function() {
    const imgs = [
      { file: 'lock-snow.jpg',   label: 'Snowfall' },
      { file: 'lock-lotus.jpg',  label: 'Lotus Pond' },
      { file: 'lock-aurora.jpg', label: 'Aurora' },
      { file: 'lock-bamboo.jpg', label: 'Bamboo' },
      { file: 'lock-moon.jpg',   label: 'Full Moon' },
    ];
    const out = {};
    ['snow','lotus','phoenix','bamboo','moon'].forEach(id => { out[id] = imgs; });
    return out;
  })(),
};

const _IMG_DEFAULTS = {
  'hero-dark':              _IMG_BASE + 'hero-dark.jpg',
  'hero-light':             _IMG_BASE + 'hero-light.jpg',
  'mascot-dark':            _IMG_BASE + 'emblem-dark.jpg',
  'mascot-light':           _IMG_BASE + 'emblem-light.jpg',
  'portrait-dark':          _IMG_BASE + 'banner-dark.jpg',
  'portrait-light':         _IMG_BASE + 'banner-light.jpg',
  'wallpaper-dark':         _IMG_BASE + 'wallpaper-dark.jpg',
  'wallpaper-light':        _IMG_BASE + 'wallpaper-light.jpg',
  // Lockscreen pavilion cards — per slot
  'lockscreen-snow':    _IMG_BASE + 'lock-snow.jpg',
  'lockscreen-lotus':   _IMG_BASE + 'lock-lotus.jpg',
  'lockscreen-phoenix': _IMG_BASE + 'lock-aurora.jpg',
  'lockscreen-bamboo':  _IMG_BASE + 'lock-bamboo.jpg',
  'lockscreen-moon':    _IMG_BASE + 'lock-moon.jpg',
};

// ── CUSTOM IMAGE CATALOG (user additions stored in localStorage) ──────
const _CUSTOM_CAT_KEY = 'v4-img-custom';
function _getCustomCatalog() {
  try { return JSON.parse(localStorage.getItem(_CUSTOM_CAT_KEY) || '{}'); } catch { return {}; }
}
function _saveCustomCatalog(cat) {
  try {
    localStorage.setItem(_CUSTOM_CAT_KEY, JSON.stringify(cat));
  } catch(e) {
    const msgEl = document.getElementById('imgAddMsg');
    if (msgEl) { msgEl.style.color = 'var(--cinnabar)'; msgEl.textContent = '⚠ Storage full — delete some custom images first'; }
    else showToast('Storage full — remove some custom images', 'error');
  }
}
/// Returns built-in + custom items merged; custom items get _custom:true + _ci (index in custom array)
// For lockscreen, mode key is "{pavilion}-{mode}" (e.g. "snow-dark")
// V4.1 — per-bucket hidden list (works for ALL sections, not just lockscreen)
function _hiddenKey() {
  // Shared pool: hidden list is per-SECTION (applies to both dark+light); lock stays per-pavilion
  return _imgSwap.section === 'lockscreen'
    ? `v4-hidden-lockscreen-${_imgSwap.pavilion}`
    : `v4-hidden-${_imgSwap.section}`;
}
function _getHidden() { try { return JSON.parse(localStorage.getItem(_hiddenKey()) || '[]'); } catch { return []; } }
function _hideBuiltin(file) {
  const h = _getHidden();
  if (!h.includes(file)) { h.push(file); localStorage.setItem(_hiddenKey(), JSON.stringify(h)); }
  _renderImgGrid();
}
function _restoreHidden() { localStorage.removeItem(_hiddenKey()); _renderImgGrid(); }

function _getMergedItems() {
  const s = _imgSwap.section;
  const hidden = _getHidden();
  // Lock screen keeps its per-pavilion buckets (unchanged)
  if (s === 'lockscreen') {
    const m = _imgSwap.pavilion;
    let builtIn = (_IMG_CATALOG[s] || {})[m] || [];
    if (hidden.length) builtIn = builtIn.filter(it => !hidden.includes(it.file));
    const custom = (_getCustomCatalog()[s] || {})[m] || [];
    return [
      ...builtIn.map(it => ({ ...it, _builtin: true })),
      ...custom.map((it, ci) => ({ ...it, _custom: true, _cbucket: m, _ci: ci })),
    ];
  }
  // Dark/Light surfaces → ONE SHARED pool: all built-ins (both modes, deduped) + all custom buckets.
  // The Dark/Light buttons only decide which mode the clicked image gets assigned to.
  const catB = _IMG_CATALOG[s] || {};
  const seen = new Set();
  let builtIn = [...(catB.dark || []), ...(catB.light || [])].filter(it => {
    if (seen.has(it.file)) return false; seen.add(it.file); return true;
  });
  if (hidden.length) builtIn = builtIn.filter(it => !hidden.includes(it.file));
  const cc = _getCustomCatalog()[s] || {};
  const custom = [];
  ['shared', 'dark', 'light'].forEach(b =>
    (cc[b] || []).forEach((it, ci) => custom.push({ ...it, _custom: true, _cbucket: b, _ci: ci })));
  return [...builtIn.map(it => ({ ...it, _builtin: true })), ...custom];
}

// Compute the effective storage key for the current swap state
function _imgSwapKey() {
  return _imgSwap.section === 'lockscreen'
    ? `lockscreen-${_imgSwap.pavilion}`
    : `${_imgSwap.section}-${_imgSwap.mode}`;
}

function _getCustomImg(key) {
  const stored = localStorage.getItem(`v4-img-${key}`);
  if (!stored) return _IMG_DEFAULTS[key] || null;
  if (stored.startsWith('CIDX::')) {
    // Compact reference: CIDX::section::modeOrPavilion::catalogIndex
    const parts = stored.split('::');
    const sec = parts[1], m = parts[2], ci = parseInt(parts[3]);
    const catalog = _getCustomCatalog();
    const item = ((catalog[sec] || {})[m] || [])[ci];
    if (!item) return _IMG_DEFAULTS[key] || null;  // stale — item was deleted
    return item.full ? item.file : _IMG_BASE + item.file;
  }
  return stored;
}
function _setCustomImg(key, src) {
  try {
    localStorage.setItem(`v4-img-${key}`, src);
  } catch(e) {
    showToast('Storage full — delete some custom images to free space', 'error');
  }
}

// State for the modal
const _imgSwap = { section: 'hero', mode: 'dark', pavilion: 'snow' };

function openImgSwap() {
  _imgSwap.mode = STATE.theme || 'dark';
  const overlay = document.getElementById('imgSwapOverlay');
  if (overlay) overlay.style.display = 'block';
  _syncImgModeButtons();
  _hideAddForm();
  _renderImgGrid();
}
function closeImgSwap() {
  const overlay = document.getElementById('imgSwapOverlay');
  if (overlay) overlay.style.display = 'none';
  _hideAddForm();
}
function switchImgSection(sec, btn) {
  _imgSwap.section = sec;
  document.querySelectorAll('.img-swap-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  _hideAddForm();
  const grid    = document.getElementById('imgSwapGrid');
  const pavPick = document.getElementById('lsPavilionPicker');
  if (grid) {
    const portrait3col = sec === 'lockscreen';  // portrait is now Hero-style (landscape grid)
    grid.style.gridTemplateColumns = portrait3col ? 'repeat(3,1fr)' : 'repeat(2,1fr)';
    grid.classList.toggle('portrait-mode', portrait3col);
  }
  if (pavPick) pavPick.style.display = sec === 'lockscreen' ? 'block' : 'none';
  // Dark/Light tabs show for every dark/light surface (incl. wallpaper); hidden only for lock
  const modeTabs = document.getElementById('imgSwapModeTabs');
  if (modeTabs) modeTabs.style.display = sec === 'lockscreen' ? 'none' : '';
  _renderImgGrid();
}

function switchLsPavilion(id, btn) {
  _imgSwap.pavilion = id;
  document.querySelectorAll('.ls-pav-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  _hideAddForm();
  _renderImgGrid();
}
function switchImgMode(mode) {
  _imgSwap.mode = mode;
  _syncImgModeButtons();
  _hideAddForm();
  _renderImgGrid();
}
function _syncImgModeButtons() {
  const d = document.getElementById('imgModeTabDark');
  const l = document.getElementById('imgModeTabLight');
  if (!d || !l) return;
  if (_imgSwap.mode === 'dark') {
    d.className = 'btn sm';  l.className = 'btn sm ghost';
  } else {
    d.className = 'btn sm ghost'; l.className = 'btn sm';
  }
}

// Returns the stored value to put in localStorage / apply
// Gradient items store "GRAD::<css>" so setImages() knows not to wrap in url()
function _resolveItemValue(item) {
  if (item.grad) return 'GRAD::' + item.grad;
  if (item.full) return item.file;
  return _IMG_BASE + item.file;
}
// Returns a compact STORAGE reference for custom items (avoids duplicating large data URLs)
// Built-in/grad items return the same value as _resolveItemValue
function _resolveItemRef(item) {
  if (item._custom) {
    const s = _imgSwap.section;
    // Custom items carry their own bucket (shared/dark/light or pavilion) from the merged pool
    const bucket = item._cbucket || (s === 'lockscreen' ? _imgSwap.pavilion : 'shared');
    return `CIDX::${s}::${bucket}::${item._ci}`;
  }
  return _resolveItemValue(item);
}
// Convert stored value → CSS background-image value
function _storedToCss(stored) {
  if (!stored) return 'none';
  if (stored.startsWith('GRAD::')) return stored.slice(6);  // raw CSS gradient
  return `url('${stored}')`;                                 // quoted — handles spaces in filenames
}

function _renderImgGrid() {
  const grid = document.getElementById('imgSwapGrid');
  if (!grid) return;
  const items = _getMergedItems();
  const key   = _imgSwapKey();
  const cur   = _getCustomImg(key);

  const thumbs = items.map((item, i) => {
    const val = _resolveItemValue(item);
    const isSelected = (val === cur);
    const isGrad = !!item.grad;
    const src = item.full ? item.file : _IMG_BASE + item.file;
    const objPos = _getItemBgPos(item);
    const thumbContent = isGrad
      ? `<div style="width:100%;height:100%;background:${item.grad};"></div>`
      : `<img src="${src}" alt="${item.label}" loading="lazy" style="object-position:${objPos};" onerror="this.style.display='none'"/>`;
    // V4.1 — all items deletable in every section (built-ins hidden, customs truly removed)
    const delBtn = item._builtin
      ? `<button class="img-thumb-delete" onclick="event.stopPropagation();_hideBuiltin('${item.file}')" title="Remove">✕</button>`
      : item._custom
        ? `<button class="img-thumb-delete" onclick="event.stopPropagation();_deleteCustomItem('${item._cbucket}',${item._ci})" title="Remove">✕</button>`
        : '';
    const editBtn = isGrad ? ''
      : `<button class="img-thumb-edit" onclick="event.stopPropagation();_openEditItem(${i})" title="Edit position">✎</button>`;
    // Lockscreen: show assigned pavilion badges
    let assignedBadge = '';
    if (_imgSwap.section === 'lockscreen' && !isGrad) {
      const assignedGlyphs = LS_PAVILIONS
        .filter(p => { const s = _getCustomImg(`lockscreen-${p.id}`); return s && s === val; })
        .map(p => p.glyph);
      if (assignedGlyphs.length)
        assignedBadge = `<div class="img-thumb-assigned">${assignedGlyphs.join(' ')}</div>`;
    }
    return `<div class="img-thumb-card${isSelected ? ' selected' : ''}" onclick="applyImg(${i})" title="${item.label}">
      ${thumbContent}
      <div class="img-thumb-label">${item.label}</div>
      <div class="img-thumb-check">✓</div>
      ${assignedBadge}${delBtn}${editBtn}
    </div>`;
  });

  // "+" add card at the end
  thumbs.push(`<div class="img-thumb-card img-thumb-add" onclick="_toggleAddForm()" title="Add custom image">
    <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:28px;color:var(--jade);opacity:.8;">＋</div>
    <div class="img-thumb-label">Add Custom</div>
  </div>`);

  grid.innerHTML = thumbs.join('');

  // Show "Restore hidden" link if any built-ins are hidden in this bucket (any section)
  const restoreEl = document.getElementById('lsRestoreHidden');
  if (restoreEl) restoreEl.remove();
  const hidden = _getHidden();
  if (hidden.length) {
    const el = document.createElement('div');
    el.id = 'lsRestoreHidden';
    el.style.cssText = 'text-align:center;padding:8px 0 0;font-size:11px;color:var(--text-3);cursor:pointer;';
    el.innerHTML = `↩ Restore ${hidden.length} hidden image${hidden.length > 1 ? 's' : ''}`;
    el.onclick = _restoreHidden;
    grid.parentElement.appendChild(el);
  }
}

function applyImg(index) {
  const items = _getMergedItems();
  const item  = items[index];
  if (!item) return;
  const ref = _resolveItemRef(item);   // compact ref for storage (CIDX:: for custom, path for built-in)
  const val = _resolveItemValue(item); // full value for CSS/src (always data URL or path)
  const key = _imgSwapKey();
  _setCustomImg(key, ref);  // store compact reference — assigns to the CURRENT mode only (per-mode selection)

  // Re-render grid to show selection
  _renderImgGrid();

  // Wallpapers apply immediately regardless of mode — hero/mascot respect theme mode
  const dark = STATE.theme === 'dark';
  const activeMode = dark ? 'dark' : 'light';
  if (_imgSwap.section !== 'wallpaper' && _imgSwap.section !== 'lockscreen' && _imgSwap.mode !== activeMode) {
    const status = document.getElementById('imgSwapStatus');
    if (status) status.textContent = `✓ Saved — will apply on ${_imgSwap.mode} mode switch`;
    return;
  }

  const cssVal = _storedToCss(val);
  const bgPos  = _getItemBgPos(item);
  const bgSize = _zoomToBgSize(_getItemZoom(item));

  // Persist position + zoom so setImages() can restore on reload
  localStorage.setItem('v4-img-' + key + '-pos',  bgPos);
  localStorage.setItem('v4-img-' + key + '-zoom', _getItemZoom(item));

  // Apply immediately
  if (_imgSwap.section === 'hero') {
    const heroBg = document.getElementById('heroBg');
    if (heroBg) {
      heroBg.style.opacity = '0';
      setTimeout(() => {
        heroBg.style.backgroundImage    = cssVal;
        heroBg.style.backgroundPosition = bgPos;
        heroBg.style.backgroundSize     = bgSize;
        heroBg.style.opacity = '1';
      }, 300);
    }
  } else if (_imgSwap.section === 'mascot') {
    const mp = document.getElementById('mascotPortrait');
    _fadeSwapBg(mp, val.startsWith('GRAD::') ? null : (item.full ? item.file : _IMG_BASE + item.file), 500);
    if (mp && !item.grad) setTimeout(() => {
      mp.style.backgroundPosition = bgPos;
      mp.style.backgroundSize     = bgSize;
    }, 320);
    const av = document.getElementById('headerAvatar');
    if (av && !item.grad) av.style.backgroundImage = `url(${item.full ? item.file : _IMG_BASE + item.file})`;
    const lh = document.getElementById('lockHero');
    if (lh && !item.grad) lh.style.backgroundImage = `url(${item.full ? item.file : _IMG_BASE + item.file})`;
  } else if (_imgSwap.section === 'portrait') {
    const pbg = document.getElementById('xbPortraitBg');   // Hero-style bg layer
    if (pbg) {
      pbg.style.opacity = '0';
      setTimeout(() => {
        pbg.style.backgroundImage    = cssVal;
        pbg.style.backgroundPosition = bgPos;
        pbg.style.backgroundSize     = bgSize;
        pbg.style.opacity = '1';
      }, 300);
    }
  } else if (_imgSwap.section === 'lockscreen') {
    const pavIdx = LS_PAVILIONS.findIndex(p => p.id === _imgSwap.pavilion);
    const pImg   = document.getElementById(`lsCardImg${pavIdx}`);
    const src    = item.full ? item.file : _IMG_BASE + item.file;
    if (pImg) {
      pImg.style.opacity = '0';
      pImg.style.transition = 'opacity .35s';
      setTimeout(() => { pImg.src = src; pImg.style.opacity = '1'; }, 200);
    }
  } else if (_imgSwap.section === 'wallpaper') {
    const appEl = document.getElementById('app');
    if (appEl) {
      if (val.startsWith('GRAD::')) {
        // Gradient wallpaper: becomes the tint layer itself — fully visible, no photo behind it
        appEl.style.setProperty('--wallpaper-tint', cssVal);
        appEl.style.removeProperty('--wp-image');
        appEl.style.removeProperty('--wp-image-pos');
        appEl.style.removeProperty('--wp-image-size');
      } else {
        // Photo wallpaper: clear custom tint (restore dark/light default), set image + position
        appEl.style.removeProperty('--wallpaper-tint');
        appEl.style.setProperty('--wp-image', cssVal);
        appEl.style.setProperty('--wp-image-pos', bgPos);
        appEl.style.setProperty('--wp-image-size', bgSize);
      }
    }
  }
  const status = document.getElementById('imgSwapStatus');
  if (status) { status.textContent = `✓ Applied: ${item.label}`; setTimeout(() => { if (status) status.textContent = 'Click a thumbnail to apply'; }, 2500); }
}

// ── ADD / DELETE CUSTOM IMAGE FORM ───────────────────────────────────
const _imgAddState = { type: 'file', dataUrl: null, fileName: '', posX: 50, posY: 50 };
let _cropDragStart = null;

// ── Position store (built-in item overrides) ─────────────────────────
const _IMG_POS_KEY = 'v4-img-positions';
function _getPosStore()              { try { return JSON.parse(localStorage.getItem(_IMG_POS_KEY) || '{}'); } catch { return {}; } }
function _savePosKey(k, px, py, zoom) { const s = _getPosStore(); s[k] = { posX: px, posY: py, zoom: zoom ?? 100 }; localStorage.setItem(_IMG_POS_KEY, JSON.stringify(s)); }
function _builtinPosKey(item) {
  const base = _imgSwapKey();
  return base + '-' + (item.file || '').replace(/.*\//, '');
}

// Returns a CSS background-position string for any item
function _getItemBgPos(item) {
  if (item && item._custom && (item.posX !== undefined || item.posY !== undefined)) {
    return `${item.posX ?? 50}% ${item.posY ?? 50}%`;
  }
  if (item && item._builtin) {
    const stored = _getPosStore()[_builtinPosKey(item)];
    if (stored) return `${stored.posX}% ${stored.posY}%`;
  }
  if (item && (item.posX !== undefined || item.posY !== undefined)) {
    return `${item.posX ?? 50}% ${item.posY ?? 50}%`;
  }
  const p = (item && item.position) || 'center';
  if (p === 'top')    return '50% 15%';
  if (p === 'bottom') return '50% 85%';
  return '50% 50%';
}

// Returns the stored zoom (%) for any item — default 100
function _getItemZoom(item) {
  if (item && item._custom) return item.zoom ?? 100;
  if (item && item._builtin) {
    const stored = _getPosStore()[_builtinPosKey(item)];
    if (stored && stored.zoom !== undefined) return stored.zoom;
  }
  if (item && item.zoom !== undefined) return item.zoom;
  return 100;
}

// Converts zoom % to background-size value
function _zoomToBgSize(zoom) {
  const z = parseFloat(zoom) || 100;
  return `${z}% auto`;
}

function _updateAddPreview() {
  const preview = document.getElementById('imgAddPreview');
  if (!preview) return;
  if (_imgAddState.dataUrl) {
    preview.style.backgroundImage  = `url(${_imgAddState.dataUrl})`;
    preview.style.backgroundPosition = `${_imgAddState.posX}% ${_imgAddState.posY}%`;
    const hint = document.getElementById('imgCropHint');
    if (hint) hint.style.display = 'none';
    preview.style.cursor = 'grab';
  } else {
    preview.style.backgroundImage = '';
    const hint = document.getElementById('imgCropHint');
    if (hint) hint.style.display = '';
    preview.style.cursor = 'default';
  }
}

function _rotateAddImage() {
  if (!_imgAddState.dataUrl) return;
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width  = img.height;
    canvas.height = img.width;
    const ctx = canvas.getContext('2d');
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    _imgAddState.dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    _imgAddState.posX = 50; _imgAddState.posY = 50;
    _updateAddPreview();
  };
  img.src = _imgAddState.dataUrl;
}

function _onCropMouseDown(e) {
  if (!_imgAddState.dataUrl) return;
  _cropDragStart = { x: e.clientX, y: e.clientY, posX: _imgAddState.posX, posY: _imgAddState.posY };
  const preview = document.getElementById('imgAddPreview');
  if (preview) preview.style.cursor = 'grabbing';
  document.addEventListener('mousemove', _onCropMouseMove);
  document.addEventListener('mouseup',   _onCropMouseUp);
  e.preventDefault();
}
function _onCropMouseMove(e) {
  if (!_cropDragStart) return;
  const preview = document.getElementById('imgAddPreview');
  const W = (preview && preview.offsetWidth)  || 240;
  const H = (preview && preview.offsetHeight) || 120;
  const dx = e.clientX - _cropDragStart.x;
  const dy = e.clientY - _cropDragStart.y;
  _imgAddState.posX = Math.max(0, Math.min(100, _cropDragStart.posX - dx * (100 / W)));
  _imgAddState.posY = Math.max(0, Math.min(100, _cropDragStart.posY - dy * (100 / H)));
  if (preview) preview.style.backgroundPosition = `${_imgAddState.posX}% ${_imgAddState.posY}%`;
}
function _onCropMouseUp() {
  _cropDragStart = null;
  const preview = document.getElementById('imgAddPreview');
  if (preview) preview.style.cursor = 'grab';
  document.removeEventListener('mousemove', _onCropMouseMove);
  document.removeEventListener('mouseup',   _onCropMouseUp);
}
function _onCropTouchStart(e) {
  if (!_imgAddState.dataUrl || !e.touches[0]) return;
  const t = e.touches[0];
  _cropDragStart = { x: t.clientX, y: t.clientY, posX: _imgAddState.posX, posY: _imgAddState.posY };
  document.addEventListener('touchmove', _onCropTouchMove, { passive: false });
  document.addEventListener('touchend',  _onCropTouchEnd);
  e.preventDefault();
}
function _onCropTouchMove(e) {
  if (!_cropDragStart || !e.touches[0]) return;
  const t = e.touches[0];
  const preview = document.getElementById('imgAddPreview');
  const W = (preview && preview.offsetWidth)  || 240;
  const H = (preview && preview.offsetHeight) || 120;
  _imgAddState.posX = Math.max(0, Math.min(100, _cropDragStart.posX - (t.clientX - _cropDragStart.x) * (100 / W)));
  _imgAddState.posY = Math.max(0, Math.min(100, _cropDragStart.posY - (t.clientY - _cropDragStart.y) * (100 / H)));
  if (preview) preview.style.backgroundPosition = `${_imgAddState.posX}% ${_imgAddState.posY}%`;
  e.preventDefault();
}
function _onCropTouchEnd() {
  _cropDragStart = null;
  document.removeEventListener('touchmove', _onCropTouchMove);
  document.removeEventListener('touchend',  _onCropTouchEnd);
}

function _onImgFileSelect(input) {
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    // Compress via canvas to stay well under localStorage 5MB limit
    const img = new Image();
    img.onload = () => {
      // Resolution cap sized to the target surface so large banners stay sharp (no "pecah").
      const sec = _imgSwap.section;
      let maxW, maxH;
      if (sec === 'wallpaper')                       { maxW = 2880; maxH = 1800; }  // full screen
      else if (sec === 'lockscreen')                 { maxW = 1440; maxH = 2160; }  // tall portrait cards
      else if (sec === 'hero' || sec === 'portrait') { maxW = 2880; maxH = 1200; }  // wide banners
      else                                           { maxW = 1600; maxH = 1200; }  // mascot / avatar
      let w = img.width, h = img.height;
      if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
      if (h > maxH) { w = Math.round(w * maxH / h); h = maxH; }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
      _imgAddState.dataUrl  = dataUrl;
      _imgAddState.fileName = file.name;
      _imgAddState.posX = 50; _imgAddState.posY = 50;
      _updateAddPreview();
      const fnLabel = document.getElementById('imgAddFileName');
      if (fnLabel) fnLabel.textContent = `${file.name} (~${Math.round(dataUrl.length/1024)}KB)`;
      const lbl = document.getElementById('imgAddLabel');
      if (lbl && !lbl.value.trim()) lbl.value = file.name.replace(/\.[^.]+$/, '');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function _toggleAddForm() {
  const form = document.getElementById('imgAddForm');
  if (!form) return;
  const showing = form.style.display !== 'none';
  form.style.display = showing ? 'none' : '';
  if (!showing) {
    // Reset state
    _imgAddState.dataUrl = null; _imgAddState.fileName = '';
    _imgAddState.posX = 50; _imgAddState.posY = 50;
    const gradBtn = document.getElementById('imgAddTypeGrad');
    if (gradBtn) gradBtn.style.display = _imgSwap.section === 'wallpaper' ? '' : 'none';
    // Size the drag preview to match the ACTUAL rendered banner/portrait ratio
    const _addElId  = { hero: 'heroBg', mascot: 'mascotPortrait' };
    const _addEl    = _addElId[_imgSwap.section] ? document.getElementById(_addElId[_imgSwap.section]) : null;
    let   _addArStr;
    if (_addEl && _addEl.offsetWidth && _addEl.offsetHeight) {
      _addArStr = `${_addEl.offsetWidth} / ${_addEl.offsetHeight}`;
    } else {
      const _addFb = { hero: '16 / 5', mascot: '3 / 2', wallpaper: '16 / 9' };
      _addArStr = _addFb[_imgSwap.section] || '16 / 5';
    }
    const addPreview = document.getElementById('imgAddPreview');
    if (addPreview) {
      addPreview.style.height      = '';
      addPreview.style.aspectRatio = _addArStr;
    }
    _setAddType('file');
    _updateAddPreview();
    const fnLabel = document.getElementById('imgAddFileName');
    if (fnLabel) fnLabel.textContent = '';
    const fi = document.getElementById('imgAddFileInput');
    if (fi) fi.value = '';
    const lbl = document.getElementById('imgAddLabel');
    if (lbl) lbl.value = '';
  }
}

function _hideAddForm() {
  const form = document.getElementById('imgAddForm');
  if (form) form.style.display = 'none';
}

function _setAddType(type) {
  _imgAddState.type = type;
  const fb = document.getElementById('imgAddTypeFile');
  const gb = document.getElementById('imgAddTypeGrad');
  const fr = document.getElementById('imgAddFileRow');
  const gr = document.getElementById('imgAddGradRow');
  if (fb) fb.className = type === 'file' ? 'btn sm' : 'btn sm ghost';
  if (gb) gb.className = type === 'grad' ? 'btn sm' : 'btn sm ghost';
  if (fr) fr.style.display = type === 'file' ? '' : 'none';
  if (gr) gr.style.display = type === 'grad' ? '' : 'none';
}

async function _confirmAddItem() {
  const msg = document.getElementById('imgAddMsg');
  let label = (document.getElementById('imgAddLabel')?.value || '').trim();
  let item;

  if (_imgAddState.type === 'grad') {
    const grad = (document.getElementById('imgAddGradient')?.value || '').trim();
    if (!grad) { if (msg) msg.textContent = '⚠ Enter a CSS gradient'; return; }
    if (!label) label = 'Custom Gradient';
    item = { grad, label };
  } else {
    // File picker: requires a file to be selected
    if (!_imgAddState.dataUrl) { if (msg) msg.textContent = '⚠ Choose an image first'; return; }
    if (!label) label = (_imgAddState.fileName || 'Custom').replace(/\.[^.]+$/, '');
    // V4.1 — upload to server so it's a file (no localStorage 5MB cap); store the path
    if (msg) { msg.style.color = 'var(--text-3)'; msg.textContent = '⏳ Uploading…'; }
    let url = _imgAddState.dataUrl;
    try {
      const up = await api('/api/images/upload', { method: 'POST', body: JSON.stringify({ data: _imgAddState.dataUrl }) });
      if (up?.status === 'ok' && up.url) url = up.url;
      else { if (msg) { msg.style.color = 'var(--cinnabar)'; msg.textContent = '⚠ Upload failed: ' + (up?.message || 'server error'); } return; }
    } catch (e) { if (msg) { msg.style.color = 'var(--cinnabar)'; msg.textContent = '⚠ Upload failed'; } return; }
    item = { file: url, label, full: true, posX: _imgAddState.posX ?? 50, posY: _imgAddState.posY ?? 50 };
  }

  const cat = _getCustomCatalog();
  const s = _imgSwap.section;
  // Uploads land in ONE shared bucket per surface so they appear in both Dark + Light (lock = per-pavilion)
  const m = s === 'lockscreen' ? _imgSwap.pavilion : 'shared';
  if (!cat[s]) cat[s] = {};
  if (!cat[s][m]) cat[s][m] = [];
  cat[s][m].push(item);
  _saveCustomCatalog(cat);

  // Reset form state
  _imgAddState.dataUrl = null; _imgAddState.fileName = '';
  _imgAddState.posX = 50; _imgAddState.posY = 50;
  ['imgAddGradient','imgAddLabel'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  _updateAddPreview();
  const fnLabel = document.getElementById('imgAddFileName');
  if (fnLabel) fnLabel.textContent = '';
  const fi = document.getElementById('imgAddFileInput');
  if (fi) fi.value = '';
  if (msg) { msg.textContent = '✓ Added!'; setTimeout(() => { if (msg) msg.textContent = ''; }, 1800); }
  _renderImgGrid();
  // For lockscreen: auto-apply the newly added image so the user doesn't need a second click
  if (_imgSwap.section === 'lockscreen') {
    const newItems = _getMergedItems();
    // Last item in merged list is the one just added (custom items are at the end)
    applyImg(newItems.length - 1);
    _hideAddForm();
  }
}

// ── EDIT POSITION OVERLAY ─────────────────────────────────────────────
const _imgEditState = { i: null, item: null, posX: 50, posY: 50, zoom: 100, originalDataUrl: null };
let _editDragStart = null;

function _openEditItem(i) {
  const items = _getMergedItems();
  const item  = items[i];
  if (!item || item.grad) return;

  // Resolve the image source for the preview
  const src = item.full ? item.file : (_IMG_BASE + item.file);

  // Restore any previously saved position + zoom for this item
  let initPosX = 50, initPosY = 50, initZoom = 100;
  if (item._custom && item.posX !== undefined) { initPosX = item.posX; initPosY = item.posY ?? 50; initZoom = item.zoom ?? 100; }
  else if (item._builtin) {
    const stored = _getPosStore()[_builtinPosKey(item)];
    if (stored) { initPosX = stored.posX; initPosY = stored.posY; initZoom = stored.zoom ?? 100; }
  }

  _imgEditState.i               = i;
  _imgEditState.item            = item;
  _imgEditState.posX            = initPosX;
  _imgEditState.posY            = initPosY;
  _imgEditState.zoom            = initZoom;
  _imgEditState.originalDataUrl = src;

  // Populate the overlay preview — aspect ratio matched to the ACTUAL surface so crop = result
  const _sectionElId = { hero: 'heroBg', mascot: 'mascotPortrait', portrait: 'xbPortraitBg' };
  const _targetEl    = _sectionElId[_imgSwap.section] ? document.getElementById(_sectionElId[_imgSwap.section]) : null;
  let   _arStr;
  if (_targetEl && _targetEl.offsetWidth && _targetEl.offsetHeight) {
    _arStr = `${_targetEl.offsetWidth} / ${_targetEl.offsetHeight}`;
  } else if (_imgSwap.section === 'lockscreen') {
    // lock = 5 tall lantern cards across the screen (~78% height) — estimate the real card shape
    const cw = Math.max(160, (window.innerWidth - 120) / 5);
    const ch = Math.max(360, window.innerHeight * 0.78);
    _arStr = `${Math.round(cw)} / ${Math.round(ch)}`;
  } else {
    const _fb = { hero: '16 / 5', mascot: '3 / 2', wallpaper: '16 / 9', portrait: '16 / 5', lockscreen: '2 / 5' };
    _arStr = _fb[_imgSwap.section] || '16 / 5';
  }
  const preview = document.getElementById('imgEditPreview');
  if (preview) {
    preview.style.flex             = 'none';
    preview.style.minHeight        = '';
    preview.style.backgroundImage    = `url(${src})`;
    preview.style.backgroundRepeat   = 'no-repeat';
    preview.style.backgroundPosition = `${initPosX}% ${initPosY}%`;
    preview.style.backgroundSize     = _zoomToBgSize(initZoom);
    if (_imgSwap.section === 'lockscreen') {
      // Tall lantern card: fixed height that always fits the modal (no overflow / scroll trap),
      // width set by the real 2:5 card aspect, COVER + drag to position (no black border)
      const ph = Math.min(Math.round(window.innerHeight * 0.6), 540);
      preview.style.aspectRatio = 'auto';
      preview.style.height = ph + 'px';
      preview.style.width  = Math.round(ph * 0.4) + 'px';
      preview.style.margin = '0 auto';
    } else {
      preview.style.aspectRatio = _arStr;
      preview.style.width  = '100%';
      preview.style.height = '';
      preview.style.margin = '';
    }
    preview.style.cursor = 'grab';
  }
  // Sync the zoom slider + label
  const zSlider = document.getElementById('imgEditZoomSlider');
  const zLabel  = document.getElementById('imgEditZoomLabel');
  if (zSlider) zSlider.value = initZoom;
  if (zLabel)  zLabel.textContent = `${Math.round(initZoom)}%`;

  const label = document.getElementById('imgEditLabel');
  if (label) label.textContent = item.label || 'Edit position';

  // Only show rotate button for custom (data URL) images
  const rotBtn = document.getElementById('imgEditRotateBtn');
  if (rotBtn) rotBtn.style.display = item._custom ? '' : 'none';

  // Show overlay
  const overlay = document.getElementById('imgEditOverlay');
  if (overlay) overlay.style.display = 'flex';
}

// Live zoom slider handler — updates preview in real time
function _onEditZoomChange(val) {
  const z = parseFloat(val) || 100;
  _imgEditState.zoom = z;
  const lbl = document.getElementById('imgEditZoomLabel');
  if (lbl) lbl.textContent = `${Math.round(z)}%`;
  const preview = document.getElementById('imgEditPreview');
  if (preview) preview.style.backgroundSize = _zoomToBgSize(z);
}

function _closeEditItem() {
  const overlay = document.getElementById('imgEditOverlay');
  if (overlay) overlay.style.display = 'none';
  _editDragStart = null;
}

function _saveEditItem() {
  const { i, item, posX, posY, zoom } = _imgEditState;
  if (item === null) return;

  if (item._custom) {
    // Update posX/posY/zoom directly in the custom catalog (use the item's own bucket)
    const cat = _getCustomCatalog();
    const s = _imgSwap.section;
    const m = item._cbucket || (s === 'lockscreen' ? _imgSwap.pavilion : 'shared');
    if (cat[s]?.[m]?.[item._ci] !== undefined) {
      cat[s][m][item._ci].posX = posX;
      cat[s][m][item._ci].posY = posY;
      cat[s][m][item._ci].zoom = zoom;
      _saveCustomCatalog(cat);
    }
  } else if (item._builtin) {
    _savePosKey(_builtinPosKey(item), posX, posY, zoom);
  }

  // If this item is the currently applied one, update live immediately
  const key    = _imgSwapKey();
  const stored = _getCustomImg(key);
  const val    = (item.full ? item.file : (_IMG_BASE + item.file));
  const savedUrl = stored || '';
  const bgPos  = `${posX}% ${posY}%`;
  const bgSize = _zoomToBgSize(zoom);
  if (savedUrl === val || savedUrl.includes(val) || val.includes(savedUrl.slice(0, 30))) {
    localStorage.setItem('v4-img-' + key + '-pos',  bgPos);
    localStorage.setItem('v4-img-' + key + '-zoom', zoom);
    if (_imgSwap.section === 'hero') {
      const heroBg = document.getElementById('heroBg');
      if (heroBg) { heroBg.style.backgroundPosition = bgPos; heroBg.style.backgroundSize = bgSize; }
    } else if (_imgSwap.section === 'mascot') {
      const mp = document.getElementById('mascotPortrait');
      if (mp) { mp.style.backgroundPosition = bgPos; mp.style.backgroundSize = bgSize; }
    } else if (_imgSwap.section === 'wallpaper') {
      const appEl = document.getElementById('app');
      if (appEl) {
        appEl.style.setProperty('--wp-image-pos',  bgPos);
        appEl.style.setProperty('--wp-image-size', bgSize);
      }
    } else if (_imgSwap.section === 'portrait') {
      const pbg = document.getElementById('xbPortraitBg');
      if (pbg) { pbg.style.backgroundPosition = bgPos; pbg.style.backgroundSize = bgSize; }
    } else if (_imgSwap.section === 'lockscreen') {
      const pavIdx = LS_PAVILIONS.findIndex(p => p.id === _imgSwap.pavilion);
      const pImg   = document.getElementById(`lsCardImg${pavIdx}`);
      if (pImg) { pImg.style.objectPosition = bgPos; }
    }
  }

  _closeEditItem();
  _renderImgGrid();
}

function _rotateEditImage() {
  const { item } = _imgEditState;
  if (!item || !item._custom) return;
  const src = _imgEditState.originalDataUrl;
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = img.height; canvas.height = img.width;
    const ctx = canvas.getContext('2d');
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    const newDataUrl = canvas.toDataURL('image/jpeg', 0.82);
    // Update catalog immediately so edit preview reflects the rotation
    const cat = _getCustomCatalog();
    const s = _imgSwap.section;
    const m = s === 'lockscreen' ? _imgSwap.pavilion : _imgSwap.mode;
    if (cat[s]?.[m]?.[item._ci] !== undefined) {
      cat[s][m][item._ci].file = newDataUrl;
      _saveCustomCatalog(cat);
    }
    _imgEditState.originalDataUrl = newDataUrl;
    _imgEditState.posX = 50; _imgEditState.posY = 50;
    const preview = document.getElementById('imgEditPreview');
    if (preview) {
      preview.style.backgroundImage    = `url(${newDataUrl})`;
      preview.style.backgroundPosition = '50% 50%';
    }
  };
  img.src = src;
}

// Edit overlay drag handlers
function _onEditDragMouseDown(e) {
  _editDragStart = { x: e.clientX, y: e.clientY, posX: _imgEditState.posX, posY: _imgEditState.posY };
  const p = document.getElementById('imgEditPreview');
  if (p) p.style.cursor = 'grabbing';
  document.addEventListener('mousemove', _onEditDragMouseMove);
  document.addEventListener('mouseup',   _onEditDragMouseUp);
  e.preventDefault();
}
function _onEditDragMouseMove(e) {
  if (!_editDragStart) return;
  const p = document.getElementById('imgEditPreview');
  const W = (p && p.offsetWidth)  || 360;
  const H = (p && p.offsetHeight) || 220;
  _imgEditState.posX = Math.max(0, Math.min(100, _editDragStart.posX - (e.clientX - _editDragStart.x) * (100 / W)));
  _imgEditState.posY = Math.max(0, Math.min(100, _editDragStart.posY - (e.clientY - _editDragStart.y) * (100 / H)));
  if (p) p.style.backgroundPosition = `${_imgEditState.posX}% ${_imgEditState.posY}%`;
}
function _onEditDragMouseUp() {
  _editDragStart = null;
  const p = document.getElementById('imgEditPreview');
  if (p) p.style.cursor = 'grab';
  document.removeEventListener('mousemove', _onEditDragMouseMove);
  document.removeEventListener('mouseup',   _onEditDragMouseUp);
}
function _onEditDragTouchStart(e) {
  if (!e.touches[0]) return;
  const t = e.touches[0];
  _editDragStart = { x: t.clientX, y: t.clientY, posX: _imgEditState.posX, posY: _imgEditState.posY };
  document.addEventListener('touchmove', _onEditDragTouchMove, { passive: false });
  document.addEventListener('touchend',  _onEditDragTouchEnd);
  e.preventDefault();
}
function _onEditDragTouchMove(e) {
  if (!_editDragStart || !e.touches[0]) return;
  const t = e.touches[0];
  const p = document.getElementById('imgEditPreview');
  const W = (p && p.offsetWidth)  || 360;
  const H = (p && p.offsetHeight) || 220;
  _imgEditState.posX = Math.max(0, Math.min(100, _editDragStart.posX - (t.clientX - _editDragStart.x) * (100 / W)));
  _imgEditState.posY = Math.max(0, Math.min(100, _editDragStart.posY - (t.clientY - _editDragStart.y) * (100 / H)));
  if (p) p.style.backgroundPosition = `${_imgEditState.posX}% ${_imgEditState.posY}%`;
  e.preventDefault();
}
function _onEditDragTouchEnd() {
  _editDragStart = null;
  document.removeEventListener('touchmove', _onEditDragTouchMove);
  document.removeEventListener('touchend',  _onEditDragTouchEnd);
}

function _deleteCustomItem(bucket, ci) {
  const cat = _getCustomCatalog();
  const s = _imgSwap.section;
  const m = bucket || (s === 'lockscreen' ? _imgSwap.pavilion : 'shared');
  if (cat[s]?.[m]) {
    const removed = cat[s][m][ci];
    // V4.1 — if it was a server-stored file, delete it from disk too
    if (removed && removed.full && typeof removed.file === 'string' && removed.file.startsWith('static/img/custom/')) {
      api('/api/images/delete', { method: 'POST', body: JSON.stringify({ url: removed.file }) }).catch(() => {});
    }
    cat[s][m].splice(ci, 1); _saveCustomCatalog(cat);
  }

  // Clean up any CIDX references pointing to this item (fix stale refs after deletion)
  // - exact match → reset slot to default
  // - index > ci  → shift down by 1
  // Shared pool: a deleted bucket item can be referenced by BOTH the dark + light slots
  const keysToScan = s === 'lockscreen'
    ? LS_PAVILIONS.map(p => `lockscreen-${p.id}`)
    : [`${s}-dark`, `${s}-light`];
  keysToScan.forEach(slotKey => {
    const raw = localStorage.getItem(`v4-img-${slotKey}`);
    if (!raw || !raw.startsWith('CIDX::')) return;
    const parts = raw.split('::');
    const rSec = parts[1], rM = parts[2], rCi = parseInt(parts[3]);
    if (rSec !== s || rM !== m) return;
    if (rCi === ci) {
      localStorage.removeItem(`v4-img-${slotKey}`);  // reset to default
    } else if (rCi > ci) {
      localStorage.setItem(`v4-img-${slotKey}`, `CIDX::${rSec}::${rM}::${rCi - 1}`);
    }
  });

  _renderImgGrid();
}
// Hide a built-in lockscreen image (adds to blocklist in localStorage)
function _hideLsBuiltin(file) {
  const hidden = JSON.parse(localStorage.getItem('v4-ls-hidden') || '[]');
  if (!hidden.includes(file)) { hidden.push(file); localStorage.setItem('v4-ls-hidden', JSON.stringify(hidden)); }
  _renderImgGrid();
}
// Restore all hidden built-in lockscreen images
function _restoreLsBuiltins() {
  localStorage.removeItem('v4-ls-hidden');
  _renderImgGrid();
}

function resetImgSection() {
  const key = _imgSwapKey();
  localStorage.removeItem(`v4-img-${key}`);
  _renderImgGrid();
  setImages();  // re-apply defaults
  const status = document.getElementById('imgSwapStatus');
  if (status) status.textContent = '↺ Reset to default';
}

function resetAllImages() {
  Object.keys(_IMG_DEFAULTS).forEach(k => localStorage.removeItem(`v4-img-${k}`));
  _renderImgGrid();
  setImages();
  const status = document.getElementById('imgSwapStatus');
  if (status) status.textContent = '↺ All images reset';
}

function _fadeSwapBg(el, newSrc, durationMs) {
  if (!el) return;
  el.style.transition = `opacity ${durationMs || 500}ms ease`;
  el.style.opacity = '0';
  setTimeout(() => {
    el.style.backgroundImage = `url(${newSrc})`;
    el.style.opacity = '1';
  }, (durationMs || 500) * 0.6);
}

function setImages() {
  const dark = STATE.theme === 'dark';
  const mode = dark ? 'dark' : 'light';

  // Respect user's custom selections (from image swap panel), fall back to defaults
  const mascotSrc = _getCustomImg(`mascot-${mode}`);
  const heroSrc   = _getCustomImg(`hero-${mode}`);
  const wpSrc     = _getCustomImg(`wallpaper-${mode}`);

  // Wallpaper: gradient → overrides --wallpaper-tint (visible on top); image → --wp-image behind default tint
  const appEl = document.getElementById('app');
  if (appEl) {
    if (wpSrc && wpSrc.startsWith('GRAD::')) {
      appEl.style.setProperty('--wallpaper-tint', _storedToCss(wpSrc));
      appEl.style.removeProperty('--wp-image');
      appEl.style.removeProperty('--wp-image-pos');
      appEl.style.removeProperty('--wp-image-size');
    } else {
      appEl.style.removeProperty('--wallpaper-tint');
      appEl.style.setProperty('--wp-image', _storedToCss(wpSrc));
      const wpPos  = localStorage.getItem(`v4-img-wallpaper-${mode}-pos`)  || 'center';
      const wpZoom = parseFloat(localStorage.getItem(`v4-img-wallpaper-${mode}-zoom`)) || 100;
      appEl.style.setProperty('--wp-image-pos',  wpPos);
      appEl.style.setProperty('--wp-image-size', _zoomToBgSize(wpZoom));
    }
  }

  // Hero banner — crossfade 600ms, restore saved position + zoom
  const heroBgEl = document.getElementById('heroBg');
  _fadeSwapBg(heroBgEl, heroSrc, 600);
  const heroPos  = localStorage.getItem(`v4-img-hero-${mode}-pos`)  || '50% 50%';
  const heroZoom = parseFloat(localStorage.getItem(`v4-img-hero-${mode}-zoom`)) || 100;
  if (heroBgEl) setTimeout(() => {
    heroBgEl.style.backgroundPosition = heroPos;
    heroBgEl.style.backgroundSize     = _zoomToBgSize(heroZoom);
  }, 380);

  // Mascot portrait — crossfade 600ms, restore saved position + zoom
  const mascotEl = document.getElementById('mascotPortrait');
  _fadeSwapBg(mascotEl, mascotSrc, 600);
  const mascotPos  = localStorage.getItem(`v4-img-mascot-${mode}-pos`)  || '50% 50%';
  const mascotZoom = parseFloat(localStorage.getItem(`v4-img-mascot-${mode}-zoom`)) || 100;
  if (mascotEl) setTimeout(() => {
    mascotEl.style.backgroundPosition = mascotPos;
    mascotEl.style.backgroundSize     = _zoomToBgSize(mascotZoom);
  }, 380);

  // Lock screen hero (instant — user won't see mid-swap)
  const lockHero = document.getElementById('lockHero');
  if (lockHero) lockHero.style.backgroundImage = `url(${mascotSrc})`;

  // Header avatar (instant — too small to notice fade)
  const avatar = document.getElementById('headerAvatar');
  if (avatar) avatar.style.backgroundImage = `url(${mascotSrc})`;

  // Portrait banner — Hero-style bg layer: crossfade + restore saved pos/zoom
  const portraitSrc = _getCustomImg(`portrait-${mode}`);
  const pbgEl = document.getElementById('xbPortraitBg');
  _fadeSwapBg(pbgEl, portraitSrc, 600);
  const portraitPos  = localStorage.getItem(`v4-img-portrait-${mode}-pos`)  || '50% 50%';
  const portraitZoom = parseFloat(localStorage.getItem(`v4-img-portrait-${mode}-zoom`)) || 100;
  if (pbgEl) setTimeout(() => {
    pbgEl.style.backgroundPosition = portraitPos;
    pbgEl.style.backgroundSize     = _zoomToBgSize(portraitZoom);
  }, 380);
}

// ════════════════════════════════════════════════════════════
//  SAKURA PETALS
// ════════════════════════════════════════════════════════════
function spawnSakura() {
  // Theme-aware (2026-07-03x): DARK = upgraded sakura petals · LIGHT = ice flakes
  const app = document.getElementById('app');
  if (!app) return;
  app.querySelectorAll('.sakura').forEach(el => el.remove());
  const dark = document.documentElement.getAttribute('data-theme') !== 'light';
  if (dark) _spawnPetalsDark(app);
  else      _spawnIceFlakes(app);
}

function _particleBase(p, w, h, dur) {
  const drift = Math.random() * 160 - 50;
  const sway  = Math.random() * 70;
  const spin  = Math.random() * 360;
  p.className = 'sakura';
  p.style.cssText = [
    `left:${Math.random()*105}%`,
    `width:${w}px`,
    `height:${h}px`,
    `--drift:${drift}px`,
    `--sway:${sway}px`,
    `animation-duration:${dur}s,${dur*0.55}s`,
    `animation-delay:${(-Math.random()*dur).toFixed(2)}s,${(-Math.random()*dur).toFixed(2)}s`, // negative = sky starts populated
    `opacity:0`,
    `transform:rotate(${spin}deg)`,
  ].join(';');
}

function _spawnPetalsDark(app) {
  const colors = ['#f9b8d2','#f5a0c5','#fcd0e2','#e891b8','#fce4ee','#f0aac8','#f6c6de'];
  const paths = [
    'M10,15 C5,15 1,11 1,7 C1,3 4,1 8,1 Q10,0 12,1 C16,1 19,3 19,7 C19,11 15,15 10,15Z',
    'M10,16 C4,16 1,12 1,8 C1,4 4,1 9,1 Q10,0 11,1 C15,1 18,5 18,9 C18,13 15,16 10,16Z',
    'M10,15 C6,16 1,12 1,8 C1,4 5,1 9,1 Q10,0 11,1 C15,1 19,4 19,8 C19,12 15,16 10,15Z',
    'M10,15 C4,14 1,10 2,6 C3,2 7,1 10,2 Q11,0 13,2 C17,3 19,6 18,10 C17,13 14,16 10,15Z',  // curled
    'M9,16 C4,15 1,11 2,7 C3,3 6,1 9,1 Q10,0 11,1 C14,2 17,5 16,9 C15,13 13,15 9,16Z',      // slim
  ];
  for (let i = 0; i < 64; i++) {                       // intensity up (was 45)
    const p = document.createElement('div');
    const w = 10 + Math.random() * 16;
    const h = w * (0.55 + Math.random() * 0.25);
    const dur = 6.5 + Math.random() * 11;
    _particleBase(p, w, h, dur);
    const color = colors[Math.floor(Math.random() * colors.length)];
    const path  = paths[Math.floor(Math.random() * paths.length)];
    const depth = .5 + ((w - 10) / 16) * .45;          // small = further = fainter
    const gid = 'pg' + i + '_' + Date.now() % 100000;
    p.innerHTML = `<svg viewBox="0 0 20 16" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;">
      <defs><radialGradient id="${gid}" cx="35%" cy="30%" r="80%">
        <stop offset="0%" stop-color="#ffffff" stop-opacity=".55"/>
        <stop offset="42%" stop-color="${color}"/>
        <stop offset="100%" stop-color="${color}"/>
      </radialGradient></defs>
      <path d="${path}" fill="url(#${gid})" opacity="${depth.toFixed(2)}"/>
      <path d="${path}" fill="none" stroke="#d97ba6" stroke-width=".5" opacity="${(depth*.4).toFixed(2)}"/>
    </svg>`;
    app.appendChild(p);
  }
}

function _spawnIceFlakes(app) {
  const cols = ['#ffffff', '#e8f3ff', '#d3e7fa', '#c2dcf5'];
  for (let i = 0; i < 52; i++) {
    const p = document.createElement('div');
    const s = 8 + Math.random() * 14;                  // 8–22px
    const dur = 10 + Math.random() * 13;               // flakes fall slower than petals
    _particleBase(p, s, s, dur);
    const c = cols[Math.floor(Math.random() * cols.length)];
    const depth = .45 + ((s - 8) / 14) * .4;
    const kind = Math.random();
    let inner;
    if (kind < .55) {
      // 6-arm crystal with branch ticks
      let arms = '';
      for (let a = 0; a < 360; a += 60) {
        arms += `<g transform="rotate(${a} 12 12)"><path d="M12 12 L12 3 M12 6.5 L9.9 4.6 M12 6.5 L14.1 4.6" /></g>`;
      }
      inner = `<g stroke="${c}" stroke-width="1.25" stroke-linecap="round" fill="none" opacity="${depth.toFixed(2)}">${arms}<circle cx="12" cy="12" r="1.3" fill="${c}" stroke="none"/></g>`;
    } else if (kind < .82) {
      // hexagonal plate
      inner = `<polygon points="12,3.5 19.4,7.8 19.4,16.2 12,20.5 4.6,16.2 4.6,7.8" fill="${c}" opacity="${(depth*.5).toFixed(2)}" stroke="${c}" stroke-opacity="${depth.toFixed(2)}" stroke-width="1"/>`;
    } else {
      // soft dot flurry
      inner = `<circle cx="12" cy="12" r="3.4" fill="${c}" opacity="${(depth*.8).toFixed(2)}"/>`;
    }
    p.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;">${inner}</svg>`;
    app.appendChild(p);
  }
}

// respawn particles whenever the theme flips (petals ⇄ ice flakes)
new MutationObserver(function(muts){
  for (const m of muts) {
    if (m.attributeName === 'data-theme') { try { spawnSakura(); } catch(e) {} break; }
  }
}).observe(document.documentElement, { attributes: true });

// ════════════════════════════════════════════════════════════
//  LOCK SCREEN — Snow Pavilion Lantern Design
// ════════════════════════════════════════════════════════════
const LS_PAVILIONS = [
  { id: 'snow',    han: '雪亭', glyph: '雪', desc: 'Stillness · 静' },
  { id: 'lotus',   han: '莲亭', glyph: '莲', desc: 'Patience · 耐'  },
  { id: 'phoenix', han: '凰亭', glyph: '凰', desc: 'Renewal · 焕'   },
  { id: 'bamboo',  han: '竹亭', glyph: '竹', desc: 'Discipline · 律' },
  { id: 'moon',    han: '月亭', glyph: '月', desc: 'Vision · 观'    },
];
const LS_ACCENT_PRESETS = ['#e05252','#8a4b2c','#3a6e5c','#243b6b','#5a3e7a','#c8a84b','#2c6e8a','#7a3e5a'];
const LS_NEUTRAL_PRESETS = [
  { hex: '#f5f2ed', label: 'Parchment' },
  { hex: '#c8c4bc', label: 'Silver'    },
  { hex: '#8a8880', label: 'Stone'     },
  { hex: '#5a5a5c', label: 'Slate'     },
  { hex: '#2e2e36', label: 'Ink'       },
];

let _lsPin = '';
let _lsSelectedIdx = 0;
let _lsClockInterval = null;
let _lsParallaxRaf = 0;
let _lsInited = false;
let _lsWakeLock = null;

async function _lsAcquireWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    _lsWakeLock = await navigator.wakeLock.request('screen');
    _lsWakeLock.addEventListener('release', () => { _lsWakeLock = null; });
    console.debug('[WakeLock] Screen wake lock acquired — Mac will not sleep while lockscreen is open');
  } catch(e) {
    console.warn('[WakeLock] Could not acquire wake lock:', e.message);
  }
}

function _lsReleaseWakeLock() {
  if (_lsWakeLock) {
    _lsWakeLock.release().catch(() => {});
    _lsWakeLock = null;
    console.debug('[WakeLock] Released — normal sleep behavior restored');
  }
}

// Re-acquire if page visibility returns (browser releases wake lock on tab hide)
document.addEventListener('visibilitychange', () => {
  const overlay = document.getElementById('lockOverlay');
  if (document.visibilityState === 'visible' && overlay?.style.display !== 'none') {
    _lsAcquireWakeLock();
  }
});

function lockScreen() {
  const overlay = document.getElementById('lockOverlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  _lsPin = '';
  _lsInited || _lsInit();
  _lsRenderPin();
  _lsUpdatePinBar();
  _lsStartClock();
  _lsApplyAccent(localStorage.getItem('ls-accent') || '');
  // restore theme icon state
  _lsUpdateThemeIcon();
  // Prevent Mac from sleeping while on lockscreen
  _lsAcquireWakeLock();
}

function _lsInit() {
  _lsInited = true;
  _lsBuildCards();
  _lsSpawnStars();
  _lsSpawnFireflies();
  _lsSpawnPetals();
  _lsBuildColorSwatches();
  _lsSetupParallax();
  _lsSetupKeyboard();
  _lsRestoreImages();
}

// ── Build the 5 lantern cards ──────────────────────────────
function _lsBuildCards() {
  const wrap = document.getElementById('lsCards');
  if (!wrap) return;
  wrap.innerHTML = '';
  LS_PAVILIONS.forEach((p, idx) => {
    const div = document.createElement('div');
    div.className = 'ls-lantern' + (idx === _lsSelectedIdx ? ' selected' : '');
    div.dataset.idx = idx;
    // restore per-card accent
    const storedAccent = localStorage.getItem(`ls-card-accent-${p.id}`);
    if (storedAccent) div.style.setProperty('--ls-card-accent', storedAccent);
    div.innerHTML = `
      <div class="ls-cord"></div>
      <div class="ls-card">
        <div class="ls-art">
          <div class="ls-scroll-bg"></div>
          <div class="ls-watermark">${p.glyph}</div>
          <img class="ls-card-img" id="lsCardImg${idx}" src="" alt="${p.han}" onerror="this.style.opacity=0"/>
        </div>
        <div class="ls-warm-glow"></div>
        <div class="ls-glyph-chip">${p.glyph}</div>
        <div class="ls-float-label">${p.han}</div>
      </div>
      <div class="ls-tassel"></div>`;
    div.addEventListener('click', () => {
      if (idx === _lsSelectedIdx) return;
      _lsSelectCard(idx);
    });
    wrap.appendChild(div);
  });
}

function _lsSelectCard(idx) {
  _lsSelectedIdx = idx;
  _lsPin = '';
  _lsRenderPin();
  _lsUpdatePinBar();
  const lanterns = document.querySelectorAll('.ls-lantern');
  lanterns.forEach((el, i) => {
    el.classList.toggle('selected', i === idx);
    // brief shuffle bob on non-selected
    if (i !== idx) {
      el.classList.add('ls-shuffle-anim');
      setTimeout(() => el.classList.remove('ls-shuffle-anim'), 650);
    }
  });
}

// ── PIN logic ──────────────────────────────────────────────
function _lsRenderPin() {
  const dots = document.querySelectorAll('.ls-dot');
  dots.forEach((d, i) => d.classList.toggle('on', i < _lsPin.length));
  const btn = document.getElementById('lsUnlockBtn');
  if (btn) btn.disabled = _lsPin.length < 4;
}

function _lsUpdatePinBar() {
  const p = LS_PAVILIONS[_lsSelectedIdx];
  const zh = document.getElementById('lsNameZh');
  const en = document.getElementById('lsNameEn');
  if (zh) zh.textContent = p.han;
  if (en) en.textContent = p.desc || p.han;
}

async function lsSubmitPin() {
  if (_lsPin.length < 4) return;
  // PIN is verified server-side (never hardcoded in the bundle). Demo PIN = 0000.
  const r = await api('/api/lock/verify', { method: 'POST', body: JSON.stringify({ pin: _lsPin }) });
  if (!r || r.status !== 'ok') {
    _lsPinErr();
    return;
  }
  const veil = document.getElementById('lsVeil');
  const seal = document.getElementById('lsVeilSeal');
  const p    = LS_PAVILIONS[_lsSelectedIdx];
  if (seal) seal.textContent = p.glyph;
  if (veil) veil.classList.add('show');
  clearInterval(_lsClockInterval);
  setTimeout(() => {
    document.getElementById('lockOverlay').style.display = 'none';
    if (veil) veil.classList.remove('show');
    _lsPin = '';
    _lsRenderPin();
    _lsReleaseWakeLock();
  }, 1800);
}

function _lsPinErr() {
  const dotsWrap = document.getElementById('lsPinDots');
  if (dotsWrap) {
    dotsWrap.classList.add('err');
    setTimeout(() => {
      dotsWrap.classList.remove('err');
      _lsPin = '';
      _lsRenderPin();
    }, 700);
  }
}

// ── Clock ──────────────────────────────────────────────────
function _lsStartClock() {
  _lsTickClock();
  clearInterval(_lsClockInterval);
  _lsClockInterval = setInterval(_lsTickClock, 1000);
}
function _lsTickClock() {
  const el = document.getElementById('lsClock');
  if (!el) return;
  const d = new Date();
  let h = d.getHours(); const m = String(d.getMinutes()).padStart(2,'0');
  const ap = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12; else if (h > 12) h -= 12;
  el.innerHTML = `${h}:${m} <span style="opacity:.55;font-size:11px;letter-spacing:.06em">${ap}</span>`;
  const dateEl = document.getElementById('lsDateStr');
  if (dateEl) {
    const wk = ['SUN','MON','TUE','WED','THU','FRI','SAT'][d.getDay()];
    const mo = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][d.getMonth()];
    dateEl.textContent = `${wk}, ${mo} ${d.getDate()}`;
  }
}

// ── Ambient generation ─────────────────────────────────────
function _lsSpawnStars() {
  const wrap = document.getElementById('lsStars');
  if (!wrap) return;
  wrap.innerHTML = '';
  for (let i = 0; i < 55; i++) {
    const s = document.createElement('div');
    s.className = 'ls-star';
    Object.assign(s.style, {
      left: (Math.random()*100) + 'vw',
      top:  (Math.random()*55) + 'vh',
      width: (Math.random() < 0.85 ? 2 : 3) + 'px',
      animationDelay: (-Math.random()*6) + 's',
      animationDuration: (3 + Math.random()*4) + 's',
    });
    wrap.appendChild(s);
  }
}
function _lsSpawnFireflies() {
  const wrap = document.getElementById('lsFireflies');
  if (!wrap) return;
  wrap.innerHTML = '';
  for (let i = 0; i < 8; i++) {
    const f = document.createElement('div');
    f.className = 'ls-firefly';
    Object.assign(f.style, {
      left: (5 + Math.random()*90) + 'vw',
      top:  (20 + Math.random()*55) + 'vh',
      animationDelay: (-Math.random()*12) + 's',
      animationDuration: (10 + Math.random()*8) + 's',
    });
    wrap.appendChild(f);
  }
}
function _lsSpawnPetals() {
  const wrap = document.getElementById('lsPetals');
  if (!wrap) return;
  wrap.innerHTML = '';
  for (let i = 0; i < 28; i++) {
    const p = document.createElement('div');
    p.className = 'ls-petal';
    const size = 6 + Math.random()*10;
    Object.assign(p.style, {
      left: (Math.random()*100) + 'vw',
      width: size + 'px', height: size + 'px',
      animationDuration: (14 + Math.random()*18) + 's',
      animationDelay: (-Math.random()*30) + 's',
      opacity: 0.35 + Math.random()*0.4,
    });
    wrap.appendChild(p);
  }
}

// ── Parallax tilt ─────────────────────────────────────────
function _lsSetupParallax() {
  const wrap = document.getElementById('lsCardsWrap');
  if (!wrap) return;
  wrap.addEventListener('mousemove', e => {
    if (_lsParallaxRaf) return;
    _lsParallaxRaf = requestAnimationFrame(() => {
      _lsParallaxRaf = 0;
      document.querySelectorAll('.ls-lantern').forEach(card => {
        const r = card.getBoundingClientRect();
        const mx = Math.max(-2, Math.min(2, (e.clientX - (r.left + r.width/2)) / r.width));
        const my = Math.max(-1.5, Math.min(1.5, (e.clientY - (r.top + r.height/2)) / r.height));
        card.style.setProperty('--lmx', String(mx * 0.7));
        card.style.setProperty('--lmy', String(my * 0.7));
      });
    });
  });
  wrap.addEventListener('mouseleave', () => {
    document.querySelectorAll('.ls-lantern').forEach(c => {
      c.style.setProperty('--lmx', '0');
      c.style.setProperty('--lmy', '0');
    });
  });
}

// ── Keyboard ──────────────────────────────────────────────
function _lsSetupKeyboard() {
  document.addEventListener('keydown', e => {
    const overlay = document.getElementById('lockOverlay');
    if (!overlay || overlay.style.display === 'none') return;
    if (/^[0-9]$/.test(e.key)) {
      if (_lsPin.length < 4) { _lsPin += e.key; _lsRenderPin(); }
    } else if (e.key === 'Backspace') {
      _lsPin = _lsPin.slice(0, -1); _lsRenderPin();
    } else if (e.key === 'Enter') {
      if (_lsPin.length >= 4) lsSubmitPin();
    } else if (e.key === 'Escape') {
      _lsPin = ''; _lsRenderPin();
    } else if (e.key === 'ArrowRight') {
      _lsSelectCard(Math.min(LS_PAVILIONS.length-1, _lsSelectedIdx+1));
    } else if (e.key === 'ArrowLeft') {
      _lsSelectCard(Math.max(0, _lsSelectedIdx-1));
    }
  });
}

// ── Theme toggle ──────────────────────────────────────────
function lsToggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
  STATE.theme = isDark ? 'light' : 'dark';
  localStorage.setItem('v4-theme', STATE.theme);
  _lsUpdateThemeIcon();
  setImages(); // update dashboard images too
}
function _lsUpdateThemeIcon() {
  const icon = document.getElementById('lsThemeIcon');
  if (!icon) return;
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  icon.outerHTML = dark
    ? `<svg id="lsThemeIcon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>`
    : `<svg id="lsThemeIcon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/></svg>`;
}

// ── Accent color ──────────────────────────────────────────
function _lsApplyAccent(hex) {
  if (!hex) return;
  const stage = document.getElementById('lockOverlay');
  if (stage) {
    stage.style.setProperty('--ls-accent', hex);
    // derive dark shade
    stage.style.setProperty('--ls-accent-dark', _lsShade(hex, -.12));
    stage.style.setProperty('--ls-accent-soft', _lsTint(hex, .78));
  }
  // mark active swatch
  document.querySelectorAll('.ls-cp-swatch').forEach(s => {
    s.classList.toggle('active', s.dataset.color === hex);
  });
  const ci = document.getElementById('lsColorInput');
  if (ci) ci.value = hex;
}
function lsSetAccent(hex) {
  if (!hex) return;
  localStorage.setItem('ls-accent', hex);
  _lsApplyAccent(hex);
}
function lsToggleColorPicker(e) {
  e.stopPropagation();
  const pop = document.getElementById('lsColorPopup');
  if (!pop) return;
  const opening = pop.style.display === 'none';
  pop.style.display = opening ? '' : 'none';
  if (opening) _lsBuildAutoSwatches();
}
function _lsBuildColorSwatches() {
  // — Accent presets row —
  const wrap = document.getElementById('lsCpSwatches');
  if (wrap) {
    LS_ACCENT_PRESETS.forEach(hex => {
      const btn = document.createElement('div');
      btn.className = 'ls-cp-swatch';
      btn.style.background = hex;
      btn.dataset.color = hex;
      btn.title = hex;
      btn.addEventListener('click', () => {
        lsSetAccent(hex);
        document.getElementById('lsColorPopup').style.display = 'none';
      });
      wrap.appendChild(btn);
    });
  }
  // — Neutral row —
  const nWrap = document.getElementById('lsCpNeutral');
  if (nWrap) {
    LS_NEUTRAL_PRESETS.forEach(({ hex, label }) => {
      const btn = document.createElement('div');
      btn.className = 'ls-cp-swatch';
      btn.style.background = hex;
      btn.style.border = '2px solid rgba(0,0,0,.15)';
      btn.dataset.color = hex;
      btn.title = label;
      btn.addEventListener('click', () => {
        lsSetAccent(hex);
        document.getElementById('lsColorPopup').style.display = 'none';
      });
      nWrap.appendChild(btn);
    });
  }
}

// ── Sample dominant vibrant color from an <img> element via canvas ────
function _lsSampleCardColor(imgEl) {
  try {
    const SIZE = 80;
    const canvas = document.createElement('canvas');
    canvas.width = SIZE; canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imgEl, 0, 0, SIZE, SIZE);
    const data = ctx.getImageData(0, 0, SIZE, SIZE).data;
    let bestScore = -1, bestR = 180, bestG = 140, bestB = 160;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
      if (a < 128) continue;
      const rf = r/255, gf = g/255, bf = b/255;
      const max = Math.max(rf, gf, bf), min = Math.min(rf, gf, bf);
      const l = (max + min) / 2;
      const d = max - min;
      const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
      // Favour saturated + mid-lightness pixels (not washed-out whites or pure blacks)
      const lScore = 1 - Math.abs(l - 0.48) * 2.2;
      const score  = s * 0.72 + Math.max(0, lScore) * 0.28;
      if (score > bestScore) { bestScore = score; bestR = r; bestG = g; bestB = b; }
    }
    return '#' + [bestR, bestG, bestB].map(v => v.toString(16).padStart(2,'0')).join('');
  } catch (_) { return '#e05252'; }
}

// ── Build / refresh the "Match card" auto swatches ───────────────────
// Each swatch applies its sampled color to THAT card only (per-card accent)
function _lsBuildAutoSwatches() {
  const wrap = document.getElementById('lsCpAuto');
  if (!wrap) return;
  wrap.innerHTML = '';

  // "Auto all" button — sample all 5 at once
  const allBtn = document.createElement('button');
  allBtn.className = 'btn sm ls-cp-auto-all';
  allBtn.title = 'Auto-match all cards from their images';
  allBtn.textContent = '✦ All';
  allBtn.addEventListener('click', (e) => { e.stopPropagation(); lsMatchCardColors(); });
  wrap.appendChild(allBtn);

  LS_PAVILIONS.forEach((pav, idx) => {
    const btn = document.createElement('div');
    btn.className = 'ls-cp-auto-swatch loading';
    btn.title = pav.han;
    btn.textContent = pav.glyph;
    wrap.appendChild(btn);
    const imgEl = document.getElementById(`lsCardImg${idx}`);
    const trySet = (el) => {
      const hex = _lsSampleCardColor(el);
      btn.style.background = hex;
      btn.dataset.color = hex;
      btn.classList.remove('loading');
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        _lsApplyCardAccent(pav.id, idx, hex);
        document.getElementById('lsColorPopup').style.display = 'none';
      });
    };
    if (!imgEl) return;
    if (imgEl.complete && imgEl.naturalWidth > 0) trySet(imgEl);
    else imgEl.addEventListener('load', () => trySet(imgEl), { once: true });
  });
}

// Apply a per-card accent — stores to localStorage + sets CSS var on the lantern el
function _lsApplyCardAccent(pavId, idx, hex) {
  localStorage.setItem(`ls-card-accent-${pavId}`, hex);
  const lanterns = document.querySelectorAll('.ls-lantern');
  if (lanterns[idx]) lanterns[idx].style.setProperty('--ls-card-accent', hex);
}

// Sample all 5 cards and apply per-card accents
function lsMatchCardColors() {
  LS_PAVILIONS.forEach((pav, idx) => {
    const imgEl = document.getElementById(`lsCardImg${idx}`);
    if (!imgEl) return;
    const tryMatch = (el) => _lsApplyCardAccent(pav.id, idx, _lsSampleCardColor(el));
    if (imgEl.complete && imgEl.naturalWidth > 0) tryMatch(imgEl);
    else imgEl.addEventListener('load', () => tryMatch(imgEl), { once: true });
  });
  const pop = document.getElementById('lsColorPopup');
  if (pop) pop.style.display = 'none';
}
document.addEventListener('click', () => {
  const pop = document.getElementById('lsColorPopup');
  if (pop && pop.style.display !== 'none') pop.style.display = 'none';
});

// ── Image restore ─────────────────────────────────────────
// Uses the same key format as the image swap system: lockscreen-{pavilion}-{mode}
function _lsRestoreImages() {
  LS_PAVILIONS.forEach((p, idx) => {
    const key = `lockscreen-${p.id}`;
    const src = _getCustomImg(key);
    const img = document.getElementById(`lsCardImg${idx}`);
    if (img && src) {
      img.src = src;
      img.style.opacity = '1';
      const pos = localStorage.getItem(`v4-img-${key}-pos`);
      if (pos) img.style.objectPosition = pos;
    }
    // apply stored per-card accent
    const accent = localStorage.getItem(`ls-card-accent-${p.id}`);
    const lantern = document.querySelectorAll('.ls-lantern')[idx];
    if (accent && lantern) lantern.style.setProperty('--ls-card-accent', accent);
  });
}

// ── Color math helpers ────────────────────────────────────
function _lsHexToRgb(hex) {
  const h = hex.replace('#','');
  const n = parseInt(h.length === 3 ? h.split('').map(c=>c+c).join('') : h, 16);
  return [(n>>16)&255, (n>>8)&255, n&255];
}
function _lsRgbToHex(r,g,b) {
  return '#' + [r,g,b].map(x => Math.max(0,Math.min(255,Math.round(x))).toString(16).padStart(2,'0')).join('');
}
function _lsShade(hex, amt) {
  const [r,g,b] = _lsHexToRgb(hex);
  if (amt < 0) return _lsRgbToHex(r*(1+amt), g*(1+amt), b*(1+amt));
  return _lsRgbToHex(r+(255-r)*amt, g+(255-g)*amt, b+(255-b)*amt);
}
function _lsTint(hex, amt) { return _lsShade(hex, amt); }

// ════════════════════════════════════════════════════════════
//  AUTOSAVE
// ════════════════════════════════════════════════════════════
async function loadAutosave() {
  const d = await api('/api/autosave/status');
  const lbl = document.getElementById('autosaveLabel');
  if (!lbl) return;
  if (d.last_save) {
    const dt = new Date(d.last_save);
    const str = dt.toLocaleDateString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
    lbl.textContent = `SAVED · ${str}`;
  } else {
    lbl.textContent = 'SAVED · –';
  }
  document.getElementById('lastUpdated').textContent = 'Updated ' + new Date().toLocaleTimeString();
}

// ════════════════════════════════════════════════════════════
//  OVERVIEW — all loaders
// ════════════════════════════════════════════════════════════
async function loadOverview() {
  STATE._newsLastFetch = Date.now();
  await Promise.all([
    loadKPIs(),
    loadEquityChart(),
    loadRiskStatus(),
    loadNotifications(),
    loadCryptoNews(),
    loadMacroNews(),
    loadCalendar(),
    loadSectorHeat(),
    loadMascotMsg(),
    loadYoutubeChannels(),
  ]);
  document.getElementById('lastUpdated').textContent = 'Updated ' + new Date().toLocaleTimeString();
}

// Auto-refresh: fast items only (30s). News/calendar refresh every 10 min max.
// Market AI chat is NEVER touched here.
const _NEWS_REFRESH_MS = 10 * 60 * 1000; // 10 minutes
async function _autoRefreshOverview() {
  await Promise.all([
    loadKPIs(),
    loadEquityChart(),
    loadRiskStatus(),
    loadNotifications(),
  ]);
  const now = Date.now();
  if (now - STATE._newsLastFetch >= _NEWS_REFRESH_MS) {
    STATE._newsLastFetch = now;
    await Promise.all([
      loadCryptoNews(),
      loadMacroNews(),
      loadCalendar(),
      loadSectorHeat(),
    ]);
  }
  const lu = document.getElementById('lastUpdated');
  if (lu) lu.textContent = 'Updated ' + new Date().toLocaleTimeString();
}

// ── KPIs
async function loadKPIs() {
  const [bal, pnl, pos, summary] = await Promise.all([
    api('/api/bybit/balance'),
    api('/api/bybit/pnl-daily'),
    api('/api/bybit/positions'),
    api('/api/bybit/pnl-summary'),
  ]);

  // Balance
  const usdtCoin = Array.isArray(bal?.data) ? bal.data.find(c => c.coin === 'USDT') : null;
  const balance  = usdtCoin?.equity || usdtCoin?.balance || 0;
  if (bal?.status === 'error') {
    setKpi('kpiBalance', 'ERR', null, 'balance-val');
    showToast(`Bybit: ${bal.message || 'connection error'}`, 'error');
    console.error('[Bybit balance]', bal.message);
  } else {
    setKpi('kpiBalance', fmtUSD(balance), null, 'balance-val');
  }

  // Monthly PnL — sum all days this month
  const monthStr = new Date().toISOString().slice(0, 7); // "2026-05"
  const monthlyPnl = (pnl?.data || [])
    .filter(r => (r.day || r.date || '').startsWith(monthStr))
    .reduce((s, r) => s + parseFloat(r.net_pnl ?? r.pnl ?? 0), 0);
  const pnlEl = document.getElementById('kpiDailyPnl');
  if (pnlEl) { pnlEl.textContent = fmt$(monthlyPnl); pnlEl.className = `value balance-val ${pnlClass(monthlyPnl)}`; }

  // Open positions count
  const openCount = Array.isArray(pos?.data) ? pos.data.length : 0;
  setKpi('kpiPositions', openCount, null);

  // Win rate — lives at summary.alltime.win_rate
  const wr = summary?.alltime?.win_rate ?? null;
  setKpi('kpiWinRate', wr != null ? wr.toFixed(1) + '%' : '–', null);
}

function setKpi(id, val, delta, extraClass = '') {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = val;
  if (extraClass) el.classList.add(extraClass);
}

// ── Equity Curve
async function loadEquityChart(period = '30d') {
  const d = await api('/api/bybit/pnl-daily');
  const all = d?.data || [];
  // True equity curve: running sum of realized daily PnL (was plotting raw daily PnL),
  // then honour the 30D / 7D toggle (the period argument used to be ignored).
  let run = 0;
  const cum = all.map(r => ({ day: r.day || r.date || '', v: (run += parseFloat(r.net_pnl ?? r.pnl ?? 0)) }));
  const days = parseInt(period, 10) || 30;
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const rows = cum.filter(r => r.day >= cutoff);
  const labels = rows.map(r => r.day);
  const values = rows.map(r => Math.round(r.v * 100) / 100);

  const ctx = document.getElementById('equityChart');
  if (!ctx) return;

  if (STATE.equityChart) { STATE.equityChart.destroy(); STATE.equityChart = null; }

  const isDark = STATE.theme === 'dark';
  const jade = '#4caf82';

  STATE.equityChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: values,
        borderColor: jade,
        backgroundColor: isDark ? 'rgba(76,175,130,.1)' : 'rgba(76,175,130,.08)',
        borderWidth: 2,
        tension: 0.4,
        fill: true,
        pointRadius: 0,
        pointHoverRadius: 4,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: {
        callbacks: { label: ctx => 'Cumulative ' + fmt$(ctx.parsed.y) }
      }},
      scales: {
        x: {
          display: true,
          grid: { display: false },
          ticks: {
            color: isDark ? '#7a7690' : '#8a8070',
            font: { size: 10 },
            maxTicksLimit: 8,
            maxRotation: 0,
            callback: function(val, idx) {
              const lbl = this.getLabelForValue(val);
              // Show only YYYY-MM-DD → M/D
              if (!lbl) return '';
              const parts = lbl.split('-');
              return parts.length === 3 ? `${parseInt(parts[1])}/${parseInt(parts[2])}` : lbl;
            }
          }
        },
        y: {
          grid: { color: isDark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.05)' },
          ticks: { color: isDark ? '#7a7690' : '#8a8070', font: { size: 11 }, callback: v => fmt$(v, 0) }
        }
      }
    }
  });
}

function setEquityPeriod(p, btn) {
  document.querySelectorAll('#equityTabstrip button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  loadEquityChart(p);
}

// ── Mascot message
const MASCOT_MSGS = [
  'The market is ink on water — read it before it dries.',
  'A thousand screeners cannot replace one clean setup.',
  'Risk is the only thing you truly control.',
  'Patience is a position too.',
  'Small losses are tuition fees. Large ones are dropouts.',
  'Your stop loss is a promise to yourself.',
  'The best trade is the one you did not take.',
  'Follow the system, not your feelings.',
  'Cut losses short. Let winners breathe.',
  'Discipline today is profit tomorrow.',
  'A losing streak is not a signal to size up.',
  'The setup must come to you — never force an entry.',
  'Precision 精准. Discipline 纪律. Patience 耐心.',
  'Every mistake is a lesson that could have cost less.',
  'Trade less, trade better.',
  'Your edge is not the indicator — it is the execution.',
  'Big money is made in big moves. Small accounts stay alive by sitting out.',
  'Position size is your real risk management.',
  'If you cannot define your stop, you have no trade.',
  'The chart does not lie. Confirmation bias does.',
];
// Separate quotes for the portrait card — more personal / Snow Seal voice
const XB_PORTRAIT_QUOTES = [
  'Every entry in this ledger made me sharper.',
  'I do not trade hope. I trade structure.',
  'The market rewards patience. I practice it daily.',
  'One good trade is worth ten forced ones.',
  'My edge is not a secret. It is repetition.',
  'Loss is data. Panic is noise.',
  'I wait for the river to show its current.',
  'Stillness before the entry. Courage after.',
  'Consistency is not the destination — it is the proof.',
  'If the setup is not clear, the answer is already no.',
  'A trader with no rules is just gambling in a chair.',
  'I protect the drawdown like I protect my name.',
];
let _lastXbPortraitIdx = -1;
let _lastMascotIdx = -1;
function loadMascotMsg() {
  // Daily rotation: use date as seed, same quote all day
  const dayKey = new Date().toISOString().slice(0,10);
  const stored = localStorage.getItem('v4-mascot-day');
  let idx;
  if (stored === dayKey) {
    idx = parseInt(localStorage.getItem('v4-mascot-idx') || '0');
  } else {
    idx = Math.floor(Math.random() * MASCOT_MSGS.length);
    localStorage.setItem('v4-mascot-day', dayKey);
    localStorage.setItem('v4-mascot-idx', idx);
  }
  _lastMascotIdx = idx;
  const el = document.getElementById('mascotMsg');
  if (el) el.textContent = '"' + MASCOT_MSGS[idx] + '"';
  // Portrait card uses its own independent quote pool
  if (_lastXbPortraitIdx < 0) {
    _lastXbPortraitIdx = Math.floor(Math.random() * XB_PORTRAIT_QUOTES.length);
  }
  const pq = document.getElementById('xbPortraitQuote');
  if (pq) pq.textContent = '"' + XB_PORTRAIT_QUOTES[_lastXbPortraitIdx] + '"';
}

function refreshMascotMsg(btn) {
  // Cycle to next message (not today's daily)
  _lastMascotIdx = (_lastMascotIdx + 1) % MASCOT_MSGS.length;
  localStorage.setItem('v4-mascot-idx', _lastMascotIdx);
  const el = document.getElementById('mascotMsg');
  if (el) {
    el.style.opacity = '0';
    el.style.transition = 'opacity .25s';
    setTimeout(() => {
      el.textContent = '"' + MASCOT_MSGS[_lastMascotIdx] + '"';
      el.style.opacity = '1';
    }, 150);
  }
  refreshBtn(btn, () => {});
}

function refreshXbQuote(btn) {
  // Portrait card cycles through its own quote pool independently
  _lastXbPortraitIdx = (_lastXbPortraitIdx + 1) % XB_PORTRAIT_QUOTES.length;
  const pq = document.getElementById('xbPortraitQuote');
  if (pq) {
    pq.style.opacity = '0'; pq.style.transition = 'opacity .2s';
    setTimeout(() => { pq.textContent = '"' + XB_PORTRAIT_QUOTES[_lastXbPortraitIdx] + '"'; pq.style.opacity = '1'; }, 150);
  }
  if (btn) refreshBtn(btn, () => {});
}

// ── Smart Money Pulse removed in V4.1 (loadSmartMoney/renderSmartMoney/switchSmTab/toggleSmartMoney) ──

// ── Notifications ─────────────────────────────────────────
const _NOTIF_TYPE_STYLE = {
  price_alert:  { cls: 'alert',  label: '🔔 Alert' },
  cal_reminder: { cls: 'info',   label: '📅 Cal'   },
  news_alert:   { cls: 'hype',   label: '📰 News'  },
  system:       { cls: 'hype',   label: '⚙ Sys'    },
  loss_streak:  { cls: 'alert',  label: '📉 Risk'   },
  win_streak:   { cls: 'hype',   label: '📈 Risk'   },
  no_sl:        { cls: 'alert',  label: '⚠ No SL'  },
};

function _notifStyle(type) {
  return _NOTIF_TYPE_STYLE[type] || { cls: 'hype', label: type || 'info' };
}

function _updateNotifDot(count) {
  const dot   = document.getElementById('notifDot');
  const badge = document.getElementById('notifUnreadBadge');
  if (dot)   { dot.style.display   = count > 0 ? 'block' : 'none'; }
  if (badge) { badge.style.display = count > 0 ? 'inline' : 'none'; badge.textContent = count > 9 ? '9+' : count; }
}

async function loadNotifications() {
  const list = document.getElementById('notifList');
  if (!list) return;
  const d = await api('/api/notifications?max_age_hours=24');
  const items = d?.data || [];
  const unread = items.filter(n => !n.read).length;
  _updateNotifDot(unread);
  if (!items.length) {
    list.innerHTML = '<p class="muted tiny" style="padding:8px 0;">No new notifications.</p>';
    return;
  }
  list.innerHTML = items.slice(0, 20).map(n => {
    const s    = _notifStyle(n.type);
    const time = (n.created_at || '').slice(11, 16);
    const isUnread = !n.read;
    const msg = n.message || '–';
    // Parse news_alert messages — format may be "📰 title|||https://..." OR plain "📰 title"
    let msgHtml = msg;
    let askAiBtn = '';
    if (n.type === 'news_alert') {
      let title, linkUrl;
      if (msg.includes('|||')) {
        [title, linkUrl] = msg.split('|||');
        title   = title.trim();
        linkUrl = linkUrl.trim();
      } else {
        // Legacy plain text — strip emoji prefix, fall back to Google News search
        title   = msg.replace(/^📰\s*/, '').trim();
        linkUrl = 'https://news.google.com/search?q=' + encodeURIComponent(title);
      }
      const safeTitle  = title.slice(0, 140);
      const safeHlAttr = safeTitle.replace(/&/g,'&amp;').replace(/"/g,'&quot;');
      msgHtml  = `<a href="${linkUrl}" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline;text-decoration-color:rgba(255,255,255,.2);cursor:pointer;">${safeTitle}</a>`;
      askAiBtn = `<button class="btn ghost" style="padding:2px 6px;font-size:0.72rem;white-space:nowrap;opacity:.8;" data-hl="${safeHlAttr}" onclick="event.stopPropagation();_notifAskAIBtn(this)" title="Ask AI">🤖</button>`;
    }
    return `<div class="news-item" style="${isUnread ? 'border-left:3px solid var(--jade);padding-left:10px;' : 'opacity:.75;padding-left:2px;'}">
      <span class="news-time">${time}</span>
      <span class="news-tag ${s.cls}" style="font-size:0.62rem;">${s.label}</span>
      <div class="news-text" style="flex:1;">${msgHtml}</div>
      ${askAiBtn}
      <button class="btn ghost" style="padding:0 4px;font-size:0.75rem;opacity:.5;" onclick="deleteNotif(${n.id})" title="Dismiss">✕</button>
    </div>`;
  }).join('');
}

async function markNotifsRead() {
  await api('/api/notifications/read', { method: 'POST' });
  _updateNotifDot(0);
  loadNotifications();
}

async function clearNotifs() {
  await api('/api/notifications/clear', { method: 'POST' });
  _updateNotifDot(0);
  loadNotifications();
}

async function deleteNotif(id) {
  await api(`/api/notifications/${id}`, { method: 'DELETE' });
  loadNotifications();
}

// ── Notification settings (localStorage) ─────────────────
const _NOTIF_SETTINGS_KEY = 'v4-notif-settings';

function _getNotifSettings() {
  try { return JSON.parse(localStorage.getItem(_NOTIF_SETTINGS_KEY) || '{}'); }
  catch { return {}; }
}

function loadNotifSettings() {
  const s = _getNotifSettings();
  const chk = (id, key, def) => {
    const el = document.getElementById(id);
    if (el) el.checked = (s[key] !== undefined ? s[key] : def);
  };
  chk('notifTogglePriceAlert',  'price_alert',  true);
  chk('notifToggleCalReminder', 'cal_reminder', true);
  chk('notifToggleNewsAlert',   'news_alert',   true);
}

function saveNotifSettings() {
  const val = (id) => { const el = document.getElementById(id); return el ? el.checked : true; };
  const s = {
    price_alert:  val('notifTogglePriceAlert'),
    cal_reminder: val('notifToggleCalReminder'),
    news_alert:   val('notifToggleNewsAlert'),
  };
  localStorage.setItem(_NOTIF_SETTINGS_KEY, JSON.stringify(s));
}

function toggleNotifSettings(btn) {
  const panel = document.getElementById('notifSettingsPanel');
  if (!panel) return;
  const open = panel.style.display !== 'none';
  panel.style.display = open ? 'none' : 'block';
  if (btn) btn.style.opacity = open ? '' : '1';
}

// Push a notification to the DB + refresh card (called by price alerts + calendar)
async function pushNotification(type, message) {
  // Check user settings before firing
  const s = _getNotifSettings();
  // Only gate on types that have a setting toggle; system/no_sl always fire
  const gated = { price_alert: 'price_alert', cal_reminder: 'cal_reminder', news_alert: 'news_alert' };
  if (gated[type] && s[gated[type]] === false) return;  // user muted this type

  const dedup_key = `${type}::${message}`;
  const r = await api('/api/notifications/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, message, dedup_key })
  });
  if (r?.inserted) loadNotifications();  // refresh card only if new item
}

// Check upcoming high-impact calendar events (≤24h away) and push reminders
function _pushCalendarReminders(items) {
  if (!items || !items.length) return;
  items.forEach(ev => {
    const impact = (ev.impact || '').toLowerCase();
    if (!impact.includes('high')) return;
    const days = ev.days_out;
    if (days == null || days < 0 || days > 1) return;  // only today/tomorrow
    const when = days === 0 ? 'Today' : 'Tomorrow';
    const msg  = `${when} ${ev.time || ''} — ${ev.currency || ''} ${ev.event || ''}`;
    pushNotification('cal_reminder', msg);
  });
}

// ── Calendar countdown timer (30min + 1hr before HIGH-impact events)
let _calAlertTimer = null;

function _startCalendarAlertTimer() {
  if (_calAlertTimer) clearInterval(_calAlertTimer);
  _checkCalendarCountdown();
  _calAlertTimer = setInterval(_checkCalendarCountdown, 3 * 60 * 1000);
  _updateCalNextChip();  // start live countdown chip
}

function _checkCalendarCountdown() {
  const items = STATE.calItems;
  if (!items?.length) return;
  const now = Date.now();

  items.forEach(ev => {
    const impact = (ev.impact || '').toLowerCase();
    if (!impact.includes('high')) return;
    if (ev.days_out !== 0) return;  // only today

    // Parse event time (format: "21:30 WIB")
    const timeStr = (ev.time || '').replace(/\s*WIB/i, '').trim();
    if (!timeStr || !timeStr.includes(':')) return;
    const [hh, mm] = timeStr.split(':').map(Number);
    if (isNaN(hh) || isNaN(mm)) return;

    const evDate = new Date();
    evDate.setHours(hh, mm, 0, 0);
    const diffMin = (evDate.getTime() - now) / 60000;

    if (diffMin > 0 && diffMin <= 32) {
      // 30-min warning
      const msg = `⏰ 30min to ${ev.currency || ''} ${ev.event} at ${timeStr} WIB`;
      pushNotification('cal_reminder', msg);
      _sendBrowserNotif('📅 Event in 30 min', `${ev.event} — ${timeStr} WIB`);
    } else if (diffMin > 50 && diffMin <= 72) {
      // 1-hour warning (window 50–72 min to avoid missing it)
      const msg = `⏰ 1hr to ${ev.currency || ''} ${ev.event} at ${timeStr} WIB`;
      pushNotification('cal_reminder', msg);
      _sendBrowserNotif('📅 Event in 1 hour', `${ev.event} — ${timeStr} WIB`);
    }
  });
}

// ── Market-moving news keyword scanner
const _MARKET_MOVING_KW = [
  'federal reserve','fomc','powell','rate decision','rate hike','rate cut',
  'rate unchanged','emergency rate','quantitative','tapering','pivot',
  'cpi','inflation rate','pce','non-farm','nfp','jobs report','gdp',
  'tariff','trade war','trade deal','executive order','trump signs',
  'sanctions','embargo','military strike','invasion','nuclear',
  'circuit breaker','trading halt','market crash','default',
  'debt ceiling','credit downgrade','bank failure','bank run','systemic',
  'etf approved','etf rejected','bitcoin act','crypto bill','sec charges',
  'spot etf','bitcoin reserve','ath','all-time high',
  'opec cut','oil embargo','gold surge',
];

function _scanNewsForAlerts(articles) {
  if (!articles?.length) return;
  articles.slice(0, 30).forEach(a => {
    const raw   = (a.title || a.headline || a.summary || '');
    const lower = raw.toLowerCase();
    const hit   = _MARKET_MOVING_KW.some(kw => lower.includes(kw));
    if (!hit) return;
    const shortTitle = raw.slice(0, 120);
    // Include URL if available so notification card can render a clickable link
    const url = a.url || a.link || a.source_url || '';
    const msg = url ? `📰 ${shortTitle}|||${url}` : `📰 ${shortTitle}`;
    pushNotification('news_alert', msg);
  });
}

// ── NOTIFICATION ASK-AI POPUP ─────────────────────────────────────────
// Safe onclick bridge — reads headline from data-hl attribute (avoids JSON.stringify/quote conflicts)
function _notifAskAIBtn(btn) {
  const headline = (btn && btn.getAttribute('data-hl')) || '';
  _notifAskAI(headline, null);
}

function _showNotifAiPopup() {
  const popup = document.getElementById('notifAiPopup');
  const chip  = document.getElementById('notifAiChip');
  if (popup) { popup.style.display = 'flex'; }
  if (chip)  { chip.style.display  = 'none'; }
}
function _minimizeNotifAiPopup() {
  const popup = document.getElementById('notifAiPopup');
  const chip  = document.getElementById('notifAiChip');
  if (popup) popup.style.display = 'none';
  if (chip)  chip.style.display  = '';
}
function _expandNotifAiPopup() {
  const popup = document.getElementById('notifAiPopup');
  const chip  = document.getElementById('notifAiChip');
  if (popup) popup.style.display = 'flex';
  if (chip)  chip.style.display  = 'none';
}
function _closeNotifAiPopup() {
  document.getElementById('notifAiPopup').style.display = 'none';
  document.getElementById('notifAiChip').style.display  = 'none';
}

async function _notifAskAI(headline, evt) {
  if (evt) evt.stopPropagation();
  const body = document.getElementById('notifAiBody');
  if (!body) return;
  body.innerHTML = '<span style="color:var(--text-3);font-size:11px;">🤖 Analyzing…</span>';
  _showNotifAiPopup();

  const question = `Summarize and analyze this news headline for crypto traders: "${headline}"`;
  const context  = _buildAiContext ? _buildAiContext() : '';
  const d = await api('/api/news/ask', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ question, context })
  });
  const answer = d?.answer || 'No response — check GROQ_API_KEY / GEMINI_API_KEY in .env';
  body.innerHTML = answer.replace(/\n/g, '<br>');
}

// ════════════════════════════════════════════════════════════
//  MARKET AI — news Q&A + auto-summarize
// ════════════════════════════════════════════════════════════

function _buildAiContext() {
  // Macro news headlines
  const newsCtx = (STATE.macroItems || []).slice(0, 20).map(n => {
    const title   = n.title || n.headline || '';
    const summary = n.summary || n.description || '';
    const tag     = n.sentiment_tier || n.sentiment || '';
    return `[${tag || 'news'}] ${title}${summary ? ' — ' + summary.slice(0, 120) : ''}`;
  }).join('\n');

  // Crypto news headlines
  const cryptoCtx = ((STATE.cryptoItems || [])).slice(0, 10).map(n =>
    `[crypto] ${n.title || n.headline || ''}`
  ).join('\n');

  // Calendar events (today + next 7 days)
  const calCtx = (STATE.calItems || [])
    .filter(e => e.days_out != null && e.days_out >= -1 && e.days_out <= 7)
    .map(e => {
      const base = `${e.day} ${e.time || ''} | ${e.currency || ''} ${e.event || ''} [${(e.impact||'').toUpperCase()}]`;
      const vals = [e.actual !== '—' ? `Actual: ${e.actual}` : '', e.forecast !== '—' ? `Forecast: ${e.forecast}` : '', e.previous !== '—' ? `Prev: ${e.previous}` : ''].filter(Boolean).join(', ');
      return vals ? `${base} — ${vals}` : base;
    }).join('\n');

  const parts = [];
  if (newsCtx)   parts.push(`MACRO NEWS:\n${newsCtx}`);
  if (cryptoCtx) parts.push(`CRYPTO NEWS:\n${cryptoCtx}`);
  if (calCtx)    parts.push(`ECONOMIC CALENDAR:\n${calCtx}`);
  return parts.join('\n\n');
}

function _appendAiMsg(role, text, id) {
  const hist = document.getElementById('aiChatHistory');
  if (!hist) return;
  const isUser = role === 'user';
  const isThink = role === 'thinking';
  const div = document.createElement('div');
  div.style.cssText = `display:flex;flex-direction:column;align-items:${isUser ? 'flex-end' : 'flex-start'};gap:3px;`;
  if (id) div.id = id;
  const label = document.createElement('span');
  label.style.cssText = 'font-size:0.65rem;opacity:.5;padding:0 4px;';
  label.textContent = isUser ? 'You' : isThink ? '' : '✦ Market AI';
  const bubble = document.createElement('div');
  bubble.style.cssText = isUser
    ? 'background:var(--jade);color:#fff;padding:8px 13px;border-radius:14px 14px 3px 14px;font-size:13px;max-width:85%;line-height:1.5;'
    : 'background:var(--surface-2);color:var(--text);padding:10px 14px;border-radius:14px 14px 14px 3px;font-size:13px;max-width:92%;line-height:1.6;border:1px solid var(--border-soft);';
  bubble.innerHTML = isThink
    ? '<span class="spinning" style="display:inline-block;opacity:.6;">↻</span> Thinking…'
    : text.replace(/\n/g, '<br>');
  div.appendChild(label);
  div.appendChild(bubble);
  hist.appendChild(div);
  hist.scrollTop = hist.scrollHeight;
}

function _replaceAiMsg(id, text) {
  const el = document.getElementById(id);
  if (!el) return;
  const bubble = el.querySelector('div');
  if (bubble) bubble.innerHTML = text.replace(/\n/g, '<br>');
  const label = el.querySelector('span');
  if (label) label.textContent = '✦ Market AI';
  document.getElementById('aiChatHistory')?.scrollTo({ top: 99999, behavior: 'smooth' });
}

async function askMarketAI(question) {
  const input  = document.getElementById('aiAskInput');
  const sendBtn = document.getElementById('aiSendBtn');
  const context = _buildAiContext();

  _appendAiMsg('user', question);
  const thinkId = 'aiThink_' + Date.now();
  _appendAiMsg('thinking', '', thinkId);

  if (sendBtn) sendBtn.disabled = true;

  const d = await api('/api/news/ask', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ question, context })
  });

  if (sendBtn) sendBtn.disabled = false;

  const answer = d?.answer || 'No response — check your CEREBRAS_API_KEY in .env';
  _replaceAiMsg(thinkId, answer);

  // Show which provider actually answered
  const modelEl = document.getElementById('aiModelLabel');
  const _pLabel = { cerebras: 'Cerebras', groq: 'Groq', deepseek: 'DeepSeek' };
  if (modelEl) modelEl.textContent = (d?.status === 'ok' && d?.provider) ? `via ${_pLabel[d.provider] || d.provider}` : '';
}

async function sendAiQuestion() {
  const input = document.getElementById('aiAskInput');
  const q = (input?.value || '').trim();
  if (!q) return;
  input.value = '';
  await askMarketAI(q);
}

function clearAiChat() {
  const hist = document.getElementById('aiChatHistory');
  if (hist) hist.innerHTML = '';
}

// ── Crypto News
async function loadCryptoNews() {
  const d = await api('/api/news/crypto');
  const list = document.getElementById('cryptoNewsList');
  if (!list) return;
  const items = d?.data || d?.articles || d?.results || [];
  STATE.cryptoItems = items;   // feed Market AI context
  renderNewsList(list, items, 'hype');
  _scanNewsForAlerts(items);  // bell alert for market-moving headlines
}

// ── Macro News
async function loadMacroNews() {
  const d = await api('/api/news/macro');
  const list = document.getElementById('macroNewsList');
  if (!list) return;
  STATE.macroItems = d?.data || d?.articles || [];
  applyMacroFilter();
  _scanNewsForAlerts(STATE.macroItems);  // bell alert for market-moving headlines
}

function setMacroFilter(f, btn) {
  STATE.macroFilter = f;
  if (btn) {
    btn.closest('.filter-bar').querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
  applyMacroFilter();
}

function applyMacroFilter() {
  const list = document.getElementById('macroNewsList');
  if (!list) return;
  let items = STATE.macroItems;
  if (STATE.macroFilter === 'geo') {
    items = items.filter(n => n.geo || n.tag === 'geo');
  } else if (STATE.macroFilter === 'macro') {
    items = items.filter(n => n.tag === 'macro' && !n.geo);
  } else if (STATE.macroFilter === 'market') {
    items = items.filter(n => n.market_moving);
  }
  renderNewsList(list, items, 'macro');
}

function renderNewsList(el, items, defaultTag) {
  if (!items.length) { el.innerHTML = '<p class="muted tiny" style="padding:8px 0;">No news available.</p>'; return; }
  el.innerHTML = items.slice(0, 15).map(n => {
    const title = n.title || n.headline || '–';
    const url   = n.url || n.link || '#';
    const src   = (typeof n.source === 'string') ? n.source : (n.source?.title || '');
    const time  = n.time || (n.dt || '').slice(11,16) || '';
    const tag   = n.tag || defaultTag;
    const hot   = n.hot ? ' 🔥' : '';
    return `<div class="news-item">
      <span class="news-time">${time}</span>
      <span class="news-tag ${tag}">${tag}</span>
      <div class="news-text"><a href="${url}" target="_blank" rel="noopener">${title}${hot}</a><small>${src}</small></div>
    </div>`;
  }).join('');
}

// ══════════════════════════════════════════════════════════════
//  ECONOMY CALENDAR  (V2 — full redesign)
// ══════════════════════════════════════════════════════════════

const CAL_FLAG_MAP = {
  USD:'🇺🇸', GBP:'🇬🇧', CAD:'🇨🇦', JPY:'🇯🇵', CNY:'🇨🇳',
  HKD:'🇭🇰', SGD:'🇸🇬', EUR:'🇪🇺', AUD:'🇦🇺', NZD:'🇳🇿',
  CHF:'🇨🇭', KRW:'🇰🇷', INR:'🇮🇳', BRL:'🇧🇷', MXN:'🇲🇽',
  ZAR:'🇿🇦', SEK:'🇸🇪', NOK:'🇳🇴', DKK:'🇩🇰', PLN:'🇵🇱',
  TRY:'🇹🇷', CZK:'🇨🇿', HUF:'🇭🇺', ILS:'🇮🇱', SAR:'🇸🇦',
  AED:'🇦🇪', THB:'🇹🇭', IDR:'🇮🇩', MYR:'🇲🇾', PHP:'🇵🇭',
  TWD:'🇹🇼',
};

async function loadCalendar() {
  const list = document.getElementById('calendarList');
  if (list) list.innerHTML = '<div class="cal-loading">Loading calendar…</div>';
  const d = await api('/api/news/calendar?range=30');
  if (d?.status === 'error') {
    if (list) list.innerHTML = `<div class="cal-empty">📭 Calendar unavailable — will retry on next refresh.</div>`;
    STATE.calItems = [];
    return;
  }
  STATE.calItems = d?.data || [];

  // Footer meta
  const src = document.getElementById('calSourceLabel');
  const fat = document.getElementById('calFetchedAt');
  if (src) src.textContent = `Source: ${d?.source || 'ForexFactory'} · ${d?.total ?? STATE.calItems.length} events`;
  if (fat && d?.fetched_at) fat.textContent = `Updated ${new Date(d.fetched_at).toLocaleTimeString('id-ID', {hour:'2-digit',minute:'2-digit'})}`;

  if (!STATE.calItems.length && list) {
    list.innerHTML = '<div class="cal-empty">No events returned. Check Flask terminal.</div>';
    return;
  }
  applyCalFilter();
  _pushCalendarReminders(STATE.calItems);
  _startCalendarAlertTimer();
  _updateCalNextChip();
}

// ── Range toggle (radio, click same to deselect → show all)
function toggleCalRange(range, btn) {
  const already = STATE.calRanges.length === 1 && STATE.calRanges[0] === range;
  document.querySelectorAll('#calRangeBar .cal-tab').forEach(b => b.classList.remove('active'));
  STATE.calRanges = already ? [] : [range];
  if (!already && btn) btn.classList.add('active');
  applyCalFilter();
}

// ── Impact toggle (radio)
function toggleCalImpact(impact, btn) {
  const already = STATE.calImpacts.length === 1 && STATE.calImpacts[0] === impact;
  document.querySelectorAll('#calImpactBar .cal-impact-pill').forEach(b => b.classList.remove('active'));
  STATE.calImpacts = already ? [] : [impact];
  if (!already && btn) btn.classList.add('active');
  applyCalFilter();
}

// ── Currency toggle (multi-select from WL)
function toggleCalCurrency(cur, btn) {
  STATE.calAllCurrencies = false;
  const idx = STATE.calCurrencies.indexOf(cur);
  if (idx === -1) {
    STATE.calCurrencies.push(cur);
    if (btn) btn.classList.add('active');
  } else {
    STATE.calCurrencies.splice(idx, 1);
    if (btn) btn.classList.remove('active');
  }
  applyCalFilter();
}

// ── ALL currencies toggle
function toggleCalCurrencyAll(btn) {
  STATE.calAllCurrencies = !STATE.calAllCurrencies;
  if (btn) btn.classList.toggle('active', STATE.calAllCurrencies);
  if (STATE.calAllCurrencies) {
    // Deactivate individual pills
    document.querySelectorAll('#calCurrencyBar .cal-cur-pill').forEach(b => b.classList.remove('active'));
    STATE.calCurrencies = [];
  } else {
    // Restore default region (US only)
    STATE.calCurrencies = ['USD'];
    document.querySelectorAll('#calCurrencyBar .cal-cur-pill').forEach(b => {
      b.classList.toggle('active', STATE.calCurrencies.includes(b.dataset.cur));
    });
  }
  applyCalFilter();
}

// ── Main filter + render
function applyCalFilter() {
  const list = document.getElementById('calendarList');
  if (!list) return;
  let items = STATE.calItems;

  // Date range
  if (STATE.calRanges.length > 0) {
    items = items.filter(e => {
      const d = e.days_out;
      if (d == null) return false;
      return STATE.calRanges.some(range => {
        if (range === 'yesterday') return d === -1;
        if (range === 'today')     return d === 0;
        if (range === 'tomorrow')  return d === 1;
        if (range === '7d')        return d >= 0 && d <= 7;
        if (range === '30d')       return d >= -1;
        return false;
      });
    });
  }

  // Impact
  if (STATE.calImpacts.length > 0) {
    items = items.filter(e => {
      const imp = (e.impact || '').toLowerCase();
      return STATE.calImpacts.some(f => {
        if (f === 'high')   return imp === 'high';
        if (f === 'medium') return imp.includes('med');
        if (f === 'low')    return imp === 'low' || imp === '';
        return false;
      });
    });
  }

  // Currency (skip filter if ALL mode or empty = WL)
  if (!STATE.calAllCurrencies && STATE.calCurrencies.length > 0) {
    items = items.filter(e => STATE.calCurrencies.includes((e.currency || '').toUpperCase()));
  }

  // Update count badge
  const badge = document.getElementById('calCountBadge');
  const highCount = items.filter(e => (e.impact||'').toLowerCase() === 'high').length;
  if (badge) {
    badge.textContent = `${items.length} events${highCount ? ` · ${highCount} HIGH` : ''}`;
    badge.style.display = items.length ? 'inline-flex' : 'none';
  }

  if (!items.length) {
    list.innerHTML = '<div class="cal-empty">No events match this filter.</div>';
    return;
  }

  // Group by date
  const grouped = {};
  const groupOrder = [];
  for (const e of items.slice(0, 200)) {
    const key = e.date || 'unknown';
    if (!grouped[key]) { grouped[key] = { label: e.day || e.date, events: [] }; groupOrder.push(key); }
    grouped[key].events.push(e);
  }

  let html = '';
  for (const key of groupOrder) {
    const { label, events } = grouped[key];
    const dayHighs = events.filter(e => (e.impact||'').toLowerCase() === 'high').length;
    html += `<div class="cal-date-header">
      <span class="cal-dh-label">${label}</span>
      ${dayHighs ? `<span class="cal-dh-high">${dayHighs} HIGH</span>` : ''}
      <span class="cal-dh-count">${events.length} events</span>
    </div>`;
    for (const e of events) {
      html += _renderCalRow(e);
    }
  }
  list.innerHTML = html;
}

// ── Render a single calendar row
function _renderCalRow(e) {
  const impact   = (e.impact || 'low').toLowerCase();
  const impClass = impact === 'high' ? 'high' : impact.includes('med') ? 'medium' : 'low';
  const impLabel = impact === 'high' ? 'HIGH' : impact.includes('med') ? 'MED' : 'LOW';
  const cur      = (e.currency || '').toUpperCase();
  const flag     = CAL_FLAG_MAP[cur] || '🌐';
  const timeStr  = (e.time || '').replace(' WIB', '');

  // Relative countdown: only for today's future events
  let relTime = '';
  if (e.days_out === 0 && e.iso) {
    const evMs  = new Date(e.iso).getTime();
    const nowMs = Date.now();
    const diffMin = Math.round((evMs - nowMs) / 60000);
    if (diffMin > 0 && diffMin < 1440) {
      const h = Math.floor(diffMin / 60);
      const m = diffMin % 60;
      relTime = h > 0 ? `in ${h}h ${m}m` : `in ${m}m`;
    } else if (diffMin <= 0 && diffMin > -60) {
      relTime = 'NOW';
    }
  }

  // A/F/P cells
  const hasA = e.actual   && e.actual   !== '—';
  const hasF = e.forecast && e.forecast !== '—';
  const hasP = e.previous && e.previous !== '—';
  const revised = e.revised ? ` <span class="cal-revised" title="Revised">(R: ${e.revised})</span>` : '';

  // Surprise badge
  let surpriseHtml = '<span class="cal-surprise-cell">—</span>';
  if (e.beat_miss && e.surprise_pct != null) {
    const sign    = e.surprise_pct > 0 ? '+' : '';
    const cls     = e.beat_miss === 'beat' ? 'beat' : e.beat_miss === 'miss' ? 'miss' : 'inline';
    const icon    = e.beat_miss === 'beat' ? '▲' : e.beat_miss === 'miss' ? '▼' : '●';
    surpriseHtml  = `<span class="cal-surprise ${cls}">${icon} ${sign}${e.surprise_pct.toFixed(1)}%</span>`;
  }

  // Actual cell coloring based on beat/miss
  const actualClass = hasA
    ? (e.beat_miss === 'beat' ? 'cal-actual beat' : e.beat_miss === 'miss' ? 'cal-actual miss' : 'cal-actual inline')
    : 'cal-actual no-data';

  return `<div class="cal-row ${impClass}${relTime === 'NOW' ? ' cal-row-live' : ''}">
    <span class="cal-col-time">
      <span class="cal-time-val">${timeStr || '—'}</span>
      ${relTime ? `<span class="cal-reltime${relTime === 'NOW' ? ' live' : ''}">${relTime}</span>` : ''}
    </span>
    <span class="cal-col-cur">
      <span class="cal-flag-badge cur-${cur}" title="${cur}">
        <span class="cal-flag-emoji">${flag}</span>
        <span class="cal-cur-code">${cur}</span>
      </span>
    </span>
    <span class="cal-col-imp">
      <span class="cal-imp-dot ${impClass}" title="${impLabel} Impact"></span>
      <span class="cal-imp-text ${impClass}">${impLabel}</span>
    </span>
    <span class="cal-col-event" title="${(e.event||'').replace(/"/g,"'")}">
      <span class="cal-event-name">${e.event || '—'}</span>
    </span>
    <span class="cal-col-actual">
      <span class="${actualClass}">${hasA ? e.actual : '—'}</span>${revised}
    </span>
    <span class="cal-col-forecast">
      <span class="cal-forecast">${hasF ? e.forecast : '—'}</span>
    </span>
    <span class="cal-col-previous">
      <span class="cal-previous">${hasP ? e.previous : '—'}</span>
    </span>
    <span class="cal-col-surprise">${surpriseHtml}</span>
  </div>`;
}

// ── Next HIGH event countdown chip
let _calNextChipTimer = null;
function _updateCalNextChip() {
  if (_calNextChipTimer) clearInterval(_calNextChipTimer);
  const _tick = () => {
    const chip  = document.getElementById('calNextChip');
    const label = document.getElementById('calNextLabel');
    if (!chip || !label) return;

    const now   = Date.now();
    const nexts = (STATE.calItems || [])
      .filter(e => (e.impact||'').toLowerCase() === 'high' && e.iso)
      .map(e => ({ ...e, ms: new Date(e.iso).getTime() }))
      .filter(e => e.ms > now)
      .sort((a,b) => a.ms - b.ms);

    if (!nexts.length) { chip.style.display = 'none'; return; }

    const next   = nexts[0];
    const diffMs = next.ms - now;
    const h      = Math.floor(diffMs / 3600000);
    const m      = Math.floor((diffMs % 3600000) / 60000);
    const s      = Math.floor((diffMs % 60000)  / 1000);
    const fmt    = h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;

    chip.style.display = 'inline-flex';
    label.textContent  = `Next HIGH: ${next.currency} ${next.event.slice(0,28)}${next.event.length>28?'…':''} · ${fmt}`;
    chip.title         = `${next.event} @ ${(next.time||'').replace(' WIB','')} WIB`;
  };
  _tick();
  _calNextChipTimer = setInterval(_tick, 1000);
}

// ── Sector Heat
async function loadSectorHeat() {
  const grid = document.getElementById('sectorHeatGrid');
  if (!grid) return;
  // Show loading pulse while fetching (CoinGecko rate-limits to 3-min cache)
  grid.innerHTML = '<p class="muted tiny spinning" style="padding:8px;">↻ Loading…</p>';
  const d = await api('/api/sentiment/sector-heat');
  const sectors = d?.data || d?.sectors || [];
  if (!sectors.length) { grid.innerHTML = '<p class="muted tiny">No sector data.</p>'; return; }

  const heatColor = (p) =>
        p > 6  ? 'var(--profit)'
      : p > 2  ? '#7cc59b'
      : p < -6 ? 'var(--loss)'
      : p < -2 ? '#e08a8a'
      :          'var(--text-3)';

  grid.innerHTML = sectors.map(s => {
    const pct   = s.change_24h ?? 0;
    const col   = heatColor(pct);
    const name  = s.sector || '–';
    const temp  = s.label || '';
    const coins = s.coins || [];
    const rows = coins.length
      ? coins.map(c => {
          const cc = (c.change_24h >= 0) ? 'var(--profit)' : 'var(--loss)';
          return `<div class="heat-coin">
            <span class="hc-sym" title="Copy ${c.symbol}USDT.P" onclick="copyTvSymbol('${c.symbol}')">${c.symbol}</span>
            <span class="hc-chg" style="color:${cc};">${fmtPct(c.change_24h)}</span>
          </div>`;
        }).join('')
      : '<div class="tiny muted">—</div>';
    return `<div class="heat-cell" style="border-left-color:${col};">
      <div class="heat-head"><span class="name">${name}</span><span class="pct" style="color:${col};">${fmtPct(pct)}</span></div>
      <div class="heat-temp">${temp}</div>
      <div class="heat-coins">${rows}</div>
    </div>`;
  }).join('');
}

// ── Risk Guard: drawdown / daily-loss tracker ───────────
const _riskMoney = (v) => (v == null ? '–' : `$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}`);
let _lastRiskBreachKey = '';

function _riskBar(usedPct, breached) {
  const p = Math.max(0, Math.min(100, usedPct || 0));
  const col = (breached || p >= 90) ? 'var(--loss)' : p >= 60 ? 'var(--warn)' : 'var(--profit)';
  return `<div class="risk-bar"><div class="risk-bar-fill" style="width:${p}%;background:${col};"></div></div>`;
}

async function loadRiskStatus() {
  const body = document.getElementById('riskBody');
  const lbl  = document.getElementById('riskProfileLabel');
  if (!body) return;
  const d = await api('/api/risk/status');
  if (lbl) lbl.textContent = d?.profile ? `· ${d.profile}` : '';
  if (!d || d.configured === false) {
    body.innerHTML = `<div class="tiny muted" style="padding:8px 0;">Set your account size + limits (⚙ Limits) to enable the tracker.</div>`;
    _setRiskTopBar(null);
    return;
  }
  const da = d.daily, dd = d.drawdown, M = _riskMoney;
  body.innerHTML = `
    <div class="risk-row">
      <div class="risk-head">
        <span class="risk-name">Daily Loss <span class="tiny muted">(${da.limit_pct}% · realized)</span></span>
        <span class="risk-val" style="color:${da.breached ? 'var(--loss)' : 'var(--text)'};">${M(da.loss)} / ${M(da.limit)}</span>
      </div>
      ${_riskBar(da.used_pct, da.breached)}
      <div class="tiny muted" style="margin-top:3px;">${da.breached ? '🚨 BREACHED — stop trading' : `Buffer left: ${M(da.remaining)} · today PnL ${M(da.pnl)}`}</div>
    </div>
    <div class="risk-row" style="margin-top:14px;">
      <div class="risk-head">
        <span class="risk-name">Max Drawdown <span class="tiny muted">(${dd.limit_pct}% · equity)</span></span>
        <span class="risk-val">limit ${M(dd.limit)}</span>
      </div>
      <div style="margin-top:4px;">
        <div class="tiny" style="margin-bottom:2px;">Static <span class="muted">(from start)</span>: <b style="color:${dd.static_breached ? 'var(--loss)' : 'var(--text)'};">${M(dd.static)}</b></div>
        ${_riskBar(dd.static_pct, dd.static_breached)}
        <div class="tiny" style="margin:7px 0 2px;">Trailing <span class="muted">(from peak ${M(d.peak_equity)})</span>: <b style="color:${dd.trailing_breached ? 'var(--loss)' : 'var(--text)'};">${M(dd.trailing)}</b></div>
        ${_riskBar(dd.trailing_pct, dd.trailing_breached)}
      </div>
      <div class="tiny muted" style="margin-top:5px;">Equity ${M(d.equity)} · Account ${M(d.account_size)}</div>
    </div>`;

  if (d.breached) {
    const msgs = [];
    if (da.breached) msgs.push(`Daily loss ${M(da.loss)} / ${M(da.limit)}`);
    if (dd.static_breached || dd.trailing_breached) msgs.push(`Max drawdown breached (limit ${M(dd.limit)})`);
    const msg = msgs.join(' · ');
    _setRiskTopBar(msg);
    if (msg !== _lastRiskBreachKey) {            // alert once per new breach state
      _lastRiskBreachKey = msg;
      try { _playAlertSound(); } catch (e) {}
      try { if (window.Notification && Notification.permission === 'granted') new Notification('🚨 Risk Breach', { body: msg }); } catch (e) {}
    }
  } else {
    _setRiskTopBar(null);
    _lastRiskBreachKey = '';
  }
}

function _setRiskTopBar(msg) {
  let bar = document.getElementById('riskTopBar');
  if (!msg) { if (bar) bar.style.display = 'none'; return; }
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'riskTopBar';
    bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9998;background:var(--loss);color:#fff;font-weight:700;text-align:center;padding:9px 44px;font-size:13px;box-shadow:0 2px 14px rgba(0,0,0,.45);';
    document.body.appendChild(bar);
  }
  bar.innerHTML = `🚨 RISK BREACH — ${msg}<button onclick="document.getElementById('riskTopBar').style.display='none'" style="margin-left:14px;background:rgba(255,255,255,.22);border:none;color:#fff;border-radius:6px;padding:2px 9px;cursor:pointer;font-weight:700;">Dismiss</button>`;
  bar.style.display = 'block';
}

function toggleRiskSettings() {
  const s = document.getElementById('riskSettings');
  if (!s) return;
  const showing = s.style.display !== 'none';
  s.style.display = showing ? 'none' : 'block';
  if (!showing) loadRiskSettingsForm();
}

async function loadRiskSettingsForm() {
  const d = await api('/api/risk/profile');
  const r = d?.data || {};
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = (v && v > 0) ? v : ''; };
  set('riskAcctSize', r.account_size);
  set('riskDailyPct', r.daily_loss_pct);
  set('riskDdPct',    r.max_drawdown_pct);
}

async function saveRiskSettings(btn) {
  const acct = parseFloat(document.getElementById('riskAcctSize').value) || 0;
  const dl   = parseFloat(document.getElementById('riskDailyPct').value) || 0;
  const dd   = parseFloat(document.getElementById('riskDdPct').value) || 0;
  const d = await api('/api/risk/profile', { method: 'POST', body: JSON.stringify({ account_size: acct, daily_loss_pct: dl, max_drawdown_pct: dd }) });
  if (d?.status === 'ok') { showToast('Risk limits saved for ' + (d.profile || 'profile'), 'success'); toggleRiskSettings(); loadRiskStatus(); }
  else showToast(d?.message || 'Save failed', 'error');
}

async function resetRiskPeak() {
  await api('/api/risk/profile', { method: 'POST', body: JSON.stringify({ reset_peak: true }) });
  showToast('Trailing peak reset to current equity', 'success');
  loadRiskStatus();
}

// ── YouTube Fetch (Overview) ─────────────────────────
async function loadYoutubeChannels() {
  const el = document.getElementById('ytChannelList');
  if (!el) return;
  const d = await api('/api/youtube/channels');
  const channels = d?.data || [];
  if (!channels.length) {
    el.innerHTML = '<p class="muted tiny" style="padding:4px 0;">No channels yet. Add one above.</p>';
    return;
  }
  el.innerHTML = channels.map(ch => {
    const rowId  = ch.id;                      // SQLite row id — used for delete
    const ytCid  = ch.channel_id;              // YouTube "UCxxx" id — used for fetch
    const name   = ch.name || ch.channel_id;
    const thumb  = ch.thumbnail || '';
    return `<div class="yt-ch-row" id="yt-ch-${rowId}">
      <div class="yt-ch-info">
        ${thumb ? `<img src="${thumb}" class="yt-ch-thumb" alt="${name}"/>` : '<div class="yt-ch-thumb-ph">YT</div>'}
        <span class="yt-ch-name">${name}</span>
      </div>
      <div class="yt-ch-actions">
        <select class="yt-count-picker" id="yt-count-${rowId}" title="How many videos to fetch">
          <option value="3">3 vids</option>
          <option value="5">5 vids</option>
          <option value="10" selected>10 vids</option>
          <option value="15">15 vids</option>
          <option value="20">20 vids</option>
        </select>
        <button class="btn sm" onclick="fetchYtChannel('${ytCid}',${rowId},'${name}',this)">⬇ Fetch</button>
        <button class="btn sm ghost" id="yt-close-${rowId}" onclick="collapseYtVideos(${rowId})" style="display:none;" title="Collapse">✕</button>
        <button class="btn sm ghost" onclick="deleteYtChannel(${rowId},this)" style="color:var(--cinnabar);">🗑</button>
      </div>
      <div class="yt-video-list" id="yt-vids-${rowId}" style="display:none;"></div>
    </div>`;
  }).join('');
  // Restore any previously fetched results that survived the re-render
  if (STATE.ytResults) {
    Object.entries(STATE.ytResults).forEach(([rid, html]) => {
      const vl = document.getElementById(`yt-vids-${rid}`);
      const cl = document.getElementById(`yt-close-${rid}`);
      if (vl && html) { vl.innerHTML = html; vl.style.display = ''; }
      if (cl) cl.style.display = '';
    });
  }
}

function toggleYtAddForm() {
  const f = document.getElementById('ytAddForm');
  if (f) f.style.display = f.style.display === 'none' ? '' : 'none';
}

async function addYtChannel() {
  const url  = (document.getElementById('ytAddUrl')?.value || '').trim();
  const name = (document.getElementById('ytAddName')?.value || '').trim();
  const msg  = document.getElementById('ytAddMsg');
  if (!url) { if (msg) msg.textContent = 'Enter a channel URL or @handle.'; return; }
  if (msg) msg.textContent = 'Resolving channel…';
  const d = await api('/api/youtube/channels', { method: 'POST', body: JSON.stringify({ url, name }) });
  if (d?.status === 'ok') {
    if (msg) msg.textContent = `✓ Added: ${d.name || name}`;
    document.getElementById('ytAddUrl').value  = '';
    document.getElementById('ytAddName').value = '';
    setTimeout(() => { if (msg) msg.textContent = ''; }, 3000);
    await loadYoutubeChannels();
  } else {
    if (msg) msg.textContent = `Error: ${d?.message || 'unknown error'}`;
  }
}

async function deleteYtChannel(cid, btn) {
  if (!confirm('Remove this channel?')) return;
  const d = await api(`/api/youtube/channels/${cid}`, { method: 'DELETE' });
  if (d?.status === 'ok') await loadYoutubeChannels();
  else showToast('Delete failed', 'error');
}

function collapseYtVideos(rowId) {
  const vl = document.getElementById(`yt-vids-${rowId}`);
  const cl = document.getElementById(`yt-close-${rowId}`);
  if (vl) vl.style.display = 'none';
  if (cl) cl.style.display = 'none';
  if (STATE.ytResults) delete STATE.ytResults[rowId];
}

async function fetchYtChannel(ytCid, rowId, chName, btn) {
  const vidList = document.getElementById(`yt-vids-${rowId}`);
  const countEl = document.getElementById(`yt-count-${rowId}`);
  const closeBtn = document.getElementById(`yt-close-${rowId}`);
  const maxResults = parseInt(countEl?.value || '10', 10);
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Fetching…'; }
  const d = await api('/api/youtube/fetch-channel', { method: 'POST', body: JSON.stringify({ channel_id: ytCid, max_results: maxResults }) });
  if (btn) { btn.disabled = false; btn.textContent = '⬇ Fetch'; }
  const videos = d?.videos || d?.data || [];
  if (!vidList) return;
  if (!videos.length) {
    vidList.style.display = '';
    vidList.innerHTML = '<p class="muted tiny" style="padding:6px 0 2px;">No videos found.</p>';
    if (closeBtn) closeBtn.style.display = '';
    return;
  }
  const html = videos.map(v => {
    const vid   = v.video_id || v.id || '';
    const url   = vid ? `https://youtube.com/watch?v=${vid}` : '#';
    const title = v.title || 'Untitled';
    const pub   = (v.published || v.published_at || '').slice(0, 10);
    const thumb = v.thumbnail || '';
    return `<div class="yt-vid-item">
      ${thumb ? `<a href="${url}" target="_blank" rel="noopener"><img src="${thumb}" class="yt-vid-thumb" alt="${title}" loading="lazy"/></a>` : ''}
      <div class="yt-vid-meta">
        <a class="yt-title" href="${url}" target="_blank" rel="noopener">${title}</a>
        <div class="yt-vid-actions">
          ${pub ? `<span class="muted tiny">${pub}</span>` : ''}
          <button class="btn xs ghost" onclick="navigator.clipboard.writeText('${url}').then(()=>showToast('Link copied','ok'))" title="Copy link">📋 Copy</button>
        </div>
      </div>
    </div>`;
  }).join('');
  vidList.innerHTML = html;
  vidList.style.display = '';
  if (closeBtn) closeBtn.style.display = '';
  // Persist so auto-refresh doesn't wipe results
  if (!STATE.ytResults) STATE.ytResults = {};
  STATE.ytResults[rowId] = html;
}

// ════════════════════════════════════════════════════════════
//  SCREENER SECTION
// ════════════════════════════════════════════════════════════
const SCREENERS = [
  { id:1,  name:'S1 MTF Confluence',      zh:'多周期共振',   desc:'EMA 9/21 trend alignment across 15m/30m/1H/4H' },
  { id:2,  name:'S2 Breakout',            zh:'突破',         desc:'Price breaking key resistance with volume' },
  { id:3,  name:'S3 Pullback to EMA',     zh:'均线回踩',     desc:'Price pulling back to key EMA after trend move' },
  { id:4,  name:'S4 Volume Surge',        zh:'量能爆发',     desc:'Abnormal volume spike vs 20-period average' },
  { id:5,  name:'S5 Funding Extreme',     zh:'资金费率',     desc:'Funding rate at extremes (±0.1%+)' },
  { id:6,  name:'S6 OI Expansion',        zh:'OI扩张',       desc:'Open interest increasing with price move' },
  { id:7,  name:'S7 Oversold Bounce',     zh:'超卖反弹',     desc:'RSI below 30 with bullish reversal signal' },
  { id:8,  name:'S8 Momentum',            zh:'动量',         desc:'Strong momentum candles on 4H timeframe' },
  { id:9,  name:'S9 Bull Structure',      zh:'多头结构',     desc:'Higher Highs + Higher Lows on 1H + 4H' },
  { id:10, name:'S10 Bear Structure',     zh:'空头结构',     desc:'Lower Highs + Lower Lows on 1H + 4H' },
  { id:11, name:'Hot',                    zh:'热门',         desc:'Composite: momentum + volatility + volume + RSI' },
];

// buildScreenerList / selectScreener / runActiveScreener removed in V4.1 — Run All only.

async function runAllScreeners() {
  const btn = document.getElementById('btnRunAll');
  await _execScreener(SCREENERS.map(s => s.id), btn, '⚡ Run All');
}

async function _execScreener(ids, btn, resetLabel) {
  const status = document.getElementById('screenerStatus');
  const body   = document.getElementById('screenerBody');
  const runBtn = document.getElementById('btnRunScreener');

  status.style.display = '';
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Running…'; }
  if (runBtn) runBtn.disabled = true;
  body.innerHTML = '';

  const d = await api('/api/screener/run', {
    method: 'POST',
    body: JSON.stringify({ screener_ids: ids })
  });

  status.style.display = 'none';
  if (btn) { btn.disabled = false; btn.innerHTML = resetLabel; }
  if (runBtn) { runBtn.disabled = false; runBtn.innerHTML = '▶ Run'; }

  // Response: { results: { "1": { coins: [...], count: N, name: "..." }, "2": {...} } }
  const resultsMap = d?.results || {};
  let allCoins = [];

  if (ids.length === 1) {
    // Single screener — show its coins directly
    allCoins = resultsMap[ids[0]]?.coins || [];
    document.getElementById('screenerResultCount').textContent = `${allCoins.length} results`;
  } else {
    // Run All — aggregate all coins, tag with screener name
    Object.entries(resultsMap).forEach(([sid, res]) => {
      (res.coins || []).forEach(c => {
        allCoins.push({ ...c, _screenerName: res.name || `S${sid}`, _screenerId: sid });
      });
    });
    const total = Object.values(resultsMap).reduce((s, r) => s + (r.count || 0), 0);
    document.getElementById('screenerResultCount').textContent =
      `${total} results across ${Object.keys(resultsMap).length} screeners`;
  }

  STATE._scrCoins = allCoins;
  if (!STATE._scrSparkTf) STATE._scrSparkTf = '1h';   // default 1H
  renderScreenerTable();
}

// ── Screener Coin/Spot tab switch ──
function switchScreenerTab(tab, btn) {
  STATE._scrTab = tab;
  const coin = document.getElementById('scrCoinPane');
  const spot = document.getElementById('scrSpotPane');
  if (coin) coin.style.display = tab === 'coin' ? '' : 'none';
  if (spot) spot.style.display = tab === 'spot' ? '' : 'none';
  document.querySelectorAll('#scrTopTabs button').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

// ── Sparkline timeframe + time-window controls ──
const _SCR_TF_MIN    = { '15m': 15, '30m': 30, '1h': 60, '4h': 240 };  // candle minutes
const _SCR_TF_FULL_H = { '15m': 48, '30m': 48, '1h': 48, '4h': 48 };   // full window (hours) — 48H max all TFs

function setScreenerSparkTf(tf, btn) {
  STATE._scrSparkTf = tf;
  STATE._scrSparkHours = _SCR_TF_FULL_H[tf];   // reset window to full for this TF
  if (btn) { btn.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('active')); btn.classList.add('active'); }
  const sl = document.getElementById('scrSparkSlider');
  if (sl) { sl.max = _SCR_TF_FULL_H[tf]; sl.value = _SCR_TF_FULL_H[tf]; }
  const sp = document.getElementById('scrSparkSpan');
  if (sp) sp.textContent = _SCR_TF_FULL_H[tf] + 'H';
  renderScreenerTable();
}

// Slider: shrink the visible window (last N hours) so fewer candles stretch wider
function onScreenerSparkSlide(val) {
  STATE._scrSparkHours = parseInt(val);
  const sp = document.getElementById('scrSparkSpan');
  if (sp) sp.textContent = val + 'H';
  renderScreenerTable();
}

// Copy the TradingView perp symbol (e.g. BAS → BASUSDT.P) to clipboard
function copyTvSymbol(sym) {
  const base = String(sym || '').toUpperCase().replace(/USDT.*$/, '').replace(/\.P$/, '').replace(/PERP$/, '');
  if (!base) return;
  const tv = base + 'USDT.P';
  const done = () => showToast(`${tv} copied — paste into TradingView`, 'success');
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(tv).then(done, () => showToast('Copy failed', 'error'));
  else { const t = document.createElement('textarea'); t.value = tv; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); done(); } catch { showToast('Copy failed', 'error'); } document.body.removeChild(t); }
}

// ── Column sorting ──
function sortScreener(key) {
  const s = STATE._scrSort || { key: null, dir: -1 };
  if (s.key === key) s.dir = -s.dir;
  else { s.key = key; s.dir = (key === 'symbol') ? 1 : -1; }   // text asc, numbers desc by default
  STATE._scrSort = s;
  renderScreenerTable();
}

function _scrSortVal(c, key) {
  switch (key) {
    case 'symbol':   return (c.symbol || '');
    case 'price':    return c.price    ?? null;
    case 'p4h':      return c.p_4h     ?? null;
    case 'p24h':     return c.p_24h    ?? null;
    case 'funding':  return c.funding  ?? null;
    case 'turnover': return c.turnover ?? null;
    case 'score':    return c.siren    ?? null;
    case 'ls': {
      const R = ((c.reasoning || '') + ' ' + (c.mtf_signal || '')).toUpperCase();
      if (R.includes('STRONG LONG')  || R.includes('HEAVY LONG'))  return 2;
      if (R.includes('STRONG SHORT') || R.includes('HEAVY SHORT')) return -2;
      if (R.includes('LONG'))  return 1;
      if (R.includes('SHORT')) return -1;
      return 0;
    }
    case 'oi': {
      const m = { 'Longs ↑': 2, 'Short cover': 1, 'Long exit': -1, 'Shorts ↑': -2 };
      return c.oi_regime != null ? (m[c.oi_regime] ?? 0) : null;
    }
    default: return null;
  }
}

// ── Render coin screener table (Symbol, Price, Sparkline, 4H%, 24H%, Funding, Turnover, OI/Price, L/S) ──
function renderScreenerTable() {
  const body = document.getElementById('screenerBody');
  if (!body) return;
  const coins = STATE._scrCoins || [];
  const tf = STATE._scrSparkTf || '1h';
  const candleMin = _SCR_TF_MIN[tf] || 60;
  const hours = STATE._scrSparkHours || _SCR_TF_FULL_H[tf] || 24;
  const bars  = Math.max(6, Math.round(hours * 60 / candleMin));   // last N candles to show
  if (!coins.length) {
    body.innerHTML = `<tr><td colspan="10" class="muted tiny" style="padding:20px;text-align:center;">No results. Market may be quiet — try again later.</td></tr>`;
    return;
  }
  const _oiCol = { 'Longs ↑': 'var(--profit)', 'Shorts ↑': 'var(--loss)', 'Short cover': 'var(--warn)', 'Long exit': 'var(--text-3)' };

  // sort (default: score desc) + reflect arrows in headers
  if (!STATE._scrSort) STATE._scrSort = { key: 'score', dir: -1 };
  const sort = STATE._scrSort;
  const rows = coins.slice().sort((a, b) => {
    const va = _scrSortVal(a, sort.key), vb = _scrSortVal(b, sort.key);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === 'string') return sort.dir * va.localeCompare(vb);
    return sort.dir * (va - vb);
  });
  document.querySelectorAll('#screenerTable th.sortable').forEach(th => {
    const a = th.querySelector('.sort-arrow');
    if (a) a.textContent = (th.dataset.sortkey === sort.key) ? (sort.dir > 0 ? ' ▲' : ' ▼') : '';
  });

  body.innerHTML = rows.map((c) => {
    const price = c.price ?? 0;
    const ch4h  = c.p_4h  ?? null;
    const ch24h = c.p_24h ?? null;
    const fund  = c.funding ?? null;
    const tag   = c._screenerName ? `<span class="scr-screener-tag">${c._screenerName}</span>` : '';
    const priceFmt = price > 1 ? parseFloat(price).toFixed(2) : parseFloat(price).toPrecision(4);

    // Long / Short from reasoning (Heavy Long / Long / Short / Heavy Short)
    const R = ((c.reasoning || '') + ' ' + (c.mtf_signal || '')).toUpperCase();
    let lsHtml;
    if (R.includes('STRONG LONG') || R.includes('HEAVY LONG'))
      lsHtml = `<span class="scr-ls long">▲▲ Heavy Long</span>`;
    else if (R.includes('STRONG SHORT') || R.includes('HEAVY SHORT'))
      lsHtml = `<span class="scr-ls short">▼▼ Heavy Short</span>`;
    else if (R.includes('LONG'))
      lsHtml = `<span class="scr-ls long">▲ Long</span>`;
    else if (R.includes('SHORT'))
      lsHtml = `<span class="scr-ls short">▼ Short</span>`;
    else
      lsHtml = `<span class="muted tiny">–</span>`;

    const fundHtml = fund != null
      ? `<span class="${fund > 0.0002 ? 'pnl-neg' : fund < -0.0002 ? 'pnl-pos' : 'muted'}" style="${c.funding_extreme ? 'font-weight:800;' : ''}">${(fund * 100).toFixed(4)}%${c.funding_extreme ? ' ⚡' : ''}</span>`
      : '–';

    // Turnover (Vol/MCap %) — green when ≥50% (your rule)
    const turnHtml = c.turnover != null
      ? `<span style="color:${c.turnover >= 50 ? 'var(--jade)' : 'var(--text-2)'};font-weight:${c.turnover >= 50 ? 700 : 400};">${c.turnover}%</span>`
      : '<span class="muted">–</span>';

    // OI / Price regime badge
    const oiHtml = c.oi_regime
      ? `<span style="font-size:11px;font-weight:600;color:${_oiCol[c.oi_regime] || 'var(--text-3)'};">${c.oi_regime}</span>`
      : '<span class="muted tiny">–</span>';

    const sparkFull = c['spark_' + tf] || c.spark || [];
    const sparkData = sparkFull.slice(-bars);
    const sparkHtml = `<svg width="200" height="36" style="display:block;">${sparklineSvg(sparkData, 200, 36)}</svg>`;

    return `<tr>
      <td class="sym"><strong class="copy-sym" title="Click to copy ${c.symbol}USDT.P for TradingView" onclick="copyTvSymbol('${c.symbol}')">${c.symbol || '–'}</strong>${tag}</td>
      <td class="num">$${priceFmt}</td>
      <td>${sparkHtml}</td>
      <td class="num ${ch4h  != null ? pnlClass(ch4h)  : ''}">${ch4h  != null ? fmtPct(ch4h)  : '–'}</td>
      <td class="num ${ch24h != null ? pnlClass(ch24h) : ''}">${ch24h != null ? fmtPct(ch24h) : '–'}</td>
      <td class="num">${fundHtml}</td>
      <td class="num">${turnHtml}</td>
      <td>${oiHtml}</td>
      <td>${lsHtml}</td>
      <td><button class="btn sm ghost" onclick="openScreenerAlert('${c.symbol}','${price}')">🔔</button></td>
    </tr>`;
  }).join('');
}

function sparklineSvg(data, w, h) {
  if (!data || data.length < 2) return '';
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const isUp = data[data.length-1] >= data[0];
  const color = isUp ? 'var(--profit)' : 'var(--loss)';
  return `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5"/>`;
}

// ════════════════════════════════════════════════════════════
//  PROFILE MODAL
// ════════════════════════════════════════════════════════════
function openProfileModal() {
  document.getElementById('profileModalBackdrop').style.display = '';
  document.getElementById('profileModal').style.display = '';
  loadProfileList();
}

function closeProfileModal() {
  document.getElementById('profileModalBackdrop').style.display = 'none';
  document.getElementById('profileModal').style.display = 'none';
}

async function loadProfileList() {
  const el    = document.getElementById('profileList');
  const label = document.getElementById('profileActiveLabel');
  const d = await api('/api/profiles');
  const profiles = d?.profiles || [];
  const active   = d?.active || null;

  // Always update the header avatar tooltip (even if modal isn't open)
  if (active) {
    const activePf = profiles.find(p => p.active) || { label: active, name: active, mode: 'demo' };
    updateProfileUI(activePf);
  }

  if (!el) return;  // called silently on boot (no modal open) — stop here
  if (label) label.textContent = active ? `Active: ${active}` : 'No active profile';
  if (!profiles.length) {
    if (d?.status === 'error') {
      el.innerHTML = '<p style="color:var(--cinnabar);font-size:12px;">⚠️ Could not load profiles — server error. Restart Flask and refresh.</p>';
    } else {
      el.innerHTML = '<p class="muted tiny">No profiles yet — add one below.</p>';
    }
    updateProfileUI(null);
    return;
  }
  el.innerHTML = profiles.map(p => {
    const modeTag = p.mode === 'live' ? '🟢 LIVE' : p.mode === 'testnet' ? '🔵 TEST' : '🟡 DEMO';
    const isCurrent = p.active;
    return `<div class="profile-row${isCurrent ? ' active' : ''}">
      <div class="profile-row-info">
        <span class="profile-name">${p.label || p.name}</span>
        <span class="profile-mode">${modeTag}</span>
        <span class="profile-key tiny muted">${p.key_hint}</span>
      </div>
      <div class="profile-row-actions">
        ${!isCurrent ? `<button class="btn sm jade" onclick="switchToProfile('${p.name}',this)">Switch</button>` : '<span class="tiny" style="color:var(--jade);font-weight:600;">● Active</span>'}
        <button class="btn sm ghost" onclick="editProfile('${p.name}','${p.mode}')">✏️</button>
        <button class="btn sm ghost" style="color:var(--cinnabar);" onclick="deleteProfile('${p.name}',this)">✕</button>
      </div>
    </div>`;
  }).join('');
  // Update active profile in header
  const activeProfile = profiles.find(p => p.active);
  updateProfileUI(activeProfile || null);
}

function updateProfileUI(profile) {
  // Update the avatar tooltip and rail label to show active profile name
  const av = document.getElementById('headerAvatar');
  const rc = document.getElementById('railCompanion');
  const name = profile ? (profile.label || profile.name) : 'No Profile';
  const mode = profile ? (profile.mode || 'demo') : '';
  if (av) av.title = `Profile: ${name} ${mode ? '· ' + mode.toUpperCase() : ''} — Click to switch`;
  if (rc) rc.title = `Profile: ${name} — Click to switch`;
}

async function switchToProfile(name, btn) {
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  const d = await api('/api/profiles/switch', { method: 'POST', body: JSON.stringify({ name }) });
  if (btn) { btn.disabled = false; btn.textContent = 'Switch'; }
  if (d?.status === 'ok') {
    // Close modal immediately
    closeProfileModal();
    // Immediately show the new profile in the header (optimistic — mode unknown until reload)
    updateProfileUI({ label: name, name, mode: 'demo' });
    // Show prominent banner toast
    showToast(`✓ Profile switched → ${name}`, 'success');
    // Reload profile list (gets real mode) + all data for new profile
    loadProfileList();
    loadKPIs();
    loadEquityChart();
    loadOverviewMetrics && loadOverviewMetrics();
    if (document.getElementById('sec-positions')?.style.display !== 'none') {
      loadPositions(); loadOrders();
    }
    if (document.getElementById('sec-journal')?.style.display !== 'none') {
      loadJournal && loadJournal();
    }
    if (document.getElementById('sec-history')?.style.display !== 'none') {
      loadHistoryYears && loadHistoryYears();
    }
  } else {
    showToast(d?.message || 'Switch failed', 'error');
  }
}

async function saveProfile() {
  const name   = (document.getElementById('pfName')?.value || '').trim();
  const key    = (document.getElementById('pfKey')?.value || '').trim();
  const secret = (document.getElementById('pfSecret')?.value || '').trim();
  const mode   = document.getElementById('pfMode')?.value || 'demo';
  const msg    = document.getElementById('pfMsg');
  if (!name) { if (msg) { msg.textContent = 'Profile name is required.'; msg.style.color = 'var(--cinnabar)'; } return; }
  if (!key || !secret) { if (msg) { msg.textContent = 'API key and secret are required.'; msg.style.color = 'var(--cinnabar)'; } return; }
  const body = {
    name, label: name, api_key: key, api_secret: secret,
    mode, demo: mode === 'demo', testnet: mode === 'testnet'
  };
  const d = await api('/api/profiles', { method: 'POST', body: JSON.stringify(body) });
  if (d?.status === 'ok') {
    if (msg) { msg.textContent = `✓ ${d.message}`; msg.style.color = 'var(--jade)'; }
    document.getElementById('pfName').value   = '';
    document.getElementById('pfKey').value    = '';
    document.getElementById('pfSecret').value = '';
    loadProfileList();
    setTimeout(() => { if (msg) msg.textContent = ''; }, 3000);
  } else {
    if (msg) { msg.textContent = d?.message || 'Save failed'; msg.style.color = 'var(--cinnabar)'; }
  }
}

function editProfile(name, mode) {
  // Pre-fill the Add/Update form so user can change keys
  const pfName   = document.getElementById('pfName');
  const pfMode   = document.getElementById('pfMode');
  const pfKey    = document.getElementById('pfKey');
  const pfSecret = document.getElementById('pfSecret');
  const pfMsg    = document.getElementById('pfMsg');
  if (pfName)   pfName.value   = name;
  if (pfMode)   pfMode.value   = mode || 'demo';
  if (pfKey)    pfKey.value    = '';
  if (pfSecret) pfSecret.value = '';
  if (pfMsg)    { pfMsg.textContent = `Editing "${name}" — paste new keys then Save`; pfMsg.style.color = 'var(--warn)'; }
  // Scroll down to the form
  document.getElementById('pfKey')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  document.getElementById('pfKey')?.focus();
}

async function deleteProfile(name, btn) {
  if (!confirm(`Delete profile "${name}"?`)) return;
  const d = await api(`/api/profiles/${name}`, { method: 'DELETE' });
  if (d?.status === 'ok') {
    showToast(`Profile "${name}" removed`);
    loadProfileList();
  } else {
    showToast(d?.message || 'Delete failed', 'error');
  }
}

// ════════════════════════════════════════════════════════════
//  POSITIONS SECTION
// ════════════════════════════════════════════════════════════
async function loadBybitStatus() {
  const d = await api('/api/bybit/status');
  const el = document.getElementById('bybitMode');
  if (!el) return;
  const mode = d?.mode || d?.data?.mode || 'unknown';
  el.textContent = mode.toUpperCase();
  el.style.color = mode === 'live' ? 'var(--loss)' : 'var(--warn)';
}

async function loadPositions() {
  const d = await api('/api/bybit/positions');
  const body = document.getElementById('positionsBody');
  if (!body) return;
  const rows = d?.result?.list || d?.data || [];
  if (!rows.length) { body.innerHTML = `<tr><td colspan="9" class="muted tiny" style="padding:20px;text-align:center;">No open positions</td></tr>`; return; }
  body.innerHTML = rows.map(p => {
    const pnl = parseFloat(p.unrealised_pnl ?? p.unrealisedPnl ?? 0);
    return `<tr>
      <td class="sym">${p.symbol}</td>
      <td>${sideTag(p.side)}</td>
      <td class="num">${fmtUSD(p.position_value || 0)}</td>
      <td class="num">${parseFloat(p.entry_price || 0).toFixed(4)}</td>
      <td class="num">${parseFloat(p.mark_price || 0).toFixed(4)}</td>
      <td class="num">${p.liq_price ? parseFloat(p.liq_price).toFixed(4) : '–'}</td>
      <td class="num">${p.leverage || '–'}x</td>
      <td class="num ${pnlClass(pnl)} balance-val">${fmt$(pnl)}</td>
      <td><button class="btn sm ghost" style="color:var(--loss);" onclick="closePosition('${p.symbol}','${p.side}')">Close</button></td>
    </tr>`;
  }).join('');
}

async function closePosition(symbol, side) {
  if (!confirm(`Close ${side} ${symbol}?`)) return;
  const closeSide = side.toLowerCase() === 'buy' ? 'Sell' : 'Buy';
  const d = await api('/api/bybit/place-order', {
    method: 'POST',
    body: JSON.stringify({ symbol, side: closeSide, order_type: 'Market', margin_usdt: 0, reduce_only: true })
  });
  alert(d.message || d.status);
  loadPositions();
}

async function loadOrders() {
  const d = await api('/api/bybit/orders');

  // ── Active (regular) orders — TP/SL excluded ──
  const body = document.getElementById('ordersBody');
  if (body) {
    const rows = d?.data || [];
    body.innerHTML = rows.length ? rows.map(o => `<tr>
      <td class="sym">${o.symbol}</td>
      <td>${sideTag(o.side)}</td>
      <td><span class="tiny muted">${o.order_type || '–'}</span></td>
      <td class="num">${parseFloat(o.price || 0).toFixed(4)}</td>
      <td class="num">${o.qty || '–'}</td>
      <td><span class="tiny muted">${o.status || '–'}</span></td>
      <td><button class="btn sm ghost" style="color:var(--loss);" onclick="cancelOrder('${o.symbol}','${o.order_id}')">Cancel</button></td>
    </tr>`).join('') : `<tr><td colspan="7" class="muted tiny" style="padding:20px;text-align:center;">No active orders</td></tr>`;
  }

  // ── TP / SL — one combined row per position (like Bybit) ──
  const tpslBody = document.getElementById('tpslBody');
  if (tpslBody) {
    const ts = d?.tpsl || [];
    tpslBody.innerHTML = ts.length ? ts.map(t => {
      const tp = t.tp ? `${parseFloat(t.tp.price).toFixed(4)} <span class="tiny muted">(${t.tp.trigger_by})</span>` : '–';
      const sl = t.sl ? `${parseFloat(t.sl.price).toFixed(4)} <span class="tiny muted">(${t.sl.trigger_by})</span>` : '–';
      const cTp = t.tp ? `<button class="btn sm ghost" title="Cancel TP" style="color:var(--loss);font-size:10px;" onclick="cancelOrder('${t.symbol}','${t.tp.order_id}')">✕ TP</button>` : '';
      const cSl = t.sl ? `<button class="btn sm ghost" title="Cancel SL" style="color:var(--loss);font-size:10px;" onclick="cancelOrder('${t.symbol}','${t.sl.order_id}')">✕ SL</button>` : '';
      return `<tr>
        <td class="sym">${t.symbol}</td>
        <td>${sideTag(t.pos_side)}</td>
        <td class="num">${t.qty || '–'}</td>
        <td class="num" style="color:var(--profit);">${tp}</td>
        <td class="num" style="color:var(--loss);">${sl}</td>
        <td><div style="display:flex;gap:4px;justify-content:flex-end;">${cTp}${cSl}</div></td>
      </tr>`;
    }).join('') : `<tr><td colspan="6" class="muted tiny" style="padding:20px;text-align:center;">No TP/SL set</td></tr>`;
  }
}

async function cancelOrder(symbol, orderId) {
  if (!confirm(`Cancel order ${orderId}?`)) return;
  const d = await api('/api/bybit/cancel-order', { method: 'POST', body: JSON.stringify({ symbol, order_id: orderId }) });
  alert(d.message || d.status);
  loadOrders();
}

async function loadAlerts() {
  const d = await api('/api/price-alerts');
  const body = document.getElementById('alertsBody');
  if (!body) return;
  // GET /api/price-alerts returns a plain array, not {data:[...]}
  const rows = Array.isArray(d) ? d : (d?.data || d?.alerts || []);
  if (!rows.length) { body.innerHTML = `<tr><td colspan="7" class="muted tiny" style="padding:20px;text-align:center;">No alerts set</td></tr>`; return; }
  body.innerHTML = rows.map(a => {
    // Format created_at → "26 May 10:42"
    let createdFmt = '–';
    if (a.created_at) {
      try {
        const d = new Date(a.created_at.replace(' ', 'T'));
        const day = d.getDate();
        const mon = d.toLocaleString('en', { month: 'short' });
        const hh  = String(d.getHours()).padStart(2, '0');
        const mm  = String(d.getMinutes()).padStart(2, '0');
        createdFmt = `${day} ${mon} ${hh}:${mm}`;
      } catch(_) {}
    }
    return `<tr>
    <td class="sym">${a.symbol}USDT</td>
    <td class="num">$${_fmtAlertPrice(a.target_price)}</td>
    <td><span class="tag ${a.direction === 'above' ? 'long' : 'short'}">${a.direction === 'above' ? '▲ Above' : '▼ Below'}</span></td>
    <td class="tiny muted">${a.note || '–'}</td>
    <td class="tiny muted">${createdFmt}</td>
    <td><span class="tag ${a.triggered ? 'profit' : 'be'}">${a.triggered ? 'TRIGGERED' : 'ACTIVE'}</span></td>
    <td><button class="btn sm ghost" style="color:var(--loss);" onclick="deleteAlert(${a.id})">✕</button></td>
  </tr>`;
  }).join('');
}

async function deleteAlert(id) {
  await api(`/api/price-alerts/${id}`, { method: 'DELETE' });
  loadAlerts();
  loadAlertHistory();
}

function _fmtAlertTs(ts) {
  if (!ts) return '–';
  try {
    const d = new Date(ts.replace(' ', 'T'));
    const day = d.getDate();
    const mon = d.toLocaleString('en', { month: 'short' });
    const hh  = String(d.getHours()).padStart(2, '0');
    const mm  = String(d.getMinutes()).padStart(2, '0');
    return `${day} ${mon} ${hh}:${mm}`;
  } catch(_) { return ts; }
}

// ══════════════════════════════════════════════════════
// SPOT SCREENER  (V2 — card layout)
// ══════════════════════════════════════════════════════

function _fmtMcap(v) {
  if (!v) return '–';
  if (v >= 1e9) return '$' + (v/1e9).toFixed(1) + 'B';
  if (v >= 1e6) return '$' + (v/1e6).toFixed(0) + 'M';
  return '$' + v.toFixed(0);
}

function _fmtVol(v) {
  if (!v) return '–';
  if (v >= 1e9) return '$' + (v/1e9).toFixed(2) + 'B';
  if (v >= 1e6) return '$' + (v/1e6).toFixed(1) + 'M';
  return '$' + (v/1e3).toFixed(0) + 'K';
}

// ── Helpers ────────────────────────────────────────────
function _px(p) {
  if (!p) return '–';
  if (p >= 10000) return '$' + p.toFixed(0);
  if (p >= 1)     return '$' + p.toFixed(2);
  if (p >= 0.01)  return '$' + p.toFixed(4);
  return '$' + p.toFixed(6);
}
function _chgSpan(v, suffix='%') {
  if (v == null) return '<span class="muted">–</span>';
  return v >= 0
    ? `<span class="up">+${v.toFixed(2)}${suffix}</span>`
    : `<span class="dn">${v.toFixed(2)}${suffix}</span>`;
}
function _statBox(label, value) {
  return `<div style="background:var(--surface-2);border-radius:8px;padding:8px 10px;min-width:80px;">
    <div style="font-size:9px;color:var(--text-3);font-weight:700;text-transform:uppercase;margin-bottom:3px;">${label}</div>
    <div style="font-size:12px;font-weight:600;">${value}</div>
  </div>`;
}

// ── Zone block HTML ────────────────────────────────────
function _zoneHtml(zone, price, inZone) {
  if (!zone) return `<div style="color:var(--text-3);font-size:11px;padding:8px 0;">No clear zone found on 60d chart — wait for more price action</div>`;
  const pctLo = ((price - zone.high) / price * 100).toFixed(1);
  const pctHi = ((price - zone.low)  / price * 100).toFixed(1);
  const methods = (zone.methods || []).join(' + ');
  const agree   = zone.agreement >= 2
    ? `<span style="color:var(--jade);font-size:10px;margin-left:6px;">✓ 2 methods agree</span>`
    : '';
  const inZoneBadge = inZone
    ? `<div style="margin-top:6px;padding:4px 10px;background:rgba(76,175,130,.15);border:1px solid var(--jade);border-radius:8px;color:var(--jade);font-size:10px;font-weight:700;">✅ Price is IN the zone NOW — potential entry</div>`
    : `<div style="margin-top:6px;font-size:10px;color:var(--text-3);">Currently ${pctLo}%–${pctHi}% above zone — wait for pullback or set limit</div>`;
  return `
    <div style="background:rgba(76,175,130,.07);border:1px solid rgba(76,175,130,.2);border-radius:10px;padding:10px 12px;">
      <div style="font-size:18px;font-weight:800;color:var(--jade);letter-spacing:-.5px;">${_px(zone.low)} – ${_px(zone.high)}</div>
      <div style="font-size:10px;color:var(--text-3);margin-top:2px;">[${methods}]${agree}</div>
      <div style="font-size:10px;color:var(--text-2);margin-top:5px;line-height:1.5;">${zone.explanation}</div>
      ${inZoneBadge}
    </div>`;
}

// ── Full card HTML for one coin ────────────────────────
// Spot sparkline (1D=180D window / 1W=360D window) for a coin card
function _spotSparkHtml(c) {
  const tf = STATE._spotSparkTf || '1d';
  const data = c['spark_' + tf] || c.spark_1d || [];
  if (!data || data.length < 2) return '';
  const label = tf === '1w' ? '1W · 360D' : '1D · 180D';
  return `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;margin:0 6px;">
    <svg width="170" height="36" style="display:block;">${sparklineSvg(data, 170, 36)}</svg>
    <span style="font-size:9px;color:var(--text-3);letter-spacing:.04em;">${label}</span>
  </div>`;
}

function _coinCard(c, rank) {
  const scoreColor = c.score >= 75 ? 'var(--jade)' : c.score >= 55 ? 'var(--warn)' : 'var(--text-3)';
  const t   = c.tech  || {};
  const ac  = c.accum || {};
  const fd  = c.fund  || {};

  // Accumulation signal summary
  const cvdStr   = ac.cvd_div  ? '📊 CVD divergence detected' : (ac.cvd14_M != null ? `CVD 14d: ${ac.cvd14_M > 0 ? '+' : ''}${ac.cvd14_M}M` : '–');
  const volStr   = ac.vol_ratio != null ? `Up-vol ${ac.vol_ratio}× dn-vol` : '–';
  const oiStr    = ac.oi_chg   != null ? `OI ${ac.oi_chg >= 0 ? '+' : ''}${ac.oi_chg}%` : '–';
  const fundStr  = ac.funding  != null ? `Funding ${ac.funding > 0 ? '+' : ''}${ac.funding}%` : '–';
  const spikeStr = ac.vol_spike != null ? `Vol spike ${ac.vol_spike}×` : '';

  // Tech summary pills
  const rsiCol  = t.rsi != null ? (t.rsi <= 35 ? 'var(--jade)' : t.rsi >= 70 ? 'var(--cinnabar)' : 'var(--text)') : 'var(--text)';
  const macdTxt = t.macd_cross ? '🔀 Cross ↑' : (t.macd_hist != null ? (t.macd_hist > 0 ? '▲ Positive' : '▼ Negative') : '–');
  const macdCol = t.macd_hist != null ? (t.macd_hist > 0 ? 'var(--jade)' : 'var(--cinnabar)') : 'var(--text-3)';
  const emaCol  = t.pct_ema50 != null ? (t.pct_ema50 < 0 ? 'var(--jade)' : 'var(--cinnabar)') : 'var(--text-3)';
  const emaTxt  = t.pct_ema50 != null ? `${t.pct_ema50 > 0 ? '+' : ''}${t.pct_ema50}% vs EMA50` : '–';

  // Fundamentals
  const feesStr = fd.fees_30d ? `$${(fd.fees_30d/1e6).toFixed(1)}M/30d` : '–';
  const tvlStr  = fd.tvl ? `$${fd.tvl >= 1e9 ? (fd.tvl/1e9).toFixed(1)+'B' : (fd.tvl/1e6).toFixed(0)+'M'}` : '–';
  const tvl7Str = fd.tvl_7d != null ? `${fd.tvl_7d >= 0 ? '+' : ''}${fd.tvl_7d.toFixed(1)}%` : '';
  const supStr  = fd.circ_pct != null ? `${fd.circ_pct}% circ` : '–';
  const platStr = fd.platform ? `· ${fd.platform}` : '';

  // Why now — top 4 reasons
  const whyRows = (c.reasons || []).slice(0, 5)
    .map(r => `<div style="padding:3px 0;border-bottom:1px solid var(--border-soft);font-size:11px;line-height:1.5;color:var(--text-2);">${r}</div>`)
    .join('');

  // Narrative tags
  const narTags = (c.all_nars || []).map(n =>
    `<span style="padding:2px 8px;border-radius:10px;background:rgba(76,175,130,.1);color:var(--jade);font-size:10px;font-weight:600;">${n}</span>`
  ).join(' ');

  return `
  <div class="card" style="margin-bottom:16px;border:1px solid var(--border-soft);">
    <!-- ── HEADER ── -->
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap;">
      <div style="font-size:11px;color:var(--text-3);font-weight:700;min-width:24px;">#${rank}</div>
      ${c.image ? `<img src="${c.image}" style="width:32px;height:32px;border-radius:50%;">` : ''}
      <div style="flex:1;">
        <div style="font-size:15px;font-weight:800;font-family:var(--font-mono);"><span class="copy-sym" title="Click to copy ${c.base}USDT.P for TradingView" onclick="copyTvSymbol('${c.base}')">${c.base}</span> <span style="font-size:11px;font-weight:400;color:var(--text-3);">${c.name}</span></div>
        <div style="font-size:10px;color:var(--text-3);">${c.ath_label} <span style="opacity:.6;">· ${c.ath_change}% from ATH</span></div>
      </div>
      ${_spotSparkHtml(c)}
      <div style="text-align:right;">
        <div style="font-size:26px;font-weight:900;color:${scoreColor};line-height:1;">${c.score}</div>
        <div style="font-size:11px;font-weight:700;">${c.conviction}</div>
      </div>
    </div>

    <!-- ── PRICE ROW ── -->
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">
      ${_statBox('Price', `<span style="font-weight:800;">${_px(c.price)}</span>`)}
      ${_statBox('24h', _chgSpan(c.change24h))}
      ${_statBox('7d',  _chgSpan(c.change7d))}
      ${_statBox('30d', _chgSpan(c.change30d))}
      ${_statBox('Mkt Cap', _fmtMcap(c.market_cap))}
      ${_statBox('Vol 24h', _fmtVol(c.volume24h))}
    </div>

    <!-- ── 2-COL BODY ── -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">

      <!-- LEFT: ZONE + TECHNICALS -->
      <div>
        <!-- ACCUMULATION ZONE -->
        <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--text-3);margin-bottom:6px;">🎯 Accumulation Zone</div>
        ${_zoneHtml(c.zone, c.price, c.in_zone)}

        <!-- TECHNICALS -->
        <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--text-3);margin:12px 0 6px;">📊 Technical (Daily Chart)</div>
        <div style="display:flex;flex-direction:column;gap:5px;">
          <div style="display:flex;justify-content:space-between;font-size:11px;">
            <span style="color:var(--text-3);">RSI (14)</span>
            <span style="color:${rsiCol};font-weight:700;">${t.rsi ?? '–'} ${t.rsi != null ? (t.rsi <= 35 ? '↓ Oversold' : t.rsi >= 70 ? '↑ Overbought' : 'Neutral') : ''}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:11px;">
            <span style="color:var(--text-3);">MACD</span>
            <span style="color:${macdCol};font-weight:700;">${macdTxt}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:11px;">
            <span style="color:var(--text-3);">vs EMA50</span>
            <span style="color:${emaCol};font-weight:700;">${emaTxt}</span>
          </div>
        </div>
      </div>

      <!-- RIGHT: ACCUMULATION + FUNDAMENTALS -->
      <div>
        <!-- ACCUMULATION SIGNALS -->
        <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--text-3);margin-bottom:6px;">🐋 Accumulation Signals</div>
        <div style="display:flex;flex-direction:column;gap:5px;margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;font-size:11px;">
            <span style="color:var(--text-3);">CVD (14d)</span>
            <span style="color:${ac.cvd_div ? 'var(--jade)' : 'var(--text)'};font-weight:${ac.cvd_div ? '700' : '400'};">${cvdStr}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:11px;">
            <span style="color:var(--text-3);">Vol Bias</span>
            <span style="color:${ac.vol_ratio >= 1.5 ? 'var(--jade)' : 'var(--text-2)'};">${volStr}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:11px;">
            <span style="color:var(--text-3);">OI 24h</span>
            <span style="color:${ac.oi_chg > 5 ? 'var(--jade)' : 'var(--text-2)'};">${oiStr}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:11px;">
            <span style="color:var(--text-3);">Funding</span>
            <span style="color:${ac.funding < -0.01 ? 'var(--jade)' : ac.funding > 0.05 ? 'var(--cinnabar)' : 'var(--text-2)'};">${fundStr}</span>
          </div>
          ${spikeStr ? `<div style="display:flex;justify-content:space-between;font-size:11px;"><span style="color:var(--text-3);">Vol Spike</span><span style="color:var(--jade);">${spikeStr}</span></div>` : ''}
        </div>

        <!-- FUNDAMENTALS -->
        <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--text-3);margin-bottom:6px;">🏛️ Fundamentals</div>
        <div style="display:flex;flex-direction:column;gap:5px;">
          <div style="display:flex;justify-content:space-between;font-size:11px;">
            <span style="color:var(--text-3);">Protocol Fees/30d</span>
            <span style="color:${fd.fees_30d > 1e6 ? 'var(--jade)' : 'var(--text-2)'};">${feesStr}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:11px;">
            <span style="color:var(--text-3);">TVL</span>
            <span>${tvlStr} ${tvl7Str ? `<span style="color:${fd.tvl_7d >= 0 ? 'var(--jade)' : 'var(--cinnabar)'};">${tvl7Str}</span>` : ''}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:11px;">
            <span style="color:var(--text-3);">Supply</span>
            <span style="color:${fd.circ_pct >= 70 ? 'var(--jade)' : fd.circ_pct < 30 ? 'var(--cinnabar)' : 'var(--text-2)'};">${supStr} ${platStr}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ── TOKEN UTILITY ── -->
    ${(() => {
      const u = fd.utility;
      if (!u) return '';
      const proofHtml = (u.proof || []).map(p => `<div style="font-size:11px;line-height:1.5;color:var(--text-2);">${p}</div>`).join('');
      const descHtml  = u.description ? `<div style="font-size:11px;color:var(--text-3);line-height:1.6;margin-top:6px;font-style:italic;">"${u.description}"</div>` : '';
      const usageBadge = u.has_real_usage
        ? `<span style="padding:2px 8px;border-radius:8px;background:rgba(76,175,130,.15);color:var(--jade);font-size:10px;font-weight:700;">✅ Real Usage Confirmed</span>`
        : `<span style="padding:2px 8px;border-radius:8px;background:rgba(224,82,82,.1);color:var(--cinnabar);font-size:10px;font-weight:700;">⚠️ No On-chain Revenue Yet</span>`;
      return `<div style="margin-top:14px;padding:12px 14px;background:var(--surface-2);border-radius:12px;border-left:3px solid var(--jade);">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
          <div style="font-size:13px;font-weight:800;">${u.label || '—'}</div>
          ${usageBadge}
        </div>
        <div style="font-size:11px;color:var(--text-2);line-height:1.6;margin-bottom:6px;">${u.explanation || ''}</div>
        ${proofHtml}
        ${descHtml}
      </div>`;
    })()}

    <!-- ── WHY NOW ── -->
    <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border-soft);">
      <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--text-3);margin-bottom:6px;">🔥 Why This Coin Now</div>
      ${whyRows}
    </div>

    <!-- ── NARRATIVE TAGS ── -->
    ${narTags ? `<div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:5px;">${narTags}</div>` : ''}
  </div>`;
}

// ── Single coin checker ────────────────────────────────
async function checkSingleCoin(inputEl) {
  const sym = (inputEl.value || '').trim().toUpperCase().replace('USDT','');
  if (!sym) return;
  const el = document.getElementById('coinCheckerResult');
  el.style.display = '';
  el.innerHTML = `<div style="color:var(--text-3);font-size:12px;padding:8px 0;">⏳ Analyzing ${sym} — fetching OHLCV, fundamentals, narratives…</div>`;

  const d = await api(`/api/spot-screener/check?symbol=${sym}`);
  if (d.status !== 'ok') {
    el.innerHTML = `<div style="color:var(--cinnabar);font-size:12px;padding:8px 0;">❌ ${d.message}</div>`;
    return;
  }
  el.innerHTML = _coinCard(d, '—');
}

// ── Full screener ──────────────────────────────────────
async function runSpotScreener(btn) {
  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span style="display:inline-block;animation:spin 1s linear infinite;">↻</span> Scanning…';
  const meta = document.getElementById('spotScreenerMeta');
  if (meta) meta.textContent = 'Fetching OHLCV + fundamentals… (~20s first run)';

  try {
    const d = await api('/api/spot-screener');
    if (d.status !== 'ok') {
      showToast(d.message || 'Screener error', 'error');
      return;
    }
    const coins = d.data || [];
    STATE._spotCoins = coins;   // cache for sparkline TF re-render
    if (meta) meta.textContent = `Scanned ${d.total_scanned} pairs · ${d.filtered} with mcap → ${coins.length} picks · ${d.elapsed}s`;

    // Fear & Greed bar
    const fg = d.fear_greed || {};
    const fgBar = document.getElementById('spotFGBar');
    if (fgBar && fg.value != null) {
      const fgCol = fg.value >= 60 ? 'var(--jade)' : fg.value <= 30 ? 'var(--cinnabar)' : 'var(--warn)';
      fgBar.style.display = '';
      fgBar.innerHTML = `<div class="card" style="padding:10px 16px;display:flex;align-items:center;gap:12px;">
        <span style="font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;">Fear & Greed</span>
        <div style="flex:1;height:6px;background:var(--surface-2);border-radius:3px;overflow:hidden;">
          <div style="width:${fg.value}%;height:100%;background:${fgCol};border-radius:3px;"></div>
        </div>
        <span style="font-size:12px;font-weight:800;color:${fgCol};">${fg.value} — ${fg.label}</span>
        <span style="font-size:10px;color:var(--text-3);">Macro context</span>
      </div>`;
    }

    const el = document.getElementById('spotScreenerResults');
    if (!el) return;

    if (!coins.length) {
      el.innerHTML = `<div class="card" style="text-align:center;padding:40px;color:var(--text-3);">
        <div style="font-size:24px;margin-bottom:8px;">🤔</div>
        <div>No coins above score threshold right now.</div>
        <div class="tiny muted" style="margin-top:4px;">Market may be overheated or external data unavailable. Try again in 15 min.</div>
      </div>`;
      return;
    }

    el.innerHTML =
      coins.map((c, i) => _coinCard(c, i + 1)).join('') +
      `<div class="tiny muted" style="padding:8px 4px;font-size:10px;">⚠️ Signals only — not financial advice. Always do your own research. CVD is approximated from daily OHLCV (not real tick data).</div>`;

  } catch(e) {
    showToast('Screener error: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = orig;
  }
}

// Spot sparkline timeframe toggle (1D=180D / 1W=360D). Backend spark data pending (#8) — re-renders cached cards.
function setSpotSparkTf(tf, btn) {
  STATE._spotSparkTf = tf;
  if (btn) { btn.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('active')); btn.classList.add('active'); }
  const el = document.getElementById('spotScreenerResults');
  if (el && STATE._spotCoins && STATE._spotCoins.length) {
    el.innerHTML = STATE._spotCoins.map((c, i) => _coinCard(c, i + 1)).join('') +
      `<div class="tiny muted" style="padding:8px 4px;font-size:10px;">⚠️ Signals only — not financial advice. Always do your own research.</div>`;
  }
}

async function loadAlertHistory() {
  const body = document.getElementById('alertHistoryBody');
  if (!body) return;
  const rows = await api('/api/price-alerts/history');
  const list = Array.isArray(rows) ? rows : (rows?.data || []);
  if (!list.length) {
    body.innerHTML = `<tr><td colspan="6" class="muted tiny" style="padding:16px;text-align:center;">No triggered alerts yet</td></tr>`;
    return;
  }
  body.innerHTML = list.map(a => `<tr>
    <td class="sym">${a.symbol}USDT</td>
    <td class="num">$${_fmtAlertPrice(a.target_price)}</td>
    <td><span class="tag ${a.direction === 'above' ? 'long' : 'short'}">${a.direction === 'above' ? '▲ Above' : '▼ Below'}</span></td>
    <td class="tiny muted">${a.note || '–'}</td>
    <td class="tiny muted">${_fmtAlertTs(a.created_at)}</td>
    <td class="tiny muted" style="color:var(--jade);">${_fmtAlertTs(a.triggered_at)}</td>
  </tr>`).join('');
}

function toggleAlertHistory() {
  const wrap = document.getElementById('alertHistoryWrap');
  const btn  = document.getElementById('alertHistoryToggle');
  if (!wrap || !btn) return;
  const hidden = wrap.style.display === 'none';
  wrap.style.display = hidden ? '' : 'none';
  btn.textContent    = hidden ? 'Hide' : 'Show';
}

// ════════════════════════════════════════════════════════════
//  PRICE ALERT ENGINE — server-side check every 30s + sound
// ════════════════════════════════════════════════════════════
// ── Alert polling — notification-watch approach ───────────────────────────
// Background thread is sole price checker. Browser watches notifications table
// for new price_alert rows using a Set of already-seen IDs (in-memory + localStorage).

let _alertPollingTimer  = null;
let _seenNotifIds       = new Set(
  JSON.parse(localStorage.getItem('v4-seen-notif-ids') || '[]')
);
// Cooldown map: message → timestamp last fired. Prevents duplicate rows from double-firing.
const _alertCooldown    = new Map();

function _persistSeenIds() {
  // Keep only last 200 IDs to avoid localStorage bloat
  const arr = [..._seenNotifIds].slice(-200);
  localStorage.setItem('v4-seen-notif-ids', JSON.stringify(arr));
}

// Call once on startup to mark all existing notifications as already seen
// so we don't fire sound for old alerts on page load
async function _initAlertBaseline() {
  try {
    const d = await api('/api/notifications?max_age_hours=24&limit=50');
    const items = d?.data || [];
    items.forEach(n => _seenNotifIds.add(n.id));
    _persistSeenIds();
    console.debug(`[AlertPoll] Baseline set — ${_seenNotifIds.size} existing notif IDs marked seen`);
  } catch(e) { console.warn('[AlertPoll] Baseline init failed:', e); }
}

function startAlertPolling() {
  if (_alertPollingTimer) return;
  _alertPollingTimer = -1; // placeholder — prevents double-start during async baseline
  // First: mark existing notifications as seen (no sound for old ones on page load)
  _initAlertBaseline().then(() => {
    _alertPollingTimer = setInterval(_checkPriceAlerts, 15_000);
    console.debug('[AlertPoll] Started — polling every 15s for new price_alert notifications');
  });
}

async function _checkPriceAlerts() {
  try {
    const d = await api('/api/notifications?max_age_hours=3&limit=50');
    const allItems = d?.data || [];

    // Filter: price_alert type AND not yet seen
    const newItems = allItems.filter(n =>
      n.type === 'price_alert' && !_seenNotifIds.has(n.id)
    );

    if (!newItems.length) return;

    // Mark all as seen immediately to prevent double-fire on next poll
    newItems.forEach(n => _seenNotifIds.add(n.id));
    _persistSeenIds();

    // Deduplicate by message + 60s cooldown (kills duplicate DB rows for same alert)
    const now = Date.now();
    const uniqueItems = newItems.filter(n => {
      const msg = (n.message || '').trim();
      const last = _alertCooldown.get(msg) || 0;
      if (now - last < 60_000) return false; // same message within 60s → skip
      _alertCooldown.set(msg, now);
      return true;
    });

    if (!uniqueItems.length) return;
    console.debug(`[AlertPoll] ${uniqueItems.length} unique alert(s) firing:`, uniqueItems.map(n => n.message));

    // Sort ascending — fire in chronological order
    uniqueItems.sort((a, b) => (a.id - b.id));

    uniqueItems.forEach((notif, i) => {
      const SLOT = i * 2200;
      setTimeout(() => {
        const msg   = notif.message || 'Price alert triggered';
        const title = '🔔 Price Alert';
        _playAlertSound();                                               // 🌊 ocean bell
        setTimeout(_playAnimeChime, 1200);                               // ✨ anime sparkle
        setTimeout(() => _queueSpeak(msg.replace(/[🔔↑↓$—]/g, '')), 1900); // 🗣 voice after chime
        _sendBrowserNotif(title, msg);
        showToast(msg, 'ok');
        loadNotifications();
        setTimeout(loadAlerts,       500);
        setTimeout(loadAlertHistory, 600);
      }, SLOT);
    });
  } catch(e) { console.warn('[AlertPoll] Check failed:', e); }
}

function _playAlertSound() {
  try {
    const ctx   = new (window.AudioContext || window.webkitAudioContext)();
    const tones = [880, 1100, 880];
    tones.forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.22;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.85, t + 0.03);
      gain.gain.linearRampToValueAtTime(0, t + 0.20);
      osc.start(t); osc.stop(t + 0.25);
    });
  } catch(e) { console.warn('[Alert sound]', e); }
}

function _playAnimeChime() {
  // ── Anime Sparkle ──────────────────────────────────────────
  // Rising magical chime — plays before TTS voice
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.5, ctx.currentTime);
    master.connect(ctx.destination);

    // Three rising sparkle notes
    [
      { start: 0.00, f0: 900,  f1: 1400, dur: 0.25 },
      { start: 0.18, f0: 1100, f1: 1700, dur: 0.25 },
      { start: 0.36, f0: 1400, f1: 2100, dur: 0.30 },
    ].forEach(p => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.connect(gain); gain.connect(master);
      const t = ctx.currentTime + p.start;
      osc.frequency.setValueAtTime(p.f0, t);
      osc.frequency.linearRampToValueAtTime(p.f1, t + p.dur);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.45, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + p.dur);
      osc.start(t); osc.stop(t + p.dur + 0.05);
    });
  } catch(e) {}
}

// ── TTS alert speech (Web Speech API) ─────────────────────────────────
const _speechQueue = [];
let   _speechBusy  = false;

function _fmtAlertPrice(price) {
  // Use exact stored value — just strip trailing zeros after decimal
  const s = String(price).trim();
  if (s.includes('.')) return s.replace(/\.?0+$/, '');
  return s;
}

function _buildAlertSpeech(alert) {
  const sym   = (alert.symbol || 'Unknown').toUpperCase();
  const dir   = alert.direction === 'above' ? 'above' : 'below';
  const price = _fmtAlertPrice(alert.target_price);
  let text    = `${sym} hit ${dir} ${price}`;
  if (alert.note && alert.note.trim()) text += `, ${alert.note.trim()}`;
  return text;
}

function _queueSpeak(text) {
  if (!('speechSynthesis' in window)) return;
  // First pass: slow and clear. Second pass: normal speed.
  _speechQueue.push({ text, rate: 0.75 });
  _speechQueue.push({ text, rate: 1.0  });
  if (!_speechBusy) _processNextSpeech();
}

// Pick the best available English female voice
function _pickAnimeVoice() {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  // English female voices only — Japanese voices can't read English properly
  const priority = ['Samantha', 'Karen', 'Tessa', 'Moira', 'Fiona', 'Victoria',
                    'Google US English', 'Google UK English Female', 'Veena'];
  for (const name of priority) {
    const v = voices.find(v => v.name.includes(name) && /en[-_]/i.test(v.lang));
    if (v) return v;
  }
  // Fallback: any English female-tagged voice
  const female = voices.find(v => /en[-_]/i.test(v.lang) && /female|woman/i.test(v.name));
  if (female) return female;
  // Last resort: any English voice
  return voices.find(v => /en[-_]/i.test(v.lang)) || voices[0];
}

function _processNextSpeech() {
  if (!_speechQueue.length) { _speechBusy = false; return; }
  _speechBusy = true;
  const { text, rate } = _speechQueue.shift();
  const utter  = new SpeechSynthesisUtterance(text);
  const voice  = _pickAnimeVoice();
  if (voice) utter.voice = voice;
  utter.volume = 1.0;
  utter.rate   = rate ?? 0.75;
  utter.pitch  = 1.15;  // subtle lift — natural feminine tone
  utter.onend  = () => setTimeout(_processNextSpeech, 500);
  utter.onerror = () => setTimeout(_processNextSpeech, 500);
  window.speechSynthesis.speak(utter);
}

function _sendBrowserNotif(title, body) {
  if (!('Notification' in window)) return;
  const send = () => new Notification(title, {
    body,
    icon: 'static/img/icon-192.png',
    tag: 'price-alert',
  });
  if (Notification.permission === 'granted') {
    send();
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(p => { if (p === 'granted') send(); });
  }
}

// ── Size Calculator  (V2-style: SL% + Max Loss → Position Value)
function calcSize() {
  const slPct   = parseFloat(document.getElementById('calcSlPct')?.value)   || 0;
  const maxLoss = parseFloat(document.getElementById('calcMaxLoss')?.value) || 0;

  const sizeEl = document.getElementById('calcOutSize');
  const lossEl = document.getElementById('calcOutLoss');

  if (!slPct || !maxLoss) {
    if (sizeEl) sizeEl.textContent = '–';
    if (lossEl) lossEl.textContent = '–';
    return;
  }

  const positionValue = maxLoss / (slPct / 100);   // e.g. 40 / 0.01172 = 3412.97
  const actualRisk    = positionValue * (slPct / 100); // = maxLoss

  if (sizeEl) sizeEl.textContent = '$' + positionValue.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (lossEl) lossEl.textContent = '-$' + actualRisk.toFixed(5);
}

function useValueInOrder() {
  const sizeEl = document.getElementById('calcOutSize');
  const valInp = document.getElementById('orderValue');
  if (!sizeEl || !valInp) return;
  const raw = sizeEl.textContent.replace(/[$,]/g, '');
  const num = parseFloat(raw);
  if (isNaN(num)) { showToast('Calculate position size first', 'error'); return; }
  valInp.value = num.toFixed(2);
  // Switch to Positions tab and highlight the field briefly
  if (STATE.activeSection !== 'positions') switchSection('positions');
  setTimeout(() => { valInp.focus(); valInp.select(); }, 300);
  showToast('Value filled in order ✓');
}

// ── Symbol list (shared between Place Order + Alert)
let _symbols = [];
async function loadSymbols() {
  if (_symbols.length) return; // already loaded
  const d = await api('/api/bybit/instruments');
  _symbols = (d?.data || []).map(s => s.symbol || s).filter(Boolean);
}

// ── Custom autocomplete helpers
function filterSymDrop(input, dropId) {
  const drop = document.getElementById(dropId);
  if (!drop) return;
  const val = input.value.trim().toUpperCase();
  if (!val || !_symbols.length) { drop.classList.remove('open'); return; }
  const matches = _symbols.filter(s => s.startsWith(val)).slice(0, 12);
  if (!matches.length) { drop.classList.remove('open'); return; }
  drop.innerHTML = matches.map(s => {
    const hi = `<em>${s.slice(0, val.length)}</em>${s.slice(val.length)}`;
    return `<div class="sym-opt" onmousedown="pickSym(event,'${s}','${input.id}','${dropId}')">${hi}</div>`;
  }).join('');
  drop.classList.add('open');
}

function pickSym(e, sym, inputId, dropId) {
  e.preventDefault();
  const inp = document.getElementById(inputId);
  if (inp) inp.value = sym;
  closeSymDrop(dropId);
  // Fetch leverage info when a symbol is picked in the order form
  if (inputId === 'orderSymbol') onSymbolChangeUpdateLeverage(sym);
}

function closeSymDrop(dropId) {
  document.getElementById(dropId)?.classList.remove('open');
}

function toggleLimitPrice() {
  const t = document.getElementById('orderType').value;
  document.getElementById('limitPriceField').style.display = t === 'Limit' ? '' : 'none';
}

// ── Fetch max leverage for the selected symbol and update slider ──
let _leverageDebounce = null;
function onSymbolChangeUpdateLeverage(sym) {
  clearTimeout(_leverageDebounce);
  if (!sym || sym.length < 4) return;
  _leverageDebounce = setTimeout(async () => {
    _refreshOrderTicker(sym);   // V4.1: refresh SL/TP Mark/Last chips
    const d = await api(`/api/bybit/leverage-info?symbol=${sym}`);
    const slider  = document.getElementById('orderLeverage');
    const display = document.getElementById('leverageDisplay');
    const minEl   = document.getElementById('leverageMin');
    const maxEl   = document.getElementById('leverageMax');
    if (d?.status === 'ok' && slider) {
      const maxLev = d.max_leverage || 100;
      const minLev = d.min_leverage || 1;
      slider.max = maxLev;
      slider.min = minLev;
      // Clamp current value to new range
      const cur = parseInt(slider.value);
      const clamped = Math.min(maxLev, Math.max(minLev, cur));
      slider.value = clamped;
      if (display) display.textContent = clamped + '×';
      if (minEl) minEl.textContent = minLev + '×';
      if (maxEl) maxEl.textContent = maxLev + '×';
    }
  }, 600);
}

// ── SL/TP live price chips (V4.1) ──
let _ordPx = { sym:'', mark:0, last:0 };
async function _refreshOrderTicker(sym) {
  sym = (sym || '').toUpperCase();
  if (!sym || sym.length < 4) return;
  const d = await api(`/api/bybit/ticker?symbols=${sym}`);
  const t = d?.data?.[sym];
  if (!t) return;
  _ordPx = { sym, mark: t.mark, last: t.last };
  const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v ? v : '–'; };
  setTxt('ordMarkSl', t.mark); setTxt('ordLastSl', t.last);
  setTxt('ordMarkTp', t.mark); setTxt('ordLastTp', t.last);
}
async function fillOrderPx(fieldId, which, btn) {
  const symInput = document.getElementById('orderSymbol');
  const sym = (symInput.value || '').trim().toUpperCase();
  const msg = document.getElementById('orderMsg');
  const say = (txt, color) => { if (msg) { msg.style.color = color; msg.textContent = txt; } };

  if (!sym || sym.length < 4) { say('Enter a symbol first.', 'var(--cinnabar)'); symInput.focus(); return; }

  // fetch on demand if we don't have a fresh price for this symbol
  if (btn) { btn.classList.add('loading'); btn.disabled = true; }
  if (_ordPx.sym !== sym || !_ordPx[which]) await _refreshOrderTicker(sym);
  if (btn) { btn.classList.remove('loading'); btn.disabled = false; }

  const v = _ordPx[which];
  if (!v) { say(`No ${which} price for ${sym} right now.`, 'var(--cinnabar)'); return; }

  // fill + visual confirmation
  const field = document.getElementById(fieldId);
  field.value = v;
  const group = btn ? btn.closest('.px-chips') : null;
  if (group) group.querySelectorAll('.px-chip').forEach(c => c.classList.remove('active'));
  if (btn) btn.classList.add('active');
  field.classList.add('px-filled');
  setTimeout(() => field.classList.remove('px-filled'), 750);
  say(`${which === 'mark' ? 'Mark' : 'Last'} ${v} → ${fieldId === 'orderSl' ? 'Stop Loss' : 'Take Profit'}`, 'var(--jade)');
}

// ── Place Order
async function placeOrder() {
  const symbol    = document.getElementById('orderSymbol').value.trim().toUpperCase();
  const side      = document.getElementById('orderSide').value;
  const orderType = document.getElementById('orderType').value;
  const value     = parseFloat(document.getElementById('orderValue').value) || 0;
  const price     = parseFloat(document.getElementById('orderPrice').value) || 0;
  const sl        = parseFloat(document.getElementById('orderSl').value) || 0;
  const tp        = parseFloat(document.getElementById('orderTp').value) || 0;
  const leverage  = parseInt(document.getElementById('orderLeverage')?.value) || 10;
  const msg       = document.getElementById('orderMsg');

  if (!symbol) { msg.textContent = '✗ Symbol required.'; msg.style.color = 'var(--loss)'; return; }
  if (!value)  { msg.textContent = '✗ Value (USDT) required.'; msg.style.color = 'var(--loss)'; return; }
  if (_symbols.length && !_symbols.includes(symbol)) {
    msg.textContent = `✗ "${symbol}" not found on Bybit linear. Check symbol name.`;
    msg.style.color = 'var(--loss)'; return;
  }
  if (orderType === 'Limit' && !price) {
    msg.textContent = '✗ Limit Price required for Limit orders.';
    msg.style.color = 'var(--loss)'; return;
  }

  msg.textContent = 'Placing order…'; msg.style.color = 'var(--text-3)';

  const d = await api('/api/bybit/place-order', {
    method: 'POST',
    body: JSON.stringify({ symbol, side, order_type: orderType, margin_usdt: value, price, sl, tp, leverage })
  });

  if (d.status === 'ok') {
    msg.textContent = `✓ Order placed — ID: ${d.orderId || ''}`;
    msg.style.color = 'var(--profit)';
    setTimeout(() => loadPositions(), 1000);
    setTimeout(() => loadOrders(), 1500);
  } else {
    msg.textContent = `✗ ${d.message || 'Error'}`;
    msg.style.color = 'var(--loss)';
  }
}

// ── Alert Modal
function openAlertModal(sym = '', price = '') {
  document.getElementById('alertSymbol').value = sym;
  document.getElementById('alertPrice').value = price;
  document.getElementById('alertNote').value = '';
  const m = document.getElementById('alertModal');
  m.style.display = 'grid';
}
function closeAlertModal() { document.getElementById('alertModal').style.display = 'none'; }
async function saveAlert() {
  const msgEl = document.getElementById('alertMsg');
  const sym   = document.getElementById('alertSymbol').value.trim().toUpperCase();
  const price = parseFloat(document.getElementById('alertPrice').value);
  const dir   = document.getElementById('alertDir').value;
  const note  = document.getElementById('alertNote').value;

  if (!sym)        { if (msgEl) { msgEl.textContent = 'Enter a symbol.'; msgEl.style.color='var(--loss)'; } return; }
  if (!price || isNaN(price)) { if (msgEl) { msgEl.textContent = 'Enter a valid price.'; msgEl.style.color='var(--loss)'; } return; }

  if (msgEl) { msgEl.textContent = 'Saving…'; msgEl.style.color='var(--text-3)'; }

  const d = await api('/api/price-alerts', {
    method: 'POST',
    body: JSON.stringify({ symbol: sym, target_price: price, direction: dir, note })
  });

  // Success: backend returns the row object with an `id` field (HTTP 201)
  if (d?.id) {
    closeAlertModal();
    loadAlerts(); loadAlertHistory();
    showToast(`Alert set: ${sym} ${dir} $${price}`);
  } else {
    // Error: backend returns {error: "..."} (HTTP 400)
    const errMsg = d?.error || d?.message || 'Failed to save alert';
    if (msgEl) { msgEl.textContent = errMsg; msgEl.style.color='var(--loss)'; }
    else alert(errMsg);
  }
}

// Screener Alert Modal
function openScreenerAlert(sym, price) {
  document.getElementById('saSymbol').value = sym;
  document.getElementById('saCurrentPrice').value = price;
  document.getElementById('saAlertPrice').value = price;
  document.getElementById('saNote').value = '';
  const m = document.getElementById('screenerAlertModal');
  m.style.display = 'grid';
}
function closeScreenerAlertModal() { document.getElementById('screenerAlertModal').style.display = 'none'; }
async function saveScreenerAlert() {
  const d = await api('/api/price-alerts', {
    method: 'POST',
    body: JSON.stringify({
      symbol:       document.getElementById('saSymbol').value,
      target_price: parseFloat(document.getElementById('saAlertPrice').value),
      direction:    document.getElementById('saDir').value,
      note:         document.getElementById('saNote').value,
    })
  });
  if (d.status === 'ok' || d.id) { closeScreenerAlertModal(); alert('Alert created!'); }
  else alert(d.message || 'Error');
}

// ════════════════════════════════════════════════════════════
//  JOURNAL SECTION
// ════════════════════════════════════════════════════════════
function setDefaultDates() {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30*86400*1000).toISOString().slice(0, 10);
  ['journalFrom','recapFrom'].forEach(id => { const el = document.getElementById(id); if (el) el.value = monthAgo; });
  ['journalTo','recapTo'].forEach(id => { const el = document.getElementById(id); if (el) el.value = today; });
}

async function populateJournalMonthFilter() {
  const sel = document.getElementById('journalMonthFilter');
  if (!sel) return;
  const d = await api('/api/bybit/monthly-list');
  const months = d?.months || [];
  const curMonth = new Date().toISOString().slice(0, 7);
  // Always rebuild so new months (e.g. June) appear on refresh
  while (sel.options.length > 1) sel.remove(1); // keep "All" option at index 0
  months.slice(0, 24).forEach(m => {
    const key = m.month || '';
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = fmtMonthLabel(key);
    if (key === curMonth) opt.selected = true;
    sel.appendChild(opt);
  });
  // Auto-apply current month filter right after populating
  applyJournalMonthFilter();
}

function applyJournalMonthFilter() {
  const sel    = document.getElementById('journalMonthFilter');
  const month  = sel?.value;
  const fromEl = document.getElementById('journalFrom');
  const toEl   = document.getElementById('journalTo');

  if (!month) {
    // "All" — reset to last 90 days so table isn't empty
    const today    = new Date().toISOString().slice(0, 10);
    const ninetyAgo = new Date(Date.now() - 90*86400*1000).toISOString().slice(0, 10);
    if (fromEl) fromEl.value = ninetyAgo;
    if (toEl)   toEl.value   = today;
  } else {
    // Specific month — set exact range
    const [y, mo] = month.split('-').map(Number);
    const from    = `${y}-${String(mo).padStart(2,'0')}-01`;
    const lastDay = new Date(y, mo, 0).getDate();
    const to      = `${y}-${String(mo).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;
    if (fromEl) fromEl.value = from;
    if (toEl)   toEl.value   = to;
  }
  loadJournal();
}

async function loadJournal() {
  const from = document.getElementById('journalFrom').value;
  const to   = document.getElementById('journalTo').value;
  const d    = await api(`/api/journal?date_from=${from}&date_to=${to}`);
  const body = document.getElementById('journalBody');
  if (!body) return;
  const rows = d?.data || d?.trades || d?.entries || [];
  // Store for chart preview navigation
  _journalRows = rows;
  if (!rows.length) { body.innerHTML = `<tr><td colspan="11" class="muted tiny" style="padding:20px;text-align:center;">No journal entries in this range.</td></tr>`; return; }
  body.innerHTML = rows.map((t, i) => {
    const entryTime = (t.opened_at || '').slice(11,19) || '–';
    const exitTime  = (t.closed_at  || '').slice(11,19) || '–';
    return `<tr>
    <td class="tiny mono">${(t.closed_at||t.opened_at||'').slice(0,10)}</td>
    <td class="tiny mono" style="color:var(--text-2);">${entryTime}</td>
    <td class="tiny mono" style="color:var(--text-2);">${exitTime}</td>
    <td class="sym">${t.symbol||'–'}</td>
    <td>${sideTag(t.side)}</td>
    <td class="num">${parseFloat(t.entry_price||0).toFixed(4)}</td>
    <td class="num">${parseFloat(t.exit_price||0).toFixed(4)}</td>
    <td class="num ${pnlClass(t.pnl)} balance-val">${fmt$(t.pnl)}</td>
    <td class="tiny muted" title="${(t.reason_entry||'').replace(/"/g,'&quot;')}">${truncate(t.reason_entry||'',30)}</td>
    <td class="tiny muted" title="${(t.reason_exit||'').replace(/"/g,'&quot;')}">${truncate(t.reason_exit||'',30)}</td>
    <td>${t.chart_link
      ? `<button class="chart-link-btn" onclick="openChartPreview(${i})" title="Click to preview chart">📈 View</button>`
      : '–'}</td>
    <td>${resultTag(t.result || autoResult(t.pnl))}</td>
    <td><button class="btn sm ghost" onclick="openJournalEdit(${JSON.stringify(t).replace(/"/g,'&quot;')})">Edit</button></td>
  </tr>`;
  }).join('');
}

function switchJournalTab(tab, btn) {
  document.querySelectorAll('#sec-journal .tabstrip button').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById('journalTabTrades').style.display = tab === 'trades' ? '' : 'none';
  document.getElementById('journalTabRecap').style.display  = tab === 'recap'  ? '' : 'none';
  if (tab === 'recap') {
    const out = document.getElementById('recapOutput');
    if (out && out.textContent.trim() === 'Select a date range and click Generate Recap.') {
      loadLastRecap();
    }
  }
}

// ── Journal Chart Preview
let _journalRows = [];
let _previewIdx  = 0;

async function openChartPreview(idx) {
  const rows = _journalRows.filter(r => r.chart_link);
  // Map idx from all rows to rows-with-charts
  const chartRows = _journalRows.map((r, i) => ({...r, _origIdx: i})).filter(r => r.chart_link);
  const found = chartRows.findIndex(r => r._origIdx === idx);
  _previewIdx = found >= 0 ? found : 0;
  await _showPreviewAt(_previewIdx, chartRows);
}

let _previewSlot = 1; // which chart slot is active (1 or 2)

async function _showPreviewAt(idx, chartRows) {
  const rows = chartRows || _journalRows.map((r, i) => ({...r, _origIdx: i})).filter(r => r.chart_link);
  if (!rows.length) return;
  _previewIdx  = Math.max(0, Math.min(idx, rows.length - 1));
  _previewSlot = 1; // always start on chart 1 when switching trades
  const t = rows[_previewIdx];

  const overlay  = document.getElementById('chartPreviewOverlay');
  const img      = document.getElementById('chartPreviewImg');
  const label    = document.getElementById('chartPreviewLabel');
  const sub      = document.getElementById('chartPreviewSub');
  const idxEl    = document.getElementById('chartPreviewIdx');
  const linkEl   = document.getElementById('chartPreviewLink');
  const reasonEl = document.getElementById('chartPreviewReason');
  const notesEl  = document.getElementById('chartPreviewNotes');
  const slotBar  = document.getElementById('chartSlotBar');
  const btn1     = document.getElementById('chartSlotBtn1');
  const btn2     = document.getElementById('chartSlotBtn2');

  overlay.classList.add('open');
  label.textContent = `${t.symbol || '–'} · ${sideTag(t.side).replace(/<[^>]+>/g,'')} · ${fmt$(t.pnl)}`;
  sub.textContent   = (t.closed_at || '').slice(0,10);
  idxEl.textContent = `${_previewIdx + 1} / ${rows.length}`;

  // Populate left stats panel
  const side = (t.side || '').toLowerCase();
  const pnl  = parseFloat(t.pnl || 0);
  const pct  = parseFloat(t.pnl_pct || 0);
  const res  = (t.result || '').toUpperCase();
  const _s   = id => document.getElementById(id);
  const badge = _s('cpSideBadge');
  if (badge) { badge.textContent = side === 'long' ? 'LONG' : 'SHORT'; badge.className = 'cp-stat-badge ' + (side === 'long' ? 'long' : 'short'); }
  const _set = (id, val) => { const el = _s(id); if (el) el.textContent = val; };
  _set('cpEntry',  t.entry_price  ? `$${parseFloat(t.entry_price).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:4})}` : '–');
  _set('cpExit',   t.exit_price   ? `$${parseFloat(t.exit_price).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:4})}` : '–');
  _set('cpSize',   t.size         ? `${parseFloat(t.size)}` : '–');
  _set('cpLev',    t.leverage     ? `${t.leverage}×` : '–');
  _set('cpDate',   (t.closed_at || '').slice(0,10));
  const pnlEl = _s('cpPnl');
  if (pnlEl) { pnlEl.textContent = fmt$(pnl); pnlEl.className = 'cp-stat-val cp-pnl ' + (pnl >= 0 ? 'pos' : 'neg'); }
  const pctEl = _s('cpPnlPct');
  if (pctEl) { pctEl.textContent = (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%'; pctEl.className = 'cp-stat-val cp-pnl ' + (pct >= 0 ? 'pos' : 'neg'); }
  const resEl = _s('cpResult');
  if (resEl) { resEl.textContent = res === 'P' ? 'PROFIT' : res === 'L' ? 'LOSS' : res === 'BE' ? 'BREAK EVEN' : res || '–'; resEl.className = 'cp-stat-val ' + (res==='P'?'result-p':res==='L'?'result-l':res==='BE'?'result-be':''); }

  // Show / hide slot switcher
  const hasChart2 = !!(t.chart_link2 || '').trim();
  if (slotBar)  slotBar.style.display  = hasChart2 ? 'flex' : 'none';
  if (btn1) { btn1.className = 'btn sm'; }
  if (btn2) { btn2.className = 'btn sm ghost'; }

  if (reasonEl) {
    const r = (t.reason_entry || '').trim();
    // Use textContent for <p> so raw newlines are preserved by pre-wrap
    if (r) {
      reasonEl.innerHTML = '<span class="lbl">Entry Reason</span><p></p>';
      reasonEl.querySelector('p').textContent = r;
      reasonEl.style.display = 'flex';
    } else { reasonEl.innerHTML = ''; reasonEl.style.display = 'none'; }
  }
  if (notesEl) {
    const n = (t.reason_exit || '').trim();
    if (n) {
      notesEl.innerHTML = '<span class="lbl">Trade Notes</span><p></p>';
      notesEl.querySelector('p').textContent = n;
      notesEl.style.display = 'flex';
    } else { notesEl.innerHTML = ''; notesEl.style.display = 'none'; }
  }

  // Store rows reference for nav + slot switching
  overlay._chartRows   = rows;
  overlay._currentTrade = t;

  await _loadChartSlot(t, 1);
}

async function _loadChartSlot(t, slot) {
  const img    = document.getElementById('chartPreviewImg');
  const linkEl = document.getElementById('chartPreviewLink');
  const url    = slot === 2 ? (t.chart_link2 || '') : (t.chart_link || '');

  img.src = '';
  img.alt = 'Loading chart…';
  linkEl.href = url || '#';

  if (!url) {
    img.alt = 'No chart link for this slot';
    return;
  }
  try {
    const d = await api(`/api/util/og-image?url=${encodeURIComponent(url)}`);
    if (d?.image) {
      img.src = d.image;
      img.alt = `${t.symbol} chart ${slot}`;
    } else {
      img.alt = 'No image preview — click "Open in TradingView" below';
      img.src = '';
    }
  } catch(e) {
    img.alt = 'Preview failed';
  }
}

async function switchChartSlot(slot) {
  const overlay = document.getElementById('chartPreviewOverlay');
  const t = overlay._currentTrade;
  if (!t) return;
  _previewSlot = slot;
  const btn1 = document.getElementById('chartSlotBtn1');
  const btn2 = document.getElementById('chartSlotBtn2');
  if (btn1) btn1.className = slot === 1 ? 'btn sm'       : 'btn sm ghost';
  if (btn2) btn2.className = slot === 2 ? 'btn sm'       : 'btn sm ghost';
  await _loadChartSlot(t, slot);
}

function navChartPreview(dir) {
  const rows = document.getElementById('chartPreviewOverlay')?._chartRows;
  if (!rows) return;
  _showPreviewAt(_previewIdx + dir, rows);
}

function closeChartPreview() {
  document.getElementById('chartPreviewOverlay')?.classList.remove('open');
}

// ── Journal Edit Modal
function openJournalEdit(t) {
  document.getElementById('editId').value     = t.id;
  document.getElementById('editSymbol').value = t.symbol || '';
  document.getElementById('editSide').value   = t.side || 'Long';
  document.getElementById('editEntry').value  = t.entry_price || '';
  document.getElementById('editExit').value   = t.exit_price  || '';
  document.getElementById('editPnl').value    = t.pnl || '';
  document.getElementById('editResult').value = t.result || 'P';
  document.getElementById('editReason').value = t.reason_entry || '';
  document.getElementById('editNotes').value  = t.reason_exit  || '';
  document.getElementById('editChart').value  = t.chart_link   || '';
  document.getElementById('editChart2').value = t.chart_link2  || '';
  document.getElementById('journalModal').style.display = 'grid';
}
function closeJournalModal() { document.getElementById('journalModal').style.display = 'none'; }
async function saveJournalEdit() {
  const id = document.getElementById('editId').value;
  const d  = await api(`/api/journal/${id}`, {
    method: 'POST',
    body: JSON.stringify({
      symbol:       document.getElementById('editSymbol').value,
      side:         document.getElementById('editSide').value,
      entry_price:  parseFloat(document.getElementById('editEntry').value),
      exit_price:   parseFloat(document.getElementById('editExit').value),
      pnl:          parseFloat(document.getElementById('editPnl').value),
      result:       document.getElementById('editResult').value,
      reason_entry: document.getElementById('editReason').value,
      reason_exit:  document.getElementById('editNotes').value,
      chart_link:   document.getElementById('editChart').value,
      chart_link2:  document.getElementById('editChart2').value,
    })
  });
  if (d.status === 'ok') { closeJournalModal(); loadJournal(); }
  else alert(d.message || 'Error saving');
}

// ── AI Recap — with localStorage persistence
const _RECAP_STORAGE_KEY = 'v4-last-ai-recap';

async function runAiRecap() {
  const from = document.getElementById('recapFrom').value;
  const to   = document.getElementById('recapTo').value;
  const out  = document.getElementById('recapOutput');
  out.textContent = '✦ Analyzing your trades with Gemini…';
  const d = await api(`/api/journal?from=${from}&to=${to}`);
  const trades = d?.data || d?.trades || d?.entries || [];
  if (!trades.length) { out.textContent = 'No trades in this range.'; return; }

  const recap = await api('/api/bybit/ai-recap', {
    method: 'POST',
    body: JSON.stringify({ from, to, trades })
  });
  const html = recap?.summary
    ? recap.summary.replace(/\n/g, '<br>')
    : `<em>No recap available. Check GEMINI_API_KEY in .env.</em>`;
  out.innerHTML = html;

  // Persist to localStorage so it survives refresh
  if (recap?.summary) {
    localStorage.setItem(_RECAP_STORAGE_KEY, JSON.stringify({
      from, to, html,
      saved_at: new Date().toLocaleString()
    }));
    _updateRecapBtn();
  }
}

// Load last saved recap into the output area on tab open
function loadLastRecap() {
  const raw = localStorage.getItem(_RECAP_STORAGE_KEY);
  if (!raw) return;
  try {
    const saved = JSON.parse(raw);
    const out = document.getElementById('recapOutput');
    if (out && saved.html) {
      out.innerHTML = `<div style="opacity:.6;font-size:0.7rem;margin-bottom:8px;">Last recap: ${saved.from} → ${saved.to} &nbsp;·&nbsp; Saved ${saved.saved_at}</div>` + saved.html;
      const fromEl = document.getElementById('recapFrom');
      const toEl   = document.getElementById('recapTo');
      if (fromEl && saved.from) fromEl.value = saved.from;
      if (toEl   && saved.to)   toEl.value   = saved.to;
    }
  } catch(e) {}
}

// Update the "Last Recap" chip label
function _updateRecapBtn() {
  const raw = localStorage.getItem(_RECAP_STORAGE_KEY);
  const btn = document.getElementById('lastRecapBtn');
  if (!btn) return;
  if (raw) {
    try {
      const s = JSON.parse(raw);
      btn.textContent = `📊 Last Recap: ${s.from?.slice(5)} → ${s.to?.slice(5)}`;
      btn.style.display = 'inline-flex';
    } catch(e) {}
  } else {
    btn.style.display = 'none';
  }
}

// Called by the button — jump to Journal → AI Recap tab + load last recap
function viewLastRecap() {
  switchSection('journal');
  setTimeout(() => {
    switchJournalTab('recap', document.querySelector('[onclick*="recap"]'));
    loadLastRecap();
  }, 100);
}

// ════════════════════════════════════════════════════════════
//  HISTORY SECTION
// ════════════════════════════════════════════════════════════
// ── History init — runs in correct sequence to avoid race condition
async function loadHistoryInit() {
  await loadHistoryYears();   // must finish first so monthSelect is populated
  loadYearStats();
  loadMonthlyRecap();         // now monthSelect has a value
  loadTradingCalendar();
  loadHistoryTable();
}

async function loadHistoryYears() {
  const d = await api('/api/bybit/monthly-list');
  const sel = document.getElementById('yearSelect');
  const msel = document.getElementById('monthSelect');
  if (!sel) return;

  const months = d?.months || d?.data || [];
  // Extract unique years
  const years = [...new Set(months.map(m => (m.month || '').slice(0,4)).filter(Boolean))].sort().reverse();
  if (!years.length) years.push(new Date().getFullYear().toString());
  sel.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');

  // Month dropdown — display as "2026-May" but value stays "2026-05"
  if (msel) {
    msel.innerHTML = months.slice(0, 24).map(m => {
      const key = m.month || '';
      return `<option value="${key}">${fmtMonthLabel(key)}</option>`;
    }).join('');
  }
}

async function loadYearStats() {
  const year = document.getElementById('yearSelect')?.value || new Date().getFullYear().toString();
  const [summary, monthList] = await Promise.all([
    api('/api/bybit/pnl-summary'),
    api('/api/bybit/monthly-list'),
  ]);

  // Total PnL — from monthly-list overall
  const total = monthList?.overall?.net_pnl ?? summary?.alltime?.net_pnl ?? 0;
  const tEl = document.getElementById('histTotalPnl');
  if (tEl) { tEl.textContent = fmt$(total); tEl.className = `value balance-val ${pnlClass(total)}`; }

  // Win rate — summary.alltime.win_rate
  const wr = summary?.alltime?.win_rate ?? null;
  const wrEl = document.getElementById('histWinRate');
  if (wrEl) wrEl.textContent = wr != null ? wr.toFixed(1) + '%' : '–';

  // Bar chart — pass months data directly to avoid a second fetch
  renderHistBarChart(year, monthList?.months || []);
}

// ── PnL Line Charts state
const _pnlCharts = { monthly: null, weekly: null, daily: null };

function switchPnlChart(tab, btn) {
  document.querySelectorAll('.pnl-chart-tabs button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.pnl-chart-panel').forEach(p => p.classList.remove('active'));
  document.getElementById(`pnlChart${tab.charAt(0).toUpperCase()+tab.slice(1)}`)?.classList.add('active');
}

function _buildLineChart(canvasId, labels, values, storeKey) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  if (_pnlCharts[storeKey]) { _pnlCharts[storeKey].destroy(); _pnlCharts[storeKey] = null; }
  const isDark = STATE.theme === 'dark';
  const jade = '#4caf82';
  _pnlCharts[storeKey] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: values,
        borderColor: jade,
        backgroundColor: isDark ? 'rgba(76,175,130,.1)' : 'rgba(76,175,130,.08)',
        borderWidth: 2,
        tension: 0.35,
        fill: true,
        pointRadius: values.length <= 20 ? 3 : 0,
        pointHoverRadius: 5,
        pointBackgroundColor: jade,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fmt$(c.parsed.y) } } },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: isDark ? '#7a7690' : '#8a8070', font: { size: 10 }, maxTicksLimit: 10, maxRotation: 0 }
        },
        y: {
          grid: { color: isDark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.05)' },
          ticks: { color: isDark ? '#7a7690' : '#8a8070', font: { size: 11 }, callback: v => fmt$(v, 0) }
        }
      }
    }
  });
}

async function renderPnlLineCharts(year, monthsData) {
  // ── Monthly chart
  let months = monthsData;
  if (!months) {
    const d = await api('/api/bybit/monthly-list');
    months = d?.months || [];
  }
  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const mLabels = [], mValues = [];
  months.slice().reverse().forEach(m => {
    const mo = m.month || '';
    const idx = parseInt(mo.slice(5,7)) - 1;
    mLabels.push(fmtMonthLabel(mo));
    mValues.push(parseFloat(m.net_pnl ?? m.pnl ?? 0));
  });
  _buildLineChart('pnlMonthlyCanvas', mLabels, mValues, 'monthly');

  // Update best/worst from monthly data
  if (mValues.length) {
    const best  = Math.max(...mValues);
    const worst = Math.min(...mValues);
    const bestEl  = document.getElementById('histBestMonth');
    const worstEl = document.getElementById('histWorstMonth');
    if (bestEl)  { bestEl.textContent  = fmt$(best);  bestEl.className  = `value pnl-pos balance-val`; }
    if (worstEl) { worstEl.textContent = fmt$(worst); worstEl.className = `value pnl-neg balance-val`; }
  }

  // ── Daily + Weekly from pnl-daily
  const dd = await api('/api/bybit/pnl-daily');
  const daily = (dd?.data || []).sort((a,b) => (a.day||'') < (b.day||'') ? -1 : 1);

  // Daily
  const dLabels = daily.map(r => {
    const d = r.day || r.date || '';
    const parts = d.split('-');
    return parts.length === 3 ? `${parseInt(parts[1])}/${parseInt(parts[2])}` : d;
  });
  const dValues = daily.map(r => parseFloat(r.net_pnl ?? r.pnl ?? 0));
  _buildLineChart('pnlDailyCanvas', dLabels, dValues, 'daily');

  // Weekly — group by ISO week (Monday)
  const weekMap = {};
  daily.forEach(r => {
    const date = new Date(r.day || r.date);
    if (isNaN(date)) return;
    const day = date.getDay();
    const diffToMon = (day === 0 ? -6 : 1 - day);
    const mon = new Date(date);
    mon.setDate(date.getDate() + diffToMon);
    const wk = mon.toISOString().slice(0,10);
    weekMap[wk] = (weekMap[wk] || 0) + parseFloat(r.net_pnl ?? r.pnl ?? 0);
  });
  const weeks = Object.keys(weekMap).sort();
  const wLabels = weeks.map(w => { const p = w.split('-'); return `${parseInt(p[1])}/${parseInt(p[2])}`; });
  const wValues = weeks.map(w => weekMap[w]);
  _buildLineChart('pnlWeeklyCanvas', wLabels, wValues, 'weekly');
}

// Keep the old name as alias so loadYearStats still works
async function renderHistBarChart(year, monthsData) {
  await renderPnlLineCharts(year, monthsData);
}

function fmtMonthLabel(m) {
  // "2026-05" → "2026-May"
  if (!m || !m.includes('-')) return m;
  const parts = m.split('-');
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const idx = parseInt(parts[1]) - 1;
  return `${parts[0]}-${MONTHS[idx] || parts[1]}`;
}

function fmtDateLabel(d) {
  // "2026-05-06" → "2026-May-06"
  if (!d) return '–';
  const parts = d.split('-');
  if (parts.length < 3) return fmtMonthLabel(d);
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const mo = parseInt(parts[1]) - 1;
  return `${parts[0]}-${MONTHS[mo] || parts[1]}-${parts[2]}`;
}

async function loadMonthlyRecap() {
  const month = document.getElementById('monthSelect')?.value;
  if (!month) return;
  const d = await api(`/api/bybit/monthly-recap?month=${month}`);
  if (d?.status === 'error') return;

  // Cache calendar data for loadTradingCalendar (avoids double fetch)
  if (d?.calendar) _calendarCache[month] = d.calendar;

  const stats    = d?.stats   || {};
  const bestDay  = d?.best_day || {};

  const netPnl    = stats.net_pnl    ?? 0;
  const wins      = stats.wins       ?? 0;
  const losses    = stats.losses     ?? 0;
  const be        = stats.be         ?? 0;
  const total     = stats.total      ?? 0;
  const winRate   = stats.win_rate   ?? 0;
  const bestTrade = stats.best_trade ?? 0;
  const bestDayPnl = bestDay.pnl     ?? 0;
  const bestDayDate = bestDay.day    ? fmtDateLabel(bestDay.day) : '–';

  // Net PnL card
  const pnlEl = document.getElementById('recapPnl');
  if (pnlEl) { pnlEl.textContent = fmt$(netPnl); pnlEl.className = `mono balance-val ${pnlClass(netPnl)}`; }
  const pnlDetail = document.getElementById('recapPnlDetail');
  if (pnlDetail) pnlDetail.textContent = `${total} trade${total!==1?'s':''} · avg ${fmt$(total ? netPnl/total : 0)} each`;

  // Win Rate card
  const wrEl = document.getElementById('recapWr');
  if (wrEl) wrEl.textContent = `${winRate.toFixed(1)}%`;
  const wrDetail = document.getElementById('recapWrDetail');
  if (wrDetail) wrDetail.textContent = `${wins}W · ${losses}L · ${be}BE`;

  // Best Day card
  const bdEl = document.getElementById('recapBestDay');
  if (bdEl) { bdEl.textContent = fmt$(bestDayPnl); bdEl.className = `mono pnl-pos balance-val`; }
  const bdDateEl = document.getElementById('recapBestDayDate');
  if (bdDateEl) bdDateEl.textContent = bestDayDate !== '–' ? bestDayDate : 'No trading days yet';

  // Best Trade card
  const btEl = document.getElementById('recapBestTrade');
  if (btEl) { btEl.textContent = fmt$(bestTrade); btEl.className = `mono pnl-pos balance-val ${pnlClass(bestTrade)}`; }
  const btDetail = document.getElementById('recapBestTradeDetail');
  if (btDetail) btDetail.textContent = bestTrade > 0 ? 'Single best closed trade' : 'No profitable trades yet';

  loadTradingCalendar(month);
}

// _calendarDayData: cached per-month calendar data from monthly-recap API
const _calendarCache = {};

async function loadTradingCalendar(month) {
  const m = month || document.getElementById('monthSelect')?.value;
  if (!m) return;
  const cal = document.getElementById('tradingCalendar');
  if (!cal) return;

  // Use monthly-recap which has a calendar[] array with exact per-day PnL for any month
  let calendarData;
  if (_calendarCache[m]) {
    calendarData = _calendarCache[m];
  } else {
    const d = await api(`/api/bybit/monthly-recap?month=${m}`);
    calendarData = d?.calendar || [];
    _calendarCache[m] = calendarData;
  }

  // Build pnlByDate from the calendar array: [{day: "2026-01-03", day_pnl: -12.4, trades: 2}]
  const pnlByDate = {};
  calendarData.forEach(r => {
    const key = r.day || r.date || '';
    if (key) pnlByDate[key] = parseFloat(r.day_pnl ?? r.net_pnl ?? r.pnl ?? 0);
  });

  // Build calendar grid for the month
  const [y, mo] = m.split('-').map(Number);
  const firstDay = new Date(y, mo - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(y, mo, 0).getDate();
  const startPad = (firstDay === 0 ? 6 : firstDay - 1); // Mon-first grid

  let html = '';
  for (let i = 0; i < startPad; i++) html += `<div class="cal-day muted"></div>`;
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${y}-${String(mo).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const pnl = pnlByDate[dateStr];
    const cls = pnl != null ? (pnl > 0 ? 'win' : pnl < 0 ? 'loss' : '') : '';
    const todayCls = dateStr === new Date().toISOString().slice(0,10) ? ' today' : '';
    // 2 decimal places as requested
    const pnlLabel = pnl != null ? fmt$(pnl, 2) : '';
    html += `<div class="cal-day ${cls}${todayCls}">
      <span class="d">${day}</span>
      ${pnlLabel ? `<span class="p">${pnlLabel}</span>` : ''}
    </div>`;
  }
  cal.innerHTML = html;
}

function histResultSelect(id, result) {
  const r = result || '';
  const colorStyle = r === 'W' || r === 'P' ? 'color:var(--profit);' :
                     r === 'L'               ? 'color:var(--loss);'   :
                     r === 'BE'              ? 'color:var(--text-2);' : 'color:var(--text-3);';
  return `<select class="res-select" style="${colorStyle}" onchange="setTradeResult(${id},this.value,this)">
    <option value="" ${!r?'selected':''}>–</option>
    <option value="W" ${r==='W'||r==='P'?'selected':''}>W</option>
    <option value="L" ${r==='L'?'selected':''}>L</option>
    <option value="BE" ${r==='BE'?'selected':''}>BE</option>
  </select>`;
}

async function setTradeResult(id, result, selectEl) {
  // Update dropdown color immediately for instant feedback
  if (selectEl) {
    selectEl.style.color = result === 'W' ? 'var(--profit)' :
                           result === 'L' ? 'var(--loss)' :
                           result === 'BE' ? 'var(--text-2)' : 'var(--text-3)';
  }
  const d = await api(`/api/journal/${id}`, {
    method: 'POST',
    body: JSON.stringify({ result })
  });
  if (d?.status === 'ok') {
    loadMonthlyRecap();
    loadYearStats();
    // Reload journal if visible (journal mirrors history result)
    if (STATE.activeSection === 'journal') loadJournal();
  } else {
    showToast(d?.message || 'Failed to update result', 'error');
  }
}

async function loadHistoryTable() {
  const d = await api('/api/bybit/history');
  const body = document.getElementById('historyBody');
  const count = document.getElementById('histTradeCount');
  if (!body) return;
  const rows = d?.data || d?.trades || d?.history || [];
  if (count) count.textContent = `${rows.length} trades`;
  if (!rows.length) { body.innerHTML = `<tr><td colspan="9" class="muted tiny" style="padding:20px;text-align:center;">No trade history. Use the Backfill button above.</td></tr>`; return; }
  body.innerHTML = rows.map(t => {
    const pnl = parseFloat(t.pnl || 0);
    return `<tr>
      <td class="tiny mono">${(t.closed_at || '').slice(0,10)}</td>
      <td class="sym">${t.symbol||'–'}</td>
      <td>${sideTag(t.side)}</td>
      <td class="num">${parseFloat(t.entry || t.entry_price || 0).toFixed(4)}</td>
      <td class="num">${parseFloat(t.exit  || t.exit_price  || 0).toFixed(4)}</td>
      <td class="num">${t.size || '–'}</td>
      <td class="num">${t.leverage || '–'}</td>
      <td class="num ${pnlClass(pnl)} balance-val">${fmt$(pnl)}</td>
      <td>${histResultSelect(t.id, t.result)}</td>
    </tr>`;
  }).join('');
}

async function backfillTrades() {
  const btn = document.getElementById('btnBackfill');
  if (!btn) return;
  btn.disabled = true; btn.textContent = '⏳ Backfilling…';
  const d = await api('/api/bybit/backfill', { method: 'POST' });
  btn.disabled = false; btn.textContent = '⬇ Backfill 3 months';
  if (d.inserted != null) alert(`Done! Inserted: ${d.inserted}, Skipped (dup): ${d.skipped_dup}`);
  else alert(d.message || JSON.stringify(d));
  loadHistoryTable();
  loadYearStats();
}

// ── Save current month to DATA Recap folder
async function saveMonthToRecap(btn) {
  const month = new Date().toISOString().slice(0, 7); // e.g. "2026-05"
  const label = new Date().toLocaleString('en', { month: 'long', year: 'numeric' }); // "May 2026"
  const orig  = btn.innerHTML;
  btn.disabled  = true;
  btn.innerHTML = '<span class="spinning" style="display:inline-block;">↻</span>';
  const d = await api('/api/autosave/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'monthly', month })
  });
  btn.disabled  = false;
  btn.innerHTML = orig;
  if (d?.status === 'ok' || d?.rows != null) {
    const rows = d?.rows ?? d?.trades ?? '?';
    showToast(`✓ ${label} saved to DATA Recap (${rows} trades)`);
  } else {
    showToast(d?.message || 'Save failed', 'error');
  }
}

// ── Open DATA Recap folder in Finder
async function openDataRecapFolder() {
  const d = await api('/api/data-recap/open', { method: 'POST' });
  if (d?.status === 'ok') {
    showToast(`📂 Opening: ${d.path || 'DATA Recap folder'}`);
  } else {
    // Show path even on error so user can navigate manually
    const path = d?.path || '~/Desktop/trading-dashboard-v4/DATA Recap';
    showToast(`Folder: ${path}`, 'error');
  }
}

// ── Journal → Excel export (incremental)
function _excelLastSavedKey() { return 'v4-excel-last-saved'; }

function _updateExcelLabel() {
  const saved = localStorage.getItem(_excelLastSavedKey());
  const lbl   = document.getElementById('excelLastSaved');
  if (lbl) lbl.textContent = saved ? `Last: ${saved}` : '';
}

async function setGSheetUrl() {
  let cur = '';
  try { const c = await api('/api/gsheet/config'); cur = (c && c.url) || ''; } catch (e) {}
  const url = prompt('ONE Google Sheet file for your whole journal — each account becomes its own TAB inside it (named after the profile).\n\n⚠ Use a TEST sheet first — Sync clears & rewrites each account tab from your DB.\n\nShare the sheet (Editor) with the client_email from your google_credentials.json service account.', cur);
  if (url === null) return;
  try {
    const d = await api('/api/gsheet/config', { method: 'POST', body: JSON.stringify({ url: url.trim() }) });
    if (d.status === 'ok') showToast('Sheet URL saved for profile: ' + (d.profile || '—'), 'success');
    else showToast(d.message || 'Save failed', 'error');
  } catch (e) { showToast('Save failed', 'error'); }
}

async function syncToGSheet(btn) {
  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span style="display:inline-block;animation:spin 1s linear infinite;">↻</span> Syncing…';
  try {
    const d = await api('/api/gsheet/sync', {
      method: 'POST',
      body: JSON.stringify({ force_all: true })
    });
    if (d.status === 'ok') {
      showToast(`✓ Google Sheet updated — ${d.synced} trades synced`, 'success');
    } else {
      showToast(d.message || 'Sync failed', 'error');
    }
  } catch(e) {
    showToast('Sync error: ' + e, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = orig;
  }
}

async function exportJournalExcel(btn) {
  // Always export exactly what's currently shown in the table
  const fromDate = document.getElementById('journalFrom')?.value || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const toDate   = document.getElementById('journalTo')?.value   || new Date().toISOString().slice(0, 10);

  // Use "YYYY-MM" label if a specific month is selected, else "from_to" range
  const selMonth = document.getElementById('journalMonthFilter')?.value;
  const fileName = selMonth
    ? `Journal_${selMonth}.xlsx`
    : `Journal_${fromDate}_to_${toDate}.xlsx`;

  // ─── STEP 1: Get file handle NOW, while the user gesture is still active ───
  // Chrome invalidates the user-gesture context after any await, so
  // showSaveFilePicker MUST be called before the fetch — not after.
  let fileHandle = null;
  if ('showSaveFilePicker' in window) {
    try {
      fileHandle = await window.showSaveFilePicker({
        suggestedName: fileName,
        types: [{
          description: 'Excel Spreadsheet',
          accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] }
        }]
      });
    } catch (pickErr) {
      if (pickErr.name === 'AbortError') return; // user hit Cancel — do nothing
      console.warn('[Excel] showSaveFilePicker error:', pickErr);
      fileHandle = null; // fall through to download link
    }
  }

  // ─── STEP 2: Fetch the file from the server ───────────────────────────────
  const origText = btn.innerHTML;
  btn.disabled   = true;
  btn.innerHTML  = '<span class="spinning" style="display:inline-block;">↻</span> Saving…';

  try {
    const res = await fetch(`/api/journal/export?from=${fromDate}&to=${toDate}`);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      showToast(j.message || `Export failed (${res.status})`, 'error');
      return;
    }
    const blob = await res.blob();

    // ─── STEP 3: Write to chosen location or fall back to Downloads ──────────
    if (fileHandle) {
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      showToast(`✓ Saved: ${fileName}`);
    } else {
      // Fallback path — no dialog, goes to browser Downloads folder
      const blobUrl = URL.createObjectURL(blob);
      const a       = document.createElement('a');
      a.href        = blobUrl;
      a.download    = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
      showToast(`✓ Downloaded to Downloads: ${fileName}`);
    }

    localStorage.setItem(_excelLastSavedKey(), fileName);
    _updateExcelLabel();
  } catch (e) {
    showToast('Export error: ' + e, 'error');
  } finally {
    btn.disabled  = false;
    btn.innerHTML = origText;
  }
}

// init labels on page load
document.addEventListener('DOMContentLoaded', () => {
  _updateExcelLabel();
  _updateRecapBtn();
  loadNotifSettings();   // restore notification toggle states from localStorage
});

/* ════════════════════════════════════════════════════════════
   ASTRAL INTERACTION LAYER — 星河 (V4.2, 2026-07-03)
   Additive only: no existing function is modified.
   Starfield canvas · shooting stars · constellation · parallax
   cursor aurora · KPI value flash. Appended — do NOT split file.
   ════════════════════════════════════════════════════════════ */
(function astralLayer(){
  'use strict';
  const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FINE_PTR = window.matchMedia && window.matchMedia('(pointer: fine)').matches;

  /* ── Starfield ─────────────────────────────────────────── */
  const canvas = document.getElementById('astralSky');
  if (canvas && !REDUCED) {
    const ctx = canvas.getContext('2d');
    let W = 0, H = 0, DPR = Math.min(window.devicePixelRatio || 1, 2);
    let stars = [], shots = [], mx = .5, my = .5, tmx = .5, tmy = .5;
    let running = true, lastShot = performance.now() + 3000, lastF = 0;

    // Chinese asterisms — normalized coords, drawn faint (2026-07-03j: more constellations)
    const ASTERISMS = [
      [[.06,.22],[.115,.16],[.175,.175],[.23,.22],[.285,.20],[.33,.27],[.30,.345]],       // 北斗 Big Dipper
      [[.87,.62],[.90,.57],[.935,.545],[.965,.50],[.955,.44],[.92,.41]],                   // 南斗 Southern Dipper
      [[.10,.55],[.135,.60],[.085,.625],[.10,.55]],                                        // 织女 Weaver Girl (Vega)
      [[.855,.14],[.885,.185],[.915,.235]],                                                // 牛郎 Cowherd (Altair)
      [[.42,.08],[.46,.055],[.50,.075],[.545,.05],[.585,.08]],                             // 天船 Celestial Boat
      [[.68,.07],[.71,.11],[.75,.095],[.78,.13]],                                          // 阁道 Palace Walkway
      [[.06,.76],[.10,.83],[.155,.81],[.19,.88]],                                          // 龙尾 Dragon Tail (low left)
      [[.90,.74],[.935,.80],[.915,.87],[.95,.90]],                                         // 天江 Sky River (low right)
      [[.30,.90],[.35,.945],[.41,.925]],                                                   // 南门 South Gate (low)
      [[.60,.93],[.655,.90],[.70,.945]]                                                    // 龟 Turtle (low)
    ];

    function resize(){
      const r = canvas.getBoundingClientRect();   // canvas box (offset below header so glass blur stays cheap)
      W = r.width; H = r.height;
      canvas.width = W * DPR; canvas.height = H * DPR;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      const n = Math.min(130, Math.round(W * H / 12000));
      stars = [];
      for (let i = 0; i < n; i++){
        const layer = i % 3;                       // 0 far · 1 mid · 2 near
        stars.push({
          x: Math.random() * W, y: Math.random() * H,
          r: layer === 2 ? 1.15 + Math.random() * .85 : layer === 1 ? .7 + Math.random() * .6 : .4 + Math.random() * .4,
          l: layer,
          tw: 1.2 + Math.random() * 2.6,           // twinkle period s
          ph: Math.random() * Math.PI * 2,
          hue: Math.random() < .82 ? null : (Math.random() < .5 ? '232,193,90' : '139,127,240')
        });
      }
    }

    function spawnShot(){
      const fromTop = Math.random() < .7;
      shots.push({
        x: fromTop ? Math.random() * W * .8 : W + 30,
        y: fromTop ? -20 : Math.random() * H * .3,
        vx: -(3.4 + Math.random() * 3.2),
        vy: 2.1 + Math.random() * 1.8,
        life: 0, max: 60 + Math.random() * 30
      });
    }

    function frame(t){
      if (!running) return;
      if (t - lastF < 41){ requestAnimationFrame(frame); return; }   // ~24fps cap (perf)
      lastF = t;
      ctx.clearRect(0, 0, W, H);
      tmx += (mx - tmx) * .04; tmy += (my - tmy) * .04;
      const dark = document.documentElement.getAttribute('data-theme') !== 'light';
      const base = dark ? '255,255,255' : '90,80,140';

      // stars
      for (const s of stars){
        const par = (s.l + 1) * 7;                 // parallax px per layer
        const x = s.x + (tmx - .5) * par, y = s.y + (tmy - .5) * par;
        const a = .28 + .62 * (0.5 + 0.5 * Math.sin(t / 1000 / s.tw * Math.PI * 2 + s.ph));
        ctx.beginPath();
        ctx.fillStyle = 'rgba(' + (s.hue || base) + ',' + (a * (dark ? 1 : .8)).toFixed(3) + ')';
        ctx.arc(x, y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // constellations — faint, each breathing on its own phase (both themes)
      if (W > 700){
        const lineRGB = dark ? '232,193,90' : '96,82,150';
        const boost = dark ? 1 : 1.6;
        for (let ai = 0; ai < ASTERISMS.length; ai++){
          const A = ASTERISMS[ai];
          const ca = (.09 + .06 * Math.sin(t / 4200 + ai * 1.7)) * boost;
          ctx.strokeStyle = 'rgba(' + lineRGB + ',' + ca.toFixed(3) + ')';
          ctx.lineWidth = 1;
          ctx.beginPath();
          A.forEach(function(p, i){
            const x = p[0] * W + (tmx - .5) * 10, y = p[1] * H + (tmy - .5) * 10;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          });
          ctx.stroke();
          for (const p of A){
            const x = p[0] * W + (tmx - .5) * 10, y = p[1] * H + (tmy - .5) * 10;
            ctx.beginPath();
            ctx.fillStyle = 'rgba(' + lineRGB + ',' + Math.min(1, ca * 3.4).toFixed(3) + ')';
            ctx.arc(x, y, 1.6, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // shooting stars
      if (t > lastShot){ spawnShot(); lastShot = t + 6000 + Math.random() * 9000; }
      shots = shots.filter(function(sh){ return sh.life < sh.max; });
      for (const sh of shots){
        sh.x += sh.vx; sh.y += sh.vy; sh.life++;
        const fade = 1 - sh.life / sh.max;
        const g = ctx.createLinearGradient(sh.x, sh.y, sh.x - sh.vx * 9, sh.y - sh.vy * 9);
        g.addColorStop(0, 'rgba(255,255,255,' + (.85 * fade).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.strokeStyle = g; ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(sh.x, sh.y);
        ctx.lineTo(sh.x - sh.vx * 9, sh.y - sh.vy * 9);
        ctx.stroke();
      }
      requestAnimationFrame(frame);
    }

    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', function(){
      running = !document.hidden;
      if (running) requestAnimationFrame(frame);
    });
    if (FINE_PTR) window.addEventListener('mousemove', function(e){
      mx = e.clientX / window.innerWidth; my = e.clientY / window.innerHeight;
    }, { passive: true });
    resize();
    requestAnimationFrame(frame);
  }

  /* ── Cursor aurora ─────────────────────────────────────── */
  if (FINE_PTR && !REDUCED){
    const orb = document.createElement('div');
    orb.className = 'astral-cursor';
    document.body.appendChild(orb);
    let ox = -600, oy = -600, cx = ox, cy = oy, on = false, looping = false;
    function follow(){
      cx += (ox - cx) * .08; cy += (oy - cy) * .08;
      orb.style.transform = 'translate(' + (cx - 260) + 'px,' + (cy - 260) + 'px)';
      if (Math.abs(ox - cx) < .4 && Math.abs(oy - cy) < .4){
        looping = false;            // mouse settled → stop the loop (perf)
        return;
      }
      requestAnimationFrame(follow);
    }
    window.addEventListener('mousemove', function(e){
      ox = e.clientX; oy = e.clientY;
      if (!on){ on = true; document.body.classList.add('astral-cursor-on'); }
      if (!looping){ looping = true; requestAnimationFrame(follow); }
    }, { passive: true });
  }

  /* ── KPI value flash on change ─────────────────────────── */
  if (!REDUCED && 'MutationObserver' in window){
    document.querySelectorAll('.kpi .value').forEach(function(el){
      new MutationObserver(function(){
        el.classList.remove('val-flash');
        void el.offsetWidth;                       // restart animation
        el.classList.add('val-flash');
      }).observe(el, { childList: true, characterData: true, subtree: true });
    });
  }
})();

/* ── Market AI chatbot popup toggle (2026-07-03e) ──
   Same #marketAiCard element (all ids/wiring intact) — CSS class
   'open' turns it into a fixed top-left panel. Esc closes. */
function toggleAiPopup(){
  const c = document.getElementById('marketAiCard');
  if (!c) return;
  const open = c.classList.toggle('open');
  const b = document.getElementById('aiFabBtn');
  if (b) b.classList.toggle('active', open);
  if (open){
    // clamp back into view (saved drag pos may be off-screen after monitor switch)
    requestAnimationFrame(function(){
      const r = c.getBoundingClientRect();
      if (r.left < 0 || r.top < 0 || r.right > window.innerWidth || r.bottom > window.innerHeight){
        c.style.left = Math.max(8, Math.min(window.innerWidth - r.width - 8, r.left)) + 'px';
        c.style.top  = Math.max(8, Math.min(window.innerHeight - r.height - 8, r.top)) + 'px';
        c.style.right = 'auto'; c.style.bottom = 'auto';
      }
    });
    const i = document.getElementById('aiAskInput');
    if (i) setTimeout(function(){ i.focus(); }, 90);
  }
}
document.addEventListener('keydown', function(e){
  if (e.key === 'Escape'){
    const c = document.getElementById('marketAiCard');
    if (c && c.classList.contains('open')) toggleAiPopup();
  }
});

/* ── AI popup: draggable + position persisted (2026-07-03f) ── */
(function aiPopupDrag(){
  const KEY = 'v42-aipopup-pos2';   // v2: bottom-right default (old top-left saves invalidated)
  const card = document.getElementById('marketAiCard');
  if (!card) return;
  // restore saved position
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (p && typeof p.x === 'number'){
      card.style.left = p.x + 'px';
      card.style.top  = p.y + 'px';
      card.style.right = 'auto';
      card.style.bottom = 'auto';
    }
  } catch(e){}
  let sx = 0, sy = 0, ox = 0, oy = 0, dragging = false;
  function down(e){
    if (!card.classList.contains('open')) return;
    // drag from the title bar only — keep chips/inputs clickable
    const bar = e.target.closest('.card-title');
    if (!bar || !card.contains(bar)) return;
    if (e.target.closest('button, input, select, a')) return;
    dragging = true;
    const r = card.getBoundingClientRect();
    ox = r.left; oy = r.top;
    card.style.right = 'auto';
    card.style.bottom = 'auto';
    sx = (e.touches ? e.touches[0].clientX : e.clientX);
    sy = (e.touches ? e.touches[0].clientY : e.clientY);
    card.classList.add('ai-dragging');
    e.preventDefault();
  }
  function move(e){
    if (!dragging) return;
    const cx = (e.touches ? e.touches[0].clientX : e.clientX);
    const cy = (e.touches ? e.touches[0].clientY : e.clientY);
    let nx = ox + (cx - sx), ny = oy + (cy - sy);
    const r = card.getBoundingClientRect();
    nx = Math.max(8, Math.min(window.innerWidth  - r.width  - 8, nx));
    ny = Math.max(8, Math.min(window.innerHeight - 60, ny));
    card.style.left = nx + 'px';
    card.style.top  = ny + 'px';
  }
  function up(){
    if (!dragging) return;
    dragging = false;
    card.classList.remove('ai-dragging');
    try {
      localStorage.setItem(KEY, JSON.stringify({
        x: parseInt(card.style.left) || 138,
        y: parseInt(card.style.top)  || 96
      }));
    } catch(e){}
  }
  card.addEventListener('mousedown', down);
  card.addEventListener('touchstart', down, { passive: false });
  window.addEventListener('mousemove', move);
  window.addEventListener('touchmove', move, { passive: true });
  window.addEventListener('mouseup', up);
  window.addEventListener('touchend', up);
})();

/* ════════════════════════════════════════════════════════════
   MEGA PASS JS — 天宫 Celestial Palace (2026-07-03g)
   Section morph (View Transitions) · data-sec visibility ·
   KPI 3D tilt · hero parallax · magnetic buttons · scroll progress
   ════════════════════════════════════════════════════════════ */
(function megaPass(){
  'use strict';
  const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── section wrapper: data-sec + view-transition morph ── */
  const _origSwitch = window.switchSection;
  if (typeof _origSwitch === 'function'){
    window.switchSection = function(sec){
      const args = arguments, self = this;
      const apply = function(){
        _origSwitch.apply(self, args);
        document.body.setAttribute('data-sec', sec);
        if (sec !== 'overview'){                       // AI popup lives on Overview only
          const c = document.getElementById('marketAiCard');
          if (c && c.classList.contains('open')){
            c.classList.remove('open');
            const b = document.getElementById('aiFabBtn');
            if (b) b.classList.remove('active');
          }
        }
      };
      if (document.startViewTransition && !REDUCED &&
          document.body.getAttribute('data-sec') !== sec){
        document.startViewTransition(apply);
      } else apply();
    };
  }
  document.body.setAttribute('data-sec', 'overview');

  if (REDUCED) return;   // everything below is motion

  /* ── KPI cards: pointer 3D tilt ── */
  document.querySelectorAll('.kpi').forEach(function(card){
    let raf = null;
    card.addEventListener('mousemove', function(e){
      if (raf) return;
      raf = requestAnimationFrame(function(){
        raf = null;
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - .5;
        const py = (e.clientY - r.top) / r.height - .5;
        card.style.transform =
          'perspective(700px) rotateX(' + (-py * 5).toFixed(2) + 'deg)' +
          ' rotateY(' + (px * 6).toFixed(2) + 'deg) translateY(-2px)';
      });
    });
    card.addEventListener('mouseleave', function(){
      card.style.transform = '';
    });
  });

  /* ── hero: slow parallax drift with cursor ── */
  (function(){
    const hero = document.querySelector('.hero-banner');
    const bg = document.getElementById('heroBg');
    if (!hero || !bg) return;
    let raf = null;
    hero.addEventListener('mousemove', function(e){
      if (raf) return;
      raf = requestAnimationFrame(function(){
        raf = null;
        const r = hero.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - .5;
        const py = (e.clientY - r.top) / r.height - .5;
        bg.style.transform = 'scale(1.06) translate(' + (-px * 14).toFixed(1) + 'px,' + (-py * 10).toFixed(1) + 'px)';
      });
    });
    hero.addEventListener('mouseleave', function(){ bg.style.transform = ''; });
  })();

  /* ── magnetic pull: primary buttons + AI fab ── */
  function magnetize(el){
    let raf = null;
    el.addEventListener('mousemove', function(e){
      if (raf) return;
      raf = requestAnimationFrame(function(){
        raf = null;
        const r = el.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        el.style.transform = 'translate(' + (dx * .18).toFixed(1) + 'px,' + (dy * .22).toFixed(1) + 'px)';
      });
    });
    el.addEventListener('mouseleave', function(){ el.style.transform = ''; });
  }
  document.querySelectorAll('.btn.primary, .ai-fab').forEach(magnetize);

  /* ── golden scroll progress ── */
  (function(){
    const content = document.querySelector('.content');
    if (!content) return;
    const bar = document.createElement('div');
    bar.className = 'astral-progress';
    document.body.appendChild(bar);
    content.addEventListener('scroll', function(){
      const max = content.scrollHeight - content.clientHeight;
      bar.style.transform = 'scaleX(' + (max > 0 ? content.scrollTop / max : 0).toFixed(4) + ')';
    }, { passive: true });
  })();
})();

/* ── spotlight cards: cursor-tracked glow (2026-07-03i) ── */
(function spotlight(){
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!(window.matchMedia && window.matchMedia('(pointer: fine)').matches)) return;
  let raf = null;
  document.addEventListener('mousemove', function(e){
    if (raf) return;
    raf = requestAnimationFrame(function(){
      raf = null;
      const card = e.target && e.target.closest ? e.target.closest('.card') : null;
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
      card.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
    });
  }, { passive: true });
})();

/* ── STARDUST CURSOR v2 (2026-07-03w) — replaces the aurora orb ──
   Soft glow + trailing star dust on its own canvas; the rAF loop
   runs ONLY while particles are alive (idle = zero cost). */
(function stardustCursor(){
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!(window.matchMedia && window.matchMedia('(pointer: fine)').matches)) return;
  const cv = document.createElement('canvas');
  cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9400;';
  document.body.appendChild(cv);
  const ctx = cv.getContext('2d');
  let W = 0, H = 0, DPR = Math.min(window.devicePixelRatio || 1, 2);
  function size(){
    W = window.innerWidth; H = window.innerHeight;
    cv.width = W * DPR; cv.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  size();
  window.addEventListener('resize', size);

  let parts = [], running = false, mx = -100, my = -100, lastSpawn = 0, lastX = -100, lastY = -100;

  function dark(){ return document.documentElement.getAttribute('data-theme') !== 'light'; }

  window.addEventListener('mousemove', function(e){
    mx = e.clientX; my = e.clientY;
    const now = performance.now();
    const moved = Math.hypot(mx - lastX, my - lastY);
    if (now - lastSpawn > 22 && moved > 3 && parts.length < 70){
      lastSpawn = now; lastX = mx; lastY = my;
      const n = moved > 26 ? 2 : 1;
      for (let i = 0; i < n; i++){
        const a = Math.random() * Math.PI * 2, sp = .2 + Math.random() * .7;
        parts.push({
          x: mx + (Math.random() - .5) * 8,
          y: my + (Math.random() - .5) * 8,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - .25,
          life: 0, max: 34 + Math.random() * 26,
          r: .8 + Math.random() * 1.5,
          kind: Math.random() < .7 ? 0 : (Math.random() < .5 ? 1 : 2)   // 0 white·1 gold·2 violet
        });
      }
    }
    if (!running){ running = true; requestAnimationFrame(tick); }
  }, { passive: true });

  function tick(){
    ctx.clearRect(0, 0, W, H);
    const d = dark();
    // soft glow around the cursor while dust is alive
    if (parts.length){
      const g = ctx.createRadialGradient(mx, my, 0, mx, my, 70);
      g.addColorStop(0, d ? 'rgba(232,193,90,.05)' : 'rgba(96,82,150,.05)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(mx - 70, my - 70, 140, 140);
    }
    const cols = d
      ? ['255,255,255', '232,193,90', '139,127,240']
      : ['96,82,150', '154,117,20', '139,127,240'];
    parts = parts.filter(function(p){ return p.life < p.max; });
    for (const p of parts){
      p.life++; p.x += p.vx; p.y += p.vy; p.vy += .008;
      const fade = 1 - p.life / p.max;
      const tw = .55 + .45 * Math.sin(p.life * .5);
      ctx.beginPath();
      ctx.fillStyle = 'rgba(' + cols[p.kind] + ',' + (fade * tw * (d ? .9 : .8)).toFixed(3) + ')';
      ctx.arc(p.x, p.y, p.r * (0.4 + fade * 0.6), 0, Math.PI * 2);
      ctx.fill();
      // tiny cross-sparkle on the brighter ones
      if (p.r > 1.7 && fade > .4){
        ctx.strokeStyle = 'rgba(' + cols[p.kind] + ',' + (fade * .35).toFixed(3) + ')';
        ctx.lineWidth = .7;
        const s = p.r * 2.6 * fade;
        ctx.beginPath();
        ctx.moveTo(p.x - s, p.y); ctx.lineTo(p.x + s, p.y);
        ctx.moveTo(p.x, p.y - s); ctx.lineTo(p.x, p.y + s);
        ctx.stroke();
      }
    }
    if (parts.length){ requestAnimationFrame(tick); }
    else { running = false; ctx.clearRect(0, 0, W, H); }
  }
})();
