"""
api/server.py
─────────────
Phase 3.0 — FastAPI application factory.

Run the server with:
    uvicorn api.server:app --reload --port 8000

Or via Python:
    python -m uvicorn api.server:app --reload --port 8000

The app exposes an OpenAPI schema at /docs (Swagger UI) and /redoc.
"""

from __future__ import annotations

import logging
import os

# ── Must be set BEFORE any transformers/sentence-transformers import ───────────
os.environ.setdefault("TRANSFORMERS_NO_TF", "1")
os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", "0")

from contextlib import asynccontextmanager

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from api.routes import limiter, router

# ─── Logging configuration ─────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Guard: ensure required API keys are present before the server accepts traffic
# ─────────────────────────────────────────────────────────────────────────────
_missing_keys = []
if not os.environ.get("GEMINI_API_KEY"):
    _missing_keys.append("GEMINI_API_KEY")
if not os.environ.get("TAVILY_API_KEY"):
    _missing_keys.append("TAVILY_API_KEY")

if _missing_keys:
    raise EnvironmentError(
        f"Missing required API keys: {', '.join(_missing_keys)}. "
        "Copy .env.example → .env and fill in the values before starting the server."
    )


# ─────────────────────────────────────────────────────────────────────────────
# Lifespan — runs once at startup and once at shutdown
# ─────────────────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Startup: importing api.dependencies triggers the embedding model warm-up
    and the MemorySaver graph compilation at module import time.  The lifespan
    hook here logs startup completion so operators can confirm readiness.

    Shutdown: no explicit teardown needed (ChromaDB writes are committed
    synchronously; MemorySaver state is in-process and ephemeral).
    """
    # Trigger dependency module import — this is where the heavy lifting happens:
    #   • HuggingFaceEmbeddings model loaded
    #   • configure_embeddings() called (nodes.py singleton registered)
    #   • LangGraph StateGraph compiled with MemorySaver
    import api.dependencies  # noqa: F401

    logger.info("═" * 58)
    logger.info("  🛍️   Product Recommendation Agent API  —  Phase 3.0")
    logger.info("  Gemini 2.5 Flash · LangGraph · ChromaDB · FastAPI · SSE")
    logger.info("═" * 58)
    logger.info("  ✅  API server ready.  Docs: http://localhost:8000/docs")
    logger.info("═" * 58)

    yield  # Application runs here

    logger.info("  👋  Shutting down API server…")


# ─────────────────────────────────────────────────────────────────────────────
# FastAPI Application
# ─────────────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Product Recommendation Agent API",
    description=(
        "Production-grade FastAPI backend for the AI Product Concierge.\n\n"
        "**Phase 3.0** upgrades the CLI-based LangGraph recommendation engine into "
        "a streaming REST API designed to serve a React/Next.js frontend.\n\n"
        "## Key Features\n"
        "- **SSE Streaming** — token-level streaming via Server-Sent Events so users "
        "see the response as it generates, not 15 seconds later.\n"
        "- **Session Management** — in-memory `SessionStore` preserves LangGraph "
        "interview state (constraints, retrieved products, mode flags) across stateless "
        "HTTP requests.\n"
        "- **Rate Limiting** — `slowapi` enforces 20 req/min per IP on the chat "
        "endpoint to protect Tavily and Gemini free-tier quotas.\n"
        "- **Devil's Advocate** — dedicated `/advocate` endpoint triggers the "
        "adversarial forum-critique pipeline for a specific product.\n"
    ),
    version="3.0.0",
    contact={
        "name": "Product Recommendation Agent",
        "url":  "https://github.com/Vijey005/Product-Recommendation-Agent",
    },
    license_info={"name": "MIT"},
    openapi_tags=[
        {"name": "System",   "description": "Health checks and infrastructure probes."},
        {"name": "Session",  "description": "Per-session state inspection endpoints."},
        {"name": "Chat",     "description": "Primary SSE chat endpoint (interview + RAG)."},
        {"name": "Advocate", "description": "Devil's Advocate adversarial critique pipeline."},
    ],
    lifespan=lifespan,
)


# ─────────────────────────────────────────────────────────────────────────────
# Rate Limiter Middleware
# ─────────────────────────────────────────────────────────────────────────────
# slowapi reads the `limiter` instance from `app.state.limiter`.
# The SlowAPIMiddleware intercepts requests and enforces limits declared via
# the @limiter.limit() decorator on individual routes in routes.py.
# ─────────────────────────────────────────────────────────────────────────────

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)


# ─────────────────────────────────────────────────────────────────────────────
# CORS Middleware
# ─────────────────────────────────────────────────────────────────────────────
# allow_origins=["*"] is intentional for local frontend development.
# In production, replace "*" with your specific frontend origin:
#   allow_origins=["https://your-app.vercel.app"]
# ─────────────────────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],        # Lock down in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"],
)


# ─────────────────────────────────────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────────────────────────────────────

app.include_router(router)


# ─────────────────────────────────────────────────────────────────────────────
# Global exception handler — catches unhandled errors and returns clean JSON
# ─────────────────────────────────────────────────────────────────────────────

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {type(exc).__name__}: {exc}"},
    )


# ─────────────────────────────────────────────────────────────────────────────
# Dev entrypoint — allows `python api/server.py` for quick local testing
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "api.server:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
    )
