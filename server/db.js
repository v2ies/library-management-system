// SQLite connection, schema bootstrap, small shared helpers.
const Database = require('better-sqlite3');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, 'library.db');

const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

// ---- constants shared with the UI
const LOAN_DAYS = 14;
const FINE_PER_DAY = 10;

// ---- dates (local time, YYYY-MM-DD)
const pad = n => String(n).padStart(2, '0');
function localDate(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 864e5);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
const dayNum = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) / 864e5; };
function daysLate(dueDate, returnDate) {
  if (!dueDate) return 0;
  const diff = dayNum(returnDate || localDate()) - dayNum(dueDate);
  return diff > 0 ? diff : 0;
}

// ---- passwords (scrypt + per-user salt)
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(String(pw), salt, 32);
  return `s1$${salt.toString('hex')}$${h.toString('hex')}`;
}
function verifyPassword(pw, stored) {
  try {
    const [v, saltHex, hashHex] = String(stored).split('$');
    if (v !== 's1') return false;
    const h = crypto.scryptSync(String(pw), Buffer.from(saltHex, 'hex'), 32);
    return crypto.timingSafeEqual(h, Buffer.from(hashHex, 'hex'));
  } catch { return false; }
}

// ---- overdue is derived from due_date; this keeps the stored status in sync (cheap, indexed)
const _overdue = db.prepare(`UPDATE records SET status = 'overdue' WHERE status = 'borrowed' AND due_date < ?`);
function refreshOverdue() { _overdue.run(localDate()); }

// ---- first run: put the 8 sample books in so the app isn't empty
const SAMPLE_BOOKS = [
  ['Noli Me Tangere', 'Jose Rizal', 'Fiction', '978-9710579891', 'The classic Filipino novel of colonial society.', 4, 2],
  ['El Filibusterismo', 'Jose Rizal', 'Fiction', '978-9710579907', 'The sequel to Noli Me Tangere.', 3, 3],
  ['A Brief History of Time', 'Stephen Hawking', 'Science', '978-0553380163', 'From the Big Bang to black holes.', 3, 1],
  ['Sapiens: A Brief History of Humankind', 'Yuval Noah Harari', 'History', '978-0062316097', 'A groundbreaking narrative of humanity.', 2, 0],
  ['The Filipino Primitive', 'Nick Joaquin', 'History', '978-9715505543', 'Essays on Philippine culture and history.', 2, 2],
  ['Cosmos', 'Carl Sagan', 'Science', '978-0345539434', 'A personal voyage through the universe.', 3, 2],
  ['Oxford English Dictionary', 'Oxford University Press', 'Reference', '978-0199571123', 'Comprehensive reference dictionary.', 5, 5],
  ['Florante at Laura', 'Francisco Balagtas', 'Fiction', '978-9712300011', 'A classic Filipino awit.', 3, 3],
];
function seedSamplesIfFresh() {
  const done = db.prepare(`SELECT value FROM meta WHERE key = 'seeded'`).get();
  if (done) return;
  const empty = db.prepare('SELECT COUNT(*) n FROM books').get().n === 0;
  db.transaction(() => {
    if (empty) {
      const ins = db.prepare(`INSERT INTO books (title, author, isbn, category_id, description, total_copies, available_copies)
        VALUES (?, ?, ?, (SELECT id FROM categories WHERE name = ?), ?, ?, ?)`);
      SAMPLE_BOOKS.forEach(b => ins.run(b[0], b[1], b[3], b[2], b[4], b[5], b[6]));
    }
    db.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES ('seeded', '1')`).run();
  })();
}
seedSamplesIfFresh();

module.exports = { db, DB_FILE, LOAN_DAYS, FINE_PER_DAY, localDate, daysLate, hashPassword, verifyPassword, refreshOverdue };
