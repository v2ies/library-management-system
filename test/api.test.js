// End-to-end API test: starts the server on a throwaway database and walks through the real flows.
//   npm test
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');

const PORT = 3999, BASE = `http://localhost:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lib-test-'));
const srv = spawn('node', [path.join(__dirname, '..', 'server', 'index.js')], { env: { ...process.env, PORT, DATA_DIR: dir }, stdio: 'pipe' });

async function call(method, url, body, token) {
  const r = await fetch(BASE + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { }
  return { status: r.status, body: j, text: t };
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
let passed = 0;
const test = async (name, fn) => { try { await fn(); passed++; console.log('  ✓', name); } catch (e) { console.error('  ✗', name, '\n   ', e.message); process.exitCode = 1; } };

(async () => {
  for (let i = 0; i < 50; i++) { try { await fetch(BASE + '/api/health'); break; } catch { await sleep(100); } }
  let A, S1, S1id, S2;
  console.log('Library API tests');

  await test('admin login rejects bad password, accepts good one', async () => {
    assert.strictEqual((await call('POST', '/api/admin/login', { username: 'admin', password: 'nope' })).status, 401);
    const r = await call('POST', '/api/admin/login', { username: 'admin', password: 'library123' });
    assert.strictEqual(r.status, 200); A = r.body.token;
  });
  await test('endpoints are protected without a token', async () => {
    assert.strictEqual((await call('GET', '/api/books')).status, 401);
    assert.strictEqual((await call('GET', '/api/admin/stats')).status, 401);
  });
  await test('8 sample books seeded; search + category filter + paging work', async () => {
    let r = await call('GET', '/api/books?limit=5', undefined, A);
    assert.strictEqual(r.body.total, 8); assert.strictEqual(r.body.items.length, 5); assert.strictEqual(r.body.pages, 2);
    r = await call('GET', '/api/books?q=rizal', undefined, A); assert.strictEqual(r.body.total, 2);
    r = await call('GET', '/api/books?q=fili', undefined, A); assert.ok(r.body.total >= 2, 'prefix search');
    r = await call('GET', '/api/books?category=Science', undefined, A); assert.strictEqual(r.body.total, 2);
    r = await call('GET', '/api/books?q=9780553380163', undefined, A); assert.strictEqual(r.body.items[0].title, 'A Brief History of Time');
    r = await call('GET', '/api/books?q=%22%27%3B%20DROP%20TABLE%20books%3B--', undefined, A); assert.strictEqual(r.status, 200);
  });
  await test('add / edit / duplicate-ISBN / restock / delete a book (FTS stays in sync)', async () => {
    let r = await call('POST', '/api/books', { title: 'Database Systems', author: 'Elmasri', isbn: '111-222', category: 'Textbooks', copies: 2 }, A);
    assert.strictEqual(r.status, 200); const id = r.body.id; assert.strictEqual(r.body.availableCopies, 2);
    assert.strictEqual((await call('POST', '/api/books', { title: 'x', author: 'y', isbn: '111-222', category: 'Textbooks' }, A)).status, 409);
    assert.ok((await call('GET', '/api/categories', undefined, A)).body.some(c => c.name === 'Textbooks'));
    await call('PUT', '/api/books/' + id, { title: 'Fundamentals of Databases', author: 'Elmasri', isbn: '111-222', category: 'Textbooks' }, A);
    assert.strictEqual((await call('GET', '/api/books?q=databases', undefined, A)).body.total, 1);
    assert.strictEqual((await call('GET', '/api/books?q=systems', undefined, A)).body.total, 0, 'old title gone from index');
    r = await call('POST', `/api/books/${id}/restock`, { qty: 3 }, A); assert.strictEqual(r.body.totalCopies, 5); assert.strictEqual(r.body.availableCopies, 5);
    assert.strictEqual((await call('DELETE', '/api/books/' + id, undefined, A)).status, 200);
    assert.strictEqual((await call('GET', '/api/books?q=databases', undefined, A)).body.total, 0);
    assert.strictEqual((await call('DELETE', '/api/categories/Textbooks', undefined, A)).status, 200);
  });
  await test('students: register (hashed pw), duplicate id, login, wrong password', async () => {
    let r = await call('POST', '/api/students/register', { name: 'Juan Dela Cruz', studentId: '23-1234-567', email: 'j@x.com', password: 'secret1', year: '2nd Year', course: 'BS Information Technology' });
    assert.strictEqual(r.status, 200); S1 = r.body.token; S1id = r.body.studentId;
    assert.strictEqual((await call('POST', '/api/students/register', { name: 'Dup', studentId: '23-1234-567', password: 'secret1' })).status, 409);
    assert.strictEqual((await call('POST', '/api/students/register', { name: 'Bad', studentId: '123', password: 'secret1' })).status, 400);
    assert.strictEqual((await call('POST', '/api/students/login', { studentId: '23-1234-567', password: 'wrong!!' })).status, 403);
    r = await call('POST', '/api/students/login', { studentId: '23-1234-567', password: 'secret1' }); assert.strictEqual(r.status, 200);
    const db = require('better-sqlite3')(path.join(dir, 'library.db'), { readonly: true });
    const h = db.prepare('SELECT password_hash FROM students').get().password_hash; db.close();
    assert.ok(h.startsWith('s1$') && !h.includes('secret1'));
    S2 = (await call('POST', '/api/students/register', { name: 'Maria Santos', studentId: '23-0000-001', password: 'secret2', year: '1st Year', course: 'BS Nursing' })).body.token;
  });
  await test('borrow flow: request → approve (copies drop) → renew once → return (copies back)', async () => {
    const cosmos = (await call('GET', '/api/books?q=cosmos', undefined, A)).body.items[0]; assert.strictEqual(cosmos.availableCopies, 2);
    assert.strictEqual((await call('POST', '/api/me/request', { bookId: cosmos.id }, S1)).status, 200);
    assert.strictEqual((await call('POST', '/api/me/request', { bookId: cosmos.id }, S1)).status, 409, 'no duplicate open request');
    assert.strictEqual((await call('GET', '/api/admin/counts', undefined, A)).body.pending, 1);
    const rec = (await call('GET', '/api/admin/records?status=pending', undefined, A)).body.items[0];
    assert.strictEqual(rec.studentName, 'Juan Dela Cruz'); assert.strictEqual(rec.bookTitle, 'Cosmos');
    assert.strictEqual((await call('POST', `/api/admin/records/${rec.id}/approve`, undefined, A)).status, 200);
    assert.strictEqual((await call('GET', '/api/books/' + cosmos.id, undefined, A)).body.availableCopies, 1);
    assert.strictEqual((await call('POST', `/api/admin/records/${rec.id}/approve`, undefined, A)).status, 409, 'cannot approve twice');
    let me = (await call('GET', '/api/me', undefined, S1)).body; assert.strictEqual(me.records[0].status, 'borrowed');
    assert.strictEqual((await call('POST', `/api/me/records/${rec.id}/renew`, undefined, S1)).status, 200);
    assert.strictEqual((await call('POST', `/api/me/records/${rec.id}/renew`, undefined, S1)).status, 409);
    assert.strictEqual((await call('POST', `/api/me/records/${rec.id}/renew`, undefined, S2)).status, 404, "can't renew someone else's loan");
    const ret = await call('POST', `/api/admin/records/${rec.id}/return`, undefined, A); assert.strictEqual(ret.body.fine, 0);
    assert.strictEqual((await call('GET', '/api/books/' + cosmos.id, undefined, A)).body.availableCopies, 2);
  });
  await test('out-of-stock book: cannot issue, waitlist works and is claimed when stock returns', async () => {
    const sapiens = (await call('GET', '/api/books?q=sapiens', undefined, A)).body.items[0]; assert.strictEqual(sapiens.availableCopies, 0);
    const sid = (await call('GET', '/api/me', undefined, S1)).body.student.id;
    assert.strictEqual((await call('POST', '/api/admin/records/issue', { studentId: sid, bookId: sapiens.id }, A)).status, 409);
    assert.strictEqual((await call('POST', '/api/me/waitlist', { bookId: sapiens.id }, S1)).status, 200);
    assert.strictEqual((await call('POST', '/api/me/waitlist', { bookId: sapiens.id }, S1)).status, 409);
    assert.strictEqual((await call('POST', '/api/me/waitlist/claim-ready', undefined, S1)).body.ready.length, 0);
    await call('POST', `/api/books/${sapiens.id}/restock`, { qty: 1 }, A);
    assert.deepStrictEqual((await call('POST', '/api/me/waitlist/claim-ready', undefined, S1)).body.ready, [sapiens.title]);
  });
  await test('overdue + fine: ₱10/day, deleting a student puts held copies back', async () => {
    const db = require('better-sqlite3')(path.join(dir, 'library.db'));
    const sid = (await call('GET', '/api/me', undefined, S2)).body.student.id;
    const nol = (await call('GET', '/api/books?q=noli', undefined, A)).body.items[0];
    const before = nol.availableCopies;
    const iss = await call('POST', '/api/admin/records/issue', { studentId: sid, bookId: nol.id }, A); assert.strictEqual(iss.status, 200);
    const d = new Date(Date.now() - 5 * 864e5), due = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    db.prepare('UPDATE records SET due_date = ? WHERE id = ?').run(due, iss.body.id); db.close();
    const hist = (await call('GET', '/api/admin/records?status=history', undefined, A)).body;
    const row = hist.items.find(r => r.id === iss.body.id); assert.strictEqual(row.status, 'overdue'); assert.strictEqual(row.fine, 50);
    assert.strictEqual(hist.counts.overdue, 1);
    assert.strictEqual((await call('GET', '/api/admin/stats', undefined, A)).body.fines, 50);
    assert.strictEqual((await call('DELETE', '/api/admin/students/' + sid, undefined, A)).status, 200);
    assert.strictEqual((await call('GET', '/api/books/' + nol.id, undefined, A)).body.availableCopies, before);
  });
  await test('CSV export, backup and restore (new + legacy localStorage format)', async () => {
    const csv = await fetch(BASE + '/api/admin/export/students.csv', { headers: { Authorization: 'Bearer ' + A } }); assert.ok((await csv.text()).includes('Juan Dela Cruz'));
    const bak = JSON.parse((await call('GET', '/api/admin/backup', undefined, A)).text); assert.strictEqual(bak.books.length, 8);
    let r = await call('POST', '/api/admin/restore', bak, A); assert.strictEqual(r.body.books, 8); assert.strictEqual(r.body.students, 1);
    assert.strictEqual((await call('POST', '/api/students/login', { studentId: '23-1234-567', password: 'secret1' })).status, 200, 'password survives restore');
    const legacy = { books: [{ id: 'b1', title: 'Old Book', author: 'A', category: 'Fiction', isbn: '1', totalCopies: 2, availableCopies: 1 }],
      students: [{ id: 's1', studentId: '21-1111-111', password: 'oldpass1', name: 'Legacy Kid', year: '1st Year', course: 'X' }],
      records: [{ id: 'r1', studentId: 's1', bookId: 'b1', requestDate: '2025-01-01', borrowDate: '2025-01-01', dueDate: '2025-01-15', returnDate: null, status: 'borrowed' }],
      waitlist: [], customCategories: ['Comics'] };
    r = await call('POST', '/api/admin/restore', legacy, A); assert.deepStrictEqual(r.body, { books: 1, students: 1, records: 1 });
    assert.strictEqual((await call('POST', '/api/students/login', { studentId: '21-1111-111', password: 'oldpass1' })).status, 200);
    assert.ok((await call('GET', '/api/categories', undefined, A)).body.some(c => c.name === 'Comics'));
  });

  console.log(`\n${passed} passed${process.exitCode ? ' — SOME FAILED' : ''}`);
  srv.kill(); fs.rmSync(dir, { recursive: true, force: true });
})();
