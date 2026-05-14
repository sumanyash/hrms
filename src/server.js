import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const publicDir = join(rootDir, 'public');
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';

const dbConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'hrms_user',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'hrms_db',
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL || 10),
  charset: 'utf8mb4'
};

const pool = mysql.createPool(dbConfig);

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

function number(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function initDb() {
  await query(`
    CREATE TABLE IF NOT EXISTS employees (
      id VARCHAR(40) PRIMARY KEY,
      sno INT,
      fname VARCHAR(120) NOT NULL,
      lname VARCHAR(120) NOT NULL,
      dept VARCHAR(120),
      doj VARCHAR(40),
      salary DECIMAL(12,2) DEFAULT 0,
      role VARCHAR(160),
      pcode VARCHAR(20) DEFAULT '+91',
      phone VARCHAR(40),
      email VARCHAR(180),
      dob VARCHAR(40),
      pass VARCHAR(160) DEFAULT 'emp123',
      status VARCHAR(30) DEFAULT 'Active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS employee_attrition (
      attrition_id BIGINT AUTO_INCREMENT PRIMARY KEY,
      id VARCHAR(40),
      payload JSON NOT NULL,
      exit_date VARCHAR(40),
      removed_by VARCHAR(160),
      removed_at VARCHAR(80),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS leaves (
      id VARCHAR(40) PRIMARY KEY,
      empId VARCHAR(40),
      empName VARCHAR(240),
      type VARCHAR(80),
      dateFrom VARCHAR(40),
      dateTo VARCHAR(40),
      days DECIMAL(6,2) DEFAULT 1,
      reason TEXT,
      session VARCHAR(80),
      status VARCHAR(40) DEFAULT 'Pending',
      appliedOn VARCHAR(40),
      approvedBy VARCHAR(160)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS expenses (
      id VARCHAR(40) PRIMARY KEY,
      empId VARCHAR(40),
      empName VARCHAR(240),
      cat VARCHAR(120),
      amount DECIMAL(12,2) DEFAULT 0,
      date VARCHAR(40),
      description TEXT,
      status VARCHAR(40) DEFAULT 'Pending',
      appliedOn VARCHAR(40),
      approvedBy VARCHAR(160)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS tokens (
      id VARCHAR(40) PRIMARY KEY,
      empId VARCHAR(40),
      empName VARCHAR(240),
      qty INT DEFAULT 1,
      type VARCHAR(80),
      perToken DECIMAL(12,2) DEFAULT 0,
      totalAmount DECIMAL(12,2) DEFAULT 0,
      amount DECIMAL(12,2) DEFAULT 0,
      reason TEXT,
      issuedBy VARCHAR(160),
      issuedOn VARCHAR(40)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS cards (
      id VARCHAR(40) PRIMARY KEY,
      empId VARCHAR(40),
      empName VARCHAR(240),
      qty INT DEFAULT 1,
      severity VARCHAR(40),
      type VARCHAR(80),
      pct DECIMAL(6,2) DEFAULT 0,
      perCard DECIMAL(12,2) DEFAULT 0,
      totalAmount DECIMAL(12,2) DEFAULT 0,
      reason TEXT,
      issuedBy VARCHAR(160),
      issuedOn VARCHAR(40)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS attendance (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      empId VARCHAR(40),
      date VARCHAR(40),
      type VARCHAR(80),
      ip VARCHAR(80),
      lat VARCHAR(80),
      lng VARCHAR(80),
      payload JSON,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS shifts (
      empId VARCHAR(40) PRIMARY KEY,
      name VARCHAR(120),
      start VARCHAR(20),
      end VARCHAR(20),
      updatedBy VARCHAR(160),
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS monthly_salary (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      payload JSON NOT NULL,
      submittedBy VARCHAR(160),
      submittedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      action VARCHAR(120) NOT NULL,
      payload JSON,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  const rows = await query('SELECT COUNT(*) AS count FROM employees');
  if (!rows[0].count) {
    const seed = [
      ['AVY-18001', 1, 'Rahul', 'Sharma', 'Software', '01/04/2024', 25000, 'Software Executive', '+91', '9876543210', 'rahul.sharma@company.com', '1998-04-12'],
      ['AVY-18002', 2, 'Nandini', 'Jain', 'Accounts', '15/04/2024', 23000, 'Accounts Head', '+91', '9876501234', 'nandini.jain@company.com', '1996-09-21'],
      ['AVY-18003', 3, 'Andy', 'Sharma', 'HR', '01/05/2024', 30000, 'HR Manager', '+91', '9876512345', 'andy.sharma@company.com', '1994-02-08']
    ];
    for (const employee of seed) {
      await query(
        `INSERT INTO employees (id,sno,fname,lname,dept,doj,salary,role,pcode,phone,email,dob) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        employee
      );
    }
  }
}

async function employees() {
  return query(`SELECT sno,id,fname,lname,dept,doj,salary,role,pcode,phone,email,dob,pass
    FROM employees WHERE status='Active' ORDER BY sno,id`);
}

async function leaves() {
  return query(`SELECT id,empId,empName,type,dateFrom AS \`from\`,dateTo AS \`to\`,days,reason,session,status,appliedOn,approvedBy
    FROM leaves ORDER BY appliedOn DESC,id DESC`);
}

async function expenses() {
  return query(`SELECT id,empId,empName,cat,amount,date,description AS \`desc\`,status,appliedOn,approvedBy
    FROM expenses ORDER BY appliedOn DESC,id DESC`);
}

async function tokens() {
  return query('SELECT * FROM tokens ORDER BY issuedOn DESC,id DESC');
}

async function cards() {
  return query('SELECT * FROM cards ORDER BY issuedOn DESC,id DESC');
}

async function audit(action, payload) {
  await query('INSERT INTO audit_log (action,payload) VALUES (?,?)', [action, JSON.stringify(payload)]);
}

async function upsertEmployee(p) {
  await query(
    `INSERT INTO employees (id,sno,fname,lname,dept,doj,salary,role,pcode,phone,email,dob,pass,status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'Active')
     ON DUPLICATE KEY UPDATE
      sno=VALUES(sno), fname=VALUES(fname), lname=VALUES(lname), dept=VALUES(dept), doj=VALUES(doj),
      salary=VALUES(salary), role=VALUES(role), pcode=VALUES(pcode), phone=VALUES(phone), email=VALUES(email),
      dob=VALUES(dob), status='Active'`,
    [p.id, number(p.sno), p.fname, p.lname, p.dept, p.doj, number(p.salary), p.role, p.pcode || '+91', p.phone, p.email, p.dob, p.pass || 'emp123']
  );
}

async function handleAction(action, p) {
  switch (action) {
    case 'getEmployees':
      return { status: 'success', employees: await employees() };
    case 'getLeaves':
      return { status: 'success', leaves: await leaves() };
    case 'getExpenses':
      return { status: 'success', expenses: await expenses() };
    case 'getTokens':
      return { status: 'success', tokens: await tokens() };
    case 'getCards':
      return { status: 'success', cards: await cards() };
    case 'addEmployee':
    case 'updateEmployee':
      await upsertEmployee(p);
      await audit(action, p);
      return { status: 'success', employee: p };
    case 'deleteEmployee':
      await query(`UPDATE employees SET status='Deleted' WHERE id=?`, [p.id]);
      await query(
        `INSERT INTO employee_attrition (id,payload,exit_date,removed_by,removed_at) VALUES (?,?,?,?,?)`,
        [p.id, JSON.stringify(p), p.exitDate || today(), p.removedBy, p.removedAt]
      );
      await audit(action, p);
      return { status: 'success' };
    case 'addLeave':
      await query(
        `INSERT INTO leaves (id,empId,empName,type,dateFrom,dateTo,days,reason,session,status,appliedOn,approvedBy)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE empId=VALUES(empId),empName=VALUES(empName),type=VALUES(type),dateFrom=VALUES(dateFrom),
          dateTo=VALUES(dateTo),days=VALUES(days),reason=VALUES(reason),session=VALUES(session),status=VALUES(status),
          appliedOn=VALUES(appliedOn),approvedBy=VALUES(approvedBy)`,
        [p.id, p.empId, p.empName, p.type, p.from, p.to, number(p.days, 1), p.reason, p.session, p.status || 'Pending', p.appliedOn || today(), p.approvedBy]
      );
      await audit(action, p);
      return { status: 'success' };
    case 'updateLeaveStatus':
      await query(`UPDATE leaves SET status=?, approvedBy=? WHERE id=?`, [p.status, p.approvedBy || '', p.leaveId || p.id]);
      await audit(action, p);
      return { status: 'success' };
    case 'addExpense':
      await query(
        `INSERT INTO expenses (id,empId,empName,cat,amount,date,description,status,appliedOn,approvedBy)
         VALUES (?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE empId=VALUES(empId),empName=VALUES(empName),cat=VALUES(cat),amount=VALUES(amount),
          date=VALUES(date),description=VALUES(description),status=VALUES(status),appliedOn=VALUES(appliedOn),approvedBy=VALUES(approvedBy)`,
        [p.id, p.empId, p.empName, p.cat, number(p.amount), p.date, p.desc || p.description, p.status || 'Pending', p.appliedOn || today(), p.approvedBy]
      );
      await audit(action, p);
      return { status: 'success' };
    case 'updateExpenseStatus':
      await query(`UPDATE expenses SET status=?, approvedBy=? WHERE id=?`, [p.status, p.approvedBy || '', p.expId || p.id]);
      await audit(action, p);
      return { status: 'success' };
    case 'addToken':
      await query(
        `INSERT INTO tokens (id,empId,empName,qty,type,perToken,totalAmount,amount,reason,issuedBy,issuedOn)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE empId=VALUES(empId),empName=VALUES(empName),qty=VALUES(qty),type=VALUES(type),
          perToken=VALUES(perToken),totalAmount=VALUES(totalAmount),amount=VALUES(amount),reason=VALUES(reason),
          issuedBy=VALUES(issuedBy),issuedOn=VALUES(issuedOn)`,
        [p.id, p.empId, p.empName, number(p.qty, 1), p.type, number(p.perToken), number(p.totalAmount || p.amount), number(p.amount || p.totalAmount), p.reason, p.issuedBy, p.issuedOn || today()]
      );
      await audit(action, p);
      return { status: 'success' };
    case 'addCard':
      await query(
        `INSERT INTO cards (id,empId,empName,qty,severity,type,pct,perCard,totalAmount,reason,issuedBy,issuedOn)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE empId=VALUES(empId),empName=VALUES(empName),qty=VALUES(qty),severity=VALUES(severity),
          type=VALUES(type),pct=VALUES(pct),perCard=VALUES(perCard),totalAmount=VALUES(totalAmount),reason=VALUES(reason),
          issuedBy=VALUES(issuedBy),issuedOn=VALUES(issuedOn)`,
        [p.id, p.empId, p.empName, number(p.qty, 1), p.severity, p.type, number(p.pct), number(p.perCard), number(p.totalAmount), p.reason, p.issuedBy, p.issuedOn || today()]
      );
      await audit(action, p);
      return { status: 'success' };
    case 'markAttendance':
      await query(
        `INSERT INTO attendance (empId,date,type,ip,lat,lng,payload) VALUES (?,?,?,?,?,?,?)`,
        [p.empId, p.date || today(), p.type || p.mode || p.recordType, p.ip, p.lat, p.lng, JSON.stringify(p)]
      );
      await audit(action, p);
      return { status: 'success' };
    case 'updateShift':
      await query(
        `INSERT INTO shifts (empId,name,start,end,updatedBy) VALUES (?,?,?,?,?)
         ON DUPLICATE KEY UPDATE name=VALUES(name),start=VALUES(start),end=VALUES(end),updatedBy=VALUES(updatedBy)`,
        [p.empId, p.name || p.shiftName, p.start || p.shiftStart, p.end || p.shiftEnd, p.updatedBy]
      );
      await audit(action, p);
      return { status: 'success' };
    case 'submitMonthlySalary':
      await query(`INSERT INTO monthly_salary (payload,submittedBy) VALUES (?,?)`, [JSON.stringify(p), p.submittedBy]);
      await audit(action, p);
      return { status: 'success' };
    case 'logPasswordChange':
    case 'sendPasswordResetEmail':
      await audit(action, p);
      return { status: 'success' };
    default:
      await audit(action || 'unknown', p);
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
    sendJson(res, 200, await handleAction(action, payload));
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
    sendJson(res, 200, { status: 'ok', database: dbConfig.database });
    return;
  }
  if (url.pathname === '/api/hrms') {
    await handleApi(req, res, url);
    return;
  }
  await serveStatic(req, res, url);
}).listen(port, host, () => {
  console.log(`HRMS running at http://${host}:${port}`);
  console.log(`MariaDB: ${dbConfig.user}@${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);
});
