// UPHSD Molino Library — Express + SQLite API (and static file server for the UI)
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const {
  db, DB_FILE, LOAN_DAYS, FINE_PER_DAY, localDate, daysLate,
  hashPassword, verifyPassword, refreshOverdue,
} = require('./db');

const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'library123';
const DEFAULT_CATEGORIES = ['Fiction', 'Science', 'History', 'Reference'];

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const bad = (msg) => new HttpError(400, msg);
const conflict = (msg) => new HttpError(409, msg);
const notFound = (msg = 'Not found.') => new HttpError(404, msg);

const app = express();
app.use(express.json({ limit: '4mb' }));

// ------------------------------------------------------------------ sessions
const sessions = new Map(); // token -> { role, studentId, exp }
function issueToken(role, studentId = null) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { role, studentId, exp: Date.now() + 12 * 3600e3 });
  return token;
}
function currentSession(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  const s = token && sessions.get(token);
  if (!s) return null;
  if (s.exp < Date.now()) { sessions.delete(token); return null; }
  return s;
}
function requireAny(req, res, next) {
  const s = currentSession(req);
  if (!s) throw new HttpError(401, 'Please log in.');
  req.sess = s; next();
}
function requireAdmin(req, res, next) {
  const s = currentSession(req);
  if (!s || s.role !== 'admin') throw new HttpError(401, 'Admin login required.');
  req.sess = s; next();
}
function requireStudent(req, res, next) {
  const s = currentSession(req);
  if (!s || s.role !== 'student') throw new HttpError(401, 'Student login required.');
  if (!db.prepare('SELECT 1 FROM students WHERE id = ?').get(s.studentId)) throw new HttpError(401, 'Account no longer exists.');
  req.sess = s; next();
}

// ------------------------------------------------------------------- helpers
const validSid = s => /^\d{2}-\d{4}-\d{3}$/.test(s || '');
const validPassword = p => typeof p === 'string' && p.length >= 6;
const str = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const int = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };

function pageParams(q, defLimit) {
  const limit = Math.min(Math.max(int(q.limit, defLimit), 1), 100);
  const page = Math.max(int(q.page, 1), 1);
  return { limit, page };
}
function paged(totalRows, page, limit) {
  const pages = Math.max(Math.ceil(totalRows / limit), 1);
  const p = Math.min(page, pages);
  return { page: p, pages, total: totalRows, limit, offset: (p - 1) * limit };
}

const studentCols = `id, student_id, name, email, year, course, photo_v`;
const toStudent = r => ({
  id: r.id, studentId: r.student_id, name: r.name, email: r.email, year: r.year, course: r.course,
  photo: r.photo_v ? `/api/students/${r.id}/photo?v=${r.photo_v}` : null,
});

const RECORD_SELECT = `
  SELECT r.id, r.student_id AS studentId, r.book_id AS bookId, r.request_date AS requestDate,
         r.borrow_date AS borrowDate, r.due_date AS dueDate, r.return_date AS returnDate,
         r.status, r.renewed,
         s.name AS studentName, s.student_id AS studentSid, s.photo_v AS photoV,
         b.title AS bookTitle, b.author AS bookAuthor, b.available_copies AS bookAvailable,
         c.name AS bookCategory
  FROM records r
  JOIN students s ON s.id = r.student_id
  JOIN books b ON b.id = r.book_id
  JOIN categories c ON c.id = b.category_id`;
const toRecord = r => ({
  id: r.id, studentId: r.studentId, bookId: r.bookId, requestDate: r.requestDate, borrowDate: r.borrowDate,
  dueDate: r.dueDate, returnDate: r.returnDate, status: r.status, renewed: !!r.renewed,
  fine: daysLate(r.dueDate, r.returnDate) * FINE_PER_DAY,
  studentName: r.studentName, studentSid: r.studentSid,
  studentPhoto: r.photoV ? `/api/students/${r.studentId}/photo?v=${r.photoV}` : null,
  bookTitle: r.bookTitle, bookAuthor: r.bookAuthor, bookCategory: r.bookCategory, bookAvailable: r.bookAvailable,
});

const BOOK_SELECT = `
  SELECT b.id, b.title, b.author, b.isbn, b.description,
         b.total_copies AS totalCopies, b.available_copies AS availableCopies,
         c.name AS category,
         (SELECT COUNT(*) FROM waitlist w WHERE w.book_id = b.id) AS waiting
  FROM books b JOIN categories c ON c.id = b.category_id`;

function categoryId(name, create = false) {
  const row = db.prepare('SELECT id FROM categories WHERE name = ?').get(name);
  if (row) return row.id;
  if (!create) return null;
  return db.prepare('INSERT INTO categories (name, is_default) VALUES (?, 0)').run(name).lastInsertRowid;
}

// ===================================================================== AUTH
app.post('/api/admin/login', (req, res) => {
  const u = str(req.body.username), p = typeof req.body.password === 'string' ? req.body.password : '';
  if (u !== ADMIN_USER || p !== ADMIN_PASS) throw new HttpError(401, 'Invalid username or password.');
  res.json({ token: issueToken('admin') });
});
app.get('/api/admin/ping', requireAdmin, (req, res) => res.json({ ok: true }));

app.post('/api/students/register', (req, res) => {
  const b = req.body || {};
  const name = str(b.name, 120), sid = str(b.studentId, 20), email = str(b.email, 200);
  const year = str(b.year, 40), course = str(b.course, 120);
  if (!name || !sid || !b.password) throw bad('Please fill in all required fields.');
  if (!validSid(sid)) throw bad('Student ID must follow the format YY-XXXX-XXX.');
  if (!validPassword(b.password)) throw bad('Password must be at least 6 characters.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad('Please enter a valid email address.');
  if (db.prepare('SELECT 1 FROM students WHERE student_id = ?').get(sid)) {
    throw conflict('This Student ID is already registered. Please log in instead.');
  }
  const info = db.prepare(`INSERT INTO students (student_id, name, email, year, course, password_hash) VALUES (?,?,?,?,?,?)`)
    .run(sid, name, email || null, year, course, hashPassword(b.password));
  res.json({ token: issueToken('student', info.lastInsertRowid), studentId: info.lastInsertRowid });
});
app.post('/api/students/login', (req, res) => {
  const sid = str(req.body.studentId, 20), pw = typeof req.body.password === 'string' ? req.body.password : '';
  if (!validSid(sid)) throw bad('Enter a valid Student ID (YY-XXXX-XXX).');
  if (!pw) throw bad('Please enter your password.');
  const s = db.prepare('SELECT id, password_hash FROM students WHERE student_id = ?').get(sid);
  if (!s) throw notFound('No account found for that Student ID. Please register first.');
  if (!verifyPassword(pw, s.password_hash)) throw new HttpError(403, 'Incorrect password.');
  res.json({ token: issueToken('student', s.id), studentId: s.id });
});

app.get('/api/students/:id/photo', (req, res) => {
  const row = db.prepare('SELECT photo FROM students WHERE id = ?').get(int(req.params.id, -1));
  const m = row && row.photo && /^data:(image\/[\w.+-]+);base64,(.+)$/s.exec(row.photo);
  if (!m) throw notFound();
  res.set('Content-Type', m[1]).set('Cache-Control', 'public, max-age=31536000, immutable').send(Buffer.from(m[2], 'base64'));
});

// ================================================================= CATEGORIES
app.get('/api/categories', requireAny, (req, res) => {
  res.json(db.prepare(`
    SELECT c.name, c.is_default AS isDefault, COUNT(b.id) AS count
    FROM categories c LEFT JOIN books b ON b.category_id = c.id
    GROUP BY c.id ORDER BY c.id`).all().map(r => ({ ...r, isDefault: !!r.isDefault })));
});
app.post('/api/categories', requireAdmin, (req, res) => {
  const name = str(req.body.name, 60);
  if (!name) throw bad('Category name is required.');
  if (categoryId(name)) throw conflict('This category already exists.');
  categoryId(name, true);
  res.json({ name });
});
app.delete('/api/categories/:name', requireAdmin, (req, res) => {
  const name = req.params.name;
  const c = db.prepare('SELECT id, is_default FROM categories WHERE name = ?').get(name);
  if (!c) throw notFound('Category not found.');
  if (c.is_default) throw bad('Default categories cannot be deleted.');
  const n = db.prepare('SELECT COUNT(*) n FROM books WHERE category_id = ?').get(c.id).n;
  if (n) throw conflict(`${n} book(s) are assigned to "${name}". Reassign or remove them first.`);
  db.prepare('DELETE FROM categories WHERE id = ?').run(c.id);
  res.json({ ok: true });
});

// ======================================================================= BOOKS
function bookFilter(q) {
  const where = [], params = [];
  const terms = String(q.q || '').match(/[\p{L}\p{N}]+/gu) || [];
  const plain = String(q.q || '').replace(/[\s-]/g, '');
  if (/^\d{9,13}[\dXx]?$/.test(plain)) {             // a full ISBN typed with or without dashes -> exact indexed lookup
    where.push('(b.isbn_plain = ? OR b.isbn = ?)'); params.push(plain, String(q.q).trim());
  } else if (terms.length) {
    where.push('b.id IN (SELECT rowid FROM books_fts WHERE books_fts MATCH ?)');
    params.push(terms.slice(0, 8).map(t => `"${t}"*`).join(' '));
  }
  if (q.category) { where.push('b.category_id = (SELECT id FROM categories WHERE name = ?)'); params.push(String(q.category)); }
  if (q.available === '1') where.push('b.available_copies > 0');
  return { sql: where.length ? 'WHERE ' + where.join(' AND ') : '', params };
}
app.get('/api/books', requireAny, (req, res) => {
  const { limit, page } = pageParams(req.query, 12);
  const f = bookFilter(req.query);
  const total = db.prepare(`SELECT COUNT(*) n FROM books b ${f.sql}`).get(...f.params).n;
  const pg = paged(total, page, limit);
  const items = db.prepare(`${BOOK_SELECT} ${f.sql} ORDER BY b.title COLLATE NOCASE, b.id LIMIT ? OFFSET ?`)
    .all(...f.params, limit, pg.offset);
  res.json({ items, total, page: pg.page, pages: pg.pages, limit });
});
app.get('/api/books/:id', requireAny, (req, res) => {
  const b = db.prepare(`${BOOK_SELECT} WHERE b.id = ?`).get(int(req.params.id, -1));
  if (!b) throw notFound('Book not found.');
  res.json(b);
});

function bookInput(body) {
  const title = str(body.title, 300), author = str(body.author, 200), isbn = str(body.isbn, 40);
  const category = str(body.category, 60), description = str(body.description, 2000) || null;
  if (!title || !author || !isbn) throw bad('Please fill in all required fields.');
  if (!category) throw bad('Please select or add a category.');
  return { title, author, isbn, category, description };
}
const ISBN_TAKEN = 'A book with this ISBN already exists — use Restock to add more copies.';
app.post('/api/books', requireAdmin, (req, res) => {
  const b = bookInput(req.body);
  const copies = Math.min(Math.max(int(req.body.copies, 1), 1), 100000);
  try {
    const id = db.transaction(() => db.prepare(`INSERT INTO books (title, author, isbn, category_id, description, total_copies, available_copies)
      VALUES (?,?,?,?,?,?,?)`).run(b.title, b.author, b.isbn, categoryId(b.category, true), b.description, copies, copies).lastInsertRowid)();
    res.json(db.prepare(`${BOOK_SELECT} WHERE b.id = ?`).get(id));
  } catch (e) { if (/UNIQUE.*isbn/i.test(e.message)) throw conflict(ISBN_TAKEN); throw e; }
});
app.put('/api/books/:id', requireAdmin, (req, res) => {
  const id = int(req.params.id, -1);
  if (!db.prepare('SELECT 1 FROM books WHERE id = ?').get(id)) throw notFound('Book not found.');
  const b = bookInput(req.body);
  try {
    db.transaction(() => db.prepare(`UPDATE books SET title=?, author=?, isbn=?, category_id=?, description=? WHERE id=?`)
      .run(b.title, b.author, b.isbn, categoryId(b.category, true), b.description, id))();
  } catch (e) { if (/UNIQUE.*isbn/i.test(e.message)) throw conflict(ISBN_TAKEN); throw e; }
  res.json(db.prepare(`${BOOK_SELECT} WHERE b.id = ?`).get(id));
});
app.delete('/api/books/:id', requireAdmin, (req, res) => {
  const info = db.prepare('DELETE FROM books WHERE id = ?').run(int(req.params.id, -1));
  if (!info.changes) throw notFound('Book not found.');
  res.json({ ok: true });
});
app.post('/api/books/:id/restock', requireAdmin, (req, res) => {
  const qty = int(req.body.qty, 0);
  if (qty < 1) throw bad('Enter a number of copies greater than 0.');
  const id = int(req.params.id, -1);
  const info = db.prepare('UPDATE books SET total_copies = total_copies + ?, available_copies = available_copies + ? WHERE id = ?').run(qty, qty, id);
  if (!info.changes) throw notFound('Book not found.');
  res.json(db.prepare(`${BOOK_SELECT} WHERE b.id = ?`).get(id));
});

// ===================================================================== STUDENTS (admin)
app.get('/api/admin/students', requireAdmin, (req, res) => {
  const { limit, page } = pageParams(req.query, 15);
  const terms = String(req.query.q || '').trim().toLowerCase();
  const where = terms ? `WHERE lower(name) LIKE ? OR lower(student_id) LIKE ? OR lower(course) LIKE ? OR lower(year) LIKE ?` : '';
  const params = terms ? Array(4).fill(`%${terms}%`) : [];
  const total = db.prepare(`SELECT COUNT(*) n FROM students ${where}`).get(...params).n;
  const pg = paged(total, page, limit);
  const rows = db.prepare(`SELECT ${studentCols},
      (SELECT COUNT(*) FROM records r WHERE r.student_id = students.id AND r.status IN ('borrowed','overdue')) AS active
      FROM students ${where} ORDER BY name COLLATE NOCASE, id LIMIT ? OFFSET ?`).all(...params, limit, pg.offset);
  res.json({ items: rows.map(r => ({ ...toStudent(r), active: r.active })), total, page: pg.page, pages: pg.pages, limit });
});
app.post('/api/admin/students', requireAdmin, (req, res) => {
  const b = req.body || {};
  const name = str(b.name, 120), sid = str(b.studentId, 20), year = str(b.year, 40), course = str(b.course, 120);
  if (!name || !sid || !b.password) throw bad('Please fill in all required fields.');
  if (!validSid(sid)) throw bad('Use the format YY-XXXX-XXX.');
  if (!validPassword(b.password)) throw bad('Password must be at least 6 characters.');
  if (db.prepare('SELECT 1 FROM students WHERE student_id = ?').get(sid)) throw conflict('That Student ID is already registered.');
  const info = db.prepare(`INSERT INTO students (student_id, name, year, course, password_hash) VALUES (?,?,?,?,?)`)
    .run(sid, name, year, course, hashPassword(b.password));
  res.json({ id: info.lastInsertRowid });
});
app.delete('/api/admin/students/:id', requireAdmin, (req, res) => {
  const id = int(req.params.id, -1);
  db.transaction(() => {
    // copies the student still holds go back on the shelf
    db.prepare(`UPDATE books SET available_copies = available_copies + 1
                WHERE id IN (SELECT book_id FROM records WHERE student_id = ? AND status IN ('borrowed','overdue'))`).run(id);
    const info = db.prepare('DELETE FROM students WHERE id = ?').run(id);
    if (!info.changes) throw notFound('Student not found.');
  })();
  res.json({ ok: true });
});
app.post('/api/admin/students/:id/password', requireAdmin, (req, res) => {
  if (!validPassword(req.body.password)) throw bad('Password must be at least 6 characters.');
  const info = db.prepare('UPDATE students SET password_hash = ? WHERE id = ?').run(hashPassword(req.body.password), int(req.params.id, -1));
  if (!info.changes) throw notFound('Student not found.');
  res.json({ ok: true });
});

// ===================================================================== RECORDS (admin)
const STATUS_FILTERS = {
  pending: `r.status = 'pending'`,
  active: `r.status IN ('borrowed','overdue')`,
  history: `r.status != 'pending'`,
  borrowed: `r.status = 'borrowed'`,
  overdue: `r.status = 'overdue'`,
  returned: `r.status = 'returned'`,
};
app.get('/api/admin/records', requireAdmin, (req, res) => {
  refreshOverdue();
  const { limit, page } = pageParams(req.query, 15);
  const where = STATUS_FILTERS[req.query.status] ? `WHERE ${STATUS_FILTERS[req.query.status]}` : '';
  const total = db.prepare(`SELECT COUNT(*) n FROM records r ${where}`).get().n;
  const pg = paged(total, page, limit);
  const order = req.query.status === 'pending' ? 'r.request_date ASC, r.id ASC' : 'r.request_date DESC, r.id DESC';
  const items = db.prepare(`${RECORD_SELECT} ${where} ORDER BY ${order} LIMIT ? OFFSET ?`).all(limit, pg.offset).map(toRecord);
  let counts = null;
  if (req.query.status === 'history' || !req.query.status) {
    const c = Object.fromEntries(db.prepare(`SELECT status, COUNT(*) n FROM records GROUP BY status`).all().map(r => [r.status, r.n]));
    counts = { borrowed: c.borrowed || 0, returned: c.returned || 0, overdue: c.overdue || 0 };
  }
  res.json({ items, total, page: pg.page, pages: pg.pages, limit, counts });
});
app.get('/api/admin/counts', requireAdmin, (req, res) => {
  refreshOverdue();
  const c = Object.fromEntries(db.prepare(`SELECT status, COUNT(*) n FROM records GROUP BY status`).all().map(r => [r.status, r.n]));
  res.json({ pending: c.pending || 0, active: (c.borrowed || 0) + (c.overdue || 0) });
});

function takeCopy(bookId) {
  const info = db.prepare('UPDATE books SET available_copies = available_copies - 1 WHERE id = ? AND available_copies > 0').run(bookId);
  if (!info.changes) throw conflict('No copies available — this book is currently out of stock.');
}
app.post('/api/admin/records/issue', requireAdmin, (req, res) => {
  const sId = int(req.body.studentId, -1), bId = int(req.body.bookId, -1);
  const due = /^\d{4}-\d{2}-\d{2}$/.test(req.body.dueDate || '') ? req.body.dueDate : localDate(LOAN_DAYS);
  if (!db.prepare('SELECT 1 FROM students WHERE id = ?').get(sId)) throw bad('Select a student.');
  if (!db.prepare('SELECT 1 FROM books WHERE id = ?').get(bId)) throw bad('Select a book.');
  try {
    const id = db.transaction(() => {
      takeCopy(bId);
      return db.prepare(`INSERT INTO records (student_id, book_id, request_date, borrow_date, due_date, status) VALUES (?,?,?,?,?, 'borrowed')`)
        .run(sId, bId, localDate(), localDate(), due).lastInsertRowid;
    })();
    res.json({ id });
  } catch (e) { if (/UNIQUE/i.test(e.message)) throw conflict('That student already has this book (or a pending request for it).'); throw e; }
});
app.post('/api/admin/records/:id/approve', requireAdmin, (req, res) => {
  const id = int(req.params.id, -1);
  db.transaction(() => {
    const r = db.prepare('SELECT book_id, status FROM records WHERE id = ?').get(id);
    if (!r) throw notFound('Request not found.');
    if (r.status !== 'pending') throw conflict('This request has already been processed.');
    takeCopy(r.book_id);
    db.prepare(`UPDATE records SET status = 'borrowed', borrow_date = ?, due_date = ? WHERE id = ?`).run(localDate(), localDate(LOAN_DAYS), id);
  })();
  res.json({ ok: true });
});
app.post('/api/admin/records/:id/return', requireAdmin, (req, res) => {
  refreshOverdue();
  const id = int(req.params.id, -1);
  const out = db.transaction(() => {
    const r = db.prepare('SELECT book_id, status, due_date FROM records WHERE id = ?').get(id);
    if (!r) throw notFound('Record not found.');
    if (r.status !== 'borrowed' && r.status !== 'overdue') throw conflict('This book is not currently borrowed.');
    const today = localDate();
    db.prepare(`UPDATE records SET status = 'returned', return_date = ? WHERE id = ?`).run(today, id);
    db.prepare('UPDATE books SET available_copies = available_copies + 1 WHERE id = ?').run(r.book_id);
    return { fine: daysLate(r.due_date, today) * FINE_PER_DAY };
  })();
  res.json(out);
});
app.delete('/api/admin/records/:id', requireAdmin, (req, res) => {
  const id = int(req.params.id, -1);
  db.transaction(() => {
    const r = db.prepare('SELECT book_id, status FROM records WHERE id = ?').get(id);
    if (!r) throw notFound('Record not found.');
    if (r.status === 'borrowed' || r.status === 'overdue') db.prepare('UPDATE books SET available_copies = available_copies + 1 WHERE id = ?').run(r.book_id);
    db.prepare('DELETE FROM records WHERE id = ?').run(id);
  })();
  res.json({ ok: true });
});

// ===================================================================== DASHBOARD
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  refreshOverdue();
  const today = localDate();
  const bookTotals = db.prepare(`SELECT COUNT(*) AS titles, COALESCE(SUM(total_copies),0) AS totalCopies, COALESCE(SUM(available_copies),0) AS availCopies FROM books`).get();
  const students = db.prepare('SELECT COUNT(*) n FROM students').get().n;
  const c = Object.fromEntries(db.prepare(`SELECT status, COUNT(*) n FROM records GROUP BY status`).all().map(r => [r.status, r.n]));
  const fines = db.prepare(`SELECT COALESCE(SUM(MAX(0, CAST(julianday(?) - julianday(due_date) AS INTEGER))), 0) AS days
                            FROM records WHERE status IN ('borrowed','overdue') AND due_date IS NOT NULL`).get(today).days * FINE_PER_DAY;
  const byCategory = db.prepare(`
    SELECT c.name AS cat, COUNT(b.id) AS count, COALESCE(SUM(b.total_copies),0) AS tot, COALESCE(SUM(b.available_copies),0) AS av
    FROM categories c LEFT JOIN books b ON b.category_id = c.id GROUP BY c.id ORDER BY c.id`).all();
  const top = db.prepare(`
    SELECT b.title, COUNT(*) AS count FROM records r JOIN books b ON b.id = r.book_id
    WHERE r.status != 'pending' GROUP BY r.book_id ORDER BY count DESC, b.title LIMIT 3`).all();
  const recent = db.prepare(`${RECORD_SELECT} ORDER BY r.request_date DESC, r.id DESC LIMIT 7`).all().map(toRecord);
  res.json({
    ...bookTotals, students, pending: c.pending || 0, active: (c.borrowed || 0) + (c.overdue || 0), overdue: c.overdue || 0,
    returned: c.returned || 0, fines, byCategory, top, recent,
  });
});

// ===================================================================== EXPORTS / BACKUP
const csvEscape = v => { v = String(v == null ? '' : v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
const csvLine = a => a.map(csvEscape).join(',') + '\r\n';
function streamCsv(res, filename, header, iter) {
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"` });
  res.write(csvLine(header));
  for (const row of iter) res.write(csvLine(row));
  res.end();
}
app.get('/api/admin/export/students.csv', requireAdmin, (req, res) => {
  refreshOverdue();
  const it = db.prepare(`SELECT s.name, s.student_id, s.course, s.year,
      (SELECT COUNT(*) FROM records r WHERE r.student_id = s.id AND r.status IN ('borrowed','overdue')) AS active
      FROM students s ORDER BY s.name COLLATE NOCASE`).iterate();
  streamCsv(res, `library-students-${localDate()}.csv`, ['Full Name', 'Student ID', 'Course', 'Year Level', 'Active Loans'],
    (function* () { for (const r of it) yield [r.name, r.student_id, r.course, r.year, r.active]; })());
});
app.get('/api/admin/export/history.csv', requireAdmin, (req, res) => {
  refreshOverdue();
  const it = db.prepare(`${RECORD_SELECT} WHERE r.status != 'pending' ORDER BY r.request_date DESC, r.id DESC`).iterate();
  streamCsv(res, `library-history-${localDate()}.csv`,
    ['Student Name', 'Student ID', 'Book Title', 'Author', 'Category', 'Borrowed', 'Due / Returned', 'Status', 'Fine (PHP)'],
    (function* () { for (const raw of it) { const r = toRecord(raw); yield [r.studentName, r.studentSid, r.bookTitle, r.bookAuthor, r.bookCategory, r.borrowDate || '', r.returnDate || r.dueDate || '', r.status, r.fine]; } })());
});

app.get('/api/admin/backup', requireAdmin, (req, res) => {
  const all = t => db.prepare(`SELECT * FROM ${t}`).all();
  res.set({ 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="uphsd-library-backup-${localDate()}.json"` });
  res.send(JSON.stringify({
    format: 'uphsd-library-sql-v1', exportedAt: new Date().toISOString(),
    categories: all('categories'), books: all('books'), students: all('students'), records: all('records'), waitlist: all('waitlist'),
  }));
});

// Accepts BOTH the new SQL backup and the old localStorage backup (string ids like "b1", plain-text passwords).
app.post('/api/admin/restore', requireAdmin, express.json({ limit: '200mb' }), (req, res) => {
  const d = req.body;
  if (!d || !Array.isArray(d.books) || !Array.isArray(d.students) || !Array.isArray(d.records)) throw bad("This doesn't look like a valid library backup.");
  const legacy = d.format !== 'uphsd-library-sql-v1';
  const counts = db.transaction(() => {
    for (const t of ['records', 'waitlist', 'students', 'books', 'categories']) db.prepare(`DELETE FROM ${t}`).run();
    db.prepare(`DELETE FROM sqlite_sequence`).run();
    const insCat = db.prepare('INSERT OR IGNORE INTO categories (name, is_default) VALUES (?, ?)');
    DEFAULT_CATEGORIES.forEach(n => insCat.run(n, 1));
    (legacy ? (d.customCategories || []) : (d.categories || []).map(c => c.name)).forEach(n => n && insCat.run(String(n), 0));

    const bookMap = new Map(), studentMap = new Map();
    const catIdByName = n => categoryId(String(n), true);
    const catNameById = new Map((d.categories || []).map(c => [c.id, c.name]));
    const seenIsbn = new Set();
    const insBook = db.prepare(`INSERT INTO books (title, author, isbn, category_id, description, total_copies, available_copies) VALUES (?,?,?,?,?,?,?)`);
    for (const b of d.books) {
      const total = Math.max(int(legacy ? b.totalCopies : b.total_copies, 1), 0);
      const avail = Math.min(Math.max(int(legacy ? b.availableCopies : b.available_copies, total), 0), total);
      let isbn = String(b.isbn || '').trim() || `NOISBN-${b.id}`;
      if (seenIsbn.has(isbn)) isbn = `${isbn} (#${b.id})`;
      seenIsbn.add(isbn);
      const catName = legacy ? b.category : catNameById.get(b.category_id);
      bookMap.set(b.id, insBook.run(String(b.title || 'Untitled'), String(b.author || 'Unknown'), isbn, catIdByName(catName || 'Fiction'), b.description || null, total, avail).lastInsertRowid);
    }
    const insStu = db.prepare(`INSERT OR IGNORE INTO students (student_id, name, email, year, course, password_hash, photo, photo_v) VALUES (?,?,?,?,?,?,?,?)`);
    for (const s of d.students) {
      const sid = legacy ? s.studentId : s.student_id;
      const hash = legacy ? hashPassword(s.password || 'changeme123') : s.password_hash;
      const photo = s.photo || null;
      const info = insStu.run(sid, s.name, s.email || null, s.year || '', s.course || '', hash, photo, photo ? 1 : 0);
      if (info.changes) studentMap.set(s.id, info.lastInsertRowid);
    }
    const insRec = db.prepare(`INSERT OR IGNORE INTO records (student_id, book_id, request_date, borrow_date, due_date, return_date, status, renewed) VALUES (?,?,?,?,?,?,?,?)`);
    let recs = 0;
    for (const r of d.records) {
      const sId = studentMap.get(legacy ? r.studentId : r.student_id), bId = bookMap.get(legacy ? r.bookId : r.book_id);
      if (!sId || !bId || !['pending', 'borrowed', 'overdue', 'returned'].includes(r.status)) continue;
      recs += insRec.run(sId, bId, (legacy ? r.requestDate : r.request_date) || localDate(), (legacy ? r.borrowDate : r.borrow_date) || null,
        (legacy ? r.dueDate : r.due_date) || null, (legacy ? r.returnDate : r.return_date) || null, r.status, r.renewed ? 1 : 0).changes;
    }
    const insW = db.prepare(`INSERT OR IGNORE INTO waitlist (student_id, book_id, date) VALUES (?,?,?)`);
    for (const w of d.waitlist || []) {
      const sId = studentMap.get(legacy ? w.studentId : w.student_id), bId = bookMap.get(legacy ? w.bookId : w.book_id);
      if (sId && bId) insW.run(sId, bId, w.date || localDate());
    }
    db.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES ('seeded', '1')`).run();
    return { books: bookMap.size, students: studentMap.size, records: recs };
  })();
  res.json(counts);
});

// ===================================================================== STUDENT SELF-SERVICE
function myState(studentId) {
  refreshOverdue();
  const s = db.prepare(`SELECT ${studentCols} FROM students WHERE id = ?`).get(studentId);
  const records = db.prepare(`${RECORD_SELECT} WHERE r.student_id = ? ORDER BY r.request_date DESC, r.id DESC`).all(studentId).map(toRecord);
  const waitlist = db.prepare(`SELECT w.id, w.book_id AS bookId, w.date, b.title, b.author, b.available_copies AS availableCopies
    FROM waitlist w JOIN books b ON b.id = w.book_id WHERE w.student_id = ? ORDER BY w.id`).all(studentId);
  return { student: toStudent(s), records, waitlist };
}
app.get('/api/me', requireStudent, (req, res) => res.json(myState(req.sess.studentId)));
app.put('/api/me', requireStudent, (req, res) => {
  const name = str(req.body.name, 120);
  if (!name) throw bad('Name cannot be empty.');
  const id = req.sess.studentId;
  db.prepare('UPDATE students SET name = ? WHERE id = ?').run(name, id);
  if (req.body.photo === null) db.prepare('UPDATE students SET photo = NULL, photo_v = 0 WHERE id = ?').run(id);
  else if (typeof req.body.photo === 'string') {
    if (!/^data:image\/[\w.+-]+;base64,/.test(req.body.photo)) throw bad('Please choose an image file.');
    if (req.body.photo.length > 3 * 1024 * 1024) throw bad('Please choose an image under 2MB.');
    db.prepare('UPDATE students SET photo = ?, photo_v = photo_v + 1 WHERE id = ?').run(req.body.photo, id);
  }
  res.json(myState(id));
});
app.post('/api/me/request', requireStudent, (req, res) => {
  const bId = int(req.body.bookId, -1);
  if (!db.prepare('SELECT 1 FROM books WHERE id = ?').get(bId)) throw notFound('Book not found.');
  try {
    db.prepare(`INSERT INTO records (student_id, book_id, request_date, status) VALUES (?,?,?, 'pending')`).run(req.sess.studentId, bId, localDate());
  } catch (e) { if (/UNIQUE/i.test(e.message)) throw conflict('You already have this book or a pending request.'); throw e; }
  res.json({ ok: true });
});
app.post('/api/me/records/:id/renew', requireStudent, (req, res) => {
  refreshOverdue();
  const r = db.prepare('SELECT status, renewed FROM records WHERE id = ? AND student_id = ?').get(int(req.params.id, -1), req.sess.studentId);
  if (!r) throw notFound('Record not found.');
  if (r.status !== 'borrowed') throw conflict('Only current, non-overdue borrows can be renewed.');
  if (r.renewed) throw conflict('This book has already been renewed once. Please return it by the due date.');
  const due = localDate(LOAN_DAYS);
  db.prepare('UPDATE records SET due_date = ?, renewed = 1 WHERE id = ?').run(due, int(req.params.id, -1));
  res.json({ dueDate: due });
});
app.post('/api/me/waitlist', requireStudent, (req, res) => {
  const bId = int(req.body.bookId, -1);
  if (!db.prepare('SELECT 1 FROM books WHERE id = ?').get(bId)) throw notFound('Book not found.');
  const info = db.prepare('INSERT OR IGNORE INTO waitlist (student_id, book_id, date) VALUES (?,?,?)').run(req.sess.studentId, bId, localDate());
  if (!info.changes) throw conflict("Already on the waitlist — we'll let you know when a copy is available.");
  res.json({ ok: true });
});
app.delete('/api/me/waitlist/:id', requireStudent, (req, res) => {
  db.prepare('DELETE FROM waitlist WHERE id = ? AND student_id = ?').run(int(req.params.id, -1), req.sess.studentId);
  res.json({ ok: true });
});
app.post('/api/me/waitlist/claim-ready', requireStudent, (req, res) => {
  const rows = db.prepare(`SELECT w.id, b.title FROM waitlist w JOIN books b ON b.id = w.book_id
    WHERE w.student_id = ? AND b.available_copies > 0`).all(req.sess.studentId);
  const del = db.prepare('DELETE FROM waitlist WHERE id = ?');
  db.transaction(() => rows.forEach(r => del.run(r.id)))();
  res.json({ ready: rows.map(r => r.title) });
});

// ======================================================================= STATIC + ERRORS
app.get('/api/health', (req, res) => res.json({ ok: true, books: db.prepare('SELECT COUNT(*) n FROM books').get().n }));
app.use('/api', (req, res) => { throw notFound('Unknown API route.'); });

const ROOT = path.join(__dirname, '..');
const PAGES = new Set(['index.html', 'admin.html', 'privacy.html', 'terms.html', 'styles.css', 'common.js', 'student.js', 'chatbot.js', 'admin.js']);
app.get('/', (req, res) => res.sendFile(path.join(ROOT, 'index.html')));
app.get('/:file', (req, res, next) => PAGES.has(req.params.file) ? res.sendFile(path.join(ROOT, req.params.file)) : next());
app.use('/public', express.static(path.join(ROOT, 'public')));
app.get('/favicon.ico', (req, res) => res.type('png').sendFile(path.join(ROOT, 'public', 'uphsd-logo.png')));

app.use((err, req, res, next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'That upload is too large.' });
  if (err instanceof SyntaxError && err.status === 400) return res.status(400).json({ error: 'Invalid JSON.' });
  if (/CHECK constraint/i.test(err.message || '')) return res.status(409).json({ error: 'That change would break a data rule (e.g. copies out of range).' });
  console.error(err);
  res.status(500).json({ error: 'Server error.' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    const n = db.prepare('SELECT COUNT(*) n FROM books').get().n;
    console.log(`UPHSD Library running → http://localhost:${PORT}   (admin: http://localhost:${PORT}/admin.html)`);
    console.log(`Database: ${DB_FILE}  ·  ${n.toLocaleString()} books`);
  });
}
module.exports = app;
