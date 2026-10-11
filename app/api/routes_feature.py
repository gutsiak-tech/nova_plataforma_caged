from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Query

from app.api.errors import GoldAPIError
from app.api.routes_gold import _competencia_error_from_month, _ensure_competencia, _resolve_month
from app.services.feature_gold_service import (
    FeatureAssetMissingError,
    FeatureDataError,
    FeatureNotFoundError,
    get_municipality_feature,
    get_uf_feature,
)
from app.services.gold_service import CompetenciaNotFoundError
from app.services.territorial_response_cache import territorial_response_cache
from app.services.territorial_response_sources import (
    feature_logical_key,
    municipality_feature_sources,
    uf_feature_sources,
)
from pipelines.gold.feature_contract import (
    FEATURE_RANKING_DEFAULT_LIMIT,
    FEATURE_RANKING_MAX_LIMIT,
)

router = APIRouter(prefix="/api/gold/v1", tags=["gold-feature"])

SalaryMovement = Literal["admissao", "desligamento"]


def _parse_salary_movement(movement: str) -> SalaryMovement:
    normalized = (movement or "").strip().lower()
    if normalized in ("admissao", "desligamento"):
        return normalized  # type: ignore[return-value]
    raise GoldAPIError(
        "INVALID_SALARY_MOVEMENT",
        "movimento salarial inválido. Use: admissao | desligamento",
        {"movimento": movement},
        status_code=400,
    )


def _feature_error(exc: Exception) -> GoldAPIError:
    if isinstance(exc, FeatureNotFoundError):
        return GoldAPIError("FEATURE_NOT_FOUND", str(exc), exc.details, status_code=404)
    if isinstance(exc, FeatureAssetMissingError):
        return GoldAPIError(
            "GOLD_TABLE_NOT_FOUND",
            str(exc),
            exc.details,
            status_code=404,
        )
    if isinstance(exc, FeatureDataError):
        return GoldAPIError("INTERNAL_ERROR", str(exc), exc.details, status_code=500)
    if isinstance(exc, CompetenciaNotFoundError):
        return _competencia_error_from_month(exc.month)
    if isinstance(exc, FileNotFoundError):
        return GoldAPIError(
            "GOLD_TABLE_NOT_FOUND",
            "Tabela Gold de movimento não encontrada.",
            status_code=404,
        )
    raise exc


@router.get("/feature/uf/{uf_sigla}")
def feature_uf(
    uf_sigla: str,
    ano: int | None = Query(None),
    mes: int | None = Query(None),
    movimento: str = Query("admissao"),
    limit: int = Query(FEATURE_RANKING_DEFAULT_LIMIT, ge=1, le=FEATURE_RANKING_MAX_LIMIT),
):
    sigla = (uf_sigla or "").strip().upper()
    if len(sigla) != 2 or not sigla.isalpha():
        raise GoldAPIError(
            "INVALID_FEATURE_ID",
            "Identificador de UF inválido. Use a sigla, por exemplo SP.",
            {"id": uf_sigla},
            status_code=400,
        )
    month = _resolve_month(ano, mes)
    _ensure_competencia(month)
    salary_movement = _parse_salary_movement(movimento)
    try:
        return territorial_response_cache.serve(
            feature_logical_key("uf", sigla, month.ano, month.mes, salary_movement, limit),
            uf_feature_sources(month),
            lambda: get_uf_feature(
                sigla,
                month,
                movimento=salary_movement,
                limit=limit,
            ),
        )
    except (FeatureNotFoundError, FeatureAssetMissingError, FeatureDataError, FileNotFoundError) as exc:
        raise _feature_error(exc) from exc


@router.get("/feature/municipality/{cod_municipio}")
def feature_municipality(
    cod_municipio: str,
    ano: int | None = Query(None),
    mes: int | None = Query(None),
    movimento: str = Query("admissao"),
    limit: int = Query(FEATURE_RANKING_DEFAULT_LIMIT, ge=1, le=FEATURE_RANKING_MAX_LIMIT),
):
    code = (cod_municipio or "").strip()
    if len(code) != 7 or not code.isdigit():
        raise GoldAPIError(
            "INVALID_FEATURE_ID",
            "Identificador de município inválido. Use o código IBGE de 7 dígitos.",
            {"id": cod_municipio},
            status_code=400,
        )
    month = _resolve_month(ano, mes)
    _ensure_competencia(month)
    salary_movement = _parse_salary_movement(movimento)
    try:
        return territorial_response_cache.serve(
            feature_logical_key(
                "municipality",
                code,
                month.ano,
                month.mes,
                salary_movement,
                limit,
            ),
            municipality_feature_sources(month),
            lambda: get_municipality_feature(
                code,
                month,
                movimento=salary_movement,
                limit=limit,
            ),
        )
    except (FeatureNotFoundError, FeatureAssetMissingError, FeatureDataError, FileNotFoundError) as exc:
        raise _feature_error(exc) from exc
