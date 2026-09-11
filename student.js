// student portal logic
function switchGate(mode){
  const login=document.getElementById('gateLogin'),reg=document.getElementById('gateRegister');
  const tl=document.getElementById('gateTabLogin'),tr=document.getElementById('gateTabReg');
  if(!login||!reg||!tl||!tr)return;
  if(mode==='login'){login.classList.remove('hidden');reg.classList.add('hidden');tl.classList.add('tab-active');tr.classList.remove('tab-active')}
  else{reg.classList.remove('hidden');login.classList.add('hidden');tr.classList.add('tab-active');tl.classList.remove('tab-active')}
  const le=document.getElementById('loginErr'),re=document.getElementById('regErr');
  if(le)le.classList.add('hidden');if(re)re.classList.add('hidden');
}

function studentRegister(){
  const name=document.getElementById('regName').value.trim(),sid=document.getElementById('regSid').value.trim();
  const password=document.getElementById('regPassword').value,passwordConfirm=document.getElementById('regPasswordConfirm').value;
  const year=document.getElementById('regYear').value,section=document.getElementById('regSection').value.trim(),course=document.getElementById('regCourse').value;
  const consentEl=document.getElementById('regConsent');
  const err=document.getElementById('regErr');
  if(!name||!sid||!password||!passwordConfirm||!year||!section||!course){showErr(err,'Please fill in all required fields.');return}
  if(!validSid(sid)){showErr(err,'Student ID must follow the format 25-XXXX-XXX (starts with 25).');return}
  if(students().some(s=>s.studentId===sid)){showErr(err,'This Student ID is already registered. Please log in instead.');return}
  if(!validPassword(password)){showErr(err,'Password must be at least 6 characters.');return}
  if(password!==passwordConfirm){showErr(err,'Passwords do not match.');return}
  if(consentEl&&!consentEl.checked){showErr(err,'Please confirm you have read the Privacy Notice and Terms of Use.');return}
  const s={id:'s'+DB.counters.s++,studentId:sid,password,name,year,section,course,photo:null};
  DB.students.push(s);save();err.classList.add('hidden');
  ['regName','regSid','regSection','regPassword','regPasswordConfirm'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('regYear').value='';document.getElementById('regCourse').value='';
  if(consentEl)consentEl.checked=false;
  toast('Registration successful','You can now log in with your Student ID and password.');
  enterStudent(s.id);
}

function studentLogin(){
  const sid=document.getElementById('loginSid').value.trim(),password=document.getElementById('loginPass').value,err=document.getElementById('loginErr');
  if(!validSid(sid)){showErr(err,'Enter a valid Student ID (25-XXXX-XXX).');return}
  if(!password){showErr(err,'Please enter your password.');return}
  const s=students().find(x=>x.studentId===sid);
  if(!s){showErr(err,'No account found for that Student ID. Please register first.');return}
  if(s.password!==password){showErr(err,'Incorrect password.');return}
  err.classList.add('hidden');document.getElementById('loginSid').value='';document.getElementById('loginPass').value='';
  enterStudent(s.id);
}

function enterStudent(sId,silent){
  saveSession({role:'student',studentId:sId});
  if(!document.getElementById('screen-student')){window.location.href='index.html';return}
  showScreen('screen-student');switchStuTab('browse',document.querySelector('#screen-student .tab-btn'));renderStudentPortal();
  if(!silent){const s=studentById(sId);if(s)toast('Welcome, '+s.name.split(' ')[0],'Browse and request books from the library.');checkDueSoon(sId);checkWaitlistReady(sId)}
}

function switchStuTab(name,btn){
  const pane=document.getElementById('stab-'+name);if(!pane)return;
  document.querySelectorAll('#screen-student .tab-content').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('#screen-student .tab-btn').forEach(b=>b.classList.remove('tab-active'));
  pane.classList.add('active');if(btn)btn.classList.add('tab-active');
  if(name==='browse')renderStuBrowse();if(name==='mybooks')renderStuMyBooks();if(name==='settings')renderStuSettings();
}

function renderStudentPortal(){
  if(!document.getElementById('screen-student'))return;
  const s=studentById(session.studentId);if(!s){logout();return}
  const hn=document.getElementById('stuHeaderName');if(hn)hn.textContent='Welcome, '+s.name;
  document.getElementById('stuAvatar').outerHTML=avatarHTML(s.name,s.photo,52,20).replace('class="avatar"','class="avatar" id="stuAvatar"').replace('style="','style="background:var(--gold);color:#3a2c07;');
  document.getElementById('stuName').textContent=s.name;
  document.getElementById('stuMeta').textContent=`${s.studentId} · ${s.course} · ${s.section} · ${s.year}`;
  const my=records().filter(r=>r.studentId===s.id);
  document.getElementById('stuActiveCount').textContent=my.filter(r=>r.status==='borrowed'||r.status==='overdue').length;
  document.getElementById('stuPendingCount').textContent=my.filter(r=>r.status==='pending').length;
  renderStuBrowse();renderStuMyBooks();
}

let pendingPhotoData=undefined;

function renderStuSettings(){
  if(!document.getElementById('settingsName'))return;
  const s=studentById(session.studentId);if(!s)return;
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
  reader.onload=()=>{pendingPhotoData=reader.result;const s=studentById(session.studentId);document.getElementById('settingsAvatar').outerHTML=avatarHTML(s.name,pendingPhotoData,72,26).replace('class="avatar"','class="avatar" id="settingsAvatar"');document.getElementById('settingsRemovePhotoBtn').classList.remove('hidden')};
  reader.readAsDataURL(file);input.value='';
}

function removeSettingsPhoto(){
  pendingPhotoData=null;const s=studentById(session.studentId);
  document.getElementById('settingsAvatar').outerHTML=avatarHTML(s.name,null,72,26).replace('class="avatar"','class="avatar" id="settingsAvatar"').replace('style="','style="background:var(--gold);color:#3a2c07;');
  document.getElementById('settingsRemovePhotoBtn').classList.add('hidden');
}

function saveStuSettings(){
  const s=studentById(session.studentId);if(!s)return;
  const name=document.getElementById('settingsName').value.trim(),err=document.getElementById('settingsErr');
  if(!name){showErr(err,'Name cannot be empty.');return}
  err.classList.add('hidden');s.name=name;
  if(pendingPhotoData!==undefined)s.photo=pendingPhotoData;pendingPhotoData=undefined;
  save();renderStudentPortal();renderStuSettings();toast('Settings saved','Your profile has been updated.');
}

function renderStuBrowse(){
  renderStuWaitlist();
  const searchEl=document.getElementById('stuBookSearch'),catEl=document.getElementById('stuCatFilter'),grid0=document.getElementById('stuBooksGrid');
  if(!searchEl||!catEl||!grid0)return;
  const search=(searchEl.value||'').toLowerCase(),cat=catEl.value;
  const my=records().filter(r=>r.studentId===session.studentId);
  const filtered=books().filter(b=>{const mc=!cat||b.category===cat;const ms=!search||[b.title,b.author].some(f=>f.toLowerCase().includes(search));return mc&&ms});
  const grid=document.getElementById('stuBooksGrid');
  if(!filtered.length){grid.innerHTML=emptyBox('book','No books found','Try a different search.');return}
  grid.innerHTML=`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px">${filtered.map(b=>{
    const st=catStyle(b.category),av=b.availableCopies>0;
    const existing=my.find(r=>r.bookId===b.id&&(r.status==='pending'||r.status==='borrowed'||r.status==='overdue'));
    const onWaitlist=waitlist().some(w=>w.bookId===b.id&&w.studentId===session.studentId);
    let action;
    if(existing&&existing.status==='pending')action=`<button class="btn btn-outline" style="width:100%;cursor:default" disabled>Request Pending</button>`;
    else if(existing)action=`<button class="btn btn-outline" style="width:100%;cursor:default" disabled>Already Borrowed</button>`;
    else if(!av&&onWaitlist)action=`<button class="btn btn-outline" style="width:100%;cursor:default" disabled>On Waitlist</button>`;
    else if(!av)action=`<button class="btn btn-outline" style="width:100%" onclick="joinWaitlist('${b.id}')">Notify Me When Available</button>`;
    else action=`<button class="btn btn-gold" style="width:100%" onclick="openBorrowRules('${b.id}')">Request to Borrow</button>`;
    return`<div class="card" style="display:flex;flex-direction:column;height:100%"><div style="height:84px;background:${st.color};position:relative;display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0">
      <div style="position:absolute;left:0;top:0;bottom:0;width:8px;background:rgba(0,0,0,.18)"></div>
      <span style="font-size:28px;font-weight:800;color:#fff;letter-spacing:.02em">${esc((b.title[0]||'?').toUpperCase())}</span>
    </div><div style="padding:20px;display:flex;flex-direction:column;gap:12px;flex:1;min-height:0">
      <span class="badge ${st.badge}" style="align-self:flex-start"><span class="dot" style="background:${st.color}"></span>${b.category}</span>
      <div style="flex:1"><h3 style="font-size:15px;font-weight:800;line-height:1.3">${esc(b.title)}</h3><p style="margin:4px 0 0;font-size:13px;color:var(--muted)">by ${esc(b.author)}</p>
      ${b.description?`<p style="margin:8px 0 0;font-size:12px;color:#b0a596;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">${esc(b.description)}</p>`:''}</div>
      <p style="margin:0;font-size:13px"><b style="color:${av?'var(--green)':'var(--red)'}">${b.availableCopies}</b> <span style="color:var(--muted)">/ ${b.totalCopies} available</span></p>
      ${action}</div></div>`;
  }).join('')}</div>`;
}

let pendingBorrowBookId=null;
function openBorrowRules(bId){
  const bk=bookById(bId);if(!bk)return;
  pendingBorrowBookId=bId;
  const t=document.getElementById('borrowRulesBookTitle');if(t)t.textContent='"'+bk.title+'"';
  openModal('borrowRulesModal');
}
function confirmBorrowRequest(){
  if(!pendingBorrowBookId)return;
  const bId=pendingBorrowBookId;pendingBorrowBookId=null;
  closeModal('borrowRulesModal');
  requestBook(bId);
}
function requestBook(bId){
  const bk=bookById(bId);if(!bk)return;
  const my=records().filter(r=>r.studentId===session.studentId);
  if(my.some(r=>r.bookId===bId&&(r.status==='pending'||r.status==='borrowed'||r.status==='overdue'))){toast('Already requested','You already have this book or a pending request.',true);return}
  DB.records.push({id:'r'+DB.counters.r++,studentId:session.studentId,bookId:bId,requestDate:today(),borrowDate:null,dueDate:null,returnDate:null,status:'pending'});
  save();toast('Request sent',`Your request for "${bk.title}" is awaiting admin approval.`);renderStudentPortal();
}

function renderStuMyBooks(){
  const el=document.getElementById('stuMyBooks');if(!el)return;
  const my=records().filter(r=>r.studentId===session.studentId).sort((a,b)=>new Date(b.requestDate)-new Date(a.requestDate));
  if(!my.length){el.innerHTML=emptyBox('open','No books yet','Request a book from the Browse tab.');return}
  el.innerHTML=`<div style="overflow-x:auto"><table>
    <thead><tr><th>Book</th><th>Requested</th><th>Due Date</th><th style="text-align:right">Fine</th><th style="text-align:center">Status</th><th style="text-align:right">Actions</th></tr></thead>
    <tbody>${my.map(r=>{
      const bk=bookById(r.bookId);if(!bk)return'';
      const cs=catStyle(bk.category);
      const due=r.returnDate?`Returned ${r.returnDate}`:(r.dueDate||'—');
      const canPrint=r.status==='borrowed'||r.status==='overdue';
      const canRenew=r.status==='borrowed'&&!r.renewed;
      const fine=fineFor(r);
      return`<tr>
        <td><div style="display:flex;align-items:center;gap:8px"><span class="dot" style="background:${cs.color}"></span><div><p style="margin:0;font-size:13px;font-weight:700">${esc(bk.title)}</p><p style="margin:0;font-size:11px;color:#b0a596">by ${esc(bk.author)} · ${bk.category}</p></div></div></td>
        <td style="font-size:12px;color:var(--muted)">${r.requestDate}</td>
        <td style="font-size:12px;color:${r.status==='overdue'?'var(--red)':'var(--muted)'};font-weight:${r.status==='overdue'?'700':'400'}">${due}</td>
        <td style="text-align:right;font-size:12px;font-weight:700;color:${fine>0?'var(--red)':'var(--muted)'}">${fine>0?'₱'+fine:'—'}</td>
        <td style="text-align:center">${statusBadge(r.status)}</td>
        <td style="text-align:right"><div style="display:flex;gap:6px;justify-content:flex-end">
          ${canRenew?`<button class="btn btn-outline" style="padding:5px 10px;font-size:11.5px" onclick="renewBook('${r.id}')">Renew</button>`:''}
          ${canPrint?`<button class="btn btn-outline" style="padding:5px 10px;font-size:11.5px" onclick="printSlipForRecord('${r.id}')">Print</button>`:''}
        </div></td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
}

function renewBook(id){
  const r=records().find(x=>x.id===id);if(!r)return;
  if(r.status!=='borrowed'){toast('Cannot renew','Only current, non-overdue borrows can be renewed.',true);return}
  if(r.renewed){toast('Already renewed','This book has already been renewed once. Please return it by the due date.',true);return}
  r.dueDate=plusDays(LOAN_DAYS);r.renewed=true;save();
  toast('Renewed','New due date: '+r.dueDate+'.');
  renderStudentPortal();
}

function checkDueSoon(sId){
  const soon=records().filter(r=>r.studentId===sId&&r.status==='borrowed'&&r.dueDate);
  const dueSoon=soon.filter(r=>{const d=Math.floor((new Date(r.dueDate+'T00:00:00')-new Date())/864e5);return d>=0&&d<=2});
  if(!dueSoon.length)return;
  const bk=bookById(dueSoon[0].bookId);
  toast('Due soon',dueSoon.length===1?`"${bk?bk.title:'A book'}" is due ${dueSoon[0].dueDate}.`:`${dueSoon.length} books are due within 2 days.`,true);
}

function checkWaitlistReady(sId){
  const mine=waitlist().filter(w=>w.studentId===sId);
  if(!mine.length)return;
  const ready=mine.filter(w=>{const bk=bookById(w.bookId);return bk&&bk.availableCopies>0});
  if(!ready.length)return;
  const bk=bookById(ready[0].bookId);
  toast('Now available!',ready.length===1?`"${bk?bk.title:'A book'}" is back in stock — request it before it's gone.`:`${ready.length} books you're waiting on are now available.`);
  DB.waitlist=DB.waitlist.filter(w=>!ready.includes(w));
  save();
}

function joinWaitlist(bId){
  const bk=bookById(bId);if(!bk)return;
  if(waitlist().some(w=>w.bookId===bId&&w.studentId===session.studentId)){toast('Already on waitlist',"We'll let you know when a copy is available.",true);return}
  DB.waitlist.push({id:'w'+DB.counters.w++,studentId:session.studentId,bookId:bId,date:today()});
  save();toast('Added to waitlist',`We'll let you know when "${bk.title}" is back in stock.`);
  renderStuBrowse();
}
function leaveWaitlist(wId){
  DB.waitlist=DB.waitlist.filter(w=>w.id!==wId);save();
  toast('Removed from waitlist','');
  renderStuBrowse();
}
function renderStuWaitlist(){
  const box=document.getElementById('stuWaitlistBox');if(!box)return;
  const mine=waitlist().filter(w=>w.studentId===session.studentId);
  if(!mine.length){box.classList.add('hidden');box.innerHTML='';return}
  box.classList.remove('hidden');
  box.innerHTML=`<div class="card"><div style="padding:12px 16px;border-bottom:1px solid var(--line)"><strong style="font-size:13px">Your Waitlist</strong></div>
    <div style="padding:8px 16px 12px;display:flex;flex-direction:column;gap:6px">
    ${mine.map(w=>{
      const bk=bookById(w.bookId);if(!bk)return'';
      return `<div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;gap:10px">
        <span>${esc(bk.title)}${bk.availableCopies>0?' <span style="color:var(--green);font-weight:700">· Available now</span>':''}</span>
        <button class="btn btn-ghost" style="padding:4px 10px;font-size:11.5px" onclick="leaveWaitlist('${w.id}')">Remove</button>
      </div>`;
    }).join('')}
    </div></div>`;
}

boot();