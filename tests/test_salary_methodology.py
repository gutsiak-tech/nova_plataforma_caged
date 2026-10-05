"""Testes da metodologia salarial institucional C + D."""

from __future__ import annotations

import pandas as pd
import pytest

from pipelines.common.salary_minimum import (
    MINIMUM_WAGE_BY_YEAR,
    MinimumWageNotConfiguredError,
    get_minimum_wage_parameter,
    salary_limits,
)
from pipelines.gold.aggregate_indicators import (
    agregar_perfil_salario_institucional,
    agregar_resumo_salario_institucional,
    run_aggregate_indicators,
)
from pipelines.gold.salary_eligibility import eligible_salary_population


def _salary_rows(**overrides) -> pd.DataFrame:
    base = {
        "salario": [2000.0],
        "saldomovimentacao": [1],
        "indtrabintermitente": ["Não"],
        "unidadesalariocodigo": ["Mês"],
        "sexo": ["Mulher"],
        "admissao": [1],
        "desligamento": [0],
    }
    base.update(overrides)
    return pd.DataFrame(base)


def test_minimum_wage_parameters_are_centralized():
    assert set(MINIMUM_WAGE_BY_YEAR) == {2025, 2026}
    assert get_minimum_wage_parameter(2025).value == 1518.0
    assert get_minimum_wage_parameter(2025).normative_reference == "Decreto nº 12.342/2024"
    assert get_minimum_wage_parameter(2026).value == 1621.0
    assert get_minimum_wage_parameter(2026).normative_reference == "Decreto nº 12.797/2025"
    assert salary_limits(2026) == (486.30, 243150.00)


def test_unknown_year_fails_explicitly():
    with pytest.raises(
        MinimumWageNotConfiguredError,
        match="Salário mínimo não configurado para o ano 2024",
    ):
        salary_limits(2024)


def test_gold_processing_fails_before_reading_an_unconfigured_year():
    with pytest.raises(
        MinimumWageNotConfiguredError,
        match="Salário mínimo não configurado para o ano 2024",
    ):
        run_aggregate_indicators(2024, 1)


def test_2025_uses_its_own_minimum_wage():
    row = _salary_rows(salario=[470.0])

    assert salary_limits(2025) == (455.40, 227700.00)
    assert len(eligible_salary_population(row, 2025, "admissao")) == 1
    assert eligible_salary_population(row, 2026, "admissao").empty


def test_inclusive_salary_limits_and_intermittent_contract():
    salaries = [486.29, 486.30, 486.31, 243150.00, 243150.01, 2000.0, 2000.0]
    df = _salary_rows(
        salario=salaries,
        saldomovimentacao=[1] * len(salaries),
        indtrabintermitente=["Não"] * 5 + ["Sim", "Não Identificado"],
        unidadesalariocodigo=["Mês"] * len(salaries),
        sexo=["Mulher"] * len(salaries),
        admissao=[1] * len(salaries),
        desligamento=[0] * len(salaries),
    )

    result = eligible_salary_population(df, 2026, "admissao")

    assert result["salario"].tolist() == [486.30, 486.31, 243150.00, 2000.0]
    assert "Sim" not in result["indtrabintermitente"].tolist()
    assert "Não Identificado" in result["indtrabintermitente"].tolist()


def test_admission_and_termination_are_separate():
    df = _salary_rows(
        salario=[1000.0, 3000.0],
        saldomovimentacao=[1, -1],
        indtrabintermitente=["Não", "Não"],
        unidadesalariocodigo=["Mês", "Mês"],
        sexo=["Mulher", "Homem"],
        admissao=[1, 0],
        desligamento=[0, 1],
    )

    admissions = eligible_salary_population(df, 2026, "admissao")
    terminations = eligible_salary_population(df, 2026, "desligamento")

    assert admissions["salario"].tolist() == [1000.0]
    assert terminations["salario"].tolist() == [3000.0]


def test_salary_units_are_not_reconverted_or_filtered_by_category():
    units = ["Mês", "Hora", "Dia", "Semana", "Quinzena", "Tarefa", "Variável", "Variável"]
    salaries = [1000.0, 1100.0, 1200.0, 1300.0, 1400.0, 1500.0, 0.0, 1600.0]
    df = _salary_rows(
        salario=salaries,
        saldomovimentacao=[1] * len(units),
        indtrabintermitente=["Não"] * len(units),
        unidadesalariocodigo=units,
        sexo=["Mulher"] * len(units),
        admissao=[1] * len(units),
        desligamento=[0] * len(units),
    )

    result = eligible_salary_population(df, 2026, "admissao")

    assert result["salario"].tolist() == salaries[:6] + [1600.0]
    assert set(result["unidadesalariocodigo"]) == set(units)
    assert result.loc[result["unidadesalariocodigo"] == "Hora", "salario"].iloc[0] == 1100.0
    assert 0.0 not in result["salario"].tolist()


def test_territorial_summaries_are_direct_and_independent():
    df = _salary_rows(
        salario=[1000.0, 1500.0, 2000.0, 4000.0, 9000.0, 1200.0, 3200.0],
        saldomovimentacao=[1, 1, 1, 1, 1, -1, -1],
        indtrabintermitente=["Não"] * 7,
        unidadesalariocodigo=["Mês"] * 7,
        sexo=["Mulher", "Mulher", "Homem", "Homem", "Homem", "Mulher", "Homem"],
        admissao=[1, 1, 1, 1, 1, 0, 0],
        desligamento=[0, 0, 0, 0, 0, 1, 1],
    )

    summary = agregar_resumo_salario_institucional(df, 2026).set_index("movimento")
    groups = agregar_perfil_salario_institucional(df, 2026, ["sexo"])

    assert summary.loc["admissao", "salario_mediano"] == 2000.0
    assert summary.loc["desligamento", "salario_mediano"] == 2200.0
    assert summary.loc["admissao", "salario_medio"] == df.iloc[:5]["salario"].mean()
    assert summary.loc["admissao", "n_salarios_validos"] == 5
    assert groups.iloc[0]["salario_mediano"] != summary.loc["admissao", "salario_mediano"]

    reordered = df.sample(frac=1, random_state=7)
    reordered_summary = agregar_resumo_salario_institucional(reordered, 2026).set_index(
        "movimento"
    )
    pd.testing.assert_series_equal(
        summary["salario_mediano"],
        reordered_summary["salario_mediano"],
    )
