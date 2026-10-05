"""Testes estáticos do contrato Gold/API/Front-end (Etapa 2B).

Valida alinhamento entre goldTables.ts, goldColumns.ts, DATA_CONTRACT.md
e código de back-end, sem ler CSV/Parquet reais nem depender do data-lake.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from pipelines.gold.gold_contract import MIN_REQUIRED_GOLD_TABLES, TABELA_RESUMO_COLUMNS

PROJECT_ROOT = Path(__file__).resolve().parent.parent

GOLD_TABLES_TS = PROJECT_ROOT / "dashboard" / "src" / "api" / "goldTables.ts"
GOLD_COLUMNS_TS = PROJECT_ROOT / "dashboard" / "src" / "api" / "goldColumns.ts"
DATA_CONTRACT_MD = PROJECT_ROOT / "docs" / "DATA_CONTRACT.md"
GOLD_SERVICE_PY = PROJECT_ROOT / "app" / "services" / "gold_service.py"
ROUTES_GOLD_PY = PROJECT_ROOT / "app" / "api" / "routes_gold.py"
GOLD_CONTRACT_PY = PROJECT_ROOT / "pipelines" / "gold" / "gold_contract.py"

MOVEMENT_COLUMNS = frozenset({"admissoes", "desligamentos", "saldo"})

SALARY_COLUMNS = frozenset(
    {
        "n_salarios_validos",
        "salario_medio",
        "salario_mediano",
        "salario_p25",
        "salario_p75",
        "salario_min",
        "salario_max",
    }
)

FRONTEND_TABLE_CONTRACT: dict[str, frozenset[str]] = {
    "tabela_municipio": frozenset({"uf", "municipio", *MOVEMENT_COLUMNS}),
    "tabela_uf": frozenset({"uf", *MOVEMENT_COLUMNS}),
    "tabela_setor": frozenset({"secao", *MOVEMENT_COLUMNS}),
    "tabela_ocupacao": frozenset({"cbo2002ocupacao", *MOVEMENT_COLUMNS}),
    "tabela_perfil_sexo_faixa_etaria": frozenset(
        {"sexo", "faixa_etaria", *MOVEMENT_COLUMNS}
    ),
    "tabela_perfil_sexo_instrucao": frozenset(
        {"sexo", "graudeinstrucao", *MOVEMENT_COLUMNS}
    ),
    "tabela_perfil_faixa_etaria_instrucao": frozenset(
        {"faixa_etaria", "graudeinstrucao", *MOVEMENT_COLUMNS}
    ),
    "tabela_perfil_sexo_salario": frozenset(
        {"sexo", *MOVEMENT_COLUMNS, *SALARY_COLUMNS}
    ),
    "tabela_perfil_faixa_etaria_salario": frozenset(
        {"faixa_etaria", *MOVEMENT_COLUMNS, *SALARY_COLUMNS}
    ),
    "tabela_perfil_graudeinstrucao_salario": frozenset(
        {"graudeinstrucao", *MOVEMENT_COLUMNS, *SALARY_COLUMNS}
    ),
    "tabela_perfil_sexo_faixa_etaria_salario": frozenset(
        {"sexo", "faixa_etaria", *MOVEMENT_COLUMNS, *SALARY_COLUMNS}
    ),
    "tabela_perfil_sexo_instrucao_salario": frozenset(
        {"sexo", "graudeinstrucao", *MOVEMENT_COLUMNS, *SALARY_COLUMNS}
    ),
    "tabela_perfil_faixa_etaria_instrucao_salario": frozenset(
        {"faixa_etaria", "graudeinstrucao", *MOVEMENT_COLUMNS, *SALARY_COLUMNS}
    ),
}

OVERVIEW_ONLY_TABLE_CONTRACT: dict[str, frozenset[str]] = {
    "tabela_resumo": frozenset({"competencia", *MOVEMENT_COLUMNS}),
    "tabela_perfil_sexo": frozenset({"sexo", *MOVEMENT_COLUMNS}),
    "tabela_perfil_faixa_etaria": frozenset({"faixa_etaria", *MOVEMENT_COLUMNS}),
    "tabela_perfil_graudeinstrucao": frozenset({"graudeinstrucao", *MOVEMENT_COLUMNS}),
}

MIN_GOLD_TABLES = frozenset(
    {
        "tabela_municipio",
        "tabela_uf",
        "tabela_setor",
        "tabela_ocupacao",
        "tabela_perfil_sexo_faixa_etaria",
        "tabela_perfil_sexo_instrucao",
        "tabela_perfil_faixa_etaria_instrucao",
        "tabela_perfil_sexo_salario",
        "tabela_perfil_faixa_etaria_salario",
        "tabela_perfil_graudeinstrucao_salario",
        "tabela_perfil_sexo_faixa_etaria_salario",
        "tabela_perfil_sexo_instrucao_salario",
        "tabela_perfil_faixa_etaria_instrucao_salario",
    }
)

MIN_GOLD_COLUMNS = frozenset(
    {
        "saldo",
        "admissoes",
        "desligamentos",
        "competencia",
        "uf",
        "municipio",
        "secao",
        "cbo2002ocupacao",
        "sexo",
        "faixa_etaria",
        "graudeinstrucao",
        "salario_medio",
        "salario_mediano",
        "salario_p25",
        "salario_p75",
        "salario_min",
        "salario_max",
        "n_salarios_validos",
    }
)

DOC_SENSITIVE_TERMS = (
    "scope br",
    "scope pr",
    "scope rmc",
    "_pr",
    "_rmc",
    "tabela_resumo",
    "BR-only",
    "tabela_uf",
    "GoldRow",
    "/api/gold/v1/overview",
    "/api/gold/v1/table/{base_name}",
    "/api/gold/v1/catalog",
)

OVERVIEW_ROUTE_TABLES = frozenset(
    {
        "tabela_resumo",
        "tabela_uf",
        "tabela_municipio",
        "tabela_setor",
        "tabela_ocupacao",
        "tabela_perfil_sexo",
        "tabela_perfil_faixa_etaria",
        "tabela_perfil_graudeinstrucao",
        "tabela_perfil_sexo_faixa_etaria",
        "tabela_perfil_sexo_instrucao",
        "tabela_perfil_faixa_etaria_instrucao",
        "tabela_perfil_sexo_salario",
        "tabela_perfil_faixa_etaria_salario",
        "tabela_perfil_graudeinstrucao_salario",
        "tabela_perfil_sexo_faixa_etaria_salario",
        "tabela_perfil_sexo_instrucao_salario",
        "tabela_perfil_faixa_etaria_instrucao_salario",
    }
)


def _read(path: Path) -> str:
    assert path.is_file(), f"Arquivo de contrato ausente: {path}"
    return path.read_text(encoding="utf-8")


def _extract_ts_const_string_values(path: Path, const_name: str) -> set[str]:
    text = _read(path)
    match = re.search(
        rf"export const {const_name}\s*=\s*\{{([^}}]+)\}}\s*as const",
        text,
        re.DOTALL,
    )
    assert match, f"Constante {const_name} não encontrada em {path.name}"
    return set(re.findall(r":\s*'([^']+)'", match.group(1)))


@pytest.fixture(scope="module")
def gold_tables() -> set[str]:
    return _extract_ts_const_string_values(GOLD_TABLES_TS, "GOLD_TABLES")


@pytest.fixture(scope="module")
def gold_columns() -> set[str]:
    return _extract_ts_const_string_values(GOLD_COLUMNS_TS, "GOLD_COLUMNS")


@pytest.fixture(scope="module")
def data_contract_text() -> str:
    return _read(DATA_CONTRACT_MD)


@pytest.fixture(scope="module")
def gold_service_text() -> str:
    return _read(GOLD_SERVICE_PY)


@pytest.fixture(scope="module")
def routes_gold_text() -> str:
    return _read(ROUTES_GOLD_PY)


@pytest.fixture(scope="module")
def gold_contract_text() -> str:
    return _read(GOLD_CONTRACT_PY)


# --- 1. GOLD_TABLES ---


def test_gold_tables_contains_minimum_frontend_tables(gold_tables: set[str]) -> None:
    missing = MIN_GOLD_TABLES - gold_tables
    assert not missing, f"GOLD_TABLES incompleto; faltam: {sorted(missing)}"


# --- 2. GOLD_COLUMNS ---


def test_gold_columns_contains_minimum_frontend_columns(gold_columns: set[str]) -> None:
    missing = MIN_GOLD_COLUMNS - gold_columns
    assert not missing, f"GOLD_COLUMNS incompleto; faltam: {sorted(missing)}"


# --- 3. FRONTEND_TABLE_CONTRACT vs GOLD_TABLES / GOLD_COLUMNS ---


def test_frontend_table_contract_tables_in_gold_tables(
    gold_tables: set[str],
) -> None:
    missing = set(FRONTEND_TABLE_CONTRACT) - gold_tables
    assert not missing, (
        f"Tabelas em FRONTEND_TABLE_CONTRACT ausentes em GOLD_TABLES: {sorted(missing)}"
    )


def test_frontend_table_contract_columns_in_gold_columns(
    gold_columns: set[str],
) -> None:
    required: set[str] = set()
    for cols in FRONTEND_TABLE_CONTRACT.values():
        required |= set(cols)
    missing = required - gold_columns
    assert not missing, (
        f"Colunas exigidas por FRONTEND_TABLE_CONTRACT ausentes em GOLD_COLUMNS: "
        f"{sorted(missing)}"
    )


# --- 4. OVERVIEW_ONLY_TABLE_CONTRACT ---


def test_overview_only_tables_documented(data_contract_text: str) -> None:
    for table in OVERVIEW_ONLY_TABLE_CONTRACT:
        assert table in data_contract_text, (
            f"Tabela overview-only '{table}' não mencionada em DATA_CONTRACT.md"
        )


def test_overview_only_tables_used_in_routes_overview(routes_gold_text: str) -> None:
    for table in OVERVIEW_ONLY_TABLE_CONTRACT:
        assert table in routes_gold_text, (
            f"Tabela overview-only '{table}' não referenciada em routes_gold.py"
        )


def test_overview_only_columns_documented(data_contract_text: str) -> None:
    for table, cols in OVERVIEW_ONLY_TABLE_CONTRACT.items():
        for col in cols:
            assert col in data_contract_text, (
                f"Coluna '{col}' de '{table}' não mencionada em DATA_CONTRACT.md"
            )


# --- 5. MOVEMENT_COLUMNS ---


def test_movement_columns_in_all_frontend_tables() -> None:
    for table, cols in FRONTEND_TABLE_CONTRACT.items():
        missing = MOVEMENT_COLUMNS - cols
        assert not missing, (
            f"Tabela '{table}' sem colunas de movimentação: {sorted(missing)}"
        )


def test_movement_columns_in_overview_only_movement_tables() -> None:
    for table, cols in OVERVIEW_ONLY_TABLE_CONTRACT.items():
        missing = MOVEMENT_COLUMNS - cols
        assert not missing, (
            f"Tabela overview-only '{table}' sem colunas de movimentação: {sorted(missing)}"
        )


def test_movement_columns_in_gold_columns_ts(gold_columns: set[str]) -> None:
    missing = MOVEMENT_COLUMNS - gold_columns
    assert not missing, f"Colunas de movimentação ausentes em GOLD_COLUMNS: {sorted(missing)}"


def test_movement_columns_documented(data_contract_text: str) -> None:
    for col in MOVEMENT_COLUMNS:
        assert col in data_contract_text, (
            f"Coluna de movimentação '{col}' não mencionada em DATA_CONTRACT.md"
        )


# --- 6. SALARY_COLUMNS ---


def _salary_frontend_tables() -> list[str]:
    return [t for t in FRONTEND_TABLE_CONTRACT if t.endswith("_salario")]


def test_salary_columns_in_all_salary_frontend_tables() -> None:
    for table in _salary_frontend_tables():
        cols = FRONTEND_TABLE_CONTRACT[table]
        missing = SALARY_COLUMNS - cols
        assert not missing, (
            f"Tabela salarial '{table}' sem colunas salariais: {sorted(missing)}"
        )


def test_salary_columns_in_gold_columns(gold_columns: set[str]) -> None:
    missing = SALARY_COLUMNS - gold_columns
    assert not missing, f"Colunas salariais ausentes em GOLD_COLUMNS: {sorted(missing)}"


def test_salary_columns_documented(data_contract_text: str) -> None:
    for col in SALARY_COLUMNS:
        assert col in data_contract_text, (
            f"Coluna salarial '{col}' não mencionada em DATA_CONTRACT.md"
        )


# --- 7. Regras sensíveis documentadas ---


@pytest.mark.parametrize("term", DOC_SENSITIVE_TERMS)
def test_data_contract_documents_sensitive_term(
    data_contract_text: str, term: str
) -> None:
    if term.startswith("scope "):
        scope_id = term.split(" ", 1)[1]
        pattern = rf"scope\s+[`']?{re.escape(scope_id)}[`']?"
        assert re.search(pattern, data_contract_text, re.IGNORECASE), (
            f"DATA_CONTRACT.md não documenta '{term}'"
        )
    else:
        assert term in data_contract_text, (
            f"DATA_CONTRACT.md não menciona explicitamente: {term!r}"
        )


# --- 8. Regras de back-end ---


def test_gold_service_br_only_tables(gold_service_text: str) -> None:
    assert "BR_ONLY_TABLES" in gold_service_text
    assert "tabela_resumo" in gold_service_text
    assert '"tabela_resumo"' in gold_service_text or "'tabela_resumo'" in gold_service_text


def test_gold_service_scope_suffixes(gold_service_text: str) -> None:
    assert "_pr" in gold_service_text
    assert "_rmc" in gold_service_text


def test_routes_gold_has_overview_and_table(routes_gold_text: str) -> None:
    assert "def overview" in routes_gold_text
    assert "def table" in routes_gold_text


def test_routes_gold_references_overview_table_families(routes_gold_text: str) -> None:
    missing = OVERVIEW_ROUTE_TABLES - {
        t for t in OVERVIEW_ROUTE_TABLES if t in routes_gold_text
    }
    assert not missing, (
        f"Famílias de tabela do /overview ausentes em routes_gold.py: {sorted(missing)}"
    )


# --- 9. Compatibilidade com gold_contract.py ---


def test_gold_contract_minimum_symbols(gold_contract_text: str) -> None:
    for symbol in (
        "MIN_REQUIRED_GOLD_TABLES",
        "TABELA_RESUMO_COLUMNS",
        "tabela_resumo",
        "admissoes",
        "desligamentos",
        "saldo",
    ):
        assert symbol in gold_contract_text, (
            f"gold_contract.py não contém símbolo esperado: {symbol!r}"
        )


def test_gold_contract_tabela_resumo_columns_match_movement() -> None:
    assert set(TABELA_RESUMO_COLUMNS) == MOVEMENT_COLUMNS


def test_gold_contract_includes_resumo_in_min_tables() -> None:
    assert "tabela_resumo" in MIN_REQUIRED_GOLD_TABLES
