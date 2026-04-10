FROM python:3.13-slim AS python-builder
 
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 

RUN pip install --upgrade pip 
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM python:3.13-slim
 
RUN useradd -m -r appuser && \
    mkdir -p /app/staticfiles && \
    chown -R appuser:appuser /app

WORKDIR /app

COPY --from=python-builder /usr/local/lib/python3.13/site-packages/ /usr/local/lib/python3.13/site-packages/
COPY --from=python-builder /usr/local/bin/ /usr/local/bin/

COPY --chown=appuser:appuser . .
 
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 
USER appuser
EXPOSE 8000 
 
CMD sh -c "python manage.py collectstatic --noinput && gunicorn --bind 0.0.0.0:8000 --workers ${GUNICORN_WORKERS:-3} --timeout ${GUNICORN_TIMEOUT:-180} --graceful-timeout ${GUNICORN_GRACEFUL_TIMEOUT:-30} --keep-alive ${GUNICORN_KEEPALIVE:-5} --no-control-socket core.wsgi:application"