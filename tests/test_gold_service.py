"""Testes de resolução de competência e caminhos Gold."""

import json
from pathlib import Path

import pytest

from app.services.gold_service import (
    GoldMonthRef,
    resolve_gold_month,
    validate_ano,
    validate_mes,
)
from pipelines.gold.gold_contract import MIN_REQUIRED_GOLD_TABLES


def _make_valid_competencia(root: Path, ano: int, mes: int) -> None:
    month = root / f"ano={ano}" / f"mes={mes:02d}"
    month.mkdir(parents=True)
    for table in MIN_REQUIRED_GOLD_TABLES:
        (month / f"{table}.csv").write_text("saldo\n0\n", encoding="utf-8")
    (month / "metadata.json").write_text(
        json.dumps({"validation_status": "ok"}),
        encoding="utf-8",
    )


def test_gold_month_ref_dir_format(monkeypatch, tmp_path):
    monkeypatch.setattr(
        "app.services.gold_service.GOLD_CAGED_DIR",
        tmp_path / "gold" / "caged",
    )
    month = GoldMonthRef(ano=2026, mes=2)
    assert month.dir == tmp_path / "gold" / "caged" / "ano=2026" / "mes=02"


def test_resolve_gold_month_explicit():
    month = resolve_gold_month(ano=2026, mes=1)
    assert month.ano == 2026
    assert month.mes == 1


def test_resolve_gold_month_uses_latest_without_override(monkeypatch, tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    _make_valid_competencia(gold_root, 2025, 12)
    _make_valid_competencia(gold_root, 2026, 1)
    monkeypatch.setattr("app.services.gold_service.GOLD_CAGED_DIR", gold_root)
    monkeypatch.setattr("app.services.gold_service.DEFAULT_ANO", None)
    monkeypatch.setattr("app.services.gold_service.DEFAULT_MES", None)
    monkeypatch.setattr(
        "app.services.gold_service.DEFAULT_COMPETENCIA_CONFIG_ERROR",
        None,
    )

    month = resolve_gold_month()

    assert (month.ano, month.mes) == (2026, 1)


def test_resolve_gold_month_uses_valid_config_override(monkeypatch, tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    _make_valid_competencia(gold_root, 2026, 1)
    _make_valid_competencia(gold_root, 2026, 2)
    monkeypatch.setattr("app.services.gold_service.GOLD_CAGED_DIR", gold_root)
    monkeypatch.setattr("app.services.gold_service.DEFAULT_ANO", 2026)
    monkeypatch.setattr("app.services.gold_service.DEFAULT_MES", 1)
    monkeypatch.setattr(
        "app.services.gold_service.DEFAULT_COMPETENCIA_CONFIG_ERROR",
        None,
    )

    month = resolve_gold_month()

    assert (month.ano, month.mes) == (2026, 1)


def test_resolve_gold_month_rejects_partial_explicit_competence():
    with pytest.raises(ValueError, match="em conjunto"):
        resolve_gold_month(ano=2026)


def test_validate_mes_invalid():
    with pytest.raises(ValueError, match="mes inválido"):
        validate_mes(0)
    with pytest.raises(ValueError, match="mes inválido"):
        validate_mes(13)


def test_validate_ano_invalid():
    with pytest.raises(ValueError, match="ano inválido"):
        validate_ano(1999)
    with pytest.raises(ValueError, match="ano inválido"):
        validate_ano(2101)


def test_cache_key_differs_by_ano_and_mes(monkeypatch, tmp_path):
    from app.services.gold_service import _cache_key

    gold_root = tmp_path / "gold" / "caged"
    monkeypatch.setattr("app.services.gold_service.GOLD_CAGED_DIR", gold_root)

    month_jan = GoldMonthRef(ano=2026, mes=1)
    month_fev = GoldMonthRef(ano=2026, mes=2)
    month_other_year = GoldMonthRef(ano=2025, mes=1)

    for month in (month_jan, month_fev, month_other_year):
        month_dir = month.dir
        month_dir.mkdir(parents=True, exist_ok=True)
        csv_path = month_dir / "tabela_resumo.csv"
        csv_path.write_text("competencia,admissoes,desligamentos,saldo\n", encoding="utf-8")

    keys = {
        _cache_key(month_jan, "tabela_resumo", "br"),
        _cache_key(month_fev, "tabela_resumo", "br"),
        _cache_key(month_other_year, "tabela_resumo", "br"),
    }
    assert len(keys) == 3
