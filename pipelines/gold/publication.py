"""Regra compartilhada de validade e publicação da competência Gold."""

from __future__ import annotations

import json
import shutil
from dataclasses import dataclass
from pathlib import Path

from pipelines.gold.gold_contract import GOLD_METADATA_FILE, MIN_REQUIRED_GOLD_TABLES


ACCEPTED_GOLD_VALIDATION_STATUSES = frozenset({"ok", "warning"})
PREVIOUS_GOLD_DIR_SUFFIX = ".__previous__"


@dataclass(frozen=True)
class GoldCompetenciaState:
    directory_exists: bool
    metadata_exists: bool
    metadata_readable: bool
    metadata_status_ok: bool
    required_files_ok: bool
    validation_status: str | None = None
    missing_required_files: tuple[str, ...] = ()

    @property
    def is_valid(self) -> bool:
        return (
            self.directory_exists
            and self.metadata_exists
            and self.metadata_readable
            and self.metadata_status_ok
            and self.required_files_ok
        )


def inspect_gold_competencia_dir(month_dir: Path) -> GoldCompetenciaState:
    directory_exists = month_dir.is_dir()
    metadata_path = month_dir / GOLD_METADATA_FILE
    metadata_exists = metadata_path.is_file()
    metadata_readable = False
    validation_status: str | None = None

    if metadata_exists:
        try:
            payload = json.loads(metadata_path.read_text(encoding="utf-8"))
            if isinstance(payload, dict):
                metadata_readable = True
                validation_status = str(payload.get("validation_status") or "").lower() or None
        except (OSError, json.JSONDecodeError):
            pass

    missing_required_files = tuple(
        table_name
        for table_name in MIN_REQUIRED_GOLD_TABLES
        if not any(
            (month_dir / f"{table_name}{extension}").is_file()
            for extension in (".csv", ".parquet")
        )
    )

    return GoldCompetenciaState(
        directory_exists=directory_exists,
        metadata_exists=metadata_exists,
        metadata_readable=metadata_readable,
        metadata_status_ok=validation_status in ACCEPTED_GOLD_VALIDATION_STATUSES,
        required_files_ok=not missing_required_files,
        validation_status=validation_status,
        missing_required_files=missing_required_files,
    )


def is_valid_gold_competencia_dir(month_dir: Path) -> bool:
    return inspect_gold_competencia_dir(month_dir).is_valid


def canonical_gold_competencia_dir(gold_root: Path, ano: int, mes: int) -> Path:
    return gold_root / f"ano={ano}" / f"mes={mes:02d}"


def previous_gold_competencia_dir(final_dir: Path) -> Path:
    return final_dir.with_name(f"{final_dir.name}{PREVIOUS_GOLD_DIR_SUFFIX}")


def select_published_gold_competencia_dir(
    gold_root: Path,
    ano: int,
    mes: int,
) -> Path:
    final_dir = canonical_gold_competencia_dir(gold_root, ano, mes)
    if is_valid_gold_competencia_dir(final_dir):
        return final_dir

    previous_dir = previous_gold_competencia_dir(final_dir)
    if is_valid_gold_competencia_dir(previous_dir):
        return previous_dir
    return final_dir


def publish_gold_directory(staging_dir: Path, final_dir: Path) -> None:
    """Publica staging validado e preserva/restaura a versão anterior em falhas."""
    previous_dir = previous_gold_competencia_dir(final_dir)
    final_dir.parent.mkdir(parents=True, exist_ok=True)

    if previous_dir.exists():
        if final_dir.exists():
            shutil.rmtree(previous_dir)
        else:
            previous_dir.replace(final_dir)

    had_previous = final_dir.exists()
    if had_previous:
        final_dir.replace(previous_dir)

    try:
        staging_dir.replace(final_dir)
    except OSError:
        if had_previous and previous_dir.exists() and not final_dir.exists():
            previous_dir.replace(final_dir)
        raise

    if previous_dir.exists():
        shutil.rmtree(previous_dir)
