const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const app = express();
const port = process.env.PORT || 3000;
const dbPath = path.join(__dirname, "data", "tracker.db");
const dbDir = path.dirname(dbPath);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin");
  } else {
    res.header("Access-Control-Allow-Origin", "*");
  }
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Accept");
  res.header("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.header("Pragma", "no-cache");
  res.header("Expires", "0");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS stallions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_records_user_id ON records(user_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_stallions_user_id ON stallions(user_id);
`);

app.use(express.json());
app.use((req, res, next) => {
  const isAsset = req.path === "/" || req.path === "/index.html" || req.path.endsWith(".html") || req.path.endsWith(".js") || req.path.endsWith(".css");
  if (isAsset) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }
  next();
});
app.use(express.static(__dirname));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "horse-breeding-tracker-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: "lax" },
  })
);

function requireAuth(req, res, next) {
  if (req.session.userId) {
    return next();
  }
  res.status(401).json({ error: "Please log in first." });
}

app.get("/api/auth/status", (req, res) => {
  if (!req.session.userId) {
    return res.json({ authenticated: false });
  }

  const user = db.prepare("SELECT id, username FROM users WHERE id = ?").get(req.session.userId);
  if (!user) {
    req.session.destroy(() => res.json({ authenticated: false }));
    return;
  }

  res.json({ authenticated: true, user });
});

app.post("/api/register", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "Please provide a username and password." });
  }

  try {
    const passwordHash = bcrypt.hashSync(password, 10);
    const result = db.prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)").run(username.trim(), passwordHash);
    req.session.userId = result.lastInsertRowid;
    res.json({ user: { id: result.lastInsertRowid, username: username.trim() } });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({ error: "That username is already taken." });
    }
    res.status(500).json({ error: "Unable to create account." });
  }
});

app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "Please provide a username and password." });
  }

  const user = db.prepare("SELECT id, username, password_hash FROM users WHERE username = ?").get(username.trim());
  if (!user) {
    return res.status(401).json({ error: "User not found. Please create an account." });
  }
  if (!bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Incorrect password." });
  }

  req.session.userId = user.id;
  res.json({ user: { id: user.id, username: user.username } });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/records", requireAuth, (req, res) => {
  const row = db.prepare("SELECT payload FROM records WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1").get(req.session.userId);
  const records = row ? JSON.parse(row.payload) : [];
  res.json({ records });
});

app.post("/api/records", requireAuth, (req, res) => {
  const payload = JSON.stringify(req.body || []);
  db.prepare("INSERT INTO records (user_id, payload, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET payload = excluded.payload, updated_at = CURRENT_TIMESTAMP")
    .run(req.session.userId, payload);
  res.json({ ok: true });
});

app.get("/api/stallions", requireAuth, (req, res) => {
  const row = db.prepare("SELECT payload FROM stallions WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1").get(req.session.userId);
  const stallions = row ? JSON.parse(row.payload) : [];
  res.json({ stallions });
});

app.post("/api/stallions", requireAuth, (req, res) => {
  const payload = JSON.stringify(req.body || []);
  db.prepare("INSERT INTO stallions (user_id, payload, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET payload = excluded.payload, updated_at = CURRENT_TIMESTAMP")
    .run(req.session.userId, payload);
  res.json({ ok: true });
});

app.get("*", (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("X-App-Version", "20260803-7");
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
