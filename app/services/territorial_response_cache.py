"""Cache em memória das respostas territoriais já processadas.

Guarda o payload final de overview e feature. Um HIT devolve uma cópia e não
relê Gold, não normaliza, não ordena, não monta ranking, série nem comparação.

Política:

- HIT: a chave lógica e o fingerprint atual encontram uma entrada. A resposta
  é uma cópia. Nenhum cálculo roda.
- MISS: não havia entrada para esse fingerprint. O cálculo roda uma vez e o
  payload é guardado.
- EVICTION: ao passar de `max_entries`, a entrada menos recentemente usada sai.
- INVALIDATION: o fingerprint é o conjunto `path|mtime_ns|size` das Golds
  dependentes. Arquivo substituído muda o fingerprint, a entrada antiga é
  descartada e o próximo pedido é MISS. Não há TTL.

Duas requisições simultâneas da mesma chave compartilham um único cálculo.
Chaves diferentes seguem em paralelo. Falha não é armazenada.
"""

from __future__ import annotations

from collections import OrderedDict, deque
from collections.abc import Callable, Sequence
from copy import deepcopy
from dataclasses import dataclass
import hashlib
import logging
import os
from pathlib import Path
import threading
import time
from typing import Any, Literal

from app.core.config import API_LOG_FILE
from app.core.logging import setup_logger

logger = setup_logger("api.territorial_cache", API_LOG_FILE)

TERRITORIAL_RESPONSE_CACHE_MAX_ENTRIES = 128
CacheOutcome = Literal["hit", "miss", "coalesced"]


def file_signature(path: Path) -> str:
    """Assinatura de arquivo no mesmo formato do LRU de DataFrames."""
    try:
        stat = path.stat()
        return f"{path.resolve()}|{stat.st_mtime_ns}|{stat.st_size}"
    except OSError:
        return f"{path.resolve()}|missing"


def gold_source_fingerprint(paths: Sequence[Path]) -> str:
    """Fingerprint determinístico das Golds de uma resposta."""
    signatures = sorted({file_signature(path) for path in paths})
    payload = "\n".join(signatures).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _max_entries_from_env() -> int:
    raw = os.getenv(
        "TERRITORIAL_RESPONSE_CACHE_MAX_ENTRIES",
        str(TERRITORIAL_RESPONSE_CACHE_MAX_ENTRIES),
    )
    try:
        value = int(raw)
    except ValueError:
        return TERRITORIAL_RESPONSE_CACHE_MAX_ENTRIES
    if value < 1:
        return TERRITORIAL_RESPONSE_CACHE_MAX_ENTRIES
    return value


@dataclass(frozen=True)
class CacheDecision:
    outcome: CacheOutcome
    lookup_ms: float
    compute_ms: float
    entries: int
    inflight: int


class _Flight:
    def __init__(self) -> None:
        self.event = threading.Event()
        self.value: Any = None
        self.error: BaseException | None = None


class TerritorialResponseCache:
    def __init__(self, max_entries: int | None = None) -> None:
        self.max_entries = max_entries if max_entries is not None else _max_entries_from_env()
        self._lock = threading.Lock()
        self._entries: OrderedDict[str, Any] = OrderedDict()
        self._inflight: dict[str, _Flight] = {}
        self._generation = 0
        self._hits = 0
        self._misses = 0
        self._coalesced = 0
        self._evictions = 0
        self._invalidations = 0
        self._local = threading.local()
        self._recent: deque[CacheDecision] = deque(maxlen=32)

    def stats(self) -> dict[str, int]:
        with self._lock:
            return {
                "hits": self._hits,
                "misses": self._misses,
                "coalesced": self._coalesced,
                "evictions": self._evictions,
                "invalidations": self._invalidations,
                "entries": len(self._entries),
                "inflight": len(self._inflight),
                "max_entries": self.max_entries,
            }

    def last_decision(self) -> CacheDecision | None:
        decision = getattr(self._local, "decision", None)
        return decision if isinstance(decision, CacheDecision) else None

    def recent_decisions(self) -> list[CacheDecision]:
        with self._lock:
            return list(self._recent)

    def clear(self) -> int:
        """Descarta entradas. Um cálculo já em andamento não é reaproveitado."""
        with self._lock:
            removed = len(self._entries)
            self._entries.clear()
            self._recent.clear()
            self._generation += 1
            entries = len(self._entries)
            inflight = len(self._inflight)
        logger.info(
            "response_cache_clear | response_cache_entries=%s | response_cache_inflight=%s | removed=%s",
            entries,
            inflight,
            removed,
        )
        return removed

    def serve(
        self,
        logical_key: str,
        sources: Sequence[Path],
        compute: Callable[[], Any],
    ) -> Any:
        started = time.perf_counter()
        fingerprint = gold_source_fingerprint(sources)
        storage_key = f"{logical_key}|{fingerprint}"
        decision, value = self._lookup_or_compute(
            logical_key,
            storage_key,
            compute,
            started,
        )
        self._local.decision = decision
        with self._lock:
            self._recent.append(decision)
        return value

    def _lookup_or_compute(
        self,
        logical_key: str,
        storage_key: str,
        compute: Callable[[], Any],
        started: float,
    ) -> tuple[CacheDecision, Any]:
        with self._lock:
            self._invalidate_other_fingerprints(logical_key, storage_key)
            cached = self._entries.get(storage_key)
            if cached is not None:
                self._entries.move_to_end(storage_key)
                self._hits += 1
                entries = len(self._entries)
                inflight = len(self._inflight)
                snapshot = cached
            else:
                snapshot = None
                flight = self._inflight.get(storage_key)
                if flight is None:
                    flight = _Flight()
                    self._inflight[storage_key] = flight
                    self._misses += 1
                    owner = True
                else:
                    self._coalesced += 1
                    owner = False
                generation = self._generation

        if snapshot is not None:
            value = deepcopy(snapshot)
            decision = CacheDecision(
                "hit",
                (time.perf_counter() - started) * 1000,
                0.0,
                entries,
                inflight,
            )
            self._log("hit", logical_key, decision, coalesced=False)
            return decision, value

        if not owner:
            flight.event.wait()
            with self._lock:
                entries = len(self._entries)
                inflight = len(self._inflight)
            if flight.error is not None:
                raise flight.error
            decision = CacheDecision(
                "coalesced",
                (time.perf_counter() - started) * 1000,
                0.0,
                entries,
                inflight,
            )
            self._log("hit", logical_key, decision, coalesced=True)
            return decision, deepcopy(flight.value)

        compute_started = time.perf_counter()
        try:
            produced = compute()
            stored = deepcopy(produced)
        except BaseException as exc:
            with self._lock:
                self._inflight.pop(storage_key, None)
                flight.error = exc
                flight.event.set()
            raise
        compute_ms = (time.perf_counter() - compute_started) * 1000
        with self._lock:
            current = self._inflight.get(storage_key)
            if current is flight:
                self._inflight.pop(storage_key, None)
            if generation == self._generation:
                self._entries[storage_key] = stored
                self._entries.move_to_end(storage_key)
                self._evict_overflow()
            flight.value = stored
            flight.event.set()
            entries = len(self._entries)
            inflight = len(self._inflight)
        decision = CacheDecision(
            "miss",
            (compute_started - started) * 1000,
            compute_ms,
            entries,
            inflight,
        )
        self._log("miss", logical_key, decision, coalesced=False)
        return decision, deepcopy(stored)

    def _invalidate_other_fingerprints(self, logical_key: str, storage_key: str) -> None:
        prefix = f"{logical_key}|"
        stale = [key for key in self._entries if key.startswith(prefix) and key != storage_key]
        if not stale:
            return
        for key in stale:
            del self._entries[key]
        self._invalidations += len(stale)
        logger.info(
            "response_cache_invalidation | logical=%s | dropped=%s | response_cache_entries=%s | response_cache_inflight=%s",
            logical_key,
            len(stale),
            len(self._entries),
            len(self._inflight),
        )

    def _evict_overflow(self) -> None:
        while len(self._entries) > self.max_entries:
            evicted, _value = self._entries.popitem(last=False)
            self._evictions += 1
            logger.info(
                "response_cache_eviction | logical=%s | response_cache_entries=%s | response_cache_inflight=%s",
                evicted.rsplit("|", 1)[0],
                len(self._entries),
                len(self._inflight),
            )

    def _log(
        self,
        kind: Literal["hit", "miss"],
        logical_key: str,
        decision: CacheDecision,
        *,
        coalesced: bool,
    ) -> None:
        production = os.getenv("APP_ENV", "local") == "production"
        level = logging.DEBUG if production else logging.INFO
        logger.log(
            level,
            "response_cache_%s | logical=%s | lookup_ms=%.3f | compute_ms=%.3f | coalesced=%s | response_cache_entries=%s | response_cache_inflight=%s",
            kind,
            logical_key,
            decision.lookup_ms,
            decision.compute_ms,
            int(coalesced),
            decision.entries,
            decision.inflight,
        )


territorial_response_cache = TerritorialResponseCache()


def clear_territorial_response_cache() -> int:
    return territorial_response_cache.clear()
