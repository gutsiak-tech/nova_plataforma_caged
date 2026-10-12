"""Publicação atômica da Feature e leitura de um único snapshot."""

from __future__ import annotations

import json
import logging
import shutil
from pathlib import Path

import pandas as pd
import pytest

from app.services.feature_gold_service import SnapshotChanged, get_uf_feature
from app.services.gold_service import GoldMonthRef
from app.services.territorial_response_cache import gold_source_fingerprint
from app.services.territorial_response_sources import uf_feature_sources
from pipelines.gold.aggregate_feature_indicators import (
    build_feature_bundle,
    materialize_feature_gold,
)
from pipelines.gold.feature_contract import (
    FEATURE_REPORT_FILE,
    FEATURE_SERVING_PARQUET_NAMES,
)
from pipelines.gold.feature_publication import (
    FeaturePublicationError,
    commit_feature_directory,
    feature_dir,
    feature_previous_dir,
    feature_retiring_dir,
    feature_staging_dir,
    is_publishable_feature_staging,
    is_valid_feature_snapshot,
    publish_feature_directory,
    resolve_feature_gold_dir,
)
from pipelines.gold.gold_contract import MIN_REQUIRED_GOLD_TABLES
from tests.test_feature_gold import _dimension, _frame

ROOT = Path(__file__).resolve().parents[1]
GOLD_MONTH = ROOT / "data-lake" / "gold" / "caged" / "ano=2026" / "mes=02"


def _month(tmp_path: Path, name: str = "mes=06") -> Path:
    month = tmp_path / "ano=2026" / name
    month.mkdir(parents=True)
    (month / "metadata.json").write_text(
        json.dumps({"validation_status": "ok"}),
        encoding="utf-8",
    )
    for table_name in MIN_REQUIRED_GOLD_TABLES:
        (month / f"{table_name}.csv").write_text("col\n1\n", encoding="utf-8")
    return month


def _write_token_snapshot(directory: Path, token: str) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    frame = pd.DataFrame({"token": [token]})
    for name in FEATURE_SERVING_PARQUET_NAMES:
        frame.to_parquet(directory / f"{name}.parquet", index=False)
    (directory / FEATURE_REPORT_FILE).write_text(
        json.dumps({"token": token}),
        encoding="utf-8",
    )


def _token(directory: Path) -> str:
    return json.loads((directory / FEATURE_REPORT_FILE).read_text(encoding="utf-8"))["token"]


def _publish_token(month: Path, token: str) -> None:
    staging = month.parent / f".{month.name}.feature-staging-{token}"
    _write_token_snapshot(staging, token)
    publish_feature_directory(staging, feature_dir(month))


def _movement_frame(generation: str, table_name: str) -> pd.DataFrame:
    marker = 100 if generation == "B" else 200
    metrics = {
        "admissoes": [marker],
        "desligamentos": [1],
        "saldo": [marker - 1],
    }
    if table_name.endswith("_salario"):
        return pd.DataFrame(
            {
                "uf_sigla": ["SP"],
                "movimento": ["admissao"],
                "n_salarios_validos": [marker],
                "salario_medio": [float(marker)],
                "salario_mediano": [float(marker)],
            }
        )
    if table_name.endswith("_setor"):
        return pd.DataFrame({"uf_sigla": ["SP"], "secao": [generation], **metrics})
    if table_name.endswith("_ocupacao"):
        return pd.DataFrame({"uf_sigla": ["SP"], "cbo2002ocupacao": [generation], **metrics})
    if table_name.endswith("_perfil_sexo"):
        return pd.DataFrame({"uf_sigla": ["SP"], "sexo": [generation], **metrics})
    if table_name.endswith("_perfil_faixa_etaria"):
        return pd.DataFrame({"uf_sigla": ["SP"], "faixa_etaria": [generation], **metrics})
    return pd.DataFrame({"uf_sigla": ["SP"], "graudeinstrucao": [generation], **metrics})


def _write_serving_generation(directory: Path, generation: str) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    for name in FEATURE_SERVING_PARQUET_NAMES:
        frame = _movement_frame(generation, name) if name.startswith("tabela_uf_") else pd.DataFrame(
            {"cod_municipio": pd.Series(dtype="string")}
        )
        frame.to_parquet(directory / f"{name}.parquet", index=False)
    (directory / FEATURE_REPORT_FILE).write_text(
        json.dumps({"generation": generation}),
        encoding="utf-8",
    )


def _patch_identity(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.services.feature_gold_service.list_valid_competencias",
        lambda: [],
    )
    monkeypatch.setattr(
        "app.services.feature_gold_service._read_dimension",
        lambda _name: pd.DataFrame(
            {
                "uf_sigla": ["SP"],
                "uf_norm": ["SAO PAULO"],
                "uf": ["São Paulo"],
                "cod_uf": ["35"],
            }
        ),
    )
    monkeypatch.setattr(
        "app.services.feature_gold_service._uf_movement_row",
        lambda _month, _uf_norm: pd.Series(
            {"admissoes": 10, "desligamentos": 4, "saldo": 6}
        ),
    )
    monkeypatch.setattr(
        "app.services.feature_gold_service._brasil_kpis",
        lambda _month: {"admissoes": 100, "desligamentos": 40, "saldo": 60},
    )


def _read_sp(month: Path, monkeypatch) -> dict:
    _patch_identity(monkeypatch)
    return get_uf_feature(
        "SP",
        GoldMonthRef(ano=2026, mes=6),
        territorial_dir=month,
        feature_dir=resolve_feature_gold_dir(month),
    )


def test_report_is_published_but_not_required_to_serve(tmp_path: Path):
    snapshot = tmp_path / "feature"
    _write_token_snapshot(snapshot, "B")
    (snapshot / FEATURE_REPORT_FILE).unlink()
    assert is_valid_feature_snapshot(snapshot)
    assert not is_publishable_feature_staging(snapshot)


def test_staging_is_outside_the_active_feature_directory(tmp_path: Path):
    month = _month(tmp_path)
    _publish_token(month, "B")
    staging = feature_staging_dir(month)
    assert staging.parent == month.parent
    assert staging.name.startswith(f".{month.name}.feature-staging-")
    assert "feature" not in staging.parts[-2:]
    _write_token_snapshot(staging, "C")
    assert resolve_feature_gold_dir(month) == feature_dir(month)
    assert _token(resolve_feature_gold_dir(month)) == "B"


def test_first_second_and_third_feature_publication(tmp_path: Path):
    month = _month(tmp_path)
    _publish_token(month, "A")
    assert _token(feature_dir(month)) == "A"
    assert not feature_previous_dir(month).exists()
    assert not feature_retiring_dir(month).exists()

    _publish_token(month, "B")
    assert _token(feature_dir(month)) == "B"
    assert _token(feature_previous_dir(month)) == "A"
    assert not feature_retiring_dir(month).exists()

    _publish_token(month, "C")
    assert _token(feature_dir(month)) == "C"
    assert _token(feature_previous_dir(month)) == "B"
    assert not feature_retiring_dir(month).exists()
    assert not any(month.parent.glob(f".{month.name}.feature-staging-*"))


def test_failure_before_commit_restores_both_generations(tmp_path: Path, monkeypatch):
    month = _month(tmp_path)
    _publish_token(month, "A")
    _publish_token(month, "B")
    staging = month.parent / f".{month.name}.feature-staging-C"
    _write_token_snapshot(staging, "C")

    def fail_before_rename() -> None:
        raise OSError("falha antes do commit")

    monkeypatch.setattr(
        "pipelines.gold.feature_publication._before_promoting_feature_directory",
        fail_before_rename,
    )
    with pytest.raises(OSError, match="falha antes do commit"):
        publish_feature_directory(staging, feature_dir(month))

    assert _token(feature_dir(month)) == "B"
    assert _token(feature_previous_dir(month)) == "A"
    assert not feature_retiring_dir(month).exists()
    assert staging.is_dir()
    assert _token(staging) == "C"


def test_cleanup_failure_after_commit_keeps_the_new_feature(tmp_path, monkeypatch, caplog):
    month = _month(tmp_path)
    _publish_token(month, "A")
    _publish_token(month, "B")
    retiring = feature_retiring_dir(month)
    staging = month.parent / f".{month.name}.feature-staging-C"
    _write_token_snapshot(staging, "C")
    real_rmtree = shutil.rmtree
    failed = False

    def fail_first_retiring_removal(path, *args, **kwargs):
        nonlocal failed
        if Path(path) == retiring and not failed:
            failed = True
            raise OSError("limpeza pendente")
        return real_rmtree(path, *args, **kwargs)

    monkeypatch.setattr(
        "pipelines.gold.feature_publication.shutil.rmtree",
        fail_first_retiring_removal,
    )
    caplog.set_level(logging.WARNING, logger="gold.feature.publication")
    publish_feature_directory(staging, feature_dir(month))

    assert _token(feature_dir(month)) == "C"
    assert _token(feature_previous_dir(month)) == "B"
    assert _token(retiring) == "A"
    warning = next(
        record
        for record in caplog.records
        if "feature_publication_cleanup_warning" in record.message
    )
    assert month.name in warning.message
    assert str(retiring) in warning.message

    _publish_token(month, "D")
    assert _token(feature_dir(month)) == "D"
    assert _token(feature_previous_dir(month)) == "C"
    assert not retiring.exists()
    assert not feature_retiring_dir(month).exists()


def test_commit_waits_for_the_canonical_territorial_directory(tmp_path: Path, monkeypatch):
    month = _month(tmp_path)
    parked = month.parent / f"{month.name}.__previous__"
    month.rename(parked)
    staging = month.parent / f".{month.name}.feature-staging-C"
    _write_token_snapshot(staging, "C")

    def restore_on_wait(_seconds: float) -> None:
        assert not (parked / "feature").exists()
        if not month.exists():
            parked.rename(month)

    monkeypatch.setattr(
        "pipelines.gold.feature_publication.time.sleep",
        restore_on_wait,
    )
    published = commit_feature_directory(staging, month)
    assert published == feature_dir(month)
    assert _token(published) == "C"
    assert not parked.exists()


def test_commit_does_not_publish_into_territorial_previous(tmp_path: Path):
    month = _month(tmp_path)
    previous = month.parent / f"{month.name}.__previous__"
    staging = month.parent / f".{month.name}.feature-staging-C"
    _write_token_snapshot(staging, "C")
    month.rename(previous)
    with pytest.raises(FeaturePublicationError, match="previous territorial"):
        commit_feature_directory(staging, month)
    assert not (previous / "feature").exists()
    assert staging.is_dir()


def test_legacy_flat_is_served_until_the_first_feature_directory(tmp_path: Path, monkeypatch):
    month = _month(tmp_path)
    _write_serving_generation(month, "B")
    assert resolve_feature_gold_dir(month) == month
    before = _read_sp(month, monkeypatch)
    assert before["salary"]["n_salarios_validos"] == 100
    assert before["sectors"]["by_saldo"][0]["secao"] == "B"

    feature = feature_dir(month)
    _write_serving_generation(feature, "C")
    assert resolve_feature_gold_dir(month) == feature
    after = _read_sp(month, monkeypatch)
    assert after["salary"]["n_salarios_validos"] == 200
    assert after["sectors"]["by_saldo"][0]["secao"] == "C"
    assert after["occupations"]["by_saldo"][0]["cbo2002ocupacao"] == "C"
    assert after["profiles"]["sexo"][0]["sexo"] == "C"
    assert (month / "tabela_uf_salario.parquet").is_file()


def test_invalid_feature_uses_previous_inside_the_selected_territorial_dir(tmp_path: Path):
    month = _month(tmp_path)
    other = month.parent / f"{month.name}.__previous__"
    other.mkdir()
    _write_serving_generation(feature_dir(month), "FB")
    _write_serving_generation(feature_previous_dir(month), "FA")
    _write_serving_generation(feature_dir(other), "OUTRA")
    (feature_dir(month) / "tabela_uf_salario.parquet").unlink()

    selected = resolve_feature_gold_dir(month)
    assert selected == feature_previous_dir(month)
    assert _token_generation(selected) == "FA"
    assert resolve_feature_gold_dir(other) == feature_dir(other)
    assert resolve_feature_gold_dir(other) != selected


def _token_generation(directory: Path) -> str:
    return json.loads((directory / FEATURE_REPORT_FILE).read_text(encoding="utf-8"))["generation"]


def test_invalid_feature_directory_does_not_fall_back_to_flat_files(tmp_path: Path):
    month = _month(tmp_path)
    _write_serving_generation(month, "B")
    feature = feature_dir(month)
    feature.mkdir()
    (feature / "tabela_uf_salario.parquet").write_bytes(b"incompleto")
    assert resolve_feature_gold_dir(month) is None


def test_request_around_commit_is_entirely_one_generation(tmp_path: Path, monkeypatch):
    month = _month(tmp_path)
    _write_serving_generation(feature_dir(month), "B")
    staging = month.parent / f".{month.name}.feature-staging-C"
    _write_serving_generation(staging, "C")

    before = _read_sp(month, monkeypatch)
    assert before["salary"]["n_salarios_validos"] == 100
    assert before["sectors"]["by_saldo"][0]["secao"] == "B"
    assert before["profiles"]["faixa_etaria"][0]["faixa_etaria"] == "B"

    real_read = __import__(
        "app.services.feature_gold_service",
        fromlist=["_read_feature_slice"],
    )._read_feature_slice
    swapped = {"done": False}

    def swap_after_first_slice(directory: Path, table_name: str, column: str, value: str):
        frame = real_read(directory, table_name, column, value)
        if not swapped["done"]:
            swapped["done"] = True
            publish_feature_directory(staging, feature_dir(month))
        return frame

    monkeypatch.setattr(
        "app.services.feature_gold_service._read_feature_slice",
        swap_after_first_slice,
    )
    with pytest.raises(SnapshotChanged):
        _read_sp(month, monkeypatch)
    assert _token_generation(feature_dir(month)) == "C"

    monkeypatch.setattr(
        "app.services.feature_gold_service._read_feature_slice",
        real_read,
    )
    after = _read_sp(month, monkeypatch)
    assert after["salary"]["n_salarios_validos"] == 200
    assert after["sectors"]["by_saldo"][0]["secao"] == "C"
    assert after["occupations"]["by_saldo"][0]["cbo2002ocupacao"] == "C"
    assert after["profiles"]["sexo"][0]["sexo"] == "C"
    assert after["profiles"]["graudeinstrucao"][0]["graudeinstrucao"] == "C"


def test_fingerprint_follows_the_selected_feature_snapshot(tmp_path: Path):
    month = _month(tmp_path)
    _write_serving_generation(month, "B")
    _write_serving_generation(feature_dir(month), "C")
    _write_serving_generation(feature_previous_dir(month), "A")
    (feature_dir(month) / "tabela_uf_setor.parquet").unlink()
    month_ref = GoldMonthRef(ano=2026, mes=6)
    selected = resolve_feature_gold_dir(month)
    assert selected == feature_previous_dir(month)
    sources = uf_feature_sources(
        month_ref,
        territorial_dir=month,
        feature_dir=selected,
    )
    assert any(path.parent == feature_previous_dir(month) for path in sources)
    assert all(path.parent != feature_dir(month) for path in sources if path.name.startswith("tabela_uf_"))
    flat_sources = uf_feature_sources(
        month_ref,
        territorial_dir=month,
        feature_dir=month,
    )
    assert gold_source_fingerprint(sources) != gold_source_fingerprint(flat_sources)


def test_empty_frame_is_written_inside_the_new_snapshot(tmp_path: Path, monkeypatch):
    month = _month(tmp_path)
    materialize_feature_gold(
        _frame(),
        2026,
        month,
        mes=6,
        dimension=_dimension(),
        geo_dir=tmp_path / "geo",
    )
    previous_rows = len(pd.read_parquet(feature_dir(month) / "tabela_uf_perfil_sexo.parquet"))
    assert previous_rows > 0
    real_build = build_feature_bundle

    def empty_profile(*args, **kwargs):
        bundle = real_build(*args, **kwargs)
        bundle.tables["tabela_uf_perfil_sexo"] = bundle.tables["tabela_uf_perfil_sexo"].iloc[0:0]
        return bundle

    monkeypatch.setattr(
        "pipelines.gold.aggregate_feature_indicators.build_feature_bundle",
        empty_profile,
    )
    materialize_feature_gold(
        _frame(),
        2026,
        month,
        mes=6,
        dimension=_dimension(),
        geo_dir=tmp_path / "geo",
    )
    current = pd.read_parquet(feature_dir(month) / "tabela_uf_perfil_sexo.parquet")
    retained = pd.read_parquet(feature_previous_dir(month) / "tabela_uf_perfil_sexo.parquet")
    assert current.empty
    assert len(retained) == previous_rows


def test_materialize_failure_before_commit_removes_staging(tmp_path: Path, monkeypatch):
    month = _month(tmp_path)
    materialize_feature_gold(
        _frame(),
        2026,
        month,
        mes=6,
        dimension=_dimension(),
        geo_dir=tmp_path / "geo-a",
    )
    before = (feature_dir(month) / "tabela_uf_setor.parquet").stat().st_mtime_ns

    def fail_commit(*_args, **_kwargs):
        raise OSError("staging ainda invisível")

    monkeypatch.setattr(
        "pipelines.gold.aggregate_feature_indicators.commit_feature_directory",
        fail_commit,
    )
    with pytest.raises(OSError, match="invisível"):
        materialize_feature_gold(
            _frame(),
            2026,
            month,
            mes=6,
            dimension=_dimension(),
            geo_dir=tmp_path / "geo-b",
        )
    assert (feature_dir(month) / "tabela_uf_setor.parquet").stat().st_mtime_ns == before
    assert not list(month.parent.glob(f".{month.name}.feature-staging-*"))
    assert (month / "tabela_uf.csv").is_file()


@pytest.mark.skipif(
    not (GOLD_MONTH / "tabela_uf_salario.parquet").is_file(),
    reason="Gold de feature ainda não materializada",
)
def test_published_lake_still_resolves_the_legacy_flat_layout():
    assert not (GOLD_MONTH / "feature").exists()
    assert resolve_feature_gold_dir(GOLD_MONTH) == GOLD_MONTH
