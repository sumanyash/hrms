<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

const REQUIRED_TABLES = [
    'employees', 'employee_attrition', 'leaves', 'expenses', 'tokens',
    'cards', 'attendance', 'shifts', 'monthly_salary', 'audit_log', 'hrms_meta'
];

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function json_response(array $payload, int $status = 200): void {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function db_config(): array {
    $configFile = __DIR__ . '/config.php';
    $fileConfig = is_file($configFile) ? require $configFile : [];
    return [
        'host' => $fileConfig['host'] ?? getenv('DB_HOST') ?: '127.0.0.1',
        'port' => (int)($fileConfig['port'] ?? getenv('DB_PORT') ?: 3306),
        'name' => $fileConfig['name'] ?? getenv('DB_NAME') ?: 'hrms_db',
        'user' => $fileConfig['user'] ?? getenv('DB_USER') ?: 'hrms_user',
        'password' => $fileConfig['password'] ?? getenv('DB_PASSWORD') ?: '',
        'crm_employees_url' => $fileConfig['crm_employees_url'] ?? getenv('CRM_EMPLOYEES_URL') ?: '',
        'crm_bearer_token' => $fileConfig['crm_bearer_token'] ?? getenv('CRM_BEARER_TOKEN') ?: '',
    ];
}

function db(): PDO {
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;
    $c = db_config();
    $dsn = "mysql:host={$c['host']};port={$c['port']};dbname={$c['name']};charset=utf8mb4";
    $pdo = new PDO($dsn, $c['user'], $c['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    return $pdo;
}

function exec_sql(string $sql): void {
    db()->exec($sql);
}

function fetch_all(string $sql, array $params = []): array {
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll();
}

function execute(string $sql, array $params = []): void {
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
}

function fetch_value(string $sql, array $params = []): mixed {
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchColumn();
}

function num(mixed $value, float $fallback = 0): float {
    return is_numeric($value) ? (float)$value : $fallback;
}

function today(): string {
    return date('Y-m-d');
}

function schema_ready(): bool {
    $placeholders = implode(',', array_fill(0, count(REQUIRED_TABLES), '?'));
    $count = (int)fetch_value(
        "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ($placeholders)",
        REQUIRED_TABLES
    );
    return $count === count(REQUIRED_TABLES);
}

function ensure_index(string $table, string $index, string $columns): void {
    $exists = (int)fetch_value(
        "SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?",
        [$table, $index]
    );
    if ($exists === 0) {
        exec_sql("CREATE INDEX $index ON $table ($columns)");
    }
}

function ensure_column(string $table, string $column, string $definition): void {
    $exists = (int)fetch_value(
        "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?",
        [$table, $column]
    );
    if ($exists === 0) {
        exec_sql("ALTER TABLE $table ADD COLUMN $column $definition");
    }
}

function ensure_employee_salary_columns(): void {
    ensure_column('employees', 'grossSalary', 'DECIMAL(12,2) DEFAULT 0');
    ensure_column('employees', 'netSalary', 'DECIMAL(12,2) DEFAULT 0');
    ensure_column('employees', 'pfAmount', 'DECIMAL(12,2) DEFAULT 0');
    ensure_column('employees', 'incomeTax', 'DECIMAL(12,2) DEFAULT 0');
    ensure_column('employees', 'source', "VARCHAR(40) DEFAULT 'manual'");
}

function ensure_indexes(): void {
    static $done = false;
    if ($done) return;
    $marked = fetch_value("SELECT meta_value FROM hrms_meta WHERE meta_key = 'indexes_v1'");
    if ($marked === 'done') {
        $done = true;
        return;
    }
    ensure_index('employees', 'idx_employees_status_dept', 'status, dept');
    ensure_index('leaves', 'idx_leaves_emp_status', 'empId, status');
    ensure_index('leaves', 'idx_leaves_status_applied', 'status, appliedOn');
    ensure_index('expenses', 'idx_expenses_emp_status', 'empId, status');
    ensure_index('expenses', 'idx_expenses_status_applied', 'status, appliedOn');
    ensure_index('tokens', 'idx_tokens_emp_issued', 'empId, issuedOn');
    ensure_index('cards', 'idx_cards_emp_issued', 'empId, issuedOn');
    ensure_index('attendance', 'idx_attendance_emp_date', 'empId, date');
    ensure_index('audit_log', 'idx_audit_action_created', 'action, createdAt');
    execute("INSERT INTO hrms_meta (meta_key, meta_value) VALUES ('indexes_v1', 'done') ON DUPLICATE KEY UPDATE meta_value = VALUES(meta_value)");
    $done = true;
}

function init_db(): void {
    if (schema_ready()) {
        ensure_employee_salary_columns();
        ensure_indexes();
        return;
    }

    exec_sql("CREATE TABLE IF NOT EXISTS employees (
        id VARCHAR(40) PRIMARY KEY,
        sno INT,
        fname VARCHAR(120) NOT NULL,
        lname VARCHAR(120) NOT NULL,
        dept VARCHAR(120),
        doj VARCHAR(40),
        salary DECIMAL(12,2) DEFAULT 0,
        grossSalary DECIMAL(12,2) DEFAULT 0,
        netSalary DECIMAL(12,2) DEFAULT 0,
        pfAmount DECIMAL(12,2) DEFAULT 0,
        incomeTax DECIMAL(12,2) DEFAULT 0,
        role VARCHAR(160),
        pcode VARCHAR(20) DEFAULT '+91',
        phone VARCHAR(40),
        email VARCHAR(180),
        dob VARCHAR(40),
        pass VARCHAR(160) DEFAULT 'emp123',
        source VARCHAR(40) DEFAULT 'manual',
        status VARCHAR(30) DEFAULT 'Active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    exec_sql("CREATE TABLE IF NOT EXISTS employee_attrition (
        attrition_id BIGINT AUTO_INCREMENT PRIMARY KEY,
        id VARCHAR(40),
        payload JSON NOT NULL,
        exit_date VARCHAR(40),
        removed_by VARCHAR(160),
        removed_at VARCHAR(80),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    exec_sql("CREATE TABLE IF NOT EXISTS leaves (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    exec_sql("CREATE TABLE IF NOT EXISTS expenses (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    exec_sql("CREATE TABLE IF NOT EXISTS tokens (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    exec_sql("CREATE TABLE IF NOT EXISTS cards (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    exec_sql("CREATE TABLE IF NOT EXISTS attendance (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        empId VARCHAR(40),
        date VARCHAR(40),
        type VARCHAR(80),
        ip VARCHAR(80),
        lat VARCHAR(80),
        lng VARCHAR(80),
        payload JSON,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    exec_sql("CREATE TABLE IF NOT EXISTS shifts (
        empId VARCHAR(40) PRIMARY KEY,
        name VARCHAR(120),
        start VARCHAR(20),
        end VARCHAR(20),
        updatedBy VARCHAR(160),
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    exec_sql("CREATE TABLE IF NOT EXISTS monthly_salary (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        payload JSON NOT NULL,
        submittedBy VARCHAR(160),
        submittedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    exec_sql("CREATE TABLE IF NOT EXISTS audit_log (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        action VARCHAR(120) NOT NULL,
        payload JSON,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    exec_sql("CREATE TABLE IF NOT EXISTS hrms_meta (
        meta_key VARCHAR(80) PRIMARY KEY,
        meta_value VARCHAR(255),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $count = fetch_all("SELECT COUNT(*) AS count FROM employees")[0]['count'] ?? 0;
    if ((int)$count === 0) {
        $seed = [
            ['AVY-18001', 1, 'Rahul', 'Sharma', 'Software', '01/04/2024', 25000, 'Software Executive', '+91', '9876543210', 'rahul.sharma@company.com', '1998-04-12'],
            ['AVY-18002', 2, 'Nandini', 'Jain', 'Accounts', '15/04/2024', 23000, 'Accounts Head', '+91', '9876501234', 'nandini.jain@company.com', '1996-09-21'],
            ['AVY-18003', 3, 'Andy', 'Sharma', 'HR', '01/05/2024', 30000, 'HR Manager', '+91', '9876512345', 'andy.sharma@company.com', '1994-02-08'],
        ];
        foreach ($seed as $employee) {
            execute("INSERT INTO employees (id,sno,fname,lname,dept,doj,salary,role,pcode,phone,email,dob) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", $employee);
        }
    }

    ensure_employee_salary_columns();
    ensure_indexes();
}

function audit_log(string $action, array $payload): void {
    execute("INSERT INTO audit_log (action,payload) VALUES (?,?)", [$action, json_encode($payload, JSON_UNESCAPED_UNICODE)]);
}

function upsert_employee(array $p): void {
    execute("INSERT INTO employees (id,sno,fname,lname,dept,doj,salary,grossSalary,netSalary,pfAmount,incomeTax,role,pcode,phone,email,dob,pass,source,status)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'Active')
        ON DUPLICATE KEY UPDATE sno=VALUES(sno), fname=VALUES(fname), lname=VALUES(lname), dept=VALUES(dept),
        doj=VALUES(doj), salary=VALUES(salary), grossSalary=VALUES(grossSalary), netSalary=VALUES(netSalary),
        pfAmount=VALUES(pfAmount), incomeTax=VALUES(incomeTax), role=VALUES(role), pcode=VALUES(pcode), phone=VALUES(phone),
        email=VALUES(email), dob=VALUES(dob), source=VALUES(source), status='Active'", [
        $p['id'] ?? '',
        (int)num($p['sno'] ?? 0),
        $p['fname'] ?? '',
        $p['lname'] ?? '',
        $p['dept'] ?? '',
        $p['doj'] ?? '',
        num($p['salary'] ?? 0),
        num($p['grossSalary'] ?? 0),
        num($p['netSalary'] ?? 0),
        num($p['pfAmount'] ?? 0),
        num($p['incomeTax'] ?? 0),
        $p['role'] ?? '',
        $p['pcode'] ?? '+91',
        $p['phone'] ?? '',
        $p['email'] ?? '',
        $p['dob'] ?? '',
        $p['pass'] ?? 'emp123',
        $p['source'] ?? 'manual',
    ]);
}

function normalize_crm_employee(array $row, int $idx): array {
    $name = trim((string)($row['name'] ?? $row['employee_name'] ?? ''));
    $parts = preg_split('/\s+/', $name, 2);
    $fname = (string)($row['fname'] ?? $row['first_name'] ?? $parts[0] ?? '');
    $lname = (string)($row['lname'] ?? $row['last_name'] ?? $parts[1] ?? '');
    $salary = num($row['salary'] ?? $row['gross_salary'] ?? $row['ctc'] ?? 0);
    return [
        'id' => (string)($row['id'] ?? $row['emp_id'] ?? $row['employee_code'] ?? ('CRM-' . str_pad((string)($idx + 1), 5, '0', STR_PAD_LEFT))),
        'sno' => (int)num($row['sno'] ?? $idx + 1),
        'fname' => $fname ?: 'Employee',
        'lname' => $lname,
        'dept' => (string)($row['dept'] ?? $row['department'] ?? 'Sales'),
        'doj' => (string)($row['doj'] ?? $row['date_of_joining'] ?? ''),
        'salary' => $salary,
        'grossSalary' => num($row['grossSalary'] ?? $row['gross_salary'] ?? $salary),
        'netSalary' => num($row['netSalary'] ?? $row['net_salary'] ?? 0),
        'pfAmount' => num($row['pfAmount'] ?? $row['pf'] ?? $row['pf_amount'] ?? 0),
        'incomeTax' => num($row['incomeTax'] ?? $row['income_tax'] ?? $row['tds'] ?? 0),
        'role' => (string)($row['role'] ?? $row['designation'] ?? ''),
        'pcode' => (string)($row['pcode'] ?? $row['phone_code'] ?? '+91'),
        'phone' => preg_replace('/\D+/', '', (string)($row['phone'] ?? $row['mobile'] ?? $row['phone_number'] ?? '')),
        'email' => (string)($row['email'] ?? $row['email_address'] ?? ''),
        'dob' => (string)($row['dob'] ?? $row['date_of_birth'] ?? ''),
        'source' => 'crm',
    ];
}

function fetch_crm_employees(): array {
    $config = db_config();
    $url = trim((string)$config['crm_employees_url']);
    if ($url === '') {
        throw new RuntimeException('CRM employees URL is not configured in public/config.php');
    }
    $headers = ['Accept: application/json'];
    if (!empty($config['crm_bearer_token'])) {
        $headers[] = 'Authorization: Bearer ' . $config['crm_bearer_token'];
    }
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_CONNECTTIMEOUT => 8,
            CURLOPT_TIMEOUT => 30,
            CURLOPT_HTTPHEADER => $headers,
        ]);
        $body = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($body === false || $code >= 400) {
            throw new RuntimeException('CRM request failed: ' . ($err ?: 'HTTP ' . $code));
        }
    } else {
        $body = file_get_contents($url, false, stream_context_create([
            'http' => [
                'method' => 'GET',
                'timeout' => 30,
                'header' => implode("\r\n", $headers),
            ],
        ]));
        if ($body === false) {
            throw new RuntimeException('CRM request failed');
        }
    }
    $json = json_decode((string)$body, true);
    if (!is_array($json)) {
        throw new RuntimeException('CRM returned invalid JSON');
    }
    $rows = $json['employees'] ?? $json['data'] ?? $json;
    if (!is_array($rows)) {
        throw new RuntimeException('CRM response does not contain employees array');
    }
    return array_values(array_filter($rows, 'is_array'));
}

function handle_action(string $action, array $p): array {
    switch ($action) {
        case 'health':
            return ['status' => 'ok', 'database' => db_config()['name'], 'runtime' => 'php', 'schema' => schema_ready() ? 'ready' : 'created'];
        case 'getEmployees':
            return ['status' => 'success', 'employees' => fetch_all("SELECT sno,id,fname,lname,dept,doj,salary,grossSalary,netSalary,pfAmount,incomeTax,role,pcode,phone,email,dob,pass,source FROM employees WHERE status='Active' ORDER BY sno,id")];
        case 'syncCrmEmployees':
            $rows = fetch_crm_employees();
            $imported = 0;
            foreach ($rows as $idx => $row) {
                upsert_employee(normalize_crm_employee($row, $idx));
                $imported++;
            }
            audit_log($action, ['imported' => $imported]);
            return ['status' => 'success', 'imported' => $imported];
        case 'getLeaves':
            return ['status' => 'success', 'leaves' => fetch_all("SELECT id,empId,empName,type,dateFrom AS `from`,dateTo AS `to`,days,reason,session,status,appliedOn,approvedBy FROM leaves ORDER BY appliedOn DESC,id DESC")];
        case 'getExpenses':
            return ['status' => 'success', 'expenses' => fetch_all("SELECT id,empId,empName,cat,amount,date,description AS `desc`,status,appliedOn,approvedBy FROM expenses ORDER BY appliedOn DESC,id DESC")];
        case 'getTokens':
            return ['status' => 'success', 'tokens' => fetch_all("SELECT * FROM tokens ORDER BY issuedOn DESC,id DESC")];
        case 'getCards':
            return ['status' => 'success', 'cards' => fetch_all("SELECT * FROM cards ORDER BY issuedOn DESC,id DESC")];
        case 'addEmployee':
        case 'updateEmployee':
            upsert_employee($p);
            audit_log($action, $p);
            return ['status' => 'success'];
        case 'deleteEmployee':
            execute("UPDATE employees SET status='Deleted' WHERE id=?", [$p['id'] ?? '']);
            execute("INSERT INTO employee_attrition (id,payload,exit_date,removed_by,removed_at) VALUES (?,?,?,?,?)", [
                $p['id'] ?? '',
                json_encode($p, JSON_UNESCAPED_UNICODE),
                $p['exitDate'] ?? today(),
                $p['removedBy'] ?? '',
                $p['removedAt'] ?? '',
            ]);
            audit_log($action, $p);
            return ['status' => 'success'];
        case 'addLeave':
            execute("INSERT INTO leaves (id,empId,empName,type,dateFrom,dateTo,days,reason,session,status,appliedOn,approvedBy)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
                ON DUPLICATE KEY UPDATE empId=VALUES(empId), empName=VALUES(empName), type=VALUES(type),
                dateFrom=VALUES(dateFrom), dateTo=VALUES(dateTo), days=VALUES(days), reason=VALUES(reason),
                session=VALUES(session), status=VALUES(status), appliedOn=VALUES(appliedOn), approvedBy=VALUES(approvedBy)", [
                $p['id'] ?? ('LV' . time()),
                $p['empId'] ?? '',
                $p['empName'] ?? '',
                $p['type'] ?? '',
                $p['from'] ?? '',
                $p['to'] ?? '',
                num($p['days'] ?? 1, 1),
                $p['reason'] ?? '',
                $p['session'] ?? '',
                $p['status'] ?? 'Pending',
                $p['appliedOn'] ?? today(),
                $p['approvedBy'] ?? '',
            ]);
            audit_log($action, $p);
            return ['status' => 'success'];
        case 'updateLeaveStatus':
            execute("UPDATE leaves SET status=?, approvedBy=? WHERE id=?", [$p['status'] ?? '', $p['approvedBy'] ?? '', $p['leaveId'] ?? $p['id'] ?? '']);
            audit_log($action, $p);
            return ['status' => 'success'];
        case 'addExpense':
            execute("INSERT INTO expenses (id,empId,empName,cat,amount,date,description,status,appliedOn,approvedBy)
                VALUES (?,?,?,?,?,?,?,?,?,?)
                ON DUPLICATE KEY UPDATE empId=VALUES(empId), empName=VALUES(empName), cat=VALUES(cat),
                amount=VALUES(amount), date=VALUES(date), description=VALUES(description), status=VALUES(status),
                appliedOn=VALUES(appliedOn), approvedBy=VALUES(approvedBy)", [
                $p['id'] ?? ('EX' . time()),
                $p['empId'] ?? '',
                $p['empName'] ?? '',
                $p['cat'] ?? '',
                num($p['amount'] ?? 0),
                $p['date'] ?? today(),
                $p['desc'] ?? $p['description'] ?? '',
                $p['status'] ?? 'Pending',
                $p['appliedOn'] ?? today(),
                $p['approvedBy'] ?? '',
            ]);
            audit_log($action, $p);
            return ['status' => 'success'];
        case 'updateExpenseStatus':
            execute("UPDATE expenses SET status=?, approvedBy=? WHERE id=?", [$p['status'] ?? '', $p['approvedBy'] ?? '', $p['expId'] ?? $p['id'] ?? '']);
            audit_log($action, $p);
            return ['status' => 'success'];
        case 'addToken':
            execute("INSERT INTO tokens (id,empId,empName,qty,type,perToken,totalAmount,amount,reason,issuedBy,issuedOn)
                VALUES (?,?,?,?,?,?,?,?,?,?,?)
                ON DUPLICATE KEY UPDATE empId=VALUES(empId), empName=VALUES(empName), qty=VALUES(qty),
                type=VALUES(type), perToken=VALUES(perToken), totalAmount=VALUES(totalAmount), amount=VALUES(amount),
                reason=VALUES(reason), issuedBy=VALUES(issuedBy), issuedOn=VALUES(issuedOn)", [
                $p['id'] ?? ('TK' . time()),
                $p['empId'] ?? '',
                $p['empName'] ?? '',
                (int)num($p['qty'] ?? 1, 1),
                $p['type'] ?? '',
                num($p['perToken'] ?? 0),
                num($p['totalAmount'] ?? $p['amount'] ?? 0),
                num($p['amount'] ?? $p['totalAmount'] ?? 0),
                $p['reason'] ?? '',
                $p['issuedBy'] ?? '',
                $p['issuedOn'] ?? today(),
            ]);
            audit_log($action, $p);
            return ['status' => 'success'];
        case 'addCard':
            execute("INSERT INTO cards (id,empId,empName,qty,severity,type,pct,perCard,totalAmount,reason,issuedBy,issuedOn)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
                ON DUPLICATE KEY UPDATE empId=VALUES(empId), empName=VALUES(empName), qty=VALUES(qty),
                severity=VALUES(severity), type=VALUES(type), pct=VALUES(pct), perCard=VALUES(perCard),
                totalAmount=VALUES(totalAmount), reason=VALUES(reason), issuedBy=VALUES(issuedBy), issuedOn=VALUES(issuedOn)", [
                $p['id'] ?? ('CD' . time()),
                $p['empId'] ?? '',
                $p['empName'] ?? '',
                (int)num($p['qty'] ?? 1, 1),
                $p['severity'] ?? '',
                $p['type'] ?? '',
                num($p['pct'] ?? 0),
                num($p['perCard'] ?? 0),
                num($p['totalAmount'] ?? 0),
                $p['reason'] ?? '',
                $p['issuedBy'] ?? '',
                $p['issuedOn'] ?? today(),
            ]);
            audit_log($action, $p);
            return ['status' => 'success'];
        case 'markAttendance':
            execute("INSERT INTO attendance (empId,date,type,ip,lat,lng,payload) VALUES (?,?,?,?,?,?,?)", [
                $p['empId'] ?? '',
                $p['date'] ?? today(),
                $p['type'] ?? $p['mode'] ?? $p['recordType'] ?? '',
                $p['ip'] ?? '',
                $p['lat'] ?? '',
                $p['lng'] ?? '',
                json_encode($p, JSON_UNESCAPED_UNICODE),
            ]);
            audit_log($action, $p);
            return ['status' => 'success'];
        case 'updateShift':
            execute("INSERT INTO shifts (empId,name,start,end,updatedBy) VALUES (?,?,?,?,?)
                ON DUPLICATE KEY UPDATE name=VALUES(name), start=VALUES(start), end=VALUES(end), updatedBy=VALUES(updatedBy)", [
                $p['empId'] ?? '',
                $p['name'] ?? $p['shiftName'] ?? '',
                $p['start'] ?? $p['shiftStart'] ?? '',
                $p['end'] ?? $p['shiftEnd'] ?? '',
                $p['updatedBy'] ?? '',
            ]);
            audit_log($action, $p);
            return ['status' => 'success'];
        case 'submitMonthlySalary':
            execute("INSERT INTO monthly_salary (payload,submittedBy) VALUES (?,?)", [json_encode($p, JSON_UNESCAPED_UNICODE), $p['submittedBy'] ?? '']);
            audit_log($action, $p);
            return ['status' => 'success'];
        case 'logPasswordChange':
        case 'sendPasswordResetEmail':
            audit_log($action, $p);
            return ['status' => 'success'];
        default:
            audit_log($action ?: 'unknown', $p);
            return ['status' => 'success', 'message' => 'Action logged'];
    }
}

try {
    $raw = file_get_contents('php://input') ?: '';
    if (strlen($raw) > 1024 * 1024) {
        json_response(['status' => 'error', 'message' => 'Request body too large'], 413);
    }
    $body = [];
    if ($raw !== '') {
        $decoded = json_decode($raw, true);
        $body = is_array($decoded) ? $decoded : [];
        if (!$body) parse_str($raw, $body);
    }
    $payload = array_merge($_GET, $_POST, $body);
    $action = (string)($payload['action'] ?? ($_GET['health'] ?? ''));

    init_db();
    json_response(handle_action($action, $payload));
} catch (Throwable $e) {
    json_response(['status' => 'error', 'message' => $e->getMessage()], 500);
}
