# Avyukta Intellicall HRMS

Single-file HRMS ko proper local project me migrate kiya gaya hai:

- Google Sheets / Apps Script dependency removed
- Node.js backend with built-in HTTP server
- MariaDB database via `mysql2`
- Existing HRMS UI served from `public/index.html`

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Server/VPS direct run:

```bash
HOST=0.0.0.0 PORT=3000 DB_HOST=127.0.0.1 DB_NAME=hrms_db DB_USER=hrms_user DB_PASSWORD=your-password node src/server.js
```

Default admin login:

- Username: `admin`
- Password: `admin123`

## Database

Create MariaDB database/user:

```sql
CREATE DATABASE hrms_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'hrms_user'@'localhost' IDENTIFIED BY 'change-this-password';
GRANT ALL PRIVILEGES ON hrms_db.* TO 'hrms_user'@'localhost';
FLUSH PRIVILEGES;
```

Tables and starter employees are created automatically on first app start.

## Deploy

See [DEPLOYMENT.md](DEPLOYMENT.md) for VPS, PM2, Nginx, and Docker notes.
