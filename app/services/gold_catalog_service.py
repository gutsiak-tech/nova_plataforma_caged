from __future__ import annotations

import csv
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd
import pyarrow.parquet as pq

from app.core.config import GOLD_CAGED_DIR, PROJECT_ROOT

CATALOG_DIR = PROJECT_ROOT / "data-lake" / "catalog"
GOLD_CATALOG_JSON = CATALOG_DIR / "gold_catalog.json"
GOLD_CATALOG_CSV = CATALOG_DIR / "gold_catalog.csv"
GOLD_CATALOG_MD = PROJECT_ROOT / "docs" / "gold_catalog.md"

LEGACY_TABLE_EXACT = frozenset(
    {
        "tabela_perfil",
        "tabela_perfil_pr",
        "tabela_perfil_rmc",
    }
)

CURRENT_PIPELINE_TABLES = frozenset(
    {
        "tabela_resumo",
        "tabela_uf",
        "tabela_municipio",
        "tabela_municipio_pr",
        "tabela_municipio_rmc",
        "tabela_setor",
        "tabela_setor_pr",
        "tabela_setor_rmc",
        "tabela_ocupacao",
        "tabela_ocupacao_pr",
        "tabela_ocupacao_rmc",
        "tabela_perfil_sexo",
        "tabela_perfil_sexo_pr",
        "tabela_perfil_sexo_rmc",
        "tabela_perfil_faixa_etaria",
        "tabela_perfil_faixa_etaria_pr",
        "tabela_perfil_faixa_etaria_rmc",
        "tabela_perfil_graudeinstrucao",
        "tabela_perfil_graudeinstrucao_pr",
        "tabela_perfil_graudeinstrucao_rmc",
        "tabela_perfil_sexo_faixa_etaria",
        "tabela_perfil_sexo_faixa_etaria_pr",
        "tabela_perfil_sexo_faixa_etaria_rmc",
        "tabela_perfil_sexo_instrucao",
        "tabela_perfil_sexo_instrucao_pr",
        "tabela_perfil_sexo_instrucao_rmc",
        "tabela_perfil_faixa_etaria_instrucao",
        "tabela_perfil_faixa_etaria_instrucao_pr",
        "tabela_perfil_faixa_etaria_instrucao_rmc",
        "tabela_perfil_sexo_salario",
        "tabela_perfil_sexo_salario_pr",
        "tabela_perfil_sexo_salario_rmc",
        "tabela_perfil_faixa_etaria_salario",
        "tabela_perfil_faixa_etaria_salario_pr",
        "tabela_perfil_faixa_etaria_salario_rmc",
        "tabela_perfil_graudeinstrucao_salario",
        "tabela_perfil_graudeinstrucao_salario_pr",
        "tabela_perfil_graudeinstrucao_salario_rmc",
        "tabela_resumo_salario",
        "tabela_resumo_salario_pr",
        "tabela_resumo_salario_rmc",
        "tabela_perfil_sexo_faixa_etaria_salario",
        "tabela_perfil_sexo_faixa_etaria_salario_pr",
        "tabela_perfil_sexo_faixa_etaria_salario_rmc",
        "tabela_perfil_sexo_instrucao_salario",
        "tabela_perfil_sexo_instrucao_salario_pr",
        "tabela_perfil_sexo_instrucao_salario_rmc",
        "tabela_perfil_faixa_etaria_instrucao_salario",
        "tabela_perfil_faixa_etaria_instrucao_salario_pr",
        "tabela_perfil_faixa_etaria_instrucao_salario_rmc",
    }
)

STALE_MODIFICATION_SECONDS = 86_400


def _relative_path(path: Path) -> str:
    try:
        return path.relative_to(PROJECT_ROOT).as_posix()
    except ValueError:
        return path.as_posix()


def _parse_partition_value(name: str, prefix: str) -> int | None:
    if not name.startswith(f"{prefix}="):
        return None
    try:
        return int(name.split("=", 1)[1])
    except ValueError:
        return None


def list_gold_partitions(gold_root: Path | None = None) -> list[dict[str, Any]]:
    root = gold_root or GOLD_CAGED_DIR
    if not root.exists():
        return []

    partitions: list[dict[str, Any]] = []
    for ano_dir in sorted(root.glob("ano=*")):
        if not ano_dir.is_dir():
            continue
        ano = _parse_partition_value(ano_dir.name, "ano")
        if ano is None:
            continue

        for mes_dir in sorted(ano_dir.glob("mes=*")):
            if not mes_dir.is_dir():
                continue
            mes = _parse_partition_value(mes_dir.name, "mes")
            if mes is None or not (1 <= mes <= 12):
                continue

            partitions.append(
                {
                    "ano": ano,
                    "mes": mes,
                    "competencia": f"{ano}-{mes:02d}",
                    "path": _relative_path(mes_dir),
                    "dir": mes_dir,
                }
            )

    return partitions


def infer_scope_from_table_name(table_name: str) -> str:
    if table_name.endswith("_rmc"):
        return "rmc"
    if table_name.endswith("_pr"):
        return "parana"
    return "brasil"


def _strip_scope_suffix(table_name: str) -> str:
    if table_name.endswith("_rmc"):
        return table_name[: -len("_rmc")]
    if table_name.endswith("_pr"):
        return table_name[: -len("_pr")]
    return table_name


def infer_granularity_from_table_name(table_name: str) -> str:
    base = _strip_scope_suffix(table_name)

    if base == "tabela_resumo":
        return "resumo"
    if base == "tabela_uf":
        return "uf"
    if base == "tabela_municipio":
        return "municipio"
    if base == "tabela_setor":
        return "setor"
    if base == "tabela_ocupacao":
        return "ocupacao"

    lowered = base.lower()
    if "salario" in lowered:
        return "salario"
    if "sexo" in lowered:
        return "perfil_sexo"
    if "faixa_etaria" in lowered:
        return "perfil_faixa_etaria"
    if "graudeinstrucao" in lowered or "grau_instrucao" in lowered:
        return "perfil_instrucao"
    if "perfil" in lowered:
        return "perfil"
    return "desconhecida"


def _iso_mtime(path: Path | None) -> str | None:
    if path is None or not path.exists():
        return None
    ts = path.stat().st_mtime
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()


def _count_csv_rows(path: Path) -> int:
    with path.open("r", encoding="utf-8", errors="replace", newline="") as handle:
        total = sum(1 for _ in handle)
    return max(0, total - 1)


def _inspect_csv(path: Path) -> tuple[list[str], dict[str, str], int]:
    df = pd.read_csv(path, nrows=0)
    columns = list(df.columns)
    dtypes = {col: str(dtype) for col, dtype in df.dtypes.items()}
    row_count = _count_csv_rows(path)
    return columns, dtypes, row_count


def _inspect_parquet(path: Path) -> tuple[list[str], dict[str, str], int]:
    parquet_file = pq.ParquetFile(path)
    schema = parquet_file.schema_arrow
    columns = schema.names
    dtypes = {name: str(schema.field(name).type) for name in columns}
    row_count = parquet_file.metadata.num_rows if parquet_file.metadata else 0
    return columns, dtypes, int(row_count)


def _is_legacy_table_name(table_name: str) -> bool:
    if table_name in LEGACY_TABLE_EXACT:
        return True
    if re.fullmatch(r"tabela_perfil(?:_pr|_rmc)?", table_name):
        return True
    return False


def inspect_gold_table(
    table_name: str,
    *,
    competencia: str,
    ano: int,
    mes: int,
    month_dir: Path,
    csv_path: Path | None,
    parquet_path: Path | None,
    partition_notes: list[str],
    newest_mtime: float | None,
) -> dict[str, Any]:
    has_csv = csv_path is not None and csv_path.exists()
    has_parquet = parquet_path is not None and parquet_path.exists()

    columns: list[str] = []
    dtypes: dict[str, str] = {}
    row_count = 0
    column_count = 0

    if has_csv and csv_path is not None:
        columns, dtypes, row_count = _inspect_csv(csv_path)
    elif has_parquet and parquet_path is not None:
        columns, dtypes, row_count = _inspect_parquet(parquet_path)

    column_count = len(columns)
    notes = list(partition_notes)

    is_current = table_name in CURRENT_PIPELINE_TABLES
    is_legacy = _is_legacy_table_name(table_name)

    if not is_current:
        notes.append("Tabela fora da lista do pipeline atual (aggregate_indicators).")
    if is_legacy:
        notes.append("Possível artefato legado (tabela_perfil* sem sufixo analítico).")
    if has_csv and not has_parquet:
        notes.append("CSV presente sem Parquet correspondente.")
    if has_parquet and not has_csv:
        notes.append("Parquet presente sem CSV correspondente.")

    for path, label in ((csv_path, "csv"), (parquet_path, "parquet")):
        if path is None or not path.exists() or newest_mtime is None:
            continue
        age = newest_mtime - path.stat().st_mtime
        if age > STALE_MODIFICATION_SECONDS:
            notes.append(
                f"Arquivo {label} com modificação anterior à maioria dos artefatos da competência."
            )

    return {
        "table_name": table_name,
        "competencia": competencia,
        "ano": ano,
        "mes": mes,
        "scope": infer_scope_from_table_name(table_name),
        "granularity": infer_granularity_from_table_name(table_name),
        "csv_path": _relative_path(csv_path) if has_csv and csv_path else None,
        "parquet_path": _relative_path(parquet_path) if has_parquet and parquet_path else None,
        "has_csv": has_csv,
        "has_parquet": has_parquet,
        "row_count": row_count,
        "column_count": column_count,
        "columns": columns,
        "dtypes": dtypes,
        "last_modified_csv": _iso_mtime(csv_path if has_csv else None),
        "last_modified_parquet": _iso_mtime(parquet_path if has_parquet else None),
        "is_current_pipeline_table": is_current,
        "is_suspected_legacy": is_legacy or (not is_current),
        "notes": "; ".join(dict.fromkeys(notes)),
    }


def _scan_partition_files(month_dir: Path) -> dict[str, Any]:
    csv_files = sorted(month_dir.glob("*.csv"))
    parquet_files = sorted(month_dir.glob("*.parquet"))
    excel_files = sorted(month_dir.glob("*.xlsx"))

    csv_names = {p.stem for p in csv_files}
    parquet_names = {p.stem for p in parquet_files}
    all_table_names = sorted(csv_names | parquet_names)

    csv_map = {p.stem: p for p in csv_files}
    parquet_map = {p.stem: p for p in parquet_files}

    csv_without_parquet = sorted(csv_names - parquet_names)
    parquet_without_csv = sorted(parquet_names - csv_names)

    suspected_files = sorted(
        name
        for name in all_table_names
        if _is_legacy_table_name(name) or name not in CURRENT_PIPELINE_TABLES
    )

    mtimes = [p.stat().st_mtime for p in (*csv_files, *parquet_files)]
    newest_mtime = max(mtimes) if mtimes else None

    return {
        "csv_count": len(csv_files),
        "parquet_count": len(parquet_files),
        "excel_files": [_relative_path(p) for p in excel_files],
        "excel_count": len(excel_files),
        "table_names": all_table_names,
        "csv_map": csv_map,
        "parquet_map": parquet_map,
        "csv_without_parquet": csv_without_parquet,
        "parquet_without_csv": parquet_without_csv,
        "suspected_files": suspected_files,
        "newest_mtime": newest_mtime,
    }


def build_gold_catalog(gold_root: Path | None = None) -> dict[str, Any]:
    root = gold_root or GOLD_CAGED_DIR
    partitions = list_gold_partitions(root)
    partition_scans: list[dict[str, Any]] = []
    tables: list[dict[str, Any]] = []

    for partition in partitions:
        month_dir: Path = partition["dir"]
        scan = _scan_partition_files(month_dir)
        partition_scans.append(
            {
                "competencia": partition["competencia"],
                "ano": partition["ano"],
                "mes": partition["mes"],
                "path": partition["path"],
                "csv_count": scan["csv_count"],
                "parquet_count": scan["parquet_count"],
                "excel_count": scan["excel_count"],
                "excel_files": scan["excel_files"],
                "csv_without_parquet": scan["csv_without_parquet"],
                "parquet_without_csv": scan["parquet_without_csv"],
                "suspected_files": scan["suspected_files"],
                "table_names": scan["table_names"],
            }
        )

        for table_name in scan["table_names"]:
            partition_notes: list[str] = []
            if table_name in scan["csv_without_parquet"]:
                partition_notes.append("CSV sem Parquet correspondente.")
            if table_name in scan["parquet_without_csv"]:
                partition_notes.append("Parquet sem CSV correspondente.")

            tables.append(
                inspect_gold_table(
                    table_name,
                    competencia=partition["competencia"],
                    ano=partition["ano"],
                    mes=partition["mes"],
                    month_dir=month_dir,
                    csv_path=scan["csv_map"].get(table_name),
                    parquet_path=scan["parquet_map"].get(table_name),
                    partition_notes=partition_notes,
                    newest_mtime=scan["newest_mtime"],
                )
            )

    pipeline_union: set[str] = set()
    for scan in partition_scans:
        pipeline_union |= set(scan["table_names"]) & CURRENT_PIPELINE_TABLES

    for scan in partition_scans:
        missing = sorted(pipeline_union - set(scan["table_names"]))
        if missing:
            scan["missing_pipeline_tables"] = missing

    suspected_legacy_count = sum(1 for t in tables if t["is_suspected_legacy"])
    suspected_files = sorted(
        {
            name
            for scan in partition_scans
            for name in scan["suspected_files"]
        }
    )

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "gold_root": _relative_path(root),
        "summary": {
            "competencia_count": len(partition_scans),
            "table_count": len(tables),
            "suspected_legacy_count": suspected_legacy_count,
            "suspected_files": suspected_files,
        },
        "partitions": partition_scans,
        "tables": tables,
    }


def get_catalog_for_competencia(
    catalog: dict[str, Any],
    *,
    ano: int | None = None,
    mes: int | None = None,
) -> dict[str, Any]:
    if ano is None and mes is None:
        return catalog

    filtered_tables = catalog.get("tables", [])
    if ano is not None:
        filtered_tables = [t for t in filtered_tables if t["ano"] == ano]
    if mes is not None:
        filtered_tables = [t for t in filtered_tables if t["mes"] == mes]

    filtered_partitions = catalog.get("partitions", [])
    if ano is not None:
        filtered_partitions = [p for p in filtered_partitions if p["ano"] == ano]
    if mes is not None:
        filtered_partitions = [p for p in filtered_partitions if p["mes"] == mes]

    return {
        **catalog,
        "partitions": filtered_partitions,
        "tables": filtered_tables,
        "summary": {
            **catalog.get("summary", {}),
            "table_count": len(filtered_tables),
            "competencia_count": len(filtered_partitions),
        },
    }


def filter_catalog(
    catalog: dict[str, Any],
    *,
    ano: int | None = None,
    mes: int | None = None,
    scope: str | None = None,
    granularity: str | None = None,
    suspected_legacy: bool | None = None,
) -> dict[str, Any]:
    filtered = get_catalog_for_competencia(catalog, ano=ano, mes=mes)
    tables = filtered.get("tables", [])

    if scope is not None:
        normalized = normalize_catalog_scope_filter(scope)
        tables = [t for t in tables if t["scope"] == normalized]

    if granularity is not None:
        tables = [t for t in tables if t["granularity"] == granularity]

    if suspected_legacy is not None:
        tables = [t for t in tables if t["is_suspected_legacy"] is suspected_legacy]

    return {
        **filtered,
        "tables": tables,
        "summary": {
            **filtered.get("summary", {}),
            "table_count": len(tables),
        },
    }


def normalize_catalog_scope_filter(scope: str) -> str:
    value = (scope or "").strip().lower()
    if value in {"br", "brasil"}:
        return "brasil"
    if value in {"pr", "parana", "paraná"}:
        return "parana"
    if value == "rmc":
        return "rmc"
    raise ValueError(f"scope inválido para catálogo: {scope}")


def write_gold_catalog(
    *,
    gold_root: Path | None = None,
    catalog_dir: Path | None = None,
    docs_path: Path | None = None,
) -> dict[str, Any]:
    catalog = build_gold_catalog(gold_root=gold_root)
    out_dir = catalog_dir or CATALOG_DIR
    out_dir.mkdir(parents=True, exist_ok=True)

    json_path = out_dir / "gold_catalog.json"
    csv_path = out_dir / "gold_catalog.csv"
    md_path = docs_path or GOLD_CATALOG_MD

    json_path.write_text(
        json.dumps(catalog, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    _write_catalog_csv(catalog, csv_path)
    md_path.parent.mkdir(parents=True, exist_ok=True)
    md_path.write_text(render_gold_catalog_markdown(catalog), encoding="utf-8")

    return {
        "catalog": catalog,
        "json_path": json_path,
        "csv_path": csv_path,
        "markdown_path": md_path,
    }


def load_gold_catalog(path: Path | None = None) -> dict[str, Any]:
    catalog_path = path or GOLD_CATALOG_JSON
    if not catalog_path.exists():
        return build_gold_catalog()
    return json.loads(catalog_path.read_text(encoding="utf-8"))


def _write_catalog_csv(catalog: dict[str, Any], csv_path: Path) -> None:
    fieldnames = [
        "table_name",
        "competencia",
        "ano",
        "mes",
        "scope",
        "granularity",
        "csv_path",
        "parquet_path",
        "has_csv",
        "has_parquet",
        "row_count",
        "column_count",
        "columns",
        "dtypes",
        "last_modified_csv",
        "last_modified_parquet",
        "is_current_pipeline_table",
        "is_suspected_legacy",
        "notes",
    ]

    with csv_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for table in catalog.get("tables", []):
            writer.writerow(
                {
                    "table_name": table["table_name"],
                    "competencia": table["competencia"],
                    "ano": table["ano"],
                    "mes": table["mes"],
                    "scope": table["scope"],
                    "granularity": table["granularity"],
                    "csv_path": table.get("csv_path"),
                    "parquet_path": table.get("parquet_path"),
                    "has_csv": table.get("has_csv"),
                    "has_parquet": table.get("has_parquet"),
                    "row_count": table.get("row_count"),
                    "column_count": table.get("column_count"),
                    "columns": ",".join(table.get("columns", [])),
                    "dtypes": json.dumps(table.get("dtypes", {}), ensure_ascii=False),
                    "last_modified_csv": table.get("last_modified_csv"),
                    "last_modified_parquet": table.get("last_modified_parquet"),
                    "is_current_pipeline_table": table.get("is_current_pipeline_table"),
                    "is_suspected_legacy": table.get("is_suspected_legacy"),
                    "notes": table.get("notes"),
                }
            )


def render_gold_catalog_markdown(catalog: dict[str, Any]) -> str:
    lines: list[str] = [
        "# Catálogo da camada Gold",
        "",
        f"_Gerado em: {catalog.get('generated_at', '—')}_",
        "",
        "## O que é a camada Gold",
        "",
        "A camada Gold é a camada analítica do projeto CAGED, produzida pelo pipeline "
        "`pipelines/gold/aggregate_indicators.py` a partir da Silver. Seus artefatos são "
        "consumidos pela API FastAPI e pelo dashboard React.",
        "",
        "## Competência",
        "",
        "Os dados são particionados por competência no padrão Hive:",
        "",
        "```",
        "data-lake/gold/caged/ano=YYYY/mes=MM/",
        "```",
        "",
        "Cada competência válida contém tabelas analíticas em CSV e Parquet, além de um "
        "Excel consolidado opcional.",
        "",
        "## Escopos territoriais",
        "",
        "| Escopo no catálogo | Significado | Sufixo de arquivo |",
        "|---|---|---|",
        "| `brasil` | Brasil (sem recorte estadual/metropolitano) | sem sufixo |",
        "| `parana` | Paraná | `_pr` |",
        "| `rmc` | Região Metropolitana de Curitiba | `_rmc` |",
        "",
        "## Sufixos de tabelas",
        "",
        "- Sem sufixo: escopo Brasil.",
        "- `_pr`: recorte Paraná.",
        "- `_rmc`: recorte RMC.",
        "",
        "## Formatos",
        "",
        "- **CSV**: formato primário lido pela API.",
        "- **Parquet**: formato colunar espelhado, gerado pelo pipeline.",
        "- **Excel consolidado**: `tabelas_caged_YYYY_MM.xlsx` (não é tabela analítica unitária).",
        "",
        "## Granularidades",
        "",
        "| Granularidade | Descrição |",
        "|---|---|",
        "| `resumo` | Indicadores agregados da competência |",
        "| `uf` | Agregação por UF |",
        "| `municipio` | Agregação por município |",
        "| `setor` | Agregação por seção/setor |",
        "| `ocupacao` | Agregação por ocupação (CBO) |",
        "| `salario` | Indicadores de salário por recorte |",
        "| `perfil` | Perfil demográfico genérico |",
        "| `perfil_sexo` | Perfil por sexo |",
        "| `perfil_faixa_etaria` | Perfil por faixa etária |",
        "| `perfil_instrucao` | Perfil por grau de instrução |",
        "| `desconhecida` | Não classificada automaticamente |",
        "",
        "## Resumo por competência",
        "",
        "| Competência | CSV | Parquet | Excel | Suspeitos | Observações |",
        "|---|---:|---:|---:|---|---|",
    ]

    for partition in catalog.get("partitions", []):
        notes: list[str] = []
        if partition.get("csv_without_parquet"):
            notes.append(
                "CSV sem Parquet: " + ", ".join(partition["csv_without_parquet"])
            )
        if partition.get("parquet_without_csv"):
            notes.append(
                "Parquet sem CSV: " + ", ".join(partition["parquet_without_csv"])
            )
        if partition.get("missing_pipeline_tables"):
            notes.append(
                "Tabelas do pipeline ausentes nesta competência: "
                + ", ".join(partition["missing_pipeline_tables"])
            )
        if not notes:
            notes.append("CSV/Parquet alinhados com pipeline atual (47 tabelas).")
        lines.append(
            "| {competencia} | {csv_count} | {parquet_count} | {excel_count} | {suspected} | {obs} |".format(
                competencia=partition["competencia"],
                csv_count=partition["csv_count"],
                parquet_count=partition["parquet_count"],
                excel_count=partition["excel_count"],
                suspected=", ".join(partition.get("suspected_files", [])) or "—",
                obs="; ".join(notes),
            )
        )

    lines.extend(
        [
            "",
            "## Tabelas encontradas",
            "",
            "| table_name | competências | scope | granularity | row_count | column_count | has_csv | has_parquet | suspected_legacy |",
            "|---|---|---|---|---:|---:|---|---|---|",
        ]
    )

    grouped: dict[str, dict[str, Any]] = {}
    for table in catalog.get("tables", []):
        key = table["table_name"]
        if key not in grouped:
            grouped[key] = {
                "competencias": [],
                "scope": table["scope"],
                "granularity": table["granularity"],
                "row_count": table["row_count"],
                "column_count": table["column_count"],
                "has_csv": table["has_csv"],
                "has_parquet": table["has_parquet"],
                "is_suspected_legacy": table["is_suspected_legacy"],
            }
        grouped[key]["competencias"].append(table["competencia"])

    for table_name in sorted(grouped):
        item = grouped[table_name]
        lines.append(
            "| {table_name} | {competencias} | {scope} | {granularity} | {row_count} | {column_count} | {has_csv} | {has_parquet} | {legacy} |".format(
                table_name=table_name,
                competencias=", ".join(sorted(set(item["competencias"]))),
                scope=item["scope"],
                granularity=item["granularity"],
                row_count=item["row_count"],
                column_count=item["column_count"],
                has_csv="sim" if item["has_csv"] else "não",
                has_parquet="sim" if item["has_parquet"] else "não",
                legacy="sim" if item["is_suspected_legacy"] else "não",
            )
        )

    suspected = catalog.get("summary", {}).get("suspected_files", [])
    lines.extend(["", "## Artefatos suspeitos", ""])
    if suspected:
        for name in suspected:
            lines.append(f"- `{name}`")
    else:
        lines.append("Nenhum artefato suspeito identificado nas competências atuais.")

    lines.extend(
        [
            "",
            "## Observações",
            "",
            "- Regenerar o catálogo após cada processamento mensal com "
            "`python -m pipelines.jobs.build_gold_catalog`.",
            "- O catálogo não altera arquivos Gold; apenas documenta metadados.",
            "- Tabelas legadas `tabela_perfil`, `tabela_perfil_pr` e `tabela_perfil_rmc` "
            "devem ser marcadas como suspeitas caso reapareçam.",
            "- Integração futura recomendada: executar o job de catálogo ao final do pipeline mensal.",
            "",
        ]
    )

    return "\n".join(lines)


def validate_catalog_for_competencia(
    catalog: dict[str, Any],
    *,
    ano: int,
    mes: int,
) -> dict[str, Any]:
    """
    Validação leve do catálogo para a competência processada.
    Retorna critical (falha) e warnings (apenas log).
    """
    competencia = f"{ano}-{mes:02d}"
    critical: list[str] = []
    warnings: list[str] = []

    partition = next(
        (p for p in catalog.get("partitions", []) if p["competencia"] == competencia),
        None,
    )
    if partition is None:
        critical.append(f"Competência {competencia} não encontrada no catálogo.")

    tables = [
        t for t in catalog.get("tables", []) if t["ano"] == ano and t["mes"] == mes
    ]
    if not any(t["table_name"] == "tabela_resumo" for t in tables):
        critical.append(f"tabela_resumo ausente no catálogo para {competencia}.")

    legacy_count = int(catalog.get("summary", {}).get("suspected_legacy_count", 0))
    if legacy_count > 0:
        suspected = catalog.get("summary", {}).get("suspected_files", [])
        warnings.append(
            f"suspected_legacy_count={legacy_count}; arquivos suspeitos: {suspected}"
        )

    for part in catalog.get("partitions", []):
        comp = part.get("competencia", "?")
        if part.get("csv_without_parquet"):
            warnings.append(
                f"CSV sem Parquet em {comp}: {part['csv_without_parquet']}"
            )
        if part.get("parquet_without_csv"):
            warnings.append(
                f"Parquet sem CSV em {comp}: {part['parquet_without_csv']}"
            )

    return {
        "competencia": competencia,
        "critical": critical,
        "warnings": warnings,
        "ok": len(critical) == 0,
    }


def apply_catalog_validation(
    validation: dict[str, Any],
    *,
    logger: Any | None = None,
) -> None:
    """Registra warnings e falha apenas em problemas críticos."""
    for message in validation.get("warnings", []):
        if logger is not None:
            logger.warning("[CATALOG] %s", message)
        else:
            print(f"[CATALOG][WARN] {message}")

    for message in validation.get("critical", []):
        if logger is not None:
            logger.error("[CATALOG] %s", message)
        else:
            print(f"[CATALOG][CRITICAL] {message}")

    if not validation.get("ok", False):
        critical = validation.get("critical", [])
        raise RuntimeError(
            "Validação crítica do catálogo Gold falhou: " + "; ".join(critical)
        )


def print_catalog_summary(result: dict[str, Any]) -> None:
    catalog = result["catalog"]
    summary = catalog.get("summary", {})
    print("Catálogo Gold gerado com sucesso.")
    print(f"  competências: {summary.get('competencia_count', 0)}")
    print(f"  tabelas catalogadas: {summary.get('table_count', 0)}")
    print(f"  arquivos suspeitos: {summary.get('suspected_legacy_count', 0)}")
    print(f"  JSON: {_relative_path(result['json_path'])}")
    print(f"  CSV: {_relative_path(result['csv_path'])}")
    print(f"  Markdown: {_relative_path(result['markdown_path'])}")
