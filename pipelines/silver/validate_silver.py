"""Validação de qualidade da camada Silver."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from app.core.config import BRONZE_CAGED_DIR, PIPELINE_LOG_FILE
from app.core.logging import setup_logger
from pipelines.silver.silver_contract import (
    CRITICAL_NON_NULL_COLUMNS,
    DERIVED_COLUMNS,
    MAPPED_CATEGORICAL_COLUMNS,
    NUMERIC_COLUMNS,
    RECOMMENDED_INPUT_COLUMNS,
    REQUIRED_INPUT_COLUMNS,
    SILVER_OUTPUT_FILE,
)

logger = setup_logger("silver.validate", PIPELINE_LOG_FILE)


class SilverValidationError(Exception):
    """Falha crítica na validação Silver — impede Gold."""

    def __init__(self, message: str, *, errors: list[str] | None = None) -> None:
        super().__init__(message)
        self.errors = errors or [message]


@dataclass
class SilverValidationResult:
    ano: int
    mes: int
    competencia: str
    silver_file: str = SILVER_OUTPUT_FILE
    row_count: int = 0
    column_count: int = 0
    columns: list[str] = field(default_factory=list)
    required_columns_ok: bool = False
    missing_required_columns: list[str] = field(default_factory=list)
    missing_derived_columns: list[str] = field(default_factory=list)
    null_critical_columns: list[str] = field(default_factory=list)
    competencia_matches_expected: bool = False
    saldo_values: list = field(default_factory=list)
    admissao_sum: int = 0
    desligamento_sum: int = 0
    saldo_sum: int = 0
    saldo_consistency_ok: bool = False
    generated_at: str = ""
    validation_status: str = "error"
    warnings: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    def to_metadata(self) -> dict:
        legacy_status = {
            "ok": "silver_ok",
            "warning": "silver_warning",
            "error": "silver_error",
        }.get(self.validation_status, "silver_error")

        return {
            "ano": self.ano,
            "mes": self.mes,
            "competencia": self.competencia,
            "silver_file": self.silver_file,
            "row_count": self.row_count,
            "column_count": self.column_count,
            "columns": self.columns,
            "status": legacy_status,
            "validation_status": self.validation_status,
            "warnings": self.warnings,
            "errors": self.errors,
            "required_columns_ok": self.required_columns_ok,
            "missing_required_columns": self.missing_required_columns,
            "missing_derived_columns": self.missing_derived_columns,
            "null_critical_columns": self.null_critical_columns,
            "competencia_matches_expected": self.competencia_matches_expected,
            "saldo_values": self.saldo_values,
            "admissao_sum": self.admissao_sum,
            "desligamento_sum": self.desligamento_sum,
            "saldo_sum": self.saldo_sum,
            "saldo_consistency_ok": self.saldo_consistency_ok,
            "generated_at": self.generated_at,
        }


def _expected_competenciamov(ano: int, mes: int) -> str:
    return f"{ano}{mes:02d}"


def _bronze_mes_dir(ano: int, mes: int) -> Path:
    return BRONZE_CAGED_DIR / f"ano={ano}" / f"mes={mes:02d}"


def check_bronze_metadata_gate(ano: int, mes: int) -> list[str]:
    """Consulta metadata Bronze; bloqueia apenas se validation_status=error."""
    warnings: list[str] = []
    meta_path = _bronze_mes_dir(ano, mes) / "metadata.json"

    if not meta_path.is_file():
        msg = (
            f"metadata.json da Bronze não encontrado em {meta_path.parent}. "
            "Silver prossegue sem gate (recomenda-se --validate-bronze-only antes)."
        )
        warnings.append(msg)
        logger.warning("[SILVER] %s", msg)
        return warnings

    try:
        payload = json.loads(meta_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        msg = f"metadata.json da Bronze ilegível: {exc}. Silver prossegue com ressalva."
        warnings.append(msg)
        logger.warning("[SILVER] %s", msg)
        return warnings

    status = str(payload.get("validation_status") or "").lower()
    legacy = str(payload.get("status") or "").lower()

    if status == "error" or legacy == "bronze_error":
        raise SilverValidationError(
            f"metadata Bronze indica validation_status=error para {ano}-{mes:02d}. "
            "Corrija a Bronze (--validate-bronze-only) antes de gerar a Silver.",
            errors=[
                "metadata Bronze com validation_status=error",
                *payload.get("errors", []),
            ],
        )

    if status == "warning" or legacy == "bronze_warning":
        msg = (
            f"metadata Bronze com validation_status=warning para {ano}-{mes:02d}. "
            "Silver prossegue; revise warnings da Bronze."
        )
        warnings.append(msg)
        logger.warning("[SILVER] %s", msg)

    return warnings


def validate_silver_dataframe(
    df: pd.DataFrame,
    ano: int,
    mes: int,
) -> SilverValidationResult:
    """Valida DataFrame Silver após transformações."""
    competencia = f"{ano}-{mes:02d}"
    expected_mov = _expected_competenciamov(ano, mes)
    result = SilverValidationResult(
        ano=ano,
        mes=mes,
        competencia=competencia,
        generated_at=datetime.now(timezone.utc).isoformat(),
        row_count=len(df),
        column_count=len(df.columns),
        columns=sorted(df.columns.tolist()),
    )

    if df.empty:
        result.errors.append("DataFrame Silver está vazio após transformações.")
        result.validation_status = "error"
        return result

    result.missing_required_columns = [
        col for col in REQUIRED_INPUT_COLUMNS if col not in df.columns
    ]
    result.required_columns_ok = not result.missing_required_columns
    if result.missing_required_columns:
        result.errors.append(
            "Colunas obrigatórias ausentes na Silver: "
            + ", ".join(result.missing_required_columns)
        )

    result.missing_derived_columns = [
        col for col in DERIVED_COLUMNS if col not in df.columns
    ]
    if result.missing_derived_columns:
        result.errors.append(
            "Colunas derivadas ausentes na Silver: "
            + ", ".join(result.missing_derived_columns)
        )

    missing_recommended = [
        col for col in RECOMMENDED_INPUT_COLUMNS if col not in df.columns
    ]
    if missing_recommended:
        result.warnings.append(
            "Colunas recomendadas ausentes: " + ", ".join(missing_recommended)
        )

    result.null_critical_columns = [
        col
        for col in CRITICAL_NON_NULL_COLUMNS
        if col in df.columns and df[col].notna().sum() == 0
    ]
    for col in result.null_critical_columns:
        result.errors.append(f"Coluna crítica '{col}' está 100% nula na Silver.")

    if "competenciamov" in df.columns:
        mov_values = (
            df["competenciamov"]
            .dropna()
            .astype(str)
            .str.replace(r"\.0$", "", regex=True)
            .unique()
            .tolist()[:10]
        )
        mismatches = [v for v in mov_values if v != expected_mov]
        result.competencia_matches_expected = not mismatches
        if mismatches:
            result.errors.append(
                f"competenciamov ({', '.join(mismatches)}) "
                f"não corresponde à pasta ano={ano}/mes={mes:02d} "
                f"(esperado {expected_mov})."
            )
    elif "competencia_date" in df.columns:
        dates = df["competencia_date"].dropna()
        if len(dates):
            years = dates.dt.year.unique().tolist()
            months = dates.dt.month.unique().tolist()
            result.competencia_matches_expected = (
                years == [ano] and months == [mes]
            )
            if not result.competencia_matches_expected:
                result.errors.append(
                    f"competencia_date ({years}-{months}) "
                    f"não corresponde a ano={ano}/mes={mes}."
                )
        else:
            result.competencia_matches_expected = False
            result.errors.append("competencia_date está totalmente nula.")
    else:
        result.competencia_matches_expected = False

    for col in NUMERIC_COLUMNS:
        if col in df.columns and not pd.api.types.is_numeric_dtype(df[col]):
            result.warnings.append(
                f"Coluna numérica '{col}' não está em dtype numérico após conversão."
            )

    if "saldomovimentacao" in df.columns:
        saldo_numeric = pd.to_numeric(df["saldomovimentacao"], errors="coerce")
        result.saldo_values = sorted(
            saldo_numeric.dropna().unique().tolist(),
            key=lambda x: (isinstance(x, str), x),
        )[:20]
        unexpected = [
            v
            for v in result.saldo_values
            if v not in (1, -1) and pd.notna(v)
        ]
        if unexpected:
            result.warnings.append(
                "saldomovimentacao contém valores fora de 1/-1: "
                + ", ".join(str(v) for v in unexpected[:10])
            )

    if "admissao" in df.columns and "desligamento" in df.columns:
        result.admissao_sum = int(df["admissao"].sum())
        result.desligamento_sum = int(df["desligamento"].sum())
        result.saldo_sum = result.admissao_sum - result.desligamento_sum

    if (
        "admissao" in df.columns
        and "desligamento" in df.columns
        and "saldomovimentacao" in df.columns
    ):
        saldo_numeric = pd.to_numeric(df["saldomovimentacao"], errors="coerce")
        expected_adm = (saldo_numeric == 1).astype(int)
        expected_des = (saldo_numeric == -1).astype(int)
        adm_mismatch = int((df["admissao"] != expected_adm).sum())
        des_mismatch = int((df["desligamento"] != expected_des).sum())
        net_from_flags = result.admissao_sum - result.desligamento_sum
        net_from_saldo = int(saldo_numeric.isin([1, -1]).astype(int).mul(saldo_numeric).sum())
        result.saldo_consistency_ok = (
            adm_mismatch == 0
            and des_mismatch == 0
            and net_from_flags == net_from_saldo
        )
        if adm_mismatch or des_mismatch:
            result.errors.append(
                f"admissao/desligamento incoerentes com saldomovimentacao "
                f"(mismatches: admissao={adm_mismatch}, desligamento={des_mismatch})."
            )
        elif net_from_flags != net_from_saldo:
            result.warnings.append(
                f"Saldo líquido ({net_from_flags}) difere da soma de saldomovimentacao "
                f"1/-1 ({net_from_saldo}); pode haver valores intermediários."
            )
            result.saldo_consistency_ok = True

    if "faixa_etaria" in df.columns:
        if df["faixa_etaria"].astype(str).eq("Ignorado").all():
            result.warnings.append("faixa_etaria está totalmente como 'Ignorado'.")
    elif "faixa_etaria" not in result.missing_derived_columns:
        result.warnings.append("faixa_etaria ausente para verificação de faixas.")

    for col in MAPPED_CATEGORICAL_COLUMNS:
        if col in df.columns and df[col].notna().sum() == 0:
            result.warnings.append(f"Coluna mapeada '{col}' está 100% nula.")

    if result.errors:
        result.validation_status = "error"
    elif result.warnings:
        result.validation_status = "warning"
    else:
        result.validation_status = "ok"

    return result


def ensure_silver_valid(result: SilverValidationResult) -> SilverValidationResult:
    if result.validation_status == "error":
        summary = "; ".join(result.errors)
        logger.error(
            "[SILVER] Validação reprovada | ano=%s mes=%s | %s",
            result.ano,
            result.mes,
            summary,
        )
        raise SilverValidationError(
            f"Validação Silver reprovada para {result.ano}-{result.mes:02d}: {summary}",
            errors=result.errors,
        )
    for warning in result.warnings:
        logger.warning("[SILVER] %s", warning)
    logger.info(
        "[SILVER] Validação %s | linhas=%s | colunas=%s",
        result.validation_status,
        result.row_count,
        result.column_count,
    )
    return result
