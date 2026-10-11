"""Arquivos Gold dos quais overview e feature realmente dependem.

A lista acompanha as leituras de `overview`, `get_uf_feature` e
`get_municipality_feature`. O fingerprint usa `path|mtime_ns|size`.
"""

from __future__ import annotations

from pathlib import Path

from app.core.config import GOLD_CAGED_DIR
from app.services.feature_gold_service import FEATURE_GEO_DIR
from app.services.gold_service import (
    GoldMonthRef,
    Scope,
    _parse_partition_dir,
    validate_ano,
)
from pipelines.gold.publication import (
    is_valid_gold_competencia_dir,
    previous_gold_competencia_dir,
)

_PROFILE_TABLES = (
    "tabela_perfil_sexo",
    "tabela_perfil_faixa_etaria",
    "tabela_perfil_graudeinstrucao",
    "tabela_perfil_sexo_faixa_etaria",
    "tabela_perfil_sexo_instrucao",
    "tabela_perfil_faixa_etaria_instrucao",
)

_SALARY_PROFILE_TABLES = (
    "tabela_perfil_sexo_salario",
    "tabela_perfil_faixa_etaria_salario",
    "tabela_perfil_graudeinstrucao_salario",
    "tabela_perfil_sexo_faixa_etaria_salario",
    "tabela_perfil_sexo_instrucao_salario",
    "tabela_perfil_faixa_etaria_instrucao_salario",
)

_UF_FEATURE_SLICES = (
    "tabela_uf_salario",
    "tabela_uf_setor",
    "tabela_uf_ocupacao",
    "tabela_uf_perfil_sexo",
    "tabela_uf_perfil_faixa_etaria",
    "tabela_uf_perfil_graudeinstrucao",
)

_MUNICIPALITY_FEATURE_SLICES = (
    "tabela_municipio_salario",
    "tabela_municipio_setor",
    "tabela_municipio_ocupacao",
    "tabela_municipio_perfil_sexo",
    "tabela_municipio_perfil_faixa_etaria",
    "tabela_municipio_perfil_graudeinstrucao",
)


def gold_table_input_path(month: GoldMonthRef, base_name: str, scope: Scope) -> Path:
    """Arquivo que `read_gold_table` abre: Parquet se existir, senão CSV."""
    return _table_path(month.dir, base_name, scope)


def _table_path(month_dir: Path, base_name: str, scope: Scope) -> Path:
    suffix = "" if scope == "br" else f"_{scope}"
    stem = f"{base_name}{suffix}"
    parquet_path = month_dir / f"{stem}.parquet"
    if parquet_path.is_file():
        return parquet_path
    return month_dir / f"{stem}.csv"


def _feature_slice_path(month_dir: Path, table_name: str) -> Path:
    return month_dir / f"{table_name}.parquet"


def _published_month_dirs() -> list[Path]:
    """Uma validação por competência existente, a mesma regra da série."""
    if not GOLD_CAGED_DIR.is_dir():
        return []
    found: list[tuple[int, int, Path]] = []
    for ano_dir in GOLD_CAGED_DIR.glob("ano=*"):
        if not ano_dir.is_dir():
            continue
        ano = _parse_partition_dir(ano_dir.name, "ano")
        if ano is None:
            continue
        try:
            validate_ano(ano)
        except ValueError:
            continue
        for mes in range(1, 13):
            canonical = ano_dir / f"mes={mes:02d}"
            previous = previous_gold_competencia_dir(canonical)
            if not canonical.exists() and not previous.exists():
                continue
            if is_valid_gold_competencia_dir(canonical):
                found.append((ano, mes, canonical))
            elif is_valid_gold_competencia_dir(previous):
                found.append((ano, mes, previous))
    found.sort()
    return [path for _ano, _mes, path in found]


def overview_logical_key(scope: Scope, ano: int, mes: int, movimento: str) -> str:
    return f"overview|{scope}|{ano}|{mes}|{movimento}"


def feature_logical_key(
    level: str,
    feature_id: str,
    ano: int,
    mes: int,
    movimento: str,
    limit: int,
) -> str:
    return f"feature|{level}|{feature_id}|{ano}|{mes}|{movimento}|{limit}"


def overview_sources(scope: Scope, month: GoldMonthRef) -> list[Path]:
    month_dir = month.dir
    tables: list[tuple[str, Scope]] = []
    if scope == "br":
        tables.append(("tabela_resumo", "br"))
    if scope == "pr":
        tables.append(("tabela_uf", "br"))
    tables.append(("tabela_resumo_salario", scope))
    if scope == "br":
        tables.append(("tabela_uf", "br"))
    tables.append(("tabela_municipio", scope))
    tables.append(("tabela_setor", scope))
    tables.append(("tabela_ocupacao", scope))
    tables.extend((name, scope) for name in _PROFILE_TABLES)
    tables.extend((name, scope) for name in _SALARY_PROFILE_TABLES)
    return [_table_path(month_dir, name, table_scope) for name, table_scope in tables]


def uf_feature_sources(month: GoldMonthRef) -> list[Path]:
    month_dir = month.dir
    paths = [
        FEATURE_GEO_DIR / "dim_uf.parquet",
        _table_path(month_dir, "tabela_resumo", "br"),
    ]
    paths.extend(_feature_slice_path(month_dir, table) for table in _UF_FEATURE_SLICES)
    paths.extend(_table_path(directory, "tabela_uf", "br") for directory in _published_month_dirs())
    return paths


def municipality_feature_sources(month: GoldMonthRef) -> list[Path]:
    month_dir = month.dir
    paths = [
        FEATURE_GEO_DIR / "dim_municipio.parquet",
        _table_path(month_dir, "tabela_resumo", "br"),
        _table_path(month_dir, "tabela_uf", "br"),
    ]
    paths.extend(
        _feature_slice_path(month_dir, table) for table in _MUNICIPALITY_FEATURE_SLICES
    )
    paths.extend(
        _table_path(directory, "tabela_municipio", "br")
        for directory in _published_month_dirs()
    )
    return paths
