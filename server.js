const express = require("express");
const initSqlJs = require("sql.js");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();
const JWT_SECRET = "supersecretkey123";
const DB_PATH = path.join(__dirname, "taskmanager.db");

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ─── DATABASE SETUP ────────────────────────────────────────────────────────────
let db;

function saveDb() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function run(sql, params = []) {
  db.run(sql, params);
  saveDb();
}

function get(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

async function initDb() {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'member',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      owner_id INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS project_members (
      project_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      PRIMARY KEY (project_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'todo',
      priority TEXT DEFAULT 'medium',
      project_id INTEGER NOT NULL,
      assigned_to INTEGER,
      created_by INTEGER NOT NULL,
      due_date TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  saveDb();
}

// ─── AUTH MIDDLEWARE ───────────────────────────────────────────────────────────
function auth(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token provided" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== "admin")
    return res.status(403).json({ error: "Admin access required" });
  next();
}

// ─── AUTH ROUTES ──────────────────────────────────────────────────────────────
app.post("/api/signup", (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ error: "Name, email and password required" });
  if (password.length < 6)
    return res.status(400).json({ error: "Password must be at least 6 characters" });

  const existing = get("SELECT id FROM users WHERE email = ?", [email]);
  if (existing) return res.status(400).json({ error: "Email already registered" });

  const hash = bcrypt.hashSync(password, 10);
  const safeRole = role === "admin" ? "admin" : "member";
  run("INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)", [name, email, hash, safeRole]);
  const user = get("SELECT id, name, email, role FROM users WHERE email = ?", [email]);
  const token = jwt.sign(user, JWT_SECRET, { expiresIn: "7d" });
  res.json({ token, user });
});

app.post("/api/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "Email and password required" });

  const user = get("SELECT * FROM users WHERE email = ?", [email]);
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: "Invalid email or password" });

  const payload = { id: user.id, name: user.name, email: user.email, role: user.role };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
  res.json({ token, user: payload });
});

// ─── USER ROUTES ──────────────────────────────────────────────────────────────
app.get("/api/users", auth, (req, res) => {
  res.json(all("SELECT id, name, email, role, created_at FROM users"));
});

// ─── PROJECT ROUTES ───────────────────────────────────────────────────────────
app.get("/api/projects", auth, (req, res) => {
  let projects;
  if (req.user.role === "admin") {
    projects = all(`SELECT p.*, u.name as owner_name FROM projects p 
                    JOIN users u ON p.owner_id = u.id ORDER BY p.created_at DESC`);
  } else {
    projects = all(
      `SELECT p.*, u.name as owner_name FROM projects p 
       JOIN users u ON p.owner_id = u.id
       WHERE p.owner_id = ? OR p.id IN (SELECT project_id FROM project_members WHERE user_id = ?)
       ORDER BY p.created_at DESC`,
      [req.user.id, req.user.id]
    );
  }

  projects = projects.map((p) => {
    const members = all(
      `SELECT u.id, u.name, u.email, u.role FROM users u
       JOIN project_members pm ON u.id = pm.user_id WHERE pm.project_id = ?`,
      [p.id]
    );
    const taskStats = all(
      "SELECT status, COUNT(*) as count FROM tasks WHERE project_id = ? GROUP BY status",
      [p.id]
    );
    return { ...p, members, taskStats };
  });

  res.json(projects);
});

app.post("/api/projects", auth, adminOnly, (req, res) => {
  const { name, description, memberIds } = req.body;
  if (!name) return res.status(400).json({ error: "Project name required" });

  run("INSERT INTO projects (name, description, owner_id) VALUES (?, ?, ?)", [name, description || "", req.user.id]);
  const project = get("SELECT id FROM projects WHERE owner_id = ? ORDER BY id DESC LIMIT 1", [req.user.id]);
  const projectId = project.id;

  if (memberIds && memberIds.length)
    memberIds.forEach((uid) =>
      run("INSERT OR IGNORE INTO project_members (project_id, user_id) VALUES (?, ?)", [projectId, uid])
    );
  run("INSERT OR IGNORE INTO project_members (project_id, user_id) VALUES (?, ?)", [projectId, req.user.id]);

  res.json({ id: projectId, name, description, owner_id: req.user.id });
});

app.put("/api/projects/:id", auth, adminOnly, (req, res) => {
  const { name, description, memberIds } = req.body;
  const { id } = req.params;
  if (!name) return res.status(400).json({ error: "Project name required" });

  run("UPDATE projects SET name = ?, description = ? WHERE id = ?", [name, description || "", id]);

  if (memberIds !== undefined) {
    run("DELETE FROM project_members WHERE project_id = ?", [id]);
    memberIds.forEach((uid) =>
      run("INSERT OR IGNORE INTO project_members (project_id, user_id) VALUES (?, ?)", [id, uid])
    );
    run("INSERT OR IGNORE INTO project_members (project_id, user_id) VALUES (?, ?)", [id, req.user.id]);
  }

  res.json({ success: true });
});

app.delete("/api/projects/:id", auth, adminOnly, (req, res) => {
  const { id } = req.params;
  run("DELETE FROM tasks WHERE project_id = ?", [id]);
  run("DELETE FROM project_members WHERE project_id = ?", [id]);
  run("DELETE FROM projects WHERE id = ?", [id]);
  res.json({ success: true });
});

// ─── TASK ROUTES ──────────────────────────────────────────────────────────────
app.get("/api/tasks", auth, (req, res) => {
  const { project_id, status } = req.query;
  let query = `SELECT t.*, u.name as assigned_name, p.name as project_name, c.name as creator_name
               FROM tasks t
               LEFT JOIN users u ON t.assigned_to = u.id
               LEFT JOIN projects p ON t.project_id = p.id
               LEFT JOIN users c ON t.created_by = c.id
               WHERE 1=1`;
  const params = [];

  if (req.user.role !== "admin") {
    query += ` AND (t.assigned_to = ${req.user.id} OR t.created_by = ${req.user.id}
               OR t.project_id IN (SELECT project_id FROM project_members WHERE user_id = ${req.user.id}))`;
  }
  if (project_id) { query += " AND t.project_id = ?"; params.push(project_id); }
  if (status) { query += " AND t.status = ?"; params.push(status); }
  query += " ORDER BY t.created_at DESC";

  res.json(all(query, params));
});

app.post("/api/tasks", auth, (req, res) => {
  const { title, description, project_id, assigned_to, due_date, priority } = req.body;
  if (!title || !project_id)
    return res.status(400).json({ error: "Title and project are required" });

  const project = get("SELECT * FROM projects WHERE id = ?", [project_id]);
  if (!project) return res.status(404).json({ error: "Project not found" });

  if (req.user.role !== "admin") {
    const member = get("SELECT * FROM project_members WHERE project_id = ? AND user_id = ?", [project_id, req.user.id]);
    if (!member) return res.status(403).json({ error: "Not a member of this project" });
  }

  run(
    `INSERT INTO tasks (title, description, project_id, assigned_to, created_by, due_date, priority)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [title, description || "", project_id, assigned_to || null, req.user.id, due_date || null, priority || "medium"]
  );
  const task = get("SELECT id FROM tasks WHERE created_by = ? ORDER BY id DESC LIMIT 1", [req.user.id]);
  res.json({ id: task.id, title, project_id });
});

app.put("/api/tasks/:id", auth, (req, res) => {
  const { title, description, status, assigned_to, due_date, priority } = req.body;
  const { id } = req.params;

  const task = get("SELECT * FROM tasks WHERE id = ?", [id]);
  if (!task) return res.status(404).json({ error: "Task not found" });

  if (req.user.role !== "admin" && task.created_by != req.user.id && task.assigned_to != req.user.id)
    return res.status(403).json({ error: "Not authorized to edit this task" });

  run(
    `UPDATE tasks SET title=?, description=?, status=?, assigned_to=?, due_date=?, priority=? WHERE id=?`,
    [
      title ?? task.title,
      description ?? task.description,
      status ?? task.status,
      assigned_to !== undefined ? assigned_to || null : task.assigned_to,
      due_date !== undefined ? due_date || null : task.due_date,
      priority ?? task.priority,
      id,
    ]
  );
  res.json({ success: true });
});

app.delete("/api/tasks/:id", auth, (req, res) => {
  const task = get("SELECT * FROM tasks WHERE id = ?", [req.params.id]);
  if (!task) return res.status(404).json({ error: "Task not found" });
  if (req.user.role !== "admin" && task.created_by != req.user.id)
    return res.status(403).json({ error: "Not authorized" });
  run("DELETE FROM tasks WHERE id = ?", [req.params.id]);
  res.json({ success: true });
});

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
app.get("/api/dashboard", auth, (req, res) => {
  const today = new Date().toISOString().split("T")[0];
  let f = "";
  if (req.user.role !== "admin") {
    f = ` AND (t.assigned_to = ${req.user.id} OR t.created_by = ${req.user.id}
          OR t.project_id IN (SELECT project_id FROM project_members WHERE user_id = ${req.user.id}))`;
  }

  const total      = (get(`SELECT COUNT(*) as c FROM tasks t WHERE 1=1 ${f}`) || {}).c || 0;
  const todo       = (get(`SELECT COUNT(*) as c FROM tasks t WHERE status='todo' ${f}`) || {}).c || 0;
  const inProgress = (get(`SELECT COUNT(*) as c FROM tasks t WHERE status='in-progress' ${f}`) || {}).c || 0;
  const done       = (get(`SELECT COUNT(*) as c FROM tasks t WHERE status='done' ${f}`) || {}).c || 0;
  const overdue    = (get(`SELECT COUNT(*) as c FROM tasks t WHERE due_date < '${today}' AND status != 'done' ${f}`) || {}).c || 0;

  const totalProjects =
    req.user.role === "admin"
      ? (get("SELECT COUNT(*) as c FROM projects") || {}).c || 0
      : (get(`SELECT COUNT(*) as c FROM projects WHERE owner_id = ? OR id IN (SELECT project_id FROM project_members WHERE user_id = ?)`, [req.user.id, req.user.id]) || {}).c || 0;

  const totalUsers =
    req.user.role === "admin" ? (get("SELECT COUNT(*) as c FROM users") || {}).c || 0 : null;

  res.json({ total, todo, inProgress, done, overdue, totalProjects, totalUsers });
});

// ─── SERVE FRONTEND ───────────────────────────────────────────────────────────
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ─── START ────────────────────────────────────────────────────────────────────
initDb().then(() => {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
});