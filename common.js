const THEME_KEY='uphsd_theme',SESSION_KEY='uphsd_session',FLASH_KEY='uphsd_flash';
const ICON_MOON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
const ICON_SUN='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';
const DEFAULT_CATEGORIES=['Fiction','Science','History','Reference'];
const CUSTOM_COLORS=['#b3261e','#8a6a00','#1f6b41','#6b3fa0','#1a4b8f','#0e7490','#7c3aed','#c2410c','#15803d','#9333ea'];
const CAT_STYLES={Fiction:{badge:'b-fic',color:'#8a4b06'},Science:{badge:'b-sci',color:'#1a4b8f'},History:{badge:'b-his',color:'#5b2c9a'},Reference:{badge:'b-ref',color:'#1f6b41'}};

function getTheme(){return document.documentElement.getAttribute('data-theme')==='dark'?'dark':'light'}
function updateThemeIcons(){
  const dark=getTheme()==='dark';
  document.querySelectorAll('.theme-toggle:not([data-notif-bell])').forEach(b=>{
    b.innerHTML=dark?ICON_SUN:ICON_MOON;
    b.title=dark?'Switch to light mode':'Switch to dark mode';
    b.setAttribute('aria-label',b.title);
  });
}
function applyTheme(t){
  if(t==='dark'){document.documentElement.setAttribute('data-theme','dark');if(document.body)document.body.setAttribute('data-theme','dark')}
  else{document.documentElement.removeAttribute('data-theme');if(document.body)document.body.removeAttribute('data-theme')}
  try{localStorage.setItem(THEME_KEY,t)}catch(e){}
  updateThemeIcons();
}
function toggleTheme(){applyTheme(getTheme()==='dark'?'light':'dark')}
function initTheme(){
  let t=null;try{t=localStorage.getItem(THEME_KEY)}catch(e){}
  if(t!=='dark'&&t!=='light'){t=document.documentElement.getAttribute('data-theme')==='dark'?'dark':'light';try{localStorage.setItem(THEME_KEY,t)}catch(e){}}
  else if(t==='dark'){document.documentElement.setAttribute('data-theme','dark');if(document.body)document.body.setAttribute('data-theme','dark')}
  updateThemeIcons();
}


// ------------------------------------------------------------------ API layer
// All data now lives in the SQL database on the server; the browser only keeps the login token.
class ApiError extends Error{constructor(m,status){super(m);this.status=status}}
async function api(method,url,body){
  const headers={};
  if(body!==undefined)headers['Content-Type']='application/json';
  if(session&&session.token)headers.Authorization='Bearer '+session.token;
  let res;
  try{res=await fetch(url,{method,headers,body:body===undefined?undefined:JSON.stringify(body)})}
  catch(e){throw new ApiError('Cannot reach the library server. Make sure it is running (npm start).',0)}
  const text=await res.text();let data=null;try{data=text?JSON.parse(text):null}catch(e){}
  if(!res.ok){
    if(res.status===401&&session&&session.token){saveSession({role:null,studentId:null});flashToast('Session expired','Please log in again.');window.location.reload()}
    throw new ApiError((data&&data.error)||res.statusText||'Request failed',res.status);
  }
  return data;
}
function guard(fn){return async function(...a){try{return await fn.apply(this,a)}catch(e){toast('Something went wrong',(e&&e.message)||String(e),true)}}}
function debounce(fn,ms){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms)}}
function seqGuard(){let n=0;return()=>{const id=++n;return()=>id===n}}   // ignore out-of-order responses while typing
async function downloadAuthed(url,filename){
  const res=await fetch(url,{headers:{Authorization:'Bearer '+session.token}});
  if(!res.ok)throw new ApiError('Download failed.',res.status);
  downloadFile(filename,await res.blob(),res.headers.get('Content-Type')||'application/octet-stream');
}
function pagerHTML(d,fn){
  if(!d||!d.total)return'';
  const info=`<span>${d.total.toLocaleString()} total</span>`;
  if(d.pages<=1)return`<div class="pager">${info}</div>`;
  return`<div class="pager">${info}<div class="pager-btns">
    <button class="btn btn-outline" ${d.page<=1?'disabled':''} onclick="${fn}(${d.page-1})">&lsaquo; Prev</button>
    <span>Page ${d.page.toLocaleString()} of ${d.pages.toLocaleString()}</span>
    <button class="btn btn-outline" ${d.page>=d.pages?'disabled':''} onclick="${fn}(${d.page+1})">Next &rsaquo;</button></div></div>`;
}

const RECCACHE=new Map();
function cacheRecords(list){list.forEach(r=>RECCACHE.set(String(r.id),r))}

function downloadFile(filename,content,mime){
  const blob=content instanceof Blob?content:new Blob([content],{type:mime});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download=filename;document.body.appendChild(a);a.click();
  setTimeout(()=>{document.body.removeChild(a);URL.revokeObjectURL(url)},0);
}

let CATS=[];
async function loadCategories(){if(session&&session.token)CATS=await api('GET','/api/categories')}
function getCategories(){return CATS.map(c=>c.name)}
async function refreshCategorySelects(){
  await loadCategories();
  const cats=getCategories();
  const makeOpts=(sel,all)=>{
    if(!sel)return;const cur=sel.value;
    sel.innerHTML=(all?'<option value="">All Categories</option>':'')+cats.map(c=>`<option>${esc(c)}</option>`).join('');
    if(cats.includes(cur))sel.value=cur;
  };
  makeOpts(document.getElementById('bookCatFilter'),true);
  makeOpts(document.getElementById('stuCatFilter'),true);
  makeOpts(document.getElementById('bCategory'),false);
  makeOpts(document.getElementById('bECategory'),false);
}

function loadSession(){try{const raw=sessionStorage.getItem(SESSION_KEY);if(raw){const s=JSON.parse(raw);if(s&&(s.role==='admin'||s.role==='student')&&s.token)return s}}catch(e){}return{role:null,studentId:null}}
function saveSession(s){session=s||{role:null,studentId:null};try{sessionStorage.setItem(SESSION_KEY,JSON.stringify(session))}catch(e){}}
let session=loadSession();
function flashToast(title,desc){try{sessionStorage.setItem(FLASH_KEY,JSON.stringify({title,desc}))}catch(e){}}
function showFlashToast(){try{const raw=sessionStorage.getItem(FLASH_KEY);if(!raw)return;sessionStorage.removeItem(FLASH_KEY);const f=JSON.parse(raw);if(f&&f.title)toast(f.title,f.desc||'')}catch(e){}}

let _autoTimer=null;
function startAutoRefresh(fn,ms){clearInterval(_autoTimer);_autoTimer=setInterval(()=>{if(document.hidden||!session.token)return;Promise.resolve(fn()).catch(()=>{})},ms||15000)}

function toast(title,desc,err){
  const wrap=document.getElementById('toastWrap');if(!wrap)return;
  const el=document.createElement('div');el.className='toast'+(err?' error':'');
  el.innerHTML=`<strong>${esc(title)}</strong>${desc?`<span>${esc(desc)}</span>`:''}`;
  wrap.appendChild(el);setTimeout(()=>{el.style.animation='slideOut .22s ease forwards';setTimeout(()=>el.remove(),220)},3000);
}
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}

function openModal(id){const m=document.getElementById(id);if(m)m.classList.add('open')}
function closeModal(id){const m=document.getElementById(id);if(m)m.classList.remove('open')}
document.querySelectorAll('.overlay').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)m.classList.remove('open')}));

function openConfirm(title,desc,cb){
  const t=document.getElementById('confirmTitle'),d=document.getElementById('confirmDesc'),ok=document.getElementById('confirmOk'),ov=document.getElementById('confirmOverlay');
  if(!t||!d||!ok||!ov){cb();return}
  t.textContent=title;d.textContent=desc;ok.onclick=()=>{cb();closeConfirm()};ov.classList.add('open');
}
function closeConfirm(){const ov=document.getElementById('confirmOverlay');if(ov)ov.classList.remove('open')}

function catStyle(cat){
  if(CAT_STYLES[cat])return CAT_STYLES[cat];
  let hash=0;for(let i=0;i<cat.length;i++)hash=cat.charCodeAt(i)+((hash<<5)-hash);
  const color=CUSTOM_COLORS[Math.abs(hash)%CUSTOM_COLORS.length];
  return CAT_STYLES[cat]={badge:'',color};
}
function statusBadge(s){
  if(s==='returned')return'<span class="badge b-returned">Returned</span>';
  if(s==='overdue')return'<span class="badge b-overdue">Overdue</span>';
  if(s==='pending')return'<span class="badge b-pending">Pending</span>';
  return'<span class="badge b-borrowed">Borrowed</span>';
}
function today(){return new Date().toISOString().slice(0,10)}
function plusDays(n){return new Date(Date.now()+n*864e5).toISOString().slice(0,10)}
const LOAN_DAYS=14;
const FINE_PER_DAY=10;
function daysLate(r){
  if(!r.dueDate)return 0;
  const due=new Date(r.dueDate+'T00:00:00');
  const end=r.returnDate?new Date(r.returnDate+'T00:00:00'):new Date();
  const diff=Math.floor((end-due)/864e5);
  return diff>0?diff:0;
}
function fineFor(r){return r.fine!=null?r.fine:daysLate(r)*FINE_PER_DAY}


function printSlipForRecord(id){
  const r=RECCACHE.get(String(id));if(!r)return;
  printSlip(r.studentName,r.bookTitle,r.dueDate||'—');
}
function printSlip(name,book,due){
  const w=window.open('','_blank','width=420,height=620');
  if(!w){toast('Pop-up blocked','Please allow pop-ups for this site to print the slip.',true);return}
  const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Borrow Slip</title>
<style>
@page{size:auto;margin:14mm}
body{font-family:'Cascadia Code',ui-monospace,Menlo,Consolas,monospace;color:#231a14;margin:0;padding:24px}
.slip{max-width:360px;margin:0 auto;border:2px solid #6e1220;border-radius:10px;padding:22px 24px}
.slip h1{font-size:15px;margin:0 0 2px;color:#6e1220;letter-spacing:.02em}
.slip .sub{font-size:11px;color:#79705f;margin:0 0 16px}
.rule{border:none;border-top:2px solid #a9812f;margin:14px 0}
.row{margin:0 0 14px}
.row .k{font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#79705f;margin:0 0 3px}
.row .v{font-size:15px;font-weight:700;color:#231a14}
.sanction{background:#fbeced;border:1px solid #f0c3bd;border-radius:8px;padding:10px 12px;font-size:12px;color:#8e1e18;font-weight:700}
.foot{margin-top:18px;font-size:10px;color:#a89d8a;text-align:center}
</style></head><body>
<div class="slip">
<h1>UPHSD MOLINO LIBRARY</h1>
<p class="sub">Borrower's Slip &middot; Class Project</p>
<hr class="rule">
<div class="row"><p class="k">Borrower Name</p><p class="v">${esc(name)}</p></div>
<div class="row"><p class="k">Book Title</p><p class="v">${esc(book)}</p></div>
<div class="row"><p class="k">Due Date</p><p class="v">${esc(due)}</p></div>
<div class="sanction">Sanction: &#8369;10.00 for every day overdue</div>
<p class="foot">Issued ${esc(new Date().toLocaleDateString())}</p>
</div>
<script>window.onload=function(){window.print()}<\/script>
</body></html>`;
  w.document.write(html);w.document.close();
}

function formatSid(input){let v=input.value.replace(/\D/g,'').slice(0,9);let out=v.slice(0,2);if(v.length>2)out+='-'+v.slice(2,6);if(v.length>6)out+='-'+v.slice(6,9);input.value=out}
function validSid(sid){return/^\d{2}-\d{4}-\d{3}$/.test(sid)}
function validPassword(pw){return typeof pw==='string'&&pw.length>=6}

function avatarHTML(name,photo,size=38,fontSize=14){
  if(photo)return`<div class="avatar" style="width:${size}px;height:${size}px;padding:0;overflow:hidden"><img src="${photo}" alt="${esc(name)}" style="width:100%;height:100%;object-fit:cover"></div>`;
  return`<div class="avatar" style="width:${size}px;height:${size}px;font-size:${fontSize}px">${esc((name||'?')[0].toUpperCase())}</div>`;
}

function showScreen(id){
  ['screen-landing','screen-admin-landing','screen-admin-login','screen-student-gate','screen-admin','screen-student'].forEach(s=>{const el=document.getElementById(s);if(el)el.classList.add('hidden')});
  const target=document.getElementById(id);
  if(!target){if(id==='screen-admin'||id==='screen-admin-login'||id==='screen-admin-landing'){window.location.href='admin.html';return}window.location.href='index.html';return}
  target.classList.remove('hidden');window.scrollTo(0,0);
  const floatBtn=document.querySelector('.theme-float');
  if(floatBtn)floatBtn.style.display=(id==='screen-admin'||id==='screen-student')?'none':'';
}

function goLanding(){saveSession({role:null,studentId:null});if(document.getElementById('screen-landing'))showScreen('screen-landing');else window.location.href='index.html'}
function goAdminLogin(){if(document.getElementById('screen-admin-login')){const e=document.getElementById('adminErr');if(e)e.classList.add('hidden');showScreen('screen-admin-login')}else window.location.href='admin.html'}
function chooseRole(role){
  if(role==='admin'){if(document.getElementById('screen-admin-login')){const e=document.getElementById('adminErr');if(e)e.classList.add('hidden');showScreen('screen-admin-login')}else window.location.href='admin.html'}
  else{if(document.getElementById('screen-student-gate')){switchGate('login');showScreen('screen-student-gate')}else window.location.href='index.html'}
}
function logout(){
  saveSession({role:null,studentId:null});
  if(document.getElementById('screen-landing')){showScreen('screen-landing');toast('Logged out','You have been signed out.')}
  else if(document.getElementById('screen-admin-landing')){showScreen('screen-admin-landing');toast('Logged out','You have been signed out.')}
  else window.location.href='index.html';
}

function emptyBox(icon,title,sub){
  const svgs={book:'<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',users:'<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>',open:'<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',clock:'<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',check:'<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>'};
  return`<div class="empty"><svg width="42" height="42" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">${svgs[icon]||svgs.book}</svg><p>${esc(title)}</p><span>${esc(sub)}</span></div>`;
}
function val(id){const el=document.getElementById(id);return el?el.value.trim():''}
function showErr(el,msg){if(!el)return;el.textContent=msg;el.classList.remove('hidden')}

async function boot(){
  initTheme();showFlashToast();
  try{if(window.location&&window.location.protocol==='file:'){const w=document.getElementById('fileWarn');if(w)w.classList.remove('hidden')}}catch(e){}
  session=loadSession();
  const isAdminPage=!!document.getElementById('screen-admin'),isIndexPage=!!document.getElementById('screen-landing');
  try{
    if(isAdminPage){
      if(session.role==='admin'){await api('GET','/api/admin/ping');await refreshCategorySelects();showScreen('screen-admin');switchTab('dashboard',document.querySelector('#screen-admin .tab-btn'));startAutoRefresh(adminAutoRefresh)}
      else showScreen('screen-admin-landing');
      return;
    }
    if(isIndexPage){
      if(session.role==='student'){await refreshCategorySelects();await enterStudent(session.studentId,true);startAutoRefresh(studentAutoRefresh);checkDueSoon();checkWaitlistReady()}
      else{saveSession({role:null,studentId:null});showScreen('screen-landing')}
    }
  }catch(e){
    if(e.status===0)toast('Server not reachable',e.message,true);
    if(isAdminPage)showScreen('screen-admin-landing');else if(isIndexPage)showScreen('screen-landing');
  }
}
