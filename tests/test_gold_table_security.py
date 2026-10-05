"""Testes de segurança do nome lógico usado pela rota de tabelas Gold."""

from __future__ import annotations

import json
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.gold_catalog_service import CURRENT_PIPELINE_TABLES
from app.services.gold_service import (
    ALLOWED_GOLD_TABLES,
    GoldMonthRef,
    InvalidGoldTableError,
    resolve_gold_table_paths,
    validate_gold_table_name,
)
from pipelines.gold.gold_contract import MIN_REQUIRED_GOLD_TABLES


client = TestClient(app)


@pytest.fixture
def gold_fixture(monkeypatch, tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    month_dir = gold_root / "ano=2026" / "mes=02"
    month_dir.mkdir(parents=True)

    for table_name in MIN_REQUIRED_GOLD_TABLES:
        pd.DataFrame({"saldo": [0]}).to_csv(
            month_dir / f"{table_name}.csv",
            index=False,
        )

    pd.DataFrame(
        {
            "competencia": ["2026-02"],
            "admissoes": [10],
            "desligamentos": [5],
            "saldo": [5],
        }
    ).to_csv(month_dir / "tabela_resumo.csv", index=False)

    for scope, suffix in (("br", ""), ("pr", "_pr"), ("rmc", "_rmc")):
        pd.DataFrame({"secao": [scope], "saldo": [1]}).to_csv(
            month_dir / f"tabela_setor{suffix}.csv",
            index=False,
        )

    (month_dir / "metadata.json").write_text(
        json.dumps({"validation_status": "ok"}),
        encoding="utf-8",
    )

    monkeypatch.setattr("app.services.gold_service.GOLD_CAGED_DIR", gold_root)
    monkeypatch.setattr("app.services.gold_service.DEFAULT_ANO", 2026)
    monkeypatch.setattr("app.services.gold_service.DEFAULT_MES", 2)
    return gold_root


def test_allowlist_is_derived_from_current_pipeline_tables():
    expected = {
        name.removesuffix("_rmc").removesuffix("_pr")
        for name in CURRENT_PIPELINE_TABLES
    }
    assert ALLOWED_GOLD_TABLES == expected


def test_known_table_works_normally(gold_fixture):
    response = client.get(
        "/api/gold/v1/table/tabela_resumo?scope=br&ano=2026&mes=2"
    )

    assert response.status_code == 200
    body = response.json()
    assert body["table"] == "tabela_resumo"
    assert body["rows"][0]["saldo"] == 5


@pytest.mark.parametrize("scope", ["br", "pr", "rmc"])
def test_known_logical_table_works_in_all_scopes(gold_fixture, scope):
    response = client.get(
        f"/api/gold/v1/table/tabela_setor?scope={scope}&ano=2026&mes=2"
    )

    assert response.status_code == 200
    assert response.json()["scope"] == scope
    assert response.json()["rows"][0]["secao"] == scope


@pytest.mark.parametrize(
    "base_name",
    [
        "tabela_que_nao_existe",
        "..",
        r"..\..\silver",
        r"C:\Windows\system32",
        "tabela_resumo.csv",
    ],
)
def test_invalid_logical_table_names_are_rejected_by_service(base_name):
    with pytest.raises(InvalidGoldTableError, match="Tabela Gold inválida"):
        validate_gold_table_name(base_name)


@pytest.mark.parametrize(
    "encoded_name",
    [
        "tabela_que_nao_existe",
        "..%5C..%5Csilver",
        "C:%5CWindows%5Csystem32",
        "tabela_resumo.csv",
    ],
)
def test_invalid_table_http_response_is_safe(gold_fixture, encoded_name):
    response = client.get(
        f"/api/gold/v1/table/{encoded_name}?scope=br&ano=2026&mes=2"
    )

    assert response.status_code == 400
    body = response.json()
    assert body["error"]["code"] == "INVALID_TABLE"
    assert body["error"]["message"] == "Tabela Gold inválida."
    assert body["error"]["details"] == {}
    assert "expected_path" not in response.text
    assert str(gold_fixture) not in response.text


def test_encoded_slash_does_not_match_table_contract(gold_fixture):
    response = client.get(
        "/api/gold/v1/table/tabela_resumo%2Fextra?scope=br&ano=2026&mes=2"
    )

    assert response.status_code == 404
    assert str(gold_fixture) not in response.text


@pytest.mark.parametrize("scope", ["br", "pr", "rmc"])
def test_resolved_paths_remain_inside_competencia_directory(
    monkeypatch,
    tmp_path,
    scope,
):
    gold_root = tmp_path / "gold" / "caged"
    monkeypatch.setattr("app.services.gold_service.GOLD_CAGED_DIR", gold_root)
    month = GoldMonthRef(ano=2026, mes=2)

    paths = resolve_gold_table_paths(month, "tabela_setor", scope)
    month_dir = month.dir.resolve()

    paths.csv_path.relative_to(month_dir)
    paths.parquet_path.relative_to(month_dir)


def test_path_resolver_rejects_windows_traversal(monkeypatch, tmp_path):
    monkeypatch.setattr(
        "app.services.gold_service.GOLD_CAGED_DIR",
        tmp_path / "gold" / "caged",
    )
    month = GoldMonthRef(ano=2026, mes=2)

    with pytest.raises(InvalidGoldTableError, match="Tabela Gold inválida"):
        resolve_gold_table_paths(month, r"..\..\silver", "br")
