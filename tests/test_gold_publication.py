"""Testes sintéticos da validade e publicação atômica de competências Gold."""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
import pytest

from app.services.gold_readiness import build_readiness_report
from app.services.gold_service import list_available_competencias
from pipelines.gold.gold_contract import MIN_REQUIRED_GOLD_TABLES
from pipelines.gold.publication import (
    previous_gold_competencia_dir,
    select_published_gold_competencia_dir,
)
from pipelines.gold.validate_gold import (
    GoldValidationError,
    SilverInputValidationResult,
    validate_and_publish_gold,
)


def _month_dir(root: Path, ano: int = 2026, mes: int = 2) -> Path:
    return root / f"ano={ano}" / f"mes={mes:02d}"


def _write_required_tables(month_dir: Path, *, both_formats: bool = False) -> None:
    month_dir.mkdir(parents=True, exist_ok=True)
    for table_name in MIN_REQUIRED_GOLD_TABLES:
        frame = pd.DataFrame({"saldo": [0]})
        if table_name == "tabela_resumo":
            frame = pd.DataFrame(
                {
                    "competencia": ["2026-02"],
                    "admissoes": [1],
                    "desligamentos": [1],
                    "saldo": [0],
                }
            )
        frame.to_csv(month_dir / f"{table_name}.csv", index=False)
        if both_formats:
            frame.to_parquet(month_dir / f"{table_name}.parquet", index=False)


def _write_published_gold(
    month_dir: Path,
    *,
    status: str = "ok",
    complete: bool = True,
) -> None:
    month_dir.mkdir(parents=True, exist_ok=True)
    if complete:
        _write_required_tables(month_dir)
    else:
        pd.DataFrame(
            {
                "competencia": ["2026-02"],
                "admissoes": [1],
                "desligamentos": [1],
                "saldo": [0],
            }
        ).to_csv(month_dir / "tabela_resumo.csv", index=False)
    (month_dir / "metadata.json").write_text(
        json.dumps({"validation_status": status}),
        encoding="utf-8",
    )


@pytest.mark.parametrize("status", ["ok", "warning"])
def test_valid_gold_is_available_for_accepted_statuses(tmp_path, status):
    gold_root = tmp_path / "gold" / "caged"
    _write_published_gold(_month_dir(gold_root), status=status)

    items = list_available_competencias(gold_root=gold_root)

    assert [item["competencia"] for item in items] == ["2026-02"]


@pytest.mark.parametrize(
    "case",
    ["missing_metadata", "corrupt_metadata", "error", "processing", "partial"],
)
def test_invalid_or_incomplete_gold_is_not_available(tmp_path, case):
    gold_root = tmp_path / "gold" / "caged"
    month_dir = _month_dir(gold_root)
    _write_required_tables(month_dir)

    if case == "missing_metadata":
        pass
    elif case == "corrupt_metadata":
        (month_dir / "metadata.json").write_text("{", encoding="utf-8")
    elif case == "partial":
        for table_name in MIN_REQUIRED_GOLD_TABLES:
            if table_name != "tabela_resumo":
                (month_dir / f"{table_name}.csv").unlink()
        (month_dir / "metadata.json").write_text(
            json.dumps({"validation_status": "ok"}),
            encoding="utf-8",
        )
    else:
        (month_dir / "metadata.json").write_text(
            json.dumps({"validation_status": case}),
            encoding="utf-8",
        )

    assert list_available_competencias(gold_root=gold_root) == []


def test_reader_falls_back_to_previous_during_swap(tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    final_dir = _month_dir(gold_root)
    previous_dir = previous_gold_competencia_dir(final_dir)
    _write_published_gold(previous_dir)

    selected = select_published_gold_competencia_dir(gold_root, 2026, 2)

    assert selected == previous_dir
    assert [item["competencia"] for item in list_available_competencias(gold_root=gold_root)] == [
        "2026-02"
    ]


def test_successful_publication_replaces_previous_gold(tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    final_dir = _month_dir(gold_root)
    staging_dir = final_dir.with_name(".mes=02.staging-test")
    _write_published_gold(final_dir)
    (final_dir / "version.txt").write_text("old", encoding="utf-8")
    _write_required_tables(staging_dir, both_formats=True)

    result = validate_and_publish_gold(
        2026,
        2,
        silver_input=SilverInputValidationResult(
            ano=2026,
            mes=2,
            validation_status="ok",
        ),
        staging_dir=staging_dir,
        final_dir=final_dir,
    )

    assert result.validation_status in {"ok", "warning"}
    assert not (final_dir / "version.txt").exists()
    assert json.loads((final_dir / "metadata.json").read_text(encoding="utf-8"))[
        "validation_status"
    ] in {"ok", "warning"}
    assert not previous_gold_competencia_dir(final_dir).exists()


def test_failed_reprocessing_preserves_previous_gold(tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    final_dir = _month_dir(gold_root)
    staging_dir = final_dir.with_name(".mes=02.staging-test")
    _write_published_gold(final_dir)
    (final_dir / "version.txt").write_text("old", encoding="utf-8")
    staging_dir.mkdir(parents=True)
    pd.DataFrame({"saldo": [0]}).to_csv(
        staging_dir / "tabela_resumo.csv",
        index=False,
    )

    with pytest.raises(GoldValidationError):
        validate_and_publish_gold(
            2026,
            2,
            silver_input=SilverInputValidationResult(
                ano=2026,
                mes=2,
                validation_status="ok",
            ),
            staging_dir=staging_dir,
            final_dir=final_dir,
        )

    assert (final_dir / "version.txt").read_text(encoding="utf-8") == "old"
    assert [item["competencia"] for item in list_available_competencias(gold_root=gold_root)] == [
        "2026-02"
    ]


def test_readiness_uses_same_validity_rule(monkeypatch, tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    month_dir = _month_dir(gold_root)
    _write_published_gold(month_dir, complete=False)
    catalog_path = tmp_path / "gold_catalog.json"
    catalog_path.write_text(
        json.dumps({"summary": {}, "partitions": [], "tables": []}),
        encoding="utf-8",
    )

    monkeypatch.setattr("app.services.gold_readiness.GOLD_CAGED_DIR", gold_root)
    monkeypatch.setattr("app.services.gold_readiness.GOLD_CATALOG_JSON", catalog_path)
    monkeypatch.setattr("app.services.gold_readiness.DEFAULT_ANO", 2026)
    monkeypatch.setattr("app.services.gold_readiness.DEFAULT_MES", 2)
    monkeypatch.setattr("app.services.gold_service.GOLD_CAGED_DIR", gold_root)
    monkeypatch.setattr("app.services.gold_service.DEFAULT_ANO", 2026)
    monkeypatch.setattr("app.services.gold_service.DEFAULT_MES", 2)
    monkeypatch.setattr("app.services.gold_catalog_service.GOLD_CATALOG_JSON", catalog_path)

    report = build_readiness_report()

    assert report["status"] == "not_ready"
    assert report["checks"]["competencias_available"] is False
    assert report["checks"]["gold_required_files_ok"] is False
