// student portal logic — data comes from the SQL-backed API (see server/index.js)
const NOTIF_KEY='uphsd_notif_pref';
function toggleNotifPanel(e){
  if(e)e.stopPropagation();
  const p=document.getElementById('notifPanel');
  if(p)p.classList.toggle('hidden');
}
function setNotifPref(wantsNotif){
  try{localStorage.setItem(NOTIF_KEY,wantsNotif?'yes':'no')}catch(e){}
  const p=document.getElementById('notifPanel');if(p)p.classList.add('hidden');
  toast(wantsNotif?'Notifications enabled':'Maybe later',wantsNotif?"We'll let you know about due dates and library updates.":'You can turn this on anytime from the bell icon.');
}
document.addEventListener('click',e=>{
  const p=document.getElementById('notifPanel');
  if(p&&!p.classList.contains('hidden')&&!p.contains(e.target)&&!e.target.closest('[data-notif-bell]'))p.classList.add('hidden');
});
function switchGate(mode){
  const login=document.getElementById('gateLogin'),reg=document.getElementById('gateRegister');
  const tl=document.getElementById('gateTabLogin'),tr=document.getElementById('gateTabReg');
  if(!login||!reg||!tl||!tr)return;
  if(mode==='login'){login.classList.remove('hidden');reg.classList.add('hidden');tl.classList.add('tab-active');tr.classList.remove('tab-active')}
  else{reg.classList.remove('hidden');login.classList.add('hidden');tr.classList.add('tab-active');tl.classList.remove('tab-active')}
  const le=document.getElementById('loginErr'),re=document.getElementById('regErr');
  if(le)le.classList.add('hidden');if(re)re.classList.add('hidden');
}

// ---- the logged-in student's own data (profile + their records + their waitlist), refreshed from the server
let ME={student:null,records:[],waitlist:[]};
const myRecords=()=>ME.records, myWaitlist=()=>ME.waitlist;

async function studentRegister(){
  const email=val('regEmail'),name=val('regName'),sid=val('regSid');
  const password=val('regPassword'),passwordConfirm=val('regPasswordConfirm');
  const year=val('regYear'),course=val('regCourse');
  const consentEl=document.getElementById('regConsent');
  const err=document.getElementById('regErr');
  if(!email||!name||!sid||!password||!passwordConfirm||!year||!course){showErr(err,'Please fill in all required fields.');return}
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){showErr(err,'Please enter a valid email address.');return}
  if(!validSid(sid)){showErr(err,'Student ID must follow the format YY-XXXX-XXX.');return}
  if(!validPassword(password)){showErr(err,'Password must be at least 6 characters.');return}
  if(password!==passwordConfirm){showErr(err,'Passwords do not match.');return}
  if(consentEl&&!consentEl.checked){showErr(err,'Please confirm you have read the Privacy Notice and Terms of Use.');return}
  let r;
  try{r=await api('POST','/api/students/register',{email,name,studentId:sid,password,year,course})}
  catch(e){showErr(err,e.message);return}
  if(err)err.classList.add('hidden');
  ['regEmail','regName','regSid','regPassword','regPasswordConfirm','regYear','regCourse'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});
  if(consentEl)consentEl.checked=false;
  saveSession({role:'student',studentId:r.studentId,token:r.token});
  toast('Registration successful','Welcome! Your account is ready.');
  await refreshCategorySelects();
  await enterStudent(r.studentId);
}

async function studentLogin(){
  const sid=val('loginSid'),password=val('loginPass'),err=document.getElementById('loginErr');
  if(!validSid(sid)){showErr(err,'Enter a valid Student ID (YY-XXXX-XXX).');return}
  if(!password){showErr(err,'Please enter your password.');return}
  let r;
  try{r=await api('POST','/api/students/login',{studentId:sid,password})}
  catch(e){showErr(err,e.message);return}
  err.classList.add('hidden');document.getElementById('loginSid').value='';document.getElementById('loginPass').value='';
  saveSession({role:'student',studentId:r.studentId,token:r.token});
  await refreshCategorySelects();
  await enterStudent(r.studentId);
}

async function enterStudent(sId,silent){
  if(!document.getElementById('screen-student')){window.location.href='index.html';return}
  await renderStudentPortal();
  showScreen('screen-student');switchStuTab('browse',document.querySelector('#screen-student .tab-btn'));
  startAutoRefresh(studentAutoRefresh);
  if(!silent){toast('Welcome, '+ME.student.name.split(' ')[0],'Browse and request books from the library.');checkDueSoon();checkWaitlistReady()}
}

function switchStuTab(name,btn){
  const pane=document.getElementById('stab-'+name);if(!pane)return;
  document.querySelectorAll('#screen-student .tab-content').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('#screen-student .tab-btn').forEach(b=>b.classList.remove('tab-active'));
  pane.classList.add('active');if(btn)btn.classList.add('tab-active');
  if(name==='browse')renderStuBrowse();if(name==='mybooks')renderStuMyBooks();if(name==='settings')renderStuSettings();
}

// fetch fresh state, then redraw header + whichever lists are on screen
async function renderStudentPortal(){
  if(!document.getElementById('screen-student'))return;
  ME=await api('GET','/api/me');
  const s=ME.student;
  const hn=document.getElementById('stuHeaderName');if(hn)hn.textContent='Welcome, '+s.name;
  document.getElementById('stuAvatar').outerHTML=avatarHTML(s.name,s.photo,52,20).replace('class="avatar"','class="avatar" id="stuAvatar"').replace('style="','style="background:var(--gold);color:#3a2c07;');
  document.getElementById('stuName').textContent=s.name;
  document.getElementById('stuMeta').textContent=`${s.studentId} · ${s.course} · ${s.year}`;
  const my=ME.records;
  document.getElementById('stuActiveCount').textContent=my.filter(r=>r.status==='borrowed'||r.status==='overdue').length;
  document.getElementById('stuPendingCount').textContent=my.filter(r=>r.status==='pending').length;
  cacheRecords(my);
  await renderStuBrowse(true);renderStuMyBooks();
}
async function studentAutoRefresh(){
  if(session.role!=='student'||!document.getElementById('screen-student')||document.getElementById('screen-student').classList.contains('hidden'))return;
  await renderStudentPortal();
  checkWaitlistReady();
}

let pendingPhotoData=undefined;

function renderStuSettings(){
  if(!document.getElementById('settingsName')||!ME.student)return;
  const s=ME.student;
  pendingPhotoData=undefined;document.getElementById('settingsName').value=s.name;
  const av=document.getElementById('settingsAvatar');
  if(av)av.outerHTML=avatarHTML(s.name,s.photo,72,26).replace('class="avatar"','class="avatar" id="settingsAvatar"').replace('style="','style="background:var(--gold);color:#3a2c07;');
  const rm=document.getElementById('settingsRemovePhotoBtn');if(rm)rm.classList.toggle('hidden',!s.photo);
  const e=document.getElementById('settingsErr');if(e)e.classList.add('hidden');
}

function handlePhotoChange(input){
  const file=input.files&&input.files[0];if(!file)return;
  if(!file.type.startsWith('image/')){toast('Invalid file','Please choose an image file.',true);return}
  if(file.size>2*1024*1024){toast('File too large','Please choose an image under 2MB.',true);return}
  const reader=new FileReader();
  reader.onload=()=>{pendingPhotoData=reader.result;const s=ME.student;document.getElementById('settingsAvatar').outerHTML=avatarHTML(s.name,pendingPhotoData,72,26).replace('class="avatar"','class="avatar" id="settingsAvatar"');document.getElementById('settingsRemovePhotoBtn').classList.remove('hidden')};
  reader.readAsDataURL(file);input.value='';
}

function removeSettingsPhoto(){
  pendingPhotoData=null;const s=ME.student;
  document.getElementById('settingsAvatar').outerHTML=avatarHTML(s.name,null,72,26).replace('class="avatar"','class="avatar" id="settingsAvatar"').replace('style="','style="background:var(--gold);color:#3a2c07;');
  document.getElementById('settingsRemovePhotoBtn').classList.add('hidden');
}

const saveStuSettings=guard(async function(){
  const name=document.getElementById('settingsName').value.trim(),err=document.getElementById('settingsErr');
  if(!name){showErr(err,'Name cannot be empty.');return}
  err.classList.add('hidden');
  try{await api('PUT','/api/me',{name,photo:pendingPhotoData})}catch(e){showErr(err,e.message);return}
  pendingPhotoData=undefined;
  await renderStudentPortal();renderStuSettings();toast('Settings saved','Your profile has been updated.');
});

// ---- Browse: the server searches + pages the catalogue, so this stays fast with huge collections
let stuPage=1;const stuSeq=seqGuard();
const stuSearchDebounced=debounce(()=>renderStuBrowse(),250);
function stuGoPage(n){stuPage=n;renderStuBrowse(true);document.getElementById('stuBooksGrid').scrollIntoView({behavior:'smooth',block:'start'})}

const renderStuBrowse=guard(async function(keep){
  renderStuWaitlist();
  const searchEl=document.getElementById('stuBookSearch'),catEl=document.getElementById('stuCatFilter'),grid=document.getElementById('stuBooksGrid');
  if(!searchEl||!catEl||!grid)return;
  if(!keep)stuPage=1;
  const ok=stuSeq();
  const qs=new URLSearchParams({q:searchEl.value.trim(),category:catEl.value,page:stuPage,limit:12});
  const data=await api('GET','/api/books?'+qs);
  if(!ok())return;
  stuPage=data.page;
  const my=myRecords();
  if(!data.items.length){grid.innerHTML=emptyBox('book','No books found','Try a different search.');return}
  grid.innerHTML=`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px">${data.items.map(b=>{
    const st=catStyle(b.category),av=b.availableCopies>0;
    const existing=my.find(r=>r.bookId===b.id&&(r.status==='pending'||r.status==='borrowed'||r.status==='overdue'));
    const onWaitlist=myWaitlist().some(w=>w.bookId===b.id);
    let action;
    if(existing&&existing.status==='pending')action=`<button class="btn btn-outline" style="width:100%;cursor:default" disabled>Request Pending</button>`;
    else if(existing)action=`<button class="btn btn-outline" style="width:100%;cursor:default" disabled>Already Borrowed</button>`;
    else if(!av&&onWaitlist)action=`<button class="btn btn-outline" style="width:100%;cursor:default" disabled>On Waitlist</button>`;
    else if(!av)action=`<button class="btn btn-outline" style="width:100%" onclick="joinWaitlist(${b.id})">Notify Me When Available</button>`;
    else action=`<button class="btn btn-gold" style="width:100%" onclick="openBorrowRules(${b.id},this)" data-title="${esc(b.title)}">Request to Borrow</button>`;
    return`<div class="card" style="display:flex;flex-direction:column;height:100%"><div style="height:84px;background:${st.color};position:relative;display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0">
      <div style="position:absolute;left:0;top:0;bottom:0;width:8px;background:rgba(0,0,0,.18)"></div>
      <span style="font-size:28px;font-weight:800;color:#fff;letter-spacing:.02em">${esc((b.title[0]||'?').toUpperCase())}</span>
    </div><div style="padding:20px;display:flex;flex-direction:column;gap:12px;flex:1;min-height:0">
      <span class="badge ${st.badge}" style="align-self:flex-start"><span class="dot" style="background:${st.color}"></span>${esc(b.category)}</span>
      <div style="flex:1"><h3 style="font-size:15px;font-weight:800;line-height:1.3">${esc(b.title)}</h3><p style="margin:4px 0 0;font-size:13px;color:var(--muted)">by ${esc(b.author)}</p>
      ${b.description?`<p style="margin:8px 0 0;font-size:12px;color:#b0a596;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">${esc(b.description)}</p>`:''}</div>
      <p style="margin:0;font-size:13px"><b style="color:${av?'var(--green)':'var(--red)'}">${b.availableCopies}</b> <span style="color:var(--muted)">/ ${b.totalCopies} available</span></p>
      ${action}</div></div>`;
  }).join('')}</div>${pagerHTML(data,'stuGoPage')}`;
});

let pendingBorrowBookId=null;
function openBorrowRules(bId,btn){
  pendingBorrowBookId=bId;
  const t=document.getElementById('borrowRulesBookTitle');if(t)t.textContent='"'+((btn&&btn.dataset.title)||'this book')+'"';
  openModal('borrowRulesModal');
}
function confirmBorrowRequest(){
  if(!pendingBorrowBookId)return;
  const bId=pendingBorrowBookId;pendingBorrowBookId=null;
  closeModal('borrowRulesModal');
  requestBook(bId);
}
const requestBook=guard(async function(bId){
  try{await api('POST','/api/me/request',{bookId:bId})}
  catch(e){if(e.status===409){toast('Already requested',e.message,true);return}throw e}
  toast('Request sent','Your request is awaiting admin approval.');
  await renderStudentPortal();
});

function renderStuMyBooks(){
  const el=document.getElementById('stuMyBooks');if(!el)return;
  const my=myRecords();
  if(!my.length){el.innerHTML=emptyBox('open','No books yet','Request a book from the Browse tab.');return}
  el.innerHTML=`<div style="overflow-x:auto"><table>
    <thead><tr><th>Book</th><th>Requested</th><th>Due Date</th><th style="text-align:right">Fine</th><th style="text-align:center">Status</th><th style="text-align:right">Actions</th></tr></thead>
    <tbody>${my.map(r=>{
      const cs=catStyle(r.bookCategory);
      const due=r.returnDate?`Returned ${r.returnDate}`:(r.dueDate||'—');
      const canPrint=r.status==='borrowed'||r.status==='overdue';
      const canRenew=r.status==='borrowed'&&!r.renewed;
      const fine=fineFor(r);
      return`<tr>
        <td><div style="display:flex;align-items:center;gap:8px"><span class="dot" style="background:${cs.color}"></span><div><p style="margin:0;font-size:13px;font-weight:700">${esc(r.bookTitle)}</p><p style="margin:0;font-size:11px;color:#b0a596">by ${esc(r.bookAuthor)} · ${esc(r.bookCategory)}</p></div></div></td>
        <td style="font-size:12px;color:var(--muted)">${r.requestDate}</td>
        <td style="font-size:12px;color:${r.status==='overdue'?'var(--red)':'var(--muted)'};font-weight:${r.status==='overdue'?'700':'400'}">${due}</td>
        <td style="text-align:right;font-size:12px;font-weight:700;color:${fine>0?'var(--red)':'var(--muted)'}">${fine>0?'₱'+fine:'—'}</td>
        <td style="text-align:center">${statusBadge(r.status)}</td>
        <td style="text-align:right"><div style="display:flex;gap:6px;justify-content:flex-end">
          ${canRenew?`<button class="btn btn-outline" style="padding:5px 10px;font-size:11.5px" onclick="renewBook(${r.id})">Renew</button>`:''}
          ${canPrint?`<button class="btn btn-outline" style="padding:5px 10px;font-size:11.5px" onclick="printSlipForRecord(${r.id})">Print</button>`:''}
        </div></td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
}

const renewBook=guard(async function(id){
  try{const r=await api('POST',`/api/me/records/${id}/renew`);toast('Renewed','New due date: '+r.dueDate+'.')}
  catch(e){if(e.status===409){toast('Cannot renew',e.message,true);return}throw e}
  await renderStudentPortal();
});

function checkDueSoon(){
  const dueSoon=myRecords().filter(r=>{
    if(r.status!=='borrowed'||!r.dueDate)return false;
    const d=Math.floor((new Date(r.dueDate+'T00:00:00')-new Date())/864e5);return d>=0&&d<=2;
  });
  if(!dueSoon.length)return;
  toast('Due soon',dueSoon.length===1?`"${dueSoon[0].bookTitle}" is due ${dueSoon[0].dueDate}.`:`${dueSoon.length} books are due within 2 days.`,true);
}

async function checkWaitlistReady(){
  try{
    const {ready}=await api('POST','/api/me/waitlist/claim-ready');
    if(!ready.length)return;
    toast('Now available!',ready.length===1?`"${ready[0]}" is back in stock — request it before it's gone.`:`${ready.length} books you're waiting on are now available.`);
    await renderStudentPortal();
  }catch(e){}
}

const joinWaitlist=guard(async function(bId){
  try{await api('POST','/api/me/waitlist',{bookId:bId})}
  catch(e){if(e.status===409){toast('Already on waitlist',e.message,true);return}throw e}
  toast('Added to waitlist',"We'll let you know when it's back in stock.");
  await renderStudentPortal();
});
const leaveWaitlist=guard(async function(wId){
  await api('DELETE','/api/me/waitlist/'+wId);
  toast('Removed from waitlist','');
  await renderStudentPortal();
});
function renderStuWaitlist(){
  const box=document.getElementById('stuWaitlistBox');if(!box)return;
  const mine=myWaitlist();
  if(!mine.length){box.classList.add('hidden');box.innerHTML='';return}
  box.classList.remove('hidden');
  box.innerHTML=`<div class="card"><div style="padding:12px 16px;border-bottom:1px solid var(--line)"><strong style="font-size:13px">Your Waitlist</strong></div>
    <div style="padding:8px 16px 12px;display:flex;flex-direction:column;gap:6px">
    ${mine.map(w=>`<div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;gap:10px">
        <span>${esc(w.title)}${w.availableCopies>0?' <span style="color:var(--green);font-weight:700">· Available now</span>':''}</span>
        <button class="btn btn-ghost" style="padding:4px 10px;font-size:11.5px" onclick="leaveWaitlist(${w.id})">Remove</button>
      </div>`).join('')}
    </div></div>`;
}

boot();
