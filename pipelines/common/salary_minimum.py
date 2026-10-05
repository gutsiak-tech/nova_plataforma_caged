"""Parâmetros oficiais de salário mínimo usados pela metodologia salarial."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class MinimumWageParameter:
    year: int
    value: float
    normative_reference: str


MINIMUM_WAGE_BY_YEAR: dict[int, MinimumWageParameter] = {
    2025: MinimumWageParameter(
        year=2025,
        value=1518.0,
        normative_reference="Decreto nº 12.342/2024",
    ),
    2026: MinimumWageParameter(
        year=2026,
        value=1621.0,
        normative_reference="Decreto nº 12.797/2025",
    ),
}


class MinimumWageNotConfiguredError(ValueError):
    """Ano sem parâmetro oficial configurado."""


def get_minimum_wage_parameter(year: int) -> MinimumWageParameter:
    try:
        return MINIMUM_WAGE_BY_YEAR[int(year)]
    except KeyError as exc:
        raise MinimumWageNotConfiguredError(
            f"Salário mínimo não configurado para o ano {year}."
        ) from exc


def salary_limits(year: int) -> tuple[float, float]:
    parameter = get_minimum_wage_parameter(year)
    return round(parameter.value * 0.3, 2), round(parameter.value * 150, 2)
