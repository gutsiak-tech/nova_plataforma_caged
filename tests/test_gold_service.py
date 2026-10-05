"""Testes de resolução de competência e caminhos Gold."""

import pytest

from app.services.gold_service import (
    GoldMonthRef,
    resolve_gold_month,
    validate_ano,
    validate_mes,
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


def test_resolve_gold_month_uses_config_defaults(monkeypatch):
    monkeypatch.setattr("app.services.gold_service.DEFAULT_ANO", 2025)
    monkeypatch.setattr("app.services.gold_service.DEFAULT_MES", 11)
    month = resolve_gold_month()
    assert month.ano == 2025
    assert month.mes == 11


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
