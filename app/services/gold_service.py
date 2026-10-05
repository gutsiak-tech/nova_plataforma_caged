from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
import hashlib
from pathlib import Path
from typing import Any, Literal

import pandas as pd

from app.core.config import (
    API_LOG_FILE,
    DEFAULT_ANO,
    DEFAULT_COMPETENCIA_CONFIG_ERROR,
    DEFAULT_MES,
    GOLD_CAGED_DIR,
    PROJECT_ROOT,
)
from app.core.logging import setup_logger
from app.services.gold_catalog_service import CURRENT_PIPELINE_TABLES
from pipelines.gold.publication import (
    canonical_gold_competencia_dir,
    is_valid_gold_competencia_dir,
    select_published_gold_competencia_dir,
)

logger = setup_logger("api.gold", API_LOG_FILE)


Scope = Literal["br", "pr", "rmc"]

# Tabelas geradas apenas no recorte Brasil (sem sufixo _pr/_rmc).
BR_ONLY_TABLES = frozenset({"tabela_resumo"})


def _logical_table_name(table_name: str) -> str:
    for suffix in ("_rmc", "_pr"):
        if table_name.endswith(suffix):
            return table_name[: -len(suffix)]
    return table_name


ALLOWED_GOLD_TABLES = frozenset(
    _logical_table_name(table_name) for table_name in CURRENT_PIPELINE_TABLES
)

ANO_MIN = 2000
ANO_MAX = 2100
MES_MIN = 1
MES_MAX = 12


class InvalidGoldTableError(ValueError):
    """Nome lógico de tabela fora do contrato público da Gold."""


class DefaultCompetenciaError(ValueError):
    """A competência padrão não pode ser resolvida com segurança."""


@dataclass(frozen=True)
class GoldMonthRef:
    ano: int
    mes: int

    @property
    def dir(self) -> Path:
        return select_published_gold_competencia_dir(
            GOLD_CAGED_DIR,
            self.ano,
            self.mes,
        )

def validate_ano(ano: int) -> int:
    if not (ANO_MIN <= ano <= ANO_MAX):
        raise ValueError(
            f"ano inválido: {ano}. Use um valor entre {ANO_MIN} e {ANO_MAX}."
        )
    return ano


def validate_mes(mes: int) -> int:
    if not (MES_MIN <= mes <= MES_MAX):
        raise ValueError(
            f"mes inválido: {mes}. Use um valor entre {MES_MIN} e {MES_MAX}."
        )
    return mes


def resolve_gold_month(ano: int | None = None, mes: int | None = None) -> GoldMonthRef:
    """Resolve parâmetros explícitos ou a competência Gold válida padrão."""
    if ano is not None:
        validate_ano(ano)
    if mes is not None:
        validate_mes(mes)
    if (ano is None) != (mes is None):
        raise ValueError("ano e mes devem ser informados em conjunto.")
    if ano is not None and mes is not None:
        return GoldMonthRef(ano=ano, mes=mes)

    default_month = resolve_default_competencia()
    if default_month is None:
        raise DefaultCompetenciaError(
            "Nenhuma competência Gold válida disponível para uso como padrão."
        )
    return default_month


def _suffix_for_scope(scope: Scope) -> str:
    if scope == "br":
        return ""
    if scope == "pr":
        return "_pr"
    if scope == "rmc":
        return "_rmc"
    raise ValueError(f"Scope inválido: {scope}")


def validate_gold_table_name(base_name: str) -> str:
    if base_name not in ALLOWED_GOLD_TABLES:
        raise InvalidGoldTableError("Tabela Gold inválida.")
    return base_name


def _table_stem(base_name: str, scope: Scope) -> str:
    validate_gold_table_name(base_name)
    suffix = _suffix_for_scope(scope)
    return f"{base_name}{suffix}"


def _csv_path(month: GoldMonthRef, base_name: str, scope: Scope) -> Path:
    """
    base_name: e.g. 'tabela_resumo', 'tabela_setor', 'tabela_perfil_sexo_salario'
    """
    return month.dir / f"{_table_stem(base_name, scope)}.csv"


def _parquet_path(month: GoldMonthRef, base_name: str, scope: Scope) -> Path:
    return month.dir / f"{_table_stem(base_name, scope)}.parquet"


@dataclass(frozen=True)
class GoldTablePaths:
    table_name: str
    csv_path: Path
    parquet_path: Path


def resolve_gold_table_paths(
    month: GoldMonthRef,
    base_name: str,
    scope: Scope,
) -> GoldTablePaths:
    stem = _table_stem(base_name, scope)
    month_dir = month.dir.resolve()
    csv_path = (month.dir / f"{stem}.csv").resolve()
    parquet_path = (month.dir / f"{stem}.parquet").resolve()

    try:
        csv_path.relative_to(month_dir)
        parquet_path.relative_to(month_dir)
    except ValueError as exc:
        raise InvalidGoldTableError("Tabela Gold inválida.") from exc

    return GoldTablePaths(
        table_name=stem,
        csv_path=csv_path,
        parquet_path=parquet_path,
    )


def _cache_key_from_path(path: Path) -> str:
    try:
        st = path.stat()
        return f"{path.resolve()}|{st.st_mtime_ns}|{st.st_size}"
    except OSError:
        return f"{path.resolve()}|missing"


def _cache_key(month: GoldMonthRef, base_name: str, scope: Scope) -> str:
    paths = resolve_gold_table_paths(month, base_name=base_name, scope=scope)
    if paths.parquet_path.is_file():
        return _cache_key_from_path(paths.parquet_path)
    return _cache_key_from_path(paths.csv_path)


@lru_cache(maxsize=256)
def _read_csv_cached(cache_key: str, path_str: str) -> pd.DataFrame:
    return pd.read_csv(path_str)


@lru_cache(maxsize=256)
def _read_parquet_cached(cache_key: str, path_str: str) -> pd.DataFrame:
    return pd.read_parquet(path_str)


def clear_gold_read_cache() -> dict[str, int]:
    """
    Limpa o cache LRU em memória das leituras Parquet/CSV da camada Gold.

    Use após reprocessar a Gold com a API já em execução. Reiniciar o processo
    uvicorn também descarta o cache (estado só existe neste processo).

    A leitura já incorpora mtime/tamanho do arquivo na chave de cache; esta
    função garante dados frescos quando metadados do arquivo não mudam ou em
    rotinas operacionais após o pipeline mensal.
    """
    csv_before = _read_csv_cached.cache_info().currsize
    parquet_before = _read_parquet_cached.cache_info().currsize
    _read_csv_cached.cache_clear()
    _read_parquet_cached.cache_clear()
    cleared = {"csv_entries": csv_before, "parquet_entries": parquet_before}
    logger.info(
        "Gold read cache cleared | csv_entries=%s | parquet_entries=%s",
        csv_before,
        parquet_before,
    )
    return cleared


def _normalize_gold_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """Alinha tipos Parquet/CSV antes da serialização JSON."""
    out = df.copy()
    for col in out.columns:
        series = out[col]
        if isinstance(series.dtype, pd.CategoricalDtype):
            out[col] = series.astype(str)
        elif pd.api.types.is_datetime64_any_dtype(series):
            out[col] = series.astype("object").where(series.notna(), None)
    return out


def is_br_only_table(base_name: str) -> bool:
    return base_name in BR_ONLY_TABLES


def _log_gold_table_loaded(
    source: Literal["parquet", "csv"],
    base_name: str,
    scope: Scope,
    competencia: str,
    path: Path,
) -> None:
    logger.info(
        "Gold table loaded | source=%s | table=%s | scope=%s | competencia=%s | path=%s",
        source,
        base_name,
        scope,
        competencia,
        relative_project_path(path),
    )


def read_gold_table(month: GoldMonthRef, base_name: str, scope: Scope) -> pd.DataFrame:
    """
    Lê tabela Gold preferindo Parquet; faz fallback para CSV se ausente ou ilegível.
    """
    paths = resolve_gold_table_paths(month, base_name=base_name, scope=scope)
    competencia = f"{month.ano}-{month.mes:02d}"

    if paths.parquet_path.is_file():
        try:
            key = _cache_key_from_path(paths.parquet_path)
            digest = hashlib.sha256(key.encode("utf-8")).hexdigest()[:24]
            df = _read_parquet_cached(digest, str(paths.parquet_path.resolve()))
            _log_gold_table_loaded(
                "parquet",
                base_name,
                scope,
                competencia,
                paths.parquet_path,
            )
            return _normalize_gold_dataframe(df)
        except Exception as exc:
            logger.warning(
                "Falha ao ler Parquet Gold; fallback CSV | competencia=%s | table=%s | "
                "scope=%s | parquet=%s | erro=%s",
                competencia,
                base_name,
                scope,
                relative_project_path(paths.parquet_path),
                exc,
            )
    else:
        logger.debug(
            "Parquet Gold ausente; tentando CSV | competencia=%s | table=%s | scope=%s | path=%s",
            competencia,
            base_name,
            scope,
            relative_project_path(paths.parquet_path),
        )

    if paths.csv_path.is_file():
        try:
            key = _cache_key_from_path(paths.csv_path)
            digest = hashlib.sha256(key.encode("utf-8")).hexdigest()[:24]
            df = _read_csv_cached(digest, str(paths.csv_path.resolve()))
            _log_gold_table_loaded(
                "csv",
                base_name,
                scope,
                competencia,
                paths.csv_path,
            )
            return _normalize_gold_dataframe(df)
        except Exception as exc:
            logger.error(
                "Falha ao ler CSV Gold | competencia=%s | table=%s | scope=%s | csv=%s | erro=%s",
                competencia,
                base_name,
                scope,
                relative_project_path(paths.csv_path),
                exc,
            )
            raise

    logger.error(
        "Tabela Gold não encontrada (Parquet nem CSV) | competencia=%s | table=%s | scope=%s | "
        "parquet=%s | csv=%s",
        competencia,
        base_name,
        scope,
        relative_project_path(paths.parquet_path),
        relative_project_path(paths.csv_path),
    )
    raise FileNotFoundError(
        f"Tabela Gold não encontrada: {paths.parquet_path} (nem {paths.csv_path})"
    )


def load_table_csv(month: GoldMonthRef, base_name: str, scope: Scope) -> pd.DataFrame:
    """Compatibilidade retroativa: delega para read_gold_table (Parquet preferencial)."""
    return read_gold_table(month, base_name=base_name, scope=scope)


def dataframe_to_records(
    df: pd.DataFrame,
    *,
    limit: int | None = None,
    offset: int = 0,
    sort_by: str | None = None,
    sort_dir: Literal["asc", "desc"] = "desc",
) -> dict[str, Any]:
    if sort_by:
        if sort_by not in df.columns:
            raise ValueError(f"sort_by inválido: '{sort_by}'. Colunas: {list(df.columns)}")
        ascending = sort_dir == "asc"
        df = df.sort_values(sort_by, ascending=ascending, kind="mergesort")

    total = int(len(df))
    if offset < 0:
        offset = 0
    if limit is None:
        sliced = df.iloc[offset:]
    else:
        sliced = df.iloc[offset : offset + max(0, int(limit))]

    # Normaliza NaN para None para JSON.
    data = sliced.where(pd.notna(sliced), None).to_dict(orient="records")
    return {"total": total, "offset": int(offset), "count": int(len(sliced)), "rows": data}


MESES_PT: dict[int, str] = {
    1: "Janeiro",
    2: "Fevereiro",
    3: "Março",
    4: "Abril",
    5: "Maio",
    6: "Junho",
    7: "Julho",
    8: "Agosto",
    9: "Setembro",
    10: "Outubro",
    11: "Novembro",
    12: "Dezembro",
}


def _parse_partition_dir(name: str, prefix: str) -> int | None:
    if not name.startswith(f"{prefix}="):
        return None
    try:
        return int(name.split("=", 1)[1])
    except ValueError:
        return None


def _relative_gold_path(month_dir: Path) -> str:
    try:
        return month_dir.relative_to(PROJECT_ROOT).as_posix()
    except ValueError:
        return month_dir.as_posix()


def relative_project_path(path: Path) -> str:
    return _relative_gold_path(path)


def _is_valid_competencia_dir(month_dir: Path) -> bool:
    return is_valid_gold_competencia_dir(month_dir)


def list_valid_competencias(
    *,
    gold_root: Path | None = None,
) -> list[dict[str, Any]]:
    """Lista cronologicamente as competências aceitas pela validade Gold central."""
    root = gold_root or GOLD_CAGED_DIR
    if not root.exists():
        return []

    items: list[dict[str, Any]] = []
    for ano_dir in sorted(root.glob("ano=*")):
        if not ano_dir.is_dir():
            continue
        ano = _parse_partition_dir(ano_dir.name, "ano")
        if ano is None:
            continue
        try:
            validate_ano(ano)
        except ValueError:
            continue

        for mes in range(MES_MIN, MES_MAX + 1):
            canonical_dir = canonical_gold_competencia_dir(root, ano, mes)
            month_dir = select_published_gold_competencia_dir(root, ano, mes)
            if not _is_valid_competencia_dir(month_dir):
                continue

            items.append(
                {
                    "ano": ano,
                    "mes": mes,
                    "competencia": f"{ano}-{mes:02d}",
                    "label": f"{MESES_PT[mes]} de {ano}",
                    "path": _relative_gold_path(canonical_dir),
                    "is_default": False,
                }
            )

    items.sort(key=lambda item: (item["ano"], item["mes"]))
    return items


def resolve_default_competencia(
    *,
    items: list[dict[str, Any]] | None = None,
    default_ano: int | None = None,
    default_mes: int | None = None,
    gold_root: Path | None = None,
    use_config_override: bool = True,
) -> GoldMonthRef | None:
    """Resolve override completo ou, quando ausente, a Gold válida mais recente."""
    available = items if items is not None else list_valid_competencias(gold_root=gold_root)

    if default_ano is not None or default_mes is not None:
        if default_ano is None or default_mes is None:
            raise DefaultCompetenciaError(
                "Override de competência incompleto: informe DEFAULT_ANO e DEFAULT_MES."
            )
        override = (validate_ano(default_ano), validate_mes(default_mes))
    elif use_config_override:
        if DEFAULT_COMPETENCIA_CONFIG_ERROR:
            raise DefaultCompetenciaError(DEFAULT_COMPETENCIA_CONFIG_ERROR)
        override = (
            (DEFAULT_ANO, DEFAULT_MES)
            if DEFAULT_ANO is not None and DEFAULT_MES is not None
            else None
        )
    else:
        override = None

    if override is not None:
        match = next(
            (
                item
                for item in available
                if item["ano"] == override[0] and item["mes"] == override[1]
            ),
            None,
        )
        if match is None:
            raise DefaultCompetenciaError(
                "A competência configurada como override não é uma Gold válida disponível."
            )
        return GoldMonthRef(ano=match["ano"], mes=match["mes"])

    if not available:
        return None
    latest = max(available, key=lambda item: (item["ano"], item["mes"]))
    return GoldMonthRef(ano=latest["ano"], mes=latest["mes"])


def list_available_competencias(
    *,
    default_ano: int | None = None,
    default_mes: int | None = None,
    gold_root: Path | None = None,
    use_config_override: bool = True,
) -> list[dict[str, Any]]:
    """Lista Gold válida e marca a competência padrão pela política institucional."""
    items = list_valid_competencias(gold_root=gold_root)
    default_month = resolve_default_competencia(
        items=items,
        default_ano=default_ano,
        default_mes=default_mes,
        use_config_override=use_config_override,
    )
    if default_month is not None:
        for item in items:
            item["is_default"] = (
                item["ano"] == default_month.ano and item["mes"] == default_month.mes
            )

    return items


def get_competencias_payload(
    *,
    default_ano: int | None = None,
    default_mes: int | None = None,
    gold_root: Path | None = None,
    use_config_override: bool = True,
) -> dict[str, Any]:
    items = list_available_competencias(
        default_ano=default_ano,
        default_mes=default_mes,
        gold_root=gold_root,
        use_config_override=use_config_override,
    )
    default_item = next((item for item in items if item["is_default"]), None)
    default = None
    if default_item is not None:
        default = {
            "ano": default_item["ano"],
            "mes": default_item["mes"],
            "competencia": default_item["competencia"],
            "label": default_item["label"],
        }

    api_items = [
        {
            "ano": item["ano"],
            "mes": item["mes"],
            "competencia": item["competencia"],
            "label": item["label"],
        }
        for item in items
    ]
    return {"default": default, "items": api_items}


def get_available_tables_for_month(month: GoldMonthRef) -> list[str]:
    if not month.dir.exists():
        return []
    # Retornamos os "base names" sem sufixo e sem extensão.
    base = []
    for p in month.dir.glob("*.csv"):
        name = p.stem
        if name.endswith("_pr"):
            name = name[: -len("_pr")]
        elif name.endswith("_rmc"):
            name = name[: -len("_rmc")]
        if name not in base:
            base.append(name)
    return sorted(base)


def competencia_is_available(month: GoldMonthRef) -> bool:
    return _is_valid_competencia_dir(month.dir)


def gold_month_relative_path(month: GoldMonthRef) -> str:
    return _relative_gold_path(month.dir)


def get_table_csv_path(month: GoldMonthRef, base_name: str, scope: Scope) -> Path:
    return resolve_gold_table_paths(month, base_name=base_name, scope=scope).csv_path


def get_table_parquet_path(month: GoldMonthRef, base_name: str, scope: Scope) -> Path:
    return resolve_gold_table_paths(month, base_name=base_name, scope=scope).parquet_path


class CompetenciaNotFoundError(FileNotFoundError):
    def __init__(self, month: GoldMonthRef) -> None:
        self.month = month
        super().__init__(
            f"Competência Gold não encontrada: {month.ano}-{month.mes:02d}"
        )


def ensure_competencia_available(month: GoldMonthRef) -> None:
    if competencia_is_available(month):
        return
    raise CompetenciaNotFoundError(month)

