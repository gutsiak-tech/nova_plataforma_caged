"""Aquecimento em background dos panoramas de admissão.

A aplicação fica disponível e, em seguida, uma thread percorre as competências
que a própria API considera publicadas. Para cada uma calcula, em sequência,
o overview de admissão de Brasil, Paraná e RMC. O resultado entra no
TerritorialResponseCache pelo mesmo `overview` dos endpoints. Não há segundo
cache e não há chamada HTTP.

O cálculo não começa no import deste módulo. Quem dispara é o startup da
aplicação. A suíte define `TERRITORIAL_WARM_ON_STARTUP=0` para não calcular
panoramas durante os testes; sem a variável, o warm fica ligado.

Republicação da Gold não dispara outro aquecimento. Não há watcher nem
releitura de mtime. O fingerprint atual continua valendo: arquivo novo, chave
nova, entrada antiga descartada, próximo pedido em MISS. O warm só volta a
rodar no próximo startup.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass
import os
from pathlib import Path
import threading
import time
from typing import Any

from app.core.config import API_LOG_FILE
from app.core.logging import setup_logger
from app.services.gold_service import list_valid_competencias
from app.services.territorial_response_cache import territorial_response_cache

logger = setup_logger("api.territorial_warm", API_LOG_FILE)
logger.propagate = False

WARM_SCOPES: tuple[str, str, str] = ("br", "pr", "rmc")
WARM_MOVEMENT = "admissao"
SHUTDOWN_JOIN_TIMEOUT_S = 2.0

OverviewLoader = Callable[[int, int, str], Any]


@dataclass(frozen=True)
class WarmResult:
    competencias: int
    expected: int
    attempted: int
    succeeded: int
    failed: int
    duration_ms: float
    entries: int


def warm_enabled() -> bool:
    return os.getenv("TERRITORIAL_WARM_ON_STARTUP", "1") != "0"


def warm_overview(ano: int, mes: int, scope: str) -> Any:
    """Mesma função do endpoint, sem passar pela rede."""
    from app.api.routes_gold import overview

    return overview(scope=scope, ano=ano, mes=mes, movimento=WARM_MOVEMENT)


def warm_plan(competencias: Sequence[dict[str, Any]]) -> list[tuple[int, int, str]]:
    """Competências na ordem da API, e dentro de cada uma br, pr, rmc."""
    plan: list[tuple[int, int, str]] = []
    for item in competencias:
        ano = int(item["ano"])
        mes = int(item["mes"])
        for scope in WARM_SCOPES:
            plan.append((ano, mes, scope))
    return plan


def warm_admission_overviews(
    *,
    stop: threading.Event | None = None,
    load: OverviewLoader | None = None,
    gold_root: Path | None = None,
    competencias: Sequence[dict[str, Any]] | None = None,
) -> WarmResult:
    """Calcula os panoramas de admissão, uma chave por vez.

    Falha de uma chave é registrada e as seguintes continuam. Exceção não fica
    armazenada: quem grava é o cache, e ele só guarda cálculo bem-sucedido.
    """
    started = time.perf_counter()
    compute = load or warm_overview
    try:
        items = (
            list(competencias)
            if competencias is not None
            else list_valid_competencias(gold_root=gold_root)
        )
    except Exception as exc:
        logger.info("territorial_warm_start | competencias=0 | chaves=0")
        _log_key_error(None, None, None, exc)
        return _finish(started, competencias=0, expected=0, attempted=0, succeeded=0, failed=1)

    plan = warm_plan(items)
    logger.info(
        "territorial_warm_start | competencias=%s | chaves=%s",
        len(items),
        len(plan),
    )
    attempted = 0
    succeeded = 0
    failed = 0
    for ano, mes, scope in plan:
        if stop is not None and stop.is_set():
            break
        attempted += 1
        try:
            compute(ano, mes, scope)
        except Exception as exc:
            failed += 1
            _log_key_error(ano, mes, scope, exc)
            continue
        succeeded += 1
    return _finish(
        started,
        competencias=len(items),
        expected=len(plan),
        attempted=attempted,
        succeeded=succeeded,
        failed=failed,
    )


def _log_key_error(ano: int | None, mes: int | None, scope: str | None, exc: Exception) -> None:
    logger.error(
        "territorial_warm_error | ano=%s | mes=%s | scope=%s | erro=%s: %s",
        "-" if ano is None else ano,
        "-" if mes is None else mes,
        scope or "-",
        type(exc).__name__,
        exc,
    )


def _finish(
    started: float,
    *,
    competencias: int,
    expected: int,
    attempted: int,
    succeeded: int,
    failed: int,
) -> WarmResult:
    entries = int(territorial_response_cache.stats()["entries"])
    result = WarmResult(
        competencias=competencias,
        expected=expected,
        attempted=attempted,
        succeeded=succeeded,
        failed=failed,
        duration_ms=(time.perf_counter() - started) * 1000,
        entries=entries,
    )
    logger.info(
        "territorial_warm_complete | tentadas=%s | sucesso=%s | falhas=%s | duracao_ms=%.1f | response_cache_entries=%s",
        result.attempted,
        result.succeeded,
        result.failed,
        result.duration_ms,
        result.entries,
    )
    return result


class TerritorialWarmController:
    """Uma thread de warm por processo. O startup só a dispara."""

    def __init__(self) -> None:
        self._guard = threading.Lock()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self.last_result: WarmResult | None = None

    def start(self) -> None:
        with self._guard:
            if self._thread is not None and self._thread.is_alive():
                return
            self._stop = threading.Event()
            stop = self._stop
            self._thread = threading.Thread(
                target=self._run,
                args=(stop,),
                name="territorial-warm",
                daemon=False,
            )
            self._thread.start()

    def _run(self, stop: threading.Event) -> None:
        try:
            self.last_result = warm_admission_overviews(stop=stop)
        except Exception as exc:
            _log_key_error(None, None, None, exc)

    def stop(self, timeout: float = SHUTDOWN_JOIN_TIMEOUT_S) -> None:
        """Pede parada e espera a chave em andamento, com teto de espera.

        A chave que já começou termina: interrompê-la no meio deixaria o
        single-flight sem resposta. As chaves seguintes não começam. Se a
        chave atual passar do teto, o shutdown segue e a thread encerra
        sozinha ao fim dessa chave.
        """
        self._stop.set()
        with self._guard:
            thread = self._thread
        if thread is None or not thread.is_alive():
            return
        if thread is threading.current_thread():
            return
        thread.join(timeout)

    def wait(self, timeout: float | None = None) -> None:
        with self._guard:
            thread = self._thread
        if thread is None or thread is threading.current_thread():
            return
        thread.join(timeout)


controller = TerritorialWarmController()


def start() -> None:
    controller.start()


def stop(timeout: float = SHUTDOWN_JOIN_TIMEOUT_S) -> None:
    controller.stop(timeout=timeout)
