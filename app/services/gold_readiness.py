"""Relatório de prontidão operacional da API (Gold + catálogo)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.core.config import DEFAULT_ANO, DEFAULT_MES, GOLD_CAGED_DIR
from app.services.gold_catalog_service import GOLD_CATALOG_JSON, load_gold_catalog
from app.services.gold_service import get_competencias_payload, list_available_competencias

GOLD_METADATA_FILENAME = "metadata.json"


def default_gold_metadata_path() -> Path:
    return GOLD_CAGED_DIR / f"ano={DEFAULT_ANO}" / f"mes={DEFAULT_MES:02d}" / GOLD_METADATA_FILENAME


def _apply_gold_metadata_checks(checks: dict[str, bool], problems: list[str]) -> None:
    """Checagens leves via metadata.json da competência default (sem ler CSVs)."""
    meta_path = default_gold_metadata_path()
    checks["gold_metadata_exists"] = meta_path.is_file()
    if not checks["gold_metadata_exists"]:
        problems.append(
            f"metadata.json da Gold não encontrado para competência default: {meta_path}"
        )
        checks["gold_metadata_readable"] = False
        checks["gold_metadata_status_ok"] = False
        return

    try:
        payload = json.loads(meta_path.read_text(encoding="utf-8"))
        checks["gold_metadata_readable"] = True
    except (OSError, json.JSONDecodeError) as exc:
        checks["gold_metadata_readable"] = False
        checks["gold_metadata_status_ok"] = False
        problems.append(f"metadata.json da Gold ilegível ({meta_path}): {exc}")
        return

    status = str(payload.get("validation_status") or "").lower()
    legacy = str(payload.get("status") or "").lower()
    if status == "error" or legacy == "gold_error":
        checks["gold_metadata_status_ok"] = False
        problems.append(
            f"metadata Gold com validation_status=error para "
            f"{DEFAULT_ANO}-{DEFAULT_MES:02d}."
        )
    elif status in ("ok", "warning") or legacy in ("gold_ok", "gold_warning"):
        checks["gold_metadata_status_ok"] = True
    else:
        checks["gold_metadata_status_ok"] = False
        problems.append(
            "metadata Gold sem validation_status reconhecido "
            f"(validation_status={status!r}, status={legacy!r})."
        )


def build_readiness_report() -> dict[str, Any]:
    problems: list[str] = []
    checks: dict[str, bool] = {}

    checks["gold_dir_exists"] = GOLD_CAGED_DIR.is_dir()
    if not checks["gold_dir_exists"]:
        problems.append(f"Diretório Gold não encontrado: {GOLD_CAGED_DIR}")

    competencias = list_available_competencias()
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

    checks["default_configured"] = DEFAULT_ANO is not None and DEFAULT_MES is not None
    if not checks["default_configured"]:
        problems.append("DEFAULT_ANO ou DEFAULT_MES não configurados.")

    payload = get_competencias_payload()
    default_competencia = payload.get("default")
    checks["default_competencia_available"] = default_competencia is not None
    if not checks["default_competencia_available"]:
        problems.append(
            f"Competência default ({DEFAULT_ANO}-{DEFAULT_MES:02d}) não disponível na Gold."
        )

    _apply_gold_metadata_checks(checks, problems)

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
