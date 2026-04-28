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
- For OCR packages specifically: `docker compose exec vite npm install tesseract.js pdfjs-dist`

Mapbox map:
- Add `VITE_MAPBOX_ACCESS_TOKEN` to your root `.env` so the `vite` container can read it.
- If you build the frontend image directly, pass the same value as a build arg.

Schedule parser (Hybrid + Gemini):
- Hybrid OCR runs locally by default and does not require an API key.
- For harder schedules, backend can auto-escalate to Gemini when confidence is low.
- Configure in `.env`: `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_ESCALATION_CONFIDENCE_THRESHOLD`.
- After changing parser env values: `docker compose up -d --build web`.

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

## OCR Troubleshooting

PDF worker loading issues:
- If PDF import stays in processing, rebuild vite and restart: `docker compose build vite && docker compose up -d vite`
- Confirm frontend dependency install completed in vite container.

OCR language assets fetch issues:
- First OCR run downloads language assets and can be slow on poor network.
- Retry once after connection stabilizes.

Large PDF performance:
- v1 OCR import processes a limited number of pages and may take time for scanned PDFs.
- Prefer smaller PDFs or split very large files before import.

Permission issues while installing frontend packages:
- If host npm install fails with EACCES, run installs inside the vite container.
- Existing flow: `docker compose exec vite npm install ...`

