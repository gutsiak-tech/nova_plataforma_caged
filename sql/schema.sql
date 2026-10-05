CREATE EXTENSION IF NOT EXISTS postgis;

CREATE SCHEMA IF NOT EXISTS geo;
CREATE SCHEMA IF NOT EXISTS serving;
CREATE SCHEMA IF NOT EXISTS internal;

CREATE TABLE IF NOT EXISTS geo.municipios (
    cod_municipio VARCHAR(7) PRIMARY KEY,
    nome_municipio TEXT,
    uf CHAR(2),
    geom geometry(MultiPolygon, 4326)
);

CREATE TABLE IF NOT EXISTS serving.fact_emprego_municipio_mes (
    id BIGSERIAL PRIMARY KEY,
    cod_municipio VARCHAR(7),
    ano INTEGER NOT NULL,
    mes INTEGER NOT NULL,
    admissoes INTEGER,
    desligamentos INTEGER,
    saldo INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);