"""Testes da integração do catálogo Gold ao pipeline mensal."""

from unittest.mock import MagicMock, patch

import pytest

from app.services.gold_catalog_service import (
    apply_catalog_validation,
    validate_catalog_for_competencia,
)
from pipelines.jobs import run_monthly_pipeline as monthly_module


def test_parse_args_accepts_build_catalog_flag():
    with patch("sys.argv", ["run_monthly_pipeline", "--build-catalog"]):
        args = monthly_module._parse_args()
    assert args.build_catalog is True
    assert args.validate_catalog is False


def test_parse_args_accepts_validate_catalog_flag():
    with patch(
        "sys.argv",
        ["run_monthly_pipeline", "--build-catalog", "--validate-catalog"],
    ):
        args = monthly_module._parse_args()
    assert args.build_catalog is True
    assert args.validate_catalog is True


def test_parse_args_default_without_flags():
    with patch("sys.argv", ["run_monthly_pipeline"]):
        args = monthly_module._parse_args()
    assert args.build_catalog is False
    assert args.validate_catalog is False
    assert args.catalog_only is False


def test_parse_args_accepts_catalog_only_flag():
    with patch("sys.argv", ["run_monthly_pipeline", "--catalog-only"]):
        args = monthly_module._parse_args()
    assert args.catalog_only is True
    assert args.build_catalog is False


@patch.object(monthly_module, "_run_catalog_and_validate")
@patch.object(monthly_module, "run_aggregate_indicators")
@patch.object(monthly_module, "run_clean_caged")
@patch.object(monthly_module, "run_ingest_caged")
def test_run_monthly_pipeline_catalog_only_skips_medallion(
    mock_ingest,
    mock_clean,
    mock_gold,
    mock_catalog_step,
):
    monthly_module.run_monthly_pipeline(ano=2026, mes=2, catalog_only=True)

    mock_ingest.assert_not_called()
    mock_clean.assert_not_called()
    mock_gold.assert_not_called()
    mock_catalog_step.assert_called_once_with(ano=2026, mes=2, validate_catalog=False)


@patch.object(monthly_module, "_run_catalog_and_validate")
@patch.object(monthly_module, "run_aggregate_indicators")
@patch.object(monthly_module, "run_clean_caged")
@patch.object(monthly_module, "run_ingest_caged")
def test_run_monthly_pipeline_catalog_only_with_validate(
    mock_ingest,
    mock_clean,
    mock_gold,
    mock_catalog_step,
):
    monthly_module.run_monthly_pipeline(
        ano=2026,
        mes=2,
        catalog_only=True,
        validate_catalog=True,
    )

    mock_catalog_step.assert_called_once_with(ano=2026, mes=2, validate_catalog=True)


@patch.object(monthly_module, "run_build_gold_catalog")
@patch.object(monthly_module, "run_aggregate_indicators")
@patch.object(monthly_module, "run_clean_caged")
@patch.object(monthly_module, "run_ingest_caged")
def test_run_monthly_pipeline_catalog_only_with_build_catalog_runs_once(
    mock_ingest,
    mock_clean,
    mock_gold,
    mock_build_catalog,
):
    mock_build_catalog.return_value = {
        "catalog": {"partitions": [], "tables": [], "summary": {}},
    }

    monthly_module.run_monthly_pipeline(
        ano=2026,
        mes=2,
        catalog_only=True,
        build_catalog=True,
    )

    mock_ingest.assert_not_called()
    mock_build_catalog.assert_called_once_with()


@patch.object(monthly_module, "run_build_gold_catalog")
@patch.object(monthly_module, "run_aggregate_indicators")
@patch.object(monthly_module, "run_clean_caged")
@patch.object(monthly_module, "run_ingest_caged")
def test_run_monthly_pipeline_validate_without_build_or_catalog_only_is_safe(
    mock_ingest,
    mock_clean,
    mock_gold,
    mock_build_catalog,
):
    monthly_module.run_monthly_pipeline(ano=2026, mes=2, validate_catalog=True)

    mock_build_catalog.assert_not_called()


@patch.object(monthly_module, "run_aggregate_indicators")
@patch.object(monthly_module, "run_clean_caged")
@patch.object(monthly_module, "run_ingest_caged")
def test_run_monthly_pipeline_default_does_not_build_catalog(
    mock_ingest,
    mock_clean,
    mock_gold,
):
    monthly_module.run_monthly_pipeline(ano=2026, mes=2)

    mock_ingest.assert_called_once_with(ano=2026, mes=2)
    mock_clean.assert_called_once_with(ano=2026, mes=2)
    mock_gold.assert_called_once_with(ano=2026, mes=2)


@patch.object(monthly_module, "_run_catalog_and_validate")
@patch.object(monthly_module, "run_aggregate_indicators")
@patch.object(monthly_module, "run_clean_caged")
@patch.object(monthly_module, "run_ingest_caged")
def test_run_monthly_pipeline_build_catalog_calls_catalog_job(
    mock_ingest,
    mock_clean,
    mock_gold,
    mock_catalog_step,
):
    monthly_module.run_monthly_pipeline(ano=2026, mes=2, build_catalog=True)

    mock_catalog_step.assert_called_once_with(ano=2026, mes=2, validate_catalog=False)


@patch.object(monthly_module, "apply_catalog_validation")
@patch.object(monthly_module, "validate_catalog_for_competencia")
@patch.object(monthly_module, "run_build_gold_catalog")
@patch.object(monthly_module, "run_aggregate_indicators")
@patch.object(monthly_module, "run_clean_caged")
@patch.object(monthly_module, "run_ingest_caged")
def test_run_monthly_pipeline_validate_catalog_after_build(
    mock_ingest,
    mock_clean,
    mock_gold,
    mock_build_catalog,
    mock_validate,
    mock_apply,
):
    fake_catalog = {"summary": {}}
    mock_build_catalog.return_value = {"catalog": fake_catalog}

    monthly_module.run_monthly_pipeline(
        ano=2026,
        mes=2,
        build_catalog=True,
        validate_catalog=True,
    )

    mock_validate.assert_called_once_with(fake_catalog, ano=2026, mes=2)
    mock_apply.assert_called_once()


def test_validate_catalog_identifies_competencia_present():
    catalog = {
        "partitions": [{"competencia": "2026-02", "csv_without_parquet": [], "parquet_without_csv": []}],
        "tables": [{"table_name": "tabela_resumo", "ano": 2026, "mes": 2}],
        "summary": {"suspected_legacy_count": 0, "suspected_files": []},
    }

    result = validate_catalog_for_competencia(catalog, ano=2026, mes=2)

    assert result["ok"] is True
    assert result["critical"] == []
    assert result["warnings"] == []


def test_validate_catalog_detects_missing_tabela_resumo():
    catalog = {
        "partitions": [{"competencia": "2026-02", "csv_without_parquet": [], "parquet_without_csv": []}],
        "tables": [{"table_name": "tabela_setor", "ano": 2026, "mes": 2}],
        "summary": {"suspected_legacy_count": 0, "suspected_files": []},
    }

    result = validate_catalog_for_competencia(catalog, ano=2026, mes=2)

    assert result["ok"] is False
    assert any("tabela_resumo" in msg for msg in result["critical"])


def test_validate_catalog_warns_on_suspected_legacy():
    catalog = {
        "partitions": [{"competencia": "2026-02", "csv_without_parquet": [], "parquet_without_csv": []}],
        "tables": [{"table_name": "tabela_resumo", "ano": 2026, "mes": 2}],
        "summary": {"suspected_legacy_count": 1, "suspected_files": ["tabela_perfil"]},
    }

    result = validate_catalog_for_competencia(catalog, ano=2026, mes=2)

    assert result["ok"] is True
    assert any("suspected_legacy_count" in msg for msg in result["warnings"])


def test_apply_catalog_validation_raises_on_critical():
    validation = {
        "ok": False,
        "critical": ["tabela_resumo ausente"],
        "warnings": [],
    }

    with pytest.raises(RuntimeError, match="Validação crítica do catálogo Gold falhou"):
        apply_catalog_validation(validation)


def test_apply_catalog_validation_logs_warnings_only():
    logger = MagicMock()
    validation = {
        "ok": True,
        "critical": [],
        "warnings": ["CSV sem Parquet em 2026-01: ['tabela_x']"],
    }

    apply_catalog_validation(validation, logger=logger)

    logger.warning.assert_called_once()
