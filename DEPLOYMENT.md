# Server Deployment

## VPS / Ubuntu

Install runtime:

```bash
sudo apt update
sudo apt install -y nodejs npm mariadb-server nginx
```

Create database:

```bash
mysql -uroot -p
```

```sql
CREATE DATABASE hrms_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'hrms_user'@'localhost' IDENTIFIED BY 'change-this-password';
GRANT ALL PRIVILEGES ON hrms_db.* TO 'hrms_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

Install app dependencies:

```bash
cd /var/www/hrms
npm install
```

For production, use PM2:

```bash
sudo npm install -g pm2
cd /var/www/hrms
HOST=127.0.0.1 PORT=3000 DB_HOST=127.0.0.1 DB_NAME=hrms_db DB_USER=hrms_user DB_PASSWORD=change-this-password pm2 start src/server.js --name hrms
pm2 save
pm2 startup
```

## Nginx Reverse Proxy

```nginx
server {
  server_name your-domain.com;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

## Docker

```bash
docker build -t avyukta-hrms .
docker run -d --name hrms -p 3000:3000 \
  -e DB_HOST=host.docker.internal \
  -e DB_NAME=hrms_db \
  -e DB_USER=hrms_user \
  -e DB_PASSWORD=change-this-password \
  avyukta-hrms
```

## Notes

- The app no longer needs Google Sheets or Apps Script.
- MariaDB stores all HRMS data. Back up `hrms_db` regularly.
- Put Nginx/Cloudflare SSL in front of the Node server for production.
