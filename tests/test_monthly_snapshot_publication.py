"""A competência mensal publica território e Feature num único rename."""

from __future__ import annotations

import json
import logging
import shutil
import threading
import time
from pathlib import Path

import pandas as pd
import pytest

from pipelines.gold.aggregate_feature_indicators import write_feature_tables
from pipelines.gold.aggregate_indicators import publicar_tabelas_gold
from pipelines.gold.feature_contract import FEATURE_REPORT_FILE, FEATURE_SERVING_PARQUET_NAMES
from pipelines.gold.feature_publication import (
    FeaturePublicationError,
    require_publishable_feature_snapshot,
    resolve_feature_gold_dir,
)
from pipelines.gold.gold_contract import MIN_REQUIRED_GOLD_TABLES
from pipelines.gold.publication import (
    previous_gold_competencia_dir,
    retiring_gold_competencia_dir,
    select_published_gold_competencia_dir,
)
from pipelines.gold.validate_gold import SilverInputValidationResult
from tests.test_feature_gold import _dimension, _frame

ANO = 2026
MES = 6


def _month(root: Path) -> Path:
    return root / f"ano={ANO}" / f"mes={MES:02d}"


def _install_flat(month: Path, token: str) -> None:
    month.mkdir(parents=True, exist_ok=True)
    frame = pd.DataFrame(
        {
            "competencia": [f"{ANO}-{MES:02d}"],
            "admissoes": [1],
            "desligamentos": [1],
            "saldo": [0],
        }
    )
    generic = pd.DataFrame({"saldo": [0]})
    for name in MIN_REQUIRED_GOLD_TABLES:
        table = frame if name == "tabela_resumo" else generic
        table.to_csv(month / f"{name}.csv", index=False)
    (month / "metadata.json").write_text(
        json.dumps({"validation_status": "ok"}),
        encoding="utf-8",
    )
    (month / "marker.txt").write_text(token, encoding="utf-8")
    snapshot = pd.DataFrame({"token": [token]})
    for name in FEATURE_SERVING_PARQUET_NAMES:
        snapshot.to_parquet(month / f"{name}.parquet", index=False)


def _tables() -> dict[str, pd.DataFrame]:
    resumo = pd.DataFrame(
        {
            "competencia": [f"{ANO}-{MES:02d}"],
            "admissoes": [4],
            "desligamentos": [1],
            "saldo": [3],
        }
    )
    generic = pd.DataFrame({"saldo": [1]})
    return {
        name: (resumo.copy() if name == "tabela_resumo" else generic.copy())
        for name in MIN_REQUIRED_GOLD_TABLES
    }


def _silver() -> SilverInputValidationResult:
    return SilverInputValidationResult(ano=ANO, mes=MES, validation_status="ok")


def _marker(directory: Path) -> str:
    return (directory / "marker.txt").read_text(encoding="utf-8")


def _observe(gold_root: Path) -> tuple[str, str]:
    selected = select_published_gold_competencia_dir(gold_root, ANO, MES)
    territorial = _marker(selected)
    resolved = resolve_feature_gold_dir(selected)
    if resolved is None:
        feature = "absent"
    elif resolved.resolve() == selected.resolve():
        feature = territorial
    else:
        feature_marker = resolved / "marker.txt"
        feature = _marker(resolved) if feature_marker.is_file() else "absent"
    if _marker(selected) != territorial:
        raise OSError("a competência trocou no meio da leitura")
    return territorial, feature


def _mark_generation_c(destination: Path, bundle) -> dict:
    reports = write_feature_tables(destination, bundle)
    (destination.parent / "marker.txt").write_text("C", encoding="utf-8")
    (destination / "marker.txt").write_text("C", encoding="utf-8")
    return reports


def _publish(final: Path, geo_dir: Path):
    tables = _tables()
    return publicar_tabelas_gold(
        ANO,
        MES,
        final,
        tables,
        tables,
        _silver(),
        feature_frame=_frame(),
        feature_dimension=_dimension(),
        feature_geo_dir=geo_dir,
    )


def _forbid_separate_feature_commit(monkeypatch: pytest.MonkeyPatch) -> None:
    def forbidden(*_args, **_kwargs):
        raise AssertionError("O pipeline mensal não pode fazer commit separado da Feature.")

    monkeypatch.setattr(
        "pipelines.gold.aggregate_feature_indicators.commit_feature_directory",
        forbidden,
    )
    monkeypatch.setattr(
        "pipelines.gold.feature_publication.commit_feature_directory",
        forbidden,
    )


def test_single_rename_replaces_a_complete_generation(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    gold_root = tmp_path / "caged"
    final = _month(gold_root)
    _install_flat(final, "B")
    seen: dict[str, object] = {}
    real_before = __import__(
        "pipelines.gold.publication",
        fromlist=["_before_promoting_staged_directory"],
    )._before_promoting_staged_directory

    def before() -> None:
        seen["pair"] = _observe(gold_root)
        seen["canonical_exists"] = final.exists()
        real_before()

    monkeypatch.setattr(
        "pipelines.gold.publication._before_promoting_staged_directory",
        before,
    )
    monkeypatch.setattr(
        "pipelines.gold.aggregate_feature_indicators.write_feature_tables",
        _mark_generation_c,
    )
    _forbid_separate_feature_commit(monkeypatch)

    _publish(final, tmp_path / "geo")

    previous = previous_gold_competencia_dir(final)
    report = json.loads((final / "feature" / FEATURE_REPORT_FILE).read_text(encoding="utf-8"))
    metadata = json.loads((final / "metadata.json").read_text(encoding="utf-8"))

    assert seen["pair"] == ("B", "B")
    assert seen["canonical_exists"] is False
    assert _observe(gold_root) == ("C", "C")
    assert (previous / "marker.txt").read_text(encoding="utf-8") == "B"
    assert resolve_feature_gold_dir(previous) == previous
    assert not (previous / "feature").exists()
    assert (previous / "tabela_uf_setor.parquet").is_file()
    assert resolve_feature_gold_dir(final) == final / "feature"
    assert not (final / "feature.__previous__").exists()
    assert not (final / "tabela_uf_setor.parquet").exists()
    assert (final / "feature" / "tabela_uf_setor.parquet").is_file()
    assert (final / "feature" / "tabela_uf_setor.csv").is_file()
    assert not (final / "feature" / "tabela_municipio_ocupacao.csv").exists()
    assert report["feature_generated_at"] <= metadata["published_at"]
    assert metadata["published_at"] >= metadata["generated_at"]
    assert not retiring_gold_competencia_dir(final).exists()
    assert not list(final.parent.glob(".mes=06.staging-*"))
    assert not list(final.parent.glob(".mes=06.feature-staging-*"))
    require_publishable_feature_snapshot(final / "feature")


def test_feature_generation_failure_keeps_the_published_pair(tmp_path: Path, monkeypatch):
    gold_root = tmp_path / "caged"
    final = _month(gold_root)
    _install_flat(final, "B")

    def fail(*_args, **_kwargs):
        raise RuntimeError("geração feature falhou")

    monkeypatch.setattr(
        "pipelines.gold.aggregate_feature_indicators.build_feature_bundle",
        fail,
    )
    with pytest.raises(RuntimeError, match="geração feature falhou"):
        _publish(final, tmp_path / "geo")

    assert _observe(gold_root) == ("B", "B")
    assert resolve_feature_gold_dir(final) == final
    assert not (final / "feature").exists()
    assert not previous_gold_competencia_dir(final).exists()
    assert not list(final.parent.glob(".mes=06.staging-*"))
    assert not (tmp_path / "geo").exists()


def test_feature_validation_failure_keeps_the_published_pair(tmp_path: Path, monkeypatch):
    gold_root = tmp_path / "caged"
    final = _month(gold_root)
    _install_flat(final, "B")

    def fail(_directory: Path) -> None:
        raise FeaturePublicationError("validação feature reprovada")

    monkeypatch.setattr(
        "pipelines.gold.aggregate_feature_indicators.require_publishable_feature_snapshot",
        fail,
    )
    with pytest.raises(FeaturePublicationError, match="validação feature reprovada"):
        _publish(final, tmp_path / "geo")

    assert _observe(gold_root) == ("B", "B")
    assert not (final / "feature").exists()
    assert not list(final.parent.glob(".mes=06.staging-*"))
    assert not (tmp_path / "geo").exists()


def test_failure_immediately_before_rename_restores_the_published_pair(
    tmp_path: Path,
    monkeypatch,
):
    gold_root = tmp_path / "caged"
    final = _month(gold_root)
    _install_flat(final, "B")

    def fail() -> None:
        raise OSError("falha antes do rename")

    monkeypatch.setattr(
        "pipelines.gold.publication._before_promoting_staged_directory",
        fail,
    )
    monkeypatch.setattr(
        "pipelines.gold.aggregate_feature_indicators.write_feature_tables",
        _mark_generation_c,
    )
    with pytest.raises(OSError, match="falha antes do rename"):
        _publish(final, tmp_path / "geo")

    assert _observe(gold_root) == ("B", "B")
    assert final.is_dir()
    assert not (final / "feature").exists()
    assert not previous_gold_competencia_dir(final).exists()
    assert not retiring_gold_competencia_dir(final).exists()
    assert not list(final.parent.glob(".mes=06.staging-*"))
    assert select_published_gold_competencia_dir(gold_root, ANO, MES) == final


def test_cleanup_failure_after_commit_keeps_both_complete_generations(
    tmp_path: Path,
    monkeypatch,
    caplog,
):
    gold_root = tmp_path / "caged"
    final = _month(gold_root)
    _install_flat(previous_gold_competencia_dir(final), "A")
    _install_flat(final, "B")
    retiring = retiring_gold_competencia_dir(final)
    real_rmtree = shutil.rmtree

    def fail_retiring_cleanup(path, *args, **kwargs):
        if Path(path) == retiring:
            raise OSError("limpeza pendente")
        return real_rmtree(path, *args, **kwargs)

    monkeypatch.setattr("pipelines.gold.publication.shutil.rmtree", fail_retiring_cleanup)
    monkeypatch.setattr(
        "pipelines.gold.aggregate_feature_indicators.write_feature_tables",
        _mark_generation_c,
    )
    caplog.set_level(logging.WARNING, logger="gold.publication")

    _publish(final, tmp_path / "geo")

    previous = previous_gold_competencia_dir(final)
    assert _observe(gold_root) == ("C", "C")
    assert (previous / "marker.txt").read_text(encoding="utf-8") == "B"
    assert resolve_feature_gold_dir(previous) == previous
    assert (retiring / "marker.txt").read_text(encoding="utf-8") == "A"
    assert select_published_gold_competencia_dir(gold_root, ANO, MES) == final
    warning = next(
        record
        for record in caplog.records
        if record.name == "gold.publication" and record.levelno == logging.WARNING
    )
    assert "gold_publication_cleanup_warning" in warning.message
    assert "limpeza pendente" in warning.message


def test_concurrent_reader_never_sees_a_torn_generation(tmp_path: Path, monkeypatch):
    gold_root = tmp_path / "caged"
    final = _month(gold_root)
    _install_flat(final, "B")
    during_build: list[tuple[str, str]] = []
    at_boundary: list[tuple[str, str]] = []
    stop = threading.Event()
    watcher_box: dict[str, threading.Thread] = {}

    def watch() -> None:
        while not stop.is_set():
            try:
                during_build.append(_observe(gold_root))
            except OSError:
                pass
            time.sleep(0.005)

    def marked_write(destination: Path, bundle):
        reports = _mark_generation_c(destination, bundle)
        deadline = time.perf_counter() + 1
        while not during_build and time.perf_counter() < deadline:
            time.sleep(0.01)
        stop.set()
        watcher_box["thread"].join()
        return reports

    real_before = __import__(
        "pipelines.gold.publication",
        fromlist=["_before_promoting_staged_directory"],
    )._before_promoting_staged_directory

    def before() -> None:
        at_boundary.append(_observe(gold_root))
        real_before()

    monkeypatch.setattr(
        "pipelines.gold.aggregate_feature_indicators.write_feature_tables",
        marked_write,
    )
    monkeypatch.setattr(
        "pipelines.gold.publication._before_promoting_staged_directory",
        before,
    )
    watcher_box["thread"] = threading.Thread(target=watch)
    watcher_box["thread"].start()
    try:
        _publish(final, tmp_path / "geo")
    finally:
        stop.set()
        if watcher_box["thread"].is_alive():
            watcher_box["thread"].join()

    assert during_build
    assert at_boundary == [("B", "B")]
    assert _observe(gold_root) == ("C", "C")
    observed = [*during_build, *at_boundary, _observe(gold_root)]
    assert ("C", "absent") not in observed
    assert ("C", "B") not in observed
    assert all(territorial == feature and territorial in {"B", "C"} for territorial, feature in observed)


def test_flat_legacy_snapshot_remains_readable(tmp_path: Path):
    month = _month(tmp_path / "caged")
    _install_flat(month, "legado")

    assert not (month / "feature").exists()
    assert resolve_feature_gold_dir(month) == month
    assert _observe(tmp_path / "caged") == ("legado", "legado")


@pytest.mark.parametrize("mes", [1, 6])
def test_published_january_and_june_stay_on_the_flat_layout(mes: int):
    month = (
        Path(__file__).resolve().parents[1]
        / "data-lake"
        / "gold"
        / "caged"
        / "ano=2026"
        / f"mes={mes:02d}"
    )
    if not month.is_dir():
        pytest.skip("competência publicada ausente")
    assert not (month / "feature").exists()
    assert not (month / "feature.__previous__").exists()
    assert resolve_feature_gold_dir(month) == month
