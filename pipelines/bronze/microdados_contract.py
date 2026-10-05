"""Contrato de colunas esperadas do microdados.txt do Novo CAGED."""

from __future__ import annotations

import unicodedata


def normalize_column_name(col: str) -> str:
    """Mesma regra da Silver: strip, lowercase, sem acentos, espaços → underscore."""
    col = str(col).strip().lower()
    col = "".join(
        c for c in unicodedata.normalize("NFKD", col) if not unicodedata.combining(c)
    )
    return col.replace(" ", "_")


# Nomes canônicos (normalizados) — alinhados ao header observado no projeto.
REQUIRED_COLUMNS: tuple[str, ...] = (
    "competenciamov",
    "saldomovimentacao",
    "horascontratuais",
    "salario",
    "valorsalariofixo",
)

RECOMMENDED_COLUMNS: tuple[str, ...] = (
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

OPTIONAL_COLUMNS: tuple[str, ...] = (
    "categoria",
    "tipoempregador",
    "tipoestabelecimento",
    "tipodedeficiencia",
    "indtrabintermitente",
    "indtrabparcial",
    "tamestabjan",
    "indicadoraprendiz",
    "origemdainformacao",
    "competenciadec",
    "indicadordeforadoprazo",
    "unidadesalariocodigo",
)

KNOWN_COLUMNS: frozenset[str] = frozenset(
    REQUIRED_COLUMNS + RECOMMENDED_COLUMNS + OPTIONAL_COLUMNS
)

EXPECTED_SEPARATOR = ";"
EXPECTED_ENCODING = "utf-8"
