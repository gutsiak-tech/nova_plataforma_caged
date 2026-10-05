"""Relatório de prontidão operacional da API (Gold + catálogo)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from app.core.config import GOLD_CAGED_DIR
from app.services.gold_catalog_service import GOLD_CATALOG_JSON, load_gold_catalog
from app.services.gold_service import (
    DefaultCompetenciaError,
    GoldMonthRef,
    list_valid_competencias,
    resolve_default_competencia,
)
from pipelines.gold.publication import (
    inspect_gold_competencia_dir,
    select_published_gold_competencia_dir,
)

GOLD_METADATA_FILENAME = "metadata.json"


def default_gold_metadata_path() -> Path:
    month = resolve_default_competencia(gold_root=GOLD_CAGED_DIR)
    if month is None:
        raise DefaultCompetenciaError(
            "Nenhuma competência Gold válida disponível para uso como padrão."
        )
    month_dir = select_published_gold_competencia_dir(
        GOLD_CAGED_DIR,
        month.ano,
        month.mes,
    )
    return month_dir / GOLD_METADATA_FILENAME


def _apply_gold_metadata_checks(
    month: GoldMonthRef,
    checks: dict[str, bool],
    problems: list[str],
) -> None:
    """Aplica à competência default a mesma validade usada pela API Gold."""
    month_dir = select_published_gold_competencia_dir(
        GOLD_CAGED_DIR,
        month.ano,
        month.mes,
    )
    meta_path = month_dir / GOLD_METADATA_FILENAME
    state = inspect_gold_competencia_dir(month_dir)

    checks["gold_metadata_exists"] = state.metadata_exists
    checks["gold_metadata_readable"] = state.metadata_readable
    checks["gold_metadata_status_ok"] = state.metadata_status_ok
    checks["gold_required_files_ok"] = state.required_files_ok

    if not checks["gold_metadata_exists"]:
        problems.append(
            f"metadata.json da Gold não encontrado para competência default: {meta_path}"
        )
    elif not checks["gold_metadata_readable"]:
        problems.append(f"metadata.json da Gold ilegível: {meta_path}")
    elif not checks["gold_metadata_status_ok"]:
        problems.append(
            "metadata Gold sem validation_status aceitável "
            f"para {month.ano}-{month.mes:02d} "
            f"(validation_status={state.validation_status!r})."
        )

    if not checks["gold_required_files_ok"]:
        problems.append(
            "Arquivos Gold obrigatórios ausentes para competência default: "
            + ", ".join(state.missing_required_files)
        )


def build_readiness_report() -> dict[str, Any]:
    problems: list[str] = []
    checks: dict[str, bool] = {}

    checks["gold_dir_exists"] = GOLD_CAGED_DIR.is_dir()
    if not checks["gold_dir_exists"]:
        problems.append(f"Diretório Gold não encontrado: {GOLD_CAGED_DIR}")

    competencias = list_valid_competencias(gold_root=GOLD_CAGED_DIR)
    checks["competencias_available"] = len(competencias) > 0
    if not checks["competencias_available"]:
        problems.append("Nenhuma competência Gold disponível.")

    checks["catalog_exists"] = GOLD_CATALOG_JSON.is_file()
    if not checks["catalog_exists"]:
        problems.append(f"Catálogo Gold não encontrado: {GOLD_CATALOG_JSON}")

    checks["catalog_readable"] = False
    if checks["catalog_exists"]:
        try:
            load_gold_catalog(GOLD_CATALOG_JSON)
            checks["catalog_readable"] = True
        except OSError as exc:
            problems.append(f"Catálogo Gold não pôde ser lido: {exc}")
    else:
        problems.append("Catálogo Gold não pode ser lido porque o arquivo não existe.")

    default_month: GoldMonthRef | None = None
    checks["default_configuration_valid"] = True
    try:
        default_month = resolve_default_competencia(
            items=competencias,
            gold_root=GOLD_CAGED_DIR,
        )
    except DefaultCompetenciaError as exc:
        checks["default_configuration_valid"] = False
        problems.append(f"Configuração de competência padrão inválida: {exc}")

    checks["default_competencia_available"] = default_month is not None
    if default_month is None and checks["default_configuration_valid"]:
        problems.append("Nenhuma competência Gold válida pode ser usada como padrão.")

    metadata_checks = (
        "gold_metadata_exists",
        "gold_metadata_readable",
        "gold_metadata_status_ok",
        "gold_required_files_ok",
    )
    if default_month is not None:
        _apply_gold_metadata_checks(default_month, checks, problems)
        default_competencia = {
            "ano": default_month.ano,
            "mes": default_month.mes,
            "competencia": f"{default_month.ano}-{default_month.mes:02d}",
        }
    else:
        for check in metadata_checks:
            checks[check] = False
        default_competencia = None

    ready = all(checks.values())
    report: dict[str, Any] = {
        "status": "ready" if ready else "not_ready",
        "checks": checks,
        "default_competencia": default_competencia,
        "available_competencias_count": len(competencias),
    }
    if not ready:
        report["problems"] = problems
    return report
