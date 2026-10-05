CREATE MATERIALIZED VIEW IF NOT EXISTS serving.mv_saldo_municipio AS
SELECT
    f.cod_municipio,
    g.nome_municipio,
    g.uf,
    f.ano,
    f.mes,
    f.saldo,
    g.geom
FROM serving.fact_emprego_municipio_mes f
LEFT JOIN geo.municipios g
    ON f.cod_municipio = g.cod_municipio;

CREATE INDEX IF NOT EXISTS idx_mv_saldo_municipio_geom
ON serving.mv_saldo_municipio
USING GIST (geom);