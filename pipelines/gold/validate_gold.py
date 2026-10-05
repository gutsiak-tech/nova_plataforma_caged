"""Validação operacional da camada Gold (entrada Silver e outputs)."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import pyarrow.parquet as pq

from app.core.config import GOLD_CAGED_DIR, PIPELINE_LOG_FILE, SILVER_CAGED_DIR
from app.core.logging import setup_logger
from pipelines.gold.gold_contract import (
    COMPETENCIA_COLUMNS,
    GOLD_METADATA_FILE,
    LEGACY_GOLD_TABLE_NAMES,
    MIN_REQUIRED_GOLD_TABLES,
    REQUIRED_SILVER_COLUMNS,
    SILVER_INPUT_FILE,
    SILVER_METADATA_FILE,
    TABELA_RESUMO_COLUMNS,
    excel_filename,
)

logger = setup_logger("gold.validate", PIPELINE_LOG_FILE)


def silver_mes_dir(ano: int, mes: int) -> Path:
    return SILVER_CAGED_DIR / f"ano={ano}" / f"mes={mes:02d}"


def gold_mes_dir(ano: int, mes: int) -> Path:
    return GOLD_CAGED_DIR / f"ano={ano}" / f"mes={mes:02d}"


class GoldValidationError(Exception):
    """Falha crítica na validação Gold."""

    def __init__(self, message: str, *, errors: list[str] | None = None) -> None:
        super().__init__(message)
        self.errors = errors or [message]


@dataclass
class SilverInputValidationResult:
    ano: int
    mes: int
    validation_status: str = "error"
    row_count: int = 0
    column_count: int = 0
    missing_required_columns: list[str] = field(default_factory=list)
    silver_metadata_status: str | None = None
    warnings: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


@dataclass
class GoldOutputValidationResult:
    ano: int
    mes: int
    competencia: str
    gold_dir: str
    validation_status: str = "error"
    table_count_csv: int = 0
    table_count_parquet: int = 0
    excel_exists: bool = False
    required_tables_ok: bool = False
    missing_required_tables: list[str] = field(default_factory=list)
    csv_without_parquet: list[str] = field(default_factory=list)
    parquet_without_csv: list[str] = field(default_factory=list)
    tabela_resumo_ok: bool = False
    admissoes_total: int | None = None
    desligamentos_total: int | None = None
    saldo_total: int | None = None
    totals_consistency_ok: bool = False
    suspected_legacy_files: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    generated_at: str = ""


def _relative_path(path: Path) -> str:
    try:
        from app.core.config import PROJECT_ROOT

        return path.relative_to(PROJECT_ROOT).as_posix()
    except ValueError:
        return path.as_posix()


def load_silver_metadata(ano: int, mes: int) -> dict | None:
    return _load_silver_metadata(ano, mes)


def _load_silver_metadata(ano: int, mes: int) -> dict | None:
    meta_path = silver_mes_dir(ano, mes) / SILVER_METADATA_FILE
    if not meta_path.is_file():
        return None
    try:
        return json.loads(meta_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def validate_silver_input_for_gold(ano: int, mes: int) -> SilverInputValidationResult:
    """Valida entrada Silver antes da agregação Gold."""
    result = SilverInputValidationResult(ano=ano, mes=mes)
    silver_path = silver_mes_dir(ano, mes) / SILVER_INPUT_FILE
    meta = _load_silver_metadata(ano, mes)

    if meta is None:
        result.warnings.append(
            f"metadata.json da Silver não encontrado em {silver_mes_dir(ano, mes)}. "
            "Gold prossegue sem gate (recomenda-se --validate-silver-only antes)."
        )
    else:
        status = str(meta.get("validation_status") or meta.get("status") or "").lower()
        result.silver_metadata_status = status or None
        if status == "error" or status == "silver_error":
            result.errors.append(
                "metadata Silver indica validation_status=error. "
                "Corrija a Silver antes de gerar a Gold."
            )
        elif status == "warning" or status == "silver_warning":
            result.warnings.append(
                "metadata Silver com validation_status=warning; Gold prossegue com ressalva."
            )
        elif status in ("ok", "silver_ok"):
            result.silver_metadata_status = "ok"

    if not silver_path.is_file():
        result.errors.append(
            f"Parquet Silver ausente: {_relative_path(silver_path)}. "
            "Execute --validate-silver-only ou o pipeline Silver antes da Gold."
        )
        result.validation_status = "error"
        return result

    if silver_path.stat().st_size == 0:
        result.errors.append(f"Parquet Silver vazio (0 bytes): {_relative_path(silver_path)}.")
        result.validation_status = "error"
        return result

    try:
        parquet_file = pq.ParquetFile(silver_path)
        result.row_count = parquet_file.metadata.num_rows
        columns = parquet_file.schema.names
        result.column_count = len(columns)
    except Exception as exc:
        result.errors.append(f"Falha ao ler parquet Silver: {exc}")
        result.validation_status = "error"
        return result

    if result.row_count == 0:
        result.errors.append("Parquet Silver não possui linhas.")

    if not any(col in columns for col in COMPETENCIA_COLUMNS):
        result.errors.append(
            "Silver sem coluna de competência (competenciamov ou competencia_date)."
        )

    result.missing_required_columns = [
        col for col in REQUIRED_SILVER_COLUMNS if col not in columns
    ]
    if result.missing_required_columns:
        result.errors.append(
            "Colunas necessárias para Gold ausentes na Silver: "
            + ", ".join(result.missing_required_columns)
        )

    if result.errors:
        result.validation_status = "error"
    elif result.warnings:
        result.validation_status = "warning"
    else:
        result.validation_status = "ok"

    return result


def _table_stem(path: Path) -> str:
    return path.stem


def _is_legacy_table(name: str) -> bool:
    return name in LEGACY_GOLD_TABLE_NAMES


def validate_gold_outputs(
    ano: int,
    mes: int,
    *,
    silver_metadata: dict | None = None,
) -> GoldOutputValidationResult:
    """Valida artefatos Gold existentes em disco."""
    competencia = f"{ano}-{mes:02d}"
    output_dir = gold_mes_dir(ano, mes)
    result = GoldOutputValidationResult(
        ano=ano,
        mes=mes,
        competencia=competencia,
        gold_dir=_relative_path(output_dir),
        generated_at=datetime.now(timezone.utc).isoformat(),
    )

    if silver_metadata is None:
        silver_metadata = _load_silver_metadata(ano, mes)

    if not output_dir.is_dir():
        result.errors.append(
            f"Diretório Gold inexistente: {_relative_path(output_dir)}. "
            "Execute o pipeline Gold para a competência."
        )
        result.validation_status = "error"
        return result

    expected_partition = f"ano={ano}/mes={mes:02d}"
    if expected_partition not in output_dir.as_posix():
        result.warnings.append(
            f"Caminho Gold pode não corresponder à competência {competencia}."
        )

    csv_files = sorted(output_dir.glob("*.csv"))
    parquet_files = sorted(output_dir.glob("*.parquet"))
    result.table_count_csv = len(csv_files)
    result.table_count_parquet = len(parquet_files)

    csv_stems = {_table_stem(p) for p in csv_files}
    parquet_stems = {_table_stem(p) for p in parquet_files}

    result.missing_required_tables = [
        name for name in MIN_REQUIRED_GOLD_TABLES if name not in csv_stems
    ]
    result.required_tables_ok = not result.missing_required_tables
    if result.missing_required_tables:
        result.errors.append(
            "Tabelas Gold obrigatórias ausentes: "
            + ", ".join(result.missing_required_tables)
        )

    for name in MIN_REQUIRED_GOLD_TABLES:
        if name in csv_stems and name not in parquet_stems:
            result.csv_without_parquet.append(name)
        if name in parquet_stems and name not in csv_stems:
            result.parquet_without_csv.append(name)

    if result.csv_without_parquet:
        result.errors.append(
            "CSV obrigatório sem Parquet correspondente: "
            + ", ".join(result.csv_without_parquet)
        )
    if result.parquet_without_csv:
        result.errors.append(
            "Parquet obrigatório sem CSV correspondente: "
            + ", ".join(result.parquet_without_csv)
        )

    extra_csv = csv_stems - parquet_stems - set(MIN_REQUIRED_GOLD_TABLES)
    extra_parquet = parquet_stems - csv_stems - set(MIN_REQUIRED_GOLD_TABLES)
    if extra_csv:
        result.warnings.append(
            "CSV extras sem Parquet (não obrigatórios): " + ", ".join(sorted(extra_csv)[:10])
        )
    if extra_parquet:
        result.warnings.append(
            "Parquet extras sem CSV (não obrigatórios): "
            + ", ".join(sorted(extra_parquet)[:10])
        )

    legacy = sorted(
        name
        for name in csv_stems | parquet_stems
        if _is_legacy_table(name)
    )
    result.suspected_legacy_files = legacy
    if legacy:
        result.warnings.append(
            "Arquivos legados suspeitos encontrados: " + ", ".join(legacy)
        )

    excel_path = output_dir / excel_filename(ano, mes)
    result.excel_exists = excel_path.is_file()
    if not result.excel_exists:
        result.warnings.append(
            f"Excel consolidado ausente: {_relative_path(excel_path)}."
        )

    resumo_path = output_dir / "tabela_resumo.csv"
    if not resumo_path.is_file():
        result.errors.append(
            f"tabela_resumo.csv ausente em {_relative_path(output_dir)}."
        )
    else:
        try:
            resumo = pd.read_csv(resumo_path)
            missing_cols = [c for c in TABELA_RESUMO_COLUMNS if c not in resumo.columns]
            if missing_cols:
                result.errors.append(
                    "tabela_resumo sem colunas obrigatórias: " + ", ".join(missing_cols)
                )
            elif resumo.empty:
                result.errors.append("tabela_resumo.csv está vazia.")
            else:
                result.tabela_resumo_ok = True
                row = resumo.iloc[0]
                try:
                    result.admissoes_total = int(row["admissoes"])
                    result.desligamentos_total = int(row["desligamentos"])
                    result.saldo_total = int(row["saldo"])
                except (TypeError, ValueError) as exc:
                    result.errors.append(
                        f"Totais de tabela_resumo não são numéricos: {exc}"
                    )
                else:
                    expected_saldo = result.admissoes_total - result.desligamentos_total
                    result.totals_consistency_ok = result.saldo_total == expected_saldo
                    if not result.totals_consistency_ok:
                        result.errors.append(
                            f"tabela_resumo inconsistente: saldo ({result.saldo_total}) "
                            f"≠ admissoes ({result.admissoes_total}) - desligamentos "
                            f"({result.desligamentos_total})."
                        )

                if "competencia" in resumo.columns:
                    values = resumo["competencia"].astype(str).unique().tolist()
                    if values != [competencia]:
                        result.errors.append(
                            f"tabela_resumo.competencia ({values}) "
                            f"não corresponde a {competencia}."
                        )

                if silver_metadata and result.admissoes_total is not None:
                    silver_adm = silver_metadata.get("admissao_sum")
                    silver_des = silver_metadata.get("desligamento_sum")
                    silver_saldo = silver_metadata.get("saldo_sum")
                    if silver_adm is not None and silver_adm != result.admissoes_total:
                        result.warnings.append(
                            f"admissao_sum Silver ({silver_adm}) difere de tabela_resumo "
                            f"({result.admissoes_total})."
                        )
                    if silver_des is not None and silver_des != result.desligamentos_total:
                        result.warnings.append(
                            f"desligamento_sum Silver ({silver_des}) difere de tabela_resumo "
                            f"({result.desligamentos_total})."
                        )
                    if (
                        silver_saldo is not None
                        and result.saldo_total is not None
                        and silver_saldo != result.saldo_total
                    ):
                        result.warnings.append(
                            f"saldo_sum Silver ({silver_saldo}) difere de tabela_resumo "
                            f"({result.saldo_total})."
                        )
        except Exception as exc:
            result.errors.append(f"tabela_resumo.csv ilegível: {exc}")

    if result.errors:
        result.validation_status = "error"
    elif result.warnings:
        result.validation_status = "warning"
    else:
        result.validation_status = "ok"

    return result


def build_gold_metadata(
    silver_input: SilverInputValidationResult | None,
    gold_output: GoldOutputValidationResult,
) -> dict:
    legacy_status = {
        "ok": "gold_ok",
        "warning": "gold_warning",
        "error": "gold_error",
    }.get(gold_output.validation_status, "gold_error")

    payload = {
        "ano": gold_output.ano,
        "mes": gold_output.mes,
        "competencia": gold_output.competencia,
        "gold_dir": gold_output.gold_dir,
        "generated_at": gold_output.generated_at,
        "status": legacy_status,
        "validation_status": gold_output.validation_status,
        "warnings": gold_output.warnings,
        "errors": gold_output.errors,
        "silver_input_status": silver_input.validation_status if silver_input else None,
        "silver_row_count": silver_input.row_count if silver_input else None,
        "silver_metadata_status": silver_input.silver_metadata_status if silver_input else None,
        "table_count_csv": gold_output.table_count_csv,
        "table_count_parquet": gold_output.table_count_parquet,
        "excel_exists": gold_output.excel_exists,
        "required_tables_ok": gold_output.required_tables_ok,
        "missing_required_tables": gold_output.missing_required_tables,
        "csv_without_parquet": gold_output.csv_without_parquet,
        "parquet_without_csv": gold_output.parquet_without_csv,
        "tabela_resumo_ok": gold_output.tabela_resumo_ok,
        "admissoes_total": gold_output.admissoes_total,
        "desligamentos_total": gold_output.desligamentos_total,
        "saldo_total": gold_output.saldo_total,
        "totals_consistency_ok": gold_output.totals_consistency_ok,
        "suspected_legacy_files": gold_output.suspected_legacy_files,
    }
    return payload


def write_gold_metadata(
    ano: int,
    mes: int,
    silver_input: SilverInputValidationResult | None,
    gold_output: GoldOutputValidationResult,
) -> Path:
    from pipelines.common.utils import save_json

    path = gold_mes_dir(ano, mes) / GOLD_METADATA_FILE
    try:
        save_json(build_gold_metadata(silver_input, gold_output), path)
    except OSError as exc:
        raise GoldValidationError(
            f"Falha ao gravar metadata.json da Gold em {path}: {exc}"
        ) from exc
    return path


def ensure_silver_input_valid(result: SilverInputValidationResult) -> SilverInputValidationResult:
    for warning in result.warnings:
        logger.warning("[GOLD] %s", warning)
    if result.validation_status == "error":
        summary = "; ".join(result.errors)
        logger.error("[GOLD] Entrada Silver reprovada | %s", summary)
        raise GoldValidationError(
            f"Entrada Silver inválida para Gold {result.ano}-{result.mes:02d}: {summary}",
            errors=result.errors,
        )
    logger.info(
        "[GOLD] Entrada Silver %s | linhas=%s | colunas=%s",
        result.validation_status,
        result.row_count,
        result.column_count,
    )
    return result


def ensure_gold_output_valid(result: GoldOutputValidationResult) -> GoldOutputValidationResult:
    for warning in result.warnings:
        logger.warning("[GOLD] %s", warning)
    if result.validation_status == "error":
        summary = "; ".join(result.errors)
        logger.error("[GOLD] Outputs reprovados | %s", summary)
        raise GoldValidationError(
            f"Validação Gold reprovada para {result.ano}-{result.mes:02d}: {summary}",
            errors=result.errors,
        )
    logger.info(
        "[GOLD] Outputs %s | csv=%s | parquet=%s | tabela_resumo_ok=%s",
        result.validation_status,
        result.table_count_csv,
        result.table_count_parquet,
        result.tabela_resumo_ok,
    )
    return result


def run_validate_gold_only(ano: int, mes: int) -> GoldOutputValidationResult:
    """Valida artefatos Gold existentes e grava metadata.json."""
    logger.info("[GOLD] Modo validate-gold-only | ano=%s mes=%s", ano, mes)
    silver_meta = _load_silver_metadata(ano, mes)
    silver_input = validate_silver_input_for_gold(ano, mes)
    # Em validate-gold-only não bloqueamos por Silver ausente se Gold já existe;
    # apenas registramos status da entrada.
    output = validate_gold_outputs(ano, mes, silver_metadata=silver_meta)
    write_gold_metadata(ano, mes, silver_input, output)
    return ensure_gold_output_valid(output)
