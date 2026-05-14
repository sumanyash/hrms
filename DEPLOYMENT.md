# Server Deployment

## VPS / Ubuntu

Install runtime:

```bash
sudo apt update
sudo apt install -y nodejs npm sqlite3 nginx
```

Run once:

```bash
cd /var/www/hrms
npm start
```

For production, use PM2:

```bash
sudo npm install -g pm2
cd /var/www/hrms
HOST=127.0.0.1 PORT=3000 HRMS_DB=/var/lib/hrms/hrms.db pm2 start src/server.js --name hrms
pm2 save
pm2 startup
```

Create database directory:

```bash
sudo mkdir -p /var/lib/hrms
sudo chown -R $USER:$USER /var/lib/hrms
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
docker run -d --name hrms -p 3000:3000 -v hrms_data:/data avyukta-hrms
```

## Notes

- The app no longer needs Google Sheets or Apps Script.
- SQLite is stored in `HRMS_DB`; back this file up regularly.
- Put Nginx/Cloudflare SSL in front of the Node server for production.
