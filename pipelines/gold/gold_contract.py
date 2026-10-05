"""Contrato Silver → Gold: entradas, tabelas e artefatos esperados."""

from __future__ import annotations

SILVER_INPUT_FILE = "caged_tratado.parquet"
SILVER_METADATA_FILE = "metadata.json"
GOLD_METADATA_FILE = "metadata.json"

# Pelo menos uma coluna de competência deve existir na Silver.
COMPETENCIA_COLUMNS: tuple[str, ...] = ("competenciamov", "competencia_date")

# Colunas mínimas usadas por aggregate_indicators.py.
REQUIRED_SILVER_COLUMNS: tuple[str, ...] = (
    "saldomovimentacao",
    "admissao",
    "desligamento",
    "uf",
    "municipio",
    "secao",
    "cbo2002ocupacao",
    "sexo",
    "faixa_etaria",
    "graudeinstrucao",
    "salario",
    "valorsalariofixo",
)

# Tabelas Gold mínimas para operação institucional e API.
MIN_REQUIRED_GOLD_TABLES: tuple[str, ...] = (
    "tabela_resumo",
    "tabela_uf",
    "tabela_municipio",
    "tabela_setor",
    "tabela_ocupacao",
    "tabela_municipio_pr",
    "tabela_setor_pr",
    "tabela_ocupacao_pr",
    "tabela_municipio_rmc",
    "tabela_setor_rmc",
    "tabela_ocupacao_rmc",
)

# Campos mínimos em tabela_resumo.csv.
TABELA_RESUMO_COLUMNS: tuple[str, ...] = (
    "admissoes",
    "desligamentos",
    "saldo",
)

# Artefatos legados que não devem existir após refatoração analítica.
LEGACY_GOLD_TABLE_NAMES: frozenset[str] = frozenset(
    {
        "tabela_perfil",
        "tabela_perfil_pr",
        "tabela_perfil_rmc",
    }
)


def excel_filename(ano: int, mes: int) -> str:
    return f"tabelas_caged_{ano}_{mes:02d}.xlsx"
