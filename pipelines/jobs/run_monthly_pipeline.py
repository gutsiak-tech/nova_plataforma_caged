import argparse

from pipelines.bronze.ingest_caged import run_ingest_caged
from pipelines.silver.clean_caged import run_clean_caged
from pipelines.gold.aggregate_indicators import run_aggregate_indicators
from pipelines.jobs.build_gold_catalog import run_build_gold_catalog

from app.core.logging import setup_logger
from app.core.config import PIPELINE_LOG_FILE, DEFAULT_ANO, DEFAULT_MES
from app.services.gold_service import resolve_gold_month
from app.services.gold_catalog_service import (
    apply_catalog_validation,
    validate_catalog_for_competencia,
)

logger = setup_logger("job_monthly", PIPELINE_LOG_FILE)


def _run_catalog_and_validate(
    *,
    ano: int,
    mes: int,
    validate_catalog: bool,
) -> None:
    catalog_result = run_build_gold_catalog()
    if not validate_catalog:
        return

    logger.info("[JOB] Validando catálogo Gold (--validate-catalog)")
    validation = validate_catalog_for_competencia(
        catalog_result["catalog"],
        ano=ano,
        mes=mes,
    )
    apply_catalog_validation(validation, logger=logger)


def run_monthly_pipeline(
    ano: int = DEFAULT_ANO,
    mes: int = DEFAULT_MES,
    *,
    build_catalog: bool = False,
    validate_catalog: bool = False,
    catalog_only: bool = False,
    validate_bronze_only: bool = False,
    validate_silver_only: bool = False,
    validate_gold_only: bool = False,
):
    if validate_gold_only:
        if validate_bronze_only or validate_silver_only or catalog_only:
            logger.warning("[JOB] Outras flags de etapa ignoradas em --validate-gold-only")
        if build_catalog:
            logger.info("[JOB] --validate-gold-only com --build-catalog: valida Gold e regenera catálogo")
        else:
            logger.info("[JOB] Modo validate-gold-only: validando artefatos Gold existentes")
        from pipelines.gold.validate_gold import run_validate_gold_only

        run_validate_gold_only(ano=ano, mes=mes)
        if build_catalog:
            _run_catalog_and_validate(ano=ano, mes=mes, validate_catalog=validate_catalog)
        logger.info("[JOB] Validação Gold concluída com sucesso.")
        return

    if validate_bronze_only:
        if catalog_only or build_catalog or validate_catalog or validate_silver_only:
            logger.warning(
                "[JOB] Flags de catálogo/Silver ignoradas em modo --validate-bronze-only"
            )
        logger.info("[JOB] Modo validate-bronze-only: validando Bronze")
        run_ingest_caged(ano=ano, mes=mes)
        logger.info("[JOB] Validação Bronze concluída com sucesso.")
        return

    if validate_silver_only:
        if catalog_only or build_catalog or validate_catalog:
            logger.warning(
                "[JOB] Flags de catálogo ignoradas em modo --validate-silver-only"
            )
        logger.info("[JOB] Modo validate-silver-only: Bronze + Silver (sem Gold)")
        run_ingest_caged(ano=ano, mes=mes)
        run_clean_caged(ano=ano, mes=mes)
        logger.info("[JOB] Validação Silver concluída com sucesso.")
        return

    if catalog_only:
        if build_catalog:
            logger.warning(
                "[JOB] --build-catalog ignorado: --catalog-only já regenera o catálogo"
            )
        logger.info("[JOB] Modo catalog-only: pulando Bronze, Silver e Gold")
        logger.info("[JOB] Gerando catálogo Gold (--catalog-only)")
        _run_catalog_and_validate(ano=ano, mes=mes, validate_catalog=validate_catalog)
        logger.info("[JOB] Catálogo concluído com sucesso.")
        return

    logger.info(f"[JOB] Iniciando pipeline mensal | ano={ano} mes={mes}")

    run_ingest_caged(ano=ano, mes=mes)
    run_clean_caged(ano=ano, mes=mes)
    run_aggregate_indicators(ano=ano, mes=mes)

    if build_catalog:
        logger.info("[JOB] Gerando catálogo Gold (--build-catalog)")
        _run_catalog_and_validate(ano=ano, mes=mes, validate_catalog=validate_catalog)
    elif validate_catalog:
        logger.warning(
            "[JOB] --validate-catalog ignorado: use com --build-catalog ou --catalog-only"
        )

    logger.info("[JOB] Pipeline mensal concluído com sucesso.")


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Executa o pipeline mensal CAGED (Bronze -> Silver -> Gold).",
    )
    parser.add_argument(
        "--ano",
        type=int,
        default=None,
        help=f"Ano da competência (padrão: DEFAULT_ANO={DEFAULT_ANO} do .env)",
    )
    parser.add_argument(
        "--mes",
        type=int,
        default=None,
        help=f"Mês da competência (padrão: DEFAULT_MES={DEFAULT_MES} do .env)",
    )
    parser.add_argument(
        "--build-catalog",
        action="store_true",
        help="Após Gold, regenera o catálogo formal (JSON, CSV e Markdown).",
    )
    parser.add_argument(
        "--validate-catalog",
        action="store_true",
        help="Com --build-catalog ou --catalog-only, valida o catálogo gerado.",
    )
    parser.add_argument(
        "--catalog-only",
        action="store_true",
        help="Regenera apenas o catálogo Gold, sem executar Bronze/Silver/Gold.",
    )
    parser.add_argument(
        "--validate-bronze-only",
        action="store_true",
        help="Valida microdados.txt na Bronze e grava metadata.json, sem Silver/Gold.",
    )
    parser.add_argument(
        "--validate-silver-only",
        action="store_true",
        help="Executa Bronze + Silver com validação e metadata, sem Gold/catálogo.",
    )
    parser.add_argument(
        "--validate-gold-only",
        action="store_true",
        help="Valida artefatos Gold existentes e grava metadata.json, sem Bronze/Silver.",
    )
    return parser.parse_args()


if __name__ == "__main__":
    args = _parse_args()
    month = resolve_gold_month(ano=args.ano, mes=args.mes)
    run_monthly_pipeline(
        ano=month.ano,
        mes=month.mes,
        build_catalog=args.build_catalog,
        validate_catalog=args.validate_catalog,
        catalog_only=args.catalog_only,
        validate_bronze_only=args.validate_bronze_only,
        validate_silver_only=args.validate_silver_only,
        validate_gold_only=args.validate_gold_only,
    )
