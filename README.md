# Avyukta Intellicall HRMS

Single-file HRMS ko proper local project me migrate kiya gaya hai:

- Google Sheets / Apps Script dependency removed
- Node.js backend with built-in HTTP server
- SQLite database via local `sqlite3`
- Existing HRMS UI served from `public/index.html`

## Run

```bash
npm run dev
```

Open `http://localhost:3000`.

Server/VPS direct run:

```bash
HOST=0.0.0.0 PORT=3000 node src/server.js
```

Default admin login:

- Username: `admin`
- Password: `admin123`

## Data

SQLite database file auto-created at:

```text
data/hrms.db
```

The backend seeds a few starter employees on first run so the portal is usable immediately.

## Deploy

See [DEPLOYMENT.md](DEPLOYMENT.md) for VPS, PM2, Nginx, and Docker notes.
