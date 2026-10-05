"""Testes de validação Gold e contrato Silver → Gold."""

import json
from pathlib import Path
from unittest.mock import patch

import pandas as pd
import pytest

from pipelines.gold.gold_contract import MIN_REQUIRED_GOLD_TABLES
from pipelines.gold.validate_gold import (
    GoldValidationError,
    ensure_gold_output_valid,
    ensure_silver_input_valid,
    run_validate_gold_only,
    validate_gold_outputs,
    validate_silver_input_for_gold,
    write_gold_metadata,
)
from pipelines.jobs import run_monthly_pipeline as monthly_module


def _silver_columns() -> dict:
    return {
        "competenciamov": [202602, 202602, 202602],
        "competencia_date": pd.to_datetime(["2026-02-01"] * 3),
        "saldomovimentacao": [1, -1, 1],
        "admissao": [1, 0, 1],
        "desligamento": [0, 1, 0],
        "uf": ["41", "41", "41"],
        "municipio": ["410690", "410690", "410690"],
        "secao": ["M", "M", "M"],
        "cbo2002ocupacao": ["351430", "351430", "351430"],
        "sexo": ["3", "3", "3"],
        "faixa_etaria": ["18 a 24 anos"] * 3,
        "graudeinstrucao": ["7", "7", "7"],
        "salario": [2000.0, 2000.0, 2000.0],
        "valorsalariofixo": [2000.0, 2000.0, 2000.0],
    }


def _write_silver_parquet(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(_silver_columns()).to_parquet(path, index=False)


def _write_resumo(gold_month: Path, ano: int, mes: int, adm: int, des: int) -> None:
    saldo = adm - des
    df = pd.DataFrame(
        {
            "competencia": [f"{ano}-{mes:02d}"],
            "admissoes": [adm],
            "desligamentos": [des],
            "saldo": [saldo],
        }
    )
    df.to_csv(gold_month / "tabela_resumo.csv", index=False)
    df.to_parquet(gold_month / "tabela_resumo.parquet", index=False)


def _write_minimal_gold_table(gold_month: Path, name: str) -> None:
    df = pd.DataFrame({"admissoes": [1], "desligamentos": [0], "saldo": [1]})
    df.to_csv(gold_month / f"{name}.csv", index=False)
    df.to_parquet(gold_month / f"{name}.parquet", index=False)


def _setup_valid_gold(gold_month: Path, ano: int = 2026, mes: int = 2) -> None:
    gold_month.mkdir(parents=True, exist_ok=True)
    _write_resumo(gold_month, ano, mes, adm=10, des=4)
    for name in MIN_REQUIRED_GOLD_TABLES:
        if name != "tabela_resumo":
            _write_minimal_gold_table(gold_month, name)
    (gold_month / f"tabelas_caged_{ano}_{mes:02d}.xlsx").write_bytes(b"xlsx")


@pytest.fixture
def data_lake(tmp_path, monkeypatch):
    silver = tmp_path / "silver" / "caged"
    gold = tmp_path / "gold" / "caged"
    monkeypatch.setattr("pipelines.gold.validate_gold.SILVER_CAGED_DIR", silver)
    monkeypatch.setattr("pipelines.gold.validate_gold.GOLD_CAGED_DIR", gold)
    return {"silver": silver, "gold": gold}


def test_silver_input_valid(data_lake):
    month = data_lake["silver"] / "ano=2026" / "mes=02"
    _write_silver_parquet(month / "caged_tratado.parquet")
    (month / "metadata.json").write_text(
        json.dumps({"validation_status": "ok"}), encoding="utf-8"
    )

    result = validate_silver_input_for_gold(2026, 2)

    assert result.validation_status == "ok"
    assert result.row_count == 3
    assert not result.missing_required_columns


def test_silver_parquet_missing_returns_error(data_lake):
    result = validate_silver_input_for_gold(2026, 2)

    assert result.validation_status == "error"
    assert any("ausente" in e.lower() for e in result.errors)


def test_silver_metadata_error_blocks_gold(data_lake):
    month = data_lake["silver"] / "ano=2026" / "mes=02"
    month.mkdir(parents=True)
    _write_silver_parquet(month / "caged_tratado.parquet")
    (month / "metadata.json").write_text(
        json.dumps({"validation_status": "error"}), encoding="utf-8"
    )

    with pytest.raises(GoldValidationError, match="metadata Silver"):
        ensure_silver_input_valid(validate_silver_input_for_gold(2026, 2))


def test_silver_metadata_missing_generates_warning(data_lake):
    month = data_lake["silver"] / "ano=2026" / "mes=02"
    _write_silver_parquet(month / "caged_tratado.parquet")

    result = validate_silver_input_for_gold(2026, 2)

    assert result.validation_status == "warning"
    assert any("metadata" in w.lower() for w in result.warnings)


def test_silver_missing_required_column(data_lake):
    month = data_lake["silver"] / "ano=2026" / "mes=02"
    month.mkdir(parents=True)
    df = pd.DataFrame(_silver_columns())
    df = df.drop(columns=["admissao"])
    df.to_parquet(month / "caged_tratado.parquet", index=False)

    result = validate_silver_input_for_gold(2026, 2)

    assert result.validation_status == "error"
    assert "admissao" in result.missing_required_columns


def test_gold_outputs_valid(data_lake):
    gold_month = data_lake["gold"] / "ano=2026" / "mes=02"
    _setup_valid_gold(gold_month)

    result = validate_gold_outputs(2026, 2)

    assert result.validation_status == "ok"
    assert result.required_tables_ok is True
    assert result.tabela_resumo_ok is True
    assert result.totals_consistency_ok is True
    assert result.admissoes_total == 10


def test_gold_missing_tabela_resumo(data_lake):
    gold_month = data_lake["gold"] / "ano=2026" / "mes=02"
    gold_month.mkdir(parents=True)
    for name in MIN_REQUIRED_GOLD_TABLES:
        if name != "tabela_resumo":
            _write_minimal_gold_table(gold_month, name)

    result = validate_gold_outputs(2026, 2)

    assert result.validation_status == "error"
    assert "tabela_resumo" in result.missing_required_tables or any(
        "tabela_resumo" in e for e in result.errors
    )


def test_gold_missing_required_table(data_lake):
    gold_month = data_lake["gold"] / "ano=2026" / "mes=02"
    _setup_valid_gold(gold_month)
    (gold_month / "tabela_setor_pr.csv").unlink()
    (gold_month / "tabela_setor_pr.parquet").unlink()

    result = validate_gold_outputs(2026, 2)

    assert result.validation_status == "error"
    assert "tabela_setor_pr" in result.missing_required_tables


def test_gold_csv_without_parquet(data_lake):
    gold_month = data_lake["gold"] / "ano=2026" / "mes=02"
    _setup_valid_gold(gold_month)
    (gold_month / "tabela_uf.parquet").unlink()

    result = validate_gold_outputs(2026, 2)

    assert result.validation_status == "error"
    assert "tabela_uf" in result.csv_without_parquet


def test_gold_parquet_without_csv(data_lake):
    gold_month = data_lake["gold"] / "ano=2026" / "mes=02"
    _setup_valid_gold(gold_month)
    (gold_month / "tabela_uf.csv").unlink()

    result = validate_gold_outputs(2026, 2)

    assert result.validation_status == "error"
    assert "tabela_uf" in result.parquet_without_csv


def test_tabela_resumo_inconsistent_saldo(data_lake):
    gold_month = data_lake["gold"] / "ano=2026" / "mes=02"
    _setup_valid_gold(gold_month)
    _write_resumo(gold_month, 2026, 2, adm=10, des=4)
    # Corrompe saldo manualmente
    bad = pd.read_csv(gold_month / "tabela_resumo.csv")
    bad.loc[0, "saldo"] = 99
    bad.to_csv(gold_month / "tabela_resumo.csv", index=False)

    result = validate_gold_outputs(2026, 2)

    assert result.validation_status == "error"
    assert not result.totals_consistency_ok


def test_suspected_legacy_tabela_perfil(data_lake):
    gold_month = data_lake["gold"] / "ano=2026" / "mes=02"
    _setup_valid_gold(gold_month)
    _write_minimal_gold_table(gold_month, "tabela_perfil")

    result = validate_gold_outputs(2026, 2)

    assert "tabela_perfil" in result.suspected_legacy_files
    assert result.validation_status == "warning"


def test_write_gold_metadata(data_lake):
    gold_month = data_lake["gold"] / "ano=2026" / "mes=02"
    _setup_valid_gold(gold_month)
    silver_month = data_lake["silver"] / "ano=2026" / "mes=02"
    _write_silver_parquet(silver_month / "caged_tratado.parquet")

    silver_input = validate_silver_input_for_gold(2026, 2)
    gold_output = validate_gold_outputs(2026, 2)
    path = write_gold_metadata(2026, 2, silver_input, gold_output)

    metadata = json.loads(path.read_text(encoding="utf-8"))
    assert metadata["validation_status"] == "ok"
    assert metadata["admissoes_total"] == 10
    assert metadata["silver_input_status"] in ("ok", "warning")
    assert "table_count_csv" in metadata


@patch.object(monthly_module, "run_aggregate_indicators")
@patch.object(monthly_module, "run_clean_caged")
@patch.object(monthly_module, "run_ingest_caged")
def test_validate_gold_only_skips_bronze_silver_aggregate(
    mock_ingest, mock_clean, mock_gold, data_lake
):
    gold_month = data_lake["gold"] / "ano=2026" / "mes=02"
    _setup_valid_gold(gold_month)

    run_validate_gold_only(2026, 2)

    mock_ingest.assert_not_called()
    mock_clean.assert_not_called()
    mock_gold.assert_not_called()


@patch.object(monthly_module, "run_aggregate_indicators")
@patch.object(monthly_module, "run_clean_caged")
@patch.object(monthly_module, "run_ingest_caged")
def test_validate_gold_only_via_pipeline(mock_ingest, mock_clean, mock_gold, data_lake):
    gold_month = data_lake["gold"] / "ano=2026" / "mes=02"
    _setup_valid_gold(gold_month)

    monthly_module.run_monthly_pipeline(ano=2026, mes=2, validate_gold_only=True)

    mock_ingest.assert_not_called()
    mock_clean.assert_not_called()
    mock_gold.assert_not_called()


def test_parse_args_accepts_validate_gold_only_flag():
    with patch("sys.argv", ["run_monthly_pipeline", "--validate-gold-only"]):
        args = monthly_module._parse_args()
    assert args.validate_gold_only is True


def test_normal_pipeline_still_calls_gold():
    with (
        patch.object(monthly_module, "run_ingest_caged") as mock_ingest,
        patch.object(monthly_module, "run_clean_caged") as mock_clean,
        patch.object(monthly_module, "run_aggregate_indicators") as mock_gold,
    ):
        monthly_module.run_monthly_pipeline(ano=2026, mes=2)

    mock_ingest.assert_called_once()
    mock_clean.assert_called_once()
    mock_gold.assert_called_once()
