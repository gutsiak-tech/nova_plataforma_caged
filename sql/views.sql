CREATE OR REPLACE VIEW serving.vw_emprego_municipio_mes AS
SELECT
    f.cod_municipio,
    g.nome_municipio,
    g.uf,
    f.ano,
    f.mes,
    f.admissoes,
    f.desligamentos,
    f.saldo
FROM serving.fact_emprego_municipio_mes f
LEFT JOIN geo.municipios g
    ON f.cod_municipio = g.cod_municipio;