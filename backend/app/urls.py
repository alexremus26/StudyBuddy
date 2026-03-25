from django.urls import path
from app import views

urlpatterns = [
    path('', views.overview, name='overview'),
    path('me/', views.me_overview, name='user-profile-overview'),
    path('me/profile/', views.me_profile, name='user-profile'),
    path('users/', views.user_list, name='user-list'),
    path('users/<int:pk>/', views.user_detail, name='user-detail'),
    path("register/", views.register_page, name="register-page"),
]