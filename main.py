from app.core.config import (
    PROJECT_ROOT,
    DATA_LAKE_DIR,
    BRONZE_DIR,
    SILVER_DIR,
    GOLD_DIR,
    DEFAULT_ANO,
    DEFAULT_MES,
)
from app.core.logging import setup_logger
from app.core.config import PIPELINE_LOG_FILE


logger = setup_logger("main", PIPELINE_LOG_FILE)


def main():
    logger.info("Projeto iniciado")
    logger.info(f"PROJECT_ROOT = {PROJECT_ROOT}")
    logger.info(f"DATA_LAKE_DIR = {DATA_LAKE_DIR}")
    logger.info(f"BRONZE_DIR = {BRONZE_DIR}")
    logger.info(f"SILVER_DIR = {SILVER_DIR}")
    logger.info(f"GOLD_DIR = {GOLD_DIR}")
    logger.info(f"DEFAULT_ANO = {DEFAULT_ANO}")
    logger.info(f"DEFAULT_MES = {DEFAULT_MES}")
    print("Estrutura de configuração carregada com sucesso.")


if __name__ == "__main__":
    main()