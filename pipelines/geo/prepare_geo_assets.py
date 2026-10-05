from __future__ import annotations

import argparse
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

from pipelines.geo.column_detect import (
    MUN_CODE_CANDIDATES,
    MUN_NAME_CANDIDATES,
    MUN_UF_NAME_CANDIDATES,
    MUN_UF_SIGLA_CANDIDATES,
    UF_CODE_CANDIDATES,
    UF_NAME_CANDIDATES,
    UF_SIGLA_CANDIDATES,
    find_optional_column,
    require_column,
)
from pipelines.geo.text_normalize import normalizar_texto, normalizar_texto_upper_sem_acento
from pipelines.gold.aggregate_indicators import MUNICIPIOS_RMC

TARGET_CRS = "EPSG:4326"
EXPECTED_RMC_COUNT = len(MUNICIPIOS_RMC)
OUTPUT_FILES = ("ufs.geojson", "municipios_pr.geojson", "municipios_rmc.geojson")

UF_SIGLA_TO_NOME: dict[str, str] = {
    "AC": "Acre",
    "AL": "Alagoas",
    "AP": "Amapá",
    "AM": "Amazonas",
    "BA": "Bahia",
    "CE": "Ceará",
    "DF": "Distrito Federal",
    "ES": "Espírito Santo",
    "GO": "Goiás",
    "MA": "Maranhão",
    "MT": "Mato Grosso",
    "MS": "Mato Grosso do Sul",
    "MG": "Minas Gerais",
    "PA": "Pará",
    "PB": "Paraíba",
    "PR": "Paraná",
    "PE": "Pernambuco",
    "PI": "Piauí",
    "RJ": "Rio de Janeiro",
    "RN": "Rio Grande do Norte",
    "RS": "Rio Grande do Sul",
    "RO": "Rondônia",
    "RR": "Roraima",
    "SC": "Santa Catarina",
    "SP": "São Paulo",
    "SE": "Sergipe",
    "TO": "Tocantins",
}


def _import_geopandas():
    try:
        import geopandas as gpd
    except ImportError as exc:
        raise SystemExit(
            "GeoPandas não está instalado. Instale as dependências do projeto: pip install -r requirements.txt"
        ) from exc
    return gpd


def _read_shapefile(path: Path, label: str):
    gpd = _import_geopandas()
    if not path.is_file():
        raise SystemExit(f"Arquivo shapefile não encontrado ({label}): {path}")
    gdf = gpd.read_file(path)
    if gdf.empty:
        raise SystemExit(f"Shapefile vazio ({label}): {path}")
    if gdf.geometry.isna().all():
        raise SystemExit(f"Shapefile sem geometrias válidas ({label}): {path}")
    if gdf.crs is None:
        raise SystemExit(f"Shapefile sem CRS definido ({label}): {path}")
    if str(gdf.crs) != TARGET_CRS:
        gdf = gdf.to_crs(TARGET_CRS)
    return gdf


def _simplify(gdf, tolerance: float):
    if tolerance <= 0:
        return gdf
    simplified = gdf.copy()
    simplified["geometry"] = simplified.geometry.simplify(tolerance, preserve_topology=True)
    return simplified


def _as_string(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text or text.lower() == "nan":
        return None
    if text.endswith(".0"):
        text = text[:-2]
    return text


def _resolve_uf_name(row: dict, uf_name_col: str | None, uf_sigla_col: str | None) -> str | None:
    if uf_name_col and row.get(uf_name_col) is not None:
        return normalizar_texto(row.get(uf_name_col))
    if uf_sigla_col:
        sigla = _as_string(row.get(uf_sigla_col))
        if sigla:
            return UF_SIGLA_TO_NOME.get(sigla.upper(), sigla)
    return None


def _prepare_ufs_gdf(gdf):
    uf_name_col = require_column(gdf.columns, UF_NAME_CANDIDATES, "nome da UF")
    uf_sigla_col = find_optional_column(gdf.columns, UF_SIGLA_CANDIDATES)
    uf_code_col = find_optional_column(gdf.columns, UF_CODE_CANDIDATES)

    rows = []
    for _, row in gdf.iterrows():
        uf = normalizar_texto(row[uf_name_col])
        uf_sigla = _as_string(row[uf_sigla_col]) if uf_sigla_col else None
        if uf_sigla:
            uf_sigla = uf_sigla.upper()
        uf_norm = normalizar_texto_upper_sem_acento(uf)
        cod_uf = _as_string(row[uf_code_col]) if uf_code_col else None
        rows.append(
            {
                "uf": uf,
                "uf_sigla": uf_sigla,
                "uf_norm": uf_norm,
                "cod_uf": cod_uf,
                "geometry": row.geometry,
            }
        )

    gpd = _import_geopandas()
    out = gpd.GeoDataFrame(rows, geometry="geometry", crs=TARGET_CRS)
    return out, {
        "uf_name_col": uf_name_col,
        "uf_sigla_col": uf_sigla_col,
        "uf_code_col": uf_code_col,
    }


def _prepare_municipios_gdf(gdf):
    mun_name_col = require_column(gdf.columns, MUN_NAME_CANDIDATES, "nome do município")
    mun_code_col = find_optional_column(gdf.columns, MUN_CODE_CANDIDATES)
    uf_name_col = find_optional_column(gdf.columns, MUN_UF_NAME_CANDIDATES)
    uf_sigla_col = find_optional_column(gdf.columns, MUN_UF_SIGLA_CANDIDATES)

    rows = []
    for _, row in gdf.iterrows():
        municipio = normalizar_texto(row[mun_name_col])
        municipio_norm = normalizar_texto_upper_sem_acento(municipio)
        uf = _resolve_uf_name(row, uf_name_col, uf_sigla_col)
        uf_sigla = _as_string(row[uf_sigla_col]) if uf_sigla_col else None
        if uf_sigla:
            uf_sigla = uf_sigla.upper()
        if uf is None and uf_sigla == "PR":
            uf = "Paraná"
        uf_norm = normalizar_texto_upper_sem_acento(uf)
        cod_municipio = _as_string(row[mun_code_col]) if mun_code_col else None
        rows.append(
            {
                "municipio": municipio,
                "municipio_norm": municipio_norm,
                "uf": uf,
                "uf_sigla": uf_sigla,
                "uf_norm": uf_norm,
                "cod_municipio": cod_municipio,
                "geometry": row.geometry,
            }
        )

    gpd = _import_geopandas()
    out = gpd.GeoDataFrame(rows, geometry="geometry", crs=TARGET_CRS)
    return out, {
        "mun_name_col": mun_name_col,
        "mun_code_col": mun_code_col,
        "uf_name_col": uf_name_col,
        "uf_sigla_col": uf_sigla_col,
    }


def _filter_rmc(gdf_mun):
    gdf_rmc = gdf_mun[gdf_mun["municipio_norm"].isin(MUNICIPIOS_RMC)].copy()
    found = set(gdf_rmc["municipio_norm"].dropna().astype(str))
    missing = sorted(MUNICIPIOS_RMC - found)
    return gdf_rmc, missing


def _write_geojson(gdf, path: Path) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    gdf.to_file(path, driver="GeoJSON")
    return path.stat().st_size


def _copy_outputs(processed_dir: Path, dashboard_dir: Path | None) -> list[str]:
    copied: list[str] = []
    if dashboard_dir is None:
        return copied
    dashboard_dir.mkdir(parents=True, exist_ok=True)
    for name in (*OUTPUT_FILES, "geo_assets.metadata.json"):
        src = processed_dir / name
        if src.is_file():
            shutil.copy2(src, dashboard_dir / name)
            copied.append(str(dashboard_dir / name))
    return copied


def prepare_geo_assets(
    *,
    ufs_shp: Path,
    mun_pr_shp: Path,
    out_dir: Path,
    dashboard_copy_dir: Path | None,
    simplify_tolerance: float,
) -> dict:
    gdf_ufs_raw = _read_shapefile(ufs_shp, "UFs")
    gdf_mun_raw = _read_shapefile(mun_pr_shp, "municípios do Paraná")

    gdf_ufs, ufs_cols = _prepare_ufs_gdf(gdf_ufs_raw)
    gdf_mun, mun_cols = _prepare_municipios_gdf(gdf_mun_raw)

    gdf_ufs = _simplify(gdf_ufs, simplify_tolerance)
    gdf_mun = _simplify(gdf_mun, simplify_tolerance)

    gdf_rmc, rmc_missing = _filter_rmc(gdf_mun)

    warnings: list[str] = []
    if len(gdf_rmc) != EXPECTED_RMC_COUNT:
        warnings.append(
            f"RMC com {len(gdf_rmc)} municípios (esperado {EXPECTED_RMC_COUNT})."
        )
    if rmc_missing:
        warnings.append(
            "Municípios RMC não encontrados no shapefile: " + ", ".join(rmc_missing)
        )

    out_dir.mkdir(parents=True, exist_ok=True)
    sizes = {
        "ufs.geojson": _write_geojson(gdf_ufs, out_dir / "ufs.geojson"),
        "municipios_pr.geojson": _write_geojson(gdf_mun, out_dir / "municipios_pr.geojson"),
        "municipios_rmc.geojson": _write_geojson(gdf_rmc, out_dir / "municipios_rmc.geojson"),
    }

    metadata = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "crs": TARGET_CRS,
        "simplify_tolerance": simplify_tolerance,
        "source_files": {
            "ufs_shp": str(ufs_shp.resolve()),
            "mun_pr_shp": str(mun_pr_shp.resolve()),
        },
        "detected_columns": {
            "ufs": ufs_cols,
            "municipios_pr": mun_cols,
        },
        "outputs": {
            name: str((out_dir / name).resolve()) for name in OUTPUT_FILES
        },
        "counts": {
            "ufs_count": int(len(gdf_ufs)),
            "municipios_pr_count": int(len(gdf_mun)),
            "municipios_rmc_count": int(len(gdf_rmc)),
            "expected_rmc_count": EXPECTED_RMC_COUNT,
        },
        "rmc_missing_municipios_norm": rmc_missing,
        "file_sizes_bytes": sizes,
        "warnings": warnings,
    }

    metadata_path = out_dir / "geo_assets.metadata.json"
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")

    copied = _copy_outputs(out_dir, dashboard_copy_dir)
    metadata["dashboard_copy_paths"] = copied
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")

    return metadata


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Prepara assets GeoJSON (UFs, municípios PR e RMC) a partir de shapefiles."
    )
    parser.add_argument("--ufs-shp", type=Path, required=True, help="Caminho do shapefile de UFs.")
    parser.add_argument(
        "--mun-pr-shp",
        type=Path,
        required=True,
        help="Caminho do shapefile de municípios do Paraná.",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=Path("data-lake/geo/processed"),
        help="Diretório de saída dos GeoJSON processados.",
    )
    parser.add_argument(
        "--dashboard-copy-dir",
        type=Path,
        default=Path("dashboard/public/geo"),
        help="Diretório para cópia dos assets usados pelo dashboard (omitir com string vazia).",
    )
    parser.add_argument(
        "--simplify-tolerance",
        type=float,
        default=0.0005,
        help="Tolerância de simplificação em graus (0 para desativar).",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    dashboard_copy_dir = args.dashboard_copy_dir
    if dashboard_copy_dir is not None and str(dashboard_copy_dir).strip() == "":
        dashboard_copy_dir = None

    metadata = prepare_geo_assets(
        ufs_shp=args.ufs_shp,
        mun_pr_shp=args.mun_pr_shp,
        out_dir=args.out_dir,
        dashboard_copy_dir=dashboard_copy_dir,
        simplify_tolerance=args.simplify_tolerance,
    )

    print("Assets geográficos gerados com sucesso.")
    print(json.dumps(metadata["counts"], ensure_ascii=False, indent=2))
    if metadata["warnings"]:
        print("Warnings:")
        for warning in metadata["warnings"]:
            print(f"  - {warning}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
