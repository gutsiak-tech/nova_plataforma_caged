"""Testes de validação Bronze do microdados.txt."""

import hashlib
import json
from pathlib import Path
from unittest.mock import patch

import pytest

from pipelines.bronze.ingest_caged import run_ingest_caged
from pipelines.bronze.microdados_contract import REQUIRED_COLUMNS
from pipelines.bronze.validate_bronze import (
    BronzeValidationError,
    validate_bronze_microdados,
)
from pipelines.jobs import run_monthly_pipeline as monthly_module


HEADER = (
    "competênciamov;região;uf;município;seção;subclasse;saldomovimentação;"
    "cbo2002ocupação;categoria;graudeinstrução;idade;horascontratuais;raçacor;"
    "sexo;tipomovimentação;salário;valorsaláriofixo"
)


def _sample_row(competencia: str = "202603") -> str:
    return (
        f"{competencia};3;41;410690;M;6911701;1;351430;101;7;24;44,00;3;3;"
        f"97;2000,00;2000,00"
    )


def _write_microdados(path: Path, *, header: str = HEADER, rows: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    content = header + "\n" + "\n".join(rows) + "\n"
    path.write_text(content, encoding="utf-8")


@pytest.fixture
def bronze_root(tmp_path, monkeypatch):
    root = tmp_path / "bronze" / "caged"
    monkeypatch.setattr("pipelines.bronze.ingest_caged.BRONZE_CAGED_DIR", root)
    monkeypatch.setattr("pipelines.bronze.validate_bronze.BRONZE_CAGED_DIR", root)
    return root


def test_valid_bronze_synthetic_file(bronze_root):
    month_dir = bronze_root / "ano=2026" / "mes=03"
    microdados = month_dir / "microdados.txt"
    _write_microdados(microdados, rows=[_sample_row("202603"), _sample_row("202603")])

    result = validate_bronze_microdados(
        2026,
        3,
        bronze_dir=month_dir,
        min_size_warning_bytes=1,
    )

    assert result.validation_status == "ok"
    assert result.required_columns_ok is True
    assert result.file_sha256 == hashlib.sha256(microdados.read_bytes()).hexdigest()
    assert result.competencia_matches_path is True
    assert result.row_sample_count == 2


def test_missing_microdados_returns_error(bronze_root):
    month_dir = bronze_root / "ano=2026" / "mes=03"
    month_dir.mkdir(parents=True)

    result = validate_bronze_microdados(2026, 3, bronze_dir=month_dir)

    assert result.validation_status == "error"
    assert any("não encontrado" in err.lower() for err in result.errors)


def test_empty_file_returns_error(bronze_root):
    month_dir = bronze_root / "ano=2026" / "mes=03"
    microdados = month_dir / "microdados.txt"
    month_dir.mkdir(parents=True)
    microdados.write_text("", encoding="utf-8")

    result = validate_bronze_microdados(2026, 3, bronze_dir=month_dir)

    assert result.validation_status == "error"
    assert any("vazio" in err.lower() for err in result.errors)


def test_missing_required_column_returns_error(bronze_root):
    month_dir = bronze_root / "ano=2026" / "mes=03"
    microdados = month_dir / "microdados.txt"
    bad_header = ";".join(
        col for col in HEADER.split(";") if col.lower() != "salário"
    )
    _write_microdados(microdados, header=bad_header, rows=[_sample_row("202603")])

    result = validate_bronze_microdados(
        2026, 3, bronze_dir=month_dir, min_size_warning_bytes=1
    )

    assert result.validation_status == "error"
    assert "salario" in result.missing_required_columns


def test_competencia_mismatch_returns_error(bronze_root):
    month_dir = bronze_root / "ano=2026" / "mes=03"
    microdados = month_dir / "microdados.txt"
    _write_microdados(microdados, rows=[_sample_row("202602")])

    result = validate_bronze_microdados(
        2026, 3, bronze_dir=month_dir, min_size_warning_bytes=1
    )

    assert result.validation_status == "error"
    assert result.competencia_matches_path is False
    assert any("não corresponde" in err for err in result.errors)


def test_run_ingest_writes_metadata_with_sha256(bronze_root, monkeypatch):
    month_dir = bronze_root / "ano=2026" / "mes=03"
    microdados = month_dir / "microdados.txt"
    _write_microdados(microdados, rows=[_sample_row("202603")])
    monkeypatch.setattr(
        "pipelines.bronze.validate_bronze.BRONZE_MIN_FILE_SIZE_WARNING_BYTES", 1
    )

    run_ingest_caged(ano=2026, mes=3)

    metadata = json.loads((month_dir / "metadata.json").read_text(encoding="utf-8"))
    assert metadata["validation_status"] in ("ok", "warning")
    assert metadata["file_sha256"] == hashlib.sha256(microdados.read_bytes()).hexdigest()
    assert metadata["competencia"] == "2026-03"
    assert metadata["status"] == "bronze_warning"
    assert metadata["fonte"] == "Novo CAGED"


def test_run_ingest_raises_on_invalid_bronze(bronze_root):
    month_dir = bronze_root / "ano=2026" / "mes=03"
    month_dir.mkdir(parents=True)

    with pytest.raises(BronzeValidationError):
        run_ingest_caged(ano=2026, mes=3)

    metadata = json.loads((month_dir / "metadata.json").read_text(encoding="utf-8"))
    assert metadata["validation_status"] == "error"


@patch.object(monthly_module, "run_aggregate_indicators")
@patch.object(monthly_module, "run_clean_caged")
@patch.object(monthly_module, "run_ingest_caged")
def test_validate_bronze_only_skips_silver_gold(mock_ingest, mock_clean, mock_gold):
    monthly_module.run_monthly_pipeline(ano=2026, mes=3, validate_bronze_only=True)

    mock_ingest.assert_called_once_with(ano=2026, mes=3)
    mock_clean.assert_not_called()
    mock_gold.assert_not_called()


def test_parse_args_accepts_validate_bronze_only_flag():
    with patch("sys.argv", ["run_monthly_pipeline", "--validate-bronze-only"]):
        args = monthly_module._parse_args()
    assert args.validate_bronze_only is True


def test_normal_pipeline_still_calls_silver_gold():
    with (
        patch.object(monthly_module, "run_ingest_caged") as mock_ingest,
        patch.object(monthly_module, "run_clean_caged") as mock_clean,
        patch.object(monthly_module, "run_aggregate_indicators") as mock_gold,
    ):
        monthly_module.run_monthly_pipeline(ano=2026, mes=2)

    mock_ingest.assert_called_once()
    mock_clean.assert_called_once()
    mock_gold.assert_called_once()


def test_required_columns_cover_silver_minimum():
    for col in ("competenciamov", "saldomovimentacao", "horascontratuais", "salario", "valorsalariofixo"):
        assert col in REQUIRED_COLUMNS
