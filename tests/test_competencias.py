"""Testes de listagem de competências Gold e endpoint /competencias."""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.gold_service import (
    DefaultCompetenciaError,
    get_competencias_payload,
    list_available_competencias,
    resolve_default_competencia,
)
from pipelines.gold.gold_contract import MIN_REQUIRED_GOLD_TABLES


def _make_competencia_dir(root: Path, ano: int, mes: int, *, with_resumo: bool = True) -> Path:
    month_dir = root / f"ano={ano}" / f"mes={mes:02d}"
    month_dir.mkdir(parents=True, exist_ok=True)
    if with_resumo:
        for table_name in MIN_REQUIRED_GOLD_TABLES:
            (month_dir / f"{table_name}.csv").write_text("saldo\n0\n", encoding="utf-8")
        (month_dir / "metadata.json").write_text(
            json.dumps({"validation_status": "ok"}),
            encoding="utf-8",
        )
    return month_dir


def test_list_available_competencias_from_partitions(tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    _make_competencia_dir(gold_root, 2026, 2)
    _make_competencia_dir(gold_root, 2026, 1)
    _make_competencia_dir(gold_root, 2025, 12)

    items = list_available_competencias(
        gold_root=gold_root,
        use_config_override=False,
    )

    assert [item["competencia"] for item in items] == ["2025-12", "2026-01", "2026-02"]
    assert items[-1]["path"].endswith("ano=2026/mes=02")


def test_list_available_competencias_ignores_incomplete(tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    _make_competencia_dir(gold_root, 2026, 1)
    incomplete = _make_competencia_dir(gold_root, 2026, 3, with_resumo=False)
    (incomplete / "tabela_setor.csv").write_text("secao,saldo\n", encoding="utf-8")

    items = list_available_competencias(
        gold_root=gold_root,
        use_config_override=False,
    )

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


def test_list_available_competencias_defaults_to_most_recent(tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    _make_competencia_dir(gold_root, 2026, 1)
    _make_competencia_dir(gold_root, 2026, 2)

    items = list_available_competencias(
        gold_root=gold_root,
        use_config_override=False,
    )

    assert items[-1]["is_default"] is True
    assert items[-1]["competencia"] == "2026-02"


def test_invalid_override_does_not_fallback_to_latest(tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    _make_competencia_dir(gold_root, 2026, 2)

    with pytest.raises(DefaultCompetenciaError, match="override"):
        resolve_default_competencia(
            gold_root=gold_root,
            default_ano=2026,
            default_mes=1,
        )


def test_partial_override_is_rejected_as_ambiguous(tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    _make_competencia_dir(gold_root, 2026, 2)

    with pytest.raises(DefaultCompetenciaError, match="incompleto"):
        resolve_default_competencia(
            gold_root=gold_root,
            default_mes=2,
        )


def test_latest_valid_competence_crosses_year_boundary(tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    _make_competencia_dir(gold_root, 2025, 12)
    _make_competencia_dir(gold_root, 2026, 1)

    resolved = resolve_default_competencia(
        gold_root=gold_root,
        use_config_override=False,
    )

    assert resolved is not None
    assert (resolved.ano, resolved.mes) == (2026, 1)


def test_newer_invalid_competence_is_not_default(tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    _make_competencia_dir(gold_root, 2026, 5)
    invalid = _make_competencia_dir(gold_root, 2026, 6)
    (invalid / "metadata.json").write_text(
        json.dumps({"validation_status": "error"}),
        encoding="utf-8",
    )

    resolved = resolve_default_competencia(
        gold_root=gold_root,
        use_config_override=False,
    )

    assert resolved is not None
    assert (resolved.ano, resolved.mes) == (2026, 5)


def test_corrupt_metadata_is_not_eligible(tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    _make_competencia_dir(gold_root, 2026, 5)
    corrupt = _make_competencia_dir(gold_root, 2026, 6)
    (corrupt / "metadata.json").write_text("{not-json", encoding="utf-8")

    items = list_available_competencias(
        gold_root=gold_root,
        use_config_override=False,
    )

    assert [item["competencia"] for item in items] == ["2026-05"]


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

    payload = get_competencias_payload(
        gold_root=gold_root,
        use_config_override=False,
    )

    assert payload == {"default": None, "items": []}


client = TestClient(app)


def test_competencias_endpoint_returns_expected_structure(monkeypatch, tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    _make_competencia_dir(gold_root, 2026, 1)
    _make_competencia_dir(gold_root, 2026, 2)
    monkeypatch.setattr("app.services.gold_service.GOLD_CAGED_DIR", gold_root)
    monkeypatch.setattr("app.services.gold_service.DEFAULT_ANO", 2026)
    monkeypatch.setattr("app.services.gold_service.DEFAULT_MES", 2)
    monkeypatch.setattr(
        "app.services.gold_service.DEFAULT_COMPETENCIA_CONFIG_ERROR",
        None,
    )

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
    monkeypatch.setattr("app.services.gold_service.DEFAULT_ANO", None)
    monkeypatch.setattr("app.services.gold_service.DEFAULT_MES", None)
    monkeypatch.setattr(
        "app.services.gold_service.DEFAULT_COMPETENCIA_CONFIG_ERROR",
        None,
    )

    response = client.get("/api/gold/v1/competencias")

    assert response.status_code == 200
    assert response.json() == {"default": None, "items": []}


def test_competencias_endpoint_rejects_invalid_override_without_fallback(
    monkeypatch, tmp_path
):
    gold_root = tmp_path / "gold" / "caged"
    _make_competencia_dir(gold_root, 2026, 2)
    monkeypatch.setattr("app.services.gold_service.GOLD_CAGED_DIR", gold_root)
    monkeypatch.setattr("app.services.gold_service.DEFAULT_ANO", 2026)
    monkeypatch.setattr("app.services.gold_service.DEFAULT_MES", 1)
    monkeypatch.setattr(
        "app.services.gold_service.DEFAULT_COMPETENCIA_CONFIG_ERROR",
        None,
    )

    response = client.get("/api/gold/v1/competencias")

    assert response.status_code == 503
    body = response.json()
    assert body["error"]["code"] == "DEFAULT_COMPETENCIA_UNAVAILABLE"
    assert "override" in body["error"]["message"].lower()
    assert str(tmp_path) not in body["error"]["message"]
