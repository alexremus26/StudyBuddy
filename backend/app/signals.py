from django.contrib.auth.models import User
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver

from .models import UserProfile, TaskBlock
from .utils import update_user_streak

@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    if created:
        UserProfile.objects.get_or_create(user=instance)

@receiver(post_save, sender=TaskBlock)
def handle_task_block_save(sender, instance, **kwargs):
    update_user_streak(instance.user)

@receiver(post_delete, sender=TaskBlock)
def handle_task_block_delete(sender, instance, **kwargs):
    update_user_streak(instance.user)