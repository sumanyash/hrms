# PHP Deployment

## Install Packages

```bash
sudo apt update
sudo apt install -y nginx mariadb-server php-fpm php-mysql
```

## Database

```bash
mysql -uroot -p
```

```sql
CREATE DATABASE IF NOT EXISTS hrms_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'hrms_user'@'localhost' IDENTIFIED BY 'HRMSStrongPass_2026!';
GRANT ALL PRIVILEGES ON hrms_db.* TO 'hrms_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

## App Config

```bash
cd /var/www/hrms
cp public/config.example.php public/config.php
nano public/config.php
chown -R www-data:www-data /var/www/hrms
find /var/www/hrms -type d -exec chmod 755 {} \;
find /var/www/hrms -type f -exec chmod 644 {} \;
```

## Nginx

Use your installed PHP-FPM socket. On Debian 12 it is usually `/run/php/php8.2-fpm.sock`.

```nginx
server {
    server_name hrms.clouddialer.in;
    root /var/www/hrms/public;
    index index.html index.php;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~ \.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/run/php/php8.2-fpm.sock;
    }

    listen 443 ssl;
    ssl_certificate /etc/letsencrypt/live/hrms.clouddialer.in/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/hrms.clouddialer.in/privkey.pem;
}

server {
    listen 80;
    server_name hrms.clouddialer.in;
    return 301 https://$host$request_uri;
}
```

Then:

```bash
nginx -t
systemctl reload nginx
```

## Test

```bash
curl "https://hrms.clouddialer.in/api.php?action=health"
```

Expected:

```json
{"status":"ok","database":"hrms_db","runtime":"php","schema":"ready"}
```
