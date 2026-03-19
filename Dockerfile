FROM python:3.13-slim AS python-builder
 
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 

RUN pip install --upgrade pip 
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM node:22-slim AS node-builder

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:22-slim AS vite-dev
WORKDIR /app
RUN mkdir -p /app/node_modules && chown -R 1000:1000 /app

FROM python:3.13-slim
 
RUN useradd -m -r appuser && \
    mkdir -p /app/staticfiles && \
    chown -R appuser:appuser /app

WORKDIR /app

COPY --from=python-builder /usr/local/lib/python3.13/site-packages/ /usr/local/lib/python3.13/site-packages/
COPY --from=python-builder /usr/local/bin/ /usr/local/bin/

COPY --from=node-builder --chown=appuser:appuser /app/static ./static

COPY --chown=appuser:appuser . .
 
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 
USER appuser
EXPOSE 8000 
 
CMD sh -c "python manage.py collectstatic --noinput && gunicorn --bind 0.0.0.0:8000 --workers 3 --no-control-socket core.wsgi:application"