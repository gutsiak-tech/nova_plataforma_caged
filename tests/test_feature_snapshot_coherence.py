"""Fingerprint do cache, /table e catálogo seguem o mesmo snapshot Feature."""

from __future__ import annotations

import threading
import time

import pytest
from fastapi.testclient import TestClient

from app.api.routes_feature import serve_feature_response
from app.main import app
from app.services.feature_gold_service import (
    FeatureDataError,
    SnapshotChanged,
    get_uf_feature,
)
from app.services.gold_catalog_service import build_gold_catalog
from app.services.gold_service import GoldMonthRef, read_gold_table, resolve_gold_table_paths
from app.services.territorial_response_cache import (
    gold_source_fingerprint,
    territorial_response_cache,
)
from app.services.territorial_response_sources import feature_logical_key, uf_feature_sources
from pipelines.gold.feature_publication import (
    feature_dir,
    feature_previous_dir,
    publish_feature_directory,
)
from tests.test_feature_publication import (
    _month,
    _patch_identity,
    _write_serving_generation,
)

client = TestClient(app)


class _FixedMonth:
    def __init__(self, path):
        self.ano = 2026
        self.mes = 6
        self._path = path

    @property
    def dir(self):
        return self._path


def _logical() -> str:
    return feature_logical_key("uf", "SP", 2026, 6, "admissao", 12)


def _serve(month, monkeypatch):
    _patch_identity(monkeypatch)
    return serve_feature_response(
        _logical(),
        _FixedMonth(month),
        lambda territorial_dir, feature_directory: uf_feature_sources(
            GoldMonthRef(ano=2026, mes=6),
            territorial_dir=territorial_dir,
            feature_dir=feature_directory,
        ),
        lambda territorial_dir, feature_directory: get_uf_feature(
            "SP",
            GoldMonthRef(ano=2026, mes=6),
            territorial_dir=territorial_dir,
            feature_dir=feature_directory,
        ),
    )


def _fingerprint(month, directory) -> str:
    return gold_source_fingerprint(
        uf_feature_sources(
            GoldMonthRef(ano=2026, mes=6),
            territorial_dir=month,
            feature_dir=directory,
        )
    )


def _storage_key(fingerprint: str) -> str:
    return f"{_logical()}|{fingerprint}"


def test_snapshot_b_is_cached_under_fingerprint_b(tmp_path, monkeypatch):
    month = _month(tmp_path)
    _write_serving_generation(feature_dir(month), "B")
    fingerprint_b = _fingerprint(month, feature_dir(month))

    payload = _serve(month, monkeypatch)

    assert payload["salary"]["n_salarios_validos"] == 100
    assert payload["sectors"]["by_saldo"][0]["secao"] == "B"
    stored = territorial_response_cache._entries[_storage_key(fingerprint_b)]
    assert stored["salary"]["n_salarios_validos"] == 100
    assert stored["sectors"]["by_saldo"][0]["secao"] == "B"


def test_changed_snapshot_is_not_stored_under_the_old_fingerprint(tmp_path, monkeypatch):
    month = _month(tmp_path)
    _write_serving_generation(feature_dir(month), "B")
    staging = month.parent / f".{month.name}.feature-staging-C"
    _write_serving_generation(staging, "C")
    fingerprint_b = _fingerprint(month, feature_dir(month))
    real_read = __import__(
        "app.services.feature_gold_service",
        fromlist=["_read_feature_slice"],
    )._read_feature_slice
    swapped = {"done": False}

    def swap_during_compute(directory, table_name, column, value):
        frame = real_read(directory, table_name, column, value)
        if not swapped["done"]:
            swapped["done"] = True
            publish_feature_directory(staging, feature_dir(month))
        return frame

    monkeypatch.setattr(
        "app.services.feature_gold_service._read_feature_slice",
        swap_during_compute,
    )
    payload = _serve(month, monkeypatch)
    fingerprint_c = _fingerprint(month, feature_dir(month))

    assert payload["salary"]["n_salarios_validos"] == 200
    assert payload["sectors"]["by_saldo"][0]["secao"] == "C"
    assert payload["occupations"]["by_saldo"][0]["cbo2002ocupacao"] == "C"
    assert payload["profiles"]["sexo"][0]["sexo"] == "C"
    assert fingerprint_c != fingerprint_b
    assert _storage_key(fingerprint_b) not in territorial_response_cache._entries
    stored_c = territorial_response_cache._entries[_storage_key(fingerprint_c)]
    assert stored_c["salary"]["n_salarios_validos"] == 200
    assert stored_c["profiles"]["graudeinstrucao"][0]["graudeinstrucao"] == "C"

    monkeypatch.setattr(
        "app.services.feature_gold_service._read_feature_slice",
        real_read,
    )
    calls = {"n": 0}
    original = get_uf_feature

    def counting(*args, **kwargs):
        calls["n"] += 1
        return original(*args, **kwargs)

    monkeypatch.setattr(
        "tests.test_feature_snapshot_coherence.get_uf_feature",
        counting,
    )
    again = _serve(month, monkeypatch)
    assert again["salary"]["n_salarios_validos"] == 200
    assert calls["n"] == 0
    assert territorial_response_cache.last_decision().outcome == "hit"


def test_fallback_to_b_does_not_receive_payload_c(tmp_path, monkeypatch):
    month = _month(tmp_path)
    _write_serving_generation(feature_dir(month), "B")
    staging = month.parent / f".{month.name}.feature-staging-C"
    _write_serving_generation(staging, "C")
    fingerprint_b = _fingerprint(month, feature_dir(month))
    real_read = __import__(
        "app.services.feature_gold_service",
        fromlist=["_read_feature_slice"],
    )._read_feature_slice

    def swap_during_compute(directory, table_name, column, value):
        frame = real_read(directory, table_name, column, value)
        if feature_dir(month).name == "feature" and staging.exists():
            publish_feature_directory(staging, feature_dir(month))
        return frame

    monkeypatch.setattr(
        "app.services.feature_gold_service._read_feature_slice",
        swap_during_compute,
    )
    _serve(month, monkeypatch)
    assert _storage_key(fingerprint_b) not in territorial_response_cache._entries

    monkeypatch.setattr(
        "app.services.feature_gold_service._read_feature_slice",
        real_read,
    )
    feature_dir(month).rename(month / "feature-c-aside")
    assert feature_previous_dir(month).is_dir()
    payload = _serve(month, monkeypatch)
    assert payload["salary"]["n_salarios_validos"] == 100
    assert payload["sectors"]["by_saldo"][0]["secao"] == "B"
    assert _storage_key(fingerprint_b) not in territorial_response_cache._entries


def test_second_snapshot_change_is_not_retried_forever(tmp_path, monkeypatch):
    month = _month(tmp_path)
    _write_serving_generation(feature_dir(month), "B")
    _patch_identity(monkeypatch)

    def always_changed(_territorial_dir, _feature_directory):
        raise SnapshotChanged()

    with pytest.raises(FeatureDataError, match="mudou durante a leitura"):
        serve_feature_response(
            _logical(),
            _FixedMonth(month),
            lambda territorial_dir, feature_directory: uf_feature_sources(
                GoldMonthRef(ano=2026, mes=6),
                territorial_dir=territorial_dir,
                feature_dir=feature_directory,
            ),
            always_changed,
        )
    assert territorial_response_cache.stats()["entries"] == 0


def test_single_flight_retries_onto_the_new_fingerprint(tmp_path, monkeypatch):
    month = _month(tmp_path)
    _write_serving_generation(feature_dir(month), "B")
    staging = month.parent / f".{month.name}.feature-staging-C"
    _write_serving_generation(staging, "C")
    fingerprint_b = _fingerprint(month, feature_dir(month))
    _patch_identity(monkeypatch)
    real_read = __import__(
        "app.services.feature_gold_service",
        fromlist=["_read_feature_slice"],
    )._read_feature_slice
    release_b = threading.Event()
    entered_b = threading.Event()
    release_c = threading.Event()
    entered_c = threading.Event()
    calls = {"n": 0}
    original = get_uf_feature

    def counting(territorial_dir, feature_directory):
        calls["n"] += 1
        if calls["n"] >= 2:
            entered_c.set()
            assert release_c.wait(timeout=2)
        return original(
            "SP",
            GoldMonthRef(ano=2026, mes=6),
            territorial_dir=territorial_dir,
            feature_dir=feature_directory,
        )

    def swap_during_first_slice(directory, table_name, column, value):
        if calls["n"] == 1:
            entered_b.set()
            assert release_b.wait(timeout=2)
            if staging.exists():
                publish_feature_directory(staging, feature_dir(month))
        return real_read(directory, table_name, column, value)

    monkeypatch.setattr(
        "app.services.feature_gold_service._read_feature_slice",
        swap_during_first_slice,
    )

    def run(bucket: list):
        try:
            bucket.append(
                serve_feature_response(
                    _logical(),
                    _FixedMonth(month),
                    lambda territorial_dir, feature_directory: uf_feature_sources(
                        GoldMonthRef(ano=2026, mes=6),
                        territorial_dir=territorial_dir,
                        feature_dir=feature_directory,
                    ),
                    counting,
                )
            )
        except Exception as exc:  # pragma: no cover - falha do teste
            bucket.append(exc)

    first: list = []
    second: list = []
    thread_a = threading.Thread(target=run, args=(first,))
    thread_b = threading.Thread(target=run, args=(second,))
    thread_a.start()
    assert entered_b.wait(timeout=2)
    thread_b.start()
    deadline = time.monotonic() + 2
    while territorial_response_cache.stats()["coalesced"] < 1:
        if time.monotonic() > deadline:
            break
        time.sleep(0.01)
    assert territorial_response_cache.stats()["coalesced"] >= 1
    release_b.set()
    assert entered_c.wait(timeout=2)
    deadline = time.monotonic() + 2
    while territorial_response_cache.stats()["coalesced"] < 2:
        if time.monotonic() > deadline:
            break
        time.sleep(0.01)
    assert territorial_response_cache.stats()["coalesced"] >= 2
    release_c.set()
    thread_a.join(timeout=2)
    thread_b.join(timeout=2)

    assert first and not isinstance(first[0], Exception)
    assert second and not isinstance(second[0], Exception)
    assert first[0]["salary"]["n_salarios_validos"] == 200
    assert second[0]["salary"]["n_salarios_validos"] == 200
    assert first[0]["sectors"]["by_saldo"][0]["secao"] == "C"
    assert second[0]["sectors"]["by_saldo"][0]["secao"] == "C"
    assert calls["n"] == 2
    assert _storage_key(fingerprint_b) not in territorial_response_cache._entries


def _catalog_table(root, name: str) -> dict:
    catalog = build_gold_catalog(root)
    return next(item for item in catalog["tables"] if item["table_name"] == name)


def _bind_month(monkeypatch, month):
    monkeypatch.setattr(
        "app.services.gold_service.select_published_gold_competencia_dir",
        lambda *_args, **_kwargs: month,
    )


def test_flat_layout_remains_the_source_for_table_and_catalog(tmp_path, monkeypatch):
    month = _month(tmp_path)
    _write_serving_generation(month, "B")
    _bind_month(monkeypatch, month)

    setor = _catalog_table(tmp_path, "tabela_uf_setor")
    assert setor["parquet_path"].replace("\\", "/").endswith("mes=06/tabela_uf_setor.parquet")
    uf = _catalog_table(tmp_path, "tabela_uf")
    assert uf["csv_path"].replace("\\", "/").endswith("mes=06/tabela_uf.csv")

    response = client.get("/api/gold/v1/table/tabela_uf_setor?ano=2026&mes=6&scope=br&limit=20")
    assert response.status_code == 200
    assert response.json()["rows"][0]["secao"] == "B"
    territorial = client.get("/api/gold/v1/table/tabela_uf?ano=2026&mes=6&scope=br&limit=20")
    assert territorial.status_code == 200
    assert territorial.json()["columns"] == ["col"]


def test_migrated_feature_snapshot_is_the_source_for_table_and_catalog(tmp_path, monkeypatch):
    month = _month(tmp_path)
    _write_serving_generation(month, "B")
    _write_serving_generation(feature_dir(month), "C")
    _bind_month(monkeypatch, month)

    setor = _catalog_table(tmp_path, "tabela_uf_setor")
    assert "/feature/tabela_uf_setor.parquet" in setor["parquet_path"].replace("\\", "/")
    assert (month / "tabela_uf_setor.parquet").is_file()
    uf = _catalog_table(tmp_path, "tabela_uf")
    assert "/feature/" not in uf["csv_path"].replace("\\", "/")

    response = client.get("/api/gold/v1/table/tabela_uf_setor?ano=2026&mes=6&scope=br&limit=20")
    assert response.status_code == 200
    assert response.json()["rows"][0]["secao"] == "C"
    frame = read_gold_table(GoldMonthRef(ano=2026, mes=6), "tabela_uf_setor", "br")
    assert set(frame["secao"].astype(str)) == {"C"}
    territorial = resolve_gold_table_paths(GoldMonthRef(ano=2026, mes=6), "tabela_uf", "br")
    assert territorial.csv_path == (month / "tabela_uf.csv").resolve()


def test_invalid_feature_directory_uses_previous_for_table_and_catalog(tmp_path, monkeypatch):
    month = _month(tmp_path)
    _write_serving_generation(month, "FLAT")
    _write_serving_generation(feature_dir(month), "FB")
    _write_serving_generation(feature_previous_dir(month), "FA")
    (feature_dir(month) / "tabela_uf_salario.parquet").unlink()
    _bind_month(monkeypatch, month)

    setor = _catalog_table(tmp_path, "tabela_uf_setor")
    assert "feature.__previous__/tabela_uf_setor.parquet" in setor["parquet_path"].replace("\\", "/")
    response = client.get("/api/gold/v1/table/tabela_uf_setor?ano=2026&mes=6&scope=br&limit=20")
    assert response.status_code == 200
    assert response.json()["rows"][0]["secao"] == "FA"
    assert (month / "tabela_uf_setor.parquet").is_file()
