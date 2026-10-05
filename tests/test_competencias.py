"""Testes de listagem de competências Gold e endpoint /competencias."""

from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from app.services.gold_service import get_competencias_payload, list_available_competencias


def _make_competencia_dir(root: Path, ano: int, mes: int, *, with_resumo: bool = True) -> Path:
    month_dir = root / f"ano={ano}" / f"mes={mes:02d}"
    month_dir.mkdir(parents=True, exist_ok=True)
    if with_resumo:
        (month_dir / "tabela_resumo.csv").write_text(
            "competencia,admissoes,desligamentos,saldo\n",
            encoding="utf-8",
        )
    return month_dir


def test_list_available_competencias_from_partitions(tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    _make_competencia_dir(gold_root, 2026, 2)
    _make_competencia_dir(gold_root, 2026, 1)
    _make_competencia_dir(gold_root, 2025, 12)

    items = list_available_competencias(gold_root=gold_root)

    assert [item["competencia"] for item in items] == ["2025-12", "2026-01", "2026-02"]
    assert items[-1]["path"].endswith("ano=2026/mes=02")


def test_list_available_competencias_ignores_incomplete(tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    _make_competencia_dir(gold_root, 2026, 1)
    incomplete = _make_competencia_dir(gold_root, 2026, 3, with_resumo=False)
    (incomplete / "tabela_setor.csv").write_text("secao,saldo\n", encoding="utf-8")

    items = list_available_competencias(gold_root=gold_root)

    assert len(items) == 1
    assert items[0]["competencia"] == "2026-01"


def test_list_available_competencias_marks_config_default(tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    _make_competencia_dir(gold_root, 2026, 1)
    _make_competencia_dir(gold_root, 2026, 2)

    items = list_available_competencias(
        gold_root=gold_root,
        default_ano=2026,
        default_mes=1,
    )

    assert items[0]["is_default"] is True
    assert items[1]["is_default"] is False


def test_list_available_competencias_fallback_to_most_recent(tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    _make_competencia_dir(gold_root, 2026, 1)
    _make_competencia_dir(gold_root, 2026, 2)

    items = list_available_competencias(
        gold_root=gold_root,
        default_ano=2099,
        default_mes=1,
    )

    assert items[-1]["is_default"] is True
    assert items[-1]["competencia"] == "2026-02"


def test_get_competencias_payload_structure(tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    _make_competencia_dir(gold_root, 2026, 1)
    _make_competencia_dir(gold_root, 2026, 2)

    payload = get_competencias_payload(
        gold_root=gold_root,
        default_ano=2026,
        default_mes=2,
    )

    assert payload["default"] == {
        "ano": 2026,
        "mes": 2,
        "competencia": "2026-02",
        "label": "Fevereiro de 2026",
    }
    assert payload["items"] == [
        {
            "ano": 2026,
            "mes": 1,
            "competencia": "2026-01",
            "label": "Janeiro de 2026",
        },
        {
            "ano": 2026,
            "mes": 2,
            "competencia": "2026-02",
            "label": "Fevereiro de 2026",
        },
    ]


def test_get_competencias_payload_empty_list(tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    gold_root.mkdir(parents=True)

    payload = get_competencias_payload(gold_root=gold_root)

    assert payload == {"default": None, "items": []}


client = TestClient(app)


def test_competencias_endpoint_returns_expected_structure(monkeypatch, tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    _make_competencia_dir(gold_root, 2026, 1)
    _make_competencia_dir(gold_root, 2026, 2)
    monkeypatch.setattr("app.services.gold_service.GOLD_CAGED_DIR", gold_root)
    monkeypatch.setattr("app.services.gold_service.DEFAULT_ANO", 2026)
    monkeypatch.setattr("app.services.gold_service.DEFAULT_MES", 2)

    response = client.get("/api/gold/v1/competencias")

    assert response.status_code == 200
    body = response.json()
    assert body["default"]["competencia"] == "2026-02"
    assert len(body["items"]) == 2
    assert body["items"][0]["competencia"] == "2026-01"


def test_competencias_endpoint_empty_returns_null_default(monkeypatch, tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    gold_root.mkdir(parents=True)
    monkeypatch.setattr("app.services.gold_service.GOLD_CAGED_DIR", gold_root)

    response = client.get("/api/gold/v1/competencias")

    assert response.status_code == 200
    assert response.json() == {"default": None, "items": []}
