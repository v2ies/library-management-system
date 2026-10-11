-- UPHSD Molino Library — SQLite schema
-- Applied automatically on server start (CREATE ... IF NOT EXISTS, safe to re-run).

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------- categories
CREATE TABLE IF NOT EXISTS categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  is_default INTEGER NOT NULL DEFAULT 0
);

-- --------------------------------------------------------------------- books
-- One row per TITLE; physical copies are tracked as counters.
CREATE TABLE IF NOT EXISTS books (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  title            TEXT    NOT NULL,
  author           TEXT    NOT NULL,
  isbn             TEXT    NOT NULL UNIQUE,
  category_id      INTEGER NOT NULL REFERENCES categories(id),
  isbn_plain       TEXT GENERATED ALWAYS AS (replace(replace(isbn, '-', ''), ' ', '')) VIRTUAL,  -- ISBN typed without dashes
  description      TEXT,
  total_copies     INTEGER NOT NULL DEFAULT 1 CHECK (total_copies >= 0),
  available_copies INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  CHECK (available_copies >= 0 AND available_copies <= total_copies)
);

-- Browsing: "all books in category X, A-Z" is answered straight from this index.
CREATE INDEX IF NOT EXISTS idx_books_category_title ON books (category_id, title COLLATE NOCASE);
-- Browsing with no filter, A-Z.
CREATE INDEX IF NOT EXISTS idx_books_title ON books (title COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_books_isbn_plain ON books (isbn_plain);
CREATE INDEX IF NOT EXISTS idx_books_available ON books (available_copies) WHERE available_copies > 0;

-- Full-text search (title / author / ISBN) so search stays fast with 100k+ books.
CREATE VIRTUAL TABLE IF NOT EXISTS books_fts USING fts5(
  title, author, isbn,
  content = 'books', content_rowid = 'id',
  tokenize = 'unicode61 remove_diacritics 2',
  prefix = '2 3'
);

CREATE TRIGGER IF NOT EXISTS books_ai AFTER INSERT ON books BEGIN
  INSERT INTO books_fts (rowid, title, author, isbn) VALUES (new.id, new.title, new.author, new.isbn);
END;
CREATE TRIGGER IF NOT EXISTS books_ad AFTER DELETE ON books BEGIN
  INSERT INTO books_fts (books_fts, rowid, title, author, isbn) VALUES ('delete', old.id, old.title, old.author, old.isbn);
END;
CREATE TRIGGER IF NOT EXISTS books_au AFTER UPDATE OF title, author, isbn ON books BEGIN
  INSERT INTO books_fts (books_fts, rowid, title, author, isbn) VALUES ('delete', old.id, old.title, old.author, old.isbn);
  INSERT INTO books_fts (rowid, title, author, isbn) VALUES (new.id, new.title, new.author, new.isbn);
END;

-- ------------------------------------------------------------------ students
CREATE TABLE IF NOT EXISTS students (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id    TEXT    NOT NULL UNIQUE,            -- YY-XXXX-XXX
  name          TEXT    NOT NULL,
  email         TEXT,
  year          TEXT,
  course        TEXT,
  password_hash TEXT    NOT NULL,                   -- scrypt, never plain text
  photo         TEXT,                               -- data URL (max 2 MB, enforced by API)
  photo_v       INTEGER NOT NULL DEFAULT 0,         -- bumps when the photo changes (cache-busting)
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_students_name ON students (name COLLATE NOCASE);

-- ------------------------------------------------------------------- records
-- One row per borrow request / loan.  status: pending -> borrowed -> (overdue) -> returned
CREATE TABLE IF NOT EXISTS records (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id   INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  book_id      INTEGER NOT NULL REFERENCES books(id)    ON DELETE CASCADE,
  request_date TEXT    NOT NULL,
  borrow_date  TEXT,
  due_date     TEXT,
  return_date  TEXT,
  status       TEXT    NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'borrowed', 'overdue', 'returned')),
  renewed      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_records_status_req  ON records (status, request_date DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_records_status_due  ON records (status, due_date);
CREATE INDEX IF NOT EXISTS idx_records_student     ON records (student_id, status);
CREATE INDEX IF NOT EXISTS idx_records_book        ON records (book_id, status);
CREATE INDEX IF NOT EXISTS idx_records_req         ON records (request_date DESC, id DESC);
-- A student can only have ONE open request/loan per book (enforced by the database itself).
CREATE UNIQUE INDEX IF NOT EXISTS uq_records_open
  ON records (student_id, book_id) WHERE status IN ('pending', 'borrowed', 'overdue');

-- ------------------------------------------------------------------ waitlist
CREATE TABLE IF NOT EXISTS waitlist (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  book_id    INTEGER NOT NULL REFERENCES books(id)    ON DELETE CASCADE,
  date       TEXT    NOT NULL,
  UNIQUE (student_id, book_id)
);
CREATE INDEX IF NOT EXISTS idx_waitlist_book ON waitlist (book_id);

-- ---------------------------------------------------------------------- meta
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);

INSERT OR IGNORE INTO categories (name, is_default) VALUES
  ('Fiction', 1), ('Science', 1), ('History', 1), ('Reference', 1);
