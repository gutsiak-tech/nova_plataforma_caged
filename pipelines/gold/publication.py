"""Regra compartilhada de validade e publicação da competência Gold."""

from __future__ import annotations

import json
import logging
import shutil
from dataclasses import dataclass
from pathlib import Path

from pipelines.gold.gold_contract import GOLD_METADATA_FILE, MIN_REQUIRED_GOLD_TABLES


ACCEPTED_GOLD_VALIDATION_STATUSES = frozenset({"ok", "warning"})
PREVIOUS_GOLD_DIR_SUFFIX = ".__previous__"
RETIRING_GOLD_DIR_SUFFIX = ".retiring"

logger = logging.getLogger("gold.publication")


class GoldPublicationError(Exception):
    """A publicação falhou e o estado anterior não voltou por completo."""


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


def _published_competencia_label(final_dir: Path) -> str:
    ano = final_dir.parent.name.removeprefix("ano=")
    mes = final_dir.name.removeprefix("mes=")
    if ano != final_dir.parent.name and mes != final_dir.name:
        return f"{ano}-{mes}"
    return final_dir.as_posix()


def previous_gold_competencia_dir(final_dir: Path) -> Path:
    return final_dir.with_name(f"{final_dir.name}{PREVIOUS_GOLD_DIR_SUFFIX}")


def retiring_gold_competencia_dir(final_dir: Path) -> Path:
    """Diretório temporário do swap. Não é competência e a API não o seleciona."""
    return final_dir.with_name(f".{final_dir.name}{RETIRING_GOLD_DIR_SUFFIX}")


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


def _before_promoting_staged_directory() -> None:
    """Fronteira entre deslocar a corrente e promover o staging."""


def _restore_publication(
    final_dir: Path,
    previous_dir: Path,
    retiring_dir: Path,
) -> None:
    """Devolve canônico e anterior ao par que existia antes da tentativa.

    O temporário só segura a geração que já estava em `.__previous__`.
    Ele volta para esse nome. A geração que estava no canônico volta
    para o canônico.
    """
    if retiring_dir.exists() and previous_dir.exists() and not final_dir.exists():
        previous_dir.replace(final_dir)
        retiring_dir.replace(previous_dir)
        return
    if retiring_dir.exists() and final_dir.exists() and not previous_dir.exists():
        retiring_dir.replace(previous_dir)
        return
    if not retiring_dir.exists() and previous_dir.exists() and not final_dir.exists():
        previous_dir.replace(final_dir)
        return
    if retiring_dir.exists():
        raise GoldPublicationError(
            "Estado inesperado ao restaurar a publicação. "
            f"Canônico existe={final_dir.exists()} em {final_dir}. "
            f"Anterior existe={previous_dir.exists()} em {previous_dir}. "
            f"Temporário existe em {retiring_dir}."
        )


def _stabilize_publication_dirs(
    final_dir: Path,
    previous_dir: Path,
    retiring_dir: Path,
) -> None:
    """Fecha um swap interrompido antes de começar outro.

    Se canônico e anterior já existem, o temporário é sobra de uma
    publicação que chegou ao fim e não conseguiu apagá-lo. Nos outros
    casos ele ainda guarda a geração de rollback e volta ao lugar.
    """
    if not retiring_dir.exists():
        return
    if final_dir.exists() and previous_dir.exists():
        try:
            shutil.rmtree(retiring_dir)
        except OSError as exc:
            raise GoldPublicationError(
                "A publicação anterior já está no canônico e na previous. "
                f"Não foi possível apagar o temporário {retiring_dir}."
            ) from exc
        return
    try:
        _restore_publication(final_dir, previous_dir, retiring_dir)
    except Exception as exc:
        message = (
            "Não foi possível devolver o swap interrompido ao par "
            "canônico/anterior antes de uma nova publicação. "
            f"Canônico existe={final_dir.exists()} em {final_dir}. "
            f"Anterior existe={previous_dir.exists()} em {previous_dir}. "
            f"Temporário existe={retiring_dir.exists()} em {retiring_dir}. "
            f"Falha: {exc}."
        )
        logger.error(message)
        raise GoldPublicationError(message) from exc


def publish_gold_directory(staging_dir: Path, final_dir: Path) -> None:
    """Promove o staging e conserva exatamente uma geração anterior.

    Em estado estável existem no máximo `mes=NN` e `mes=NN.__previous__`.
    Durante o swap, a anterior sai para `.mes=NN.retiring`. Esse diretório
    não é publicação: a seleção da API só olha o canônico e `.__previous__`.

    O commit da publicação é o rename que coloca o staging no canônico.
    Uma falha antes disso restaura o par anterior. Se a própria
    restauração falha, o erro segue adiante: a geração mais recente tende
    a ficar em `.__previous__`, de onde a API ainda pode selecioná-la, e a
    anterior antiga permanece no temporário.

    A anterior antiga só é apagada depois desse commit. Se apenas essa
    remoção falha, a publicação permanece concluída e o warning
    `gold_publication_cleanup_warning` registra a limpeza pendente.
    """
    previous_dir = previous_gold_competencia_dir(final_dir)
    retiring_dir = retiring_gold_competencia_dir(final_dir)
    final_dir.parent.mkdir(parents=True, exist_ok=True)
    _stabilize_publication_dirs(final_dir, previous_dir, retiring_dir)

    try:
        if previous_dir.exists() and not final_dir.exists():
            previous_dir.replace(final_dir)
        if previous_dir.exists():
            previous_dir.replace(retiring_dir)
        if final_dir.exists():
            final_dir.replace(previous_dir)
        _before_promoting_staged_directory()
        staging_dir.replace(final_dir)
    except Exception as exc:
        try:
            _restore_publication(final_dir, previous_dir, retiring_dir)
        except Exception as recovery_exc:
            message = (
                "A publicação nova falhou e a restauração do estado anterior "
                "também falhou. "
                f"Canônico existe={final_dir.exists()} em {final_dir}. "
                f"Anterior existe={previous_dir.exists()} em {previous_dir}. "
                f"Temporário existe={retiring_dir.exists()} em {retiring_dir}. "
                "A API usa o canônico quando ele é válido e, na falta dele, "
                "a previous válida. "
                f"Falha da publicação: {exc}. "
                f"Falha da restauração: {recovery_exc}."
            )
            logger.error(message)
            raise GoldPublicationError(message) from recovery_exc
        raise

    if not retiring_dir.exists():
        return
    try:
        shutil.rmtree(retiring_dir)
    except OSError as exc:
        logger.warning(
            "gold_publication_cleanup_warning | competencia=%s | retiring=%s | erro=%s: %s",
            _published_competencia_label(final_dir),
            retiring_dir,
            type(exc).__name__,
            exc,
        )
