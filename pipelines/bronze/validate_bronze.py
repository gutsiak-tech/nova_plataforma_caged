"""Validação operacional da camada Bronze do Novo CAGED."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from app.core.config import (
    BRONZE_CAGED_DIR,
    BRONZE_MIN_FILE_SIZE_WARNING_BYTES,
    BRONZE_SAMPLE_ROWS,
    PIPELINE_LOG_FILE,
)
from app.core.logging import setup_logger
from pipelines.bronze.microdados_contract import (
    EXPECTED_ENCODING,
    EXPECTED_SEPARATOR,
    KNOWN_COLUMNS,
    RECOMMENDED_COLUMNS,
    REQUIRED_COLUMNS,
    normalize_column_name,
)

logger = setup_logger("bronze.validate", PIPELINE_LOG_FILE)


def bronze_mes_dir(ano: int, mes: int) -> Path:
    return BRONZE_CAGED_DIR / f"ano={ano}" / f"mes={mes:02d}"


class BronzeValidationError(Exception):
    """Falha crítica na validação Bronze — impede Silver/Gold."""

    def __init__(self, message: str, *, errors: list[str] | None = None) -> None:
        super().__init__(message)
        self.errors = errors or [message]


@dataclass
class BronzeValidationResult:
    ano: int
    mes: int
    competencia: str
    source_file: str
    file_size_bytes: int
    file_sha256: str | None
    detected_separator: str | None
    detected_encoding: str | None
    required_columns_ok: bool
    missing_required_columns: list[str] = field(default_factory=list)
    missing_recommended_columns: list[str] = field(default_factory=list)
    extra_columns: list[str] = field(default_factory=list)
    row_sample_count: int = 0
    competencia_values_sample: list[str] = field(default_factory=list)
    competencia_matches_path: bool = False
    validated_at: str = ""
    validation_status: str = "error"
    warnings: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    def to_metadata(self, *, dicionario_exists: bool) -> dict:
        legacy_status = {
            "ok": "bronze_ok",
            "warning": "bronze_warning",
            "error": "bronze_error",
        }.get(self.validation_status, "bronze_error")

        return {
            # Campos legados (compatibilidade)
            "fonte": "Novo CAGED",
            "ano": self.ano,
            "mes": self.mes,
            "arquivo_microdados": self.source_file,
            "arquivo_dicionario": "dicionario.pdf" if dicionario_exists else None,
            "data_ingestao": self.validated_at,
            "separador": self.detected_separator or EXPECTED_SEPARATOR,
            "encoding": self.detected_encoding or EXPECTED_ENCODING,
            "status": legacy_status,
            # Campos novos
            "competencia": self.competencia,
            "source_file": self.source_file,
            "file_size_bytes": self.file_size_bytes,
            "file_sha256": self.file_sha256,
            "detected_separator": self.detected_separator,
            "detected_encoding": self.detected_encoding,
            "required_columns_ok": self.required_columns_ok,
            "missing_required_columns": self.missing_required_columns,
            "missing_recommended_columns": self.missing_recommended_columns,
            "extra_columns": self.extra_columns,
            "row_sample_count": self.row_sample_count,
            "competencia_values_sample": self.competencia_values_sample,
            "competencia_matches_path": self.competencia_matches_path,
            "validated_at": self.validated_at,
            "validation_status": self.validation_status,
            "warnings": self.warnings,
            "errors": self.errors,
        }


def _relative_bronze_path(path: Path) -> str:
    try:
        from app.core.config import PROJECT_ROOT

        return path.relative_to(PROJECT_ROOT).as_posix()
    except ValueError:
        return path.as_posix()


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _decode_header_line(raw: bytes) -> tuple[str, str]:
    for encoding in (EXPECTED_ENCODING, "latin-1"):
        try:
            return raw.decode(encoding).strip("\r\n"), encoding
        except UnicodeDecodeError:
            continue
    raise BronzeValidationError(
        "Não foi possível decodificar o header de microdados.txt "
        f"(tentativas: {EXPECTED_ENCODING}, latin-1)."
    )


def _parse_header(header_line: str, separator: str) -> list[str]:
    return [normalize_column_name(col) for col in header_line.split(separator)]


def _expected_competenciamov(ano: int, mes: int) -> str:
    return f"{ano}{mes:02d}"


def validate_bronze_microdados(
    ano: int,
    mes: int,
    *,
    bronze_dir: Path | None = None,
    sample_rows: int = BRONZE_SAMPLE_ROWS,
    min_size_warning_bytes: int = BRONZE_MIN_FILE_SIZE_WARNING_BYTES,
) -> BronzeValidationResult:
    """Valida microdados.txt sem ler o arquivo inteiro (exceto para SHA256)."""
    pasta = bronze_dir or bronze_mes_dir(ano, mes)
    microdados = pasta / "microdados.txt"
    competencia = f"{ano}-{mes:02d}"
    expected_mov = _expected_competenciamov(ano, mes)
    validated_at = datetime.now(timezone.utc).isoformat()

    result = BronzeValidationResult(
        ano=ano,
        mes=mes,
        competencia=competencia,
        source_file=microdados.name,
        file_size_bytes=0,
        file_sha256=None,
        detected_separator=None,
        detected_encoding=None,
        required_columns_ok=False,
        validated_at=validated_at,
    )

    if not pasta.is_dir():
        msg = (
            f"Pasta Bronze inexistente: {_relative_bronze_path(pasta)}. "
            f"Crie a estrutura ano={ano}/mes={mes:02d} e coloque microdados.txt."
        )
        result.errors.append(msg)
        result.validation_status = "error"
        return result

    if not microdados.is_file():
        msg = (
            f"Arquivo microdados.txt não encontrado em {_relative_bronze_path(microdados)}. "
            "Baixe o arquivo do Novo CAGED e coloque-o na pasta da competência antes do pipeline."
        )
        result.errors.append(msg)
        result.validation_status = "error"
        return result

    result.file_size_bytes = microdados.stat().st_size

    if result.file_size_bytes == 0:
        result.errors.append(
            f"Arquivo microdados.txt está vazio (0 bytes) em {_relative_bronze_path(microdados)}."
        )
    elif result.file_size_bytes < min_size_warning_bytes:
        result.warnings.append(
            f"Arquivo microdados.txt muito pequeno ({result.file_size_bytes} bytes). "
            f"Microdados mensais costumam ter dezenas de MB; verifique se o download está completo."
        )

    try:
        result.file_sha256 = _sha256_file(microdados)
    except OSError as exc:
        result.errors.append(f"Falha ao calcular SHA256 de microdados.txt: {exc}")

    try:
        with microdados.open("rb") as handle:
            header_raw = handle.readline()
            if not header_raw.strip():
                result.errors.append(
                    "Header de microdados.txt ausente ou vazio (primeira linha)."
                )
                header_line = ""
                result.detected_encoding = EXPECTED_ENCODING
            else:
                header_line, result.detected_encoding = _decode_header_line(header_raw)
                if result.detected_encoding != EXPECTED_ENCODING:
                    result.warnings.append(
                        f"Encoding detectado no header: {result.detected_encoding} "
                        f"(esperado: {EXPECTED_ENCODING})."
                    )

            if header_line:
                if EXPECTED_SEPARATOR not in header_line:
                    result.errors.append(
                        f"Separador esperado '{EXPECTED_SEPARATOR}' não encontrado no header. "
                        "Verifique se o arquivo é o microdados delimitado do Novo CAGED."
                    )
                    columns: list[str] = []
                else:
                    result.detected_separator = EXPECTED_SEPARATOR
                    columns = _parse_header(header_line, EXPECTED_SEPARATOR)

                result.missing_required_columns = [
                    col for col in REQUIRED_COLUMNS if col not in columns
                ]
                result.missing_recommended_columns = [
                    col for col in RECOMMENDED_COLUMNS if col not in columns
                ]
                result.extra_columns = sorted(
                    col for col in columns if col and col not in KNOWN_COLUMNS
                )
                result.required_columns_ok = not result.missing_required_columns

                if result.missing_required_columns:
                    result.errors.append(
                        "Colunas obrigatórias ausentes no header: "
                        + ", ".join(result.missing_required_columns)
                        + ". Verifique se o arquivo é o microdados completo do Novo CAGED."
                    )

                if result.missing_recommended_columns:
                    result.warnings.append(
                        "Colunas recomendadas ausentes: "
                        + ", ".join(result.missing_recommended_columns)
                    )

                if result.extra_columns:
                    result.warnings.append(
                        "Colunas extras não catalogadas: " + ", ".join(result.extra_columns)
                    )

                competencia_idx = (
                    columns.index("competenciamov") if "competenciamov" in columns else None
                )

                sample_values: list[str] = []
                rows_read = 0
                for _ in range(sample_rows):
                    line_raw = handle.readline()
                    if not line_raw.strip():
                        break
                    rows_read += 1
                    if competencia_idx is None:
                        continue
                    try:
                        line_text = line_raw.decode(result.detected_encoding or EXPECTED_ENCODING)
                    except UnicodeDecodeError:
                        line_text = line_raw.decode("latin-1", errors="replace")
                    parts = line_text.strip("\r\n").split(EXPECTED_SEPARATOR)
                    if competencia_idx < len(parts):
                        sample_values.append(parts[competencia_idx].strip())

                result.row_sample_count = rows_read
                result.competencia_values_sample = list(dict.fromkeys(sample_values))[:10]

                if rows_read == 0:
                    result.errors.append(
                        "Nenhuma linha de dados encontrada após o header em microdados.txt."
                    )
                elif competencia_idx is not None and sample_values:
                    mismatches = {
                        value for value in sample_values if value != expected_mov
                    }
                    result.competencia_matches_path = not mismatches
                    if mismatches:
                        result.errors.append(
                            f"Competência do arquivo ({', '.join(sorted(mismatches))}) "
                            f"não corresponde à pasta ano={ano}/mes={mes:02d} "
                            f"(esperado competênciamov={expected_mov}). "
                            "Coloque o arquivo na pasta correta ou ajuste --ano/--mes."
                        )
                elif competencia_idx is None:
                    result.competencia_matches_path = False

    except OSError as exc:
        result.errors.append(f"Falha ao ler microdados.txt: {exc}")

    if result.errors:
        result.validation_status = "error"
    elif result.warnings:
        result.validation_status = "warning"
    else:
        result.validation_status = "ok"

    return result


def ensure_bronze_valid(
    ano: int,
    mes: int,
    *,
    bronze_dir: Path | None = None,
) -> BronzeValidationResult:
    """Valida Bronze e levanta BronzeValidationError se status for error."""
    result = validate_bronze_microdados(ano, mes, bronze_dir=bronze_dir)

    for warning in result.warnings:
        logger.warning("[BRONZE] %s", warning)

    if result.validation_status == "error":
        summary = "; ".join(result.errors)
        logger.error("[BRONZE] Validação reprovada | ano=%s mes=%s | %s", ano, mes, summary)
        raise BronzeValidationError(
            f"Validação Bronze reprovada para {ano}-{mes:02d}: {summary}",
            errors=result.errors,
        )

    logger.info(
        "[BRONZE] Validação %s | ano=%s mes=%s | bytes=%s | amostra=%s linhas",
        result.validation_status,
        ano,
        mes,
        result.file_size_bytes,
        result.row_sample_count,
    )
    return result
