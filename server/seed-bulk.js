// Generate lots of fake books to show the database handles a big collection.
//   npm run seed:bulk            -> 100,000 books
//   npm run seed:bulk -- 500000  -> 500,000 books
//   npm run seed:clear           -> remove the generated books again (keeps your real ones)
const { db } = require('./db');

const TAG = 'GEN-';              // generated ISBNs start with this so they can be cleared safely
const N = parseInt(process.argv[2], 10) || 100000;

if (process.argv.includes('--clear')) {
  const info = db.prepare(`DELETE FROM books WHERE isbn LIKE '${TAG}%'`).run();
  console.log(`Removed ${info.changes.toLocaleString()} generated books.`);
  process.exit(0);
}

const adjectives = ['Silent', 'Hidden', 'Last', 'Golden', 'Broken', 'Lost', 'Distant', 'Burning', 'Quiet', 'Endless', 'Crimson', 'Forgotten', 'Wandering', 'Ancient', 'Modern'];
const nouns = ['River', 'Empire', 'Garden', 'Machine', 'Island', 'Voyage', 'Theory', 'Letters', 'Archipelago', 'Storm', 'Mirror', 'Harvest', 'Atlas', 'Code', 'Season'];
const topics = ['Physics', 'Biology', 'Philippine History', 'World War II', 'Algebra', 'Poetry', 'Chemistry', 'Economics', 'Astronomy', 'Law', 'Nursing', 'Programming', 'Philosophy', 'Geography'];
const first = ['Maria', 'Jose', 'Ana', 'Carlos', 'Liza', 'Ramon', 'Elena', 'Miguel', 'Sofia', 'Andres', 'Isabel', 'Paolo', 'Clara', 'Luis'];
const last = ['Santos', 'Reyes', 'Cruz', 'Bautista', 'Garcia', 'Mendoza', 'Torres', 'Aquino', 'Rivera', 'Navarro', 'Castillo', 'Lim', 'Tan', 'Dela Cruz'];
const rnd = a => a[Math.floor(Math.random() * a.length)];

const cats = db.prepare('SELECT id FROM categories').all().map(r => r.id);
const ins = db.prepare(`INSERT INTO books (title, author, isbn, category_id, description, total_copies, available_copies) VALUES (?,?,?,?,?,?,?)`);

const start = Date.now();
const startIdx = db.prepare(`SELECT COUNT(*) n FROM books WHERE isbn LIKE '${TAG}%'`).get().n;
db.transaction(() => {
  for (let i = 0; i < N; i++) {
    const n = startIdx + i;
    const total = 1 + Math.floor(Math.random() * 8);
    ins.run(
      `The ${rnd(adjectives)} ${rnd(nouns)} of ${rnd(topics)} (Vol. ${n})`,
      `${rnd(first)} ${rnd(last)}`,
      `${TAG}${String(n).padStart(9, '0')}`,
      rnd(cats),
      `Generated sample entry #${n} for load testing.`,
      total,
      Math.floor(Math.random() * (total + 1)),
    );
  }
})();
const total = db.prepare('SELECT COUNT(*) n FROM books').get().n;
console.log(`Inserted ${N.toLocaleString()} books in ${((Date.now() - start) / 1000).toFixed(1)}s — library now has ${total.toLocaleString()} books.`);
