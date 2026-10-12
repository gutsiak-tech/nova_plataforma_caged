"""Publicação atômica do snapshot Feature.

A geração escreve num staging fora de `feature/`. O commit é o rename desse
diretório para `feature/`. A Gold territorial não participa desse swap.

Em estado estável existem no máximo `feature/` e `feature.__previous__/`.
`.feature.retiring` e `.mes=NN.feature-staging-*` só existem durante a
transação e não são snapshots servidos.
"""

from __future__ import annotations

import logging
import shutil
import time
import uuid
from pathlib import Path

from pipelines.gold.feature_contract import FEATURE_REPORT_FILE, FEATURE_SERVING_PARQUET_NAMES
from pipelines.gold.publication import is_valid_gold_competencia_dir

FEATURE_DIR_NAME = "feature"
FEATURE_PREVIOUS_DIR_NAME = "feature.__previous__"
FEATURE_RETIRING_DIR_NAME = ".feature.retiring"
FEATURE_COMMIT_ATTEMPTS = 8
FEATURE_COMMIT_WAIT_S = 0.02

logger = logging.getLogger("gold.feature.publication")


class FeaturePublicationError(Exception):
    """A Feature não foi publicada, ou a restauração do par anterior falhou."""


def feature_dir(territorial_dir: Path) -> Path:
    return territorial_dir / FEATURE_DIR_NAME


def feature_previous_dir(territorial_dir: Path) -> Path:
    return territorial_dir / FEATURE_PREVIOUS_DIR_NAME


def feature_retiring_dir(territorial_dir: Path) -> Path:
    return territorial_dir / FEATURE_RETIRING_DIR_NAME


def feature_staging_dir(territorial_dir: Path) -> Path:
    """Staging irmão da competência, no mesmo volume, invisível aos readers."""
    token = uuid.uuid4().hex[:12]
    return territorial_dir.parent / f".{territorial_dir.name}.feature-staging-{token}"


def is_canonical_territorial_dirname(name: str) -> bool:
    return len(name) == 6 and name.startswith("mes=") and name[4:].isdigit()


def is_valid_feature_snapshot(directory: Path) -> bool:
    """Snapshot servível: os doze Parquets dos endpoints existem.

    `feature_gold_report.json` faz parte do snapshot publicado, mas não é
    requisito de leitura. A API não consulta o relatório.
    """
    if not directory.is_dir():
        return False
    return all(
        (directory / f"{name}.parquet").is_file() for name in FEATURE_SERVING_PARQUET_NAMES
    )


def is_publishable_feature_staging(directory: Path) -> bool:
    return is_valid_feature_snapshot(directory) and (directory / FEATURE_REPORT_FILE).is_file()


def readable_feature_table_dir(month_dir: Path) -> Path:
    """Pasta de onde uma tabela Feature é lida.

    Com `feature/` ou `feature.__previous__/` presentes, o root flat deixa de
    ser fonte. Se nenhum dos dois snapshots é válido, o retorno aponta para
    `feature/` e a leitura não reaproveita o arquivo antigo.
    """
    selected = resolve_feature_gold_dir(month_dir)
    if selected is not None:
        return selected
    if feature_dir(month_dir).exists() or feature_previous_dir(month_dir).exists():
        return feature_dir(month_dir)
    return month_dir


def resolve_feature_gold_dir(month_dir: Path) -> Path | None:
    """Escolhe um único snapshot Feature dentro da pasta territorial já escolhida.

    Ordem: `feature/` válido, senão `feature.__previous__/` válido. O layout
    flat no root de `mes=NN` só entra se a competência ainda não tem nenhum
    dos dois diretórios. Arquivos flat não se misturam com um snapshot novo.
    """
    current = feature_dir(month_dir)
    previous = feature_previous_dir(month_dir)
    if is_valid_feature_snapshot(current):
        return current
    if is_valid_feature_snapshot(previous):
        return previous
    if current.exists() or previous.exists():
        return None
    if is_valid_feature_snapshot(month_dir):
        return month_dir
    return None


def feature_parquet_signature(feature_directory: Path) -> tuple[tuple[str, int, int], ...]:
    """Identidade dos Parquets de um snapshot, para o request detectar troca."""
    items: list[tuple[str, int, int]] = []
    for name in FEATURE_SERVING_PARQUET_NAMES:
        path = feature_directory / f"{name}.parquet"
        try:
            stat = path.stat()
            items.append((name, stat.st_mtime_ns, stat.st_size))
        except OSError:
            items.append((name, -1, -1))
    return tuple(items)


def preferred_table_signature(directory: Path, stems: tuple[str, ...]) -> tuple[tuple[str, int, int], ...]:
    items: list[tuple[str, int, int]] = []
    for stem in stems:
        parquet_path = directory / f"{stem}.parquet"
        path = parquet_path if parquet_path.is_file() else directory / f"{stem}.csv"
        try:
            stat = path.stat()
            items.append((path.name, stat.st_mtime_ns, stat.st_size))
        except OSError:
            items.append((path.name, -1, -1))
    return tuple(items)


def file_stat_signature(path: Path) -> tuple[int, int]:
    try:
        stat = path.stat()
    except OSError:
        return (-1, -1)
    return (stat.st_mtime_ns, stat.st_size)


def _before_promoting_feature_directory() -> None:
    """Fronteira entre deslocar a Feature corrente e promover o staging."""


def _restore_feature_publication(
    final_dir: Path,
    previous_dir: Path,
    retiring_dir: Path,
) -> None:
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
        raise FeaturePublicationError(
            "Estado inesperado ao restaurar a Feature. "
            f"Corrente existe={final_dir.exists()} em {final_dir}. "
            f"Anterior existe={previous_dir.exists()} em {previous_dir}. "
            f"Temporário existe em {retiring_dir}."
        )


def _stabilize_feature_dirs(
    final_dir: Path,
    previous_dir: Path,
    retiring_dir: Path,
) -> None:
    if not retiring_dir.exists():
        return
    if final_dir.exists() and previous_dir.exists():
        try:
            shutil.rmtree(retiring_dir)
        except OSError as exc:
            raise FeaturePublicationError(
                "A Feature anterior já está publicada e a previous também. "
                f"Não foi possível apagar o temporário {retiring_dir}."
            ) from exc
        return
    try:
        _restore_feature_publication(final_dir, previous_dir, retiring_dir)
    except Exception as exc:
        message = (
            "Não foi possível devolver o swap interrompido da Feature "
            "antes de uma nova publicação. "
            f"Corrente existe={final_dir.exists()} em {final_dir}. "
            f"Anterior existe={previous_dir.exists()} em {previous_dir}. "
            f"Temporário existe={retiring_dir.exists()} em {retiring_dir}. "
            f"Falha: {exc}."
        )
        logger.error(message)
        raise FeaturePublicationError(message) from exc


def publish_feature_directory(staging_dir: Path, final_dir: Path) -> None:
    """Promove o staging Feature e conserva exatamente uma geração anterior.

    O commit é `staging.replace(feature)`. Antes disso, falha de publicação
    restaura o par anterior. Depois disso, falha só na remoção de
    `.feature.retiring` emite warning e mantém a Feature nova.
    """
    if not is_canonical_territorial_dirname(final_dir.parent.name):
        raise FeaturePublicationError(
            "A Feature só pode ser publicada dentro do canônico territorial "
            f"mes=NN. Destino recusado: {final_dir}."
        )
    previous_dir = feature_previous_dir(final_dir.parent)
    retiring_dir = feature_retiring_dir(final_dir.parent)
    _stabilize_feature_dirs(final_dir, previous_dir, retiring_dir)

    try:
        if previous_dir.exists() and not final_dir.exists():
            previous_dir.replace(final_dir)
        if previous_dir.exists():
            previous_dir.replace(retiring_dir)
        if final_dir.exists():
            final_dir.replace(previous_dir)
        _before_promoting_feature_directory()
        staging_dir.replace(final_dir)
    except Exception as exc:
        try:
            _restore_feature_publication(final_dir, previous_dir, retiring_dir)
        except Exception as recovery_exc:
            message = (
                "A publicação da Feature falhou e a restauração também falhou. "
                f"Corrente existe={final_dir.exists()} em {final_dir}. "
                f"Anterior existe={previous_dir.exists()} em {previous_dir}. "
                f"Temporário existe={retiring_dir.exists()} em {retiring_dir}. "
                f"Falha da publicação: {exc}. "
                f"Falha da restauração: {recovery_exc}."
            )
            logger.error(message)
            raise FeaturePublicationError(message) from recovery_exc
        raise

    if not retiring_dir.exists():
        return
    try:
        shutil.rmtree(retiring_dir)
    except OSError as exc:
        logger.warning(
            "feature_publication_cleanup_warning | competencia=%s | retiring=%s | erro=%s: %s",
            final_dir.parent.name,
            retiring_dir,
            type(exc).__name__,
            exc,
        )


def wait_for_feature_commit_target(territorial_dir: Path) -> Path:
    """Espera o canônico territorial voltar a ser válido.

    Durante o swap da Gold o nome `mes=NN` fica ausente. A Feature não
    publica em `mes=NN.__previous__`.
    """
    if not is_canonical_territorial_dirname(territorial_dir.name):
        raise FeaturePublicationError(
            "Commit da Feature recusou um destino que não é o canônico "
            f"territorial: {territorial_dir}."
        )
    last_state = "ausente"
    for _attempt in range(FEATURE_COMMIT_ATTEMPTS):
        if territorial_dir.is_dir() and is_valid_gold_competencia_dir(territorial_dir):
            return territorial_dir
        last_state = "ausente" if not territorial_dir.is_dir() else "inválida"
        time.sleep(FEATURE_COMMIT_WAIT_S)
    raise FeaturePublicationError(
        "Commit da Feature não encontrou a competência territorial canônica "
        f"{territorial_dir.name} ({last_state}). "
        "A publicação não usou a previous territorial."
    )


def commit_feature_directory(staging_dir: Path, territorial_dir: Path) -> Path:
    """Resolve de novo o canônico e só então promove o staging."""
    target = wait_for_feature_commit_target(territorial_dir)
    publish_feature_directory(staging_dir, feature_dir(target))
    return feature_dir(target)
