"""
URL configuration for StudyBuddy project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/4.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from rest_framework.authtoken import views as authViews
from app import views
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView


urlpatterns = [
    path('admin/', admin.site.urls),
    path('', include('app.urls')),
    path('api/coffeeshops/', include('coffeeshops.urls')),
    path('api/schedule/', include('schedule.urls')),
    path('api/register/', views.user_register, name='user-register'),
    path('api-auth/', include('rest_framework.urls', namespace='rest_framework')),
    path('api/login/', authViews.obtain_auth_token, name='api_login'),
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/schema/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

urlpatterns += [
    re_path(r'^(?!api/|api-auth/|admin/|media/).*$' , views.overview, name='spa-fallback'),
]
