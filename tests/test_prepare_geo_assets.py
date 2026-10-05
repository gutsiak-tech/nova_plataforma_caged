from __future__ import annotations

import geopandas as gpd
import pytest
from shapely.geometry import Polygon

from pipelines.geo.column_detect import find_optional_column, require_column
from pipelines.geo.prepare_geo_assets import _filter_rmc, _prepare_municipios_gdf, _prepare_ufs_gdf
from pipelines.geo.text_normalize import normalizar_texto_upper_sem_acento
from pipelines.gold.aggregate_indicators import MUNICIPIOS_RMC


def test_normalizar_texto_upper_sem_acento():
    assert normalizar_texto_upper_sem_acento("São José dos Pinhais") == "SAO JOSE DOS PINHAIS"
    assert normalizar_texto_upper_sem_acento("  Curitiba  ") == "CURITIBA"
    assert normalizar_texto_upper_sem_acento(None) is None


def test_require_column_detects_ibge_style_names():
    cols = ["CD_MUN", "NM_MUN", "SIGLA_UF", "geometry"]
    assert require_column(cols, ("NM_MUN", "municipio"), "município") == "NM_MUN"
    assert find_optional_column(cols, ("CD_MUN", "cod_municipio")) == "CD_MUN"


def test_filter_rmc_from_synthetic_municipios():
    rows = []
    for name in sorted(MUNICIPIOS_RMC):
        rows.append(
            {
                "municipio": name.title(),
                "municipio_norm": name,
                "uf": "Paraná",
                "uf_sigla": "PR",
                "uf_norm": "PARANA",
                "cod_municipio": None,
                "geometry": Polygon([(0, 0), (1, 0), (1, 1), (0, 1)]),
            }
        )
    gdf = gpd.GeoDataFrame(rows, geometry="geometry", crs="EPSG:4326")
    gdf_rmc, missing = _filter_rmc(gdf)
    assert len(gdf_rmc) == len(MUNICIPIOS_RMC)
    assert missing == []


def test_prepare_ufs_gdf_from_synthetic_columns():
    gdf = gpd.GeoDataFrame(
        {
            "NM_UF": ["Paraná", "São Paulo"],
            "SIGLA_UF": ["PR", "SP"],
            "CD_UF": ["41", "35"],
            "geometry": [
                Polygon([(0, 0), (1, 0), (1, 1), (0, 1)]),
                Polygon([(2, 0), (3, 0), (3, 1), (2, 1)]),
            ],
        },
        crs="EPSG:4326",
    )
    out, cols = _prepare_ufs_gdf(gdf)
    assert len(out) == 2
    assert out.iloc[0]["uf_norm"] == "PARANA"
    assert cols["uf_name_col"] == "NM_UF"


def test_prepare_municipios_gdf_requires_municipio_column():
    gdf = gpd.GeoDataFrame(
        {
            "NM_MUN": ["Curitiba"],
            "SIGLA_UF": ["PR"],
            "CD_MUN": ["4106902"],
            "geometry": [Polygon([(0, 0), (1, 0), (1, 1), (0, 1)])],
        },
        crs="EPSG:4326",
    )
    out, _ = _prepare_municipios_gdf(gdf)
    assert out.iloc[0]["municipio_norm"] == "CURITIBA"
    assert out.iloc[0]["cod_municipio"] == "4106902"


def test_prepare_municipios_gdf_missing_column_raises():
    gdf = gpd.GeoDataFrame(
        {"SIGLA_UF": ["PR"], "geometry": [Polygon([(0, 0), (1, 0), (1, 1), (0, 1)])]},
        crs="EPSG:4326",
    )
    with pytest.raises(ValueError, match="Coluna obrigatória"):
        _prepare_municipios_gdf(gdf)
