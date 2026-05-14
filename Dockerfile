FROM node:24-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src
COPY public ./public

ENV HOST=0.0.0.0
ENV PORT=3000
ENV DB_HOST=host.docker.internal
ENV DB_PORT=3306
ENV DB_NAME=hrms_db
ENV DB_USER=hrms_user

EXPOSE 3000

CMD ["node", "src/server.js"]
