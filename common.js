const THEME_KEY='uphsd_theme',STORE_KEY='uphsd_library_v3',SESSION_KEY='uphsd_session',FLASH_KEY='uphsd_flash';
const ICON_MOON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
const ICON_SUN='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';
const DEFAULT_CATEGORIES=['Fiction','Science','History','Reference'];
const CUSTOM_COLORS=['#b3261e','#8a6a00','#1f6b41','#6b3fa0','#1a4b8f','#0e7490','#7c3aed','#c2410c','#15803d','#9333ea'];
const CAT_STYLES={Fiction:{badge:'b-fic',color:'#8a4b06'},Science:{badge:'b-sci',color:'#1a4b8f'},History:{badge:'b-his',color:'#5b2c9a'},Reference:{badge:'b-ref',color:'#1f6b41'}};

function getTheme(){return document.documentElement.getAttribute('data-theme')==='dark'?'dark':'light'}
function updateThemeIcons(){
  const dark=getTheme()==='dark';
  document.querySelectorAll('.theme-toggle').forEach(b=>{
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

function seed(){return{books:[
  {id:'b1',title:'Noli Me Tangere',author:'Jose Rizal',category:'Fiction',isbn:'978-9710579891',description:'The classic Filipino novel of colonial society.',totalCopies:4,availableCopies:2},
  {id:'b2',title:'El Filibusterismo',author:'Jose Rizal',category:'Fiction',isbn:'978-9710579907',description:'The sequel to Noli Me Tangere.',totalCopies:3,availableCopies:3},
  {id:'b3',title:'A Brief History of Time',author:'Stephen Hawking',category:'Science',isbn:'978-0553380163',description:'From the Big Bang to black holes.',totalCopies:3,availableCopies:1},
  {id:'b4',title:'Sapiens: A Brief History of Humankind',author:'Yuval Noah Harari',category:'History',isbn:'978-0062316097',description:'A groundbreaking narrative of humanity.',totalCopies:2,availableCopies:0},
  {id:'b5',title:'The Filipino Primitive',author:'Nick Joaquin',category:'History',isbn:'978-9715505543',description:'Essays on Philippine culture and history.',totalCopies:2,availableCopies:2},
  {id:'b6',title:'Cosmos',author:'Carl Sagan',category:'Science',isbn:'978-0345539434',description:'A personal voyage through the universe.',totalCopies:3,availableCopies:2},
  {id:'b7',title:'Oxford English Dictionary',author:'Oxford University Press',category:'Reference',isbn:'978-0199571123',description:'Comprehensive reference dictionary.',totalCopies:5,availableCopies:5},
  {id:'b8',title:'Florante at Laura',author:'Francisco Balagtas',category:'Fiction',isbn:'978-9712300011',description:'A classic Filipino awit.',totalCopies:3,availableCopies:3}
],students:[],records:[],counters:{b:9,s:1,r:1},customCategories:[]}}

let DB=load();
function load(){try{const raw=localStorage.getItem(STORE_KEY);if(raw)return JSON.parse(raw)}catch(e){}const fresh=seed();persist(fresh);return fresh}
function persist(db){localStorage.setItem(STORE_KEY,JSON.stringify(db||DB))}
function save(){persist(DB)}

const books=()=>DB.books,students=()=>DB.students,records=()=>DB.records;
const bookById=id=>DB.books.find(b=>b.id===id),studentById=id=>DB.students.find(s=>s.id===id);

function getCategories(){return[...new Set([...DEFAULT_CATEGORIES,...(DB.customCategories||[]),...books().map(b=>b.category)])]}
function refreshCategorySelects(){
  const cats=getCategories();
  const makeOpts=(sel,all)=>{
    if(!sel)return;const cur=sel.value;
    sel.innerHTML=(all?'<option value="">All Categories</option>':'')+cats.map(c=>`<option>${esc(c)}</option>`).join('');
    if(cats.includes(cur))sel.value=cur;
  };
  makeOpts(document.getElementById('bookCatFilter'),true);
  makeOpts(document.getElementById('stuCatFilter'),true);
  makeOpts(document.getElementById('bCategory'),false);
}

function loadSession(){try{const raw=sessionStorage.getItem(SESSION_KEY);if(raw){const s=JSON.parse(raw);if(s&&(s.role==='admin'||s.role==='student'))return s}}catch(e){}return{role:null,studentId:null}}
function saveSession(s){session=s||{role:null,studentId:null};try{sessionStorage.setItem(SESSION_KEY,JSON.stringify(session))}catch(e){}}
let session=loadSession();
function flashToast(title,desc){try{sessionStorage.setItem(FLASH_KEY,JSON.stringify({title,desc}))}catch(e){}}
function showFlashToast(){try{const raw=sessionStorage.getItem(FLASH_KEY);if(!raw)return;sessionStorage.removeItem(FLASH_KEY);const f=JSON.parse(raw);if(f&&f.title)toast(f.title,f.desc||'')}catch(e){}}

function refreshOverdue(){const today=new Date().toISOString().slice(0,10);DB.records.forEach(r=>{if(r.status==='borrowed'&&r.dueDate&&r.dueDate<today)r.status='overdue'});save()}

function toast(title,desc,err){
  const wrap=document.getElementById('toastWrap');if(!wrap)return;
  const el=document.createElement('div');el.className='toast'+(err?' error':'');
  el.innerHTML=`<strong>${esc(title)}</strong>${desc?`<span>${esc(desc)}</span>`:''}`;
  wrap.appendChild(el);setTimeout(()=>{el.style.animation='slideOut .22s ease forwards';setTimeout(()=>el.remove(),220)},3000);
}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&','<':'<','>':'>','"':'"',"'":'&#39;'}[c]))}

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

function formatSid(input){let v=input.value.replace(/\D/g,'').slice(0,9);let out=v.slice(0,2);if(v.length>2)out+='-'+v.slice(2,6);if(v.length>6)out+='-'+v.slice(6,9);input.value=out}
function validSid(sid){return/^25-\d{4}-\d{3}$/.test(sid)}
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

window.addEventListener('storage',e=>{
  if(!e)return;
  if(e.key===STORE_KEY){
    try{DB=load()}catch(err){return}
    refreshOverdue();refreshCategorySelects();
    try{
      const adminVisible=document.getElementById('screen-admin')&&!document.getElementById('screen-admin').classList.contains('hidden');
      if(adminVisible){
        const active=document.querySelector('#screen-admin .tab-content.active');
        const id=active?active.id:'tab-dashboard';
        if(id==='tab-dashboard')renderDashboard();else if(id==='tab-books')renderBooks();else if(id==='tab-students')renderStudents();
        else if(id==='tab-requests')renderRequests();else if(id==='tab-borrow')renderBorrow();else if(id==='tab-history')renderHistory();
        updateReqBadge();
      }
      const stuVisible=document.getElementById('screen-student')&&!document.getElementById('screen-student').classList.contains('hidden');
      if(stuVisible&&session.role==='student'&&studentById(session.studentId))renderStudentPortal();
    }catch(err){}
  }
  if(e.key===THEME_KEY){try{const t=e.newValue;if(t==='dark'){document.documentElement.setAttribute('data-theme','dark');if(document.body)document.body.setAttribute('data-theme','dark')}else{document.documentElement.removeAttribute('data-theme');if(document.body)document.body.removeAttribute('data-theme')}updateThemeIcons()}catch(err){}}
});

function boot(){
  refreshOverdue();initTheme();refreshCategorySelects();showFlashToast();
  try{if(window.location&&window.location.protocol==='file:'){const w=document.getElementById('fileWarn');if(w)w.classList.remove('hidden')}}catch(e){}
  session=loadSession();
  const isAdminPage=!!document.getElementById('screen-admin'),isIndexPage=!!document.getElementById('screen-landing');
  if(isAdminPage){if(session.role==='admin'){showScreen('screen-admin');switchTab('dashboard',document.querySelector('#screen-admin .tab-btn'))}else showScreen('screen-admin-landing');return}
  if(isIndexPage){if(session.role==='student'&&studentById(session.studentId)){showScreen('screen-student');switchStuTab('browse',document.querySelector('#screen-student .tab-btn'));renderStudentPortal()}else{saveSession({role:null,studentId:null});showScreen('screen-landing')}}
}
