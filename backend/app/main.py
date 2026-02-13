"""
HUSH Backend - Zero-Knowledge Message Relay
The server never decrypts anything.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings, validate_security_settings
from app.database import init_db, close_db
from app.routers import auth, threads, messages, health, websocket
from app.middleware.security import SecurityMiddleware
from app.logging_config import setup_logging
from app.services.connection_cleanup import start_cleanup_task
from app.services.heartbeat import start_heartbeat_task


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler"""
    # Setup logging
    setup_logging()

    # Validate deployment-critical settings before opening connections.
    validate_security_settings(settings)

    # Startup
    await init_db()

    # Start background tasks
    await start_cleanup_task()
    await start_heartbeat_task()

    yield

    # Shutdown
    await close_db()


def create_app() -> FastAPI:
    """Application factory"""
    app = FastAPI(
        title="HUSH",
        description="Zero-Knowledge Encrypted Chat Vault",
        version="1.0.0",
        docs_url=None,      # Disable Swagger in production
        redoc_url=None,     # Disable ReDoc in production
        openapi_url=None,   # Disable OpenAPI schema
        lifespan=lifespan
    )

    # Security middleware (IP blocking, rate limiting)
    app.add_middleware(SecurityMiddleware)

    # CORS - restrictive
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.FRONTEND_URL],
        allow_credentials=True,
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )

    # Register routers
    app.include_router(health.router, tags=["health"])
    app.include_router(auth.router, prefix="/api", tags=["auth"])
    app.include_router(threads.router, prefix="/api", tags=["threads"])
    app.include_router(messages.router, prefix="/api", tags=["messages"])
    app.include_router(websocket.router, tags=["websocket"])

    return app


app = create_app()
