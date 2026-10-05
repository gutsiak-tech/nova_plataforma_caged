from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import APIRouter, Query

import pandas as pd

from app.api.errors import GoldAPIError, raise_gold_api_error
from app.core.config import API_LOG_FILE
from app.core.logging import setup_logger
from app.services.gold_catalog_service import (
    GOLD_CATALOG_JSON,
    filter_catalog,
    load_gold_catalog,
    normalize_catalog_scope_filter,
)
from app.services.gold_service import (
    CompetenciaNotFoundError,
    GoldMonthRef,
    Scope,
    competencia_is_available,
    dataframe_to_records,
    ensure_competencia_available,
    get_available_tables_for_month,
    get_competencias_payload,
    get_table_csv_path,
    gold_month_relative_path,
    is_br_only_table,
    read_gold_table,
    relative_project_path,
    resolve_gold_month,
)

router = APIRouter(prefix="/api/gold/v1", tags=["gold"])
logger = setup_logger("api.gold", API_LOG_FILE)


def _parse_scope(scope: str) -> Scope:
    scope = (scope or "").strip().lower()
    if scope in ("br", "pr", "rmc"):
        return scope  # type: ignore[return-value]
    raise_gold_api_error(
        "INVALID_SCOPE",
        "scope inválido. Use: br | pr | rmc",
        {"scope": scope},
        status_code=400,
    )


def _resolve_month(ano: int | None, mes: int | None) -> GoldMonthRef:
    try:
        return resolve_gold_month(ano=ano, mes=mes)
    except ValueError as exc:
        raise GoldAPIError(
            "INVALID_COMPETENCIA",
            str(exc),
            status_code=400,
        ) from exc


def _competencia_error_from_month(month: GoldMonthRef) -> GoldAPIError:
    return GoldAPIError(
        "GOLD_COMPETENCIA_NOT_FOUND",
        "Competência Gold não encontrada.",
        {
            "ano": month.ano,
            "mes": month.mes,
            "expected_path": gold_month_relative_path(month),
        },
        status_code=404,
    )


def _ensure_competencia(month: GoldMonthRef) -> None:
    try:
        ensure_competencia_available(month)
    except CompetenciaNotFoundError as exc:
        logger.warning(
            "Competência Gold não encontrada | ano=%s | mes=%s | path=%s",
            month.ano,
            month.mes,
            gold_month_relative_path(month),
        )
        raise _competencia_error_from_month(exc.month) from exc


def _table_not_found_error(
    month: GoldMonthRef,
    base_name: str,
    scope: Scope,
    path: Path,
) -> GoldAPIError:
    logger.warning(
        "Tabela Gold não encontrada | competencia=%s-%02d | table=%s | scope=%s | path=%s",
        month.ano,
        month.mes,
        base_name,
        scope,
        path,
    )
    return GoldAPIError(
        "GOLD_TABLE_NOT_FOUND",
        "Tabela Gold não encontrada.",
        {
            "ano": month.ano,
            "mes": month.mes,
            "table": base_name,
            "scope": scope,
            "expected_path": relative_project_path(path),
        },
        status_code=404,
    )


def _top_rows(
    base_name: str,
    *,
    month: GoldMonthRef,
    scope: Scope,
    sort_by: str = "saldo",
    limit: int = 12,
):
    df = read_gold_table(month, base_name=base_name, scope=scope)
    if sort_by not in df.columns:
        numeric_cols = [
            c
            for c in df.columns
            if c
            not in (
                "uf",
                "municipio",
                "secao",
                "cbo2002ocupacao",
                "sexo",
                "faixa_etaria",
                "graudeinstrucao",
            )
        ]
        fallback = "saldo" if "saldo" in df.columns else (numeric_cols[0] if numeric_cols else None)
        if not fallback:
            return []
        sort_by = fallback
    return dataframe_to_records(df, limit=limit, offset=0, sort_by=sort_by, sort_dir="desc")["rows"]


@router.get("/catalog")
def catalog(
    ano: int | None = Query(None),
    mes: int | None = Query(None),
    scope: str | None = Query(None),
    granularity: str | None = Query(None),
    suspected_legacy: bool | None = Query(None),
):
    if not GOLD_CATALOG_JSON.is_file():
        logger.warning("Catálogo Gold não encontrado em %s", GOLD_CATALOG_JSON)
        raise_gold_api_error(
            "GOLD_CATALOG_NOT_FOUND",
            "Catálogo Gold não encontrado.",
            {"expected_path": str(GOLD_CATALOG_JSON)},
            status_code=404,
        )

    try:
        payload = load_gold_catalog(GOLD_CATALOG_JSON)
    except OSError as exc:
        logger.error("Falha ao ler catálogo Gold: %s", exc)
        raise GoldAPIError(
            "GOLD_CATALOG_UNREADABLE",
            "Catálogo Gold não pôde ser lido.",
            {"path": str(GOLD_CATALOG_JSON)},
            status_code=500,
        ) from exc

    if scope is not None:
        try:
            normalize_catalog_scope_filter(scope)
        except ValueError as exc:
            raise GoldAPIError(
                "INVALID_SCOPE",
                str(exc),
                {"scope": scope},
                status_code=400,
            ) from exc

    if ano is not None and mes is not None:
        month = _resolve_month(ano, mes)
        _ensure_competencia(month)

    filtered = filter_catalog(
        payload,
        ano=ano,
        mes=mes,
        scope=scope,
        granularity=granularity,
        suspected_legacy=suspected_legacy,
    )
    return filtered


@router.get("/competencias")
def competencias():
    try:
        return get_competencias_payload()
    except OSError as exc:
        logger.error("Falha ao listar competências Gold: %s", exc)
        raise GoldAPIError(
            "INTERNAL_ERROR",
            "Erro ao ler competências disponíveis na camada Gold.",
            status_code=500,
        ) from exc


@router.get("/meta")
def meta(
    ano: int | None = Query(None),
    mes: int | None = Query(None),
):
    month = _resolve_month(ano, mes)
    _ensure_competencia(month)
    return {
        "month": {"ano": month.ano, "mes": month.mes},
        "scopes": [
            {"id": "br", "label": "Brasil"},
            {"id": "pr", "label": "Paraná"},
            {"id": "rmc", "label": "RMC"},
        ],
        "tables": get_available_tables_for_month(month),
    }


@router.get("/table/{base_name}")
def table(
    base_name: str,
    scope: str = Query("br"),
    ano: int | None = Query(None),
    mes: int | None = Query(None),
    limit: int = Query(50, ge=1, le=2000),
    offset: int = Query(0, ge=0),
    sort_by: str | None = None,
    sort_dir: str = Query("desc"),
):
    sc = _parse_scope(scope)
    month = _resolve_month(ano, mes)
    _ensure_competencia(month)

    if is_br_only_table(base_name) and sc != "br":
        raise GoldAPIError(
            "INVALID_SCOPE",
            f"{base_name} está disponível apenas para scope=br (resumo nacional).",
            {"table": base_name, "scope": sc, "allowed_scopes": ["br"]},
            status_code=400,
        )

    try:
        df = read_gold_table(month, base_name=base_name, scope=sc)
    except FileNotFoundError as exc:
        path = get_table_csv_path(month, base_name=base_name, scope=sc)
        if not competencia_is_available(month):
            raise _competencia_error_from_month(month) from exc
        raise _table_not_found_error(month, base_name, sc, path) from exc

    try:
        return {
            "month": {"ano": month.ano, "mes": month.mes},
            "scope": sc,
            "table": base_name,
            "columns": list(df.columns),
            **dataframe_to_records(
                df,
                limit=limit,
                offset=offset,
                sort_by=sort_by,
                sort_dir="asc" if sort_dir == "asc" else "desc",
            ),
        }
    except ValueError as exc:
        raise GoldAPIError(
            "INVALID_COMPETENCIA",
            str(exc),
            {
                "ano": month.ano,
                "mes": month.mes,
                "table": base_name,
            },
            status_code=400,
        ) from exc


@router.get("/overview")
def overview(
    scope: str = Query("br"),
    ano: int | None = Query(None),
    mes: int | None = Query(None),
):
    sc = _parse_scope(scope)
    month = _resolve_month(ano, mes)
    _ensure_competencia(month)

    resumo_row = None
    if sc == "br":
        try:
            resumo = read_gold_table(month, base_name="tabela_resumo", scope="br")
            resumo_row = (
                dataframe_to_records(resumo, limit=1, offset=0)["rows"][0] if len(resumo) else None
            )
        except FileNotFoundError:
            resumo_row = None

    def _kpi_sums(df: pd.DataFrame) -> dict[str, Any]:
        for c in ("admissoes", "desligamentos", "saldo"):
            if c not in df.columns:
                raise ValueError(
                    f"Coluna '{c}' ausente na tabela Gold. Colunas: {list(df.columns)}"
                )
        return {
            "admissoes": float(pd.to_numeric(df["admissoes"], errors="coerce").fillna(0).sum()),
            "desligamentos": float(
                pd.to_numeric(df["desligamentos"], errors="coerce").fillna(0).sum()
            ),
            "saldo": float(pd.to_numeric(df["saldo"], errors="coerce").fillna(0).sum()),
        }

    if sc == "pr":
        uf_df = read_gold_table(month, base_name="tabela_uf", scope="br")
        if "uf" not in uf_df.columns:
            raise_gold_api_error(
                "INTERNAL_ERROR",
                f"Coluna 'uf' ausente em tabela_uf. Colunas: {list(uf_df.columns)}",
                status_code=500,
            )
        uf_col = uf_df["uf"].astype(str)
        uf_pr = uf_df[uf_col.str.upper() == "PR"]
        if len(uf_pr) == 0:
            uf_pr = uf_df[uf_col.str.strip().str.lower() == "paraná"]
        resumo_row = (
            _kpi_sums(uf_pr)
            if len(uf_pr)
            else {"admissoes": 0.0, "desligamentos": 0.0, "saldo": 0.0}
        )

    if sc == "rmc":
        mun_rmc = read_gold_table(month, base_name="tabela_municipio", scope="rmc")
        resumo_row = (
            _kpi_sums(mun_rmc)
            if len(mun_rmc)
            else {"admissoes": 0.0, "desligamentos": 0.0, "saldo": 0.0}
        )

    def _safe_top_rows(base_name: str, *, limit: int = 12):
        try:
            return _top_rows(base_name, month=month, scope=sc, limit=limit)
        except FileNotFoundError as exc:
            path = get_table_csv_path(month, base_name=base_name, scope=sc)
            raise _table_not_found_error(month, base_name, sc, path) from exc

    payload = {
        "month": {"ano": month.ano, "mes": month.mes},
        "scope": sc,
        "resumo": resumo_row,
        "rankings": {
            "uf": _safe_top_rows("tabela_uf", limit=12) if sc == "br" else None,
            "municipio": _safe_top_rows("tabela_municipio", limit=15),
            "setor": _safe_top_rows("tabela_setor", limit=12),
            "ocupacao": _safe_top_rows("tabela_ocupacao", limit=12),
        },
        "profiles": {
            "sexo": _safe_top_rows("tabela_perfil_sexo", limit=10),
            "faixa_etaria": _safe_top_rows("tabela_perfil_faixa_etaria", limit=20),
            "graudeinstrucao": _safe_top_rows("tabela_perfil_graudeinstrucao", limit=20),
            "sexo_faixa_etaria": _safe_top_rows("tabela_perfil_sexo_faixa_etaria", limit=24),
            "sexo_instrucao": _safe_top_rows("tabela_perfil_sexo_instrucao", limit=24),
            "faixa_etaria_instrucao": _safe_top_rows(
                "tabela_perfil_faixa_etaria_instrucao", limit=24
            ),
        },
        "salary_profiles": {
            "sexo": _safe_top_rows("tabela_perfil_sexo_salario", limit=10),
            "faixa_etaria": _safe_top_rows("tabela_perfil_faixa_etaria_salario", limit=20),
            "graudeinstrucao": _safe_top_rows("tabela_perfil_graudeinstrucao_salario", limit=20),
            "sexo_faixa_etaria": _safe_top_rows(
                "tabela_perfil_sexo_faixa_etaria_salario", limit=24
            ),
            "sexo_instrucao": _safe_top_rows("tabela_perfil_sexo_instrucao_salario", limit=24),
            "faixa_etaria_instrucao": _safe_top_rows(
                "tabela_perfil_faixa_etaria_instrucao_salario", limit=24
            ),
        },
    }
    return payload
