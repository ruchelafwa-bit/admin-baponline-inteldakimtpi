const SHEET_URL     = 'https://script.google.com/macros/s/AKfycbw_EP7_C1S02jLHCs-yLjjMRW4k_DScHQ09p5H5FqV34wHrHsWXZtZ0a83LgkoMOP3m/exec';
const SESSION_KEY   = 'baper_session_v3';
const STATUS_KEY    = 'baper_status_v2';
const SESSION_HOURS = 8;
const MAX_ATTEMPTS  = 5;
const LOCKOUT_SECONDS = 60;


let activeMonth = 'all'; 
let activeYear  = '';   

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
const MONTH_FULL_NAMES = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

function populateFotoUlangSelects(){
  const hSel=document.getElementById('fuHari'), bSel=document.getElementById('fuBulan'), ySel=document.getElementById('fuTahun');
  if(!hSel||hSel.dataset.filled) return;
  for(let d=1;d<=31;d++){const o=document.createElement('option');o.value=String(d).padStart(2,'0');o.textContent=d;hSel.appendChild(o);}
  MONTH_FULL_NAMES.forEach((m,i)=>{const o=document.createElement('option');o.value=String(i+1).padStart(2,'0');o.textContent=m;bSel.appendChild(o);});
  const thisYear=new Date().getFullYear();
  for(let y=thisYear;y<=thisYear+1;y++){const o=document.createElement('option');o.value=String(y);o.textContent=y;ySel.appendChild(o);}
  hSel.dataset.filled='1';
}
function setFotoUlangValue(tglStr){
  populateFotoUlangSelects();
  const s=String(tglStr||'').slice(0,10);
  const m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  document.getElementById('fuTahun').value=m?m[1]:'';
  document.getElementById('fuBulan').value=m?m[2]:'';
  document.getElementById('fuHari').value=m?m[3]:'';
}
function getFotoUlangValue(){
  const h=document.getElementById('fuHari').value, b=document.getElementById('fuBulan').value, y=document.getElementById('fuTahun').value;
  if(!h||!b||!y) return '';
  return `${y}-${b}-${h}`;
}
function formatFotoUlangReadable(tglStr){
  const s=String(tglStr||'').slice(0,10);
  const m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m) return '—';
  return `${parseInt(m[3])} ${MONTH_FULL_NAMES[parseInt(m[2])-1]} ${m[1]}`;
}

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
  return m < 60 ? `Login ${m} mnt lalu` : `Login ${Math.floor(m/60)} jam lalu`;
}

function spawnParticles() {
  const c = document.getElementById('particles');
  if (!c) return;
  for (let i = 0; i < 12; i++) {
    setTimeout(() => {
      const p = document.createElement('div');
      p.className = 'particle';
      const sz = Math.random()*4+2, x = Math.random()*100, dur = Math.random()*12+10;
      p.style.cssText = `width:${sz}px;height:${sz}px;left:${x}%;bottom:-10px;opacity:${Math.random()*.4+.2};--dx:${(Math.random()-.5)*70}px;animation-duration:${dur}s;animation-delay:${Math.random()*5}s;animation-iteration-count:infinite;`;
      c.appendChild(p);
    }, i * 180);
  }
}

let tokenAttempts = MAX_ATTEMPTS, lockoutTimer = null;

function togglePw() {
  const inp = document.getElementById('loginPass');
  const btn = document.getElementById('pwToggle');
  if (inp.type==='password') { inp.type='text'; btn.textContent='🙈'; }
  else { inp.type='password'; btn.textContent='👁'; }
}

async function doLogin() {
  const u = document.getElementById('loginUser').value.trim();
  const p = document.getElementById('loginPass').value.trim();
  const err = document.getElementById('loginErr');
  const btn = document.getElementById('loginBtn');
  if (!u||!p) { showLoginErr('Username dan password tidak boleh kosong.'); return; }
  btn.disabled = true; btn.textContent = '⏳ Memverifikasi...';
  err.classList.remove('show');
  try {
    const res  = await fetch(SHEET_URL, { method:'POST', headers:{'Content-Type':'text/plain'}, body: JSON.stringify({action:'adminLogin',username:u,password:p}) });
    const json = await res.json();
    if (json.ok) { saveSession(json.displayName||u, u); bootDashboard(json.displayName||u); }
    else {
      tokenAttempts = Math.max(0, tokenAttempts-1);
      updateAttemptDots();
      showLoginErr(json.error||'Username atau password salah.');
      if (tokenAttempts<=0) { startLockout(); return; }
    }
  } catch { showLoginErr('⚠ Gagal terhubung ke server. Periksa koneksi internet.'); }
  btn.disabled = false; btn.textContent = '▶ MASUK SISTEM';
}

function showLoginErr(msg) {
  const err = document.getElementById('loginErr');
  err.textContent = msg;
  err.classList.remove('show'); void err.offsetWidth; err.classList.add('show');
}
function updateAttemptDots() {
  document.querySelectorAll('.attempt-dot').forEach((d,i) => { d.className = 'attempt-dot'+(i<(MAX_ATTEMPTS-tokenAttempts)?' used':''); });
}
function startLockout() {
  const btn=document.getElementById('loginBtn'),bar=document.getElementById('lockoutBar'),
        fill=document.getElementById('lockoutFill'),txt=document.getElementById('lockoutText'),
        uI=document.getElementById('loginUser'),pI=document.getElementById('loginPass');
  btn.disabled=true; btn.textContent='🔒 Terkunci'; uI.disabled=true; pI.disabled=true;
  bar.classList.add('show'); fill.style.width='100%';
  let remaining=LOCKOUT_SECONDS; txt.textContent=`Terkunci. Tunggu ${remaining} detik...`;
  lockoutTimer = setInterval(()=>{
    remaining--;
    fill.style.width=(remaining/LOCKOUT_SECONDS*100)+'%';
    txt.textContent=`Terkunci. Tunggu ${remaining} detik...`;
    if(remaining<=0){
      clearInterval(lockoutTimer); tokenAttempts=MAX_ATTEMPTS;
      btn.disabled=false; btn.textContent='▶ MASUK SISTEM';
      uI.disabled=false; pI.disabled=false; bar.classList.remove('show');
      document.getElementById('loginErr').classList.remove('show'); updateAttemptDots();
    }
  },1000);
}
function doLogout() {
  if(!confirm('Yakin keluar dari sistem?')) return;
  clearSession(); clearInterval(autoRefreshInterval);
  document.getElementById('adminShell').style.display='none';
  document.getElementById('loginPage').classList.add('visible');
  document.getElementById('loginUser').value=''; document.getElementById('loginPass').value='';
  tokenAttempts=MAX_ATTEMPTS; updateAttemptDots();
  document.getElementById('loginErr').classList.remove('show');
}
function bootDashboard(displayName) {
  document.getElementById('officerName').textContent = displayName;
  const session = getSession();
  const expiry  = document.getElementById('sessionExpiry');
  if (expiry&&session) expiry.textContent = getSessionAge(session);
  document.getElementById('loginPage').classList.remove('visible');
  document.getElementById('adminShell').style.display='block';
  loadLocalStatus(); loadData(); startClock(); startAutoRefresh();
}

let autoRefreshInterval, arCountdown=30;

function startClock() {
  const days=['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
  const months=['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  setInterval(()=>{
    const n=new Date();
    document.getElementById('liveClock').textContent=n.toLocaleTimeString('id-ID',{hour12:false});
    const de=document.getElementById('liveDate');
    if(de) de.textContent=`${days[n.getDay()]}, ${n.getDate()} ${months[n.getMonth()]} ${n.getFullYear()}`;
    const session=getSession(), expiry=document.getElementById('sessionExpiry');
    if(expiry&&session&&n.getSeconds()===0) expiry.textContent=getSessionAge(session);
  },1000);
}
function startAutoRefresh() {
  arCountdown=30; clearInterval(autoRefreshInterval);
  autoRefreshInterval=setInterval(()=>{
    const modalOpen =
      document.getElementById('modalOverlay').classList.contains('show') ||
      document.getElementById('deleteOverlay').classList.contains('show') ||
      document.getElementById('lightbox').classList.contains('show');
    if(modalOpen) return;
    arCountdown--;
    const el=document.getElementById('arTimer'); if(el) el.textContent=arCountdown+'s';
    if(arCountdown<=0){loadData(false);arCountdown=30;}
  },1000);
}

let localStatus={};
function loadLocalStatus() { try{localStatus=JSON.parse(localStorage.getItem(STATUS_KEY)||'{}')}catch{localStatus={}} }
function saveLocalStatus()  { localStorage.setItem(STATUS_KEY,JSON.stringify(localStatus)) }
function getRowKey(r)       { return (r.nama||'')+'_'+(r.tanggal||'')+'_'+(r.jam||'')+'_'+(r.hp||'') }

let allData=[], currentPage=1, currentRow=null, pendingDeleteKey=null, rsFilter='all';
const PAGE_SIZE=12;

function normTanggal(v) {
  if(!v) return '';
  const s=String(v);
  if(s.includes('T')||s.match(/^\d{4}-\d{2}-\d{2}/)) return s.slice(0,10);
  return s;
}

async function loadData(manual=false) {
  const btn=document.querySelector('.refresh-btn');
  if(btn) btn.classList.add('spinning');
  try {
    const res  = await fetch(SHEET_URL+'?action=get',{cache:'no-store'});
    const json = await res.json();
    const raw  = Array.isArray(json)?json:(json.data||[]);
    allData = raw.map(r=>{
      const key=getRowKey(r), cached=localStatus[key]||{};
      const sheetStatus=r.status&&String(r.status).trim()!==''?r.status:null;
      return {
        ...r,
        tanggal:            normTanggal(r.tanggal),
        _key:               key,
        status:             sheetStatus||cached.status||'Menunggu',
        note:               (r.note&&String(r.note).trim()!=='')?r.note:(cached.note||''),
        reg:                r.no_registrasi||r.reg||'',
        _rowIndex:          r._rowIndex||null,
        reschedule_status:  r.reschedule_status||'',
        reschedule_tanggal: normTanggal(r.reschedule_tanggal||''),
        reschedule_jam:     r.reschedule_jam||'',
        reschedule_slot_id: r.reschedule_slot_id||'',
        reschedule_alasan:  r.reschedule_alasan||'',
        reschedule_count:   r.reschedule_count||'0',
      };
    });
    allData.sort((a,b)=>(parseInt(b._rowIndex)||0)-(parseInt(a._rowIndex)||0));
    const lu=document.getElementById('lastUpdate');
    if(lu) lu.textContent='Terakhir: '+new Date().toLocaleTimeString('id-ID',{hour12:false});
    if(manual) showToast('success','✓ Data berhasil diperbarui');
    startAutoRefresh();

    buildMonthYearOptions();

  } catch(e) {
    console.error('loadData:',e);
    if(manual) showToast('error','⚠ Gagal mengambil data');
  }
  if(btn) btn.classList.remove('spinning');
  renderAll();
}

function getYearsFromData() {
  const set = new Set();
  allData.forEach(r => {
    const y = (r.tanggal||'').slice(0,4);
    if (y.match(/^\d{4}$/)) set.add(y);
  });
  return [...set].sort((a,b)=>parseInt(b)-parseInt(a));
}

function getMonthsWithData(year) {
  const set = new Set();
  allData.forEach(r => {
    const tgl = r.tanggal||'';
    if (!year || tgl.startsWith(year)) {
      const m = tgl.slice(5,7);
      if (m.match(/^\d{2}$/)) set.add(m);
    }
  });
  return [...set].sort();
}

function buildMonthYearOptions() {
  const yearSel = document.getElementById('filterYear');
  const years   = getYearsFromData();
  const prevYear = yearSel.value;

  yearSel.innerHTML = '<option value="">Semua Tahun</option>' +
    years.map(y=>`<option value="${y}">${y}</option>`).join('');

  if (prevYear && years.includes(prevYear)) yearSel.value = prevYear;
  else { yearSel.value = ''; activeYear = ''; }

  activeYear = yearSel.value;

  renderMonthChips();
}

function renderMonthChips() {
  const container = document.getElementById('monthChips');
  const months    = getMonthsWithData(activeYear);

  let html = `<button class="month-chip ${activeMonth==='all'?'active active-all':''}" onclick="setMonthFilter('all')">Semua</button>`;
  html += months.map(m => {
    const label = MONTH_NAMES[parseInt(m)-1];
    return `<button class="month-chip ${activeMonth===m?'active':''}" onclick="setMonthFilter('${m}')">${label}</button>`;
  }).join('');

  container.innerHTML = html;

  const badge    = document.getElementById('filterActiveBadge');
  const clearBtn = document.getElementById('filterClearBtn');
  const isActive = activeMonth !== 'all' || activeYear !== '';

  if (isActive) {
    badge.style.display    = 'inline-flex';
    clearBtn.style.display = 'inline-flex';
    let txt = '';
    if (activeMonth !== 'all') txt += MONTH_NAMES[parseInt(activeMonth)-1];
    if (activeYear)             txt += (txt?' ':'') + activeYear;
    document.getElementById('filterBadgeText').textContent = txt;
  } else {
    badge.style.display    = 'none';
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
  activeYear  = '';
  document.getElementById('filterYear').value = '';
  renderMonthChips();
  resetPageAndRender();
}

function resetPageAndRender() {
  currentPage = 1;
  activeYear = document.getElementById('filterYear').value || '';
  // Kalau ganti tahun, cek apakah bulan aktif masih punya data
  if (activeMonth !== 'all') {
    const available = getMonthsWithData(activeYear);
    if (!available.includes(activeMonth)) activeMonth = 'all';
  }
  renderMonthChips();
  renderTable();
}

function getFiltered() {
  const q  = (document.getElementById('searchInput')?.value||'').toLowerCase();
  const fs = document.getElementById('filterStatus')?.value||'';
  const fj = document.getElementById('filterJenis')?.value||'';

  return allData.filter(r => {
    const tgl = r.tanggal||'';

    if (activeYear && !tgl.startsWith(activeYear)) return false;

    if (activeMonth !== 'all') {
      const m = tgl.slice(5,7);
      if (m !== activeMonth) return false;
    }

    const mQ = !q || (r.nama||'').toLowerCase().includes(q) || (r.reg||'').toLowerCase().includes(q) || (r.hp||'').includes(q);
    const mS = !fs || r.status===fs;
    const mJ = !fj || r.jenis_permohonan===fj;
    return mQ && mS && mJ;
  });
}

function renderAll() {
  renderStats(); renderDashTable(); renderTable(); renderRsTable(); renderRecap();
  const wait=allData.filter(r=>r.status==='Menunggu').length;
  document.getElementById('navBadge').textContent=wait;
  const rsPending=allData.filter(r=>r.reschedule_status==='Pending').length;
  const rsBadge=document.getElementById('navRsBadge');
  rsBadge.textContent=rsPending; rsBadge.style.display=rsPending>0?'inline-flex':'none';
  const meta=document.getElementById('rsBannerMeta');
  if(meta) meta.innerHTML=rsPending>0
    ?`<div class="banner-live" style="color:#FDBA74;background:rgba(249,115,22,0.08);border-color:rgba(249,115,22,0.25);">${rsPending} Pending</div>`:'';
}

function renderStats() {
  animateNum('sc-total',allData.length);
  animateNum('sc-wait', allData.filter(r=>r.status==='Menunggu').length);
  animateNum('sc-conf', allData.filter(r=>r.status==='Dikonfirmasi').length);
  animateNum('sc-done', allData.filter(r=>r.status==='Selesai').length);
  animateNum('sc-rs',   allData.filter(r=>r.reschedule_status==='Pending').length);
}
function animateNum(id,target) {
  const el=document.getElementById(id); let cur=parseInt(el.textContent)||0;
  const step=Math.ceil(Math.abs(target-cur)/16)||1;
  const iv=setInterval(()=>{
    cur=cur<target?Math.min(cur+step,target):Math.max(cur-step,target);
    el.textContent=cur; if(cur===target) clearInterval(iv);
  },30);
}

function formatTgl(tgl) {
  if(!tgl) return '—';
  const s=String(tgl).slice(0,10);
  if(!s.match(/^\d{4}-\d{2}-\d{2}$/)) return s;
  const [y,m,d]=s.split('-');
  return `${parseInt(d)} ${MONTH_NAMES[parseInt(m)-1]} ${y}`;
}
function formatTglFull(tgl) {
  if(!tgl) return '—';
  const s=String(tgl).slice(0,10);
  if(!s.match(/^\d{4}-\d{2}-\d{2}$/)) return s;
  try{return new Date(s+'T12:00:00').toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'});}
  catch{return s;}
}

function renderDashTable() {
  const recent=allData.slice(0,10);
  const tbody=document.getElementById('dashBody');
  if(!recent.length){tbody.innerHTML='<tr><td colspan="6" style="text-align:center;padding:38px;color:var(--text3)">Belum ada data</td></tr>';return;}
  tbody.innerHTML=recent.map((r,i)=>`
    <tr class="row-enter" style="animation-delay:${i*.04}s" onclick="openModal('${escKey(r._key)}')">
      <td><span class="t-code">${r.reg||'—'}</span></td>
      <td><div class="t-name">${r.nama||'—'}</div><div class="t-sub">${r.jk||''}</div></td>
      <td style="font-size:11.5px">${r.jenis_permohonan||'—'}</td>
      <td style="font-size:11.5px">${formatTgl(r.tanggal)}<div class="t-sub">${r.jam||''}</div></td>
      <td>${badgeHtml(r.status,r.reschedule_status)}</td>
      <td><button class="action-btn" onclick="event.stopPropagation();openModal('${escKey(r._key)}')">👁 Detail</button></td>
    </tr>`).join('');
}

function renderTable() {
  const filtered=getFiltered();
  const total=filtered.length, totalPages=Math.ceil(total/PAGE_SIZE)||1;
  if(currentPage>totalPages) currentPage=totalPages;
  const start=(currentPage-1)*PAGE_SIZE, page=filtered.slice(start,start+PAGE_SIZE);

  // Subtitle: tampilkan info filter aktif
  let subtitleTxt = total+' data ditemukan';
  if (activeMonth!=='all' || activeYear) {
    let label='';
    if (activeMonth!=='all') label += MONTH_NAMES[parseInt(activeMonth)-1];
    if (activeYear)          label += (label?' ':'') + activeYear;
    subtitleTxt += ` · Filter: ${label}`;
  }
  document.getElementById('tblSubtitle').textContent = subtitleTxt;
  document.getElementById('pgInfo').textContent = `Menampilkan ${total?start+1:0}–${Math.min(start+PAGE_SIZE,total)} dari ${total}`;

  const tbody=document.getElementById('mainBody');
  if(!page.length){
    tbody.innerHTML=`<tr><td colspan="9"><div class="empty-state"><div class="empty-ic">🔍</div><h3>Tidak ada data</h3><p>Coba ubah filter atau pilih bulan lain</p></div></td></tr>`;
  } else {
    tbody.innerHTML=page.map((r,i)=>`
      <tr class="row-enter" style="animation-delay:${i*.03}s" onclick="openModal('${escKey(r._key)}')">
        <td style="color:var(--text3);font-size:11px">${start+i+1}</td>
        <td><span class="t-code">${r.reg||'—'}</span></td>
        <td><div class="t-name">${r.nama||'—'}</div><div class="t-sub">${r.ttl||''}</div></td>
        <td style="font-size:11.5px;font-family:'JetBrains Mono',monospace;color:var(--text2)">${r.hp||'—'}</td>
        <td style="font-size:11.5px">${r.jenis_permohonan||'—'}</td>
        <td style="font-size:11.5px">${formatTgl(r.tanggal)}<div class="t-sub">${r.jam||''}</div></td>
        <td>${badgeHtml(r.status,r.reschedule_status)}</td>
        <td style="font-size:10px;color:var(--text3)">${r.waktu_daftar||'—'}</td>
        <td style="display:flex;gap:4px;align-items:center">
          <button class="action-btn" onclick="event.stopPropagation();openModal('${escKey(r._key)}')">👁</button>
          <button class="action-btn del" onclick="event.stopPropagation();openDeleteFromTable('${escKey(r._key)}')">🗑️</button>
        </td>
      </tr>`).join('');
  }
  renderPagination(totalPages);
}

function renderPagination(total) {
  let html=`<button class="pg-btn" onclick="changePage(${currentPage-1})" ${currentPage<=1?'disabled':''}>←</button>`;
  const s=Math.max(1,currentPage-2),e=Math.min(total,s+4);
  for(let i=s;i<=e;i++) html+=`<button class="pg-btn ${i===currentPage?'active':''}" onclick="changePage(${i})">${i}</button>`;
  html+=`<button class="pg-btn" onclick="changePage(${currentPage+1})" ${currentPage>=total?'disabled':''}>→</button>`;
  document.getElementById('pgBtns').innerHTML=html;
}
function changePage(p){currentPage=p;renderTable();window.scrollTo({top:0,behavior:'smooth'});}

function setRsFilter(val,el){
  rsFilter=val;
  document.querySelectorAll('.rs-filter-btn').forEach(b=>b.classList.remove('active'));
  if(el) el.classList.add('active');
  renderRsTable();
}
function getRsData(){
  return allData.filter(r=>{
    const hasRs=r.reschedule_status&&r.reschedule_status!=='';
    if(!hasRs) return false;
    if(rsFilter==='all') return true;
    return r.reschedule_status===rsFilter;
  });
}
function renderRsTable(){
  const data=getRsData();
  const subtitle=document.getElementById('rsSubtitle');
  if(subtitle) subtitle.textContent=data.length+' pengajuan ditemukan';
  const tbody=document.getElementById('rsBody');
  if(!data.length){
    tbody.innerHTML=`<tr><td colspan="8"><div class="empty-state"><div class="empty-ic">🔄</div><h3>Tidak ada pengajuan</h3><p>Belum ada pengajuan reschedule${rsFilter!=='all'?' dengan status '+rsFilter:''}</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML=data.map((r,i)=>`
    <tr class="row-enter" style="animation-delay:${i*.03}s" onclick="openModal('${escKey(r._key)}')">
      <td><span class="t-code">${r.reg||'—'}</span></td>
      <td><div class="t-name">${r.nama||'—'}</div></td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:10.5px;color:var(--text2)">${r.nik||'—'}</td>
      <td><div class="rs-jadwal-row"><div style="font-size:11px;color:var(--text2)">${formatTgl(r.tanggal)}</div><div style="font-size:10px;color:var(--text3)">${r.jam||'—'}</div></div></td>
      <td><div class="rs-jadwal-row"><div class="rs-jadwal-new">${formatTgl(r.reschedule_tanggal)||'—'}</div><div style="font-size:10px;color:#FDBA74">${r.reschedule_jam||'—'}</div></div></td>
      <td style="max-width:160px;"><div style="font-size:11px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${r.reschedule_alasan||''}">${r.reschedule_alasan||'—'}</div></td>
      <td>${rsBadgeHtml(r.reschedule_status)}</td>
      <td>${r.reschedule_status==='Pending'
        ?`<div style="display:flex;gap:5px"><button class="action-btn approve" onclick="event.stopPropagation();approveReschedule('${escKey(r._key)}')">✓ Setuju</button><button class="action-btn reject" onclick="event.stopPropagation();rejectReschedule('${escKey(r._key)}')">✕ Tolak</button></div>`
        :`<button class="action-btn" onclick="event.stopPropagation();openModal('${escKey(r._key)}')">👁 Detail</button>`}
      </td>
    </tr>`).join('');
}

function rsBadgeHtml(s){
  if(s==='Pending')   return`<span class="badge badge-rspending"><span class="badge-dot"></span>Pending</span>`;
  if(s==='Disetujui') return`<span class="badge badge-rsapprove"><span class="badge-dot"></span>Disetujui</span>`;
  if(s==='Ditolak')   return`<span class="badge badge-rsreject"><span class="badge-dot"></span>Ditolak</span>`;
  return`<span class="badge" style="background:var(--surface2);color:var(--text3)">${s||'—'}</span>`;
}

async function approveReschedule(key){
  const row=allData.find(r=>r._key===key);
  if(!row||!row._rowIndex) return;
  if(!confirm(`Setujui reschedule untuk ${row.nama}?\nJadwal baru: ${formatTgl(row.reschedule_tanggal)}, ${row.reschedule_jam}`)) return;
  showLoading();
  try{
    const res=await fetch(SHEET_URL,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({action:'approveReschedule',_rowIndex:row._rowIndex,new_tanggal:row.reschedule_tanggal,new_jam:row.reschedule_jam,new_slot_id:row.reschedule_slot_id})});
    const json=await res.json();
    if(json.ok){row.tanggal=row.reschedule_tanggal;row.jam=row.reschedule_jam;row.reschedule_status='Disetujui';row.status='Dikonfirmasi';showToast('success','✓ Reschedule disetujui! Jadwal diperbarui.');renderAll();}
    else showToast('error','⚠ Gagal: '+(json.error||'Error server'));
  }catch{showToast('error','⚠ Gagal terhubung ke server');}
  hideLoading();
}
async function rejectReschedule(key){
  const row=allData.find(r=>r._key===key);
  if(!row||!row._rowIndex) return;
  if(!confirm(`Tolak reschedule untuk ${row.nama}?\nJadwal lama tetap berlaku.`)) return;
  showLoading();
  try{
    const res=await fetch(SHEET_URL,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({action:'rejectReschedule',_rowIndex:row._rowIndex})});
    const json=await res.json();
    if(json.ok){row.reschedule_status='Ditolak';row.status='Menunggu';showToast('info','Reschedule ditolak. Jadwal lama tetap berlaku.');renderAll();}
    else showToast('error','⚠ Gagal: '+(json.error||'Error server'));
  }catch{showToast('error','⚠ Gagal terhubung ke server');}
  hideLoading();
}

let loadingTimer;
function showLoading(){const t=document.getElementById('toast');t.textContent='⏳ Memproses...';t.className='info show';}
function hideLoading(){clearTimeout(loadingTimer);}

function badgeHtml(status,rsStatus){
  if(rsStatus==='Pending')    return`<span class="badge badge-prs"><span class="badge-dot"></span>Pending RS</span>`;
  if(status==='Menunggu')     return`<span class="badge badge-wait"><span class="badge-dot"></span>Menunggu</span>`;
  if(status==='Dikonfirmasi') return`<span class="badge badge-conf"><span class="badge-dot"></span>Dikonfirmasi</span>`;
  if(status==='Selesai')      return`<span class="badge badge-done"><span class="badge-dot"></span>Selesai</span>`;
  return`<span class="badge" style="background:var(--surface2);color:var(--text2)">${status||'—'}</span>`;
}
function escKey(k){return(k||'').replace(/'/g,"\\'")}

function openModal(key){
  const row=allData.find(r=>r._key===key);
  if(!row) return;
  currentRow=row;
  document.getElementById('mTitle').textContent =row.nama||'—';
  document.getElementById('mSub').textContent   =(row.reg||'—')+' · '+badgeText(row.status,row.reschedule_status);
  document.getElementById('m-reg').textContent  =row.reg||'—';
  document.getElementById('m-waktu').textContent=row.waktu_daftar||'—';
  document.getElementById('m-nama').textContent =row.nama||'—';
  document.getElementById('m-ttl').textContent  =row.ttl||'—';
  document.getElementById('m-jk').textContent   =row.jk||'—';
  document.getElementById('m-hp').textContent   =row.hp||'—';
  document.getElementById('m-jadwal').textContent=formatTglFull(row.tanggal)+' · '+(row.jam||'—');
  document.getElementById('m-jenis').textContent =row.jenis_permohonan||'—';
  document.getElementById('m-paspor').textContent=row.jenis_paspor||'—';
  document.getElementById('m-tujuan').textContent=row.tujuan||'—';
  const fuItem=document.getElementById('m-fu-item');
  if(row.foto_ulang_tanggal && String(row.foto_ulang_tanggal).trim()!==''){
    fuItem.style.display='block';
    document.getElementById('m-fu-jadwal').textContent=formatFotoUlangReadable(row.foto_ulang_tanggal);
  } else {
    fuItem.style.display='none';
  }
  const DOCS=[
    {key:'url_ktp',label:'E-KTP',icon:'🪪'},
    {key:'url_kk',label:'Kartu Keluarga',icon:'👨‍👩‍👧'},
    {key:'url_akta',label:'Akta / Ijazah / Buku Nikah',icon:'📜'},
    {key:'url_foto_paspor',label:'Foto Paspor Rusak/Hilang',icon:'📕'},
    {key:'url_surat_polisi',label:'Surat Keterangan Polisi',icon:'🚔'},
    {key:'url_surat_kelurahan',label:'Surat Keterangan Kelurahan',icon:'🏢'},
    {key:'url_surat_pemerintah',label:'Surat Resmi Pemerintah',icon:'🏛️'},
    {key:'url_pendukung',label:'Dokumen Pendukung',icon:'📄'},
  ];
  const container=document.getElementById('docContainer');
  const hasAny=DOCS.some(d=>row[d.key]&&String(row[d.key]).trim()!=='');
  if(!hasAny){container.innerHTML=`<div style="text-align:center;padding:44px 20px;color:var(--text3)"><div style="font-size:38px;margin-bottom:10px;opacity:0.22">📂</div><div style="font-size:13.5px;font-weight:700;margin-bottom:5px;color:var(--text2)">Tidak ada dokumen</div><div style="font-size:11.5px">Pemohon belum melampirkan dokumen</div></div>`;}
  else{container.innerHTML=DOCS.map(d=>{
    const url=row[d.key];
    if(!url||String(url).trim()==='') return`<div class="doc-block"><div class="doc-block-head"><span class="dh-icon">${d.icon}</span><span class="dh-label">${d.label}</span><span class="dh-badge tdk">Tidak dilampirkan</span></div></div>`;
    const isPdf=url.toLowerCase().includes('.pdf')||url.toLowerCase().includes('/raw/');
    return`<div class="doc-block"><div class="doc-block-head"><span class="dh-icon">${d.icon}</span><span class="dh-label">${d.label}</span><span class="dh-badge ada">✓ Tersedia</span></div><div class="doc-img-area">${isPdf
      ?`<div style="text-align:center;color:var(--text3)"><div style="font-size:36px;margin-bottom:9px">📄</div><div style="font-size:12.5px;margin-bottom:11px">File PDF</div><a href="${url}" target="_blank" style="background:var(--sky-500);color:white;padding:7px 17px;border-radius:8px;font-size:11.5px;font-weight:800;text-decoration:none">⤢ Buka PDF</a></div>`
      :`<img src="${url}" alt="${d.label}" loading="lazy" onclick="openLightbox('${url.replace(/'/g,"\\'")}','${d.label}')" onerror="this.style.display='none';this.nextElementSibling.style.display='block'" title="Klik untuk zoom"><div class="doc-img-error" style="display:none">Gagal muat.<br><a href="${url}" target="_blank">Buka di tab baru →</a></div>`
    }<a href="${url}" target="_blank" class="doc-open-pill">⤢ Buka</a></div></div>`;
  }).join('');}

  document.getElementById('m-note').value=row.note||'';
  document.querySelectorAll('.status-opt').forEach(o=>{
    o.className='status-opt';
    if(o.dataset.val===row.status) o.classList.add(row.status==='Menunggu'?'selected-wait':row.status==='Dikonfirmasi'?'selected-conf':'selected-done');
  });

  // Jika BAP sudah Selesai: sembunyikan opsi Menunggu/Dikonfirmasi & kunci status di Selesai
  const isDone=row.status==='Selesai';
  document.querySelectorAll('.status-opt[data-val="Menunggu"], .status-opt[data-val="Dikonfirmasi"]').forEach(o=>{
    o.style.display=isDone?'none':'';
  });
  const doneOpt=document.querySelector('.status-opt[data-val="Selesai"]');
  if(isDone && doneOpt) doneOpt.classList.add('locked');
  document.getElementById('statusLockedNote').style.display=isDone?'block':'none';

  // Section jadwal foto ulang paspor
  const fuSection=document.getElementById('fotoUlangSection');
  if(isDone){
    fuSection.style.display='block';
    setFotoUlangValue(row.foto_ulang_tanggal);
  } else {
    fuSection.style.display='none';
  }
  const rsTabEl=document.getElementById('rsTab');
  const hasRs=row.reschedule_status&&row.reschedule_status!=='';
  rsTabEl.style.display=hasRs?'block':'none';
  if(hasRs){
    const panel=document.getElementById('rsDetailPanel');
    const isApproved=row.reschedule_status==='Disetujui', isRejected=row.reschedule_status==='Ditolak';
    panel.innerHTML=`<div class="rs-detail-panel"><h4>🔄 Detail Pengajuan Reschedule &nbsp; ${rsBadgeHtml(row.reschedule_status)}</h4><div class="rs-detail-grid"><div class="rs-detail-item"><div class="rs-detail-key">Jadwal Lama</div><div class="rs-detail-val">${formatTglFull(row.tanggal)}, ${row.jam||'—'}</div></div><div class="rs-detail-item"><div class="rs-detail-key">Jadwal Baru Diminta</div><div class="rs-detail-val" style="color:#FDBA74">${formatTglFull(row.reschedule_tanggal)}, ${row.reschedule_jam||'—'}</div></div><div class="rs-detail-item full"><div class="rs-detail-key">Alasan Reschedule</div><div class="rs-detail-val">${row.reschedule_alasan||'—'}</div></div></div>${row.reschedule_status==='Pending'?`<div class="rs-action-row"><button class="rs-approve-btn" onclick="approveRescheduleModal()">✓ Setujui Reschedule</button><button class="rs-reject-btn" onclick="rejectRescheduleModal()">✕ Tolak Reschedule</button></div>`:isApproved?`<div style="margin-top:12px;padding:10px 13px;background:rgba(5,150,105,0.08);border:1px solid rgba(5,150,105,0.2);border-radius:9px;font-size:12px;color:#6EE7B7;font-weight:700">✅ Reschedule telah disetujui. Jadwal telah diperbarui.</div>`:isRejected?`<div style="margin-top:12px;padding:10px 13px;background:rgba(220,38,38,0.07);border:1px solid rgba(220,38,38,0.2);border-radius:9px;font-size:12px;color:#FCA5A5;font-weight:700">❌ Reschedule ditolak. Jadwal lama tetap berlaku.</div>`:''}</div>`;
  }
  switchTab('data',document.querySelector('.mtab[data-tab="data"]'));
  document.getElementById('modalOverlay').classList.add('show');
  document.body.style.overflow='hidden';
}

function approveRescheduleModal(){if(currentRow) approveReschedule(currentRow._key).then(()=>closeModal());}
function rejectRescheduleModal() {if(currentRow) rejectReschedule(currentRow._key).then(()=>closeModal());}
function badgeText(s,rs){if(rs==='Pending')return'Pending Reschedule';return s||'Menunggu';}
function closeModal(){document.getElementById('modalOverlay').classList.remove('show');document.body.style.overflow='';currentRow=null;}
function switchTab(name,el){
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.mtab').forEach(t=>t.classList.remove('active'));
  document.getElementById('tab-'+name).classList.add('active');
  if(el) el.classList.add('active');
}
function selectStatus(el){
  if(el.classList.contains('locked')) return;
  document.querySelectorAll('.status-opt').forEach(o=>{
    const locked=o.classList.contains('locked');
    o.className='status-opt'+(locked?' locked':'');
  });
  const v=el.dataset.val;
  el.classList.add(v==='Menunggu'?'selected-wait':v==='Dikonfirmasi'?'selected-conf':'selected-done');
  const fuSection=document.getElementById('fotoUlangSection');
  if(v==='Selesai'){
    populateFotoUlangSelects();
    if(!currentRow||!currentRow.foto_ulang_tanggal) setFotoUlangValue('');
    fuSection.style.display='block';
  } else {
    fuSection.style.display='none';
  }
}

async function saveStatus(){
  if(!currentRow) return;
  const sel=document.querySelector('.status-opt[class*="selected"]');
  if(!sel){showToast('error','Pilih status terlebih dahulu');return;}
  const newStatus=sel.dataset.val, note=document.getElementById('m-note').value.trim();

  let fotoUlangTanggal='';
  if(newStatus==='Selesai'){
    fotoUlangTanggal=getFotoUlangValue();
    if(!fotoUlangTanggal){
      showToast('error','Pilih tanggal foto ulang paspor (Hari/Bulan/Tahun) sebelum menyimpan');
      return;
    }
  }

  const rowKey=currentRow._key, rowIndex=currentRow._rowIndex;
  const rowInData=allData.find(r=>r._key===rowKey);
  if(rowInData){
    rowInData.status=newStatus;rowInData.note=note;
    if(newStatus==='Selesai') rowInData.foto_ulang_tanggal=fotoUlangTanggal;
  }
  localStatus[rowKey]={status:newStatus,note,foto_ulang_tanggal:fotoUlangTanggal}; saveLocalStatus(); renderAll(); closeModal();
  if(rowIndex){
    showToast('info','⏳ Menyimpan ke sheet...');
    try{
      const payload={action:'updateStatus',_rowIndex:rowIndex,status:newStatus,note};
      if(newStatus==='Selesai') payload.foto_ulang_tanggal=fotoUlangTanggal;
      const res=await fetch(SHEET_URL,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify(payload)});
      const json=await res.json();
      if(json.ok){showToast('success',`✓ Status "${newStatus}" tersimpan`);delete localStatus[rowKey];saveLocalStatus();}
      else showToast('error','⚠ Sheet error — disimpan lokal');
    }catch{showToast('error','⚠ Gagal kirim — disimpan lokal');}
  } else {showToast('success',`✓ Status: ${newStatus} (lokal)`);}
}

function confirmDelete(){if(!currentRow)return;pendingDeleteKey=currentRow._key;document.getElementById('deleteName').textContent=currentRow.nama||'—';closeModal();document.getElementById('deleteOverlay').classList.add('show');document.body.style.overflow='hidden';}
function openDeleteFromTable(key){const row=allData.find(r=>r._key===key);if(!row)return;pendingDeleteKey=key;document.getElementById('deleteName').textContent=row.nama||'—';document.getElementById('deleteOverlay').classList.add('show');document.body.style.overflow='hidden';}
function closeDeleteModal(){document.getElementById('deleteOverlay').classList.remove('show');document.body.style.overflow='';pendingDeleteKey=null;}
async function executeDelete(){
  if(!pendingDeleteKey) return;
  const row=allData.find(r=>r._key===pendingDeleteKey);
  if(!row){closeDeleteModal();return;}
  allData=allData.filter(r=>r._key!==pendingDeleteKey);
  delete localStatus[pendingDeleteKey]; saveLocalStatus();
  closeDeleteModal(); renderAll(); showToast('info','⏳ Menghapus...');
  if(row._rowIndex){
    try{
      const res=await fetch(SHEET_URL,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({action:'deleteRow',_rowIndex:row._rowIndex})});
      const json=await res.json();
      if(json.ok) showToast('success','✓ Data dihapus');
      else showToast('error','⚠ Gagal hapus di sheet');
    }catch{showToast('error','⚠ Gagal hapus');}
  } else {showToast('success','✓ Data dihapus');}
  pendingDeleteKey=null;
}

function openLightbox(url,label){document.getElementById('lightbox-img').src=url;document.getElementById('lightbox-img').alt=label;document.getElementById('lightbox').classList.add('show');document.body.style.overflow='hidden';}
function closeLightbox(){document.getElementById('lightbox').classList.remove('show');document.body.style.overflow='';}

function renderRecap(){
  const total=allData.length||1;
  const statusData=[
    {label:'Menunggu',    count:allData.filter(r=>r.status==='Menunggu').length,    color:'#FCD34D'},
    {label:'Dikonfirmasi',count:allData.filter(r=>r.status==='Dikonfirmasi').length,color:'#93C5FD'},
    {label:'Selesai',     count:allData.filter(r=>r.status==='Selesai').length,     color:'#6EE7B7'},
    {label:'Pending RS',  count:allData.filter(r=>r.reschedule_status==='Pending').length,color:'#FDBA74'},
  ];
  document.getElementById('statusBars').innerHTML=statusData.map(s=>`
    <div class="recap-row"><span class="recap-key"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${s.color};margin-right:6px"></span>${s.label}</span><span class="recap-val">${s.count}</span></div>
    <div class="recap-bar"><div class="recap-bar-fill" style="width:${Math.round(s.count/total*100)}%;background:${s.color}"></div></div>`).join('');
  const jenisMap={};
  allData.forEach(r=>{const j=r.jenis_permohonan||'Lainnya';jenisMap[j]=(jenisMap[j]||0)+1;});
  const jColors=['#38BDF8','#60A5FA','#6EE7B7','#F472B6','#A78BFA','#FBBF24'];
  document.getElementById('jenisBars').innerHTML=Object.entries(jenisMap).sort((a,b)=>b[1]-a[1]).map(([k,v],i)=>`
    <div class="recap-row"><span class="recap-key" style="font-size:11.5px"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${jColors[i%jColors.length]};margin-right:6px"></span>${k.replace('BAP ','')}</span><span class="recap-val">${v}</span></div>
    <div class="recap-bar"><div class="recap-bar-fill" style="width:${Math.round(v/total*100)}%;background:${jColors[i%jColors.length]}"></div></div>`).join('');
  const sesiMap={};
  allData.forEach(r=>{const s=r.jam||'—';sesiMap[s]=(sesiMap[s]||0)+1;});
  document.getElementById('sesiTable').innerHTML=`<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse"><thead><tr style="background:rgba(14,165,233,0.04)"><th style="padding:9px 13px;font-size:9px;font-weight:800;color:var(--text3);text-align:left;letter-spacing:0.1em;text-transform:uppercase;border-bottom:1px solid var(--border)">Sesi</th><th style="padding:9px 13px;font-size:9px;font-weight:800;color:var(--text3);text-align:left;letter-spacing:0.1em;text-transform:uppercase;border-bottom:1px solid var(--border)">Jumlah</th><th style="padding:9px 13px;font-size:9px;font-weight:800;color:var(--text3);text-align:left;letter-spacing:0.1em;text-transform:uppercase;border-bottom:1px solid var(--border)">%</th></tr></thead><tbody>${Object.entries(sesiMap).sort().map(([k,v])=>`<tr><td style="padding:9px 13px;font-size:12.5px;font-weight:600">${k}</td><td style="padding:9px 13px;font-size:12.5px;color:var(--sky-400);font-weight:700">${v} orang</td><td style="padding:9px 13px;font-size:12.5px;color:var(--text2)">${Math.round(v/allData.length*100)}%</td></tr>`).join('')}<tr style="border-top:2px solid var(--border2);background:rgba(14,165,233,0.04)"><td style="padding:9px 13px;font-size:13px;font-weight:800;font-family:'Cinzel',serif;color:var(--sky-400)">TOTAL</td><td style="padding:9px 13px;font-size:13px;font-weight:900;color:var(--sky-400)">${allData.length} orang</td><td style="padding:9px 13px;font-size:13px;font-weight:700">100%</td></tr></tbody></table></div>`;
}

function exportExcel(){
  if(!window.XLSX){showToast('error','Library XLSX tidak tersedia');return;}
  const filtered=getFiltered();
  if(!filtered.length){showToast('error','Tidak ada data untuk diekspor');return;}

  let filterLabel='';
  if(activeMonth!=='all') filterLabel+=MONTH_NAMES[parseInt(activeMonth)-1];
  if(activeYear)          filterLabel+=(filterLabel?'_':'')+activeYear;
  if(!filterLabel)        filterLabel='Semua';

  const wb=XLSX.utils.book_new();
  const rows=filtered.map((r,i)=>({
    'No':i+1,'No. Registrasi':r.reg||'','Nama':r.nama||'','TTL':r.ttl||'','JK':r.jk||'',
    'No. HP':r.hp||'','Jenis BAP':r.jenis_permohonan||'','Jenis Paspor':r.jenis_paspor||'',
    'Tujuan':r.tujuan||'','Tanggal':r.tanggal||'','Sesi':r.jam||'','Status':r.status||'',
    'RS Status':r.reschedule_status||'','RS Tanggal':r.reschedule_tanggal||'',
    'RS Jam':r.reschedule_jam||'','RS Alasan':r.reschedule_alasan||'',
    'Catatan':r.note||'','Waktu Daftar':r.waktu_daftar||'',
  }));

  const ws=XLSX.utils.json_to_sheet(rows);

  const colWidths=[{wch:4},{wch:14},{wch:28},{wch:20},{wch:5},{wch:16},{wch:18},{wch:16},{wch:28},{wch:13},{wch:12},{wch:14},{wch:12},{wch:13},{wch:12},{wch:32},{wch:28},{wch:20}];
  ws['!cols']=colWidths;

  const sheetName='Data '+filterLabel;
  XLSX.utils.book_append_sheet(wb,ws,sheetName.slice(0,31));

  const ws2=XLSX.utils.json_to_sheet([
    {Status:'Menunggu',    Jumlah:filtered.filter(r=>r.status==='Menunggu').length},
    {Status:'Dikonfirmasi',Jumlah:filtered.filter(r=>r.status==='Dikonfirmasi').length},
    {Status:'Selesai',     Jumlah:filtered.filter(r=>r.status==='Selesai').length},
    {Status:'TOTAL',       Jumlah:filtered.length},
  ]);
  XLSX.utils.book_append_sheet(wb,ws2,'Rekap Status');

  const now=new Date();
  const datePart=`${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
  const fileName=`Rekap_BAP_${filterLabel}_${datePart}.xlsx`;
  XLSX.writeFile(wb,fileName);
  showToast('success',`✓ Export "${fileName}" berhasil`);
}

const pageTitles={
  dashboard:  ['Dashboard','Ringkasan & Data Terbaru'],
  pendaftar:  ['Data Pendaftar BAP','Seluruh pendaftar BAP'],
  reschedule: ['Manajemen Reschedule','Pengajuan perubahan jadwal pemohon'],
  rekap:      ['Rekap & Laporan','Statistik pendaftaran BAP'],
};
function navTo(page,el){
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  if(el) el.classList.add('active');
  document.querySelectorAll('.page-view').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-'+page).classList.add('active');
  const [t,s]=pageTitles[page]||[page,''];
  document.getElementById('topbarTitle').textContent=t;
  document.getElementById('topbarSub').textContent=s;
  closeSidebar();
}
function toggleSidebar(){document.getElementById('sidebar').classList.toggle('open');document.getElementById('sidebarOverlay').classList.toggle('show');}
function closeSidebar(){document.getElementById('sidebar').classList.remove('open');document.getElementById('sidebarOverlay').classList.remove('show');}

let toastTimer;
function showToast(type,msg){
  clearTimeout(toastTimer);
  const t=document.getElementById('toast');
  t.textContent=msg; t.className=type; t.classList.add('show');
  toastTimer=setTimeout(()=>t.classList.remove('show'),3400);
}

document.getElementById('modalOverlay').addEventListener('click', e=>{if(e.target===document.getElementById('modalOverlay')) closeModal();});
document.getElementById('deleteOverlay').addEventListener('click',e=>{if(e.target===document.getElementById('deleteOverlay')) closeDeleteModal();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeModal();closeLightbox();closeDeleteModal();}});

window.addEventListener('DOMContentLoaded',()=>{
  spawnParticles();
  const session=getSession();
  setTimeout(()=>{
    const splash=document.getElementById('splashScreen');
    splash.classList.add('hide');
    setTimeout(()=>splash.style.display='none',400);
    if(session) bootDashboard(session.displayName);
    else document.getElementById('loginPage').classList.add('visible');
  },1200);
});
