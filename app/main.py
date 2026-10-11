from __future__ import annotations

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.errors import GoldAPIError
from app.api.routes_feature import router as feature_router
from app.api.routes_map import router as map_router
from app.api.routes_gold import router as gold_router
from app.core.config import API_LOG_FILE, CORS_ORIGINS
from app.core.logging import setup_logger
from app.services.gold_readiness import build_readiness_report
from app.services.territorial_warm import start as start_territorial_warm
from app.services.territorial_warm import stop as stop_territorial_warm
from app.services.territorial_warm import warm_enabled

logger = setup_logger("api", API_LOG_FILE)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    logger.info(
        "API iniciada | service=caged-dashboard-api | env=%s | version=%s",
        os.getenv("APP_ENV", "local"),
        os.getenv("APP_VERSION", "dev"),
    )
    if warm_enabled():
        start_territorial_warm()
    yield
    stop_territorial_warm()


app = FastAPI(title="Projeto CAGED API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(map_router)
app.include_router(gold_router)
app.include_router(feature_router)


@app.exception_handler(GoldAPIError)
async def gold_api_error_handler(_request: Request, exc: GoldAPIError) -> JSONResponse:
    logger.warning(
        "Gold API error | code=%s | message=%s | details=%s",
        exc.code,
        exc.message,
        exc.details,
    )
    return JSONResponse(status_code=exc.status_code, content=exc.to_payload())


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "caged-dashboard-api",
        "version": os.getenv("APP_VERSION", "dev"),
        "environment": os.getenv("APP_ENV", "local"),
    }


@app.get("/ready")
def ready():
    report = build_readiness_report()
    status_code = 200 if report["status"] == "ready" else 503
    return JSONResponse(status_code=status_code, content=report)
