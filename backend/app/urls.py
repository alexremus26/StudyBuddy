from django.urls import path
from rest_framework.urlpatterns import format_suffix_patterns
from app import views

urlpatterns = [
    path('me/', views.me_overview, name='user-profile-overview'),
    path('me/profile/', views.me_profile, name='user-profile'),
    path('users/', views.user_list, name='user-list'),
    path('users/<int:pk>/', views.user_detail, name='user-detail'),
]

urlpatterns = format_suffix_patterns(urlpatterns)