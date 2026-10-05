import unicodedata
import geopandas as gpd
from sqlalchemy import create_engine, text

from app.core.config import (
    POSTGRES_HOST,
    POSTGRES_PORT,
    POSTGRES_DB,
    POSTGRES_USER,
    POSTGRES_PASSWORD,
)
from app.core.logging import setup_logger
from app.core.config import PIPELINE_LOG_FILE

logger = setup_logger("load_geo", PIPELINE_LOG_FILE)


def normalizar_texto(txt: str) -> str:
    if txt is None:
        return None
    txt = str(txt).strip().upper()
    txt = ''.join(
        c for c in unicodedata.normalize('NFKD', txt)
        if not unicodedata.combining(c)
    )
    txt = ' '.join(txt.split())
    return txt


def load_municipios_geometria(
    shapefile_path: str,
    coluna_nome: str,
    coluna_uf: str,
    coluna_codigo: str = None
):
    logger.info(f"[GEO] Lendo arquivo geográfico: {shapefile_path}")

    gdf = gpd.read_file(shapefile_path)

    if gdf.crs is None:
        raise ValueError("A malha geográfica está sem CRS definido.")

    gdf = gdf.to_crs(epsg=4326)

    gdf["nome_municipio"] = gdf[coluna_nome].astype(str).str.strip()
    gdf["uf"] = gdf[coluna_uf].astype(str).str.strip()

    gdf["nome_municipio_norm"] = gdf["nome_municipio"].apply(normalizar_texto)
    gdf["uf_norm"] = gdf["uf"].apply(normalizar_texto)

    if coluna_codigo and coluna_codigo in gdf.columns:
        gdf["cod_municipio"] = gdf[coluna_codigo].astype(str).str.strip()
    else:
        gdf["cod_municipio"] = None

    gdf = gdf[
        [
            "cod_municipio",
            "nome_municipio",
            "uf",
            "nome_municipio_norm",
            "uf_norm",
            "geometry",
        ]
    ].copy()

    gdf = gdf.rename_geometry("geom")

    engine = create_engine(
        f"postgresql+psycopg2://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}"
    )

    with engine.begin() as conn:
        conn.execute(text("TRUNCATE TABLE geo.municipios;"))

    gdf.to_postgis(
        name="municipios",
        con=engine,
        schema="geo",
        if_exists="append",
        index=False,
    )

    logger.info(f"[GEO] Carga concluída | linhas={len(gdf)}")