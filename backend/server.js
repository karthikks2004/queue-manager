const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'queueflow_rugas_2024_jwt_secret';

app.use(cors());
app.use(express.json());

// DB setup — WAL mode for better concurrent reads
// Built-in node:sqlite (no native compile needed); small shim keeps the better-sqlite3-style API
const db = new DatabaseSync(path.join(__dirname, 'queue.db'));
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

// Seed default admin
const existing = db.prepare('SELECT id FROM managers WHERE username = ?').get('admin');
if (!existing) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO managers (username, password) VALUES (?, ?)').run('admin', hash);
  console.log('Default admin created: admin / admin123');
}

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
app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  try {
    const hash = bcrypt.hashSync(password, 10);
    const r = db.prepare('INSERT INTO managers (username, password) VALUES (?, ?)').run(username, hash);
    res.json({ id: r.lastInsertRowid, username });
  } catch { res.status(400).json({ error: 'Username already exists' }); }
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const manager = db.prepare('SELECT * FROM managers WHERE username = ?').get(username);
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
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Queue name required' });
  const r = db.prepare('INSERT INTO queues (name, description, manager_id) VALUES (?, ?, ?)')
    .run(name, description || '', req.manager.id);
  const q = { id: r.lastInsertRowid, name, description: description || '', manager_id: req.manager.id,
    waiting_count: 0, served_count: 0, cancelled_count: 0 };
  broadcast(req.manager.id, 'queue_created', q);
  res.json(q);
});

app.put('/api/queues/:id', auth, (req, res) => {
  const queue = db.prepare('SELECT * FROM queues WHERE id=? AND manager_id=?').get(req.params.id, req.manager.id);
  if (!queue) return res.status(404).json({ error: 'Queue not found' });
  const { name, description } = req.body;
  db.prepare('UPDATE queues SET name=?, description=? WHERE id=?')
    .run(name || queue.name, description ?? queue.description, req.params.id);
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
  const tokens = db.prepare(`
    SELECT * FROM tokens WHERE queue_id=? AND status!='waiting'
    ORDER BY COALESCE(served_at, created_at) DESC LIMIT 50
  `).all(req.params.id);
  res.json(tokens);
});

app.post('/api/queues/:id/tokens', auth, (req, res) => {
  const { person_name, phone, priority, notes } = req.body;
  if (!person_name) return res.status(400).json({ error: 'Person name required' });
  const queue = db.prepare('SELECT * FROM queues WHERE id=? AND manager_id=?').get(req.params.id, req.manager.id);
  if (!queue) return res.status(404).json({ error: 'Queue not found' });

  const maxRow = db.prepare(`SELECT MAX(position) as mp FROM tokens WHERE queue_id=? AND status='waiting'`).get(req.params.id);
  const position = (maxRow?.mp || 0) + 1;
  const ts = String(Date.now()).slice(-4);
  const token_number = `${queue.name.substring(0,2).toUpperCase()}${ts}-${String(position).padStart(3,'0')}`;

  const r = db.prepare(
    'INSERT INTO tokens (token_number, person_name, phone, queue_id, position, priority, notes) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(token_number, person_name, phone || '', req.params.id, position, priority || 0, notes || '');

  const token = { id: r.lastInsertRowid, token_number, person_name, phone: phone||'', queue_id: +req.params.id,
    position, status: 'waiting', priority: priority||0, notes: notes||'', created_at: new Date().toISOString() };
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
    db.prepare(`UPDATE tokens SET status='cancelled' WHERE id=?`).run(token.id);
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
    SELECT strftime('%H:00', t.created_at, 'localtime') as hour,
           COUNT(*) as tokens_added,
           COUNT(CASE WHEN t.status='served' THEN 1 END) as served
    FROM tokens t JOIN queues q ON q.id=t.queue_id
    WHERE q.manager_id=? AND t.created_at >= datetime('now','-24 hours')
    GROUP BY hour ORDER BY hour ASC
  `).all(mid);

  res.json({ summary, queueStats, hourlyTrend });
  } catch (err) {
    console.error('Analytics error:', err.message);
    res.status(500).json({ error: 'Analytics query failed' });
  }
});

app.listen(PORT, () => console.log(`QueueFlow backend running on http://localhost:${PORT}`));
