"""Testes do catálogo formal da camada Gold."""

import json
from pathlib import Path

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.gold_catalog_service import (
    build_gold_catalog,
    infer_granularity_from_table_name,
    infer_scope_from_table_name,
    list_gold_partitions,
    write_gold_catalog,
)
from pipelines.gold.gold_contract import MIN_REQUIRED_GOLD_TABLES

client = TestClient(app)


@pytest.mark.parametrize(
    ("table_name", "expected"),
    [
        ("tabela_setor", "brasil"),
        ("tabela_setor_pr", "parana"),
        ("tabela_setor_rmc", "rmc"),
    ],
)
def test_infer_scope_from_table_name(table_name, expected):
    assert infer_scope_from_table_name(table_name) == expected


@pytest.mark.parametrize(
    ("table_name", "expected"),
    [
        ("tabela_resumo", "resumo"),
        ("tabela_uf", "uf"),
        ("tabela_municipio", "municipio"),
        ("tabela_setor", "setor"),
        ("tabela_ocupacao", "ocupacao"),
        ("tabela_setor_salario", "salario"),
        ("tabela_perfil_sexo", "perfil_sexo"),
        ("tabela_foo_bar", "desconhecida"),
    ],
)
def test_infer_granularity_from_table_name(table_name, expected):
    assert infer_granularity_from_table_name(table_name) == expected


def _write_table(month_dir: Path, name: str, *, parquet: bool = True) -> None:
    month_dir.mkdir(parents=True, exist_ok=True)
    csv_path = month_dir / f"{name}.csv"
    csv_path.write_text("secao,admissoes,desligamentos,saldo\nA,1,2,-1\n", encoding="utf-8")
    if parquet:
        pd.DataFrame(
            {"secao": ["A"], "admissoes": [1], "desligamentos": [2], "saldo": [-1]}
        ).to_parquet(month_dir / f"{name}.parquet", index=False)


def _mark_month_valid(month_dir: Path) -> None:
    for table_name in MIN_REQUIRED_GOLD_TABLES:
        csv_path = month_dir / f"{table_name}.csv"
        if not csv_path.exists():
            _write_table(month_dir, table_name, parquet=False)
    (month_dir / "metadata.json").write_text(
        json.dumps({"validation_status": "ok"}),
        encoding="utf-8",
    )


def test_list_gold_partitions_ignores_invalid_dirs(tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    valid = gold_root / "ano=2026" / "mes=01"
    _write_table(valid, "tabela_resumo")
    _mark_month_valid(valid)
    (gold_root / "ano=bad").mkdir(parents=True)
    (gold_root / "ano=2026" / "mes=99").mkdir(parents=True)

    partitions = list_gold_partitions(gold_root)

    assert len(partitions) == 1
    assert partitions[0]["competencia"] == "2026-01"


@pytest.mark.parametrize(
    ("metadata_content", "expected_competencias"),
    [
        (None, []),
        ("{metadata corrompido", []),
        (json.dumps({"validation_status": "error"}), []),
        (json.dumps({"validation_status": "ok"}), ["2026-02"]),
    ],
)
def test_list_gold_partitions_uses_canonical_gold_validity(
    tmp_path,
    metadata_content,
    expected_competencias,
):
    gold_root = tmp_path / "gold" / "caged"
    month_dir = gold_root / "ano=2026" / "mes=02"
    _write_table(month_dir, "tabela_resumo")
    _mark_month_valid(month_dir)

    metadata_path = month_dir / "metadata.json"
    if metadata_content is None:
        metadata_path.unlink()
    else:
        metadata_path.write_text(metadata_content, encoding="utf-8")

    assert [
        item["competencia"] for item in list_gold_partitions(gold_root)
    ] == expected_competencias


def test_list_gold_partitions_excludes_incomplete_gold(tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    month_dir = gold_root / "ano=2026" / "mes=02"
    _mark_month_valid(month_dir)
    (month_dir / f"{MIN_REQUIRED_GOLD_TABLES[-1]}.csv").unlink()

    assert list_gold_partitions(gold_root) == []


def test_catalog_excludes_invalid_january_and_keeps_valid_february_to_june(
    tmp_path,
):
    gold_root = tmp_path / "gold" / "caged"
    _write_table(gold_root / "ano=2026" / "mes=01", "tabela_resumo")
    for month in range(2, 7):
        _mark_month_valid(gold_root / "ano=2026" / f"mes={month:02d}")

    catalog = build_gold_catalog(gold_root)

    assert [
        partition["competencia"] for partition in catalog["partitions"]
    ] == ["2026-02", "2026-03", "2026-04", "2026-05", "2026-06"]


def test_build_gold_catalog_detects_csv_without_parquet(tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    month_dir = gold_root / "ano=2026" / "mes=01"
    _write_table(month_dir, "tabela_resumo")
    _write_table(month_dir, "tabela_setor", parquet=False)
    _mark_month_valid(month_dir)

    catalog = build_gold_catalog(gold_root)

    setor = next(t for t in catalog["tables"] if t["table_name"] == "tabela_setor")
    assert setor["has_csv"] is True
    assert setor["has_parquet"] is False
    assert "CSV presente sem Parquet correspondente" in setor["notes"]


def test_build_gold_catalog_detects_parquet_without_csv(tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    month_dir = gold_root / "ano=2026" / "mes=01"
    _write_table(month_dir, "tabela_resumo")
    parquet_only = month_dir / "tabela_orfa.parquet"
    pd.DataFrame({"x": [1]}).to_parquet(parquet_only, index=False)
    _mark_month_valid(month_dir)

    catalog = build_gold_catalog(gold_root)

    orphan = next(t for t in catalog["tables"] if t["table_name"] == "tabela_orfa")
    assert orphan["has_parquet"] is True
    assert orphan["has_csv"] is False
    assert orphan["is_suspected_legacy"] is True


def test_build_gold_catalog_flags_legacy_tabela_perfil(tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    month_dir = gold_root / "ano=2026" / "mes=01"
    _write_table(month_dir, "tabela_resumo")
    _write_table(month_dir, "tabela_perfil")
    _mark_month_valid(month_dir)

    catalog = build_gold_catalog(gold_root)

    legacy = next(t for t in catalog["tables"] if t["table_name"] == "tabela_perfil")
    assert legacy["is_suspected_legacy"] is True
    assert legacy["granularity"] == "perfil"


def test_write_gold_catalog_generates_json_and_csv(tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    month_dir = gold_root / "ano=2026" / "mes=01"
    _write_table(month_dir, "tabela_resumo")
    _mark_month_valid(month_dir)
    catalog_dir = tmp_path / "catalog"

    result = write_gold_catalog(gold_root=gold_root, catalog_dir=catalog_dir, docs_path=tmp_path / "gold_catalog.md")

    assert result["json_path"].exists()
    assert result["csv_path"].exists()
    assert result["markdown_path"].exists()

    payload = json.loads(result["json_path"].read_text(encoding="utf-8"))
    assert payload["summary"]["table_count"] == len(MIN_REQUIRED_GOLD_TABLES)
    assert "table_name" in result["csv_path"].read_text(encoding="utf-8")


def _patch_catalog_paths(monkeypatch, gold_root: Path, catalog_json: Path) -> None:
    monkeypatch.setattr("app.services.gold_catalog_service.GOLD_CAGED_DIR", gold_root)
    monkeypatch.setattr("app.services.gold_catalog_service.GOLD_CATALOG_JSON", catalog_json)
    monkeypatch.setattr("app.api.routes_gold.GOLD_CATALOG_JSON", catalog_json)
    monkeypatch.setattr("app.services.gold_service.GOLD_CAGED_DIR", gold_root)


def test_catalog_endpoint_returns_payload(monkeypatch, tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    month = gold_root / "ano=2026" / "mes=01"
    _write_table(month, "tabela_setor")
    _write_table(month, "tabela_setor_rmc")
    _mark_month_valid(month)
    catalog_dir = tmp_path / "catalog"
    result = write_gold_catalog(gold_root=gold_root, catalog_dir=catalog_dir, docs_path=tmp_path / "gold_catalog.md")
    _patch_catalog_paths(monkeypatch, gold_root, result["json_path"])

    response = client.get("/api/gold/v1/catalog?granularity=setor&scope=brasil")

    assert response.status_code == 200
    body = response.json()
    assert body["summary"]["table_count"] == 1
    assert body["tables"][0]["table_name"] == "tabela_setor"


def test_catalog_endpoint_filter_scope_rmc(monkeypatch, tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    month = gold_root / "ano=2026" / "mes=02"
    _write_table(month, "tabela_resumo")
    _write_table(month, "tabela_setor")
    _write_table(month, "tabela_setor_rmc")
    _mark_month_valid(month)
    catalog_dir = tmp_path / "catalog"
    result = write_gold_catalog(gold_root=gold_root, catalog_dir=catalog_dir, docs_path=tmp_path / "gold_catalog.md")
    _patch_catalog_paths(monkeypatch, gold_root, result["json_path"])

    response = client.get("/api/gold/v1/catalog?ano=2026&mes=2&scope=rmc")

    assert response.status_code == 200
    body = response.json()
    assert "tabela_setor_rmc" in {table["table_name"] for table in body["tables"]}
    assert all(table["scope"] == "rmc" for table in body["tables"])


def test_catalog_endpoint_filter_suspected_legacy(monkeypatch, tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    month = gold_root / "ano=2026" / "mes=01"
    _write_table(month, "tabela_resumo")
    _write_table(month, "tabela_perfil")
    _mark_month_valid(month)
    catalog_dir = tmp_path / "catalog"
    result = write_gold_catalog(gold_root=gold_root, catalog_dir=catalog_dir, docs_path=tmp_path / "gold_catalog.md")
    _patch_catalog_paths(monkeypatch, gold_root, result["json_path"])

    response = client.get("/api/gold/v1/catalog?suspected_legacy=true")

    assert response.status_code == 200
    names = {t["table_name"] for t in response.json()["tables"]}
    assert names == {"tabela_perfil"}
