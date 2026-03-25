# Docker Development Guide

Services:
- `db`: PostgreSQL
- `web`: Django backend
- `vite`: React/Vite frontend dev server

## Quick Start

First time (or after dependency/image changes):

`docker compose up -d --build`

Then run migrations:

`docker compose exec web python manage.py makemigrations`
`docker compose exec web python manage.py migrate`

Daily start:

`docker compose up -d`

Check status:

`docker compose ps`

## URLs

- App: `http://localhost:8000/`
- Admin: `http://localhost:8000/admin/`
- OpenAPI schema: `http://localhost:8000/api/schema/`
- ReDoc: `http://localhost:8000/api/schema/redoc/`

## If You Changed X, Run Y

Python dependencies or backend Dockerfile:
- Use: `docker compose build web && docker compose up -d web`

Frontend dependencies or frontend Dockerfile:
- Use: `docker compose build vite && docker compose up -d vite`

Django models:
- Use:
	- `docker compose exec web python manage.py makemigrations`
	- `docker compose exec web python manage.py migrate`
- Then add the package manually to requirements.txt

New packages:
 - `docker compose exec web pip install package-name`
 - `docker compose exec web pip show package-name`
 
API contract (serializers/views/routes):
- If backend endpoints change (it helps with typechecking of the frontend and ReDoc documentation)
    - Regenerate schema:
        - `docker compose exec web python manage.py spectacular --file /app/openapi-schema.yaml --validate`
    - Regenerate frontend API types:
        - `docker compose exec vite npm run gen:api`

## Useful Commands

Stop services:

`docker compose down`

Follow backend logs:

`docker compose logs -f web`

Create admin user:

`docker compose exec web python manage.py createsuperuser`

