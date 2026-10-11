// admin console logic — data comes from the SQL-backed API (see server/index.js)

const addCategory = guard(async function () {
  const input = document.getElementById('bNewCat');
  const name = input.value.trim();
  if (!name) return;
  if (getCategories().some(c => c.toLowerCase() === name.toLowerCase())) {
    toast('Duplicate', 'This category already exists.', true); return;
  }
  await api('POST', '/api/categories', { name });
  input.value = '';
  await refreshCategorySelects();
  document.getElementById('bCategory').value = name;
  toast('Category added', `"${name}" is now available.`);
});

const openManageCategories = guard(async function () {
  await refreshCategorySelects();
  renderManageCatList();
  openModal('manageCatModal');
});

function renderManageCatList() {
  const el = document.getElementById('manageCatList');
  el.innerHTML = CATS.map(c => {
    const cat = c.name, isDefault = c.isDefault, count = c.count;
    const cs = catStyle(cat);
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#faf7f1;border:1px solid var(--line);border-radius:10px">
      <div style="display:flex;align-items:center;gap:10px">
        <span class="dot" style="background:${cs.color}"></span>
        <span style="font-weight:700;font-size:14px">${esc(cat)}</span>
        <span style="font-size:12px;color:var(--muted)">${count.toLocaleString()} book(s)</span>
        ${isDefault ? '<span style="font-size:11px;color:var(--muted);background:var(--line);padding:2px 8px;border-radius:6px">Default</span>' : ''}
      </div>
      ${isDefault ? '' : `<button class="icon-btn" onclick="deleteCategoryFromManager(this.dataset.cat)" data-cat="${esc(cat)}" title="Delete category"><svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg></button>`}
    </div>`;
  }).join('');
}

function deleteCategoryFromManager(cat) {
  const c = CATS.find(x => x.name === cat);
  if (c && c.count) {
    toast('Cannot delete', `${c.count} book(s) are assigned to "${cat}". Reassign or remove them first.`, true);
    return;
  }
  openConfirm(`Delete category "${cat}"?`, 'This will permanently remove the category.', guard(async () => {
    await api('DELETE', '/api/categories/' + encodeURIComponent(cat));
    await refreshCategorySelects();
    renderManageCatList();
    toast('Category deleted', `"${cat}" has been removed.`);
  }));
}

async function adminLogin() {
  const uEl = document.getElementById('adminUser');
  const pEl = document.getElementById('adminPass');
  const err = document.getElementById('adminErr');
  if (!uEl || !pEl) { window.location.href = 'admin.html'; return; }
  let r;
  try { r = await api('POST', '/api/admin/login', { username: uEl.value.trim(), password: pEl.value }); }
  catch (e) { if (err) { err.textContent = e.message; err.classList.remove('hidden'); } return; }
  if (err) err.classList.add('hidden');
  saveSession({ role: 'admin', studentId: null, token: r.token });
  pEl.value = '';
  await refreshCategorySelects();
  showScreen('screen-admin');
  switchTab('dashboard', document.querySelector('#screen-admin .tab-btn'));
  startAutoRefresh(adminAutoRefresh);
  toast('Welcome, Admin', 'You are logged in to the library console.');
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

// light polling so the console notices new student requests without a manual refresh
async function adminAutoRefresh() {
  if (session.role !== 'admin') return;
  const active = document.querySelector('#screen-admin .tab-content.active');
  const id = active ? active.id : '';
  await updateReqBadge();
  if (id === 'tab-dashboard') await renderDashboard();
  else if (id === 'tab-requests') await renderRequests(true);
  else if (id === 'tab-borrow') await renderActiveBorrows(true);
  else if (id === 'tab-history') await renderHistory(true);
}

async function updateReqBadge() {
  const b = document.getElementById('reqBadge');
  if (!b) return;
  try {
    const c = await api('GET', '/api/admin/counts');
    b.textContent = c.pending || '';
    b.style.display = c.pending ? '' : 'none';
  } catch (e) { }
}

const renderDashboard = guard(async function () {
  if (!document.getElementById('statCards')) return;
  const s = await api('GET', '/api/admin/stats');
  cacheRecords(s.recent);
  const borrowed = s.totalCopies - s.availCopies;
  const util = s.totalCopies ? Math.round(borrowed / s.totalCopies * 100) : 0;

  const cards = [
    { label: 'Total Books', value: s.titles.toLocaleString(), sub: `${s.totalCopies.toLocaleString()} copies in library`, color: '#7a0c0c', ic: 'book' },
    { label: 'Students', value: s.students.toLocaleString(), sub: 'Registered members', color: '#8a6a00', ic: 'users' },
    { label: 'Active Borrows', value: s.active.toLocaleString(), sub: `${s.pending} pending request(s)`, color: '#6b3fa0', ic: 'open' },
    { label: 'Overdue', value: s.overdue.toLocaleString(), sub: 'Needs attention', color: '#b3261e', ic: 'clock' },
    { label: 'Outstanding Fines', value: '₱' + s.fines.toLocaleString(), sub: s.overdue ? `${s.overdue} overdue loan(s)` : 'No overdue loans', color: '#8e1e18', ic: 'fine' },
  ];
  const icons = {
    book: `<svg width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
    users: `<svg width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>`,
    open: `<svg width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`,
    clock: `<svg width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    fine: `<svg width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 10v.01M18 14v.01"/></svg>`,
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

  const catData = s.byCategory.map(d => ({ ...d, br: d.tot - d.av, pct: d.tot ? Math.round((d.tot - d.av) / d.tot * 100) : 0 }));
  document.getElementById('categoryCard').innerHTML = `
    <div style="padding:16px 16px 12px;border-bottom:1px solid var(--line)"><strong>Collection by Category</strong></div>
    <div style="padding:20px;display:flex;flex-direction:column;gap:20px">
      ${catData.map(d => {
        const st = catStyle(d.cat);
        return `<div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font-size:13px">
            <div style="display:flex;align-items:center;gap:8px">
              <span class="dot" style="background:${st.color}"></span><span style="font-weight:700">${esc(d.cat)}</span>
              <span class="badge ${st.badge}">${d.count.toLocaleString()} titles</span>
            </div>
            <span style="color:var(--muted)">${d.br.toLocaleString()}/${d.tot.toLocaleString()} out &middot; ${d.av.toLocaleString()} available</span>
          </div>
          <div class="progress"><div style="width:${d.pct}%"></div></div>
        </div>`;
      }).join('')}
      <div style="background:#faf7f1;border:1px solid var(--line);border-radius:10px;padding:16px;display:flex;justify-content:space-between;align-items:center">
        <div><p style="margin:0 0 2px;font-size:14px;font-weight:700">Overall Utilization</p><p style="margin:0;font-size:12px;color:var(--muted)">${borrowed.toLocaleString()} of ${s.totalCopies.toLocaleString()} copies currently out</p></div>
        <span style="font-size:28px;font-weight:800;color:var(--maroon)">${util}%</span>
      </div>
      ${s.top.length ? `<div>
        <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:var(--ink-soft)">Most Borrowed</p>
        <div style="display:flex;flex-direction:column;gap:8px">
        ${s.top.map((t, i) => `<div style="display:flex;justify-content:space-between;align-items:center;font-size:12.5px">
          <span>${i + 1}. ${esc(t.title)}</span><span style="color:var(--muted)">${t.count}×</span>
        </div>`).join('')}
        </div>
      </div>` : ''}
    </div>`;

  document.getElementById('activityCard').innerHTML = `
    <div style="padding:16px 16px 12px;border-bottom:1px solid var(--line)"><strong>Recent Activity</strong></div>
    <div style="padding:12px;display:flex;flex-direction:column;gap:8px;max-height:340px;overflow-y:auto">
      ${s.recent.length ? s.recent.map(r => {
        const cs = catStyle(r.bookCategory);
        return `<div style="display:flex;align-items:flex-start;gap:10px;border:1px solid #f2ece2;border-radius:8px;padding:10px">
          <span class="dot" style="background:${cs.color};margin-top:4px"></span>
          <div style="flex:1;min-width:0">
            <p style="margin:0;font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.studentName)}</p>
            <p style="margin:0;font-size:12px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">"${esc(r.bookTitle)}"</p>
            <p style="margin:0;font-size:11px;color:#b0a596">${r.requestDate}</p>
          </div>${statusBadge(r.status)}
        </div>`;
      }).join('') : `<p style="text-align:center;color:var(--muted);padding:20px;font-size:13px">No activity yet.</p>`}
    </div>`;
  const b = document.getElementById('reqBadge');
  if (b) { b.textContent = s.pending || ''; b.style.display = s.pending ? '' : 'none'; }
});

// ------------------------------------------------------------------ BOOKS
// Search / filter / paging all run in SQL on the server (FTS5 index), 12 books per page.
let bookPage = 1; const bookSeq = seqGuard();
const searchBooksDebounced = debounce(() => renderBooks(), 250);
function booksGoPage(n) { bookPage = n; renderBooks(true); document.getElementById('booksGrid').scrollIntoView({ behavior: 'smooth', block: 'start' }); }

const renderBooks = guard(async function (keep) {
  const searchEl = document.getElementById('bookSearch');
  const catEl = document.getElementById('bookCatFilter');
  const grid = document.getElementById('booksGrid');
  if (!searchEl || !catEl || !grid) return;
  if (!keep) bookPage = 1;
  const ok = bookSeq();
  const qs = new URLSearchParams({ q: searchEl.value.trim(), category: catEl.value, page: bookPage, limit: 12 });
  const data = await api('GET', '/api/books?' + qs);
  if (!ok()) return;
  bookPage = data.page;
  if (!data.items.length) { grid.innerHTML = emptyBox('book', 'No books found', 'Try adjusting filters or add a new book.'); return; }
  grid.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px">${data.items.map(b => {
    const st = catStyle(b.category), av = b.availableCopies > 0;
    return `<div class="card" style="display:flex;flex-direction:column;height:100%"><div style="height:84px;background:${st.color};position:relative;display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0">
      <div style="position:absolute;left:0;top:0;bottom:0;width:8px;background:rgba(0,0,0,.18)"></div>
      <span style="font-size:28px;font-weight:800;color:#fff;letter-spacing:.02em">${esc((b.title[0] || '?').toUpperCase())}</span>
    </div><div style="padding:20px;display:flex;flex-direction:column;gap:12px;flex:1;min-height:0">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <span class="badge ${st.badge}"><span class="dot" style="background:${st.color}"></span>${esc(b.category)}</span>
        <div style="display:flex;gap:2px">
          <button class="icon-btn" title="Edit" onclick="openEditBook(${b.id})"><svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          <button class="icon-btn" title="Delete" onclick="deleteBook(${b.id})"><svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg></button>
        </div>
      </div>
      <div style="flex:1"><h3 style="font-size:15px;font-weight:800;line-height:1.3">${esc(b.title)}</h3><p style="margin:4px 0 0;font-size:13px;color:var(--muted)">by ${esc(b.author)}</p>
      ${b.description ? `<p style="margin:8px 0 0;font-size:12px;color:#b0a596;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(b.description)}</p>` : ''}
      ${b.waiting ? `<span class="badge" style="margin-top:8px;background:var(--purple-tint);color:var(--purple);align-self:flex-start">${b.waiting} waiting</span>` : ''}</div>
      <div style="border-top:1px solid #f2ece2;padding-top:12px;display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:13px"><b style="color:${av ? 'var(--green)' : 'var(--red)'}">${b.availableCopies}</b> <span style="color:var(--muted)">/ ${b.totalCopies} available</span></span>
        <button class="btn btn-outline" style="padding:5px 10px;font-size:11.5px" onclick="openRestock(${b.id})">Restock</button>
      </div>
      <span style="font-family:monospace;font-size:10px;color:#b0a596">${esc(b.isbn)}</span>
    </div></div>`;
  }).join('')}</div>${pagerHTML(data, 'booksGoPage')}`;
});

const addBook = guard(async function () {
  const title = val('bTitle'), author = val('bAuthor'), isbn = val('bISBN');
  if (!title || !author || !isbn) { toast('Missing fields', 'Please fill in all required fields.', true); return; }
  const copies = parseInt(document.getElementById('bCopies').value) || 1;
  const category = document.getElementById('bCategory').value;
  if (!category) { toast('Missing category', 'Please select or add a category.', true); return; }
  try { await api('POST', '/api/books', { title, author, isbn, category, copies, description: val('bDesc') || null }); }
  catch (e) { if (e.status === 409 || e.status === 400) { toast('Could not add book', e.message, true); return; } throw e; }
  toast('Book added', `"${title}" has been added.`);
  closeModal('addBookModal');
  ['bTitle', 'bAuthor', 'bISBN', 'bDesc', 'bNewCat'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('bCopies').value = '1';
  await refreshCategorySelects();
  renderBooks(true); renderDashboard();
});
function deleteBook(id) {
  openConfirm('Delete this book?', 'This removes the book and its borrow history permanently.', guard(async () => {
    await api('DELETE', '/api/books/' + id);
    toast('Book removed', 'The book has been deleted.');
    renderBooks(true); renderDashboard(); updateReqBadge();
  }));
}

let editBookId = null;
const openEditBook = guard(async function (bId) {
  const bk = await api('GET', '/api/books/' + bId);
  editBookId = bId;
  await refreshCategorySelects();
  document.getElementById('bETitle').value = bk.title;
  document.getElementById('bEAuthor').value = bk.author;
  document.getElementById('bECategory').value = bk.category;
  document.getElementById('bEISBN').value = bk.isbn;
  document.getElementById('bEDesc').value = bk.description || '';
  const e = document.getElementById('editBookErr'); if (e) e.classList.add('hidden');
  openModal('editBookModal');
});
const saveEditBook = guard(async function () {
  const title = val('bETitle'), author = val('bEAuthor'), category = document.getElementById('bECategory').value, isbn = val('bEISBN'), desc = val('bEDesc');
  const err = document.getElementById('editBookErr');
  if (!title || !author || !category || !isbn) { showErr(err, 'Please fill in all required fields.'); return; }
  try { await api('PUT', '/api/books/' + editBookId, { title, author, category, isbn, description: desc }); }
  catch (e) { if (e.status === 409 || e.status === 400) { showErr(err, e.message); return; } throw e; }
  closeModal('editBookModal');
  toast('Book updated', `"${title}" has been updated.`);
  renderBooks(true); renderDashboard(); renderBorrow();
});

let restockBookId = null;
const openRestock = guard(async function (bId) {
  const bk = await api('GET', '/api/books/' + bId);
  restockBookId = bId;
  document.getElementById('restockBookTitle').textContent = bk.title;
  document.getElementById('restockCurrent').textContent = `Currently ${bk.availableCopies} of ${bk.totalCopies} available.`;
  document.getElementById('restockQty').value = 1;
  const e = document.getElementById('restockErr'); if (e) e.classList.add('hidden');
  openModal('restockModal');
});
const confirmRestock = guard(async function () {
  const qty = parseInt(document.getElementById('restockQty').value, 10);
  const err = document.getElementById('restockErr');
  if (!qty || qty < 1) { showErr(err, 'Enter a number of copies greater than 0.'); return; }
  const bk = await api('POST', `/api/books/${restockBookId}/restock`, { qty });
  closeModal('restockModal');
  toast('Book restocked', `Added ${qty} cop${qty === 1 ? 'y' : 'ies'} of "${bk.title}" — now ${bk.availableCopies} available.`);
  renderBooks(true); renderDashboard(); renderBorrow();
});

// ---------------------------------------------------------------- STUDENTS
let studentPage = 1; const studentSeq = seqGuard();
const STU = new Map();
const searchStudentsDebounced = debounce(() => renderStudents(), 250);
function studentsGoPage(n) { studentPage = n; renderStudents(true); }

const renderStudents = guard(async function (keep) {
  const searchEl = document.getElementById('studentSearch');
  const el = document.getElementById('studentsTable');
  if (!searchEl || !el) return;
  if (!keep) studentPage = 1;
  const ok = studentSeq();
  const qs = new URLSearchParams({ q: searchEl.value.trim(), page: studentPage, limit: 15 });
  const data = await api('GET', '/api/admin/students?' + qs);
  if (!ok()) return;
  studentPage = data.page;
  data.items.forEach(s => STU.set(String(s.id), s));
  if (!data.items.length) { el.innerHTML = emptyBox('users', 'No students found', 'Register a student to get started.'); return; }
  el.innerHTML = `<div style="overflow-x:auto"><table>
    <thead><tr><th>Student</th><th>Student ID</th><th>Course</th><th>Year</th><th style="text-align:center">Active</th><th style="text-align:right">Actions</th></tr></thead>
    <tbody>${data.items.map(s => {
      const active = s.active;
      return `<tr>
        <td><div style="display:flex;align-items:center;gap:10px">${avatarHTML(s.name, s.photo)}<div><p style="margin:0;font-weight:700">${esc(s.name)}</p></div></div></td>
        <td><span style="font-family:monospace;font-size:12px;color:var(--muted)">${esc(s.studentId)}</span></td>
        <td style="color:var(--muted);font-size:13px">${esc(s.course)}</td>
        <td style="color:var(--muted);font-size:13px">${esc(s.year)}</td>
        <td style="text-align:center"><span class="badge ${active ? 'b-borrowed' : ''}" style="${active ? '' : 'background:#efe7da;color:var(--muted)'}">${active}</span></td>
        <td style="text-align:right"><div style="display:flex;gap:2px;justify-content:flex-end">
          <button class="icon-btn" title="Reset Password" onclick="openResetPassword(${s.id})"><svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg></button>
          <button class="icon-btn" title="Delete" onclick="deleteStudent(${s.id})"><svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg></button>
        </div></td>
      </tr>`;
    }).join('')}</tbody></table></div>${pagerHTML(data, 'studentsGoPage')}`;
});

const addStudentAdmin = guard(async function () {
  const name = val('sName'), sid = val('sId'), password = document.getElementById('sPassword').value;
  const year = document.getElementById('sYear').value, course = document.getElementById('sCourse').value;
  if (!name || !sid || !password) { toast('Missing fields', 'Please fill in all required fields.', true); return; }
  if (!validSid(sid)) { toast('Invalid Student ID', 'Use the format YY-XXXX-XXX.', true); return; }
  if (!validPassword(password)) { toast('Weak password', 'Password must be at least 6 characters.', true); return; }
  try { await api('POST', '/api/admin/students', { name, studentId: sid, password, year, course }); }
  catch (e) { if (e.status === 409 || e.status === 400) { toast('Could not register', e.message, true); return; } throw e; }
  toast('Student registered', `${name} has been added.`);
  closeModal('addStudentModal');
  ['sName', 'sId', 'sPassword'].forEach(id => document.getElementById(id).value = '');
  renderStudents(true); renderDashboard(); renderBorrow();
});
function deleteStudent(id) {
  openConfirm('Delete this student?', 'This removes the student and their borrow history.', guard(async () => {
    await api('DELETE', '/api/admin/students/' + id);
    toast('Student removed', 'The student record has been deleted.');
    renderStudents(true); renderDashboard(); updateReqBadge();
  }));
}

let resetPassStudentId = null;
function openResetPassword(sId) {
  const s = STU.get(String(sId)); if (!s) return;
  resetPassStudentId = sId;
  document.getElementById('resetPassStudentName').textContent = s.name + ' (' + s.studentId + ')';
  document.getElementById('resetPassNew').value = '';
  const e = document.getElementById('resetPassErr'); if (e) e.classList.add('hidden');
  openModal('resetPassModal');
}
const confirmResetPassword = guard(async function () {
  const s = STU.get(String(resetPassStudentId)); if (!s) return;
  const pw = document.getElementById('resetPassNew').value;
  const err = document.getElementById('resetPassErr');
  if (!validPassword(pw)) { showErr(err, 'Password must be at least 6 characters.'); return; }
  await api('POST', `/api/admin/students/${resetPassStudentId}/password`, { password: pw });
  closeModal('resetPassModal');
  toast('Password reset', `New password set for ${s.name}.`);
});
const exportStudentsCSV = guard(async function () {
  await downloadAuthed('/api/admin/export/students.csv', 'library-students-' + today() + '.csv');
  toast('CSV exported', 'Student list downloaded.');
});

// ---------------------------------------------------------------- REQUESTS
let requestPage = 1;
function requestsGoPage(n) { requestPage = n; renderRequests(true); }

const renderRequests = guard(async function (keep) {
  const el = document.getElementById('requestsTable');
  if (!el) return;
  if (!keep) requestPage = 1;
  const data = await api('GET', `/api/admin/records?status=pending&page=${requestPage}&limit=10`);
  requestPage = data.page; cacheRecords(data.items);
  if (!data.items.length) { el.innerHTML = emptyBox('check', 'No pending requests', 'Book requests from students will appear here.'); return; }
  el.innerHTML = `<div style="overflow-x:auto"><table>
    <thead><tr><th>Student</th><th>Book</th><th>Requested</th><th style="text-align:right">Action</th></tr></thead>
    <tbody>${data.items.map(r => {
      const cs = catStyle(r.bookCategory);
      const canApprove = r.bookAvailable > 0;
      return `<tr>
        <td><div style="display:flex;align-items:center;gap:10px">${avatarHTML(r.studentName, r.studentPhoto, 32, 12)}<div><p style="margin:0;font-weight:700;font-size:13px">${esc(r.studentName)}</p><p style="margin:0;font-size:11px;color:#b0a596">${esc(r.studentSid)}</p></div></div></td>
        <td><div style="display:flex;align-items:center;gap:6px"><span class="dot" style="background:${cs.color}"></span><div><p style="margin:0;font-size:13px;font-weight:600">${esc(r.bookTitle)}</p><p style="margin:0;font-size:11px;color:#b0a596">${r.bookAvailable} available</p></div></div></td>
        <td style="font-size:12px;color:var(--muted)">${r.requestDate}</td>
        <td style="text-align:right"><div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn btn-primary" style="padding:7px 14px;font-size:13px;${canApprove ? '' : 'opacity:.5;cursor:not-allowed'}" ${canApprove ? '' : 'disabled'} onclick="approveRequest(${r.id})">Approve</button>
          <button class="btn btn-outline" style="padding:7px 14px;font-size:13px" onclick="rejectRequest(${r.id})">Reject</button>
        </div></td>
      </tr>`;
    }).join('')}</tbody></table></div>${pagerHTML(data, 'requestsGoPage')}`;
});
const approveRequest = guard(async function (id) {
  try { await api('POST', `/api/admin/records/${id}/approve`); }
  catch (e) { if (e.status === 409) { toast('Cannot approve', e.message, true); renderRequests(true); return; } throw e; }
  toast('Request approved', 'The book has been issued to the student.');
  renderRequests(true); renderDashboard(); updateReqBadge(); renderBorrow();
});
function rejectRequest(id) {
  openConfirm('Reject this request?', 'The borrow request will be removed.', guard(async () => {
    await api('DELETE', '/api/admin/records/' + id);
    toast('Request rejected', 'The request has been removed.');
    renderRequests(true); renderDashboard(); updateReqBadge();
  }));
}

// ------------------------------------------------------------------ BORROW
// The student / book pickers search the database as you type (max 50 results) instead of loading everything.
function fillSelect(sel, items, label, placeholder) {
  const cur = sel.value, curText = sel.selectedOptions[0] ? sel.selectedOptions[0].text : '';
  let html = `<option value="">${placeholder}</option>` + items.map(i => `<option value="${i.id}">${esc(label(i))}</option>`).join('');
  if (cur && !items.some(i => String(i.id) === cur)) html += `<option value="${cur}">${esc(curText)}</option>`;
  sel.innerHTML = html;
  if (cur) sel.value = cur;
}
const loadBorrowPickers = guard(async function () {
  const ss = document.getElementById('borrowStudent'), sb = document.getElementById('borrowBook');
  if (!ss || !sb) return;
  const sq = (document.getElementById('borrowStudentQ') || {}).value || '', bq = (document.getElementById('borrowBookQ') || {}).value || '';
  const [stu, bks] = await Promise.all([
    api('GET', '/api/admin/students?' + new URLSearchParams({ q: sq.trim(), limit: 50 })),
    api('GET', '/api/books?' + new URLSearchParams({ q: bq.trim(), available: 1, limit: 50 })),
  ]);
  fillSelect(ss, stu.items, s => `${s.name} · ${s.studentId}`, 'Select a student');
  fillSelect(sb, bks.items, b => `${b.title} (${b.availableCopies} left)`, 'Select an available book');
  if (!document.getElementById('borrowDue').value) document.getElementById('borrowDue').value = plusDays(LOAN_DAYS);
});
const borrowPickersDebounced = debounce(() => loadBorrowPickers(), 250);

let borrowPage = 1;
function borrowGoPage(n) { borrowPage = n; renderActiveBorrows(true); }
const renderActiveBorrows = guard(async function (keep) {
  const el = document.getElementById('activeBorrowsTable');
  if (!el) return;
  if (!keep) borrowPage = 1;
  const data = await api('GET', `/api/admin/records?status=active&page=${borrowPage}&limit=10`);
  borrowPage = data.page; cacheRecords(data.items);
  const cnt = document.getElementById('activeBorrowCount');
  cnt.textContent = data.total || ''; cnt.style.display = data.total ? '' : 'none';
  if (!data.items.length) { el.innerHTML = emptyBox('open', 'No active borrows', 'Issued books will appear here.'); return; }
  el.innerHTML = `<div style="overflow-y:auto"><table>
    <thead><tr><th>Student / Book</th><th>Due</th><th style="text-align:right">Actions</th></tr></thead>
    <tbody>${data.items.map(r => {
      const cs = catStyle(r.bookCategory), ov = r.status === 'overdue';
      return `<tr>
        <td><div style="display:flex;flex-direction:column;gap:2px">
          <div style="display:flex;align-items:center;gap:6px"><span class="dot" style="background:${cs.color}"></span><span style="font-weight:700;font-size:14px">${esc(r.studentName)}</span></div>
          <div style="padding-left:14px;font-size:12px;color:var(--muted)">${esc(r.bookTitle)}</div></div></td>
        <td><span style="color:${ov ? 'var(--red)' : 'var(--muted)'};font-weight:${ov ? '700' : '400'};font-size:13px">${r.dueDate}</span>${ov ? `<br><span class="badge b-overdue" style="font-size:10px;margin-top:2px">Overdue · ₱${fineFor(r)}</span>` : ''}</td>
        <td style="text-align:right"><div style="display:flex;gap:6px;justify-content:flex-end">
          <button class="btn btn-outline" style="padding:6px 10px;font-size:12px" onclick="printSlipForRecord(${r.id})">Print Slip</button>
          <button class="btn btn-outline" style="padding:6px 12px;font-size:13px" onclick="returnBook(${r.id})">Return</button>
        </div></td>
      </tr>`;
    }).join('')}</tbody></table></div>${pagerHTML(data, 'borrowGoPage')}`;
});
async function renderBorrow() { await Promise.all([loadBorrowPickers(), renderActiveBorrows(true)]); }

const issueBorrow = guard(async function () {
  const ss = document.getElementById('borrowStudent'), sb = document.getElementById('borrowBook');
  const sId = ss.value, bId = sb.value;
  if (!sId || !bId) { toast('Missing information', 'Select both a student and a book.', true); return; }
  const stName = ss.selectedOptions[0].text.split(' · ')[0], bkTitle = sb.selectedOptions[0].text.replace(/ \(\d+ left\)$/, '');
  const due = document.getElementById('borrowDue').value || plusDays(LOAN_DAYS);
  try { await api('POST', '/api/admin/records/issue', { studentId: sId, bookId: bId, dueDate: due }); }
  catch (e) { if (e.status === 409 || e.status === 400) { toast('Cannot issue', e.message, true); loadBorrowPickers(); return; } throw e; }
  toast('Book issued', `${stName} borrowed "${bkTitle}".`);
  ss.value = ''; sb.value = '';
  renderBorrow(); renderDashboard();
});
const returnBook = guard(async function (id) {
  const r = RECCACHE.get(String(id));
  const res = await api('POST', `/api/admin/records/${id}/return`);
  const title = r ? r.bookTitle : 'Book';
  toast('Book returned', res.fine > 0 ? `"${title}" returned — ₱${res.fine} overdue fine applies.` : `"${title}" has been returned.`);
  renderBorrow(); renderDashboard();
});

// ----------------------------------------------------------------- HISTORY
let historyPage = 1; const historySeq = seqGuard();
function historyGoPage(n) { historyPage = n; renderHistory(true); }
const renderHistory = guard(async function (keep) {
  const filterEl = document.getElementById('historyFilter');
  if (!filterEl || !document.getElementById('historyTable')) return;
  if (!keep) historyPage = 1;
  const filter = filterEl.value;
  const ok = historySeq();
  const data = await api('GET', `/api/admin/records?status=${filter === 'all' ? 'history' : filter}&page=${historyPage}&limit=15`);
  if (!ok()) return;
  historyPage = data.page; cacheRecords(data.items);
  const counts = data.counts;
  document.getElementById('historyCounts').innerHTML =
    `<span style="font-size:12px;color:var(--muted)">${data.total.toLocaleString()} records</span>` +
    (filter === 'all' && counts ? `<span class="badge b-borrowed">Borrowed: ${counts.borrowed.toLocaleString()}</span><span class="badge b-returned">Returned: ${counts.returned.toLocaleString()}</span><span class="badge b-overdue">Overdue: ${counts.overdue.toLocaleString()}</span>` : '');
  const el = document.getElementById('historyTable');
  if (!data.items.length) { el.innerHTML = emptyBox('clock', 'No history records', 'Borrowing activity will show here.'); return; }
  el.innerHTML = `<div style="overflow:auto"><table>
    <thead><tr><th>Student</th><th>Book</th><th>Borrowed</th><th>Due / Returned</th><th style="text-align:right">Fine</th><th style="text-align:center">Status</th><th style="text-align:right">Action</th></tr></thead>
    <tbody>${data.items.map(r => {
      const cs = catStyle(r.bookCategory);
      const dateCol = r.returnDate ? `<span style="color:var(--green)">${r.returnDate}</span>` : `<span style="color:${r.status === 'overdue' ? 'var(--red)' : 'var(--muted)'}">${r.dueDate || '—'}</span>`;
      const fine = fineFor(r);
      return `<tr>
        <td><div style="display:flex;align-items:center;gap:8px">${avatarHTML(r.studentName, r.studentPhoto, 32, 12)}<div><p style="margin:0;font-size:13px;font-weight:700">${esc(r.studentName)}</p><p style="margin:0;font-size:11px;color:#b0a596">${esc(r.studentSid)}</p></div></div></td>
        <td><div style="display:flex;align-items:center;gap:6px"><span class="dot" style="background:${cs.color}"></span><div><p style="margin:0;font-size:13px;font-weight:600">${esc(r.bookTitle)}</p><p style="margin:0;font-size:11px;color:#b0a596">${esc(r.bookAuthor)}</p></div></div></td>
        <td style="font-size:12px;color:var(--muted)">${r.borrowDate || '—'}</td>
        <td style="font-size:12px">${dateCol}</td>
        <td style="text-align:right;font-size:12.5px;font-weight:700;color:${fine > 0 ? 'var(--red)' : 'var(--muted)'}">${fine > 0 ? '₱' + fine : '—'}</td>
        <td style="text-align:center">${statusBadge(r.status)}</td>
        <td style="text-align:right"><div style="display:flex;gap:6px;justify-content:flex-end">
          ${(r.status === 'borrowed' || r.status === 'overdue') ? `<button class="btn btn-outline" style="padding:5px 10px;font-size:11.5px" onclick="printSlipForRecord(${r.id})">Print Slip</button>` : ''}
          <button class="icon-btn" onclick="deleteRecord(${r.id})"><svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg></button>
        </div></td>
      </tr>`;
    }).join('')}</tbody></table></div>${pagerHTML(data, 'historyGoPage')}`;
});
function deleteRecord(id) {
  openConfirm('Delete this record?', 'The borrow record will be permanently removed.', guard(async () => {
    await api('DELETE', '/api/admin/records/' + id);
    toast('Record deleted', 'The borrow record has been removed.');
    renderHistory(true); renderDashboard(); updateReqBadge();
  }));
}

const exportHistoryCSV = guard(async function () {
  await downloadAuthed('/api/admin/export/history.csv', 'library-history-' + today() + '.csv');
  toast('CSV exported', 'Borrow history downloaded.');
});

// ------------------------------------------------------------ BACKUP / RESTORE
const exportBackup = guard(async function () {
  await downloadAuthed('/api/admin/backup', 'uphsd-library-backup-' + today() + '.json');
  toast('Backup downloaded', 'Keep this file safe — it contains all books, students, and records.');
});
function importBackupFile(input) {
  const file = input.files && input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let data;
    try { data = JSON.parse(reader.result); } catch (e) { toast('Invalid file', 'Could not read that file as a backup.', true); return; }
    if (!data || !Array.isArray(data.books) || !Array.isArray(data.students) || !Array.isArray(data.records)) {
      toast('Invalid file', "This doesn't look like a valid library backup.", true); return;
    }
    openConfirm('Restore this backup?', 'This will replace all current books, students, and records with the data in this file. (Backups from the old browser-only version work too.)', guard(async () => {
      const r = await api('POST', '/api/admin/restore', data);
      await refreshCategorySelects();
      toast('Backup restored', `${r.books.toLocaleString()} books, ${r.students.toLocaleString()} students and ${r.records.toLocaleString()} records loaded.`);
      switchTab('dashboard', document.querySelector('#screen-admin .tab-btn'));
    }));
  };
  reader.readAsText(file);
  input.value = '';
}

boot();
