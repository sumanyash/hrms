FROM node:24-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends sqlite3 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public

ENV HOST=0.0.0.0
ENV PORT=3000
ENV HRMS_DB=/data/hrms.db

VOLUME ["/data"]
EXPOSE 3000

CMD ["node", "src/server.js"]
