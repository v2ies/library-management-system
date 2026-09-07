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
  const err=document.getElementById('regErr');
  if(!name||!sid||!password||!passwordConfirm||!year||!section||!course){showErr(err,'Please fill in all required fields.');return}
  if(!validSid(sid)){showErr(err,'Student ID must follow the format 25-XXXX-XXX (starts with 25).');return}
  if(students().some(s=>s.studentId===sid)){showErr(err,'This Student ID is already registered. Please log in instead.');return}
  if(!validPassword(password)){showErr(err,'Password must be at least 6 characters.');return}
  if(password!==passwordConfirm){showErr(err,'Passwords do not match.');return}
  const s={id:'s'+DB.counters.s++,studentId:sid,password,name,year,section,course,photo:null};
  DB.students.push(s);save();err.classList.add('hidden');
  ['regName','regSid','regSection','regPassword','regPasswordConfirm'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('regYear').value='';document.getElementById('regCourse').value='';
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
  if(!silent){const s=studentById(sId);if(s)toast('Welcome, '+s.name.split(' ')[0],'Browse and request books from the library.')}
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
  const hn=document.getElementById('stuHeaderName');if(hn)hn.textContent=s.name;
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
    let action;
    if(existing&&existing.status==='pending')action=`<button class="btn btn-outline" style="width:100%;cursor:default" disabled>Request Pending</button>`;
    else if(existing)action=`<button class="btn btn-outline" style="width:100%;cursor:default" disabled>Already Borrowed</button>`;
    else if(!av)action=`<button class="btn btn-outline" style="width:100%;opacity:.6;cursor:not-allowed" disabled>Out of Stock</button>`;
    else action=`<button class="btn btn-gold" style="width:100%" onclick="requestBook('${b.id}')">Request to Borrow</button>`;
    return`<div class="card"><div style="padding:20px;display:flex;flex-direction:column;gap:12px;height:100%">
      <span class="badge ${st.badge}" style="align-self:flex-start"><span class="dot" style="background:${st.color}"></span>${b.category}</span>
      <div style="flex:1"><h3 style="font-size:15px;font-weight:800;line-height:1.3">${esc(b.title)}</h3><p style="margin:4px 0 0;font-size:13px;color:var(--muted)">by ${esc(b.author)}</p>
      ${b.description?`<p style="margin:8px 0 0;font-size:12px;color:#b0a596;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">${esc(b.description)}</p>`:''}</div>
      <p style="margin:0;font-size:13px"><b style="color:${av?'var(--green)':'var(--red)'}">${b.availableCopies}</b> <span style="color:var(--muted)">/ ${b.totalCopies} available</span></p>
      ${action}</div></div>`;
  }).join('')}</div>`;
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
    <thead><tr><th>Book</th><th>Requested</th><th>Due Date</th><th style="text-align:center">Status</th></tr></thead>
    <tbody>${my.map(r=>{
      const bk=bookById(r.bookId);if(!bk)return'';
      const cs=catStyle(bk.category);
      const due=r.returnDate?`Returned ${r.returnDate}`:(r.dueDate||'—');
      return`<tr>
        <td><div style="display:flex;align-items:center;gap:8px"><span class="dot" style="background:${cs.color}"></span><div><p style="margin:0;font-size:13px;font-weight:700">${esc(bk.title)}</p><p style="margin:0;font-size:11px;color:#b0a596">by ${esc(bk.author)} · ${bk.category}</p></div></div></td>
        <td style="font-size:12px;color:var(--muted)">${r.requestDate}</td>
        <td style="font-size:12px;color:${r.status==='overdue'?'var(--red)':'var(--muted)'};font-weight:${r.status==='overdue'?'700':'400'}">${due}</td>
        <td style="text-align:center">${statusBadge(r.status)}</td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
}

boot();
