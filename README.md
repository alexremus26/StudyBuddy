# StudyBuddy

StudyBuddy helps students organize academic activities and discover suitable places to study.

## Functional scope

- Planning tasks, assignments, and study blocks.
- Generating schedule drafts with an approval workflow.
- Schedule import/parsing.
- Coffee shop/study place recommendations, including favorites and reviews.
- AI scoring for place profiles (dedicated queue).

## Technical architecture

- Backend: Django + Django REST Framework + drf-spectacular.
- Database: PostgreSQL + PostGIS.
- Frontend: React + Vite.
- Async processing: Celery + Redis (multiple queues).
- Static/media: WhiteNoise + local filesystem in development.

Main Docker services:

- `db` (PostGIS)
- `redis`
- `web` (Django API)
- `worker` (Celery queue `coffeeshops`)
- `apify-worker` (Celery queue `apify`)
- `ai-worker` (Celery queue `ai`, optional Ollama)
- `vite` (frontend dev server)

## Project structure

- `backend/app`: user profile, auth endpoints, overview page.
- `backend/schedule`: models and endpoints for scheduling/task planning.
- `backend/coffeeshops`: locations, reviews, favorites, async tasks.
- `backend/core`: global settings, URLs, Celery config.
- `frontend`: React/Vite application.

## API overview

Main backend routes:

- `/api/register/` and `/api/login/`
- `/api/coffeeshops/...`
- `/api/schedule/...`
- `/api/schema/` (OpenAPI JSON)
- `/api/schema/redoc/` (ReDoc)

OpenAPI documentation is generated with `drf-spectacular`.

## Quick setup (Docker, recommended)

1. Create a `.env` file in the project root.
2. Start the stack:

```bash
docker compose up -d --build
```

3. Run migrations:

```bash
docker compose exec web python manage.py makemigrations
docker compose exec web python manage.py migrate
```

4. (Optional) create an admin user:

```bash
docker compose exec web python manage.py createsuperuser
```

Useful URLs:

- App/API: `http://localhost:8000/`
- Admin: `http://localhost:8000/admin/`
- Frontend dev (Vite): `http://localhost:5173/`
- OpenAPI: `http://localhost:8000/api/schema/`
- ReDoc: `http://localhost:8000/api/schema/redoc/`

For detailed Docker troubleshooting and operations, see `README.Docker.md`.

## Local setup (without Docker)

Prerequisites:

- Python 3.11+
- Node.js 20+
- PostgreSQL + PostGIS extension
- Redis

Backend:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Important: local Django commands run from `backend/` do not automatically load the root `.env` file. Run `source ../.env` (or export variables manually) before using `manage.py`.

Frontend:

```bash
cd frontend
npm install
npm run dev
```

## Relevant environment variables

Minimum required for backend:

- `DJANGO_SECRET_KEY`
- `DEBUG`
- `DJANGO_ALLOWED_HOSTS`
- `DATABASE_ENGINE`
- `DATABASE_NAME`
- `DATABASE_USERNAME`
- `DATABASE_PASSWORD`
- `DATABASE_HOST`
- `DATABASE_PORT`

Optional integrations:

- `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_ESCALATION_CONFIDENCE_THRESHOLD`
- `APIFY_API_TOKEN`, `APIFY_REVIEWS_ACTOR_ID`, `APIFY_MAX_REVIEWS_PER_PLACE`
- `OLLAMA_HOST`, `OLLAMA_MODEL`
- `VITE_MAPBOX_ACCESS_TOKEN` (frontend map)

## Useful commands

```bash
# backend logs
docker compose logs -f web

# service status
docker compose ps

# regenerate OpenAPI schema in container
docker compose exec web python manage.py spectacular --file /app/openapi-schema.yaml --validate

# regenerate frontend API types
docker compose exec vite npm run gen:api
```

## Testing

```bash
# backend tests
docker compose exec web python manage.py test
```

For local runs, the equivalent command is `python manage.py test` in `backend/` with environment variables already loaded.
