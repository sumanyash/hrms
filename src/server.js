import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const publicDir = join(rootDir, 'public');
const dataDir = join(rootDir, 'data');
const dbPath = process.env.HRMS_DB || join(dataDir, 'hrms.db');
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';

const jsonHeaders = { 'content-type': 'application/json; charset=utf-8' };
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

function quote(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replaceAll("'", "''")}'`;
}

function number(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function runSql(sql) {
  return execFileSync('sqlite3', [dbPath, sql], { encoding: 'utf8' });
}

function querySql(sql) {
  const out = execFileSync('sqlite3', ['-json', dbPath, sql], { encoding: 'utf8' }).trim();
  return out ? JSON.parse(out) : [];
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function initDb() {
  await mkdir(dataDir, { recursive: true });
  runSql(`
    PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      sno INTEGER,
      fname TEXT NOT NULL,
      lname TEXT NOT NULL,
      dept TEXT,
      doj TEXT,
      salary REAL DEFAULT 0,
      role TEXT,
      pcode TEXT DEFAULT '+91',
      phone TEXT,
      email TEXT,
      dob TEXT,
      pass TEXT DEFAULT 'emp123',
      status TEXT DEFAULT 'Active',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS employee_attrition (
      id TEXT,
      payload TEXT NOT NULL,
      exit_date TEXT,
      removed_by TEXT,
      removed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS leaves (
      id TEXT PRIMARY KEY,
      empId TEXT,
      empName TEXT,
      type TEXT,
      dateFrom TEXT,
      dateTo TEXT,
      days REAL DEFAULT 1,
      reason TEXT,
      session TEXT,
      status TEXT DEFAULT 'Pending',
      appliedOn TEXT,
      approvedBy TEXT
    );
    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      empId TEXT,
      empName TEXT,
      cat TEXT,
      amount REAL DEFAULT 0,
      date TEXT,
      desc TEXT,
      status TEXT DEFAULT 'Pending',
      appliedOn TEXT,
      approvedBy TEXT
    );
    CREATE TABLE IF NOT EXISTS tokens (
      id TEXT PRIMARY KEY,
      empId TEXT,
      empName TEXT,
      qty INTEGER DEFAULT 1,
      type TEXT,
      perToken REAL DEFAULT 0,
      totalAmount REAL DEFAULT 0,
      amount REAL DEFAULT 0,
      reason TEXT,
      issuedBy TEXT,
      issuedOn TEXT
    );
    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY,
      empId TEXT,
      empName TEXT,
      qty INTEGER DEFAULT 1,
      severity TEXT,
      type TEXT,
      pct REAL DEFAULT 0,
      perCard REAL DEFAULT 0,
      totalAmount REAL DEFAULT 0,
      reason TEXT,
      issuedBy TEXT,
      issuedOn TEXT
    );
    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empId TEXT,
      date TEXT,
      type TEXT,
      ip TEXT,
      lat TEXT,
      lng TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS shifts (
      empId TEXT PRIMARY KEY,
      name TEXT,
      start TEXT,
      end TEXT,
      updatedBy TEXT,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS monthly_salary (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payload TEXT NOT NULL,
      submittedBy TEXT,
      submittedAt TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      payload TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const count = querySql('SELECT COUNT(*) AS count FROM employees;')[0]?.count || 0;
  if (!count) {
    const seed = [
      ['AVY-18001', 1, 'Rahul', 'Sharma', 'Software', '01/04/2024', 25000, 'Software Executive', '+91', '9876543210', 'rahul.sharma@company.com', '1998-04-12'],
      ['AVY-18002', 2, 'Nandini', 'Jain', 'Accounts', '15/04/2024', 23000, 'Accounts Head', '+91', '9876501234', 'nandini.jain@company.com', '1996-09-21'],
      ['AVY-18003', 3, 'Andy', 'Sharma', 'HR', '01/05/2024', 30000, 'HR Manager', '+91', '9876512345', 'andy.sharma@company.com', '1994-02-08']
    ];
    for (const e of seed) {
      runSql(`INSERT INTO employees (id,sno,fname,lname,dept,doj,salary,role,pcode,phone,email,dob)
        VALUES (${e.map(quote).join(',')});`);
    }
  }
}

function employees() {
  return querySql(`SELECT sno,id,fname,lname,dept,doj,salary,role,pcode,phone,email,dob,pass
    FROM employees WHERE status='Active' ORDER BY sno,id;`);
}

function leaves() {
  return querySql(`SELECT id,empId,empName,type,dateFrom AS "from",dateTo AS "to",days,reason,session,status,appliedOn,approvedBy
    FROM leaves ORDER BY appliedOn DESC,id DESC;`);
}

function expenses() {
  return querySql(`SELECT id,empId,empName,cat,amount,date,desc,status,appliedOn,approvedBy
    FROM expenses ORDER BY appliedOn DESC,id DESC;`);
}

function tokens() {
  return querySql('SELECT * FROM tokens ORDER BY issuedOn DESC,id DESC;');
}

function cards() {
  return querySql('SELECT * FROM cards ORDER BY issuedOn DESC,id DESC;');
}

function audit(action, payload) {
  runSql(`INSERT INTO audit_log (action,payload) VALUES (${quote(action)},${quote(JSON.stringify(payload))});`);
}

function upsertEmployee(p) {
  runSql(`INSERT INTO employees (id,sno,fname,lname,dept,doj,salary,role,pcode,phone,email,dob,pass,status,updated_at)
    VALUES (${quote(p.id)},${number(p.sno)},${quote(p.fname)},${quote(p.lname)},${quote(p.dept)},${quote(p.doj)},
      ${number(p.salary)},${quote(p.role)},${quote(p.pcode || '+91')},${quote(p.phone)},${quote(p.email)},${quote(p.dob)},
      ${quote(p.pass || 'emp123')},'Active',CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      sno=excluded.sno,fname=excluded.fname,lname=excluded.lname,dept=excluded.dept,doj=excluded.doj,
      salary=excluded.salary,role=excluded.role,pcode=excluded.pcode,phone=excluded.phone,email=excluded.email,
      dob=excluded.dob,status='Active',updated_at=CURRENT_TIMESTAMP;`);
}

function handleAction(action, p) {
  switch (action) {
    case 'getEmployees':
      return { status: 'success', employees: employees() };
    case 'getLeaves':
      return { status: 'success', leaves: leaves() };
    case 'getExpenses':
      return { status: 'success', expenses: expenses() };
    case 'getTokens':
      return { status: 'success', tokens: tokens() };
    case 'getCards':
      return { status: 'success', cards: cards() };
    case 'addEmployee':
    case 'updateEmployee':
      upsertEmployee(p);
      audit(action, p);
      return { status: 'success', employee: p };
    case 'deleteEmployee':
      runSql(`UPDATE employees SET status='Deleted', updated_at=CURRENT_TIMESTAMP WHERE id=${quote(p.id)};`);
      runSql(`INSERT INTO employee_attrition (id,payload,exit_date,removed_by,removed_at)
        VALUES (${quote(p.id)},${quote(JSON.stringify(p))},${quote(p.exitDate || today())},${quote(p.removedBy)},${quote(p.removedAt)});`);
      audit(action, p);
      return { status: 'success' };
    case 'addLeave':
      runSql(`INSERT OR REPLACE INTO leaves (id,empId,empName,type,dateFrom,dateTo,days,reason,session,status,appliedOn,approvedBy)
        VALUES (${quote(p.id)},${quote(p.empId)},${quote(p.empName)},${quote(p.type)},${quote(p.from)},${quote(p.to)},
          ${number(p.days, 1)},${quote(p.reason)},${quote(p.session)},${quote(p.status || 'Pending')},${quote(p.appliedOn || today())},${quote(p.approvedBy)});`);
      audit(action, p);
      return { status: 'success' };
    case 'updateLeaveStatus':
      runSql(`UPDATE leaves SET status=${quote(p.status)}, approvedBy=${quote(p.approvedBy || '')} WHERE id=${quote(p.leaveId || p.id)};`);
      audit(action, p);
      return { status: 'success' };
    case 'addExpense':
      runSql(`INSERT OR REPLACE INTO expenses (id,empId,empName,cat,amount,date,desc,status,appliedOn,approvedBy)
        VALUES (${quote(p.id)},${quote(p.empId)},${quote(p.empName)},${quote(p.cat)},${number(p.amount)},${quote(p.date)},
          ${quote(p.desc || p.description)},${quote(p.status || 'Pending')},${quote(p.appliedOn || today())},${quote(p.approvedBy)});`);
      audit(action, p);
      return { status: 'success' };
    case 'updateExpenseStatus':
      runSql(`UPDATE expenses SET status=${quote(p.status)}, approvedBy=${quote(p.approvedBy || '')} WHERE id=${quote(p.expId || p.id)};`);
      audit(action, p);
      return { status: 'success' };
    case 'addToken':
      runSql(`INSERT OR REPLACE INTO tokens (id,empId,empName,qty,type,perToken,totalAmount,amount,reason,issuedBy,issuedOn)
        VALUES (${quote(p.id)},${quote(p.empId)},${quote(p.empName)},${number(p.qty, 1)},${quote(p.type)},${number(p.perToken)},
          ${number(p.totalAmount || p.amount)},${number(p.amount || p.totalAmount)},${quote(p.reason)},${quote(p.issuedBy)},${quote(p.issuedOn || today())});`);
      audit(action, p);
      return { status: 'success' };
    case 'addCard':
      runSql(`INSERT OR REPLACE INTO cards (id,empId,empName,qty,severity,type,pct,perCard,totalAmount,reason,issuedBy,issuedOn)
        VALUES (${quote(p.id)},${quote(p.empId)},${quote(p.empName)},${number(p.qty, 1)},${quote(p.severity)},${quote(p.type)},
          ${number(p.pct)},${number(p.perCard)},${number(p.totalAmount)},${quote(p.reason)},${quote(p.issuedBy)},${quote(p.issuedOn || today())});`);
      audit(action, p);
      return { status: 'success' };
    case 'markAttendance':
      runSql(`INSERT INTO attendance (empId,date,type,ip,lat,lng)
        VALUES (${quote(p.empId)},${quote(p.date || today())},${quote(p.type || p.mode)},${quote(p.ip)},${quote(p.lat)},${quote(p.lng)});`);
      audit(action, p);
      return { status: 'success' };
    case 'updateShift':
      runSql(`INSERT INTO shifts (empId,name,start,end,updatedBy,updatedAt)
        VALUES (${quote(p.empId)},${quote(p.name)},${quote(p.start)},${quote(p.end)},${quote(p.updatedBy)},CURRENT_TIMESTAMP)
        ON CONFLICT(empId) DO UPDATE SET name=excluded.name,start=excluded.start,end=excluded.end,updatedBy=excluded.updatedBy,updatedAt=CURRENT_TIMESTAMP;`);
      audit(action, p);
      return { status: 'success' };
    case 'submitMonthlySalary':
      runSql(`INSERT INTO monthly_salary (payload,submittedBy) VALUES (${quote(JSON.stringify(p))},${quote(p.submittedBy)});`);
      audit(action, p);
      return { status: 'success' };
    case 'logPasswordChange':
    case 'sendPasswordResetEmail':
      audit(action, p);
      return { status: 'success' };
    default:
      audit(action || 'unknown', p);
      return { status: 'success', message: `Action ${action || '(missing)'} logged` };
  }
}

async function parseBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return Object.fromEntries(new URLSearchParams(raw));
  }
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, jsonHeaders);
  res.end(JSON.stringify(payload));
}

async function handleApi(req, res, url) {
  try {
    const body = req.method === 'POST' ? await parseBody(req) : {};
    const params = Object.fromEntries(url.searchParams);
    const payload = { ...params, ...body };
    const action = payload.action;
    sendJson(res, 200, handleAction(action, payload));
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { status: 'error', message: error.message });
  }
}

async function serveStatic(req, res, url) {
  const rawPath = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const filePath = resolve(publicDir, `.${rawPath}`);
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  try {
    const body = await readFile(filePath);
    res.writeHead(200, { 'content-type': mimeTypes[extname(filePath)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    const fallback = await readFile(join(publicDir, 'index.html'));
    res.writeHead(200, { 'content-type': mimeTypes['.html'] });
    res.end(fallback);
  }
}

await initDb();

createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/api/health') {
    sendJson(res, 200, { status: 'ok', db: existsSync(dbPath) });
    return;
  }
  if (url.pathname === '/api/hrms') {
    await handleApi(req, res, url);
    return;
  }
  await serveStatic(req, res, url);
}).listen(port, host, () => {
  console.log(`HRMS running at http://${host}:${port}`);
  console.log(`SQLite DB: ${dbPath}`);
});
