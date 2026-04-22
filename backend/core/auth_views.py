from django.conf import settings
from django.contrib.auth import authenticate
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError

from .models import ActiveSession
from .serializers import (
    LoginSerializer,
    RegisterSerializer,
    SessionSerializer,
    UserSerializer,
)


def _get_client_ip(request):
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    return xff.split(",")[0].strip() if xff else request.META.get("REMOTE_ADDR")


def _set_refresh_cookie(response, raw_token):
    response.set_cookie(
        key=settings.AUTH_COOKIE_NAME,
        value=raw_token,
        max_age=settings.AUTH_COOKIE_MAX_AGE,
        httponly=settings.AUTH_COOKIE_HTTPONLY,
        secure=settings.AUTH_COOKIE_SECURE,
        samesite=settings.AUTH_COOKIE_SAMESITE,
        path=settings.AUTH_COOKIE_PATH,
    )


def _clear_refresh_cookie(response):
    response.delete_cookie(
        key=settings.AUTH_COOKIE_NAME,
        path=settings.AUTH_COOKIE_PATH,
        samesite=settings.AUTH_COOKIE_SAMESITE,
    )


def _issue_tokens(user, request):
    """Generate JWT pair, create an ActiveSession row, return (access, refresh)."""
    refresh = RefreshToken.for_user(user)
    ActiveSession.objects.create(
        user=user,
        refresh_jti=str(refresh["jti"]),
        device_info=request.META.get("HTTP_USER_AGENT", "")[:255],
        ip_address=_get_client_ip(request),
    )
    return str(refresh.access_token), str(refresh)


@csrf_exempt
@api_view(["POST"])
def register(request):
    serializer = RegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = serializer.save()
    access, refresh = _issue_tokens(user, request)
    response = Response(
        {"access": access, "user": UserSerializer(user).data},
        status=status.HTTP_201_CREATED,
    )
    _set_refresh_cookie(response, refresh)
    return response


@csrf_exempt
@api_view(["POST"])
def login(request):
    serializer = LoginSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = authenticate(
        request,
        email=serializer.validated_data["email"],
        password=serializer.validated_data["password"],
    )
    if user is None:
        return Response(
            {"error": "Invalid email or password."},
            status=status.HTTP_401_UNAUTHORIZED,
        )
    access, refresh = _issue_tokens(user, request)
    response = Response({"access": access, "user": UserSerializer(user).data})
    _set_refresh_cookie(response, refresh)
    return response


@csrf_exempt
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout(request):
    raw_token = request.COOKIES.get(settings.AUTH_COOKIE_NAME)
    if raw_token:
        try:
            token = RefreshToken(raw_token)
            ActiveSession.objects.filter(refresh_jti=str(token["jti"])).delete()
            token.blacklist()
        except TokenError:
            pass
    response = Response(status=status.HTTP_204_NO_CONTENT)
    _clear_refresh_cookie(response)
    return response


@csrf_exempt
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout_all(request):
    sessions = ActiveSession.objects.filter(user=request.user)
    for session in sessions:
        try:
            token = RefreshToken(session.refresh_jti)
            token.blacklist()
        except TokenError:
            pass
    sessions.delete()
    response = Response(status=status.HTTP_204_NO_CONTENT)
    _clear_refresh_cookie(response)
    return response


@csrf_exempt
@api_view(["POST"])
def refresh(request):
    raw_token = request.COOKIES.get(settings.AUTH_COOKIE_NAME)
    if not raw_token:
        return Response(
            {"error": "No refresh token."},
            status=status.HTTP_401_UNAUTHORIZED,
        )
    try:
        old_token = RefreshToken(raw_token)
    except TokenError:
        response = Response(
            {"error": "Invalid or expired refresh token."},
            status=status.HTTP_401_UNAUTHORIZED,
        )
        _clear_refresh_cookie(response)
        return response

    old_jti = str(old_token["jti"])
    session = ActiveSession.objects.filter(refresh_jti=old_jti).first()
    if not session:
        return Response(
            {"error": "Session revoked."},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    # Issue new access token; rotate refresh token
    access = str(old_token.access_token)
    new_refresh = RefreshToken.for_user(session.user)
    session.refresh_jti = str(new_refresh["jti"])
    session.save(update_fields=["refresh_jti", "last_used"])

    # Blacklist old refresh token
    try:
        old_token.blacklist()
    except TokenError:
        pass

    response = Response({"access": access})
    _set_refresh_cookie(response, str(new_refresh))
    return response


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me(request):
    return Response(UserSerializer(request.user).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def sessions(request):
    qs = ActiveSession.objects.filter(user=request.user).order_by("-last_used")
    return Response(SessionSerializer(qs, many=True).data)
