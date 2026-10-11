"""Série municipal: a mesma linha de antes, lida sem varrer o Brasil."""

from __future__ import annotations

from pathlib import Path

import pandas as pd
import pytest

from app.services.feature_gold_service import (
    FEATURE_GEO_DIR,
    FeatureDataError,
    FeatureNotFoundError,
    _kpis,
    _municipality_movement_row,
    _timeseries_municipality,
    get_municipality_feature,
)
from app.services.gold_service import GoldMonthRef, list_valid_competencias

ROOT = Path(__file__).resolve().parents[1]
GOLD_READY = ROOT / "data-lake" / "gold" / "caged" / "ano=2026" / "mes=06" / "tabela_municipio.parquet"
CODES = ("4106902", "4104204", "4113700", "4106001", "4123600")


def _dimension_row(code: str) -> pd.Series:
    dimension = pd.read_parquet(FEATURE_GEO_DIR / "dim_municipio.parquet")
    hit = dimension.loc[dimension["cod_municipio"].astype("string").eq(code)]
    assert len(hit) == 1
    return hit.iloc[0]


def _published_series(row: pd.Series) -> list[dict]:
    return _timeseries_municipality(
        str(row["uf"]),
        str(row["municipio"]),
        str(row["uf_norm"]),
        str(row["municipio_norm"]),
    )


def _national_series(row: pd.Series) -> list[dict]:
    points = []
    uf_norm = str(row["uf_norm"])
    municipio_norm = str(row["municipio_norm"])
    for info in list_valid_competencias():
        month = GoldMonthRef(ano=int(info["ano"]), mes=int(info["mes"]))
        movement = _municipality_movement_row(month, uf_norm, municipio_norm)
        if movement is None:
            continue
        points.append({"ano": month.ano, "mes": month.mes, **_kpis(movement)})
    return points


def _write_movement(directory: Path, rows: list[dict]) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(rows).to_parquet(directory / "tabela_municipio.parquet", index=False)


def _use_months(monkeypatch: pytest.MonkeyPatch, directories: dict[tuple[int, int], Path]) -> None:
    class FakeMonth:
        def __init__(self, ano: int, mes: int) -> None:
            self.ano = int(ano)
            self.mes = int(mes)

        @property
        def dir(self) -> Path:
            return directories[(self.ano, self.mes)]

    monkeypatch.setattr("app.services.feature_gold_service.GoldMonthRef", FakeMonth)
    monkeypatch.setattr(
        "app.services.feature_gold_service.list_valid_competencias",
        lambda: [{"ano": ano, "mes": mes} for ano, mes in directories],
    )


@pytest.mark.skipif(not GOLD_READY.is_file(), reason="Gold municipal ainda não materializada")
def test_series_matches_national_movement_table():
    for code in CODES:
        row = _dimension_row(code)
        assert _published_series(row) == _national_series(row)


@pytest.mark.skipif(not GOLD_READY.is_file(), reason="Gold municipal ainda não materializada")
def test_missing_published_competence_is_omitted():
    row = _dimension_row("4123600")
    series = _published_series(row)
    assert (2026, 4) not in {(point["ano"], point["mes"]) for point in series}
    assert series == _national_series(row)
    assert all(point["admissoes"] is not None for point in series)


@pytest.mark.skipif(not GOLD_READY.is_file(), reason="Gold municipal ainda não materializada")
def test_series_keeps_published_temporal_order():
    row = _dimension_row("4106902")
    series = _published_series(row)
    keys = [(point["ano"], point["mes"]) for point in series]
    published = [(int(item["ano"]), int(item["mes"])) for item in list_valid_competencias()]
    assert keys == sorted(keys)
    assert keys == [item for item in published if item in set(keys)]
    assert all(type(point["saldo"]) is int for point in series)


@pytest.mark.skipif(not GOLD_READY.is_file(), reason="Gold municipal ainda não materializada")
def test_unknown_municipality_code_is_not_found():
    with pytest.raises(FeatureNotFoundError):
        get_municipality_feature("9999999", GoldMonthRef(ano=2026, mes=6))


@pytest.mark.skipif(not GOLD_READY.is_file(), reason="Gold municipal ainda não materializada")
def test_feature_payload_keeps_kpis_comparison_and_series():
    for code in ("4106902", "4104204", "4113700", "4106001"):
        row = _dimension_row(code)
        expected = _national_series(row)
        for mes in (1, 6):
            payload = get_municipality_feature(
                code,
                GoldMonthRef(ano=2026, mes=mes),
                movimento="admissao",
                limit=5,
            )
            assert payload["identity"]["id"] == code
            assert payload["timeseries"] == expected
            movement = _municipality_movement_row(
                GoldMonthRef(ano=2026, mes=mes),
                str(row["uf_norm"]),
                str(row["municipio_norm"]),
            )
            assert payload["kpis"] == _kpis(movement)
            assert [parent["id"] for parent in payload["comparison"]["parents"]] == ["PR", "BR"]
            assert payload["sectors"]["total"] > 0
            assert payload["occupations"]["total"] > 0
            assert payload["profiles"]["sexo"]
            assert payload["salary"]["movimento"] == "admissao"


def test_absent_month_is_skipped_without_a_zero(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    january = tmp_path / "01"
    february = tmp_path / "02"
    _write_movement(
        january,
        [{"uf": "Paraná", "municipio": "Curitiba", "admissoes": 8, "desligamentos": 3, "saldo": 5}],
    )
    _write_movement(
        february,
        [{"uf": "Paraná", "municipio": "Londrina", "admissoes": 2, "desligamentos": 2, "saldo": 0}],
    )
    _use_months(monkeypatch, {(2026, 1): january, (2026, 2): february})

    series = _timeseries_municipality("Paraná", "Curitiba", "PARANA", "CURITIBA")

    assert series == [{"ano": 2026, "mes": 1, "admissoes": 8, "desligamentos": 3, "saldo": 5}]


def test_changed_file_changes_the_series_without_mixing_municipalities(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
):
    directory = tmp_path / "06"
    rows = [
        {"uf": "Paraná", "municipio": "Curitiba", "admissoes": 10, "desligamentos": 4, "saldo": 6},
        {"uf": "Paraná", "municipio": "Londrina", "admissoes": 3, "desligamentos": 1, "saldo": 2},
    ]
    _write_movement(directory, rows)
    _use_months(monkeypatch, {(2026, 6): directory})

    curitiba = _timeseries_municipality("Paraná", "Curitiba", "PARANA", "CURITIBA")
    londrina = _timeseries_municipality("Paraná", "Londrina", "PARANA", "LONDRINA")
    assert curitiba[0]["saldo"] == 6
    assert londrina[0]["saldo"] == 2

    rows[0]["saldo"] = 9
    _write_movement(directory, rows)
    reread = _timeseries_municipality("Paraná", "Curitiba", "PARANA", "CURITIBA")
    untouched = _timeseries_municipality("Paraná", "Londrina", "PARANA", "LONDRINA")
    assert reread[0]["saldo"] == 9
    assert untouched[0]["admissoes"] == 3
    assert untouched[0]["saldo"] == 2


def test_duplicate_municipality_row_is_rejected(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    directory = tmp_path / "06"
    _write_movement(
        directory,
        [
            {"uf": "Paraná", "municipio": "Curitiba", "admissoes": 1, "desligamentos": 0, "saldo": 1},
            {"uf": "Paraná", "municipio": "Curitiba", "admissoes": 2, "desligamentos": 0, "saldo": 2},
        ],
    )
    _use_months(monkeypatch, {(2026, 6): directory})

    with pytest.raises(FeatureDataError):
        _timeseries_municipality("Paraná", "Curitiba", "PARANA", "CURITIBA")


def test_missing_parquet_keeps_the_national_reader(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    directory = tmp_path / "06"
    directory.mkdir()
    seen: list[tuple[str, str]] = []

    def fake_read(month, base_name, scope):
        del month
        seen.append((base_name, scope))
        return pd.DataFrame(
            {
                "uf": ["Paraná"],
                "municipio": ["Curitiba"],
                "admissoes": [4],
                "desligamentos": [1],
                "saldo": [3],
            }
        )

    monkeypatch.setattr("app.services.feature_gold_service.read_gold_table", fake_read)
    _use_months(monkeypatch, {(2026, 6): directory})

    series = _timeseries_municipality("Paraná", "Curitiba", "PARANA", "CURITIBA")

    assert seen == [("tabela_municipio", "br")]
    assert series == [{"ano": 2026, "mes": 6, "admissoes": 4, "desligamentos": 1, "saldo": 3}]
