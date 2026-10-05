"""Contrato Bronze → Silver: colunas esperadas após normalização e derivação."""

from __future__ import annotations

# Colunas mínimas da Bronze após normalizar_nome_coluna.
REQUIRED_INPUT_COLUMNS: tuple[str, ...] = (
    "competenciamov",
    "saldomovimentacao",
    "horascontratuais",
    "salario",
    "valorsalariofixo",
)

# Colunas recomendadas para análises e mapeamentos.
RECOMMENDED_INPUT_COLUMNS: tuple[str, ...] = (
    "regiao",
    "uf",
    "municipio",
    "secao",
    "subclasse",
    "cbo2002ocupacao",
    "graudeinstrucao",
    "idade",
    "racacor",
    "sexo",
    "tipomovimentacao",
)

# Colunas criadas pelo pipeline Silver.
DERIVED_COLUMNS: tuple[str, ...] = (
    "competencia_date",
    "admissao",
    "desligamento",
    "faixa_etaria",
)

# Não devem ficar 100% nulas após tratamento.
CRITICAL_NON_NULL_COLUMNS: tuple[str, ...] = (
    "horascontratuais",
    "salario",
    "valorsalariofixo",
    "idade",
    "saldomovimentacao",
)

# Colunas categóricas esperadas após mapeamentos (quando presentes na Bronze).
MAPPED_CATEGORICAL_COLUMNS: tuple[str, ...] = (
    "uf",
    "municipio",
    "secao",
    "cbo2002ocupacao",
    "sexo",
    "racacor",
    "graudeinstrucao",
)

# Colunas numéricas principais que devem ser numéricas após conversão.
NUMERIC_COLUMNS: tuple[str, ...] = (
    "horascontratuais",
    "salario",
    "valorsalariofixo",
    "idade",
    "saldomovimentacao",
)

SILVER_OUTPUT_FILE = "caged_tratado.parquet"
