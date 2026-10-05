"""Testes mínimos para funções puras do pipeline Silver (sem microdados completos)."""

import pandas as pd
import pytest

from pipelines.silver.clean_caged import (
    classificar_faixa_etaria,
    limpar_numero_brasileiro,
    normalizar_nome_coluna,
)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("CompetênciaMov", "competenciamov"),
        ("  Salário  ", "salario"),
        ("Grau de Instrução", "grau_de_instrucao"),
    ],
)
def test_normalizar_nome_coluna(raw: str, expected: str) -> None:
    assert normalizar_nome_coluna(raw) == expected


def test_limpar_numero_brasileiro() -> None:
    serie = pd.Series(["1.234,56", "44,00", "R$ 100,50", "", "-", "NA"])
    limpa = limpar_numero_brasileiro(serie)
    valores = pd.to_numeric(limpa, errors="coerce")

    assert valores.iloc[0] == pytest.approx(1234.56)
    assert valores.iloc[1] == pytest.approx(44.0)
    assert valores.iloc[2] == pytest.approx(100.5)
    assert pd.isna(valores.iloc[3])
    assert pd.isna(valores.iloc[4])
    assert pd.isna(valores.iloc[5])


@pytest.mark.parametrize(
    ("idade", "faixa"),
    [
        (17, "Até 17 anos"),
        (18, "18 a 24 anos"),
        (24, "18 a 24 anos"),
        (25, "25 a 29 anos"),
        (39, "30 a 39 anos"),
        (49, "40 a 49 anos"),
        (64, "50 a 64 anos"),
        (65, "65 anos ou mais"),
        (float("nan"), "Ignorado"),
    ],
)
def test_classificar_faixa_etaria(idade: float, faixa: str) -> None:
    assert classificar_faixa_etaria(idade) == faixa


def test_flags_admissao_desligamento_from_saldomovimentacao() -> None:
    """Espelha a regra aplicada em run_clean_caged (sem carregar microdados)."""
    saldo = pd.Series([1, -1, 0, 1, -1, pd.NA])
    admissao = (saldo == 1).astype(int)
    desligamento = (saldo == -1).astype(int)

    assert admissao.tolist() == [1, 0, 0, 1, 0, 0]
    assert desligamento.tolist() == [0, 1, 0, 0, 1, 0]
