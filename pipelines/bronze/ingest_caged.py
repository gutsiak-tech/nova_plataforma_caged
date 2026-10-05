from pathlib import Path

from app.core.config import BRONZE_CAGED_DIR, DEFAULT_ANO, DEFAULT_MES, PIPELINE_LOG_FILE
from app.core.logging import setup_logger
from pipelines.bronze.validate_bronze import (
    BronzeValidationError,
    validate_bronze_microdados,
)
from pipelines.common.utils import ensure_dir, save_json

logger = setup_logger("bronze", PIPELINE_LOG_FILE)


def bronze_mes_dir(ano: int, mes: int) -> Path:
    return BRONZE_CAGED_DIR / f"ano={ano}" / f"mes={mes:02d}"


def _write_metadata(pasta: Path, result, dicionario: Path) -> None:
    metadata_path = pasta / "metadata.json"
    try:
        save_json(result.to_metadata(dicionario_exists=dicionario.is_file()), metadata_path)
    except OSError as exc:
        raise BronzeValidationError(
            f"Falha ao gravar metadata.json em {metadata_path}: {exc}"
        ) from exc


def run_ingest_caged(ano: int = DEFAULT_ANO, mes: int = DEFAULT_MES):
    logger.info(f"[BRONZE] Iniciando ingestão | ano={ano} mes={mes}")

    pasta = bronze_mes_dir(ano, mes)
    ensure_dir(pasta)

    dicionario = pasta / "dicionario.pdf"
    result = validate_bronze_microdados(ano, mes, bronze_dir=pasta)
    _write_metadata(pasta, result, dicionario)

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
        "[BRONZE] Ingestão concluída | status=%s | sha256=%s",
        result.validation_status,
        (result.file_sha256 or "")[:12],
    )
    return pasta


if __name__ == "__main__":
    run_ingest_caged()
