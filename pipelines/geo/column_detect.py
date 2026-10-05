from __future__ import annotations

from typing import Iterable

UF_NAME_CANDIDATES = ("NM_UF", "NM_ESTADO", "NOME_UF", "nome_uf", "uf", "nome", "NAME")
UF_SIGLA_CANDIDATES = ("SIGLA_UF", "UF", "SIGLA", "sigla_uf", "sigla")
UF_CODE_CANDIDATES = ("CD_UF", "CD_GEOCUF", "cod_uf", "COD_UF")

MUN_NAME_CANDIDATES = (
    "NM_MUN",
    "NM_MUNICIP",
    "NOME_MUNICIPIO",
    "nome_municipio",
    "municipio",
    "nome",
    "NAME",
)
MUN_CODE_CANDIDATES = ("CD_MUN", "CD_GEOCMU", "cod_municipio", "codigo_ibge", "COD_MUN")
MUN_UF_SIGLA_CANDIDATES = UF_SIGLA_CANDIDATES
MUN_UF_NAME_CANDIDATES = UF_NAME_CANDIDATES


def _find_column(columns: Iterable[str], candidates: tuple[str, ...]) -> str | None:
    available = {col: col for col in columns}
    lower_map = {col.lower(): col for col in columns}
    for candidate in candidates:
        if candidate in available:
            return candidate
        match = lower_map.get(candidate.lower())
        if match:
            return match
    return None


def require_column(
    columns: Iterable[str],
    candidates: tuple[str, ...],
    label: str,
) -> str:
    found = _find_column(columns, candidates)
    if found is None:
        cols = ", ".join(sorted(columns))
        raise ValueError(
            f"Coluna obrigatória não encontrada para {label}. "
            f"Candidatos: {', '.join(candidates)}. Colunas disponíveis: {cols}"
        )
    return found


def find_optional_column(columns: Iterable[str], candidates: tuple[str, ...]) -> str | None:
    return _find_column(columns, candidates)
