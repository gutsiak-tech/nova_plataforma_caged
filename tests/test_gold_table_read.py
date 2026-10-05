"""Testes de leitura preferencial Parquet na camada Gold."""

from __future__ import annotations

import json
import logging

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import gold_service
from app.services.gold_service import (
    GoldMonthRef,
    clear_gold_read_cache,
    get_table_csv_path,
    get_table_parquet_path,
    read_gold_table,
    resolve_gold_table_paths,
)
from pipelines.gold.gold_contract import MIN_REQUIRED_GOLD_TABLES

client = TestClient(app)

_OVERVIEW_TABLE_BASES = (
    "tabela_municipio",
    "tabela_setor",
    "tabela_ocupacao",
    "tabela_perfil_sexo",
    "tabela_perfil_faixa_etaria",
    "tabela_perfil_graudeinstrucao",
    "tabela_perfil_sexo_faixa_etaria",
    "tabela_perfil_sexo_instrucao",
    "tabela_perfil_faixa_etaria_instrucao",
    "tabela_perfil_sexo_salario",
    "tabela_perfil_faixa_etaria_salario",
    "tabela_perfil_graudeinstrucao_salario",
    "tabela_resumo_salario",
    "tabela_perfil_sexo_faixa_etaria_salario",
    "tabela_perfil_sexo_instrucao_salario",
    "tabela_perfil_faixa_etaria_instrucao_salario",
)


def _clear_read_caches() -> None:
    clear_gold_read_cache()


def _setup_month_dir(gold_root, ano: int = 2026, mes: int = 2):
    month_dir = gold_root / f"ano={ano}" / f"mes={mes:02d}"
    month_dir.mkdir(parents=True, exist_ok=True)
    for table_name in MIN_REQUIRED_GOLD_TABLES:
        (month_dir / f"{table_name}.csv").write_text(
            "saldo,admissoes,desligamentos\n0,0,0\n",
            encoding="utf-8",
        )
    (month_dir / "tabela_resumo.csv").write_text(
        f"competencia,admissoes,desligamentos,saldo\n{ano}-{mes:02d},1,1,0\n",
        encoding="utf-8",
    )
    (month_dir / "metadata.json").write_text(
        json.dumps({"validation_status": "ok"}),
        encoding="utf-8",
    )
    return month_dir


def _patch_gold_root(monkeypatch, gold_root):
    monkeypatch.setattr("app.services.gold_service.GOLD_CAGED_DIR", gold_root)
    monkeypatch.setattr("app.services.gold_service.DEFAULT_ANO", 2026)
    monkeypatch.setattr("app.services.gold_service.DEFAULT_MES", 2)


def _write_overview_scope_tables(month_dir, suffix: str) -> None:
    row = {"saldo": [1], "admissoes": [1], "desligamentos": [0]}
    for stem in _OVERVIEW_TABLE_BASES:
        pd.DataFrame(row).to_csv(month_dir / f"{stem}{suffix}.csv", index=False)


def _setup_overview_pr_gold(gold_root):
    month_dir = _setup_month_dir(gold_root)
    pd.DataFrame(
        {"uf": ["PR"], "saldo": [10], "admissoes": [6], "desligamentos": [4]}
    ).to_csv(month_dir / "tabela_uf.csv", index=False)
    _write_overview_scope_tables(month_dir, "_pr")
    return month_dir


def _setup_overview_br_gold(gold_root):
    month_dir = _setup_month_dir(gold_root)
    _write_overview_scope_tables(month_dir, "")
    pd.DataFrame(
        {"uf": ["PR"], "saldo": [10], "admissoes": [6], "desligamentos": [4]}
    ).to_csv(month_dir / "tabela_uf.csv", index=False)
    return month_dir


def _setup_overview_rmc_gold(gold_root):
    month_dir = _setup_month_dir(gold_root)
    _write_overview_scope_tables(month_dir, "_rmc")
    pd.DataFrame(
        {
            "municipio": ["Curitiba"],
            "saldo": [8],
            "admissoes": [5],
            "desligamentos": [3],
        }
    ).to_csv(month_dir / "tabela_municipio_rmc.csv", index=False)
    return month_dir


@pytest.fixture(autouse=True)
def _reset_gold_read_cache_between_tests():
    _clear_read_caches()
    yield
    _clear_read_caches()


def test_resolve_gold_table_paths_scope_br():
    month = GoldMonthRef(ano=2026, mes=2)
    paths = resolve_gold_table_paths(month, "tabela_resumo", "br")
    assert paths.table_name == "tabela_resumo"
    assert paths.csv_path.name == "tabela_resumo.csv"
    assert paths.parquet_path.name == "tabela_resumo.parquet"


def test_resolve_gold_table_paths_scope_pr_rmc():
    month = GoldMonthRef(ano=2026, mes=2)
    pr = resolve_gold_table_paths(month, "tabela_setor", "pr")
    rmc = resolve_gold_table_paths(month, "tabela_setor", "rmc")
    assert pr.table_name == "tabela_setor_pr"
    assert rmc.table_name == "tabela_setor_rmc"
    assert get_table_parquet_path(month, "tabela_setor", "pr").name == "tabela_setor_pr.parquet"
    assert get_table_csv_path(month, "tabela_setor", "rmc").name == "tabela_setor_rmc.csv"


def test_read_gold_table_prefers_parquet_when_both_exist(monkeypatch, tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    monkeypatch.setattr("app.services.gold_service.GOLD_CAGED_DIR", gold_root)
    month_dir = _setup_month_dir(gold_root)
    month = GoldMonthRef(ano=2026, mes=2)

    pd.DataFrame({"secao": ["A"], "saldo": [1]}).to_csv(
        month_dir / "tabela_setor.csv", index=False
    )
    pd.DataFrame({"secao": ["A"], "saldo": [999]}).to_parquet(
        month_dir / "tabela_setor.parquet", index=False
    )

    df = read_gold_table(month, "tabela_setor", "br")
    assert int(df.loc[0, "saldo"]) == 999


def test_read_gold_table_uses_csv_when_parquet_missing(monkeypatch, tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    monkeypatch.setattr("app.services.gold_service.GOLD_CAGED_DIR", gold_root)
    month_dir = _setup_month_dir(gold_root)
    month = GoldMonthRef(ano=2026, mes=2)

    pd.DataFrame({"secao": ["B"], "saldo": [42]}).to_csv(
        month_dir / "tabela_setor.csv", index=False
    )

    df = read_gold_table(month, "tabela_setor", "br")
    assert int(df.loc[0, "saldo"]) == 42


def test_read_gold_table_falls_back_to_csv_when_parquet_corrupt(monkeypatch, tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    monkeypatch.setattr("app.services.gold_service.GOLD_CAGED_DIR", gold_root)
    month_dir = _setup_month_dir(gold_root)
    month = GoldMonthRef(ano=2026, mes=2)

    pd.DataFrame({"secao": ["C"], "saldo": [7]}).to_csv(
        month_dir / "tabela_setor.csv", index=False
    )
    (month_dir / "tabela_setor.parquet").write_bytes(b"not-a-parquet-file")

    df = read_gold_table(month, "tabela_setor", "br")
    assert int(df.loc[0, "saldo"]) == 7


def test_read_gold_table_raises_when_neither_format_exists(monkeypatch, tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    monkeypatch.setattr("app.services.gold_service.GOLD_CAGED_DIR", gold_root)
    _setup_month_dir(gold_root)
    month = GoldMonthRef(ano=2026, mes=2)

    with pytest.raises(FileNotFoundError, match="Tabela Gold não encontrada"):
        read_gold_table(month, "tabela_perfil_sexo", "br")


def test_table_endpoint_structure_unchanged_with_parquet(monkeypatch, tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    month_dir = _setup_month_dir(gold_root)
    monkeypatch.setattr("app.services.gold_service.GOLD_CAGED_DIR", gold_root)
    monkeypatch.setattr("app.services.gold_service.DEFAULT_ANO", 2026)
    monkeypatch.setattr("app.services.gold_service.DEFAULT_MES", 2)

    pd.DataFrame(
        {
            "competencia": ["2026-02"],
            "admissoes": [10],
            "desligamentos": [5],
            "saldo": [5],
        }
    ).to_parquet(month_dir / "tabela_resumo.parquet", index=False)

    response = client.get("/api/gold/v1/table/tabela_resumo?scope=br&ano=2026&mes=2")
    assert response.status_code == 200
    body = response.json()
    assert body["month"] == {"ano": 2026, "mes": 2}
    assert body["scope"] == "br"
    assert body["table"] == "tabela_resumo"
    assert "columns" in body
    assert "rows" in body
    assert "total" in body
    assert body["rows"][0]["saldo"] == 5


def test_overview_works_with_parquet_only_resumo(monkeypatch, tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    month_dir = _setup_month_dir(gold_root)
    monkeypatch.setattr("app.services.gold_service.GOLD_CAGED_DIR", gold_root)
    monkeypatch.setattr("app.services.gold_service.DEFAULT_ANO", 2026)
    monkeypatch.setattr("app.services.gold_service.DEFAULT_MES", 2)

    for stem in (
        "tabela_resumo",
        "tabela_municipio",
        "tabela_setor",
        "tabela_ocupacao",
        "tabela_perfil_sexo",
        "tabela_perfil_faixa_etaria",
        "tabela_perfil_graudeinstrucao",
        "tabela_perfil_sexo_faixa_etaria",
        "tabela_perfil_sexo_instrucao",
        "tabela_perfil_faixa_etaria_instrucao",
        "tabela_perfil_sexo_salario",
        "tabela_perfil_faixa_etaria_salario",
        "tabela_perfil_graudeinstrucao_salario",
        "tabela_perfil_sexo_faixa_etaria_salario",
        "tabela_perfil_sexo_instrucao_salario",
        "tabela_perfil_faixa_etaria_instrucao_salario",
        "tabela_uf",
    ):
        pd.DataFrame({"saldo": [1], "admissoes": [1], "desligamentos": [0]}).to_parquet(
            month_dir / f"{stem}.parquet", index=False
        )

    pd.DataFrame({"uf": ["PR"], "saldo": [2], "admissoes": [2], "desligamentos": [0]}).to_parquet(
        month_dir / "tabela_uf.parquet", index=False
    )
    pd.DataFrame(
        {"municipio": ["Curitiba"], "saldo": [3], "admissoes": [3], "desligamentos": [0]}
    ).to_parquet(month_dir / "tabela_municipio.parquet", index=False)

    response = client.get("/api/gold/v1/overview?scope=br&ano=2026&mes=2")
    assert response.status_code == 200
    body = response.json()
    assert body["month"] == {"ano": 2026, "mes": 2}
    assert body["scope"] == "br"
    assert "resumo" in body
    assert "rankings" in body


def test_meta_lists_tables_with_csv_only(monkeypatch, tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    _setup_month_dir(gold_root)
    monkeypatch.setattr("app.services.gold_service.GOLD_CAGED_DIR", gold_root)
    monkeypatch.setattr("app.services.gold_service.DEFAULT_ANO", 2026)
    monkeypatch.setattr("app.services.gold_service.DEFAULT_MES", 2)

    response = client.get("/api/gold/v1/meta?ano=2026&mes=2")
    assert response.status_code == 200
    body = response.json()
    assert body["month"] == {"ano": 2026, "mes": 2}
    assert "tabela_resumo" in body["tables"]


def test_read_gold_table_logs_parquet_source(monkeypatch, tmp_path, caplog):
    gold_root = tmp_path / "gold" / "caged"
    monkeypatch.setattr("app.services.gold_service.GOLD_CAGED_DIR", gold_root)
    month_dir = _setup_month_dir(gold_root)
    month = GoldMonthRef(ano=2026, mes=2)

    pd.DataFrame({"saldo": [1]}).to_csv(month_dir / "tabela_setor.csv", index=False)
    pd.DataFrame({"saldo": [2]}).to_parquet(month_dir / "tabela_setor.parquet", index=False)

    with caplog.at_level(logging.INFO, logger="api.gold"):
        read_gold_table(month, "tabela_setor", "br")

    assert any(
        "Gold table loaded | source=parquet | table=tabela_setor | scope=br | competencia=2026-02"
        in record.message
        for record in caplog.records
    )


def test_read_gold_table_logs_csv_source_when_parquet_missing(monkeypatch, tmp_path, caplog):
    gold_root = tmp_path / "gold" / "caged"
    monkeypatch.setattr("app.services.gold_service.GOLD_CAGED_DIR", gold_root)
    month_dir = _setup_month_dir(gold_root)
    month = GoldMonthRef(ano=2026, mes=2)

    pd.DataFrame({"saldo": [42]}).to_csv(month_dir / "tabela_setor.csv", index=False)

    with caplog.at_level(logging.INFO, logger="api.gold"):
        read_gold_table(month, "tabela_setor", "br")

    assert any(
        "Gold table loaded | source=csv | table=tabela_setor | scope=br | competencia=2026-02"
        in record.message
        for record in caplog.records
    )


def test_table_not_found_returns_gold_table_not_found(monkeypatch, tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    _setup_month_dir(gold_root)
    monkeypatch.setattr("app.services.gold_service.GOLD_CAGED_DIR", gold_root)

    response = client.get(
        "/api/gold/v1/table/tabela_perfil_sexo?scope=br&ano=2026&mes=2"
    )
    assert response.status_code == 404
    body = response.json()
    assert body["error"]["code"] == "GOLD_TABLE_NOT_FOUND"


def test_overview_pr_does_not_read_tabela_resumo_with_scope_pr(monkeypatch, tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    _setup_overview_pr_gold(gold_root)
    _patch_gold_root(monkeypatch, gold_root)

    calls: list[tuple[str, str]] = []
    real_read = gold_service.read_gold_table

    def tracking_read(month, base_name, scope):
        calls.append((base_name, scope))
        return real_read(month, base_name=base_name, scope=scope)

    monkeypatch.setattr("app.api.routes_gold.read_gold_table", tracking_read)

    response = client.get("/api/gold/v1/overview?scope=pr&ano=2026&mes=2")
    assert response.status_code == 200
    assert ("tabela_resumo", "pr") not in calls
    assert ("tabela_resumo", "rmc") not in calls
    assert response.json()["resumo"]["saldo"] == 10.0


def test_overview_rmc_does_not_read_tabela_resumo_with_scope_rmc(monkeypatch, tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    _setup_overview_rmc_gold(gold_root)
    _patch_gold_root(monkeypatch, gold_root)

    calls: list[tuple[str, str]] = []
    real_read = gold_service.read_gold_table

    def tracking_read(month, base_name, scope):
        calls.append((base_name, scope))
        return real_read(month, base_name=base_name, scope=scope)

    monkeypatch.setattr("app.api.routes_gold.read_gold_table", tracking_read)

    response = client.get("/api/gold/v1/overview?scope=rmc&ano=2026&mes=2")
    assert response.status_code == 200
    assert ("tabela_resumo", "pr") not in calls
    assert ("tabela_resumo", "rmc") not in calls
    assert response.json()["resumo"]["saldo"] == 8.0


@pytest.mark.parametrize(
    ("scope", "expected"),
    [("br", 2000.0), ("pr", 2100.0), ("rmc", 2200.0)],
)
def test_overview_exposes_territorial_salary_median(monkeypatch, tmp_path, scope, expected):
    gold_root = tmp_path / "gold" / "caged"
    setup = {
        "br": _setup_overview_br_gold,
        "pr": _setup_overview_pr_gold,
        "rmc": _setup_overview_rmc_gold,
    }[scope]
    month_dir = setup(gold_root)
    suffix = "" if scope == "br" else f"_{scope}"
    pd.DataFrame(
        {"n_salarios_validos": [5], "salario_mediano": [expected]}
    ).to_csv(month_dir / f"tabela_resumo_salario{suffix}.csv", index=False)
    _patch_gold_root(monkeypatch, gold_root)

    response = client.get(f"/api/gold/v1/overview?scope={scope}&ano=2026&mes=2")

    assert response.status_code == 200
    assert response.json()["salary_summary"] == {"median": expected}


def test_overview_does_not_fallback_to_first_sex_group_median(monkeypatch, tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    month_dir = _setup_overview_br_gold(gold_root)
    (month_dir / "tabela_resumo_salario.csv").unlink()
    pd.DataFrame(
        [
            {"sexo": "Mulher", "saldo": 100, "salario_mediano": 1900.0},
            {"sexo": "Homem", "saldo": 50, "salario_mediano": 2079.17},
        ]
    ).to_csv(month_dir / "tabela_perfil_sexo_salario.csv", index=False)
    _patch_gold_root(monkeypatch, gold_root)

    response = client.get("/api/gold/v1/overview?scope=br&ano=2026&mes=2")

    assert response.status_code == 200
    assert response.json()["salary_summary"] == {"median": None}


def test_overview_pr_emits_no_missing_resumo_error_log(monkeypatch, tmp_path, caplog):
    gold_root = tmp_path / "gold" / "caged"
    _setup_overview_pr_gold(gold_root)
    _patch_gold_root(monkeypatch, gold_root)

    with caplog.at_level(logging.ERROR, logger="api.gold"):
        response = client.get("/api/gold/v1/overview?scope=pr&ano=2026&mes=2")

    assert response.status_code == 200
    for record in caplog.records:
        assert "tabela_resumo_pr" not in record.message
        assert "table=tabela_resumo | scope=pr" not in record.message


def test_table_tabela_resumo_scope_pr_returns_invalid_scope(monkeypatch, tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    _setup_month_dir(gold_root)
    _patch_gold_root(monkeypatch, gold_root)

    response = client.get("/api/gold/v1/table/tabela_resumo?scope=pr&ano=2026&mes=2")
    assert response.status_code == 400
    body = response.json()
    assert body["error"]["code"] == "INVALID_SCOPE"
    assert "scope=br" in body["error"]["message"]


def test_clear_gold_read_cache_returns_cleared_counts(monkeypatch, tmp_path):
    from app.services.gold_service import _read_csv_cached, _read_parquet_cached

    gold_root = tmp_path / "gold" / "caged"
    month_dir = _setup_month_dir(gold_root)
    pd.DataFrame({"saldo": [1], "admissoes": [1], "desligamentos": [0]}).to_parquet(
        month_dir / "tabela_resumo.parquet", index=False
    )
    _patch_gold_root(monkeypatch, gold_root)

    read_gold_table(GoldMonthRef(ano=2026, mes=2), "tabela_resumo", "br")
    result = clear_gold_read_cache()
    assert result["parquet_entries"] >= 1
    assert result["csv_entries"] >= 0
    assert _read_csv_cached.cache_info().currsize == 0
    assert _read_parquet_cached.cache_info().currsize == 0


def test_clear_gold_read_cache_refreshes_when_file_key_unchanged(monkeypatch, tmp_path):
    """Sem limpeza, LRU pode servir DataFrame antigo se a chave de cache não mudar."""
    from app.services.gold_service import _read_csv_cached, _read_parquet_cached

    gold_root = tmp_path / "gold" / "caged"
    month_dir = _setup_month_dir(gold_root)
    parquet_path = month_dir / "tabela_resumo.parquet"
    pd.DataFrame({"saldo": [1], "admissoes": [1], "desligamentos": [0]}).to_parquet(
        parquet_path, index=False
    )
    _patch_gold_root(monkeypatch, gold_root)
    monkeypatch.setattr(
        "app.services.gold_service._cache_key_from_path",
        lambda _path: "fixed-cache-key",
    )

    month = GoldMonthRef(ano=2026, mes=2)
    first = read_gold_table(month, "tabela_resumo", "br")
    assert int(first["saldo"].iloc[0]) == 1

    pd.DataFrame({"saldo": [99], "admissoes": [50], "desligamentos": [40]}).to_parquet(
        parquet_path, index=False
    )

    stale = read_gold_table(month, "tabela_resumo", "br")
    assert int(stale["saldo"].iloc[0]) == 1

    cleared = clear_gold_read_cache()
    assert cleared["parquet_entries"] >= 1

    fresh = read_gold_table(month, "tabela_resumo", "br")
    assert int(fresh["saldo"].iloc[0]) == 99
