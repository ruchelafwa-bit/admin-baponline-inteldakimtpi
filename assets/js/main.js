/* ================================================================
   ADMIN BAP ONLINE — main.js v3.0
   Kantor Imigrasi Kelas I TPI Tanjungpinang
   ================================================================ */

'use strict';

// ── Constants ────────────────────────────────────────────────────
const SHEET_URL = 'https://script.google.com/macros/s/AKfycbwG-V9Jvm5GlsjLYnCGrciLx8tAp2NfpKUsnoAmNnILHxO-3tJbf_D90pzrjMMx8Ogg/exec';
const SESSION_KEY = 'baper_session_v3';
const STATUS_KEY = 'baper_status_v2';
const THEME_KEY = 'baper_theme_v1';
const SESSION_HOURS = 8;
const MAX_ATTEMPTS = 5;
const LOCKOUT_SECS = 60;
const REFRESH_SECS = 30;
const PAGE_SIZE = 12;

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const MONTH_FULL = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const DAYS_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

// ── State ────────────────────────────────────────────────────────
let allData = [];
let localStatus = {};
let currentPage = 1;
let currentRow = null;
let pendingDelKey = null;
let rsFilter = 'all';
let dashFilter = 'all';
let activeMonth = 'all';
let activeYear = '';
let arCountdown = REFRESH_SECS;
let tokenAttempts = MAX_ATTEMPTS;
let lockoutTimer = null;
let autoRefInt = null;
let confirmResolve = null;

// ── Helpers ──────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

function escKey(k) { return (k || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Theme ────────────────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light') applyTheme('light');
  else applyTheme('dark');
}
function applyTheme(mode) {
  const btn = $('modeToggle');
  if (mode === 'light') {
    document.body.classList.add('light-mode');
    if (btn) btn.textContent = '☀️';
    localStorage.setItem(THEME_KEY, 'light');
  } else {
    document.body.classList.remove('light-mode');
    if (btn) btn.textContent = '🌙';
    localStorage.setItem(THEME_KEY, 'dark');
  }
}
function toggleTheme() {
  const isLight = document.body.classList.contains('light-mode');
  applyTheme(isLight ? 'dark' : 'light');
}

// ── Online/Offline ───────────────────────────────────────────────
function initOnlineStatus() {
  function update() {
    const el = $('onlineIndicator');
    if (!el) return;
    if (navigator.onLine) {
      el.className = 'online-indicator online';
      el.innerHTML = '<div class="oi-dot"></div><span>Online</span>';
    } else {
      el.className = 'online-indicator offline';
      el.innerHTML = '<div class="oi-dot"></div><span>Offline</span>';
    }
  }
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  update();
}

// ── Custom Confirm ───────────────────────────────────────────────
function showConfirm({ title = 'Konfirmasi', msg = 'Apakah Anda yakin?', icon = '❓',
  okText = 'Ya, Lanjutkan', cancelText = 'Batal', type = 'info' }) {
  return new Promise(resolve => {
    confirmResolve = resolve;
    $('confirmIcon').textContent = icon;
    $('confirmTitle').textContent = title;
    $('confirmMsg').textContent = msg;
    $('confirmOkBtn').textContent = okText;
    $('confirmCancelBtn').textContent = cancelText;
    $('confirmOkBtn').className = `confirm-ok-btn ${type}`;
    $('confirmOverlay').classList.add('show');
    document.body.style.overflow = 'hidden';
  });
}
function resolveConfirm(val) {
  $('confirmOverlay').classList.remove('show');
  document.body.style.overflow = '';
  if (confirmResolve) { confirmResolve(val); confirmResolve = null; }
}

// ── Session ──────────────────────────────────────────────────────
function saveSession(displayName, username) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ displayName, username, loginTime: Date.now() }));
}
function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (Date.now() - s.loginTime > SESSION_HOURS * 3600000) { clearSession(); return null; }
    return s;
  } catch { return null; }
}
function clearSession() { localStorage.removeItem(SESSION_KEY); }
function getSessionAge(s) {
  if (!s) return '';
  const m = Math.floor((Date.now() - s.loginTime) / 60000);
  return m < 60 ? `Login ${m} mnt lalu` : `Login ${Math.floor(m / 60)} jam lalu`;
}

// ── Particle FX ─────────────────────────────────────────────────
function spawnParticles() {
  const c = $('particles');
  if (!c) return;
  for (let i = 0; i < 14; i++) {
    setTimeout(() => {
      const p = document.createElement('div');
      p.className = 'particle';
      const sz = Math.random() * 4 + 2;
      const x = Math.random() * 100;
      const dur = Math.random() * 14 + 10;
      const dx = (Math.random() - 0.5) * 80;
      p.style.cssText = `width:${sz}px;height:${sz}px;left:${x}%;bottom:-10px;opacity:${Math.random() * .45 + .15};--dx:${dx}px;animation-duration:${dur}s;animation-delay:${Math.random() * 6}s;`;
      c.appendChild(p);
    }, i * 160);
  }
}

// ── Login ────────────────────────────────────────────────────────
function togglePw() {
  const inp = $('loginPass');
  const btn = $('pwToggle');
  if (inp.type === 'password') { inp.type = 'text'; btn.textContent = '🙈'; }
  else { inp.type = 'password'; btn.textContent = '👁'; }
}

async function doLogin() {
  const u = $('loginUser').value.trim();
  const p = $('loginPass').value.trim();
  const err = $('loginErr');
  const btn = $('loginBtn');

  if (!u || !p) { showLoginErr('Username dan password tidak boleh kosong.'); return; }
  if (tokenAttempts <= 0) return;

  btn.disabled = true;
  btn.textContent = '⏳ Memverifikasi...';
  err.classList.remove('show');

  try {
    const res = await fetch(SHEET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'adminLogin', username: u, password: p })
    });
    const json = await res.json();

    if (json.ok) {
      saveSession(json.displayName || u, u);
      bootDashboard(json.displayName || u);
    } else {
      tokenAttempts = Math.max(0, tokenAttempts - 1);
      updateAttemptDots();
      showLoginErr(json.error || 'Username atau password salah.');
      if (tokenAttempts <= 0) { startLockout(); return; }
    }
  } catch {
    showLoginErr('⚠ Gagal terhubung ke server. Periksa koneksi internet.');
  }

  btn.disabled = false;
  btn.textContent = '▶ MASUK SISTEM';
}

function showLoginErr(msg) {
  const err = $('loginErr');
  err.textContent = msg;
  err.classList.remove('show');
  void err.offsetWidth; // reflow for animation restart
  err.classList.add('show');
}

function updateAttemptDots() {
  $$('.attempt-dot').forEach((d, i) => {
    d.className = 'attempt-dot' + (i < (MAX_ATTEMPTS - tokenAttempts) ? ' used' : '');
  });
}

function startLockout() {
  const btn = $('loginBtn');
  const bar = $('lockoutBar');
  const fill = $('lockoutFill');
  const txt = $('lockoutText');
  const uI = $('loginUser');
  const pI = $('loginPass');

  btn.disabled = true;
  btn.textContent = '🔒 Terkunci';
  uI.disabled = true;
  pI.disabled = true;
  bar.classList.add('show');
  fill.style.width = '100%';

  let remaining = LOCKOUT_SECS;
  txt.textContent = `Terkunci. Tunggu ${remaining} detik...`;

  lockoutTimer = setInterval(() => {
    remaining--;
    fill.style.width = (remaining / LOCKOUT_SECS * 100) + '%';
    txt.textContent = `Terkunci. Tunggu ${remaining} detik...`;

    if (remaining <= 0) {
      clearInterval(lockoutTimer);
      tokenAttempts = MAX_ATTEMPTS;
      btn.disabled = false;
      btn.textContent = '▶ MASUK SISTEM';
      uI.disabled = false;
      pI.disabled = false;
      bar.classList.remove('show');
      $('loginErr').classList.remove('show');
      updateAttemptDots();
    }
  }, 1000);
}

async function doLogout() {
  const ok = await showConfirm({
    title: 'Keluar Sistem',
    msg: 'Apakah Anda yakin ingin keluar dari sistem?',
    icon: '⏻',
    okText: 'Ya, Keluar',
    type: 'danger'
  });
  if (!ok) return;

  clearSession();
  clearInterval(autoRefInt);

  $('adminShell').style.display = 'none';
  $('loginPage').classList.add('visible');
  $('loginUser').value = '';
  $('loginPass').value = '';

  tokenAttempts = MAX_ATTEMPTS;
  updateAttemptDots();
  $('loginErr').classList.remove('show');
  showToast('info', 'Anda telah keluar dari sistem.');
}

function bootDashboard(displayName) {
  const session = getSession();
  $('officerName').textContent = displayName;
  if (session) $('sessionExpiry').textContent = getSessionAge(session);

  $('loginPage').classList.remove('visible');
  $('adminShell').style.display = 'block';

  loadLocalStatus();
  loadData();
  startClock();
  startAutoRefresh();
}

// ── Clock & Auto-Refresh ─────────────────────────────────────────
function startClock() {
  function tick() {
    const n = new Date();
    const cl = $('liveClock');
    const de = $('liveDate');
    if (cl) cl.textContent = n.toLocaleTimeString('id-ID', { hour12: false });
    if (de) de.textContent = `${DAYS_ID[n.getDay()]}, ${n.getDate()} ${MONTH_SHORT[n.getMonth()]} ${n.getFullYear()}`;
    const session = getSession();
    const exp = $('sessionExpiry');
    if (exp && session && n.getSeconds() === 0) exp.textContent = getSessionAge(session);
  }
  tick();
  setInterval(tick, 1000);
}

function startAutoRefresh() {
  arCountdown = REFRESH_SECS;
  clearInterval(autoRefInt);

  autoRefInt = setInterval(() => {
    const anyOpen =
      $('modalOverlay').classList.contains('show') ||
      $('deleteOverlay').classList.contains('show') ||
      $('lightbox').classList.contains('show') ||
      $('confirmOverlay').classList.contains('show');

    if (anyOpen) return;

    arCountdown--;
    const el = $('arTimer');
    if (el) el.textContent = arCountdown + 's';

    if (arCountdown <= 0) {
      loadData(false);
      arCountdown = REFRESH_SECS;
    }
  }, 1000);
}

// ── Local Status Cache ───────────────────────────────────────────
function loadLocalStatus() {
  try { localStatus = JSON.parse(localStorage.getItem(STATUS_KEY) || '{}'); }
  catch { localStatus = {}; }
}
function saveLocalStatus() {
  localStorage.setItem(STATUS_KEY, JSON.stringify(localStatus));
}
function getRowKey(r) {
  return (r.nama || '') + '_' + (r.tanggal || '') + '_' + (r.jam || '') + '_' + (r.hp || '');
}

// ── Data Loading ─────────────────────────────────────────────────
function normTanggal(v) {
  if (!v) return '';
  const s = String(v);
  if (s.includes('T') || s.match(/^\d{4}-\d{2}-\d{2}/)) return s.slice(0, 10);
  return s;
}

async function loadData(manual = false) {
  const btn = $('refreshBtn');
  if (btn) btn.classList.add('spinning');

  try {
    const res = await fetch(SHEET_URL + '?action=get', { cache: 'no-store' });
    const json = await res.json();
    const raw = Array.isArray(json) ? json : (json.data || []);

    allData = raw.map(r => {
      const key = getRowKey(r);
      const cached = localStatus[key] || {};
      const sheetSt = r.status && String(r.status).trim() !== '' ? r.status : null;
      return {
        ...r,
        tanggal: normTanggal(r.tanggal),
        _key: key,
        status: sheetSt || cached.status || 'Menunggu',
        note: (r.note && String(r.note).trim() !== '') ? r.note : (cached.note || ''),
        reg: r.no_registrasi || r.reg || '',
        _rowIndex: r._rowIndex || null,
        reschedule_status: r.reschedule_status || '',
        reschedule_tanggal: normTanggal(r.reschedule_tanggal || ''),
        reschedule_jam: r.reschedule_jam || '',
        reschedule_slot_id: r.reschedule_slot_id || '',
        reschedule_alasan: r.reschedule_alasan || '',
        reschedule_count: r.reschedule_count || '0',
        foto_ulang_tanggal: r.foto_ulang_tanggal || cached.foto_ulang_tanggal || '',
      };
    });

    // Sort newest first
    allData.sort((a, b) => (parseInt(b._rowIndex) || 0) - (parseInt(a._rowIndex) || 0));

    const lu = $('lastUpdate');
    if (lu) lu.textContent = 'Terakhir: ' + new Date().toLocaleTimeString('id-ID', { hour12: false });

    if (manual) showToast('success', '✓ Data berhasil diperbarui');
    startAutoRefresh();
    buildMonthYearOptions();

  } catch (e) {
    console.error('loadData error:', e);
    if (manual) showToast('error', '⚠ Gagal mengambil data dari server');
  }

  if (btn) btn.classList.remove('spinning');
  renderAll();
}

// ── Month/Year Filter ────────────────────────────────────────────
function getYearsFromData() {
  const set = new Set();
  allData.forEach(r => {
    const y = (r.tanggal || '').slice(0, 4);
    if (y.match(/^\d{4}$/)) set.add(y);
  });
  return [...set].sort((a, b) => parseInt(b) - parseInt(a));
}

function getMonthsWithData(year) {
  const set = new Set();
  allData.forEach(r => {
    const tgl = r.tanggal || '';
    if (!year || tgl.startsWith(year)) {
      const m = tgl.slice(5, 7);
      if (m.match(/^\d{2}$/)) set.add(m);
    }
  });
  return [...set].sort();
}

function buildMonthYearOptions() {
  const yearSel = $('filterYear');
  const years = getYearsFromData();
  const prevYear = yearSel.value;

  yearSel.innerHTML =
    '<option value="">Semua Tahun</option>' +
    years.map(y => `<option value="${y}">${y}</option>`).join('');

  if (prevYear && years.includes(prevYear)) yearSel.value = prevYear;
  else { yearSel.value = ''; activeYear = ''; }

  activeYear = yearSel.value;
  renderMonthChips();
}

function renderMonthChips() {
  const container = $('monthChips');
  const months = getMonthsWithData(activeYear);

  let html = `<button class="month-chip ${activeMonth === 'all' ? 'active active-all' : ''}" onclick="setMonthFilter('all')">Semua</button>`;
  html += months.map(m => {
    const label = MONTH_SHORT[parseInt(m) - 1];
    return `<button class="month-chip ${activeMonth === m ? 'active' : ''}" onclick="setMonthFilter('${m}')">${label}</button>`;
  }).join('');

  container.innerHTML = html;

  const badge = $('filterActiveBadge');
  const clearBtn = $('filterClearBtn');
  const isActive = activeMonth !== 'all' || activeYear !== '';

  if (isActive) {
    badge.style.display = 'inline-flex';
    clearBtn.style.display = 'inline-flex';
    let txt = '';
    if (activeMonth !== 'all') txt += MONTH_SHORT[parseInt(activeMonth) - 1];
    if (activeYear) txt += (txt ? ' ' : '') + activeYear;
    $('filterBadgeText').textContent = txt;
  } else {
    badge.style.display = 'none';
    clearBtn.style.display = 'none';
  }
}

function setMonthFilter(m) {
  activeMonth = m;
  renderMonthChips();
  resetPageAndRender();
}

function clearMonthFilter() {
  activeMonth = 'all';
  activeYear = '';
  $('filterYear').value = '';
  renderMonthChips();
  resetPageAndRender();
}

function resetPageAndRender() {
  currentPage = 1;
  activeYear = $('filterYear').value || '';
  if (activeMonth !== 'all') {
    const available = getMonthsWithData(activeYear);
    if (!available.includes(activeMonth)) activeMonth = 'all';
  }
  renderMonthChips();
  renderTable();
}

// ── Filtered Data ────────────────────────────────────────────────
function getFiltered() {
  const q = ($('searchInput')?.value || '').toLowerCase().trim();
  const fs = $('filterStatus')?.value || '';
  const fj = $('filterJenis')?.value || '';

  return allData.filter(r => {
    const tgl = r.tanggal || '';
    if (activeYear && !tgl.startsWith(activeYear)) return false;
    if (activeMonth !== 'all' && tgl.slice(5, 7) !== activeMonth) return false;
    const mQ = !q || (r.nama || '').toLowerCase().includes(q) ||
      (r.reg || '').toLowerCase().includes(q) ||
      (r.hp || '').includes(q);
    const mS = !fs || r.status === fs;
    const mJ = !fj || r.jenis_permohonan === fj;
    return mQ && mS && mJ;
  });
}

// ── Render All ───────────────────────────────────────────────────
function renderAll() {
  renderStats();
  renderDashTable();
  renderTable();
  renderRsTable();
  renderRecap();

  // Nav badges
  const waiting = allData.filter(r => r.status === 'Menunggu').length;
  const rsPending = allData.filter(r => r.reschedule_status === 'Pending').length;

  $('navBadge').textContent = waiting;

  const rsBadge = $('navRsBadge');
  rsBadge.textContent = rsPending;
  rsBadge.style.display = rsPending > 0 ? 'inline-flex' : 'none';

  const meta = $('rsBannerMeta');
  if (meta) {
    meta.innerHTML = rsPending > 0
      ? `<div class="banner-live" style="color:#fdba74;background:rgba(249,115,22,0.08);border-color:rgba(249,115,22,0.25);">${rsPending} Pending</div>`
      : '';
  }
}

// ── Stat Cards ───────────────────────────────────────────────────
function renderStats() {
  animateNum('sc-total', allData.length);
  animateNum('sc-wait', allData.filter(r => r.status === 'Menunggu').length);
  animateNum('sc-conf', allData.filter(r => r.status === 'Dikonfirmasi').length);
  animateNum('sc-done', allData.filter(r => r.status === 'Selesai').length);
  animateNum('sc-rs', allData.filter(r => r.reschedule_status === 'Pending').length);
}

function animateNum(id, target) {
  const el = $(id);
  if (!el) return;
  let cur = parseInt(el.textContent) || 0;
  const diff = Math.abs(target - cur);
  if (diff === 0) return;
  const step = Math.ceil(diff / 18) || 1;
  const iv = setInterval(() => {
    cur = cur < target
      ? Math.min(cur + step, target)
      : Math.max(cur - step, target);
    el.textContent = cur;
    if (cur === target) clearInterval(iv);
  }, 28);
}

// ── Date Formatters ──────────────────────────────────────────────
function formatTgl(tgl) {
  if (!tgl) return '—';
  const s = String(tgl).slice(0, 10);
  if (!s.match(/^\d{4}-\d{2}-\d{2}$/)) return s;
  const [y, m, d] = s.split('-');
  return `${parseInt(d)} ${MONTH_SHORT[parseInt(m) - 1]} ${y}`;
}

function formatTglFull(tgl) {
  if (!tgl) return '—';
  const s = String(tgl).slice(0, 10);
  if (!s.match(/^\d{4}-\d{2}-\d{2}$/)) return s;
  try {
    return new Date(s + 'T12:00:00').toLocaleDateString('id-ID', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
  } catch { return s; }
}

// ── Foto Ulang Selects ───────────────────────────────────────────
function populateFotoUlangSelects() {
  const hSel = $('fuHari'), bSel = $('fuBulan'), ySel = $('fuTahun');
  if (!hSel || hSel.dataset.filled) return;
  for (let d = 1; d <= 31; d++) {
    const o = document.createElement('option');
    o.value = String(d).padStart(2, '0');
    o.textContent = d;
    hSel.appendChild(o);
  }
  MONTH_FULL.forEach((m, i) => {
    const o = document.createElement('option');
    o.value = String(i + 1).padStart(2, '0');
    o.textContent = m;
    bSel.appendChild(o);
  });
  const thisYear = new Date().getFullYear();
  for (let y = thisYear; y <= thisYear + 1; y++) {
    const o = document.createElement('option');
    o.value = String(y);
    o.textContent = y;
    ySel.appendChild(o);
  }
  hSel.dataset.filled = '1';
}

function setFotoUlangValue(tglStr) {
  populateFotoUlangSelects();
  const s = String(tglStr || '').slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  $('fuTahun').value = m ? m[1] : '';
  $('fuBulan').value = m ? m[2] : '';
  $('fuHari').value = m ? m[3] : '';
}

function getFotoUlangValue() {
  const h = $('fuHari').value, b = $('fuBulan').value, y = $('fuTahun').value;
  if (!h || !b || !y) return '';
  return `${y}-${b}-${h}`;
}

function formatFotoUlangReadable(tglStr) {
  const s = String(tglStr || '').slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '—';
  return `${parseInt(m[3])} ${MONTH_FULL[parseInt(m[2]) - 1]} ${m[1]}`;
}

// ── Highlight Search ─────────────────────────────────────────────
function highlight(text, query) {
  if (!query) return escHtml(text);
  const esc = escHtml(text);
  const escQ = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return esc.replace(new RegExp(`(${escQ})`, 'gi'), '<mark class="search-hl">$1</mark>');
}

// ── Dashboard Table ──────────────────────────────────────────────
function setDashFilter(filter, el) {
  dashFilter = filter;
  $$('#dashQuickFilter .month-chip').forEach(b => {
    b.className = 'month-chip';
    if (b === el) b.className = 'month-chip active' + (filter === 'all' ? ' active-all' : '');
  });
  renderDashTable();
}

function renderDashTable() {
  let data = allData.slice(0, 20);
  if (dashFilter !== 'all') {
    if (dashFilter === 'Pending RS') {
      data = allData.filter(r => r.reschedule_status === 'Pending').slice(0, 20);
    } else {
      data = allData.filter(r => r.status === dashFilter).slice(0, 20);
    }
  }
  const shown = data.slice(0, 10);

  const sub = $('dashTableSub');
  if (sub) sub.textContent = shown.length + ' data ditampilkan' + (dashFilter !== 'all' ? ` · Filter: ${dashFilter}` : '');

  const tbody = $('dashBody');
  if (!shown.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text3)">Belum ada data</td></tr>';
    return;
  }
  tbody.innerHTML = shown.map((r, i) => `
    <tr class="row-enter" style="animation-delay:${i * .04}s" onclick="openModal('${escKey(r._key)}')">
      <td><span class="t-code">${escHtml(r.reg) || '—'}</span></td>
      <td><div class="t-name">${escHtml(r.nama) || '—'}</div><div class="t-sub">${escHtml(r.jk) || ''}</div></td>
      <td style="font-size:11.5px">${escHtml(r.jenis_permohonan) || '—'}</td>
      <td style="font-size:11.5px">${formatTgl(r.tanggal)}<div class="t-sub">${escHtml(r.jam) || ''}</div></td>
      <td>${badgeHtml(r.status, r.reschedule_status)}</td>
      <td>
        <div style="display:flex;gap:5px">
          <button class="action-btn" onclick="event.stopPropagation();openModal('${escKey(r._key)}')">👁</button>
          ${r.hp ? `<button class="action-btn wa" onclick="event.stopPropagation();openWA('${escKey(r.hp)}')" title="WhatsApp">📱</button>` : ''}
        </div>
      </td>
    </tr>`).join('');
}

// ── Main Table ───────────────────────────────────────────────────
function renderTable() {
  const q = ($('searchInput')?.value || '').trim();
  const filtered = getFiltered();
  const total = filtered.length;
  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;

  if (currentPage > totalPages) currentPage = totalPages;

  const start = (currentPage - 1) * PAGE_SIZE;
  const page = filtered.slice(start, start + PAGE_SIZE);

  // Subtitle
  let subtitleTxt = total + ' data ditemukan';
  if (activeMonth !== 'all' || activeYear) {
    let label = '';
    if (activeMonth !== 'all') label += MONTH_SHORT[parseInt(activeMonth) - 1];
    if (activeYear) label += (label ? ' ' : '') + activeYear;
    subtitleTxt += ` · Filter: ${label}`;
  }
  $('tblSubtitle').textContent = subtitleTxt;
  $('pgInfo').textContent = `Menampilkan ${total ? start + 1 : 0}–${Math.min(start + PAGE_SIZE, total)} dari ${total}`;

  const tbody = $('mainBody');
  if (!page.length) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><div class="empty-ic">🔍</div><h3>Tidak ada data</h3><p>Coba ubah filter atau kata pencarian</p></div></td></tr>`;
  } else {
    tbody.innerHTML = page.map((r, i) => `
      <tr class="row-enter" style="animation-delay:${i * .03}s" onclick="openModal('${escKey(r._key)}')">
        <td style="color:var(--text3);font-size:11px">${start + i + 1}</td>
        <td><span class="t-code">${escHtml(r.reg) || '—'}</span></td>
        <td><div class="t-name">${highlight(r.nama, q) || '—'}</div><div class="t-sub">${escHtml(r.ttl) || ''}</div></td>
        <td style="font-size:11.5px;font-family:'JetBrains Mono',monospace;color:var(--text2)">${escHtml(r.hp) || '—'}</td>
        <td style="font-size:11.5px">${escHtml(r.jenis_permohonan) || '—'}</td>
        <td style="font-size:11.5px">${formatTgl(r.tanggal)}<div class="t-sub">${escHtml(r.jam) || ''}</div></td>
        <td>${badgeHtml(r.status, r.reschedule_status)}</td>
        <td style="font-size:10px;color:var(--text3)">${escHtml(r.waktu_daftar) || '—'}</td>
        <td>
          <div style="display:flex;gap:4px;align-items:center">
            <button class="action-btn" title="Detail" onclick="event.stopPropagation();openModal('${escKey(r._key)}')">👁</button>
            ${r.hp ? `<button class="action-btn wa" title="WhatsApp" onclick="event.stopPropagation();openWA('${escKey(r.hp)}')">📱</button>` : ''}
            <button class="action-btn del" title="Hapus" onclick="event.stopPropagation();openDeleteFromTable('${escKey(r._key)}')">🗑️</button>
          </div>
        </td>
      </tr>`).join('');
  }
  renderPagination(totalPages);
}

function renderPagination(total) {
  let html = `<button class="pg-btn" onclick="changePage(${currentPage - 1})" ${currentPage <= 1 ? 'disabled' : ''} aria-label="Halaman sebelumnya">←</button>`;
  const s = Math.max(1, currentPage - 2);
  const e = Math.min(total, s + 4);
  for (let i = s; i <= e; i++) {
    html += `<button class="pg-btn ${i === currentPage ? 'active' : ''}" onclick="changePage(${i})" aria-label="Halaman ${i}" aria-current="${i === currentPage ? 'page' : 'false'}">${i}</button>`;
  }
  html += `<button class="pg-btn" onclick="changePage(${currentPage + 1})" ${currentPage >= total ? 'disabled' : ''} aria-label="Halaman berikutnya">→</button>`;
  $('pgBtns').innerHTML = html;
}

function changePage(p) {
  currentPage = p;
  renderTable();
  // Scroll to table, not top of page
  const tableCard = document.querySelector('#page-pendaftar .table-card');
  if (tableCard) tableCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── WhatsApp Quick Action ────────────────────────────────────────
function openWA(hp) {
  if (!hp) return;
  const clean = String(hp).replace(/\D/g, '');
  const intl = clean.startsWith('0') ? '62' + clean.slice(1) : clean;
  window.open(`https://wa.me/${intl}`, '_blank');
}

// ── Reschedule Table ─────────────────────────────────────────────
function setRsFilter(val, el) {
  rsFilter = val;
  $$('.rs-filter-btn').forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');
  renderRsTable();
}

function getRsData() {
  return allData.filter(r => {
    if (!r.reschedule_status || r.reschedule_status === '') return false;
    if (rsFilter === 'all') return true;
    return r.reschedule_status === rsFilter;
  });
}

function renderRsTable() {
  const data = getRsData();
  const sub = $('rsSubtitle');
  if (sub) sub.textContent = data.length + ' pengajuan ditemukan';

  const tbody = $('rsBody');
  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-ic">🔄</div><h3>Tidak ada pengajuan</h3><p>Belum ada pengajuan reschedule${rsFilter !== 'all' ? ' dengan status ' + rsFilter : ''}</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = data.map((r, i) => `
    <tr class="row-enter" style="animation-delay:${i * .03}s" onclick="openModal('${escKey(r._key)}')">
      <td><span class="t-code">${escHtml(r.reg) || '—'}</span></td>
      <td><div class="t-name">${escHtml(r.nama) || '—'}</div></td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:10.5px;color:var(--text2)">${escHtml(r.nik) || '—'}</td>
      <td><div class="rs-jadwal-row"><div style="font-size:11px;color:var(--text2)">${formatTgl(r.tanggal)}</div><div style="font-size:10px;color:var(--text3)">${escHtml(r.jam) || '—'}</div></div></td>
      <td><div class="rs-jadwal-row"><div class="rs-jadwal-new">${formatTgl(r.reschedule_tanggal) || '—'}</div><div style="font-size:10px;color:#fdba74">${escHtml(r.reschedule_jam) || '—'}</div></div></td>
      <td style="max-width:155px"><div style="font-size:11px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escHtml(r.reschedule_alasan)}">${escHtml(r.reschedule_alasan) || '—'}</div></td>
      <td>${rsBadgeHtml(r.reschedule_status)}</td>
      <td>${r.reschedule_status === 'Pending'
      ? `<div style="display:flex;gap:5px"><button class="action-btn approve" onclick="event.stopPropagation();approveReschedule('${escKey(r._key)}')">✓ Setuju</button><button class="action-btn reject" onclick="event.stopPropagation();rejectReschedule('${escKey(r._key)}')">✕ Tolak</button></div>`
      : `<button class="action-btn" onclick="event.stopPropagation();openModal('${escKey(r._key)}')">👁 Detail</button>`
    }</td>
    </tr>`).join('');
}

// ── Badge Helpers ────────────────────────────────────────────────
function badgeHtml(status, rsStatus) {
  if (rsStatus === 'Pending') return `<span class="badge badge-prs"><span class="badge-dot"></span>Pending RS</span>`;
  if (status === 'Menunggu') return `<span class="badge badge-wait"><span class="badge-dot"></span>Menunggu</span>`;
  if (status === 'Dikonfirmasi') return `<span class="badge badge-conf"><span class="badge-dot"></span>Dikonfirmasi</span>`;
  if (status === 'Selesai') return `<span class="badge badge-done"><span class="badge-dot"></span>Selesai</span>`;
  return `<span class="badge" style="background:var(--surface2);color:var(--text2)">${escHtml(status) || '—'}</span>`;
}
function rsBadgeHtml(s) {
  if (s === 'Pending') return `<span class="badge badge-rspending"><span class="badge-dot"></span>Pending</span>`;
  if (s === 'Disetujui') return `<span class="badge badge-rsapprove"><span class="badge-dot"></span>Disetujui</span>`;
  if (s === 'Ditolak') return `<span class="badge badge-rsreject"><span class="badge-dot"></span>Ditolak</span>`;
  return `<span class="badge" style="background:var(--surface2);color:var(--text3)">${escHtml(s) || '—'}</span>`;
}
function badgeText(s, rs) {
  if (rs === 'Pending') return 'Pending Reschedule';
  return s || 'Menunggu';
}

// ── Reschedule Actions ───────────────────────────────────────────
async function approveReschedule(key) {
  const row = allData.find(r => r._key === key);
  if (!row || !row._rowIndex) return;

  const ok = await showConfirm({
    title: 'Setujui Reschedule',
    msg: `Setujui perubahan jadwal untuk ${row.nama}?\nJadwal baru: ${formatTgl(row.reschedule_tanggal)}, ${row.reschedule_jam}`,
    icon: '✅',
    okText: 'Ya, Setujui',
    type: 'success'
  });
  if (!ok) return;

  showToast('info', '⏳ Memproses...');
  try {
    const res = await fetch(SHEET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        action: 'approveReschedule',
        _rowIndex: row._rowIndex,
        new_tanggal: row.reschedule_tanggal,
        new_jam: row.reschedule_jam,
        new_slot_id: row.reschedule_slot_id
      })
    });
    const json = await res.json();
    if (json.ok) {
      row.tanggal = row.reschedule_tanggal;
      row.jam = row.reschedule_jam;
      row.reschedule_status = 'Disetujui';
      row.status = 'Dikonfirmasi';
      showToast('success', '✓ Reschedule disetujui! Jadwal diperbarui.');
      renderAll();
    } else {
      showToast('error', '⚠ Gagal: ' + (json.error || 'Error server'));
    }
  } catch {
    showToast('error', '⚠ Gagal terhubung ke server');
  }
}

async function rejectReschedule(key) {
  const row = allData.find(r => r._key === key);
  if (!row || !row._rowIndex) return;

  const ok = await showConfirm({
    title: 'Tolak Reschedule',
    msg: `Tolak pengajuan reschedule untuk ${row.nama}?\nJadwal lama akan tetap berlaku.`,
    icon: '❌',
    okText: 'Ya, Tolak',
    type: 'danger'
  });
  if (!ok) return;

  showToast('info', '⏳ Memproses...');
  try {
    const res = await fetch(SHEET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'rejectReschedule', _rowIndex: row._rowIndex })
    });
    const json = await res.json();
    if (json.ok) {
      row.reschedule_status = 'Ditolak';
      row.status = 'Menunggu';
      showToast('info', 'Reschedule ditolak. Jadwal lama tetap berlaku.');
      renderAll();
    } else {
      showToast('error', '⚠ Gagal: ' + (json.error || 'Error server'));
    }
  } catch {
    showToast('error', '⚠ Gagal terhubung ke server');
  }
}

// ── Modal Open/Close ─────────────────────────────────────────────
function openModal(key) {
  const row = allData.find(r => r._key === key);
  if (!row) return;
  currentRow = row;

  // Header
  $('mTitle').textContent = row.nama || '—';
  $('mSub').textContent = (row.reg || '—') + ' · ' + badgeText(row.status, row.reschedule_status);

  // Data tab
  $('m-reg').textContent = row.reg || '—';
  $('m-waktu').textContent = row.waktu_daftar || '—';
  $('m-nama').textContent = row.nama || '—';
  $('m-ttl').textContent = row.ttl || '—';
  $('m-jk').textContent = row.jk || '—';
  $('m-hp').textContent = row.hp || '—';
  $('m-jadwal').textContent = formatTglFull(row.tanggal) + ' · ' + (row.jam || '—');
  $('m-jenis').textContent = row.jenis_permohonan || '—';
  $('m-paspor').textContent = row.jenis_paspor || '—';
  $('m-tujuan').textContent = row.tujuan || '—';

  // Foto ulang info
  const fuItem = $('m-fu-item');
  if (row.foto_ulang_tanggal && String(row.foto_ulang_tanggal).trim() !== '') {
    fuItem.style.display = 'block';
    $('m-fu-jadwal').textContent = formatFotoUlangReadable(row.foto_ulang_tanggal);
  } else {
    fuItem.style.display = 'none';
  }

  // Documents tab
  const DOCS = [
    { key: 'url_ktp', label: 'E-KTP', icon: '🪪' },
    { key: 'url_kk', label: 'Kartu Keluarga', icon: '👨‍👩‍👧' },
    { key: 'url_akta', label: 'Akta / Ijazah / Buku Nikah', icon: '📜' },
    { key: 'url_foto_paspor', label: 'Foto Paspor Rusak/Hilang', icon: '📕' },
    { key: 'url_surat_polisi', label: 'Surat Keterangan Polisi', icon: '🚔' },
    { key: 'url_surat_kelurahan', label: 'Surat Keterangan Kelurahan', icon: '🏢' },
    { key: 'url_surat_pemerintah', label: 'Surat Resmi Pemerintah', icon: '🏛️' },
    { key: 'url_pendukung', label: 'Dokumen Pendukung', icon: '📄' },
  ];
  const container = $('docContainer');
  const hasAny = DOCS.some(d => row[d.key] && String(row[d.key]).trim() !== '');
  if (!hasAny) {
    container.innerHTML = `<div style="text-align:center;padding:48px 20px;color:var(--text3)"><div style="font-size:40px;margin-bottom:12px;opacity:0.18">📂</div><div style="font-size:14px;font-weight:700;margin-bottom:5px;color:var(--text2)">Tidak ada dokumen</div><div style="font-size:12px">Pemohon belum melampirkan dokumen apapun.</div></div>`;
  } else {
    container.innerHTML = DOCS.map(d => {
      const url = row[d.key];
      if (!url || String(url).trim() === '') {
        return `<div class="doc-block"><div class="doc-block-head"><span class="dh-icon">${d.icon}</span><span class="dh-label">${d.label}</span><span class="dh-badge tdk">Tidak dilampirkan</span></div></div>`;
      }
      const isPdf = url.toLowerCase().includes('.pdf') || url.toLowerCase().includes('/raw/');
      const safeUrl = url.replace(/'/g, "\\'");
      return `<div class="doc-block"><div class="doc-block-head"><span class="dh-icon">${d.icon}</span><span class="dh-label">${d.label}</span><span class="dh-badge ada">✓ Tersedia</span></div><div class="doc-img-area">${isPdf
        ? `<div style="text-align:center;color:var(--text3)"><div style="font-size:38px;margin-bottom:10px">📄</div><div style="font-size:12.5px;margin-bottom:12px">File PDF</div><a href="${url}" target="_blank" rel="noopener" style="background:var(--sky-500);color:white;padding:8px 18px;border-radius:9px;font-size:12px;font-weight:800;text-decoration:none">⤢ Buka PDF</a></div>`
        : `<img src="${url}" alt="${d.label}" loading="lazy" onclick="openLightbox('${safeUrl}','${d.label}')" onerror="this.style.display='none';this.nextElementSibling.style.display='block'" title="Klik untuk zoom"><div class="doc-img-error" style="display:none">Gagal memuat gambar.<br><a href="${url}" target="_blank" rel="noopener">Buka di tab baru →</a></div>`
        }<a href="${url}" target="_blank" rel="noopener" class="doc-open-pill">⤢ Buka</a></div></div>`;
    }).join('');
  }

  // Status tab
  $('m-note').value = row.note || '';
  const isDone = row.status === 'Selesai';

  $$('.status-opt').forEach(o => {
    o.className = 'status-opt';
    if (o.dataset.val === row.status) {
      o.classList.add(
        row.status === 'Menunggu' ? 'selected-wait' :
          row.status === 'Dikonfirmasi' ? 'selected-conf' : 'selected-done'
      );
    }
  });

  // Lock done options
  $$('.status-opt[data-val="Menunggu"], .status-opt[data-val="Dikonfirmasi"]').forEach(o => {
    o.style.display = isDone ? 'none' : '';
  });
  const doneOpt = document.querySelector('.status-opt[data-val="Selesai"]');
  if (isDone && doneOpt) doneOpt.classList.add('locked');
  $('statusLockedNote').style.display = isDone ? 'block' : 'none';

  // Foto ulang section in status tab
  const fuSection = $('fotoUlangSection');
  if (isDone) {
    fuSection.style.display = 'block';
    setFotoUlangValue(row.foto_ulang_tanggal);
  } else {
    fuSection.style.display = 'none';
  }

  // Reschedule tab
  const rsTabEl = $('rsTab');
  const hasRs = row.reschedule_status && row.reschedule_status !== '';
  rsTabEl.style.display = hasRs ? 'block' : 'none';
  if (hasRs) {
    const panel = $('rsDetailPanel');
    const isApproved = row.reschedule_status === 'Disetujui';
    const isRejected = row.reschedule_status === 'Ditolak';
    panel.innerHTML = `<div class="rs-detail-panel">
      <h4>🔄 Detail Pengajuan Reschedule &nbsp;${rsBadgeHtml(row.reschedule_status)}</h4>
      <div class="rs-detail-grid">
        <div class="rs-detail-item"><div class="rs-detail-key">Jadwal Lama</div><div class="rs-detail-val">${formatTglFull(row.tanggal)}, ${escHtml(row.jam) || '—'}</div></div>
        <div class="rs-detail-item"><div class="rs-detail-key">Jadwal Baru Diminta</div><div class="rs-detail-val" style="color:#fdba74">${formatTglFull(row.reschedule_tanggal)}, ${escHtml(row.reschedule_jam) || '—'}</div></div>
        <div class="rs-detail-item full"><div class="rs-detail-key">Alasan Reschedule</div><div class="rs-detail-val">${escHtml(row.reschedule_alasan) || '—'}</div></div>
      </div>
      ${row.reschedule_status === 'Pending'
        ? `<div class="rs-action-row">
            <button class="rs-approve-btn" onclick="approveRescheduleModal()">✓ Setujui Reschedule</button>
            <button class="rs-reject-btn" onclick="rejectRescheduleModal()">✕ Tolak Reschedule</button>
           </div>`
        : isApproved
          ? `<div style="margin-top:12px;padding:11px 14px;background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.22);border-radius:10px;font-size:12px;color:#86efac;font-weight:700">✅ Reschedule telah disetujui. Jadwal telah diperbarui.</div>`
          : isRejected
            ? `<div style="margin-top:12px;padding:11px 14px;background:rgba(239,68,68,0.07);border:1px solid rgba(239,68,68,0.2);border-radius:10px;font-size:12px;color:#fca5a5;font-weight:700">❌ Reschedule ditolak. Jadwal lama tetap berlaku.</div>`
            : ''
      }
    </div>`;
  }

  switchTab('data', document.querySelector('.mtab[data-tab="data"]'));
  $('modalOverlay').classList.add('show');
  document.body.style.overflow = 'hidden';
}

function approveRescheduleModal() {
  if (currentRow) approveReschedule(currentRow._key).then(() => closeModal());
}
function rejectRescheduleModal() {
  if (currentRow) rejectReschedule(currentRow._key).then(() => closeModal());
}

function closeModal() {
  $('modalOverlay').classList.remove('show');
  document.body.style.overflow = '';
  currentRow = null;
}

function switchTab(name, el) {
  $$('.tab-panel').forEach(p => { p.classList.remove('active'); p.setAttribute('hidden', ''); });
  $$('.mtab').forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });

  const panel = $('tab-' + name);
  if (panel) { panel.classList.add('active'); panel.removeAttribute('hidden'); }
  if (el) { el.classList.add('active'); el.setAttribute('aria-selected', 'true'); }
}

function selectStatus(el) {
  if (el.classList.contains('locked')) return;
  $$('.status-opt').forEach(o => {
    const locked = o.classList.contains('locked');
    o.className = 'status-opt' + (locked ? ' locked' : '');
    o.setAttribute('aria-checked', 'false');
  });
  const v = el.dataset.val;
  el.classList.add(v === 'Menunggu' ? 'selected-wait' : v === 'Dikonfirmasi' ? 'selected-conf' : 'selected-done');
  el.setAttribute('aria-checked', 'true');

  const fuSection = $('fotoUlangSection');
  if (v === 'Selesai') {
    populateFotoUlangSelects();
    if (!currentRow || !currentRow.foto_ulang_tanggal) setFotoUlangValue('');
    fuSection.style.display = 'block';
  } else {
    fuSection.style.display = 'none';
  }
}

// ── Save Status ──────────────────────────────────────────────────
async function saveStatus() {
  if (!currentRow) return;
  const sel = document.querySelector('.status-opt[class*="selected"]');
  if (!sel) { showToast('error', 'Pilih status terlebih dahulu'); return; }

  const newStatus = sel.dataset.val;
  const note = $('m-note').value.trim();

  let fotoUlangTanggal = '';
  if (newStatus === 'Selesai') {
    // Always require foto ulang date when setting to Selesai
    fotoUlangTanggal = getFotoUlangValue();
    if (!fotoUlangTanggal) {
      showToast('error', '⚠ Pilih tanggal foto ulang paspor sebelum menyimpan');
      return;
    }
  }

  const rowKey = currentRow._key;
  const rowIndex = currentRow._rowIndex;
  const rowInData = allData.find(r => r._key === rowKey);

  // Optimistic update
  if (rowInData) {
    rowInData.status = newStatus;
    rowInData.note = note;
    if (newStatus === 'Selesai') rowInData.foto_ulang_tanggal = fotoUlangTanggal;
  }
  localStatus[rowKey] = { status: newStatus, note, foto_ulang_tanggal: fotoUlangTanggal };
  saveLocalStatus();
  renderAll();
  closeModal();

  if (rowIndex) {
    showToast('info', '⏳ Menyimpan ke sheet...');
    try {
      const payload = { action: 'updateStatus', _rowIndex: rowIndex, status: newStatus, note };
      if (newStatus === 'Selesai') payload.foto_ulang_tanggal = fotoUlangTanggal;

      const res = await fetch(SHEET_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (json.ok) {
        showToast('success', `✓ Status "${newStatus}" berhasil disimpan`);
        delete localStatus[rowKey];
        saveLocalStatus();
      } else {
        showToast('error', '⚠ Gagal simpan ke sheet — tersimpan lokal');
      }
    } catch {
      showToast('error', '⚠ Gagal terhubung — tersimpan lokal');
    }
  } else {
    showToast('success', `✓ Status: ${newStatus} (tersimpan lokal)`);
  }
}

// ── Delete ───────────────────────────────────────────────────────
function confirmDelete() {
  if (!currentRow) return;
  pendingDelKey = currentRow._key;
  $('deleteName').textContent = currentRow.nama || '—';
  closeModal();
  $('deleteOverlay').classList.add('show');
  document.body.style.overflow = 'hidden';
}

function openDeleteFromTable(key) {
  const row = allData.find(r => r._key === key);
  if (!row) return;
  pendingDelKey = key;
  $('deleteName').textContent = row.nama || '—';
  $('deleteOverlay').classList.add('show');
  document.body.style.overflow = 'hidden';
}

function closeDeleteModal() {
  $('deleteOverlay').classList.remove('show');
  document.body.style.overflow = '';
  pendingDelKey = null;
}

async function executeDelete() {
  if (!pendingDelKey) return;
  const row = allData.find(r => r._key === pendingDelKey);
  if (!row) { closeDeleteModal(); return; }

  allData = allData.filter(r => r._key !== pendingDelKey);
  delete localStatus[pendingDelKey];
  saveLocalStatus();
  closeDeleteModal();
  renderAll();
  showToast('info', '⏳ Menghapus data...');

  if (row._rowIndex) {
    try {
      const res = await fetch(SHEET_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ action: 'deleteRow', _rowIndex: row._rowIndex })
      });
      const json = await res.json();
      if (json.ok) showToast('success', '✓ Data berhasil dihapus');
      else showToast('error', '⚠ Gagal hapus di sheet');
    } catch {
      showToast('error', '⚠ Gagal menghapus data');
    }
  } else {
    showToast('success', '✓ Data dihapus');
  }
  pendingDelKey = null;
}

// ── Print ────────────────────────────────────────────────────────
function printDetail() {
  if (!currentRow) return;
  const r = currentRow;
  const w = window.open('', '_blank', 'width=700,height=900');
  w.document.write(`<!DOCTYPE html>
<html lang="id"><head><meta charset="UTF-8">
<title>Detail BAP — ${r.nama || '—'}</title>
<style>
  body{font-family:'DM Sans',Arial,sans-serif;margin:32px;color:#111;font-size:13px;}
  h1{font-size:16px;margin-bottom:4px;border-bottom:2px solid #0ea5e9;padding-bottom:8px;color:#0369a1;}
  .sub{color:#666;font-size:11px;margin-bottom:20px;}
  table{width:100%;border-collapse:collapse;margin-bottom:16px;}
  th{background:#f0f4f8;padding:8px 12px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:#5a7999;border-bottom:1px solid #dde;}
  td{padding:9px 12px;border-bottom:1px solid #eef;vertical-align:top;}
  td:first-child{font-size:10px;font-weight:700;color:#5a7999;text-transform:uppercase;letter-spacing:.07em;width:40%;}
  .badge{display:inline-block;padding:2px 10px;border-radius:99px;font-size:10px;font-weight:700;}
  .badge-wait{background:#fef9c3;color:#854d0e;}.badge-conf{background:#dbeafe;color:#1e40af;}.badge-done{background:#dcfce7;color:#166534;}
  .footer{margin-top:28px;font-size:10px;color:#999;border-top:1px solid #eee;padding-top:12px;}
  @media print{body{margin:0;padding:16px;}}
</style></head><body>
<h1>Detail BAP Pemohon — ${r.nama || '—'}</h1>
<div class="sub">Dicetak pada: ${new Date().toLocaleString('id-ID')} · Admin BAP Online Imigrasi Tanjungpinang</div>
<table>
  <thead><tr><th colspan="2">Informasi Pribadi</th></tr></thead>
  <tbody>
    <tr><td>No. Registrasi</td><td>${r.reg || '—'}</td></tr>
    <tr><td>Nama Lengkap</td><td><strong>${r.nama || '—'}</strong></td></tr>
    <tr><td>Tempat/Tgl Lahir</td><td>${r.ttl || '—'}</td></tr>
    <tr><td>Jenis Kelamin</td><td>${r.jk || '—'}</td></tr>
    <tr><td>No. HP/WhatsApp</td><td>${r.hp || '—'}</td></tr>
    <tr><td>Waktu Daftar</td><td>${r.waktu_daftar || '—'}</td></tr>
  </tbody>
</table>
<table>
  <thead><tr><th colspan="2">Informasi BAP</th></tr></thead>
  <tbody>
    <tr><td>Jenis Permohonan</td><td>${r.jenis_permohonan || '—'}</td></tr>
    <tr><td>Jenis Paspor</td><td>${r.jenis_paspor || '—'}</td></tr>
    <tr><td>Tujuan</td><td>${r.tujuan || '—'}</td></tr>
    <tr><td>Jadwal Kedatangan</td><td>${formatTglFull(r.tanggal)} · ${r.jam || '—'}</td></tr>
    <tr><td>Status BAP</td><td>${r.status || '—'}</td></tr>
    ${r.foto_ulang_tanggal ? `<tr><td>Foto Ulang Paspor</td><td>${formatFotoUlangReadable(r.foto_ulang_tanggal)}</td></tr>` : ''}
    ${r.note ? `<tr><td>Catatan Petugas</td><td>${r.note}</td></tr>` : ''}
  </tbody>
</table>
${r.reschedule_status ? `<table>
  <thead><tr><th colspan="2">Reschedule</th></tr></thead>
  <tbody>
    <tr><td>Status Reschedule</td><td>${r.reschedule_status}</td></tr>
    <tr><td>Jadwal Baru</td><td>${formatTglFull(r.reschedule_tanggal)} · ${r.reschedule_jam || '—'}</td></tr>
    <tr><td>Alasan</td><td>${r.reschedule_alasan || '—'}</td></tr>
  </tbody>
</table>` : ''}
<div class="footer">Dokumen ini dicetak dari Sistem Admin BAP Online — Kantor Imigrasi Kelas I TPI Tanjungpinang</div>
</body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 500);
}

// ── Lightbox ─────────────────────────────────────────────────────
function openLightbox(url, label) {
  $('lightbox-img').src = url;
  $('lightbox-img').alt = label;
  $('lightbox').classList.add('show');
  document.body.style.overflow = 'hidden';
}
function closeLightbox() {
  $('lightbox').classList.remove('show');
  document.body.style.overflow = '';
}

// ── Rekap Page ───────────────────────────────────────────────────
function renderRecap() {
  const total = allData.length || 1;

  const statusData = [
    { label: 'Menunggu', count: allData.filter(r => r.status === 'Menunggu').length, color: '#fcd34d' },
    { label: 'Dikonfirmasi', count: allData.filter(r => r.status === 'Dikonfirmasi').length, color: '#93c5fd' },
    { label: 'Selesai', count: allData.filter(r => r.status === 'Selesai').length, color: '#86efac' },
    { label: 'Pending RS', count: allData.filter(r => r.reschedule_status === 'Pending').length, color: '#fdba74' },
  ];

  $('statusBars').innerHTML = statusData.map(s => `
    <div class="recap-row">
      <span class="recap-key"><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${s.color};margin-right:7px;"></span>${s.label}</span>
      <span class="recap-val">${s.count}</span>
    </div>
    <div class="recap-bar">
      <div class="recap-bar-fill" style="width:${Math.round(s.count / total * 100)}%;background:${s.color}"></div>
    </div>`).join('');

  const jenisMap = {};
  allData.forEach(r => { const j = r.jenis_permohonan || 'Lainnya'; jenisMap[j] = (jenisMap[j] || 0) + 1; });
  const jColors = ['#38bdf8', '#60a5fa', '#86efac', '#f472b6', '#a78bfa', '#fbbf24'];
  $('jenisBars').innerHTML = Object.entries(jenisMap)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v], i) => `
      <div class="recap-row">
        <span class="recap-key" style="font-size:11.5px"><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${jColors[i % jColors.length]};margin-right:7px;"></span>${k.replace('BAP ', '')}</span>
        <span class="recap-val">${v}</span>
      </div>
      <div class="recap-bar">
        <div class="recap-bar-fill" style="width:${Math.round(v / total * 100)}%;background:${jColors[i % jColors.length]}"></div>
      </div>`).join('');

  const sesiMap = {};
  allData.forEach(r => { const s = r.jam || '—'; sesiMap[s] = (sesiMap[s] || 0) + 1; });

  $('sesiTable').innerHTML = `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">
    <thead><tr style="background:rgba(14,165,233,0.04)">
      <th style="padding:10px 14px;font-size:8.5px;font-weight:800;color:var(--text3);text-align:left;letter-spacing:.12em;text-transform:uppercase;border-bottom:1px solid var(--border)">Sesi</th>
      <th style="padding:10px 14px;font-size:8.5px;font-weight:800;color:var(--text3);text-align:left;letter-spacing:.12em;text-transform:uppercase;border-bottom:1px solid var(--border)">Jumlah</th>
      <th style="padding:10px 14px;font-size:8.5px;font-weight:800;color:var(--text3);text-align:left;letter-spacing:.12em;text-transform:uppercase;border-bottom:1px solid var(--border)">Persentase</th>
    </tr></thead>
    <tbody>
      ${Object.entries(sesiMap).sort().map(([k, v]) => `
        <tr>
          <td style="padding:10px 14px;font-size:12.5px;font-weight:600">${k}</td>
          <td style="padding:10px 14px;font-size:12.5px;color:var(--sky-400);font-weight:700">${v} orang</td>
          <td style="padding:10px 14px;font-size:12.5px;color:var(--text2)">${Math.round(v / allData.length * 100)}%</td>
        </tr>`).join('')}
      <tr style="border-top:2px solid var(--border2);background:rgba(14,165,233,0.04)">
        <td style="padding:10px 14px;font-size:13px;font-weight:800;font-family:'Cinzel',serif;color:var(--sky-400)">TOTAL</td>
        <td style="padding:10px 14px;font-size:13px;font-weight:900;color:var(--sky-400)">${allData.length} orang</td>
        <td style="padding:10px 14px;font-size:13px;font-weight:700">100%</td>
      </tr>
    </tbody>
  </table></div>`;
}

// ── Export Excel ─────────────────────────────────────────────────
function exportExcel() {
  if (!window.XLSX) { showToast('error', 'Library XLSX tidak tersedia'); return; }
  const filtered = getFiltered();
  if (!filtered.length) { showToast('error', 'Tidak ada data untuk diekspor'); return; }

  let filterLabel = '';
  if (activeMonth !== 'all') filterLabel += MONTH_SHORT[parseInt(activeMonth) - 1];
  if (activeYear) filterLabel += (filterLabel ? '_' : '') + activeYear;
  if (!filterLabel) filterLabel = 'Semua';

  const wb = XLSX.utils.book_new();
  const rows = filtered.map((r, i) => ({
    'No': i + 1, 'No. Registrasi': r.reg || '', 'Nama': r.nama || '',
    'TTL': r.ttl || '', 'JK': r.jk || '', 'No. HP': r.hp || '',
    'Jenis BAP': r.jenis_permohonan || '', 'Jenis Paspor': r.jenis_paspor || '',
    'Tujuan': r.tujuan || '', 'Tanggal': r.tanggal || '', 'Sesi': r.jam || '',
    'Status': r.status || '', 'RS Status': r.reschedule_status || '',
    'RS Tanggal': r.reschedule_tanggal || '', 'RS Jam': r.reschedule_jam || '',
    'RS Alasan': r.reschedule_alasan || '', 'Catatan': r.note || '',
    'Waktu Daftar': r.waktu_daftar || '',
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 4 }, { wch: 15 }, { wch: 28 }, { wch: 20 }, { wch: 5 }, { wch: 16 },
    { wch: 18 }, { wch: 16 }, { wch: 28 }, { wch: 13 }, { wch: 12 }, { wch: 14 },
    { wch: 12 }, { wch: 13 }, { wch: 12 }, { wch: 32 }, { wch: 28 }, { wch: 20 }
  ];
  XLSX.utils.book_append_sheet(wb, ws, ('Data ' + filterLabel).slice(0, 31));

  const ws2 = XLSX.utils.json_to_sheet([
    { Status: 'Menunggu', Jumlah: filtered.filter(r => r.status === 'Menunggu').length },
    { Status: 'Dikonfirmasi', Jumlah: filtered.filter(r => r.status === 'Dikonfirmasi').length },
    { Status: 'Selesai', Jumlah: filtered.filter(r => r.status === 'Selesai').length },
    { Status: 'TOTAL', Jumlah: filtered.length },
  ]);
  XLSX.utils.book_append_sheet(wb, ws2, 'Rekap Status');

  const now = new Date();
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const fileName = `Rekap_BAP_${filterLabel}_${datePart}.xlsx`;
  XLSX.writeFile(wb, fileName);
  showToast('success', `✓ Export "${fileName}" berhasil`);
}

// ── Navigation ───────────────────────────────────────────────────
const PAGE_META = {
  dashboard: ['Dashboard', 'Ringkasan & Data Terbaru'],
  pendaftar: ['Data Pendaftar BAP', 'Seluruh pendaftar BAP Online'],
  reschedule: ['Manajemen Reschedule', 'Pengajuan perubahan jadwal pemohon'],
  rekap: ['Rekap & Laporan', 'Statistik pendaftaran BAP'],
};

function navTo(page, el) {
  $$('.nav-item').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');
  $$('.page-view').forEach(p => p.classList.remove('active'));
  $('page-' + page).classList.add('active');

  const [t, s] = PAGE_META[page] || [page, ''];
  $('topbarTitle').textContent = t;
  $('topbarSub').textContent = s;

  closeSidebar();
}

function toggleSidebar() {
  const sidebar = $('sidebar');
  const overlay = $('sidebarOverlay');
  const btn = $('menuToggleBtn');
  const isOpen = sidebar.classList.contains('open');
  sidebar.classList.toggle('open');
  overlay.classList.toggle('show');
  if (btn) btn.setAttribute('aria-expanded', String(!isOpen));
}
function closeSidebar() {
  $('sidebar').classList.remove('open');
  $('sidebarOverlay').classList.remove('show');
  const btn = $('menuToggleBtn');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

// ── Toast ────────────────────────────────────────────────────────
let toastTimer;
function showToast(type, msg) {
  clearTimeout(toastTimer);
  const t = $('toast');
  t.textContent = msg;
  t.className = type;
  t.classList.add('show');
  toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
}

// ── Event Listeners ──────────────────────────────────────────────
$('modalOverlay').addEventListener('click', e => {
  if (e.target === $('modalOverlay')) closeModal();
});
$('deleteOverlay').addEventListener('click', e => {
  if (e.target === $('deleteOverlay')) closeDeleteModal();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(); closeLightbox(); closeDeleteModal(); resolveConfirm(false); }
  // Ctrl+F → focus search
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    const searchEl = $('searchInput');
    if (searchEl && document.querySelector('#page-pendaftar.active')) {
      e.preventDefault();
      searchEl.focus();
      searchEl.select();
    }
  }
});

// ── Init ─────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initOnlineStatus();
  spawnParticles();

  const session = getSession();
  setTimeout(() => {
    const splash = $('splashScreen');
    splash.classList.add('hide');
    setTimeout(() => splash.style.display = 'none', 450);

    if (session) bootDashboard(session.displayName);
    else $('loginPage').classList.add('visible');
  }, 1300);
});
