/* ================================================================
   ADMIN BAP ONLINE - INTELDAKIM TANJUNGPINANG
   Enterprise Admin Application - main.js v4.0
   Kantor Imigrasi Kelas I TPI Tanjungpinang
   ================================================================ */

'use strict';

// ── Constants & Configuration ────────────────────────────────────
const SHEET_URL = 'https://script.google.com/macros/s/AKfycbwG-V9Jvm5GlsjLYnCGrciLx8tAp2NfpKUsnoAmNnILHxO-3tJbf_D90pzrjMMx8Ogg/exec';
const SESSION_KEY = 'baper_session_v4';
const STATUS_KEY = 'baper_status_v4';
const THEME_KEY = 'baper_theme_v4';
const AUDIT_KEY = 'baper_audit_v4';
const SOUND_KEY = 'baper_sound_v4';

const SESSION_HOURS = 8;
const MAX_ATTEMPTS = 5;
const LOCKOUT_SECS = 60;
const REFRESH_SECS = 30;
const PAGE_SIZE = 12;

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const MONTH_FULL = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const DAYS_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

// ── Application State ────────────────────────────────────────────
let allData = [];
let localStatus = {};
let auditLogs = [];
let selectedRowKeys = new Set();
let docRotations = {};

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

let isSoundEnabled = true;
let cpSelectedIndex = 0;
let cpCurrentResults = [];
let currentLightboxRotation = 0;

// ── Core Helpers ─────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

function escKey(k) { 
  return (k || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'"); 
}

function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Audio Feedback (Procedural Web Audio API) ────────────────────
function playTone(freq = 587.33, type = 'sine', duration = 0.12) {
  if (!isSoundEnabled) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0.04, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch {
    // Ignore audio context autoplay restrictions
  }
}

function playSuccessChime() {
  playTone(523.25, 'sine', 0.08);
  setTimeout(() => playTone(659.25, 'sine', 0.12), 70);
}

function playAlertChime() {
  playTone(392.00, 'triangle', 0.1);
  setTimeout(() => playTone(329.63, 'triangle', 0.14), 80);
}

function initSound() {
  const saved = localStorage.getItem(SOUND_KEY);
  isSoundEnabled = saved !== 'false';
  updateSoundIcon();
}

function toggleSound() {
  isSoundEnabled = !isSoundEnabled;
  localStorage.setItem(SOUND_KEY, String(isSoundEnabled));
  updateSoundIcon();
  if (isSoundEnabled) playSuccessChime();
  showToast('info', isSoundEnabled ? 'Efek audio diaktifkan' : 'Efek audio dimatikan');
}

function updateSoundIcon() {
  const el = $('soundIcon');
  if (el) el.textContent = isSoundEnabled ? 'Audio: On' : 'Audio: Off';
}

// ── Audit Log System ─────────────────────────────────────────────
function loadAuditLogs() {
  try {
    auditLogs = JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]');
  } catch {
    auditLogs = [];
  }
}

function logActivity(action, details) {
  const session = getSession();
  const officer = session ? session.displayName : 'Petugas';
  const entry = {
    id: Date.now(),
    officer,
    action,
    details,
    time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    date: new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
  };
  auditLogs.unshift(entry);
  if (auditLogs.length > 80) auditLogs.pop();
  try {
    localStorage.setItem(AUDIT_KEY, JSON.stringify(auditLogs));
  } catch {
    // Storage quota fallback
  }
}

function openAuditModal() {
  renderAuditLogs();
  $('auditLogModal').classList.add('show');
  document.body.style.overflow = 'hidden';
}

function closeAuditModal() {
  $('auditLogModal').classList.remove('show');
  document.body.style.overflow = '';
}

function clearAuditLog() {
  auditLogs = [];
  localStorage.removeItem(AUDIT_KEY);
  renderAuditLogs();
  showToast('info', 'Riwayat aktivitas telah dibersihkan');
}

function renderAuditLogs() {
  const container = $('auditLogList');
  if (!container) return;
  if (!auditLogs.length) {
    container.innerHTML = '<div class="audit-empty">Belum ada catatan aktivitas pada sesi ini.</div>';
    return;
  }
  container.innerHTML = auditLogs.map(item => `
    <div class="audit-item">
      <div class="audit-item-top">
        <span class="audit-action-name">${escHtml(item.action)}</span>
        <span class="audit-time">${escHtml(item.date)} ${escHtml(item.time)}</span>
      </div>
      <div class="audit-desc">${escHtml(item.details)} <span style="opacity:0.65;font-size:10px;">(${escHtml(item.officer)})</span></div>
    </div>
  `).join('');
}

// ── Theme Protocol (Dual Mode) ───────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light') applyTheme('light');
  else applyTheme('dark');
}

function applyTheme(mode) {
  const icon = $('themeIcon');
  if (mode === 'light') {
    document.body.classList.add('light-mode');
    if (icon) icon.textContent = 'Mode: Terang';
    localStorage.setItem(THEME_KEY, 'light');
  } else {
    document.body.classList.remove('light-mode');
    if (icon) icon.textContent = 'Mode: Gelap';
    localStorage.setItem(THEME_KEY, 'dark');
  }
}

function toggleTheme() {
  const isLight = document.body.classList.contains('light-mode');
  applyTheme(isLight ? 'dark' : 'light');
  logActivity('Pengaturan Tema', `Mengubah tema menjadi ${isLight ? 'Gelap' : 'Terang'}`);
}

// ── Online / Connectivity Status ─────────────────────────────────
function initOnlineStatus() {
  function update() {
    const el = $('onlineIndicator');
    if (!el) return;
    if (navigator.onLine) {
      el.className = 'online-status-chip online';
      el.innerHTML = '<span class="osc-dot"></span><span class="osc-text">Online</span>';
    } else {
      el.className = 'online-status-chip offline';
      el.innerHTML = '<span class="osc-dot"></span><span class="osc-text">Offline</span>';
    }
  }
  window.addEventListener('online', () => { update(); showToast('success', 'Koneksi kembali online'); });
  window.addEventListener('offline', () => { update(); showToast('error', 'Koneksi terputus (Offline)'); });
  update();
}

// ── Custom System Confirm Dialog ─────────────────────────────────
function showConfirm({ title = 'Konfirmasi', msg = 'Apakah Anda yakin?', icon = 'PERIKSA',
  okText = 'Ya, Lanjutkan', cancelText = 'Batal' }) {
  return new Promise(resolve => {
    confirmResolve = resolve;
    $('confirmIcon').textContent = icon;
    $('confirmTitle').textContent = title;
    $('confirmMsg').textContent = msg;
    $('confirmOkBtn').textContent = okText;
    $('confirmCancelBtn').textContent = cancelText;
    $('confirmOverlay').classList.add('show');
    document.body.style.overflow = 'hidden';
  });
}

function resolveConfirm(val) {
  $('confirmOverlay').classList.remove('show');
  document.body.style.overflow = '';
  if (confirmResolve) {
    confirmResolve(val);
    confirmResolve = null;
  }
}

// ── Session Management ───────────────────────────────────────────
function saveSession(displayName, username) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ displayName, username, loginTime: Date.now() }));
}

function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (Date.now() - s.loginTime > SESSION_HOURS * 3600000) {
      clearSession();
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function getSessionAge(s) {
  if (!s) return 'Sesi Aktif';
  const m = Math.floor((Date.now() - s.loginTime) / 60000);
  return m < 60 ? `Aktif ${m} mnt` : `Aktif ${Math.floor(m / 60)} jam`;
}

// ── Authentication (Login & Logout) ──────────────────────────────
function togglePw() {
  const inp = $('loginPass');
  const btn = $('pwToggle');
  if (inp.type === 'password') {
    inp.type = 'text';
    btn.textContent = 'Sembunyikan';
  } else {
    inp.type = 'password';
    btn.textContent = 'Lihat';
  }
}

async function doLogin() {
  const u = $('loginUser').value.trim();
  const p = $('loginPass').value.trim();
  const err = $('loginErr');
  const btn = $('loginBtn');

  if (!u || !p) {
    showLoginErr('Username dan kata sandi tidak boleh kosong.');
    playAlertChime();
    return;
  }
  if (tokenAttempts <= 0) return;

  btn.disabled = true;
  btn.innerHTML = '<span>Memverifikasi Kredensial...</span>';
  err.classList.remove('show');

  try {
    const res = await fetch(SHEET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'adminLogin', username: u, password: p })
    });
    const json = await res.json();

    if (json.ok) {
      const displayName = json.displayName || u;
      saveSession(displayName, u);
      logActivity('Autentikasi Berhasil', `Petugas ${displayName} berhasil login ke portal.`);
      playSuccessChime();
      bootDashboard(displayName);
    } else {
      tokenAttempts = Math.max(0, tokenAttempts - 1);
      updateAttemptDots();
      playAlertChime();
      showLoginErr(json.error || 'Username atau kata sandi tidak cocok.');
      if (tokenAttempts <= 0) {
        startLockout();
        return;
      }
    }
  } catch {
    playAlertChime();
    showLoginErr('Gagal terhubung ke server. Periksa jaringan internet.');
  }

  btn.disabled = false;
  btn.innerHTML = '<span>Masuk Portal Petugas</span>';
}

function showLoginErr(msg) {
  const err = $('loginErr');
  err.textContent = msg;
  err.classList.remove('show');
  void err.offsetWidth;
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
  btn.innerHTML = '<span>Akses Terkunci Sementara</span>';
  uI.disabled = true;
  pI.disabled = true;
  bar.classList.add('show');
  fill.style.width = '100%';

  let remaining = LOCKOUT_SECS;
  txt.textContent = `Akses terkunci. Silakan tunggu ${remaining} detik...`;

  lockoutTimer = setInterval(() => {
    remaining--;
    fill.style.width = (remaining / LOCKOUT_SECS * 100) + '%';
    txt.textContent = `Akses terkunci. Silakan tunggu ${remaining} detik...`;

    if (remaining <= 0) {
      clearInterval(lockoutTimer);
      tokenAttempts = MAX_ATTEMPTS;
      btn.disabled = false;
      btn.innerHTML = '<span>Masuk Portal Petugas</span>';
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
    title: 'Keluar Portal Petugas',
    msg: 'Apakah Anda yakin ingin mengakhiri sesi kerja saat ini?',
    icon: 'LOGOUT',
    okText: 'Ya, Keluar'
  });
  if (!ok) return;

  logActivity('Sesi Berakhir', 'Petugas keluar dari sistem.');
  clearSession();
  clearInterval(autoRefInt);

  $('adminShell').style.display = 'none';
  $('loginPage').classList.add('visible');
  $('loginUser').value = '';
  $('loginPass').value = '';

  tokenAttempts = MAX_ATTEMPTS;
  updateAttemptDots();
  $('loginErr').classList.remove('show');
  showToast('info', 'Sesi kerja telah diakhiri.');
}

function bootDashboard(displayName) {
  const session = getSession();
  $('officerName').textContent = displayName;
  const initialEl = $('officerInitial');
  if (initialEl) initialEl.textContent = (displayName || 'P').charAt(0).toUpperCase();
  if (session) $('sessionExpiry').textContent = getSessionAge(session);

  $('loginPage').classList.remove('visible');
  $('adminShell').style.display = 'block';

  loadLocalStatus();
  loadAuditLogs();
  loadData();
  startClock();
  startAutoRefresh();
}

// ── Live Clock & Auto-Refresh System ─────────────────────────────
function startClock() {
  function tick() {
    const now = new Date();
    const cl = $('liveClock');
    const de = $('liveDate');
    if (cl) cl.textContent = now.toLocaleTimeString('id-ID', { hour12: false }) + ' WIB';
    if (de) de.textContent = `${DAYS_ID[now.getDay()]}, ${now.getDate()} ${MONTH_SHORT[now.getMonth()]} ${now.getFullYear()}`;
    const session = getSession();
    const exp = $('sessionExpiry');
    if (exp && session && now.getSeconds() === 0) {
      exp.textContent = getSessionAge(session);
    }
  }
  tick();
  setInterval(tick, 1000);
}

function startAutoRefresh() {
  arCountdown = REFRESH_SECS;
  clearInterval(autoRefInt);

  autoRefInt = setInterval(() => {
    const anyModalOpen =
      $('modalOverlay').classList.contains('show') ||
      $('deleteOverlay').classList.contains('show') ||
      $('lightbox').classList.contains('show') ||
      $('confirmOverlay').classList.contains('show') ||
      $('commandPaletteModal').classList.contains('show') ||
      $('auditLogModal').classList.contains('show');

    if (anyModalOpen) return;

    arCountdown--;
    const el = $('arTimer');
    const bar = $('arProgressBar');
    if (el) el.textContent = arCountdown + 's';
    if (bar) bar.style.width = (arCountdown / REFRESH_SECS * 100) + '%';

    if (arCountdown <= 0) {
      loadData(false);
      arCountdown = REFRESH_SECS;
    }
  }, 1000);
}

// ── Local Status Cache ───────────────────────────────────────────
function loadLocalStatus() {
  try {
    localStatus = JSON.parse(localStorage.getItem(STATUS_KEY) || '{}');
  } catch {
    localStatus = {};
  }
}

function saveLocalStatus() {
  localStorage.setItem(STATUS_KEY, JSON.stringify(localStatus));
}

function getRowKey(r) {
  return (r.nama || '') + '_' + (r.tanggal || '') + '_' + (r.jam || '') + '_' + (r.hp || '');
}

// ── Data Loading & Synchronization ───────────────────────────────
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

    // Sort newest row first
    allData.sort((a, b) => (parseInt(b._rowIndex) || 0) - (parseInt(a._rowIndex) || 0));

    const lu = $('lastUpdate');
    if (lu) lu.textContent = 'Sinkron: ' + new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

    if (manual) {
      playSuccessChime();
      showToast('success', 'Data berhasil disinkronisasi dari lembar kerja');
      logActivity('Sinkronisasi Data', `Memuat ${allData.length} data pendaftar.`);
    }

    startAutoRefresh();
    buildMonthYearOptions();

  } catch (e) {
    console.error('loadData error:', e);
    if (manual) {
      playAlertChime();
      showToast('error', 'Gagal menyinkronkan data dengan server.');
    }
  }

  if (btn) btn.classList.remove('spinning');
  renderAll();
}

// ── Month & Year Filtering Options ───────────────────────────────
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
  if (!yearSel) return;
  const years = getYearsFromData();
  const prevYear = yearSel.value;

  yearSel.innerHTML =
    '<option value="">Semua Tahun</option>' +
    years.map(y => `<option value="${y}">${y}</option>`).join('');

  if (prevYear && years.includes(prevYear)) {
    yearSel.value = prevYear;
  } else {
    yearSel.value = '';
    activeYear = '';
  }

  activeYear = yearSel.value;
  renderMonthChips();
}

function renderMonthChips() {
  const container = $('monthChips');
  if (!container) return;
  const months = getMonthsWithData(activeYear);

  let html = `<button class="month-chip ${activeMonth === 'all' ? 'active' : ''}" onclick="setMonthFilter('all')">Semua Bulan</button>`;
  html += months.map(m => {
    const label = MONTH_SHORT[parseInt(m) - 1];
    return `<button class="month-chip ${activeMonth === m ? 'active' : ''}" onclick="setMonthFilter('${m}')">${label}</button>`;
  }).join('');

  container.innerHTML = html;

  const badge = $('filterActiveBadge');
  const clearBtn = $('filterClearBtn');
  const isActive = activeMonth !== 'all' || activeYear !== '';

  if (isActive) {
    if (badge) badge.style.display = 'inline-flex';
    if (clearBtn) clearBtn.style.display = 'inline-flex';
    let txt = '';
    if (activeMonth !== 'all') txt += MONTH_SHORT[parseInt(activeMonth) - 1];
    if (activeYear) txt += (txt ? ' ' : '') + activeYear;
    const bt = $('filterBadgeText');
    if (bt) bt.textContent = txt;
  } else {
    if (badge) badge.style.display = 'none';
    if (clearBtn) clearBtn.style.display = 'none';
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
  const ySel = $('filterYear');
  if (ySel) ySel.value = '';
  renderMonthChips();
  resetPageAndRender();
}

function resetPageAndRender() {
  currentPage = 1;
  activeYear = $('filterYear')?.value || '';
  if (activeMonth !== 'all') {
    const available = getMonthsWithData(activeYear);
    if (!available.includes(activeMonth)) activeMonth = 'all';
  }
  renderMonthChips();
  renderTable();
}

// ── Filtered Data Calculation ────────────────────────────────────
function getFiltered() {
  const q = ($('searchInput')?.value || '').toLowerCase().trim();
  const fs = $('filterStatus')?.value || '';
  const fj = $('filterJenis')?.value || '';

  return allData.filter(r => {
    const tgl = r.tanggal || '';
    if (activeYear && !tgl.startsWith(activeYear)) return false;
    if (activeMonth !== 'all' && tgl.slice(5, 7) !== activeMonth) return false;
    const mQ = !q || 
      (r.nama || '').toLowerCase().includes(q) ||
      (r.reg || '').toLowerCase().includes(q) ||
      (r.hp || '').includes(q) ||
      (r.nik || '').includes(q);
    const mS = !fs || r.status === fs;
    const mJ = !fj || r.jenis_permohonan === fj;
    return mQ && mS && mJ;
  });
}

// ── Global Render Coordinator ────────────────────────────────────
function renderAll() {
  renderStats();
  renderTodayAgenda();
  renderDashTable();
  renderTable();
  renderRsTable();
  renderRecap();

  // Navigation Badges
  const waiting = allData.filter(r => r.status === 'Menunggu').length;
  const rsPending = allData.filter(r => r.reschedule_status === 'Pending').length;

  const nb = $('navBadge');
  if (nb) nb.textContent = waiting;

  const rsBadge = $('navRsBadge');
  if (rsBadge) {
    rsBadge.textContent = rsPending;
    rsBadge.style.display = rsPending > 0 ? 'inline-flex' : 'none';
  }
}

// ── Metric Tiles ─────────────────────────────────────────────────
function renderStats() {
  const total = allData.length || 0;
  const wait = allData.filter(r => r.status === 'Menunggu').length;
  const conf = allData.filter(r => r.status === 'Dikonfirmasi').length;
  const done = allData.filter(r => r.status === 'Selesai').length;
  const rs = allData.filter(r => r.reschedule_status === 'Pending').length;

  animateNum('sc-total', total);
  animateNum('sc-wait', wait);
  animateNum('sc-conf', conf);
  animateNum('sc-done', done);
  animateNum('sc-rs', rs);

  if ($('tileWaitRatio')) $('tileWaitRatio').textContent = total ? Math.round(wait / total * 100) + '%' : '0%';
  if ($('tileConfRatio')) $('tileConfRatio').textContent = total ? Math.round(conf / total * 100) + '%' : '0%';
  if ($('tileDoneRatio')) $('tileDoneRatio').textContent = total ? Math.round(done / total * 100) + '%' : '0%';
}

function animateNum(id, target) {
  const el = $(id);
  if (!el) return;
  let cur = parseInt(el.textContent) || 0;
  const diff = Math.abs(target - cur);
  if (diff === 0) { el.textContent = target; return; }
  const step = Math.ceil(diff / 16) || 1;
  const iv = setInterval(() => {
    cur = cur < target ? Math.min(cur + step, target) : Math.max(cur - step, target);
    el.textContent = cur;
    if (cur === target) clearInterval(iv);
  }, 24);
}

function filterFromTile(status) {
  navTo('pendaftar', document.querySelector('[data-page=pendaftar]'));
  const fs = $('filterStatus');
  if (fs) {
    fs.value = status === 'all' ? '' : status;
    resetPageAndRender();
  }
}

// ── Today's Agenda (Live Queue) ──────────────────────────────────
function renderTodayAgenda() {
  const container = $('todayQueueList');
  const sub = $('todayAgendaSubtitle');
  const stripCount = $('stripTodayCount');
  if (!container) return;

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayItems = allData.filter(r => r.tanggal === todayStr);

  if (stripCount) stripCount.textContent = todayItems.length;

  if (!todayItems.length) {
    if (sub) sub.textContent = 'Tidak ada pemohon terjadwal hari ini';
    container.innerHTML = `
      <div class="agenda-empty-state">
        <p>Tidak ada jadwal pemeriksaan BAP untuk hari ini (${formatTgl(todayStr)}).</p>
      </div>`;
    return;
  }

  if (sub) sub.textContent = `${todayItems.length} pemohon terjadwal untuk hari ini`;

  container.innerHTML = todayItems.map(r => `
    <div class="agenda-item-card" onclick="openModal('${escKey(r._key)}')">
      <div class="agenda-item-top">
        <span class="agenda-sesi-pill">${escHtml(r.jam) || 'Sesi Terjadwal'}</span>
        ${badgeHtml(r.status, r.reschedule_status)}
      </div>
      <div class="agenda-item-name">${escHtml(r.nama)}</div>
      <div class="agenda-item-type">${escHtml(r.jenis_permohonan)}</div>
    </div>
  `).join('');
}

// ── Date Formatting Helpers (Zero Em-Dash) ───────────────────────
function formatTgl(tgl) {
  if (!tgl) return 'Belum ada';
  const s = String(tgl).slice(0, 10);
  if (!s.match(/^\d{4}-\d{2}-\d{2}$/)) return s;
  const [y, m, d] = s.split('-');
  return `${parseInt(d)} ${MONTH_SHORT[parseInt(m) - 1]} ${y}`;
}

function formatTglFull(tgl) {
  if (!tgl) return 'Belum ditentukan';
  const s = String(tgl).slice(0, 10);
  if (!s.match(/^\d{4}-\d{2}-\d{2}$/)) return s;
  try {
    return new Date(s + 'T12:00:00').toLocaleDateString('id-ID', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
  } catch {
    return s;
  }
}

// ── Status Badges HTML ───────────────────────────────────────────
function badgeHtml(status, rsStatus) {
  if (rsStatus === 'Pending') {
    return `<span class="status-pill rs"><span class="status-pill-dot"></span>Pending RS</span>`;
  }
  if (status === 'Menunggu') {
    return `<span class="status-pill wait"><span class="status-pill-dot"></span>Menunggu</span>`;
  }
  if (status === 'Dikonfirmasi') {
    return `<span class="status-pill conf"><span class="status-pill-dot"></span>Dikonfirmasi</span>`;
  }
  if (status === 'Selesai') {
    return `<span class="status-pill done"><span class="status-pill-dot"></span>Selesai</span>`;
  }
  return `<span class="status-pill wait"><span class="status-pill-dot"></span>${escHtml(status) || 'Menunggu'}</span>`;
}

function rsBadgeHtml(s) {
  if (s === 'Pending') {
    return `<span class="status-pill rs"><span class="status-pill-dot"></span>Pending</span>`;
  }
  if (s === 'Disetujui') {
    return `<span class="status-pill done"><span class="status-pill-dot"></span>Disetujui</span>`;
  }
  if (s === 'Ditolak') {
    return `<span class="status-pill reject"><span class="status-pill-dot"></span>Ditolak</span>`;
  }
  return `<span class="status-pill wait">${escHtml(s) || 'Belum ada'}</span>`;
}

// ── Highlight Search Query ───────────────────────────────────────
function highlight(text, query) {
  if (!query) return escHtml(text);
  const esc = escHtml(text);
  const escQ = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return esc.replace(new RegExp(`(${escQ})`, 'gi'), '<mark style="background:rgba(2,132,199,0.3);color:#ffffff;border-radius:2px;padding:0 2px;">$1</mark>');
}

// ── Dashboard Recent Table ───────────────────────────────────────
function setDashFilter(filter, el) {
  dashFilter = filter;
  $$('#dashQuickFilter .filter-chip').forEach(b => {
    b.classList.remove('active');
  });
  if (el) el.classList.add('active');
  renderDashTable();
}

function renderDashTable() {
  let data = allData.slice(0, 20);
  if (dashFilter !== 'all') {
    data = allData.filter(r => r.status === dashFilter).slice(0, 20);
  }
  const shown = data.slice(0, 10);

  const sub = $('dashTableSub');
  if (sub) sub.textContent = `${shown.length} data pendaftar terbaru ditampilkan`;

  const tbody = $('dashBody');
  if (!tbody) return;

  if (!shown.length) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="table-empty-state"><div class="empty-state-title">Belum ada data pendaftar</div></div></td></tr>';
    return;
  }

  tbody.innerHTML = shown.map(r => `
    <tr onclick="openModal('${escKey(r._key)}')">
      <td><span class="t-reg-code">${escHtml(r.reg) || 'Belum ada'}</span></td>
      <td>
        <div class="t-name-cell">${escHtml(r.nama) || 'Pemohon'}</div>
        <div class="t-sub-info">${escHtml(r.jk) || ''}</div>
      </td>
      <td>${escHtml(r.jenis_permohonan) || 'BAP Paspor'}</td>
      <td>
        <div>${formatTgl(r.tanggal)}</div>
        <div class="t-sub-info">${escHtml(r.jam) || ''}</div>
      </td>
      <td>${badgeHtml(r.status, r.reschedule_status)}</td>
      <td style="text-align: right;">
        <div class="table-btn-group">
          <button class="tbl-action-btn" onclick="event.stopPropagation();openModal('${escKey(r._key)}')">Detail</button>
          ${r.hp ? `<button class="tbl-action-btn wa" onclick="event.stopPropagation();openWA('${escKey(r.hp)}')" title="Hubungi via WhatsApp">WA</button>` : ''}
        </div>
      </td>
    </tr>
  `).join('');
}

// ── Main Pendaftar Database Table ────────────────────────────────
function renderTable() {
  const q = ($('searchInput')?.value || '').trim();
  const filtered = getFiltered();
  const total = filtered.length;
  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;

  if (currentPage > totalPages) currentPage = totalPages;

  const start = (currentPage - 1) * PAGE_SIZE;
  const page = filtered.slice(start, start + PAGE_SIZE);

  const sub = $('tblSubtitle');
  if (sub) sub.textContent = `${total} data pemohon ditemukan`;

  const pgInfo = $('pgInfo');
  if (pgInfo) pgInfo.textContent = `Menampilkan baris ${total ? start + 1 : 0} sampai ${Math.min(start + PAGE_SIZE, total)} dari total ${total} data`;

  const tbody = $('mainBody');
  if (!tbody) return;

  if (!page.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10">
          <div class="table-empty-state">
            <div class="empty-state-title">Tidak ada data yang cocok</div>
            <div class="empty-state-sub">Ubah kata kunci pencarian atau sesuaikan filter status dan bulan.</div>
          </div>
        </td>
      </tr>`;
  } else {
    tbody.innerHTML = page.map((r, i) => {
      const isChecked = selectedRowKeys.has(r._key);
      return `
        <tr class="${isChecked ? 'row-selected' : ''}" onclick="openModal('${escKey(r._key)}')">
          <td onclick="event.stopPropagation()">
            <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="toggleRowSelection('${escKey(r._key)}', this)">
          </td>
          <td style="color:var(--text-muted);font-size:11px">${start + i + 1}</td>
          <td><span class="t-reg-code">${escHtml(r.reg) || 'Belum ada'}</span></td>
          <td>
            <div class="t-name-cell">${highlight(r.nama, q) || 'Pemohon'}</div>
            <div class="t-sub-info">${escHtml(r.ttl) || ''}</div>
          </td>
          <td class="t-phone-cell">${escHtml(r.hp) || 'Belum ada'}</td>
          <td>${escHtml(r.jenis_permohonan) || 'BAP'}</td>
          <td>
            <div>${formatTgl(r.tanggal)}</div>
            <div class="t-sub-info">${escHtml(r.jam) || ''}</div>
          </td>
          <td>${badgeHtml(r.status, r.reschedule_status)}</td>
          <td style="font-size:11px;color:var(--text-muted)">${escHtml(r.waktu_daftar) || 'Belum ada'}</td>
          <td style="text-align: right;" onclick="event.stopPropagation()">
            <div class="table-btn-group">
              <button class="tbl-action-btn" title="Buka Detail" onclick="openModal('${escKey(r._key)}')">Buka</button>
              ${r.hp ? `<button class="tbl-action-btn wa" title="Hubungi via WhatsApp" onclick="openWA('${escKey(r.hp)}')">WA</button>` : ''}
              <button class="tbl-action-btn danger" title="Hapus Data" onclick="openDeleteFromTable('${escKey(r._key)}')">Hapus</button>
            </div>
          </td>
        </tr>`;
    }).join('');
  }

  renderPagination(totalPages);
  updateBulkActionBar();
}

function renderPagination(total) {
  const container = $('pgBtns');
  if (!container) return;

  let html = `<button class="pg-btn" onclick="changePage(${currentPage - 1})" ${currentPage <= 1 ? 'disabled' : ''} aria-label="Halaman Sebelumnya">&lt;</button>`;
  const s = Math.max(1, currentPage - 2);
  const e = Math.min(total, s + 4);
  for (let i = s; i <= e; i++) {
    html += `<button class="pg-btn ${i === currentPage ? 'active' : ''}" onclick="changePage(${i})">${i}</button>`;
  }
  html += `<button class="pg-btn" onclick="changePage(${currentPage + 1})" ${currentPage >= total ? 'disabled' : ''} aria-label="Halaman Berikutnya">&gt;</button>`;
  container.innerHTML = html;
}

function changePage(p) {
  currentPage = p;
  renderTable();
}

// ── Bulk Selection & Actions ─────────────────────────────────────
function toggleRowSelection(key, checkbox) {
  if (checkbox.checked) selectedRowKeys.add(key);
  else selectedRowKeys.delete(key);
  updateBulkActionBar();
}

function toggleSelectAllRows(checkbox) {
  const filtered = getFiltered();
  const start = (currentPage - 1) * PAGE_SIZE;
  const page = filtered.slice(start, start + PAGE_SIZE);

  page.forEach(r => {
    if (checkbox.checked) selectedRowKeys.add(r._key);
    else selectedRowKeys.delete(r._key);
  });
  renderTable();
}

function clearRowSelection() {
  selectedRowKeys.clear();
  const selectAll = $('selectAllRows');
  if (selectAll) selectAll.checked = false;
  renderTable();
}

function updateBulkActionBar() {
  const bar = $('bulkActionBar');
  const countEl = $('bulkSelectedCount');
  if (!bar || !countEl) return;

  const count = selectedRowKeys.size;
  countEl.textContent = count;
  bar.style.display = count > 0 ? 'flex' : 'none';
}

function bulkCopyPhones() {
  const phones = [];
  allData.forEach(r => {
    if (selectedRowKeys.has(r._key) && r.hp) {
      phones.push(r.hp.trim());
    }
  });
  if (!phones.length) {
    showToast('error', 'Tidak ada nomor telepon pada data yang dipilih');
    return;
  }
  navigator.clipboard.writeText(phones.join(', ')).then(() => {
    playSuccessChime();
    showToast('success', `${phones.length} nomor WhatsApp berhasil disalin`);
  });
}

// ── WhatsApp Direct Sender ───────────────────────────────────────
function openWA(hp) {
  if (!hp) return;
  const clean = String(hp).replace(/\D/g, '');
  const intl = clean.startsWith('0') ? '62' + clean.slice(1) : clean;
  window.open(`https://wa.me/${intl}`, '_blank');
}

// ── Reschedule Page Table & Actions ──────────────────────────────
function setRsFilter(val, el) {
  rsFilter = val;
  $$('.tab-pill-btn').forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');
  renderRsTable();
}

function getRsData() {
  return allData.filter(r => {
    if (!r.reschedule_status) return false;
    if (rsFilter === 'all') return true;
    return r.reschedule_status === rsFilter;
  });
}

function renderRsTable() {
  const data = getRsData();
  const sub = $('rsSubtitle');
  if (sub) sub.textContent = `${data.length} pengajuan reschedule ditemukan`;

  const tbody = $('rsBody');
  if (!tbody) return;

  if (!data.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8">
          <div class="table-empty-state">
            <div class="empty-state-title">Tidak ada permohonan reschedule</div>
            <div class="empty-state-sub">Belum ada pengajuan perubahan jadwal dengan status terpilih.</div>
          </div>
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = data.map(r => `
    <tr onclick="openModal('${escKey(r._key)}')">
      <td><span class="t-reg-code">${escHtml(r.reg) || 'Belum ada'}</span></td>
      <td><div class="t-name-cell">${escHtml(r.nama) || 'Pemohon'}</div></td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:11px">${escHtml(r.nik) || 'Belum ada'}</td>
      <td>
        <div class="rs-jadwal-stack">
          <span class="rs-date-text">${formatTgl(r.tanggal)}</span>
          <span class="rs-time-text">${escHtml(r.jam) || ''}</span>
        </div>
      </td>
      <td>
        <div class="rs-jadwal-stack">
          <span class="rs-date-text rs-new-target">${formatTgl(r.reschedule_tanggal)}</span>
          <span class="rs-time-text rs-new-target">${escHtml(r.reschedule_jam) || ''}</span>
        </div>
      </td>
      <td>
        <div style="max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${escHtml(r.reschedule_alasan)}">
          ${escHtml(r.reschedule_alasan) || 'Tidak ada alasan'}
        </div>
      </td>
      <td>${rsBadgeHtml(r.reschedule_status)}</td>
      <td style="text-align: right;" onclick="event.stopPropagation()">
        ${r.reschedule_status === 'Pending' ? `
          <div class="table-btn-group">
            <button class="tbl-action-btn approve" onclick="approveReschedule('${escKey(r._key)}')">Setujui</button>
            <button class="tbl-action-btn reject" onclick="rejectReschedule('${escKey(r._key)}')">Tolak</button>
          </div>
        ` : `
          <button class="tbl-action-btn" onclick="openModal('${escKey(r._key)}')">Detail</button>
        `}
      </td>
    </tr>
  `).join('');
}

async function approveReschedule(key) {
  const row = allData.find(r => r._key === key);
  if (!row || !row._rowIndex) return;

  const ok = await showConfirm({
    title: 'Persetujuan Reschedule',
    msg: `Setujui perubahan jadwal untuk ${row.nama}?\nJadwal baru: ${formatTgl(row.reschedule_tanggal)}, ${row.reschedule_jam}`,
    icon: 'SETUJU',
    okText: 'Ya, Setujui Jadwal'
  });
  if (!ok) return;

  showToast('info', 'Memproses persetujuan reschedule...');
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
      playSuccessChime();
      showToast('success', 'Jadwal baru berhasil disetujui');
      logActivity('Reschedule Disetujui', `Persetujuan perubahan jadwal ${row.nama} ke ${row.tanggal}.`);
      renderAll();
    } else {
      showToast('error', 'Gagal memproses persetujuan di server');
    }
  } catch {
    showToast('error', 'Gagal terhubung ke server');
  }
}

async function rejectReschedule(key) {
  const row = allData.find(r => r._key === key);
  if (!row || !row._rowIndex) return;

  const ok = await showConfirm({
    title: 'Penolakan Reschedule',
    msg: `Tolak pengajuan jadwal baru untuk ${row.nama}?\nJadwal awal tetap berlaku.`,
    icon: 'TOLAK',
    okText: 'Ya, Tolak Permohonan'
  });
  if (!ok) return;

  showToast('info', 'Memproses penolakan...');
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
      showToast('info', 'Pengajuan reschedule ditolak. Jadwal lama tetap berlaku.');
      logActivity('Reschedule Ditolak', `Penolakan reschedule pemohon ${row.nama}.`);
      renderAll();
    } else {
      showToast('error', 'Gagal memproses penolakan di server');
    }
  } catch {
    showToast('error', 'Gagal terhubung ke server');
  }
}

// ── Detail Applicant Modal ───────────────────────────────────────
function openModal(key) {
  const row = allData.find(r => r._key === key);
  if (!row) return;
  currentRow = row;

  // Header Elements
  $('mTitle').textContent = row.nama || 'Pemohon BAP';
  $('m-header-reg').textContent = row.reg || 'BAP-00000000-0000';
  const stBadge = $('m-header-status');
  if (stBadge) {
    stBadge.className = 'mhb-status-badge ' + (row.status === 'Selesai' ? 'done' : row.status === 'Dikonfirmasi' ? 'conf' : 'wait');
    stBadge.textContent = row.status || 'Menunggu';
  }

  // Data Tab Elements
  $('m-reg').textContent = row.reg || 'Belum ada';
  $('m-waktu').textContent = row.waktu_daftar || 'Belum ada';
  $('m-nama').textContent = row.nama || 'Pemohon';
  $('m-ttl').textContent = row.ttl || 'Belum ada';
  $('m-jk').textContent = row.jk || 'Belum ada';
  $('m-hp').textContent = row.hp || 'Belum ada';
  $('m-jadwal').textContent = `${formatTglFull(row.tanggal)} (Sesi: ${row.jam || 'Belum ditentukan'})`;
  $('m-jenis').textContent = row.jenis_permohonan || 'BAP Paspor';
  $('m-paspor').textContent = row.jenis_paspor || 'Paspor Biasa';
  $('m-tujuan').textContent = row.tujuan || 'Tidak ada keterangan';

  // Photo Schedule
  const fuItem = $('m-fu-item');
  if (row.foto_ulang_tanggal && String(row.foto_ulang_tanggal).trim() !== '') {
    fuItem.style.display = 'block';
    $('m-fu-jadwal').textContent = formatFotoUlangReadable(row.foto_ulang_tanggal);
  } else {
    fuItem.style.display = 'none';
  }

  // Documents Tab & Inspection Studio
  renderDocumentsStudio(row);

  // Status Tab
  $('m-note').value = row.note || '';
  const isDone = row.status === 'Selesai';

  $$('.status-card-opt').forEach(o => {
    o.classList.remove('selected-wait', 'selected-conf', 'selected-done');
    if (o.dataset.val === row.status) {
      o.classList.add(
        row.status === 'Menunggu' ? 'selected-wait' :
        row.status === 'Dikonfirmasi' ? 'selected-conf' : 'selected-done'
      );
    }
  });

  const fuSection = $('fotoUlangSection');
  if (isDone) {
    if (fuSection) fuSection.style.display = 'block';
    setFotoUlangValue(row.foto_ulang_tanggal);
  } else {
    if (fuSection) fuSection.style.display = 'none';
  }
  $('statusLockedNote').style.display = isDone ? 'block' : 'none';

  // WhatsApp Tab
  const waTarget = $('waRecipientNumber');
  if (waTarget) waTarget.textContent = `Tujuan: ${row.hp || 'Belum ada nomor'}`;
  applyWATemplate('konfirmasi');

  // Reschedule Tab
  const rsTabEl = $('rsTab');
  const hasRs = row.reschedule_status && row.reschedule_status !== '';
  if (rsTabEl) rsTabEl.style.display = hasRs ? 'block' : 'none';
  if (hasRs) renderRescheduleDetail(row);

  // Reset to identity tab
  switchTab('data', document.querySelector('.modal-nav-tab[data-tab="data"]'));

  $('modalOverlay').classList.add('show');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  $('modalOverlay').classList.remove('show');
  document.body.style.overflow = '';
  currentRow = null;
}

function switchTab(name, el) {
  $$('.modal-tab-panel').forEach(p => p.classList.remove('active'));
  $$('.modal-nav-tab').forEach(t => {
    t.classList.remove('active');
    t.setAttribute('aria-selected', 'false');
  });

  const panel = $('tab-' + name);
  if (panel) panel.classList.add('active');
  if (el) {
    el.classList.add('active');
    el.setAttribute('aria-selected', 'true');
  }
}

// ── Document Inspection Studio ───────────────────────────────────
function renderDocumentsStudio(row) {
  const DOCS = [
    { key: 'url_ktp', label: 'E-KTP Pemohon' },
    { key: 'url_kk', label: 'Kartu Keluarga' },
    { key: 'url_akta', label: 'Akta Lahir / Buku Nikah / Ijazah' },
    { key: 'url_foto_paspor', label: 'Foto Paspor Lama / Rusak' },
    { key: 'url_surat_polisi', label: 'Surat Keterangan Kepolisian' },
    { key: 'url_surat_kelurahan', label: 'Surat Keterangan Kelurahan' },
    { key: 'url_surat_pemerintah', label: 'Surat Dinas / Rekomendasi Pemerintah' },
    { key: 'url_pendukung', label: 'Berkas Pendukung Lainnya' }
  ];

  const container = $('docContainer');
  const countPill = $('docCountPill');
  if (!container) return;

  let availableCount = 0;
  DOCS.forEach(d => {
    if (row[d.key] && String(row[d.key]).trim() !== '') availableCount++;
  });
  if (countPill) countPill.textContent = availableCount;

  container.innerHTML = DOCS.map((d, idx) => {
    const url = row[d.key];
    const isAvailable = Boolean(url && String(url).trim() !== '');
    if (!isAvailable) {
      return `
        <div class="doc-item-card">
          <div class="doc-item-header">
            <span class="dih-title">${d.label}</span>
            <span class="legend-item missing">Tidak Dilampirkan</span>
          </div>
          <div class="doc-missing-placeholder">
            <span>Berkas belum diunggah oleh pemohon</span>
          </div>
        </div>`;
    }

    const isPdf = url.toLowerCase().includes('.pdf');
    const safeUrl = escKey(url);
    const rotation = docRotations[d.key] || 0;

    return `
      <div class="doc-item-card">
        <div class="doc-item-header">
          <span class="dih-title">${d.label}</span>
          <span class="legend-item available">Tersedia</span>
        </div>
        <div class="doc-stage-area">
          ${isPdf ? `
            <div style="text-align:center;color:var(--text-secondary)">
              <div style="font-size:12px;margin-bottom:8px">Dokumen Berformat PDF</div>
              <a href="${url}" target="_blank" rel="noopener" class="primary-btn compact">Buka Dokumen PDF</a>
            </div>
          ` : `
            <img class="doc-preview-img" id="docImg_${idx}" src="${url}" alt="${d.label}" loading="lazy"
              style="transform: rotate(${rotation}deg)"
              onclick="openLightbox('${safeUrl}', '${escKey(d.label)}')">
            <div class="doc-action-overlay">
              <button class="doc-tool-pill" onclick="rotateCardDoc('${d.key}', 'docImg_${idx}', 90)">Putar 90°</button>
              <button class="doc-tool-pill" onclick="openLightbox('${safeUrl}', '${escKey(d.label)}')">Perbesar</button>
            </div>
          `}
        </div>
      </div>`;
  }).join('');
}

function rotateCardDoc(key, imgId, delta) {
  docRotations[key] = (docRotations[key] || 0) + delta;
  const img = document.getElementById(imgId);
  if (img) img.style.transform = `rotate(${docRotations[key]}deg)`;
}

// ── Lightbox & Inspector Controls ────────────────────────────────
function openLightbox(url, title = 'Dokumen Lampiran') {
  currentLightboxRotation = 0;
  $('lightboxTitle').textContent = title;
  const img = $('lightbox-img');
  img.src = url;
  img.style.transform = 'rotate(0deg)';
  $('lightboxDownloadBtn').href = url;
  $('lightbox').classList.add('show');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  $('lightbox').classList.remove('show');
  document.body.style.overflow = '';
}

function rotateLightboxDoc(delta) {
  currentLightboxRotation += delta;
  const img = $('lightbox-img');
  if (img) img.style.transform = `rotate(${currentLightboxRotation}deg)`;
}

function resetLightboxZoom() {
  currentLightboxRotation = 0;
  const img = $('lightbox-img');
  if (img) img.style.transform = 'rotate(0deg)';
}

// ── Status Decision Handling ─────────────────────────────────────
function selectStatus(el) {
  $$('.status-card-opt').forEach(o => {
    o.classList.remove('selected-wait', 'selected-conf', 'selected-done');
    o.setAttribute('aria-checked', 'false');
  });

  const v = el.dataset.val;
  el.classList.add(v === 'Menunggu' ? 'selected-wait' : v === 'Dikonfirmasi' ? 'selected-conf' : 'selected-done');
  el.setAttribute('aria-checked', 'true');

  const fuSection = $('fotoUlangSection');
  if (v === 'Selesai') {
    populateFotoUlangSelects();
    if (!currentRow || !currentRow.foto_ulang_tanggal) setFotoUlangValue('');
    if (fuSection) fuSection.style.display = 'block';
  } else {
    if (fuSection) fuSection.style.display = 'none';
  }
}

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
  if ($('fuTahun')) $('fuTahun').value = m ? m[1] : '';
  if ($('fuBulan')) $('fuBulan').value = m ? m[2] : '';
  if ($('fuHari')) $('fuHari').value = m ? m[3] : '';
}

function getFotoUlangValue() {
  const h = $('fuHari')?.value, b = $('fuBulan')?.value, y = $('fuTahun')?.value;
  if (!h || !b || !y) return '';
  return `${y}-${b}-${h}`;
}

function formatFotoUlangReadable(tglStr) {
  const s = String(tglStr || '').slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return 'Belum ada';
  return `${parseInt(m[3])} ${MONTH_FULL[parseInt(m[2]) - 1]} ${m[1]}`;
}

async function saveStatus() {
  if (!currentRow) return;
  const sel = document.querySelector('.status-card-opt[class*="selected"]');
  if (!sel) {
    showToast('error', 'Pilih status keputusan terlebih dahulu');
    return;
  }

  const newStatus = sel.dataset.val;
  const note = $('m-note').value.trim();

  let fotoUlangTanggal = '';
  if (newStatus === 'Selesai') {
    fotoUlangTanggal = getFotoUlangValue();
    if (!fotoUlangTanggal) {
      showToast('error', 'Pilih tanggal foto ulang paspor sebelum menyimpan status Selesai');
      return;
    }
  }

  const rowKey = currentRow._key;
  const rowIndex = currentRow._rowIndex;
  const rowInData = allData.find(r => r._key === rowKey);

  if (rowInData) {
    rowInData.status = newStatus;
    rowInData.note = note;
    if (newStatus === 'Selesai') rowInData.foto_ulang_tanggal = fotoUlangTanggal;
  }

  localStatus[rowKey] = { status: newStatus, note, foto_ulang_tanggal: fotoUlangTanggal };
  saveLocalStatus();
  logActivity('Pembaruan Status BAP', `Mengubah status ${currentRow.nama} menjadi ${newStatus}.`);
  playSuccessChime();
  renderAll();
  closeModal();

  if (rowIndex) {
    showToast('info', 'Menyimpan status ke lembar kerja...');
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
        showToast('success', `Status "${newStatus}" berhasil disimpan ke server`);
        delete localStatus[rowKey];
        saveLocalStatus();
      } else {
        showToast('error', 'Gagal simpan ke lembar kerja (tersimpan secara lokal)');
      }
    } catch {
      showToast('error', 'Koneksi gagal (status disimpan secara lokal)');
    }
  } else {
    showToast('success', `Status "${newStatus}" tersimpan lokal`);
  }
}

// ── WhatsApp Official Template Generator ─────────────────────────
function applyWATemplate(type, btnEl) {
  if (btnEl) {
    $$('.wa-preset-btn').forEach(b => b.classList.remove('active'));
    btnEl.classList.add('active');
  }

  if (!currentRow) return;
  const r = currentRow;
  const editor = $('waMessageEditor');
  if (!editor) return;

  let msg = '';
  const nama = r.nama || 'Bapak/Ibu';
  const reg = r.reg || 'BAP-0000';
  const tgl = formatTglFull(r.tanggal);
  const jam = r.jam || 'Sesi Ditentukan';
  const jenis = r.jenis_permohonan || 'BAP Paspor';

  if (type === 'konfirmasi') {
    msg = 
`*PEMBERITAHUAN JADWAL BAP KANTOR IMIGRASI KELAS I TPI TANJUNGPINANG*

Yth. Bapak/Ibu *${nama}*,

Pendaftaran Berita Acara Pemeriksaan (BAP) Paspor Anda telah kami verifikasi dan disetujui.

*Rincian Kedatangan:*
• No. Registrasi: *${reg}*
• Jenis Permohonan: *${jenis}*
• Hari/Tanggal: *${tgl}*
• Sesi Waktu: *${jam} WIB*
• Lokasi: Seksi INTELDAKIM, Kantor Imigrasi Kelas I TPI Tanjungpinang

*Instruksi Penting:*
1. Harap hadir 15 menit sebelum waktu sesi.
2. Wajib membawa seluruh *dokumen fisik asli* (KTP, KK, Akta Lahir/Buku Nikah/Ijazah, Surat Polisi jika paspor hilang).
3. Berpakaian rapi dan berkerah (bukan kaos oblong).

Terima kasih.
_Seksi Intelijen dan Penindakan Keimigrasian_`;

  } else if (type === 'h1') {
    msg = 
`*PENGINGAT KEHADIRAN BAP (H-1)*

Yth. Bapak/Ibu *${nama}*,

Mengingatkan kembali jadwal pelaksanaan Berita Acara Pemeriksaan (BAP) Paspor Anda besok:
• No. Registrasi: *${reg}*
• Jadwal: *${tgl}*
• Sesi: *${jam} WIB*

Pastikan seluruh berkas persyaratan asli telah lengkap. Jika berhalangan hadir, segera hubungi petugas kami.

Terima kasih.
_Kantor Imigrasi Kelas I TPI Tanjungpinang_`;

  } else if (type === 'berkas_kurang') {
    msg = 
`*KLARIFIKASI DOKUMEN BAP ONLINE*

Yth. Bapak/Ibu *${nama}*,

Sehubungan dengan pendaftaran BAP No. *${reg}*, terdapat dokumen yang perlu dilengkapi atau diperjelas sebelum pelaksanaan wawancara.

Mohon konfirmasi kelengkapan berkas fisik yang akan dibawa saat verifikasi loket.

Terima kasih.
_Petugas Pemeriksa INTELDAKIM Tanjungpinang_`;

  } else if (type === 'selesai') {
    const fuTgl = formatFotoUlangReadable(r.foto_ulang_tanggal);
    msg = 
`*INFORMASI PENYELESAIAN BAP & JADWAL FOTO PASPOR*

Yth. Bapak/Ibu *${nama}*,

Proses Berita Acara Pemeriksaan (BAP) Paspor No. *${reg}* telah *SELESAI* dilaksanakan.

*Jadwal Tahap Foto & Biometrik Paspor Baru:*
• Tanggal: *${fuTgl}*
• Tempat: Loket Foto Pelayanan Paspor Kantor Imigrasi Kelas I TPI Tanjungpinang

Bawa berkas tanda bukti BAP saat hadir ke loket foto.

Terima kasih.
_Kantor Imigrasi Kelas I TPI Tanjungpinang_`;
  }

  editor.value = msg;
}

function copyWAMessage() {
  const text = $('waMessageEditor')?.value || '';
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    playSuccessChime();
    showToast('success', 'Teks pesan WhatsApp berhasil disalin');
  });
}

function sendDirectWAMessage() {
  if (!currentRow || !currentRow.hp) {
    showToast('error', 'Nomor telepon pemohon tidak valid');
    return;
  }
  const text = $('waMessageEditor')?.value || '';
  const clean = String(currentRow.hp).replace(/\D/g, '');
  const intl = clean.startsWith('0') ? '62' + clean.slice(1) : clean;
  const url = `https://wa.me/${intl}?text=${encodeURIComponent(text)}`;
  logActivity('Kirim Pesan WhatsApp', `Mengirim template pesan ke ${currentRow.nama} (${currentRow.hp}).`);
  window.open(url, '_blank');
}

function openDirectWAFromModal() {
  if (!currentRow || !currentRow.hp) return;
  openWA(currentRow.hp);
}

// ── Reschedule Modal Details ─────────────────────────────────────
function renderRescheduleDetail(row) {
  const panel = $('rsDetailPanel');
  if (!panel) return;

  const isApproved = row.reschedule_status === 'Disetujui';
  const isRejected = row.reschedule_status === 'Ditolak';

  panel.innerHTML = `
    <div class="data-group-card full-span">
      <div class="dgc-title">Pengajuan Perubahan Jadwal Kedatangan</div>
      <div class="field-grid-three">
        <div class="field-item">
          <span class="fi-label">Jadwal Semula</span>
          <span class="fi-value">${formatTglFull(row.tanggal)} (Sesi: ${escHtml(row.jam)})</span>
        </div>
        <div class="field-item">
          <span class="fi-label">Jadwal Baru Dimohonkan</span>
          <span class="fi-value schedule-tag">${formatTglFull(row.reschedule_tanggal)} (Sesi: ${escHtml(row.reschedule_jam)})</span>
        </div>
        <div class="field-item">
          <span class="fi-label">Status Pengajuan</span>
          <span class="fi-value">${rsBadgeHtml(row.reschedule_status)}</span>
        </div>
        <div class="field-item full-span">
          <span class="fi-label">Alasan Perubahan Jadwal</span>
          <span class="fi-value text-block">${escHtml(row.reschedule_alasan) || 'Tidak disertakan alasan.'}</span>
        </div>
      </div>
      ${row.reschedule_status === 'Pending' ? `
        <div style="margin-top:14px;display:flex;gap:10px;">
          <button class="primary-btn" onclick="approveReschedule('${escKey(row._key)}');closeModal();">Setujui Jadwal Baru</button>
          <button class="tbl-action-btn danger" onclick="rejectReschedule('${escKey(row._key)}');closeModal();">Tolak Permohonan</button>
        </div>
      ` : isApproved ? `
        <div style="margin-top:12px;padding:8px 12px;background:rgba(34,197,94,0.08);border-radius:6px;font-size:11.5px;color:var(--green-400);font-weight:700;">
          Pengajuan perubahan jadwal ini telah disetujui petugas.
        </div>
      ` : isRejected ? `
        <div style="margin-top:12px;padding:8px 12px;background:rgba(239,68,68,0.08);border-radius:6px;font-size:11.5px;color:var(--red-400);font-weight:700;">
          Pengajuan perubahan jadwal ini telah ditolak. Jadwal lama tetap berlaku.
        </div>
      ` : ''}
    </div>`;
}

// ── Delete Actions ───────────────────────────────────────────────
function confirmDelete() {
  if (!currentRow) return;
  pendingDelKey = currentRow._key;
  $('deleteName').textContent = currentRow.nama || 'Pemohon';
  closeModal();
  $('deleteOverlay').classList.add('show');
  document.body.style.overflow = 'hidden';
}

function openDeleteFromTable(key) {
  const row = allData.find(r => r._key === key);
  if (!row) return;
  pendingDelKey = key;
  $('deleteName').textContent = row.nama || 'Pemohon';
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

  logActivity('Penghapusan Data', `Menghapus pendaftar ${row.nama} (${row.reg}).`);
  showToast('info', 'Menghapus data pemohon...');

  if (row._rowIndex) {
    try {
      const res = await fetch(SHEET_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ action: 'deleteRow', _rowIndex: row._rowIndex })
      });
      const json = await res.json();
      if (json.ok) {
        showToast('success', 'Data pemohon berhasil dihapus');
      } else {
        showToast('error', 'Gagal menghapus baris di Google Sheets');
      }
    } catch {
      showToast('error', 'Gagal menghubungi server untuk menghapus');
    }
  } else {
    showToast('success', 'Data berhasil dihapus dari sistem lokal');
  }
  pendingDelKey = null;
}

// ── Print Official Document View ─────────────────────────────────
function printDetail() {
  if (!currentRow) return;
  const r = currentRow;
  const w = window.open('', '_blank', 'width=780,height=900');
  w.document.write(`<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<title>Lembar Pemeriksaan BAP - ${escHtml(r.nama)}</title>
<style>
  body { font-family: 'Plus Jakarta Sans', Arial, sans-serif; margin: 36px; color: #0f172a; font-size: 13px; line-height: 1.5; }
  .gov-head { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px; }
  .gov-head h2 { font-size: 14px; margin: 0; text-transform: uppercase; letter-spacing: 0.05em; }
  .gov-head h1 { font-size: 16px; margin: 4px 0; text-transform: uppercase; }
  .gov-head p { font-size: 11px; margin: 0; color: #475569; }
  .doc-title { text-align: center; font-size: 14px; font-weight: 800; text-transform: uppercase; margin: 18px 0; letter-spacing: 0.06em; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
  th { background: #f1f5f9; padding: 7px 10px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #cbd5e1; }
  td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 12px; }
  td:first-child { width: 35%; font-weight: 700; color: #475569; }
  .footer-sig { display: flex; justify-content: space-between; margin-top: 40px; }
  .sig-block { text-align: center; width: 220px; }
  .sig-space { height: 70px; }
  @media print { body { margin: 15px; } }
</style>
</head>
<body>
<div class="gov-head">
  <h2>Kementerian Hukum dan Hak Asasi Manusia RI</h2>
  <h2>Direktorat Jenderal Imigrasi</h2>
  <h1>Kantor Imigrasi Kelas I TPI Tanjungpinang</h1>
  <p>Seksi Intelijen dan Penindakan Keimigrasian (INTELDAKIM)</p>
</div>
<div class="doc-title">Lembar Registrasi Berita Acara Pemeriksaan (BAP) Paspor</div>
<table>
  <thead><tr><th colspan="2">Data Identitas Pemohon</th></tr></thead>
  <tbody>
    <tr><td>No. Registrasi BAP</td><td><strong>${escHtml(r.reg)}</strong></td></tr>
    <tr><td>Nama Lengkap Sesuai KTP</td><td><strong>${escHtml(r.nama)}</strong></td></tr>
    <tr><td>Tempat / Tanggal Lahir</td><td>${escHtml(r.ttl)}</td></tr>
    <tr><td>Jenis Kelamin</td><td>${escHtml(r.jk)}</td></tr>
    <tr><td>Nomor WhatsApp / HP</td><td>${escHtml(r.hp)}</td></tr>
    <tr><td>Waktu Pendaftaran</td><td>${escHtml(r.waktu_daftar)}</td></tr>
  </tbody>
</table>
<table>
  <thead><tr><th colspan="2">Informasi Permohonan BAP</th></tr></thead>
  <tbody>
    <tr><td>Jenis Permohonan</td><td>${escHtml(r.jenis_permohonan)}</td></tr>
    <tr><td>Jenis Paspor</td><td>${escHtml(r.jenis_paspor)}</td></tr>
    <tr><td>Tujuan Permohonan</td><td>${escHtml(r.tujuan)}</td></tr>
    <tr><td>Jadwal Pemeriksaan</td><td>${formatTglFull(r.tanggal)} (Sesi: ${escHtml(r.jam)})</td></tr>
    <tr><td>Status Saat Ini</td><td><strong>${escHtml(r.status)}</strong></td></tr>
    ${r.foto_ulang_tanggal ? `<tr><td>Jadwal Foto Ulang Paspor</td><td>${formatFotoUlangReadable(r.foto_ulang_tanggal)}</td></tr>` : ''}
    ${r.note ? `<tr><td>Catatan Petugas Pemeriksa</td><td>${escHtml(r.note)}</td></tr>` : ''}
  </tbody>
</table>
<div class="footer-sig">
  <div class="sig-block">
    <p>Pemohon,</p>
    <div class="sig-space"></div>
    <p>( ${escHtml(r.nama)} )</p>
  </div>
  <div class="sig-block">
    <p>Tanjungpinang, ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}<br>Petugas Pemeriksa INTELDAKIM,</p>
    <div class="sig-space"></div>
    <p>( ..................................................... )</p>
  </div>
</div>
</body>
</html>`);
  w.document.close();
  setTimeout(() => w.print(), 400);
}

// ── Rekapitulasi & Statistik View ────────────────────────────────
function renderRecap() {
  const total = allData.length || 1;

  const statusData = [
    { label: 'Menunggu', count: allData.filter(r => r.status === 'Menunggu').length, color: '#f59e0b' },
    { label: 'Dikonfirmasi', count: allData.filter(r => r.status === 'Dikonfirmasi').length, color: '#0284c7' },
    { label: 'Selesai', count: allData.filter(r => r.status === 'Selesai').length, color: '#16a34a' },
    { label: 'Pending Reschedule', count: allData.filter(r => r.reschedule_status === 'Pending').length, color: '#ea580c' },
  ];

  const statusBars = $('statusBars');
  if (statusBars) {
    statusBars.innerHTML = statusData.map(s => `
      <div>
        <div class="recap-metric-row">
          <span class="rmr-label"><span class="rmr-color-dot" style="background:${s.color}"></span>${s.label}</span>
          <span class="rmr-value">${s.count} pemohon (${Math.round(s.count / total * 100)}%)</span>
        </div>
        <div class="recap-progress-track">
          <div class="recap-progress-fill" style="width:${Math.round(s.count / total * 100)}%;background:${s.color}"></div>
        </div>
      </div>
    `).join('');
  }

  const jenisMap = {};
  allData.forEach(r => {
    const j = r.jenis_permohonan || 'Lainnya';
    jenisMap[j] = (jenisMap[j] || 0) + 1;
  });
  const jColors = ['#0284c7', '#0ea5e9', '#16a34a', '#d97706', '#8b5cf6'];
  const jenisBars = $('jenisBars');
  if (jenisBars) {
    jenisBars.innerHTML = Object.entries(jenisMap)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v], i) => `
        <div>
          <div class="recap-metric-row">
            <span class="rmr-label"><span class="rmr-color-dot" style="background:${jColors[i % jColors.length]}"></span>${k}</span>
            <span class="rmr-value">${v} pemohon (${Math.round(v / total * 100)}%)</span>
          </div>
          <div class="recap-progress-track">
            <div class="recap-progress-fill" style="width:${Math.round(v / total * 100)}%;background:${jColors[i % jColors.length]}"></div>
          </div>
        </div>
      `).join('');
  }

  const sesiMap = {};
  allData.forEach(r => {
    const s = r.jam || 'Belum Ditentukan';
    sesiMap[s] = (sesiMap[s] || 0) + 1;
  });

  const sesiTable = $('sesiTable');
  if (sesiTable) {
    sesiTable.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Waktu Sesi Pelayanan</th>
            <th>Beban Jumlah Pemohon</th>
            <th>Persentase Antrean</th>
          </tr>
        </thead>
        <tbody>
          ${Object.entries(sesiMap).sort().map(([k, v]) => `
            <tr>
              <td><strong>${k}</strong></td>
              <td style="color:var(--sky-400);font-weight:700;">${v} orang</td>
              <td>${Math.round(v / allData.length * 100)}%</td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;
  }
}

// ── Export to Excel ──────────────────────────────────────────────
function exportExcel(onlySelected = false) {
  if (!window.XLSX) {
    showToast('error', 'Library Excel (XLSX) tidak tersedia');
    return;
  }

  let sourceData = getFiltered();
  if (onlySelected) {
    sourceData = sourceData.filter(r => selectedRowKeys.has(r._key));
  }

  if (!sourceData.length) {
    showToast('error', 'Tidak ada data untuk diekspor ke Excel');
    return;
  }

  const wb = XLSX.utils.book_new();
  const rows = sourceData.map((r, i) => ({
    'No': i + 1,
    'No. Registrasi': r.reg || '',
    'Nama Lengkap': r.nama || '',
    'Tempat/Tgl Lahir': r.ttl || '',
    'Jenis Kelamin': r.jk || '',
    'Nomor WhatsApp': r.hp || '',
    'Kategori BAP': r.jenis_permohonan || '',
    'Jenis Paspor': r.jenis_paspor || '',
    'Tujuan Permohonan': r.tujuan || '',
    'Jadwal BAP': r.tanggal || '',
    'Sesi Kedatangan': r.jam || '',
    'Status BAP': r.status || '',
    'Status Reschedule': r.reschedule_status || '',
    'Tgl Reschedule': r.reschedule_tanggal || '',
    'Jam Reschedule': r.reschedule_jam || '',
    'Alasan Reschedule': r.reschedule_alasan || '',
    'Tgl Foto Ulang': r.foto_ulang_tanggal || '',
    'Catatan Petugas': r.note || '',
    'Waktu Registrasi': r.waktu_daftar || '',
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 4 }, { wch: 18 }, { wch: 28 }, { wch: 22 }, { wch: 6 }, { wch: 16 },
    { wch: 20 }, { wch: 16 }, { wch: 28 }, { wch: 13 }, { wch: 14 }, { wch: 14 },
    { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 30 }, { wch: 14 }, { wch: 28 }, { wch: 20 }
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Data BAP');

  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const fileName = `Rekap_BAP_INTELDAKIM_${dateStr}.xlsx`;
  XLSX.writeFile(wb, fileName);

  playSuccessChime();
  showToast('success', `Ekspor berhasil (${sourceData.length} baris data)`);
  logActivity('Ekspor Data Excel', `Mengunduh berkas ${fileName} sejumlah ${sourceData.length} baris.`);
}

// ── Command Palette (Ctrl+K) ─────────────────────────────────────
function openCommandPalette() {
  const modal = $('commandPaletteModal');
  const input = $('cpInput');
  if (!modal || !input) return;

  modal.classList.add('show');
  input.value = '';
  cpSelectedIndex = 0;
  handleCPSearch();
  input.focus();
}

function closeCommandPalette() {
  const modal = $('commandPaletteModal');
  if (modal) modal.classList.remove('show');
}

function handleCPSearch() {
  const q = ($('cpInput')?.value || '').toLowerCase().trim();
  const resultsEl = $('cpResults');
  if (!resultsEl) return;

  const items = [];

  // Navigation Items
  items.push({ type: 'nav', page: 'dashboard', label: 'Buka Halaman Dashboard', badge: 'Navigasi' });
  items.push({ type: 'nav', page: 'pendaftar', label: 'Buka Basis Data Pendaftar', badge: 'Navigasi' });
  items.push({ type: 'nav', page: 'reschedule', label: 'Buka Manajemen Reschedule', badge: 'Navigasi' });
  items.push({ type: 'nav', page: 'rekap', label: 'Buka Rekap & Laporan BAP', badge: 'Navigasi' });

  // System Actions
  items.push({ type: 'action', action: 'theme', label: 'Ganti Mode Tampilan (Gelap / Terang)', badge: 'Tampilan' });
  items.push({ type: 'action', action: 'refresh', label: 'Sinkronisasi Ulang Data Sekarang', badge: 'Sistem' });
  items.push({ type: 'action', action: 'export', label: 'Unduh Seluruh Data ke Excel', badge: 'Ekspor' });
  items.push({ type: 'action', action: 'audit', label: 'Buka Log Riwayat Aktivitas Petugas', badge: 'Audit' });

  // Matching Applicants
  if (q.length >= 2) {
    allData.forEach(r => {
      const match = 
        (r.nama || '').toLowerCase().includes(q) ||
        (r.reg || '').toLowerCase().includes(q) ||
        (r.hp || '').includes(q) ||
        (r.nik || '').includes(q);
      if (match) {
        items.push({
          type: 'applicant',
          key: r._key,
          label: `${r.nama} (${r.reg})`,
          sub: `${r.jenis_permohonan} - ${r.status}`,
          badge: 'Pemohon'
        });
      }
    });
  }

  // Filter items by query
  const filtered = items.filter(item => {
    if (!q) return item.type !== 'applicant';
    return item.label.toLowerCase().includes(q) || (item.sub && item.sub.toLowerCase().includes(q));
  });

  cpCurrentResults = filtered.slice(0, 12);
  if (cpSelectedIndex >= cpCurrentResults.length) cpSelectedIndex = 0;

  if (!cpCurrentResults.length) {
    resultsEl.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:12px">Tidak ada aksi atau data yang cocok.</div>';
    return;
  }

  resultsEl.innerHTML = cpCurrentResults.map((item, idx) => `
    <div class="cp-item-row ${idx === cpSelectedIndex ? 'selected' : ''}" onclick="executeCPItem(${idx})">
      <div class="cp-item-left">
        <span class="cp-item-badge">${item.badge}</span>
        <div>
          <div>${escHtml(item.label)}</div>
          ${item.sub ? `<div style="font-size:10.5px;color:var(--text-muted);">${escHtml(item.sub)}</div>` : ''}
        </div>
      </div>
      <kbd style="font-size:10px;color:var(--text-muted)">Pilih</kbd>
    </div>
  `).join('');
}

function handleCPKeydown(e) {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (cpCurrentResults.length) {
      cpSelectedIndex = (cpSelectedIndex + 1) % cpCurrentResults.length;
      handleCPSearch();
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (cpCurrentResults.length) {
      cpSelectedIndex = (cpSelectedIndex - 1 + cpCurrentResults.length) % cpCurrentResults.length;
      handleCPSearch();
    }
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (cpCurrentResults[cpSelectedIndex]) {
      executeCPItem(cpSelectedIndex);
    }
  } else if (e.key === 'Escape') {
    closeCommandPalette();
  }
}

function executeCPItem(idx) {
  const item = cpCurrentResults[idx];
  if (!item) return;

  closeCommandPalette();

  if (item.type === 'nav') {
    navTo(item.page, document.querySelector(`[data-page="${item.page}"]`));
  } else if (item.type === 'action') {
    if (item.action === 'theme') toggleTheme();
    else if (item.action === 'refresh') loadData(true);
    else if (item.action === 'export') exportExcel();
    else if (item.action === 'audit') openAuditModal();
  } else if (item.type === 'applicant') {
    openModal(item.key);
  }
}

// ── Shortcuts Modal Helper ───────────────────────────────────────
function openShortcutsModal() {
  $('shortcutsModal').classList.add('show');
  document.body.style.overflow = 'hidden';
}

function closeShortcutsModal() {
  $('shortcutsModal').classList.remove('show');
  document.body.style.overflow = '';
}

// ── Navigation Manager ───────────────────────────────────────────
const PAGE_META = {
  dashboard: ['Dashboard', 'Pusat Kendali Pemeriksaan BAP'],
  pendaftar: ['Data Pendaftar BAP', 'Basis Data Pendaftaran INTELDAKIM'],
  reschedule: ['Manajemen Reschedule', 'Pengajuan Perubahan Jadwal Pemohon'],
  rekap: ['Rekap & Laporan', 'Statistik Pelayanan Keimigrasian'],
};

function navTo(page, el) {
  $$('.nav-item').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');
  $$('.page-view').forEach(p => p.classList.remove('active'));

  const targetPage = $('page-' + page);
  if (targetPage) targetPage.classList.add('active');

  const [t, s] = PAGE_META[page] || [page, ''];
  $('topbarTitle').textContent = t;
  $('topbarBreadcrumb').textContent = t;

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
  $('sidebar')?.classList.remove('open');
  $('sidebarOverlay')?.classList.remove('show');
  const btn = $('menuToggleBtn');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

function toggleSidebarCollapse() {
  // Mini collapsed mode if requested
  const sidebar = $('sidebar');
  if (sidebar) sidebar.classList.toggle('collapsed');
}

// ── Toast Notifications ──────────────────────────────────────────
let toastTimer;
function showToast(type, msg) {
  clearTimeout(toastTimer);
  const t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = type;
  t.classList.add('show');
  toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
}

// ── Global Keyboard Shortcuts ────────────────────────────────────
document.addEventListener('keydown', e => {
  // Command palette (Ctrl+K or Cmd+K)
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    openCommandPalette();
    return;
  }

  // Ctrl+F -> Focus Search
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
    const searchEl = $('searchInput');
    if (searchEl) {
      e.preventDefault();
      navTo('pendaftar', document.querySelector('[data-page=pendaftar]'));
      searchEl.focus();
      searchEl.select();
      return;
    }
  }

  // Escape key -> Close any modal
  if (e.key === 'Escape') {
    closeModal();
    closeLightbox();
    closeDeleteModal();
    closeCommandPalette();
    closeAuditModal();
    closeShortcutsModal();
    resolveConfirm(false);
    return;
  }

  // Shortcuts when not in input
  const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
  if (!isInput) {
    if (e.key === '?') {
      openShortcutsModal();
    } else if (e.key === 'r' || e.key === 'R') {
      loadData(true);
    } else if (e.key === '1') {
      navTo('dashboard', document.querySelector('[data-page=dashboard]'));
    } else if (e.key === '2') {
      navTo('pendaftar', document.querySelector('[data-page=pendaftar]'));
    } else if (e.key === '3') {
      navTo('reschedule', document.querySelector('[data-page=reschedule]'));
    } else if (e.key === '4') {
      navTo('rekap', document.querySelector('[data-page=rekap]'));
    }
  }
});

// ── Initialization Sequence ──────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initSound();
  initOnlineStatus();

  const session = getSession();
  setTimeout(() => {
    const splash = $('splashScreen');
    if (splash) {
      splash.classList.add('hide');
      setTimeout(() => splash.style.display = 'none', 450);
    }

    if (session) {
      bootDashboard(session.displayName);
    } else {
      $('loginPage').classList.add('visible');
    }
  }, 1000);
});
