const ADMIN_CREDENTIALS = { username: 'admin', password: 'library123' };
const LOAN_DAYS = 14;

function addCategory() {
  const input = document.getElementById('bNewCat');
  const name = input.value.trim();
  if (!name) return;
  if (!DB.customCategories) DB.customCategories = [];
  if (getCategories().some(c => c.toLowerCase() === name.toLowerCase())) {
    toast('Duplicate', 'This category already exists.', true); return;
  }
  DB.customCategories.push(name);
  save(); input.value = '';
  refreshCategorySelects();
  document.getElementById('bCategory').value = name;
  updateCatDeleteBtn();
  toast('Category added', `"${name}" is now available.`);
}

function updateCatDeleteBtn() {
  
}

function openManageCategories() {
  renderManageCatList();
  openModal('manageCatModal');
}

function renderManageCatList() {
  const cats = getCategories();
  const el = document.getElementById('manageCatList');
  el.innerHTML = cats.map(cat => {
    const isDefault = DEFAULT_CATEGORIES.includes(cat);
    const count = books().filter(b => b.category === cat).length;
    const cs = catStyle(cat);
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#faf7f1;border:1px solid var(--line);border-radius:10px">
      <div style="display:flex;align-items:center;gap:10px">
        <span class="dot" style="background:${cs.color}"></span>
        <span style="font-weight:700;font-size:14px">${esc(cat)}</span>
        <span style="font-size:12px;color:var(--muted)">${count} book(s)</span>
        ${isDefault ? '<span style="font-size:11px;color:var(--muted);background:var(--line);padding:2px 8px;border-radius:6px">Default</span>' : ''}
      </div>
      ${isDefault ? '' : `<button class="icon-btn" onclick="deleteCategoryFromManager('${esc(cat)}')" title="Delete category"><svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg></button>`}
    </div>`;
  }).join('');
}

function deleteCategoryFromManager(cat) {
  const count = books().filter(b => b.category === cat).length;
  if (count) {
    toast('Cannot delete', `${count} book(s) are assigned to "${cat}". Reassign or remove them first.`, true);
    return;
  }
  openConfirm(`Delete category "${cat}"?`, 'This will permanently remove the category.', () => {
    if (!DB.customCategories) DB.customCategories = [];
    DB.customCategories = DB.customCategories.filter(c => c !== cat);
    save();
    refreshCategorySelects();
    renderManageCatList();
    toast('Category deleted', `"${cat}" has been removed.`);
  });
}

function adminLogin() {
  const uEl = document.getElementById('adminUser');
  const pEl = document.getElementById('adminPass');
  const err = document.getElementById('adminErr');
  if (!uEl || !pEl) { window.location.href = 'admin.html'; return; }
  const u = uEl.value.trim();
  const p = pEl.value;
  if (u === ADMIN_CREDENTIALS.username && p === ADMIN_CREDENTIALS.password) {
    if (err) err.classList.add('hidden');
    saveSession({ role: 'admin', studentId: null });
    pEl.value = '';
    showScreen('screen-admin');
    switchTab('dashboard', document.querySelector('#screen-admin .tab-btn'));
    toast('Welcome, Admin', 'You are logged in to the library console.');
  } else if (err) {
    err.textContent = 'Invalid username or password.';
    err.classList.remove('hidden');
  }
}

function switchTab(name, btn) {
  if (!document.getElementById('tab-' + name)) return;
  document.querySelectorAll('#screen-admin .tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('#screen-admin .tab-btn').forEach(b => b.classList.remove('tab-active'));
  document.getElementById('tab-' + name).classList.add('active');
  if (btn) btn.classList.add('tab-active');
  if (name === 'dashboard') renderDashboard();
  if (name === 'books') renderBooks();
  if (name === 'students') renderStudents();
  if (name === 'requests') renderRequests();
  if (name === 'borrow') renderBorrow();
  if (name === 'history') renderHistory();
  updateReqBadge();
}

function updateReqBadge() {
  const b = document.getElementById('reqBadge');
  if (!b) return;
  const n = records().filter(r => r.status === 'pending').length;
  b.textContent = n || '';
  b.style.display = n ? '' : 'none';
}

function renderDashboard() {
  if (!document.getElementById('statCards')) return;
  const recs = records();
  const active = recs.filter(r => r.status === 'borrowed' || r.status === 'overdue');
  const overdue = recs.filter(r => r.status === 'overdue');
  const returned = recs.filter(r => r.status === 'returned');
  const pending = recs.filter(r => r.status === 'pending');
  const totalCopies = books().reduce((a, b) => a + b.totalCopies, 0);
  const availCopies = books().reduce((a, b) => a + b.availableCopies, 0);
  const borrowed = totalCopies - availCopies;
  const util = totalCopies ? Math.round(borrowed / totalCopies * 100) : 0;

  const cards = [
    { label: 'Total Books', value: books().length, sub: `${totalCopies} copies in library`, color: '#7a0c0c', ic: 'book' },
    { label: 'Students', value: students().length, sub: 'Registered members', color: '#8a6a00', ic: 'users' },
    { label: 'Active Borrows', value: active.length, sub: `${pending.length} pending request(s)`, color: '#6b3fa0', ic: 'open' },
    { label: 'Overdue', value: overdue.length, sub: 'Needs attention', color: '#b3261e', ic: 'clock' },
  ];
  const icons = {
    book: `<svg width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
    users: `<svg width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>`,
    open: `<svg width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`,
    clock: `<svg width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  };
  document.getElementById('statCards').innerHTML = cards.map(c => `
    <div class="stat-card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <p style="margin:0 0 4px;font-size:13px;color:var(--muted);font-weight:600">${c.label}</p>
          <p style="margin:0 0 2px;font-size:30px;font-weight:800;line-height:1">${c.value}</p>
          <p style="margin:0;font-size:12px;color:var(--muted)">${c.sub}</p>
        </div>
        <div class="stat-ic" style="color:${c.color}">${icons[c.ic]}</div>
      </div>
    </div>`).join('');

  const cats = getCategories();
  const catData = cats.map(cat => {
    const bs = books().filter(b => b.category === cat);
    const tot = bs.reduce((a, b) => a + b.totalCopies, 0);
    const av = bs.reduce((a, b) => a + b.availableCopies, 0);
    return { cat, count: bs.length, tot, av, br: tot - av, pct: tot ? Math.round((tot - av) / tot * 100) : 0 };
  });
  document.getElementById('categoryCard').innerHTML = `
    <div style="padding:16px 16px 12px;border-bottom:1px solid var(--line)"><strong>Collection by Category</strong></div>
    <div style="padding:20px;display:flex;flex-direction:column;gap:20px">
      ${catData.map(d => {
        const st = catStyle(d.cat);
        return `<div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font-size:13px">
            <div style="display:flex;align-items:center;gap:8px">
              <span class="dot" style="background:${st.color}"></span><span style="font-weight:700">${d.cat}</span>
              <span class="badge ${st.badge}">${d.count} titles</span>
            </div>
            <span style="color:var(--muted)">${d.br}/${d.tot} out &middot; ${d.av} available</span>
          </div>
          <div class="progress"><div style="width:${d.pct}%"></div></div>
        </div>`;
      }).join('')}
      <div style="background:#faf7f1;border:1px solid var(--line);border-radius:10px;padding:16px;display:flex;justify-content:space-between;align-items:center">
        <div><p style="margin:0 0 2px;font-size:14px;font-weight:700">Overall Utilization</p><p style="margin:0;font-size:12px;color:var(--muted)">${borrowed} of ${totalCopies} copies currently out</p></div>
        <span style="font-size:28px;font-weight:800;color:var(--maroon)">${util}%</span>
      </div>
    </div>`;

  const recent = recs.slice().sort((a, b) => new Date(b.requestDate) - new Date(a.requestDate)).slice(0, 7);
  document.getElementById('activityCard').innerHTML = `
    <div style="padding:16px 16px 12px;border-bottom:1px solid var(--line)"><strong>Recent Activity</strong></div>
    <div style="padding:12px;display:flex;flex-direction:column;gap:8px;max-height:340px;overflow-y:auto">
      ${recent.length ? recent.map(r => {
        const bk = bookById(r.bookId), st = studentById(r.studentId);
        if (!bk || !st) return '';
        const cs = catStyle(bk.category);
        return `<div style="display:flex;align-items:flex-start;gap:10px;border:1px solid #f2ece2;border-radius:8px;padding:10px">
          <span class="dot" style="background:${cs.color};margin-top:4px"></span>
          <div style="flex:1;min-width:0">
            <p style="margin:0;font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(st.name)}</p>
            <p style="margin:0;font-size:12px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">"${esc(bk.title)}"</p>
            <p style="margin:0;font-size:11px;color:#b0a596">${r.requestDate}</p>
          </div>${statusBadge(r.status)}
        </div>`;
      }).join('') : `<p style="text-align:center;color:var(--muted);padding:20px;font-size:13px">No activity yet.</p>`}
    </div>`;
}

function renderBooks() {
  const searchEl = document.getElementById('bookSearch');
  const catEl = document.getElementById('bookCatFilter');
  const grid = document.getElementById('booksGrid');
  if (!searchEl || !catEl || !grid) return;
  const search = searchEl.value.toLowerCase();
  const cat = catEl.value;
  const filtered = books().filter(b => {
    const mc = !cat || b.category === cat;
    const ms = !search || [b.title, b.author, b.isbn].some(f => f.toLowerCase().includes(search));
    return mc && ms;
  });
  if (!filtered.length) { grid.innerHTML = emptyBox('book', 'No books found', 'Try adjusting filters or add a new book.'); return; }
  grid.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px">${filtered.map(b => {
    const st = catStyle(b.category), av = b.availableCopies > 0;
    return `<div class="card"><div style="padding:20px;display:flex;flex-direction:column;gap:12px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <span class="badge ${st.badge}"><span class="dot" style="background:${st.color}"></span>${b.category}</span>
        <button class="icon-btn" title="Delete" onclick="deleteBook('${b.id}')"><svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg></button>
      </div>
      <div><h3 style="font-size:15px;font-weight:800;line-height:1.3">${esc(b.title)}</h3><p style="margin:4px 0 0;font-size:13px;color:var(--muted)">by ${esc(b.author)}</p></div>
      ${b.description ? `<p style="margin:0;font-size:12px;color:#b0a596;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(b.description)}</p>` : ''}
      <div style="border-top:1px solid #f2ece2;padding-top:12px;display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:13px"><b style="color:${av ? 'var(--green)' : 'var(--red)'}">${b.availableCopies}</b> <span style="color:var(--muted)">/ ${b.totalCopies} available</span></span>
        <span style="font-family:monospace;font-size:10px;color:#b0a596">${esc(b.isbn)}</span>
      </div>
    </div></div>`;
  }).join('')}</div>`;
}

function addBook() {
  const title = val('bTitle'), author = val('bAuthor'), isbn = val('bISBN');
  if (!title || !author || !isbn) { toast('Missing fields', 'Please fill in all required fields.', true); return; }
  const copies = parseInt(document.getElementById('bCopies').value) || 1;
  const category = document.getElementById('bCategory').value;
  if (!category) { toast('Missing category', 'Please select or add a category.', true); return; }
  if (!DB.customCategories) DB.customCategories = [];
  if (!getCategories().includes(category)) { DB.customCategories.push(category); save(); }
  DB.books.push({ id: 'b' + DB.counters.b++, title, author, category, isbn, description: val('bDesc') || null, totalCopies: copies, availableCopies: copies });
  save();
  toast('Book added', `"${title}" has been added.`);
  closeModal('addBookModal');
  ['bTitle', 'bAuthor', 'bISBN', 'bDesc', 'bNewCat'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('bCopies').value = '1';
  refreshCategorySelects();
  renderBooks(); renderDashboard();
}
function deleteBook(id) {
  openConfirm('Delete this book?', 'This removes the book and its borrow history permanently.', () => {
    DB.books = DB.books.filter(x => x.id !== id);
    DB.records = DB.records.filter(r => r.bookId !== id);
    save(); toast('Book removed', 'The book has been deleted.');
    renderBooks(); renderDashboard(); updateReqBadge();
  });
}

function renderStudents() {
  const searchEl = document.getElementById('studentSearch');
  const el0 = document.getElementById('studentsTable');
  if (!searchEl || !el0) return;
  const search = searchEl.value.toLowerCase();
  const filtered = students().filter(s => !search || [s.name, s.studentId, s.course, s.section, s.year].some(f => (f || '').toLowerCase().includes(search)));
  const el = document.getElementById('studentsTable');
  if (!filtered.length) { el.innerHTML = emptyBox('users', 'No students found', 'Register a student to get started.'); return; }
  el.innerHTML = `<div style="overflow-x:auto"><table>
    <thead><tr><th>Student</th><th>Student ID</th><th>Course / Section</th><th>Year</th><th style="text-align:center">Active</th><th style="text-align:right">Actions</th></tr></thead>
    <tbody>${filtered.map(s => {
      const active = records().filter(r => r.studentId === s.id && (r.status === 'borrowed' || r.status === 'overdue')).length;
      return `<tr>
        <td><div style="display:flex;align-items:center;gap:10px">${avatarHTML(s.name, s.photo)}<div><p style="margin:0;font-weight:700">${esc(s.name)}</p></div></div></td>
        <td><span style="font-family:monospace;font-size:12px;color:var(--muted)">${esc(s.studentId)}</span></td>
        <td style="color:var(--muted);font-size:13px">${esc(s.course)}<br><span style="font-size:12px;color:#b0a596">${esc(s.section)}</span></td>
        <td style="color:var(--muted);font-size:13px">${esc(s.year)}</td>
        <td style="text-align:center"><span class="badge ${active ? 'b-borrowed' : ''}" style="${active ? '' : 'background:#efe7da;color:var(--muted)'}">${active}</span></td>
        <td style="text-align:right"><button class="icon-btn" onclick="deleteStudent('${s.id}')"><svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg></button></td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
}

function addStudentAdmin() {
  const name = val('sName'), sid = val('sId'), password = document.getElementById('sPassword').value;
  const year = document.getElementById('sYear').value, section = val('sSection'), course = document.getElementById('sCourse').value;
  if (!name || !sid || !password || !section) { toast('Missing fields', 'Please fill in all required fields.', true); return; }
  if (!validSid(sid)) { toast('Invalid Student ID', 'Use the format 25-XXXX-XXX.', true); return; }
  if (students().some(s => s.studentId === sid)) { toast('Duplicate ID', 'That Student ID is already registered.', true); return; }
  if (!validPassword(password)) { toast('Weak password', 'Password must be at least 6 characters.', true); return; }
  DB.students.push({ id: 's' + DB.counters.s++, studentId: sid, password, name, year, section, course, photo: null });
  save(); toast('Student registered', `${name} has been added.`);
  closeModal('addStudentModal');
  ['sName', 'sId', 'sSection', 'sPassword'].forEach(id => document.getElementById(id).value = '');
  renderStudents(); renderDashboard(); renderBorrow();
}
function deleteStudent(id) {
  openConfirm('Delete this student?', 'This removes the student and their borrow history.', () => {
    DB.students = DB.students.filter(x => x.id !== id);
    DB.records = DB.records.filter(r => r.studentId !== id);
    save(); toast('Student removed', 'The student record has been deleted.');
    renderStudents(); renderDashboard(); updateReqBadge();
  });
}

function renderRequests() {
  const el = document.getElementById('requestsTable');
  if (!el) return;
  const pending = records().filter(r => r.status === 'pending');
  if (!pending.length) { el.innerHTML = emptyBox('check', 'No pending requests', 'Book requests from students will appear here.'); return; }
  el.innerHTML = `<div style="overflow-x:auto"><table>
    <thead><tr><th>Student</th><th>Book</th><th>Requested</th><th style="text-align:right">Action</th></tr></thead>
    <tbody>${pending.map(r => {
      const bk = bookById(r.bookId), st = studentById(r.studentId);
      if (!bk || !st) return '';
      const cs = catStyle(bk.category);
      const canApprove = bk.availableCopies > 0;
      return `<tr>
        <td><div style="display:flex;align-items:center;gap:10px">${avatarHTML(st.name, st.photo, 32, 12)}<div><p style="margin:0;font-weight:700;font-size:13px">${esc(st.name)}</p><p style="margin:0;font-size:11px;color:#b0a596">${esc(st.studentId)}</p></div></div></td>
        <td><div style="display:flex;align-items:center;gap:6px"><span class="dot" style="background:${cs.color}"></span><div><p style="margin:0;font-size:13px;font-weight:600">${esc(bk.title)}</p><p style="margin:0;font-size:11px;color:#b0a596">${bk.availableCopies} available</p></div></div></td>
        <td style="font-size:12px;color:var(--muted)">${r.requestDate}</td>
        <td style="text-align:right"><div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn btn-primary" style="padding:7px 14px;font-size:13px;${canApprove ? '' : 'opacity:.5;cursor:not-allowed'}" ${canApprove ? '' : 'disabled'} onclick="approveRequest('${r.id}')">Approve</button>
          <button class="btn btn-outline" style="padding:7px 14px;font-size:13px" onclick="rejectRequest('${r.id}')">Reject</button>
        </div></td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
}
function approveRequest(id) {
  const r = records().find(x => x.id === id); if (!r) return;
  const bk = bookById(r.bookId);
  if (!bk || bk.availableCopies <= 0) { toast('No copies available', 'This book is currently out of stock.', true); return; }
  bk.availableCopies--;
  r.status = 'borrowed'; r.borrowDate = today(); r.dueDate = plusDays(LOAN_DAYS);
  save(); toast('Request approved', 'The book has been issued to the student.');
  renderRequests(); renderDashboard(); updateReqBadge(); renderBorrow();
}
function rejectRequest(id) {
  openConfirm('Reject this request?', 'The borrow request will be removed.', () => {
    DB.records = DB.records.filter(x => x.id !== id);
    save(); toast('Request rejected', 'The request has been removed.');
    renderRequests(); renderDashboard(); updateReqBadge();
  });
}

function renderBorrow() {
  const ss = document.getElementById('borrowStudent'), sb = document.getElementById('borrowBook');
  if (!ss || !sb) return;
  const curS = ss.value, curB = sb.value;
  ss.innerHTML = '<option value="">Select a student</option>' + students().map(s => `<option value="${s.id}">${esc(s.name)} · ${esc(s.studentId)}</option>`).join('');
  const avail = books().filter(b => b.availableCopies > 0);
  sb.innerHTML = '<option value="">Select an available book</option>' + avail.map(b => `<option value="${b.id}">${esc(b.title)} (${b.availableCopies} left)</option>`).join('');
  if (curS) ss.value = curS; if (curB) sb.value = curB;
  if (!document.getElementById('borrowDue').value) document.getElementById('borrowDue').value = plusDays(LOAN_DAYS);

  const active = records().filter(r => r.status === 'borrowed' || r.status === 'overdue');
  const cnt = document.getElementById('activeBorrowCount');
  cnt.textContent = active.length || ''; cnt.style.display = active.length ? '' : 'none';

  const el = document.getElementById('activeBorrowsTable');
  if (!active.length) { el.innerHTML = emptyBox('open', 'No active borrows', 'Issued books will appear here.'); return; }
  el.innerHTML = `<div style="max-height:440px;overflow-y:auto"><table>
    <thead><tr><th>Student / Book</th><th>Due</th><th style="text-align:right">Actions</th></tr></thead>
    <tbody>${active.map(r => {
      const bk = bookById(r.bookId), st = studentById(r.studentId);
      if (!bk || !st) return '';
      const cs = catStyle(bk.category), ov = r.status === 'overdue';
      return `<tr>
        <td><div style="display:flex;flex-direction:column;gap:2px">
          <div style="display:flex;align-items:center;gap:6px"><span class="dot" style="background:${cs.color}"></span><span style="font-weight:700;font-size:14px">${esc(st.name)}</span></div>
          <div style="padding-left:14px;font-size:12px;color:var(--muted)">${esc(bk.title)}</div></div></td>
        <td><span style="color:${ov ? 'var(--red)' : 'var(--muted)'};font-weight:${ov ? '700' : '400'};font-size:13px">${r.dueDate}</span>${ov ? '<br><span class="badge b-overdue" style="font-size:10px;margin-top:2px">Overdue</span>' : ''}</td>
        <td style="text-align:right"><div style="display:flex;gap:6px;justify-content:flex-end">
          <button class="btn btn-outline" style="padding:6px 10px;font-size:12px" onclick="printSlipForRecord('${r.id}')">Print Slip</button>
          <button class="btn btn-outline" style="padding:6px 12px;font-size:13px" onclick="returnBook('${r.id}')">Return</button>
        </div></td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
}
function issueBorrow() {
  const sId = document.getElementById('borrowStudent').value, bId = document.getElementById('borrowBook').value;
  if (!sId || !bId) { toast('Missing information', 'Select both a student and a book.', true); return; }
  const bk = bookById(bId);
  if (!bk || bk.availableCopies <= 0) { toast('No copies available', 'This book is out of stock.', true); return; }
  const due = document.getElementById('borrowDue').value || plusDays(LOAN_DAYS);
  DB.records.push({ id: 'r' + DB.counters.r++, studentId: sId, bookId: bId, requestDate: today(), borrowDate: today(), dueDate: due, returnDate: null, status: 'borrowed' });
  bk.availableCopies--; save();
  const st = studentById(sId);
  toast('Book issued', `${st.name} borrowed "${bk.title}".`);
  document.getElementById('borrowStudent').value = ''; document.getElementById('borrowBook').value = '';
  renderBorrow(); renderDashboard();
}
function returnBook(id) {
  const r = records().find(x => x.id === id); if (!r) return;
  r.status = 'returned'; r.returnDate = today();
  const bk = bookById(r.bookId); if (bk) bk.availableCopies++;
  save();
  toast('Book returned', `"${bk ? bk.title : 'Book'}" has been returned.`);
  renderBorrow(); renderDashboard(); if (session.role === 'student') renderStudentPortal();
}

function renderHistory() {
  const filterEl = document.getElementById('historyFilter');
  if (!filterEl || !document.getElementById('historyTable')) return;
  const filter = filterEl.value;
  const recs = records().filter(r => r.status !== 'pending');
  const filtered = filter === 'all' ? recs : recs.filter(r => r.status === filter);
  const counts = {
    borrowed: recs.filter(r => r.status === 'borrowed').length,
    returned: recs.filter(r => r.status === 'returned').length,
    overdue: recs.filter(r => r.status === 'overdue').length,
  };
  document.getElementById('historyCounts').innerHTML =
    `<span style="font-size:12px;color:var(--muted)">${filtered.length} records</span>` +
    (filter === 'all' ? `<span class="badge b-borrowed">Borrowed: ${counts.borrowed}</span><span class="badge b-returned">Returned: ${counts.returned}</span><span class="badge b-overdue">Overdue: ${counts.overdue}</span>` : '');
  const el = document.getElementById('historyTable');
  if (!filtered.length) { el.innerHTML = emptyBox('clock', 'No history records', 'Borrowing activity will show here.'); return; }
  el.innerHTML = `<div style="max-height:540px;overflow:auto"><table>
    <thead><tr><th>Student</th><th>Book</th><th>Borrowed</th><th>Due / Returned</th><th style="text-align:center">Status</th><th style="text-align:right">Action</th></tr></thead>
    <tbody>${filtered.map(r => {
      const bk = bookById(r.bookId), st = studentById(r.studentId);
      if (!bk || !st) return '';
      const cs = catStyle(bk.category);
      const dateCol = r.returnDate ? `<span style="color:var(--green)">${r.returnDate}</span>` : `<span style="color:${r.status === 'overdue' ? 'var(--red)' : 'var(--muted)'}">${r.dueDate || '—'}</span>`;
      return `<tr>
        <td><div style="display:flex;align-items:center;gap:8px">${avatarHTML(st.name, st.photo, 32, 12)}<div><p style="margin:0;font-size:13px;font-weight:700">${esc(st.name)}</p><p style="margin:0;font-size:11px;color:#b0a596">${esc(st.studentId)}</p></div></div></td>
        <td><div style="display:flex;align-items:center;gap:6px"><span class="dot" style="background:${cs.color}"></span><div><p style="margin:0;font-size:13px;font-weight:600">${esc(bk.title)}</p><p style="margin:0;font-size:11px;color:#b0a596">${esc(bk.author)}</p></div></div></td>
        <td style="font-size:12px;color:var(--muted)">${r.borrowDate || '—'}</td>
        <td style="font-size:12px">${dateCol}</td>
        <td style="text-align:center">${statusBadge(r.status)}</td>
        <td style="text-align:right"><div style="display:flex;gap:6px;justify-content:flex-end">
          ${(r.status === 'borrowed' || r.status === 'overdue') ? `<button class="btn btn-outline" style="padding:5px 10px;font-size:11.5px" onclick="printSlipForRecord('${r.id}')">Print Slip</button>` : ''}
          <button class="icon-btn" onclick="deleteRecord('${r.id}')"><svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg></button>
        </div></td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
}
function deleteRecord(id) {
  openConfirm('Delete this record?', 'The borrow record will be permanently removed.', () => {
    const r = records().find(x => x.id === id);
    if (r && (r.status === 'borrowed' || r.status === 'overdue')) { const bk = bookById(r.bookId); if (bk) bk.availableCopies++; }
    DB.records = DB.records.filter(x => x.id !== id);
    save(); toast('Record deleted', 'The borrow record has been removed.');
    renderHistory(); renderDashboard(); updateReqBadge();
  });
}

boot();