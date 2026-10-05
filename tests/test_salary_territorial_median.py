"""Testes da mediana salarial territorial na agregação Gold."""

from __future__ import annotations

import pandas as pd
import pytest

from pipelines.gold.aggregate_indicators import (
    MUNICIPIOS_RMC,
    agregar_movimentacao_salario,
    agregar_resumo_salario,
)


@pytest.fixture
def salary_silver_fixture() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "salario": [1000.0, 1500.0, 2000.0, 4000.0, 9000.0, 12000.0, 13000.0],
            "sexo": ["Mulher", "Mulher", "Homem", "Homem", "Homem", "Mulher", "Homem"],
            "uf_norm": ["PARANA"] * 5 + ["SAO PAULO"] * 2,
            "municipio_norm": [
                "CURITIBA",
                "PINHAIS",
                "LONDRINA",
                "CURITIBA",
                "MARINGA",
                "SAO PAULO",
                "CAMPINAS",
            ],
            "admissao": [10, 10, 1, 1, 1, 1, 1],
            "desligamento": [0, 0, 0, 0, 0, 0, 0],
            "saldomovimentacao": [10, 10, 1, 1, 1, 1, 1],
        }
    )


def _territorial_slices(df: pd.DataFrame) -> dict[str, pd.DataFrame]:
    parana = df[df["uf_norm"] == "PARANA"].copy()
    rmc = parana[parana["municipio_norm"].isin(MUNICIPIOS_RMC)].copy()
    return {"br": df, "pr": parana, "rmc": rmc}


@pytest.mark.parametrize(
    ("scope", "expected"),
    [
        ("br", 4000.0),
        ("pr", 2000.0),
        ("rmc", 1500.0),
    ],
)
def test_gold_median_matches_direct_silver_population(
    salary_silver_fixture,
    scope,
    expected,
):
    population = _territorial_slices(salary_silver_fixture)[scope]

    summary = agregar_resumo_salario(population)

    assert summary.loc[0, "salario_mediano"] == expected
    assert summary.loc[0, "salario_mediano"] == population["salario"].median()
    assert summary.loc[0, "n_salarios_validos"] == population["salario"].notna().sum()


def test_territorial_median_is_not_first_sex_group_median(salary_silver_fixture):
    parana = _territorial_slices(salary_silver_fixture)["pr"]

    territorial = agregar_resumo_salario(parana).loc[0, "salario_mediano"]
    by_sex = agregar_movimentacao_salario(parana, ["sexo"])

    assert by_sex.iloc[0]["sexo"] == "Mulher"
    assert by_sex.iloc[0]["salario_mediano"] == 1250.0
    assert territorial == 2000.0
    assert territorial != by_sex.iloc[0]["salario_mediano"]


def test_sex_group_order_does_not_change_territorial_median(salary_silver_fixture):
    parana = _territorial_slices(salary_silver_fixture)["pr"]
    reordered = parana.copy()
    reordered.loc[reordered["sexo"] == "Mulher", "saldomovimentacao"] = 0
    reordered.loc[reordered["sexo"] == "Homem", "saldomovimentacao"] = 20

    original_groups = agregar_movimentacao_salario(parana, ["sexo"])
    reordered_groups = agregar_movimentacao_salario(reordered, ["sexo"])

    assert original_groups.iloc[0]["sexo"] != reordered_groups.iloc[0]["sexo"]
    assert (
        agregar_resumo_salario(parana).loc[0, "salario_mediano"]
        == agregar_resumo_salario(reordered).loc[0, "salario_mediano"]
        == 2000.0
    )


@pytest.mark.parametrize(
    ("salaries", "expected"),
    [
        ([1000.0, 1500.0, 2000.0, 4000.0], 1750.0),
        ([1000.0, 1500.0, 2000.0, 4000.0, 9000.0], 2000.0),
    ],
)
def test_territorial_median_even_and_odd_populations(salaries, expected):
    summary = agregar_resumo_salario(pd.DataFrame({"salario": salaries}))

    assert summary.loc[0, "salario_mediano"] == expected
