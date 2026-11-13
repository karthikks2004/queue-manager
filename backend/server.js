const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || require('crypto').randomBytes(32).toString('hex');

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '10kb' }));

// Basic security headers
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
  });
  next();
});

// Small in-memory rate limiter (per IP) to slow down password guessing
function rateLimit(max, windowMs) {
  const hits = new Map();
  setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (v.reset < now) hits.delete(k); }, windowMs).unref();
  return (req, res, next) => {
    const now = Date.now();
    const rec = hits.get(req.ip);
    if (!rec || rec.reset < now) { hits.set(req.ip, { n: 1, reset: now + windowMs }); return next(); }
    if (++rec.n > max) return res.status(429).json({ error: 'Too many attempts. Please wait a few minutes and try again.' });
    next();
  };
}

// Input helpers
const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// DB setup — WAL mode for better concurrent reads
// Built-in node:sqlite (no native compile needed); small shim keeps the better-sqlite3-style API
const db = new DatabaseSync(process.env.DB_PATH || path.join(__dirname, 'queue.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
db.transaction = (fn) => () => {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
};

// Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS managers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS queues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    manager_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (manager_id) REFERENCES managers(id)
  );
  CREATE TABLE IF NOT EXISTS tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token_number TEXT NOT NULL,
    person_name TEXT NOT NULL,
    phone TEXT DEFAULT '',
    queue_id INTEGER NOT NULL,
    position INTEGER NOT NULL,
    status TEXT DEFAULT 'waiting',
    priority INTEGER DEFAULT 0,
    notes TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    served_at DATETIME,
    wait_time_seconds INTEGER,
    FOREIGN KEY (queue_id) REFERENCES queues(id)
  );
`);

// Migration: remember when a token was cancelled (needed for the queue-length trend)
try { db.exec('ALTER TABLE tokens ADD COLUMN cancelled_at DATETIME'); } catch { /* column already exists */ }

// Seed default admin
const existing = db.prepare('SELECT id FROM managers WHERE username = ?').get('admin');
if (!existing) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO managers (username, password) VALUES (?, ?)').run('admin', hash);
  console.log('Default admin created: admin / admin123');
}


// Demo data so a fresh deployment is never empty (a realistic day of history plus a live line)
(function seedDemo() {
  const admin = db.prepare('SELECT id FROM managers WHERE username = ?').get('admin');
  if (!admin || db.prepare('SELECT COUNT(*) c FROM queues WHERE manager_id=?').get(admin.id).c > 0) return;
  const mkQ = db.prepare('INSERT INTO queues (name, description, manager_id) VALUES (?, ?, ?)');
  const mkT = db.prepare(`INSERT INTO tokens (token_number, person_name, phone, queue_id, position, status, priority, created_at, served_at, wait_time_seconds, cancelled_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', ?), ${'CASE WHEN ? IS NULL THEN NULL ELSE datetime(\'now\', ?) END'}, ?, ${'CASE WHEN ? IS NULL THEN NULL ELSE datetime(\'now\', ?) END'})`);
  // [minutes ago it joined, name, outcome ('s' served, 'c' cancelled, 'w' waiting), minutes it waited, VIP]
  const data = [
    ['Hospital Reception', 'Main hospital OPD queue', [
      [240, 'Anil Kumar', 's', 12], [225, 'Sreeja Nair', 's', 18], [210, 'Mohan Das', 's', 15], [195, 'Fathima K', 's', 22],
      [180, 'George Mathew', 's', 10], [165, 'Lakshmi P', 'c', 8], [150, 'Rafi Ahmed', 's', 20], [135, 'Divya S', 's', 14],
      [120, 'Joseph T', 's', 19], [105, 'Anitha R', 's', 11], [90, 'Sanjay M', 's', 17], [75, 'Rahul Kumar', 's', 15],
      [60, 'Priya Sharma', 's', 13], [40, 'Ankit Singh', 'w'], [30, 'Deepa Nair', 'w', 0, 1], [22, 'Vikram Patel', 'w'], [10, 'Meera Joshi', 'w'],
    ]],
    ['Bank Counter', 'Main branch services', [
      [300, 'Haris V', 's', 11], [270, 'Neethu B', 's', 16], [240, 'Abdul Salam', 's', 14], [200, 'Remya K', 's', 19],
      [160, 'Vineeth C', 's', 12], [120, 'Suresh Menon', 's', 18], [45, 'Kavita Rao', 'w'], [20, 'Arjun Das', 'w'],
    ]],
    ['Service Desk', 'Vehicle registration and licence', []],
  ];
  data.forEach(([name, desc, people]) => {
    const qid = mkQ.run(name, desc, admin.id).lastInsertRowid;
    const prefix = name.replace(/[^A-Za-z0-9]/g, '').substring(0, 2).toUpperCase();
    // Waiting people: VIPs first, then by arrival (same rule the app applies to new tokens)
    const order = people.map((p, i) => ({ i, p })).filter((x) => x.p[2] === 'w')
      .sort((x, y) => (y.p[4] || 0) - (x.p[4] || 0) || y.p[0] - x.p[0]);
    const posOf = new Map(order.map((x, k) => [x.i, k + 1]));
    people.forEach(([ago, person, outcome, waited = 0, vip = 0], i) => {
      const num = `${prefix}-${String(i + 1).padStart(3, '0')}`;
      const phone = '98765432' + String(10 + i).padStart(2, '0');
      const created = `-${ago} minutes`;
      const doneAt = outcome === 's' ? `-${ago - waited} minutes` : outcome === 'c' ? `-${ago - 5} minutes` : null;
      mkT.run(num, person, phone, qid, outcome === 'w' ? posOf.get(i) : 0,
        outcome === 's' ? 'served' : outcome === 'c' ? 'cancelled' : 'waiting', vip, created,
        outcome === 's' ? 1 : null, outcome === 's' ? doneAt : null, outcome === 's' ? waited * 60 : null,
        outcome === 'c' ? 1 : null, outcome === 'c' ? doneAt : null);
    });
  });
})();

// ── SSE ───────────────────────────────────────────────────
const sseClients = new Map(); // managerId -> Set<res>

function broadcast(managerId, event, data) {
  const clients = sseClients.get(managerId);
  if (!clients) return;
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) { try { res.write(msg); } catch {} }
}

app.get('/api/events', (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(401).end();
  let manager;
  try { manager = jwt.verify(token, JWT_SECRET); } catch { return res.status(401).end(); }

  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
  res.flushHeaders();
  res.write('data: {"type":"connected"}\n\n');

  if (!sseClients.has(manager.id)) sseClients.set(manager.id, new Set());
  sseClients.get(manager.id).add(res);

  const ping = setInterval(() => { try { res.write(':ping\n\n'); } catch {} }, 25000);
  req.on('close', () => {
    clearInterval(ping);
    sseClients.get(manager.id)?.delete(res);
  });
});

// ── Auth middleware ───────────────────────────────────────
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try { req.manager = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid token' }); }
}

// ── Auth ──────────────────────────────────────────────────
app.post('/api/register', rateLimit(15, 10 * 60 * 1000), (req, res) => {
  const username = clean(req.body?.username, 30);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  if (username.length < 3) return res.status(400).json({ error: 'Username needs at least 3 characters' });
  if (!/^[A-Za-z0-9._-]+$/.test(username)) return res.status(400).json({ error: 'Username can use letters, numbers, dot, dash and underscore only' });
  if (password.length < 6) return res.status(400).json({ error: 'Password needs at least 6 characters' });
  if (password.length > 72) return res.status(400).json({ error: 'Password is too long (max 72 characters)' });
  if (db.prepare('SELECT id FROM managers WHERE lower(username) = lower(?)').get(username))
    return res.status(400).json({ error: 'Username already exists' });
  try {
    const hash = bcrypt.hashSync(password, 10);
    const r = db.prepare('INSERT INTO managers (username, password) VALUES (?, ?)').run(username, hash);
    res.json({ id: r.lastInsertRowid, username });
  } catch { res.status(400).json({ error: 'Username already exists' }); }
});

app.post('/api/login', rateLimit(40, 10 * 60 * 1000), (req, res) => {
  const username = clean(req.body?.username, 30);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  const manager = db.prepare('SELECT * FROM managers WHERE lower(username) = lower(?)').get(username);
  if (!manager || !bcrypt.compareSync(password, manager.password))
    return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ id: manager.id, username: manager.username }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, username: manager.username, id: manager.id });
});

// ── Queues ────────────────────────────────────────────────
app.get('/api/queues', auth, (req, res) => {
  const queues = db.prepare(`
    SELECT q.*,
      COUNT(CASE WHEN t.status='waiting' THEN 1 END) as waiting_count,
      COUNT(CASE WHEN t.status='served' THEN 1 END) as served_count,
      COUNT(CASE WHEN t.status='cancelled' THEN 1 END) as cancelled_count
    FROM queues q LEFT JOIN tokens t ON t.queue_id = q.id
    WHERE q.manager_id = ?
    GROUP BY q.id ORDER BY q.created_at DESC
  `).all(req.manager.id);
  res.json(queues);
});

app.post('/api/queues', auth, (req, res) => {
  const name = clean(req.body?.name, 60);
  const description = clean(req.body?.description, 200);
  if (!name) return res.status(400).json({ error: 'Queue name required' });
  const r = db.prepare('INSERT INTO queues (name, description, manager_id) VALUES (?, ?, ?)')
    .run(name, description, req.manager.id);
  const q = { id: r.lastInsertRowid, name, description, manager_id: req.manager.id,
    waiting_count: 0, served_count: 0, cancelled_count: 0 };
  broadcast(req.manager.id, 'queue_created', q);
  res.json(q);
});

app.put('/api/queues/:id', auth, (req, res) => {
  const queue = db.prepare('SELECT * FROM queues WHERE id=? AND manager_id=?').get(req.params.id, req.manager.id);
  if (!queue) return res.status(404).json({ error: 'Queue not found' });
  const name = clean(req.body?.name, 60);
  const description = typeof req.body?.description === 'string' ? clean(req.body.description, 200) : queue.description;
  db.prepare('UPDATE queues SET name=?, description=? WHERE id=?')
    .run(name || queue.name, description, req.params.id);
  broadcast(req.manager.id, 'queue_updated', { id: +req.params.id });
  res.json({ success: true });
});

app.delete('/api/queues/:id', auth, (req, res) => {
  const queue = db.prepare('SELECT * FROM queues WHERE id=? AND manager_id=?').get(req.params.id, req.manager.id);
  if (!queue) return res.status(404).json({ error: 'Queue not found' });
  db.prepare('DELETE FROM tokens WHERE queue_id=?').run(req.params.id);
  db.prepare('DELETE FROM queues WHERE id=?').run(req.params.id);
  broadcast(req.manager.id, 'queue_deleted', { id: +req.params.id });
  res.json({ success: true });
});

// ── Tokens ────────────────────────────────────────────────
app.get('/api/queues/:id/tokens', auth, (req, res) => {
  const queue = db.prepare('SELECT * FROM queues WHERE id=? AND manager_id=?').get(req.params.id, req.manager.id);
  if (!queue) return res.status(404).json({ error: 'Queue not found' });
  const tokens = db.prepare(`SELECT * FROM tokens WHERE queue_id=? AND status='waiting' ORDER BY position ASC`).all(req.params.id);
  res.json(tokens);
});

app.get('/api/queues/:id/tokens/history', auth, (req, res) => {
  const owned = db.prepare('SELECT id FROM queues WHERE id=? AND manager_id=?').get(req.params.id, req.manager.id);
  if (!owned) return res.status(404).json({ error: 'Queue not found' });
  const tokens = db.prepare(`
    SELECT * FROM tokens WHERE queue_id=? AND status!='waiting'
    ORDER BY COALESCE(served_at, created_at) DESC LIMIT 50
  `).all(req.params.id);
  res.json(tokens);
});

app.post('/api/queues/:id/tokens', auth, (req, res) => {
  const person_name = clean(req.body?.person_name, 80);
  const phone = clean(req.body?.phone, 20);
  const notes = clean(req.body?.notes, 200);
  const priority = Number(req.body?.priority) > 0 ? 1 : 0;
  if (!person_name) return res.status(400).json({ error: 'Person name required' });
  if (phone && !/^[0-9+\-() ]{4,20}$/.test(phone)) return res.status(400).json({ error: 'Phone can use digits, +, - and brackets only' });
  const queue = db.prepare('SELECT * FROM queues WHERE id=? AND manager_id=?').get(req.params.id, req.manager.id);
  if (!queue) return res.status(404).json({ error: 'Queue not found' });

  let token;
  db.transaction(() => {
    // VIP guests join after the last VIP already waiting; everyone else joins at the end.
    let position;
    if (priority) {
      const lastVip = db.prepare(`SELECT MAX(position) mp FROM tokens WHERE queue_id=? AND status='waiting' AND priority>0`).get(queue.id).mp || 0;
      position = lastVip + 1;
      db.prepare(`UPDATE tokens SET position = position + 1 WHERE queue_id=? AND status='waiting' AND position >= ?`).run(queue.id, position);
    } else {
      position = (db.prepare(`SELECT MAX(position) mp FROM tokens WHERE queue_id=? AND status='waiting'`).get(queue.id).mp || 0) + 1;
    }
    const issued = db.prepare('SELECT COUNT(*) c FROM tokens WHERE queue_id=?').get(queue.id).c + 1;
    const prefix = (queue.name.replace(/[^A-Za-z0-9]/g, '').substring(0, 2) || 'Q').toUpperCase();
    const token_number = `${prefix}-${String(issued).padStart(3, '0')}`;
    const r = db.prepare(
      'INSERT INTO tokens (token_number, person_name, phone, queue_id, position, priority, notes) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(token_number, person_name, phone, queue.id, position, priority, notes);
    token = { id: r.lastInsertRowid, token_number, person_name, phone, queue_id: queue.id,
      position, status: 'waiting', priority, notes, created_at: new Date().toISOString() };
  })();
  broadcast(req.manager.id, 'token_added', token);
  res.json(token);
});

app.patch('/api/tokens/:id/move-up', auth, (req, res) => {
  const token = db.prepare(`SELECT t.* FROM tokens t JOIN queues q ON q.id=t.queue_id WHERE t.id=? AND q.manager_id=? AND t.status='waiting'`).get(req.params.id, req.manager.id);
  if (!token) return res.status(404).json({ error: 'Token not found' });
  if (token.position <= 1) return res.status(400).json({ error: 'Already at top' });
  const above = db.prepare(`SELECT * FROM tokens WHERE queue_id=? AND position=? AND status='waiting'`).get(token.queue_id, token.position - 1);
  const swap = db.transaction(() => {
    if (above) db.prepare('UPDATE tokens SET position=? WHERE id=?').run(token.position, above.id);
    db.prepare('UPDATE tokens SET position=? WHERE id=?').run(token.position - 1, token.id);
  });
  swap();
  broadcast(req.manager.id, 'queue_changed', { queue_id: token.queue_id });
  res.json({ success: true });
});

app.patch('/api/tokens/:id/move-down', auth, (req, res) => {
  const token = db.prepare(`SELECT t.* FROM tokens t JOIN queues q ON q.id=t.queue_id WHERE t.id=? AND q.manager_id=? AND t.status='waiting'`).get(req.params.id, req.manager.id);
  if (!token) return res.status(404).json({ error: 'Token not found' });
  const maxRow = db.prepare(`SELECT MAX(position) as mp FROM tokens WHERE queue_id=? AND status='waiting'`).get(token.queue_id);
  if (token.position >= maxRow?.mp) return res.status(400).json({ error: 'Already at bottom' });
  const below = db.prepare(`SELECT * FROM tokens WHERE queue_id=? AND position=? AND status='waiting'`).get(token.queue_id, token.position + 1);
  const swap = db.transaction(() => {
    if (below) db.prepare('UPDATE tokens SET position=? WHERE id=?').run(token.position, below.id);
    db.prepare('UPDATE tokens SET position=? WHERE id=?').run(token.position + 1, token.id);
  });
  swap();
  broadcast(req.manager.id, 'queue_changed', { queue_id: token.queue_id });
  res.json({ success: true });
});

app.patch('/api/tokens/:id/serve', auth, (req, res) => {
  const token = db.prepare(`SELECT t.* FROM tokens t JOIN queues q ON q.id=t.queue_id WHERE t.id=? AND q.manager_id=? AND t.status='waiting'`).get(req.params.id, req.manager.id);
  if (!token) return res.status(404).json({ error: 'Token not found' });
  const waitSeconds = Math.round((Date.now() - new Date(token.created_at.replace(' ','T')+'Z').getTime()) / 1000);
  const serve = db.transaction(() => {
    db.prepare(`UPDATE tokens SET status='served', served_at=CURRENT_TIMESTAMP, wait_time_seconds=? WHERE id=?`).run(waitSeconds, token.id);
    const remaining = db.prepare(`SELECT id FROM tokens WHERE queue_id=? AND status='waiting' ORDER BY position ASC`).all(token.queue_id);
    remaining.forEach((t, i) => db.prepare('UPDATE tokens SET position=? WHERE id=?').run(i + 1, t.id));
  });
  serve();
  broadcast(req.manager.id, 'token_served', { id: token.id, queue_id: token.queue_id, wait_time_seconds: waitSeconds });
  res.json({ success: true, wait_time_seconds: waitSeconds });
});

app.patch('/api/tokens/:id/cancel', auth, (req, res) => {
  const token = db.prepare(`SELECT t.* FROM tokens t JOIN queues q ON q.id=t.queue_id WHERE t.id=? AND q.manager_id=? AND t.status='waiting'`).get(req.params.id, req.manager.id);
  if (!token) return res.status(404).json({ error: 'Token not found' });
  const cancel = db.transaction(() => {
    db.prepare(`UPDATE tokens SET status='cancelled', cancelled_at=CURRENT_TIMESTAMP WHERE id=?`).run(token.id);
    const remaining = db.prepare(`SELECT id FROM tokens WHERE queue_id=? AND status='waiting' ORDER BY position ASC`).all(token.queue_id);
    remaining.forEach((t, i) => db.prepare('UPDATE tokens SET position=? WHERE id=?').run(i + 1, t.id));
  });
  cancel();
  broadcast(req.manager.id, 'token_cancelled', { id: token.id, queue_id: token.queue_id });
  res.json({ success: true });
});

// ── Analytics ─────────────────────────────────────────────
app.get('/api/analytics', auth, (req, res) => {
  try {
  const mid = req.manager.id;
  const summary = {
    totalQueues: db.prepare('SELECT COUNT(*) as c FROM queues WHERE manager_id=?').get(mid).c,
    totalTokens: db.prepare(`SELECT COUNT(*) as c FROM tokens t JOIN queues q ON q.id=t.queue_id WHERE q.manager_id=?`).get(mid).c,
    served: db.prepare(`SELECT COUNT(*) as c FROM tokens t JOIN queues q ON q.id=t.queue_id WHERE q.manager_id=? AND t.status='served'`).get(mid).c,
    waiting: db.prepare(`SELECT COUNT(*) as c FROM tokens t JOIN queues q ON q.id=t.queue_id WHERE q.manager_id=? AND t.status='waiting'`).get(mid).c,
    cancelled: db.prepare(`SELECT COUNT(*) as c FROM tokens t JOIN queues q ON q.id=t.queue_id WHERE q.manager_id=? AND t.status='cancelled'`).get(mid).c,
    avgWaitSeconds: Math.round(db.prepare(`SELECT AVG(wait_time_seconds) as a FROM tokens t JOIN queues q ON q.id=t.queue_id WHERE q.manager_id=? AND t.status='served' AND t.wait_time_seconds IS NOT NULL`).get(mid).a || 0),
  };

  const queueStats = db.prepare(`
    SELECT q.name, q.id,
      COUNT(CASE WHEN t.status='waiting' THEN 1 END) as waiting,
      COUNT(CASE WHEN t.status='served' THEN 1 END) as served,
      COUNT(CASE WHEN t.status='cancelled' THEN 1 END) as cancelled,
      AVG(CASE WHEN t.status='served' THEN t.wait_time_seconds END) as avg_wait
    FROM queues q LEFT JOIN tokens t ON t.queue_id=q.id
    WHERE q.manager_id=? GROUP BY q.id ORDER BY q.created_at DESC
  `).all(mid);

  const hourlyTrend = db.prepare(`
    SELECT strftime('%Y-%m-%dT%H:00:00Z', t.created_at) as hour,
           COUNT(*) as tokens_added,
           COUNT(CASE WHEN t.status='served' THEN 1 END) as served
    FROM tokens t JOIN queues q ON q.id=t.queue_id
    WHERE q.manager_id=? AND t.created_at >= datetime('now','-24 hours')
    GROUP BY hour ORDER BY hour ASC
  `).all(mid);

  // Queue length over the last 24 hours: how many people were waiting at the end of each hour.
  const rows = db.prepare(`
    SELECT t.created_at, t.served_at, t.cancelled_at
    FROM tokens t JOIN queues q ON q.id=t.queue_id
    WHERE q.manager_id=? AND (t.created_at >= datetime('now','-48 hours') OR t.status='waiting')
  `).all(mid);
  const ms = (v) => (v ? new Date(String(v).replace(' ', 'T') + 'Z').getTime() : null);
  const spans = rows.map((r) => ({ from: ms(r.created_at), to: ms(r.served_at) ?? ms(r.cancelled_at) }));
  const nowMs = Date.now();
  const lengthTrend = [];
  for (let i = 23; i >= 0; i--) {
    const t = i === 0 ? nowMs : new Date(nowMs - i * 3600_000).setMinutes(0, 0, 0);
    const length = spans.filter((s) => s.from <= t && (s.to === null || s.to > t)).length;
    lengthTrend.push({ at: new Date(t).toISOString(), length });
  }

  res.json({ summary, queueStats, hourlyTrend, lengthTrend });
  } catch (err) {
    console.error('Analytics error:', err.message);
    res.status(500).json({ error: 'Analytics query failed' });
  }
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Serve built frontend (production)
app.use(express.static(path.join(__dirname, '../frontend/dist')));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

// JSON errors instead of HTML stack traces (bad JSON body, unexpected failures)
app.use((err, req, res, next) => {
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid request body' });
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large' });
  console.error('Server error:', err?.message);
  res.status(500).json({ error: 'Something went wrong' });
});

app.listen(PORT, () => console.log(`QueueFlow backend running on http://localhost:${PORT}`));
