"""Coerência do cache de resposta territorial."""

from __future__ import annotations

import threading
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.gold_service import GoldMonthRef, _cache_key_from_path, clear_gold_read_cache
from app.services.territorial_response_cache import (
    TerritorialResponseCache,
    clear_territorial_response_cache,
    file_signature,
    territorial_response_cache,
)
from app.services.territorial_response_sources import overview_sources

client = TestClient(app)


def _overview(scope: str, mes: int, movimento: str = "admissao"):
    return client.get(
        f"/api/gold/v1/overview?scope={scope}&ano=2026&mes={mes}&movimento={movimento}"
    )


def test_file_signature_matches_dataframe_cache_key(tmp_path: Path):
    path = tmp_path / "tabela.parquet"
    path.write_bytes(b"gold")
    assert file_signature(path) == _cache_key_from_path(path)


def _latest():
    decisions = territorial_response_cache.recent_decisions()
    assert decisions
    return decisions[-1]


def test_same_request_is_miss_then_hit_and_payloads_match():
    first = _overview("br", 6)
    assert first.status_code == 200
    assert _latest().outcome == "miss"
    assert _latest().compute_ms > 0

    second = _overview("br", 6)
    assert second.status_code == 200
    decision = _latest()
    assert decision.outcome == "hit"
    assert decision.compute_ms == 0
    assert second.json() == first.json()
    stats = territorial_response_cache.stats()
    assert stats["misses"] >= 1
    assert stats["hits"] >= 1
    assert stats["entries"] == 1


def test_hit_does_not_read_gold_or_rank(monkeypatch):
    first = _overview("br", 6)
    assert first.status_code == 200

    def fail_read(*_args, **_kwargs):
        raise AssertionError("HIT releu Gold")

    def fail_records(*_args, **_kwargs):
        raise AssertionError("HIT reordenou a tabela")

    monkeypatch.setattr("app.api.routes_gold.read_gold_table", fail_read)
    monkeypatch.setattr("app.api.routes_gold.dataframe_to_records", fail_records)
    monkeypatch.setattr("app.services.feature_gold_service.read_gold_table", fail_read)
    monkeypatch.setattr("app.services.feature_gold_service.pd.read_parquet", fail_read)

    second = _overview("br", 6)
    assert second.status_code == 200
    assert second.json() == first.json()
    assert _latest().outcome == "hit"


def test_changed_fingerprint_recomputes(tmp_path: Path):
    path = tmp_path / "gold.parquet"
    path.write_bytes(b"v1")
    cache = TerritorialResponseCache(max_entries=4)
    calls = {"n": 0}

    def compute():
        calls["n"] += 1
        return {"size": path.stat().st_size}

    assert cache.serve("overview|br|2026|6|admissao", [path], compute)["size"] == 2
    assert cache.serve("overview|br|2026|6|admissao", [path], compute)["size"] == 2
    assert calls["n"] == 1

    path.write_bytes(b"v1-rewritten")
    refreshed = cache.serve("overview|br|2026|6|admissao", [path], compute)
    assert calls["n"] == 2
    assert refreshed["size"] == len(b"v1-rewritten")
    assert cache.stats()["invalidations"] == 1
    assert cache.stats()["misses"] == 2


def test_parameters_do_not_share_entries():
    brasil = _overview("br", 6)
    parana = _overview("pr", 6)
    janeiro = _overview("br", 1)
    desligamento = _overview("br", 6, "desligamento")
    assert brasil.status_code == parana.status_code == janeiro.status_code == 200
    assert desligamento.status_code == 200

    assert brasil.json()["scope"] == "br"
    assert parana.json()["scope"] == "pr"
    assert brasil.json() != parana.json()
    assert janeiro.json()["month"] == {"ano": 2026, "mes": 1}
    assert janeiro.json() != brasil.json()
    assert desligamento.json()["salary_summary"]["movement"] == "desligamento"
    assert desligamento.json() != brasil.json()
    assert territorial_response_cache.stats()["entries"] == 4


def test_features_do_not_share_entries():
    sao_paulo = client.get("/api/gold/v1/feature/uf/SP?ano=2026&mes=6&movimento=admissao&limit=5")
    amazonas = client.get("/api/gold/v1/feature/uf/AM?ano=2026&mes=6&movimento=admissao&limit=5")
    curitiba = client.get(
        "/api/gold/v1/feature/municipality/4106902?ano=2026&mes=6&movimento=admissao&limit=5"
    )
    assert sao_paulo.status_code == amazonas.status_code == curitiba.status_code == 200
    assert sao_paulo.json()["identity"]["id"] == "SP"
    assert amazonas.json()["identity"]["id"] == "AM"
    assert curitiba.json()["identity"]["id"] == "4106902"
    assert territorial_response_cache.stats()["entries"] == 3

    again = client.get("/api/gold/v1/feature/uf/SP?ano=2026&mes=6&movimento=admissao&limit=5")
    assert again.json() == sao_paulo.json()
    assert _latest().outcome == "hit"
    assert _latest().compute_ms == 0


def test_concurrent_same_key_computes_once():
    cache = TerritorialResponseCache(max_entries=4)
    entered = threading.Event()
    release = threading.Event()
    calls = {"n": 0}

    def compute():
        calls["n"] += 1
        entered.set()
        assert release.wait(timeout=2)
        return {"n": calls["n"]}

    results: list[dict[str, int]] = []
    errors: list[BaseException] = []

    def run():
        try:
            results.append(cache.serve("overview|br|2026|6|admissao", [], compute))
        except BaseException as exc:
            errors.append(exc)

    first = threading.Thread(target=run)
    first.start()
    assert entered.wait(timeout=2)
    second = threading.Thread(target=run)
    second.start()
    threading.Event().wait(0.05)
    assert calls["n"] == 1
    release.set()
    first.join(timeout=2)
    second.join(timeout=2)
    assert errors == []
    assert results == [{"n": 1}, {"n": 1}]
    assert cache.stats()["misses"] == 1
    assert cache.stats()["coalesced"] == 1


def test_different_keys_compute_in_parallel():
    cache = TerritorialResponseCache(max_entries=4)
    barrier = threading.Barrier(2)

    def compute(label: str):
        def run():
            barrier.wait(timeout=2)
            return label

        return run

    results: dict[str, str] = {}

    def run(label: str):
        results[label] = cache.serve(label, [], compute(label))

    threads = [threading.Thread(target=run, args=(label,)) for label in ("a", "b")]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=2)
    assert results == {"a": "a", "b": "b"}


def test_returned_payload_is_not_a_shared_mutable():
    cache = TerritorialResponseCache(max_entries=2)

    def compute():
        return {"rows": [{"saldo": 1}]}

    first = cache.serve("k", [], compute)
    first["rows"][0]["saldo"] = 99
    second = cache.serve("k", [], compute)
    assert second == {"rows": [{"saldo": 1}]}
    assert cache.stats()["hits"] == 1


def test_failure_is_not_cached():
    cache = TerritorialResponseCache(max_entries=2)
    calls = {"n": 0}

    def compute():
        calls["n"] += 1
        raise RuntimeError("falha")

    with pytest.raises(RuntimeError):
        cache.serve("k", [], compute)
    with pytest.raises(RuntimeError):
        cache.serve("k", [], compute)
    assert calls["n"] == 2
    assert cache.stats()["entries"] == 0


def test_lru_evicts_the_oldest_entry():
    cache = TerritorialResponseCache(max_entries=2)
    cache.serve("a", [], lambda: {"id": "a"})
    cache.serve("b", [], lambda: {"id": "b"})
    cache.serve("c", [], lambda: {"id": "c"})
    assert cache.stats()["entries"] == 2
    assert cache.stats()["evictions"] == 1
    calls = {"n": 0}

    def compute():
        calls["n"] += 1
        return {"id": "a"}

    assert cache.serve("a", [], compute) == {"id": "a"}
    assert calls["n"] == 1


def test_table_endpoint_is_not_response_cached():
    response = client.get(
        "/api/gold/v1/table/tabela_uf?scope=br&ano=2026&mes=6&limit=28&offset=0&sort_by=saldo&sort_dir=desc"
    )
    assert response.status_code == 200
    assert territorial_response_cache.stats()["entries"] == 0
    assert territorial_response_cache.recent_decisions() == []


def test_clear_gold_read_cache_drops_response_entries():
    assert _overview("br", 6).status_code == 200
    assert territorial_response_cache.stats()["entries"] == 1
    cleared = clear_gold_read_cache()
    assert cleared["response_entries"] == 1
    assert territorial_response_cache.stats()["entries"] == 0


def test_overview_source_list_matches_files_read(monkeypatch):
    from app.api.routes_gold import read_gold_table as real_read
    from app.services.territorial_response_sources import gold_table_input_path

    seen: set[Path] = set()

    def spy(month, base_name, scope):
        seen.add(gold_table_input_path(month, base_name, scope).resolve())
        return real_read(month, base_name, scope)

    monkeypatch.setattr("app.api.routes_gold.read_gold_table", spy)
    for scope in ("br", "pr", "rmc"):
        seen.clear()
        clear_gold_read_cache()
        response = _overview(scope, 6)
        assert response.status_code == 200, response.text
        expected = {
            path.resolve() for path in overview_sources(scope, GoldMonthRef(ano=2026, mes=6))
        }
        assert seen == expected


def test_feature_source_list_matches_files_read(monkeypatch):
    from app.services.feature_gold_service import (
        _read_cached_parquet,
        pd,
        read_gold_table as real_read,
    )
    from app.services.territorial_response_sources import (
        gold_table_input_path,
        municipality_feature_sources,
        uf_feature_sources,
    )

    seen: set[Path] = set()
    real_parquet = pd.read_parquet

    def spy_table(month, base_name, scope):
        seen.add(gold_table_input_path(month, base_name, scope).resolve())
        return real_read(month, base_name, scope)

    def spy_parquet(*args, **kwargs):
        target = args[0] if args else kwargs.get("path")
        seen.add(Path(target).resolve())
        return real_parquet(*args, **kwargs)

    monkeypatch.setattr("app.services.feature_gold_service.read_gold_table", spy_table)
    monkeypatch.setattr("app.services.feature_gold_service.pd.read_parquet", spy_parquet)

    cases = (
        (
            "/api/gold/v1/feature/uf/SP?ano=2026&mes=6&movimento=admissao&limit=5",
            uf_feature_sources,
        ),
        (
            "/api/gold/v1/feature/municipality/4106902?ano=2026&mes=6&movimento=admissao&limit=5",
            municipality_feature_sources,
        ),
    )
    month = GoldMonthRef(ano=2026, mes=6)
    for url, sources in cases:
        seen.clear()
        clear_gold_read_cache()
        _read_cached_parquet.cache_clear()
        response = client.get(url)
        assert response.status_code == 200, response.text
        expected = {path.resolve() for path in sources(month)}
        assert seen == expected


def test_feature_hit_does_not_recompute(monkeypatch):
    first = client.get(
        "/api/gold/v1/feature/municipality/4106902?ano=2026&mes=6&movimento=admissao&limit=5"
    )
    assert first.status_code == 200

    def fail(*_args, **_kwargs):
        raise AssertionError("HIT refez o feature")

    monkeypatch.setattr("app.services.feature_gold_service.get_municipality_feature", fail)
    monkeypatch.setattr("app.api.routes_feature.get_municipality_feature", fail)
    second = client.get(
        "/api/gold/v1/feature/municipality/4106902?ano=2026&mes=6&movimento=admissao&limit=5"
    )
    assert second.status_code == 200
    assert second.json() == first.json()
    assert _latest().compute_ms == 0
