"""Job para gerar o catálogo formal da camada Gold."""

from app.core.logging import setup_logger
from app.core.config import PIPELINE_LOG_FILE
from app.services.gold_catalog_service import print_catalog_summary, write_gold_catalog

logger = setup_logger("job_gold_catalog", PIPELINE_LOG_FILE)


def run_build_gold_catalog() -> dict:
    logger.info("[JOB] Gerando catálogo da camada Gold")
    result = write_gold_catalog()
    logger.info("[JOB] Catálogo Gold gerado com sucesso")
    return result


if __name__ == "__main__":
    output = run_build_gold_catalog()
    print_catalog_summary(output)
