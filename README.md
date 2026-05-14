# Avyukta Intellicall HRMS

Single-file HRMS ko simple PHP + MariaDB project me migrate kiya gaya hai.

- No Node.js, no PM2
- No Google Sheets / Apps Script dependency
- PHP API at `public/api.php`
- Existing HRMS UI at `public/index.html`
- MariaDB tables auto-create on first API request

## Server Requirements

- Nginx
- PHP-FPM with PDO MySQL extension
- MariaDB

## Configure DB

Copy config sample:

```bash
cp public/config.example.php public/config.php
```

Edit `public/config.php`:

```php
<?php
return [
    'host' => '127.0.0.1',
    'port' => 3306,
    'name' => 'hrms_db',
    'user' => 'hrms_user',
    'password' => 'your-password',
];
```

Default admin login:

- Username: `admin`
- Password: `admin123`

## Health Check

```bash
curl "https://hrms.clouddialer.in/api.php?action=health"
```
