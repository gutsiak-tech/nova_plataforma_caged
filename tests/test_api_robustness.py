"""Testes de robustez da API: health, readiness e erros Gold."""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.gold_catalog_service import GOLD_CATALOG_JSON

client = TestClient(app)


def test_health_returns_200_without_gold_dependency(monkeypatch, tmp_path):
    monkeypatch.setattr("app.services.gold_readiness.GOLD_CAGED_DIR", tmp_path / "missing-gold")

    response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "caged-dashboard-api"
    assert "version" in body
    assert "environment" in body


def test_ready_returns_200_when_gold_and_catalog_exist(monkeypatch, tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    month_dir = gold_root / "ano=2026" / "mes=02"
    month_dir.mkdir(parents=True)
    (month_dir / "tabela_resumo.csv").write_text(
        "competencia,admissoes,desligamentos,saldo\n",
        encoding="utf-8",
    )

    catalog_dir = tmp_path / "catalog"
    catalog_dir.mkdir()
    catalog_path = catalog_dir / "gold_catalog.json"
    catalog_path.write_text(
        json.dumps(
            {
                "generated_at": "2026-01-01T00:00:00+00:00",
                "summary": {"competencia_count": 1, "table_count": 1},
                "partitions": [],
                "tables": [],
            }
        ),
        encoding="utf-8",
    )
    (month_dir / "metadata.json").write_text(
        json.dumps({"validation_status": "ok", "status": "gold_ok"}),
        encoding="utf-8",
    )

    monkeypatch.setattr("app.services.gold_readiness.GOLD_CAGED_DIR", gold_root)
    monkeypatch.setattr("app.services.gold_readiness.GOLD_CATALOG_JSON", catalog_path)
    monkeypatch.setattr("app.services.gold_service.GOLD_CAGED_DIR", gold_root)
    monkeypatch.setattr("app.services.gold_catalog_service.GOLD_CAGED_DIR", gold_root)
    monkeypatch.setattr("app.services.gold_catalog_service.GOLD_CATALOG_JSON", catalog_path)
    monkeypatch.setattr("app.services.gold_service.DEFAULT_ANO", 2026)
    monkeypatch.setattr("app.services.gold_service.DEFAULT_MES", 2)
    monkeypatch.setattr("app.services.gold_readiness.DEFAULT_ANO", 2026)
    monkeypatch.setattr("app.services.gold_readiness.DEFAULT_MES", 2)

    response = client.get("/ready")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ready"
    assert body["checks"]["gold_dir_exists"] is True
    assert body["checks"]["competencias_available"] is True
    assert body["checks"]["catalog_exists"] is True
    assert body["checks"]["catalog_readable"] is True
    assert body["checks"]["gold_metadata_exists"] is True
    assert body["checks"]["gold_metadata_status_ok"] is True
    assert body["available_competencias_count"] == 1


def test_ready_returns_503_when_gold_missing(monkeypatch, tmp_path):
    missing = tmp_path / "missing-gold"
    monkeypatch.setattr("app.services.gold_readiness.GOLD_CAGED_DIR", missing)
    monkeypatch.setattr("app.services.gold_readiness.GOLD_CATALOG_JSON", tmp_path / "catalog.json")

    response = client.get("/ready")

    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "not_ready"
    assert body["checks"]["gold_dir_exists"] is False
    assert body["problems"]


def test_ready_returns_503_when_no_competencias(monkeypatch, tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    gold_root.mkdir(parents=True)
    catalog_path = tmp_path / "catalog.json"
    catalog_path.write_text("{}", encoding="utf-8")

    monkeypatch.setattr("app.services.gold_readiness.GOLD_CAGED_DIR", gold_root)
    monkeypatch.setattr("app.services.gold_readiness.GOLD_CATALOG_JSON", catalog_path)
    monkeypatch.setattr("app.services.gold_service.GOLD_CAGED_DIR", gold_root)

    response = client.get("/ready")

    assert response.status_code == 503
    body = response.json()
    assert body["checks"]["competencias_available"] is False
    assert any("competência" in p.lower() for p in body["problems"])


def test_ready_reports_missing_catalog(monkeypatch, tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    month_dir = gold_root / "ano=2026" / "mes=01"
    month_dir.mkdir(parents=True)
    (month_dir / "tabela_resumo.csv").write_text("x\n", encoding="utf-8")

    missing_catalog = tmp_path / "missing-catalog.json"
    monkeypatch.setattr("app.services.gold_readiness.GOLD_CAGED_DIR", gold_root)
    monkeypatch.setattr("app.services.gold_readiness.GOLD_CATALOG_JSON", missing_catalog)
    monkeypatch.setattr("app.services.gold_service.GOLD_CAGED_DIR", gold_root)
    monkeypatch.setattr("app.services.gold_service.DEFAULT_ANO", 2026)
    monkeypatch.setattr("app.services.gold_service.DEFAULT_MES", 1)
    monkeypatch.setattr("app.services.gold_readiness.DEFAULT_ANO", 2026)
    monkeypatch.setattr("app.services.gold_readiness.DEFAULT_MES", 1)

    response = client.get("/ready")

    assert response.status_code == 503
    body = response.json()
    assert body["checks"]["catalog_exists"] is False
    assert any("catálogo" in p.lower() for p in body["problems"])


def test_ready_gold_metadata_missing(monkeypatch, tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    month_dir = gold_root / "ano=2026" / "mes=02"
    month_dir.mkdir(parents=True)
    (month_dir / "tabela_resumo.csv").write_text(
        "competencia,admissoes,desligamentos,saldo\n2026-02,1,1,0\n",
        encoding="utf-8",
    )

    catalog_path = tmp_path / "catalog.json"
    catalog_path.write_text(
        json.dumps({"summary": {}, "partitions": [], "tables": []}),
        encoding="utf-8",
    )

    monkeypatch.setattr("app.services.gold_readiness.GOLD_CAGED_DIR", gold_root)
    monkeypatch.setattr("app.services.gold_readiness.GOLD_CATALOG_JSON", catalog_path)
    monkeypatch.setattr("app.services.gold_service.GOLD_CAGED_DIR", gold_root)
    monkeypatch.setattr("app.services.gold_catalog_service.GOLD_CAGED_DIR", gold_root)
    monkeypatch.setattr("app.services.gold_catalog_service.GOLD_CATALOG_JSON", catalog_path)
    monkeypatch.setattr("app.services.gold_service.DEFAULT_ANO", 2026)
    monkeypatch.setattr("app.services.gold_service.DEFAULT_MES", 2)
    monkeypatch.setattr("app.services.gold_readiness.DEFAULT_ANO", 2026)
    monkeypatch.setattr("app.services.gold_readiness.DEFAULT_MES", 2)

    response = client.get("/ready")

    assert response.status_code == 503
    body = response.json()
    assert body["checks"]["gold_metadata_exists"] is False
    assert any("metadata" in p.lower() for p in body["problems"])


def test_ready_gold_metadata_error(monkeypatch, tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    month_dir = gold_root / "ano=2026" / "mes=02"
    month_dir.mkdir(parents=True)
    (month_dir / "tabela_resumo.csv").write_text(
        "competencia,admissoes,desligamentos,saldo\n2026-02,1,1,0\n",
        encoding="utf-8",
    )
    (month_dir / "metadata.json").write_text(
        json.dumps({"validation_status": "error", "status": "gold_error"}),
        encoding="utf-8",
    )

    catalog_path = tmp_path / "catalog.json"
    catalog_path.write_text(
        json.dumps({"summary": {}, "partitions": [], "tables": []}),
        encoding="utf-8",
    )

    monkeypatch.setattr("app.services.gold_readiness.GOLD_CAGED_DIR", gold_root)
    monkeypatch.setattr("app.services.gold_readiness.GOLD_CATALOG_JSON", catalog_path)
    monkeypatch.setattr("app.services.gold_service.GOLD_CAGED_DIR", gold_root)
    monkeypatch.setattr("app.services.gold_catalog_service.GOLD_CAGED_DIR", gold_root)
    monkeypatch.setattr("app.services.gold_catalog_service.GOLD_CATALOG_JSON", catalog_path)
    monkeypatch.setattr("app.services.gold_service.DEFAULT_ANO", 2026)
    monkeypatch.setattr("app.services.gold_service.DEFAULT_MES", 2)
    monkeypatch.setattr("app.services.gold_readiness.DEFAULT_ANO", 2026)
    monkeypatch.setattr("app.services.gold_readiness.DEFAULT_MES", 2)

    response = client.get("/ready")

    assert response.status_code == 503
    body = response.json()
    assert body["checks"]["gold_metadata_status_ok"] is False
    assert any("error" in p.lower() for p in body["problems"])


def test_meta_missing_competencia_returns_structured_error(monkeypatch, tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    gold_root.mkdir(parents=True)
    monkeypatch.setattr("app.services.gold_service.GOLD_CAGED_DIR", gold_root)

    response = client.get("/api/gold/v1/meta?ano=2026&mes=12")

    assert response.status_code == 404
    body = response.json()
    assert body["error"]["code"] == "GOLD_COMPETENCIA_NOT_FOUND"
    assert body["error"]["details"]["ano"] == 2026
    assert body["error"]["details"]["mes"] == 12


def test_meta_invalid_mes_returns_invalid_competencia():
    response = client.get("/api/gold/v1/meta?mes=13")

    assert response.status_code == 400
    body = response.json()
    assert body["error"]["code"] == "INVALID_COMPETENCIA"
    assert "mes inválido" in body["error"]["message"]


def test_table_missing_competencia_returns_structured_error(monkeypatch, tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    gold_root.mkdir(parents=True)
    monkeypatch.setattr("app.services.gold_service.GOLD_CAGED_DIR", gold_root)

    response = client.get("/api/gold/v1/table/tabela_resumo?scope=br&ano=2099&mes=1")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "GOLD_COMPETENCIA_NOT_FOUND"


def test_table_missing_table_returns_structured_error(monkeypatch, tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    month_dir = gold_root / "ano=2026" / "mes=02"
    month_dir.mkdir(parents=True)
    (month_dir / "tabela_resumo.csv").write_text("a\n", encoding="utf-8")
    monkeypatch.setattr("app.services.gold_service.GOLD_CAGED_DIR", gold_root)

    response = client.get("/api/gold/v1/table/tabela_inexistente?scope=br&ano=2026&mes=2")

    assert response.status_code == 404
    body = response.json()
    assert body["error"]["code"] == "GOLD_TABLE_NOT_FOUND"
    assert body["error"]["details"]["table"] == "tabela_inexistente"


def test_overview_missing_competencia_returns_structured_error(monkeypatch, tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    gold_root.mkdir(parents=True)
    monkeypatch.setattr("app.services.gold_service.GOLD_CAGED_DIR", gold_root)

    response = client.get("/api/gold/v1/overview?scope=br&ano=2026&mes=12")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "GOLD_COMPETENCIA_NOT_FOUND"


def test_catalog_missing_competencia_returns_structured_error(monkeypatch, tmp_path):
    catalog_dir = tmp_path / "catalog"
    catalog_dir.mkdir()
    catalog_path = catalog_dir / "gold_catalog.json"
    catalog_path.write_text(
        json.dumps({"summary": {}, "partitions": [], "tables": []}),
        encoding="utf-8",
    )
    gold_root = tmp_path / "gold" / "caged"
    gold_root.mkdir(parents=True)

    monkeypatch.setattr("app.services.gold_catalog_service.GOLD_CATALOG_JSON", catalog_path)
    monkeypatch.setattr("app.services.gold_service.GOLD_CAGED_DIR", gold_root)

    response = client.get("/api/gold/v1/catalog?ano=2026&mes=12")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "GOLD_COMPETENCIA_NOT_FOUND"


def test_catalog_missing_file_returns_not_found(monkeypatch, tmp_path):
    missing = tmp_path / "missing.json"
    monkeypatch.setattr("app.api.routes_gold.GOLD_CATALOG_JSON", missing)

    response = client.get("/api/gold/v1/catalog")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "GOLD_CATALOG_NOT_FOUND"
