FROM node:22-slim AS node-builder

WORKDIR /app
ARG VITE_MAPBOX_ACCESS_TOKEN
ENV VITE_MAPBOX_ACCESS_TOKEN=${VITE_MAPBOX_ACCESS_TOKEN}
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:22-slim AS vite-dev
WORKDIR /app

ARG VITE_MAPBOX_ACCESS_TOKEN
ENV VITE_MAPBOX_ACCESS_TOKEN=${VITE_MAPBOX_ACCESS_TOKEN}

RUN mkdir -p /app/node_modules && chown -R 1000:1000 /app