FROM node:22-slim AS node-builder

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:22-slim AS vite-dev
WORKDIR /app

RUN mkdir -p /app/node_modules && chown -R 1000:1000 /app