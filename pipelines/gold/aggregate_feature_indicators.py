"""Materializa as Golds de feature focus sem reescrever as tabelas já publicadas.

No pipeline mensal, a Feature nasce dentro do staging territorial e só fica
visível no rename desse staging. A republicação avulsa continua gravando um
staging irmão e fazendo o próprio commit de `feature/`, sem alterar arquivos
territoriais já publicados.
"""

from __future__ import annotations

import argparse
import io
import json
import shutil
import time
import tracemalloc
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

from app.core.config import GOLD_DIR
from app.core.logging import setup_logger
from app.core.config import PIPELINE_LOG_FILE
from pipelines.gold.aggregate_indicators import (
    agregar_movimentacao,
    gold_mes_dir,
    prepare_territorial_frame,
    silver_mes_dir,
)
from pipelines.gold.feature_publication import (
    commit_feature_directory,
    feature_staging_dir,
    require_publishable_feature_snapshot,
)
from pipelines.gold.feature_contract import (
    FEATURE_CSV_TABLES,
    FEATURE_PARQUET_ONLY_TABLES,
    FEATURE_REPORT_FILE,
    FLOAT_COLUMNS,
    INTEGER_COLUMNS,
    MUNICIPALITY_IDENTITY_COLUMNS,
    MUNICIPALITY_TABLE_SPECS,
    MOVEMENT_METRIC_COLUMNS,
    SALARY_METRIC_COLUMNS,
    STRING_COLUMNS,
    UF_IDENTITY_COLUMNS,
    UF_TABLE_SPECS,
)
from pipelines.gold.geo_dimension import (
    MATCH_AMBIGUOUS,
    MATCH_MATCHED,
    MATCH_UNMATCHED,
    GeographicDimension,
    load_geographic_dimension,
)
from pipelines.gold.salary_eligibility import SALARY_MOVEMENTS, eligible_salary_population

logger = setup_logger("gold.feature", PIPELINE_LOG_FILE)
logger.propagate = False

FEATURE_GEO_DIR = GOLD_DIR / "geo"
ROW_GROUP_SIZE = 8_192


@dataclass
class FeatureBundle:
    tables: dict[str, pd.DataFrame]
    unmatched_municipalities: pd.DataFrame
    report: dict


def _integral_series(series: pd.Series, column: str) -> pd.Series:
    numeric = pd.to_numeric(series, errors="coerce")
    comparable = numeric.dropna()
    if not comparable.empty and not (comparable % 1 == 0).all():
        raise ValueError(f"Coluna {column} deixou de ser integral na Gold de feature.")
    return numeric.astype("Int64")


def _finalize_frame(frame: pd.DataFrame, columns: list[str], sort_by: list[str]) -> pd.DataFrame:
    ordered = [column for column in columns if column in frame.columns]
    result = frame.loc[:, ordered].copy()
    for column in STRING_COLUMNS & set(result.columns):
        result[column] = result[column].astype("string")
    for column in INTEGER_COLUMNS & set(result.columns):
        result[column] = _integral_series(result[column], column)
    for column in FLOAT_COLUMNS & set(result.columns):
        result[column] = pd.to_numeric(result[column], errors="coerce")
    sort_columns = [column for column in sort_by if column in result.columns]
    if sort_columns:
        result = result.sort_values(sort_columns, kind="mergesort", na_position="last")
    return result.reset_index(drop=True)


def _merge_labels(table: pd.DataFrame, labels: pd.DataFrame, keys: list[str]) -> pd.DataFrame:
    before = len(table)
    merged = table.merge(labels, on=keys, how="left")
    if len(merged) != before:
        raise RuntimeError(
            "Join geográfico duplicou linhas para as chaves " + ", ".join(keys) + "."
        )
    return merged


def _movement_table(
    df: pd.DataFrame,
    group_cols: list[str],
    labels: pd.DataFrame,
    label_keys: list[str],
    output_columns: list[str],
    sort_by: list[str],
) -> pd.DataFrame:
    if df.empty or any(column not in df.columns for column in group_cols):
        return pd.DataFrame(columns=output_columns)
    aggregated = agregar_movimentacao(df, group_cols)
    if aggregated.empty:
        return pd.DataFrame(columns=output_columns)
    merged = _merge_labels(aggregated, labels, label_keys)
    return _finalize_frame(merged, output_columns, sort_by)


def _salary_table(
    populations: dict[str, pd.DataFrame],
    group_cols: list[str],
    labels: pd.DataFrame,
    label_keys: list[str],
    output_columns: list[str],
    sort_by: list[str],
) -> pd.DataFrame:
    frames: list[pd.DataFrame] = []
    for movimento in SALARY_MOVEMENTS:
        population = populations.get(movimento, pd.DataFrame())
        if population.empty or any(column not in population.columns for column in group_cols):
            continue
        valid = population.loc[population["salario"].notna()]
        if valid.empty:
            continue
        stats = (
            valid.groupby(group_cols, dropna=False)["salario"]
            .agg(
                n_salarios_validos="count",
                salario_medio="mean",
                salario_mediano="median",
            )
            .reset_index()
        )
        stats.insert(0, "movimento", movimento)
        frames.append(stats)
    if not frames:
        return pd.DataFrame(columns=output_columns)
    aggregated = pd.concat(frames, ignore_index=True)
    merged = _merge_labels(aggregated, labels, label_keys)
    return _finalize_frame(merged, output_columns, sort_by)


def _uf_labels(df: pd.DataFrame, dimension: GeographicDimension) -> pd.DataFrame:
    if "uf_norm" not in df.columns or df.empty:
        return pd.DataFrame(columns=list(UF_IDENTITY_COLUMNS))
    labels = (
        df.groupby("uf_norm", dropna=False, sort=False)["uf"]
        .agg(lambda series: series.dropna().iloc[0] if series.notna().any() else pd.NA)
        .rename("uf_silver")
        .reset_index()
    )
    geo = dimension.uf.rename(columns={"uf": "uf_geo"}).copy()
    merged = labels.merge(geo, on="uf_norm", how="left")
    if len(merged) != len(labels):
        raise RuntimeError("Dimensão de UF duplicou rótulos.")
    merged["uf"] = merged["uf_geo"].combine_first(merged["uf_silver"])
    ambiguous = merged["uf_norm"].isin(dimension.ambiguous_uf_norms)
    merged.loc[ambiguous, ["cod_uf", "uf_sigla"]] = pd.NA
    return merged.loc[:, list(UF_IDENTITY_COLUMNS)]


def _municipality_labels(df: pd.DataFrame, dimension: GeographicDimension) -> pd.DataFrame:
    keys = ["uf_norm", "municipio_norm"]
    if df.empty or any(column not in df.columns for column in keys):
        return pd.DataFrame(columns=list(MUNICIPALITY_IDENTITY_COLUMNS))
    labels = (
        df.groupby(keys, dropna=False, sort=False)
        .agg(uf_silver=("uf", "first"), municipio_silver=("municipio", "first"))
        .reset_index()
    )
    geo = dimension.municipality.rename(
        columns={"uf": "uf_geo", "municipio": "municipio_geo"}
    ).copy()
    merged = labels.merge(geo, on=keys, how="left")
    if len(merged) != len(labels):
        raise RuntimeError("Dimensão municipal duplicou rótulos.")
    merged["uf"] = merged["uf_geo"].combine_first(merged["uf_silver"])
    merged["municipio"] = merged["municipio_geo"].combine_first(merged["municipio_silver"])
    ambiguous = [
        (str(uf_norm), str(municipio_norm)) in dimension.ambiguous_municipality_keys
        for uf_norm, municipio_norm in zip(merged["uf_norm"], merged["municipio_norm"])
    ]
    merged.loc[ambiguous, ["cod_municipio", "cod_uf", "uf_sigla"]] = pd.NA
    return merged.loc[:, list(MUNICIPALITY_IDENTITY_COLUMNS)]


def _match_reason(code: object, ambiguous: bool) -> str:
    if ambiguous:
        return MATCH_AMBIGUOUS
    if code is None or code is pd.NA:
        return MATCH_UNMATCHED
    try:
        if pd.isna(code):
            return MATCH_UNMATCHED
    except TypeError:
        pass
    return MATCH_MATCHED


def _unmatched_municipalities(
    df: pd.DataFrame,
    labels: pd.DataFrame,
    dimension: GeographicDimension,
) -> pd.DataFrame:
    movement = agregar_movimentacao(df, ["uf_norm", "municipio_norm"])
    merged = _merge_labels(movement, labels, ["uf_norm", "municipio_norm"])
    reasons = []
    for uf_norm, municipio_norm, code in zip(
        merged["uf_norm"],
        merged["municipio_norm"],
        merged["cod_municipio"],
    ):
        ambiguous = (str(uf_norm), str(municipio_norm)) in dimension.ambiguous_municipality_keys
        reasons.append(_match_reason(code, ambiguous))
    merged["motivo"] = reasons
    pending = merged.loc[merged["motivo"] != MATCH_MATCHED].copy()
    columns = [
        "uf_norm",
        "municipio_norm",
        "uf",
        "municipio",
        "cod_municipio",
        "cod_uf",
        "uf_sigla",
        *MOVEMENT_METRIC_COLUMNS,
        "motivo",
    ]
    return _finalize_frame(
        pending,
        columns,
        ["uf_norm", "municipio_norm"],
    )


def _sparsity(observed: int, territories: int, categories: int) -> float | None:
    cartesian = territories * categories
    if cartesian <= 0:
        return None
    return 1 - (observed / cartesian)


def _category_count(df: pd.DataFrame, column: str) -> int:
    if column not in df.columns:
        return 0
    return int(df[column].nunique(dropna=False))


def build_feature_bundle(
    df: pd.DataFrame,
    ano: int,
    *,
    dimension: GeographicDimension | None = None,
) -> FeatureBundle:
    prepared = df if "uf_norm" in df.columns else prepare_territorial_frame(df)
    geo = dimension or load_geographic_dimension()
    uf_labels = _uf_labels(prepared, geo)
    municipality_labels = _municipality_labels(prepared, geo)

    populations = {
        movimento: eligible_salary_population(prepared, ano, movimento)
        for movimento in SALARY_MOVEMENTS
    }
    tables: dict[str, pd.DataFrame] = {
        "tabela_uf_salario": _salary_table(
            populations,
            ["uf_norm"],
            uf_labels,
            ["uf_norm"],
            [*UF_IDENTITY_COLUMNS, *SALARY_METRIC_COLUMNS],
            ["uf_sigla", "uf_norm", "movimento"],
        ),
        "tabela_municipio_salario": _salary_table(
            populations,
            ["uf_norm", "municipio_norm"],
            municipality_labels,
            ["uf_norm", "municipio_norm"],
            [*MUNICIPALITY_IDENTITY_COLUMNS, *SALARY_METRIC_COLUMNS],
            ["cod_municipio", "uf_norm", "municipio_norm", "movimento"],
        ),
    }

    for name, column in UF_TABLE_SPECS.items():
        tables[name] = _movement_table(
            prepared,
            ["uf_norm", column],
            uf_labels,
            ["uf_norm"],
            [*UF_IDENTITY_COLUMNS, column, *MOVEMENT_METRIC_COLUMNS],
            ["uf_sigla", "uf_norm", column],
        )
    for name, column in MUNICIPALITY_TABLE_SPECS.items():
        tables[name] = _movement_table(
            prepared,
            ["uf_norm", "municipio_norm", column],
            municipality_labels,
            ["uf_norm", "municipio_norm"],
            [*MUNICIPALITY_IDENTITY_COLUMNS, column, *MOVEMENT_METRIC_COLUMNS],
            ["cod_municipio", "uf_norm", "municipio_norm", column],
        )

    unmatched = (
        _unmatched_municipalities(prepared, municipality_labels, geo)
        if not prepared.empty
        else pd.DataFrame()
    )
    n_uf = int(len(uf_labels))
    n_municipality = int(len(municipality_labels))
    matched_uf = int(uf_labels["cod_uf"].notna().sum()) if "cod_uf" in uf_labels else 0
    matched_municipality = (
        int(municipality_labels["cod_municipio"].notna().sum())
        if "cod_municipio" in municipality_labels
        else 0
    )
    ambiguous_municipality = (
        int((unmatched["motivo"] == MATCH_AMBIGUOUS).sum()) if "motivo" in unmatched else 0
    )
    report = {
        "geographic_sources": {
            "uf": geo.uf_source,
            "municipality": geo.municipality_source,
        },
        "coverage": {
            "uf_total": n_uf,
            "uf_matched": matched_uf,
            "uf_unmatched": n_uf - matched_uf,
            "uf_ambiguous": len(geo.ambiguous_uf_norms),
            "municipality_total": n_municipality,
            "municipality_matched": matched_municipality,
            "municipality_unmatched": int((unmatched["motivo"] == MATCH_UNMATCHED).sum())
            if "motivo" in unmatched
            else 0,
            "municipality_ambiguous": ambiguous_municipality,
            "dimension_uf_rows": int(len(geo.uf)),
            "dimension_municipality_rows": int(len(geo.municipality)),
        },
        "tables": {},
    }
    category_counts = {
        "tabela_uf_salario": 2,
        "tabela_municipio_salario": 2,
    }
    for name, column in {**UF_TABLE_SPECS, **MUNICIPALITY_TABLE_SPECS}.items():
        category_counts[name] = _category_count(prepared, column)
    for name, table in tables.items():
        territories = n_uf if name.startswith("tabela_uf_") else n_municipality
        report["tables"][name] = {
            "rows": int(len(table)),
            "columns": list(table.columns),
            "sparsity": _sparsity(int(len(table)), territories, category_counts.get(name, 0)),
            "csv": name in FEATURE_CSV_TABLES,
        }
    return FeatureBundle(tables=tables, unmatched_municipalities=unmatched, report=report)


def _estimate_csv_bytes(frame: pd.DataFrame) -> int:
    if frame.empty:
        return 3
    sample = frame.head(min(200, len(frame)))
    buffer = io.StringIO()
    sample.to_csv(buffer, index=False)
    lines = buffer.getvalue().splitlines()
    header = len(lines[0].encode("utf-8")) + 1
    body = lines[1:]
    if not body:
        return header + 3
    mean_row = sum(len(line.encode("utf-8")) + 1 for line in body) / len(body)
    return int(header + mean_row * len(frame) + 3)


def _write_parquet(frame: pd.DataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    table = pa.Table.from_pandas(frame, preserve_index=False)
    pq.write_table(table, temporary, compression="snappy", row_group_size=ROW_GROUP_SIZE)
    temporary.replace(path)


def _write_csv(frame: pd.DataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    frame.to_csv(temporary, index=False, encoding="utf-8-sig")
    temporary.replace(path)


def _owned_names() -> set[str]:
    names = {FEATURE_REPORT_FILE}
    for name in (*FEATURE_CSV_TABLES, *FEATURE_PARQUET_ONLY_TABLES):
        names.add(f"{name}.parquet")
        names.add(f"{name}.csv")
    return names


def _snapshot(directory: Path, owned: set[str]) -> dict[str, tuple[int, int]]:
    snapshot: dict[str, tuple[int, int]] = {}
    if not directory.is_dir():
        return snapshot
    for path in directory.iterdir():
        if not path.is_file() or path.name in owned or path.name.endswith(".tmp"):
            continue
        stat = path.stat()
        snapshot[path.name] = (stat.st_size, stat.st_mtime_ns)
    return snapshot


def _assert_unchanged(directory: Path, snapshot: dict[str, tuple[int, int]]) -> None:
    for name, (size, modified) in snapshot.items():
        path = directory / name
        if not path.is_file():
            raise RuntimeError(f"Arquivo Gold existente removido: {name}")
        stat = path.stat()
        if stat.st_size != size or stat.st_mtime_ns != modified:
            raise RuntimeError(f"Arquivo Gold existente alterado: {name}")


def _require_base_gold(output_dir: Path) -> None:
    if (output_dir / "tabela_uf.parquet").is_file() or (output_dir / "tabela_uf.csv").is_file():
        return
    raise FileNotFoundError(
        "Gold base ausente em "
        f"{output_dir}. A camada de feature não substitui tabela_uf/tabela_municipio."
    )


def _write_feature_report(staging_dir: Path, report: dict) -> None:
    report_path = staging_dir / FEATURE_REPORT_FILE
    temporary_report = report_path.with_suffix(".json.tmp")
    temporary_report.write_text(
        json.dumps(report, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    temporary_report.replace(report_path)


def write_feature_tables(destination: Path, bundle: FeatureBundle) -> dict[str, dict]:
    """Grava Parquets e CSVs da Feature. Não publica e não sela o relatório."""
    destination.mkdir(parents=True, exist_ok=False)
    table_reports: dict[str, dict] = {}
    for name, frame in bundle.tables.items():
        table_started = time.perf_counter()
        parquet_path = destination / f"{name}.parquet"
        _write_parquet(frame, parquet_path)
        write_csv = name in FEATURE_CSV_TABLES
        csv_bytes = None
        if write_csv:
            csv_path = destination / f"{name}.csv"
            _write_csv(frame, csv_path)
            csv_bytes = csv_path.stat().st_size
        estimated_csv = _estimate_csv_bytes(frame)
        table_reports[name] = {
            **bundle.report["tables"][name],
            "written": True,
            "empty": bool(frame.empty),
            "parquet_bytes": parquet_path.stat().st_size,
            "csv_bytes": csv_bytes,
            "estimated_csv_bytes": estimated_csv,
            "csv_omitted": not write_csv,
            "csv_omission_reason": (
                None
                if write_csv
                else (
                    "Combinação município × ocupação observada é grande demais para "
                    "um CSV analítico redundante. A Gold permanece completa em Parquet, "
                    "sem corte Top N."
                )
            ),
            "write_seconds": round(time.perf_counter() - table_started, 3),
        }
    return table_reports


def _feature_report(
    *,
    ano: int,
    mes: int,
    started: float,
    peak: int,
    current: int,
    bundle: FeatureBundle,
    table_reports: dict[str, dict],
    geo_dir: Path | None,
) -> dict:
    target_geo = geo_dir or FEATURE_GEO_DIR
    unmatched_path = target_geo / "matches" / f"ano={ano}" / f"mes={mes:02d}" / "unmatched_municipios.parquet"
    report = {
        "ano": ano,
        "mes": mes,
        "generation_seconds": round(time.perf_counter() - started, 3),
        "tracemalloc_peak_bytes": int(peak),
        "tracemalloc_current_bytes": int(current),
        "coverage": bundle.report["coverage"],
        "geographic_sources": bundle.report["geographic_sources"],
        "tables": table_reports,
    }
    try:
        from app.core.config import PROJECT_ROOT

        report["unmatched_municipalities_parquet"] = unmatched_path.relative_to(
            PROJECT_ROOT
        ).as_posix()
    except ValueError:
        report["unmatched_municipalities_parquet"] = str(unmatched_path)
    return report


def seal_feature_snapshot(destination: Path, report: dict) -> dict:
    """Carimba `feature_generated_at` e só então aceita o snapshot.

    O carimbo registra o fim da geração e da validação dentro do staging.
    Não é o commit da competência.
    """
    report["feature_generated_at"] = datetime.now(timezone.utc).isoformat()
    _write_feature_report(destination, report)
    require_publishable_feature_snapshot(destination)
    return report


@dataclass
class MonthlyFeatureStaging:
    """Feature já escrita no staging mensal, ainda invisível ao leitor."""

    bundle: FeatureBundle
    seal: object
    geo_dir: Path | None
    dimension: GeographicDimension | None


def stage_monthly_feature(
    staging_month: Path,
    df: pd.DataFrame,
    ano: int,
    mes: int,
    *,
    dimension: GeographicDimension | None = None,
    geo_dir: Path | None = None,
) -> MonthlyFeatureStaging:
    """Constrói `staging/feature/` sem publicar a competência."""
    tracemalloc.start()
    started = time.perf_counter()
    try:
        bundle = build_feature_bundle(df, ano, dimension=dimension)
        destination = staging_month / "feature"
        table_reports = write_feature_tables(destination, bundle)
        current, peak = tracemalloc.get_traced_memory()
    finally:
        if tracemalloc.is_tracing():
            tracemalloc.stop()

    def seal() -> dict:
        report = _feature_report(
            ano=ano,
            mes=mes,
            started=started,
            peak=peak,
            current=current,
            bundle=bundle,
            table_reports=table_reports,
            geo_dir=geo_dir,
        )
        return seal_feature_snapshot(destination, report)

    return MonthlyFeatureStaging(
        bundle=bundle,
        seal=seal,
        geo_dir=geo_dir,
        dimension=dimension,
    )


def write_feature_geo_assets(
    bundle: FeatureBundle,
    ano: int,
    mes: int,
    *,
    dimension: GeographicDimension | None = None,
    geo_dir: Path | None = None,
) -> None:
    """Atualiza dimensões e não correspondências depois do commit.

    Falha aqui não desfaz o snapshot já publicado.
    """
    target_geo = geo_dir or FEATURE_GEO_DIR
    match_dir = target_geo / "matches" / f"ano={ano}" / f"mes={mes:02d}"
    try:
        match_dir.mkdir(parents=True, exist_ok=True)
        _write_parquet(
            bundle.unmatched_municipalities,
            match_dir / "unmatched_municipios.parquet",
        )
        _write_dimensions(dimension or load_geographic_dimension(), target_geo)
    except Exception as exc:
        logger.warning(
            "[GOLD][FEATURE] snapshot publicado; atualização auxiliar de geo falhou | %s",
            exc,
        )


def log_feature_snapshot(ano: int, mes: int, report: dict) -> None:
    logger.info(
        "[GOLD][FEATURE] ano=%s mes=%s tabelas=%s segundos=%s",
        ano,
        mes,
        len(report.get("tables", {})),
        report.get("generation_seconds"),
    )


def materialize_feature_gold(
    df: pd.DataFrame,
    ano: int,
    output_dir: Path,
    *,
    mes: int | None = None,
    dimension: GeographicDimension | None = None,
    geo_dir: Path | None = None,
) -> dict:
    """Republica só a Feature, com commit próprio em `feature/`.

    O pipeline mensal não usa esta função. Ela permanece para comando avulso,
    manutenção e compatibilidade. A agregação não altera a Gold territorial.
    `feature_generated_at` sela o staging antes do rename da Feature e não é
    o `published_at` territorial.
    """
    if mes is None:
        month_name = output_dir.name
        if not month_name.startswith("mes="):
            raise ValueError(f"Diretório de competência inválido: {output_dir}")
        mes = int(month_name.split("=", 1)[1])

    _require_base_gold(output_dir)
    tracemalloc.start()
    started = time.perf_counter()
    owned = _owned_names()
    snapshot = _snapshot(output_dir, owned)
    try:
        bundle = build_feature_bundle(df, ano, dimension=dimension)
        current, peak = tracemalloc.get_traced_memory()
    finally:
        if tracemalloc.is_tracing():
            tracemalloc.stop()
    staging_dir = feature_staging_dir(output_dir)
    committed = False
    report: dict = {}
    try:
        table_reports = write_feature_tables(staging_dir, bundle)
        report = seal_feature_snapshot(
            staging_dir,
            _feature_report(
                ano=ano,
                mes=mes,
                started=started,
                peak=peak,
                current=current,
                bundle=bundle,
                table_reports=table_reports,
                geo_dir=geo_dir,
            ),
        )
        _assert_unchanged(output_dir, snapshot)
        commit_feature_directory(staging_dir, output_dir)
        committed = True
    finally:
        if not committed and staging_dir.exists():
            shutil.rmtree(staging_dir, ignore_errors=True)
    write_feature_geo_assets(
        bundle,
        ano,
        mes,
        dimension=dimension,
        geo_dir=geo_dir,
    )
    _assert_unchanged(output_dir, snapshot)
    log_feature_snapshot(ano, mes, report)
    return report


def _write_dimensions(dimension: GeographicDimension, geo_dir: Path | None = None) -> None:
    target = geo_dir or FEATURE_GEO_DIR
    target.mkdir(parents=True, exist_ok=True)
    uf = _finalize_frame(dimension.uf, list(UF_IDENTITY_COLUMNS), ["uf_sigla"])
    municipality = _finalize_frame(
        dimension.municipality,
        list(MUNICIPALITY_IDENTITY_COLUMNS),
        ["cod_municipio"],
    )
    _write_parquet(uf, target / "dim_uf.parquet")
    _write_csv(uf, target / "dim_uf.csv")
    _write_parquet(municipality, target / "dim_municipio.parquet")
    _write_csv(municipality, target / "dim_municipio.csv")


def run_feature_gold(
    ano: int,
    mes: int,
    *,
    dimension: GeographicDimension | None = None,
) -> dict:
    silver_file = silver_mes_dir(ano, mes) / "caged_tratado.parquet"
    if not silver_file.is_file():
        raise FileNotFoundError(f"Silver não encontrada: {silver_file}")
    output_dir = gold_mes_dir(ano, mes)
    frame = pd.read_parquet(silver_file)
    frame = prepare_territorial_frame(frame)
    return materialize_feature_gold(
        frame,
        ano,
        output_dir,
        mes=mes,
        dimension=dimension,
    )


def discover_feature_months() -> list[tuple[int, int]]:
    from app.core.config import SILVER_CAGED_DIR

    months: list[tuple[int, int]] = []
    if not SILVER_CAGED_DIR.is_dir():
        return months
    for year_dir in sorted(SILVER_CAGED_DIR.glob("ano=*")):
        if not year_dir.is_dir():
            continue
        try:
            ano = int(year_dir.name.split("=", 1)[1])
        except ValueError:
            continue
        for month_dir in sorted(year_dir.glob("mes=*")):
            try:
                mes = int(month_dir.name.split("=", 1)[1])
            except ValueError:
                continue
            if (month_dir / "caged_tratado.parquet").is_file():
                months.append((ano, mes))
    return months


def main() -> None:
    parser = argparse.ArgumentParser(description="Materializa a Gold de feature focus.")
    parser.add_argument("--ano", type=int)
    parser.add_argument("--mes", type=int)
    parser.add_argument(
        "--all",
        action="store_true",
        help="Processa todas as competências Silver que já possuem Gold base.",
    )
    args = parser.parse_args()
    if args.all:
        months = discover_feature_months()
    elif args.ano is not None and args.mes is not None:
        months = [(args.ano, args.mes)]
    else:
        parser.error("Informe --ano e --mes, ou --all.")
    dimension = load_geographic_dimension()
    for ano, mes in months:
        logger.info("[GOLD][FEATURE] Iniciando competência %s-%02d", ano, mes)
        run_feature_gold(ano, mes, dimension=dimension)


if __name__ == "__main__":
    main()
