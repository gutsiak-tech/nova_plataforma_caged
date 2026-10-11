"""Lifecycle do aquecimento dos panoramas de admissão."""

from __future__ import annotations

import json
import logging
import threading
import time
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from app.services.territorial_response_cache import (
    clear_territorial_response_cache,
    territorial_response_cache,
)
from app.services.territorial_response_sources import overview_logical_key
from app.services.territorial_warm import (
    controller,
    warm_admission_overviews,
    warm_overview,
    warm_plan,
)
from pipelines.gold.gold_contract import MIN_REQUIRED_GOLD_TABLES


def _month(root: Path, ano: int, mes: int, status: str, *, complete: bool = True) -> Path:
    month_dir = root / f"ano={ano}" / f"mes={mes:02d}"
    month_dir.mkdir(parents=True, exist_ok=True)
    if complete:
        for table_name in MIN_REQUIRED_GOLD_TABLES:
            (month_dir / f"{table_name}.csv").write_text("saldo\n0\n", encoding="utf-8")
    (month_dir / "metadata.json").write_text(
        json.dumps({"validation_status": status}),
        encoding="utf-8",
    )
    return month_dir


def _store(ano: int, mes: int, scope: str, movimento: str = "admissao"):
    return territorial_response_cache.serve(
        overview_logical_key(scope, ano, mes, movimento),
        [],
        lambda: {"scope": scope, "ano": ano, "mes": mes, "movimento": movimento},
    )


def _published_pair(**_kwargs):
    return [{"ano": 2026, "mes": 1}, {"ano": 2026, "mes": 2}]


def test_start_returns_before_the_first_key_finishes(monkeypatch):
    monkeypatch.setenv("TERRITORIAL_WARM_ON_STARTUP", "1")
    monkeypatch.setattr(
        "app.services.territorial_warm.list_valid_competencias",
        _published_pair,
    )
    entered = threading.Event()
    release = threading.Event()

    def block(ano: int, mes: int, scope: str) -> None:
        entered.set()
        release.wait(2)

    monkeypatch.setattr("app.services.territorial_warm.warm_overview", block)
    started = time.perf_counter()
    controller.start()
    elapsed = time.perf_counter() - started
    try:
        assert elapsed < 0.2
        assert entered.wait(1)
    finally:
        release.set()
        controller.stop(timeout=2)
    assert controller._thread is not None
    assert not controller._thread.is_alive()


def test_health_is_served_while_warm_is_still_running(monkeypatch):
    monkeypatch.setenv("TERRITORIAL_WARM_ON_STARTUP", "1")
    monkeypatch.setattr(
        "app.services.territorial_warm.list_valid_competencias",
        _published_pair,
    )
    entered = threading.Event()
    release = threading.Event()

    def block(ano: int, mes: int, scope: str) -> None:
        entered.set()
        release.wait(2)

    monkeypatch.setattr("app.services.territorial_warm.warm_overview", block)
    try:
        with TestClient(app) as client:
            started = time.perf_counter()
            response = client.get("/health")
            elapsed = time.perf_counter() - started
            assert response.status_code == 200
            assert elapsed < 0.5
            assert entered.wait(1)
            release.set()
    finally:
        release.set()
        controller.stop(timeout=2)


def test_disabled_startup_does_not_warm(monkeypatch):
    monkeypatch.setenv("TERRITORIAL_WARM_ON_STARTUP", "0")
    calls: list[tuple[int, int, str]] = []
    monkeypatch.setattr(
        "app.services.territorial_warm.warm_overview",
        lambda ano, mes, scope: calls.append((ano, mes, scope)),
    )
    with TestClient(app) as client:
        assert client.get("/health").status_code == 200
    assert calls == []


def test_only_published_competencias_are_warmed(tmp_path: Path):
    root = tmp_path / "gold"
    _month(root, 2026, 1, "ok")
    _month(root, 2026, 6, "warning")
    _month(root, 2026, 7, "ok")
    _month(root, 2026, 3, "error")
    _month(root, 2026, 4, "ok", complete=False)
    (root / "ano=2026" / "staging").mkdir(parents=True)
    seen: list[tuple[int, int, str]] = []

    result = warm_admission_overviews(
        gold_root=root,
        load=lambda ano, mes, scope: seen.append((ano, mes, scope)),
    )

    assert seen == [
        (2026, 1, "br"),
        (2026, 1, "pr"),
        (2026, 1, "rmc"),
        (2026, 6, "br"),
        (2026, 6, "pr"),
        (2026, 6, "rmc"),
        (2026, 7, "br"),
        (2026, 7, "pr"),
        (2026, 7, "rmc"),
    ]
    assert result.expected == 9
    assert result.succeeded == 9
    assert result.failed == 0


def test_previous_published_dir_is_included_when_canonical_is_invalid(tmp_path: Path):
    root = tmp_path / "gold"
    _month(root, 2026, 2, "error")
    previous = root / "ano=2026" / "mes=02.__previous__"
    previous.mkdir(parents=True)
    for table_name in MIN_REQUIRED_GOLD_TABLES:
        (previous / f"{table_name}.csv").write_text("saldo\n0\n", encoding="utf-8")
    (previous / "metadata.json").write_text(
        json.dumps({"validation_status": "ok"}),
        encoding="utf-8",
    )
    seen: list[tuple[int, int, str]] = []
    warm_admission_overviews(
        gold_root=root,
        load=lambda ano, mes, scope: seen.append((ano, mes, scope)),
    )
    assert seen == [(2026, 2, "br"), (2026, 2, "pr"), (2026, 2, "rmc")]


def test_warm_calls_overview_for_admission_only(monkeypatch):
    captured: list[tuple[str, int, int, str]] = []

    def fake_overview(*, scope: str, ano: int, mes: int, movimento: str):
        captured.append((scope, ano, mes, movimento))
        return _store(ano, mes, scope, movimento)

    def forbidden(*_args, **_kwargs):
        raise AssertionError("feature aquecida")

    monkeypatch.setattr("app.api.routes_feature.feature_uf", forbidden)
    monkeypatch.setattr("app.api.routes_feature.feature_municipality", forbidden)
    monkeypatch.setattr("app.api.routes_gold.overview", fake_overview)

    result = warm_admission_overviews(competencias=[{"ano": 2026, "mes": 6}])

    assert captured == [
        ("br", 2026, 6, "admissao"),
        ("pr", 2026, 6, "admissao"),
        ("rmc", 2026, 6, "admissao"),
    ]
    assert result.succeeded == 3
    assert territorial_response_cache.stats()["entries"] == 3
    again = fake_overview(scope="br", ano=2026, mes=6, movimento="admissao")
    assert territorial_response_cache.last_decision().outcome == "hit"
    assert again["movimento"] == "admissao"

    dismissal = territorial_response_cache.serve(
        overview_logical_key("br", 2026, 6, "desligamento"),
        [],
        lambda: {"movimento": "desligamento"},
    )
    assert dismissal["movimento"] == "desligamento"
    assert territorial_response_cache.last_decision().outcome == "miss"

    territorial_response_cache.serve(
        "feature|uf|SP|2026|6|admissao|5",
        [],
        lambda: {"feature": True},
    )
    assert territorial_response_cache.last_decision().outcome == "miss"


def test_keys_run_one_at_a_time():
    state = {"inside": 0, "max": 0}
    guard = threading.Lock()

    def load(ano: int, mes: int, scope: str) -> None:
        with guard:
            state["inside"] += 1
            state["max"] = max(state["max"], state["inside"])
        time.sleep(0.01)
        with guard:
            state["inside"] -= 1

    warm_admission_overviews(
        competencias=[{"ano": 2026, "mes": 1}, {"ano": 2026, "mes": 2}],
        load=load,
    )
    assert state["max"] == 1
    assert warm_plan([{"ano": 2026, "mes": 1}]) == [
        (2026, 1, "br"),
        (2026, 1, "pr"),
        (2026, 1, "rmc"),
    ]


def test_same_inflight_key_computes_once():
    entered = threading.Event()
    release = threading.Event()
    calls = {"n": 0}
    key = overview_logical_key("br", 2026, 1, "admissao")
    coalesced_before = territorial_response_cache.stats()["coalesced"]

    def compute():
        calls["n"] += 1
        entered.set()
        assert release.wait(2)
        return {"ok": True}

    def load(ano: int, mes: int, scope: str) -> None:
        territorial_response_cache.serve(
            overview_logical_key(scope, ano, mes, "admissao"),
            [],
            compute if scope == "br" else lambda: {"scope": scope},
        )

    holder: dict[str, object] = {}

    def request_same_key() -> None:
        holder["value"] = territorial_response_cache.serve(key, [], compute)
        holder["outcome"] = territorial_response_cache.last_decision().outcome

    worker = threading.Thread(
        target=lambda: warm_admission_overviews(
            competencias=[{"ano": 2026, "mes": 1}],
            load=load,
        )
    )
    requester = threading.Thread(target=request_same_key)
    worker.start()
    try:
        assert entered.wait(2)
        requester.start()
        deadline = time.perf_counter() + 2
        while territorial_response_cache.stats()["coalesced"] == coalesced_before:
            assert time.perf_counter() < deadline
            time.sleep(0.01)
        release.set()
        requester.join(2)
        assert holder["value"] == {"ok": True}
        assert holder["outcome"] == "coalesced"
    finally:
        release.set()
        worker.join(2)
        requester.join(2)
    assert calls["n"] == 1
    assert not worker.is_alive()


def test_one_failed_key_does_not_stop_the_others_or_cache_the_error():
    def load(ano: int, mes: int, scope: str) -> None:
        def compute():
            if scope == "pr":
                raise RuntimeError("quebra pr")
            return {"scope": scope}

        territorial_response_cache.serve(
            overview_logical_key(scope, ano, mes, "admissao"),
            [],
            compute,
        )

    result = warm_admission_overviews(
        competencias=[{"ano": 2026, "mes": 1}, {"ano": 2026, "mes": 2}],
        load=load,
    )
    assert result.attempted == 6
    assert result.succeeded == 4
    assert result.failed == 2
    assert territorial_response_cache.stats()["entries"] == 4

    recovered = territorial_response_cache.serve(
        overview_logical_key("pr", 2026, 1, "admissao"),
        [],
        lambda: {"scope": "pr"},
    )
    assert recovered == {"scope": "pr"}
    assert territorial_response_cache.last_decision().outcome == "miss"


def test_warm_failure_leaves_the_app_usable(monkeypatch):
    monkeypatch.setenv("TERRITORIAL_WARM_ON_STARTUP", "1")
    monkeypatch.setattr(
        "app.services.territorial_warm.list_valid_competencias",
        _published_pair,
    )

    def explode(ano: int, mes: int, scope: str) -> None:
        raise RuntimeError(f"falha {scope}")

    monkeypatch.setattr("app.services.territorial_warm.warm_overview", explode)
    with TestClient(app) as client:
        assert client.get("/health").status_code == 200
        controller.wait(2)
        assert client.get("/health").status_code == 200
    assert controller.last_result is not None
    assert controller.last_result.failed == controller.last_result.attempted
    assert controller.last_result.succeeded == 0
    payload = territorial_response_cache.serve(
        overview_logical_key("br", 2026, 6, "admissao"),
        [],
        lambda: {"later": True},
    )
    assert payload == {"later": True}


def test_stop_returns_without_running_the_remaining_keys(monkeypatch):
    monkeypatch.setattr(
        "app.services.territorial_warm.list_valid_competencias",
        _published_pair,
    )
    calls: list[str] = []
    entered = threading.Event()

    def load(ano: int, mes: int, scope: str) -> None:
        calls.append(scope)
        if len(calls) == 1:
            entered.set()
            time.sleep(0.2)

    monkeypatch.setattr("app.services.territorial_warm.warm_overview", load)
    controller.start()
    try:
        assert entered.wait(2)
        started = time.perf_counter()
        controller.stop(timeout=2)
        elapsed = time.perf_counter() - started
    finally:
        controller.stop(timeout=2)
    assert elapsed < 1
    assert calls == ["br"]


def test_stop_does_not_wait_out_a_stuck_key(monkeypatch):
    monkeypatch.setattr(
        "app.services.territorial_warm.list_valid_competencias",
        _published_pair,
    )
    entered = threading.Event()
    hold = threading.Event()

    def load(ano: int, mes: int, scope: str) -> None:
        entered.set()
        hold.wait(3)

    monkeypatch.setattr("app.services.territorial_warm.warm_overview", load)
    controller.start()
    try:
        assert entered.wait(2)
        started = time.perf_counter()
        controller.stop(timeout=0.2)
        elapsed = time.perf_counter() - started
        assert elapsed < 0.6
    finally:
        hold.set()
        controller.wait(2)
    assert controller._thread is not None
    assert not controller._thread.is_alive()


def test_changed_fingerprint_drops_the_warmed_payload(tmp_path: Path):
    path = tmp_path / "gold.parquet"
    path.write_bytes(b"v1")
    calls = {"n": 0}

    def load(ano: int, mes: int, scope: str) -> None:
        def compute():
            calls["n"] += 1
            return {"size": path.stat().st_size}

        territorial_response_cache.serve(
            overview_logical_key(scope, ano, mes, "admissao"),
            [path],
            compute,
        )

    warm_admission_overviews(competencias=[{"ano": 2026, "mes": 6}], load=load)
    assert calls["n"] == 3
    territorial_response_cache.serve(
        overview_logical_key("br", 2026, 6, "admissao"),
        [path],
        lambda: {"size": path.stat().st_size},
    )
    assert territorial_response_cache.last_decision().outcome == "hit"

    path.write_bytes(b"v1-rewritten")
    refreshed = territorial_response_cache.serve(
        overview_logical_key("br", 2026, 6, "admissao"),
        [path],
        lambda: {"size": path.stat().st_size},
    )
    assert territorial_response_cache.last_decision().outcome == "miss"
    assert refreshed["size"] == len(b"v1-rewritten")
    assert refreshed != {"size": 2}


def test_logs_start_complete_and_key_error():
    records: list[str] = []

    class _Collect(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            records.append(record.getMessage())

    handler = _Collect()
    logger = logging.getLogger("api.territorial_warm")
    logger.addHandler(handler)
    try:
        def load(ano: int, mes: int, scope: str) -> None:
            if scope == "rmc":
                raise RuntimeError("rmc indisponivel")

        warm_admission_overviews(competencias=[{"ano": 2026, "mes": 5}], load=load)
    finally:
        logger.removeHandler(handler)
    text = "\n".join(records)
    assert "territorial_warm_start | competencias=1 | chaves=3" in text
    assert (
        "territorial_warm_error | ano=2026 | mes=5 | scope=rmc | erro=RuntimeError: rmc indisponivel"
        in text
    )
    assert "territorial_warm_complete | tentadas=3 | sucesso=2 | falhas=1 |" in text


def test_importing_the_module_does_not_start_a_thread():
    assert controller._thread is None or not controller._thread.is_alive()
    assert callable(warm_overview)
    clear_territorial_response_cache()
