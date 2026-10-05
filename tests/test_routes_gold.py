"""Testes de compatibilidade dos endpoints Gold com ano/mês."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_meta_with_mes_only_still_works():
    response = client.get("/api/gold/v1/meta?mes=2")
    assert response.status_code == 200
    body = response.json()
    assert body["month"]["mes"] == 2
    assert body["month"]["ano"] == 2026


def test_meta_with_ano_and_mes():
    response = client.get("/api/gold/v1/meta?ano=2026&mes=1")
    assert response.status_code == 200
    body = response.json()
    assert body["month"] == {"ano": 2026, "mes": 1}


def test_meta_invalid_mes_returns_400():
    response = client.get("/api/gold/v1/meta?mes=13")
    assert response.status_code == 400
    body = response.json()
    assert body["error"]["code"] == "INVALID_COMPETENCIA"
    assert "mes inválido" in body["error"]["message"]


def test_overview_with_legacy_params():
    response = client.get("/api/gold/v1/overview?scope=br&mes=2")
    assert response.status_code == 200
    body = response.json()
    assert body["month"]["ano"] == 2026
    assert body["month"]["mes"] == 2


def test_table_with_ano_and_mes():
    response = client.get(
        "/api/gold/v1/table/tabela_resumo?scope=br&ano=2026&mes=2"
    )
    assert response.status_code == 200
    body = response.json()
    assert body["month"] == {"ano": 2026, "mes": 2}
    assert body["table"] == "tabela_resumo"


def test_table_missing_competence_returns_404():
    response = client.get(
        "/api/gold/v1/table/tabela_resumo?scope=br&ano=2099&mes=1"
    )
    assert response.status_code == 404
