"""Testes sintéticos da validade e publicação atômica de competências Gold."""

from __future__ import annotations

import json
import logging
import shutil
from pathlib import Path

import pandas as pd
import pytest

from app.services.gold_readiness import build_readiness_report
from app.services.gold_service import list_available_competencias
from pipelines.gold.gold_contract import MIN_REQUIRED_GOLD_TABLES
from pipelines.gold.publication import (
    GoldPublicationError,
    previous_gold_competencia_dir,
    publish_gold_directory,
    retiring_gold_competencia_dir,
    select_published_gold_competencia_dir,
)
from pipelines.gold.validate_gold import (
    GoldValidationError,
    SilverInputValidationResult,
    validate_and_publish_gold,
    validate_gold_outputs,
    write_gold_metadata,
)


def _month_dir(root: Path, ano: int = 2026, mes: int = 2) -> Path:
    return root / f"ano={ano}" / f"mes={mes:02d}"


def _write_required_tables(month_dir: Path, *, both_formats: bool = False) -> None:
    month_dir.mkdir(parents=True, exist_ok=True)
    for table_name in MIN_REQUIRED_GOLD_TABLES:
        frame = pd.DataFrame({"saldo": [0]})
        if table_name == "tabela_resumo":
            frame = pd.DataFrame(
                {
                    "competencia": ["2026-02"],
                    "admissoes": [1],
                    "desligamentos": [1],
                    "saldo": [0],
                }
            )
        frame.to_csv(month_dir / f"{table_name}.csv", index=False)
        if both_formats:
            frame.to_parquet(month_dir / f"{table_name}.parquet", index=False)


def _write_published_gold(
    month_dir: Path,
    *,
    status: str = "ok",
    complete: bool = True,
) -> None:
    month_dir.mkdir(parents=True, exist_ok=True)
    if complete:
        _write_required_tables(month_dir)
    else:
        pd.DataFrame(
            {
                "competencia": ["2026-02"],
                "admissoes": [1],
                "desligamentos": [1],
                "saldo": [0],
            }
        ).to_csv(month_dir / "tabela_resumo.csv", index=False)
    (month_dir / "metadata.json").write_text(
        json.dumps({"validation_status": status}),
        encoding="utf-8",
    )


@pytest.mark.parametrize("status", ["ok", "warning"])
def test_valid_gold_is_available_for_accepted_statuses(tmp_path, status):
    gold_root = tmp_path / "gold" / "caged"
    _write_published_gold(_month_dir(gold_root), status=status)

    items = list_available_competencias(gold_root=gold_root)

    assert [item["competencia"] for item in items] == ["2026-02"]


@pytest.mark.parametrize(
    "case",
    ["missing_metadata", "corrupt_metadata", "error", "processing", "partial"],
)
def test_invalid_or_incomplete_gold_is_not_available(tmp_path, case):
    gold_root = tmp_path / "gold" / "caged"
    month_dir = _month_dir(gold_root)
    _write_required_tables(month_dir)

    if case == "missing_metadata":
        pass
    elif case == "corrupt_metadata":
        (month_dir / "metadata.json").write_text("{", encoding="utf-8")
    elif case == "partial":
        for table_name in MIN_REQUIRED_GOLD_TABLES:
            if table_name != "tabela_resumo":
                (month_dir / f"{table_name}.csv").unlink()
        (month_dir / "metadata.json").write_text(
            json.dumps({"validation_status": "ok"}),
            encoding="utf-8",
        )
    else:
        (month_dir / "metadata.json").write_text(
            json.dumps({"validation_status": case}),
            encoding="utf-8",
        )

    assert (
        list_available_competencias(
            gold_root=gold_root,
            use_config_override=False,
        )
        == []
    )


def test_reader_falls_back_to_previous_during_swap(tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    final_dir = _month_dir(gold_root)
    previous_dir = previous_gold_competencia_dir(final_dir)
    _write_published_gold(previous_dir)

    selected = select_published_gold_competencia_dir(gold_root, 2026, 2)

    assert selected == previous_dir
    assert [item["competencia"] for item in list_available_competencias(gold_root=gold_root)] == [
        "2026-02"
    ]


def test_successful_publication_retains_previous_gold(tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    final_dir = _month_dir(gold_root)
    staging_dir = final_dir.with_name(".mes=02.staging-test")
    _write_published_gold(final_dir)
    (final_dir / "version.txt").write_text("old", encoding="utf-8")
    _write_required_tables(staging_dir, both_formats=True)

    result = validate_and_publish_gold(
        2026,
        2,
        silver_input=SilverInputValidationResult(
            ano=2026,
            mes=2,
            validation_status="ok",
        ),
        staging_dir=staging_dir,
        final_dir=final_dir,
    )

    assert result.validation_status in {"ok", "warning"}
    assert not (final_dir / "version.txt").exists()
    previous_dir = previous_gold_competencia_dir(final_dir)
    assert previous_dir.is_dir()
    assert (previous_dir / "version.txt").read_text(encoding="utf-8") == "old"
    assert json.loads((final_dir / "metadata.json").read_text(encoding="utf-8"))[
        "validation_status"
    ] in {"ok", "warning"}


def test_failed_reprocessing_preserves_previous_gold(tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    final_dir = _month_dir(gold_root)
    staging_dir = final_dir.with_name(".mes=02.staging-test")
    _write_published_gold(final_dir)
    (final_dir / "version.txt").write_text("old", encoding="utf-8")
    staging_dir.mkdir(parents=True)
    pd.DataFrame({"saldo": [0]}).to_csv(
        staging_dir / "tabela_resumo.csv",
        index=False,
    )

    with pytest.raises(GoldValidationError):
        validate_and_publish_gold(
            2026,
            2,
            silver_input=SilverInputValidationResult(
                ano=2026,
                mes=2,
                validation_status="ok",
            ),
            staging_dir=staging_dir,
            final_dir=final_dir,
        )

    assert (final_dir / "version.txt").read_text(encoding="utf-8") == "old"
    assert [item["competencia"] for item in list_available_competencias(gold_root=gold_root)] == [
        "2026-02"
    ]


def test_readiness_uses_same_validity_rule(monkeypatch, tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    month_dir = _month_dir(gold_root)
    _write_published_gold(month_dir, complete=False)
    catalog_path = tmp_path / "gold_catalog.json"
    catalog_path.write_text(
        json.dumps({"summary": {}, "partitions": [], "tables": []}),
        encoding="utf-8",
    )

    monkeypatch.setattr("app.services.gold_readiness.GOLD_CAGED_DIR", gold_root)
    monkeypatch.setattr("app.services.gold_readiness.GOLD_CATALOG_JSON", catalog_path)
    monkeypatch.setattr("app.services.gold_service.GOLD_CAGED_DIR", gold_root)
    monkeypatch.setattr("app.services.gold_service.DEFAULT_ANO", 2026)
    monkeypatch.setattr("app.services.gold_service.DEFAULT_MES", 2)
    monkeypatch.setattr(
        "app.services.gold_service.DEFAULT_COMPETENCIA_CONFIG_ERROR",
        None,
    )
    monkeypatch.setattr("app.services.gold_catalog_service.GOLD_CATALOG_JSON", catalog_path)

    report = build_readiness_report()

    assert report["status"] == "not_ready"
    assert report["checks"]["competencias_available"] is False
    assert report["checks"]["gold_required_files_ok"] is False


def _silver_input() -> SilverInputValidationResult:
    return SilverInputValidationResult(ano=2026, mes=2, validation_status="ok")


def _publish_generation(
    final_dir: Path,
    generation: str,
    *,
    legacy: bool = False,
    incomplete: bool = False,
) -> dict:
    staging_dir = final_dir.with_name(f".mes=02.staging-{generation}")
    if staging_dir.exists():
        shutil.rmtree(staging_dir)
    if incomplete:
        staging_dir.mkdir(parents=True)
        pd.DataFrame({"saldo": [0]}).to_csv(staging_dir / "tabela_resumo.csv", index=False)
    else:
        _write_required_tables(staging_dir, both_formats=True)
        if legacy:
            (staging_dir / "tabela_perfil.csv").write_text("saldo\n0\n", encoding="utf-8")
    (staging_dir / "generation.txt").write_text(generation, encoding="utf-8")
    validate_and_publish_gold(
        2026,
        2,
        silver_input=_silver_input(),
        staging_dir=staging_dir,
        final_dir=final_dir,
    )
    return json.loads((final_dir / "metadata.json").read_text(encoding="utf-8"))


def _generation(directory: Path) -> str:
    return (directory / "generation.txt").read_text(encoding="utf-8")


def test_first_publication_has_no_previous(tmp_path):
    final_dir = _month_dir(tmp_path / "gold" / "caged")
    metadata = _publish_generation(final_dir, "A")

    assert _generation(final_dir) == "A"
    assert not previous_gold_competencia_dir(final_dir).exists()
    assert not retiring_gold_competencia_dir(final_dir).exists()
    assert metadata["generated_at"]
    assert metadata["published_at"] >= metadata["generated_at"]


def test_second_publication_keeps_the_replaced_generation(tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    final_dir = _month_dir(gold_root)
    first = _publish_generation(final_dir, "A")
    second = _publish_generation(final_dir, "B")
    previous_dir = previous_gold_competencia_dir(final_dir)
    previous = json.loads((previous_dir / "metadata.json").read_text(encoding="utf-8"))

    assert _generation(final_dir) == "B"
    assert _generation(previous_dir) == "A"
    assert not retiring_gold_competencia_dir(final_dir).exists()
    assert previous["generated_at"] == first["generated_at"]
    assert previous["published_at"] == first["published_at"]
    assert second["generated_at"] != first["generated_at"] or second["published_at"] != first["published_at"]
    assert second["published_at"] >= second["generated_at"]
    selected = select_published_gold_competencia_dir(gold_root, 2026, 2)
    assert selected == final_dir


def test_third_publication_drops_only_the_oldest_generation(tmp_path):
    final_dir = _month_dir(tmp_path / "gold" / "caged")
    _publish_generation(final_dir, "A")
    _publish_generation(final_dir, "B")
    _publish_generation(final_dir, "C")
    previous_dir = previous_gold_competencia_dir(final_dir)

    assert _generation(final_dir) == "C"
    assert _generation(previous_dir) == "B"
    assert not retiring_gold_competencia_dir(final_dir).exists()
    assert {path.name for path in final_dir.parent.iterdir()} == {
        final_dir.name,
        previous_dir.name,
    }


def test_validation_error_does_not_rotate_generations(tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    final_dir = _month_dir(gold_root)
    _publish_generation(final_dir, "A")
    _publish_generation(final_dir, "B")
    previous_dir = previous_gold_competencia_dir(final_dir)
    before_current = json.loads((final_dir / "metadata.json").read_text(encoding="utf-8"))
    before_previous = json.loads((previous_dir / "metadata.json").read_text(encoding="utf-8"))

    with pytest.raises(GoldValidationError):
        _publish_generation(final_dir, "C", incomplete=True)

    assert _generation(final_dir) == "B"
    assert _generation(previous_dir) == "A"
    assert json.loads((final_dir / "metadata.json").read_text(encoding="utf-8")) == before_current
    assert json.loads((previous_dir / "metadata.json").read_text(encoding="utf-8")) == before_previous
    assert select_published_gold_competencia_dir(gold_root, 2026, 2) == final_dir


def test_failed_promotion_restores_the_canonical_generation(tmp_path, monkeypatch):
    gold_root = tmp_path / "gold" / "caged"
    final_dir = _month_dir(gold_root)
    _publish_generation(final_dir, "A")
    _publish_generation(final_dir, "B")
    staging_dir = final_dir.with_name(".mes=02.staging-C")
    _write_required_tables(staging_dir, both_formats=True)
    (staging_dir / "generation.txt").write_text("C", encoding="utf-8")
    real_replace = Path.replace

    def fail_promotion(self: Path, target: Path) -> Path:
        if self == staging_dir and target == final_dir:
            raise OSError("promoção interrompida")
        return real_replace(self, target)

    monkeypatch.setattr(Path, "replace", fail_promotion)
    with pytest.raises(OSError, match="promoção interrompida"):
        validate_and_publish_gold(
            2026,
            2,
            silver_input=_silver_input(),
            staging_dir=staging_dir,
            final_dir=final_dir,
        )

    previous_dir = previous_gold_competencia_dir(final_dir)
    assert _generation(final_dir) == "B"
    assert _generation(previous_dir) == "A"
    assert not retiring_gold_competencia_dir(final_dir).exists()
    assert select_published_gold_competencia_dir(gold_root, 2026, 2) == final_dir


def test_invalid_canonical_falls_back_to_retained_previous(tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    final_dir = _month_dir(gold_root)
    _publish_generation(final_dir, "A")
    _publish_generation(final_dir, "B")
    previous_dir = previous_gold_competencia_dir(final_dir)
    (final_dir / "metadata.json").write_text("{", encoding="utf-8")

    assert select_published_gold_competencia_dir(gold_root, 2026, 2) == previous_dir
    assert _generation(previous_dir) == "A"
    assert [item["competencia"] for item in list_available_competencias(gold_root=gold_root)] == [
        "2026-02"
    ]


def test_metadata_without_published_at_stays_servable(tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    final_dir = _month_dir(gold_root)
    _write_published_gold(final_dir)
    metadata = json.loads((final_dir / "metadata.json").read_text(encoding="utf-8"))

    assert "published_at" not in metadata
    assert select_published_gold_competencia_dir(gold_root, 2026, 2) == final_dir
    assert [item["competencia"] for item in list_available_competencias(gold_root=gold_root)] == [
        "2026-02"
    ]


def test_warning_publication_rotates_generations(tmp_path):
    final_dir = _month_dir(tmp_path / "gold" / "caged")
    _publish_generation(final_dir, "A")
    metadata = _publish_generation(final_dir, "B", legacy=True)

    assert metadata["validation_status"] == "warning"
    assert metadata["published_at"] >= metadata["generated_at"]
    assert _generation(final_dir) == "B"
    assert _generation(previous_gold_competencia_dir(final_dir)) == "A"


def test_rewriting_metadata_keeps_an_existing_published_at(tmp_path):
    final_dir = _month_dir(tmp_path / "gold" / "caged")
    metadata = _publish_generation(final_dir, "A")
    output = validate_gold_outputs(
        2026,
        2,
        output_dir=final_dir,
        reported_output_dir=final_dir,
    )

    write_gold_metadata(2026, 2, _silver_input(), output, output_dir=final_dir)
    rewritten = json.loads((final_dir / "metadata.json").read_text(encoding="utf-8"))

    assert output.published_at == ""
    assert rewritten["published_at"] == metadata["published_at"]
    assert rewritten["generated_at"] == output.generated_at


def _assert_pair(final_dir: Path, current: str, previous: str) -> None:
    previous_dir = previous_gold_competencia_dir(final_dir)
    assert _generation(final_dir) == current
    assert _generation(previous_dir) == previous
    assert not retiring_gold_competencia_dir(final_dir).exists()


def _staging(final_dir: Path, generation: str) -> Path:
    staging_dir = final_dir.with_name(f".mes=02.staging-{generation}")
    if staging_dir.exists():
        shutil.rmtree(staging_dir)
    _write_required_tables(staging_dir)
    (staging_dir / "metadata.json").write_text(
        json.dumps({"validation_status": "ok"}),
        encoding="utf-8",
    )
    (staging_dir / "generation.txt").write_text(generation, encoding="utf-8")
    return staging_dir


def test_failed_move_after_parking_previous_restores_both(tmp_path, monkeypatch):
    final_dir = _month_dir(tmp_path / "gold" / "caged")
    _publish_generation(final_dir, "A")
    _publish_generation(final_dir, "B")
    previous_dir = previous_gold_competencia_dir(final_dir)
    staging_dir = _staging(final_dir, "C")
    real_replace = Path.replace

    def fail_current_move(self: Path, target: Path) -> Path:
        if self == final_dir and target == previous_dir:
            raise OSError("movimento da corrente interrompido")
        return real_replace(self, target)

    monkeypatch.setattr(Path, "replace", fail_current_move)
    with pytest.raises(OSError, match="movimento da corrente interrompido"):
        publish_gold_directory(staging_dir, final_dir)

    _assert_pair(final_dir, "B", "A")
    assert _generation(staging_dir) == "C"


def test_failed_boundary_before_promotion_restores_both(tmp_path, monkeypatch):
    final_dir = _month_dir(tmp_path / "gold" / "caged")
    _publish_generation(final_dir, "A")
    _publish_generation(final_dir, "B")
    staging_dir = _staging(final_dir, "C")

    def fail_before_promotion() -> None:
        raise OSError("falha antes da promoção")

    monkeypatch.setattr(
        "pipelines.gold.publication._before_promoting_staged_directory",
        fail_before_promotion,
    )
    with pytest.raises(OSError, match="falha antes da promoção"):
        publish_gold_directory(staging_dir, final_dir)

    _assert_pair(final_dir, "B", "A")
    assert _generation(staging_dir) == "C"


def test_failed_attempt_then_success_keeps_only_the_two_newest(tmp_path, monkeypatch):
    gold_root = tmp_path / "gold" / "caged"
    final_dir = _month_dir(gold_root)
    _publish_generation(final_dir, "A")
    _publish_generation(final_dir, "B")
    staging_dir = _staging(final_dir, "C")
    real_replace = Path.replace

    def fail_promotion(self: Path, target: Path) -> Path:
        if self == staging_dir and target == final_dir:
            raise OSError("promoção interrompida")
        return real_replace(self, target)

    monkeypatch.setattr(Path, "replace", fail_promotion)
    with pytest.raises(OSError, match="promoção interrompida"):
        publish_gold_directory(staging_dir, final_dir)
    _assert_pair(final_dir, "B", "A")

    monkeypatch.setattr(Path, "replace", real_replace)
    publish_gold_directory(staging_dir, final_dir)

    _assert_pair(final_dir, "C", "B")
    assert select_published_gold_competencia_dir(gold_root, 2026, 2) == final_dir
    assert {path.name for path in final_dir.parent.iterdir()} == {
        final_dir.name,
        previous_gold_competencia_dir(final_dir).name,
    }


def test_failed_recovery_keeps_the_newest_generation_selectable(tmp_path, monkeypatch):
    gold_root = tmp_path / "gold" / "caged"
    final_dir = _month_dir(gold_root)
    _publish_generation(final_dir, "A")
    _publish_generation(final_dir, "B")
    previous_dir = previous_gold_competencia_dir(final_dir)
    retiring_dir = retiring_gold_competencia_dir(final_dir)
    staging_dir = _staging(final_dir, "C")
    real_replace = Path.replace

    def fail_promotion_and_recovery(self: Path, target: Path) -> Path:
        if self == staging_dir and target == final_dir:
            raise OSError("promoção interrompida")
        if self == previous_dir and target == final_dir:
            raise OSError("restauração interrompida")
        return real_replace(self, target)

    monkeypatch.setattr(Path, "replace", fail_promotion_and_recovery)
    with pytest.raises(GoldPublicationError, match="Temporário existe=True"):
        publish_gold_directory(staging_dir, final_dir)

    assert not final_dir.exists()
    assert _generation(previous_dir) == "B"
    assert _generation(retiring_dir) == "A"
    assert select_published_gold_competencia_dir(gold_root, 2026, 2) == previous_dir

    monkeypatch.setattr(Path, "replace", real_replace)
    publish_gold_directory(staging_dir, final_dir)
    _assert_pair(final_dir, "C", "B")


def test_retiring_directory_is_not_a_published_generation(tmp_path):
    gold_root = tmp_path / "gold" / "caged"
    final_dir = _month_dir(gold_root)
    _write_published_gold(retiring_gold_competencia_dir(final_dir))

    assert select_published_gold_competencia_dir(gold_root, 2026, 2) == final_dir
    assert list_available_competencias(
        gold_root=gold_root,
        use_config_override=False,
    ) == []


def test_cleanup_failure_after_commit_keeps_the_publication(tmp_path, monkeypatch, caplog):
    gold_root = tmp_path / "gold" / "caged"
    final_dir = _month_dir(gold_root)
    _publish_generation(final_dir, "A")
    _publish_generation(final_dir, "B")
    retiring_dir = retiring_gold_competencia_dir(final_dir)
    staging_c = _staging(final_dir, "C")
    real_rmtree = shutil.rmtree
    failed = False

    def fail_first_retiring_removal(path, *args, **kwargs):
        nonlocal failed
        if Path(path) == retiring_dir and not failed:
            failed = True
            raise OSError("limpeza pendente")
        return real_rmtree(path, *args, **kwargs)

    monkeypatch.setattr(
        "pipelines.gold.publication.shutil.rmtree",
        fail_first_retiring_removal,
    )
    caplog.set_level(logging.WARNING, logger="gold.publication")
    publish_gold_directory(staging_c, final_dir)

    assert _generation(final_dir) == "C"
    assert _generation(previous_gold_competencia_dir(final_dir)) == "B"
    assert _generation(retiring_dir) == "A"
    assert select_published_gold_competencia_dir(gold_root, 2026, 2) == final_dir
    warning = next(
        record
        for record in caplog.records
        if record.name == "gold.publication" and record.levelno == logging.WARNING
    )
    assert "gold_publication_cleanup_warning" in warning.message
    assert "competencia=2026-02" in warning.message
    assert str(retiring_dir) in warning.message
    assert "limpeza pendente" in warning.message

    publish_gold_directory(_staging(final_dir, "D"), final_dir)

    assert _generation(final_dir) == "D"
    assert _generation(previous_gold_competencia_dir(final_dir)) == "C"
    assert not retiring_dir.exists()
    assert {path.name for path in final_dir.parent.iterdir()} == {
        final_dir.name,
        previous_gold_competencia_dir(final_dir).name,
    }

