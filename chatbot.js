/* chatbot.js — "Libby", the UPHSD Molino Library assistant.
 *
 * A self-contained chat widget for the STUDENT portal (index.html).
 * - No dependencies, no API keys, no build step. Add one <script> tag after student.js. The chat button only shows while a student is logged in.
 * - Uses the app's own helpers/endpoints (api(), session, esc(), fineFor(), renderStudentPortal()).
 * - Understands plain-English questions with a rule-based intent matcher, then answers
 *   from the real library data (books, your loans, fines, waitlist).
 * - Anything that changes data (borrow request, renew, waitlist) needs an explicit button tap,
 *   and borrow requests show the Library Rules first, just like the normal portal.
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ helpers */
  var PESO = '\u20B1';
  function E(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function loanDays() { return typeof LOAN_DAYS !== 'undefined' ? LOAN_DAYS : 14; }
  function finePerDay() { return typeof FINE_PER_DAY !== 'undefined' ? FINE_PER_DAY : 10; }
  function fineOf(r) {
    if (typeof fineFor === 'function') { try { return fineFor(r); } catch (e) {} }
    if (r.fine != null) return r.fine;
    if (!r.dueDate || r.status === 'pending') return 0;
    var end = r.returnDate ? new Date(r.returnDate + 'T00:00:00') : new Date();
    var late = Math.floor((end - new Date(r.dueDate + 'T00:00:00')) / 864e5);
    return late > 0 ? late * finePerDay() : 0;
  }
  function fmtDate(d) {
    if (!d) return '\u2014';
    var x = new Date(d + 'T00:00:00');
    return isNaN(x) ? d : x.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function dayDiff(d) {
    var t = new Date(); t.setHours(0, 0, 0, 0);
    return Math.round((new Date(d + 'T00:00:00') - t) / 864e5);
  }
  function dueText(d) {
    var n = dayDiff(d);
    if (n < 0) return (-n) + ' day' + (-n > 1 ? 's' : '') + ' overdue';
    if (n === 0) return 'due today';
    if (n === 1) return 'due tomorrow';
    return 'due in ' + n + ' days';
  }
  var STATUS_LABEL = { pending: 'Pending approval', borrowed: 'Borrowed', overdue: 'Overdue', returned: 'Returned' };
  function isActive(r) { return r.status === 'borrowed' || r.status === 'overdue'; }

  /* ------------------------------------------------------------------ data layer
   * 'api'   = newer portal that talks to the Node/SQL server (needs a login token)
   * 'local' = older portal that keeps everything in the browser (localStorage); read-only for Libby */
  function mode() {
    return (typeof api === 'function' && typeof session !== 'undefined' && session && session.token) ? 'api' : 'local';
  }
  function pick(o, names) {
    for (var i = 0; i < names.length; i++) { if (o && o[names[i]] !== undefined && o[names[i]] !== null) return o[names[i]]; }
    return undefined;
  }
  // Find the portal's data without relying on exact key/field names: scan localStorage for
  // arrays of objects that look like books, students and borrow records.
  function collectArrays(o, depth, out) {
    if (depth > 3 || !o || typeof o !== 'object') return out;
    if (Array.isArray(o)) { if (o.length && o[0] && typeof o[0] === 'object') out.push(o); return out; }
    Object.keys(o).forEach(function (k) { collectArrays(o[k], depth + 1, out); });
    return out;
  }
  function readLocal() {
    var res = { books: [], students: [], records: [], sess: {} }, keys = [], i, n;
    try { for (i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i)); } catch (e) {}
    keys.sort(function (a, b) { return (/^uphsd_library/.test(b) ? 1 : 0) - (/^uphsd_library/.test(a) ? 1 : 0); });
    for (n = 0; n < keys.length && !res.books.length; n++) {
      var db; try { db = JSON.parse(localStorage.getItem(keys[n])); } catch (e) { continue; }
      collectArrays(db, 0, []).forEach(function (a) {
        var f = a[0];
        if (f.bookId !== undefined) { if (!res.records.length) res.records = a; }
        else if (f.title !== undefined && (f.author !== undefined || f.category !== undefined)) { if (!res.books.length) res.books = a; }
        else if (f.studentId !== undefined || (f.name !== undefined && (f.course !== undefined || f.year !== undefined))) { if (!res.students.length) res.students = a; }
      });
    }
    try {
      var sk = []; for (i = 0; i < sessionStorage.length; i++) sk.push(sessionStorage.key(i));
      sk.sort(function (a, b) { return (b === 'uphsd_session' ? 1 : 0) - (a === 'uphsd_session' ? 1 : 0); });
      for (n = 0; n < sk.length; n++) {
        var x = JSON.parse(sessionStorage.getItem(sk[n]));
        if (x && typeof x === 'object' && (x.studentId || x.id)) { res.sess = x; break; }
      }
    } catch (e) {}
    return res;
  }
  function domText(id) { var el = document.getElementById(id); return el ? (el.textContent || '').trim() : ''; }
  function localBooks() {
    var L = readLocal();
    return L.books.map(function (b) {
      var total = Number(pick(b, ['totalCopies', 'copies', 'total', 'quantity', 'qty', 'stock']));
      if (isNaN(total)) total = 1;
      var avail = pick(b, ['availableCopies', 'available', 'availableQty']);
      if (avail === undefined) {
        var out = L.records.filter(function (r) { return String(r.bookId) === String(b.id) && (r.status === 'borrowed' || r.status === 'overdue'); }).length;
        avail = Math.max(0, total - out);
      }
      return { id: b.id, title: b.title || b.name || '', author: b.author || '', category: b.category || '', availableCopies: Number(avail), totalCopies: total };
    });
  }
  function localMe() {
    var L = readLocal();
    var m = domText('stuMeta').match(/\d{2}-\d{4}-\d{3}/);
    var sid = pick(L.sess, ['studentId', 'id', 'sid']) || (m && m[0]);
    if (!sid) { var e = new Error('Please log in to the student portal first, then ask me again.'); e.code = 'LOGIN'; throw e; }
    var st = L.students.filter(function (x) { return String(pick(x, ['studentId', 'id'])) === String(sid); })[0] || {};
    var books = localBooks();
    var recs = L.records.filter(function (r) { return String(pick(r, ['studentId', 'student'])) === String(sid); }).map(function (r) {
      var bk = books.filter(function (b) { return String(b.id) === String(r.bookId); })[0] || {};
      var status = r.status;
      if (status === 'borrowed' && r.dueDate && dayDiff(r.dueDate) < 0) status = 'overdue';
      return { id: r.id, bookId: r.bookId, bookTitle: r.bookTitle || bk.title || 'Book', status: status, requestDate: r.requestDate, dueDate: r.dueDate, returnDate: r.returnDate, renewed: !!r.renewed, fine: r.fine };
    });
    return { student: { name: st.name || domText('stuName') || sid, studentId: sid, course: st.course || '', year: st.year || '' }, records: recs, waitlist: [] };
  }
  async function findBooks(q, category) {
    if (mode() === 'api') return api('GET', '/api/books?' + new URLSearchParams({ q: q, category: category, page: 1, limit: 5 }));
    var terms = norm(q).split(' ').filter(Boolean);
    var items = localBooks().filter(function (b) {
      if (category && b.category !== category) return false;
      var hay = norm(b.title + ' ' + b.author + ' ' + b.category);
      return terms.every(function (t) { return hay.indexOf(t) !== -1; });
    });
    return { items: items.slice(0, 5), total: items.length, page: 1, pages: 1 };
  }
  function openBrowse(title) {
    try {
      var tabs = document.querySelectorAll('#screen-student .tab-btn');
      if (typeof switchStuTab === 'function') switchStuTab('browse', tabs[0]);
      var s = document.getElementById('stuBookSearch');
      if (s) { s.value = title; if (typeof renderStuBrowse === 'function') renderStuBrowse(); }
    } catch (e) {}
    toggle(false);
  }
  function openMyBooks() {
    try {
      var tabs = document.querySelectorAll('#screen-student .tab-btn');
      if (typeof switchStuTab === 'function') switchStuTab('mybooks', tabs[1]);
    } catch (e) {}
    toggle(false);
  }

  /* ------------------------------------------------------------------ language understanding */
  function norm(t) {
    return String(t || '').toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu, ' ').replace(/\s+/g, ' ').trim();
  }

  var LEAD = /^(?:please|pls|libby|hi|hello|hey|can you|could you|would you|will you|i want to|i wanna|i need to|i need|i would like to|i'd like to|id like to|i am looking for|im looking for|i'm looking for|help me|let me|find|search for|search|look up|look for|looking for|show me|show|recommend|suggest|borrow|request|reserve|get me|get|check out|check if|check|do you have|have you got|is there|are there|is|are|any|renew|extend|join the waitlist for|join waitlist for|waitlist for|waitlist|add me to the waitlist for|notify me when|notify me if|notify me about|my|all|a|an|the|some|more|book|books|copy of|copies of|copy|about|on|by|called|titled|named|regarding|related to|to|for|of)\s+/;
  var TRAIL = /\s+(?:(?:is|are)\s+)?(?:(?:still|currently|now)\s+)?(?:available|in stock|there|here|in the library|in the catalog(?:ue)?|please|pls|thanks|thank you|books?|copies|copy)$/;

  function extractQuery(n) {
    var q = n, i = 0;
    while (i++ < 8 && LEAD.test(q + ' ')) q = (q + ' ').replace(LEAD, '').trim();
    i = 0;
    while (i++ < 4 && TRAIL.test(q)) q = q.replace(TRAIL, '').trim();
    if (/^(?:books?|a book|something|anything|it|this|that|them|my|all|loans?|my books?)$/.test(q)) q = '';
    return q;
  }

  function understand(raw) {
    var n = norm(raw);
    var words = n ? n.split(' ').length : 0;
    function has(re) { return re.test(n); }
    if (!n) return { intent: 'empty' };

    if (words <= 4 && has(/^(?:hi|hello|hey|yo|good (?:morning|afternoon|evening)|kumusta|musta)\b/)) return { intent: 'greet' };
    if (has(/^(?:thanks|thank you|thx|ty|salamat)\b/)) return { intent: 'thanks' };
    if (has(/^(?:bye|goodbye|see you|exit|close)\b/)) return { intent: 'bye' };
    if (words <= 6 && has(/\b(?:help|what can you do|commands|options|menu)\b/)) return { intent: 'help' };

    if (has(/\bhow (?:do|can|to|should) (?:i |we )?(?:borrow|request|get|reserve|check out)\b/)) return { intent: 'howborrow' };
    if (has(/\b(?:forgot|reset|change|lost)\b.*\bpassword\b|\bpassword\b.*\b(?:reset|forgot|change)\b|\bhow (?:do|can) i (?:register|sign ?up|log ?in|login)\b/)) return { intent: 'account_help' };
    if (has(/\b(?:who am i|my (?:account|profile|student id|info|details))\b/)) return { intent: 'profile' };
    if (has(/\b(?:rules?|regulations?|policy|policies|guidelines|loan period|borrowing period|how long (?:can|do) i (?:keep|borrow)|how many days)\b/)) return { intent: 'rules' };
    if (has(/\b(?:fines?|penalt(?:y|ies)|sanctions?|late fees?|overdue|owe)\b/)) return { intent: 'fines' };
    if (has(/\b(?:renew|extend|extension)\b/)) return { intent: 'renew', query: extractQuery(n) };
    if (has(/\b(?:waitlist|wait list|notify me|let me know when)\b/)) {
      var wq = extractQuery(n);
      return { intent: (wq && /\b(?:join|add|notify|let me know)\b/.test(n)) ? 'waitlist_join' : 'waitlist_list', query: wq };
    }
    if (has(/\b(?:due|deadline|return date)\b/) || has(/\bwhen\b.*\b(?:return|bring back)\b/)) return { intent: 'due' };
    if (has(/\b(?:my books?|borrowed|my loans?|my requests?|pending|(?:borrow(?:ing)?|loan|my) history|my records?|what (?:did|have) i (?:borrow|request)|books i (?:have|borrowed))\b/)) return { intent: 'mybooks' };
    if (has(/\b(?:categories|category|genres?|sections|subjects)\b/) && has(/\b(?:what|which|list|show|are there|have|available)\b/)) return { intent: 'categories' };
    if (has(/\b(?:library hours|opening hours|open hours|what time (?:do you|does the library) (?:open|close)|when (?:do you|does the library) (?:open|close)|are you open|contact|phone number|email address|where is the library|library location)\b/)) return { intent: 'info' };
    if (has(/\b(?:borrow|request|reserve|check out)\b/)) return { intent: 'borrow', query: extractQuery(n) };
    if (has(/\b(?:available|availability|in stock|do you have|have you got|any copies|copies of|is there|are there)\b/)) return { intent: 'availability', query: extractQuery(n) };
    if (has(/\b(?:find|search|look(?:ing)? (?:for|up)|show|recommend|suggest|books? (?:about|on|by)|anything (?:about|on)|something (?:about|on|to read)|get me|any books)\b/)) return { intent: 'search', query: extractQuery(n) };

    return { intent: 'fallback', query: words <= 7 ? extractQuery(n) : '' };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { understand: understand, extractQuery: extractQuery, norm: norm };
  }
  if (typeof document === 'undefined') return;

  /* ------------------------------------------------------------------ styles */
  var CSS = [
    '.lb-root{position:fixed;right:20px;bottom:20px;z-index:99999;font-family:inherit;font-size:14px}',
    '.lb-root.lb-hide{display:none}',
    '.lb-fab{width:60px;height:60px;border-radius:50%;border:2px solid rgba(255,255,255,.55);cursor:pointer;background:var(--gold,#c9a14a);color:#4a0d18;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 20px rgba(0,0,0,.45)}.lb-fab:hover{transform:scale(1.06)}.lb-tip{position:absolute;right:72px;bottom:15px;background:var(--surface,#fff);color:var(--ink,#231a14);border:1px solid var(--line,#e5dccd);padding:6px 12px;border-radius:999px;font-size:12.5px;font-weight:700;white-space:nowrap;box-shadow:0 4px 14px rgba(0,0,0,.3);pointer-events:none}.lb-panel.open~.lb-tip{display:none}',
    '.lb-fab svg{width:32px;height:32px}',
    '.lb-panel{position:absolute;right:0;bottom:76px;width:370px;max-width:calc(100vw - 24px);height:540px;max-height:calc(100vh - 110px);background:var(--surface,#fff);color:var(--ink,#231a14);border:1px solid var(--line,#e5dccd);border-radius:16px;box-shadow:0 12px 36px rgba(0,0,0,.3);display:none;flex-direction:column;overflow:hidden}',
    '.lb-panel.open{display:flex}',
    '.lb-head{background:var(--maroon,#6e1220);color:#fff;padding:12px 14px;display:flex;align-items:center;gap:10px}',
    '.lb-head b{font-size:15px}.lb-head small{display:block;opacity:.8;font-size:11.5px;margin-top:1px}',
    '.lb-head .lb-x{margin-left:auto;background:transparent;border:0;color:#fff;font-size:22px;line-height:1;cursor:pointer;padding:2px 6px}',
    '.lb-msgs{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px}',
    '.lb-m{display:flex}.lb-m.me{justify-content:flex-end}',
    '.lb-b{max-width:88%;padding:9px 12px;border-radius:14px;line-height:1.45;background:rgba(127,127,127,.14);word-wrap:break-word}',
    '.lb-m.me .lb-b{background:var(--maroon,#6e1220);color:#fff;border-bottom-right-radius:4px}',
    '.lb-m.bot .lb-b{border-bottom-left-radius:4px}',
    '.lb-b p{margin:0 0 6px}.lb-b p:last-child{margin-bottom:0}',
    '.lb-b ul{margin:6px 0 0;padding-left:18px}.lb-b li{margin:3px 0}',
    '.lb-book,.lb-rec{background:var(--surface,#fff);border:1px solid var(--line,#e5dccd);border-radius:10px;padding:9px 10px;margin-top:8px}',
    '.lb-bt{font-weight:700;font-size:13.5px}.lb-bm{font-size:12px;color:var(--muted,#79705f);margin-top:2px}',
    '.lb-bm b.ok{color:var(--green,#1f6b41)}.lb-bm b.no{color:var(--red,#b3261e)}',
    '.lb-act{margin-top:8px;border:0;border-radius:8px;padding:6px 11px;font:inherit;font-size:12.5px;font-weight:700;cursor:pointer;background:var(--gold,#c9a14a);color:#3a2c07}',
    '.lb-act.alt{background:transparent;color:inherit;border:1px solid var(--line,#cfc5b3)}',
    '.lb-act:disabled{opacity:.55;cursor:default}',
    '.lb-acts{display:flex;gap:8px;flex-wrap:wrap}',
    '.lb-tag{display:inline-block;margin-top:8px;font-size:12px;font-weight:700;color:var(--muted,#79705f)}',
    '.lb-warn{color:var(--red,#b3261e);font-weight:700}',
    '.lb-chips{display:flex;gap:6px;flex-wrap:wrap;padding:0 14px 10px}',
    '.lb-chip{border:1px solid var(--line,#cfc5b3);background:transparent;color:inherit;border-radius:999px;padding:5px 10px;font:inherit;font-size:12px;cursor:pointer}',
    '.lb-form{display:flex;gap:8px;padding:10px 12px;border-top:1px solid var(--line,#e5dccd)}',
    '.lb-form input{flex:1;min-width:0;padding:9px 11px;border-radius:10px;border:1px solid var(--line,#cfc5b3);background:transparent;color:inherit;font:inherit}',
    '.lb-form button{border:0;border-radius:10px;padding:0 14px;font:inherit;font-weight:700;cursor:pointer;background:var(--gold,#c9a14a);color:#3a2c07}',
    '.lb-dots i{display:inline-block;width:6px;height:6px;margin:0 2px;border-radius:50%;background:currentColor;opacity:.4;animation:lbd 1s infinite}',
    '.lb-dots i:nth-child(2){animation-delay:.15s}.lb-dots i:nth-child(3){animation-delay:.3s}',
    '@keyframes lbd{0%,80%,100%{opacity:.25}40%{opacity:.9}}',
    '@media(max-width:480px){.lb-root{right:12px;bottom:12px}.lb-panel{bottom:66px;height:calc(100vh - 100px)}}'
  ].join('');

  /* ------------------------------------------------------------------ state + DOM */
  var me = null, cats = null, ctx = {}, busy = false, lastSid = undefined;
  var root, panel, msgs, input, fab;

  function build() {
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    root = document.createElement('div'); root.className = 'lb-root';
    root.innerHTML =
      '<div class="lb-panel" id="lbPanel" role="dialog" aria-label="Library assistant">' +
        '<div class="lb-head"><div><b>Libby</b><small>UPHSD Molino Library assistant</small></div>' +
        '<button class="lb-x" type="button" aria-label="Close chat">&times;</button></div>' +
        '<div class="lb-msgs" aria-live="polite"></div>' +
        '<div class="lb-chips"></div>' +
        '<form class="lb-form"><input type="text" maxlength="200" placeholder="Ask about books, due dates, fines\u2026" aria-label="Message">' +
        '<button type="submit">Send</button></form>' +
      '</div>' +
      '<span class="lb-tip">Ask Libby</span>' +
      '<button class="lb-fab" type="button" aria-label="Open library assistant" title="Ask Libby">' +
        '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M4 7a3 3 0 0 1 3-3h18a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H15l-6 5v-5H7a3 3 0 0 1-3-3z"/>' +
        '<path d="M16 10v7M16 10c-2-1.4-4-1.4-6-.9v7c2-.5 4-.5 6 .9M16 10c2-1.4 4-1.4 6-.9v7c-2-.5-4-.5-6 .9"/></svg>' +
      '</button>';
    document.body.appendChild(root);
    panel = root.querySelector('.lb-panel'); msgs = root.querySelector('.lb-msgs');
    input = root.querySelector('input'); fab = root.querySelector('.lb-fab');

    fab.addEventListener('click', function () { toggle(); });
    root.querySelector('.lb-x').addEventListener('click', function () { toggle(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && panel.classList.contains('open')) toggle(false); });
    root.querySelector('form').addEventListener('submit', function (e) {
      e.preventDefault(); var t = input.value; input.value = ''; send(t);
    });
    root.querySelector('.lb-chips').addEventListener('click', function (e) {
      var c = e.target.closest('.lb-chip'); if (c) send(c.getAttribute('data-q'));
    });
    msgs.addEventListener('click', onAction);
    setChips([
      ['Find a book', 'find a book'], ['My borrowed books', 'my books'],
      ['When are my books due?', 'when are my books due'], ['My fines', 'do i have fines'], ['Library rules', 'library rules']
    ]);
    setInterval(sync, 800); sync();
  }

  function setChips(list) {
    root.querySelector('.lb-chips').innerHTML = list.map(function (c) {
      return '<button type="button" class="lb-chip" data-q="' + E(c[1]) + '">' + E(c[0]) + '</button>';
    }).join('');
  }

  function toggle(force) {
    var open = force === undefined ? !panel.classList.contains('open') : force;
    panel.classList.toggle('open', open);
    if (open) { if (!msgs.children.length) welcome(); input.focus(); }
  }

  // reset the chat when a different student logs in or out (the button itself is always visible)
  function sync() {
    var sid = null;
    try {
      if (typeof session !== 'undefined' && session && session.studentId) sid = session.studentId;
      else { var x = JSON.parse(sessionStorage.getItem('uphsd_session') || '{}'); sid = (x && x.studentId) || null; }
    } catch (e) {}
    root.classList.toggle('lb-hide', !sid); // only show Libby while a student is logged in
    if (sid !== lastSid) { lastSid = sid; msgs.innerHTML = ''; ctx = {}; me = null; cats = null; panel.classList.remove('open'); }
  }

  function addMsg(who, html) {
    var d = document.createElement('div'); d.className = 'lb-m ' + who;
    d.innerHTML = '<div class="lb-b">' + html + '</div>';
    msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight; return d;
  }
  function typing() { return addMsg('bot', '<span class="lb-dots"><i></i><i></i><i></i></span>'); }

  async function loadMe() { me = mode() === 'api' ? await api('GET', '/api/me') : localMe(); return me; }
  function refreshPortal() { try { if (typeof renderStudentPortal === 'function') renderStudentPortal().catch(function () {}); } catch (e) {} }

  async function welcome() {
    var first = '';
    try { first = (await loadMe()).student.name.split(' ')[0]; } catch (e) {}
    addMsg('bot', '<p>Hi' + (first ? ' ' + E(first) : '') + '! I\'m Libby, the library assistant.</p>' +
      '<p>I can search the catalog, check what\'s available, show your borrowed books, due dates and fines, renew loans, and join waitlists. Try \u201cfind books about history\u201d or tap a shortcut below.</p>');
  }

  /* ------------------------------------------------------------------ conversation */
  async function send(text) {
    text = String(text || '').trim();
    if (!text || busy) return;
    busy = true; addMsg('me', E(text)); var t = typing();
    try {
      var u = understand(text);
      if (ctx.awaiting && (u.intent === 'fallback' || u.intent === 'search')) {
        u = { intent: ctx.awaiting, query: extractQuery(norm(text)) || u.query };
      }
      ctx = {};
      var html = await respond(u, text);
      t.remove(); addMsg('bot', html);
    } catch (e) {
      t.remove();
      addMsg('bot', '<p>' + (e && e.code === 'LOGIN' ? '' : 'Sorry, something went wrong: ') + E((e && e.message) || e) + '</p>');
    } finally { busy = false; if (input) input.focus(); }
  }

  async function respond(u) {
    switch (u.intent) {
      case 'empty': return '<p>Type a question and I\'ll do my best to help.</p>';
      case 'greet': return '<p>Hello! What can I help you with today?</p>';
      case 'thanks': return '<p>You\'re welcome! Ask me anything else about the library.</p>';
      case 'bye': setTimeout(function () { toggle(false); }, 900); return '<p>Goodbye! Happy reading.</p>';
      case 'help': return helpHtml();
      case 'info': return '<p>I don\'t have the library\'s opening hours or contact details. Please ask the librarian at the desk.</p>';
      case 'account_help': return '<p>I can\'t reset passwords or change account details. Please see the librarian for help with your account. You can change your display name and photo under <b>Settings</b>.</p>';
      case 'howborrow': return howBorrowHtml();
      case 'rules': return rulesHtml();
      case 'categories': return categoriesHtml();
      case 'profile': return profileHtml();
      case 'mybooks': return myBooksHtml();
      case 'due': return dueHtml();
      case 'fines': return finesHtml();
      case 'renew': return renewHtml(u.query);
      case 'waitlist_list': return waitlistHtml();
      case 'waitlist_join':
        return searchHtml(u.query, 'Here\'s what I found. Books with no copies left have a \u201cNotify me\u201d button:');
      case 'borrow':
        if (!u.query) { ctx.awaiting = 'borrow'; return '<p>Which book would you like to borrow? Give me a title, author or topic.</p>'; }
        return searchHtml(u.query, 'Tap <b>Request to borrow</b> on the book you want:');
      case 'availability':
        if (!u.query) { ctx.awaiting = 'availability'; return '<p>Which book should I check? Give me a title, author or topic.</p>'; }
        return searchHtml(u.query, 'Here\'s the current availability:');
      case 'search':
        if (!u.query) { ctx.awaiting = 'search'; return '<p>What are you looking for? Give me a title, author, topic or category (e.g. Science).</p>'; }
        return searchHtml(u.query, 'Here\'s what I found:');
      default: // fallback: a short phrase is probably a book title or topic
        if (u.query) {
          var r = await searchHtml(u.query, 'Here\'s what I found:', true);
          if (r) return r;
        }
        return '<p>I\'m not sure I understood that. I can help with finding books, availability, your borrowed books, due dates, fines, renewals, the waitlist and library rules.</p>' + helpHtml(true);
    }
  }

  /* ------------------------------------------------------------------ answers */
  function helpHtml(short) {
    return (short ? '' : '<p>Here\'s what I can do:</p>') +
      '<ul><li>Search books by title, author or category</li><li>Check if a book is available and request it</li>' +
      '<li>Show your borrowed books, due dates and fines</li><li>Renew a loan or join a waitlist</li><li>Explain the library rules</li></ul>';
  }
  function howBorrowHtml() {
    return '<p>Borrowing works like this:</p><ul><li>Find the book (ask me, or use <b>Browse Books</b>).</li>' +
      '<li>Tap <b>Request to borrow</b> and agree to the library rules.</li>' +
      '<li>Your request goes to the librarian as <i>pending</i>.</li>' +
      '<li>Once approved, the book is issued with a due date ' + loanDays() + ' days out.</li></ul>' +
      '<p>Want to start? Tell me the book you\'re after.</p>';
  }
  function rulesHtml() {
    return '<p><b>Library rules &amp; regulations</b></p><ul>' +
      '<li>Don\'t write, highlight or mark on any page.</li><li>Don\'t fold, tear or bend pages or the cover.</li>' +
      '<li>Keep books away from food, drinks and moisture.</li><li>Return books on or before the due date.</li>' +
      '<li>Report existing damage to the librarian before borrowing.</li><li>Lost or damaged books must be replaced or paid for.</li></ul>' +
      '<p>Loan period: <b>' + loanDays() + ' days</b>. Overdue sanction: <b>' + PESO + finePerDay() + ' per day</b>.</p>';
  }
  async function categoriesHtml() {
    await ensureCats();
    if (!cats.length) return '<p>I couldn\'t load the categories right now.</p>';
    return '<p>The catalog has these categories:</p><div class="lb-acts">' + cats.map(function (c) {
      return '<button type="button" class="lb-act alt" data-a="ask" data-q="show ' + E(c) + ' books">' + E(c) + '</button>';
    }).join('') + '</div>';
  }
  async function profileHtml() {
    var d = await loadMe(), s = d.student;
    var active = d.records.filter(isActive).length, pend = d.records.filter(function (r) { return r.status === 'pending'; }).length;
    return '<p><b>' + E(s.name) + '</b><br>' + E(s.studentId) + ' \u00B7 ' + E(s.course) + ' \u00B7 ' + E(s.year) + '</p>' +
      '<p>' + active + ' active loan' + (active === 1 ? '' : 's') + ', ' + pend + ' pending request' + (pend === 1 ? '' : 's') + '.</p>';
  }

  function recHtml(r, withRenew) {
    var extra;
    if (r.status === 'returned') extra = 'returned ' + fmtDate(r.returnDate);
    else if (r.status === 'pending') extra = 'waiting for librarian approval';
    else extra = 'due ' + fmtDate(r.dueDate) + ' (' + dueText(r.dueDate) + ')';
    var f = fineOf(r), fineTxt = (f > 0 && r.status !== 'returned') ? ' \u00B7 <span class="lb-warn">fine ' + PESO + f + '</span>' : '';
    var btn = '';
    if (withRenew && r.status === 'borrowed' && !r.renewed) {
      btn = mode() === 'api'
        ? '<button type="button" class="lb-act" data-a="renew" data-id="' + E(r.id) + '">Renew</button>'
        : '<button type="button" class="lb-act alt" data-a="goto-mybooks">Open My Books</button>';
    }
    return '<div class="lb-rec"><div class="lb-bt">' + E(r.bookTitle) + '</div><div class="lb-bm">' +
      (STATUS_LABEL[r.status] || E(r.status)) + ' \u00B7 ' + extra + fineTxt + '</div>' + btn + '</div>';
  }

  async function myBooksHtml() {
    var d = await loadMe(), rs = d.records;
    if (!rs.length) return '<p>You haven\'t borrowed or requested any books yet. Tell me what you\'d like to read and I\'ll look it up.</p>';
    var active = rs.filter(isActive), pend = rs.filter(function (r) { return r.status === 'pending'; });
    var done = rs.filter(function (r) { return r.status === 'returned'; });
    var out = '';
    if (active.length) out += '<p><b>Borrowed (' + active.length + ')</b></p>' + active.map(function (r) { return recHtml(r, true); }).join('');
    if (pend.length) out += '<p style="margin-top:10px"><b>Pending (' + pend.length + ')</b></p>' + pend.map(function (r) { return recHtml(r); }).join('');
    if (done.length) out += '<p style="margin-top:10px"><b>Returned (' + done.length + ')</b>' + (done.length > 3 ? ' \u2014 latest 3' : '') + '</p>' +
      done.slice(-3).reverse().map(function (r) { return recHtml(r); }).join('');
    return out;
  }

  async function dueHtml() {
    var d = await loadMe();
    var active = d.records.filter(isActive).sort(function (a, b) { return String(a.dueDate).localeCompare(String(b.dueDate)); });
    var pend = d.records.filter(function (r) { return r.status === 'pending'; });
    if (!active.length) {
      return '<p>You have no borrowed books, so nothing is due.' + (pend.length ? ' ' + pend.length + ' request' + (pend.length > 1 ? 's are' : ' is') + ' still waiting for approval.' : '') + '</p>';
    }
    var late = active.filter(function (r) { return dayDiff(r.dueDate) < 0; }).length;
    return '<p>' + (late ? '<span class="lb-warn">' + late + ' overdue.</span> ' : '') + 'Your loans, soonest first:</p>' +
      active.map(function (r) { return recHtml(r, true); }).join('');
  }

  async function finesHtml() {
    var d = await loadMe();
    var owing = d.records.filter(function (r) { return r.status !== 'returned' && r.status !== 'pending' && fineOf(r) > 0; });
    var past = d.records.filter(function (r) { return r.status === 'returned' && fineOf(r) > 0; });
    var total = owing.reduce(function (s, r) { return s + fineOf(r); }, 0);
    var out = '';
    if (owing.length) {
      out += '<p class="lb-warn">Current fines: ' + PESO + total + '</p>' + owing.map(function (r) { return recHtml(r); }).join('') +
        '<p style="margin-top:8px">Return overdue books to the librarian as soon as you can \u2014 the fine grows by ' + PESO + finePerDay() + ' each day.</p>';
    } else {
      out += '<p>You have no fines on active loans right now. \uD83D\uDC4D</p>';
    }
    if (past.length) {
      var pt = past.reduce(function (s, r) { return s + fineOf(r); }, 0);
      out += '<p>Fines recorded on returned books: ' + PESO + pt + ' (' + past.length + ' book' + (past.length > 1 ? 's' : '') + '). Please confirm with the librarian whether these are settled.</p>';
    }
    return out + '<p>Reminder: late books are charged ' + PESO + finePerDay() + ' per day.</p>';
  }

  function score(query, title) {
    var qs = norm(query).split(' ').filter(Boolean), t = norm(title), hits = 0;
    qs.forEach(function (w) { if (t.indexOf(w) !== -1) hits++; });
    return qs.length ? hits / qs.length : 0;
  }
  async function renewHtml(query) {
    var d = await loadMe();
    var active = d.records.filter(isActive);
    if (!active.length) return '<p>You have no borrowed books to renew.</p>';
    var pool = active;
    if (query) {
      pool = active.map(function (r) { return { r: r, s: score(query, r.bookTitle) }; })
        .filter(function (x) { return x.s >= 0.5; }).sort(function (a, b) { return b.s - a.s; })
        .map(function (x) { return x.r; });
      if (!pool.length) return '<p>I couldn\'t find \u201c' + E(query) + '\u201d among your borrowed books. Say \u201cmy books\u201d to see them.</p>';
    }
    var ok = pool.filter(function (r) { return r.status === 'borrowed' && !r.renewed; });
    var out = '';
    if (ok.length) out += '<p>You can renew ' + (ok.length > 1 ? 'these' : 'this') + ':</p>' + ok.map(function (r) { return recHtml(r, true); }).join('');
    var blocked = pool.filter(function (r) { return ok.indexOf(r) === -1; });
    if (blocked.length) {
      out += '<p style="margin-top:8px">Can\'t be renewed:</p><ul>' + blocked.map(function (r) {
        return '<li>' + E(r.bookTitle) + ' \u2014 ' + (r.status === 'overdue' ? 'it\'s overdue; please return it to the librarian' : 'already renewed once') + '</li>';
      }).join('') + '</ul>';
    }
    return out;
  }

  async function waitlistHtml() {
    if (mode() !== 'api') return '<p>I can\'t read waitlists in this version of the portal. If it has one, it appears above the book list in <b>Browse Books</b>.</p>';
    var d = await loadMe();
    if (!d.waitlist.length) return '<p>You\'re not on any waitlists. If a book has no copies left, ask me about it and I can notify you when it\'s back.</p>';
    return '<p>Your waitlist:</p>' + d.waitlist.map(function (w) {
      return '<div class="lb-rec"><div class="lb-bt">' + E(w.title) + '</div><div class="lb-bm">' +
        (w.availableCopies > 0 ? '<b class="ok">Available now</b> \u2014 ask me to request it' : 'Waiting for a copy') + '</div>' +
        '<button type="button" class="lb-act alt" data-a="leave-wl" data-id="' + E(w.id) + '">Remove</button></div>';
    }).join('');
  }

  async function ensureCats() {
    if (cats) return;
    try {
      if (mode() === 'api') cats = (await api('GET', '/api/categories')).map(function (c) { return c.name; });
      else { var seen = {}; cats = []; localBooks().forEach(function (b) { if (b.category && !seen[b.category]) { seen[b.category] = 1; cats.push(b.category); } }); }
    } catch (e) { cats = []; }
  }

  function bookCard(b, my) {
    var avail = b.availableCopies > 0;
    var rec = my.records.filter(function (r) { return r.bookId === b.id && ['pending', 'borrowed', 'overdue'].indexOf(r.status) !== -1; })[0];
    var onWL = my.waitlist.some(function (w) { return w.bookId === b.id; });
    var btn;
    if (rec) btn = '<span class="lb-tag">' + (rec.status === 'pending' ? 'Request pending' : 'You already have this book') + '</span>';
    else if (mode() !== 'api') btn = '<button type="button" class="lb-act" data-a="goto-browse" data-t="' + E(b.title) + '">Open in Browse Books</button>';
    else if (avail) btn = '<button type="button" class="lb-act" data-a="ask-borrow" data-id="' + E(b.id) + '" data-t="' + E(b.title) + '">Request to borrow</button>';
    else if (onWL) btn = '<span class="lb-tag">On your waitlist</span>';
    else btn = '<button type="button" class="lb-act alt" data-a="waitlist" data-id="' + E(b.id) + '" data-t="' + E(b.title) + '">Notify me when available</button>';
    return '<div class="lb-book"><div class="lb-bt">' + E(b.title) + '</div><div class="lb-bm">by ' + E(b.author) + ' \u00B7 ' + E(b.category) + '</div>' +
      '<div class="lb-bm"><b class="' + (avail ? 'ok' : 'no') + '">' + b.availableCopies + '</b> of ' + b.totalCopies + ' available</div>' + btn + '</div>';
  }

  async function searchHtml(query, intro, silentIfEmpty) {
    await ensureCats();
    var q = query, category = '';
    var m = cats.filter(function (c) { var lc = c.toLowerCase(), lq = q.toLowerCase(); return lc === lq || lc === lq.replace(/s$/, ''); })[0];
    if (m) { category = m; q = ''; }
    var res = await findBooks(q, category);
    if (!res.items || !res.items.length) {
      if (silentIfEmpty) return '';
      return '<p>I couldn\'t find anything for \u201c' + E(query) + '\u201d. Try a different title, author or a category' + (cats.length ? ' (' + cats.map(E).join(', ') + ')' : '') + '.</p>';
    }
    var my; try { my = await loadMe(); } catch (e) { my = { records: [], waitlist: [] }; }
    var more = res.total > res.items.length ? '<p style="margin-top:8px">Showing ' + res.items.length + ' of ' + res.total + ' matches. Add more detail to narrow it down, or use <b>Browse Books</b>.</p>' : '';
    return '<p>' + intro + '</p>' + res.items.map(function (b) { return bookCard(b, my); }).join('') + more;
  }

  /* ------------------------------------------------------------------ button actions (always user-initiated) */
  async function onAction(e) {
    var btn = e.target.closest('button[data-a]'); if (!btn || btn.disabled) return;
    var a = btn.getAttribute('data-a'), id = btn.getAttribute('data-id'), title = btn.getAttribute('data-t') || 'this book';
    if (a === 'ask') { send(btn.getAttribute('data-q')); return; }
    if (a === 'goto-browse') { openBrowse(title); return; }
    if (a === 'goto-mybooks') { openMyBooks(); return; }
    if (a === 'ask-borrow') {
      addMsg('bot', '<p>Before requesting <b>' + E(title) + '</b>, please agree to the library rules:</p><ul>' +
        '<li>No writing, highlighting, folding or tearing.</li><li>Keep it away from food, drinks and moisture.</li>' +
        '<li>Return it by the due date \u2014 late books cost ' + PESO + finePerDay() + ' per day.</li>' +
        '<li>Lost or damaged books must be replaced or paid for.</li></ul>' +
        '<div class="lb-acts"><button type="button" class="lb-act" data-a="confirm-borrow" data-id="' + E(id) + '" data-t="' + E(title) + '">I agree \u2014 request it</button>' +
        '<button type="button" class="lb-act alt" data-a="cancel">Cancel</button></div>');
      return;
    }
    if (a === 'cancel') { lockGroup(btn); addMsg('bot', '<p>No problem, I\'ve cancelled that.</p>'); return; }

    btn.disabled = true;
    try {
      if (a === 'confirm-borrow') {
        lockGroup(btn);
        await api('POST', '/api/me/request', { bookId: Number(id) });
        addMsg('bot', '<p>Done! Your request for <b>' + E(title) + '</b> was sent to the librarian. I\'ll show it as <i>pending</i> until it\'s approved.</p>');
      } else if (a === 'waitlist') {
        await api('POST', '/api/me/waitlist', { bookId: Number(id) });
        addMsg('bot', '<p>You\'re on the waitlist for <b>' + E(title) + '</b>. You\'ll be notified when a copy is back.</p>');
      } else if (a === 'leave-wl') {
        await api('DELETE', '/api/me/waitlist/' + id);
        addMsg('bot', '<p>Removed from your waitlist.</p>');
      } else if (a === 'renew') {
        var r = await api('POST', '/api/me/records/' + id + '/renew');
        addMsg('bot', '<p>Renewed! Your new due date is <b>' + E(fmtDate(r && r.dueDate)) + '</b>.</p>');
      }
      refreshPortal();
    } catch (err) {
      btn.disabled = false;
      var msg = (err && err.message) || 'Request failed';
      addMsg('bot', '<p>' + (err && err.status === 409 ? 'I couldn\'t do that: ' : 'Sorry, something went wrong: ') + E(msg) + '</p>');
    }
  }
  function lockGroup(btn) {
    var g = btn.closest('.lb-acts'); if (!g) return;
    g.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
  }

  /* ------------------------------------------------------------------ start */
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();