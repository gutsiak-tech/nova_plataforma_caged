"""Contrato das Golds de feature focus.

As tabelas existentes (tabela_uf, tabela_municipio e recortes Brasil/PR/RMC)
permanecem intactas. Esta camada acrescenta salário, setor, ocupação e perfis
na granularidade de UF e de município, no mesmo modelo wide já usado pelo projeto.

`tabela_municipio_ocupacao` é somente Parquet. Na competência de referência
2026-02 a combinação observada tem centenas de milhares de linhas e esparsidade
alta. O CSV não é o caminho de leitura da API e duplicaria dezenas de megabytes
por competência sem ganho analítico. A Gold continua com todas as combinações
observadas; não há corte Top N nesta camada.

Os doze Parquets são a condição mínima para servir `/feature`. O relatório
`feature_gold_report.json` viaja no snapshot publicado e não é lido pela API.
Competências antigas ainda têm esses Parquets no root de `mes=NN`; esse layout
flat é legado e só entra quando a competência ainda não tem `feature/`.
"""

from __future__ import annotations

UF_IDENTITY_COLUMNS: tuple[str, ...] = (
    "cod_uf",
    "uf_sigla",
    "uf",
    "uf_norm",
)

MUNICIPALITY_IDENTITY_COLUMNS: tuple[str, ...] = (
    "cod_municipio",
    "municipio",
    "municipio_norm",
    "cod_uf",
    "uf_sigla",
    "uf",
    "uf_norm",
)

MOVEMENT_METRIC_COLUMNS: tuple[str, ...] = (
    "admissoes",
    "desligamentos",
    "saldo",
)

# Mesmos campos de tabela_resumo_salario. p25/p75/min/max não fazem parte
# desse contrato territorial e portanto não entram aqui.
SALARY_METRIC_COLUMNS: tuple[str, ...] = (
    "movimento",
    "n_salarios_validos",
    "salario_medio",
    "salario_mediano",
)

FEATURE_CSV_TABLES: tuple[str, ...] = (
    "tabela_uf_salario",
    "tabela_uf_setor",
    "tabela_uf_ocupacao",
    "tabela_uf_perfil_sexo",
    "tabela_uf_perfil_faixa_etaria",
    "tabela_uf_perfil_graudeinstrucao",
    "tabela_municipio_salario",
    "tabela_municipio_setor",
    "tabela_municipio_perfil_sexo",
    "tabela_municipio_perfil_faixa_etaria",
    "tabela_municipio_perfil_graudeinstrucao",
)

FEATURE_PARQUET_ONLY_TABLES: tuple[str, ...] = ("tabela_municipio_ocupacao",)

FEATURE_GOLD_TABLE_NAMES: tuple[str, ...] = (
    *FEATURE_CSV_TABLES,
    *FEATURE_PARQUET_ONLY_TABLES,
)

# Serving de /feature exige estes Parquets. O CSV é cópia analítica e não
# entra nessa condição. O relatório viaja no snapshot, mas a API não o lê.
FEATURE_SERVING_PARQUET_NAMES: tuple[str, ...] = FEATURE_GOLD_TABLE_NAMES

FEATURE_REPORT_FILE = "feature_gold_report.json"


def is_feature_gold_table(table_name: str) -> bool:
    """Tabela do contrato Feature. As tabelas territoriais ficam de fora."""
    return table_name in FEATURE_GOLD_TABLE_NAMES

# O /overview do território atual pede 12 linhas para setor e ocupação.
FEATURE_RANKING_DEFAULT_LIMIT = 12
FEATURE_RANKING_MAX_LIMIT = 100

UF_TABLE_SPECS: dict[str, str] = {
    "tabela_uf_setor": "secao",
    "tabela_uf_ocupacao": "cbo2002ocupacao",
    "tabela_uf_perfil_sexo": "sexo",
    "tabela_uf_perfil_faixa_etaria": "faixa_etaria",
    "tabela_uf_perfil_graudeinstrucao": "graudeinstrucao",
}

MUNICIPALITY_TABLE_SPECS: dict[str, str] = {
    "tabela_municipio_setor": "secao",
    "tabela_municipio_ocupacao": "cbo2002ocupacao",
    "tabela_municipio_perfil_sexo": "sexo",
    "tabela_municipio_perfil_faixa_etaria": "faixa_etaria",
    "tabela_municipio_perfil_graudeinstrucao": "graudeinstrucao",
}

STRING_COLUMNS: frozenset[str] = frozenset(
    {
        *UF_IDENTITY_COLUMNS,
        *MUNICIPALITY_IDENTITY_COLUMNS,
        "secao",
        "cbo2002ocupacao",
        "sexo",
        "faixa_etaria",
        "graudeinstrucao",
        "movimento",
    }
)

INTEGER_COLUMNS: frozenset[str] = frozenset(
    {"admissoes", "desligamentos", "saldo", "n_salarios_validos"}
)

FLOAT_COLUMNS: frozenset[str] = frozenset({"salario_medio", "salario_mediano"})
