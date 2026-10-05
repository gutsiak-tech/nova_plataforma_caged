CREATE INDEX IF NOT EXISTS idx_geo_municipios_geom
ON geo.municipios
USING GIST (geom);

CREATE INDEX IF NOT EXISTS idx_fact_emprego_municipio_mes_chave
ON serving.fact_emprego_municipio_mes (ano, mes, cod_municipio);