"""Testes da dimensão geográfica e das Golds de feature focus."""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.main import app
from pipelines.gold.aggregate_feature_indicators import (
    build_feature_bundle,
    materialize_feature_gold,
)
from pipelines.gold.aggregate_indicators import (
    agregar_resumo_salario_institucional,
    apply_unique_mapping,
    normalizar_texto_upper_sem_acento,
    prepare_territorial_frame,
)
from pipelines.gold.feature_contract import FEATURE_PARQUET_ONLY_TABLES, FEATURE_REPORT_FILE
from pipelines.gold.gold_contract import MIN_REQUIRED_GOLD_TABLES
from pipelines.gold.geo_dimension import (
    MATCH_AMBIGUOUS,
    MATCH_UNMATCHED,
    GeographicDimension,
    load_geographic_dimension,
)
from app.services.feature_gold_service import saldo_participation

client = TestClient(app)
ROOT = Path(__file__).resolve().parents[1]
GOLD_MONTH = ROOT / "data-lake" / "gold" / "caged" / "ano=2026" / "mes=02"
SILVER_MONTH = ROOT / "data-lake" / "silver" / "caged" / "ano=2026" / "mes=02" / "caged_tratado.parquet"


def _frame() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "uf": ["São Paulo", "São Paulo", "Paraná", "Paraná", "Paraná", "Paraná"],
            "municipio": ["Curitiba", "Campinas", "Curitiba", "Curitiba", "Confuso", "Londrina"],
            "secao": ["Indústria", "Comércio", "Indústria", "Serviços", "Indústria", "Comércio"],
            "cbo2002ocupacao": ["Analista", "Analista", "Analista", "Vendedor", "Analista", "Analista"],
            "sexo": ["Homem", "Mulher", "Homem", "Mulher", "Homem", "Mulher"],
            "faixa_etaria": ["18 a 24", "25 a 29", "18 a 24", "30 a 39", "18 a 24", "40 a 49"],
            "graudeinstrucao": ["Médio", "Superior", "Médio", "Médio", "Fundamental", "Superior"],
            "admissao": [1, 1, 1, 0, 1, 1],
            "desligamento": [0, 0, 0, 1, 0, 0],
            "saldomovimentacao": [1, 1, 1, -1, 1, 1],
            "salario": [2000.0, 3000.0, 2500.0, 1800.0, 2200.0, 4000.0],
            "indtrabintermitente": ["Não", "Não", "Não", "Não", "Não", "Não"],
        }
    )


def _dimension() -> GeographicDimension:
    uf = pd.DataFrame(
        {
            "cod_uf": ["35", "41"],
            "uf_sigla": ["SP", "PR"],
            "uf": ["São Paulo", "Paraná"],
            "uf_norm": ["SAO PAULO", "PARANA"],
        }
    )
    municipality = pd.DataFrame(
        {
            "cod_municipio": ["4106902", "4113700"],
            "municipio": ["Curitiba", "Londrina"],
            "municipio_norm": ["CURITIBA", "LONDRINA"],
            "cod_uf": ["41", "41"],
            "uf_sigla": ["PR", "PR"],
            "uf": ["Paraná", "Paraná"],
            "uf_norm": ["PARANA", "PARANA"],
        }
    )
    return GeographicDimension(
        uf=uf,
        municipality=municipality,
        ambiguous_uf_norms=frozenset(),
        ambiguous_municipality_keys=frozenset({("PARANA", "CONFUSO")}),
        uf_source="teste",
        municipality_source="teste",
    )


def test_unique_mapping_matches_rowwise_normalizer():
    values = pd.Series(["  São   Paulo ", "Paraná", None, "Não Identificado", "CURITIBA"])
    expected = values.map(normalizar_texto_upper_sem_acento).astype("string")
    actual = apply_unique_mapping(values, normalizar_texto_upper_sem_acento)
    assert actual.fillna("<NA>").tolist() == expected.fillna("<NA>").tolist()


def test_canonical_dimension_has_unique_stable_ids():
    dimension = load_geographic_dimension()

    assert dimension.uf["uf_sigla"].nunique() == 27
    assert dimension.uf["cod_uf"].is_unique
    assert dimension.uf["uf_norm"].is_unique
    assert dimension.municipality["cod_municipio"].is_unique
    assert not dimension.municipality.duplicated(["uf_norm", "municipio_norm"]).any()
    assert dimension.ambiguous_municipality_keys == frozenset()

    curitiba = dimension.municipality.loc[
        dimension.municipality["cod_municipio"].astype("string").eq("4106902")
    ].iloc[0]
    assert curitiba["uf_sigla"] == "PR"
    assert curitiba["municipio_norm"] == "CURITIBA"
    assert str(curitiba["cod_uf"]) == "41"
    assert str(curitiba["cod_municipio"]).startswith(str(curitiba["cod_uf"]))
    sao_paulo = dimension.uf.loc[dimension.uf["uf_sigla"].eq("SP")].iloc[0]
    assert sao_paulo["uf_norm"] == "SAO PAULO"
    assert str(sao_paulo["cod_uf"]) == "35"


def test_feature_match_does_not_invent_codes_or_cross_uf_homonyms():
    bundle = build_feature_bundle(_frame(), 2026, dimension=_dimension())
    municipalities = bundle.tables["tabela_municipio_salario"]
    curitiba = municipalities.loc[
        (municipalities["municipio_norm"] == "CURITIBA")
        & (municipalities["movimento"] == "admissao")
    ]
    coded = curitiba.loc[curitiba["cod_municipio"].notna(), "cod_municipio"].astype("string").tolist()
    assert coded == ["4106902"]
    sao_paulo_curitiba = curitiba.loc[curitiba["uf_norm"] == "SAO PAULO"]
    assert sao_paulo_curitiba["cod_municipio"].isna().all()

    reasons = set(bundle.unmatched_municipalities["motivo"])
    assert MATCH_UNMATCHED in reasons
    assert MATCH_AMBIGUOUS in reasons
    ambiguous = bundle.unmatched_municipalities.loc[
        bundle.unmatched_municipalities["motivo"] == MATCH_AMBIGUOUS
    ]
    assert ambiguous["cod_municipio"].isna().all()
    assert set(ambiguous["municipio_norm"]) == {"CONFUSO"}


def test_feature_metrics_reuse_movement_and_salary_methodology():
    prepared = prepare_territorial_frame(_frame())
    bundle = build_feature_bundle(prepared, 2026, dimension=_dimension())
    sectors = bundle.tables["tabela_uf_setor"]
    assert (sectors["saldo"] == sectors["admissoes"] - sectors["desligamentos"]).all()

    sao_paulo = prepared.loc[prepared["uf_norm"] == "SAO PAULO"]
    expected = agregar_resumo_salario_institucional(sao_paulo, 2026).set_index("movimento")
    actual = (
        bundle.tables["tabela_uf_salario"]
        .loc[lambda frame: frame["uf_sigla"].eq("SP")]
        .set_index("movimento")
    )
    for movimento in ("admissao", "desligamento"):
        if int(expected.loc[movimento, "n_salarios_validos"]) == 0:
            assert movimento not in actual.index
            continue
        assert int(actual.loc[movimento, "n_salarios_validos"]) == int(
            expected.loc[movimento, "n_salarios_validos"]
        )
        assert actual.loc[movimento, "salario_medio"] == pytest.approx(
            expected.loc[movimento, "salario_medio"]
        )
        assert actual.loc[movimento, "salario_mediano"] == pytest.approx(
            expected.loc[movimento, "salario_mediano"]
        )

    municipal = bundle.tables["tabela_municipio_setor"]
    by_uf = municipal.groupby("uf_norm", dropna=False)[["admissoes", "desligamentos", "saldo"]].sum()
    uf_sectors = sectors.groupby("uf_norm", dropna=False)[["admissoes", "desligamentos", "saldo"]].sum()
    pd.testing.assert_frame_equal(by_uf.sort_index(), uf_sectors.sort_index(), check_dtype=False)


def test_materialize_keeps_existing_gold_files(tmp_path: Path):
    output_dir = tmp_path / "gold" / "ano=2026" / "mes=02"
    output_dir.mkdir(parents=True)
    (output_dir / "metadata.json").write_text(
        json.dumps({"validation_status": "ok"}),
        encoding="utf-8",
    )
    for name in MIN_REQUIRED_GOLD_TABLES:
        (output_dir / f"{name}.csv").write_text("col\n1\n", encoding="utf-8")
    existing = output_dir / "tabela_uf.csv"
    payload = "uf,admissoes,desligamentos,saldo\nSão Paulo,10,4,6\n"
    existing.write_text(payload, encoding="utf-8")
    before = existing.stat().st_mtime_ns
    legacy_flat = output_dir / "tabela_uf_setor.parquet"
    legacy_flat.write_bytes(b"legado")

    materialize_feature_gold(
        _frame(),
        2026,
        output_dir,
        mes=2,
        dimension=_dimension(),
        geo_dir=tmp_path / "geo",
    )

    feature_dir = output_dir / "feature"
    assert existing.read_text(encoding="utf-8") == payload
    assert existing.stat().st_mtime_ns == before
    assert legacy_flat.read_bytes() == b"legado"
    assert (feature_dir / "tabela_uf_setor.csv").is_file()
    assert (feature_dir / "tabela_uf_setor.parquet").is_file()
    assert (feature_dir / "tabela_municipio_ocupacao.parquet").is_file()
    assert not (feature_dir / "tabela_municipio_ocupacao.csv").exists()
    assert not (output_dir / "tabela_municipio_ocupacao.csv").exists()
    report = json.loads((feature_dir / FEATURE_REPORT_FILE).read_text(encoding="utf-8"))
    assert report["feature_generated_at"]
    assert not list(output_dir.parent.glob(".mes=02.feature-staging-*"))
    assert FEATURE_PARQUET_ONLY_TABLES == ("tabela_municipio_ocupacao",)


@pytest.mark.parametrize(
    ("part", "whole", "expected", "rule"),
    [
        (10, 0, None, "denominador_zero"),
        (10, -5, None, "sinais_opostos"),
        (-4, 8, None, "sinais_opostos"),
        (0, 8, 0.0, "participacao"),
        (2, 8, 0.25, "participacao"),
        (-2, -8, 0.25, "participacao"),
    ],
)
def test_saldo_participation_is_not_filled_when_uninterpretable(part, whole, expected, rule):
    value, interpretation = saldo_participation(part, whole)
    assert interpretation == rule
    if expected is None:
        assert value is None
    else:
        assert value == pytest.approx(expected)


def test_feature_id_validation_rejects_names_and_partial_codes():
    uf_response = client.get("/api/gold/v1/feature/uf/S?ano=2026&mes=2")
    assert uf_response.status_code == 400
    assert uf_response.json()["error"]["code"] == "INVALID_FEATURE_ID"

    municipality_response = client.get("/api/gold/v1/feature/municipality/Curitiba?ano=2026&mes=2")
    assert municipality_response.status_code == 400
    assert municipality_response.json()["error"]["code"] == "INVALID_FEATURE_ID"


@pytest.mark.skipif(not (GOLD_MONTH / "tabela_uf_salario.parquet").is_file(), reason="Gold de feature ainda não materializada")
def test_existing_uf_contract_and_sp_kpis_stay_unchanged():
    response = client.get("/api/gold/v1/table/tabela_uf?scope=br&ano=2026&mes=2&limit=30")
    assert response.status_code == 200
    body = response.json()
    assert body["columns"] == ["uf", "admissoes", "desligamentos", "saldo"]
    sao_paulo = next(row for row in body["rows"] if row["uf"] == "São Paulo")
    assert sao_paulo["admissoes"] == 770074
    assert sao_paulo["desligamentos"] == 674178
    assert sao_paulo["saldo"] == 95896

    overview = client.get("/api/gold/v1/overview?scope=br&ano=2026&mes=2")
    assert overview.status_code == 200
    assert overview.json()["scope"] == "br"


@pytest.mark.skipif(not (GOLD_MONTH / "tabela_uf_salario.parquet").is_file(), reason="Gold de feature ainda não materializada")
def test_feature_api_sao_paulo_and_curitiba():
    sao_paulo = client.get(
        "/api/gold/v1/feature/uf/sp?ano=2026&mes=2&movimento=admissao&limit=12"
    )
    assert sao_paulo.status_code == 200
    sp = sao_paulo.json()
    assert sp["identity"]["id"] == "SP"
    assert sp["identity"]["cod_uf"] == "35"
    assert sp["kpis"] == {"admissoes": 770074, "desligamentos": 674178, "saldo": 95896}
    assert sp["salary"]["movimento"] == "admissao"
    assert sp["salary"]["n_salarios_validos"] > 0
    assert sp["salary"]["salario_mediano"] is not None
    assert sp["sectors"]["total"] >= len(sp["sectors"]["by_saldo"])
    assert len(sp["sectors"]["by_saldo"]) <= 12
    assert len(sp["occupations"]["by_desligamentos"]) <= 12
    assert {row["sexo"] for row in sp["profiles"]["sexo"]}
    assert sp["profiles"]["faixa_etaria"]
    assert sp["profiles"]["graudeinstrucao"]
    february = next(row for row in sp["timeseries"] if row["ano"] == 2026 and row["mes"] == 2)
    assert february["admissoes"] == 770074
    brasil = sp["comparison"]["parents"][0]
    assert brasil["id"] == "BR"
    assert brasil["kpis"]["admissoes"] > sp["kpis"]["admissoes"]
    assert brasil["participation"]["admissoes"] == pytest.approx(
        sp["kpis"]["admissoes"] / brasil["kpis"]["admissoes"]
    )

    curitiba = client.get(
        "/api/gold/v1/feature/municipality/4106902?ano=2026&mes=2&movimento=admissao&limit=12"
    )
    assert curitiba.status_code == 200
    city = curitiba.json()
    assert city["identity"]["id"] == "4106902"
    assert city["identity"]["uf_sigla"] == "PR"
    assert city["kpis"] == {"admissoes": 54373, "desligamentos": 47189, "saldo": 7184}
    assert city["salary"]["n_salarios_validos"] > 0
    assert city["sectors"]["by_admissoes"]
    assert city["occupations"]["by_saldo"]
    assert city["profiles"]["sexo"]
    assert city["profiles"]["faixa_etaria"]
    assert city["profiles"]["graudeinstrucao"]
    city_february = next(row for row in city["timeseries"] if row["ano"] == 2026 and row["mes"] == 2)
    assert city_february["saldo"] == 7184
    parent_ids = [parent["id"] for parent in city["comparison"]["parents"]]
    assert parent_ids == ["PR", "BR"]
    parana = city["comparison"]["parents"][0]
    assert parana["participation"]["admissoes"] == pytest.approx(
        city["kpis"]["admissoes"] / parana["kpis"]["admissoes"]
    )


@pytest.mark.skipif(not (GOLD_MONTH / "tabela_municipio_setor.parquet").is_file(), reason="Gold de feature ainda não materializada")
def test_published_feature_invariants_for_2026_02():
    uf = pd.read_parquet(GOLD_MONTH / "tabela_uf.parquet")
    municipalities = pd.read_parquet(GOLD_MONTH / "tabela_municipio.parquet")
    resumo = pd.read_parquet(GOLD_MONTH / "tabela_resumo.parquet")
    uf_sectors = pd.read_parquet(GOLD_MONTH / "tabela_uf_setor.parquet")
    municipal_sectors = pd.read_parquet(GOLD_MONTH / "tabela_municipio_setor.parquet")
    uf_salary = pd.read_parquet(GOLD_MONTH / "tabela_uf_salario.parquet")

    prepared_uf = uf.copy()
    prepared_uf["uf_norm"] = apply_unique_mapping(prepared_uf["uf"], normalizar_texto_upper_sem_acento)
    prepared_mun = municipalities.copy()
    prepared_mun["uf_norm"] = apply_unique_mapping(prepared_mun["uf"], normalizar_texto_upper_sem_acento)

    for frame in (uf, municipalities, uf_sectors, municipal_sectors):
        assert (frame["saldo"] == frame["admissoes"] - frame["desligamentos"]).all()

    uf_from_municipalities = prepared_mun.groupby("uf_norm", dropna=False)[
        ["admissoes", "desligamentos", "saldo"]
    ].sum()
    uf_direct = prepared_uf.groupby("uf_norm", dropna=False)[
        ["admissoes", "desligamentos", "saldo"]
    ].sum()
    pd.testing.assert_frame_equal(
        uf_from_municipalities.sort_index(),
        uf_direct.sort_index(),
        check_dtype=False,
    )
    assert int(prepared_uf["admissoes"].sum()) == int(resumo["admissoes"].iloc[0])
    assert int(prepared_uf["desligamentos"].sum()) == int(resumo["desligamentos"].iloc[0])
    assert int(prepared_uf["saldo"].sum()) == int(resumo["saldo"].iloc[0])
    assert "NAO IDENTIFICADO" in set(prepared_uf["uf_norm"].astype(str))

    feature_uf = uf_sectors.groupby("uf_norm", dropna=False)[["admissoes", "desligamentos", "saldo"]].sum()
    feature_mun = municipal_sectors.groupby("uf_norm", dropna=False)[
        ["admissoes", "desligamentos", "saldo"]
    ].sum()
    pd.testing.assert_frame_equal(feature_uf.sort_index(), uf_direct.sort_index(), check_dtype=False)
    pd.testing.assert_frame_equal(feature_mun.sort_index(), uf_direct.sort_index(), check_dtype=False)

    assert uf_salary["uf_sigla"].dropna().is_unique or uf_salary.duplicated(["uf_sigla", "movimento"]).sum() == 0
    assert not uf_salary.duplicated(["uf_sigla", "movimento"]).any()
    municipal_salary = pd.read_parquet(GOLD_MONTH / "tabela_municipio_salario.parquet")
    coded = municipal_salary.loc[municipal_salary["cod_municipio"].notna()]
    assert not coded.duplicated(["cod_municipio", "movimento"]).any()
    assert coded["cod_municipio"].astype(str).str.slice(0, 2).eq(coded["cod_uf"].astype(str)).all()

    dimension = load_geographic_dimension()
    assert dimension.municipality["cod_municipio"].is_unique
    assert not dimension.municipality.duplicated(["cod_municipio"]).any()


@pytest.mark.skipif(not SILVER_MONTH.is_file() or not (GOLD_MONTH / "tabela_uf_salario.parquet").is_file(), reason="Silver ou Gold de feature indisponível")
def test_published_salary_uses_the_same_valid_universe():
    columns = ["uf", "municipio", "salario", "saldomovimentacao", "indtrabintermitente"]
    silver = prepare_territorial_frame(pd.read_parquet(SILVER_MONTH, columns=columns))
    sao_paulo = silver.loc[silver["uf_norm"] == "SAO PAULO"]
    expected = agregar_resumo_salario_institucional(sao_paulo, 2026).set_index("movimento")
    actual = (
        pd.read_parquet(GOLD_MONTH / "tabela_uf_salario.parquet", filters=[("uf_sigla", "==", "SP")])
        .set_index("movimento")
    )
    for movimento in expected.index:
        assert int(actual.loc[movimento, "n_salarios_validos"]) == int(
            expected.loc[movimento, "n_salarios_validos"]
        )
        assert actual.loc[movimento, "salario_medio"] == pytest.approx(
            float(expected.loc[movimento, "salario_medio"])
        )
        assert actual.loc[movimento, "salario_mediano"] == pytest.approx(
            float(expected.loc[movimento, "salario_mediano"])
        )

    curitiba = silver.loc[
        (silver["uf_norm"] == "PARANA") & (silver["municipio_norm"] == "CURITIBA")
    ]
    expected_city = agregar_resumo_salario_institucional(curitiba, 2026).set_index("movimento")
    actual_city = (
        pd.read_parquet(
            GOLD_MONTH / "tabela_municipio_salario.parquet",
            filters=[("cod_municipio", "==", "4106902")],
        ).set_index("movimento")
    )
    for movimento in expected_city.index:
        assert int(actual_city.loc[movimento, "n_salarios_validos"]) == int(
            expected_city.loc[movimento, "n_salarios_validos"]
        )
        assert actual_city.loc[movimento, "salario_mediano"] == pytest.approx(
            float(expected_city.loc[movimento, "salario_mediano"])
        )
