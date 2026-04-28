from django.core.management.base import BaseCommand, CommandError

from coffeeshops.models import Location
from coffeeshops.tasks import process_location_profile_task


class Command(BaseCommand):
    help = "Queue AI profile generation for all Location rows."

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=0, help="Optional max number of locations to queue")
        parser.add_argument("--offset", type=int, default=0, help="Skip the first N rows")
        parser.add_argument("--only-pending", action="store_true", help="Queue only pending locations")
        parser.add_argument("--dry-run", action="store_true", help="Print locations without queueing")

    def handle(self, *args, **options):
        qs = Location.objects.exclude(google_place_id="").order_by("id")

        if options["only_pending"]:
            qs = qs.filter(status=Location.Pending)

        offset = max(0, options["offset"])
        if offset:
            qs = qs[offset:]

        limit = options["limit"]
        if limit and limit > 0:
            qs = qs[:limit]

        locations = list(qs)

        if not locations:
            raise CommandError("No locations found to process.")

        self.stdout.write(self.style.NOTICE(f"Found {len(locations)} locations"))

        if options["dry_run"]:
            for location in locations:
                self.stdout.write(f"{location.id} {location.name} {location.google_place_id}")
            return

        for location in locations:
            async_result = process_location_profile_task.delay(location.id)
            self.stdout.write(f"Queued {location.id} {location.name} task_id={async_result.id}")