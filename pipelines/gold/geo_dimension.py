"""Dimensão geográfica estável a partir dos GeoJSONs canônicos.

A malha de UF é nacional. A malha municipal versionada no projeto cobre o
Paraná (`municipios_pr.geojson`). `municipios_rmc.geojson` é subconjunto e não
entra na dimensão, para não duplicar município. A malha de apresentação do
Brasil também não é fonte: ela repete propriedades, mas não é a malha canônica.

O join com a Silver usa somente igualdade exata de `uf_norm` e, no município,
`(uf_norm, municipio_norm)`. Não há matching fuzzy. Chave ambígua não recebe
código.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import pandas as pd

from app.core.config import PROJECT_ROOT
from pipelines.gold.aggregate_indicators import normalizar_texto_upper_sem_acento
from pipelines.gold.feature_contract import (
    MUNICIPALITY_IDENTITY_COLUMNS,
    UF_IDENTITY_COLUMNS,
)

UF_GEOJSON_NAME = "ufs.geojson"
MUNICIPALITY_GEOJSON_NAME = "municipios_pr.geojson"

MATCH_UNMATCHED = "sem_correspondencia_geojson"
MATCH_AMBIGUOUS = "correspondencia_ambigua"
MATCH_MATCHED = "correspondencia_exata"


@dataclass(frozen=True)
class GeographicDimension:
    uf: pd.DataFrame
    municipality: pd.DataFrame
    ambiguous_uf_norms: frozenset[str]
    ambiguous_municipality_keys: frozenset[tuple[str, str]]
    uf_source: str
    municipality_source: str


def canonical_geojson_path(filename: str) -> Path:
    candidates = (
        PROJECT_ROOT / "data-lake" / "geo" / "processed" / filename,
        PROJECT_ROOT / "dashboard" / "public" / "geo" / filename,
    )
    for path in candidates:
        if path.is_file():
            return path
    searched = ", ".join(str(path) for path in candidates)
    raise FileNotFoundError(f"GeoJSON canônico não encontrado ({filename}). Procurado em: {searched}")


def read_geojson_properties(path: Path) -> pd.DataFrame:
    payload = json.loads(path.read_text(encoding="utf-8"))
    features = payload.get("features") or []
    rows = []
    for feature in features:
        if not isinstance(feature, dict):
            continue
        properties = feature.get("properties") or {}
        if isinstance(properties, dict):
            rows.append(properties)
    if not rows:
        raise ValueError(f"GeoJSON sem propriedades: {path}")
    return pd.DataFrame(rows)


def _as_code(value: object) -> str | None:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    try:
        if pd.isna(value):
            return None
    except TypeError:
        pass
    text = str(value).strip()
    if text.endswith(".0"):
        text = text[:-2]
    if not text or text.lower() in {"nan", "<na>", "none"}:
        return None
    return text


def _code_series(series: pd.Series) -> pd.Series:
    return series.map(_as_code).astype("string")


def _norm_token(value: object) -> str | None:
    normalized = normalizar_texto_upper_sem_acento(value)
    if normalized is pd.NA or normalized is None:
        return None
    try:
        if pd.isna(normalized):
            return None
    except TypeError:
        pass
    text = str(normalized).strip()
    return text or None


def _ambiguous_norms(frame: pd.DataFrame, column: str) -> frozenset[str]:
    counts = frame.groupby(column, dropna=False).size()
    return frozenset(str(key) for key, size in counts.items() if size > 1 and key is not pd.NA)


def load_geographic_dimension(
    *,
    uf_geojson: Path | None = None,
    municipality_geojson: Path | None = None,
) -> GeographicDimension:
    uf_path = uf_geojson or canonical_geojson_path(UF_GEOJSON_NAME)
    municipality_path = municipality_geojson or canonical_geojson_path(MUNICIPALITY_GEOJSON_NAME)
    uf_raw = read_geojson_properties(uf_path)
    municipality_raw = read_geojson_properties(municipality_path)
    uf_dimension, ambiguous_ufs = _build_uf_dimension(uf_raw)
    municipality_dimension, ambiguous_keys = _build_municipality_dimension(
        municipality_raw,
        uf_dimension,
    )
    return GeographicDimension(
        uf=uf_dimension,
        municipality=municipality_dimension,
        ambiguous_uf_norms=ambiguous_ufs,
        ambiguous_municipality_keys=ambiguous_keys,
        uf_source=str(uf_path),
        municipality_source=str(municipality_path),
    )


def _build_uf_dimension(raw: pd.DataFrame) -> tuple[pd.DataFrame, frozenset[str]]:
    missing = [column for column in UF_IDENTITY_COLUMNS if column not in raw.columns]
    if missing:
        raise ValueError(
            "GeoJSON de UF sem colunas de identidade: " + ", ".join(missing)
        )

    frame = pd.DataFrame(
        {
            "cod_uf": _code_series(raw["cod_uf"]),
            "uf_sigla": raw["uf_sigla"].map(
                lambda value: None if _norm_token(value) is None else str(value).strip().upper()
            ),
            "uf": raw["uf"].astype("string").str.strip(),
            "uf_norm": raw["uf_norm"].map(_norm_token),
        }
    )
    frame["uf_sigla"] = frame["uf_sigla"].astype("string")
    frame["uf_norm"] = frame["uf_norm"].astype("string")
    frame = frame.dropna(subset=["uf_norm"]).reset_index(drop=True)

    ambiguous = set(_ambiguous_norms(frame, "uf_norm"))
    ambiguous.update(_ambiguous_norms(frame, "uf_sigla"))
    ambiguous.update(_ambiguous_norms(frame, "cod_uf"))
    # Um código repetido torna ambíguas todas as UFs que compartilham o código
    # e também a sigla/norma envolvida.
    if frame["cod_uf"].duplicated().any():
        ambiguous.update(
            frame.loc[frame["cod_uf"].duplicated(keep=False), "uf_norm"].dropna().astype(str)
        )
    if frame["uf_sigla"].duplicated().any():
        ambiguous.update(
            frame.loc[frame["uf_sigla"].duplicated(keep=False), "uf_norm"].dropna().astype(str)
        )

    unambiguous = frame.loc[~frame["uf_norm"].isin(ambiguous)].copy()
    unambiguous = unambiguous.drop_duplicates(subset=["uf_norm"]).reset_index(drop=True)
    return unambiguous.loc[:, list(UF_IDENTITY_COLUMNS)], frozenset(ambiguous)


def _build_municipality_dimension(
    raw: pd.DataFrame,
    uf_dimension: pd.DataFrame,
) -> tuple[pd.DataFrame, frozenset[tuple[str, str]]]:
    required = ["cod_municipio", "municipio", "municipio_norm", "uf", "uf_sigla", "uf_norm"]
    missing = [column for column in required if column not in raw.columns]
    if missing:
        raise ValueError(
            "GeoJSON municipal sem colunas de identidade: " + ", ".join(missing)
        )

    frame = pd.DataFrame(
        {
            "cod_municipio": _code_series(raw["cod_municipio"]),
            "municipio": raw["municipio"].astype("string").str.strip(),
            "municipio_norm": raw["municipio_norm"].map(_norm_token),
            "uf": raw["uf"].astype("string").str.strip(),
            "uf_sigla": raw["uf_sigla"].map(
                lambda value: None if _norm_token(value) is None else str(value).strip().upper()
            ),
            "uf_norm": raw["uf_norm"].map(_norm_token),
        }
    )
    frame["uf_sigla"] = frame["uf_sigla"].astype("string")
    frame["municipio_norm"] = frame["municipio_norm"].astype("string")
    frame["uf_norm"] = frame["uf_norm"].astype("string")

    uf_lookup = uf_dimension.loc[:, ["uf_sigla", "cod_uf", "uf_norm", "uf"]].rename(
        columns={"uf_norm": "uf_norm_dim", "uf": "uf_dim"}
    )
    frame = frame.merge(uf_lookup, on="uf_sigla", how="left", validate="many_to_one")
    frame = frame.dropna(subset=["uf_norm", "municipio_norm"]).reset_index(drop=True)

    keys = list(zip(frame["uf_norm"].astype(str), frame["municipio_norm"].astype(str)))
    frame["_key"] = keys
    key_counts = frame.groupby("_key").size()
    ambiguous_keys = {key for key, size in key_counts.items() if size > 1}

    duplicated_codes = set(
        frame.loc[frame["cod_municipio"].duplicated(keep=False), "_key"].tolist()
    )
    ambiguous_keys.update(duplicated_codes)

    inconsistent_parent = frame["uf_norm"].astype(str) != frame["uf_norm_dim"].astype(str)
    missing_parent = frame["cod_uf"].isna() | frame["uf_norm_dim"].isna()
    ambiguous_keys.update(frame.loc[inconsistent_parent | missing_parent, "_key"].tolist())

    # Nome canônico da UF vem da dimensão de UF quando o par é consistente.
    consistent = ~(inconsistent_parent | missing_parent)
    frame.loc[consistent, "uf"] = frame.loc[consistent, "uf_dim"]

    unambiguous = frame.loc[~frame["_key"].isin(ambiguous_keys)].copy()
    unambiguous = unambiguous.drop_duplicates(subset=["_key"]).reset_index(drop=True)
    unambiguous["cod_uf"] = _code_series(unambiguous["cod_uf"])
    return (
        unambiguous.loc[:, list(MUNICIPALITY_IDENTITY_COLUMNS)],
        frozenset((str(uf_norm), str(municipio_norm)) for uf_norm, municipio_norm in ambiguous_keys),
    )
