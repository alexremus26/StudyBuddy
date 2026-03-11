### Building and running your application

When you're ready, start your application by running:
`docker compose up --build`.

Your application will be available at http://localhost:8000.

When making changes to the model run:

`docker compose exec django-web python manage.py makemigrations`.
`docker compose exec django-web python manage.py migrate`.

When starting the project without building the image:

`docker compose up -d`.
