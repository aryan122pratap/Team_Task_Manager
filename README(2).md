# TaskFlow — Team Task Manager

A full-stack web application for managing projects, assigning tasks, and tracking team progress with role-based access control.

## 🔗 Live Demo
> [https://your-app.up.railway.app](https://your-app.up.railway.app)  
> *(Replace with your Railway URL after deployment)*

---

##  Features

### Authentication
- Signup & Login with JWT tokens
- bcrypt password hashing
- Session persists across browser refreshes

### Role-Based Access Control
| Feature | Admin | Member |
|---|---|---|
| Create/Edit/Delete Projects | ✅ | ❌ |
| Assign members to projects | ✅ | ❌ |
| Create & assign tasks | ✅ | ✅ (own projects) |
| Edit/Delete own tasks | ✅ | ✅ |
| View Users page | ✅ | ❌ |
| Dashboard overview | ✅ | ✅ (own data) |

### Project Management
- Create, edit, delete projects (Admin only)
- Assign multiple team members per project
- Progress bar showing task completion %

### Task Management
- Create tasks with title, description, priority, due date
- Assign tasks to project members
- Status tracking: **To Do → In Progress → Done**
- Filter tasks by project and status
- Overdue detection (highlighted in red)

### Dashboard
- Live stat cards: Total, To Do, In Progress, Done, Overdue, Projects, Members
- Recent tasks table

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS, Vanilla JavaScript (SPA) |
| Backend | Node.js + Express.js |
| Database | SQLite via sql.js (pure JavaScript) |
| Auth | JWT (jsonwebtoken) + bcryptjs |
| Deployment | Railway |

---

## ⚙️ Local Setup

### Prerequisites
- Node.js v16+
- npm

### Steps

```bash
# 1. Clone the repo
git clone https://github.com/your-username/team-task-manager.git
cd team-task-manager

# 2. Install dependencies
npm install

# 3. Start the server
node server.js

# 4. Open in browser
# http://localhost:3000
```

No database setup needed — SQLite file is auto-created on first run.

---

## 📁 Project Structure

```
team-task-manager/
├── server.js          # Express backend (REST API + SQLite)
├── package.json       # Dependencies
└── public/
    └── index.html     # Single-page frontend (HTML + CSS + JS)
```

3 files total. Minimal and clean.

---

## 🌐 Deployment (Railway)

1. Push code to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Select your repo — Railway auto-detects Node.js
4. App goes live at `https://your-app.up.railway.app`

---

## 📡 REST API Endpoints

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/signup` | Register new user |
| POST | `/api/login` | Login, returns JWT |

### Users
| Method | Endpoint | Access |
|---|---|---|
| GET | `/api/users` | All authenticated users |

### Projects
| Method | Endpoint | Access |
|---|---|---|
| GET | `/api/projects` | Admin: all / Member: own |
| POST | `/api/projects` | Admin only |
| PUT | `/api/projects/:id` | Admin only |
| DELETE | `/api/projects/:id` | Admin only |

### Tasks
| Method | Endpoint | Access |
|---|---|---|
| GET | `/api/tasks` | Filtered by role |
| POST | `/api/tasks` | Project members |
| PUT | `/api/tasks/:id` | Creator / Assignee / Admin |
| DELETE | `/api/tasks/:id` | Creator / Admin |

### Dashboard
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/dashboard` | Stats filtered by role |

---

## 👨‍💻 Author

**ARYAN PRATAP SINGH**  
GitHub: [@your-username](https://github.com/your-username)
