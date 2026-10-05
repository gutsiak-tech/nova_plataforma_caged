"""Seleção central da população salarial institucional elegível."""

from __future__ import annotations

from typing import Literal

import pandas as pd

from pipelines.common.salary_minimum import salary_limits

SalaryMovement = Literal["admissao", "desligamento"]

SALARY_MOVEMENTS: tuple[SalaryMovement, ...] = ("admissao", "desligamento")
_MOVEMENT_SIGN: dict[SalaryMovement, int] = {
    "admissao": 1,
    "desligamento": -1,
}
_REQUIRED_COLUMNS = frozenset(
    {"saldomovimentacao", "salario", "indtrabintermitente"}
)


def eligible_salary_population(
    df: pd.DataFrame,
    year: int,
    movement: SalaryMovement,
) -> pd.DataFrame:
    """Retorna vínculos elegíveis sem reconverter ou alterar `salario`."""
    if movement not in _MOVEMENT_SIGN:
        raise ValueError(
            "Movimento salarial inválido. Use 'admissao' ou 'desligamento'."
        )

    missing = sorted(_REQUIRED_COLUMNS - set(df.columns))
    if missing:
        raise ValueError(
            "Colunas obrigatórias ausentes para a população salarial: "
            + ", ".join(missing)
        )

    lower, upper = salary_limits(year)
    salaries = pd.to_numeric(df["salario"], errors="coerce")
    movement_values = pd.to_numeric(df["saldomovimentacao"], errors="coerce")
    is_intermittent = df["indtrabintermitente"].astype("string").str.strip().eq("Sim")

    eligible = (
        movement_values.eq(_MOVEMENT_SIGN[movement])
        & salaries.between(lower, upper, inclusive="both")
        & ~is_intermittent
    )
    return df.loc[eligible].copy()
