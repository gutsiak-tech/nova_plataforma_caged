"""Painel analítico de uma UF ou de um município.

A API pública identifica UF pela sigla e município pelo código IBGE de 7 dígitos.
A tradução para `uf_norm` / `municipio_norm` fica nesta camada. Salário, setor,
ocupação e perfis saem das Golds de feature. Os KPIs saem de `tabela_uf` e
`tabela_municipio`. A série municipal continua nessas competências publicadas,
mas lê só a linha do município: a tabela de movimento não traz código IBGE.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

import pandas as pd

from app.core.config import GOLD_DIR
from app.services.gold_service import (
    GoldMonthRef,
    list_valid_competencias,
    read_gold_table,
)
from pipelines.gold.aggregate_indicators import (
    apply_unique_mapping,
    normalizar_texto_upper_sem_acento,
)
from pipelines.gold.feature_contract import (
    FEATURE_RANKING_DEFAULT_LIMIT,
    MOVEMENT_METRIC_COLUMNS,
)

FeatureLevel = Literal["uf", "municipality"]
SalaryMovement = Literal["admissao", "desligamento"]

FEATURE_GEO_DIR = GOLD_DIR / "geo"
BRASIL_PARENT = {"level": "brasil", "id": "BR", "name": "Brasil"}


class FeatureNotFoundError(LookupError):
    def __init__(self, message: str, details: dict[str, Any]) -> None:
        super().__init__(message)
        self.details = details


class FeatureAssetMissingError(FileNotFoundError):
    def __init__(self, message: str, details: dict[str, Any]) -> None:
        super().__init__(message)
        self.details = details


class FeatureDataError(RuntimeError):
    def __init__(self, message: str, details: dict[str, Any]) -> None:
        super().__init__(message)
        self.details = details


def _missing(value: object) -> bool:
    if value is None:
        return True
    try:
        return bool(pd.isna(value))
    except TypeError:
        return False


def _count(value: object) -> int | float | None:
    if _missing(value):
        return None
    number = float(value)  # type: ignore[arg-type]
    if number.is_integer():
        return int(number)
    return number


def _decimal(value: object) -> float | None:
    if _missing(value):
        return None
    return float(value)  # type: ignore[arg-type]


def _cache_token(path: Path) -> str:
    stat = path.stat()
    return f"{path.resolve()}|{stat.st_mtime_ns}|{stat.st_size}"


@lru_cache(maxsize=4)
def _read_cached_parquet(cache_token: str, path_str: str) -> pd.DataFrame:
    del cache_token
    return pd.read_parquet(path_str)


def _read_dimension(filename: str) -> pd.DataFrame:
    path = FEATURE_GEO_DIR / filename
    if not path.is_file():
        raise FeatureAssetMissingError(
            "Dimensão geográfica não materializada.",
            {"expected_path": path.as_posix()},
        )
    return _read_cached_parquet(_cache_token(path), str(path.resolve()))


def _records(frame: pd.DataFrame, columns: list[str]) -> list[dict[str, Any]]:
    present = [column for column in columns if column in frame.columns]
    rows: list[dict[str, Any]] = []
    for raw in frame.loc[:, present].itertuples(index=False, name=None):
        row: dict[str, Any] = {}
        for column, value in zip(present, raw):
            if column in {"salario_medio", "salario_mediano"}:
                row[column] = _decimal(value)
            elif column in MOVEMENT_METRIC_COLUMNS or column == "n_salarios_validos":
                row[column] = _count(value)
            elif _missing(value):
                row[column] = None
            else:
                row[column] = value.item() if hasattr(value, "item") else value
        rows.append(row)
    return rows


def _kpis(row: pd.Series) -> dict[str, Any]:
    return {column: _count(row[column]) for column in MOVEMENT_METRIC_COLUMNS}


def _movement_hit(frame: pd.DataFrame, mask: pd.Series, *, label: str) -> pd.Series | None:
    hit = frame.loc[mask]
    if hit.empty:
        return None
    if len(hit) > 1:
        raise FeatureDataError(
            f"Mais de uma linha de movimento para {label}.",
            {"matches": int(len(hit))},
        )
    return hit.iloc[0]


def _normalized(series: pd.Series) -> pd.Series:
    return apply_unique_mapping(series, normalizar_texto_upper_sem_acento)


def _uf_movement_row(month: GoldMonthRef, uf_norm: str) -> pd.Series | None:
    table = read_gold_table(month, base_name="tabela_uf", scope="br")
    if "uf" not in table.columns:
        raise FeatureDataError("tabela_uf sem coluna uf.", {"columns": list(table.columns)})
    mask = _normalized(table["uf"]).eq(uf_norm)
    return _movement_hit(table, mask, label=f"UF {uf_norm}")


def _municipality_movement_row(
    month: GoldMonthRef,
    uf_norm: str,
    municipio_norm: str,
) -> pd.Series | None:
    table = read_gold_table(month, base_name="tabela_municipio", scope="br")
    required = {"uf", "municipio"}
    if not required.issubset(table.columns):
        raise FeatureDataError(
            "tabela_municipio sem colunas territoriais.",
            {"columns": list(table.columns)},
        )
    mask = _normalized(table["uf"]).eq(uf_norm) & _normalized(table["municipio"]).eq(municipio_norm)
    return _movement_hit(table, mask, label=f"município {municipio_norm}/{uf_norm}")


def _read_feature_slice(month: GoldMonthRef, table_name: str, column: str, value: str) -> pd.DataFrame:
    path = month.dir / f"{table_name}.parquet"
    if not path.is_file():
        raise FeatureAssetMissingError(
            "Tabela Gold de feature não encontrada.",
            {
                "ano": month.ano,
                "mes": month.mes,
                "table": table_name,
                "expected_path": path.as_posix(),
            },
        )
    return pd.read_parquet(path, filters=[(column, "==", value)])


def _brasil_kpis(month: GoldMonthRef) -> dict[str, Any]:
    table = read_gold_table(month, base_name="tabela_resumo", scope="br")
    if table.empty:
        raise FeatureDataError("tabela_resumo vazia.", {"ano": month.ano, "mes": month.mes})
    return _kpis(table.iloc[0])


def _ratio(part: object, whole: object) -> float | None:
    part_number = _count(part)
    whole_number = _count(whole)
    if part_number is None or whole_number is None or whole_number == 0:
        return None
    return float(part_number) / float(whole_number)


def saldo_participation(part: object, whole: object) -> tuple[float | None, str]:
    """Participação no saldo só quando o quociente é uma parcela do território pai.

    Denominador zero não vira participação. Sinais opostos também não: o filho
    não é uma fração interpretável do saldo pai.
    """
    part_number = _count(part)
    whole_number = _count(whole)
    if part_number is None or whole_number is None or whole_number == 0:
        return None, "denominador_zero"
    if part_number == 0:
        return 0.0, "participacao"
    if (part_number > 0) != (whole_number > 0):
        return None, "sinais_opostos"
    return float(part_number) / float(whole_number), "participacao"


def _comparison_parent(level: str, identifier: str, name: str, child: dict[str, Any], parent: dict[str, Any]) -> dict[str, Any]:
    saldo, saldo_rule = saldo_participation(child["saldo"], parent["saldo"])
    return {
        "level": level,
        "id": identifier,
        "name": name,
        "kpis": parent,
        "participation": {
            "admissoes": _ratio(child["admissoes"], parent["admissoes"]),
            "desligamentos": _ratio(child["desligamentos"], parent["desligamentos"]),
            "saldo": saldo,
            "saldo_interpretation": saldo_rule,
        },
    }


def _timeseries_uf(uf_norm: str) -> list[dict[str, Any]]:
    series: list[dict[str, Any]] = []
    for month_info in list_valid_competencias():
        month = GoldMonthRef(ano=int(month_info["ano"]), mes=int(month_info["mes"]))
        row = _uf_movement_row(month, uf_norm)
        if row is None:
            continue
        series.append({"ano": month.ano, "mes": month.mes, **_kpis(row)})
    return series


def _municipality_series_path(month: GoldMonthRef) -> Path:
    return month.dir / "tabela_municipio.parquet"


def _municipality_series_row(
    month: GoldMonthRef,
    uf: str,
    municipio: str,
    uf_norm: str,
    municipio_norm: str,
) -> pd.Series | None:
    """Um ponto da série municipal.

    `tabela_municipio` não tem código IBGE. O código da requisição já foi
    resolvido em `dim_municipio`; `uf` e `municipio` são os textos canônicos
    dessa linha e são a chave gravada na tabela de movimento. A leitura pede
    só essa linha ao Parquet. Competência sem a linha continua ausente.
    """
    path = _municipality_series_path(month)
    if not path.is_file():
        return _municipality_movement_row(month, uf_norm, municipio_norm)
    frame = pd.read_parquet(
        path,
        columns=["uf", "municipio", *MOVEMENT_METRIC_COLUMNS],
        filters=[("uf", "==", uf), ("municipio", "==", municipio)],
    )
    if frame.empty:
        return None
    if len(frame) > 1:
        raise FeatureDataError(
            f"Mais de uma linha de movimento para município {municipio_norm}/{uf_norm}.",
            {"matches": int(len(frame))},
        )
    return frame.iloc[0]


def _timeseries_municipality(
    uf: str,
    municipio: str,
    uf_norm: str,
    municipio_norm: str,
) -> list[dict[str, Any]]:
    series: list[dict[str, Any]] = []
    for month_info in list_valid_competencias():
        month = GoldMonthRef(ano=int(month_info["ano"]), mes=int(month_info["mes"]))
        row = _municipality_series_row(month, uf, municipio, uf_norm, municipio_norm)
        if row is None:
            continue
        series.append({"ano": month.ano, "mes": month.mes, **_kpis(row)})
    return series


def _rankings(frame: pd.DataFrame, dimension: str, limit: int) -> dict[str, Any]:
    columns = [dimension, *MOVEMENT_METRIC_COLUMNS]

    def top(sort_by: str) -> list[dict[str, Any]]:
        if frame.empty or sort_by not in frame.columns:
            return []
        ordered = frame.sort_values(sort_by, ascending=False, kind="mergesort")
        return _records(ordered.head(limit), columns)

    return {
        "limit": int(limit),
        "total": int(len(frame)),
        "by_saldo": top("saldo"),
        "by_admissoes": top("admissoes"),
        "by_desligamentos": top("desligamentos"),
    }


def _profiles(month: GoldMonthRef, level_column: str, level_value: str) -> dict[str, list[dict[str, Any]]]:
    specs = {
        "sexo": ("perfil_sexo", "sexo"),
        "faixa_etaria": ("perfil_faixa_etaria", "faixa_etaria"),
        "graudeinstrucao": ("perfil_graudeinstrucao", "graudeinstrucao"),
    }
    prefix = "tabela_uf" if level_column == "uf_sigla" else "tabela_municipio"
    payload: dict[str, list[dict[str, Any]]] = {}
    for key, (suffix, column) in specs.items():
        frame = _read_feature_slice(month, f"{prefix}_{suffix}", level_column, level_value)
        payload[key] = _records(frame, [column, *MOVEMENT_METRIC_COLUMNS])
    return payload


def _salary(
    month: GoldMonthRef,
    table_name: str,
    column: str,
    value: str,
    movimento: SalaryMovement,
) -> dict[str, Any] | None:
    frame = _read_feature_slice(month, table_name, column, value)
    if frame.empty or "movimento" not in frame.columns:
        return None
    selected = frame.loc[frame["movimento"].astype("string").str.lower().eq(movimento)]
    if selected.empty:
        return None
    if len(selected) > 1:
        raise FeatureDataError(
            "Mais de uma linha salarial para a feature.",
            {"table": table_name, "matches": int(len(selected))},
        )
    row = selected.iloc[0]
    return {
        "movimento": movimento,
        "n_salarios_validos": _count(row["n_salarios_validos"]),
        "salario_medio": _decimal(row["salario_medio"]),
        "salario_mediano": _decimal(row["salario_mediano"]),
    }


def _text(value: object) -> str | None:
    if _missing(value):
        return None
    return str(value)


def get_uf_feature(
    uf_sigla: str,
    month: GoldMonthRef,
    *,
    movimento: SalaryMovement = "admissao",
    limit: int = FEATURE_RANKING_DEFAULT_LIMIT,
) -> dict[str, Any]:
    sigla = uf_sigla.strip().upper()
    dimension = _read_dimension("dim_uf.parquet")
    hit = dimension.loc[dimension["uf_sigla"].astype("string").str.upper().eq(sigla)]
    if hit.empty:
        raise FeatureNotFoundError(
            "UF não encontrada na dimensão geográfica.",
            {"level": "uf", "id": sigla},
        )
    if len(hit) > 1:
        raise FeatureDataError("Sigla de UF duplicada na dimensão.", {"id": sigla})
    identity_row = hit.iloc[0]
    uf_norm = str(identity_row["uf_norm"])
    movement = _uf_movement_row(month, uf_norm)
    if movement is None:
        raise FeatureNotFoundError(
            "UF sem movimento na competência.",
            {"level": "uf", "id": sigla, "ano": month.ano, "mes": month.mes},
        )
    child = _kpis(movement)
    brasil = _brasil_kpis(month)
    return {
        "identity": {
            "level": "uf",
            "id": sigla,
            "name": _text(identity_row["uf"]),
            "cod_uf": _text(identity_row["cod_uf"]),
            "uf_sigla": sigla,
            "uf": _text(identity_row["uf"]),
            "uf_norm": uf_norm,
            "parent": BRASIL_PARENT,
        },
        "period": {"ano": month.ano, "mes": month.mes},
        "kpis": child,
        "salary": _salary(month, "tabela_uf_salario", "uf_sigla", sigla, movimento),
        "sectors": _rankings(
            _read_feature_slice(month, "tabela_uf_setor", "uf_sigla", sigla),
            "secao",
            limit,
        ),
        "occupations": _rankings(
            _read_feature_slice(month, "tabela_uf_ocupacao", "uf_sigla", sigla),
            "cbo2002ocupacao",
            limit,
        ),
        "profiles": _profiles(month, "uf_sigla", sigla),
        "timeseries": _timeseries_uf(uf_norm),
        "comparison": {
            "parents": [
                _comparison_parent("brasil", "BR", "Brasil", child, brasil),
            ]
        },
    }


def get_municipality_feature(
    cod_municipio: str,
    month: GoldMonthRef,
    *,
    movimento: SalaryMovement = "admissao",
    limit: int = FEATURE_RANKING_DEFAULT_LIMIT,
) -> dict[str, Any]:
    code = cod_municipio.strip()
    dimension = _read_dimension("dim_municipio.parquet")
    hit = dimension.loc[dimension["cod_municipio"].astype("string").eq(code)]
    if hit.empty:
        raise FeatureNotFoundError(
            "Município não encontrado na dimensão geográfica.",
            {"level": "municipality", "id": code},
        )
    if len(hit) > 1:
        raise FeatureDataError("Código de município duplicado na dimensão.", {"id": code})
    identity_row = hit.iloc[0]
    uf_norm = str(identity_row["uf_norm"])
    municipio_norm = str(identity_row["municipio_norm"])
    uf_sigla = str(identity_row["uf_sigla"])
    movement = _municipality_movement_row(month, uf_norm, municipio_norm)
    if movement is None:
        raise FeatureNotFoundError(
            "Município sem movimento na competência.",
            {"level": "municipality", "id": code, "ano": month.ano, "mes": month.mes},
        )
    child = _kpis(movement)
    parent_movement = _uf_movement_row(month, uf_norm)
    if parent_movement is None:
        raise FeatureDataError(
            "UF do município sem movimento na competência.",
            {"cod_municipio": code, "uf_sigla": uf_sigla},
        )
    parent_kpis = _kpis(parent_movement)
    brasil = _brasil_kpis(month)
    return {
        "identity": {
            "level": "municipality",
            "id": code,
            "name": _text(identity_row["municipio"]),
            "cod_municipio": code,
            "municipio": _text(identity_row["municipio"]),
            "municipio_norm": municipio_norm,
            "cod_uf": _text(identity_row["cod_uf"]),
            "uf_sigla": uf_sigla,
            "uf": _text(identity_row["uf"]),
            "uf_norm": uf_norm,
            "parent": {
                "level": "uf",
                "id": uf_sigla,
                "name": _text(identity_row["uf"]),
            },
        },
        "period": {"ano": month.ano, "mes": month.mes},
        "kpis": child,
        "salary": _salary(month, "tabela_municipio_salario", "cod_municipio", code, movimento),
        "sectors": _rankings(
            _read_feature_slice(month, "tabela_municipio_setor", "cod_municipio", code),
            "secao",
            limit,
        ),
        "occupations": _rankings(
            _read_feature_slice(month, "tabela_municipio_ocupacao", "cod_municipio", code),
            "cbo2002ocupacao",
            limit,
        ),
        "profiles": _profiles(month, "cod_municipio", code),
        "timeseries": _timeseries_municipality(
            str(identity_row["uf"]),
            str(identity_row["municipio"]),
            uf_norm,
            municipio_norm,
        ),
        "comparison": {
            "parents": [
                _comparison_parent(
                    "uf",
                    uf_sigla,
                    _text(identity_row["uf"]) or uf_sigla,
                    child,
                    parent_kpis,
                ),
                _comparison_parent("brasil", "BR", "Brasil", child, brasil),
            ]
        },
    }
