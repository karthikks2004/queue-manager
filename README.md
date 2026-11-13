# QueueFlow — Queue Management System

**Live demo:** https://queueflow-uujl.onrender.com (login: `admin` / `admin123`)

A full-stack queue management app built for the Rugas Technologies internship assignment. A manager can log in, create multiple queues, add people, reorder them, serve the next person with one click, cancel tokens, and watch analytics.

## Try it in 30 seconds

Open the live demo: https://queueflow-uujl.onrender.com

The free host sleeps when idle, so the first load can take up to a minute. After that it is fast.

You have two ways in:

1. **Use it without signing up.** Click **Try the demo account** on the login page. You are signed in at once with sample queues, so you can look around straight away.
2. **Create your own account.** Click **Register**, choose a username (letters, numbers, dot, dash or underscore, at least 3 characters) and a password (at least 6 characters), then press **Create account**. You are signed in automatically and start with an empty workspace.

Then:

- Press **New queue**, give it a name and add people with **Add person**. Mark someone as VIP to move them ahead of regular guests.
- Use the arrows to move a person up or down, the tick to serve, and the cross to cancel.
- Open **Analytics** to see counts, average wait and the last 24 hours.

Every account only sees its own queues. The shared demo account is for looking around, so use your own account for real work.

## Features

**Assignment requirements**
- Manager register / login with JWT authentication (passwords hashed with bcrypt)
- Create multiple queues, each with a name and description
- Add a person to a queue; a token number is generated automatically
- See everyone waiting with their position
- Move a token up or down in the queue
- Serve the top token with one button click
- Cancel any token
- Analytics dashboard: served / waiting / cancelled counts, average wait time, tokens per queue, last-24-hours activity

**Extras**
- Live updates with Server-Sent Events (SSE), no page refresh needed
- Phone number, notes and VIP priority on each token (VIPs join ahead of regular guests)
- Register signs the new manager in straight away
- Queue history (served and cancelled tokens, with wait time)
- Dark theme, responsive layout, live "next at the counter" board

**Security**
- Passwords hashed with bcrypt, JWT sessions, every queue and token checked against its owner
- Server-side validation and length limits, login/register rate limiting, security headers

## Tech stack

| Part | Tools |
|---|---|
| Backend | Node.js, Express, SQLite (built-in `node:sqlite`), JWT, bcryptjs |
| Frontend | React, Vite, TypeScript, Tailwind CSS, Recharts, lucide-react, axios |

## Run it

Requires **Node.js 22.5 or newer** (uses the built-in SQLite, so nothing needs compiling).

```bash
# 1. Backend
cd backend
npm install

# 2. Frontend (build once)
cd ../frontend
npm install
npm run build

# 3. Start (serves API and website together)
cd ../backend
node server.js
```

Open http://localhost:5000 and log in with the demo account:

- Username: `admin`
- Password: `admin123`

On Windows you can double-click `RUN-WEBSITE.bat` to do all of the above.

For frontend development, run `npm run dev` in `frontend` (port 5173, proxies `/api` to port 5000).

**Configuration:** set `JWT_SECRET` and `PORT` as environment variables. Change the default demo password before any real use.

## API overview

All routes except register and login need `Authorization: Bearer <token>`.

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/register`, `/api/login` | Create account, get JWT |
| GET / POST | `/api/queues` | List / create queues |
| PUT / DELETE | `/api/queues/:id` | Rename / delete a queue |
| GET / POST | `/api/queues/:id/tokens` | List waiting tokens / add a token |
| GET | `/api/queues/:id/tokens/history` | Served and cancelled tokens |
| PATCH | `/api/tokens/:id/move-up`, `/move-down` | Reorder |
| PATCH | `/api/tokens/:id/serve`, `/cancel` | Serve or cancel |
| GET | `/api/analytics` | Dashboard numbers |
| GET | `/api/events?token=` | SSE stream for live updates |

## Project structure

```
backend/    Express server, SQLite database (created on first run)
frontend/   React app (pages: Login, Dashboard, QueueDetail, Analytics)
```

## Author

Karthik K S — github.com/karthikks2004

## Deploy (Render, free)

1. Push this repo to GitHub.
2. On render.com choose New, Blueprint, and select the repo. `render.yaml` sets everything up (build, start, a generated `JWT_SECRET`).
3. Open the URL Render gives you and log in with the demo account.

The database is recreated with demo data whenever the app starts on an empty disk. Free hosts sleep when idle, so a monitor that calls `/api/health` every 5 minutes keeps it awake.
