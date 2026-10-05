"""Testes de validação Silver e contrato Bronze → Silver."""

import json
from pathlib import Path
from unittest.mock import patch

import pandas as pd
import pytest

from pipelines.jobs import run_monthly_pipeline as monthly_module
from pipelines.silver.clean_caged import run_clean_caged
from pipelines.silver.validate_silver import (
    SilverValidationError,
    check_bronze_metadata_gate,
    validate_silver_dataframe,
)

HEADER = (
    "competênciamov;região;uf;município;seção;subclasse;saldomovimentação;"
    "cbo2002ocupação;graudeinstrução;idade;horascontratuais;raçacor;"
    "sexo;tipomovimentação;salário;valorsaláriofixo"
)


def _sample_row(competencia: str = "202602", saldo: int = 1) -> str:
    return (
        f"{competencia};3;41;410690;M;6911701;{saldo};351430;7;24;44,00;3;3;"
        f"97;2000,00;2000,00"
    )


def _write_microdados(path: Path, rows: list[str], competencia: str = "202602") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        HEADER + "\n" + "\n".join(rows) + "\n",
        encoding="utf-8",
    )


def _valid_silver_df(ano: int = 2026, mes: int = 2, n: int = 4) -> pd.DataFrame:
    mov = int(f"{ano}{mes:02d}")
    saldo = pd.Series([1, -1, 1, -1][:n])
    return pd.DataFrame(
        {
            "competenciamov": [mov] * n,
            "saldomovimentacao": saldo,
            "horascontratuais": [44.0] * n,
            "salario": [2000.0] * n,
            "valorsalariofixo": [2000.0] * n,
            "idade": [24, 30, 40, 50][:n],
            "regiao": [3] * n,
            "uf": ["41"] * n,
            "municipio": ["410690"] * n,
            "secao": ["M"] * n,
            "subclasse": ["6911701"] * n,
            "cbo2002ocupacao": ["351430"] * n,
            "graudeinstrucao": ["7"] * n,
            "racacor": ["3"] * n,
            "sexo": ["3"] * n,
            "tipomovimentacao": ["97"] * n,
            "competencia_date": pd.to_datetime([f"{ano}-{mes:02d}-01"] * n),
            "admissao": (saldo == 1).astype(int),
            "desligamento": (saldo == -1).astype(int),
            "faixa_etaria": ["18 a 24 anos"] * n,
        }
    )


@pytest.fixture
def data_lake(tmp_path, monkeypatch):
    bronze = tmp_path / "bronze" / "caged"
    silver = tmp_path / "silver" / "caged"
    monkeypatch.setattr("pipelines.silver.clean_caged.BRONZE_CAGED_DIR", bronze)
    monkeypatch.setattr("pipelines.silver.clean_caged.SILVER_CAGED_DIR", silver)
    monkeypatch.setattr("pipelines.silver.validate_silver.BRONZE_CAGED_DIR", bronze)
    return {"bronze": bronze, "silver": silver}


def test_valid_silver_synthetic_dataframe():
    df = _valid_silver_df()
    result = validate_silver_dataframe(df, 2026, 2)

    assert result.validation_status == "ok"
    assert result.required_columns_ok is True
    assert result.competencia_matches_expected is True
    assert result.saldo_consistency_ok is True
    assert result.admissao_sum == 2
    assert result.desligamento_sum == 2
    assert result.saldo_sum == 0


def test_empty_dataframe_returns_error():
    result = validate_silver_dataframe(pd.DataFrame(), 2026, 2)

    assert result.validation_status == "error"
    assert any("vazio" in e.lower() for e in result.errors)


def test_missing_required_column_returns_error():
    df = _valid_silver_df().drop(columns=["salario"])
    result = validate_silver_dataframe(df, 2026, 2)

    assert result.validation_status == "error"
    assert "salario" in result.missing_required_columns


def test_missing_derived_column_returns_error():
    df = _valid_silver_df().drop(columns=["admissao"])
    result = validate_silver_dataframe(df, 2026, 2)

    assert result.validation_status == "error"
    assert "admissao" in result.missing_derived_columns


def test_competencia_divergente_returns_error():
    df = _valid_silver_df()
    df["competenciamov"] = 202601
    result = validate_silver_dataframe(df, 2026, 2)

    assert result.validation_status == "error"
    assert result.competencia_matches_expected is False


def test_critical_column_all_null_returns_error():
    df = _valid_silver_df()
    df["horascontratuais"] = pd.NA
    result = validate_silver_dataframe(df, 2026, 2)

    assert result.validation_status == "error"
    assert "horascontratuais" in result.null_critical_columns


def test_saldo_inconsistent_returns_error():
    df = _valid_silver_df()
    df.loc[0, "admissao"] = 0
    result = validate_silver_dataframe(df, 2026, 2)

    assert result.validation_status == "error"
    assert result.saldo_consistency_ok is False


def test_bronze_metadata_error_blocks_silver(data_lake, monkeypatch):
    month = data_lake["bronze"] / "ano=2026" / "mes=02"
    month.mkdir(parents=True)
    (month / "metadata.json").write_text(
        json.dumps({"validation_status": "error", "errors": ["teste"]}),
        encoding="utf-8",
    )

    with pytest.raises(SilverValidationError, match="metadata Bronze"):
        check_bronze_metadata_gate(2026, 2)


def test_bronze_metadata_missing_continues_with_warning(data_lake):
    warnings = check_bronze_metadata_gate(2026, 2)

    assert warnings
    assert any("não encontrado" in w.lower() for w in warnings)


def test_run_clean_caged_writes_silver_metadata_and_parquet(data_lake, monkeypatch):
    month_bronze = data_lake["bronze"] / "ano=2026" / "mes=02"
    microdados = month_bronze / "microdados.txt"
    _write_microdados(
        microdados,
        rows=[_sample_row("202602", 1), _sample_row("202602", -1)],
    )
    (month_bronze / "metadata.json").write_text(
        json.dumps({"validation_status": "ok"}),
        encoding="utf-8",
    )
    monkeypatch.setattr(
        "pipelines.bronze.validate_bronze.BRONZE_MIN_FILE_SIZE_WARNING_BYTES", 1
    )

    run_clean_caged(ano=2026, mes=2, diagnosticar=False)

    month_silver = data_lake["silver"] / "ano=2026" / "mes=02"
    assert (month_silver / "caged_tratado.parquet").is_file()
    metadata = json.loads((month_silver / "metadata.json").read_text(encoding="utf-8"))
    assert metadata["validation_status"] in ("ok", "warning")
    assert metadata["row_count"] == 2
    assert metadata["silver_file"] == "caged_tratado.parquet"
    assert "admissao_sum" in metadata


@patch.object(monthly_module, "run_aggregate_indicators")
@patch.object(monthly_module, "run_clean_caged")
@patch.object(monthly_module, "run_ingest_caged")
def test_validate_silver_only_skips_gold(mock_ingest, mock_clean, mock_gold):
    monthly_module.run_monthly_pipeline(ano=2026, mes=2, validate_silver_only=True)

    mock_ingest.assert_called_once_with(ano=2026, mes=2)
    mock_clean.assert_called_once_with(ano=2026, mes=2)
    mock_gold.assert_not_called()


def test_parse_args_accepts_validate_silver_only_flag():
    with patch("sys.argv", ["run_monthly_pipeline", "--validate-silver-only"]):
        args = monthly_module._parse_args()
    assert args.validate_silver_only is True


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
